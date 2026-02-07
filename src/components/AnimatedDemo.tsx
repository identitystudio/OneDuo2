import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, type Transition } from 'framer-motion';
import { AlertTriangle, Clock, Lock, Sparkles, CheckCircle, Upload, Users, MessageSquare, Brain, Eye, EyeOff, Shield, Lightbulb, Crown, Blocks } from 'lucide-react';

// Visual theme hints
type VisualTheme = 
  | 'gemini-announcement' 
  | 'expiration-warning'
  | 'fragmentation'
  | 'gemini-confessional'
  | 'future-problem'
  | 'chatgpt-confessional'
  | 'claude-confessional'
  | 'reframe'
  | 'grok-confessional'
  | 'poe-confessional'
  | 'copywriting-ai-confessional'
  | 'philosophy'
  | 'human-empowerment'
  | 'use-cases'
  | 'solution-architecture'
  | 'before-after'
  | 'positioning'
  | 'competitive-moat'
  | 'va-login-hell'
  | 'scale-reminder'
  | 'emotional-close'
  | 'cta';

// Demo segments for self-contained animation
const demoSegments: { text: string; visual: VisualTheme; duration: number }[] = [
  { text: "Google just announced Gemini 3 can see video.", visual: 'gemini-announcement', duration: 3000 },
  { text: "Frame by frame. Timestamps. Audio and visual together.", visual: 'gemini-announcement', duration: 3000 },
  { text: "But those uploads? They're temporary. Access expires.", visual: 'expiration-warning', duration: 3500 },
  { text: "Your VA can't see what you uploaded. Neither can ChatGPT or Claude.", visual: 'fragmentation', duration: 4000 },
  { text: "Different platforms. Different ecosystems. Different uploads.", visual: 'fragmentation', duration: 3500 },
  { text: "\"I'm a Ferrari that disappears when access expires.\" - Gemini", visual: 'gemini-confessional', duration: 4000 },
  { text: "Imagine 2026. Every major AI can analyze video. Four separate silos.", visual: 'future-problem', duration: 4000 },
  { text: "\"I'm basically a confident raccoon in a lab coat, improvising.\" - ChatGPT", visual: 'chatgpt-confessional', duration: 4000 },
  { text: "\"I'm a film critic who showed up wearing a blindfold.\" - Claude", visual: 'claude-confessional', duration: 4000 },
  { text: "It wasn't YOUR fault. Your AI isn't just blind—it's isolated.", visual: 'reframe', duration: 3500 },
  { text: "\"I'd handle the seeing. OneDuo handles the winning.\" - Grok", visual: 'grok-confessional', duration: 4500 },
  { text: "\"I aggregate AIs. OneDuo makes them collaborate. Huge difference.\" - Poe", visual: 'poe-confessional', duration: 4000 },
  { text: "\"OneDuo doesn't just make AI smarter. It makes AI remember.\"", visual: 'copywriting-ai-confessional', duration: 4000 },
  { text: "Vision is easy. Wisdom is hard. OneDuo gives AI YOUR BRAIN.", visual: 'philosophy', duration: 4000 },
  { text: "Human + AI. Together. OneDuo.", visual: 'human-empowerment', duration: 3000 },
  { text: "Upload once. Share everywhere. Permanent link.", visual: 'solution-architecture', duration: 3500 },
  { text: "Try Free — No Credit Card Required", visual: 'cta', duration: 4000 },
];

// Visual scene components
function VisualScene({ visual, caption }: { visual: VisualTheme; caption: string }) {
  const smoothTransition: Transition = { duration: 0.8, ease: [0.4, 0, 0.2, 1] };

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <AnimatePresence mode="wait">
        {visual === 'gemini-announcement' && (
          <motion.div key="gemini-announce" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={smoothTransition} className="flex flex-col items-center gap-6">
            <motion.div animate={{ scale: [1, 1.03, 1] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} className="w-28 h-28 md:w-36 md:h-36 rounded-3xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <span className="text-5xl md:text-6xl font-bold text-white">G</span>
            </motion.div>
            <span className="text-white/50 text-base md:text-lg font-medium">GEMINI 3 - VIDEO VISION</span>
          </motion.div>
        )}

        {visual === 'expiration-warning' && (
          <motion.div key="expiration" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={smoothTransition} className="flex flex-col items-center gap-6">
            <motion.div animate={{ rotate: [-5, 5, -5] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}>
              <AlertTriangle className="w-28 h-28 md:w-36 md:h-36 text-red-500" />
            </motion.div>
            <motion.div className="flex items-center gap-3 text-red-400" animate={{ opacity: [1, 0.6, 1] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}>
              <Clock className="w-7 h-7" />
              <span className="text-2xl md:text-3xl font-bold">48 HOUR EXPIRATION</span>
            </motion.div>
          </motion.div>
        )}

        {visual === 'fragmentation' && (
          <motion.div key="frag" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={smoothTransition} className="flex flex-col items-center gap-6">
            <div className="grid grid-cols-4 gap-4">
              {['G', '◎', 'C', 'X'].map((letter, i) => (
                <motion.div key={i} initial={{ scale: 0, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ delay: i * 0.15, duration: 0.5, ease: "easeOut" }} className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
                  <span className="text-2xl md:text-3xl font-bold text-white/70">{letter}</span>
                </motion.div>
              ))}
            </div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.5 }} className="flex items-center gap-3 text-red-400 text-base md:text-lg">
              <Lock className="w-6 h-6" />
              <span className="font-medium">Isolated Silos</span>
            </motion.div>
          </motion.div>
        )}

        {visual === 'gemini-confessional' && (
          <motion.div key="gemini-conf" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={smoothTransition} className="flex flex-col items-center gap-6">
            <motion.div animate={{ boxShadow: ['0 0 30px rgba(139,92,246,0.2)', '0 0 60px rgba(139,92,246,0.4)', '0 0 30px rgba(139,92,246,0.2)'] }} transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }} className="w-24 h-24 md:w-32 md:h-32 rounded-3xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <span className="text-4xl md:text-5xl font-bold text-white">G</span>
            </motion.div>
            <span className="text-violet-400 text-base md:text-lg font-medium">Gemini Confessional</span>
          </motion.div>
        )}

        {visual === 'future-problem' && (
          <motion.div key="future" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={smoothTransition} className="flex flex-col items-center gap-6">
            <motion.span animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }} className="text-5xl md:text-6xl font-black bg-gradient-to-r from-red-400 to-orange-500 bg-clip-text text-transparent">2026</motion.span>
            <span className="text-orange-400 text-base md:text-lg font-medium">FOUR SEPARATE CAGES</span>
          </motion.div>
        )}

        {visual === 'chatgpt-confessional' && (
          <motion.div key="chatgpt" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={smoothTransition} className="flex flex-col items-center gap-6">
            <motion.div animate={{ boxShadow: ['0 0 30px rgba(16,185,129,0.2)', '0 0 60px rgba(16,185,129,0.4)', '0 0 30px rgba(16,185,129,0.2)'] }} transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }} className="w-24 h-24 md:w-32 md:h-32 rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
              <MessageSquare className="w-12 h-12 md:w-16 md:h-16 text-white" />
            </motion.div>
            <span className="text-emerald-400 text-base md:text-lg font-medium">ChatGPT Confessional</span>
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.5 }} className="text-3xl md:text-4xl">🦝🥼</motion.span>
          </motion.div>
        )}

        {visual === 'claude-confessional' && (
          <motion.div key="claude" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={smoothTransition} className="flex flex-col items-center gap-6">
            <motion.div animate={{ boxShadow: ['0 0 30px rgba(251,146,60,0.2)', '0 0 60px rgba(251,146,60,0.4)', '0 0 30px rgba(251,146,60,0.2)'] }} transition={{ duration: 2.5, repeat: Infinity, ease: [0.4, 0, 0.2, 1] }} className="w-24 h-24 md:w-32 md:h-32 rounded-3xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center">
              <span className="text-4xl md:text-5xl font-bold text-white">C</span>
            </motion.div>
            <span className="text-orange-400 text-base md:text-lg font-medium">Claude Confessional</span>
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.5 }} className="text-3xl md:text-4xl">🎬🙈</motion.span>
          </motion.div>
        )}

        {visual === 'reframe' && (
          <motion.div key="reframe" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={smoothTransition} className="flex flex-col items-center gap-6">
            <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 2.5, repeat: Infinity, ease: [0.4, 0, 0.2, 1] }}>
              <Lightbulb className="w-24 h-24 md:w-32 md:h-32 text-amber-400" />
            </motion.div>
            <span className="text-amber-400 text-base md:text-lg font-medium">IT WASN'T YOUR FAULT</span>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5, duration: 0.5 }} className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-400" />
              <span className="text-white/70 text-sm md:text-base">Your VA isn't stupid</span>
            </motion.div>
          </motion.div>
        )}

        {visual === 'grok-confessional' && (
          <motion.div key="grok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={smoothTransition} className="flex flex-col items-center gap-6">
            <motion.div animate={{ boxShadow: ['0 0 30px rgba(255,255,255,0.1)', '0 0 60px rgba(255,255,255,0.3)', '0 0 30px rgba(255,255,255,0.1)'] }} transition={{ duration: 2.5, repeat: Infinity, ease: [0.4, 0, 0.2, 1] }} className="w-24 h-24 md:w-32 md:h-32 rounded-3xl bg-gray-800 border border-white/30 flex items-center justify-center">
              <span className="text-4xl md:text-5xl font-bold text-white">X</span>
            </motion.div>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.5 }} className="flex flex-col items-center gap-2">
              <span className="text-cyan-400 text-lg md:text-xl font-bold">OneDuo handles the WINNING</span>
              <Crown className="w-8 h-8 text-yellow-400" />
            </motion.div>
          </motion.div>
        )}

        {visual === 'poe-confessional' && (
          <motion.div key="poe" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={smoothTransition} className="flex flex-col items-center gap-6">
            <motion.div animate={{ boxShadow: ['0 0 30px rgba(168,85,247,0.2)', '0 0 60px rgba(168,85,247,0.4)', '0 0 30px rgba(168,85,247,0.2)'] }} transition={{ duration: 2.5, repeat: Infinity, ease: [0.4, 0, 0.2, 1] }} className="w-24 h-24 md:w-32 md:h-32 rounded-3xl bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center">
              <Blocks className="w-12 h-12 md:w-16 md:h-16 text-white" />
            </motion.div>
            <span className="text-purple-400 text-base md:text-lg font-medium">Poe Confessional</span>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="text-white/40 text-sm md:text-base">
              Aggregation ≠ Collaboration
            </motion.div>
          </motion.div>
        )}

        {visual === 'copywriting-ai-confessional' && (
          <motion.div key="copywriting" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={smoothTransition} className="flex flex-col items-center gap-6">
            <motion.div className="flex items-center gap-4">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center">
                <Users className="w-8 h-8 md:w-10 md:h-10 text-white" />
              </div>
              <span className="text-white/60 text-3xl md:text-4xl">+</span>
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center">
                <Brain className="w-8 h-8 md:w-10 md:h-10 text-white" />
              </div>
            </motion.div>
            <span className="text-pink-400 text-base md:text-lg font-medium">Human + AI Collaboration</span>
          </motion.div>
        )}

        {visual === 'philosophy' && (
          <motion.div key="philosophy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={smoothTransition} className="flex flex-col items-center gap-6">
            <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="w-28 h-28 md:w-36 md:h-36 rounded-full bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 flex items-center justify-center">
              <Brain className="w-14 h-14 md:w-18 md:h-18 text-white" />
            </motion.div>
            <div className="flex flex-col items-center gap-2">
              <span className="text-cyan-400 text-xl md:text-2xl font-bold">WISDOM &gt; VISION</span>
              <span className="text-white/50 text-sm md:text-base">OneDuo gives AI YOUR BRAIN</span>
            </div>
          </motion.div>
        )}

        {visual === 'human-empowerment' && (
          <motion.div key="human" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={smoothTransition} className="flex flex-col items-center gap-6">
            <div className="flex items-center gap-6">
              <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                <Users className="w-10 h-10 md:w-12 md:h-12 text-white" />
              </motion.div>
              <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }} className="text-4xl md:text-5xl text-cyan-400">+</motion.span>
              <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2, delay: 0.5, repeat: Infinity, ease: "easeInOut" }} className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center">
                <Brain className="w-10 h-10 md:w-12 md:h-12 text-white" />
              </motion.div>
            </div>
            <span className="text-cyan-400 text-xl md:text-2xl font-bold">Human + AI. Together.</span>
          </motion.div>
        )}

        {visual === 'solution-architecture' && (
          <motion.div key="solution" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={smoothTransition} className="flex flex-col items-center gap-6">
            <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} className="w-28 h-28 md:w-36 md:h-36 rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Upload className="w-14 h-14 md:w-18 md:h-18 text-white" />
            </motion.div>
            <div className="flex flex-col items-center gap-2">
              <span className="text-cyan-400 text-xl md:text-2xl font-bold">ONE PERMANENT LINK</span>
              <span className="text-white/50 text-sm md:text-base">Upload once → Share everywhere</span>
            </div>
          </motion.div>
        )}

        {visual === 'cta' && (
          <motion.div key="cta" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={smoothTransition} className="flex flex-col items-center gap-6">
            <motion.div animate={{ boxShadow: ['0 0 30px rgba(34,211,238,0.3)', '0 0 60px rgba(34,211,238,0.5)', '0 0 30px rgba(34,211,238,0.3)'] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} className="px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-cyan-400">
              <span className="text-xl md:text-2xl font-bold text-black">Try Free — No Credit Card</span>
            </motion.div>
            <motion.div animate={{ y: [0, 5, 0] }} transition={{ duration: 1.5, repeat: Infinity }} className="flex items-center gap-2 text-white/50">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <span>Start in 30 seconds</span>
            </motion.div>
          </motion.div>
        )}

        {/* Fallback for other visuals */}
        {!['gemini-announcement', 'expiration-warning', 'fragmentation', 'gemini-confessional', 'future-problem', 'chatgpt-confessional', 'claude-confessional', 'reframe', 'grok-confessional', 'poe-confessional', 'copywriting-ai-confessional', 'philosophy', 'human-empowerment', 'solution-architecture', 'cta'].includes(visual) && (
          <motion.div key="fallback" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={smoothTransition} className="flex flex-col items-center gap-4">
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center">
              <Sparkles className="w-12 h-12 md:w-16 md:h-16 text-cyan-400" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AnimatedDemo() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const currentSegment = demoSegments[currentIndex];

  // Auto-advance through segments
  useEffect(() => {
    if (!isPlaying) return;

    const timer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % demoSegments.length);
    }, currentSegment.duration);

    return () => clearTimeout(timer);
  }, [currentIndex, isPlaying, currentSegment.duration]);

  // Toggle play/pause on click
  const handleClick = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  return (
    <div 
      onClick={handleClick}
      className="relative rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden cursor-pointer"
    >
      {/* Visual area */}
      <div className="aspect-video flex items-center justify-center p-8 md:p-12">
        <VisualScene visual={currentSegment.visual} caption={currentSegment.text} />
      </div>

      {/* Caption bar */}
      <div className="px-6 py-4 border-t border-white/10 bg-black/30">
        <AnimatePresence mode="wait">
          <motion.p
            key={currentIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="text-center text-white/90 text-base md:text-lg font-medium leading-relaxed"
          >
            {currentSegment.text}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Progress indicator */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
        <motion.div
          key={currentIndex}
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: currentSegment.duration / 1000, ease: 'linear' }}
          className="h-full bg-cyan-400"
          style={{ opacity: isPlaying ? 1 : 0.5 }}
        />
      </div>

      {/* Play/Pause indicator */}
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
            <div className="w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-l-12 border-l-white ml-1" style={{ borderLeftWidth: '12px' }} />
          </div>
        </div>
      )}
    </div>
  );
}
