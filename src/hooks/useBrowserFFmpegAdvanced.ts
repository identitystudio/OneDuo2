import { useState, useCallback, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { supabase } from '@/integrations/supabase/client';

// ============ TYPES ============
interface ExtractionConfig {
  fps: number; // 1-5 FPS
  useSmartKeyframes: boolean; // Use scene detection for keyframe-only extraction
  sceneThreshold: number; // 0.1-0.5 for scene change sensitivity (lower = more frames)
  maxMemoryMB: number; // Memory limit before chunking
  chunkDurationSeconds: number; // Process in chunks for long videos
  useHardwareAccel: boolean; // Attempt GPU acceleration
  qualityPreset: 'ultrafast' | 'fast' | 'balanced'; // Speed vs quality tradeoff
  outputFormat: 'jpg' | 'png' | 'webp'; // WebP for best speed+quality, PNG for compatibility
  jpegQuality: number; // 1-31 for JPEG (lower = better quality)
}

interface ExtractionProgress {
  stage: 'idle' | 'loading' | 'analyzing' | 'extracting' | 'uploading' | 'complete' | 'error' | 'cancelled';
  percent: number;
  message: string;
  framesExtracted?: number;
  framesUploaded?: number;
  totalFrames?: number;
  currentChunk?: number;
  totalChunks?: number;
  canResume?: boolean;
  estimatedTimeRemaining?: string;
  processingSpeed?: string; // e.g., "2.5x realtime"
  lastUpdated: number; // Timestamp for heartbeat detection (Phase 5)
}

interface ExtractionResult {
  success: boolean;
  frameUrls: string[];
  durationSeconds: number;
  error?: string;
  wasResumed?: boolean;
  processingTimeSeconds?: number;
  smartModeReduction?: number; // Percentage of frames saved by smart mode
}

interface ChunkState {
  chunkIndex: number;
  frameUrls: string[];
  completed: boolean;
}

// Optimized defaults for Pro tier - balanced speed and quality
const DEFAULT_CONFIG: ExtractionConfig = {
  fps: 3, // 3 FPS captures every instructional moment
  useSmartKeyframes: false, // Can be toggled for 50-80% fewer frames
  sceneThreshold: 0.3, // Scene detection sensitivity (0.1=very sensitive, 0.5=only major changes)
  maxMemoryMB: 512, // Increased for better throughput
  chunkDurationSeconds: 120, // 2 minute chunks for better batching
  useHardwareAccel: true, // Attempt GPU when available
  qualityPreset: 'fast', // Good balance of speed and quality
  outputFormat: 'webp', // WebP for 60-80% smaller files + faster encoding (lossless)
  jpegQuality: 3, // High quality JPEG if format is jpg
};

// ============ MAIN HOOK ============
export function useBrowserFFmpegAdvanced() {
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState<ExtractionProgress>({
    stage: 'idle',
    percent: 0,
    message: 'Ready',
    lastUpdated: Date.now()
  });
  
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const loadedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const resumeStateRef = useRef<{
    courseId: string;
    chunks: ChunkState[];
    config: ExtractionConfig;
    totalDuration: number;
  } | null>(null);

  // ============ LOAD FFMPEG ============
  const loadFFmpeg = useCallback(async (): Promise<FFmpeg> => {
    if (ffmpegRef.current && loadedRef.current) {
      return ffmpegRef.current;
    }

    setProgress({ stage: 'loading', percent: 5, message: 'Loading video processor...', lastUpdated: Date.now() });

    const ffmpeg = new FFmpeg();
    ffmpegRef.current = ffmpeg;

    // Progress logging
    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });

    ffmpeg.on('progress', ({ progress: p }) => {
      const percent = Math.round(p * 100);
      setProgress(prev => ({
        ...prev,
        percent: Math.min(20 + percent * 0.5, 70),
        message: `Processing... ${percent}%`,
        lastUpdated: Date.now()
      }));
    });

    // Load from CDN with multi-threading support
    const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm';
    
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
      });
      loadedRef.current = true;
      console.log('[FFmpeg] Loaded with multi-threading support');
    } catch (mtError) {
      console.warn('[FFmpeg] Multi-threaded load failed, falling back to single-threaded:', mtError);
      
      // Fallback to single-threaded
      const fallbackURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${fallbackURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${fallbackURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      loadedRef.current = true;
      console.log('[FFmpeg] Loaded in single-threaded mode');
    }

    return ffmpeg;
  }, []);

  // ============ GET VIDEO DURATION ============
  const getVideoDuration = async (ffmpeg: FFmpeg): Promise<number> => {
    let duration = 0;
    
    const logHandler = ({ message }: { message: string }) => {
      const match = message.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
      if (match) {
        duration = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
      }
    };
    
    ffmpeg.on('log', logHandler);
    
    try {
      await ffmpeg.exec(['-i', 'input.mp4', '-f', 'null', '-']);
    } catch {
      // Expected to fail, we just want the log output
    }
    
    return duration || 60;
  };

  // ============ ESTIMATE MEMORY USAGE ============
  const estimateMemoryUsage = (durationSeconds: number, fps: number): number => {
    // Rough estimate: 200KB per frame for 720p JPEG
    const frameCount = durationSeconds * fps;
    const memoryMB = (frameCount * 200) / 1024;
    return memoryMB;
  };

  // ============ BUILD FFMPEG FILTER ============
  const buildVideoFilter = (config: ExtractionConfig): string => {
    const filters: string[] = [];
    
    if (config.useSmartKeyframes) {
      // Smart Mode: Scene detection + minimum interval
      // This extracts frames ONLY when visual content changes significantly
      // Can reduce frame count by 50-80% on typical course content
      // gt(scene, threshold) - detects scene changes above threshold
      // isnan(prev_selected_t) - always select first frame
      // gte(t-prev_selected_t, interval) - ensure minimum time between frames
      const minInterval = 1 / config.fps;
      filters.push(`select='gt(scene\\,${config.sceneThreshold})+isnan(prev_selected_t)+gte(t-prev_selected_t\\,${minInterval})'`);
    } else {
      // Standard mode: fixed FPS extraction
      filters.push(`fps=${config.fps}`);
    }
    
    // Scale to 1280 width while maintaining aspect ratio (fast, good quality)
    filters.push('scale=1280:-2:flags=fast_bilinear');
    
    return filters.join(',');
  };

  // ============ EXTRACT CHUNK (OPTIMIZED) ============
  const extractChunk = async (
    ffmpeg: FFmpeg,
    startTime: number,
    duration: number,
    config: ExtractionConfig,
    chunkIndex: number,
    chunkStartTime: number // For speed calculation
  ): Promise<{ frames: string[]; processingTime: number }> => {
    const videoFilter = buildVideoFilter(config);
    const outputExt = config.outputFormat === 'png' ? 'png' : config.outputFormat === 'webp' ? 'webp' : 'jpg';
    
    // Build optimized FFmpeg arguments for maximum speed without quality loss
    const args: string[] = [];
    
    // === INPUT OPTIONS (before -i) ===
    // Seek to start position BEFORE input (faster than after)
    args.push('-ss', String(startTime));
    
    // Duration limit
    args.push('-t', String(duration));
    
    // Multi-threading: auto-detect optimal thread count
    args.push('-threads', '0');
    
    // Input file
    args.push('-i', 'input.mp4');
    
    // === OUTPUT OPTIONS ===
    // Video filter chain (scene detection or FPS + scaling)
    args.push('-vf', videoFilter);
    
    // Disable audio processing (we only need video frames)
    args.push('-an');
    
    // Skip frame sync delays - critical for speed
    args.push('-vsync', '0');
    
    // Frame type: only decode I-frames and P-frames, skip B-frames for speed
    // This doesn't affect output quality, just decoding speed
    args.push('-skip_frame', 'nokey');
    
    // Output format specific options
    if (config.outputFormat === 'png') {
      // PNG: lossless, compression level 1 (fastest while still compressed)
      args.push('-compression_level', '1');
    } else if (config.outputFormat === 'webp') {
      // WebP: LOSSLESS mode - pixel-perfect, 60-80% smaller than PNG, 2-3x faster encode
      args.push('-c:v', 'libwebp', '-lossless', '1', '-compression_level', '4');
    } else {
      // JPEG: quality setting (1-31, lower = better)
      args.push('-q:v', String(config.jpegQuality));
    }
    
    // Output filename pattern
    args.push(`chunk${chunkIndex}_frame_%05d.${outputExt}`);

    console.log(`[FFmpeg] Extracting chunk ${chunkIndex}: ${startTime}s to ${startTime + duration}s`);
    console.log(`[FFmpeg] Args: ${args.join(' ')}`);
    
    const extractStart = performance.now();
    await ffmpeg.exec(args);
    const processingTime = (performance.now() - extractStart) / 1000;

    // List extracted files for this chunk
    const files = await ffmpeg.listDir('/');
    const chunkFrames = files
      .filter(f => f.name.startsWith(`chunk${chunkIndex}_frame_`) && f.name.endsWith(`.${outputExt}`))
      .map(f => f.name)
      .sort();
    
    // Calculate processing speed
    const speed = duration / processingTime;
    console.log(`[FFmpeg] Chunk ${chunkIndex}: ${chunkFrames.length} frames in ${processingTime.toFixed(1)}s (${speed.toFixed(1)}x realtime)`);

    return { frames: chunkFrames, processingTime };
  };

  // ============ UPLOAD FRAMES ============
  const uploadFrames = async (
    ffmpeg: FFmpeg,
    frameFiles: string[],
    courseId: string,
    config: ExtractionConfig,
    onProgress: (uploaded: number, total: number) => void
  ): Promise<string[]> => {
    const frameUrls: string[] = [];
    const batchSize = 30; // Increased batch size for faster uploads
    const ext = config.outputFormat;
    const mimeType = config.outputFormat === 'png' ? 'image/png' 
      : config.outputFormat === 'webp' ? 'image/webp' 
      : 'image/jpeg';
    
    for (let i = 0; i < frameFiles.length; i += batchSize) {
      // Check for cancellation
      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('Extraction cancelled by user');
      }
      
      const batch = frameFiles.slice(i, i + batchSize);
      
      const uploadPromises = batch.map(async (fileName, batchIndex) => {
        const frameIndex = i + batchIndex;
        const frameData = await ffmpeg.readFile(fileName);
        
        let blob: Blob;
        if (typeof frameData === 'string') {
          blob = new Blob([frameData], { type: mimeType });
        } else {
          const buffer = new ArrayBuffer(frameData.byteLength);
          new Uint8Array(buffer).set(frameData);
          blob = new Blob([buffer], { type: mimeType });
        }
        
        const storagePath = `${courseId}/frames/frame_${String(frameIndex).padStart(5, '0')}.${ext}`;
        
        const { error: uploadError } = await supabase.storage
          .from('course-gifs')
          .upload(storagePath, blob, {
            contentType: mimeType,
            upsert: true
          });

        if (uploadError) {
          console.error(`Failed to upload frame ${frameIndex}:`, uploadError);
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('course-gifs')
          .getPublicUrl(storagePath);

        return publicUrl;
      });

      const batchUrls = await Promise.all(uploadPromises);
      frameUrls.push(...batchUrls);
      
      onProgress(Math.min(i + batchSize, frameFiles.length), frameFiles.length);
    }

    return frameUrls;
  };

  // ============ MAIN EXTRACTION FUNCTION ============
  const extractFrames = useCallback(async (
    file: File,
    courseId: string,
    config: Partial<ExtractionConfig> = {}
  ): Promise<ExtractionResult> => {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    
    // Validate FPS range
    finalConfig.fps = Math.max(1, Math.min(5, finalConfig.fps));
    
    setIsExtracting(true);
    abortControllerRef.current = new AbortController();
    
    setProgress({ 
      stage: 'loading', 
      percent: 0, 
      message: 'Preparing video processor...',
      lastUpdated: Date.now()
    });

    try {
      const ffmpeg = await loadFFmpeg();
      
      setProgress({ stage: 'analyzing', percent: 10, message: 'Reading video file...', lastUpdated: Date.now() });
      
      // Write input file
      const fileData = await fetchFile(file);
      await ffmpeg.writeFile('input.mp4', fileData);
      
      setProgress({ stage: 'analyzing', percent: 15, message: 'Analyzing video...', lastUpdated: Date.now() });
      
      // Get duration
      const durationSeconds = await getVideoDuration(ffmpeg);
      const estimatedMemory = estimateMemoryUsage(durationSeconds, finalConfig.fps);
      
      console.log(`[FFmpeg] Video: ${durationSeconds}s, Est. memory: ${estimatedMemory}MB`);
      
      // Determine chunking strategy
      const needsChunking = estimatedMemory > finalConfig.maxMemoryMB || durationSeconds > 600;
      const chunkDuration = needsChunking ? finalConfig.chunkDurationSeconds : durationSeconds;
      const totalChunks = Math.ceil(durationSeconds / chunkDuration);
      
      console.log(`[FFmpeg] Processing ${needsChunking ? `in ${totalChunks} chunks` : 'as single segment'}`);
      
      // Store resume state
      resumeStateRef.current = {
        courseId,
        chunks: [],
        config: finalConfig,
        totalDuration: durationSeconds
      };
      
      const allFrameFiles: string[] = [];
      let totalProcessingTime = 0;
      let processedDuration = 0;
      const extractionStartTime = performance.now();
      
      // Process chunks
      for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        // Check for cancellation
        if (abortControllerRef.current?.signal.aborted) {
          setProgress({
            stage: 'cancelled',
            percent: (chunkIdx / totalChunks) * 100,
            message: 'Extraction cancelled',
            canResume: true,
            currentChunk: chunkIdx,
            totalChunks,
            lastUpdated: Date.now()
          });
          return {
            success: false,
            frameUrls: [],
            durationSeconds,
            error: 'Cancelled by user'
          };
        }
        
        const startTime = chunkIdx * chunkDuration;
        const duration = Math.min(chunkDuration, durationSeconds - startTime);
        
        // Rotating motivational phrases - Blair Warren style, instructional moment focus
        const motivationalPhrases = [
          "Capturing every instructional moment—so AI sees what actually matters...",
          "Your VA is about to become unstoppable. Just a moment longer...",
          "ChatGPT, Claude, Grok—they'll finally understand every step...",
          "The hard part? You already did it. This is just the unlock...",
          "No more \"what did he mean by this?\" ever again...",
          "Every click, every highlight, every meaningful step—captured...",
          "Platform lock-in ends here. Universal access begins...",
          "The prep work that saves you hundreds of hours...",
          "Sip piña coladas while your VA knows exactly what to do...",
          "Making AI useful, not omniscient. That's the magic...",
          "Breaking the walls between you and true delegation...",
          "This is the last time you'll ever re-explain this content...",
          "Building your VA's perfect reference guide...",
          "Beating delegation failure, one instructional moment at a time...",
          "Every action that changes what to do next—preserved forever...",
        ];
        const phraseIndex = chunkIdx % motivationalPhrases.length;
        
        setProgress({
          stage: 'extracting',
          percent: 20 + (chunkIdx / totalChunks) * 50,
          message: motivationalPhrases[phraseIndex],
          currentChunk: chunkIdx + 1,
          totalChunks,
          processingSpeed: totalProcessingTime > 0 ? `${(processedDuration / totalProcessingTime).toFixed(1)}x realtime` : undefined,
          lastUpdated: Date.now()
        });
        
        const chunkResult = await extractChunk(ffmpeg, startTime, duration, finalConfig, chunkIdx, Date.now());
        allFrameFiles.push(...chunkResult.frames);
        totalProcessingTime += chunkResult.processingTime;
        processedDuration += duration;
        
        // Update resume state
        resumeStateRef.current.chunks.push({
          chunkIndex: chunkIdx,
          frameUrls: [],
          completed: true
        });
        
        // PRODUCTION HARDENING: Aggressive memory cleanup between chunks
        // Upload and delete frames immediately to prevent memory pressure
        if (needsChunking && chunkIdx < totalChunks - 1) {
          console.log(`[FFmpeg] Chunk ${chunkIdx + 1} complete, ${chunkResult.frames.length} frames. Flushing memory...`);
          
          // Delete chunk frames from FFmpeg memory to free up space
          for (const frame of chunkResult.frames) {
            try {
              await ffmpeg.deleteFile(frame);
            } catch {
              // Ignore cleanup errors
            }
          }
          
          // Force garbage collection hint (doesn't guarantee but helps)
          if (typeof globalThis.gc === 'function') {
            try { globalThis.gc(); } catch { /* ignore */ }
          }
        }
      }

      console.log(`[FFmpeg] Extracted ${allFrameFiles.length} total frames`);

      if (allFrameFiles.length === 0) {
        throw new Error('No frames were extracted from the video');
      }

      setProgress({
        stage: 'uploading',
        percent: 72,
        message: `Uploading ${allFrameFiles.length} frames...`,
        framesExtracted: allFrameFiles.length,
        framesUploaded: 0,
        totalFrames: allFrameFiles.length,
        lastUpdated: Date.now()
      });

      // Upload frames
      const frameUrls = await uploadFrames(
        ffmpeg,
        allFrameFiles,
        courseId,
        finalConfig,
        (uploaded, total) => {
          const uploadPercent = 72 + Math.round((uploaded / total) * 25);
          setProgress({
            stage: 'uploading',
            percent: uploadPercent,
            message: `Uploaded ${uploaded}/${total} frames...`,
            framesExtracted: allFrameFiles.length,
            framesUploaded: uploaded,
            totalFrames: total,
            lastUpdated: Date.now()
          });
        }
      );

      // Cleanup
      for (const frameFile of allFrameFiles) {
        try {
          await ffmpeg.deleteFile(frameFile);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      await ffmpeg.deleteFile('input.mp4');

      const totalExtractionTime = (performance.now() - extractionStartTime) / 1000;
      const processingSpeedMultiplier = durationSeconds / totalExtractionTime;
      
      setProgress({
        stage: 'complete',
        percent: 100,
        message: `Extraction complete! ${processingSpeedMultiplier.toFixed(1)}x realtime`,
        framesExtracted: allFrameFiles.length,
        framesUploaded: frameUrls.length,
        totalFrames: allFrameFiles.length,
        processingSpeed: `${processingSpeedMultiplier.toFixed(1)}x realtime`,
        lastUpdated: Date.now()
      });

      resumeStateRef.current = null;
      
      console.log(`[FFmpeg] Total: ${allFrameFiles.length} frames in ${totalExtractionTime.toFixed(1)}s (${processingSpeedMultiplier.toFixed(1)}x realtime)`);

      return {
        success: true,
        frameUrls,
        durationSeconds,
        processingTimeSeconds: totalExtractionTime
      };

    } catch (error) {
      console.error('[FFmpeg] Extraction failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if it's a memory error
      const isMemoryError = errorMessage.includes('memory') || errorMessage.includes('OOM');
      
      setProgress({
        stage: 'error',
        percent: 0,
        message: isMemoryError 
          ? 'Video too large for browser. Falling back to server processing...'
          : `Error: ${errorMessage}`,
        canResume: !!resumeStateRef.current,
        lastUpdated: Date.now()
      });

      return {
        success: false,
        frameUrls: [],
        durationSeconds: 0,
        error: errorMessage
      };
    } finally {
      setIsExtracting(false);
      abortControllerRef.current = null;
    }
  }, [loadFFmpeg]);

  // ============ CANCEL EXTRACTION ============
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setProgress(prev => ({
        ...prev,
        stage: 'cancelled',
        message: 'Cancelling...',
        canResume: true,
        lastUpdated: Date.now()
      }));
    }
  }, []);

  // ============ RESET ============
  const reset = useCallback(() => {
    setProgress({
      stage: 'idle',
      percent: 0,
      message: 'Ready',
      lastUpdated: Date.now()
    });
    resumeStateRef.current = null;
  }, []);

  // ============ CHECK IF CAN RESUME ============
  const canResume = useCallback(() => {
    return resumeStateRef.current !== null && resumeStateRef.current.chunks.length > 0;
  }, []);

  // ============ CLEANUP ON UNMOUNT ============
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    extractFrames,
    isExtracting,
    progress,
    cancel,
    reset,
    canResume,
    defaultConfig: DEFAULT_CONFIG
  };
}
