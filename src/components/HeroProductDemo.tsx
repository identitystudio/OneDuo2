import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Brain, Video, Lock, Check, FileText, ArrowDown } from "lucide-react";
import { useState, useEffect } from "react";

const AI_LOGOS = [
  { name: 'ChatGPT', color: '#10a37f', letter: 'C' },
  { name: 'Claude', color: '#cc785c', letter: 'Cl' },
  { name: 'Grok', color: '#888888', letter: 'G' },
];

// Mario's 3-Act Structure - 60 second cycle
// ACT 1: The Problem (0-15s) - Expertise trapped
// ACT 2: The Magic (15-45s) - OneDuo Thinking Layer processes
// ACT 3: The Result (45-60s) - AI that understands
const CYCLE_DURATION = 60;

type AnimationPhase = 
  | 'problem-video' // 0-5s
  | 'problem-ai-confused' // 5-10s
  | 'problem-full' // 10-15s
  | 'magic-slide-in' // 15-20s
  | 'magic-checklist' // 20-35s
  | 'magic-complete' // 35-40s
  | 'magic-handoff' // 40-45s
  | 'result-question' // 45-50s
  | 'result-answer' // 50-55s
  | 'result-final' // 55-60s
  ;

export function HeroProductDemo() {
  const [phase, setPhase] = useState<AnimationPhase>('problem-video');
  const [checklistProgress, setChecklistProgress] = useState(0);

  useEffect(() => {
    const timeline = [
      { phase: 'problem-video' as const, duration: 2000 },
      { phase: 'problem-ai-confused' as const, duration: 2000 },
      { phase: 'problem-full' as const, duration: 2500 },
      { phase: 'magic-slide-in' as const, duration: 3000 },
      { phase: 'magic-checklist' as const, duration: 10000 },
      { phase: 'magic-complete' as const, duration: 2500 },
      { phase: 'magic-handoff' as const, duration: 3000 },
      { phase: 'result-question' as const, duration: 2500 },
      { phase: 'result-answer' as const, duration: 4000 },
      { phase: 'result-final' as const, duration: 4000 },
    ];

    let timeoutId: NodeJS.Timeout;
    let currentIndex = 0;

    const runPhase = () => {
      setPhase(timeline[currentIndex].phase);
      
      // Reset checklist when entering magic-checklist
      if (timeline[currentIndex].phase === 'magic-checklist') {
        setChecklistProgress(0);
      }
      
      timeoutId = setTimeout(() => {
        currentIndex = (currentIndex + 1) % timeline.length;
        runPhase();
      }, timeline[currentIndex].duration);
    };

    runPhase();

    return () => clearTimeout(timeoutId);
  }, []);

  // Animate checklist items during magic-checklist phase
  useEffect(() => {
    if (phase !== 'magic-checklist') return;
    
    const checklistIntervals = [0, 3000, 6000, 9000];
    const timeouts: NodeJS.Timeout[] = [];
    
    checklistIntervals.forEach((delay, index) => {
      const timeout = setTimeout(() => {
        setChecklistProgress(index + 1);
      }, delay);
      timeouts.push(timeout);
    });

    return () => timeouts.forEach(t => clearTimeout(t));
  }, [phase]);

  const isAct1 = phase.startsWith('problem');
  const isAct2 = phase.startsWith('magic');
  const isAct3 = phase.startsWith('result');

  return (
    <div className="w-full max-w-[440px] mx-auto select-none px-3">
      {/* Act indicators */}
      <div className="flex items-center justify-center gap-1.5 mb-4">
        {[
          { label: 'The Problem', active: isAct1, icon: Lock },
          { label: 'The Magic', active: isAct2, icon: Sparkles },
          { label: 'The Result', active: isAct3, icon: Brain },
        ].map((act, i) => (
          <div key={act.label} className="flex items-center gap-1.5">
            <motion.div
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-all duration-500 ${
                act.active 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' 
                  : 'bg-white/5 text-white/30 border border-transparent'
              }`}
            >
              <act.icon className="w-2.5 h-2.5" />
              <span className="hidden sm:inline">{act.label}</span>
            </motion.div>
            {i < 2 && <div className="w-3 h-px bg-white/10" />}
          </div>
        ))}
      </div>

      {/* Main Animation Container - Vertical Flow */}
      <div className="relative min-h-[380px] flex flex-col items-center justify-start gap-2">
        
        {/* TOP: Video Thumbnail */}
        <motion.div
          className="relative w-full"
          animate={{
            filter: isAct1 && phase !== 'problem-video' ? 'grayscale(0.8)' : 'grayscale(0)',
            opacity: 1,
          }}
          transition={{ duration: 0.5 }}
        >
          <VideoThumbnail 
            isLocked={isAct1} 
            isGlowing={isAct3 || phase === 'magic-handoff'} 
          />
        </motion.div>

        {/* Arrow down from video */}
        <motion.div
          className="flex flex-col items-center gap-1"
          animate={{
            opacity: phase === 'problem-full' || isAct2 || isAct3 ? 1 : 0.3,
          }}
          transition={{ duration: 0.3 }}
        >
          <ArrowDown className={`w-4 h-4 ${isAct2 || isAct3 ? 'text-emerald-400' : 'text-white/30'}`} />
          {isAct1 && phase === 'problem-full' && (
            <motion.span 
              className="text-red-400/60 text-xs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              ???
            </motion.span>
          )}
        </motion.div>

        {/* MIDDLE: OneDuo Thinking Layer */}
        <AnimatePresence mode="wait">
          {(isAct2 || isAct3) && (
            <motion.div
              key="oneduo-layer"
              className="w-full"
              initial={{ opacity: 0, x: -100, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <OneDuoLayer 
                phase={phase} 
                checklistProgress={checklistProgress}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Arrow down from OneDuo */}
        <AnimatePresence>
          {(isAct2 || isAct3) && (
            <motion.div
              className="flex flex-col items-center gap-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ArrowDown className="w-4 h-4 text-emerald-400" />
              {phase === 'magic-handoff' && (
                <motion.div
                  className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/20 rounded-full border border-emerald-500/40"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <FileText className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400 text-[10px] font-medium">AI-Ready Context</span>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* BOTTOM: AI Models */}
        <motion.div
          className="w-full"
          animate={{
            opacity: 1,
          }}
        >
          <AIModels 
            isConfused={isAct1} 
            isActivating={phase === 'magic-handoff'}
            isActive={isAct3}
            showChat={isAct3}
            phase={phase}
          />
        </motion.div>
      </div>

      {/* Bottom tagline */}
      <AnimatePresence mode="wait">
        <motion.p
          key={isAct1 ? 'problem' : isAct2 ? 'magic' : 'result'}
          className="text-center text-[11px] mt-3 font-medium"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
        >
          {isAct1 && (
            <span className="text-white/40">Your expertise. Invisible to AI.</span>
          )}
          {isAct2 && (
            <span className="text-emerald-400/80">Every detail captured. Every nuance preserved.</span>
          )}
          {isAct3 && (
            <span className="text-emerald-400 font-bold">AI That Actually <em>Watched</em> and <em>Understood</em></span>
          )}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

// Video Thumbnail Component
function VideoThumbnail({ isLocked, isGlowing }: { isLocked: boolean; isGlowing: boolean }) {
  return (
    <motion.div
      className={`relative bg-gradient-to-br from-zinc-900 to-zinc-950 rounded-xl border overflow-hidden transition-all duration-500 ${
        isGlowing 
          ? 'border-emerald-500/50 shadow-[0_0_40px_rgba(16,185,129,0.3)]' 
          : isLocked 
            ? 'border-white/10' 
            : 'border-white/20'
      }`}
    >
      <div className="relative h-20 bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 overflow-hidden">
        {/* Lock overlay when locked */}
        {isLocked && (
          <motion.div
            className="absolute inset-0 bg-black/40 flex items-center justify-center z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Lock className="w-6 h-6 text-white/30" />
          </motion.div>
        )}

        {/* Success overlay when glowing */}
        {isGlowing && (
          <motion.div
            className="absolute inset-0 bg-emerald-500/10 z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />
        )}

        {/* Video content preview */}
        <div className="absolute inset-0 p-2">
          <div className="absolute right-2 bottom-2 w-10 h-12 bg-white/5 rounded" />
          <div className="bg-white/8 rounded p-1.5 max-w-[60%]">
            <div className="w-12 h-1 bg-white/20 rounded mb-1" />
            <div className="w-14 h-1 bg-white/15 rounded mb-1" />
            <div className="w-8 h-1 bg-white/10 rounded" />
          </div>
        </div>

        {/* Duration badge */}
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-white/70 font-mono z-20">
          1:47:32
        </div>

        {/* Recording indicator */}
        <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 bg-black/50 rounded z-20">
          <div className="w-1 h-1 rounded-full bg-red-500/80" />
          <span className="text-[8px] text-white/50 uppercase tracking-wider">Your Training</span>
        </div>
      </div>

      <div className="p-2">
        <h4 className="text-white/90 font-medium text-[11px]">Your Training Video</h4>
        <p className={`text-[10px] mt-0.5 transition-colors duration-500 ${
          isGlowing ? 'text-emerald-400/60' : 'text-white/40'
        }`}>
          {isGlowing ? 'Now AI-accessible' : 'Hours of expertise, locked in video'}
        </p>
      </div>
    </motion.div>
  );
}

// OneDuo Thinking Layer Component
function OneDuoLayer({ phase, checklistProgress }: { phase: AnimationPhase; checklistProgress: number }) {
  const isProcessing = phase === 'magic-checklist';
  const isComplete = phase === 'magic-complete' || phase === 'magic-handoff';
  const showReady = phase === 'magic-handoff';

  const checklistItems = [
    'Understanding your expertise...',
    'Capturing every instructional moment',
    'Understanding your methodology...',
    'Preserving every nuance...',
  ];

  return (
    <motion.div
      className={`relative rounded-lg border p-3 overflow-hidden transition-all duration-500 ${
        isComplete 
          ? 'bg-gradient-to-br from-[#0d1f0d] to-[#0a1a0a] border-emerald-500/60 shadow-[0_0_40px_rgba(16,185,129,0.4)]'
          : 'bg-gradient-to-br from-[#0d1f0d] to-[#0a1a0a] border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.2)]'
      }`}
    >
      {/* Sparkle animation background */}
      {isProcessing && (
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-emerald-400"
              style={{
                left: `${10 + (i % 4) * 25}%`,
                top: `${15 + Math.floor(i / 4) * 60}%`,
              }}
              animate={{
                scale: [0, 1.5, 0],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 1.5,
                delay: i * 0.2,
                repeat: Infinity,
              }}
            />
          ))}
        </div>
      )}

      {/* Header */}
      <div className="relative flex items-center gap-1.5 mb-2">
        <motion.div
          className="w-6 h-6 rounded-md bg-emerald-500/20 flex items-center justify-center border border-emerald-500/50"
          animate={isProcessing ? {
            rotate: [0, 360],
          } : {}}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        >
          <Sparkles className="w-3 h-3 text-emerald-400" />
        </motion.div>
        <div>
          <span className="text-emerald-400 font-bold text-[11px]">OneDuo Thinking Layer™</span>
          {showReady && (
            <motion.span
              className="block text-emerald-400/80 text-[10px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              ✓ Ready
            </motion.span>
          )}
        </div>
      </div>

      {/* Checklist */}
      <div className="relative space-y-1.5">
        {checklistItems.map((item, i) => {
          const isChecked = checklistProgress > i || isComplete;
          const isCurrent = checklistProgress === i && isProcessing;

          return (
            <motion.div
              key={item}
              className="flex items-center gap-1.5"
              initial={{ opacity: 0, x: -20 }}
              animate={{ 
                opacity: isProcessing || isComplete ? 1 : 0.5, 
                x: 0 
              }}
              transition={{ delay: i * 0.1 }}
            >
              <motion.div
                className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all duration-300 ${
                  isChecked 
                    ? 'bg-emerald-500/40 border-emerald-500/60' 
                    : isCurrent
                      ? 'bg-emerald-500/20 border-emerald-500/40'
                      : 'bg-white/5 border-white/20'
                }`}
                animate={isCurrent ? {
                  scale: [1, 1.2, 1],
                } : {}}
                transition={{ duration: 0.5, repeat: isCurrent ? Infinity : 0 }}
              >
                {isChecked ? (
                  <Check className="w-2.5 h-2.5 text-emerald-400" />
                ) : isCurrent ? (
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  />
                ) : null}
              </motion.div>
              <span className={`text-[10px] transition-colors duration-300 ${
                isChecked ? 'text-white/80' : isCurrent ? 'text-emerald-400/80' : 'text-white/40'
              }`}>
                {item}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Transformation complete message */}
      {isComplete && (
        <motion.div
          className="mt-2 pt-1.5 border-t border-emerald-500/20 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <span className="text-emerald-400 text-[10px] font-medium">
            ✨ Transformation complete!
          </span>
        </motion.div>
      )}
    </motion.div>
  );
}

// AI Models Component
function AIModels({ 
  isConfused, 
  isActivating, 
  isActive, 
  showChat,
  phase 
}: { 
  isConfused: boolean; 
  isActivating: boolean; 
  isActive: boolean; 
  showChat: boolean;
  phase: AnimationPhase;
}) {
  const showQuestion = phase === 'result-question' || phase === 'result-answer' || phase === 'result-final';
  const showAnswer = phase === 'result-answer' || phase === 'result-final';
  const showFinal = phase === 'result-final';

  return (
    <motion.div
      className={`relative rounded-xl border overflow-hidden transition-all duration-500 ${
        isActive
          ? 'bg-gradient-to-br from-[#0d1f0d] to-[#0a1a0a] border-emerald-500/50 shadow-[0_0_50px_rgba(16,185,129,0.25)]'
          : isActivating
            ? 'bg-zinc-900/80 border-emerald-500/30'
            : 'bg-zinc-900/50 border-white/10'
      }`}
    >
      {/* AI Logo row */}
      <div className={`flex items-center justify-center gap-3 py-2.5 border-b transition-colors duration-500 ${
        isActive ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-white/5 bg-white/[0.02]'
      }`}>
        {AI_LOGOS.map((logo, i) => (
          <motion.div
            key={logo.name}
            className="flex items-center gap-1"
            animate={{
              opacity: isConfused ? 0.4 : 1,
              scale: isActivating ? [1, 1.1, 1] : 1,
            }}
            transition={{ 
              scale: { delay: i * 0.1, duration: 0.3 },
              opacity: { duration: 0.3 }
            }}
          >
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all duration-500 ${
                isActive 
                  ? 'border-white/30' 
                  : isConfused 
                    ? 'border-white/10 grayscale' 
                    : 'border-white/20'
              }`}
              style={{ 
                backgroundColor: isConfused ? 'rgba(255,255,255,0.05)' : `${logo.color}30`, 
                color: isConfused ? 'rgba(255,255,255,0.3)' : logo.color 
              }}
            >
              {isConfused ? '?' : logo.letter}
            </div>
            <span className={`text-[10px] transition-colors duration-500 ${
              isActive ? 'text-white/70' : 'text-white/40'
            }`}>
              {logo.name}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Chat area */}
      <div className="p-3 min-h-[120px]">
        {isConfused && (
          <motion.div
            className="flex items-center justify-center h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <span className="text-white/30 text-xs text-center">
              AI can't see this... yet
            </span>
          </motion.div>
        )}

        {showChat && (
          <div className="space-y-3">
            {/* User question */}
            <AnimatePresence>
              {showQuestion && (
                <motion.div
                  className="flex justify-end"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="bg-white/10 rounded-xl rounded-tr-sm px-3 py-2 max-w-[80%]">
                    <p className="text-white/70 text-xs">
                      How do I implement the reverse brief technique?
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* AI answer */}
            <AnimatePresence>
              {showAnswer && (
                <motion.div
                  className="flex gap-2"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <motion.div
                    className="w-8 h-8 rounded-full bg-emerald-500/30 flex items-center justify-center flex-shrink-0 border border-emerald-500/50"
                    animate={showFinal ? {
                      boxShadow: ['0 0 0px rgba(16,185,129,0)', '0 0 15px rgba(16,185,129,0.5)', '0 0 0px rgba(16,185,129,0)']
                    } : {}}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Brain className="w-4 h-4 text-emerald-400" />
                  </motion.div>
                  <div className="bg-emerald-500/15 rounded-xl rounded-tl-sm px-3 py-2.5 border border-emerald-500/30 flex-1">
                    <p className="text-white text-xs leading-relaxed">
                      Based on the training at{' '}
                      <motion.span
                        className="text-emerald-400 font-bold bg-emerald-500/20 px-1 rounded"
                        animate={showFinal ? { 
                          backgroundColor: ['rgba(16,185,129,0.2)', 'rgba(16,185,129,0.4)', 'rgba(16,185,129,0.2)']
                        } : {}}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      >
                        [3:47]
                      </motion.span>
                      {' '}where you explained the{' '}
                      <span className="text-emerald-400 font-bold">'reverse brief'</span>
                      {' '}technique, I can help clients implement this exact framework.
                    </p>
                    <p className="text-white/70 text-xs mt-1.5">
                      Want me to walk them through it?
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {(isActivating && !showChat) && (
          <motion.div
            className="flex items-center justify-center h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.span
              className="text-emerald-400/60 text-xs"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              Receiving context...
            </motion.span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

export default HeroProductDemo;