import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function GatePage() {
  const [password, setPassword] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [confettiPieces, setConfettiPieces] = useState<Array<{ id: number; x: number; y: number; color: string; size: number; rotation: number }>>([]);
  const navigate = useNavigate();

  const ROTATION_DURATION = 12000; // 12 seconds for one full rotation

  // Burst confetti on each full rotation
  const burstConfetti = () => {
    const colors = ['#ffd700', '#ffb347', '#daa520', '#f0e68c', '#ffc107', '#ffdf00', '#e6be8a', '#cd853f'];
    const newPieces = Array.from({ length: 25 }, (_, i) => ({
      id: Date.now() + i,
      x: (Math.random() - 0.5) * 150,
      y: Math.random() * 20,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 6 + Math.random() * 10,
      rotation: Math.random() * 360
    }));
    setConfettiPieces(newPieces);
  };

  useEffect(() => {
    // First burst after one full rotation
    const timeout = setTimeout(() => {
      burstConfetti();
    }, ROTATION_DURATION);

    // Then burst every rotation after
    const interval = setInterval(() => {
      burstConfetti();
    }, ROTATION_DURATION);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.toLowerCase() === 'first') {
      toast.success('Welcome, pioneer.');
      navigate('/home');
    } else {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      toast.error('Access denied');
    }
  };

  return (
    <div className="min-h-screen bg-[#030303] flex flex-col items-center justify-center relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-amber-400/5 blur-2xl animate-pulse" />
      </div>

      {/* Rotating Gold Gear with First Place */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: 'easeOut' }}
        className="relative mb-8"
      >
        {/* Confetti particles */}
        <AnimatePresence>
          {confettiPieces.map((piece) => (
            <motion.div
              key={piece.id}
              initial={{ 
                x: 0, 
                y: 0, 
                scale: 1,
                rotate: piece.rotation,
                opacity: 1 
              }}
              animate={{ 
                x: piece.x * 3,
                y: 150 + Math.random() * 100,
                scale: 0.5,
                rotate: piece.rotation + 360,
                opacity: 0
              }}
              exit={{ opacity: 0 }}
              transition={{ 
                duration: 2 + Math.random(),
                ease: 'easeOut'
              }}
              className="absolute left-1/2 top-1/2 pointer-events-none z-10"
              style={{
                width: piece.size,
                height: piece.size,
                background: `linear-gradient(135deg, ${piece.color}, ${piece.color}dd)`,
                borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                boxShadow: `0 0 8px ${piece.color}80`
              }}
            />
          ))}
        </AnimatePresence>

        <div className="w-40 h-40 sm:w-48 sm:h-48 relative">
          {/* Multi-layer glow effect */}
          <div className="absolute inset-0 -m-8 rounded-full bg-amber-400/30 blur-3xl animate-pulse" />
          <div className="absolute inset-0 -m-4 rounded-full bg-amber-500/20 blur-2xl" />
          <div className="absolute inset-0 -m-2 rounded-full bg-gradient-to-r from-amber-300/20 via-yellow-500/30 to-amber-300/20 blur-xl animate-[spin_12s_linear_infinite]" />
          
          {/* Rotating gear */}
          <svg viewBox="0 0 100 100" className="w-full h-full absolute inset-0 drop-shadow-[0_0_30px_rgba(218,165,32,0.6)] animate-[spin_12s_linear_infinite]">
            <defs>
              <linearGradient id="gateGearGold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f5e6a3" />
                <stop offset="25%" stopColor="#daa520" />
                <stop offset="50%" stopColor="#b8860b" />
                <stop offset="75%" stopColor="#daa520" />
                <stop offset="100%" stopColor="#f5e6a3" />
              </linearGradient>
              <radialGradient id="gateGearEmboss" cx="30%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#fff8dc" />
                <stop offset="50%" stopColor="#f5e6a3" />
                <stop offset="100%" stopColor="#b8860b" />
              </radialGradient>
              <linearGradient id="trophyGold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffd700" />
                <stop offset="50%" stopColor="#ffb347" />
                <stop offset="100%" stopColor="#daa520" />
              </linearGradient>
            </defs>
            
            {/* Gear teeth */}
            {[...Array(12)].map((_, i) => (
              <rect
                key={i}
                x="44"
                y="0"
                width="12"
                height="14"
                rx="2"
                fill="url(#gateGearGold)"
                transform={`rotate(${i * 30} 50 50)`}
              />
            ))}
            
            {/* Main gear body */}
            <circle cx="50" cy="50" r="40" fill="url(#gateGearEmboss)" />
            
            {/* Inner ring */}
            <circle cx="50" cy="50" r="32" fill="none" stroke="url(#gateGearGold)" strokeWidth="3" />
            
            {/* Center medallion */}
            <circle cx="50" cy="50" r="26" fill="url(#gateGearEmboss)" />
            
            {/* Trophy icon in center */}
            <g transform="translate(50, 50) scale(0.8)">
              {/* Trophy cup */}
              <path 
                d="M-12 -8 L12 -8 L12 0 C12 8 6 14 0 14 C-6 14 -12 8 -12 0 Z" 
                fill="url(#trophyGold)" 
                stroke="#b8860b" 
                strokeWidth="1"
              />
              {/* Left handle */}
              <path 
                d="M-12 -6 L-16 -6 L-16 0 C-16 4 -14 6 -12 6" 
                fill="none" 
                stroke="url(#trophyGold)" 
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Right handle */}
              <path 
                d="M12 -6 L16 -6 L16 0 C16 4 14 6 12 6" 
                fill="none" 
                stroke="url(#trophyGold)" 
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Base stem */}
              <rect x="-3" y="14" width="6" height="4" fill="url(#trophyGold)" />
              {/* Base */}
              <rect x="-8" y="18" width="16" height="3" rx="1" fill="url(#trophyGold)" stroke="#b8860b" strokeWidth="0.5" />
              {/* "1" inside trophy */}
              <text x="0" y="4" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#8b4513">1</text>
            </g>
            
            {/* Decorative dots around edge */}
            {[...Array(8)].map((_, i) => (
              <circle
                key={i}
                cx="50"
                cy="12"
                r="2"
                fill="#daa520"
                transform={`rotate(${i * 45} 50 50)`}
              />
            ))}
          </svg>
          
          {/* Gem shine overlay - counter-rotating */}
          <div className="absolute inset-0 rounded-full overflow-hidden animate-[spin_3s_linear_infinite_reverse]">
            <div className="absolute top-0 left-1/4 w-1/2 h-1/2 bg-gradient-to-br from-white/50 via-amber-200/30 to-transparent blur-sm" />
          </div>
          
          {/* Sparkle effects */}
          <div className="absolute inset-0 pointer-events-none">
            <motion.div
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute top-2 right-4 w-3 h-3 bg-white rounded-full blur-[1px]"
            />
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.3, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
              className="absolute bottom-4 left-2 w-2 h-2 bg-amber-200 rounded-full blur-[1px]"
            />
          </div>
        </div>
      </motion.div>

      {/* OneDuo.ai text */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3 }}
        className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-12 tracking-tight"
      >
        OneDuo<span className="text-amber-400">.ai</span>
      </motion.h1>

      {/* Password form */}
      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        onSubmit={handleSubmit}
        className={`flex flex-col items-center gap-4 ${isShaking ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
      >
        <Input
          type="password"
          placeholder="Enter access code"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-64 bg-white/5 border-amber-500/30 text-white placeholder:text-white/40 focus:border-amber-400 focus:ring-amber-400/20"
        />
        <Button
          type="submit"
          className="w-64 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-black font-bold shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 transition-all"
        >
          Enter
        </Button>
      </motion.form>

      {/* Shake animation keyframes */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}
