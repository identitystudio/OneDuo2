export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
}

export interface ProcessedGif {
  blob?: Blob; // Optional - not present for persisted/restored GIFs
  url: string;
  partNumber: number;
  totalParts: number;
  frameCount: number;
  startTime: number;
  endTime: number;
}

export type ContentType = 'talking' | 'cutaway' | 'broll' | 'voiceover' | 'visual_beat';

export type EditStyle = 'cold-open' | 'reaction-moment' | 'story-beat' | 'punchline' | 'cliffhanger' | 'montage';

export interface EditLayer {
  startTime: string;
  endTime: string;
  layerType: 'talking' | 'broll' | 'cutaway' | 'voiceover';
  description: string;
  audioSource?: 'dialogue' | 'music' | 'ambient' | 'none';
}

export interface EditSequence {
  sequenceNumber: number;
  title: string;
  totalDuration: string;
  viralScore: number;
  whyItWorks: string;
  editStyle: EditStyle;
  dialogueHighlight?: string;
  layers: EditLayer[];
}

export interface StoryBeat {
  start: string;
  end: string;
  reason: string;
  confidence: number;
  type: 'hook' | 'insight' | 'emotion' | 'cta' | 'story' | 'action' | 'aesthetic' | 'transition';
  contentType?: ContentType;
  whatYouSee?: string;
  whatYouHear?: string;
}

export interface ClipProject {
  originalVideoUrl: string;
  gifs: ProcessedGif[];
  transcript: TranscriptSegment[];
  storyBeats: StoryBeat[];
  editSequences: EditSequence[];
  videoDuration: number;
}

export interface EditorState {
  isAnalyzing: boolean;
  analysisProgress: number;
  selectedBeats: StoryBeat[];
  selectedSequences: EditSequence[];
  isExtracting: boolean;
  isStitching: boolean;
}

// Four-Style Editor Types
export type EditingStyle = 'content-creator' | 'podcaster' | 'cinematic' | 'testimonial';

// Editing options per style
export interface EditingOptions {
  // Common options
  enableCaptions: boolean;
  captionStyle: 'professional'; // Single style for now
  
  // Content Creator specific
  enableBroll: boolean;
  
  // Podcaster specific
  enableRealityShow: boolean;
  outputFullVideo: boolean;
  outputShortForm: boolean;
  
  // Testimonial specific
  enableReels: boolean;
  findBestSoundBytes: boolean;
}

export const DEFAULT_EDITING_OPTIONS: EditingOptions = {
  enableCaptions: true,
  captionStyle: 'professional',
  enableBroll: true,
  enableRealityShow: false,
  outputFullVideo: true,
  outputShortForm: true,
  enableReels: false,
  findBestSoundBytes: true,
};

// Video source for multi-video support
export interface VideoSource {
  id: string;
  videoUrl: string;
  gifs: ProcessedGif[];
  transcript: TranscriptSegment[];
  videoDuration: number;
  fileName?: string;
}

// Narrator Voice Options for Cinematic Mode
export interface NarratorVoice {
  id: string;
  name: string;
  style: string;
  example: string;
}

export const NARRATOR_VOICES: NarratorVoice[] = [
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', style: 'Bridgerton', example: 'Warm, sophisticated British - Julie Andrews vibes' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', style: 'Period Drama', example: 'Elegant, refined British - aristocratic tone' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', style: 'Gossip Girl', example: 'Modern American with warmth - Kristen Bell vibes' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', style: 'Inner Voice', example: 'Soft, intimate American - confessional tone' }
];

// Protagonist VO Upload
export interface ProtagonistVO {
  id: string;
  audioUrl: string;
  transcript: string;
  duration: number;
  fileName: string;
}

// Cinematic Scene Structure
export interface CinematicScene {
  sceneNumber: number;
  title: string;
  startTime: string;
  endTime: string;
  duration: string;
  emotionalBeat: 'tension' | 'release' | 'revelation' | 'intimacy' | 'triumph' | 'loss' | 'longing';
  pacing: 'slow-burn' | 'moderate' | 'building' | 'climactic';
  whyItWorks: string;
  layers: CinematicLayer[];
  trailerWorthy: boolean;
  trailerPosition?: 'opener' | 'middle' | 'climax' | 'closer';
}

export interface CinematicLayer {
  startTime: string;
  endTime: string;
  layerType: 'footage' | 'broll' | 'establishing' | 'reaction';
  description: string;
  audioType: 'dialogue' | 'narrator-vo' | 'protagonist-vo' | 'music' | 'ambient' | 'silence';
  audioContent?: string;
  stockBrollKeywords?: string[];
}

// Stock B-roll Result
export interface StockVideo {
  id: number;
  url: string;
  previewUrl: string;
  duration: number;
  width: number;
  height: number;
}

// Testimonial Reel Result
export interface TestimonialClip {
  videoSourceId: string;
  startTime: string;
  endTime: string;
  quote: string;
  impact: 'high' | 'medium' | 'low';
  emotion: string;
}

export interface TestimonialReel {
  clips: TestimonialClip[];
  totalDuration: string;
  narrative: string;
}
