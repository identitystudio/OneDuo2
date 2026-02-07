/**
 * Quick Gold Confetti Burst
 * 0.25 second gold confetti animation for brand reinforcement
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const GOLD_COLORS = [
  'hsl(45, 93%, 58%)',   // bright gold
  'hsl(38, 92%, 50%)',   // amber gold
  'hsl(48, 96%, 53%)',   // yellow gold
];

interface ConfettiPiece {
  id: number;
  x: number;
  size: number;
  delay: number;
  color: string;
}

function generatePieces(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100, // 0 to 100vw
    size: 4 + Math.random() * 6, // 4-10px
    delay: Math.random() * 0.1, // 0-100ms stagger
    color: GOLD_COLORS[Math.floor(Math.random() * GOLD_COLORS.length)],
  }));
}

interface QuickConfettiProps {
  isActive: boolean;
  onComplete?: () => void;
}

export function QuickConfetti({ isActive, onComplete }: QuickConfettiProps) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isActive) {
      setPieces(generatePieces(20));
      setShow(true);
      
      // Hide after 250ms
      const timer = setTimeout(() => {
        setShow(false);
        onComplete?.();
      }, 250);
      
      return () => clearTimeout(timer);
    }
  }, [isActive, onComplete]);

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {pieces.map((piece) => (
            <motion.div
              key={piece.id}
              initial={{
                opacity: 1,
                x: `${piece.x}vw`,
                y: '-5vh',
                scale: 0,
              }}
              animate={{
                opacity: [1, 1, 0],
                y: '30vh',
                scale: [0, 1, 0.5],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.25,
                delay: piece.delay,
                ease: 'easeOut',
              }}
              className="absolute rounded-full"
              style={{
                width: piece.size,
                height: piece.size,
                backgroundColor: piece.color,
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}
