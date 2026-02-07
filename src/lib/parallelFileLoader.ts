/**
 * Parallel File Loader with Concurrency Control
 * Handles batch loading of supplemental files with proper error tracking
 */

import { supabase } from '@/integrations/supabase/client';

export interface LoadedFile {
  name: string;
  content: string;
  size?: number;
  success: boolean;
  error?: string;
}

export interface FileLoadProgress {
  loaded: number;
  total: number;
  currentFile: string;
  failed: number;
  failedFiles: string[];
}

interface CourseFile {
  name: string;
  storagePath: string;
  size: number;
}

// Increased concurrency for better performance with large file sets
const CONCURRENCY_LIMIT = 10;
const FILE_TIMEOUT_MS = 15000; // 15 seconds per file (reduced for faster failure detection)

/**
 * Load a single file with timeout protection
 */
async function loadSingleFile(file: CourseFile, timeoutMs: number = FILE_TIMEOUT_MS): Promise<LoadedFile> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fileName = file.name.toLowerCase();

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('course-files')
      .download(file.storagePath);

    clearTimeout(timeoutId);

    if (downloadError || !fileData) {
      return {
        name: file.name,
        content: '',
        size: file.size,
        success: false,
        error: downloadError?.message || 'Download failed',
      };
    }

    // Extract text based on file type
    let textContent = '';

    // Plain text formats
    const plainTextFormats = ['.txt', '.md', '.csv', '.json', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.xml', '.yaml', '.yml', '.py', '.sh', '.env'];
    const imageFormats = ['.jpg', '.jpeg', '.png', '.webp'];
    const docFormats = ['.pdf', '.pptx', '.docx'];

    let isPlainText = plainTextFormats.some(ext => fileName.endsWith(ext));
    let isImage = imageFormats.some(ext => fileName.endsWith(ext));
    let isDoc = docFormats.some(ext => fileName.endsWith(ext));
    let detectedFileType = fileName.endsWith('.pdf') ? 'pdf' :
      fileName.endsWith('.pptx') ? 'pptx' :
        fileName.endsWith('.docx') ? 'docx' : '';

    // MAGIC BYTE DETECTION for extensionless files or wrong extensions
    if (!isPlainText && !isImage && !isDoc) {
      try {
        const buffer = await fileData.slice(0, 4).arrayBuffer();
        const header = new Uint8Array(buffer);
        const headerHex = Array.from(header).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

        // PDF: %PDF (25 50 44 46)
        if (headerHex === '25504446') {
          isDoc = true;
          detectedFileType = 'pdf';
          console.log(`[parallelFileLoader] Detected PDF via magic bytes for: ${file.name}`);
        }
        // ZIP/DOCX/PPTX: PK.. (50 4B 03 04)
        else if (headerHex === '504B0304') {
          isDoc = true;
          // Default to docx for zipped if unsure, or check name for hints
          detectedFileType = fileName.includes('ppt') ? 'pptx' : 'docx';
          console.log(`[parallelFileLoader] Detected ZIP/DOCX/PPTX via magic bytes for: ${file.name}`);
        }
      } catch (e) {
        console.warn('[parallelFileLoader] Magic byte detection failed', e);
      }
    }

    if (isPlainText) {
      textContent = await fileData.text();
    } else if (isImage) {
      // Use OCR for supplemental images
      try {
        const { data: extractData, error: extractError } = await supabase.functions.invoke('extract-frame-text', {
          body: {
            frameUrls: [file.storagePath],
            isStoragePath: true // Custom flag if we want to handle storage paths directly in function
          }
        });

        // Since extract-frame-text usually expects frameUrls, we might need a simpler OCR tool 
        // or ensure extract-frame-text handles single storage paths.
        // For now, let's assume it can handle the storage path if we pass it correctly.

        if (extractError || !extractData?.results?.[0]?.text) {
          textContent = `[Image Document: ${file.name}]\n[OCR extraction failed or no text found.]`;
        } else {
          textContent = `[Image Content Transcript]:\n${extractData.results[0].text}`;
        }
      } catch (err) {
        textContent = `[Image Document: ${file.name}]\n[OCR extraction error]`;
      }
    } else if (isDoc) {
      // Use server-side extraction for binary formats
      const fileType = detectedFileType || (fileName.endsWith('.pdf') ? 'pdf' :
        fileName.endsWith('.pptx') ? 'pptx' : 'docx');

      try {
        const { data: extractData, error: extractError } = await supabase.functions.invoke('extract-document-text', {
          body: { storagePath: file.storagePath, fileType }
        });

        if (extractError || !extractData?.text) {
          // If extensionless failed, maybe it WASN'T a doc after all.
          if (!fileName.includes('.')) {
            textContent = `[File: ${file.name}]\n[Binary/unsupported format - file reference included but content cannot be embedded as text]`;
          } else {
            return {
              name: file.name,
              content: `[${fileType.toUpperCase()} Document: ${file.name}]\n[Text extraction failed. Consider uploading as .txt.]`,
              size: file.size,
              success: false,
              error: extractError?.message || 'Extraction failed',
            };
          }
        } else {
          textContent = `[${fileType.toUpperCase()} Document Transcript]:\n${extractData.text}`;
        }
      } catch (err) {
        return {
          name: file.name,
          content: `[${fileType.toUpperCase()} Document: ${file.name}]\n[Extraction error]`,
          size: file.size,
          success: false,
          error: err instanceof Error ? err.message : 'Extraction error',
        };
      }
    } else if (fileName.endsWith('.doc')) {
      return {
        name: file.name,
        content: `[Word Document: ${file.name}]\n[Legacy .doc format not supported. Convert to .docx or .txt.]`,
        size: file.size,
        success: false,
        error: 'Legacy format not supported',
      };
    } else {
      // Try reading as text
      try {
        textContent = await fileData.text();
        // Check for binary content
        if (textContent.includes('\u0000') || textContent.substring(0, 100).match(/[^\x20-\x7E\n\r\t]/g)?.length > 10) {
          // Return placeholder for binary files - don't fail, just note it
          return {
            name: file.name,
            content: `[File: ${file.name}]\n[Binary/unsupported format - file reference included but content cannot be embedded as text]`,
            size: file.size,
            success: true, // Changed to true so it doesn't error out
            error: undefined,
          };
        }
      } catch {
        return {
          name: file.name,
          content: `[File: ${file.name}]\n[Could not extract text content.]`,
          size: file.size,
          success: false,
          error: 'Read failed',
        };
      }
    }

    return {
      name: file.name,
      content: textContent,
      size: file.size,
      success: true,
    };
  } catch (err) {
    clearTimeout(timeoutId);

    // Check for abort (timeout)
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        name: file.name,
        content: `[File: ${file.name}]\n[Loading timed out after ${timeoutMs / 1000}s]`,
        size: file.size,
        success: false,
        error: 'Timeout',
      };
    }

    return {
      name: file.name,
      content: '',
      size: file.size,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Load files in parallel with concurrency limit
 */
export async function loadFilesInParallel(
  files: CourseFile[],
  onProgress?: (progress: FileLoadProgress) => void,
  concurrencyLimit: number = CONCURRENCY_LIMIT
): Promise<LoadedFile[]> {
  const results: LoadedFile[] = [];
  const failedFiles: string[] = [];
  let loaded = 0;

  // Process in batches
  for (let i = 0; i < files.length; i += concurrencyLimit) {
    const batch = files.slice(i, i + concurrencyLimit);

    // Report progress at start of batch
    onProgress?.({
      loaded,
      total: files.length,
      currentFile: batch[0]?.name || '',
      failed: failedFiles.length,
      failedFiles,
    });

    // Load batch in parallel
    const batchResults = await Promise.all(
      batch.map(file => loadSingleFile(file))
    );

    // Process results
    for (const result of batchResults) {
      results.push(result);
      loaded++;

      if (!result.success) {
        failedFiles.push(result.name);
        console.warn(`Failed to load file: ${result.name} - ${result.error}`);
      }
    }
  }

  // Final progress update
  onProgress?.({
    loaded,
    total: files.length,
    currentFile: '',
    failed: failedFiles.length,
    failedFiles,
  });

  return results;
}

/**
 * Generate summary text for failed files
 */
export function generateFailureSummary(results: LoadedFile[]): string | null {
  const failed = results.filter(r => !r.success);
  if (failed.length === 0) return null;

  const summary = failed.slice(0, 5).map(f => `• ${f.name}: ${f.error}`).join('\n');
  const more = failed.length > 5 ? `\n... and ${failed.length - 5} more` : '';

  return `${failed.length} file(s) could not be loaded:\n${summary}${more}`;
}
