import { motion } from 'framer-motion';
import { Upload, FileText, Layers, Sparkles, Check, Loader2, Clock, Coffee, Zap, Mail } from 'lucide-react';
import { useState, useEffect } from 'react';

export type ProcessingStage = 'idle' | 'uploading' | 'transcribing' | 'extracting' | 'generating' | 'complete';

interface ProcessingStagesProps {
  currentStage: ProcessingStage;
  progress: number;
  videoDurationSeconds?: number;
  startTime?: Date;
  userEmail?: string;
}

const stages = [
  { id: 'uploading', label: 'Uploading', icon: Upload },
  { id: 'transcribing', label: 'Transcribing', icon: FileText },
  { id: 'extracting', label: 'Extracting', icon: Layers },
  { id: 'generating', label: 'Generating', icon: Sparkles },
];

const stageOrder: ProcessingStage[] = ['uploading', 'transcribing', 'extracting', 'generating', 'complete'];

function getStageIndex(stage: ProcessingStage): number {
  return stageOrder.indexOf(stage);
}

function formatElapsedTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 1) return 'less than a minute';
  if (mins === 1) return '1 minute';
  return `${mins} minutes`;
}

function getStageEstimate(stage: ProcessingStage, videoDurationSeconds?: number): string {
  const videoDurationMins = videoDurationSeconds ? Math.round(videoDurationSeconds / 60) : 0;
  const isLongVideo = videoDurationMins > 20;
  
  switch (stage) {
    case 'uploading':
      if (isLongVideo) {
        return `Uploading ${videoDurationMins}-min video... This may take a few minutes`;
      }
      return 'Uploading your video...';
    case 'transcribing':
      if (videoDurationMins > 0) {
        const estimatedMins = Math.max(3, Math.round(videoDurationMins * 0.5));
        const estimatedMax = isLongVideo ? estimatedMins + 8 : estimatedMins + 4;
        return `Transcribing ${videoDurationMins}-min video... Usually takes ${estimatedMins}-${estimatedMax} min`;
      }
      return 'Transcribing audio with AI...';
    case 'extracting':
      if (isLongVideo) {
        const estimatedMins = Math.max(10, Math.round(videoDurationMins * 0.6));
        return `Extracting frames from ${videoDurationMins}-min video... Usually takes ${estimatedMins}-${estimatedMins + 10} min`;
      }
      return 'Extracting key frames... Usually takes 5-10 minutes';
    case 'generating':
      if (isLongVideo) {
        return 'Creating AI-readable GIFs with captions... Final stage, hang tight!';
      }
      return 'Creating AI-readable GIFs with captions... Almost done!';
    default:
      return '';
  }
}

function getTotalEstimate(videoDurationSeconds?: number): string {
  const videoDurationMins = videoDurationSeconds ? Math.round(videoDurationSeconds / 60) : 0;
  
  if (videoDurationMins <= 10) {
    return '5-10 minutes total';
  } else if (videoDurationMins <= 20) {
    return '10-20 minutes total';
  } else if (videoDurationMins <= 30) {
    return '20-35 minutes total';
  } else if (videoDurationMins <= 45) {
    return '30-50 minutes total';
  } else {
    return '45-60+ minutes total';
  }
}

function getEstimatedGifCount(videoDurationSeconds?: number): number {
  if (!videoDurationSeconds) return 0;
  // One GIF per ~4 minutes of video (based on segment density)
  return Math.max(1, Math.ceil(videoDurationSeconds / 240));
}

const tips = [
  { icon: Coffee, text: 'Perfect time for a quick coffee break!' },
  { icon: Zap, text: "We'll keep processing - you can check back anytime" },
  { icon: Clock, text: 'Longer videos take more time, but the result is worth it!' },
  { icon: Mail, text: "We'll email you when it's done - feel free to close this page!" },
];

export function ProcessingStages({ currentStage, progress, videoDurationSeconds, startTime, userEmail }: ProcessingStagesProps) {
  const currentIndex = getStageIndex(currentStage);
  const isComplete = currentStage === 'complete';
  const isProcessing = currentStage !== 'idle' && !isComplete;
  
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  // Update elapsed time every second
  useEffect(() => {
    if (!startTime || !isProcessing) {
      setElapsedSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
      setElapsedSeconds(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, isProcessing]);

  // Rotate tips every 15 seconds
  useEffect(() => {
    if (!isProcessing) return;
    
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % tips.length);
    }, 15000);

    return () => clearInterval(interval);
  }, [isProcessing]);

  const estimatedGifs = getEstimatedGifCount(videoDurationSeconds);
  const currentTip = tips[tipIndex];
  const TipIcon = currentTip.icon;

  return (
    <div className="space-y-4">
      {/* Stage indicators */}
      <div className="flex items-center justify-between">
        {stages.map((stage, index) => {
          const stageIdx = getStageIndex(stage.id as ProcessingStage);
          const isActive = currentIndex === stageIdx;
          const isPast = currentIndex > stageIdx || isComplete;
          const Icon = stage.icon;

          return (
            <div key={stage.id} className="flex flex-col items-center flex-1">
              {/* Icon circle */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0.5 }}
                animate={{
                  scale: isActive ? 1.1 : 1,
                  opacity: isActive || isPast ? 1 : 0.4,
                }}
                transition={{ duration: 0.3 }}
                className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300 ${
                  isPast
                    ? 'bg-green-500/20 border-green-500 text-green-400'
                    : isActive
                    ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                    : 'bg-white/5 border-white/20 text-white/40'
                }`}
              >
                {isPast ? (
                  <Check className="w-5 h-5" />
                ) : isActive ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
              </motion.div>

              {/* Label */}
              <motion.span
                initial={{ opacity: 0.5 }}
                animate={{ opacity: isActive || isPast ? 1 : 0.4 }}
                className={`mt-2 text-xs font-medium transition-colors ${
                  isPast
                    ? 'text-green-400'
                    : isActive
                    ? 'text-purple-300'
                    : 'text-white/40'
                }`}
              >
                {stage.label}
              </motion.span>
            </div>
          );
        })}
      </div>

      {/* Connector lines */}
      <div className="relative -mt-[52px] mx-5 mb-8">
        <div className="flex">
          {stages.slice(0, -1).map((stage, index) => {
            const stageIdx = getStageIndex(stage.id as ProcessingStage);
            const isPast = currentIndex > stageIdx + 1 || isComplete;
            const isTransitioning = currentIndex === stageIdx + 1;

            return (
              <div key={`line-${index}`} className="flex-1 h-0.5 mx-2">
                <div className="relative h-full bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: '0%' }}
                    animate={{
                      width: isPast ? '100%' : isTransitioning ? `${Math.min(progress * 2, 100)}%` : '0%',
                    }}
                    transition={{ duration: 0.3 }}
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-cyan-500 rounded-full"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: '0%' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 via-cyan-500 to-green-500 rounded-full"
        />
        {/* Shimmer effect */}
        {isProcessing && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '200%' }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent"
          />
        )}
      </div>

      {/* Progress percentage and stage info */}
      <div className="space-y-3">
        <div className="flex justify-between items-center text-xs">
          <span className={`font-medium ${isComplete ? 'text-green-400' : 'text-white/60'}`}>
            {isComplete ? 'Complete!' : `${Math.round(progress)}%`}
          </span>
          {isProcessing && startTime && (
            <span className="flex items-center gap-1.5 text-white/60">
              <Clock className="w-3.5 h-3.5" />
              {formatElapsedTime(elapsedSeconds)} elapsed
            </span>
          )}
        </div>

        {/* Stage-specific estimate message */}
        {isProcessing && (
          <motion.div
            key={currentStage}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-2"
          >
            <p className="text-sm text-purple-300/90">
              {getStageEstimate(currentStage, videoDurationSeconds)}
            </p>
            
            {/* Total time estimate */}
            {videoDurationSeconds && videoDurationSeconds > 600 && (
              <p className="text-xs text-cyan-400/70 font-medium">
                ⏱️ Estimated: {getTotalEstimate(videoDurationSeconds)}
              </p>
            )}

            {/* Estimated GIF count */}
            {estimatedGifs > 0 && (
              <p className="text-xs text-white/50">
                📦 Expecting ~{estimatedGifs} GIFs with keyframe PNGs
              </p>
            )}

            {/* Email notification message */}
            {userEmail && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="flex items-center justify-center gap-2 text-xs text-green-400/80 bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-2 mt-3"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>We'll email <strong>{userEmail}</strong> when it's done</span>
              </motion.div>
            )}

            {/* Rotating tips */}
            {elapsedSeconds > 30 && (
              <motion.p
                key={tipIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center gap-2 text-xs text-white/40 mt-2"
              >
                <TipIcon className="w-3.5 h-3.5" />
                {currentTip.text}
              </motion.p>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
