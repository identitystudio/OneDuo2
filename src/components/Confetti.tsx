/**
 * Confetti Celebration Component
 * Animated confetti explosion for special moments
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  color: string;
  shape: 'square' | 'circle' | 'triangle' | 'ribbon';
  delay: number;
  duration: number;
}

const COLORS = [
  'hsl(45, 93%, 58%)',   // bright gold
  'hsl(38, 92%, 50%)',   // amber gold
  'hsl(48, 96%, 53%)',   // yellow gold
  'hsl(40, 90%, 45%)',   // deep gold
  'hsl(43, 89%, 62%)',   // light gold
];

const SHAPES: ConfettiPiece['shape'][] = ['square', 'circle', 'triangle', 'ribbon'];

function generateConfetti(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100 - 50, // -50 to 50 vw from center
    y: -(100 + Math.random() * 50), // Start above viewport
    rotation: Math.random() * 720 - 360,
    scale: 0.5 + Math.random() * 1,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
    delay: Math.random() * 0.5,
    duration: 2 + Math.random() * 2,
  }));
}

const ConfettiShape = ({ shape, color }: { shape: ConfettiPiece['shape']; color: string }) => {
  switch (shape) {
    case 'circle':
      return <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />;
    case 'triangle':
      return (
        <div
          className="w-0 h-0"
          style={{
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderBottom: `10px solid ${color}`,
          }}
        />
      );
    case 'ribbon':
      return <div className="w-2 h-6 rounded-sm" style={{ backgroundColor: color }} />;
    default:
      return <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />;
  }
};

interface ConfettiProps {
  isActive: boolean;
  pieceCount?: number;
}

export function Confetti({ isActive, pieceCount = 60 }: ConfettiProps) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    if (isActive) {
      // Initial burst
      setPieces(generateConfetti(pieceCount));
      setBurst(1);

      // Second burst after a delay
      const timer = setTimeout(() => {
        setPieces(prev => [...prev, ...generateConfetti(Math.floor(pieceCount / 2))]);
        setBurst(2);
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [isActive, pieceCount]);

  if (!isActive || pieces.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {pieces.map((piece) => (
        <motion.div
          key={`${piece.id}-${burst}`}
          initial={{
            opacity: 1,
            x: '50vw',
            y: '-10vh',
            rotate: 0,
            scale: 0,
          }}
          animate={{
            opacity: [1, 1, 1, 0],
            x: `calc(50vw + ${piece.x}vw)`,
            y: '110vh',
            rotate: piece.rotation,
            scale: [0, piece.scale, piece.scale, piece.scale * 0.5],
          }}
          transition={{
            duration: piece.duration,
            delay: piece.delay,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="absolute"
        >
          <ConfettiShape shape={piece.shape} color={piece.color} />
        </motion.div>
      ))}
    </div>
  );
}
