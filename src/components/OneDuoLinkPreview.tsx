import { motion } from 'framer-motion';
import { FileText, Bot, Sparkles, Download, Check, Play, Image } from 'lucide-react';
import { useState, useEffect } from 'react';

export const OneDuoLinkPreview = () => {
  const [downloaded, setDownloaded] = useState(false);
  const [activeAI, setActiveAI] = useState(0);
  const [typedText, setTypedText] = useState('');
  
  const aiPlatforms = [
    { name: 'ChatGPT', color: 'from-green-500 to-emerald-500', icon: '🤖' },
    { name: 'Claude', color: 'from-orange-500 to-amber-500', icon: '🧠' },
    { name: 'Gemini', color: 'from-blue-500 to-cyan-500', icon: '✨' },
    { name: 'Grok', color: 'from-purple-500 to-pink-500', icon: '🚀' },
  ];

  const fullPrompt = "Here's my OneDuo AI PDF. Build a training guide from this...";

  // Cycle through AI platforms
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveAI((prev) => (prev + 1) % aiPlatforms.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Typing animation for the prompt
  useEffect(() => {
    let index = 0;
    const typeInterval = setInterval(() => {
      if (index <= fullPrompt.length) {
        setTypedText(fullPrompt.slice(0, index));
        index++;
      } else {
        clearInterval(typeInterval);
      }
    }, 50);
    return () => clearInterval(typeInterval);
  }, []);

  // Download animation cycle
  useEffect(() => {
    const downloadInterval = setInterval(() => {
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2000);
    }, 5000);
    return () => clearInterval(downloadInterval);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      className="w-full max-w-[700px] mx-auto"
    >
      {/* Hero label - PDF is THE product */}
      <div className="text-center mb-6">
        <p className="text-white/60 text-sm mb-2">👇 This is what you get</p>
        <h3 className="text-xl sm:text-2xl font-bold text-white mb-1">Your OneDuo AI PDF</h3>
        <p className="text-white/50 text-sm">The execution artifact that works with every AI, forever.</p>
      </div>
      
      <div className="relative p-4 sm:p-6 rounded-2xl bg-gradient-to-br from-[#0d1117] to-[#161b22] border border-white/[0.08] overflow-hidden">
        {/* Animated glow effect - Red/Coral for PDF */}
        <motion.div
          className="absolute inset-0 opacity-30"
          animate={{
            background: [
              'radial-gradient(circle at 20% 50%, rgba(239, 68, 68, 0.15) 0%, transparent 50%)',
              'radial-gradient(circle at 80% 50%, rgba(245, 158, 11, 0.15) 0%, transparent 50%)',
              'radial-gradient(circle at 50% 80%, rgba(239, 68, 68, 0.15) 0%, transparent 50%)',
              'radial-gradient(circle at 20% 50%, rgba(239, 68, 68, 0.15) 0%, transparent 50%)',
            ],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
        />

        {/* Header */}
        <div className="relative flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center"
            >
              <FileText className="w-4 h-4 text-white" />
            </motion.div>
            <div>
              <p className="text-white font-semibold text-sm">Your OneDuo AI PDF</p>
              <p className="text-white/40 text-xs">Complete video intelligence package</p>
            </div>
          </div>
          <motion.div
            initial={{ scale: 1 }}
            animate={{ scale: downloaded ? [1, 1.2, 1] : 1 }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              downloaded 
                ? 'bg-green-500 text-white' 
                : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
            }`}
          >
            {downloaded ? <Check className="w-3 h-3" /> : <Download className="w-3 h-3" />}
            {downloaded ? 'Downloaded!' : 'Download'}
          </motion.div>
        </div>

        {/* The PDF Display */}
        <motion.div
          className="relative p-3 sm:p-4 rounded-xl bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/30 mb-4"
          animate={{ 
            boxShadow: [
              '0 0 20px rgba(239, 68, 68, 0.1)',
              '0 0 40px rgba(239, 68, 68, 0.2)',
              '0 0 20px rgba(239, 68, 68, 0.1)',
            ]
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center border border-red-500/20">
              <FileText className="w-5 h-5 text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-red-400 font-semibold text-xs sm:text-sm truncate">
                Your-997-Course_OneDuo.pdf
              </p>
              <p className="text-white/40 text-[10px] sm:text-xs mt-0.5">Complete AI analysis • Screenplay format • Share with any AI</p>
            </div>
            <div className="px-2 py-0.5 bg-red-500/20 rounded text-[10px] text-red-400 font-bold">PDF</div>
          </div>
        </motion.div>

        {/* Content Preview Cards - What's in the PDF */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { icon: Play, label: 'Scenes', count: '47' },
            { icon: Image, label: 'Frames', count: '156' },
            { icon: FileText, label: 'Script', count: '4.2k' },
            { icon: Sparkles, label: 'Prosody', count: '83' },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
              className="p-2 sm:p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] text-center"
            >
              <item.icon className="w-4 h-4 mx-auto mb-1 text-red-400/70" />
              <p className="text-white/80 text-xs font-medium">{item.count}</p>
              <p className="text-white/40 text-[10px]">{item.label}</p>
            </motion.div>
          ))}
        </div>

        {/* AI Platform Rotation */}
        <div className="relative p-3 sm:p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex -space-x-2">
              {aiPlatforms.map((platform, i) => (
                <motion.div
                  key={platform.name}
                  animate={{ 
                    scale: activeAI === i ? 1.15 : 1,
                    zIndex: activeAI === i ? 10 : 1,
                  }}
                  className={`w-7 h-7 rounded-full bg-gradient-to-br ${platform.color} flex items-center justify-center text-sm border-2 border-[#0d1117]`}
                >
                  {platform.icon}
                </motion.div>
              ))}
            </div>
            <motion.p 
              key={activeAI}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-white/80 text-sm font-medium"
            >
              Pasting in <span className={`bg-gradient-to-r ${aiPlatforms[activeAI].color} bg-clip-text text-transparent font-bold`}>
                {aiPlatforms[activeAI].name}
              </span>...
            </motion.p>
          </div>

        {/* Simulated Chat Input */}
          <div className="relative p-3 rounded-lg bg-[#1a1f26] border border-white/[0.08]">
            <div className="flex items-start gap-2">
              <Bot className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-white/70 text-xs sm:text-sm leading-relaxed">
                  {typedText}
                  <motion.span
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    className="inline-block w-0.5 h-4 bg-red-400 ml-0.5 align-middle"
                  />
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/10 border border-red-500/20">
                  <FileText className="w-3 h-3 text-red-400" />
                  <span className="text-red-400 font-mono text-[10px] sm:text-xs">Course_OneDuo.pdf attached</span>
                </div>
              </div>
            </div>
          </div>

          {/* AI Response Preview */}
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ delay: 2, duration: 0.5 }}
            className="mt-3 p-3 rounded-lg bg-gradient-to-r from-red-500/5 to-amber-500/5 border border-white/[0.06]"
          >
            <div className="flex items-center gap-2 mb-2">
              <motion.div
                animate={{ rotate: [0, 15, -15, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
              </motion.div>
              <p className="text-white/60 text-xs">AI Response</p>
            </div>
            <p className="text-white/80 text-xs sm:text-sm leading-relaxed">
              "I've analyzed your OneDuo PDF. The screenplay format shows exactly what was said 
              <span className="text-red-400"> (nervously)</span> and when the speaker 
              <span className="text-red-400">(pauses for emphasis)</span>. Building your training guide now..."
            </p>
          </motion.div>
        </div>

        {/* Bottom - Supporting "infrastructure" message */}
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          {/* PDF features badges */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
            {['Screenplay Format', 'Prosody Cues', 'Frame Annotations', 'Works Forever'].map((badge, i) => (
              <motion.div
                key={badge}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="px-2 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-[10px] text-white/50"
              >
                <span className="text-red-400 mr-1">✓</span>
                {badge}
              </motion.div>
            ))}
          </div>
          
          {/* Supporting infrastructure message - PDF is the hero */}
          <div className="text-center">
            <p className="text-white/40 text-xs">
              <span className="text-red-400/70">Your AI PDF.</span> Works with ChatGPT, Claude, Gemini, Grok — forever.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
