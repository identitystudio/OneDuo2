import { useState, useRef } from 'react';
import { Upload, Download, Loader2, Film, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface GifResult {
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export function AdminGifTool() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [gifResult, setGifResult] = useState<GifResult | null>(null);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl('');
      toast.success(`Selected: ${file.name}`);
    }
  };

  const uploadToStorage = async (file: File): Promise<string> => {
    const fileName = `admin-gifs/${Date.now()}-${file.name}`;
    
    const { data, error } = await supabase.storage
      .from('video-uploads')
      .upload(fileName, file, { 
        cacheControl: '3600',
        upsert: false 
      });

    if (error) throw new Error(`Upload failed: ${error.message}`);

    const { data: urlData } = supabase.storage
      .from('video-uploads')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  };

  const pollForCompletion = async (predictionId: string): Promise<string> => {
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes max

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 seconds
      
      const { data, error } = await supabase.functions.invoke('video-to-gif', {
        body: { predictionId }
      });

      if (error) throw error;

      setStatus(`Status: ${data.status}`);
      setProgress(Math.min(90, (attempts / maxAttempts) * 100));

      if (data.status === 'succeeded') {
        return data.output;
      } else if (data.status === 'failed') {
        throw new Error(data.error || 'GIF generation failed');
      }

      attempts++;
    }

    throw new Error('Timeout waiting for GIF generation');
  };

  const processVideo = async () => {
    if (!videoFile && !videoUrl) {
      toast.error('Please select a video file or enter a URL');
      return;
    }

    setIsProcessing(true);
    setStatus('Starting...');
    setProgress(0);
    setGifResult(null);

    try {
      let sourceUrl = videoUrl;

      // Upload file if provided
      if (videoFile) {
        setStatus('Uploading video...');
        setProgress(10);
        sourceUrl = await uploadToStorage(videoFile);
        toast.success('Video uploaded');
      }

      // Get video duration estimate (assume 5 min for now, or parse from file)
      const videoDurationSeconds = 300; // 5 minutes default

      setStatus('Starting GIF conversion...');
      setProgress(20);

      // Start the video-to-gif process
      const { data, error } = await supabase.functions.invoke('video-to-gif', {
        body: { 
          videoUrl: sourceUrl,
          videoDurationSeconds,
          targetFrames: 200 // ~200 frames for the GIF
        }
      });

      if (error) throw error;

      if (!data.predictionId) {
        throw new Error('No prediction ID returned');
      }

      setStatus('Processing video...');
      setProgress(30);

      // Poll for completion
      const gifUrl = await pollForCompletion(data.predictionId);

      setProgress(100);
      setStatus('Complete!');
      setGifResult({ url: gifUrl, status: 'completed' });
      toast.success('GIF ready for download!');

    } catch (err) {
      console.error('GIF processing error:', err);
      const message = err instanceof Error ? err.message : 'Failed to process video';
      setStatus(`Error: ${message}`);
      toast.error(message);
      setGifResult({ url: '', status: 'failed' });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadGif = async () => {
    if (!gifResult?.url) return;

    try {
      const response = await fetch(gifResult.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `seeVAdone-${Date.now()}.gif`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('GIF downloaded!');
    } catch (err) {
      toast.error('Download failed');
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999]">
      <div className="p-6 rounded-2xl bg-black/90 backdrop-blur-xl border border-cyan-500/30 shadow-2xl max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
            <Film className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Admin GIF Tool</h3>
            <p className="text-xs text-white/50">Extract GIFs from videos</p>
          </div>
        </div>

        {/* File Upload */}
        <div className="space-y-3 mb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-white/20 hover:border-cyan-500/50 hover:bg-white/5 transition-all text-white/70 hover:text-white disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {videoFile ? videoFile.name : 'Choose video file'}
          </button>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-white/30">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <input
            type="text"
            placeholder="Paste video URL..."
            value={videoUrl}
            onChange={(e) => {
              setVideoUrl(e.target.value);
              setVideoFile(null);
            }}
            disabled={isProcessing}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:border-cyan-500/50 focus:outline-none transition-colors disabled:opacity-50"
          />
        </div>

        {/* Process Button */}
        <button
          onClick={processVideo}
          disabled={isProcessing || (!videoFile && !videoUrl)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-400 text-black font-semibold hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Film className="w-4 h-4" />
              Extract GIF
            </>
          )}
        </button>

        {/* Progress */}
        {isProcessing && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-white/50 mb-1">
              <span>{status}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Result */}
        {gifResult && (
          <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/10">
            {gifResult.status === 'completed' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-400">
                  <Check className="w-4 h-4" />
                  <span className="text-sm font-medium">GIF Ready!</span>
                </div>
                {gifResult.url && (
                  <>
                    <img 
                      src={gifResult.url} 
                      alt="Generated GIF" 
                      className="w-full rounded-lg max-h-40 object-cover"
                    />
                    <button
                      onClick={downloadGif}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download GIF
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-red-400">
                <X className="w-4 h-4" />
                <span className="text-sm">Failed to generate GIF</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
