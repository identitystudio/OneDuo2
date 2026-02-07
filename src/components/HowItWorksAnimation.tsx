import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Check, 
  X, 
  Mail, 
  MessageSquare, 
  DollarSign, 
  Users, 
  Moon, 
  Clock,
  ArrowRight,
  Sparkles,
  Link2,
  Upload,
  FileText,
  Download
} from 'lucide-react';

type AnimationStep = 
  | 'idle'
  | 'add-video'
  | 'is-course'
  | 'course-yes'
  | 'how-many-modules'
  | 'type-modules'
  | 'show-modules'
  | 'switch-tab'
  | 'paste-links'
  | 'add-submodules'
  | 'submit'
  | 'processing'
  | 'time-passing'
  | 'email-received'
  | 'paste-to-ai'
  | 'ai-response'
  | 'success';

const stepDescriptions: Record<AnimationStep, string> = {
  'idle': 'Click "Add Video" to get started',
  'add-video': 'Start by adding your video content',
  'is-course': 'Tell us if this is a course with multiple modules',
  'course-yes': 'Great! This is a structured course',
  'how-many-modules': 'How many modules does your course have?',
  'type-modules': 'Enter the number of modules',
  'show-modules': 'Your modules are ready to be filled',
  'switch-tab': 'Grab your video links from your hosting platform',
  'paste-links': 'Paste each video link into its module',
  'add-submodules': 'Add sub-modules for additional parts (6a, 6b...)',
  'submit': 'Submit and let OneDuo work its magic',
  'processing': 'Processing... we\'ll email you when ready',
  'time-passing': 'A little later...',
  'email-received': 'Your OneDuo PDF is ready!',
  'paste-to-ai': 'Upload your PDF to any AI',
  'ai-response': 'AI now sees EVERYTHING you see!',
  'success': 'Your results speak for themselves'
};

export function HowItWorksAnimation() {
  const [currentStep, setCurrentStep] = useState<AnimationStep>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [moduleCount, setModuleCount] = useState(0);
  const [pastedLinks, setPastedLinks] = useState<number[]>([]);
  const [typedNumber, setTypedNumber] = useState('');

  // Auto-play animation loop
  useEffect(() => {
    if (!isPlaying) return;

    const stepSequence: { step: AnimationStep; duration: number }[] = [
      { step: 'add-video', duration: 1000 },
      { step: 'is-course', duration: 1200 },
      { step: 'course-yes', duration: 700 },
      { step: 'how-many-modules', duration: 1000 },
      { step: 'type-modules', duration: 1400 },
      { step: 'show-modules', duration: 1200 },
      { step: 'switch-tab', duration: 1500 },
      { step: 'paste-links', duration: 3000 },
      { step: 'add-submodules', duration: 2000 },
      { step: 'submit', duration: 1200 },
      { step: 'processing', duration: 2000 },
      { step: 'time-passing', duration: 1500 },
      { step: 'email-received', duration: 2000 },
      { step: 'paste-to-ai', duration: 1800 },
      { step: 'ai-response', duration: 5000 },
      { step: 'success', duration: 2500 },
    ];

    let currentIndex = 0;
    let timeout: NodeJS.Timeout;

    const playNextStep = () => {
      if (currentIndex < stepSequence.length) {
        const { step, duration } = stepSequence[currentIndex];
        setCurrentStep(step);
        
        // Handle typing animation for modules
        if (step === 'type-modules') {
          setTypedNumber('');
          setTimeout(() => setTypedNumber('7'), 800);
          setTimeout(() => setModuleCount(7), 1200);
        }
        
        // Handle paste links animation
        if (step === 'paste-links') {
          setPastedLinks([]);
          [1, 2, 3, 4, 5, 6, 7].forEach((num, i) => {
            setTimeout(() => {
              setPastedLinks(prev => [...prev, num]);
            }, i * 400);
          });
        }
        
        currentIndex++;
        timeout = setTimeout(playNextStep, duration);
      } else {
        // Loop back
        currentIndex = 0;
        setCurrentStep('idle');
        setPastedLinks([]);
        setModuleCount(0);
        setTypedNumber('');
        setTimeout(playNextStep, 2000);
      }
    };

    playNextStep();

    return () => clearTimeout(timeout);
  }, [isPlaying]);

  // Start playing on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsPlaying(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="relative py-16 sm:py-20 px-4 sm:px-6 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-purple-500/5 via-cyan-500/5 to-transparent pointer-events-none" />
      
      <div className="max-w-[1000px] mx-auto relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#a3e635]/10 border border-[#a3e635]/20 mb-6">
            <Sparkles className="w-4 h-4 text-[#a3e635]" />
            <span className="text-sm text-[#a3e635] font-medium">See It In Action</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-[-0.02em] mb-4">
            <span className="text-white">Watch How </span>
            <span className="text-[#a3e635]">OneDuo</span>
            <span className="text-white"> Works: </span>
            <span className="text-cyan-400">For Courses</span>
          </h2>
        </motion.div>

        {/* Animation Container */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative"
        >
          {/* Main Animation Window */}
          <div className="rounded-3xl bg-[#0a0a0a] border border-white/10 overflow-hidden shadow-2xl shadow-[#a3e635]/5">
            {/* Window Header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.03] border-b border-white/5">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <div className="flex-1 text-center">
                <span className="text-xs text-white/40 font-mono">oneduo.app</span>
              </div>
            </div>

            {/* Animation Content */}
            <div className="relative h-[500px] md:h-[480px] overflow-hidden">
              <AnimatePresence mode="wait">
                {/* Idle / Add Video State */}
                {(currentStep === 'idle' || currentStep === 'add-video') && (
                  <motion.div
                    key="add-video"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center p-8"
                  >
                    <motion.button
                      animate={currentStep === 'add-video' ? { scale: [1, 0.95, 1] } : {}}
                      className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-semibold text-lg transition-all ${
                        currentStep === 'add-video' 
                          ? 'bg-[#a3e635] text-black shadow-[0_0_30px_rgba(163,230,53,0.4)]' 
                          : 'bg-white/10 text-white border border-white/20 hover:bg-white/20'
                      }`}
                    >
                      <Upload className="w-6 h-6" />
                      Add Video
                    </motion.button>
                    {currentStep === 'add-video' && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                      >
                        <div className="w-32 h-32 rounded-full border-4 border-[#a3e635]/50 animate-ping" />
                      </motion.div>
                    )}
                  </motion.div>
                )}

                {/* Is This A Course? Modal */}
                {(currentStep === 'is-course' || currentStep === 'course-yes') && (
                  <motion.div
                    key="is-course"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="absolute inset-0 flex items-center justify-center p-8"
                  >
                    <div className="bg-[#151515] rounded-2xl border border-white/10 p-8 max-w-md w-full">
                      <h3 className="text-xl font-bold text-white mb-6 text-center">
                        Is this a course?
                      </h3>
                      <div className="flex gap-4 justify-center">
                        <motion.button
                          animate={currentStep === 'course-yes' ? { 
                            scale: [1, 0.95, 1],
                            backgroundColor: ['rgb(34, 197, 94)', 'rgb(34, 197, 94)']
                          } : {}}
                          className={`flex items-center gap-2 px-8 py-3 rounded-xl font-semibold transition-all ${
                            currentStep === 'course-yes'
                              ? 'bg-green-500 text-white'
                              : 'bg-white/10 text-white hover:bg-white/20'
                          }`}
                        >
                          <Check className="w-5 h-5" />
                          Yes
                        </motion.button>
                        <button className="flex items-center gap-2 px-8 py-3 rounded-xl font-semibold bg-white/10 text-white/60">
                          <X className="w-5 h-5" />
                          No
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* How Many Modules? */}
                {(currentStep === 'how-many-modules' || currentStep === 'type-modules') && (
                  <motion.div
                    key="how-many"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="absolute inset-0 flex items-center justify-center p-8"
                  >
                    <div className="bg-[#151515] rounded-2xl border border-white/10 p-8 max-w-md w-full">
                      <h3 className="text-xl font-bold text-white mb-6 text-center">
                        How many modules?
                      </h3>
                      <div className="relative">
                        <input
                          type="text"
                          value={typedNumber}
                          readOnly
                          className="w-full px-6 py-4 rounded-xl bg-white/5 border border-white/20 text-white text-center text-3xl font-bold focus:outline-none focus:border-cyan-500"
                          placeholder="0"
                        />
                        {currentStep === 'type-modules' && typedNumber && (
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: 2 }}
                            className="absolute right-[55%] top-1/2 -translate-y-1/2 h-8 bg-cyan-400 animate-pulse"
                          />
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Show Modules Grid */}
                {(currentStep === 'show-modules' || currentStep === 'switch-tab' || currentStep === 'paste-links' || currentStep === 'add-submodules') && (
                  <motion.div
                    key="modules"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 p-6"
                  >
                    {/* Tab Switcher */}
                    {currentStep === 'switch-tab' && (
                      <motion.div
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="absolute top-4 right-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500/20 via-red-500/20 via-yellow-500/20 to-green-500/20 border border-white/20"
                      >
                        <div className="flex gap-1">
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          <div className="w-2 h-2 rounded-full bg-yellow-500" />
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                        </div>
                        <span className="text-xs text-white/60">Video Platform</span>
                      </motion.div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
                      {Array.from({ length: moduleCount }).map((_, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.1 }}
                          className={`relative p-4 rounded-xl border ${
                            pastedLinks.includes(i + 1)
                              ? 'bg-green-500/10 border-green-500/50'
                              : 'bg-white/5 border-white/10'
                          }`}
                        >
                          <div className="text-sm font-semibold text-white/80 mb-2">
                            Module {i + 1}
                          </div>
                          
                          {/* Link Input */}
                          <div className={`h-8 rounded-lg flex items-center px-2 text-xs ${
                            pastedLinks.includes(i + 1)
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-white/5 text-white/30'
                          }`}>
                            {pastedLinks.includes(i + 1) ? (
                              <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="truncate flex items-center gap-1"
                              >
                                <Link2 className="w-3 h-3" />
                                <span className="truncate">https://...</span>
                              </motion.span>
                            ) : (
                              'Paste link...'
                            )}
                          </div>

                          {/* Sub-module button */}
                          {currentStep === 'add-submodules' && i === 5 && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              className="mt-2 space-y-1"
                            >
                              <div className="flex items-center gap-1 text-xs text-purple-400">
                                <Plus className="w-3 h-3" />
                                <span>6a, 6b, 6c...</span>
                              </div>
                            </motion.div>
                          )}

                          {/* Pasting animation */}
                          {currentStep === 'paste-links' && pastedLinks[pastedLinks.length - 1] === i + 1 && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: [1, 1.2, 0] }}
                              transition={{ duration: 0.3 }}
                              className="absolute inset-0 rounded-xl border-2 border-cyan-400"
                            />
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Submit */}
                {currentStep === 'submit' && (
                  <motion.div
                    key="submit"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <motion.button
                      animate={{ scale: [1, 0.95, 1] }}
                      transition={{ duration: 0.3 }}
                      className="flex items-center gap-3 px-10 py-5 rounded-2xl bg-[#a3e635] text-black font-bold text-xl shadow-[0_0_40px_rgba(163,230,53,0.4)]"
                    >
                      Submit
                      <ArrowRight className="w-6 h-6" />
                    </motion.button>
                  </motion.div>
                )}

                {/* Processing */}
                {currentStep === 'processing' && (
                  <motion.div
                    key="processing"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center p-8"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", bounce: 0.5 }}
                      className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center mb-6"
                    >
                      <Check className="w-10 h-10 text-white" />
                    </motion.div>
                    <h3 className="text-xl font-bold text-white mb-2">Processing!</h3>
                    <p className="text-white/60 text-center max-w-sm">
                      You can close this tab. We'll email you once your OneDuo link is ready!
                    </p>
                  </motion.div>
                )}

                {/* Time Passing */}
                {currentStep === 'time-passing' && (
                  <motion.div
                    key="time"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center"
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="mb-6"
                    >
                      <Clock className="w-16 h-16 text-[#a3e635]" />
                    </motion.div>
                    <div className="flex items-center gap-3 text-white/60">
                      <Moon className="w-6 h-6 text-cyan-400" />
                      <span className="text-lg">A little later...</span>
                    </div>
                  </motion.div>
                )}

                {/* Email Received */}
                {currentStep === 'email-received' && (
                  <motion.div
                    key="email"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center p-6"
                  >
                    <div className="bg-[#151515] rounded-2xl border border-white/10 p-6 max-w-lg w-full">
                      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/10">
                        <div className="w-10 h-10 rounded-full bg-[#a3e635] flex items-center justify-center">
                          <Mail className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <div className="text-sm text-white font-medium">OneDuo</div>
                          <div className="text-xs text-white/40">Your PDF is ready! 🎉</div>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <p className="text-white/70">Your OneDuo PDF is ready to download:</p>
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.5 }}
                          className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gradient-to-r from-red-500/20 to-cyan-500/20 border border-cyan-500/30"
                        >
                          <div className="w-10 h-12 rounded bg-red-500/20 border border-red-500/30 flex flex-col items-center justify-center">
                            <FileText className="w-4 h-4 text-red-400" />
                            <span className="text-[6px] font-bold text-red-400">PDF</span>
                          </div>
                          <span className="text-cyan-400 text-sm font-mono truncate flex-1">
                            your-training.pdf
                          </span>
                          <Download className="w-4 h-4 text-cyan-400" />
                        </motion.div>
                        <p className="text-white/50 text-sm">
                          Upload this PDF to ChatGPT, Claude, Gemini, or any AI to start prompting with full visual context!
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Paste to AI */}
                {currentStep === 'paste-to-ai' && (
                  <motion.div
                    key="paste-ai"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center p-6"
                  >
                    <div className="bg-[#151515] rounded-2xl border border-white/10 p-6 max-w-lg w-full">
                      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/10">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center">
                          <MessageSquare className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-white font-medium">AI Chat</span>
                      </div>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="bg-white/5 rounded-lg p-4"
                      >
                        <p className="text-white/70 text-sm mb-2">You:</p>
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.3 }}
                          className="text-cyan-400 text-sm"
                        >
                          [Uploads your-training.pdf]
                          <br />
                          Help me create a summary of Module 3
                        </motion.p>
                      </motion.div>
                    </div>
                  </motion.div>
                )}

                {/* AI Response */}
                {currentStep === 'ai-response' && (
                  <motion.div
                    key="ai-response"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center p-6"
                  >
                    <div className="bg-[#151515] rounded-2xl border border-white/10 p-6 max-w-lg w-full">
                      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/10">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center">
                          <MessageSquare className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-white font-medium">AI Chat</span>
                      </div>
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-gradient-to-r from-purple-500/10 to-cyan-500/10 rounded-lg p-4 border border-purple-500/20"
                      >
                        <p className="text-white/70 text-sm mb-2">AI:</p>
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.3 }}
                          className="text-white"
                        >
                          <Sparkles className="w-4 h-4 inline text-amber-400 mr-1" />
                          Wow! I can SEE everything now! The diagrams, the screen recordings, the visual demos...
                        </motion.p>
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.8 }}
                          className="text-cyan-400 mt-2"
                        >
                          This feels like we can actually work together now! 🤝
                        </motion.p>
                      </motion.div>
                    </div>
                  </motion.div>
                )}

                {/* Success */}
                {currentStep === 'success' && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center p-6"
                  >
                    <div className="flex gap-8 items-center">
                      {/* Bank Account */}
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="text-center"
                      >
                        <div className="w-20 h-20 rounded-2xl bg-green-500/20 border border-green-500/30 flex items-center justify-center mb-3">
                          <motion.div
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
                          >
                            <DollarSign className="w-10 h-10 text-green-400" />
                          </motion.div>
                        </div>
                        <p className="text-green-400 font-semibold">Revenue Up</p>
                      </motion.div>

                      {/* Happy Team */}
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-center"
                      >
                        <div className="w-20 h-20 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center mb-3">
                          <motion.div
                            animate={{ y: [0, -4, 0] }}
                            transition={{ duration: 0.8, repeat: Infinity }}
                          >
                            <Users className="w-10 h-10 text-cyan-400" />
                          </motion.div>
                        </div>
                        <p className="text-cyan-400 font-semibold">Team Happy</p>
                      </motion.div>

                      {/* OneDuo Success */}
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="text-center"
                      >
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-r from-amber-500/20 to-purple-500/20 border border-purple-500/30 flex items-center justify-center mb-3">
                          <motion.div
                            animate={{ rotate: [0, 10, -10, 0] }}
                            transition={{ duration: 1, repeat: Infinity }}
                          >
                            <Sparkles className="w-10 h-10 text-purple-400" />
                          </motion.div>
                        </div>
                        <p className="text-purple-400 font-semibold">OneDuo!</p>
                      </motion.div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Step Description */}
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mt-6"
          >
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-white/70 text-sm">
                {stepDescriptions[currentStep]}
              </span>
            </div>
          </motion.div>

          {/* Replay Button */}
          <div className="text-center mt-4">
            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentStep('idle');
                setPastedLinks([]);
                setModuleCount(0);
                setTypedNumber('');
                setTimeout(() => setIsPlaying(true), 100);
              }}
              className="text-sm text-white/40 hover:text-white/60 transition-colors"
            >
              ↻ Replay Animation
            </button>
          </div>

          {/* Description Box */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="mt-10 p-6 md:p-8 rounded-2xl bg-gradient-to-br from-cyan-500/5 via-purple-500/5 to-amber-500/5 border border-white/10"
          >
            <p className="text-lg md:text-xl text-white/80 leading-relaxed text-center max-w-3xl mx-auto">
              <span className="text-white font-semibold">Upload your course once.</span>{' '}
              OneDuo processes every module, creating a single shareable pdf.{' '}
              <span className="text-cyan-400">ChatGPT, Claude, or your VA</span> can now see every lesson,
              every visual, every "click this button" moment.{' '}
              <span className="text-amber-400">No more 47 screenshots. No more re-explaining.</span>{' '}
              Just instant, informed answers.
            </p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
