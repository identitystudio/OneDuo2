import { useState, useEffect, useRef } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Download as DownloadIcon, CheckCircle, Loader2, FileText, MessageSquare, AlertCircle, Package, Film, Layers, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateChatGPTPDF } from "@/lib/pdfExporter";
import { generateMemoryPackage, ExportMode } from "@/lib/memoryExporter";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthGuard";

type ExportFormat = 'pdf' | 'memory-training' | 'memory-creative';

interface CourseData {
  id: string;
  title: string;
  video_duration_seconds?: number;
  transcript?: any[];
  frame_urls?: string[];
  status: string;
  audio_events?: any;
  prosody_annotations?: any;
  is_multi_module?: boolean;
  module_count?: number;
}

interface ModuleData {
  id: string;
  title: string;
  moduleNumber: number;
  courseTitle?: string;
  video_duration_seconds?: number;
  transcript?: any[];
  frame_urls?: string[];
  audio_events?: any;
  prosody_annotations?: any;
  status: string;
}

const DownloadPage = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const [searchParams] = useSearchParams();
  const moduleParam = searchParams.get('module');
  const salvageMode = searchParams.get('salvage') === 'true';
  
  const { user } = useAuth();
  const userEmail = user?.email;
  
  const [course, setCourse] = useState<CourseData | null>(null);
  const [module, setModule] = useState<ModuleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState("");
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  const [filmMode, setFilmMode] = useState(false);
  const [isPartial, setIsPartial] = useState(false);
  const [noDataAvailable, setNoDataAvailable] = useState(false);
  const hasAutoTriggered = useRef(false);

  useEffect(() => {
    if (!courseId) {
      setError("No course ID provided");
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        // SALVAGE PATH: If user is logged in and salvage mode or course is not completed,
        // use get-export-data endpoint which works for partial/failed courses
        if (userEmail && salvageMode) {
          console.log(`[Download] Using salvage path for course ${courseId}`);
          
          const moduleNumber = moduleParam ? parseInt(moduleParam, 10) : undefined;
          const { data, error: fetchError } = await supabase.functions.invoke('process-course', {
            body: { 
              action: 'get-export-data',
              courseId,
              email: userEmail,
              moduleNumber
            }
          });

          if (fetchError) throw new Error(fetchError.message);
          if (data.error) throw new Error(data.error);

          setIsPartial(data.isPartial);
          
          // Check if there's any data to export
          if (!data.hasTranscript && !data.hasFrames) {
            setNoDataAvailable(true);
            setLoading(false);
            return;
          }

          if (data.module) {
            setModule(data.module);
            setCourse({ 
              id: courseId, 
              title: data.module.courseTitle, 
              status: data.module.status,
              is_multi_module: true 
            });
          } else if (data.course) {
            setCourse({
              ...data.course,
              is_multi_module: data.is_multi_module
            });
          }
          setLoading(false);
          return;
        }

        // Standard path: If a specific module is requested via query param
        if (moduleParam) {
          const moduleNumber = parseInt(moduleParam, 10);
          console.log(`[Download] Fetching module ${moduleNumber} for course ${courseId}`);
          
          const { data, error: fetchError } = await supabase.functions.invoke('get-module-data', {
            body: { courseId, moduleNumber }
          });

          if (fetchError) throw new Error(fetchError.message);
          if (data.error) throw new Error(data.error);

          setModule(data.module);
          setCourse({ 
            id: courseId, 
            title: data.module.courseTitle, 
            status: 'completed',
            is_multi_module: true 
          });
        } else {
          // Try the public endpoint for course data
          const { data, error: fetchError } = await supabase.functions.invoke('get-public-course', {
            body: { courseId }
          });

          if (fetchError) throw new Error(fetchError.message);
          if (data.error) throw new Error(data.error);

          // Check if this is a multi-module course without frame data
          const isMultiModule = data.course.is_multi_module || 
            (!data.course.frame_urls || data.course.frame_urls.length === 0);
          
          if (isMultiModule && !data.course.frame_urls?.length) {
            // For multi-module courses, we need to fetch module data
            // Try to get the first module's data
            console.log(`[Download] Multi-module course detected, fetching module 1`);
            
            const { data: moduleData, error: moduleError } = await supabase.functions.invoke('get-module-data', {
              body: { courseId, moduleNumber: 1 }
            });

            if (!moduleError && moduleData.module) {
              setModule(moduleData.module);
            }
          }
          
          setCourse({
            ...data.course,
            is_multi_module: isMultiModule
          });
        }
      } catch (err: any) {
        console.error("Failed to fetch course:", err);
        // If standard path fails and user is logged in, suggest salvage mode
        if (userEmail && !salvageMode) {
          setError(`${err.message || "Course not found"}. Try using the salvage download option.`);
        } else {
          setError(err.message || "Course not found or not yet ready");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [courseId, moduleParam, userEmail, salvageMode]);

  // Auto-trigger download when data loads
  useEffect(() => {
    const hasData = module || (course && course.frame_urls?.length);
    if (hasData && !hasAutoTriggered.current && !downloading && !downloadComplete) {
      hasAutoTriggered.current = true;
      handleDownload();
    }
  }, [course, module]);

  const handleDownload = async () => {
    // Use module data if available, otherwise course data
    const downloadData = module || course;
    if (!downloadData) return;

    setDownloading(true);
    setDownloadProgress(0);
    
    const formatLabel = selectedFormat === 'pdf' ? 'PDF' : 
      selectedFormat === 'memory-training' ? 'Training Memory Package' : 'Creative Memory Package';
    setDownloadStatus(`Preparing your OneDuo ${formatLabel}...`);

    // Track download
    try {
      await supabase.functions.invoke('log-download', {
        body: { 
          courseId: courseId, 
          moduleId: module?.id,
          source: module ? 'module_download' : 'dashboard' 
        }
      });
    } catch (e) {
      console.log('[Download] Analytics tracking failed:', e);
    }

    try {
      let blob: Blob;
      let filename: string;

      const title = module 
        ? `${course?.title || 'Course'} - ${module.title}`
        : course?.title || 'OneDuo';

      const dataForExport = {
        id: module?.id || courseId, // Required for frame persistence
        title,
        video_duration_seconds: module?.video_duration_seconds || course?.video_duration_seconds,
        transcript: module?.transcript || course?.transcript || [],
        frame_urls: module?.frame_urls || course?.frame_urls || [],
        audio_events: module?.audio_events || course?.audio_events,
        prosody_annotations: module?.prosody_annotations || course?.prosody_annotations,
      };

      if (selectedFormat === 'pdf') {
        blob = await generateChatGPTPDF(
          dataForExport,
          (progress, status) => {
            setDownloadProgress(progress);
            setDownloadStatus(status);
          }
        );
        filename = `OneDuo_${title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
      } else {
        const mode: ExportMode = selectedFormat === 'memory-training' ? 'training' : 'creative';
        blob = await generateMemoryPackage(
          dataForExport,
          mode,
          filmMode,
          (progress, status) => {
            setDownloadProgress(progress);
            setDownloadStatus(status);
          }
        );
        filename = `OneDuo_${mode}_memory_${title.replace(/[^a-zA-Z0-9]/g, "_")}.zip`;
      }

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloadComplete(true);
      toast.success(`Your OneDuo ${formatLabel} is downloading!`);
    } catch (err: any) {
      console.error("Download failed:", err);
      toast.error("Failed to generate export. Please try again.");
      hasAutoTriggered.current = false;
    } finally {
      setDownloading(false);
    }
  };

  // Handle no data available state
  if (noDataAvailable) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Loader2 className="h-10 w-10 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Still Preparing Your Data</h1>
          <p className="text-muted-foreground mb-6">
            Your video is still being processed. We haven't extracted any frames or transcripts yet.
          </p>
          <div className="space-y-3">
            <Button onClick={() => window.location.reload()} variant="outline" className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              Check Again
            </Button>
            <Link to="/dashboard">
              <Button className="w-full">
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your OneDuo...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Course Not Available</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Link to="/">
            <Button>Go to Homepage</Button>
          </Link>
        </div>
      </div>
    );
  }

  const displayTitle = module 
    ? `${module.title}` 
    : course?.title;

  const displaySubtitle = module && course 
    ? `Module ${module.moduleNumber} of ${course.title}` 
    : null;

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
              <p className="text-muted-foreground mb-2">
                <span className="font-medium text-foreground">"{displayTitle}"</span> has been downloaded.
              </p>
              {displaySubtitle && (
                <p className="text-sm text-muted-foreground mb-6">{displaySubtitle}</p>
              )}

              <div className="space-y-3">
                <Button onClick={handleDownload} variant="outline" className="w-full">
                  <DownloadIcon className="h-4 w-4 mr-2" />
                  Download Again
                </Button>

                <Link to={`/chat/${courseId}`} className="block">
                  <Button className="w-full">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Chat With Your Course
                  </Button>
                </Link>
              </div>
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
              <div className={`w-20 h-20 ${isPartial ? 'bg-amber-500/10' : 'bg-primary/10'} rounded-full flex items-center justify-center mx-auto mb-6`}>
                {module ? <Layers className={`h-10 w-10 ${isPartial ? 'text-amber-500' : 'text-primary'}`} /> : <FileText className={`h-10 w-10 ${isPartial ? 'text-amber-500' : 'text-primary'}`} />}
              </div>
              <h2 className="text-2xl font-bold mb-2">
                {isPartial 
                  ? 'Partial Data Available' 
                  : module 
                    ? `Module ${module.moduleNumber} Ready` 
                    : 'Your OneDuo is Ready'}
              </h2>
              <p className="text-muted-foreground mb-2">
                <span className="font-medium text-foreground">"{displayTitle}"</span>
              </p>
              {displaySubtitle && (
                <p className="text-sm text-muted-foreground mb-4">{displaySubtitle}</p>
              )}
              
              {/* Partial Data Warning */}
              {isPartial && (
                <div className="mb-6 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-left">
                  <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">⚠️ Salvage Mode</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Processing didn't complete fully. Some frames or transcript content may be missing from your export.
                  </p>
                </div>
              )}

              {/* Format Selection */}
              <div className="space-y-2 mb-6">
                <label className="text-sm font-medium text-left block">Export Format</label>
                <div className="grid gap-2">
                  <button
                    onClick={() => setSelectedFormat('pdf')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      selectedFormat === 'pdf' 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-medium">PDF Only</div>
                        <div className="text-xs text-muted-foreground">Traditional document format</div>
                      </div>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => setSelectedFormat('memory-training')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      selectedFormat === 'memory-training' 
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
                    className={`p-3 rounded-lg border text-left transition-all ${
                      selectedFormat === 'memory-creative' 
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

              <Button onClick={handleDownload} size="lg" className="w-full text-lg py-6">
                <DownloadIcon className="h-5 w-5 mr-2" />
                {selectedFormat === 'pdf' ? 'Download PDF' : 'Download Memory Package'}
              </Button>

              <p className="text-xs text-muted-foreground mt-4">
                {selectedFormat === 'pdf' 
                  ? 'Your PDF includes all frames, transcripts, and AI instructions'
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

export default DownloadPage;
