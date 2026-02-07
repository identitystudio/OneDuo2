import { useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, ArrowRight, X, Download, Play, Pause, Check, Sparkles, Loader2, Link as LinkIcon, Save, Mail, CreditCard } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { ProcessingStages, ProcessingStage } from '@/components/ProcessingStages';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useGifGenerator } from '@/hooks/useGifGenerator';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface GifResult {
  url: string;
  name: string;
  keyframeUrl?: string; // Static PNG keyframe for AI fallback
}

interface GifSegmentData {
  frames: string[];
  startTime: number;
  endTime: number;
}

interface TranscriptSegment {
  start: number;
  end?: number;
  text: string;
}

type InputMode = 'upload' | 'gdrive';
type SaveFlowStep = 'idle' | 'email' | 'payment' | 'success';

const LARGE_FILE_THRESHOLD = 2 * 1024 * 1024 * 1024; // 2GB in bytes

export default function Soundboard() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { generateGifsFromSegments, isGenerating, generationProgress } = useGifGenerator();
  
  const [inputMode, setInputMode] = useState<InputMode>('upload');
  const [gdriveUrl, setGdriveUrl] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState<ProcessingStage>('idle');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoName, setVideoName] = useState<string>('');
  const [processingStartTime, setProcessingStartTime] = useState<Date | null>(null);
  const [videoDurationSeconds, setVideoDurationSeconds] = useState<number | undefined>(undefined);

  // Save to Dashboard flow states
  const [saveFlowStep, setSaveFlowStep] = useState<SaveFlowStep>('idle');
  const [saveEmail, setSaveEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [processingEmail, setProcessingEmail] = useState<string | undefined>(undefined);
  
  // Processing signup prompt
  const [showSignupPrompt, setShowSignupPrompt] = useState(false);
  const [signupPromptDismissed, setSignupPromptDismissed] = useState(false);

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  const isValidGoogleDriveUrl = (url: string): boolean => {
    return url.includes('drive.google.com') || url.includes('drive.usercontent.google.com');
  };

  const handleFileSelect = useCallback((file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File too large. Maximum size is 50MB. Use a Google Drive link for larger files.');
      return;
    }

    if (!file.type.startsWith('video/')) {
      toast.error('Please select a video file.');
      return;
    }

    setVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
    setVideoName(file.name.replace(/\.[^/.]+$/, ''));
    setGifs([]);
    setCourseId(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Helper to determine stage from course status
  const getStageFromStatus = (status: string, courseProgress: number): ProcessingStage => {
    if (status === 'completed') return 'complete';
    if (status === 'transcribing') return 'transcribing';
    if (status === 'extracting_frames') return 'extracting';
    if (status === 'rendering_gifs' || status === 'generating_ai') return 'generating';
    if (courseProgress < 20) return 'uploading';
    if (courseProgress < 40) return 'transcribing';
    if (courseProgress < 70) return 'extracting';
    return 'generating';
  };

  const processVideo = async () => {
    // Determine the video source
    const isGdriveMode = inputMode === 'gdrive';
    
    if (!isGdriveMode && !videoFile) return;
    if (isGdriveMode && !gdriveUrl.trim()) {
      toast.error('Please enter a Google Drive link');
      return;
    }
    if (isGdriveMode && !isValidGoogleDriveUrl(gdriveUrl)) {
      toast.error('Please enter a valid Google Drive link');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setProcessingStage('uploading');
    setProcessingStartTime(new Date());
    setVideoDurationSeconds(undefined);
    
    // Show signup prompt after 3 seconds if not dismissed
    if (!signupPromptDismissed) {
      setTimeout(() => {
        setShowSignupPrompt(true);
      }, 3000);
    }

    try {
      let publicUrl: string;
      let courseName: string;

      if (isGdriveMode) {
        // For Google Drive, we pass the URL directly - backend will resolve it
        publicUrl = gdriveUrl.trim();
        // Extract a name from the URL or use a default
        courseName = videoName.trim() || `gdrive-video-${Date.now()}`;
        setProgress(10);
      } else {
        // Upload to storage
        const fileName = `soundboard/${Date.now()}-${videoFile!.name}`;
        const { error: uploadError } = await supabase.storage
          .from('course-videos')
          .upload(fileName, videoFile!);

        if (uploadError) throw uploadError;

        setProgress(20);

        // Get public URL
        const { data: { publicUrl: storageUrl } } = supabase.storage
          .from('course-videos')
          .getPublicUrl(fileName);
        
        publicUrl = storageUrl;
        courseName = videoFile!.name.replace(/\.[^/.]+$/, '');
      }

      setProcessingStage('transcribing');

      // Use a stable email identifier (required for secure status/result reads)
      const existingEmail = localStorage.getItem('courseagent_email');
      const soundboardEmail = existingEmail || `soundboard+${crypto.randomUUID()}@temp.com`;
      if (!existingEmail) localStorage.setItem('courseagent_email', soundboardEmail);
      
      // Track the email for UI display (only show if it's a real email, not temp)
      if (existingEmail && !existingEmail.includes('@temp.com')) {
        setProcessingEmail(existingEmail);
      }

      // Create + queue processing via backend function (avoids RLS issues)
      const { data: createData, error: createError } = await supabase.functions.invoke('process-course', {
        body: {
          action: 'create-course',
          email: soundboardEmail,
          title: courseName,
          videoUrl: publicUrl,
          densityMode: 'standard',
        },
      });

      if (createError) throw createError;
      if (!createData?.success || !createData?.courseId) {
        throw new Error(createData?.error || 'Failed to start processing');
      }

      setCourseId(createData.courseId);
      setProgress(30);

      // Poll for completion + results
      let attempts = 0;
      const maxAttempts = 2160; // 3 hours max for very long videos (6+ hours)

      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 5000));

        const { data: updatedCourse, error: fetchError } = await supabase.functions.invoke('process-course', {
          body: { action: 'get-course', courseId: createData.courseId, email: soundboardEmail },
        });

        if (fetchError) throw fetchError;

        if (updatedCourse.status === 'completed') {
          setProgress(90);
          setProcessingStage('generating');

          // Get gif segment data from gif_storage_paths (contains frame arrays for client-side generation)
          const gifSegments = updatedCourse.gif_storage_paths;
          const transcript = updatedCourse.transcript as TranscriptSegment[] | undefined;
          const videoDuration = updatedCourse.video_duration_seconds || 0;
          const safeName = courseName.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 20);
          
          // Check if gif_storage_paths contains the new segment format or old URL format
          if (Array.isArray(gifSegments) && gifSegments.length > 0) {
            // Check if first item is a segment object (new format) or a URL string (old format)
            const firstItem = gifSegments[0];
            
            if (typeof firstItem === 'object' && firstItem.frames) {
              // New format: generate GIFs client-side from frame segments with captions
              // Pass video duration for dynamic resolution sizing
              toast.info('Creating optimized GIFs with captions for AI readability...');
              
              const generatedGifs = await generateGifsFromSegments(
                gifSegments as GifSegmentData[],
                safeName,
                transcript,
                videoDuration // Pass duration for dynamic width
              );
              
              // Map generated GIFs including keyframes
              setGifs(generatedGifs.map(g => ({ 
                url: g.url, 
                name: g.name,
                keyframeUrl: g.keyframeUrl 
              })));
              setProgress(100);
              setProcessingStage('complete');
              
              const hasKeyframes = generatedGifs.some(g => g.keyframeUrl);
              toast.success(`Created ${generatedGifs.length} captioned GIFs${hasKeyframes ? ' with keyframes' : ''}! Upload to ChatGPT, Claude, or Poe.`);
            } else if (typeof firstItem === 'string') {
              // Old format: URLs are already GIFs
              const visuals: GifResult[] = gifSegments.map((url: string, index: number) => ({
                url,
                name: `${safeName}-part${index + 1}.gif`,
              }));
              setGifs(visuals);
              setProgress(100);
              setProcessingStage('complete');
              toast.success(`Created ${visuals.length} animated GIFs! Download and upload to ChatGPT or Claude.`);
            }
          }
          break;
        }

        if (updatedCourse.status === 'failed') {
          throw new Error(updatedCourse.error_message || 'Processing failed');
        }

        const courseProgress = updatedCourse.progress || 0;
        setProgress(30 + (courseProgress * 0.7));
        setProcessingStage(getStageFromStatus(updatedCourse.status, courseProgress));
        
        // Update video duration if available from backend
        if (updatedCourse.video_duration_seconds && !videoDurationSeconds) {
          setVideoDurationSeconds(updatedCourse.video_duration_seconds);
        }

        attempts++;
      }

      if (attempts >= maxAttempts) {
        throw new Error('Processing timed out. Maximum supported video length is 6 hours. Please contact support if you need longer.');
      }

    } catch (err) {
      console.error('Processing error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to process video');
      setProcessingStage('idle');
    } finally {
      setIsProcessing(false);
      setShowSignupPrompt(false);
    }
  };

  const downloadGif = async (gif: GifResult) => {
    try {
      const response = await fetch(gif.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = gif.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${gif.name}`);
    } catch (err) {
      toast.error('Failed to download GIF');
    }
  };

  const downloadAllGifs = async () => {
    toast.info(`Downloading ${gifs.length} GIFs...`);
    for (const gif of gifs) {
      await downloadGif(gif);
      await new Promise(r => setTimeout(r, 500)); // Small delay between downloads
    }
    toast.success('All GIFs downloaded!');
  };

  const clearVideo = () => {
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setGdriveUrl('');
    setVideoName('');
    setGifs([]);
    setCourseId(null);
    setProgress(0);
    setProcessingStage('idle');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Save to Dashboard flow
  const handleSaveToDashboard = () => {
    // Check if user already has an email saved
    const existingEmail = localStorage.getItem('courseagent_email');
    if (existingEmail && !existingEmail.includes('@temp.com')) {
      setSaveEmail(existingEmail);
      // Skip to payment if they already have a real email
      setSaveFlowStep('payment');
    } else {
      setSaveFlowStep('email');
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!saveEmail.trim() || !saveEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsSaving(true);
    try {
      // Save email to localStorage and update course
      localStorage.setItem('courseagent_email', saveEmail);
      
      // Move to payment step
      setSaveFlowStep('payment');
    } catch (err) {
      toast.error('Failed to save email');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePayment = async (plan: 'monthly' | 'yearly') => {
    setIsSaving(true);
    try {
      // Create mock order for now (replace with real Stripe integration)
      const { error } = await supabase.from('mock_orders').insert({
        email: saveEmail,
        plan: plan,
        amount: plan === 'monthly' ? 1900 : 15900, // $19/mo or $159/year
      });

      if (error) throw error;

      // Update the course email to the real email
      if (courseId) {
        await supabase.functions.invoke('process-course', {
          body: {
            action: 'get-course',
            courseId,
            email: saveEmail,
          },
        });
      }

      setSaveFlowStep('success');
      toast.success('Welcome! Your dashboard is ready.');
      
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (err) {
      console.error('Payment error:', err);
      toast.error('Payment failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#030303] text-white overflow-hidden">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] rounded-full bg-gradient-to-b from-purple-500/20 via-purple-500/5 to-transparent blur-3xl" />
        <div className="absolute top-[30%] right-[-10%] w-[600px] h-[600px] rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-4 mt-4 md:mx-8 md:mt-6">
          <div className="max-w-[1400px] mx-auto px-6 py-4 rounded-2xl bg-white/[0.03] backdrop-blur-2xl border border-white/[0.06]">
            <div className="flex items-center justify-between">
              <Link to="/">
                <Logo size="md" animated />
              </Link>
              <div className="flex items-center gap-3">
                <Link to="/pricing" className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/60 hover:text-white transition-colors">
                  Pricing
                </Link>
                <Link to="/dashboard">
                  <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                    Dashboard
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 pt-32 pb-20 px-6">
        <div className="max-w-[900px] mx-auto">
          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 mb-6">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-purple-300">AI GIF Tool</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              <span className="text-white">Turn Video Into</span>
              <br />
              <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                Visual Conversation Starters
              </span>
            </h1>
            <p className="text-lg text-white/50 max-w-[600px] mx-auto">
              Upload a video under 50MB, or paste a Google Drive link for larger files.
              We'll extract visual GIFs for ChatGPT, Claude, or any AI.
            </p>
            <p className="text-sm text-white/30 mt-2">
              💡 For videos over 2GB, compress with{' '}
              <a 
                href="https://handbrake.fr" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 underline"
              >
                Handbrake
              </a>{' '}
              first for faster processing.
            </p>
          </motion.div>

          {/* Upload Area */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8"
          >
            {!videoFile && (!gdriveUrl || inputMode === 'gdrive') && !isProcessing && gifs.length === 0 ? (
              <div className="space-y-4">
                {/* Mode Toggle */}
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => setInputMode('upload')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      inputMode === 'upload'
                        ? 'bg-purple-500/20 border border-purple-500/50 text-purple-300'
                        : 'bg-white/[0.02] border border-white/10 text-white/50 hover:text-white/80'
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    Upload File
                  </button>
                  <button
                    onClick={() => setInputMode('gdrive')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      inputMode === 'gdrive'
                        ? 'bg-purple-500/20 border border-purple-500/50 text-purple-300'
                        : 'bg-white/[0.02] border border-white/10 text-white/50 hover:text-white/80'
                    }`}
                  >
                    <LinkIcon className="w-4 h-4" />
                    Google Drive Link
                  </button>
                </div>

                {inputMode === 'upload' ? (
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                    className="relative group cursor-pointer"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative border-2 border-dashed border-white/20 hover:border-purple-500/50 rounded-3xl p-16 text-center transition-all bg-white/[0.02]">
                      <Upload className="w-12 h-12 text-white/40 mx-auto mb-4" />
                      <p className="text-xl font-medium text-white/80 mb-2">
                        Drop your video here
                      </p>
                      <p className="text-white/40">or click to browse • Max 50MB</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*"
                      onChange={handleInputChange}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="relative rounded-3xl overflow-hidden bg-white/[0.02] border border-white/10 p-8">
                    <div className="max-w-xl mx-auto space-y-4">
                      <div className="text-center mb-6">
                        <LinkIcon className="w-12 h-12 text-white/40 mx-auto mb-4" />
                        <p className="text-xl font-medium text-white/80 mb-2">
                          Paste Google Drive Link
                        </p>
                        <p className="text-white/40 text-sm">
                          Make sure your file is set to "Anyone with the link can view"
                        </p>
                      </div>
                      <Input
                        type="url"
                        placeholder="https://drive.google.com/file/d/..."
                        value={gdriveUrl}
                        onChange={(e) => setGdriveUrl(e.target.value)}
                        className="bg-white/[0.05] border-white/20 text-white placeholder:text-white/30 h-12 text-center"
                      />
                      <Input
                        type="text"
                        placeholder="Video name (optional)"
                        value={videoName}
                        onChange={(e) => setVideoName(e.target.value)}
                        className="bg-white/[0.05] border-white/20 text-white placeholder:text-white/30 h-12 text-center"
                      />
                      <Button
                        onClick={processVideo}
                        disabled={!gdriveUrl.trim() || !isValidGoogleDriveUrl(gdriveUrl) || isProcessing}
                        className="w-full bg-gradient-to-r from-purple-500 to-cyan-500 text-white hover:opacity-90 h-12"
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Process Video
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : videoFile ? (
              <div className="relative rounded-3xl overflow-hidden bg-white/[0.02] border border-white/10">
                {/* Video Preview */}
                <div className="relative aspect-video bg-black">
                  <video
                    ref={videoRef}
                    src={videoPreviewUrl || undefined}
                    className="w-full h-full object-contain"
                    onEnded={() => setIsPlaying(false)}
                  />
                  <button
                    onClick={togglePlayPause}
                    className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
                  >
                    {isPlaying ? (
                      <Pause className="w-16 h-16 text-white/80" />
                    ) : (
                      <Play className="w-16 h-16 text-white/80" />
                    )}
                  </button>
                  <button
                    onClick={clearVideo}
                    className="absolute top-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>

                {/* File Info & Actions */}
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-medium text-white">{videoFile.name}</p>
                      <p className="text-sm text-white/40">
                        {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                      </p>
                    </div>
                    {!isProcessing && gifs.length === 0 && (
                      <Button
                        onClick={processVideo}
                        className="bg-gradient-to-r from-purple-500 to-cyan-500 text-white hover:opacity-90"
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        Process Video
                      </Button>
                    )}
                  </div>

                  {/* Progress */}
                  {(isProcessing || processingStage === 'complete') && (
                    <ProcessingStages 
                      currentStage={processingStage} 
                      progress={progress}
                      videoDurationSeconds={videoDurationSeconds}
                      startTime={processingStartTime || undefined}
                      userEmail={processingEmail}
                    />
                  )}

                  {/* Success state */}
                  {gifs.length > 0 && !isProcessing && (
                    <div className="flex items-center gap-2 text-sm text-green-400 mt-4">
                      <Check className="w-4 h-4" />
                      Your visuals are ready to download!
                    </div>
                  )}
                </div>
              </div>
            ) : gdriveUrl && isProcessing ? (
              <div className="relative rounded-3xl overflow-hidden bg-white/[0.02] border border-white/10 p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                    <LinkIcon className="w-6 h-6 text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-white">{videoName || 'Google Drive Video'}</p>
                    <p className="text-sm text-white/40">Processing from Google Drive...</p>
                  </div>
                  <button
                    onClick={clearVideo}
                    className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <X className="w-5 h-5 text-white/60" />
                  </button>
                </div>
                <ProcessingStages 
                  currentStage={processingStage} 
                  progress={progress}
                  videoDurationSeconds={videoDurationSeconds}
                  startTime={processingStartTime || undefined}
                  userEmail={processingEmail}
                />
                {gifs.length > 0 && !isProcessing && (
                  <div className="flex items-center gap-2 text-sm text-green-400 mt-4">
                    <Check className="w-4 h-4" />
                    Your visuals are ready to download!
                  </div>
                )}
              </div>
            ) : null}
          </motion.div>

          {/* GIF Results */}
          {gifs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <h2 className="text-xl font-semibold">
                  Your GIFs ({gifs.length})
                </h2>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={downloadAllGifs}
                    variant="outline"
                    className="border-purple-500/50 text-purple-300 hover:bg-purple-500/10"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download All
                  </Button>
                  <Button
                    onClick={handleSaveToDashboard}
                    className="bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:opacity-90"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save to Dashboard
                  </Button>
                </div>
              </div>

              {/* GIF Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {gifs.map((gif, index) => (
                  <div
                    key={index}
                    className="relative group rounded-xl overflow-hidden bg-white/[0.02] border border-white/10"
                  >
                    <img
                      src={gif.url}
                      alt={gif.name}
                      className="w-full aspect-video object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button
                        onClick={() => downloadGif(gif)}
                        size="sm"
                        className="bg-white text-black hover:bg-white/90"
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                    </div>
                    <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/70 text-xs text-white/80">
                      {gif.name}
                    </div>
                  </div>
                ))}
              </div>

              {/* Instructions */}
              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10">
                <h3 className="font-medium text-white mb-3">How to use with ChatGPT or Claude:</h3>
                <ol className="space-y-2 text-white/60 text-sm">
                  <li>1. Download the GIFs above</li>
                  <li>2. Open ChatGPT (GPT-4o) or Claude</li>
                  <li>3. Upload the GIFs to your conversation</li>
                  <li>4. Ask questions about what you see - AI meets your visual content!</li>
                </ol>
              </div>

              {/* Chat CTA */}
              {courseId && (
                <div className="text-center pt-4">
                  <p className="text-white/50 mb-4">
                    Or chat with this video directly in SeeVAdone:
                  </p>
                  <Button
                    onClick={() => navigate(`/chat/${courseId}`)}
                    className="bg-gradient-to-r from-cyan-500 to-cyan-400 text-black"
                  >
                    Chat With This Video
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative py-12 px-6 border-t border-white/[0.06]">
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Logo size="sm" />
          <div className="flex items-center gap-8">
            <Link to="/pricing" className="text-sm text-white/40 hover:text-white/80 transition-colors">Pricing</Link>
            <Link to="/" className="text-sm text-white/40 hover:text-white/80 transition-colors">Home</Link>
          </div>
          <p className="text-sm text-white/30">
            © 2024 SeeVAdone. All rights reserved.
          </p>
        </div>
      </footer>

      {/* Signup Prompt During Processing */}
      <Dialog 
        open={showSignupPrompt && isProcessing} 
        onOpenChange={(open) => {
          if (!open) {
            setShowSignupPrompt(false);
            setSignupPromptDismissed(true);
          }
        }}
      >
        <DialogContent className="bg-[#0a0a0a] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Create a Free Account
            </DialogTitle>
            <DialogDescription className="text-white/60">
              We'll keep processing your video in the background. You can close this tab and come back anytime!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="p-4 rounded-xl border border-green-500/20 bg-green-500/5">
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-green-400 mt-0.5" />
                <div>
                  <p className="font-medium text-white">Processing continues on our servers</p>
                  <p className="text-sm text-white/50 mt-1">
                    Feel free to close this tab. Your GIFs will be ready when you return.
                  </p>
                </div>
              </div>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const email = (e.target as HTMLFormElement).email.value;
              if (email && email.includes('@')) {
                localStorage.setItem('courseagent_email', email);
                setShowSignupPrompt(false);
                setSignupPromptDismissed(true);
                toast.success('Email saved! We\'ll keep your GIFs safe.');
              }
            }} className="space-y-3">
              <Input
                name="email"
                type="email"
                placeholder="your@email.com"
                className="bg-white/5 border-white/20 text-white placeholder:text-white/40 h-12"
              />
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-purple-500 to-cyan-500 text-white h-12"
              >
                <Mail className="w-4 h-4 mr-2" />
                Save My Spot (Free)
              </Button>
            </form>
            
            <button
              onClick={() => {
                setShowSignupPrompt(false);
                setSignupPromptDismissed(true);
              }}
              className="w-full text-sm text-white/40 hover:text-white/60 transition-colors py-2"
            >
              I'll stay on this page, thanks
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Email Capture Dialog */}
      <Dialog open={saveFlowStep === 'email'} onOpenChange={(open) => !open && setSaveFlowStep('idle')}>
        <DialogContent className="bg-[#0a0a0a] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Mail className="w-5 h-5 text-purple-400" />
              Save Your GIF Library
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Enter your email to save these GIFs to your personal dashboard and access them anytime.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEmailSubmit} className="space-y-4 pt-4">
            <Input
              type="email"
              placeholder="your@email.com"
              value={saveEmail}
              onChange={(e) => setSaveEmail(e.target.value)}
              className="bg-white/5 border-white/20 text-white placeholder:text-white/40 h-12"
              required
            />
            <Button
              type="submit"
              disabled={isSaving || !saveEmail.trim()}
              className="w-full bg-gradient-to-r from-purple-500 to-cyan-500 text-white h-12"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4 mr-2" />
              )}
              Continue
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={saveFlowStep === 'payment'} onOpenChange={(open) => !open && setSaveFlowStep('idle')}>
        <DialogContent className="bg-[#0a0a0a] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <CreditCard className="w-5 h-5 text-green-400" />
              Choose Your Plan
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Get unlimited access to your GIF library dashboard and upload more videos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {/* Mock Card Input */}
            <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02] space-y-3">
              <div className="flex items-center gap-2 text-sm text-white/50 mb-2">
                <CreditCard className="w-4 h-4" />
                <span>Card Information</span>
              </div>
              <Input
                type="text"
                placeholder="4242 4242 4242 4242"
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30 h-10 font-mono"
                defaultValue="4242 4242 4242 4242"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="text"
                  placeholder="MM/YY"
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/30 h-10 font-mono"
                  defaultValue="12/28"
                />
                <Input
                  type="text"
                  placeholder="CVC"
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/30 h-10 font-mono"
                  defaultValue="123"
                />
              </div>
              <p className="text-xs text-green-400/70 flex items-center gap-1">
                <Check className="w-3 h-3" />
                Test mode - no real charges
              </p>
            </div>

            {/* Monthly Plan */}
            <button
              onClick={() => handlePayment('monthly')}
              disabled={isSaving}
              className="w-full p-4 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-purple-500/50 transition-all text-left group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white group-hover:text-purple-300 transition-colors">
                    Monthly
                  </p>
                  <p className="text-sm text-white/50">Billed monthly, cancel anytime</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-white">$19</p>
                  <p className="text-xs text-white/40">/month</p>
                </div>
              </div>
            </button>

            {/* Yearly Plan */}
            <button
              onClick={() => handlePayment('yearly')}
              disabled={isSaving}
              className="w-full p-4 rounded-xl border-2 border-green-500/50 bg-green-500/5 hover:bg-green-500/10 transition-all text-left group relative"
            >
              <div className="absolute -top-3 left-4 px-2 py-0.5 bg-green-500 text-black text-xs font-bold rounded">
                SAVE 30%
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white group-hover:text-green-300 transition-colors">
                    Yearly
                  </p>
                  <p className="text-sm text-white/50">Billed yearly, best value</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-white">$159</p>
                  <p className="text-xs text-white/40">/year ($13.25/mo)</p>
                </div>
              </div>
            </button>

            {isSaving && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                <span className="ml-2 text-white/60">Processing payment...</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={saveFlowStep === 'success'} onOpenChange={() => {}}>
        <DialogContent className="bg-[#0a0a0a] border-white/10 text-white max-w-md">
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Welcome Aboard!</h2>
            <p className="text-white/60 mb-4">
              Your GIF library has been saved. Redirecting to your dashboard...
            </p>
            <Loader2 className="w-6 h-6 animate-spin text-purple-400 mx-auto" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
