import { motion } from 'framer-motion';

interface PlatformLogoProps {
  name: string;
  unlocked?: boolean;
  delay?: number;
}

const platformColors: Record<string, string> = {
  'Gemini': 'from-blue-500 to-blue-600',
  'ChatGPT': 'from-emerald-500 to-emerald-600',
  'Claude': 'from-orange-400 to-orange-500',
  'NotebookLM': 'from-purple-500 to-purple-600',
  'Future AIs': 'from-gray-500 to-gray-600',
};

export function PlatformLogo({ name, unlocked = false, delay = 0 }: PlatformLogoProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
    >
      {/* Platform Icon */}
      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${platformColors[name] || 'from-gray-500 to-gray-600'} flex items-center justify-center`}>
        <span className="text-white font-bold text-sm">{name.charAt(0)}</span>
      </div>
      
      {/* Name + Status */}
      <div className="flex-1">
        <p className="text-white font-medium text-sm">{name}</p>
        <p className="text-white/50 text-xs">
          {name === 'Gemini' ? 'Native video' : "Can't watch video"}
        </p>
      </div>
      
      {/* Checkmark */}
      <motion.div
        initial={{ scale: 0 }}
        animate={unlocked ? { scale: 1 } : { scale: 0 }}
        transition={{ delay: delay + 0.3, type: 'spring' }}
        className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center"
      >
        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none">
          <path d="M5 13L9 17L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </motion.div>
    </motion.div>
  );
}

export function PlatformGrid({ unlocked = false }: { unlocked?: boolean }) {
  const platforms = ['Gemini', 'ChatGPT', 'Claude', 'NotebookLM', 'Future AIs'];
  
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {platforms.map((platform, i) => (
        <PlatformLogo 
          key={platform} 
          name={platform} 
          unlocked={unlocked}
          delay={i * 0.15}
        />
      ))}
    </div>
  );
}
