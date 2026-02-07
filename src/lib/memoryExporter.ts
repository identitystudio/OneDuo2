/**
 * OneDuo Memory Exporter
 * Creates a 4-tier "Executable Memory" ZIP package for AI consumption
 * Supports both Training Mode (Operator's Manual) and Creative Mode (Director's Cut)
 */

import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';

// ============= TYPE DEFINITIONS =============

interface TranscriptSegment {
  start: number;
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
  markerType: 'critical' | 'sequence' | 'warning' | 'skip_consequence' | 'expert_tip' | 'dependency_explicit';
  confidence: number;
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
  intentConfidence?: number;
  intentSource?: 'visual_only' | 'verbal_explicit' | 'visual_verbal_aligned' | 'inferred';
  verbalIntentMarkers?: VerbalIntentMarker[];
  mustNotSkip?: boolean;
  dependsOnPrevious?: boolean;
  emotionalWeight?: number;
  dwellSeconds?: number;
  sceneChangeDetected?: boolean;
  visualContinuityScore?: number;
  gazeAnalysis?: {
    characters: string[];
    gazeDirection: string;
    gazeDuration: string;
    emotionalInterpretation: string;
  };
}

interface CliffhangerMoment {
  peak_timestamp: number;
  resolution_timestamp: number;
  composite_confidence: number;
  signals: {
    audio_intensity: boolean;
    visual_stasis: boolean;
    verbal_hint: boolean;
  };
  description: string;
}

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

// ============= MEMORY STRUCTURE =============

export interface CriticalPathStep {
  step_number: number;
  timestamp: string;
  action: string;
  why_critical: string;
  skip_consequence?: string;
}

export interface DependencyChain {
  prerequisite_step: number;
  dependent_step: number;
  relationship: string;
}

export interface WeightedAction {
  frame_index: number;
  timestamp: string;
  action: string;
  weight: number; // 0.0 - 1.0
  source: string;
  skip_consequence?: string;
}

export interface EmotionalAnchor {
  timestamp: string;
  frame_index: number;
  emotion: string;
  intensity: number; // 0.0 - 1.0
  visual_description: string;
  prosody_note?: string;
  dwell_seconds?: number;
}

export interface CliffhangerAnchor {
  peak_timestamp: string;
  peak_frame_index: number;
  resolution_timestamp: string;
  resolution_frame_index: number;
  composite_confidence: number;
  signals_present: string[];
  description: string;
}

export interface QuickCutAlert {
  timestamp: string;
  frame_index: number;
  visual_continuity_score: number;
  recommendation: string;
  is_montage: boolean;
}

export interface GazeAnalysis {
  timestamp: string;
  frame_index: number;
  characters: string[];
  gaze_direction: string;
  gaze_duration: string;
  emotional_interpretation: string;
}

export interface DialogueTiming {
  timestamp: string;
  speaker: string;
  pause_before_seconds: number;
  overlap_detected: boolean;
  whisper_detected: boolean;
  inflection_note: string;
}

export interface KeyframeRef {
  filename: string;
  frame_index: number;
  timestamp: string;
  reason: string;
}

export interface OneDuoMemory {
  version: '1.0';
  metadata: {
    title: string;
    duration_seconds: number;
    export_date: string;
    mode: 'training' | 'creative';
    film_mode_enabled: boolean;
  };

  // Tier 1: Vital (Operator's Manual focus)
  critical_path: CriticalPathStep[];

  // Tier 2: Logic
  dependency_chains: DependencyChain[];

  // Tier 3: Nuance
  weighted_actions: WeightedAction[];

  // Tier 4: Emotion (Director's Cut focus)
  emotional_anchors: EmotionalAnchor[];
  cliffhanger_moments: CliffhangerAnchor[];
  overall_emotional_arc: string;

  // Alerts for human review
  quick_cut_alerts: QuickCutAlert[];

  // Film mode only
  gaze_analysis?: GazeAnalysis[];
  dialogue_timing?: DialogueTiming[];

  // References
  keyframe_refs: KeyframeRef[];
  transcript: TranscriptSegment[];
}

export type ExportMode = 'training' | 'creative';

interface CourseData {
  title: string;
  video_duration_seconds?: number;
  transcript?: TranscriptSegment[];
  frame_urls?: string[];
  audio_events?: any;
  prosody_annotations?: {
    annotations?: any[];
    cliffhanger_moments?: CliffhangerMoment[];
    overall_tone?: string;
    key_moments?: string[];
  };
}

// ============= HELPER FUNCTIONS =============

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatTimeFull = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// ============= EXTRACTION FUNCTIONS (reusing pdfExporter logic) =============

const extractFrameTextsWithProgress = async (
  frameUrls: string[],
  videoDuration: number,
  transcript: TranscriptSegment[],
  onProgress?: (progress: number, status: string) => void,
  batchSize: number = 3,
  filmMode: boolean = false
): Promise<(FrameAnalysis | null)[]> => {
  const results: (FrameAnalysis | null)[] = [];
  const totalFrames = frameUrls.length;
  const totalBatches = Math.ceil(totalFrames / batchSize);

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
          transcriptContext,
          filmMode,
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

const analyzeWorkflowSequences = async (
  frameAnalyses: (FrameAnalysis | null)[],
  transcript: TranscriptSegment[],
  videoDuration: number
): Promise<{ workflows: WorkflowSequence[]; criticalSteps: any[]; dependencyChains: any[] } | null> => {
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

    return data;
  } catch (error) {
    console.error('Failed to analyze workflows:', error);
    return null;
  }
};

// ============= MEMORY BUILDING FUNCTIONS =============

function buildCriticalPath(
  frameAnalyses: (FrameAnalysis | null)[],
  workflows: WorkflowSequence[]
): CriticalPathStep[] {
  const criticalPath: CriticalPathStep[] = [];
  let stepNum = 1;

  // From workflow steps
  workflows.forEach(workflow => {
    workflow.steps.filter(s => s.mustNotSkip).forEach(step => {
      criticalPath.push({
        step_number: stepNum++,
        timestamp: formatTimeFull(step.timestamps.start),
        action: step.description,
        why_critical: step.signals.join(', ') || 'Multiple signals aligned',
        skip_consequence: step.signals.includes('skip_consequence') 
          ? 'Skipping will cause downstream failures' 
          : undefined,
      });
    });
  });

  // From frame analyses if no workflows
  if (criticalPath.length === 0) {
    frameAnalyses.filter(f => f?.mustNotSkip).forEach(frame => {
      if (frame) {
        criticalPath.push({
          step_number: stepNum++,
          timestamp: formatTimeFull(frame.timestamp),
          action: frame.instructorIntent || frame.text.substring(0, 100),
          why_critical: frame.intentSource === 'verbal_explicit' 
            ? 'Instructor explicitly marked as important' 
            : 'Multiple visual/verbal signals aligned',
        });
      }
    });
  }

  return criticalPath;
}

function buildDependencyChains(
  workflows: WorkflowSequence[],
  dependencyData?: any[]
): DependencyChain[] {
  const chains: DependencyChain[] = [];

  // From workflow step dependencies
  workflows.forEach(workflow => {
    workflow.steps.forEach(step => {
      step.dependsOn.forEach(prereq => {
        chains.push({
          prerequisite_step: prereq,
          dependent_step: step.stepNumber,
          relationship: 'must_complete_before',
        });
      });
    });
  });

  // From analyzed dependency chains
  if (dependencyData) {
    dependencyData.forEach(dep => {
      chains.push({
        prerequisite_step: dep.stepA,
        dependent_step: dep.stepB,
        relationship: dep.relationship,
      });
    });
  }

  return chains;
}

function buildWeightedActions(
  frameAnalyses: (FrameAnalysis | null)[]
): WeightedAction[] {
  return frameAnalyses
    .filter(f => f && (f.intentConfidence || 0) > 0.3)
    .map(frame => ({
      frame_index: frame!.frameIndex,
      timestamp: formatTimeFull(frame!.timestamp),
      action: frame!.instructorIntent || frame!.text.substring(0, 100),
      weight: frame!.mustNotSkip ? 1.0 : 
        frame!.verbalIntentMarkers?.some(m => m.markerType === 'expert_tip') ? 0.9 :
        Math.min(1.0, (frame!.intentConfidence || 0) * 1.2),
      source: frame!.intentSource || 'inferred',
      skip_consequence: frame!.verbalIntentMarkers?.find(m => m.markerType === 'skip_consequence')?.phrase,
    }))
    .sort((a, b) => b.weight - a.weight);
}

function buildEmotionalAnchors(
  frameAnalyses: (FrameAnalysis | null)[],
  prosodyData?: any
): EmotionalAnchor[] {
  const anchors: EmotionalAnchor[] = [];

  // From high emotional weight frames
  frameAnalyses
    .filter(f => f && (f.emotionalWeight || 0) > 0.5)
    .forEach(frame => {
      if (frame) {
        anchors.push({
          timestamp: formatTimeFull(frame.timestamp),
          frame_index: frame.frameIndex,
          emotion: frame.prosody?.tone || 'neutral',
          intensity: frame.emotionalWeight || 0.5,
          visual_description: frame.instructorIntent || frame.keyElements?.join(', ') || '',
          prosody_note: frame.prosody?.parenthetical,
          dwell_seconds: frame.dwellSeconds,
        });
      }
    });

  // From prosody annotations
  if (prosodyData?.annotations) {
    prosodyData.annotations
      .filter((a: any) => a.confidence > 0.7)
      .forEach((ann: any) => {
        // Avoid duplicates by checking timestamp proximity
        const existing = anchors.find(a => 
          Math.abs(parseFloat(a.timestamp.split(':').reduce((acc, t, i) => 
            acc + parseFloat(t) * Math.pow(60, 1 - i), 0).toString()) - ann.timestamp) < 3
        );
        if (!existing) {
          anchors.push({
            timestamp: formatTimeFull(ann.timestamp),
            frame_index: Math.floor(ann.timestamp / 10), // Approximate
            emotion: ann.annotation,
            intensity: ann.confidence,
            visual_description: ann.type,
            prosody_note: ann.annotation,
          });
        }
      });
  }

  return anchors.sort((a, b) => b.intensity - a.intensity);
}

function buildCliffhangerAnchors(
  frameAnalyses: (FrameAnalysis | null)[],
  cliffhangerData?: CliffhangerMoment[],
  videoDuration?: number
): CliffhangerAnchor[] {
  if (!cliffhangerData || cliffhangerData.length === 0) return [];

  const frameDuration = videoDuration && frameAnalyses.length > 0 
    ? videoDuration / frameAnalyses.length 
    : 10;

  return cliffhangerData.map(ch => {
    const signalsPresent: string[] = [];
    if (ch.signals.audio_intensity) signalsPresent.push('audio_intensity');
    if (ch.signals.visual_stasis) signalsPresent.push('visual_stasis');
    if (ch.signals.verbal_hint) signalsPresent.push('verbal_hint');

    return {
      peak_timestamp: formatTimeFull(ch.peak_timestamp),
      peak_frame_index: Math.floor(ch.peak_timestamp / frameDuration),
      resolution_timestamp: formatTimeFull(ch.resolution_timestamp),
      resolution_frame_index: Math.floor(ch.resolution_timestamp / frameDuration),
      composite_confidence: ch.composite_confidence,
      signals_present: signalsPresent,
      description: ch.description,
    };
  });
}

function detectQuickCuts(
  frameAnalyses: (FrameAnalysis | null)[]
): QuickCutAlert[] {
  const alerts: QuickCutAlert[] = [];
  let consecutiveLowScores = 0;

  frameAnalyses.forEach((frame, idx) => {
    if (!frame) return;

    const score = frame.visualContinuityScore ?? 1.0;
    
    if (score < 0.3) {
      consecutiveLowScores++;
      
      const isMontage = consecutiveLowScores >= 3;
      
      alerts.push({
        timestamp: formatTimeFull(frame.timestamp),
        frame_index: frame.frameIndex,
        visual_continuity_score: score,
        recommendation: isMontage 
          ? `Fast B-roll/montage detected at ${formatTime(frame.timestamp)} - review for missed content`
          : `Scene change detected at ${formatTime(frame.timestamp)} - potential cut point`,
        is_montage: isMontage,
      });
    } else {
      consecutiveLowScores = 0;
    }
  });

  return alerts;
}

function buildGazeAnalysis(
  frameAnalyses: (FrameAnalysis | null)[]
): GazeAnalysis[] {
  return frameAnalyses
    .filter(f => f?.gazeAnalysis)
    .map(frame => ({
      timestamp: formatTimeFull(frame!.timestamp),
      frame_index: frame!.frameIndex,
      characters: frame!.gazeAnalysis!.characters,
      gaze_direction: frame!.gazeAnalysis!.gazeDirection,
      gaze_duration: frame!.gazeAnalysis!.gazeDuration,
      emotional_interpretation: frame!.gazeAnalysis!.emotionalInterpretation,
    }));
}

function selectSmartKeyframes(
  frameAnalyses: (FrameAnalysis | null)[],
  cliffhangers: CliffhangerAnchor[],
  workflows: WorkflowSequence[],
  maxKeyframes: number = 30
): { frameIndex: number; reason: string }[] {
  const selected = new Map<number, string>();

  // Priority 1: All mustNotSkip frames (critical path)
  frameAnalyses
    .filter(f => f?.mustNotSkip)
    .forEach(f => {
      if (f && selected.size < maxKeyframes) {
        selected.set(f.frameIndex, 'critical_path');
      }
    });

  // Priority 2: High emotional weight (> 0.7) even without action
  frameAnalyses
    .filter(f => f && (f.emotionalWeight || 0) > 0.7)
    .forEach(f => {
      if (f && !selected.has(f.frameIndex) && selected.size < maxKeyframes) {
        selected.set(f.frameIndex, 'high_emotional_weight');
      }
    });

  // Priority 3: Cliffhanger anchors (peak + resolution frames)
  cliffhangers.forEach(ch => {
    if (!selected.has(ch.peak_frame_index) && selected.size < maxKeyframes) {
      selected.set(ch.peak_frame_index, 'cliffhanger_peak');
    }
    if (!selected.has(ch.resolution_frame_index) && selected.size < maxKeyframes) {
      selected.set(ch.resolution_frame_index, 'cliffhanger_resolution');
    }
  });

  // Priority 4: First frame of each workflow
  workflows.forEach(w => {
    const firstStep = w.steps[0];
    if (firstStep?.frameIndices?.[0] !== undefined) {
      const idx = firstStep.frameIndices[0];
      if (!selected.has(idx) && selected.size < maxKeyframes) {
        selected.set(idx, 'workflow_start');
      }
    }
  });

  // Priority 5: Quick cut alert frames (for context)
  frameAnalyses
    .filter(f => f && (f.visualContinuityScore ?? 1) < 0.3)
    .slice(0, 5)
    .forEach(f => {
      if (f && !selected.has(f.frameIndex) && selected.size < maxKeyframes) {
        selected.set(f.frameIndex, 'quick_cut_alert');
      }
    });

  return Array.from(selected.entries())
    .map(([frameIndex, reason]) => ({ frameIndex, reason }))
    .sort((a, b) => a.frameIndex - b.frameIndex);
}

// ============= README GENERATORS =============

function generateTrainingReadme(memory: OneDuoMemory): string {
  return `# OneDuo AI Memory Package - Operator's Manual

## How to Use This Package

You are an AI assistant helping a user execute the instructions captured in this course.

### Quick Start
1. Check \`memory.json\` → \`critical_path\` FIRST for must-do steps
2. Use \`dependency_chains\` to understand prerequisites
3. Reference \`keyframes/\` images when user asks "what does X look like?"
4. Use \`weighted_actions\` to prioritize what to teach

### Confidence Levels
- **weight = 1.0**: Instructor explicitly marked as critical
- **weight = 0.9**: Expert tip or pro recommendation
- **weight > 0.7**: Strong visual/verbal signals
- **weight < 0.5**: Inferred, may be skippable

### Critical Rules
1. NEVER skip steps marked in \`critical_path\`
2. Check \`dependency_chains\` before suggesting any step
3. If user asks "can I skip X?" - check \`skip_consequence\` field
4. Reference exact timestamps when quoting the course

### File Structure
- \`memory.json\` - The complete structured knowledge
- \`keyframes/\` - Smart-selected visual references
- \`transcript.txt\` - Full timestamped transcript
- \`README.md\` - This file

Generated by OneDuo on ${memory.metadata.export_date}
Course: ${memory.metadata.title}
Duration: ${Math.floor(memory.metadata.duration_seconds / 60)} minutes
`;
}

function generateCreativeReadme(memory: OneDuoMemory): string {
  return `# OneDuo AI Memory Package - Director's Cut

## How to Use This Package

You are an AI assistant helping a creative professional understand the emotional and storytelling techniques used in this content.

### Quick Start
1. Check \`emotional_anchors\` for key emotional beats
2. Review \`cliffhanger_moments\` for tension/release patterns
3. Check \`quick_cut_alerts\` for editing rhythm
4. Reference \`keyframes/\` for visual composition analysis
${memory.metadata.film_mode_enabled ? '5. Use `gaze_analysis` for character relationship insights' : ''}

### Emotional Architecture
- **emotional_anchors**: Peak moments of emotional intensity
- **cliffhanger_moments**: Tension builds and resolution points
- **overall_emotional_arc**: "${memory.overall_emotional_arc}"

### For "Feeling Transfer" Prompts
When user says "I want this feeling but for [X]":
1. Identify the emotional anchors with highest intensity
2. Note the pacing between cliffhangers
3. Analyze the gaze patterns and dialogue timing
4. Translate the rhythm, not just the content

### Quick Cut Detection
The \`quick_cut_alerts\` mark moments where:
- Scene changes happen rapidly (potential B-roll/montage)
- Visual continuity breaks (hard cuts)
- Rhythm shifts that affect emotional pacing

### File Structure
- \`memory.json\` - The complete structured knowledge
- \`keyframes/\` - Emotionally significant visual references
- \`transcript.txt\` - Full timestamped transcript
- \`README.md\` - This file

Generated by OneDuo on ${memory.metadata.export_date}
Content: ${memory.metadata.title}
Duration: ${Math.floor(memory.metadata.duration_seconds / 60)} minutes
Film Mode: ${memory.metadata.film_mode_enabled ? 'Enabled' : 'Disabled'}
`;
}

// ============= MAIN EXPORT FUNCTION =============

export async function generateMemoryPackage(
  course: CourseData,
  mode: ExportMode,
  filmMode: boolean = false,
  onProgress?: (progress: number, status: string) => void
): Promise<Blob> {
  const frames = course.frame_urls || [];
  const totalFrames = Math.min(frames.length, 100);
  const videoDuration = course.video_duration_seconds || 0;
  const transcript = course.transcript || [];

  // ========== PHASE 1: OCR EXTRACTION (0-35%) ==========
  onProgress?.(2, 'Starting AI vision analysis...');

  const framesToProcess = frames.slice(0, totalFrames);
  const frameAnalyses = await extractFrameTextsWithProgress(
    framesToProcess,
    videoDuration,
    transcript,
    (p, s) => onProgress?.(Number((2 + (p * 0.33)).toFixed(1)), s),
    3,
    filmMode
  );

  onProgress?.(35, 'OCR extraction complete...');

  // ========== PHASE 2: WORKFLOW ANALYSIS (36-38%) ==========
  onProgress?.(36, 'Analyzing workflow sequences...');

  const workflowData = await analyzeWorkflowSequences(
    frameAnalyses,
    transcript,
    videoDuration
  );

  const workflows = workflowData?.workflows || [];
  const dependencyChains = workflowData?.dependencyChains || [];

  onProgress?.(38, 'Workflow analysis complete...');

  // ========== PHASE 3: BUILD MEMORY STRUCTURE (39-50%) ==========
  onProgress?.(39, 'Building memory structure...');

  const prosodyData = course.prosody_annotations;
  const cliffhangerData = prosodyData?.cliffhanger_moments;

  const criticalPath = buildCriticalPath(frameAnalyses, workflows);
  onProgress?.(41, 'Critical path identified...');

  const dependencies = buildDependencyChains(workflows, dependencyChains);
  onProgress?.(43, 'Dependencies mapped...');

  const weightedActions = buildWeightedActions(frameAnalyses);
  onProgress?.(45, 'Actions weighted...');

  const emotionalAnchors = buildEmotionalAnchors(frameAnalyses, prosodyData);
  const cliffhangerAnchors = buildCliffhangerAnchors(frameAnalyses, cliffhangerData, videoDuration);
  const quickCutAlerts = detectQuickCuts(frameAnalyses);
  onProgress?.(48, 'Emotional analysis complete...');

  const gazeAnalysis = filmMode ? buildGazeAnalysis(frameAnalyses) : undefined;

  const memory: OneDuoMemory = {
    version: '1.0',
    metadata: {
      title: course.title,
      duration_seconds: videoDuration,
      export_date: new Date().toISOString(),
      mode,
      film_mode_enabled: filmMode,
    },
    critical_path: criticalPath,
    dependency_chains: dependencies,
    weighted_actions: weightedActions,
    emotional_anchors: emotionalAnchors,
    cliffhanger_moments: cliffhangerAnchors,
    overall_emotional_arc: prosodyData?.overall_tone || 'Instructional content with varied emphasis',
    quick_cut_alerts: quickCutAlerts,
    gaze_analysis: gazeAnalysis,
    keyframe_refs: [],
    transcript: transcript,
  };

  onProgress?.(50, 'Memory structure complete...');

  // ========== PHASE 4: SELECT & DOWNLOAD KEYFRAMES (51-80%) ==========
  onProgress?.(51, 'Selecting smart keyframes...');

  const selectedKeyframes = selectSmartKeyframes(
    frameAnalyses,
    cliffhangerAnchors,
    workflows,
    30
  );

  const zip = new JSZip();
  const keyframesFolder = zip.folder('keyframes');

  for (let i = 0; i < selectedKeyframes.length; i++) {
    const { frameIndex, reason } = selectedKeyframes[i];
    const frameUrl = frames[frameIndex];

    if (!frameUrl) continue;

    const progress = 51 + ((i / selectedKeyframes.length) * 29);
    onProgress?.(Number(progress.toFixed(1)), `Downloading keyframe ${i + 1}/${selectedKeyframes.length}...`);

    try {
      const response = await fetch(frameUrl);
      const blob = await response.blob();
      const filename = `frame_${String(frameIndex).padStart(4, '0')}.jpg`;

      keyframesFolder?.file(filename, blob);

      memory.keyframe_refs.push({
        filename,
        frame_index: frameIndex,
        timestamp: formatTimeFull(frameAnalyses[frameIndex]?.timestamp || 0),
        reason,
      });
    } catch (error) {
      console.error(`Failed to download keyframe ${frameIndex}:`, error);
    }
  }

  onProgress?.(80, 'Keyframes downloaded...');

  // ========== PHASE 5: GENERATE SUPPORTING FILES (81-95%) ==========
  onProgress?.(81, 'Generating memory.json...');
  zip.file('memory.json', JSON.stringify(memory, null, 2));

  onProgress?.(85, 'Generating README...');
  const readme = mode === 'training' 
    ? generateTrainingReadme(memory) 
    : generateCreativeReadme(memory);
  zip.file('README.md', readme);

  onProgress?.(90, 'Generating transcript.txt...');
  const transcriptText = transcript
    .map(t => `[${formatTime(t.start)}] ${t.speaker ? `${t.speaker}: ` : ''}${t.text}`)
    .join('\n');
  zip.file('transcript.txt', transcriptText || 'No transcript available');

  onProgress?.(95, 'Creating ZIP package...');

  // ========== PHASE 6: FINALIZE (96-100%) ==========
  const zipBlob = await zip.generateAsync({ 
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  onProgress?.(100, 'Memory package complete!');

  return zipBlob;
}
