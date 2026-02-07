import { motion } from 'framer-motion';

interface CharacterIconProps {
  type: 'gemini' | 'oneduo';
  isLocked?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function CharacterIcon({ type, isLocked = false, size = 'md' }: CharacterIconProps) {
  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-20 h-20'
  };

  if (type === 'gemini') {
    return (
      <motion.div 
        className={`${sizeClasses[size]} relative flex items-center justify-center`}
        animate={isLocked ? { opacity: 0.5 } : { opacity: 1 }}
      >
        {/* Gemini AI Icon */}
        <div className={`${sizeClasses[size]} rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30`}>
          <svg className="w-2/3 h-2/3 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        
        {/* Lock overlay when locked */}
        {isLocked && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-gray-900/60 rounded-2xl" />
            <svg className="w-8 h-8 text-red-400 relative z-10" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/>
              <path d="M7 11V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V11" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </motion.div>
        )}
      </motion.div>
    );
  }

  // OneDuo icon
  return (
    <motion.div 
      className={`${sizeClasses[size]} relative flex items-center justify-center`}
    >
      <div className={`${sizeClasses[size]} rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30`}>
        <svg className="w-2/3 h-2/3 text-black" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" fill="currentColor"/>
          <path d="M14 2V8H20" stroke="#F59E0B" strokeWidth="2"/>
          <path d="M9 13H15M9 17H13" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
    </motion.div>
  );
}
