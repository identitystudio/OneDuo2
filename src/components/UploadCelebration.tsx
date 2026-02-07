/**
 * Upload Celebration Component
 * SaaS elegant celebration with sparkles, magic vibes, and animated checkmark
 * Shows immediately when upload hits 100% and transitions to dashboard
 * Extra special confetti for first-time uploads!
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Sparkles, Star, Zap, PartyPopper, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Confetti } from './Confetti';

interface UploadCelebrationProps {
  courseTitle: string;
  onComplete?: () => void;
  isFirstUpload?: boolean;
}

// Sparkle/confetti particle component
const Particle = ({ 
  delay, 
  x, 
  y, 
  size, 
  color, 
  duration 
}: { 
  delay: number; 
  x: number; 
  y: number; 
  size: number; 
  color: string;
  duration: number;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
    animate={{ 
      opacity: [0, 1, 1, 0],
      scale: [0, 1.2, 1, 0.5],
      x: x,
      y: y,
    }}
    transition={{ 
      duration: duration,
      delay: delay,
      ease: [0.22, 0.03, 0.26, 1],
    }}
    className="absolute pointer-events-none"
    style={{
      width: size,
      height: size,
      left: '50%',
      top: '50%',
      marginLeft: -size / 2,
      marginTop: -size / 2,
    }}
  >
    <div 
      className="w-full h-full rounded-full blur-[0.5px]"
      style={{ backgroundColor: color }}
    />
  </motion.div>
);

// Animated star burst
const StarBurst = ({ delay }: { delay: number }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0, rotate: 0 }}
    animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 0], rotate: 180 }}
    transition={{ duration: 0.8, delay, ease: 'easeOut' }}
    className="absolute inset-0 flex items-center justify-center"
  >
    <Star className="w-24 h-24 text-amber-400/40" fill="currentColor" />
  </motion.div>
);

// Magic ring effect
const MagicRing = ({ delay, scale }: { delay: number; scale: number }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.5 }}
    animate={{ opacity: [0, 0.6, 0], scale: [0.5, scale, scale + 0.5] }}
    transition={{ duration: 1.2, delay, ease: 'easeOut' }}
    className="absolute inset-0 flex items-center justify-center"
  >
    <div className="w-32 h-32 rounded-full border-2 border-emerald-400/50" />
  </motion.div>
);

export function UploadCelebration({ courseTitle, onComplete, isFirstUpload = false }: UploadCelebrationProps) {
  const navigate = useNavigate();
  const [showContent, setShowContent] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Generate random particles
  const particles = Array.from({ length: 40 }, (_, i) => {
    const angle = (i / 40) * Math.PI * 2 + Math.random() * 0.5;
    const distance = 80 + Math.random() * 120;
    const colors = [
      'hsl(160, 84%, 50%)', // emerald
      'hsl(38, 92%, 55%)',  // amber
      'hsl(217, 91%, 60%)', // blue
      'hsl(280, 87%, 65%)', // purple
      'hsl(330, 81%, 60%)', // pink
    ];
    
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      delay: Math.random() * 0.3,
      size: 4 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      duration: 0.8 + Math.random() * 0.4,
    };
  });

  useEffect(() => {
    // Show content immediately
    setShowContent(true);
    
    // Trigger confetti for first upload
    if (isFirstUpload) {
      setShowConfetti(true);
    }
    
    // Short delay to show celebration, then navigate to dashboard
    const timer = setTimeout(() => {
      navigate('/dashboard');
      onComplete?.();
    }, 1500); // 1.5 seconds to see celebration before redirect
    
    return () => clearTimeout(timer);
  }, [navigate, onComplete, isFirstUpload]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background"
    >
      {/* Confetti for first upload */}
      <Confetti isActive={showConfetti} pieceCount={isFirstUpload ? 80 : 0} />
      
      {/* Gradient background pulse - extra vibrant for first upload */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isFirstUpload ? [0, 0.4, 0.2] : [0, 0.3, 0.1] }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
        className={`absolute inset-0 ${isFirstUpload 
          ? 'bg-gradient-to-br from-emerald-500/30 via-amber-500/20 to-pink-500/30' 
          : 'bg-gradient-to-br from-emerald-500/20 via-transparent to-amber-500/20'
        }`}
      />

      {/* Main celebration container */}
      <div className="relative">
        {/* Magic rings */}
        <MagicRing delay={0} scale={1.5} />
        <MagicRing delay={0.1} scale={2} />
        <MagicRing delay={0.2} scale={2.5} />

        {/* Star bursts */}
        <StarBurst delay={0.05} />
        <StarBurst delay={0.15} />

        {/* Particle explosion */}
        {particles.map((p) => (
          <Particle key={p.id} {...p} />
        ))}

        {/* Central checkmark - Trophy for first upload */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ 
            type: 'spring',
            stiffness: 200,
            damping: 15,
            delay: 0.1 
          }}
          className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center shadow-2xl ${
            isFirstUpload 
              ? 'bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-500/40' 
              : 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/40'
          }`}
        >
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ 
              type: 'spring',
              stiffness: 300,
              damping: 20,
              delay: 0.3 
            }}
          >
            {isFirstUpload ? (
              <Trophy className="w-12 h-12 text-white stroke-[2]" />
            ) : (
              <Check className="w-12 h-12 text-white stroke-[3]" />
            )}
          </motion.div>
        </motion.div>

        {/* Floating icons around checkmark */}
        <motion.div
          initial={{ opacity: 0, y: 20, x: -60 }}
          animate={{ opacity: [0, 1, 0], y: [-20, -60], x: [-60, -80] }}
          transition={{ duration: 1, delay: 0.2 }}
          className="absolute top-0 left-0"
        >
          <Sparkles className="w-6 h-6 text-amber-400" />
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20, x: 60 }}
          animate={{ opacity: [0, 1, 0], y: [-20, -50], x: [60, 70] }}
          transition={{ duration: 1, delay: 0.3 }}
          className="absolute top-0 right-0"
        >
          <Zap className="w-5 h-5 text-emerald-400" />
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: -20, x: 70 }}
          animate={{ opacity: [0, 1, 0], y: [20, 60], x: [70, 90] }}
          transition={{ duration: 1, delay: 0.25 }}
          className="absolute bottom-0 right-0"
        >
          <PartyPopper className="w-5 h-5 text-pink-400" />
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: -20, x: -70 }}
          animate={{ opacity: [0, 1, 0], y: [20, 50], x: [-70, -85] }}
          transition={{ duration: 1, delay: 0.35 }}
          className="absolute bottom-0 left-0"
        >
          <Star className="w-5 h-5 text-amber-300" fill="currentColor" />
        </motion.div>
      </div>

      {/* Success text */}
      <AnimatePresence>
        {showContent && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="absolute bottom-[30%] text-center px-4"
          >
            <motion.h2 
              className="text-2xl sm:text-3xl font-bold text-foreground mb-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              {isFirstUpload ? '🎉 First Upload Complete!' : 'Upload Complete!'}
            </motion.h2>
            {isFirstUpload && (
              <motion.p 
                className="text-amber-500 font-medium mb-1"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.65, type: 'spring' }}
              >
                Welcome to OneDuo!
              </motion.p>
            )}
            <motion.p 
              className="text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              {courseTitle}
            </motion.p>
            <motion.p 
              className="text-sm text-muted-foreground/70 mt-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
            >
              Taking you to dashboard...
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}