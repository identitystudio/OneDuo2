// FROZEN COPY - DO NOT MODIFY
// This is the original version preserved for the Case Study "Before" demo

import { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, Paperclip, Play, Send, Pause, Upload, Mail, Download, Check, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type AnimationPhase = 
  | 'uploadStart'     // Show OneDuo upload zone
  | 'uploadDrop'      // Video drops into upload
  | 'uploadProgress'  // Progress bar fills
  | 'uploadComplete'  // Checkmark, processing message
  | 'emailReceived'   // Email notification appears
  | 'emailOpen'       // Email opens showing download link
  | 'downloadClick'   // Click download button
  | 'pdfReady'        // PDF appears ready
  | 'showChatBox'     // Transition to AI chat
  | 'highlightPaperclip'
  | 'clickPaperclip'
  | 'fileInChat'
  | 'highlightSend'
  | 'clickSend'
  | 'videoLoading'
  | 'videoComplete'
  | 'aiResponse'
  | 'userReply'
  | 'aiResponse2';

const AI_LOGOS = [
  { name: 'ChatGPT', color: '#10a37f', letter: 'C' },
  { name: 'Claude', color: '#cc785c', letter: 'C' },
  { name: 'Grok', color: '#888888', letter: 'G' },
];

const PHASES_ORDER: AnimationPhase[] = [
  'uploadStart',
  'uploadDrop',
  'uploadProgress',
  'uploadComplete',
  'emailReceived',
  'emailOpen',
  'downloadClick',
  'pdfReady',
  'showChatBox',
  'highlightPaperclip',
  'clickPaperclip',
  'fileInChat',
  'highlightSend',
  'clickSend',
  'videoLoading',
  'videoComplete',
  'aiResponse',
  'userReply',
  'aiResponse2',
];

const PHASE_DELAYS: Record<AnimationPhase, number> = {
  'uploadStart': 1800,
  'uploadDrop': 1200,
  'uploadProgress': 1800,
  'uploadComplete': 1500,
  'emailReceived': 1500,
  'emailOpen': 1800,
  'downloadClick': 1200,
  'pdfReady': 1500,
  'showChatBox': 400,
  'highlightPaperclip': 1200,
  'clickPaperclip': 900,
  'fileInChat': 1200,
  'highlightSend': 900,
  'clickSend': 900,
  'videoLoading': 1200,
  'videoComplete': 900,
  'aiResponse': 2000,
  'userReply': 2200,
  'aiResponse2': 4000,
};

interface HeroProductDemoOriginalProps {
  autoPlay?: boolean;
}

export function HeroProductDemoOriginal({ autoPlay = false }: HeroProductDemoOriginalProps) {
  const [phase, setPhase] = useState<AnimationPhase>('uploadStart');
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isPaused, setIsPaused] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const speed = 1; // Normal speed
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isAnimationCompleteRef = useRef(false);
  const currentPhaseIndexRef = useRef(0);

  // Get delay (1x speed)
  const getDelay = useCallback((baseDelay: number) => {
    return baseDelay;
  }, []);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-play animation on mount if autoPlay is true
  useEffect(() => {
    if (autoPlay) {
      const advancePhase = () => {
        const currentIndex = currentPhaseIndexRef.current;
        const nextIndex = currentIndex + 1;
        
        if (nextIndex >= PHASES_ORDER.length) {
          currentPhaseIndexRef.current = 0;
          setPhase('uploadStart');
          timeoutRef.current = setTimeout(advancePhase, getDelay(PHASE_DELAYS['uploadStart']));
          return;
        }
        
        currentPhaseIndexRef.current = nextIndex;
        const nextPhase = PHASES_ORDER[nextIndex];
        setPhase(nextPhase);
        
        const delay = PHASE_DELAYS[nextPhase];
        timeoutRef.current = setTimeout(advancePhase, getDelay(delay > 0 ? delay : 100));
      };
      
      timeoutRef.current = setTimeout(advancePhase, getDelay(PHASE_DELAYS['uploadStart']));
      
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }
  }, [autoPlay, getDelay]);

  const clearTimeouts = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
  }, []);

  const advanceToNextPhase = useCallback(() => {
    if (isPaused) return;
    
    const currentIndex = currentPhaseIndexRef.current;
    const nextIndex = currentIndex + 1;
    
    if (nextIndex >= PHASES_ORDER.length) {
      currentPhaseIndexRef.current = 0;
      setPhase('uploadStart');
      timeoutRef.current = setTimeout(advanceToNextPhase, getDelay(PHASE_DELAYS['uploadStart']));
      return;
    }
    
    currentPhaseIndexRef.current = nextIndex;
    const nextPhase = PHASES_ORDER[nextIndex];
    setPhase(nextPhase);
    
    const delay = PHASE_DELAYS[nextPhase];
    if (delay > 0) {
      timeoutRef.current = setTimeout(advanceToNextPhase, getDelay(delay));
    } else {
      timeoutRef.current = setTimeout(advanceToNextPhase, getDelay(100));
    }
  }, [isPaused, getDelay]);

  const startAnimation = useCallback(() => {
    if (isPlaying && !isPaused) return;
    
    clearTimeouts();
    
    if (isPaused) {
      setIsPaused(false);
      setIsPlaying(true);
      const delay = PHASE_DELAYS[PHASES_ORDER[currentPhaseIndexRef.current]];
      timeoutRef.current = setTimeout(advanceToNextPhase, getDelay(delay > 0 ? delay : 500));
    } else {
      setPhase('uploadStart');
      currentPhaseIndexRef.current = 0;
      setIsPlaying(true);
      setIsPaused(false);
      isAnimationCompleteRef.current = false;
      timeoutRef.current = setTimeout(advanceToNextPhase, getDelay(PHASE_DELAYS['uploadStart']));
    }
  }, [isPlaying, isPaused, clearTimeouts, advanceToNextPhase, getDelay]);


  const pauseAnimation = useCallback(() => {
    if (!isPlaying || isPaused) return;
    clearTimeouts();
    setIsPaused(true);
  }, [isPlaying, isPaused, clearTimeouts]);

  // Desktop behavior: scroll/hover trigger
  useEffect(() => {
    if (isMobile) return;

    const handleScroll = () => {
      if (!containerRef.current || isPlaying) return;
      const rect = containerRef.current.getBoundingClientRect();
      const isVisible = rect.top < window.innerHeight * 0.8;
      
      if (isVisible && phase === 'uploadStart') {
        startAnimation();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobile, isPlaying, phase, startAnimation]);

  const handleTap = useCallback(() => {
    if (isMobile) {
      if (isPlaying && !isPaused) {
        pauseAnimation();
      } else {
        startAnimation();
      }
    } else {
      startAnimation();
    }
  }, [isMobile, isPlaying, isPaused, startAnimation, pauseAnimation]);

  useEffect(() => {
    return () => clearTimeouts();
  }, [clearTimeouts]);

  // Determine which component to show based on phase
  const isUploadPhase = ['uploadStart', 'uploadDrop', 'uploadProgress', 'uploadComplete'].includes(phase);
  const isEmailPhase = ['emailReceived', 'emailOpen', 'downloadClick', 'pdfReady'].includes(phase);
  const isChatPhase = !isUploadPhase && !isEmailPhase;

  // Current step for indicator (1 = Upload, 2 = Email, 3 = AI Chat)
  const currentStep = isUploadPhase ? 1 : isEmailPhase ? 2 : 3;

  const steps = [
    { num: 1, label: 'Upload' },
    { num: 2, label: 'Email' },
    { num: 3, label: 'AI Chat' },
  ];

  return (
    <div 
      ref={containerRef}
      className="w-full max-w-[480px] mx-auto select-none"
    >
      {/* Step Indicators */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {steps.map((step, i) => (
          <div key={step.num} className="flex items-center gap-1">
            <motion.div 
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                currentStep === step.num 
                  ? 'bg-emerald-500 text-black' 
                  : currentStep > step.num 
                    ? 'bg-emerald-500/30 text-emerald-400' 
                    : 'bg-white/10 text-white/40'
              }`}
              animate={currentStep === step.num ? { scale: [1, 1.1, 1] } : {}}
              transition={{ duration: 0.3 }}
            >
              {currentStep > step.num ? <Check className="w-3 h-3" /> : step.num}
            </motion.div>
            <span className={`text-xs hidden sm:inline ${currentStep === step.num ? 'text-white/90' : 'text-white/40'}`}>
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <div className={`w-4 h-px mx-1 ${currentStep > step.num ? 'bg-emerald-500/50' : 'bg-white/10'}`} />
            )}
          </div>
        ))}
      </div>

      <div 
        className="relative flex items-center justify-center min-h-[520px] cursor-pointer"
        onMouseEnter={!isMobile ? startAnimation : undefined}
        onClick={handleTap}
      >
        <AnimatePresence mode="wait">
          {/* Upload Phases */}
          {isUploadPhase && (
            <motion.div
              key="upload-phase"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <UploadPhase phase={phase} />
            </motion.div>
          )}

          {/* Email Phases */}
          {isEmailPhase && (
            <motion.div
              key="email-phase"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <EmailPhase phase={phase} />
            </motion.div>
          )}

          {/* Chat Phase */}
          {isChatPhase && (
            <motion.div
              key="chatbox"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="relative"
            >
              <ChatBox 
                showCircleHighlight={phase === 'highlightPaperclip'}
                showClickPaperclip={phase === 'clickPaperclip'}
                fileInChat={phase === 'fileInChat' || phase === 'highlightSend' || phase === 'clickSend'}
                showCircleSend={phase === 'highlightSend'}
                showClickSend={phase === 'clickSend'}
                showVideoPlaying={phase === 'videoLoading' || phase === 'videoComplete' || phase === 'aiResponse' || phase === 'userReply' || phase === 'aiResponse2'}
                videoComplete={phase === 'videoComplete' || phase === 'aiResponse' || phase === 'userReply' || phase === 'aiResponse2'}
                showAiResponse={phase === 'aiResponse' || phase === 'userReply' || phase === 'aiResponse2'}
                showUserReply={phase === 'userReply' || phase === 'aiResponse2'}
                showAiResponse2={phase === 'aiResponse2'}
              />
              {isMobile && isPaused && (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                    <Pause className="w-6 h-6 text-white" />
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Upload Phase Component
function UploadPhase({ phase }: { phase: AnimationPhase }) {
  const showDrop = phase === 'uploadDrop' || phase === 'uploadProgress' || phase === 'uploadComplete';
  const showProgress = phase === 'uploadProgress' || phase === 'uploadComplete';
  const showComplete = phase === 'uploadComplete';

  return (
    <div className="relative w-[360px]">
      {/* Background glow */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-64 h-64 rounded-full bg-emerald-500/15 blur-3xl" />
      </div>

      {/* Upload Card */}
      <div className="relative bg-gradient-to-br from-[#0d1f0d] to-[#0a1a0a] rounded-xl border border-emerald-500/30 p-6 shadow-[0_0_40px_rgba(16,185,129,0.15)]">
        {/* OneDuo Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 rounded bg-emerald-500/20 flex items-center justify-center">
            <span className="text-emerald-400 text-xs font-bold">O</span>
          </div>
          <span className="text-white/80 text-sm font-medium">OneDuo</span>
        </div>

        {/* Upload Zone */}
        <motion.div 
          className={`relative border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center min-h-[200px] transition-colors ${
            showDrop ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-white/20'
          }`}
          animate={phase === 'uploadStart' ? { 
            borderColor: ['rgba(255,255,255,0.2)', 'rgba(16,185,129,0.4)', 'rgba(255,255,255,0.2)']
          } : {}}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <AnimatePresence mode="wait">
            {!showDrop && (
              <motion.div
                key="dropzone"
                className="flex flex-col items-center gap-3"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <Upload className="w-10 h-10 text-white/40" />
                <p className="text-white/60 text-sm text-center">Drop your training video here</p>
                <p className="text-white/30 text-xs">.mp4, .mov, .webm</p>
              </motion.div>
            )}

            {showDrop && !showComplete && (
              <motion.div
                key="video-dropping"
                className="flex flex-col items-center gap-4"
                initial={{ opacity: 0, y: -40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                {/* Video file icon */}
                <motion.div 
                  className="w-16 h-16 bg-emerald-500/20 rounded-lg flex items-center justify-center border border-emerald-500/40"
                  animate={showProgress ? {} : { y: [0, -5, 0] }}
                  transition={{ duration: 0.5, repeat: showProgress ? 0 : Infinity }}
                >
                  <Video className="w-8 h-8 text-emerald-400" />
                </motion.div>
                <p className="text-emerald-400 text-sm font-medium">training-module.mp4</p>
                
                {/* Progress bar */}
                {showProgress && (
                  <div className="w-full max-w-[200px]">
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-emerald-500"
                        initial={{ width: '0%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 1.2, ease: 'easeOut' }}
                      />
                    </div>
                    <p className="text-white/40 text-xs text-center mt-2">Uploading...</p>
                  </div>
                )}
              </motion.div>
            )}

            {showComplete && (
              <motion.div
                key="complete"
                className="flex flex-col items-center gap-3"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                <motion.div 
                  className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center border-2 border-emerald-500"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 400 }}
                >
                  <Check className="w-7 h-7 text-emerald-400" />
                </motion.div>
                <p className="text-emerald-400 text-sm font-medium">Upload Complete!</p>
                <p className="text-white/50 text-xs text-center">Processing your video...<br />We'll email you when it's ready.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}

// Email Phase Component  
function EmailPhase({ phase }: { phase: AnimationPhase }) {
  const showOpen = phase === 'emailOpen' || phase === 'downloadClick' || phase === 'pdfReady';
  const showDownloadClick = phase === 'downloadClick' || phase === 'pdfReady';
  const showPdfReady = phase === 'pdfReady';

  return (
    <div className="relative w-[360px]">
      {/* Background glow */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-64 h-64 rounded-full bg-amber-500/15 blur-3xl" />
      </div>

      <AnimatePresence mode="wait">
        {!showOpen && (
          <motion.div
            key="email-notification"
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="relative bg-gradient-to-br from-[#1a1a0d] to-[#0f0f0a] rounded-xl border border-amber-500/30 p-5 shadow-[0_0_40px_rgba(245,158,11,0.15)]"
          >
            {/* Notification Header */}
            <div className="flex items-center gap-3 mb-3">
              <motion.div 
                className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <Mail className="w-5 h-5 text-amber-400" />
              </motion.div>
              <div>
                <p className="text-white/90 text-sm font-medium">New Email</p>
                <p className="text-white/50 text-xs">from OneDuo</p>
              </div>
            </div>
            <p className="text-amber-400 text-sm font-medium">Your OneDuo is ready! 🎉</p>
            <p className="text-white/50 text-xs mt-1">Tap to open</p>
          </motion.div>
        )}

        {showOpen && !showPdfReady && (
          <motion.div
            key="email-open"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="relative bg-gradient-to-br from-[#1a1a0d] to-[#0f0f0a] rounded-xl border border-amber-500/30 p-5 shadow-[0_0_40px_rgba(245,158,11,0.15)]"
          >
            {/* Email Header */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
              <div className="w-8 h-8 bg-emerald-500/20 rounded flex items-center justify-center">
                <span className="text-emerald-400 text-xs font-bold">O</span>
              </div>
              <div>
                <p className="text-white/80 text-sm font-medium">OneDuo</p>
                <p className="text-white/40 text-xs">noreply@oneduo.app</p>
              </div>
            </div>

            {/* Email Body */}
            <div className="space-y-3">
              <p className="text-white/90 text-sm">Hi there! 👋</p>
              <p className="text-white/70 text-sm leading-relaxed">
                Your AI-readable PDF is ready. Download it and upload to any AI for instant understanding.
              </p>
              
              {/* Download Button */}
              <motion.button
                className="w-full flex items-center justify-center gap-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-medium py-3 px-4 rounded-lg border border-emerald-500/40 transition-colors"
                animate={showDownloadClick ? { scale: [1, 0.95, 1] } : {}}
                transition={{ duration: 0.2 }}
              >
                <Download className="w-4 h-4" />
                Download Your OneDuo PDF
              </motion.button>

              {showDownloadClick && (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <motion.div
                    className="w-20 h-20 rounded-full border-2 border-emerald-500/50"
                    initial={{ scale: 0.5, opacity: 0.8 }}
                    animate={{ scale: 2, opacity: 0 }}
                    transition={{ duration: 0.6 }}
                  />
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {showPdfReady && (
          <motion.div
            key="pdf-ready"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="relative flex flex-col items-center"
          >
            {/* Glow */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-52 h-52 rounded-full bg-[#a3e635]/25 blur-2xl" />
            </div>
            
            {/* PDF */}
            <motion.div 
              className="relative w-48 h-64 bg-gradient-to-br from-[#0d1f0d] to-[#0a1a0a] rounded-lg border-2 border-[#a3e635]/40 shadow-[0_0_60px_rgba(163,230,53,0.3)]"
              initial={{ y: 20, rotate: -5 }}
              animate={{ y: 0, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200 }}
            >
              <div className="absolute top-0 right-0 w-10 h-10 bg-[#a3e635]/20 rounded-bl-lg border-l-2 border-b-2 border-[#a3e635]/40" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <FileText className="w-14 h-14 text-[#a3e635]" strokeWidth={1.5} />
                <span className="text-[#a3e635] text-sm font-bold tracking-widest">PDF</span>
              </div>
              <div className="absolute bottom-4 left-0 right-0 text-center">
                <span className="text-[#a3e635]/60 text-xs font-medium">OneDuo</span>
              </div>
            </motion.div>
            
            <motion.p 
              className="text-white/60 text-sm mt-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Ready to upload to any AI →
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChatBox({ 
  showCircleHighlight = false,
  showClickPaperclip = false,
  fileInChat = false,
  showCircleSend = false,
  showClickSend = false,
  showVideoPlaying = false,
  videoComplete = false,
  showAiResponse = false,
  showUserReply = false,
  showAiResponse2 = false,
}: { 
  showCircleHighlight?: boolean;
  showClickPaperclip?: boolean;
  fileInChat?: boolean;
  showCircleSend?: boolean;
  showClickSend?: boolean;
  showVideoPlaying?: boolean;
  videoComplete?: boolean;
  showAiResponse?: boolean;
  showUserReply?: boolean;
  showAiResponse2?: boolean;
}) {
  const FIXED_HEIGHT = 520;
  
  return (
    <div className="relative">
      {/* Glow */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-72 h-72 rounded-full bg-[#a3e635]/10 blur-3xl" />
      </div>

      {/* Chat Container */}
      <motion.div 
        className="relative w-[360px] bg-gradient-to-br from-[#0d1f0d] to-[#0a1a0a] rounded-xl border border-[#a3e635]/30 shadow-[0_0_40px_rgba(163,230,53,0.15)] overflow-visible"
        style={{ height: FIXED_HEIGHT }}
      >
        {/* AI Logos Row */}
        <motion.div 
          className="flex items-center justify-center gap-6 py-4 border-b border-[#a3e635]/20"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {AI_LOGOS.map((logo, i) => (
            <motion.div
              key={logo.name}
              className="flex items-center gap-2"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1, duration: 0.2 }}
            >
              <div 
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold border border-white/20"
                style={{ backgroundColor: logo.color + '25', color: logo.color }}
              >
                {logo.letter}
              </div>
              <span className="text-sm text-white/70">{logo.name}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Chat Area */}
        <div className="p-4 pb-20 min-h-[100px] flex flex-col gap-3 relative overflow-hidden">
          <AnimatePresence mode="sync">
            {/* Video Player */}
            {showVideoPlaying && (
              <motion.div
                key="video-player"
                className="flex justify-end"
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                <div className="relative w-44 h-28 bg-gradient-to-br from-[#0a1a0a] to-[#0d1f0d] rounded-lg border border-[#a3e635]/40 overflow-hidden">
                  <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-[#a3e635]/20 rounded text-[8px] text-[#a3e635] font-medium">
                    OneDuo
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      className="w-10 h-10 rounded-full bg-[#a3e635]/20 border-2 border-[#a3e635]/50 flex items-center justify-center"
                      animate={!videoComplete ? { 
                        boxShadow: ['0 0 0 0 rgba(163,230,53,0.3)', '0 0 0 12px rgba(163,230,53,0)', '0 0 0 0 rgba(163,230,53,0.3)']
                      } : {}}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <Play className="w-4 h-4 text-[#a3e635] ml-0.5" fill="currentColor" />
                    </motion.div>
                  </div>
                  <motion.div
                    className="absolute bottom-6 left-1.5 flex items-center gap-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <Play className="w-2.5 h-2.5 text-[#a3e635]" fill="currentColor" />
                    <span className="text-[#a3e635] text-[8px] font-medium tracking-wide">
                      {videoComplete ? 'SEEN AND UNDERSTOOD' : 'SEEING'}
                    </span>
                  </motion.div>
                  <div className="absolute bottom-1.5 left-1.5 right-1.5">
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-[#a3e635]"
                        initial={{ width: '0%' }}
                        animate={{ width: videoComplete ? '100%' : '0%' }}
                        transition={{ duration: 1.2, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* AI Response Message */}
            {showAiResponse && (
              <motion.div
                key="ai-response"
                className="flex justify-start"
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10 max-w-[90%]">
                  <p className="text-white/90 text-xs leading-relaxed">
                    <span className="text-cyan-400 font-medium">AI:</span> I can't believe I can understand video and watch like a human now.
                  </p>
                </div>
              </motion.div>
            )}

            {/* User Reply Message */}
            {showUserReply && (
              <motion.div
                key="user-reply"
                className="flex justify-end"
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                <div className="px-3 py-2 bg-[#a3e635]/10 rounded-lg border border-[#a3e635]/30 max-w-[90%]">
                  <p className="text-[#a3e635] text-xs leading-relaxed">
                    <span className="font-medium">VA:</span> Where do I start building the voice bot?<br />Guide me step by step.
                  </p>
                </div>
              </motion.div>
            )}

            {/* AI Response 2 Message */}
            {showAiResponse2 && (
              <motion.div
                key="ai-response-2"
                className="flex justify-start"
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10 max-w-[95%]">
                  <p className="text-white/90 text-[11px] leading-relaxed">
                    <span className="text-cyan-400 font-medium">AI:</span> Start with the intent, not the tool.
                    <br /><br />
                    <span className="text-white/50">At 12:47, she explains why the voice bot comes before automations — it handles objections before routing.</span>
                    <br /><br />
                    <span className="text-[#a3e635]">Tell me when you're there.</span>
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input Bar */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-[#a3e635]/20 bg-[#0a1a0a] px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Paperclip */}
            <div className="relative">
              {showCircleHighlight && (
                <motion.div
                  className="absolute -inset-3 rounded-full border-2 border-[#a3e635]"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: [0, 1, 1, 0.8], scale: [0.5, 1.2, 1.1, 1.15] }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              )}
              {showClickPaperclip && (
                <motion.div
                  className="absolute -inset-2 rounded-full bg-[#a3e635]/30"
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 2, opacity: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              )}
              <motion.div
                animate={showClickPaperclip ? { scale: [1, 0.8, 1] } : {}}
                transition={{ duration: 0.2 }}
              >
                <Paperclip className={`w-5 h-5 ${showCircleHighlight || showClickPaperclip ? 'text-[#a3e635]' : 'text-white/40'}`} />
              </motion.div>
            </div>
            
            {/* Input field */}
            <div className="flex-1 h-8 bg-white/5 rounded-lg flex items-center px-2 overflow-hidden">
              <AnimatePresence>
                {fileInChat && !showVideoPlaying && (
                  <motion.div
                    key="input-file-chip"
                    className="flex items-center gap-1.5 px-2 py-1 bg-[#a3e635]/10 rounded border border-[#a3e635]/30"
                    initial={{ opacity: 0, x: -20, scale: 0.8 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -30, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  >
                    <FileText className="w-3 h-3 text-[#a3e635]" />
                    <span className="text-[#a3e635] text-[10px] font-medium">module1.oneduo.pdf</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {/* Send button */}
            <div className="relative">
              {showCircleSend && (
                <motion.div
                  className="absolute -inset-2 rounded-full border-2 border-[#a3e635]"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: [0, 1, 1, 0.8], scale: [0.5, 1.2, 1.1, 1.15] }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              )}
              {showClickSend && (
                <motion.div
                  className="absolute -inset-2 rounded-full bg-[#a3e635]/30"
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 2.5, opacity: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              )}
              <motion.div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${showCircleSend || showClickSend ? 'bg-[#a3e635]/20' : 'bg-white/10'}`}
                animate={showClickSend ? { scale: [1, 0.75, 1] } : {}}
                transition={{ duration: 0.2 }}
              >
                <Send className={`w-4 h-4 ${showCircleSend || showClickSend ? 'text-[#a3e635]' : 'text-white/40'}`} />
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
