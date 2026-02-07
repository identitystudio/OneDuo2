import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, Brain, MessageCircle, CheckCircle, Play, Video, 
  BookOpen, Users, Film, Clapperboard, GraduationCap, 
  Briefcase, Lightbulb, Clock, Link2, Eye, Sparkles,
  MonitorPlay, FileVideo, Share2, FileText, Download, Star, Flame
} from 'lucide-react';

type UseCaseType = 'courses' | 'meetings' | 'consultants' | 'screenwriters' | 'ecommerce';

interface UseCaseDemoProps {
  type: UseCaseType;
}

const useCaseConfigs = {
  courses: {
    title: "Watch How OneDuo Works: For Training",
    color: "cyan",
    steps: [
      {
        id: 0,
        title: "Add Training",
        visual: "course-library",
        elements: ['Module 1: Basics', 'Module 2: Advanced', 'Module 3: Mastery', 'Module 4: Expert Tips'],
      },
      {
        id: 1,
        title: "One Upload",
        visual: "upload",
        elements: ['Uploading training...', 'Extracting frames...', 'Generating PDF...'],
      },
      {
        id: 2,
        title: "One PDF",
        visual: "pdf-download",
        elements: ['your-training.pdf'],
      },
      {
        id: 3,
        title: "Feed to AI",
        visual: "feed-ai",
        question: "Uploading PDF to ChatGPT...",
      },
      {
        id: 4,
        title: "AI Loves It",
        visual: "ai-success",
        answer: "🔥 ⭐⭐⭐⭐⭐",
      },
    ],
  },
  meetings: {
    title: "Watch How OneDuo Works for Zoom Meetings",
    color: "blue",
    steps: [
      {
        id: 0,
        title: "Your Strategy Call",
        visual: "zoom-call",
        elements: ['Screen shares', 'Diagrams drawn', 'Decisions made', 'Action items'],
      },
      {
        id: 1,
        title: "One Upload",
        visual: "upload",
        elements: ['Processing recording...', 'Capturing slides...', 'Indexing discussions...'],
      },
      {
        id: 2,
        title: "One PDF",
        visual: "pdf-download",
        elements: ['strategy-call.pdf'],
      },
      {
        id: 3,
        title: "Team Member Asks",
        visual: "chat",
        question: "What was the budget we agreed on for Q2?",
      },
      {
        id: 4,
        title: "AI Finds It Instantly",
        visual: "answer",
        answer: "At 32:15, John shared his screen showing $45K budget breakdown with the pie chart...",
      },
    ],
  },
  consultants: {
    title: "Watch How OneDuo Works for Consultants",
    color: "green",
    steps: [
      {
        id: 0,
        title: "Your SOPs & Training",
        visual: "sop-library",
        elements: ['Client Onboarding', 'Pricing Strategy', 'Delivery Process', 'Edge Cases'],
      },
      {
        id: 1,
        title: "One Upload",
        visual: "upload",
        elements: ['Learning your methods...', 'Capturing examples...', 'Indexing decisions...'],
      },
      {
        id: 2,
        title: "One PDF",
        visual: "pdf-download",
        elements: ['agency-sops.pdf'],
      },
      {
        id: 3,
        title: "Your Team Asks",
        visual: "chat",
        question: "Client wants a rush job - what's our policy?",
      },
      {
        id: 4,
        title: "Your Expertise, Instantly",
        visual: "answer",
        answer: "In the Edge Cases video at 8:45, you explain rush jobs get 50% upcharge and require deposit...",
      },
    ],
  },
  screenwriters: {
    title: "Watch How OneDuo Works for Filmmakers",
    color: "amber",
    steps: [
      {
        id: 0,
        title: "Reference Footage",
        visual: "film-reel",
        elements: ['The suspense build', 'Lighting choices', 'Cut timing', 'B-roll patterns'],
      },
      {
        id: 1,
        title: "One Upload",
        visual: "upload",
        elements: ['Extracting frames...', 'Analyzing cuts...', 'Mapping pacing...'],
      },
      {
        id: 2,
        title: "One PDF",
        visual: "pdf-download",
        elements: ['reference-library.pdf'],
      },
      {
        id: 3,
        title: "You Ask AI",
        visual: "chat",
        question: "How does this scene build tension before the reveal?",
      },
      {
        id: 4,
        title: "AI Sees The Craft",
        visual: "answer",
        answer: "Starting at 2:15, quick cuts every 0.5s build pace, then at 2:47 a 4-second hold before the door opens...",
      },
    ],
  },
  ecommerce: {
    title: "Watch How OneDuo Works for E-commerce",
    color: "orange",
    steps: [
      {
        id: 0,
        title: "Winning Product Video",
        visual: "product-video",
        elements: ['TikTok viral ad', 'Hook at 0:03', 'Demo at 0:12', 'CTA at 0:28'],
      },
      {
        id: 1,
        title: "Screen Grab → Upload",
        visual: "upload",
        elements: ['Recording TikTok...', 'Extracting frames...', 'Analyzing hooks...'],
      },
      {
        id: 2,
        title: "One PDF",
        visual: "pdf-download",
        elements: ['product-research.pdf'],
      },
      {
        id: 3,
        title: "Team Analyzes",
        visual: "chat",
        question: "Write 10 hooks like frame 0:23",
      },
      {
        id: 4,
        title: "Every AI Sees It",
        visual: "answer",
        answer: "Based on the frame at 0:23 showing the product reveal with dramatic zoom, here are 10 hook variations...",
      },
    ],
  },
};

const colorClasses = {
  cyan: {
    bg: 'from-cyan-500/10 to-cyan-500/5',
    border: 'border-cyan-500/30',
    text: 'text-cyan-400',
    glow: 'bg-cyan-500/20',
    progress: 'from-cyan-500 to-cyan-400',
  },
  blue: {
    bg: 'from-[#2D8CFF]/15 to-[#2D8CFF]/5',
    border: 'border-[#2D8CFF]/40',
    text: 'text-[#2D8CFF]',
    glow: 'bg-[#2D8CFF]/25',
    progress: 'from-[#2D8CFF] to-[#0B5CFF]',
  },
  purple: {
    bg: 'from-purple-500/10 to-purple-500/5',
    border: 'border-purple-500/30',
    text: 'text-purple-400',
    glow: 'bg-purple-500/20',
    progress: 'from-purple-500 to-purple-400',
  },
  green: {
    bg: 'from-green-500/10 to-green-500/5',
    border: 'border-green-500/30',
    text: 'text-green-400',
    glow: 'bg-green-500/20',
    progress: 'from-green-500 to-green-400',
  },
  amber: {
    bg: 'from-amber-500/10 to-amber-500/5',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    glow: 'bg-amber-500/20',
    progress: 'from-amber-500 to-amber-400',
  },
  orange: {
    bg: 'from-orange-500/10 to-orange-500/5',
    border: 'border-orange-500/30',
    text: 'text-orange-400',
    glow: 'bg-orange-500/20',
    progress: 'from-orange-500 to-orange-400',
  },
};

export function UseCaseDemo({ type }: UseCaseDemoProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const config = useCaseConfigs[type];
  const colors = colorClasses[config.color as keyof typeof colorClasses];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % config.steps.length);
    }, 3500);
    return () => clearInterval(timer);
  }, [config.steps.length]);

  const step = config.steps[currentStep];

  return (
    <div className="w-full">
      {/* Title */}
      <motion.h4
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className={`text-lg font-bold ${colors.text} mb-4 flex items-center gap-2`}
      >
        <Play className="w-4 h-4" />
        {config.title}
      </motion.h4>

      {/* Demo Container */}
      <div className={`aspect-[4/3] sm:aspect-[3/2] bg-gradient-to-br ${colors.bg} rounded-xl border ${colors.border} overflow-hidden relative`}>
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/10 z-10">
          <motion.div
            className={`h-full bg-gradient-to-r ${colors.progress}`}
            initial={{ width: '0%' }}
            animate={{ width: `${((currentStep + 1) / config.steps.length) * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>

        {/* Step Dots */}
        <div className="absolute top-3 left-3 flex gap-1.5 z-10">
          {config.steps.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentStep(idx)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                idx === currentStep ? `${colors.glow} w-4` : 'bg-white/30'
              }`}
            />
          ))}
        </div>

        {/* Main Visual */}
        <div className="h-full flex items-center justify-center p-4 pt-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4 }}
              className="w-full flex flex-col items-center gap-3"
            >
              {/* Library Visual */}
              {(step.visual === 'course-library' || step.visual === 'sop-library' || step.visual === 'zoom-call' || step.visual === 'film-reel') && (
                <div className="flex flex-col items-center gap-3">
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className={`w-16 h-16 rounded-2xl ${colors.glow} flex items-center justify-center`}
                  >
                    {step.visual === 'course-library' && <GraduationCap className={`w-8 h-8 ${colors.text}`} />}
                    {step.visual === 'zoom-call' && <MonitorPlay className={`w-8 h-8 ${colors.text}`} />}
                    {step.visual === 'sop-library' && <Briefcase className={`w-8 h-8 ${colors.text}`} />}
                    {step.visual === 'film-reel' && <Clapperboard className={`w-8 h-8 ${colors.text}`} />}
                  </motion.div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {step.elements?.map((el, i) => (
                      <motion.div
                        key={el}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.1 }}
                        className="px-2 py-1 rounded bg-white/10 text-xs text-white/70 border border-white/10"
                      >
                        {el}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload Visual */}
              {step.visual === 'upload' && (
                <div className="flex flex-col items-center gap-3">
                  <motion.div
                    className={`w-16 h-16 rounded-2xl border-2 border-dashed ${colors.border} flex items-center justify-center ${colors.glow}`}
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <Upload className={`w-8 h-8 ${colors.text}`} />
                  </motion.div>
                  <div className="flex flex-col gap-1">
                    {step.elements?.map((el, i) => (
                      <motion.div
                        key={el}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.3 }}
                        className="flex items-center gap-2 text-xs text-white/60"
                      >
                        <motion.div
                          className={`w-1.5 h-1.5 rounded-full ${colors.glow}`}
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                        />
                        {el}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Link Visual (legacy) */}
              {step.visual === 'link' && (
                <div className="flex flex-col items-center gap-3">
                  <motion.div
                    className={`w-16 h-16 rounded-full ${colors.glow} flex items-center justify-center`}
                    animate={{ 
                      boxShadow: [
                        '0 0 0 0 rgba(255,255,255,0)',
                        '0 0 0 15px rgba(255,255,255,0.1)',
                        '0 0 0 0 rgba(255,255,255,0)'
                      ]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Link2 className={`w-8 h-8 ${colors.text}`} />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`px-4 py-2 rounded-full ${colors.glow} border ${colors.border}`}
                  >
                    <span className={`text-sm font-mono ${colors.text}`}>{step.elements?.[0]}</span>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="flex items-center gap-1 text-white/40 text-xs"
                  >
                    <Share2 className="w-3 h-3" />
                    Share with any AI
                  </motion.div>
                </div>
              )}

              {/* PDF Download Visual */}
              {step.visual === 'pdf-download' && (
                <div className="flex flex-col items-center gap-3">
                  <motion.div
                    className={`w-16 h-20 rounded-lg bg-gradient-to-br from-red-500/20 to-red-600/20 border border-red-500/30 flex flex-col items-center justify-center relative`}
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <FileText className="w-8 h-8 text-red-400" />
                    <span className="text-[8px] font-bold text-red-400 mt-1">PDF</span>
                    <motion.div
                      className="absolute -bottom-2 -right-2 w-6 h-6 bg-cyan-500 rounded-full flex items-center justify-center"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    >
                      <Download className="w-3 h-3 text-black" />
                    </motion.div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`px-4 py-2 rounded-lg ${colors.glow} border ${colors.border}`}
                  >
                    <span className={`text-sm font-mono ${colors.text}`}>{step.elements?.[0]}</span>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="flex items-center gap-1 text-white/40 text-xs"
                  >
                    <Download className="w-3 h-3" />
                    Download & share with any AI
                  </motion.div>
                </div>
              )}

              {/* Feed to AI Visual */}
              {step.visual === 'feed-ai' && (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-4">
                    <motion.div
                      className="w-12 h-14 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center"
                      animate={{ x: [0, 20, 20] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <FileText className="w-5 h-5 text-red-400" />
                    </motion.div>
                    <motion.div
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 0.5, repeat: Infinity }}
                      className="text-cyan-400"
                    >
                      →
                    </motion.div>
                    <motion.div
                      className={`w-14 h-14 rounded-xl ${colors.glow} border ${colors.border} flex items-center justify-center`}
                    >
                      <Brain className={`w-7 h-7 ${colors.text}`} />
                    </motion.div>
                  </div>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="text-xs text-white/60"
                  >
                    {step.question}
                  </motion.p>
                </div>
              )}

              {/* AI Success Visual */}
              {step.visual === 'ai-success' && (
                <div className="flex flex-col items-center gap-3">
                  <motion.div
                    className={`w-16 h-16 rounded-xl ${colors.glow} border ${colors.border} flex items-center justify-center`}
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                  >
                    <Brain className={`w-8 h-8 ${colors.text}`} />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-2 text-2xl"
                  >
                    <motion.span
                      animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 0.5, repeat: Infinity }}
                    >
                      🔥
                    </motion.span>
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <motion.span
                          key={i}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.1 }}
                        >
                          <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                        </motion.span>
                      ))}
                    </div>
                  </motion.div>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-xs text-white/60"
                  >
                    AI has full context!
                  </motion.p>
                </div>
              )}


              {/* Chat Question Visual */}
              {step.visual === 'chat' && (
                <div className="w-full max-w-xs">
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex gap-2"
                  >
                    <div className={`w-8 h-8 rounded-full ${colors.glow} flex items-center justify-center shrink-0`}>
                      <Users className={`w-4 h-4 ${colors.text}`} />
                    </div>
                    <div className="bg-white/10 rounded-xl rounded-tl-sm px-3 py-2 text-xs text-white/80 border border-white/10">
                      "{step.question}"
                    </div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="flex items-center gap-1 mt-2 ml-10 text-white/40 text-xs"
                  >
                    <Eye className={`w-3 h-3 ${colors.text}`} />
                    <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }}>
                      AI watching video...
                    </motion.span>
                  </motion.div>
                </div>
              )}

              {/* Answer Visual */}
              {step.visual === 'answer' && (
                <div className="w-full max-w-xs space-y-2">
                  <div className="flex gap-2">
                    <div className={`w-8 h-8 rounded-full ${colors.glow} flex items-center justify-center shrink-0`}>
                      <Users className={`w-4 h-4 ${colors.text}`} />
                    </div>
                    <div className="bg-white/10 rounded-xl rounded-tl-sm px-3 py-2 text-xs text-white/60 border border-white/10">
                      "{config.steps[3].question}"
                    </div>
                  </div>
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex gap-2 justify-end"
                  >
                    <div className={`bg-gradient-to-r ${colors.bg} border ${colors.border} rounded-xl rounded-tr-sm px-3 py-2 text-xs text-white/90`}>
                      "{step.answer}"
                    </div>
                    <div className={`w-8 h-8 rounded-full ${colors.glow} flex items-center justify-center shrink-0`}>
                      <Sparkles className={`w-4 h-4 ${colors.text}`} />
                    </div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="flex justify-center"
                  >
                    <div className="flex items-center gap-1 text-green-400 text-xs">
                      <CheckCircle className="w-3 h-3" />
                      Found in seconds
                    </div>
                  </motion.div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Step Title */}
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
          <div className="text-center">
            <span className={`text-xs font-medium ${colors.text}`}>{step.title}</span>
          </div>
        </div>
      </div>
    </div>
  );
}