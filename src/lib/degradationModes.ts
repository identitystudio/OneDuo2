/**
 * Graceful Degradation Modes for Long Video Processing
 * 
 * When jobs fail repeatedly, instead of terminal failure, we progressively
 * degrade quality settings to maximize chances of successful completion.
 */

export interface DegradationMode {
  level: number;
  name: string;
  fps: number;
  resolution: 'full' | '720p' | '480p' | '360p';
  chunkDurationSeconds: number;
  skipGifs: boolean;
  transcriptOnly: boolean;
  description: string;
}

// Degradation ladder - each level is more conservative than the last
export const DEGRADATION_MODES: DegradationMode[] = [
  {
    level: 0,
    name: 'full_quality',
    fps: 3,
    resolution: 'full',
    chunkDurationSeconds: 300, // 5 min chunks
    skipGifs: false,
    transcriptOnly: false,
    description: 'Full quality processing (3 FPS, full resolution)',
  },
  {
    level: 1,
    name: 'reduced_fps',
    fps: 1,
    resolution: 'full',
    chunkDurationSeconds: 300,
    skipGifs: false,
    transcriptOnly: false,
    description: 'Reduced FPS (1 FPS, full resolution)',
  },
  {
    level: 2,
    name: 'reduced_resolution',
    fps: 1,
    resolution: '720p',
    chunkDurationSeconds: 180, // 3 min chunks
    skipGifs: false,
    transcriptOnly: false,
    description: 'Reduced resolution (1 FPS, 720p, smaller chunks)',
  },
  {
    level: 3,
    name: 'minimal_frames',
    fps: 1,
    resolution: '480p',
    chunkDurationSeconds: 120, // 2 min chunks
    skipGifs: true,
    transcriptOnly: false,
    description: 'Minimal frames (1 FPS, 480p, no GIFs)',
  },
  {
    level: 4,
    name: 'transcript_first',
    fps: 0.5,
    resolution: '360p',
    chunkDurationSeconds: 60, // 1 min chunks
    skipGifs: true,
    transcriptOnly: false,
    description: 'Transcript-first mode (0.5 FPS, 360p, no GIFs)',
  },
  {
    level: 5,
    name: 'safe_mode',
    fps: 0.2,
    resolution: '360p',
    chunkDurationSeconds: 30,
    skipGifs: true,
    transcriptOnly: true,
    description: 'Safe mode - transcript only with minimal keyframes',
  },
];

/**
 * Get the next degradation mode based on retry count
 */
export function getDegradationMode(retryCount: number): DegradationMode {
  const level = Math.min(retryCount, DEGRADATION_MODES.length - 1);
  return DEGRADATION_MODES[level];
}

/**
 * Get degradation mode by name
 */
export function getDegradationModeByName(name: string): DegradationMode | undefined {
  return DEGRADATION_MODES.find(m => m.name === name);
}

/**
 * Expected step durations for watchdog SLA (in seconds)
 * UPDATED: Based on typical processing times for 2+ hour videos
 * These are generous to prevent false stall detection on long content
 */
export const EXPECTED_STEP_DURATIONS: Record<string, number> = {
  // Single video steps - scaled for 2+ hour videos
  'transcribe': 900,           // 15 min - audio extraction + API call (long videos need more time)
  'transcribe_and_extract': 1800, // 30 min - parallel transcription + frame extraction
  'extract_frames': 2700,        // 45 min - FFmpeg processing for long videos
  'render_gifs': 1800,          // 30 min - GIF generation
  'analyze_audio': 600,         // 10 min - prosody analysis
  'build_pdf': 600,             // 10 min - PDF compilation
  
  // Module steps - also scaled for 2+ hour modules
  'transcribe_module': 900,     // 15 min per module
  'transcribe_and_extract_module': 1800, // 30 min per module
  'extract_frames_module': 2700, // 45 min per module  
  'render_gifs_module': 1800,   // 30 min per module
  'analyze_audio_module': 600,  // 10 min per module
  'build_pdf_module': 600,      // 10 min per module
  
  // Default for unknown steps - generous for safety
  'default': 1800,
};

/**
 * Get expected duration for a step, scaled by video duration if known
 * UPDATED: More generous scaling for 2+ hour videos
 */
export function getExpectedStepDuration(
  step: string, 
  videoDurationSeconds?: number
): number {
  const baseDuration = EXPECTED_STEP_DURATIONS[step] || EXPECTED_STEP_DURATIONS['default'];
  
  // Scale by video duration if known (base durations are for 2-hour video now)
  // For videos longer than 2 hours, scale proportionally
  if (videoDurationSeconds) {
    // Use 2 hours (7200 seconds) as the reference point
    const scaleFactor = Math.max(1, videoDurationSeconds / 7200);
    // Add 50% buffer for safety on long videos
    return Math.ceil(baseDuration * scaleFactor * 1.5);
  }
  
  return baseDuration;
}

/**
 * Check if a step is stalled beyond its expected duration
 */
export function isStepStalled(
  step: string,
  startedAt: Date,
  videoDurationSeconds?: number
): { stalled: boolean; expectedSeconds: number; actualSeconds: number } {
  const expectedSeconds = getExpectedStepDuration(step, videoDurationSeconds);
  const actualSeconds = (Date.now() - startedAt.getTime()) / 1000;
  
  // Stalled if actual time exceeds 2x expected duration
  const stalled = actualSeconds > expectedSeconds * 2;
  
  return { stalled, expectedSeconds, actualSeconds };
}
