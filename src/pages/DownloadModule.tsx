import { useState, useEffect, useRef } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Download as DownloadIcon, CheckCircle, Loader2, FileText, MessageSquare, AlertCircle, Package, Film, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateChatGPTPDF, downloadPDF, showSaveDialog } from "@/lib/pdfExporter";
import { generateMemoryPackage, ExportMode } from "@/lib/memoryExporter";
import { toast } from "sonner";

type ExportFormat = 'pdf' | 'memory-training' | 'memory-creative';

interface ModuleData {
  id: string;
  title: string;
  moduleNumber: number;
  video_duration_seconds?: number;
  transcript?: any[];
  frame_urls?: string[];
  audio_events?: any;
  prosody_annotations?: any;
  ai_context?: string;
  course_id: string;
  courseTitle?: string;
}

const DownloadModulePage = () => {
  const { moduleId } = useParams<{ moduleId: string }>();
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get('courseId');
  const moduleNumber = searchParams.get('module');
  const fidelityMode = searchParams.get('fidelity') === 'true';

  const [module, setModule] = useState<ModuleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState("");
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  const [filmMode, setFilmMode] = useState(false);
  const [aiVisionMode, setAiVisionMode] = useState(fidelityMode);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const [preloadComplete, setPreloadComplete] = useState(false);
  const hasAutoTriggered = useRef(false);

  // Chunked download state (for videos > 60 min)
  const CHUNK_DURATION_SEC = 3600;
  const [downloadingChunkIdx, setDownloadingChunkIdx] = useState<number | null>(null);
  const [completedChunks, setCompletedChunks] = useState<Set<number>>(new Set());

  useEffect(() => {
    const fetchModule = async () => {
      try {
        // Fetch module data from edge function
        const { data, error: fetchError } = await supabase.functions.invoke('get-module-data', {
          body: moduleId
            ? { moduleId }
            : { courseId, moduleNumber: parseInt(moduleNumber || '1', 10) }
        });

        if (fetchError) {
          throw new Error(fetchError.message);
        }

        if (data.error) {
          throw new Error(data.error);
        }

        setModule(data.module);

        // OPTIMIZATION: Preload frame images with progress tracking
        if (data.module?.frame_urls?.length > 0) {
          const framesToPreload = data.module.frame_urls.slice(0, 150);
          console.log(`[DownloadModule] Preloading ${framesToPreload.length} frames...`);

          // Track preload progress
          let loaded = 0;
          const total = framesToPreload.length;

          // Load frames in batches with progress updates
          const BATCH_SIZE = 15;
          for (let i = 0; i < framesToPreload.length; i += BATCH_SIZE) {
            const batch = framesToPreload.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (url) => {
              try {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                await new Promise((resolve, reject) => {
                  img.onload = resolve;
                  img.onerror = resolve; // Continue even if one fails
                  img.src = url;
                });
                loaded++;
                setPreloadProgress(Math.round((loaded / total) * 100));
              } catch {
                loaded++;
              }
            }));
          }

          console.log(`[DownloadModule] Preload complete: ${loaded}/${total} frames cached`);
          setPreloadComplete(true);
        } else {
          setPreloadComplete(true); // No frames to preload
        }
      } catch (err: any) {
        console.error("Failed to fetch module:", err);
        setError(err.message || "Module not found or not yet ready");
      } finally {
        setLoading(false);
      }
    };

    if (moduleId || (courseId && moduleNumber)) {
      fetchModule();
    } else {
      setError("No module identifier provided");
      setLoading(false);
    }
  }, [moduleId, courseId, moduleNumber]);

  // Auto-trigger download only after preload completes (skip for long videos — chunk buttons handle those)
  useEffect(() => {
    const isLongVideo = (module?.video_duration_seconds || 0) > CHUNK_DURATION_SEC;
    if (module && preloadComplete && !isLongVideo && !hasAutoTriggered.current && !downloading && !downloadComplete) {
      hasAutoTriggered.current = true;
      handleDownload(0);
    }
  }, [module, preloadComplete]);

  const handleDownload = async (retryCount = 0) => {
    if (!module) return;
    const MAX_RETRIES = 2;

    const moduleTitle = `${module.courseTitle || 'Course'} - ${module.title}`;
    const safeTitle = moduleTitle.replace(/[^a-zA-Z0-9]/g, "_");

    const formatLabel = selectedFormat === 'pdf' ? 'PDF' :
      selectedFormat === 'memory-training' ? 'Training Memory Package' : 'Creative Memory Package';

    // Show the native "Save As" dialog immediately on click, before generation starts,
    // so the browser file manager appears right away instead of after the file is fully built.
    let fileHandle: FileSystemFileHandle | null = null;
    if (retryCount === 0) {
      if (selectedFormat === 'pdf') {
        try {
          fileHandle = await showSaveDialog(`OneDuo_${safeTitle}.pdf`, 'application/pdf', 'pdf');
        } catch (e: any) {
          if (e.name === 'AbortError') return;
        }
      } else if (selectedFormat === 'memory-training' || selectedFormat === 'memory-creative') {
        const mode = selectedFormat === 'memory-training' ? 'training' : 'creative';
        try {
          fileHandle = await showSaveDialog(`OneDuo_${mode}_memory_${safeTitle}.zip`, 'application/zip', 'zip');
        } catch (e: any) {
          if (e.name === 'AbortError') return;
        }
      }
    }

    setDownloading(true);
    setDownloadProgress(0);
    setDownloadStatus(`Preparing your OneDuo ${formatLabel}...`);

    try {
      await supabase.functions.invoke('log-download', {
        body: {
          courseId: module.course_id,
          moduleId: module.id,
          source: 'module_download'
        }
      });
    } catch (e) {
      console.log('[Download] Analytics tracking failed:', e);
    }

    try {
      if (selectedFormat === 'pdf') {
        const blob = await generateChatGPTPDF(
          {
            id: moduleId,
            title: moduleTitle,
            video_duration_seconds: module.video_duration_seconds,
            transcript: module.transcript || [],
            frame_urls: module.frame_urls || [],
            frame_analyses: (module as any).frame_analyses || [],
            audio_events: module.audio_events,
            prosody_annotations: module.prosody_annotations,
          },
          (progress, status) => {
            setDownloadProgress(progress);
            setDownloadStatus(status);
          },
          { aiFidelityMode: aiVisionMode, includeOCR: true }
        );
        await downloadPDF(blob, `OneDuo_${safeTitle}.pdf`, fileHandle);
      } else {
        const mode: ExportMode = selectedFormat === 'memory-training' ? 'training' : 'creative';
        const blob = await generateMemoryPackage(
          {
            title: moduleTitle,
            video_duration_seconds: module.video_duration_seconds,
            transcript: module.transcript || [],
            frame_urls: module.frame_urls || [],
            audio_events: module.audio_events,
            prosody_annotations: module.prosody_annotations,
          },
          mode,
          filmMode,
          (progress, status) => {
            setDownloadProgress(progress);
            setDownloadStatus(status);
          }
        );
        const filename = `OneDuo_${mode}_memory_${safeTitle}.zip`;
        if (fileHandle) {
          const writable = await (fileHandle as any).createWritable();
          await writable.write(blob);
          await writable.close();
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      }

      setDownloadComplete(true);
      toast.success(`Your OneDuo ${formatLabel} is downloading!`);
    } catch (err: any) {
      console.error("Download failed:", err);

      const isRetryable = err.message?.includes('network') ||
        err.message?.includes('timeout') ||
        err.message?.includes('fetch');

      if (isRetryable && retryCount < MAX_RETRIES) {
        console.log(`[Download] Retrying (${retryCount + 1}/${MAX_RETRIES})...`);
        setDownloadStatus(`Retrying download (attempt ${retryCount + 2})...`);
        await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
        return handleDownload(retryCount + 1);
      }

      const userMessage = err.message?.includes('Frame extraction failed')
        ? 'Frame extraction failed. Please contact support.'
        : err.message?.includes('Insufficient frames')
          ? 'Not enough frames extracted. Please retry or contact support.'
          : 'Failed to generate export. Please try again.';

      toast.error(userMessage);
      hasAutoTriggered.current = false;
    } finally {
      setDownloading(false);
    }
  };

  const handleChunkDownload = async (chunkIdx: number, totalDuration: number, chunkCount: number) => {
    if (!module) return;
    const startSeconds = chunkIdx * CHUNK_DURATION_SEC;
    const endSeconds = Math.min((chunkIdx + 1) * CHUNK_DURATION_SEC, totalDuration);
    const moduleTitle = `${module.courseTitle || 'Course'} - ${module.title}`;

    setDownloadingChunkIdx(chunkIdx);
    setDownloadProgress(0);
    setDownloadStatus(`Preparing Part ${chunkIdx + 1} of ${chunkCount}...`);

    try {
      const blob = await generateChatGPTPDF(
        {
          id: moduleId,
          title: moduleTitle,
          video_duration_seconds: module.video_duration_seconds,
          transcript: module.transcript || [],
          frame_urls: module.frame_urls || [],
          frame_analyses: (module as any).frame_analyses || [],
          audio_events: module.audio_events,
          prosody_annotations: module.prosody_annotations,
        },
        (progress, status) => {
          setDownloadProgress(progress);
          setDownloadStatus(status);
        },
        {
          aiFidelityMode: aiVisionMode,
          includeOCR: true,
          timeRange: { startSeconds, endSeconds },
        }
      );
      const partLabel = `Part_${chunkIdx + 1}_of_${chunkCount}`;
      downloadPDF(blob, `OneDuo_${moduleTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${partLabel}.pdf`);
      setCompletedChunks(prev => new Set([...prev, chunkIdx]));
      toast.success(`Part ${chunkIdx + 1} of ${chunkCount} downloaded!`);
    } catch (err: any) {
      console.error(`Chunk ${chunkIdx + 1} download failed:`, err);
      toast.error(`Failed to generate Part ${chunkIdx + 1}. Please retry.`);
    } finally {
      setDownloadingChunkIdx(null);
      setDownloadProgress(0);
      setDownloadStatus('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your module...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Module Not Available</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Link to="/dashboard">
            <Button>Go to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <h1 className="text-3xl font-bold text-primary">OneDuo</h1>
          </Link>
        </div>

        {/* Main Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
          {downloadComplete ? (
            // Success State
            <div className="text-center">
              <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="h-10 w-10 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Download Complete!</h2>
              <p className="text-muted-foreground mb-6">
                <span className="font-medium text-foreground">"{module?.title}"</span> has been downloaded.
              </p>

              <div className="space-y-3">
                <Button onClick={() => handleDownload()} variant="outline" className="w-full">
                  <DownloadIcon className="h-4 w-4 mr-2" />
                  Download Again
                </Button>

                <Link to={`/chat/${module?.course_id}`} className="block">
                  <Button className="w-full">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Chat With Your Course
                  </Button>
                </Link>
              </div>
            </div>
          ) : !preloadComplete ? (
            // Preloading State
            <div className="text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Preparing Your Download</h2>
              <p className="text-muted-foreground mb-6">Caching frames for faster PDF generation...</p>

              {/* Preload Progress Bar */}
              <div className="w-full bg-secondary rounded-full h-3 mb-2">
                <div
                  className="bg-primary h-3 rounded-full transition-all duration-300"
                  style={{ width: `${preloadProgress}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground">{preloadProgress}% cached</p>
            </div>
          ) : downloading ? (
            // Downloading State
            <div className="text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Generating Your PDF</h2>
              <p className="text-muted-foreground mb-6">{downloadStatus}</p>

              {/* Progress Bar */}
              <div className="w-full bg-secondary rounded-full h-3 mb-2">
                <div
                  className="bg-primary h-3 rounded-full transition-all duration-300"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground">{Math.round(downloadProgress)}%</p>
            </div>
          ) : (
            // Ready State - Format Selection
            <div className="text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <FileText className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Module {module?.moduleNumber} Ready</h2>
              <p className="text-muted-foreground mb-6">
                <span className="font-medium text-foreground">"{module?.title}"</span>
              </p>

              {/* Format Selection */}
              <div className="space-y-2 mb-6">
                <label className="text-sm font-medium text-left block">Export Format</label>
                <div className="grid gap-2">
                  <button
                    onClick={() => setSelectedFormat('pdf')}
                    className={`p-3 rounded-lg border text-left transition-all ${selectedFormat === 'pdf'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-medium">Standard PDF</div>
                        <div className="text-xs text-muted-foreground">High-quality document for human reading</div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setSelectedFormat('memory-training')}
                    className={`p-3 rounded-lg border text-left transition-all ${selectedFormat === 'memory-training'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <Package className="h-5 w-5 text-green-500" />
                      <div>
                        <div className="font-medium">AI Memory — Training Mode</div>
                        <div className="text-xs text-muted-foreground">Operator's Manual for VAs & execution</div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setSelectedFormat('memory-creative')}
                    className={`p-3 rounded-lg border text-left transition-all ${selectedFormat === 'memory-creative'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <Film className="h-5 w-5 text-purple-500" />
                      <div>
                        <div className="font-medium">AI Memory — Creative Mode</div>
                        <div className="text-xs text-muted-foreground">Director's Cut for screenwriting & emotion</div>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Film Mode Toggle (only for Creative) */}
                {selectedFormat === 'memory-creative' && (
                  <div className="mt-3 p-3 rounded-lg bg-secondary/50">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filmMode}
                        onChange={(e) => setFilmMode(e.target.checked)}
                        className="rounded border-border"
                      />
                      <div>
                        <div className="text-sm font-medium">Enable Film Mode</div>
                        <div className="text-xs text-muted-foreground">Adds gaze analysis & dialogue timing</div>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              {(() => {
                const totalDuration = module?.video_duration_seconds || 0;
                const isLongVideo = totalDuration > CHUNK_DURATION_SEC;
                const chunkCount = isLongVideo ? Math.ceil(totalDuration / CHUNK_DURATION_SEC) : 1;
                const formatTime = (s: number) => {
                  const h = Math.floor(s / 3600);
                  const m = Math.floor((s % 3600) / 60);
                  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:00` : `${m}:00`;
                };
                return isLongVideo && selectedFormat === 'pdf' ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-left text-muted-foreground">
                      {chunkCount} parts · 60 min each — click each to download
                    </p>
                    {Array.from({ length: chunkCount }, (_, i) => {
                      const start = i * CHUNK_DURATION_SEC;
                      const end = Math.min((i + 1) * CHUNK_DURATION_SEC, totalDuration);
                      const isCompleted = completedChunks.has(i);
                      const isDownloadingThis = downloadingChunkIdx === i;
                      return (
                        <Button
                          key={i}
                          onClick={() => handleChunkDownload(i, totalDuration, chunkCount)}
                          disabled={downloadingChunkIdx !== null}
                          variant={isCompleted ? 'outline' : 'default'}
                          className="w-full justify-between"
                        >
                          <span className="flex items-center gap-2">
                            {isCompleted
                              ? <CheckCircle className="h-4 w-4 text-green-500" />
                              : isDownloadingThis
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <DownloadIcon className="h-4 w-4" />}
                            Part {i + 1} &nbsp;
                            <span className="text-xs opacity-70">{formatTime(start)} – {formatTime(end)}</span>
                          </span>
                          {isDownloadingThis && (
                            <span className="text-xs opacity-70">{Math.round(downloadProgress)}%</span>
                          )}
                        </Button>
                      );
                    })}
                    {downloadingChunkIdx !== null && (
                      <p className="text-xs text-muted-foreground text-center mt-2">{downloadStatus}</p>
                    )}
                  </div>
                ) : (
                  <Button onClick={() => handleDownload()} size="lg" className="w-full text-lg py-6">
                    <DownloadIcon className="h-5 w-5 mr-2" />
                    {selectedFormat === 'pdf' ? 'Download PDF' : 'Download Memory Package'}
                  </Button>
                );
              })()}

              <p className="text-xs text-muted-foreground mt-4">
                {selectedFormat === 'pdf'
                  ? (module?.video_duration_seconds || 0) > CHUNK_DURATION_SEC
                    ? `${Math.ceil((module?.video_duration_seconds || 0) / CHUNK_DURATION_SEC)} PDFs · each covers 60 min · all frames included`
                    : 'Your PDF includes all frames, transcripts, and AI instructions'
                  : 'ZIP includes memory.json, keyframes, transcript, and README'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          Powered by <Link to="/" className="text-primary hover:underline">OneDuo</Link>
        </p>
      </div>
    </div>
  );
};

export default DownloadModulePage;
