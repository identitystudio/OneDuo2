import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

interface ManualProcessingCardProps {
  title: string;
  className?: string;
}

/**
 * ManualProcessingCard - Friendly UI for courses in "manual_review" status
 * 
 * Instead of showing a scary "failed" state, this displays a reassuring message
 * that the OneDuo team is actively working on the user's content.
 */
export function ManualProcessingCard({ title, className = '' }: ManualProcessingCardProps) {
  return (
    <motion.div 
      className={`relative overflow-hidden rounded-xl ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Gradient background - purple/amber warm tones */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-purple-500/15 to-amber-500/10" />
      
      {/* Animated sparkle background */}
      <div className="absolute inset-0 opacity-30">
        <motion.div
          className="absolute top-2 right-4"
          animate={{ rotate: 360, scale: [1, 1.2, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        >
          <Sparkles className="w-4 h-4 text-purple-300" />
        </motion.div>
        <motion.div
          className="absolute bottom-3 left-6"
          animate={{ rotate: -360, scale: [1, 1.1, 1] }}
          transition={{ duration: 5, repeat: Infinity, ease: "linear", delay: 1 }}
        >
          <Sparkles className="w-3 h-3 text-amber-300" />
        </motion.div>
      </div>
      
      {/* Content */}
      <div className="relative p-5 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <Sparkles className="w-5 h-5 text-purple-300" />
          </div>
          <div>
            <h3 className="font-semibold text-white/90 text-sm">Special Attention Mode</h3>
            <p className="text-xs text-white/50">{title}</p>
          </div>
        </div>
        
        {/* Message */}
        <div className="space-y-2">
          <p className="text-white/80 text-sm leading-relaxed">
            Your content is receiving expert attention from our team to ensure the highest quality Thinking Layer possible.
          </p>
          
          {/* Checklist */}
          <div className="space-y-1.5 py-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-4 h-4 rounded-full bg-emerald-500/30 flex items-center justify-center text-emerald-400">✓</span>
              <span className="text-white/70">Your video is safe and secure</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-4 h-4 rounded-full bg-emerald-500/30 flex items-center justify-center text-emerald-400">✓</span>
              <span className="text-white/70">Our team is actively working on it</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-4 h-4 rounded-full bg-emerald-500/30 flex items-center justify-center text-emerald-400">✓</span>
              <span className="text-white/70">You'll receive an email when ready</span>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="pt-2 border-t border-white/10">
          <p className="text-xs text-white/50 italic">
            Thank you for your patience — Christina
          </p>
        </div>
      </div>
    </motion.div>
  );
}
