import { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Paperclip, Upload, Loader2, FileText, X, CheckCircle } from 'lucide-react';

interface CourseFile {
  name: string;
  storagePath: string;
  size: number;
  uploadedAt?: string;
  type?: string;
  parentZip?: string;
}

// File tagged with zip-origin metadata (set during extraction).
type TaggedFile = File & { __relPath?: string; __fromZip?: string };

// Minimal shape of a JSZip entry (avoids depending on jszip types).
interface ZipEntry {
  dir: boolean;
  name: string;
  async: (type: 'blob') => Promise<Blob>;
}

const SUPPORTED_EXTS = ['pdf', 'doc', 'docx', 'txt', 'md', 'json', 'js', 'ts', 'html', 'css', 'csv', 'xml', 'yaml', 'yml', 'jsx', 'tsx', 'py', 'sh', 'env'];

// ZIP intake guardrails
const ZIP_MAX_BYTES = 100 * 1024 * 1024;        // max uploaded .zip size
const ZIP_MAX_ENTRIES = 200;                     // max files extracted per zip
const ZIP_MAX_UNCOMPRESSED = 300 * 1024 * 1024;  // max total uncompressed bytes
const ZIP_MAX_PER_FILE = 25 * 1024 * 1024;       // max single extracted file

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(0)} MB`;
}

function isSupportedExt(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_EXTS.includes(ext);
}

// Block zip-slip / path traversal. Returns a clean relative path, or null if unsafe.
function sanitizeZipPath(rawName: string): string | null {
  if (!rawName) return null;
  const p = rawName.replace(/\\/g, '/');         // normalize windows separators
  if (/^[a-zA-Z]:/.test(p)) return null;          // drive-letter absolute
  if (p.startsWith('/')) return null;             // absolute
  if (p.includes('\0')) return null;              // null byte
  const segs = p.split('/').filter(s => s.length > 0 && s !== '.');
  if (segs.length === 0) return null;
  if (segs.some(s => s === '..')) return null;     // traversal
  return segs.join('/');
}

interface AddFilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseTitle: string;
  existingFiles?: CourseFile[];
  onFilesAdded: () => void;
}

export function AddFilesDialog({
  open,
  onOpenChange,
  courseId,
  courseTitle,
  existingFiles = [],
  onFilesAdded,
}: AddFilesDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [regeneratingPdf, setRegeneratingPdf] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [uploadedCount, setUploadedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [zipArchives, setZipArchives] = useState<File[]>([]);
  const [isExpanding, setIsExpanding] = useState(false);

  // Extract a .zip in-browser (JSZip). Keeps supported types, preserves folder
  // structure, enforces guardrails, blocks zip-slip. Returns extracted Files + skip count.
  const expandZip = useCallback(async (zipFile: File): Promise<{ files: File[]; skipped: number }> => {
    if (zipFile.size > ZIP_MAX_BYTES) {
      toast.error(`ZIP "${zipFile.name}" exceeds ${formatBytes(ZIP_MAX_BYTES)} limit.`);
      return { files: [], skipped: 0 };
    }
    const JSZip = (await import('jszip')).default;
    let zip;
    try {
      zip = await JSZip.loadAsync(zipFile);
    } catch {
      toast.error(`Could not read ZIP "${zipFile.name}".`);
      return { files: [], skipped: 0 };
    }
    const out: File[] = [];
    let totalBytes = 0, count = 0, skipped = 0;
    for (const entry of Object.values(zip.files) as ZipEntry[]) {
      if (entry.dir) continue;
      const clean = sanitizeZipPath(entry.name);
      if (!clean) { skipped++; continue; }                 // zip-slip / bad path
      if (!isSupportedExt(clean)) { skipped++; continue; }  // unsupported type
      if (count >= ZIP_MAX_ENTRIES) {
        toast.warning(`ZIP "${zipFile.name}": stopped at ${ZIP_MAX_ENTRIES} files (count cap).`);
        break;
      }
      const blob = await entry.async('blob');
      if (blob.size > ZIP_MAX_PER_FILE) { skipped++; continue; }
      if (totalBytes + blob.size > ZIP_MAX_UNCOMPRESSED) {
        toast.warning(`ZIP "${zipFile.name}": stopped at ${formatBytes(ZIP_MAX_UNCOMPRESSED)} uncompressed (size cap).`);
        break;
      }
      totalBytes += blob.size;
      count++;
      const baseName = clean.split('/').pop() || clean;
      const f = new File([blob], baseName, { type: blob.type }) as TaggedFile;
      f.__relPath = clean;
      f.__fromZip = zipFile.name;
      out.push(f);
    }
    return { files: out, skipped };
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (e.target) e.target.value = ''; // allow re-selecting same file later
    const direct: File[] = [];
    const zips: File[] = [];
    let skipped = 0;
    for (const f of selected) {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      if (ext === 'zip') zips.push(f);
      else if (SUPPORTED_EXTS.includes(ext)) direct.push(f);
      else skipped++;
    }

    const extracted: File[] = [];
    const archives: File[] = [];
    if (zips.length > 0) {
      setIsExpanding(true);
      try {
        for (const z of zips) {
          const r = await expandZip(z);
          extracted.push(...r.files);
          skipped += r.skipped;
          if (r.files.length > 0) archives.push(z);
        }
      } finally {
        setIsExpanding(false);
      }
    }

    if (skipped > 0) toast.warning(`${skipped} file(s) skipped (unsupported or unsafe path).`);
    if (extracted.length > 0) toast.success(`Extracted ${extracted.length} file(s) from ZIP.`);

    setFiles(prev => [...prev, ...direct, ...extracted]);
    if (archives.length > 0) setZipArchives(prev => [...prev, ...archives]);
  }, [expandZip]);

  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error('Please select at least one file');
      return;
    }

    // Verify course is completed before uploading
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('status')
      .eq('id', courseId)
      .single();

    if (courseError || course?.status !== 'completed') {
      toast.error('Cannot add files to a course that is not completed');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setCurrentFileIndex(0);
    setUploadedCount(0);

    try {
      const uploadedFiles: CourseFile[] = [];
      
      for (let i = 0; i < files.length; i++) {
        setCurrentFileIndex(i);
        const file = files[i] as TaggedFile;
        const relName = file.__relPath || file.name; // preserves folder structure for zip files
        const fromZip = file.__fromZip;
        const storagePath = `${courseId}/supplementary/${Date.now()}_${relName}`;

        // Upload to storage (folder structure preserved via slashes in relName)
        const { error: uploadError } = await supabase.storage
          .from('course-files')
          .upload(storagePath, file, {
            contentType: file.type || 'application/octet-stream',
            upsert: false
          });

        if (uploadError) {
          console.error(`Failed to upload ${relName}:`, uploadError);
          toast.error(`Failed to upload ${relName}`);
          continue;
        }

        uploadedFiles.push({
          name: relName,
          storagePath,
          size: file.size,
          uploadedAt: new Date().toISOString(),
          ...(fromZip ? { parentZip: fromZip, type: 'zip_extracted' } : {})
        });

        setUploadedCount(uploadedFiles.length);
        setUploadProgress(((i + 1) / files.length) * 50); // First 50% is uploading
      }

      // Archive original ZIP containers (stored for reference, NOT added to
      // course_files so Intel Pack never tries to text-parse a binary zip).
      for (const z of zipArchives) {
        try {
          const zipPath = `${courseId}/supplementary/_containers/${Date.now()}_${z.name}`;
          await supabase.storage.from('course-files').upload(zipPath, z, {
            contentType: 'application/zip', upsert: false
          });
        } catch (e) {
          console.warn(`Failed to archive ZIP ${z.name}:`, e);
        }
      }

      if (uploadedFiles.length === 0) {
        throw new Error('No files were uploaded successfully');
      }

      // Update course with new files
      const allFiles = [...existingFiles, ...uploadedFiles];
      
      const { error: updateError } = await supabase
        .from('courses')
        .update({ course_files: allFiles })
        .eq('id', courseId);

      if (updateError) {
        throw new Error(`Failed to update course: ${updateError.message}`);
      }

      // Set the revision flag FIRST before regeneration to ensure the "Updated" badge appears
      await supabase
        .from('courses')
        .update({ pdf_revision_pending: true })
        .eq('id', courseId);

      setUploadProgress(75);
      setRegeneratingPdf(true);

      // Trigger PDF regeneration for all completed modules with timeout protection
      const { data: modules } = await supabase
        .from('course_modules')
        .select('id, module_number, status')
        .eq('course_id', courseId)
        .eq('status', 'completed');

      if (modules && modules.length > 0) {
        for (const mod of modules) {
          try {
            // 30 second timeout for each PDF regeneration
            const regeneratePromise = supabase.functions.invoke('generate-module-pdf', {
              body: { courseId, moduleNumber: mod.module_number }
            });
            
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('PDF regeneration timeout')), 30000)
            );
            
            await Promise.race([regeneratePromise, timeoutPromise]);
          } catch (e) {
            console.warn(`Failed to regenerate PDF for module ${mod.module_number}:`, e);
            // Continue with other modules even if one fails
          }
        }
      }

      setUploadProgress(100);
      setUploadComplete(true);
      
      // Show success state for 1.5 seconds before closing
      setTimeout(() => {
        setFiles([]);
        setZipArchives([]);
        setUploadComplete(false);
        onFilesAdded();
        onOpenChange(false);
      }, 1500);
      
      toast.success(`Added ${uploadedFiles.length} file(s) successfully!`);

    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload files');
    } finally {
      setIsUploading(false);
      setRegeneratingPdf(false);
      setUploadProgress(0);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-[#0a0a0a] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Paperclip className="w-5 h-5 text-cyan-400" />
            Add Training Documents
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Add supplementary PDFs or documents to "{courseTitle}". These will be integrated into your OneDuo artifact.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Existing files */}
          {existingFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-white/40 uppercase tracking-wide">Already attached</p>
              <div className="space-y-1">
                {existingFiles.map((file, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-white/60 p-2 rounded bg-white/5">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span className="truncate flex-1">{file.name}</span>
                    <span className="text-xs text-white/40">{formatFileSize(file.size)}</span>
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Drop zone / file selector */}
          <div 
            className="border-2 border-dashed border-white/20 rounded-xl p-6 text-center hover:border-cyan-400/50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,.md,.json,.js,.ts,.html,.css,.csv,.xml,.yaml,.yml,.jsx,.tsx,.py,.sh,.env,.zip"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload className="w-8 h-8 text-white/40 mx-auto mb-2" />
            <p className="text-sm text-white/60">
              {isExpanding ? 'Extracting ZIP…' : 'Click to select files or drag and drop'}
            </p>
            <p className="text-xs text-white/40 mt-1">
              Documents, code & .zip bundles (PDF, DOCX, TXT, MD, CSV, JSON, ZIP, etc.)
            </p>
          </div>

          {/* Selected files */}
          {files.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-white/40 uppercase tracking-wide">Ready to upload</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-white p-2 rounded bg-cyan-500/10 border border-cyan-500/20">
                    <FileText className="w-4 h-4 text-cyan-400" />
                    <span className="truncate flex-1">{file.name}</span>
                    <span className="text-xs text-white/40">{formatFileSize(file.size)}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(i);
                      }}
                      className="p-1 hover:bg-white/10 rounded"
                    >
                      <X className="w-3 h-3 text-white/60" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload progress */}
          {isUploading && !uploadComplete && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60">
                  {regeneratingPdf 
                    ? 'Regenerating OneDuo PDF...' 
                    : `Uploading ${currentFileIndex + 1} of ${files.length}: ${files[currentFileIndex]?.name?.substring(0, 30)}${(files[currentFileIndex]?.name?.length || 0) > 30 ? '...' : ''}`
                  }
                </span>
                <span className="text-cyan-400">
                  {regeneratingPdf ? `${Math.round(uploadProgress)}%` : `${uploadedCount}/${files.length}`}
                </span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-400 to-cyan-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Upload complete success state */}
          {uploadComplete && (
            <div className="flex items-center justify-center gap-2 p-4 bg-emerald-500/20 rounded-lg border border-emerald-500/30">
              <CheckCircle className="w-6 h-6 text-emerald-400" />
              <span className="text-emerald-400 font-medium">
                {uploadedCount} files uploaded successfully!
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUploading}
            className="border-white/20 text-white/70"
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={files.length === 0 || isUploading || isExpanding}
            className="bg-cyan-500 hover:bg-cyan-600 text-black"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {regeneratingPdf ? 'Regenerating...' : 'Uploading...'}
              </>
            ) : (
              <>
                <Paperclip className="w-4 h-4 mr-2" />
                Add {files.length > 0 ? `${files.length} File${files.length > 1 ? 's' : ''}` : 'Files'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
