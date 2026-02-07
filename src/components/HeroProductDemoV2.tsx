import { motion } from "framer-motion";
import { Sparkles, Brain, Zap, MessageSquare, Video } from "lucide-react";

const AI_LOGOS = [
  { name: 'ChatGPT', color: '#10a37f', letter: 'C' },
  { name: 'Claude', color: '#cc785c', letter: 'Cl' },
  { name: 'Grok', color: '#888888', letter: 'G' },
];

// Total animation cycle: 10 seconds
// Stage 1 (video): 0-2.5s
// Stage 2 (thinking): 2.5-5.5s  
// Stage 3 (understanding): 5.5-10s
const CYCLE_DURATION = 10;

export function HeroProductDemoV2() {
  return (
    <div className="w-full max-w-[480px] mx-auto select-none">
      {/* Stage indicators - benefit focused, no numbers */}
      <div className="flex items-center justify-center gap-3 mb-4">
        {[
          { label: 'Your Training Video', icon: Video, start: 0, end: 2.5 },
          { label: 'Thinking Layer™', icon: Sparkles, start: 2.5, end: 5.5 },
          { label: 'AI That GETS IT', icon: Brain, start: 5.5, end: 10 },
        ].map((stage, i) => (
          <div key={stage.label} className="flex items-center gap-2">
            <motion.div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/5 text-white/30"
              animate={{
                backgroundColor: ['rgba(255,255,255,0.05)', 'rgba(16,185,129,0.2)', 'rgba(255,255,255,0.05)'],
                color: ['rgba(255,255,255,0.3)', 'rgba(52,211,153,1)', 'rgba(255,255,255,0.3)'],
              }}
              transition={{
                duration: CYCLE_DURATION,
                repeat: Infinity,
                times: [
                  stage.start / CYCLE_DURATION,
                  (stage.start + 0.1) / CYCLE_DURATION,
                  stage.end / CYCLE_DURATION,
                ],
              }}
            >
              <stage.icon className="w-3 h-3" />
              <span className="hidden sm:inline">{stage.label}</span>
            </motion.div>
            {i < 2 && <div className="w-6 h-px bg-white/10" />}
          </div>
        ))}
      </div>

      {/* Animation Container */}
      <div className="relative min-h-[480px] flex items-center justify-center overflow-hidden">
        
        {/* STAGE 1: Your Training Video (0-2.5s) - Neutral/Documentary Feel */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{
            opacity: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            scale: [1, 1, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 1],
          }}
          transition={{ duration: CYCLE_DURATION, repeat: Infinity, ease: "easeInOut" }}
        >
          <VideoStage />
        </motion.div>

        {/* STAGE 2: Thinking Layer (2.5-5.5s) - Energy/Activity */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{
            opacity: [0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0],
            scale: [0.95, 0.95, 0.95, 1, 1, 1, 0.95, 0.95, 0.95, 0.95, 0.95],
          }}
          transition={{ duration: CYCLE_DURATION, repeat: Infinity, ease: "easeInOut" }}
        >
          <ThinkingStage />
        </motion.div>

        {/* STAGE 3: AI Understanding (5.5-10s) - Success/Transformation */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{
            opacity: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0],
            scale: [0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 1, 1, 1, 1, 0.95],
          }}
          transition={{ duration: CYCLE_DURATION, repeat: Infinity, ease: "easeInOut" }}
        >
          <UnderstandingStage />
        </motion.div>
      </div>
    </div>
  );
}

// STAGE 1: Your Training Video - Neutral/Documentary feel (grayscale with subtle color)
function VideoStage() {
  return (
    <div className="relative w-[360px]">
      {/* Subtle neutral glow */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-64 h-64 rounded-full bg-white/3 blur-3xl" />
      </div>

      {/* Video Preview Card - Documentary/Neutral feel */}
      <div className="relative bg-gradient-to-br from-zinc-900 to-zinc-950 rounded-xl border border-white/10 overflow-hidden shadow-2xl">
        {/* Simulated training video content */}
        <div className="relative h-52 bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 overflow-hidden">
          {/* Training content preview - grayscale documentary feel */}
          <div className="absolute inset-0 p-4">
            {/* Presenter silhouette area */}
            <div className="absolute right-4 bottom-4 w-20 h-28 bg-white/5 rounded-lg" />
            
            {/* Slide/screen content being taught */}
            <div className="bg-white/8 rounded-lg p-3 max-w-[70%]">
              <div className="w-24 h-2 bg-white/20 rounded mb-2" />
              <div className="w-32 h-2 bg-white/15 rounded mb-2" />
              <div className="w-20 h-2 bg-white/10 rounded mb-3" />
              <div className="flex gap-2">
                <div className="w-8 h-8 bg-white/10 rounded" />
                <div className="w-8 h-8 bg-white/10 rounded" />
                <div className="w-8 h-8 bg-white/10 rounded" />
              </div>
            </div>
            
            {/* Cursor indicator */}
            <motion.div 
              className="absolute left-[45%] top-[40%] w-3 h-3 border-2 border-white/40 rounded-full"
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          </div>

          {/* Duration badge */}
          <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/70 rounded text-xs text-white/70 font-mono">
            1:47:32
          </div>
          
          {/* "Recording" indicator */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 bg-black/50 rounded">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500/80" />
            <span className="text-[10px] text-white/50 uppercase tracking-wider">Your Training</span>
          </div>
        </div>

        <div className="p-4 space-y-2">
          <h4 className="text-white/90 font-medium text-sm">Your Training Module</h4>
          <p className="text-white/40 text-xs">Hours of your expertise, locked in video</p>
          <div className="flex items-center gap-2 pt-2">
            <div className="flex -space-x-1">
              {[1,2,3].map(i => (
                <div key={i} className="w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <span className="text-[8px] text-white/30">?</span>
                </div>
              ))}
            </div>
            <span className="text-white/30 text-xs">AI can't see this... yet</span>
          </div>
        </div>
      </div>

      <p className="text-center text-white/40 text-sm mt-4">
        Your expertise. Trapped in video format.
      </p>
    </div>
  );
}

// STAGE 2: OneDuo Thinking Layer™ - Energy/Activity
function ThinkingStage() {
  return (
    <div className="relative w-[360px]">
      {/* Electric energy glow */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div 
          className="w-80 h-80 rounded-full bg-emerald-500/25 blur-3xl"
          animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </div>

      <div className="relative bg-gradient-to-br from-[#0d1f0d] to-[#0a1a0a] rounded-xl border border-emerald-500/40 p-6 overflow-hidden shadow-[0_0_80px_rgba(16,185,129,0.3)]">
        
        {/* Neural network visualization */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(15)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full bg-emerald-400"
              style={{
                width: `${4 + (i % 3) * 2}px`,
                height: `${4 + (i % 3) * 2}px`,
                left: `${8 + (i % 5) * 22}%`,
                top: `${10 + Math.floor(i / 5) * 30}%`,
              }}
              animate={{
                scale: [1, 1.8, 1],
                opacity: [0.3, 1, 0.3],
                boxShadow: ['0 0 0px rgba(16,185,129,0)', '0 0 20px rgba(16,185,129,0.8)', '0 0 0px rgba(16,185,129,0)']
              }}
              transition={{
                duration: 1.2,
                delay: i * 0.08,
                repeat: Infinity,
              }}
            />
          ))}
          
          <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.4 }}>
            {[0, 1, 2, 3, 4].map((row) => (
              [...Array(4)].map((_, col) => (
                <motion.line
                  key={`${row}-${col}`}
                  x1={`${8 + col * 22}%`}
                  y1={`${10 + row * 18}%`}
                  x2={`${30 + col * 22}%`}
                  y2={`${10 + ((row + 1) % 5) * 18}%`}
                  stroke="rgba(52,211,153,0.6)"
                  strokeWidth="1"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: [0, 1, 0], opacity: [0, 0.8, 0] }}
                  transition={{ 
                    duration: 1.5, 
                    delay: row * 0.15 + col * 0.1, 
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                />
              ))
            ))}
          </svg>
        </div>

        {/* OneDuo branding */}
        <div className="relative flex items-center gap-3 mb-6">
          <motion.div 
            className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/50"
            animate={{ 
              rotate: [0, 360],
              boxShadow: ['0 0 0px rgba(16,185,129,0)', '0 0 30px rgba(16,185,129,0.5)', '0 0 0px rgba(16,185,129,0)']
            }}
            transition={{ rotate: { duration: 8, repeat: Infinity, ease: "linear" }, boxShadow: { duration: 2, repeat: Infinity } }}
          >
            <Sparkles className="w-5 h-5 text-emerald-400" />
          </motion.div>
          <div>
            <span className="text-emerald-400 font-bold">OneDuo Thinking Layer™</span>
            <motion.span 
              className="block text-emerald-400/70 text-sm"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              Understanding your expertise...
            </motion.span>
          </div>
        </div>

        {/* Processing items */}
        <div className="relative space-y-4">
          {[
            { label: 'Capturing every instructional moment', delay: 0 },
            { label: 'Understanding your methodology', delay: 0.4 },
            { label: 'Preserving every nuance', delay: 0.8 },
          ].map((item) => (
            <motion.div
              key={item.label}
              className="flex items-center gap-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: [0, 1, 1], x: [-20, 0, 0] }}
              transition={{ duration: 0.5, delay: item.delay, times: [0, 0.5, 1] }}
            >
              <motion.div
                className="w-6 h-6 rounded-full bg-emerald-500/30 flex items-center justify-center border border-emerald-500/40"
                animate={{ 
                  scale: [1, 1.3, 1],
                  backgroundColor: ['rgba(16,185,129,0.2)', 'rgba(16,185,129,0.4)', 'rgba(16,185,129,0.2)']
                }}
                transition={{ duration: 1, delay: item.delay + 0.5, repeat: Infinity }}
              >
                <Zap className="w-3 h-3 text-emerald-400" />
              </motion.div>
              <span className="text-white/80 text-sm">{item.label}</span>
            </motion.div>
          ))}
        </div>

        <motion.div 
          className="relative mt-6 text-center"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <span className="text-emerald-400/60 text-xs uppercase tracking-widest">Transforming</span>
        </motion.div>
      </div>

      <p className="text-center text-emerald-400/80 text-sm mt-4 font-medium">
        Every detail captured. Every nuance preserved.
      </p>
    </div>
  );
}

// STAGE 3: AI That GETS IT - Success/Transformation
function UnderstandingStage() {
  return (
    <div className="relative w-[360px]">
      {/* Vibrant success glow */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div 
          className="w-96 h-96 rounded-full bg-emerald-500/30 blur-3xl"
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
      </div>

      <div className="relative bg-gradient-to-br from-[#0d1f0d] to-[#0a1a0a] rounded-xl border border-emerald-500/50 overflow-hidden shadow-[0_0_100px_rgba(16,185,129,0.35)]">
        
        {/* AI logos row */}
        <div className="flex items-center justify-center gap-4 py-3 border-b border-emerald-500/20 bg-emerald-500/10">
          {AI_LOGOS.map((logo, i) => (
            <motion.div
              key={logo.name}
              className="flex items-center gap-1.5"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
            >
              <div 
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border border-white/20"
                style={{ backgroundColor: `${logo.color}30`, color: logo.color }}
              >
                {logo.letter}
              </div>
              <span className="text-white/60 text-xs">{logo.name}</span>
            </motion.div>
          ))}
        </div>

        {/* HERO: AI Response */}
        <div className="p-5">
          <div className="flex justify-end mb-4">
            <div className="bg-white/10 rounded-xl rounded-tr-sm px-3 py-2 max-w-[75%]">
              <p className="text-white/70 text-xs">
                How do I implement the reverse brief technique?
              </p>
            </div>
          </div>

          <motion.div
            className="flex gap-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <motion.div 
              className="w-10 h-10 rounded-full bg-emerald-500/30 flex items-center justify-center flex-shrink-0 border-2 border-emerald-500/50"
              animate={{ 
                boxShadow: ['0 0 0px rgba(16,185,129,0)', '0 0 20px rgba(16,185,129,0.6)', '0 0 0px rgba(16,185,129,0)']
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Brain className="w-5 h-5 text-emerald-400" />
            </motion.div>
            <motion.div 
              className="bg-emerald-500/15 rounded-xl rounded-tl-sm px-4 py-4 border border-emerald-500/30 flex-1"
              animate={{ 
                borderColor: ['rgba(16,185,129,0.3)', 'rgba(16,185,129,0.6)', 'rgba(16,185,129,0.3)']
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <p className="text-white text-sm leading-relaxed">
                Based on the training at <span className="text-emerald-400 font-bold">3:47</span> where 
                you explained the '<span className="text-emerald-400 font-bold">reverse brief</span>' technique, 
                I can help clients implement this exact framework.
              </p>
              <p className="text-white/80 text-sm mt-2">
                Want me to walk them through it?
              </p>
            </motion.div>
          </motion.div>
        </div>

        <motion.div 
          className="border-t border-emerald-500/30 bg-emerald-500/10 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <motion.div 
            className="flex items-center justify-center gap-2"
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <MessageSquare className="w-5 h-5 text-emerald-400" />
            <span className="text-emerald-400 font-bold">
              AI That Actually <em>Watched</em> and <em>Understood</em>
            </span>
          </motion.div>
        </motion.div>
      </div>

      <motion.p 
        className="text-center text-emerald-400 text-sm mt-4 font-bold"
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        Like you cloned your expertise
      </motion.p>
    </div>
  );
}

export default HeroProductDemoV2;