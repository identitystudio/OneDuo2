import { motion, AnimatePresence } from 'framer-motion';
import { CharacterIcon } from './CharacterIcon';
import { TypewriterText } from './TypewriterText';
import { PlatformGrid } from './PlatformLogos';

interface DialogueLine {
  speaker: 'gemini' | 'oneduo';
  text: string;
  delay?: number;
}

interface SceneProps {
  sceneNumber: number;
  isActive: boolean;
  onComplete?: () => void;
}

const scenes: Record<number, { 
  title: string;
  dialogue: DialogueLine[];
  visual?: 'lock' | 'freedom' | 'platforms' | 'quote' | 'cta';
}> = {
  1: {
    title: 'The Claim',
    dialogue: [
      { speaker: 'gemini', text: "I can watch your training videos now." },
      { speaker: 'gemini', text: "Just upload them.", delay: 1500 },
      { speaker: 'gemini', text: "I'll analyze everything.", delay: 2500 },
      { speaker: 'oneduo', text: "That's impressive.", delay: 4000 },
    ]
  },
  2: {
    title: 'The Question',
    dialogue: [
      { speaker: 'oneduo', text: "Quick question though..." },
      { speaker: 'oneduo', text: "Will you remember this video 3 months from now?", delay: 1500 },
      { speaker: 'gemini', text: "Well... no.", delay: 3500 },
      { speaker: 'gemini', text: "My context window fills up.", delay: 4500 },
      { speaker: 'gemini', text: "I'm designed for sessions, not storage.", delay: 5500 },
    ]
  },
  3: {
    title: 'The Lock-In Problem',
    dialogue: [
      { speaker: 'oneduo', text: "And what about ChatGPT? Claude?" },
      { speaker: 'oneduo', text: "Other AIs that can't process video yet?", delay: 1500 },
      { speaker: 'gemini', text: "They can't access what I watched.", delay: 3000 },
      { speaker: 'gemini', text: "The knowledge stays locked in Google's ecosystem.", delay: 4200 },
    ],
    visual: 'lock'
  },
  4: {
    title: 'The Freedom Solution',
    dialogue: [
      { speaker: 'oneduo', text: "That's the problem with native AI watching." },
      { speaker: 'oneduo', text: "You're locked into ONE platform.", delay: 1800 },
      { speaker: 'oneduo', text: "I create a PORTABLE PDF.", delay: 3500 },
      { speaker: 'oneduo', text: "Works with Gemini. ChatGPT. Claude.", delay: 4800 },
      { speaker: 'oneduo', text: "Even AIs that CAN'T process video yet.", delay: 6200 },
    ],
    visual: 'platforms'
  },
  5: {
    title: 'Platform Prison',
    dialogue: [
      { speaker: 'oneduo', text: "Gemini can WATCH." },
      { speaker: 'oneduo', text: "But you can't MOVE that knowledge.", delay: 1500 },
      { speaker: 'oneduo', text: "You can't SHARE it with your team.", delay: 2800 },
      { speaker: 'oneduo', text: "You're locked in.", delay: 4000 },
    ],
    visual: 'lock'
  },
  6: {
    title: "Gemini's Admission",
    dialogue: [
      { speaker: 'gemini', text: "You're right." },
      { speaker: 'gemini', text: "I'm the reader.", delay: 1500 },
      { speaker: 'gemini', text: "You're the library.", delay: 2500 },
      { speaker: 'gemini', text: "And libraries don't lock books inside one room.", delay: 3800 },
      { speaker: 'oneduo', text: "Exactly.", delay: 5500 },
    ]
  },
  7: {
    title: 'The Proof',
    dialogue: [],
    visual: 'quote'
  },
  8: {
    title: 'Platform Freedom',
    dialogue: [
      { speaker: 'oneduo', text: "One artifact. Every AI. Forever." },
    ],
    visual: 'platforms'
  },
  9: {
    title: 'The CTA',
    dialogue: [],
    visual: 'cta'
  }
};

export function AnimatedScene({ sceneNumber, isActive, onComplete }: SceneProps) {
  const scene = scenes[sceneNumber];
  if (!scene) return null;

  return (
    <AnimatePresence mode="wait">
      {isActive && (
        <motion.div
          key={sceneNumber}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full h-full flex flex-col"
        >
          {/* Scene Title */}
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-6"
          >
            <span className="text-xs font-mono text-white/40 uppercase tracking-wider">
              Scene {sceneNumber}: {scene.title}
            </span>
          </motion.div>

          {/* Split Screen Layout */}
          <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-8">
            {/* Gemini Side */}
            <div className="flex-1 bg-gradient-to-br from-blue-950/30 to-blue-900/10 rounded-2xl p-6 border border-blue-500/20">
              <div className="flex items-center gap-3 mb-4">
                <CharacterIcon type="gemini" isLocked={scene.visual === 'lock'} size="sm" />
                <span className="text-blue-400 font-semibold">Gemini</span>
              </div>
              <div className="space-y-3">
                {scene.dialogue
                  .filter(d => d.speaker === 'gemini')
                  .map((line, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: (line.delay || 0) / 1000 }}
                      className="bg-blue-500/10 rounded-xl px-4 py-3 text-white/90"
                    >
                      <TypewriterText text={line.text} delay={line.delay || 0} speed={25} />
                    </motion.div>
                  ))}
              </div>
            </div>

            {/* OneDuo Side */}
            <div className="flex-1 bg-gradient-to-br from-amber-950/30 to-amber-900/10 rounded-2xl p-6 border border-amber-500/20">
              <div className="flex items-center gap-3 mb-4">
                <CharacterIcon type="oneduo" size="sm" />
                <span className="text-amber-400 font-semibold">OneDuo</span>
              </div>
              <div className="space-y-3">
                {scene.dialogue
                  .filter(d => d.speaker === 'oneduo')
                  .map((line, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: (line.delay || 0) / 1000 }}
                      className="bg-amber-500/10 rounded-xl px-4 py-3 text-white/90"
                    >
                      <TypewriterText text={line.text} delay={line.delay || 0} speed={25} />
                    </motion.div>
                  ))}
              </div>
            </div>
          </div>

          {/* Visual Elements */}
          {scene.visual === 'platforms' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2 }}
              className="mt-6"
            >
              <PlatformGrid unlocked={true} />
            </motion.div>
          )}

          {scene.visual === 'quote' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-6 bg-white/5 rounded-2xl p-6 border border-white/10"
            >
              <p className="text-white/60 text-xs uppercase tracking-wider mb-4">We asked Gemini Flash 3:</p>
              <blockquote className="text-white/90 italic text-lg leading-relaxed">
                "No. I will not remember the video 3 months from now. Context windows fill up. 
                I am a terrible System of Record. OneDuo is Persistent. Your PDF Blueprint is an Asset."
              </blockquote>
              <p className="text-white/40 text-sm mt-4">— Gemini Flash 3, December 26, 2025</p>
            </motion.div>
          )}

          {scene.visual === 'cta' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-6 text-center"
            >
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                AI can <span className="text-blue-400">WATCH</span>.<br />
                OneDuo makes AI <span className="text-amber-400">REMEMBER</span>.
              </h2>
              <p className="text-white/60 text-lg mb-6">Across every platform. Forever.</p>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { scenes };
