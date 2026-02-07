import { useState, useCallback } from 'react';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

interface TranscriptSegment {
  start: number;
  end?: number;
  text: string;
}

interface GifSegment {
  frames: string[];
  startTime: number;
  endTime: number;
}

interface GeneratedGif {
  url: string;
  name: string;
  blob: Blob;
  keyframeUrl?: string; // Static PNG keyframe for AI fallback
  keyframeBlob?: Blob;
}

export function useGifGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);

  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  };

  // Get caption text for a specific time from transcript
  const getCaptionForTime = (
    time: number,
    transcript: TranscriptSegment[]
  ): string => {
    if (!transcript || !Array.isArray(transcript) || transcript.length === 0) return '';
    
    // Find the transcript segment that contains this time
    for (let i = 0; i < transcript.length; i++) {
      const seg = transcript[i];
      if (!seg || typeof seg.start !== 'number') continue;
      
      const segEnd = seg.end ?? (transcript[i + 1]?.start ?? seg.start + 5);
      
      if (time >= seg.start && time < segEnd) {
        return seg.text || '';
      }
    }
    
    return '';
  };

  // Apply contrast and sharpening enhancement for better AI text readability
  const enhanceImageForAI = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) => {
    try {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      
      // Increase contrast by 15% for better text visibility
      const contrastFactor = 1.15;
      const intercept = 128 * (1 - contrastFactor);
      
      for (let i = 0; i < data.length; i += 4) {
        // Apply contrast enhancement to RGB channels
        data[i] = Math.min(255, Math.max(0, data[i] * contrastFactor + intercept));     // R
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * contrastFactor + intercept)); // G
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * contrastFactor + intercept)); // B
        // Alpha channel stays the same
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      // Apply subtle sharpening using a convolution-like approach
      // This helps with text edge detection by the AI
      const sharpenedData = ctx.getImageData(0, 0, width, height);
      const sd = sharpenedData.data;
      const origData = new Uint8ClampedArray(data);
      
      // Simple unsharp mask: enhance edges
      const sharpenAmount = 0.3;
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 4;
          const idxUp = ((y - 1) * width + x) * 4;
          const idxDown = ((y + 1) * width + x) * 4;
          const idxLeft = (y * width + (x - 1)) * 4;
          const idxRight = (y * width + (x + 1)) * 4;
          
          for (let c = 0; c < 3; c++) {
            // Calculate local average
            const avg = (origData[idxUp + c] + origData[idxDown + c] + 
                        origData[idxLeft + c] + origData[idxRight + c]) / 4;
            // Enhance difference from average (sharpening)
            const diff = origData[idx + c] - avg;
            sd[idx + c] = Math.min(255, Math.max(0, origData[idx + c] + diff * sharpenAmount));
          }
        }
      }
      
      ctx.putImageData(sharpenedData, 0, 0);
    } catch (e) {
      console.warn('Failed to enhance image:', e);
    }
  };

  // Draw caption text on canvas with styling
  const drawCaption = (
    ctx: CanvasRenderingContext2D,
    text: string,
    width: number,
    height: number
  ) => {
    if (!text || text.trim() === '') return;

    try {
      const fontSize = Math.max(16, Math.floor(height / 10)); // Larger font for better readability
      const padding = 12;
      const maxWidth = width - padding * 2;

      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      // Word wrap the text
      const words = text.split(' ');
      const lines: string[] = [];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);

      // Limit to 2 lines max
      const displayLines = lines.slice(-2);
      const lineHeight = fontSize * 1.3; // Increased line height
      const totalHeight = displayLines.length * lineHeight;
      const startY = height - padding - 8;

      // Draw semi-transparent background with higher opacity
      const bgPadding = 8;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'; // Darker background for contrast
      ctx.fillRect(
        0,
        startY - totalHeight - bgPadding,
        width,
        totalHeight + bgPadding * 2
      );

      // Draw text with thicker outline for better readability
      displayLines.forEach((line, i) => {
        const y = startY - (displayLines.length - 1 - i) * lineHeight;
        
        // Black outline (thicker)
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 4;
        ctx.strokeText(line, width / 2, y);
        
        // White fill
        ctx.fillStyle = 'white';
        ctx.fillText(line, width / 2, y);
      });
    } catch (e) {
      console.warn('Failed to draw caption:', e);
    }
  };

  // Generate a static keyframe PNG from the middle frame of a segment
  const generateKeyframePng = useCallback(async (
    frames: string[],
    width: number,
    transcript?: TranscriptSegment[],
    startTime?: number,
    endTime?: number
  ): Promise<Blob | null> => {
    if (!frames || frames.length === 0) return null;
    
    try {
      // Use the middle frame as the keyframe (most representative)
      const middleIndex = Math.floor(frames.length / 2);
      const img = await loadImage(frames[middleIndex]);
      
      const aspectRatio = img.height / img.width;
      const height = Math.round(width * aspectRatio);
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) return null;
      
      // Draw image
      ctx.drawImage(img, 0, 0, width, height);
      
      // Apply contrast/sharpening enhancement
      enhanceImageForAI(ctx, width, height);
      
      // Draw caption if available
      if (transcript && startTime !== undefined && endTime !== undefined) {
        const middleTime = (startTime + endTime) / 2;
        const caption = getCaptionForTime(middleTime, transcript);
        if (caption) {
          drawCaption(ctx, caption, width, height);
        }
      }
      
      // Convert to PNG blob
      return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png', 0.9);
      });
    } catch (e) {
      console.warn('Failed to generate keyframe:', e);
      return null;
    }
  }, []);

  const generateGifFromFrames = useCallback(async (
    frames: string[],
    width: number = 640, // Increased default for better text readability
    delay: number = 100, // 10 fps = 100ms per frame
    transcript?: TranscriptSegment[],
    startTime?: number,
    endTime?: number
  ): Promise<Blob> => {
    if (!frames || frames.length === 0) {
      throw new Error('No frames provided');
    }

    console.log(`[GIF Generator] Starting with ${frames.length} frames, width=${width}, delay=${delay}ms`);

    // Load all images first with better error handling
    const images: HTMLImageElement[] = [];
    for (let i = 0; i < frames.length; i++) {
      const frameUrl = frames[i];
      try {
        const img = await loadImage(frameUrl);
        images.push(img);
      } catch (e) {
        console.warn(`Failed to load frame ${i}:`, frameUrl);
        // Continue loading other frames
      }
    }

    if (images.length === 0) {
      throw new Error('Could not load any frames');
    }

    console.log(`[GIF Generator] Loaded ${images.length} images successfully`);

    // Calculate dimensions (maintain aspect ratio)
    const firstImg = images[0];
    const aspectRatio = firstImg.height / firstImg.width;
    const height = Math.round(width * aspectRatio);

    // Ensure dimensions are valid (must be positive integers)
    if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error(`Invalid dimensions: ${width}x${height}`);
    }

    console.log(`[GIF Generator] Output dimensions: ${width}x${height}`);

    // Create canvas for drawing frames
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    // Create GIF encoder with proper format settings
    const gif = GIFEncoder();

    // Check if we have valid transcript data
    const hasTranscript = transcript && Array.isArray(transcript) && transcript.length > 0;
    const segmentDuration = (startTime !== undefined && endTime !== undefined) 
      ? endTime - startTime 
      : 0;
    const timePerFrame = segmentDuration > 0 && images.length > 0 
      ? segmentDuration / images.length 
      : 0;

    console.log(`[GIF Generator] Has transcript: ${hasTranscript}, segment duration: ${segmentDuration}s`);

    for (let frameIndex = 0; frameIndex < images.length; frameIndex++) {
      try {
        const img = images[frameIndex];
        
        // Clear canvas and draw image
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        
        // Apply contrast and sharpening enhancement for AI readability
        enhanceImageForAI(ctx, width, height);
        
        // Draw caption only if we have valid transcript data
        if (hasTranscript && startTime !== undefined && timePerFrame > 0) {
          const frameTime = startTime + (frameIndex * timePerFrame);
          const caption = getCaptionForTime(frameTime, transcript);
          if (caption) {
            drawCaption(ctx, caption, width, height);
          }
        }
        
        // Get image data (RGBA)
        const imageData = ctx.getImageData(0, 0, width, height);
        const rgba = imageData.data; // Uint8ClampedArray (4 bytes per pixel)

        // Quantize colors to a 256-color palette (expects RGBA input)
        // Using rgb565 for best quality on video-like content.
        const palette = quantize(rgba, 256, { format: 'rgb565' });

        // Apply palette to get indexed pixels (1 byte per pixel)
        const indexedPixels = applyPalette(rgba, palette, 'rgb565');

        // Sanity check: indexedPixels must match width*height
        if (indexedPixels.length !== width * height) {
          throw new Error(
            `Indexed pixel length mismatch: got ${indexedPixels.length}, expected ${width * height}`
          );
        }

        // Write frame with proper settings
        gif.writeFrame(indexedPixels, width, height, {
          palette,
          delay,
          dispose: 1, // Clear frame before drawing next
        });
        
      } catch (frameError) {
        console.error(`Error processing frame ${frameIndex}:`, frameError);
        // Skip this frame but continue with others
      }
    }

    // Finish encoding
    gif.finish();
    
    // Get the encoded bytes
    const bytes = gif.bytes();
    
    if (!bytes || bytes.length === 0) {
      throw new Error('GIF encoding produced no output');
    }

    console.log(`[GIF Generator] Generated GIF: ${bytes.length} bytes`);
    
    // Create blob with proper MIME type
    const blob = new Blob([bytes], { type: 'image/gif' });
    return blob;
  }, []);

  const generateGifsFromSegments = useCallback(async (
    segments: GifSegment[],
    videoName: string,
    transcript?: TranscriptSegment[],
    videoDurationSeconds?: number
  ): Promise<GeneratedGif[]> => {
    if (!segments || segments.length === 0) {
      console.warn('[GIF Generator] No segments provided');
      return [];
    }

    setIsGenerating(true);
    setGenerationProgress(0);
    
    const results: GeneratedGif[] = [];
    
    // Validate transcript
    const validTranscript = transcript && Array.isArray(transcript) && transcript.length > 0 
      ? transcript 
      : undefined;

    // Dynamic width based on video duration
    // Longer courses = higher resolution for better text readability
    // Short videos (<30min): 512px, Medium (30min-2hr): 576px, Long (2hr+): 640px
    let gifWidth = 640; // Default for longer courses
    if (videoDurationSeconds) {
      if (videoDurationSeconds <= 1800) {
        gifWidth = 512;
      } else if (videoDurationSeconds <= 7200) {
        gifWidth = 576;
      } else {
        gifWidth = 640;
      }
    }

    console.log(`[GIF Generator] Processing ${segments.length} segments, width=${gifWidth}px, transcript: ${validTranscript ? 'yes' : 'no'}`);
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      
      // Validate segment
      if (!segment || !segment.frames || !Array.isArray(segment.frames) || segment.frames.length === 0) {
        console.warn(`[GIF Generator] Skipping invalid segment ${i + 1}`);
        continue;
      }
      
      try {
        console.log(`[GIF Generator] Generating GIF ${i + 1}/${segments.length} from ${segment.frames.length} frames`);
        
        // Generate the animated GIF
        const blob = await generateGifFromFrames(
          segment.frames,
          gifWidth, // Dynamic width
          100, // delay (10 fps)
          validTranscript,
          segment.startTime,
          segment.endTime
        );
        
        // Validate the blob
        if (!blob || blob.size === 0) {
          throw new Error('Generated blob is empty');
        }
        
        const url = URL.createObjectURL(blob);
        const name = `${videoName}-part${i + 1}.gif`;
        
        // Generate keyframe PNG for AI fallback
        const keyframeBlob = await generateKeyframePng(
          segment.frames,
          gifWidth,
          validTranscript,
          segment.startTime,
          segment.endTime
        );
        
        const keyframeUrl = keyframeBlob ? URL.createObjectURL(keyframeBlob) : undefined;
        
        results.push({ 
          url, 
          name, 
          blob,
          keyframeUrl,
          keyframeBlob: keyframeBlob || undefined
        });
        
        console.log(`[GIF Generator] Successfully created ${name} (${(blob.size / 1024).toFixed(1)}KB)${keyframeBlob ? ` + keyframe (${(keyframeBlob.size / 1024).toFixed(1)}KB)` : ''}`);
        
        setGenerationProgress(((i + 1) / segments.length) * 100);
      } catch (error) {
        console.error(`[GIF Generator] Failed to generate GIF ${i + 1}:`, error);
        // Continue with other segments
      }
    }
    
    setIsGenerating(false);
    console.log(`[GIF Generator] Completed: ${results.length}/${segments.length} GIFs created`);
    return results;
  }, [generateGifFromFrames, generateKeyframePng]);

  return {
    generateGifsFromSegments,
    generateGifFromFrames,
    generateKeyframePng,
    isGenerating,
    generationProgress,
  };
}
