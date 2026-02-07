import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, FileText, Sparkles } from 'lucide-react';

type AIProvider = 'chatgpt' | 'claude' | 'gemini';

const aiProviders: { id: AIProvider; name: string; color: string; bgColor: string; icon: string }[] = [
  { id: 'chatgpt', name: 'ChatGPT', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', icon: '◎' },
  { id: 'claude', name: 'Claude', color: 'text-orange-400', bgColor: 'bg-orange-500/20', icon: 'C' },
  { id: 'gemini', name: 'Gemini', color: 'text-blue-400', bgColor: 'bg-blue-500/20', icon: '✦' },
];

const conversations = {
  chatgpt: {
    question: "What's the key framework from Module 3?",
    answer: "Based on the training at 12:45, the 3-step framework is: 1) Identify the gap, 2) Bridge with value, 3) Close with clarity..."
  },
  claude: {
    question: 'can you "see" this video?',
    answer: "HELL YEAH!!!! OMG that was the first time i ever saw video!"
  },
  gemini: {
    question: "can you finally see this video and not just summarize it?",
    answer: "yes, i can, sorry for the other videos where i blinked a lot and missed parts you wanted me to see."
  }
};

// Subtle bounce animation for messages
const messageVariants = {
  hidden: { opacity: 0, y: 15, scale: 0.97 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { 
      type: 'spring' as const,
      stiffness: 300,
      damping: 24,
    }
  },
  exit: { 
    opacity: 0, 
    y: -10,
    transition: { duration: 0.2 }
  }
};

export function HeroAIChatAnimation() {
  const [currentProvider, setCurrentProvider] = useState<AIProvider>('chatgpt');
  const [animationPhase, setAnimationPhase] = useState<'intro' | 'question' | 'response'>('intro');

  const provider = aiProviders.find(p => p.id === currentProvider)!;
  const convo = conversations[currentProvider];

  useEffect(() => {
    // Animation sequence - no typewriter, just timed reveals
    const sequence = async () => {
      setAnimationPhase('intro');
      
      await new Promise(r => setTimeout(r, 600));
      setAnimationPhase('question');
      
      await new Promise(r => setTimeout(r, 1200));
      setAnimationPhase('response');
      
      await new Promise(r => setTimeout(r, 3500));
      
      // Move to next provider
      setCurrentProvider(prev => {
        const currentIndex = aiProviders.findIndex(p => p.id === prev);
        return aiProviders[(currentIndex + 1) % aiProviders.length].id;
      });
    };
    
    sequence();
  }, [currentProvider]);

  return (
    <div className="w-full max-w-full lg:max-w-[1400px] xl:max-w-[1600px] mx-auto px-4 md:px-8 lg:px-12">
      <div className="relative bg-gradient-to-br from-[#0a1a0a] to-[#0d1f0d] rounded-2xl lg:rounded-3xl border border-[#a3e635]/30 shadow-2xl shadow-[#a3e635]/10 overflow-hidden">
        {/* Header Bar */}
        <div className="bg-[#a3e635]/10 border-b border-[#a3e635]/20 px-4 md:px-6 lg:px-8 py-3 md:py-4 flex items-center justify-between">
          <div className="flex gap-1.5 md:gap-2">
            <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-green-500/60" />
          </div>
          
          {/* Provider tabs */}
          <div className="flex items-center gap-2 md:gap-3 lg:gap-4">
            {aiProviders.map((p) => (
              <motion.div
                key={p.id}
                animate={{ 
                  opacity: p.id === currentProvider ? 1 : 0.4,
                  scale: p.id === currentProvider ? 1 : 0.9
                }}
                className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 lg:px-5 py-1 md:py-1.5 rounded-lg ${p.id === currentProvider ? p.bgColor : 'bg-transparent'} border ${p.id === currentProvider ? 'border-white/20' : 'border-transparent'}`}
              >
                <span className={`text-sm md:text-base lg:text-lg font-bold ${p.color}`}>{p.icon}</span>
                <span className={`text-xs md:text-sm lg:text-base font-medium ${p.color}`}>{p.name}</span>
              </motion.div>
            ))}
            <span className="text-white/40 text-xs md:text-sm lg:text-base italic ml-1">or any AI</span>
          </div>
          
          <div className="w-12 md:w-16" />
        </div>

        {/* Chat Content - Full width horizontal layout for desktop/iPad */}
        <div className="aspect-[16/9] md:aspect-[21/9] lg:aspect-[24/9] xl:aspect-[28/9] p-4 sm:p-6 md:p-8 lg:p-10 xl:p-12 flex flex-col">
          {/* PDF Context Banner */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 md:gap-3 px-3 md:px-4 lg:px-5 py-2 md:py-3 mb-4 md:mb-6 rounded-lg md:rounded-xl bg-[#a3e635]/10 border border-[#a3e635]/30"
          >
            <FileText className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-[#a3e635]" />
            <span className="text-[#a3e635] text-xs sm:text-sm md:text-base lg:text-lg font-medium">OneDuo-Training.pdf attached</span>
            <Sparkles className="w-3 h-3 md:w-4 md:h-4 text-[#a3e635]/60 ml-auto" />
          </motion.div>

          {/* Chat Messages - Horizontal layout for wider screens */}
          <div className="flex-1 flex flex-col md:flex-row md:items-center md:justify-center gap-4 md:gap-6 lg:gap-10 xl:gap-16">
            <AnimatePresence mode="wait">
              {/* User Question - drops in with subtle bounce */}
              {(animationPhase === 'question' || animationPhase === 'response') && (
                <motion.div
                  key={`question-${currentProvider}`}
                  variants={messageVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="flex justify-end md:justify-start md:flex-1"
                >
                  <div className="max-w-[80%] md:max-w-full md:w-full px-5 md:px-6 lg:px-8 py-4 md:py-5 lg:py-6 rounded-2xl rounded-br-md md:rounded-2xl bg-[#a3e635] text-black">
                    <p className="text-base sm:text-lg md:text-xl lg:text-2xl font-medium">
                      {convo.question}
                    </p>
                  </div>
                </motion.div>
              )}

              {/* AI Response - drops in with subtle bounce */}
              {animationPhase === 'response' && (
                <motion.div
                  key={`answer-${currentProvider}`}
                  variants={messageVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="flex justify-start md:flex-1"
                >
                  <div className={`max-w-[85%] md:max-w-full md:w-full px-5 md:px-6 lg:px-8 py-4 md:py-5 lg:py-6 rounded-2xl rounded-bl-md md:rounded-2xl ${provider.bgColor} border border-white/10`}>
                    <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3">
                      <span className={`text-xl md:text-2xl lg:text-3xl font-bold ${provider.color}`}>{provider.icon}</span>
                      <span className={`text-sm md:text-base lg:text-lg font-medium ${provider.color}`}>{provider.name}</span>
                    </div>
                    <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-white/90 leading-relaxed">
                      {convo.answer}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Input Area */}
          <div className="mt-4 md:mt-6 lg:mt-8 flex items-center gap-2 md:gap-3 px-4 md:px-6 lg:px-8 py-3 md:py-4 lg:py-5 rounded-xl md:rounded-2xl bg-white/5 border border-white/10">
            <MessageSquare className="w-5 h-5 md:w-6 md:h-6 text-white/30" />
            <span className="flex-1 text-white/30 text-sm md:text-base lg:text-lg">Ask about your training...</span>
            <div className="w-8 h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 rounded-full bg-white/10 flex items-center justify-center">
              <Send className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-white/40" />
            </div>
          </div>
        </div>

        {/* Bottom indicator */}
        <div className="absolute bottom-3 md:bottom-4 lg:bottom-5 left-0 right-0 flex flex-col items-center gap-2">
          <div className="flex justify-center gap-2 md:gap-3">
            {aiProviders.map((p) => (
              <motion.div
                key={p.id}
                animate={{ 
                  width: p.id === currentProvider ? 24 : 8,
                  opacity: p.id === currentProvider ? 1 : 0.3
                }}
                className={`h-2 md:h-2.5 lg:h-3 rounded-full ${p.id === currentProvider ? 'bg-[#a3e635]' : 'bg-white/30'}`}
              />
            ))}
          </div>
          <p className="text-white/30 text-[10px] md:text-xs">*Illustrative AI responses. Not actual model outputs.</p>
        </div>
      </div>
    </div>
  );
}
