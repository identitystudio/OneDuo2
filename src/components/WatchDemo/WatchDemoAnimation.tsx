import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { AnimatedScene, scenes } from './AnimatedScene';
import { Play, Pause, RotateCcw } from 'lucide-react';

const SCENE_DURATIONS = [7000, 8000, 7000, 9000, 6000, 8000, 6000, 5000, 5000]; // ms per scene

export function WatchDemoAnimation() {
  const [currentScene, setCurrentScene] = useState(1);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);

  const totalScenes = Object.keys(scenes).length;

  const nextScene = useCallback(() => {
    if (currentScene < totalScenes) {
      setCurrentScene(prev => prev + 1);
      setProgress(0);
    } else {
      // Loop back to start
      setCurrentScene(1);
      setProgress(0);
    }
  }, [currentScene, totalScenes]);

  const restart = () => {
    setCurrentScene(1);
    setProgress(0);
    setIsPlaying(true);
  };

  // Auto-advance scenes
  useEffect(() => {
    if (!isPlaying) return;

    const duration = SCENE_DURATIONS[currentScene - 1] || 6000;
    const startTime = Date.now();
    
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / duration) * 100, 100);
      setProgress(newProgress);
      
      if (elapsed >= duration) {
        nextScene();
      }
    }, 50);

    return () => clearInterval(progressInterval);
  }, [currentScene, isPlaying, nextScene]);

  return (
    <div className="relative w-full max-w-5xl mx-auto">
      {/* Main Animation Container */}
      <div className="bg-gradient-to-br from-gray-900/50 to-black/80 rounded-3xl border border-white/10 p-6 md:p-10 min-h-[500px] md:min-h-[600px] flex flex-col">
        {/* Scene Content */}
        <div className="flex-1">
          <AnimatedScene 
            sceneNumber={currentScene} 
            isActive={true}
          />
        </div>

        {/* Controls */}
        <div className="mt-6 pt-4 border-t border-white/10">
          {/* Progress Bar */}
          <div className="flex items-center gap-2 mb-4">
            {Array.from({ length: totalScenes }, (_, i) => (
              <div key={i} className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                <motion.div 
                  className="h-full bg-gradient-to-r from-blue-500 to-amber-500"
                  initial={{ width: 0 }}
                  animate={{ 
                    width: currentScene > i + 1 ? '100%' : 
                           currentScene === i + 1 ? `${progress}%` : '0%' 
                  }}
                />
              </div>
            ))}
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 text-white" />
                ) : (
                  <Play className="w-5 h-5 text-white" />
                )}
              </button>
              <button
                onClick={restart}
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                <RotateCcw className="w-5 h-5 text-white" />
              </button>
            </div>

            <span className="text-white/40 text-sm font-mono">
              Scene {currentScene} of {totalScenes}
            </span>

            {/* Scene dots for clicking */}
            <div className="flex items-center gap-1">
              {Array.from({ length: totalScenes }, (_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setCurrentScene(i + 1);
                    setProgress(0);
                  }}
                  className={`w-2 h-2 rounded-full transition-all ${
                    currentScene === i + 1 
                      ? 'bg-amber-400 scale-125' 
                      : currentScene > i + 1 
                        ? 'bg-blue-400' 
                        : 'bg-white/20 hover:bg-white/40'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
