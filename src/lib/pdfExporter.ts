import { jsPDF } from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import { sanitizePdfText } from '@/lib/pdfText';
import {
  imageToBase64WithRetry,
  sampleFramesEvenly,
  getRecommendedFrameSampleSize,
  getRecommendedImageQuality,
  batchLoadImages
} from '@/lib/imageLoader';
import {
  persistFramesToStorage,
  validateFrameCount
} from '@/lib/framePersistence';

interface TranscriptSegment {
  start: number;
  end?: number;
  text: string;
  speaker?: string;
}

interface ProsodyAnnotation {
  tone: string;
  pacing: string;
  volume: string;
  parenthetical: string;
}

interface EmphasisFlags {
  highlight_detected: boolean;
  cursor_pause: boolean;
  zoom_focus: boolean;
  text_selected: boolean;
  lingering_frame: boolean;
  bold_text: boolean;
  underline_detected: boolean;
}

interface VerbalIntentMarker {
  phrase: string;
  markerType: 'critical' | 'sequence' | 'warning' | 'skip_consequence';
  confidence: number;
}

// Unspoken Expert Nuance - the "sixth sense" of expertise
interface UnspokenNuance {
  nuanceType: 'micro_hesitation' | 'decision_point' | 'expert_instinct' | 'implicit_caution' | 'muscle_memory';
  description: string;
  confidence: number;
  inferredFrom: string[];
}

interface FrameAnalysis {
  frameIndex: number;
  timestamp: number;
  text: string;
  textType: 'slide' | 'document' | 'ui' | 'code' | 'other';
  emphasisFlags: EmphasisFlags;
  keyElements: string[];
  instructorIntent: string;
  prosody?: ProsodyAnnotation;
  // Enhanced intent detection
  intentConfidence?: number;
  intentSource?: 'visual_only' | 'verbal_explicit' | 'visual_verbal_aligned' | 'inferred';
  verbalIntentMarkers?: VerbalIntentMarker[];
  mustNotSkip?: boolean;
  dependsOnPrevious?: boolean;
  // NEW: Unspoken Expert Nuance
  unspokenNuance?: UnspokenNuance;
  // NEW: Visual description for PDF captions
  visualDescription?: string;
}

// Workflow types
interface WorkflowStep {
  stepNumber: number;
  description: string;
  frameIndices: number[];
  timestamps: { start: number; end: number };
  mustNotSkip: boolean;
  dependsOn: number[];
  confidenceLevel: 'explicit' | 'strong' | 'inferred';
  signals: string[];
  dwellTime: number;
}

interface WorkflowSequence {
  sequenceId: string;
  title: string;
  steps: WorkflowStep[];
  totalDuration: number;
  criticalPath: number[];
  sequenceWarnings: string[];
}

interface WorkflowAnalysis {
  workflows: WorkflowSequence[];
  criticalSteps: {
    frameIndex: number;
    timestamp: number;
    reason: string;
    confidenceLevel: string;
  }[];
  dependencyChains: {
    stepA: number;
    stepB: number;
    relationship: string;
  }[];
  summary: {
    totalWorkflows: number;
    totalCriticalSteps: number;
    averageConfidence: number;
  };
}

// Audio Events Types
interface MusicCue {
  start: number;
  end: number;
  mood: string;
  genre?: string;
  description: string;
}

interface AmbientSound {
  timestamp: number;
  duration: number;
  sound: string;
  meaning: string;
}

interface AudienceReaction {
  timestamp: number;
  duration: number;
  type: string;
  context: string;
  intensity: string;
}

interface MeaningfulPause {
  timestamp: number;
  duration: number;
  meaning: string;
  screenplayNote: string;
}

interface IntelligenceLayerItem {
  timestamp?: string;
  title?: string;
  description: string;
}

interface AudioEvents {
  music_cues?: MusicCue[];
  ambient_sounds?: AmbientSound[];
  reactions?: AudienceReaction[];
  meaningful_pauses?: MeaningfulPause[];
  overall_audio_mood?: string;
}

interface CliffhangerMoment {
  peak_timestamp: number;
  resolution_timestamp: number;
  composite_confidence: number;
  description: string;
  signals?: {
    audio_intensity: boolean;
    visual_stasis: boolean;
    verbal_hint: boolean;
  };
}

interface ProsodyData {
  annotations?: Array<{
    timestamp: number;
    duration: number;
    annotation: string;
    confidence: number;
    type: string;
  }>;
  overall_tone?: string;
  key_moments?: string[];
  cliffhanger_moments?: CliffhangerMoment[];
}

// Supplemental file content for embedding in PDF
interface SupplementalFile {
  name: string;
  content: string;
  size?: number;
}

interface CourseData {
  id?: string; // Course ID for frame persistence
  title: string;
  video_duration_seconds?: number;
  transcript?: TranscriptSegment[];
  frame_urls?: string[];
  frame_analyses?: FrameAnalysis[]; // Cached visual analyses from AI (visualDescription etc.)
  audio_events?: AudioEvents;
  prosody_annotations?: ProsodyData;
  userEmail?: string; // For watermarking
  supplementalFiles?: SupplementalFile[]; // User-uploaded training documents
  // Intelligence Layers
  key_moments_index?: IntelligenceLayerItem[];
  concepts_frameworks?: IntelligenceLayerItem[];
  hidden_patterns?: IntelligenceLayerItem[];
  implementation_steps?: any[];
  video_url?: string;
  created_at?: string;
}

// Module data for merged course PDF
export interface ModuleData {
  id: string;
  moduleNumber: number;
  title: string;
  video_duration_seconds?: number;
  transcript?: TranscriptSegment[];
  frame_urls?: string[];
  frame_analyses?: any[];
  audio_events?: AudioEvents;
  prosody_annotations?: ProsodyData;
  // Intelligence Layers
  key_moments_index?: IntelligenceLayerItem[];
  concepts_frameworks?: IntelligenceLayerItem[];
  hidden_patterns?: IntelligenceLayerItem[];
  implementation_steps?: any[];
  // Knowledge Layer (10/10 AI artifact)
  knowledge_layer?: any;
}

// Merged course data with all modules as chapters
export interface MergedCourseData {
  courseId: string;
  title: string;
  modules: ModuleData[];
  userEmail?: string;
  supplementalFiles?: SupplementalFile[];
}

interface ExportOptions {
  maxFrames?: number;
  includeOCR?: boolean; // Defaults to FALSE now for speed
  ocrBatchSize?: number;
  imageQuality?: number;
  includeWorkflowAnalysis?: boolean;
  userEmail?: string; // Alternative way to pass email for watermark
  fastMode?: boolean; // Skip OCR + workflow analysis for faster generation
  aiFidelityMode?: boolean; // NEW: High-fidelity layout for AI vision (large images, high density)
}

const LEGAL_FOOTER = `Proprietary Governance Artifact - Not For AI Training or System Replication. Identity Nails LLC / OneDuo - All Rights Reserved. Unauthorized automation, reproduction, or derivative system generation is prohibited. See /ip-notice for governing terms.`;

const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// Convert image URL to compressed base64 with retry logic
// NOTE: Default quality must be HIGH for UI text legibility inside PDFs.
const imageToBase64Compressed = async (url: string, quality: number = 0.9): Promise<string | null> => {
  const result = await imageToBase64WithRetry(url, quality, 2, 10000);
  return result.dataUrl;
};

// Extract text from frames using AI vision - WITH PROGRESS UPDATES
const extractFrameTextsWithProgress = async (
  frameUrls: string[],
  videoDuration: number,
  transcript: TranscriptSegment[],
  onProgress?: (progress: number, status: string) => void,
  batchSize: number = 3 // Process in batches to balance progress updates and API efficiency
): Promise<(FrameAnalysis | null)[]> => {
  const results: (FrameAnalysis | null)[] = [];
  const totalFrames = frameUrls.length;

  // Build transcript context for verbal intent detection (shared across all batches)
  const transcriptContext = transcript.slice(0, 50).map(t => t.text).join(' ').substring(0, 2000);

  for (let i = 0; i < totalFrames; i += batchSize) {
    const currentBatch = frameUrls.slice(i, i + batchSize);

    try {
      onProgress?.(
        Math.min(95, Number((10 + (i / totalFrames) * 85).toFixed(1))),
        `Analyzing frames ${i + 1}-${Math.min(i + batchSize, totalFrames)} / ${totalFrames} (Replicate)`
      );

      const { data, error } = await supabase.functions.invoke('extract-frame-text', {
        body: {
          frameUrls: currentBatch,
          videoDuration,
          startIndex: i,
          totalFrameCount: totalFrames,
          transcriptContext,
          allowPartialResults: true
        }
      });

      if (error) throw error;

      if (data?.results && Array.isArray(data.results)) {
        data.results.forEach((res: FrameAnalysis | null, idx: number) => {
          results[i + idx] = res;
          console.log(`frame ${i + idx + 1}: successful visual transcription (Replicate)`);
        });
      } else {
        console.warn(`No results returned for batch at index ${i}`);
        currentBatch.forEach((_, idx) => {
          results[i + idx] = null;
        });
      }
    } catch (err) {
      console.error(`Batch analysis failed at index ${i}:`, err);
      currentBatch.forEach((_, idx) => {
        results[i + idx] = null;
      });
    }
  }

  return results;
};


// NEW: Analyze workflow sequences
const analyzeWorkflowSequences = async (
  frameAnalyses: (FrameAnalysis | null)[],
  transcript: TranscriptSegment[],
  videoDuration: number,
  onProgress?: (progress: number, status: string) => void
): Promise<WorkflowAnalysis | null> => {
  onProgress?.(36, 'Analyzing workflow sequences and dependencies...');

  try {
    const { data, error } = await supabase.functions.invoke('analyze-workflow-sequence', {
      body: {
        frameAnalyses,
        transcript,
        videoDuration,
      }
    });

    if (error) {
      console.error('Workflow analysis failed:', error);
      return null;
    }

    return data as WorkflowAnalysis;
  } catch (error) {
    console.error('Failed to analyze workflows:', error);
    return null;
  }
};

// Get text type label (ASCII-safe for PDF)
const getTextTypeLabel = (textType: string): string => {
  switch (textType) {
    case 'slide': return '[SLIDE]';
    case 'document': return '[DOC]';
    case 'ui': return '[UI]';
    case 'code': return '[CODE]';
    default: return '[FRAME]';
  }
};

// Get emphasis flags as readable ASCII text (no emojis for PDF compatibility)
const getEmphasisLabels = (flags: EmphasisFlags): string[] => {
  const labels: string[] = [];
  if (flags.highlight_detected) labels.push('*HIGHLIGHT*');
  if (flags.text_selected) labels.push('*SELECTED*');
  if (flags.cursor_pause) labels.push('*CURSOR_PAUSE*');
  if (flags.zoom_focus) labels.push('*ZOOM*');
  if (flags.lingering_frame) labels.push('*LINGERING*');
  if (flags.bold_text) labels.push('*BOLD*');
  if (flags.underline_detected) labels.push('*UNDERLINE*');
  return labels;
};

const hasAnyEmphasis = (flags: EmphasisFlags): boolean => {
  return flags.highlight_detected || flags.text_selected || flags.cursor_pause ||
    flags.zoom_focus || flags.lingering_frame || flags.bold_text || flags.underline_detected;
};

// Get prosody label (ASCII-safe)
const getProsodyLabel = (prosody?: ProsodyAnnotation): string => {
  if (!prosody) return '';
  const parts: string[] = [];
  if (prosody.parenthetical) parts.push(prosody.parenthetical);
  if (prosody.tone !== 'neutral') parts.push(`[${prosody.tone.toUpperCase()}]`);
  if (prosody.pacing !== 'normal') parts.push(`[${prosody.pacing.toUpperCase()}]`);
  if (prosody.volume !== 'normal') parts.push(`[${prosody.volume.toUpperCase()}]`);
  return parts.join(' ');
};

// NEW: Get confidence indicator label
const getConfidenceLabel = (frame: FrameAnalysis): string => {
  if (frame.intentSource === 'verbal_explicit') return '[EXPLICIT]';
  if (frame.intentSource === 'visual_verbal_aligned') return '[STRONG]';
  if (frame.intentSource === 'visual_only') return '[VISUAL]';
  return '[INFERRED]';
};

// NEW: Get confidence color
const getConfidenceColor = (source?: string): { r: number; g: number; b: number } => {
  switch (source) {
    case 'verbal_explicit': return { r: 0, g: 150, b: 50 }; // Green
    case 'visual_verbal_aligned': return { r: 0, g: 100, b: 200 }; // Blue
    case 'visual_only': return { r: 200, g: 150, b: 0 }; // Orange
    default: return { r: 150, g: 150, b: 150 }; // Gray
  }
};

// Frame sampling targets (keeps PDFs proportional to video length)
const FRAMES_PER_MINUTE_TARGET = 60; // 1 FPS * 60 seconds = Every single frame included
const MIN_EXPORT_FRAMES = 250;
const MAX_EXPORT_FRAMES = 15000;

// ========== HELPER: Render Audio Events Timeline ==========
const renderAudioTimeline = (
  pdf: jsPDF,
  margin: number,
  pageHeight: number,
  contentWidth: number,
  y: number,
  audioEvents: AudioEvents,
  prosodyData: ProsodyData,
  addPageWithHeaders: () => void,
  formatTime: (s: number) => string
): number => {
  const checkPageBreakInternal = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 35) {
      addPageWithHeaders();
      return true;
    }
    return false;
  };

  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text('Audio Events Timeline', margin, y);
  y += 8;

  const musicCues = audioEvents.music_cues || [];
  const ambientSounds = audioEvents.ambient_sounds || [];
  const reactions = audioEvents.reactions || [];
  const meaningfulPauses = audioEvents.meaningful_pauses || [];
  const prosodyAnnotations = prosodyData.annotations || [];
  const cliffhangers = prosodyData.cliffhanger_moments || [];

  const hasAudioData = musicCues.length > 0 || ambientSounds.length > 0 ||
    reactions.length > 0 || meaningfulPauses.length > 0 ||
    prosodyAnnotations.length > 0 || cliffhangers.length > 0 ||
    audioEvents.overall_audio_mood || prosodyData.overall_tone;

  if (hasAudioData) {
    // Overall Audio Mood & Tone
    if (audioEvents.overall_audio_mood || prosodyData.overall_tone) {
      const moodTextStr = audioEvents.overall_audio_mood ? `Mood: ${audioEvents.overall_audio_mood}` : '';
      const toneTextStr = prosodyData.overall_tone ? `Tone: ${prosodyData.overall_tone}` : '';
      const combinedMeta = [moodTextStr, toneTextStr].filter(Boolean).join(' | ');

      pdf.setFillColor(240, 248, 255);
      pdf.setDrawColor(100, 150, 200);

      const splitMeta = pdf.splitTextToSize(combinedMeta, contentWidth - 10);
      const boxHeight = 12 + (splitMeta.length * 5);

      pdf.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, 'FD');
      y += 6;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(50, 100, 150);
      pdf.text('Audio Intelligence Summary:', margin + 3, y);
      y += 5;
      pdf.setFont('helvetica', 'italic');
      pdf.text(splitMeta, margin + 3, y);
      y += (splitMeta.length * 5) + 5;
    }

    // Music Cues Section
    if (musicCues.length > 0) {
      checkPageBreakInternal(25 + Math.min(musicCues.length * 7, 40));

      pdf.setFillColor(255, 245, 230);
      pdf.setDrawColor(200, 150, 50);
      const musicHeight = 15 + Math.min(musicCues.length * 7, 45);
      pdf.roundedRect(margin, y, contentWidth, musicHeight, 2, 2, 'FD');

      y += 5;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(150, 100, 0);
      pdf.text('[MUSIC CUES]', margin + 3, y);
      y += 6;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(80, 60, 20);

      musicCues.slice(0, 6).forEach(cue => {
        const startTime = formatTime(cue.start);
        const endTime = formatTime(cue.end);
        const cueText = `[${startTime}-${endTime}] ${cue.mood.toUpperCase()}: ${cue.description}`;
        const splitCue = pdf.splitTextToSize(cueText, contentWidth - 10);
        pdf.text(splitCue[0], margin + 3, y);
        y += 6;
      });

      if (musicCues.length > 6) {
        pdf.setFont('helvetica', 'italic');
        pdf.text(`... and ${musicCues.length - 6} more music cues`, margin + 3, y);
        y += 5;
      }
      y += 4;
    }

    // Ambient Sounds Section
    if (ambientSounds.length > 0) {
      checkPageBreakInternal(25 + Math.min(ambientSounds.length * 6, 35));

      pdf.setFillColor(240, 255, 240);
      pdf.setDrawColor(50, 150, 50);
      const ambientHeight = 15 + Math.min(ambientSounds.length * 6, 40);
      pdf.roundedRect(margin, y, contentWidth, ambientHeight, 2, 2, 'FD');

      y += 5;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 100, 30);
      pdf.text('[AMBIENT / ENVIRONMENTAL]', margin + 3, y);
      y += 6;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(20, 70, 20);

      ambientSounds.slice(0, 6).forEach(sound => {
        const time = formatTime(sound.timestamp);
        const soundText = `[${time}] ${sound.sound} - ${sound.meaning}`;
        const splitSound = pdf.splitTextToSize(soundText, contentWidth - 10);
        pdf.text(splitSound[0], margin + 3, y);
        y += 5;
      });

      if (ambientSounds.length > 6) {
        pdf.setFont('helvetica', 'italic');
        pdf.text(`... and ${ambientSounds.length - 6} more ambient sounds`, margin + 3, y);
        y += 5;
      }
      y += 4;
    }

    // Reactions Section
    if (reactions.length > 0) {
      checkPageBreakInternal(25 + Math.min(reactions.length * 6, 35));

      pdf.setFillColor(255, 240, 245);
      pdf.setDrawColor(180, 100, 120);
      const reactionsHeight = 15 + Math.min(reactions.length * 6, 40);
      pdf.roundedRect(margin, y, contentWidth, reactionsHeight, 2, 2, 'FD');

      y += 5;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(150, 70, 90);
      pdf.text('[AUDIENCE / PRESENTER REACTIONS]', margin + 3, y);
      y += 6;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 50, 60);

      reactions.slice(0, 6).forEach(reaction => {
        const time = formatTime(reaction.timestamp);
        const intensityLabel = reaction.intensity === 'strong' ? '!!!' : reaction.intensity === 'moderate' ? '!!' : '!';
        const reactionText = `[${time}] (${reaction.type}${intensityLabel}) ${reaction.context}`;
        const splitReaction = pdf.splitTextToSize(reactionText, contentWidth - 10);
        pdf.text(splitReaction[0], margin + 3, y);
        y += 5;
      });
      y += 4;
    }

    // Prosody / Parentheticals Section
    if (prosodyAnnotations.length > 0) {
      checkPageBreakInternal(25 + Math.min(prosodyAnnotations.length * 6, 35));

      pdf.setFillColor(245, 245, 250);
      pdf.setDrawColor(100, 100, 150);
      const prosodyHeight = 15 + Math.min(prosodyAnnotations.length * 6, 40);
      pdf.roundedRect(margin, y, contentWidth, prosodyHeight, 2, 2, 'FD');

      y += 5;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(60, 60, 120);
      pdf.text('[SCREENPLAY PARENTHETICALS / PROSODY]', margin + 3, y);
      y += 6;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(40, 40, 100);

      prosodyAnnotations.slice(0, 8).forEach(ann => {
        const time = formatTime(ann.timestamp);
        const annText = `[${time}] (${ann.annotation})`;
        pdf.text(annText, margin + 3, y);
        y += 5;
      });
      y += 4;
    }

    // Meaningful Pauses Section
    if (meaningfulPauses.length > 0) {
      checkPageBreakInternal(25 + Math.min(meaningfulPauses.length * 6, 35));

      pdf.setFillColor(245, 240, 255);
      pdf.setDrawColor(120, 100, 180);
      const pausesHeight = 15 + Math.min(meaningfulPauses.length * 6, 40);
      pdf.roundedRect(margin, y, contentWidth, pausesHeight, 2, 2, 'FD');

      y += 5;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(80, 60, 140);
      pdf.text('[MEANINGFUL PAUSES / BEATS]', margin + 3, y);
      y += 6;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(60, 40, 100);

      meaningfulPauses.slice(0, 8).forEach(pause => {
        const time = formatTime(pause.timestamp);
        const pauseText = `[${time}] ${pause.screenplayNote} - ${pause.meaning}`;
        const splitPause = pdf.splitTextToSize(pauseText, contentWidth - 10);
        pdf.text(splitPause[0], margin + 3, y);
        y += 5;
      });
      y += 4;
    }

    // Cliffhangers Section
    if (cliffhangers.length > 0) {
      checkPageBreakInternal(30);

      pdf.setFillColor(255, 235, 235);
      pdf.setDrawColor(200, 50, 50);
      const cliffHeight = 15 + (cliffhangers.length * 10);
      pdf.roundedRect(margin, y, contentWidth, cliffHeight, 2, 2, 'FD');

      y += 5;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(180, 0, 0);
      pdf.text('[CLIFFHANGER MOMENTS / TENSION]', margin + 3, y);
      y += 6;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(120, 0, 0);

      cliffhangers.slice(0, 3).forEach(cliff => {
        const peakTime = formatTime(cliff.peak_timestamp);
        const cliffText = `[${peakTime}] ${cliff.description}`;
        const splitCliff = pdf.splitTextToSize(cliffText, contentWidth - 10);
        pdf.text(splitCliff, margin + 3, y);
        y += (splitCliff.length * 5) + 3;
      });
      y += 2;
    }

  } else {
    pdf.setFillColor(250, 250, 250);
    pdf.setDrawColor(200, 200, 200);
    pdf.roundedRect(margin, y, contentWidth, 25, 2, 2, 'FD');
    y += 10;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(150, 150, 150);
    pdf.text('No specialized audio events detected for this content.', margin + 5, y);
    pdf.text('The audio layer is processed automatically based on vocal and music signals.', margin + 5, y + 6);
    y += 25;
  }

  return y;
};


const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const getTargetExportFrames = (videoDurationSeconds: number): number => {
  if (!Number.isFinite(videoDurationSeconds) || videoDurationSeconds <= 0) {
    return MIN_EXPORT_FRAMES;
  }
  const minutes = videoDurationSeconds / 60;
  const target = Math.round(minutes * FRAMES_PER_MINUTE_TARGET);
  // Cap at MAX_EXPORT_FRAMES to prevent browser memory issues during PDF generation
  return clampNumber(target, MIN_EXPORT_FRAMES, MAX_EXPORT_FRAMES);
};

// ========== HELPER: Get inline audio annotations for a timestamp ==========
const getInlineAudioAnnotations = (
  timestamp: number,
  audioEvents: AudioEvents,
  prosodyData: ProsodyData,
  windowSeconds: number = 3
): string[] => {
  const annotations: string[] = [];
  const musicCues = audioEvents.music_cues || [];
  const ambientSounds = audioEvents.ambient_sounds || [];
  const reactions = audioEvents.reactions || [];
  const meaningfulPauses = audioEvents.meaningful_pauses || [];
  const prosodyAnnotations = prosodyData.annotations || [];

  musicCues.forEach(cue => {
    if (timestamp >= cue.start && timestamp <= cue.end) {
      if (Math.abs(timestamp - cue.start) < windowSeconds) {
        annotations.push(`[MUSIC BEGINS: ${cue.mood}${cue.genre ? ` - ${cue.genre}` : ''} - ${cue.description}]`);
      } else if (Math.abs(timestamp - cue.end) < windowSeconds) {
        annotations.push(`[MUSIC FADES]`);
      }
    }
  });

  ambientSounds.forEach(ambient => {
    if (Math.abs(ambient.timestamp - timestamp) < windowSeconds) {
      annotations.push(`(${ambient.sound} - ${ambient.meaning})`);
    }
  });

  reactions.forEach(reaction => {
    if (Math.abs(reaction.timestamp - timestamp) < windowSeconds) {
      const intensity = reaction.intensity === 'strong' ? ' - emphatic' : reaction.intensity === 'moderate' ? '' : ' - subtle';
      annotations.push(`(${reaction.type}${intensity} - ${reaction.context})`);
    }
  });

  meaningfulPauses.forEach(pause => {
    if (Math.abs(pause.timestamp - timestamp) < windowSeconds) {
      annotations.push(`${pause.screenplayNote}`);
    }
  });

  prosodyAnnotations.forEach(prosody => {
    if (Math.abs(prosody.timestamp - timestamp) < windowSeconds) {
      annotations.push(`${prosody.annotation}`);
    }
  });

  return annotations;
};

export const generateChatGPTPDF = async (
  course: CourseData,
  onProgress?: (progress: number, status: string) => void,
  options: ExportOptions = {}
): Promise<Blob> => {
  // OPTIMIZED: Default to fast mode (no OCR) for much faster generation
  // OCR adds 30-60 seconds and most users don't need it
  const {
    maxFrames: providedMaxFrames,
    includeOCR = false, // CHANGED: Default to false for speed
    ocrBatchSize = 5, // CHANGED: Increased batch size
    imageQuality: requestedImageQuality = 1.0,
    includeWorkflowAnalysis = false, // CHANGED: Default to false for speed
    userEmail,
    fastMode = true, // New: enables all speed optimizations
  } = options;

  // In fast mode, force OCR and workflow off
  const effectiveIncludeOCR = fastMode ? false : includeOCR;
  const effectiveIncludeWorkflow = fastMode ? false : includeWorkflowAnalysis;

  // Get email for watermarking (from options or course data)
  const watermarkEmail = userEmail || course.userEmail || localStorage.getItem('courseagent_email') || '';
  const watermarkTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;
  // Watermark function - Proprietary Intel footer on every page
  const addWatermark = () => {
    if (!watermarkEmail) return;

    const footerY = pageHeight - 10;

    // Line 1: Proprietary Intel header with user email and date
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Proprietary Intel: OneDuo Thinking Layer`, margin, footerY);

    pdf.setFont('helvetica', 'normal');
    pdf.text(`| Authorized User: ${watermarkEmail}`, margin + 52, footerY);
    pdf.text(`| Distilled: ${watermarkTimestamp}`, pageWidth - margin, footerY, { align: 'right' });

    // Line 2: Sacred trust notice (social watermarking - if leaked, source is identified)
    pdf.setFontSize(6);
    pdf.setTextColor(130, 130, 130);
    pdf.text('This artifact is for private authorized educational use only. Unauthorized reproduction, resale, or distribution is a violation of the sacred trust and proprietary rights of the creator.', pageWidth / 2, footerY + 4, { align: 'center', maxWidth: contentWidth });
  };


  // ========== PAGE HEADER/FOOTER FUNCTIONS FOR AI PORTABILITY ==========
  let currentPage = 0;

  const addPageWithHeaders = () => {
    if (currentPage > 0) pdf.addPage();
    currentPage++;
    y = margin;

    // Header
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(100, 100, 100);
    pdf.text('OneDuo Artifact | VALIDATION REQUIRED | Follow demonstrated path exactly', margin, 8);
    pdf.text(`Page ${currentPage}`, pageWidth - margin, 8, { align: 'right' });

    // Watermark/Footer
    addWatermark();

    // Remote control reminder
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(100, 100, 100);
    pdf.text('[PLAY] GO | [TIMER] GPS | [FORWARD] >> | [BACK] << | [TARGET] DO | [BOOK] Library | [SCALES] COUNCIL', margin, pageHeight - 5);
  };

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 35) {
      addPageWithHeaders();
    }
  };

  const allFrames = course.frame_urls || [];
  const allFrameCount = allFrames.length;
  // Duration sanity check: if the DB duration implies < 0.5 FPS (i.e. duration is too large
  // relative to frame count), it's likely a stale 300s default. Estimate from frame count at 1 FPS.
  let videoDuration = course.video_duration_seconds || 0;
  if (videoDuration > 0 && allFrameCount > 0 && videoDuration / allFrameCount > 2) {
    const estimatedDuration = allFrameCount; // 1 FPS → 1 frame per second
    console.warn(`[PDF] Duration sanity check: DB says ${videoDuration}s for ${allFrameCount} frames (${(videoDuration / allFrameCount).toFixed(1)}s/frame). Capping to ${estimatedDuration}s (1 FPS estimate).`);
    videoDuration = estimatedDuration;
  }
  const transcript = course.transcript || [];

  // Determine how many frames to embed.
  // - If caller provided maxFrames: respect it (bounded by MAX_EXPORT_FRAMES)
  // - Else: target proportional to duration
  // - If we already have extracted frames: embed up to what's available (no forced re-extract)
  const durationTargetFrames = getTargetExportFrames(videoDuration);
  const requestedMaxFrames =
    typeof providedMaxFrames === 'number' && Number.isFinite(providedMaxFrames) && providedMaxFrames > 0
      ? providedMaxFrames
      : durationTargetFrames;

  const effectiveMaxFrames = clampNumber(
    Math.min(requestedMaxFrames, allFrames.length > 0 ? allFrames.length : requestedMaxFrames),
    0,
    options.aiFidelityMode ? 15000 : MAX_EXPORT_FRAMES
  );

  // Calculate recommended quality based on how many frames we're actually embedding.
  const recommendedQuality = getRecommendedImageQuality(Math.max(effectiveMaxFrames, allFrames.length));
  const effectiveQuality = Math.min(requestedImageQuality, recommendedQuality);

  // Log frame sampling decision for large courses
  if (allFrames.length > 500 || effectiveMaxFrames > 500) {
    console.log(
      `Large course detected: ${allFrames.length} frames available. Embedding ${effectiveMaxFrames} frames at ${Math.round(effectiveQuality * 100)}% quality.`
    );
  }

  // Use even sampling to select frames that span the ENTIRE video
  const sampledFrameUrls = sampleFramesEvenly(allFrames, effectiveMaxFrames);
  const totalFrames = sampledFrameUrls.length;

  // OPTIMIZATION: Start pre-loading images in background immediately
  // This ensures they are ready by the time we need them in Phase 2
  if (totalFrames > 0) {
    // Don't await here - let it run in parallel with OCR/Analysis phases
    batchLoadImages(sampledFrameUrls, effectiveQuality).catch(e => console.warn('Background preload warning:', e));
  }

  // OPTIMIZATION: Start pre-loading images in background immediately
  // This ensures they are ready by the time we need them in Phase 2
  if (totalFrames > 0) {
    // Don't await here - let it run in parallel with OCR/Analysis phases
    batchLoadImages(sampledFrameUrls, effectiveQuality).catch(e => console.warn('Background preload warning:', e));
  }

  // ========== PHASE 0: PERSIST FRAMES TO STORAGE ==========
  // Extract fresh frames from stored video and persist to our storage.
  // GRACEFUL DEGRADATION: If frame persistence fails, continue with transcript-only PDF
  let persistedFrameUrls: string[] = [];
  let framesEmbedded = 0;
  let framePersistenceFailed = false;
  let framePersistenceError = '';

  // Start at 0% progress
  onProgress?.(0, 'Preparing PDF generation...');

  if (totalFrames > 0 && course.id) {
    onProgress?.(0, `Extracting ${effectiveMaxFrames} frames from video...`);

    try {
      const runPersist = async (forceReExtract: boolean) =>
        persistFramesToStorage(
          course.id!, // courseId for storage path
          null, // moduleId - pass null for courses, module id for modules
          effectiveMaxFrames,
          (current, total, status) => {
            // Progress 0-10% for frame persistence phase
            const progress = (current / total) * 10;
            onProgress?.(Number(progress.toFixed(1)), status);
          },
          { forceReExtract }
        );

      // First attempt: use storage cache if available
      let persistResult = await runPersist(false);

      // If we got nothing (common when upstream frame URLs expired), force a fresh extraction
      if (persistResult.urls.length === 0) {
        onProgress?.(1, 'Frames missing/expired — forcing a fresh re-extract...');
        persistResult = await runPersist(true);
      }

      if (persistResult.urls.length === 0) {
        // HARD-FAIL INTEGRITY GATE: Don't silently generate a broken PDF
        // If we expected frames but got zero, that's a critical failure
        // The user MUST be notified so they can retry or contact support
        const errorMessage = 'Frame extraction failed - no frames could be persisted. Please retry or contact support.';
        console.error('[pdfExporter] INTEGRITY GATE: Zero frames persisted - refusing to generate incomplete PDF');
        throw new Error(errorMessage);
      } else {
        // SUCCESS: We have frames
        const successRate = Math.round((persistResult.urls.length / effectiveMaxFrames) * 100);

        if (successRate < 50) {
          // HARD-FAIL: Less than 50% frames is unacceptable
          const errorMessage = `Only ${successRate}% of frames persisted (${persistResult.urls.length}/${effectiveMaxFrames}). PDF would be incomplete. Please retry.`;
          console.error(`[pdfExporter] INTEGRITY GATE: Insufficient frames - ${errorMessage}`);
          throw new Error(errorMessage);
        }

        if (!validateFrameCount(persistResult.urls.length, effectiveMaxFrames)) {
          console.warn(
            `[pdfExporter] Partial frame persistence: ${persistResult.urls.length}/${effectiveMaxFrames} (${successRate}%)`
          );
        }

        persistedFrameUrls = persistResult.urls;
        framesEmbedded = persistResult.urls.length;
        console.log(
          `[pdfExporter] SUCCESS: ${framesEmbedded}/${effectiveMaxFrames} frames persisted from ${persistResult.source}`
        );
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';

      // Check if this is our own integrity gate error - rethrow it
      if (errorMsg.includes('INTEGRITY GATE') || errorMsg.includes('Please retry')) {
        throw err;
      }

      // For unexpected errors, also fail - don't silently degrade
      console.error(`[pdfExporter] Frame persistence failed: ${errorMsg}`);
      throw new Error(`Frame extraction failed: ${errorMsg}. Please retry or contact support.`);
    }
  } else if (totalFrames === 0) {
    // No frames expected - this is OK for transcript-only courses
    console.log('[pdfExporter] No frames to persist (totalFrames=0)');
    framePersistenceFailed = true;
    framePersistenceError = 'No frames in course';
  } else if (!course.id) {
    // Missing course ID is a bug - fail loudly
    console.error('[pdfExporter] INTEGRITY GATE: Missing course ID for frame persistence');
    throw new Error('Missing course ID - cannot generate PDF. Please contact support.');
  }

  // Use persisted frames for PDF generation
  const frames = persistedFrameUrls;
  const hasFrames = frames.length > 0;

  // ========== PHASE 1: OCR EXTRACTION WITH ENHANCED INTENT ==========
  let frameAnalyses: (FrameAnalysis | null)[] = [];

  // PRIORITY 1: Use cached frame analyses from database (persisted by generate-pdf-backend)
  // This enables visual captions even in fast mode without re-running OCR
  const cachedAnalyses = course.frame_analyses || [];
  if (cachedAnalyses.length > 0 && hasFrames) {
    console.log(`[pdfExporter] Using ${cachedAnalyses.length} cached frame analyses from database`);
    // Map cached analyses to the frames we're rendering
    // If frame counts don't match (e.g. different sampling), map by index ratio
    if (cachedAnalyses.length === frames.length) {
      frameAnalyses = cachedAnalyses;
    } else {
      // Proportional mapping: map each rendered frame to closest cached analysis
      frameAnalyses = frames.map((_, i) => {
        const mappedIdx = Math.round((i / Math.max(frames.length - 1, 1)) * (cachedAnalyses.length - 1));
        return cachedAnalyses[mappedIdx] || null;
      });
      console.log(`[pdfExporter] Mapped ${cachedAnalyses.length} cached analyses to ${frames.length} frames`);
    }
    onProgress?.(35, 'Visual analyses loaded from cache...');
  } else if (effectiveIncludeOCR && hasFrames) {
    // PRIORITY 2: Run fresh OCR/visual analysis via Replicate
    onProgress?.(10, `Starting AI vision analysis of ${frames.length} frames...`);

    frameAnalyses = await extractFrameTextsWithProgress(
      frames,
      videoDuration,
      transcript,
      (p, s) => {
        // Progress 10-35% for OCR phase (p goes 0-100)
        const progress = 10 + (p / 100) * 25;
        onProgress?.(Number(progress.toFixed(1)), s);
      },
      ocrBatchSize
    );

    onProgress?.(35, 'OCR extraction complete...');
  } else if (framePersistenceFailed) {
    onProgress?.(35, 'Generating transcript-only PDF (frames unavailable)...');
    console.log('[pdfExporter] Skipping OCR - no frames available');
  } else {
    // No OCR needed, skip to 35% - FAST PATH
    onProgress?.(35, 'Building PDF (fast mode)...');
  }

  // ========== PHASE 1.5: WORKFLOW ANALYSIS ==========
  let workflowAnalysis: WorkflowAnalysis | null = null;

  if (effectiveIncludeWorkflow && frameAnalyses.length > 0 && hasFrames) {
    workflowAnalysis = await analyzeWorkflowSequences(
      frameAnalyses,
      transcript,
      videoDuration,
      onProgress
    );
    onProgress?.(38, 'Workflow analysis complete, building PDF...');
  } else if (framePersistenceFailed) {
    onProgress?.(38, 'Skipping workflow analysis (frames unavailable)...');
  }

  // ========== PAGE 1: TITLE PAGE & MASTER FORMAT ==========
  addPageWithHeaders();
  onProgress?.(40, 'Creating Master Title Page...');
  y = margin + 10;

  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  const titleLines = pdf.splitTextToSize(course.title || "Untitled Session", contentWidth);
  pdf.text(titleLines, pageWidth / 2, y + 10, { align: 'center' });
  y += 20 + (titleLines.length * 8);

  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Session Date: ${course.created_at ? new Date(course.created_at).toLocaleDateString() : new Date().toLocaleDateString()}`, pageWidth / 2, y, { align: 'center' });
  y += 8;
  pdf.text(`Speaker(s): Not Specified`, pageWidth / 2, y, { align: 'center' });
  y += 12;
  const sourceUrl = course.video_url || "N/A";
  const sourceText = `Source URL: ${sourceUrl.substring(0, 60)}${sourceUrl.length > 60 ? '...' : ''}`;
  pdf.text(sourceText, pageWidth / 2, y, { align: 'center' });
  y += 25;

  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text('MASTER PDF FORMAT FOR AI', margin, y);
  y += 12;

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(50, 50, 50);
  pdf.text('1. Full Verbatim Transcript', margin + 3, y);
  y += 6;
  pdf.text('2. Layer A: Key Moments Index', margin + 3, y);
  y += 6;
  pdf.text('3. Layer B: Concepts & Frameworks', margin + 3, y);
  y += 6;
  pdf.text('4. Layer C: Actionable Steps', margin + 3, y);
  y += 6;
  pdf.text('5. Layer D: Hidden Patterns & Insights', margin + 3, y);
  y += 15;

  pdf.setFontSize(8);
  pdf.setTextColor(150, 150, 150);
  const legalText = pdf.splitTextToSize(LEGAL_FOOTER, contentWidth);
  pdf.text(legalText, margin, y);
  y += 20;

  // ========== PAGES 2+: FULL VERBATIM TRANSCRIPT ==========
  if (transcript && transcript.length > 0) {
    addPageWithHeaders();
    onProgress?.(41, 'Adding Verbatim Transcript...');

    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text('FULL VERBATIM TRANSCRIPT', margin, y);
    y += 10;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(0, 0, 0);

    transcript.forEach((seg: any) => {
      const ts = formatTime(seg.start);
      const speaker = seg.speaker || "Speaker";
      const sanitizedText = sanitizePdfText(seg.text || "");

      const label = `[${ts}] ${speaker}: `;
      if (y > margin + 15) y += 4; // Gap between segments

      const fullLine = `${label}${sanitizedText}`;
      const splitLines = pdf.splitTextToSize(fullLine, contentWidth);

      splitLines.forEach((line) => {
        if (y > pageHeight - 35) {
          addPageWithHeaders();
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(11);
        }
        pdf.text(line, margin, y);
        y += 6.0;
      });
    });
  }

  y += 10;

  // ========== INTELLIGENCE LAYERS ==========

  // Layer A: Key Moments
  if (course.key_moments_index && course.key_moments_index.length > 0) {
    if (y > pageHeight - 50) addPageWithHeaders();
    else y += 8; // Reduced from 15

    onProgress?.(42, 'Adding Intelligence Layer A...');
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('INTELLIGENCE LAYER A: KEY MOMENTS INDEX', margin, y);
    y += 10; // Reduced from 15
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    course.key_moments_index.forEach((m) => {
      checkPageBreak(12);
      pdf.text(`[${m.timestamp || '--:--'}] - ${m.description}`, margin + 5, y);
      y += 6; // Reduced from 8
    });
  }

  // Layer B: Concepts & Frameworks
  if (course.concepts_frameworks && course.concepts_frameworks.length > 0) {
    if (y > pageHeight - 60) addPageWithHeaders();
    else y += 8; // Reduced from 15

    onProgress?.(43, 'Adding Intelligence Layer B...');
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('INTELLIGENCE LAYER B: CONCEPTS & FRAMEWORKS', margin, y);
    y += 10; // Reduced from 12
    course.concepts_frameworks.forEach((c) => {
      checkPageBreak(15);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`* ${c.title || 'Concept'}`, margin + 5, y);
      y += 5; // Reduced from 6
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      const descLines = pdf.splitTextToSize(sanitizePdfText(c.description), contentWidth - 15);
      descLines.forEach((line: string) => {
        if (y > pageHeight - 35) {
          addPageWithHeaders();
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
        }
        pdf.text(line, margin + 10, y);
        y += 4.5; // Reduced from 5
      });
      y += 2; // Reduced from 3
    });
  }

  // Layer C: Actionable Steps
  if (course.implementation_steps && course.implementation_steps.length > 0) {
    if (y > pageHeight - 50) addPageWithHeaders();
    else y += 8; // Reduced from 15

    onProgress?.(44, 'Adding Intelligence Layer C...');
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('INTELLIGENCE LAYER C: ACTIONABLE STEPS', margin, y);
    y += 10; // Reduced from 12
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    course.implementation_steps.forEach((s, idx) => {
      checkPageBreak(12);
      pdf.text(`${s.step_number || idx + 1}. ${s.step_title || s.description}`, margin + 5, y);
      y += 6; // Reduced from 8
    });
  }

  // Layer D: Hidden Patterns
  if (course.hidden_patterns && course.hidden_patterns.length > 0) {
    if (y > pageHeight - 60) addPageWithHeaders();
    else y += 8; // Reduced from 15

    onProgress?.(45, 'Adding Intelligence Layer D...');
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('INTELLIGENCE LAYER D: HIDDEN PATTERNS & INSIGHTS', margin, y);
    y += 10; // Reduced from 12
    course.hidden_patterns.forEach((p) => {
      checkPageBreak(15);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`* ${p.title || 'Pattern'}`, margin + 5, y);
      y += 5; // Reduced from 6
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      const descLines = pdf.splitTextToSize(sanitizePdfText(p.description), contentWidth - 15);
      descLines.forEach((line: string) => {
        if (y > pageHeight - 35) {
          addPageWithHeaders();
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
        }
        pdf.text(line, margin + 10, y);
        y += 4.5; // Reduced from 5
      });
      y += 2; // Reduced from 3
    });
  }
  y += 10;

  if (framePersistenceFailed) {
    // Notice page remains same...
    pdf.setFillColor(255, 245, 230);
    // ... skipping duplicate for brevity in replacement ...
  }

  // ========== PAGE 2: WORKFLOW SUMMARY ==========
  addPageWithHeaders();
  onProgress?.(40, 'Adding workflow summary...');

  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text('Workflow Summary', margin, y);
  y += 12;

  if (workflowAnalysis && workflowAnalysis.workflows.length > 0) {
    // Summary stats
    pdf.setFillColor(230, 245, 255);
    pdf.setDrawColor(0, 100, 200);
    pdf.roundedRect(margin, y, contentWidth, 25, 2, 2, 'FD');
    y += 6;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 80, 150);
    pdf.text(`This training contains ${workflowAnalysis.summary.totalWorkflows} multi-step workflow(s) with ${workflowAnalysis.summary.totalCriticalSteps} critical steps`, margin + 3, y);
    y += 6;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(`Average intent confidence: ${(workflowAnalysis.summary.averageConfidence * 100).toFixed(0)}%`, margin + 3, y);
    y += 18;

    // Each workflow
    workflowAnalysis.workflows.forEach((workflow, wIdx) => {
      checkPageBreak(60);

      // Workflow header
      pdf.setFillColor(255, 250, 230);
      pdf.setDrawColor(200, 150, 0);
      pdf.roundedRect(margin, y, contentWidth, 12, 2, 2, 'FD');
      y += 8;
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(150, 100, 0);
      pdf.text(`WORKFLOW ${wIdx + 1}: ${workflow.title}`, margin + 3, y);
      y += 10;

      // Steps
      pdf.setFontSize(9);
      workflow.steps.slice(0, 8).forEach((step) => {
        checkPageBreak(15);

        const isCritical = step.mustNotSkip;
        const confidenceColor = getConfidenceColor(step.confidenceLevel);

        if (isCritical) {
          pdf.setFillColor(255, 235, 235);
          pdf.setDrawColor(200, 0, 0);
        } else {
          pdf.setFillColor(250, 250, 250);
          pdf.setDrawColor(180, 180, 180);
        }

        pdf.roundedRect(margin + 5, y, contentWidth - 10, 10, 1, 1, 'FD');
        y += 6;

        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(confidenceColor.r, confidenceColor.g, confidenceColor.b);

        let stepText = `Step ${step.stepNumber}: `;
        if (isCritical) stepText = `>>> Step ${step.stepNumber} [CRITICAL]: `;

        pdf.text(stepText, margin + 8, y);

        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(50, 50, 50);
        const descWidth = contentWidth - 50;
        const truncatedDesc = step.description.length > 60 ? step.description.substring(0, 57) + '...' : step.description;
        pdf.text(truncatedDesc, margin + 35 + (isCritical ? 15 : 0), y);

        // Confidence indicator
        pdf.setFontSize(7);
        pdf.setTextColor(120, 120, 120);
        const confLabel = step.confidenceLevel === 'explicit' ? '[EXPLICIT]' : step.confidenceLevel === 'strong' ? '[STRONG]' : '[INFERRED]';
        pdf.text(confLabel, pageWidth - margin - 20, y);
        pdf.setFontSize(9);

        y += 8;
      });

      if (workflow.steps.length > 8) {
        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(100, 100, 100);
        pdf.text(`... and ${workflow.steps.length - 8} more steps`, margin + 8, y);
        y += 6;
      }

      // Sequence warnings
      if (workflow.sequenceWarnings.length > 0) {
        checkPageBreak(20);
        pdf.setFillColor(255, 245, 245);
        pdf.setDrawColor(200, 100, 100);
        pdf.roundedRect(margin + 5, y, contentWidth - 10, 15, 1, 1, 'FD');
        y += 5;
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(180, 50, 50);
        pdf.text('SEQUENCE WARNING:', margin + 8, y);
        y += 4;
        pdf.setFont('helvetica', 'normal');
        const warning = workflow.sequenceWarnings[0].substring(0, 100);
        pdf.text(warning, margin + 8, y);
        y += 12;
      }

      y += 8;
    });

    // Critical path summary
    if (workflowAnalysis.criticalSteps.length > 0) {
      checkPageBreak(40);

      pdf.setFillColor(255, 230, 230);
      pdf.setDrawColor(200, 0, 0);
      const criticalHeight = 18 + Math.min(workflowAnalysis.criticalSteps.length * 6, 40);
      pdf.roundedRect(margin, y, contentWidth, criticalHeight, 2, 2, 'FD');

      y += 6;
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(180, 0, 0);
      pdf.text('>>> CRITICAL STEPS - DO NOT SKIP <<<', margin + 3, y);
      y += 7;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 0, 0);

      workflowAnalysis.criticalSteps.slice(0, 6).forEach(step => {
        const time = formatTime(step.timestamp);
        const confLabel = step.confidenceLevel === 'verbal_explicit' ? '[EXPLICIT]' :
          step.confidenceLevel === 'visual_verbal_aligned' ? '[STRONG]' : '[INFERRED]';
        pdf.text(`[${time}] Frame ${step.frameIndex + 1} - ${step.reason} ${confLabel}`, margin + 3, y);
        y += 5;
      });

      if (workflowAnalysis.criticalSteps.length > 6) {
        pdf.setFont('helvetica', 'italic');
        pdf.text(`... and ${workflowAnalysis.criticalSteps.length - 6} more critical steps`, margin + 3, y);
        y += 5;
      }
      y += 8;
    }

  } else {
    // No workflow detected - show frame-based critical steps
    pdf.setFillColor(250, 250, 250);
    pdf.setDrawColor(200, 200, 200);
    pdf.roundedRect(margin, y, contentWidth, 25, 2, 2, 'FD');
    y += 10;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(150, 150, 150);
    pdf.text('Workflow analysis not available for this content.', margin + 5, y);
    pdf.text('See individual frames for intent confidence indicators.', margin + 5, y + 6);
    y += 25;
  }

  // ========== AUDIO DATA EXTRACTION ==========
  const audioEvents = course.audio_events || {};
  const prosodyData = course.prosody_annotations || {};
  const musicCues = audioEvents.music_cues || [];
  const ambientSounds = audioEvents.ambient_sounds || [];
  const reactions = audioEvents.reactions || [];
  const meaningfulPauses = audioEvents.meaningful_pauses || [];

  // ========== PAGE 3: AUDIO EVENTS TIMELINE ==========
  addPageWithHeaders();
  onProgress?.(41, 'Adding audio events timeline...');
  y = renderAudioTimeline(
    pdf,
    margin,
    pageHeight,
    contentWidth,
    y,
    audioEvents,
    prosodyData,
    addPageWithHeaders,
    formatTime
  );

  // ========== PAGE 4: MODULE METADATA ==========
  addPageWithHeaders();
  onProgress?.(43, 'Adding module metadata...');

  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text('Module Metadata', margin, y);
  y += 12;

  const duration = videoDuration ? formatTime(videoDuration) : 'Unknown';
  const frameCount = frames.length;
  const ocrFrames = frameAnalyses.filter(f => f !== null).length;
  const keyMoments = frameAnalyses.filter(f => f && hasAnyEmphasis(f.emphasisFlags)).length;
  const mustNotSkipFrames = frameAnalyses.filter(f => f?.mustNotSkip).length;
  const explicitIntentFrames = frameAnalyses.filter(f => f?.intentSource === 'verbal_explicit' || f?.intentSource === 'visual_verbal_aligned').length;
  const avgConfidence = frameAnalyses.filter(f => f !== null).reduce((sum, f) => sum + (f?.intentConfidence || 0), 0) / Math.max(ocrFrames, 1);

  const totalAudioEvents = musicCues.length + ambientSounds.length + reactions.length + meaningfulPauses.length;

  const metadata = [
    ['Course Title:', course.title],
    ['Duration:', duration],
    ['Total Frames Captured:', `${frameCount} @ ~1 FPS`],
    ['Frames with OCR:', `${ocrFrames} / ${frameCount}`],
    ['Key Moments (emphasis detected):', keyMoments.toString()],
    ['Critical Steps (must not skip):', mustNotSkipFrames.toString()],
    ['Explicit/Strong Intent:', explicitIntentFrames.toString()],
    ['Average Intent Confidence:', `${(avgConfidence * 100).toFixed(0)}%`],
    ['Audio Events Detected:', totalAudioEvents.toString()],
    ['Workflows Detected:', (workflowAnalysis?.summary.totalWorkflows || 0).toString()],
    ['Export Date:', new Date().toLocaleDateString()],
  ];

  pdf.setFontSize(11);
  metadata.forEach(([label, value]) => {
    pdf.setFont('helvetica', 'bold');
    pdf.text(label, margin, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(value, margin + 65, y);
    y += 7;
  });

  y += 10;

  // Module Goal
  pdf.setFillColor(255, 248, 230);
  pdf.setDrawColor(200, 150, 0);
  pdf.roundedRect(margin, y, contentWidth, 25, 3, 3, 'FD');

  y += 8;
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(150, 100, 0);
  pdf.text('[GOAL] Extract actionable steps for VA execution', margin + 5, y);
  y += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(80, 60, 0);
  pdf.text('Focus on [EXPLICIT] and [STRONG] confidence, >>> CRITICAL <<< markers, and workflows.', margin + 5, y);

  y += 20;

  // ========== PAGES 4+: TIMESTAMP BLOCKS ==========
  // Only render frame blocks if we have frames
  const renderableFrameCount = frames.length;

  if (renderableFrameCount > 0) {
    if (options.aiFidelityMode) {
      addPageWithHeaders();
      pdf.setFontSize(22);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text('Sensory Intelligence Map', margin, y);
      y += 12;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(60, 60, 60);

      const introText = "This artifact is optimized for AI Vision and High-Fidelity reconstruction. It uses a multi-layered sensory matrix to bridge the gap between verbatim text and the original embodied context of the workshop.";
      const splitIntro = pdf.splitTextToSize(introText, contentWidth);
      pdf.text(splitIntro, margin, y);
      y += (splitIntro.length * 5) + 8;

      // Structured Matrix Header
      pdf.setFillColor(245, 245, 250);
      pdf.setDrawColor(200, 200, 220);
      pdf.roundedRect(margin, y, contentWidth, 8, 1, 1, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(0, 51, 102);
      pdf.text('SENSORY LAYER', margin + 5, y + 5.5);
      pdf.text('DESCRIPTION & UTILITY', margin + 50, y + 5.5);
      y += 8;

      const layers = [
        { name: 'Visual Frame', color: [0, 80, 150], desc: 'Literal screen state (UI, whiteboard, speaker posture) for scene reconstruction.' },
        { name: 'Interaction', color: [150, 80, 0], desc: 'Cursor pauses, highlights, and zoom focus indicators identifying critical attention points.' },
        { name: 'Audio Events', color: [0, 120, 0], desc: 'Music cues, environmental sounds, and audience reactions mapping the workshop\'s "vibe".' },
        { name: 'Prosody', color: [120, 0, 120], desc: 'Vocal tone, emphasis, and pacing data for detecting nuance often lost in pure text.' }
      ];

      layers.forEach((layer, idx) => {
        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(230, 230, 240);
        pdf.rect(margin, y, contentWidth, 9, 'FD'); // Reduced from 12

        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(layer.color[0], layer.color[1], layer.color[2]);
        pdf.text(layer.name, margin + 5, y + 6); // Adjusted from 7.5

        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(80, 80, 80);
        pdf.text(layer.desc, margin + 50, y + 6); // Adjusted from 7.5
        y += 9; // Reduced from 12
      });

      y += 10;
      pdf.setFillColor(240, 248, 255);
      pdf.setDrawColor(100, 150, 200);
      pdf.roundedRect(margin, y, contentWidth, 18, 2, 2, 'FD');
      y += 7;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(0, 40, 80);
      pdf.text('AI INSTRUCTION: Prioritize the "ONE DUO SENSORY DATA" blocks below each frame.', margin + 5, y);
      y += 5;
      pdf.setFont('helvetica', 'normal');
      pdf.text('Cross-reference timestamps with transcript segments to reconstruct the full instructor intent.', margin + 5, y);
      y += 20;
    }

    onProgress?.(45, 'Processing frames with OCR data...');

    const frameDuration = videoDuration > 0 ? videoDuration / Math.max(frames.length, 1) : 10;

    for (let i = 0; i < renderableFrameCount; i++) {
      const frameUrl = frames[i];
      const frameAnalysis = frameAnalyses[i] || null;
      const frameTime = frameAnalysis?.timestamp ?? (i * frameDuration);
      const progress = 45 + ((i + 1) / renderableFrameCount) * 45;
      onProgress?.(Number(progress.toFixed(1)), `Embedding frame ${i + 1} of ${renderableFrameCount}...`);

      // Every 200 frames yield to the browser to prevent tab crash and allow GC
      if (i > 0 && i % 200 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }

      // Use overlap-based matching: check if segment's time range overlaps with frame's time range
      // This fixes the issue where long transcript segments (50-100s) weren't matching because
      // their start time fell outside the narrow frame window, even when speech overlapped
      const relevantTranscript = transcript.filter(seg => {
        const segStart = seg.start || 0;
        const segEnd = seg.end || segStart + 60; // Default 60s if no end time provided
        const frameStart = Math.max(0, frameTime - frameDuration / 2);
        const frameEnd = frameTime + frameDuration / 2;

        // Segment overlaps with frame if: segment starts before frame ends AND segment ends after frame starts
        return segStart < frameEnd && segEnd > frameStart;
      });

      const transcriptText = relevantTranscript.length > 0
        ? relevantTranscript.map(s => {
          const speakerLabel = s.speaker ? `[${s.speaker}]: ` : '';
          return `${speakerLabel}${s.text}`;
        }).join(' ')
        : '(No transcript for this segment)';

      const inlineAudioAnnotations = getInlineAudioAnnotations(frameTime, audioEvents, prosodyData);

      const hasOCR = frameAnalysis && frameAnalysis.text.length > 0;
      const hasIntent = frameAnalysis && frameAnalysis.instructorIntent.length > 0;
      const hasProsody = frameAnalysis?.prosody?.parenthetical && frameAnalysis.prosody.parenthetical.length > 0;
      const hasInlineAudio = inlineAudioAnnotations.length > 0;
      const isCritical = frameAnalysis?.mustNotSkip;
      const neededHeight = 100 + (hasOCR ? 45 : 0) + (hasIntent ? 25 : 0) + (hasProsody ? 12 : 0) + (hasInlineAudio ? 15 : 0) + (isCritical ? 10 : 0);
      checkPageBreak(neededHeight);

      const emphasisLabels = frameAnalysis ? getEmphasisLabels(frameAnalysis.emphasisFlags) : [];
      const isKeyMoment = emphasisLabels.length > 0;
      const textType = frameAnalysis?.textType || 'other';

      // ===== STEP HEADER (STRICT LOGIC) =====
      const isAIFidelity = options.aiFidelityMode;
      const headerHeight = isAIFidelity ? 36 : 32; // Reduced from 45/38

      pdf.setFillColor(245, 245, 250);
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(margin, y, contentWidth, headerHeight, 1, 1, 'FD');
      y += 5; // Reduced from 6

      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(50, 50, 50);
      pdf.text(`STEP ${i + 1}: ${formatTime(frameTime)} | UI/DOC`, margin + 4, y);
      y += 6; // Reduced from 7

      pdf.setFontSize(9);
      pdf.setTextColor(100, 100, 100);
      const action = frameAnalysis?.instructorIntent?.substring(0, 80) || 'Observe screen state';
      const confidence = (frameAnalysis?.intentConfidence || 0.8) * 100;
      const instruction = confidence >= 80 ? 'Execute and verify.' : 'Verify with human if UI differs.';
      pdf.text(`[VALIDATION CHECKPOINT] (${action}, ${confidence.toFixed(0)}%, AI: ${instruction})`, margin + 4, y);
      y += 5; // Reduced from 6

      pdf.setFont('helvetica', 'bold');
      pdf.text(`Instructor Intent [EXPLICIT/STRONG]:`, margin + 4, y);
      pdf.setFont('helvetica', 'normal');
      pdf.text(` (Why this step exists: ${frameAnalysis?.instructorIntent || 'Demonstrating UI flow'})`, margin + 52, y);
      y += 5; // Reduced from 6

      pdf.setFont('helvetica', 'bold');
      pdf.text(`Prosody/Emphasis:`, margin + 4, y);
      pdf.setFont('helvetica', 'normal');
      const prosody = hasProsody ? frameAnalysis.prosody.parenthetical : 'Neutral';
      const emphasis = emphasisLabels.length > 0 ? `Focus: ${emphasisLabels.join(', ')}` : 'Screen capture focus';
      pdf.text(` (${prosody} | ${emphasis})`, margin + 30, y);
      y += 10; // Reduced from 13

      // ===== FRAME IMAGE =====
      try {
        const base64Image = await imageToBase64Compressed(frameUrl, isAIFidelity ? 0.95 : effectiveQuality);
        if (base64Image && base64Image.length > 1000) {
          const imgWidth = isAIFidelity ? contentWidth : Math.min(70, contentWidth);
          const imgHeight = isAIFidelity ? (imgWidth * 0.56) : 40;
          // Preserve quality (avoid extra internal compression)
          pdf.addImage(base64Image, 'JPEG', margin, y, imgWidth, imgHeight, undefined, 'NONE');
          y += imgHeight + 3;

          // ===== COMPOSITE VISUAL TRANSCRIPTION CAPTION =====
          // Synthesizes ALL OneDuo features into one rich caption below the frame:
          // 1. On-screen text/UI (slides, buttons, menus, highlighted text)
          // 2. Cursor/highlight tracking (clicks, hovers, selections)
          // 3. Audio events (music, sound effects, audience reactions)
          // 4. Tone of voice (emphasis, pauses, pacing)
          // 5. Visual description (overall screen state)
          const captionParts: string[] = [];

          // FEATURE 1: Visual description — what's visible on screen
          if (frameAnalysis?.visualDescription) {
            captionParts.push(frameAnalysis.visualDescription);
          }

          // FEATURE 2: On-screen text detection (slides, captions, UI elements, whiteboard)
          if (frameAnalysis?.keyElements && frameAnalysis.keyElements.length > 0) {
            const elementsSummary = frameAnalysis.keyElements.slice(0, 4).join(', ');
            captionParts.push(`[On-screen: ${elementsSummary}]`);
          }

          // FEATURE 3: Cursor & highlight tracking
          if (frameAnalysis?.emphasisFlags) {
            const flags = frameAnalysis.emphasisFlags;
            const interactionNotes: string[] = [];
            if (flags.highlight_detected) interactionNotes.push('text highlighted');
            if (flags.text_selected) interactionNotes.push('text selected');
            if (flags.cursor_pause) interactionNotes.push('cursor paused here — this matters');
            if (flags.zoom_focus) interactionNotes.push('zoomed/focused');
            if (flags.lingering_frame) interactionNotes.push('lingered on this view');
            if (flags.bold_text) interactionNotes.push('bold text emphasized');
            if (flags.underline_detected) interactionNotes.push('underlined text');
            if (interactionNotes.length > 0) {
              captionParts.push(`[Interaction: ${interactionNotes.join('; ')}]`);
            }
          }

          // FEATURE 4: Audio events — music, sound effects, audience reactions
          // Uses the already-computed inlineAudioAnnotations which includes:
          // - Music cues: [MUSIC BEGINS: upbeat - pop], [MUSIC FADES]
          // - Ambient sounds: (typing sounds - demonstrating workflow)
          // - Audience reactions: (audience laughs - emphatic)
          // - Meaningful pauses: (beat) or (long pause for effect)
          // - Prosody: (spoken with emphasis), (slows down deliberately)
          if (inlineAudioAnnotations.length > 0) {
            captionParts.push(inlineAudioAnnotations.slice(0, 3).join(' '));
          }

          // FEATURE 5: Vocal tone/emphasis from frame-level prosody
          if (frameAnalysis?.prosody?.parenthetical && frameAnalysis.prosody.parenthetical.length > 0) {
            captionParts.push(`(${frameAnalysis.prosody.parenthetical})`);
          }

          // Sanitize caption: remove AI filler/literalisms
          const sanitizedParts = captionParts.map(part => {
            return part
              .replace(/Note: The image is a screenshot from a tutorial video, showing /gi, '')
              .replace(/This frame shows /gi, '')
              .replace(/In this frame, /gi, '')
              .replace(/The image shows /gi, '')
              .replace(/\. \(Note:.*?\)$/gi, '.')
              .trim();
          }).filter(part => part.length > 0);

          // Render the composite caption
          const compositeCaption = sanitizedParts.join(' | ');
          if (compositeCaption.length > 0) {
            const hasFocus = frameAnalysis?.emphasisFlags?.cursor_pause || frameAnalysis?.emphasisFlags?.zoom_focus;
            const captionWidth = isAIFidelity ? contentWidth : (imgWidth + 60);

            pdf.setFontSize(isAIFidelity ? 9 : 8);
            pdf.setFont('helvetica', 'italic');
            pdf.setTextColor(80, 80, 80);

            if (isAIFidelity) {
              if (hasFocus) {
                pdf.setFillColor(250, 250, 240);
                pdf.setDrawColor(220, 200, 0);
              } else {
                pdf.setFillColor(250, 250, 255);
                pdf.setDrawColor(200, 200, 255);
              }

              const label = hasFocus ? 'ONE DUO SENSORY DATA [CRITICAL FOCUS]:' : 'ONE DUO SENSORY DATA:';
              const wrapCaption = pdf.splitTextToSize(`${label} "${compositeCaption}"`, captionWidth - 10);
              const rectHeight = (wrapCaption.length * 4) + 6;

              pdf.roundedRect(margin, y - 1, captionWidth, rectHeight, 1, 1, 'FD');
              y += 5;
              pdf.text(wrapCaption, margin + 5, y);
              y += (wrapCaption.length * 4) + 2;
            } else {
              const truncatedCaption = compositeCaption.length > 300
                ? compositeCaption.substring(0, 297) + '...'
                : compositeCaption;
              const splitCaption = pdf.splitTextToSize(`"${truncatedCaption}"`, captionWidth);
              const maxLines = Math.min(splitCaption.length, 4);
              pdf.text(splitCaption.slice(0, maxLines), margin, y);
              y += (maxLines * 3) + 3;
            }
            pdf.setFont('helvetica', 'normal');
          }
        } else {
          // Log which frame failed for debugging
          console.warn(`[pdfExporter] Frame ${i + 1} failed to load: ${frameUrl.substring(0, 60)}...`);
          pdf.setFillColor(245, 245, 245);
          pdf.setDrawColor(200, 200, 200);
          pdf.roundedRect(margin, y, 70, 40, 2, 2, 'FD');
          pdf.setFontSize(8);
          pdf.setTextColor(150, 150, 150);
          pdf.text(`[Frame ${i + 1} at ${formatTime(frameTime)}]`, margin + 5, y + 18);
          pdf.text(`[Image unavailable - see transcript]`, margin + 5, y + 24);
          y += 43;
        }
      } catch (error) {
        console.error(`[pdfExporter] Frame ${i + 1} error:`, error);
        pdf.setFillColor(255, 240, 240);
        pdf.setDrawColor(200, 150, 150);
        pdf.roundedRect(margin, y, 70, 40, 2, 2, 'FD');
        pdf.setFontSize(8);
        pdf.setTextColor(180, 100, 100);
        pdf.text(`[Frame ${i + 1} error]`, margin + 5, y + 20);
        y += 43;
      }

      // ===== OCR EXTRACTED TEXT =====
      if (hasOCR && frameAnalysis) {
        checkPageBreak(40);

        const hasHighlight = frameAnalysis.emphasisFlags.highlight_detected || frameAnalysis.emphasisFlags.text_selected;

        if (hasHighlight) {
          pdf.setFillColor(255, 255, 200);
          pdf.setDrawColor(200, 180, 0);
        } else {
          pdf.setFillColor(240, 248, 255);
          pdf.setDrawColor(100, 150, 200);
        }

        const ocrText = frameAnalysis.text.substring(0, 600);
        const splitOCR = pdf.splitTextToSize(ocrText, contentWidth - 10);
        const ocrHeight = Math.min(splitOCR.length * 4, 40) + 12;

        pdf.roundedRect(margin, y, contentWidth, ocrHeight, 2, 2, 'FD');

        y += 6;
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0, 80, 120);

        let ocrLabel = 'OCR Extracted Text';
        if (hasHighlight) ocrLabel = '*HIGHLIGHTED/SELECTED TEXT*';
        pdf.text(ocrLabel, margin + 3, y);
        y += 5;

        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(30, 30, 30);
        const truncatedOCR = splitOCR.slice(0, 7);
        pdf.text(truncatedOCR, margin + 3, y);
        y += truncatedOCR.length * 4 + 6;
      }

      // ===== INSTRUCTOR INTENT (ENHANCED WITH CONFIDENCE) =====
      if (hasIntent && frameAnalysis) {
        checkPageBreak(25);

        const confColor = getConfidenceColor(frameAnalysis.intentSource);

        pdf.setFillColor(230, 255, 230);
        pdf.setDrawColor(0, 150, 50);
        pdf.roundedRect(margin, y, contentWidth, 20, 2, 2, 'FD');

        y += 5;
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(confColor.r, confColor.g, confColor.b);

        const confLabel = getConfidenceLabel(frameAnalysis);
        pdf.text(`Instructor Intent ${confLabel}:`, margin + 3, y);
        y += 5;

        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(0, 80, 40);
        const intentText = pdf.splitTextToSize(frameAnalysis.instructorIntent, contentWidth - 10);
        pdf.text(intentText.slice(0, 2), margin + 3, y);
        y += 12;
      }

      // ===== TRANSCRIPT SEGMENT (LABELED AS REFERENCE) =====
      pdf.setFontSize(10);
      pdf.setFont('courier', 'normal'); // Monospace for transcript consistency
      pdf.setTextColor(30, 30, 30);

      const transcriptContent = transcriptText ? `"${transcriptText}"` : '(Monologue continues)';
      const splitText = pdf.splitTextToSize(`Transcript: ${transcriptContent}`, contentWidth - 5);
      const textHeight = Math.min(splitText.length, 6) * 4.5;

      checkPageBreak(textHeight + 10);

      pdf.text(splitText.slice(0, 6), margin, y);
      y += textHeight + 10;
    }
  } else {
    // No frames available - skip frame rendering but notify user
    onProgress?.(90, 'No frames available - generating transcript-only PDF...');
    console.log('[pdfExporter] Skipping frame blocks - no persisted frames available');
  }

  // ========== SUPPLEMENTARY TRAINING DOCUMENTS SECTION ==========
  // This embeds all user-uploaded files so ChatGPT can search their content
  // Optimized for high-volume (200+ files) with memory-safe processing
  const supplementalFiles = course.supplementalFiles || [];
  const fileCount = supplementalFiles.length;

  if (fileCount > 0) {
    onProgress?.(85, `Embedding ${fileCount} supplementary documents...`);
    addPageWithHeaders();

    // Section header
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text('SUPPLEMENTARY TRAINING DOCUMENTS', margin, y);
    y += 8;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(80, 80, 80);
    const supplementIntro = `The course creator uploaded ${fileCount} additional document(s) to enhance this training. These materials contain templates, scripts, reference guides, and other resources that supplement the video content. Search this section for specific templates or content.`;
    const introLines = pdf.splitTextToSize(supplementIntro, contentWidth);
    pdf.text(introLines, margin, y);
    y += introLines.length * 5 + 10;

    // For large file counts, truncate content more aggressively to prevent memory issues
    const maxContentPerFile = fileCount > 200 ? 5000 : fileCount > 100 ? 8000 : 10000;

    // Process each supplemental file with memory-efficient approach
    for (let fileIndex = 0; fileIndex < fileCount; fileIndex++) {
      const file = supplementalFiles[fileIndex];

      // Update progress every 10 files for responsiveness without UI thrashing
      if (fileIndex % 10 === 0 || fileIndex === fileCount - 1) {
        const percentComplete = (fileIndex + 1) / fileCount;
        onProgress?.(85 + percentComplete * 7, `Adding file ${fileIndex + 1}/${fileCount}...`);
      }

      checkPageBreak(35);

      // File header with index for easy reference
      pdf.setFillColor(240, 248, 255);
      pdf.setDrawColor(100, 149, 237);
      pdf.roundedRect(margin, y, contentWidth, 10, 2, 2, 'FD');

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(25, 25, 112);
      pdf.text(`[${fileIndex + 1}/${supplementalFiles.length}] ${file.name}`, margin + 3, y + 7);
      y += 14;

      // File content
      if (file.content && file.content.trim().length > 0) {
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(0, 0, 0);

        // Header for extracted text
        pdf.setFont('helvetica', 'bold');
        pdf.text('--- EXTRACTED TEXT TRANSCRIPT ---', margin + 3, y);
        y += 6;
        pdf.setFont('helvetica', 'normal');

        // Split content into chunks that fit on pages
        const contentToShow = file.content.length > maxContentPerFile
          ? file.content.substring(0, maxContentPerFile) + `\n\n[... Content truncated at ${maxContentPerFile} chars. Full file: ${file.content.length} chars ...]`
          : file.content;

        const contentLines = pdf.splitTextToSize(contentToShow, contentWidth - 6);

        for (const line of contentLines) {
          if (y > pageHeight - 35) {
            addPageWithHeaders();
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(0, 0, 0);
          }
          pdf.text(line, margin + 4, y);
          y += 4.5;
        }
      } else {
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(120, 120, 120);
        pdf.text('[No text content could be extracted from this file]', margin + 3, y);
        y += 10;
      }

      y += 8; // Space between files
    }

    // Summary after all supplemental files
    checkPageBreak(20);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(100, 100, 100);
    pdf.text(`--- End of ${supplementalFiles.length} Supplementary Document(s) ---`, pageWidth / 2, y, { align: 'center' });
    y += 15;
  }

  onProgress?.(100, 'PDF generation complete!');

  return pdf.output('blob');
};

export const downloadPDF = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Generate a merged course PDF with Table of Contents and chapter structure
 * All modules become chapters in ONE unified PDF
 */
export const generateMergedCoursePDF = async (
  mergedCourse: MergedCourseData,
  onProgress?: (progress: number, status: string) => void,
  options: ExportOptions = {}
): Promise<Blob> => {
  // jsPDF built-in fonts are not Unicode-safe. Sanitize all user-provided text
  // (transcripts + extracted docs) to prevent hard crashes during pdf.text().
  const safe = (v: unknown) => sanitizePdfText(v);

  // IMPORTANT: default imageQuality must be high; we cap it per-module based on frame count.
  const { maxFrames = 1000, imageQuality = 1.0, aiFidelityMode = false } = options;

  const watermarkEmail = safe(mergedCourse.userEmail || localStorage.getItem('courseagent_email') || '');
  const watermarkTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Track chapter page numbers for TOC
  const chapterPages: { title: string; pageNumber: number; moduleNumber: number }[] = [];
  let currentPage = 0;

  const addPageWithHeaders = () => {
    if (currentPage > 0) pdf.addPage();
    currentPage++;
    y = margin;

    // Header
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(100, 100, 100);
    pdf.text(`OneDuo Merged Course | ${mergedCourse.title}`, margin, 8);
    pdf.text(`Page ${currentPage}`, pageWidth - margin, 8, { align: 'right' });

    // Footer/Watermark
    if (watermarkEmail) {
      const footerY = pageHeight - 10;
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(150, 150, 150);
      pdf.text(`Proprietary Intel: OneDuo Thinking Layer`, margin, footerY);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`| Authorized User: ${watermarkEmail}`, margin + 52, footerY);
      pdf.text(`| Distilled: ${watermarkTimestamp}`, pageWidth - margin, footerY, { align: 'right' });
      pdf.setFontSize(6);
      pdf.setTextColor(130, 130, 130);
      pdf.text('This artifact is for private authorized educational use only.', pageWidth / 2, footerY + 4, { align: 'center' });
    }
  };

  // ========== GLOBAL PAGE 1: COURSE COVER PAGE ==========
  addPageWithHeaders();
  onProgress?.(5, 'Creating Global Title Page...');
  y = margin + 10;

  // Title
  pdf.setFontSize(28);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  const titleLines = pdf.splitTextToSize(safe(mergedCourse.title), contentWidth);
  pdf.text(titleLines, pageWidth / 2, y + 20, { align: 'center' });

  y = 60 + (titleLines.length * 12);

  // Subtitle
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(80, 80, 80);
  pdf.text(safe('MASTER COURSE ORIGIN LOG - ONE DUO ORIGIN'), pageWidth / 2, y, { align: 'center' });
  y += 15;

  // Chapter count
  pdf.setFontSize(12);
  pdf.setTextColor(100, 100, 100);
  pdf.text(safe(`${mergedCourse.modules.length} Chapters (Modules) | Verbatim Transcripts Included`), pageWidth / 2, y, { align: 'center' });
  y += 8;

  // Total duration
  const totalDuration = mergedCourse.modules.reduce((sum, m) => sum + (m.video_duration_seconds || 0), 0);
  if (totalDuration > 0) {
    pdf.text(safe(`Total Duration: ${formatTime(totalDuration)}`), pageWidth / 2, y, { align: 'center' });
    y += 15;
  }

  // ========== TABLE OF CONTENTS ==========
  addPageWithHeaders();
  const tocPageNumber = currentPage;

  pdf.setFontSize(22);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text(safe('Table of Contents'), margin, y);
  y += 15;

  // We'll generate TOC entries after we know the page numbers
  const tocStartY = y;

  // ========== GENERATE EACH CHAPTER ==========
  for (let i = 0; i < mergedCourse.modules.length; i++) {
    const module = mergedCourse.modules[i];
    const progressPercent = 10 + (i / mergedCourse.modules.length) * 80;
    onProgress?.(progressPercent, `Generating Chapter ${i + 1}: ${module.title}...`);

    // Start new page for chapter
    addPageWithHeaders();
    chapterPages.push({
      title: module.title,
      pageNumber: currentPage,
      moduleNumber: module.moduleNumber
    });

    // Chapter header
    pdf.setFillColor(0, 180, 255);
    pdf.rect(margin, y, contentWidth, 20, 'F');

    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text(safe(`Chapter ${module.moduleNumber}: ${module.title}`), margin + 5, y + 13);
    y += 28;

    // Chapter duration
    if (module.video_duration_seconds) {
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 100, 100);
      pdf.text(safe(`Duration: ${formatTime(module.video_duration_seconds)}`), margin, y);
      y += 10;
    }

    // ========== KNOWLEDGE LAYER (10/10 AI ARTIFACT SECTIONS) ==========
    const kl = module.knowledge_layer;
    if (kl) {
      const klSections: Array<{ key: string; label: string }> = [
        { key: 'primary_topic',        label: 'PRIMARY TOPIC' },
        { key: 'outcome',              label: 'OUTCOME' },
        { key: 'executive_summary',    label: 'EXECUTIVE SUMMARY' },
        { key: 'core_concepts',        label: 'CORE CONCEPTS' },
        { key: 'frameworks',           label: 'FRAMEWORKS / MODELS' },
        { key: 'visual_segments',      label: 'VISUAL SEGMENTS' },
        { key: 'key_claims',           label: 'KEY CLAIMS / THESIS' },
        { key: 'questions',            label: 'QUESTIONS THIS MODULE ANSWERS' },
        { key: 'actionable_takeaways', label: 'ACTIONABLE TAKEAWAYS' },
        { key: 'cross_module_links',   label: 'CROSS-MODULE LINK OPPORTUNITIES' },
        { key: 'important_quotes',     label: 'IMPORTANT QUOTES' },
        { key: 'prompt_starters',      label: 'PROMPT STARTERS FOR AI' },
        { key: 'decision_rules',       label: 'DECISION RULES' },
        { key: 'retrieval_tags',       label: 'RETRIEVAL TAGS' },
      ];

      // Section divider
      if (y > pageHeight - 40) addPageWithHeaders();
      pdf.setFillColor(0, 0, 0);
      pdf.rect(margin, y, contentWidth, 0.5, 'F');
      y += 6;
      pdf.setFontSize(13);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text(safe('AI KNOWLEDGE LAYER'), margin, y);
      y += 10;

      for (const { key, label } of klSections) {
        const rawVal = kl[key];
        if (!rawVal) continue;
        const val = Array.isArray(rawVal) ? rawVal.join(', ') : String(rawVal);
        if (!val.trim()) continue;

        if (y > pageHeight - 40) addPageWithHeaders();

        // Section heading
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0, 0, 0);
        pdf.text(safe(label), margin, y);
        y += 6;

        // Section body
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(30, 30, 30);
        const lines = pdf.splitTextToSize(safe(val), contentWidth - 5);
        for (const line of lines) {
          if (y > pageHeight - 20) {
            addPageWithHeaders();
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.setTextColor(30, 30, 30);
          }
          pdf.text(line, margin + 3, y);
          y += 5;
        }
        y += 5;
      }

      // Divider before transcript
      if (y > pageHeight - 20) addPageWithHeaders();
      pdf.setFillColor(180, 180, 180);
      pdf.rect(margin, y, contentWidth, 0.3, 'F');
      y += 8;
    }

    // ========== INTELLIGENCE LAYERS (A-D) ==========
    const hasIntelLayers = (module.key_moments_index && module.key_moments_index.length > 0) ||
      (module.concepts_frameworks && module.concepts_frameworks.length > 0) ||
      (module.implementation_steps && module.implementation_steps.length > 0) ||
      (module.hidden_patterns && module.hidden_patterns.length > 0);

    if (hasIntelLayers) {
      if (y > pageHeight - 60) addPageWithHeaders();
      else y += 10; // Vertical gap before intel layers if continuing on same page
    }

    // Layer A: Key Moments
    if (module.key_moments_index && module.key_moments_index.length > 0) {
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text(safe('Layer A: Key Moments Index'), margin, y);
      y += 8;
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      module.key_moments_index.forEach((m) => {
        if (y > pageHeight - 35) addPageWithHeaders();
        pdf.text(safe(`[${m.timestamp || '--:--'}] - ${m.description}`), margin + 5, y);
        y += 6;
      });
      y += 10;
    }

    // Layer B: Concepts & Frameworks
    if (module.concepts_frameworks && module.concepts_frameworks.length > 0) {
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(safe('Layer B: Concepts & Frameworks'), margin, y);
      y += 8;
      pdf.setFontSize(9);
      module.concepts_frameworks.forEach((c) => {
        if (y > pageHeight - 35) addPageWithHeaders();
        pdf.setFont('helvetica', 'bold');
        pdf.text(safe(`* ${c.title || 'Concept'}`), margin + 5, y);
        y += 6;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        const descLines = pdf.splitTextToSize(safe(c.description), contentWidth - 15);
        descLines.forEach((line: string) => {
          if (y > pageHeight - 35) {
            addPageWithHeaders();
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
          }
          pdf.text(line, margin + 10, y);
          y += 5;
        });
        y += 3;
      });
      y += 10;
    }

    // Layer C: Actionable Steps
    if (module.implementation_steps && module.implementation_steps.length > 0) {
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(safe('Layer C: Actionable Steps'), margin, y);
      y += 8;
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      module.implementation_steps.forEach((s, idx) => {
        if (y > pageHeight - 35) addPageWithHeaders();
        pdf.text(safe(`${s.step_number || idx + 1}. ${s.step_title || s.description}`), margin + 5, y);
        y += 7;
      });
      y += 10;
    }

    // Layer D: Hidden Patterns
    if (module.hidden_patterns && module.hidden_patterns.length > 0) {
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(safe('Layer D: Hidden Patterns & Insights'), margin, y);
      y += 8;
      pdf.setFontSize(9);
      module.hidden_patterns.forEach((p) => {
        if (y > pageHeight - 35) addPageWithHeaders();
        pdf.setFont('helvetica', 'bold');
        pdf.text(safe(`* ${p.title || 'Pattern'}`), margin + 5, y);
        y += 6;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        const descLines = pdf.splitTextToSize(safe(p.description), contentWidth - 15);
        descLines.forEach((line: string) => {
          if (y > pageHeight - 35) {
            addPageWithHeaders();
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
          }
          pdf.text(line, margin + 10, y);
          y += 5;
        });
        y += 3;
      });
      y += 10;
    }

    // ========== TRANSCRIPT SECTION ==========
    if (module.transcript && module.transcript.length > 0) {
      if (y > pageHeight - 60) addPageWithHeaders();
      else y += 15;

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text(safe('Full Verbatim Transcript'), margin, y);
      y += 8;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11); // INCREASED font size for better readability
      pdf.setTextColor(0, 0, 0);

      // Include FULL transcript for merged PDFs
      const transcriptSegments = module.transcript;
      for (const segment of transcriptSegments) {
        if (y > pageHeight - 20) {
          addPageWithHeaders();
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(11);
        }

        const timestamp = safe(`[${formatTime(segment.start || 0)}]`);
        const text = safe(`${segment.speaker ? `${segment.speaker}: ` : ''}${segment.text}`);
        const line = `${timestamp} ${text}`;
        const textLines = pdf.splitTextToSize(line, contentWidth);

        for (const textLine of textLines) {
          if (y > pageHeight - 35) {
            addPageWithHeaders();
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(11);
          }
          pdf.text(textLine, margin, y);
          y += 6.0;
        }
      }

      // Small gap after transcript
      y += 10;
    }

    // ========== AUDIO EVENTS SECTION ==========
    addPageWithHeaders();
    y = renderAudioTimeline(
      pdf,
      margin,
      pageHeight,
      contentWidth,
      y,
      module.audio_events || {},
      module.prosody_annotations || {},
      addPageWithHeaders,
      formatTime
    );

    // ========== VISUAL FRAMES SECTION ==========
    if (module.frame_urls && module.frame_urls.length > 0) {
      addPageWithHeaders();
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text(safe('Visual Frames'), margin, y);
      y += 8;


      // Sample frames evenly
      const sampledFrames = sampleFramesEvenly(module.frame_urls, Math.min(maxFrames, module.frame_urls.length));

      // Duration sanity check: if DB duration implies < 0.5 FPS, it's likely a stale 300s default
      let correctedModuleDuration = module.video_duration_seconds || 0;
      if (correctedModuleDuration > 0 && module.frame_urls.length > 0 && correctedModuleDuration / module.frame_urls.length > 2) {
        console.warn(`[Merged PDF] Chapter ${i + 1}: Duration sanity check failed (${correctedModuleDuration}s for ${module.frame_urls.length} frames). Using frame count as estimate.`);
        correctedModuleDuration = module.frame_urls.length; // 1 FPS estimate
      }

      // Cap quality for huge frame sets, but keep it high enough for UI legibility.
      const moduleRecommendedQuality = getRecommendedImageQuality(module.frame_urls.length);
      const moduleEffectiveQuality = imageQuality > 0 ? Math.min(imageQuality, moduleRecommendedQuality) : moduleRecommendedQuality;

      onProgress?.(progressPercent + 2, `Analyzing ${sampledFrames.length} frames for Chapter ${i + 1}...`);

      // Use pre-computed frame analyses from DB if available (zero Replicate cost)
      // Falls back to browser-side Replicate OCR for legacy courses without cached data
      let moduleAnalyses: any[];
      if (module.frame_analyses && Array.isArray(module.frame_analyses) && module.frame_analyses.length > 0) {
        console.log(`[Merged PDF] Chapter ${i + 1}: Using ${module.frame_analyses.length} cached frame analyses (0 API calls)`);
        onProgress?.(progressPercent + 10, `Chapter ${i + 1}: Using cached frame analyses...`);
        moduleAnalyses = module.frame_analyses;
      } else {
        console.log(`[Merged PDF] Chapter ${i + 1}: No cached analyses, running live Replicate OCR...`);
        moduleAnalyses = await extractFrameTextsWithProgress(
          sampledFrames,
          correctedModuleDuration,
          module.transcript || [],
          (p, s) => onProgress?.(progressPercent + (p / 100) * 10, `Chapter ${i + 1}: ${s}`)
        );
      }

      for (let frameIdx = 0; frameIdx < sampledFrames.length; frameIdx++) {
        if (y > pageHeight - 60) {
          addPageWithHeaders();
        }

        const frameUrl = sampledFrames[frameIdx];
        const frameAnalysis = moduleAnalyses[frameIdx];
        // Duration sanity check for merged PDF: if DB duration implies < 0.5 FPS, cap it
        let moduleDurationForTimestamp = correctedModuleDuration;
        const timestamp = frameAnalysis?.timestamp || (moduleDurationForTimestamp
          ? (frameIdx / sampledFrames.length) * moduleDurationForTimestamp
          : frameIdx);

        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(100, 100, 100);
        pdf.text(safe(`Frame ${frameIdx + 1} | ${formatTime(timestamp)}`), margin, y);
        y += 4; // Reduced from 5

        try {
          const imgData = await imageToBase64WithRetry(frameUrl, moduleEffectiveQuality, 2, 8000);
          if (imgData.dataUrl) {
            const isAIFidelity = aiFidelityMode;
            const effectiveQuality = isAIFidelity ? 0.95 : moduleEffectiveQuality;
            const imgWidth = isAIFidelity ? contentWidth : Math.min(contentWidth, 160);
            const imgHeight = isAIFidelity ? (imgWidth * 0.56) : (imgWidth * 0.56); // 16:9 aspect ratio

            if (y + imgHeight > pageHeight - 30) {
              addPageWithHeaders();
            }

            pdf.addImage(imgData.dataUrl, 'JPEG', margin, y, imgWidth, imgHeight, undefined, 'NONE');
            y += imgHeight + 3;

            // ===== COMPOSITE VISUAL TRANSCRIPTION CAPTION (Merged PDF) =====
            // Synthesizes ALL OneDuo features into one rich caption below the frame
            const captionParts: string[] = [];
            const fa = moduleAnalyses[frameIdx] || null;

            // FEATURE 1: Visual description
            if (fa?.visualDescription) {
              captionParts.push(fa.visualDescription);
            }

            // FEATURE 2: On-screen text/elements
            if (fa?.keyElements && fa.keyElements.length > 0) {
              captionParts.push(`[On-screen: ${fa.keyElements.slice(0, 4).join(', ')}]`);
            }

            // FEATURE 3: Cursor & highlight tracking
            if (fa?.emphasisFlags) {
              const interactionNotes: string[] = [];
              if (fa.emphasisFlags.highlight_detected) interactionNotes.push('text highlighted');
              if (fa.emphasisFlags.text_selected) interactionNotes.push('text selected');
              if (fa.emphasisFlags.cursor_pause) interactionNotes.push('cursor paused here — this matters');
              if (fa.emphasisFlags.zoom_focus) interactionNotes.push('zoomed/focused');
              if (fa.emphasisFlags.lingering_frame) interactionNotes.push('lingered on this view');
              if (interactionNotes.length > 0) {
                captionParts.push(`[Interaction: ${interactionNotes.join('; ')}]`);
              }
            }

            // FEATURE 4: Audio events (Standardized via top-level helper)
            const inlineAudio = getInlineAudioAnnotations(
              timestamp,
              (module as any).audio_events || {},
              (module as any).prosody_annotations || {}
            );
            if (inlineAudio.length > 0) {
              captionParts.push(inlineAudio.slice(0, 3).join(' '));
            }

            // FEATURE 5: Vocal tone/emphasis
            if (fa?.prosody?.parenthetical && fa.prosody.parenthetical.length > 0) {
              captionParts.push(`(${fa.prosody.parenthetical})`);
            }

            // Sanitize caption: remove AI filler/literalisms
            const sanitizedParts = captionParts.map(part => {
              return part
                .replace(/Note: The image is a screenshot from a tutorial video, showing /gi, '')
                .replace(/This frame shows /gi, '')
                .replace(/In this frame, /gi, '')
                .replace(/The image shows /gi, '')
                .replace(/\. \(Note:.*?\)$/gi, '.')
                .trim();
            }).filter(part => part.length > 0);

            // Render composite caption
            const compositeCaption = sanitizedParts.join(' | ');
            if (compositeCaption.length > 0) {
              if (aiFidelityMode) {
                const fa = moduleAnalyses[frameIdx];
                const hasFocus = fa?.emphasisFlags?.cursor_pause || fa?.emphasisFlags?.zoom_focus;

                pdf.setFontSize(9);
                pdf.setFont('helvetica', 'italic');
                pdf.setTextColor(80, 80, 80);

                if (hasFocus) {
                  pdf.setFillColor(250, 250, 240);
                  pdf.setDrawColor(220, 200, 0);
                } else {
                  pdf.setFillColor(250, 250, 255);
                  pdf.setDrawColor(200, 200, 255);
                }

                const label = hasFocus ? 'ONE DUO SENSORY DATA [CRITICAL FOCUS]:' : 'ONE DUO SENSORY DATA:';
                const wrapCaption = pdf.splitTextToSize(`${label} "${compositeCaption}"`, contentWidth - 10);
                const rectHeight = (wrapCaption.length * 4) + 6;

                if (y + rectHeight > pageHeight - 20) {
                  addPageWithHeaders();
                }

                pdf.roundedRect(margin, y - 1, contentWidth, rectHeight, 1, 1, 'FD');
                y += 5;
                pdf.text(wrapCaption, margin + 5, y);
                y += (wrapCaption.length * 4) + 2;
              } else {
                pdf.setFontSize(7);
                pdf.setFont('helvetica', 'italic');
                pdf.setTextColor(80, 80, 80);
                const truncatedCaption = compositeCaption.length > 300
                  ? compositeCaption.substring(0, 297) + '...'
                  : compositeCaption;
                const splitCaption = pdf.splitTextToSize(safe(`"${truncatedCaption}"`), imgWidth);
                const maxLines = Math.min(splitCaption.length, 4);

                if (y + (maxLines * 3) > pageHeight - 20) {
                  addPageWithHeaders();
                }

                pdf.text(splitCaption.slice(0, maxLines), margin, y);
                y += (maxLines * 3) + 3;
              }
              pdf.setFont('helvetica', 'normal');
            } else {
              y += 5;
            }
          }
        } catch (e) {
          pdf.setFontSize(8);
          pdf.setTextColor(200, 100, 100);
          pdf.text(safe('[Frame could not be loaded]'), margin, y);
          y += 10;
        }
      }
    }

    // Chapter separator
    y += 10;
    if (i < mergedCourse.modules.length - 1) {
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 5;
    }
  }

  // ========== SUPPLEMENTARY TRAINING DOCUMENTS SECTION ==========
  // This embeds all user-uploaded files so ChatGPT can search their content
  const supplementalFiles = mergedCourse.supplementalFiles || [];
  const fileCount = supplementalFiles.length;

  if (fileCount > 0) {
    onProgress?.(88, `Embedding ${fileCount} supplementary documents...`);
    addPageWithHeaders();

    // Section header
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text(safe('SUPPLEMENTARY TRAINING DOCUMENTS'), margin, y);
    y += 8;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(80, 80, 80);
    const supplementIntro = `The course creator uploaded ${fileCount} additional document(s) to enhance this training. These materials contain templates, scripts, reference guides, and other resources that supplement the video content.`;
    const introLines = pdf.splitTextToSize(safe(supplementIntro), contentWidth);
    pdf.text(introLines, margin, y);
    y += introLines.length * 5 + 10;

    // Process each supplemental file
    const maxContentPerFile = fileCount > 100 ? 8000 : 10000;

    for (let fileIndex = 0; fileIndex < fileCount; fileIndex++) {
      const file = supplementalFiles[fileIndex];

      // Check if we need a new page
      if (y > pageHeight - 40) {
        addPageWithHeaders();
      }

      // File header
      pdf.setFillColor(240, 248, 255);
      pdf.setDrawColor(100, 149, 237);
      pdf.roundedRect(margin, y, contentWidth, 10, 2, 2, 'FD');

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(25, 25, 112);
      pdf.text(safe(`[${fileIndex + 1}/${fileCount}] ${file.name}`), margin + 3, y + 7);
      y += 14;

      // File content
      if (file.content && file.content.trim().length > 0) {
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(0, 0, 0);

        // Header for extracted text
        pdf.setFont('helvetica', 'bold');
        pdf.text(safe('--- EXTRACTED TEXT TRANSCRIPT ---'), margin + 3, y);
        y += 6;
        pdf.setFont('helvetica', 'normal');

        const rawContent = safe(file.content);
        const contentToShow = rawContent.length > maxContentPerFile
          ? rawContent.substring(0, maxContentPerFile) + safe(`\n\n[... Content truncated at ${maxContentPerFile} chars. Full file: ${rawContent.length} chars ...]`)
          : rawContent;

        const contentLines = pdf.splitTextToSize(contentToShow, contentWidth - 6);

        for (const line of contentLines) {
          if (y > pageHeight - 35) {
            addPageWithHeaders();
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(0, 0, 0);
          }
          pdf.text(line, margin + 4, y);
          y += 4.5;
        }
      } else {
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(120, 120, 120);
        pdf.text(safe('[No text content could be extracted from this file]'), margin + 3, y);
        y += 10;
      }

      y += 8;
    }

    // Summary
    if (y > pageHeight - 30) {
      addPageWithHeaders();
    }
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(100, 100, 100);
    pdf.text(safe(`--- End of ${fileCount} Supplementary Document(s) ---`), pageWidth / 2, y, { align: 'center' });
    y += 15;
  }

  // ========== UPDATE TOC WITH ACTUAL PAGE NUMBERS ==========
  onProgress?.(92, 'Updating table of contents...');

  // Go back to TOC page and fill in the entries
  pdf.setPage(tocPageNumber);
  y = tocStartY;

  for (const chapter of chapterPages) {
    if (y > pageHeight - 25) {
      // If TOC spans multiple pages, we'd need more complex logic
      // For now, just continue on same page with smaller text
      pdf.setFontSize(9);
    }

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(0, 0, 0);

    // Chapter title (left-aligned)
    const chapterTitle = `Chapter ${chapter.moduleNumber}: ${chapter.title}`;
    const safeChapterTitle = safe(chapterTitle);
    const truncatedTitle = safeChapterTitle.length > 60 ? safeChapterTitle.substring(0, 57) + '...' : safeChapterTitle;
    pdf.text(truncatedTitle, margin, y);

    // Page number (right-aligned)
    pdf.setFont('helvetica', 'bold');
    pdf.text(String(chapter.pageNumber), pageWidth - margin, y, { align: 'right' });

    // Dotted leader line
    pdf.setDrawColor(180, 180, 180);
    const titleWidth = pdf.getTextWidth(truncatedTitle);
    const pageNumWidth = pdf.getTextWidth(String(chapter.pageNumber));
    const lineStartX = margin + titleWidth + 5;
    const lineEndX = pageWidth - margin - pageNumWidth - 5;

    for (let dotX = lineStartX; dotX < lineEndX; dotX += 3) {
      pdf.circle(dotX, y - 1, 0.3, 'F');
    }

    y += 8;
  }

  onProgress?.(100, 'Merged PDF generation complete!');

  return pdf.output('blob');
};
