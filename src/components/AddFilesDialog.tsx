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

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const validFiles = selectedFiles.filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ['pdf', 'doc', 'docx', 'txt', 'md', 'json', 'js', 'ts', 'html', 'css', 'csv', 'xml', 'yaml', 'yml', 'jsx', 'tsx', 'py', 'sh', 'env'].includes(ext || '');
    });
    
    if (validFiles.length < selectedFiles.length) {
      toast.warning('Some files were skipped. Unsupported file type.');
    }
    
    setFiles(prev => [...prev, ...validFiles]);
  }, []);

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
        const file = files[i];
        const storagePath = `${courseId}/supplementary/${Date.now()}_${file.name}`;
        
        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('course-files')
          .upload(storagePath, file, {
            contentType: file.type,
            upsert: false
          });

        if (uploadError) {
          console.error(`Failed to upload ${file.name}:`, uploadError);
          toast.error(`Failed to upload ${file.name}`);
          continue;
        }

        uploadedFiles.push({
          name: file.name,
          storagePath,
          size: file.size,
          uploadedAt: new Date().toISOString()
        });

        setUploadedCount(uploadedFiles.length);
        setUploadProgress(((i + 1) / files.length) * 50); // First 50% is uploading
      }

      if (uploadedFiles.length === 0) {
        throw new Error('No files were uploaded successfully');
      }

      // Update course with new files
      const allFiles = [...existingFiles, ...uploadedFiles];
      
      const { error: updateError } = await supabase
        .from('courses')
        .update({ course_files: allFiles as any })
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
              accept=".pdf,.doc,.docx,.txt,.md,.json,.js,.ts,.html,.css,.csv,.xml,.yaml,.yml,.jsx,.tsx,.py,.sh,.env"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload className="w-8 h-8 text-white/40 mx-auto mb-2" />
            <p className="text-sm text-white/60">
              Click to select files or drag and drop
            </p>
            <p className="text-xs text-white/40 mt-1">
              Documents & code files (PDF, JSON, JS, HTML, CSS, etc.)
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
            disabled={files.length === 0 || isUploading}
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
