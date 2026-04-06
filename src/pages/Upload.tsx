/**
 * Upload Page - Pure Cloud Pipeline
 * 
 * Design principles:
 * 1. Single unified drop zone for multiple files
 * 2. TUS resumable uploads to cloud
 * 3. ALL processing happens in cloud - browser is just the "Postman"
 * 4. User can close tab after upload completes
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload as UploadIcon, X, FileVideo, CheckCircle2, Loader2, GripVertical, ArrowRight, ArrowLeft, Paperclip, FileText, AlertTriangle, Cloud, Music } from 'lucide-react';
import { RotatingWord } from '@/components/RotatingWord';
import { UploadCelebration } from '@/components/UploadCelebration';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { useBatchUpload, BatchModule } from '@/hooks/useBatchUpload';
import { useContentModeration } from '@/hooks/useContentModeration';
import { useUploadPersistence } from '@/hooks/useUploadPersistence';
import { useFirstUpload } from '@/hooks/useFirstUpload';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/Logo';
import { UploadRecoveryDialog } from '@/components/UploadRecoveryDialog';
import { NeduChat } from '@/components/NeduChat';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthGuard';

type UploadStep = 'input' | 'processing' | 'celebrating' | 'complete';

interface AttachmentFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: 'document' | 'video' | 'audio';
}

interface FileEntry {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  attachments: AttachmentFile[];
  isAudio?: boolean;
}

export default function Upload() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const addToExistingCourseId = searchParams.get('addTo');
  const existingCourseTitle = searchParams.get('title');

  const { submitBatch, isUploading, progress, cancel, reset, initializeProgress } = useBatchUpload();
  const { checkVideoFile } = useContentModeration();
  const { pendingUpload, saveUploadState, updateUploadProgress, clearUploadState, dismissRecovery } = useUploadPersistence();
  const { isFirstUpload, markFirstUploadComplete } = useFirstUpload();
  const { user } = useAuth();
  const email = user?.email || '';

  // Form state
  const [step, setStep] = useState<UploadStep>('input');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [courseTitle, setCourseTitle] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [folderAsModules] = useState(true); // Toggle for folder structure handling
  const [isDragOver, setIsDragOver] = useState(false);
  const [, setCourseId] = useState<string | null>(null);

  // Track if showing recovery dialog
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);

  // Drag reordering state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Team notification
  const [teamNotificationEmail] = useState('');
  const [teamNotificationRole] = useState('');

  // Course-level files (PDFs, docs, etc.)
  const [courseFiles, setCourseFiles] = useState<AttachmentFile[]>([]);

  // Processing mode: false = Fast (1 FPS), true = Precision (3 FPS)
  const [precisionMode, setPrecisionMode] = useState(false);

  // Merged Course Mode: All videos become chapters in ONE unified PDF
  // When true: One PDF with TOC + chapters, single completion email
  // When false (default): Separate artifacts per module, per-module emails
  const [mergedCourseMode, setMergedCourseMode] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const courseFilesInputRef = useRef<HTMLInputElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // Show recovery dialog ONLY for truly interrupted uploads (stale >30 min)
  // This does NOT block concurrent uploads in different tabs
  useEffect(() => {
    // Only show recovery for interrupted uploads, not active ones in other tabs
    if (pendingUpload && step === 'input') {
      // pendingUpload is from interruptedUploads (stale >30min), not blocking active uploads
      setShowRecoveryDialog(true);
    }
  }, [pendingUpload, step]);

  // If adding to existing course, set the title
  useEffect(() => {
    if (existingCourseTitle) {
      setCourseTitle(decodeURIComponent(existingCourseTitle));
    }
  }, [existingCourseTitle]);

  // Handle file selection - sorts videos and documents automatically
  const handleFilesSelected = useCallback(async (selectedFiles: FileList | File[]) => {
    const fileArray = Array.from(selectedFiles);
    const newVideoEntries: FileEntry[] = [];
    const newDocEntries: AttachmentFile[] = [];

    // Document extensions to check
    const docExtensions = /\.(pdf|doc|docx|txt|md|ppt|pptx|xls|xlsx|csv|json|js|ts|jsx|tsx|html|css|xml|yaml|yml|py|sh|env|rtf)$/i;

    for (const file of fileArray) {
      const isVideo = file.type.startsWith('video/') ||
        /\.(mp4|mov|webm|avi|mkv|m4v)$/i.test(file.name);
      const isAudio = file.type.startsWith('audio/') ||
        /\.(mp3|wav|m4a|aac|ogg|flac|wma|opus|webm)$/i.test(file.name);
      const isDocument = docExtensions.test(file.name);

      if (isVideo) {
        // Validate video file
        const result = checkVideoFile(file);
        if (!result.isAllowed) {
          toast.error(`${file.name}: ${result.reason}`);
          continue;
        }

        newVideoEntries.push({
          id: crypto.randomUUID(),
          file,
          name: file.name.replace(/\.[^/.]+$/, ''),
          size: file.size,
          status: 'pending',
          attachments: [],
        });
      } else if (isAudio) {
        // Audio files are treated like video modules but will skip frame extraction
        newVideoEntries.push({
          id: crypto.randomUUID(),
          file,
          name: file.name.replace(/\.[^/.]+$/, ''),
          size: file.size,
          status: 'pending',
          attachments: [],
          isAudio: true,
        });
      } else if (isDocument) {
        newDocEntries.push({
          id: crypto.randomUUID(),
          file,
          name: file.name.replace(/\.[^/.]+$/, ''),
          size: file.size,
          type: 'document',
        });
      } else {
        toast.error(`${file.name}: Unsupported file type`);
      }
    }

    // Add videos as modules
    if (newVideoEntries.length > 0) {
      setFiles(prev => [...prev, ...newVideoEntries]);

      // Auto-set course title from first video if empty
      if (!courseTitle && newVideoEntries.length > 0) {
        setCourseTitle(newVideoEntries[0].name);
      }
    }

    // Add documents as course files
    if (newDocEntries.length > 0) {
      setCourseFiles(prev => [...prev, ...newDocEntries]);
    }

    // Show summary toast
    const parts = [];
    if (newVideoEntries.length > 0) parts.push(`${newVideoEntries.length} video${newVideoEntries.length > 1 ? 's' : ''}`);
    if (newDocEntries.length > 0) parts.push(`${newDocEntries.length} document${newDocEntries.length > 1 ? 's' : ''}`);
    if (parts.length > 0) {
      toast.success(`Added ${parts.join(' and ')}`);
    }
  }, [checkVideoFile, courseTitle]);

  // Handle folder selection - extracts video files from folder (top-level only)
  const handleFolderSelected = useCallback(async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const fileArray = Array.from(selectedFiles);

    // Filter to only video files at top level (no subfolders)
    const videoFiles = fileArray.filter(file => {
      const isVideo = file.type.startsWith('video/') ||
        /\.(mp4|mov|webm|avi|mkv|m4v)$/i.test(file.name);
      // Check if it's top-level (no "/" in webkitRelativePath after folder name)
      const pathParts = (file as any).webkitRelativePath?.split('/') || [];
      const isTopLevel = pathParts.length <= 2; // folder/file.mp4
      return isVideo && isTopLevel;
    });

    if (videoFiles.length === 0) {
      toast.error('No video files found in folder (top level only)');
      return;
    }

    // Get folder name for course title
    const firstFile = fileArray[0] as any;
    const folderName = firstFile.webkitRelativePath?.split('/')[0] || 'Untitled';

    // Sort files alphabetically by name
    videoFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    const newEntries: FileEntry[] = [];

    for (const file of videoFiles) {
      const result = checkVideoFile(file);
      if (!result.isAllowed) {
        toast.error(`${file.name}: ${result.reason}`);
        continue;
      }

      const entryId = crypto.randomUUID();
      newEntries.push({
        id: entryId,
        file,
        name: file.name.replace(/\.[^/.]+$/, ''),
        size: file.size,
        status: 'pending',
        attachments: [],
      });
    }

    if (newEntries.length > 0) {
      if (folderAsModules) {
        // Replace existing files - folder becomes the course
        setFiles(newEntries);
        if (!courseTitle) {
          setCourseTitle(folderName);
        }
      } else {
        // Add to existing files
        setFiles(prev => [...prev, ...newEntries]);
        if (!courseTitle && newEntries.length > 0) {
          setCourseTitle(folderName);
        }
      }

      toast.success(`Added ${newEntries.length} videos from "${folderName}"`);
    }
  }, [checkVideoFile, courseTitle, folderAsModules]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      handleFilesSelected(droppedFiles);
    }
  }, [handleFilesSelected]);

  // Remove a file
  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  // Update a file's name (module title)
  const updateFileName = useCallback((id: string, newName: string) => {
    setFiles(prev => prev.map(f =>
      f.id === id ? { ...f, name: newName } : f
    ));
  }, []);

  // Add attachment to a specific module
  const attachmentInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const videoAttachmentInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleAttachmentSelected = useCallback((moduleId: string, selectedFiles: FileList | null, type: 'document' | 'video') => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newAttachments: AttachmentFile[] = Array.from(selectedFiles).map(file => ({
      id: crypto.randomUUID(),
      file,
      name: file.name.replace(/\.[^/.]+$/, ''),
      size: file.size,
      type,
    }));

    setFiles(prev => prev.map(f =>
      f.id === moduleId
        ? { ...f, attachments: [...f.attachments, ...newAttachments] }
        : f
    ));

    const label = type === 'video' ? 'video' : 'file';
    toast.success(`Added ${newAttachments.length} ${label}${newAttachments.length > 1 ? 's' : ''} to module`);
  }, []);

  // Remove attachment from a module
  const removeAttachment = useCallback((moduleId: string, attachmentId: string) => {
    setFiles(prev => prev.map(f =>
      f.id === moduleId
        ? { ...f, attachments: f.attachments.filter(a => a.id !== attachmentId) }
        : f
    ));
  }, []);

  // Handle course-level file selection
  const handleCourseFilesSelected = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newFiles: AttachmentFile[] = Array.from(selectedFiles).map(file => ({
      id: crypto.randomUUID(),
      file,
      name: file.name.replace(/\.[^/.]+$/, ''),
      size: file.size,
      type: 'document' as const,
    }));

    setCourseFiles(prev => [...prev, ...newFiles]);
    toast.success(`Added ${newFiles.length} course file${newFiles.length > 1 ? 's' : ''}`);
  }, []);

  // Remove course-level file
  const removeCourseFile = useCallback((fileId: string) => {
    setCourseFiles(prev => prev.filter(f => f.id !== fileId));
  }, []);

  // Get sub-label for module (e.g., "4A", "4B")
  const getSubLabel = (index: number): string => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return letters[index] || String(index + 1);
  };

  // Drag reordering handlers
  const handleDragStart = useCallback((e: React.DragEvent, fileId: string) => {
    setDraggedId(fileId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', fileId);
    setTimeout(() => {
      const el = e.target as HTMLElement;
      el.style.opacity = '0.5';
    }, 0);
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedId(null);
    setDragOverId(null);
    const el = e.target as HTMLElement;
    el.style.opacity = '1';
  }, []);

  const handleDragOverItem = useCallback((e: React.DragEvent, fileId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedId && fileId !== draggedId) {
      setDragOverId(fileId);
    }
  }, [draggedId]);

  const handleDragLeaveItem = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDropOnItem = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    setFiles(prev => {
      const fromIndex = prev.findIndex(f => f.id === draggedId);
      const toIndex = prev.findIndex(f => f.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return prev;

      const newFiles = [...prev];
      const [removed] = newFiles.splice(fromIndex, 1);
      newFiles.splice(toIndex, 0, removed);
      return newFiles;
    });

    setDraggedId(null);
    setDragOverId(null);
  }, [draggedId]);

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  // Validate form - allow either videos OR documents
  const isFormValid = (files.length > 0 || courseFiles.length > 0) && courseTitle.trim() && email && termsAccepted;

  // Handle submit - Pure Cloud Flow
  const handleSubmit = async () => {
    if (!isFormValid) return;

    // Transition to locked processing state
    setStep('processing');

    // Auto-scroll to progress bar after a brief delay for animation
    setTimeout(() => {
      progressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);

    // Initialize progress immediately for visual feedback
    const hasDocumentsOnly = files.length === 0 && courseFiles.length > 0;
    initializeProgress(files.length, hasDocumentsOnly);

    // Save upload state for recovery
    saveUploadState({
      courseTitle,
      email,
      files: files.map(f => ({
        id: f.id,
        name: f.name,
        size: f.size,
        attachmentCount: f.attachments.length,
      })),
      startedAt: Date.now(),
      stage: 'uploading',
      uploadedModules: 0,
      totalModules: files.length,
    });

    console.log('[Upload] Starting pure cloud upload flow');

    // Convert files to BatchModule format - include ALL attachments (videos + documents)
    // The batch upload hook will separate them and handle sub-videos for stitching
    const modules: BatchModule[] = files.map((f, i) => ({
      id: f.id,
      title: f.name,
      file: f.file,
      status: 'pending' as const,
      progress: 0,
      attachments: f.attachments, // Include all attachments - hook will filter by type
      isAudio: f.isAudio, // Pass audio flag to skip frame extraction
    }));

    // Upload course-level files first
    let courseFileUrls: { name: string; storagePath: string; size: number }[] = [];
    if (courseFiles.length > 0) {
      for (const cf of courseFiles) {
        try {
          const storagePath = `course-files/${crypto.randomUUID()}/${cf.file.name}`;
          const { error } = await supabase.storage
            .from('course-files')
            .upload(storagePath, cf.file);

          if (!error) {
            courseFileUrls.push({
              name: cf.name,
              storagePath,
              size: cf.size
            });
          }
        } catch (e) {
          console.warn('[Upload] Failed to upload course file:', cf.name, e);
        }
      }
    }

    // Submit batch - all videos go to cloud
    // If adding to existing course, pass the existingCourseId
    const result = await submitBatch(modules, email, courseTitle, {
      extractionFps: precisionMode ? 3 : 1, // Fast Mode = 1 FPS, Precision Mode = 3 FPS
      teamNotificationEmail: teamNotificationEmail || undefined,
      teamNotificationRole: teamNotificationRole || undefined,
      courseFiles: courseFileUrls.length > 0 ? courseFileUrls : undefined,
      existingCourseId: addToExistingCourseId || undefined,
      mergedCourseMode: mergedCourseMode && files.length > 1, // Only for multi-video uploads
    });

    if (result.success) {
      setCourseId(result.courseId || null);
      setStep('celebrating');
      // No need to save email to localStorage - using authenticated session
      clearUploadState();
    } else {
      // If the upload failed in this session, don't trigger the recovery modal.
      // Recovery is only meant for refresh/navigation interruptions.
      clearUploadState();
      toast.error(result.error || 'Upload failed');
      setStep('input');
    }
  };

  // Update persisted progress as modules upload (but not after completion)
  useEffect(() => {
    // Don't persist state after upload completes successfully
    if (step === 'celebrating' || step === 'complete') return;

    if (progress.stage === 'uploading' || progress.stage === 'submitted') {
      updateUploadProgress(progress.uploadedModules, progress.stage === 'submitted' ? 'submitted' : 'uploading');
    }
  }, [progress.uploadedModules, progress.stage, updateUploadProgress, step]);

  // Handle recovery: resume with same course title/email
  const handleResumeUpload = useCallback(() => {
    if (pendingUpload) {
      setCourseTitle(pendingUpload.courseTitle);
      // Email now comes from authenticated session, no need to set it
      toast.info(`Re-uploading "${pendingUpload.courseTitle}" - please add your video files again`);
    }
    setShowRecoveryDialog(false);
    dismissRecovery();
  }, [pendingUpload, dismissRecovery]);

  // Handle starting fresh
  const handleStartFresh = useCallback(() => {
    setShowRecoveryDialog(false);
    dismissRecovery();
  }, [dismissRecovery]);

  // Get status for file in processing view
  const getFileStatus = (index: number) => {
    if (progress.stage === 'idle' || progress.stage === 'error') return 'pending';
    if (index < progress.uploadedModules) return 'uploaded';
    if (index === progress.currentModuleIndex && progress.stage === 'uploading') return 'uploading';
    return 'pending';
  };

  // Start another upload
  const startAnother = () => {
    setFiles([]);
    setCourseTitle('');
    setTermsAccepted(false);
    setStep('input');
    reset();
  };

  return (
    <>
      {/* Recovery Dialog */}
      {showRecoveryDialog && pendingUpload && (
        <UploadRecoveryDialog
          pendingUpload={pendingUpload}
          onResume={handleResumeUpload}
          onStartFresh={handleStartFresh}
        />
      )}

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border bg-background/80 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <Logo className="h-8 w-auto" />
            </Link>
            {step === 'input' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(-1)}
                className="text-muted-foreground"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            )}
          </div>
        </header>

        <div className="flex items-center justify-center p-4 pt-8 pb-16">
          <div className="w-full max-w-2xl">
            <AnimatePresence mode="wait">
              {/* INPUT STEP - Editable */}
              {step === 'input' && (
                <motion.div
                  key="input"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6"
                >
                  {/* Minimal Header - only if adding to existing */}
                  {addToExistingCourseId && (
                    <div className="text-center">
                      <h1 className="text-lg font-medium text-foreground">Add More Videos</h1>
                    </div>
                  )}


                  {/* Course Title */}
                  <div>
                    <Input
                      placeholder="Course title"
                      value={courseTitle}
                      onChange={(e) => setCourseTitle(e.target.value)}
                      className="text-lg h-12 bg-card border-border"
                      disabled={!!addToExistingCourseId}
                    />
                  </div>

                  {/* Unified Drop Zone */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200",
                      isDragOver
                        ? "border-primary bg-primary/5 scale-[1.02]"
                        : "border-border hover:border-primary/50 hover:bg-muted/30",
                      files.length > 0 && "p-6"
                    )}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*,audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.wma,.opus,.pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.xls,.xlsx,.csv,.json,.js,.ts,.jsx,.tsx,.html,.css,.xml,.yaml,.yml,.py,.sh,.env,.rtf"
                      multiple
                      className="hidden"
                      onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
                    />
                    {/* Hidden folder input with webkitdirectory */}
                    <input
                      ref={folderInputRef}
                      type="file"
                      // @ts-ignore - webkitdirectory is a valid attribute but not in types
                      webkitdirectory=""
                      directory=""
                      multiple
                      className="hidden"
                      onChange={(e) => handleFolderSelected(e.target.files)}
                    />

                    {files.length === 0 && courseFiles.length === 0 ? (
                      <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                          <UploadIcon className="w-8 h-8 text-primary" />
                        </div>
                        <div>
                          <p className="text-lg font-medium text-foreground">Drop files here</p>
                          <p className="text-sm text-muted-foreground mt-1">Video, audio, or documents — up to 10GB per file</p>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          className="gap-2"
                        >
                          <UploadIcon className="w-4 h-4" />
                          Upload Files
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                        {/* Compact file list with drag reordering */}
                        {files.map((file, index) => (
                          <div key={file.id} className="space-y-1">
                            <div
                              draggable
                              onDragStart={(e) => handleDragStart(e, file.id)}
                              onDragEnd={handleDragEnd}
                              onDragOver={(e) => handleDragOverItem(e, file.id)}
                              onDragLeave={handleDragLeaveItem}
                              onDrop={(e) => handleDropOnItem(e, file.id)}
                              className={cn(
                                "flex items-center gap-3 p-3 bg-muted/50 rounded-lg group cursor-grab active:cursor-grabbing transition-all duration-150",
                                draggedId === file.id && "opacity-50 scale-[0.98]",
                                dragOverId === file.id && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                              )}
                            >
                              <GripVertical className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
                                {index + 1}
                              </span>
                              {file.isAudio ? <Music className="w-5 h-5 text-purple-500 flex-shrink-0" /> : <FileVideo className="w-5 h-5 text-primary flex-shrink-0" />}
                              <input
                                type="text"
                                value={file.name}
                                onChange={(e) => updateFileName(file.id, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="flex-1 bg-transparent border-none text-foreground text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary/50 rounded px-1 -ml-1 truncate cursor-text"
                                placeholder="Module title"
                              />
                              <span className="text-xs text-muted-foreground">
                                {formatSize(file.size)}
                              </span>
                              {/* Multi-video indicator */}
                              {file.attachments.filter(a => a.type === 'video').length > 0 && (
                                <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                                  {file.attachments.filter(a => a.type === 'video').length + 1} videos
                                </span>
                              )}
                              {/* Hidden inputs for attachments */}
                              <input
                                ref={(el) => { videoAttachmentInputRefs.current[file.id] = el; }}
                                type="file"
                                accept="video/*"
                                multiple
                                className="hidden"
                                onChange={(e) => handleAttachmentSelected(file.id, e.target.files, 'video')}
                              />
                              <input
                                ref={(el) => { attachmentInputRefs.current[file.id] = el; }}
                                type="file"
                                accept=".pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.xls,.xlsx,.csv,.json,.js,.ts,.jsx,.tsx,.html,.css,.xml,.yaml,.yml,.py,.sh,.env,.rtf"
                                multiple
                                className="hidden"
                                onChange={(e) => handleAttachmentSelected(file.id, e.target.files, 'document')}
                              />
                              {/* Add video button */}
                              <button
                                onClick={(e) => { e.stopPropagation(); videoAttachmentInputRefs.current[file.id]?.click(); }}
                                className="p-1.5 hover:bg-primary/20 rounded transition-colors group/btn"
                                title="Add sub-video (Module 4A, 4B, etc.)"
                              >
                                <FileVideo className="w-4 h-4 text-primary" />
                              </button>
                              {/* Attach document button */}
                              <button
                                onClick={(e) => { e.stopPropagation(); attachmentInputRefs.current[file.id]?.click(); }}
                                className="p-1.5 hover:bg-amber-500/20 rounded transition-colors group/btn"
                                title="Attach supplementary documents (PDFs, docs, etc.)"
                              >
                                <FileText className="w-4 h-4 text-amber-500" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
                                className="p-1 hover:bg-destructive/20 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                              </button>
                            </div>

                            {/* Attachments list */}
                            {file.attachments.length > 0 && (
                              <div className="ml-12 space-y-1">
                                {/* Sub-videos first */}
                                {file.attachments.filter(a => a.type === 'video').map((attachment, subIndex) => (
                                  <div
                                    key={attachment.id}
                                    className="flex items-center gap-2 px-3 py-2 bg-primary/5 rounded text-sm group/att border border-primary/10"
                                  >
                                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                      {index + 1}{getSubLabel(subIndex + 1)}
                                    </span>
                                    <FileVideo className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                    <span className="flex-1 truncate text-foreground">
                                      {attachment.name}
                                    </span>
                                    <span className="text-muted-foreground/60 text-xs">
                                      {formatSize(attachment.size)}
                                    </span>
                                    <button
                                      onClick={() => removeAttachment(file.id, attachment.id)}
                                      className="p-0.5 hover:bg-destructive/20 rounded opacity-0 group-hover/att:opacity-100 transition-opacity"
                                    >
                                      <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                                    </button>
                                  </div>
                                ))}
                                {/* Document attachments */}
                                {file.attachments.filter(a => a.type === 'document').map(attachment => (
                                  <div
                                    key={attachment.id}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 rounded text-xs group/att"
                                  >
                                    <FileText className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                    <span className="flex-1 truncate text-muted-foreground">
                                      {attachment.name}
                                    </span>
                                    <span className="text-muted-foreground/60">
                                      {formatSize(attachment.size)}
                                    </span>
                                    <button
                                      onClick={() => removeAttachment(file.id, attachment.id)}
                                      className="p-0.5 hover:bg-destructive/20 rounded opacity-0 group-hover/att:opacity-100 transition-opacity"
                                    >
                                      <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Add more files */}
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full p-3 border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex items-center justify-center gap-2"
                        >
                          <UploadIcon className="w-4 h-4" />
                          + Add Files
                        </button>

                        {/* Hidden input for course files */}
                        <input
                          ref={courseFilesInputRef}
                          type="file"
                          multiple
                          accept=".pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.xls,.xlsx,.csv,.json,.js,.ts,.jsx,.tsx,.html,.css,.xml,.yaml,.yml,.py,.sh,.env,.rtf"
                          className="hidden"
                          onChange={(e) => handleCourseFilesSelected(e.target.files)}
                        />

                        {/* Display course-level files */}
                        {courseFiles.length > 0 && (
                          <div className="space-y-1 p-3 bg-muted/20 rounded-lg">
                            <p className="text-xs text-muted-foreground mb-2">Course Materials:</p>
                            {courseFiles.map(file => (
                              <div
                                key={file.id}
                                className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 rounded text-xs group/att"
                              >
                                <FileText className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                <span className="flex-1 truncate text-foreground">
                                  {file.name}
                                </span>
                                <span className="text-muted-foreground/60">
                                  {formatSize(file.size)}
                                </span>
                                <button
                                  onClick={() => removeCourseFile(file.id)}
                                  className="p-0.5 hover:bg-destructive/20 rounded opacity-0 group-hover/att:opacity-100 transition-opacity"
                                >
                                  <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Signed in as - minimal */}
                  <p className="text-xs text-muted-foreground text-center">{email}</p>

                  {/* Processing Mode Toggle - Minimal */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                    <span className="text-sm text-foreground">
                      {precisionMode ? 'Precision (3 FPS)' : 'Fast (1 FPS)'}
                    </span>
                    <button
                      onClick={() => setPrecisionMode(!precisionMode)}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                        precisionMode ? "bg-amber-500" : "bg-primary"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                          precisionMode ? "translate-x-6" : "translate-x-1"
                        )}
                      />
                    </button>
                  </div>

                  {/* Output Mode Toggle - Clearer labels per beta feedback */}
                  {files.length > 1 && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {mergedCourseMode ? 'Combined Output' : 'Separate Outputs'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {mergedCourseMode
                            ? 'One PDF with all videos as chapters'
                            : 'One PDF per video'}
                        </span>
                      </div>
                      <button
                        onClick={() => setMergedCourseMode(!mergedCourseMode)}
                        className={cn(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                          mergedCourseMode ? "bg-primary" : "bg-muted-foreground/30"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                            mergedCourseMode ? "translate-x-6" : "translate-x-1"
                          )}
                        />
                      </button>
                    </div>
                  )}

                  {/* Terms Checkbox - Minimal */}
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="terms"
                      checked={termsAccepted}
                      onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                    />
                    <label htmlFor="terms" className="text-sm text-muted-foreground cursor-pointer">
                      I have rightful access to this material.{' '}
                      <Link to="/terms" className="text-primary hover:underline">Terms</Link>
                    </label>
                  </div>

                  {/* Submit Button - Clearer label per beta feedback */}
                  <Button
                    onClick={handleSubmit}
                    disabled={!isFormValid || isUploading}
                    className="w-full h-14 text-lg font-semibold"
                    size="lg"
                  >
                    {(() => {
                      const totalItems = files.length + courseFiles.length;
                      if (totalItems === 0) return 'Submit';
                      if (totalItems === 1) return 'Submit File';
                      return `Submit All ${totalItems} Files`;
                    })()}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </motion.div>
              )}

              {/* PROCESSING STEP - Locked, Read-Only, Cloud-Only */}
              {step === 'processing' && (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-8"
                >
                  {/* Locked Header */}
                  <div className="text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <Cloud className="w-6 h-6 text-primary" />
                    </div>
                    <h1 className="text-headline text-foreground">
                      Uploading{' '}
                      <RotatingWord
                        words={['Relief', 'Freedom', 'Scale', 'Clarity', 'Delegation', 'Your Life Back']}
                        intervalMs={3000}
                        className="text-primary"
                      />
                    </h1>
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">{courseTitle}</span>
                    </p>
                  </div>

                  {/* Cloud Processing Info */}
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/20"
                  >
                    <Cloud className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-primary">
                        Uploading to OneDuo
                      </p>
                      <p className="text-xs text-primary/70">
                        Resilient upload — survives WiFi drops and browser refreshes.
                      </p>
                    </div>
                  </motion.div>

                  {/* Caution Banner */}
                  {!progress.canClose && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30"
                    >
                      <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-amber-500">
                          Keep this tab open until uploads finish
                        </p>
                        <p className="text-xs text-amber-500/70">
                          Switching to other tabs is fine — just don't close this one until all modules are done uploading.
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* Locked Module List */}
                  <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                    {files.map((file, index) => {
                      const status = getFileStatus(index);
                      const attachmentCount = file.attachments?.length || 0;

                      return (
                        <div
                          key={file.id}
                          className="rounded-lg bg-muted/30 overflow-hidden"
                        >
                          <div className="flex items-center gap-3 p-3">
                            {status === 'uploaded' && (
                              <Cloud className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                            )}
                            {status === 'uploading' && (
                              <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
                            )}
                            {status === 'pending' && (
                              <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />
                            )}

                            <span className="flex-1 truncate text-foreground text-sm">
                              {file.name}
                            </span>

                            {/* Attachment indicators */}
                            {attachmentCount > 0 && (
                              <div className="flex items-center gap-0.5 mr-2">
                                {Array.from({ length: Math.min(attachmentCount, 3) }).map((_, i) => (
                                  <Paperclip
                                    key={i}
                                    className={cn(
                                      "w-3.5 h-3.5 text-amber-500/80",
                                      i > 0 && "-ml-1.5"
                                    )}
                                  />
                                ))}
                                {attachmentCount > 3 && (
                                  <span className="text-xs text-amber-500/80 ml-0.5">+{attachmentCount - 3}</span>
                                )}
                              </div>
                            )}

                            {/* Status badge - simplified, no duplicate percentage */}
                            <span className={cn(
                              "text-xs px-2 py-1 rounded-full",
                              status === 'uploaded' && "bg-emerald-500/10 text-emerald-500",
                              status === 'uploading' && "bg-primary/10 text-primary",
                              status === 'pending' && "bg-muted text-muted-foreground"
                            )}>
                              {status === 'uploaded' && 'Saved'}
                              {status === 'uploading' && 'Uploading...'}
                              {status === 'pending' && 'Waiting'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Overall Progress with Prominent Percentage - Sticky */}
                  <div ref={progressRef} className="sticky bottom-4 z-10 bg-background/95 backdrop-blur-sm rounded-xl border border-border p-4 shadow-lg space-y-3">
                    {/* Large percentage badge like Handbrake */}
                    {(() => {
                      // Calculate realistic progress:
                      // - Each module's upload counts for 90% of its slice (file transfer)
                      // - Remaining 10% is for verification which we can't track precisely
                      // - Cap overall at 99% until stage changes to 'submitted' or 'complete'
                      const moduleSlice = progress.totalModules > 0 ? 90 / progress.totalModules : 0;
                      const completedModulesProgress = progress.uploadedModules * moduleSlice;
                      const currentModuleProgress = (progress.currentModuleProgress || 0) * 0.9 * moduleSlice / 100;
                      let overallProgress = completedModulesProgress + currentModuleProgress;

                      // Cap at 95% during upload phase, allow 100% only when submitted/complete
                      if (progress.stage === 'uploading' && overallProgress > 95) {
                        overallProgress = 95;
                      } else if (progress.stage === 'submitted') {
                        overallProgress = 100;
                      }

                      return (
                        <>
                          <div className="flex justify-center">
                            <div className="bg-primary/10 border border-primary/20 rounded-2xl px-6 py-3">
                              <span className="text-3xl font-mono font-semibold text-primary tabular-nums">
                                {overallProgress.toFixed(1)}%
                              </span>
                            </div>
                          </div>

                          <Progress
                            value={overallProgress}
                            className="h-2"
                          />
                        </>
                      );
                    })()}
                    <p className="text-sm text-center text-muted-foreground">
                      {progress.message}
                    </p>
                  </div>

                  {/* Reassurance Message */}
                  {progress.canClose && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-green-500/5 border border-green-500/20 rounded-xl p-6 text-center space-y-2"
                    >
                      <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto" />
                      <p className="text-foreground font-medium">
                        Upload complete — processing has started.
                      </p>
                      <p className="text-muted-foreground text-sm">
                        You can close this tab — we'll email you when your course is ready.
                      </p>
                    </motion.div>
                  )}

                  {/* Cancel Option (subtle) */}
                  <div className="text-center">
                    <button
                      onClick={() => {
                        cancel();
                        setStep('input');
                      }}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel upload
                    </button>
                  </div>
                </motion.div>
              )}

              {/* CELEBRATING STEP - Magical transition to dashboard */}
              {step === 'celebrating' && (
                <UploadCelebration
                  courseTitle={courseTitle}
                  isFirstUpload={isFirstUpload}
                  onComplete={() => {
                    if (isFirstUpload) {
                      markFirstUploadComplete();
                    }
                    setStep('complete');
                  }}
                />
              )}

              {/* COMPLETE STEP - Fallback if user navigates back */}
              {step === 'complete' && (
                <motion.div
                  key="complete"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-8 text-center"
                >
                  {/* Success Icon */}
                  <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-10 h-10 text-green-500" />
                  </div>

                  {/* Success Message */}
                  <div className="space-y-3">
                    <h1 className="text-headline text-foreground">Upload Complete!</h1>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      <span className="font-medium text-foreground">{files.length} {files.length === 1 ? 'file' : 'files'}</span> uploaded and now processing in the cloud.
                      <br />
                      We'll email you at <span className="font-medium text-foreground">{email}</span> when your course is ready.
                    </p>
                  </div>

                  {/* Reassurance */}
                  <div className="bg-card border border-border rounded-xl p-6 space-y-2">
                    <p className="text-foreground font-medium">
                      ⏳ Your course is processing in the cloud
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Processing typically takes 5-15 minutes per video. You can check progress on the Dashboard.
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                      variant="outline"
                      onClick={() => navigate('/dashboard')}
                      className="min-w-[160px]"
                    >
                      Go to Dashboard
                    </Button>
                    <Button
                      onClick={startAnother}
                      className="min-w-[160px]"
                    >
                      Upload Another Course
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Nedu Chat Assistant */}
      {email && <NeduChat email={email} />}
    </>
  );
}
