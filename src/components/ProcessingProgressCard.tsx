/**
 * ProcessingProgressCard - Premium processing progress UI
 * Shows prominent progress with reassuring animations and milestone messages
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Clock, Loader2, AlertTriangle, Send, Cloud, 
  Sparkles, Zap, FileText, Mail
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface ProcessingProgressCardProps {
  title: string;
  progressStep?: string;
  displayProgress: number;
  estimatedTimeRemaining: string;
  videoDurationSeconds?: number;
  syncStatus: { isStale: boolean; message: string; isStarting: boolean };
  isDelayed?: boolean;
  onTeamEmailSubmit: (email: string) => void;
}

// Progress step configuration with milestone messages
const progressStepConfig: Record<string, { 
  label: string; 
  icon: typeof Loader2;
  message: string;
  color: string;
}> = {
  uploading: { 
    label: 'Uploading video', 
    icon: Cloud,
    message: 'Securely uploading your content...',
    color: 'cyan'
  },
  queued: { 
    label: 'Starting', 
    icon: Zap,
    message: 'Your video is queued for processing',
    color: 'cyan'
  },
  extracting_frames: { 
    label: 'Extracting frames', 
    icon: Sparkles,
    message: 'This usually takes 2-3 minutes for most videos',
    color: 'purple'
  },
  transcribing: { 
    label: 'Transcribing audio', 
    icon: FileText,
    message: 'Converting speech to text with AI...',
    color: 'blue'
  },
  analyzing: { 
    label: 'Analyzing content', 
    icon: Sparkles,
    message: 'Almost there! AI is understanding your content',
    color: 'amber'
  },
  generating_artifact: { 
    label: 'Generating PDF', 
    icon: FileText,
    message: 'Creating your OneDuo artifact...',
    color: 'emerald'
  },
  finalizing: { 
    label: 'Finalizing', 
    icon: Sparkles,
    message: 'Just a few more seconds...',
    color: 'emerald'
  },
};

// Get step info based on progress_step or fallback to progress percentage
function getStepInfo(progressStep?: string, displayProgress?: number) {
  if (progressStep && progressStepConfig[progressStep]) {
    return progressStepConfig[progressStep];
  }
  
  // Fallback based on progress percentage
  const p = displayProgress || 0;
  if (p < 10) return progressStepConfig.queued;
  if (p < 40) return progressStepConfig.extracting_frames;
  if (p < 60) return progressStepConfig.transcribing;
  if (p < 80) return progressStepConfig.analyzing;
  if (p < 95) return progressStepConfig.generating_artifact;
  return progressStepConfig.finalizing;
}

// Color classes based on step
const colorClasses: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  cyan: { 
    bg: 'bg-cyan-500', 
    text: 'text-cyan-400', 
    border: 'border-cyan-500/30',
    glow: 'shadow-cyan-500/20'
  },
  purple: { 
    bg: 'bg-purple-500', 
    text: 'text-purple-400', 
    border: 'border-purple-500/30',
    glow: 'shadow-purple-500/20'
  },
  blue: { 
    bg: 'bg-blue-500', 
    text: 'text-blue-400', 
    border: 'border-blue-500/30',
    glow: 'shadow-blue-500/20'
  },
  amber: { 
    bg: 'bg-amber-500', 
    text: 'text-amber-400', 
    border: 'border-amber-500/30',
    glow: 'shadow-amber-500/20'
  },
  emerald: { 
    bg: 'bg-emerald-500', 
    text: 'text-emerald-400', 
    border: 'border-emerald-500/30',
    glow: 'shadow-emerald-500/20'
  },
};

export function ProcessingProgressCard({
  title,
  progressStep,
  displayProgress,
  estimatedTimeRemaining,
  videoDurationSeconds,
  syncStatus,
  isDelayed,
  onTeamEmailSubmit,
}: ProcessingProgressCardProps) {
  const [teamEmail, setTeamEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  const stepInfo = getStepInfo(progressStep, displayProgress);
  const colors = colorClasses[stepInfo.color] || colorClasses.cyan;
  const StepIcon = stepInfo.icon;
  
  const handleSubmit = () => {
    if (teamEmail && teamEmail.includes('@')) {
      onTeamEmailSubmit(teamEmail);
      setIsSubmitted(true);
    } else {
      toast.error('Please enter a valid email');
    }
  };

  // Format estimated frames for long videos
  const estimatedFrames = videoDurationSeconds ? Math.floor(videoDurationSeconds * 3) : null;
  const processedFrames = estimatedFrames ? Math.floor((displayProgress / 100) * estimatedFrames) : null;

  return (
    <div className={`rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border ${colors.border} p-5 shadow-lg ${colors.glow}`}>
      {/* Header with step name and icon */}
      <div className="flex items-center gap-3 mb-4">
        <motion.div
          className={`w-12 h-12 rounded-xl ${colors.bg}/20 flex items-center justify-center`}
          animate={!syncStatus.isStale ? { 
            scale: [1, 1.05, 1],
          } : undefined}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <StepIcon className={`w-6 h-6 ${colors.text} ${!syncStatus.isStale ? 'animate-pulse' : ''}`} />
        </motion.div>
        <div className="flex-1 min-w-0">
          <h3 className={`text-xl font-bold ${colors.text}`}>
            {stepInfo.label}...
          </h3>
          <p className="text-sm text-white/60 truncate">{title}</p>
        </div>
        {/* Live indicator */}
        {!syncStatus.isStale && (
          <motion.div
            className={`px-3 py-1 rounded-full ${colors.bg}/20 flex items-center gap-2`}
            animate={{ opacity: [1, 0.7, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <motion.div 
              className={`w-2 h-2 rounded-full ${colors.bg}`}
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            <span className={`text-xs font-medium ${colors.text}`}>Live</span>
          </motion.div>
        )}
      </div>

      {/* Delayed warning */}
      {isDelayed && (
        <div className="mb-4 flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span className="text-amber-400">Processing may be delayed</span>
          <a 
            href="mailto:support@oneduo.app" 
            className="ml-auto text-amber-400 underline hover:no-underline text-xs"
          >
            Contact support
          </a>
        </div>
      )}

      {/* Main progress section */}
      <div className="space-y-4">
        {/* Percentage display - large and prominent */}
        <div className="flex items-end justify-between">
          <div>
            <span className="text-4xl font-bold text-white tabular-nums">
              {Math.floor(displayProgress)}
            </span>
            <span className="text-2xl text-white/60">%</span>
          <span className="text-sm text-white/40 ml-2">progress</span>
          </div>
          {/* Frame count for long videos */}
          {processedFrames && estimatedFrames && estimatedFrames > 1000 && (
            <div className="text-right">
              <p className="text-sm text-white/60 tabular-nums">
                <span className="text-white font-medium">{processedFrames.toLocaleString()}</span>
                <span className="text-white/40"> / {estimatedFrames.toLocaleString()}</span>
              </p>
              <p className="text-xs text-white/40">frames processed</p>
            </div>
          )}
        </div>

        {/* Progress bar - thick and animated */}
        <div className="relative">
          <div className="h-4 rounded-full bg-white/10 overflow-hidden">
            {displayProgress < 3 && !syncStatus.isStale ? (
              /* Indeterminate animation for very low progress */
              <motion.div
                className={`h-full w-1/3 bg-gradient-to-r from-transparent via-${stepInfo.color}-400 to-transparent rounded-full`}
                style={{
                  background: `linear-gradient(90deg, transparent, var(--${stepInfo.color}-400, #22d3ee), transparent)`
                }}
                animate={{ x: ['-100%', '300%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
            ) : (
              <motion.div
                className={`h-full relative ${syncStatus.isStale ? 'bg-gradient-to-r from-amber-500 to-amber-400' : `bg-gradient-to-r from-${stepInfo.color}-500 to-${stepInfo.color}-400`}`}
                style={{
                  background: syncStatus.isStale 
                    ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                    : `linear-gradient(90deg, var(--${stepInfo.color}-500, #06b6d4), var(--${stepInfo.color}-400, #22d3ee))`
                }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(displayProgress, 3)}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              >
                {/* Shimmer effect */}
                {!syncStatus.isStale && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ 
                      duration: 1.5, 
                      repeat: Infinity, 
                      ease: 'linear',
                      repeatDelay: 0.5
                    }}
                  />
                )}
              </motion.div>
            )}
          </div>
        </div>

        {/* Time remaining - prominent */}
        <div className={`flex items-center justify-center gap-3 py-3 rounded-xl ${colors.bg}/10`}>
          <Clock className={`w-5 h-5 ${colors.text}`} />
          <span className={`text-lg font-semibold ${colors.text}`}>
            {estimatedTimeRemaining}
          </span>
          <span className="text-sm text-white/40">remaining</span>
        </div>

        {/* Milestone message */}
        <p className="text-center text-sm text-white/60">
          {stepInfo.message}
        </p>

        {/* Extra context for specific phases */}
        {displayProgress >= 20 && displayProgress < 50 && (
          <p className="text-center text-xs text-white/40 px-4">
            💡 Frame extraction may pause briefly — this is normal for longer videos
          </p>
        )}
      </div>

      {/* Safe to close + team email */}
      <div className="mt-5 pt-4 border-t border-white/10 space-y-3">
        {/* Safe to close message */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Mail className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-emerald-400 text-sm font-medium">Safe to close this tab</p>
            <p className="text-white/50 text-xs">{"We'll"} email you when {"it's"} ready</p>
          </div>
        </div>
        
        {/* Team email input */}
        {!isSubmitted ? (
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
            <p className="text-white/60 text-xs mb-2">Notify your team when ready:</p>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="team@example.com"
                value={teamEmail}
                onChange={(e) => setTeamEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                className="h-9 text-sm bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-cyan-500 focus:ring-cyan-500/20"
                autoComplete="email"
              />
              <Button 
                size="sm"
                onClick={handleSubmit}
                className="shrink-0 bg-white/10 hover:bg-white/20 text-white h-9 px-4"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-emerald-400 text-sm">
              ✓ {"We'll"} notify {teamEmail} when ready
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
