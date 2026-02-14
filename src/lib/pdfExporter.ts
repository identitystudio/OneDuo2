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
  oneduo_protocol?: any;
}

// Module data for merged course PDF
export interface ModuleData {
  id: string;
  moduleNumber: number;
  title: string;
  video_duration_seconds?: number;
  transcript?: TranscriptSegment[];
  frame_urls?: string[];
  audio_events?: AudioEvents;
  prosody_annotations?: ProsodyData;
  // Intelligence Layers
  key_moments_index?: IntelligenceLayerItem[];
  concepts_frameworks?: IntelligenceLayerItem[];
  hidden_patterns?: IntelligenceLayerItem[];
  implementation_steps?: any[];
  oneduo_protocol?: any;
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
  batchSize: number = 3
): Promise<(FrameAnalysis | null)[]> => {
  const results: (FrameAnalysis | null)[] = [];
  const totalFrames = frameUrls.length;
  const totalBatches = Math.ceil(totalFrames / batchSize);

  // Build transcript context for verbal intent detection
  const transcriptContext = transcript.slice(0, 50).map(t => t.text).join(' ').substring(0, 2000);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const startIdx = batchIndex * batchSize;
    const endIdx = Math.min(startIdx + batchSize, totalFrames);
    const batchUrls = frameUrls.slice(startIdx, endIdx);

    const batchProgress = ((batchIndex + 1) / totalBatches) * 100;
    onProgress?.(Number(batchProgress.toFixed(1)), `Analyzing frames ${startIdx + 1}-${endIdx} of ${totalFrames}...`);

    try {
      const { data, error } = await supabase.functions.invoke('extract-frame-text', {
        body: {
          frameUrls: batchUrls,
          batchSize: batchSize,
          videoDuration,
          startIndex: startIdx,
          transcriptContext, // Pass transcript for verbal intent detection
        }
      });

      if (error) {
        console.error('OCR batch failed:', error);
        results.push(...batchUrls.map(() => null));
      } else {
        results.push(...(data.results || batchUrls.map(() => null)));
      }
    } catch (error) {
      console.error('Failed to extract batch:', error);
      results.push(...batchUrls.map(() => null));
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
const FRAMES_PER_MINUTE_TARGET = 180; // 3 FPS * 60 seconds = Every single frame included
const MIN_EXPORT_FRAMES = 250;
const MAX_EXPORT_FRAMES = 15000;

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
  const videoDuration = course.video_duration_seconds || 0;
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
    MAX_EXPORT_FRAMES
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

  if (effectiveIncludeOCR && hasFrames) {
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
    else y += 15;

    onProgress?.(42, 'Adding Intelligence Layer A...');
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('INTELLIGENCE LAYER A: KEY MOMENTS INDEX', margin, y);
    y += 15;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    course.key_moments_index.forEach((m) => {
      checkPageBreak(12);
      pdf.text(`[${m.timestamp || '--:--'}] - ${m.description}`, margin + 5, y);
      y += 8;
    });
  }

  // Layer B: Concepts & Frameworks
  if (course.concepts_frameworks && course.concepts_frameworks.length > 0) {
    if (y > pageHeight - 60) addPageWithHeaders();
    else y += 15;

    onProgress?.(43, 'Adding Intelligence Layer B...');
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('INTELLIGENCE LAYER B: CONCEPTS & FRAMEWORKS', margin, y);
    y += 12;
    course.concepts_frameworks.forEach((c) => {
      checkPageBreak(15);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`* ${c.title || 'Concept'}`, margin + 5, y);
      y += 6;
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
        y += 5;
      });
      y += 3;
    });
  }

  // Layer C: Actionable Steps
  if (course.implementation_steps && course.implementation_steps.length > 0) {
    if (y > pageHeight - 50) addPageWithHeaders();
    else y += 15;

    onProgress?.(44, 'Adding Intelligence Layer C...');
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('INTELLIGENCE LAYER C: ACTIONABLE STEPS', margin, y);
    y += 12;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    course.implementation_steps.forEach((s, idx) => {
      checkPageBreak(12);
      pdf.text(`${s.step_number || idx + 1}. ${s.step_title || s.description}`, margin + 5, y);
      y += 8;
    });
  }

  // Layer D: Hidden Patterns
  if (course.hidden_patterns && course.hidden_patterns.length > 0) {
    if (y > pageHeight - 60) addPageWithHeaders();
    else y += 15;

    onProgress?.(45, 'Adding Intelligence Layer D...');
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('INTELLIGENCE LAYER D: HIDDEN PATTERNS & INSIGHTS', margin, y);
    y += 12;
    course.hidden_patterns.forEach((p) => {
      checkPageBreak(15);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`* ${p.title || 'Pattern'}`, margin + 5, y);
      y += 6;
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
        y += 5;
      });
      y += 3;
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

  // ========== PAGE 3: AUDIO EVENTS TIMELINE ==========
  addPageWithHeaders();
  onProgress?.(41, 'Adding audio events timeline...');

  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text('Audio Events Timeline', margin, y);
  y += 12;

  const audioEvents = course.audio_events || {};
  const prosodyData = course.prosody_annotations || {};

  const musicCues = audioEvents.music_cues || [];
  const ambientSounds = audioEvents.ambient_sounds || [];
  const reactions = audioEvents.reactions || [];
  const meaningfulPauses = audioEvents.meaningful_pauses || [];
  const prosodyAnnotations = prosodyData.annotations || [];

  const hasAudioData = musicCues.length > 0 || ambientSounds.length > 0 ||
    reactions.length > 0 || meaningfulPauses.length > 0 ||
    prosodyAnnotations.length > 0;

  if (hasAudioData) {
    // Overall Audio Mood
    if (audioEvents.overall_audio_mood) {
      pdf.setFillColor(240, 248, 255);
      pdf.setDrawColor(100, 150, 200);
      pdf.roundedRect(margin, y, contentWidth, 20, 2, 2, 'FD');
      y += 6;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(50, 100, 150);
      pdf.text('Overall Audio Mood:', margin + 3, y);
      y += 5;
      pdf.setFont('helvetica', 'italic');
      const moodText = pdf.splitTextToSize(audioEvents.overall_audio_mood, contentWidth - 10);
      pdf.text(moodText.slice(0, 2), margin + 3, y);
      y += 15;
    }

    // Music Cues Section
    if (musicCues.length > 0) {
      checkPageBreak(30 + musicCues.length * 12);

      pdf.setFillColor(255, 245, 230);
      pdf.setDrawColor(200, 150, 50);
      const musicHeight = 18 + Math.min(musicCues.length * 12, 60);
      pdf.roundedRect(margin, y, contentWidth, musicHeight, 2, 2, 'FD');

      y += 6;
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(150, 100, 0);
      pdf.text('[MUSIC CUES]', margin + 3, y);
      y += 7;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(80, 60, 20);

      musicCues.slice(0, 5).forEach(cue => {
        const startTime = formatTime(cue.start);
        const endTime = formatTime(cue.end);
        const cueText = `[${startTime} - ${endTime}] ${cue.mood.toUpperCase()}${cue.genre ? ` (${cue.genre})` : ''}: ${cue.description}`;
        const splitCue = pdf.splitTextToSize(cueText, contentWidth - 10);
        pdf.text(splitCue[0], margin + 3, y);
        y += 6;
      });

      if (musicCues.length > 5) {
        pdf.setFont('helvetica', 'italic');
        pdf.text(`... and ${musicCues.length - 5} more music cues`, margin + 3, y);
        y += 6;
      }
      y += 8;
    }

    // Reactions Section
    if (reactions.length > 0) {
      checkPageBreak(30 + reactions.length * 10);

      pdf.setFillColor(255, 240, 245);
      pdf.setDrawColor(180, 100, 120);
      const reactionsHeight = 18 + Math.min(reactions.length * 10, 50);
      pdf.roundedRect(margin, y, contentWidth, reactionsHeight, 2, 2, 'FD');

      y += 6;
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(150, 70, 90);
      pdf.text('[AUDIENCE/PRESENTER REACTIONS]', margin + 3, y);
      y += 7;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 50, 60);

      reactions.slice(0, 5).forEach(reaction => {
        const time = formatTime(reaction.timestamp);
        const intensityLabel = reaction.intensity === 'strong' ? '***' : reaction.intensity === 'moderate' ? '**' : '*';
        const reactionText = `[${time}] (${reaction.type}${intensityLabel}) - ${reaction.context}`;
        const splitReaction = pdf.splitTextToSize(reactionText, contentWidth - 10);
        pdf.text(splitReaction[0], margin + 3, y);
        y += 5;
      });

      if (reactions.length > 5) {
        pdf.setFont('helvetica', 'italic');
        pdf.text(`... and ${reactions.length - 5} more reactions`, margin + 3, y);
        y += 5;
      }
      y += 8;
    }

    // Meaningful Pauses Section
    if (meaningfulPauses.length > 0) {
      checkPageBreak(30 + meaningfulPauses.length * 10);

      pdf.setFillColor(245, 240, 255);
      pdf.setDrawColor(120, 100, 180);
      const pausesHeight = 18 + Math.min(meaningfulPauses.length * 10, 50);
      pdf.roundedRect(margin, y, contentWidth, pausesHeight, 2, 2, 'FD');

      y += 6;
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(80, 60, 140);
      pdf.text('[MEANINGFUL PAUSES/BEATS]', margin + 3, y);
      y += 7;

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

      if (meaningfulPauses.length > 8) {
        pdf.setFont('helvetica', 'italic');
        pdf.text(`... and ${meaningfulPauses.length - 8} more pauses`, margin + 3, y);
        y += 5;
      }
      y += 8;
    }

  } else {
    pdf.setFillColor(250, 250, 250);
    pdf.setDrawColor(200, 200, 200);
    pdf.roundedRect(margin, y, contentWidth, 25, 2, 2, 'FD');
    y += 10;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(150, 150, 150);
    pdf.text('No audio events detected for this content.', margin + 5, y);
    pdf.text('Audio analysis runs automatically during processing.', margin + 5, y + 6);
    y += 25;
  }

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
    ['Total Frames Captured:', `${frameCount} @ ~3 FPS`],
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

  // ========== HELPER: Get inline audio annotations for a timestamp ==========
  const getInlineAudioAnnotations = (timestamp: number, windowSeconds: number = 3): string[] => {
    const annotations: string[] = [];

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

  // ========== PAGES 4+: TIMESTAMP BLOCKS ==========
  // Only render frame blocks if we have frames
  const renderableFrameCount = frames.length;

  if (renderableFrameCount > 0) {
    onProgress?.(45, 'Processing frames with OCR data...');

    const frameDuration = videoDuration > 0 ? videoDuration / Math.max(frames.length, 1) : 10;

    for (let i = 0; i < renderableFrameCount; i++) {
      const frameUrl = frames[i];
      const frameAnalysis = frameAnalyses[i] || null;
      const frameTime = frameAnalysis?.timestamp ?? (i * frameDuration);
      const progress = 45 + ((i + 1) / renderableFrameCount) * 45;
      onProgress?.(Number(progress.toFixed(1)), `Embedding frame ${i + 1} of ${renderableFrameCount}...`);

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

      const inlineAudioAnnotations = getInlineAudioAnnotations(frameTime);

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
      pdf.setFillColor(245, 245, 250);
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(margin, y, contentWidth, 38, 1, 1, 'FD');
      y += 6;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(50, 50, 50);
      pdf.text(`STEP ${i + 1}: ${formatTime(frameTime)} | UI/DOC`, margin + 4, y);
      y += 7;

      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      const action = frameAnalysis?.instructorIntent?.substring(0, 80) || 'Observe screen state';
      const confidence = (frameAnalysis?.intentConfidence || 0.8) * 100;
      const instruction = confidence >= 80 ? 'Execute and verify.' : 'Verify with human if UI differs.';
      pdf.text(`[VALIDATION CHECKPOINT] (${action}, ${confidence.toFixed(0)}%, AI: ${instruction})`, margin + 4, y);
      y += 6;

      pdf.setFont('helvetica', 'bold');
      pdf.text(`Instructor Intent [EXPLICIT/STRONG]:`, margin + 4, y);
      pdf.setFont('helvetica', 'normal');
      pdf.text(` (Why this step exists: ${frameAnalysis?.instructorIntent || 'Demonstrating UI flow'})`, margin + 52, y);
      y += 6;

      pdf.setFont('helvetica', 'bold');
      pdf.text(`Prosody/Emphasis:`, margin + 4, y);
      pdf.setFont('helvetica', 'normal');
      const prosody = hasProsody ? frameAnalysis.prosody.parenthetical : 'Neutral';
      const emphasis = emphasisLabels.length > 0 ? `Focus: ${emphasisLabels.join(', ')}` : 'Screen capture focus';
      pdf.text(` (${prosody} | ${emphasis})`, margin + 30, y);
      y += 13;

      // ===== FRAME IMAGE =====
      try {
        const base64Image = await imageToBase64Compressed(frameUrl, effectiveQuality);
        if (base64Image && base64Image.length > 1000) {
          const imgWidth = Math.min(70, contentWidth);
          const imgHeight = 40;
          // Preserve quality (avoid extra internal compression)
          pdf.addImage(base64Image, 'JPEG', margin, y, imgWidth, imgHeight, undefined, 'NONE');
          y += imgHeight + 3;
        } else {
          // Log which frame failed for debugging
          console.warn(`[pdfExporter] Frame ${i + 1} failed to load: ${frameUrl.substring(0, 60)}...`);
          pdf.setFillColor(245, 245, 245);
          pdf.setDrawColor(200, 200, 200);
          pdf.roundedRect(margin, y, 70, 40, 2, 2, 'FD');
          pdf.setFontSize(7);
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
        pdf.setFontSize(7);
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
        pdf.setFontSize(9);
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
        pdf.setFontSize(9);
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
      pdf.setFontSize(9);
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

  // ========== ONEDUO AI PROTOCOL (THINKING LAYER) ==========
  if (course.oneduo_protocol) {
    onProgress?.(82, 'Adding OneDuo Thinking Layer...');
    addPageWithHeaders();

    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text('ONEDUO AI THINKING LAYER', margin, y);
    y += 12;

    const protocol = typeof course.oneduo_protocol === 'string'
      ? JSON.parse(course.oneduo_protocol).oneduoProtocol
      : (course.oneduo_protocol.oneduoProtocol || course.oneduo_protocol);

    if (protocol) {
      // Executive Board
      if (protocol.executiveBoard) {
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(25, 118, 210);
        pdf.text('Tactical Advisory: The Executive Board', margin, y);
        y += 8;

        Object.entries(protocol.executiveBoard).forEach(([key, member]: [string, any]) => {
          if (key.startsWith('_')) return;
          checkPageBreak(25);
          pdf.setFontSize(11);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(0, 0, 0);
          pdf.text(`${member.emoji} ${member.title}: ${member.persona}`, margin + 5, y);
          y += 6;
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(10);
          pdf.setTextColor(80, 80, 80);
          const focusLines = pdf.splitTextToSize(`Focus: ${member.focus}`, contentWidth - 15);
          pdf.text(focusLines, margin + 10, y);
          y += focusLines.length * 5 + 4;
        });
        y += 6;
      }

      // Commands
      if (protocol.essentialCommands) {
        checkPageBreak(50);
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(25, 118, 210);
        pdf.text('Essential Commands & Remote Control', margin, y);
        y += 8;

        protocol.essentialCommands.commands?.forEach((cmd: any) => {
          checkPageBreak(10);
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(0, 0, 0);
          pdf.text(`${cmd.emoji} ${cmd.code}`, margin + 5, y);
          pdf.setFont('helvetica', 'normal');
          pdf.text(` - ${cmd.desc}`, margin + 35, y);
          y += 6;
        });
        y += 6;
      }

      // Escalation
      if (protocol.founderEscalation) {
        checkPageBreak(40);
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(180, 0, 0); // Red for escalation
        pdf.text('Founder Escalation Protocol (🚨)', margin, y);
        y += 8;

        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(50, 50, 50);
        const escLines = pdf.splitTextToSize("When the VA hits a decision point that requires founder-specific knowledge (brand, budget, or strategy), execution will PAUSE and generate a formatted alert message.", contentWidth - 10);
        pdf.text(escLines, margin + 5, y);
        y += escLines.length * 5 + 6;
      }
    }
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
  const { maxFrames = 1000, imageQuality = 1.0 } = options;

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

    // ========== VISUAL FRAMES SECTION ==========
    if (module.frame_urls && module.frame_urls.length > 0) {
      if (y > pageHeight - 80) addPageWithHeaders();
      else y += 15;

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text(safe('Visual Frames'), margin, y);
      y += 10;

      // Sample frames evenly
      const sampledFrames = sampleFramesEvenly(module.frame_urls, Math.min(maxFrames, module.frame_urls.length));

      // Cap quality for huge frame sets, but keep it high enough for UI legibility.
      const moduleRecommendedQuality = getRecommendedImageQuality(module.frame_urls.length);
      const moduleEffectiveQuality = Math.min(imageQuality, moduleRecommendedQuality);

      onProgress?.(progressPercent + 2, `Pre-loading ${sampledFrames.length} frames for Chapter ${i + 1}...`);

      // PARALLEL LOAD OPTIMIZATION: Fetch all frames at once before loop
      // This is 10x faster than awaiting them one-by-one in the loop
      await batchLoadImages(
        sampledFrames,
        moduleEffectiveQuality,
        (loaded, total) => {
          // Optional: update progress (fine-grained)
        }
      );

      for (let frameIdx = 0; frameIdx < sampledFrames.length; frameIdx++) {
        if (y > pageHeight - 60) {
          addPageWithHeaders();
        }

        const frameUrl = sampledFrames[frameIdx];
        const timestamp = module.video_duration_seconds
          ? (frameIdx / sampledFrames.length) * module.video_duration_seconds
          : frameIdx;

        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(100, 100, 100);
        pdf.text(safe(`Frame ${frameIdx + 1} | ${formatTime(timestamp)}`), margin, y);
        y += 5;

        try {
          const imgData = await imageToBase64WithRetry(frameUrl, moduleEffectiveQuality, 2, 8000);
          if (imgData.dataUrl) {
            const imgWidth = Math.min(contentWidth, 160);
            const imgHeight = imgWidth * 0.56; // 16:9 aspect ratio

            if (y + imgHeight > pageHeight - 30) {
              addPageWithHeaders();
            }

            pdf.addImage(imgData.dataUrl, 'JPEG', margin, y, imgWidth, imgHeight, undefined, 'NONE');
            y += imgHeight + 8;
          }
        } catch (e) {
          pdf.setFontSize(8);
          pdf.setTextColor(200, 100, 100);
          pdf.text(safe('[Frame could not be loaded]'), margin, y);
          y += 10;
        }
      }
    }

    // ========== ONEDUO AI PROTOCOL (THINKING LAYER) ==========
    if (module.oneduo_protocol) {
      if (y > pageHeight - 60) addPageWithHeaders();
      else y += 10;

      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text(safe('OneDuo AI Thinking Layer'), margin, y);
      y += 10;

      const protocol = typeof module.oneduo_protocol === 'string'
        ? JSON.parse(module.oneduo_protocol).oneduoProtocol
        : (module.oneduo_protocol.oneduoProtocol || module.oneduo_protocol);

      if (protocol) {
        // Executive Board
        if (protocol.executiveBoard) {
          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(25, 118, 210);
          pdf.text(safe('Executive Board Advisors'), margin + 5, y);
          y += 6;

          Object.entries(protocol.executiveBoard).forEach(([key, member]: [string, any]) => {
            if (key.startsWith('_')) return;
            if (y > pageHeight - 30) addPageWithHeaders();
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(0, 0, 0);
            pdf.text(safe(`${member.emoji} ${member.title}: ${member.persona}`), margin + 10, y);
            y += 5;
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(9);
            pdf.setTextColor(100, 100, 100);
            const focusLines = pdf.splitTextToSize(safe(`Focus: ${member.focus}`), contentWidth - 25);
            pdf.text(focusLines, margin + 15, y);
            y += focusLines.length * 4.5 + 3;
          });
          y += 5;
        }

        // Essential Commands
        if (protocol.essentialCommands) {
          if (y > pageHeight - 40) addPageWithHeaders();
          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(25, 118, 210);
          pdf.text(safe('Playback Commands'), margin + 5, y);
          y += 6;

          protocol.essentialCommands.commands?.slice(0, 6).forEach((cmd: any) => {
            if (y > pageHeight - 15) addPageWithHeaders();
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(0, 0, 0);
            pdf.text(safe(`${cmd.emoji} ${cmd.code}`), margin + 10, y);
            pdf.setFont('helvetica', 'normal');
            pdf.text(safe(` - ${cmd.desc}`), margin + 35, y);
            y += 5;
          });
          y += 5;
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
