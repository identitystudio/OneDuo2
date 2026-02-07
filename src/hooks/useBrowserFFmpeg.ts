import { useState, useCallback, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { supabase } from '@/integrations/supabase/client';

interface ExtractionProgress {
  stage: 'loading' | 'analyzing' | 'extracting' | 'uploading' | 'complete';
  percent: number;
  message: string;
  framesExtracted?: number;
  framesUploaded?: number;
  totalFrames?: number;
}

interface ExtractionResult {
  success: boolean;
  frameUrls: string[];
  durationSeconds: number;
  error?: string;
}

export function useBrowserFFmpeg() {
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState<ExtractionProgress>({
    stage: 'loading',
    percent: 0,
    message: 'Initializing...'
  });
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const loadedRef = useRef(false);

  const loadFFmpeg = useCallback(async (): Promise<FFmpeg> => {
    if (ffmpegRef.current && loadedRef.current) {
      return ffmpegRef.current;
    }

    setProgress({ stage: 'loading', percent: 5, message: 'Loading video processor...' });

    const ffmpeg = new FFmpeg();
    ffmpegRef.current = ffmpeg;

    // Set up progress logging
    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });

    ffmpeg.on('progress', ({ progress: p }) => {
      const percent = Math.round(p * 100);
      setProgress(prev => ({
        ...prev,
        percent: Math.min(20 + percent * 0.5, 70), // Map 0-100 to 20-70
        message: `Extracting frames... ${percent}%`
      }));
    });

    // Load FFmpeg WASM from CDN
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      loadedRef.current = true;
      console.log('[FFmpeg] Loaded successfully');
    } catch (err) {
      console.error('[FFmpeg] Failed to load:', err);
      throw new Error('Failed to load video processor. Please try again.');
    }

    return ffmpeg;
  }, []);

  const getVideoDuration = async (ffmpeg: FFmpeg): Promise<number> => {
    // Run ffprobe-style command to get duration
    let duration = 0;
    const logHandler = ({ message }: { message: string }) => {
      // Parse duration from FFmpeg output: "Duration: 00:01:30.45"
      const match = message.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
      if (match) {
        const hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const seconds = parseInt(match[3]);
        duration = hours * 3600 + minutes * 60 + seconds;
      }
    };
    
    ffmpeg.on('log', logHandler);
    
    try {
      // Run with -i flag to get info (will fail but output duration)
      await ffmpeg.exec(['-i', 'input.mp4', '-f', 'null', '-']);
    } catch {
      // Expected to fail, we just want the log output
    }
    
    return duration || 60; // Default to 60 seconds if we can't parse
  };

  const extractFrames = useCallback(async (
    file: File,
    courseId: string,
    fps: number = 1
  ): Promise<ExtractionResult> => {
    setIsExtracting(true);
    setProgress({ stage: 'loading', percent: 0, message: 'Preparing video processor...' });

    try {
      const ffmpeg = await loadFFmpeg();
      
      setProgress({ stage: 'analyzing', percent: 10, message: 'Reading video file...' });
      
      // Write input file to FFmpeg virtual filesystem
      const fileData = await fetchFile(file);
      await ffmpeg.writeFile('input.mp4', fileData);
      
      setProgress({ stage: 'analyzing', percent: 15, message: 'Analyzing video...' });
      
      // Get video duration
      const durationSeconds = await getVideoDuration(ffmpeg);
      const expectedFrames = Math.ceil(durationSeconds * fps);
      
      console.log(`[FFmpeg] Video duration: ${durationSeconds}s, expecting ~${expectedFrames} frames at ${fps}fps`);
      
      setProgress({
        stage: 'extracting',
        percent: 20,
        message: `Extracting ~${expectedFrames} frames...`,
        totalFrames: expectedFrames
      });

      // Extract frames at specified FPS
      // Using high quality JPEG output
      await ffmpeg.exec([
        '-i', 'input.mp4',
        '-vf', `fps=${fps}`,
        '-q:v', '2', // High quality (1-31, lower is better)
        '-vsync', '0',
        'frame_%05d.jpg'
      ]);

      setProgress({
        stage: 'extracting',
        percent: 70,
        message: 'Reading extracted frames...'
      });

      // List extracted files
      const files = await ffmpeg.listDir('/');
      const frameFiles = files
        .filter(f => f.name.startsWith('frame_') && f.name.endsWith('.jpg'))
        .sort((a, b) => a.name.localeCompare(b.name));

      console.log(`[FFmpeg] Extracted ${frameFiles.length} frames`);

      if (frameFiles.length === 0) {
        throw new Error('No frames were extracted from the video');
      }

      setProgress({
        stage: 'uploading',
        percent: 72,
        message: `Uploading ${frameFiles.length} frames to storage...`,
        framesExtracted: frameFiles.length,
        framesUploaded: 0,
        totalFrames: frameFiles.length
      });

      // Upload frames to Supabase storage in batches
      const frameUrls: string[] = [];
      const batchSize = 10;
      
      for (let i = 0; i < frameFiles.length; i += batchSize) {
        const batch = frameFiles.slice(i, i + batchSize);
        
        const uploadPromises = batch.map(async (frameFile, batchIndex) => {
          const frameIndex = i + batchIndex;
          const frameData = await ffmpeg.readFile(frameFile.name);
          // Handle different return types from FFmpeg readFile
          let blob: Blob;
          if (typeof frameData === 'string') {
            // Text data - shouldn't happen for images but handle it
            blob = new Blob([frameData], { type: 'image/jpeg' });
          } else {
            // Binary data - need to copy to a new ArrayBuffer to avoid SharedArrayBuffer issues
            const buffer = new ArrayBuffer(frameData.byteLength);
            new Uint8Array(buffer).set(frameData);
            blob = new Blob([buffer], { type: 'image/jpeg' });
          }
          
          const storagePath = `${courseId}/frames/frame_${String(frameIndex).padStart(5, '0')}.jpg`;
          
          const { error: uploadError } = await supabase.storage
            .from('course-gifs')
            .upload(storagePath, blob, {
              contentType: 'image/jpeg',
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

        const uploadedCount = Math.min(i + batchSize, frameFiles.length);
        const uploadPercent = 72 + Math.round((uploadedCount / frameFiles.length) * 25);
        
        setProgress({
          stage: 'uploading',
          percent: uploadPercent,
          message: `Uploaded ${uploadedCount}/${frameFiles.length} frames...`,
          framesExtracted: frameFiles.length,
          framesUploaded: uploadedCount,
          totalFrames: frameFiles.length
        });
      }

      // Cleanup FFmpeg filesystem
      for (const frameFile of frameFiles) {
        await ffmpeg.deleteFile(frameFile.name);
      }
      await ffmpeg.deleteFile('input.mp4');

      setProgress({
        stage: 'complete',
        percent: 100,
        message: 'Frames extracted and uploaded!',
        framesExtracted: frameFiles.length,
        framesUploaded: frameFiles.length,
        totalFrames: frameFiles.length
      });

      return {
        success: true,
        frameUrls,
        durationSeconds
      };

    } catch (error) {
      console.error('[FFmpeg] Extraction failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      setProgress({
        stage: 'complete',
        percent: 0,
        message: `Error: ${errorMessage}`
      });

      return {
        success: false,
        frameUrls: [],
        durationSeconds: 0,
        error: errorMessage
      };
    } finally {
      setIsExtracting(false);
    }
  }, [loadFFmpeg]);

  const reset = useCallback(() => {
    setProgress({
      stage: 'loading',
      percent: 0,
      message: 'Initializing...'
    });
  }, []);

  return {
    extractFrames,
    isExtracting,
    progress,
    reset
  };
}
