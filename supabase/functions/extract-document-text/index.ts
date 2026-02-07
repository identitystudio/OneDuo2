import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { storagePath, fileType } = await req.json();

    if (!storagePath || !fileType) {
      return new Response(
        JSON.stringify({ error: 'Missing storagePath or fileType' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Extracting text from ${fileType} file: ${storagePath}`);

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('course-files')
      .download(storagePath);

    if (downloadError || !fileData) {
      console.error('Failed to download file:', downloadError);
      return new Response(
        JSON.stringify({ error: 'Failed to download file', details: downloadError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let extractedText = '';

    // Plain text formats - read directly
    const plainTextFormats = ['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'csv', 'xml', 'yaml', 'yml', 'py', 'sh', 'env'];
    
    if (plainTextFormats.includes(fileType)) {
      // These are all plain text - just read the content directly
      extractedText = await fileData.text();
    } else if (fileType === 'pptx') {
      // PPTX files are ZIP archives containing XML
      extractedText = await extractPptxText(fileData);
    } else if (fileType === 'pdf') {
      // PDF extraction - basic text layer extraction
      extractedText = await extractPdfText(fileData);
    } else if (fileType === 'docx') {
      // DOCX files are also ZIP archives containing XML
      extractedText = await extractDocxText(fileData);
    } else {
      return new Response(
        JSON.stringify({ error: `Unsupported file type: ${fileType}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully extracted ${extractedText.length} characters from ${fileType}`);

    return new Response(
      JSON.stringify({ text: extractedText, charCount: extractedText.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error extracting document text:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to extract text', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Extract text from PPTX file (PowerPoint)
 * PPTX files are ZIP archives with XML content in ppt/slides/slide*.xml
 */
async function extractPptxText(blob: Blob): Promise<string> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    const textParts: string[] = [];
    
    // Get all slide files
    const slideFiles = Object.keys(zip.files)
      .filter(name => name.match(/^ppt\/slides\/slide\d+\.xml$/))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
        const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
        return numA - numB;
      });
    
    console.log(`Found ${slideFiles.length} slides in PPTX`);
    
    for (const slidePath of slideFiles) {
      const slideContent = await zip.file(slidePath)?.async('string');
      if (slideContent) {
        const slideText = extractTextFromXml(slideContent);
        if (slideText.trim()) {
          const slideNum = slidePath.match(/slide(\d+)/)?.[1] || '?';
          textParts.push(`--- Slide ${slideNum} ---\n${slideText}`);
        }
      }
    }
    
    // Also try to get notes
    const notesFiles = Object.keys(zip.files)
      .filter(name => name.match(/^ppt\/notesSlides\/notesSlide\d+\.xml$/))
      .sort();
    
    if (notesFiles.length > 0) {
      textParts.push('\n--- Speaker Notes ---');
      for (const notesPath of notesFiles) {
        const notesContent = await zip.file(notesPath)?.async('string');
        if (notesContent) {
          const notesText = extractTextFromXml(notesContent);
          if (notesText.trim()) {
            textParts.push(notesText);
          }
        }
      }
    }
    
    return textParts.join('\n\n');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error extracting PPTX text:', error);
    return `[PPTX extraction failed: ${errorMessage}]`;
  }
}

/**
 * Extract text from DOCX file (Word Document)
 * DOCX files are ZIP archives with XML content in word/document.xml
 */
async function extractDocxText(blob: Blob): Promise<string> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    const documentXml = await zip.file('word/document.xml')?.async('string');
    if (!documentXml) {
      return '[Could not find document.xml in DOCX file]';
    }
    
    return extractTextFromXml(documentXml);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error extracting DOCX text:', error);
    return `[DOCX extraction failed: ${errorMessage}]`;
  }
}

/**
 * Extract text from PDF file
 * This is a basic extraction that looks for text streams in the PDF
 */
async function extractPdfText(blob: Blob): Promise<string> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const pdfString = new TextDecoder('latin1').decode(bytes);
    
    const textParts: string[] = [];
    
    // Method 1: Extract text between BT (Begin Text) and ET (End Text) markers
    const textBlockRegex = /BT\s*([\s\S]*?)\s*ET/g;
    let match;
    
    while ((match = textBlockRegex.exec(pdfString)) !== null) {
      const block = match[1];
      
      // Extract text from Tj and TJ operators
      // Tj: (text) Tj - single string
      // TJ: [(text) (more)] TJ - array of strings
      const tjRegex = /\(([^)]*)\)\s*Tj/g;
      const tjArrayRegex = /\[([\s\S]*?)\]\s*TJ/g;
      
      let tjMatch;
      while ((tjMatch = tjRegex.exec(block)) !== null) {
        const text = decodePdfString(tjMatch[1]);
        if (text.trim()) {
          textParts.push(text);
        }
      }
      
      while ((tjMatch = tjArrayRegex.exec(block)) !== null) {
        const arrayContent = tjMatch[1];
        const stringRegex = /\(([^)]*)\)/g;
        let stringMatch;
        const lineParts: string[] = [];
        while ((stringMatch = stringRegex.exec(arrayContent)) !== null) {
          const text = decodePdfString(stringMatch[1]);
          if (text) {
            lineParts.push(text);
          }
        }
        if (lineParts.length > 0) {
          textParts.push(lineParts.join(''));
        }
      }
    }
    
    // Method 2: Look for stream objects that might contain text
    if (textParts.length < 10) {
      // Try to find readable ASCII text sequences
      const readableRegex = /[\x20-\x7E]{20,}/g;
      let readableMatch;
      while ((readableMatch = readableRegex.exec(pdfString)) !== null) {
        const text = readableMatch[0].trim();
        // Filter out PDF internal commands
        if (!text.includes('/') && !text.includes('<<') && !text.match(/^\d+\s+\d+\s+obj/)) {
          if (!textParts.includes(text)) {
            textParts.push(text);
          }
        }
      }
    }
    
    const result = textParts.join('\n').trim();
    
    if (!result || result.length < 50) {
      return '[PDF appears to be image-based or encrypted. Text extraction limited. Consider using OCR or uploading a text version.]';
    }
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error extracting PDF text:', error);
    return `[PDF extraction failed: ${errorMessage}]`;
  }
}

/**
 * Decode PDF string escapes
 */
function decodePdfString(str: string): string {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

/**
 * Extract text content from XML (used for PPTX/DOCX)
 * Looks for <a:t> (PowerPoint) and <w:t> (Word) text elements
 */
function extractTextFromXml(xml: string): string {
  const textParts: string[] = [];
  
  // Match text content in various XML text elements
  // <a:t>text</a:t> - PowerPoint
  // <w:t>text</w:t> - Word
  // Also handle namespaced versions
  const textRegex = /<(?:a:|w:|)t[^>]*>([^<]*)<\/(?:a:|w:|)t>/g;
  
  let match;
  let currentLine: string[] = [];
  let prevEndIndex = 0;
  
  while ((match = textRegex.exec(xml)) !== null) {
    const text = match[1];
    
    // Check if there's a paragraph break between matches
    const between = xml.substring(prevEndIndex, match.index);
    if (between.includes('</a:p>') || between.includes('</w:p>')) {
      if (currentLine.length > 0) {
        textParts.push(currentLine.join(''));
        currentLine = [];
      }
    }
    
    if (text.trim()) {
      currentLine.push(text);
    }
    
    prevEndIndex = match.index + match[0].length;
  }
  
  // Don't forget the last line
  if (currentLine.length > 0) {
    textParts.push(currentLine.join(''));
  }
  
  // Decode HTML entities
  return textParts.join('\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
}
