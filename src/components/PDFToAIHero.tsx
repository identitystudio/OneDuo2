import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { Paperclip, Plus, Image, Play, FileText, Send } from "lucide-react";

// AI Platform configurations with their unique chat interface styles
const AI_CHATS = [
  {
    name: "ChatGPT",
    bgColor: "#343541",
    headerColor: "#202123",
    accentColor: "#10a37f",
    userBubble: "#2a2b32",
    aiBubble: "#444654",
    attachIcon: "paperclip",
    userMessage: "please watch this and tell me how to start the course and what to do next...",
    aiResponse: "open your sales funnel builder... click the red button to the right of the arrow... then say ok so i know you're there...",
    logo: "GPT"
  },
  {
    name: "Claude",
    bgColor: "#2d2a2e",
    headerColor: "#1f1d1f",
    accentColor: "#cc785c",
    userBubble: "#3d3a3e",
    aiBubble: "#262426",
    attachIcon: "plus",
    userMessage: "yay! can you tell me what to do step by step so i can know what my boss wants me to do please i dont have time to watch the whole 10 hour course thanks!",
    aiResponse: "wow i cant believe i can see video now",
    logo: "C"
  },
  {
    name: "Grok",
    bgColor: "#000000",
    headerColor: "#0a0a0a",
    accentColor: "#ffffff",
    userBubble: "#1a1a1a",
    aiBubble: "#0d0d0d",
    attachIcon: "image",
    userMessage: "can you watch this and tell me what i should prompt the code thanks",
    aiResponse: "analyzing your video course now... I can see everything!",
    logo: "𝕏"
  }
];

type Phase = "idle" | "clicking" | "attaching" | "transforming" | "typing" | "responding";

export const PDFToAIHero = () => {
  const [currentChat, setCurrentChat] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [typedUserText, setTypedUserText] = useState("");
  const [typedAIText, setTypedAIText] = useState("");
  const [isVideoMode, setIsVideoMode] = useState(false);
  const [videoStatus, setVideoStatus] = useState<'PLAYING' | 'SEEING' | 'NODDING'>('PLAYING');

  const chat = AI_CHATS[currentChat];

  // Typing animation
  const typeText = async (text: string, setter: (t: string) => void, speed = 30) => {
    setter("");
    for (let i = 0; i <= text.length; i++) {
      setter(text.slice(0, i));
      await delay(speed);
    }
  };

  // Animation cycle for one chat
  useEffect(() => {
    const runChatCycle = async () => {
      setPhase("idle");
      setTypedUserText("");
      setTypedAIText("");
      setIsVideoMode(false);
      setVideoStatus('PLAYING');
      await delay(500);

      // Click attachment button
      setPhase("clicking");
      await delay(600);

      // Show PDF attaching
      setPhase("attaching");
      await delay(800);

      // Transform PDF to video
      setPhase("transforming");
      await delay(400);
      setIsVideoMode(true);
      await delay(600);

      // Type user message
      setPhase("typing");
      await typeText(chat.userMessage, setTypedUserText, 25);
      await delay(300);

      // AI responds
      setPhase("responding");
      await typeText(chat.aiResponse, setTypedAIText, 40);
      await delay(3000); // Hold longer before switching platforms

      // Move to next chat
      setCurrentChat((prev) => (prev + 1) % AI_CHATS.length);
    };

    runChatCycle();
  }, [currentChat]);

  // Video status cycling effect
  useEffect(() => {
    if (!isVideoMode) return;
    
    const statuses: Array<'PLAYING' | 'SEEING' | 'NODDING'> = ['PLAYING', 'SEEING', 'NODDING'];
    let currentIndex = 0;
    
    const interval = setInterval(() => {
      currentIndex = (currentIndex + 1) % statuses.length;
      setVideoStatus(statuses[currentIndex]);
    }, 1500);
    
    return () => clearInterval(interval);
  }, [isVideoMode]);

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const AttachIcon = chat.attachIcon === "paperclip" ? Paperclip : chat.attachIcon === "plus" ? Plus : Image;

  return (
    <div className="relative w-full max-w-[420px] mx-auto">
      {/* Glow effect */}
      <div 
        className="absolute inset-0 blur-3xl scale-150 pointer-events-none opacity-30"
        style={{ background: `radial-gradient(circle, ${chat.accentColor}40, transparent)` }}
      />

      {/* Chat interface mockup */}
      <motion.div
        key={currentChat}
        initial={{ opacity: 0, rotateY: -90 }}
        animate={{ opacity: 1, rotateY: 0 }}
        exit={{ opacity: 0, rotateY: 90 }}
        transition={{ duration: 0.5 }}
        className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10"
        style={{ backgroundColor: chat.bgColor }}
      >
        {/* Header */}
        <div 
          className="px-4 py-3 flex items-center gap-3 border-b border-white/10"
          style={{ backgroundColor: chat.headerColor }}
        >
          <motion.div 
            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
            style={{ 
              backgroundColor: chat.accentColor,
              color: chat.name === "Grok" ? "#000" : "#fff"
            }}
          >
            {chat.logo}
          </motion.div>
          <span className="text-white font-medium">{chat.name}</span>
          <div className="ml-auto flex gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
          </div>
        </div>

        {/* Chat area */}
        <div className="p-4 min-h-[280px] flex flex-col gap-3">
          {/* AI's first response (after video attached) */}
          <AnimatePresence>
            {phase === "responding" && chat.name === "Claude" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-2"
              >
                <div 
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: chat.accentColor, color: "#fff" }}
                >
                  {chat.logo}
                </div>
                <div 
                  className="px-3 py-2 rounded-2xl rounded-tl-sm max-w-[80%] text-sm text-white/90"
                  style={{ backgroundColor: chat.aiBubble }}
                >
                  {typedAIText}
                  <motion.span
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                  >
                    |
                  </motion.span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* User message with attachment */}
          <AnimatePresence>
            {(phase === "attaching" || phase === "transforming" || phase === "typing" || phase === "responding") && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-2 ml-auto max-w-[85%]"
              >
                {/* Attached document - transforms into video player */}
                <motion.div
                  className="rounded-xl border-2 flex items-center gap-2 self-end overflow-hidden"
                  style={{ 
                    borderColor: "#a3e635",
                    backgroundColor: "rgba(163, 230, 53, 0.1)"
                  }}
                  animate={{
                    boxShadow: isVideoMode 
                      ? ["0 0 0px rgba(163, 230, 53, 0)", "0 0 25px rgba(163, 230, 53, 0.6)", "0 0 0px rgba(163, 230, 53, 0)"]
                      : "none"
                  }}
                  transition={{ duration: 1.5, repeat: isVideoMode ? Infinity : 0 }}
                >
                  <AnimatePresence mode="wait">
                    {isVideoMode ? (
                      // VIDEO PLAYER - showing the video is actually playing
                      <motion.div
                        key="video-player"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative w-[180px] h-[100px] bg-black rounded-lg overflow-hidden"
                      >
                        {/* Fake video frames - simulating video playback */}
                        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a2e] to-[#16213e]">
                          {/* Animated course content visualization */}
                          <motion.div
                            className="absolute inset-2 rounded bg-gradient-to-r from-[#a3e635]/20 to-[#22c55e]/20"
                            animate={{
                              opacity: [0.3, 0.6, 0.3],
                            }}
                            transition={{ duration: 2, repeat: Infinity }}
                          />
                          
                          {/* Simulated slides/content moving */}
                          <motion.div
                            className="absolute top-3 left-3 right-3 h-6 bg-white/10 rounded"
                            animate={{ x: [-5, 5, -5] }}
                            transition={{ duration: 3, repeat: Infinity }}
                          />
                          <motion.div
                            className="absolute top-11 left-3 w-16 h-3 bg-[#a3e635]/40 rounded"
                            animate={{ width: ["40%", "60%", "40%"] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          />
                          <motion.div
                            className="absolute top-16 left-3 right-6 h-2 bg-white/20 rounded"
                          />
                          
                          {/* Person/instructor silhouette */}
                          <motion.div
                            className="absolute bottom-2 right-3 w-10 h-12 rounded-full bg-gradient-to-t from-[#a3e635]/30 to-transparent"
                            animate={{ 
                              scale: [1, 1.05, 1],
                              opacity: [0.5, 0.8, 0.5]
                            }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                          />
                        </div>
                        
                        {/* Play indicator overlay */}
                        <motion.div 
                          className="absolute inset-0 flex items-center justify-center"
                          initial={{ opacity: 1 }}
                          animate={{ opacity: 0 }}
                          transition={{ delay: 0.5, duration: 0.3 }}
                        >
                          <motion.div
                            className="w-10 h-10 rounded-full bg-[#a3e635]/80 flex items-center justify-center"
                            animate={{ scale: [1, 1.2, 0] }}
                            transition={{ duration: 0.5 }}
                          >
                            <Play className="w-5 h-5 text-black fill-black ml-0.5" />
                          </motion.div>
                        </motion.div>
                        
                        {/* Video progress bar */}
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                          <motion.div
                            className="h-full bg-[#a3e635]"
                            initial={{ width: "0%" }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 8, ease: "linear" }}
                          />
                        </div>
                        
                        {/* Duration badge */}
                        <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/70 rounded text-[9px] text-white font-mono">
                          <motion.span
                            animate={{ opacity: [1, 0.5, 1] }}
                            transition={{ duration: 1, repeat: Infinity }}
                          >
                            ▶
                          </motion.span>
                          {" "}{videoStatus}
                        </div>
                        
                        {/* OneDuo watermark */}
                        <div className="absolute top-1 right-1 px-1 py-0.5 bg-[#a3e635]/20 rounded text-[8px] text-[#a3e635] font-bold">
                          OneDuo
                        </div>
                      </motion.div>
                    ) : (
                      // PDF STATE - document icon
                      <motion.div
                        key="pdf-doc"
                        exit={{ scale: 0.8, opacity: 0, rotateY: 90 }}
                        className="px-3 py-2 flex items-center gap-2"
                      >
                        <div className="w-8 h-8 rounded bg-[#a3e635]/20 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-[#a3e635]" />
                        </div>
                        <div>
                          <p className="text-white text-xs font-medium">
                            Modules 1-10.pdf
                          </p>
                          <p className="text-white/50 text-[10px]">
                            10 video modules
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* User message bubble */}
                {(phase === "typing" || phase === "responding") && typedUserText && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="px-3 py-2 rounded-2xl rounded-br-sm text-sm text-white self-end"
                    style={{ backgroundColor: chat.userBubble }}
                  >
                    {typedUserText}
                    {phase === "typing" && (
                      <motion.span
                        animate={{ opacity: [1, 0] }}
                        transition={{ duration: 0.5, repeat: Infinity }}
                        className="text-[#a3e635]"
                      >
                        |
                      </motion.span>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* AI response (for ChatGPT and Grok) */}
          <AnimatePresence>
            {phase === "responding" && chat.name !== "Claude" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-2"
              >
                <div 
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ 
                    backgroundColor: chat.accentColor,
                    color: chat.name === "Grok" ? "#000" : "#fff"
                  }}
                >
                  {chat.logo}
                </div>
                <div 
                  className="px-3 py-2 rounded-2xl rounded-tl-sm max-w-[80%] text-sm text-white/90"
                  style={{ backgroundColor: chat.aiBubble }}
                >
                  {typedAIText}
                  <motion.span
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                  >
                    |
                  </motion.span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input area */}
        <div 
          className="px-4 py-3 border-t border-white/10 flex items-center gap-3"
          style={{ backgroundColor: chat.headerColor }}
        >
          {/* Attachment button with click animation */}
          <motion.button
            className="w-9 h-9 rounded-full flex items-center justify-center border border-white/20"
            style={{ 
              backgroundColor: phase === "clicking" ? chat.accentColor : "transparent",
            }}
            animate={{
              scale: phase === "clicking" ? [1, 0.9, 1.1, 1] : 1,
              boxShadow: phase === "clicking" 
                ? `0 0 20px ${chat.accentColor}` 
                : "none"
            }}
            transition={{ duration: 0.3 }}
          >
            <AttachIcon 
              className="w-4 h-4" 
              style={{ color: phase === "clicking" ? (chat.name === "Grok" ? "#000" : "#fff") : "rgba(255,255,255,0.6)" }}
            />
          </motion.button>

          {/* Message input */}
          <div className="flex-1 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white/40 text-sm">
            {phase === "typing" ? (
              <span className="text-white/80">typing...</span>
            ) : (
              "Message..."
            )}
          </div>

          {/* Send button */}
          <motion.button
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ backgroundColor: chat.accentColor }}
            animate={{
              scale: phase === "typing" || phase === "responding" ? [1, 1.1, 1] : 1
            }}
            transition={{ duration: 0.5, repeat: phase === "typing" ? Infinity : 0 }}
          >
            <Send 
              className="w-4 h-4" 
              style={{ color: chat.name === "Grok" ? "#000" : "#fff" }}
            />
          </motion.button>
        </div>
      </motion.div>

      {/* Platform indicator dots */}
      <div className="flex justify-center gap-2 mt-4">
        {AI_CHATS.map((c, i) => (
          <motion.div
            key={c.name}
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: i === currentChat ? c.accentColor : "rgba(255,255,255,0.2)"
            }}
            animate={{
              scale: i === currentChat ? [1, 1.3, 1] : 1
            }}
            transition={{ duration: 0.5 }}
          />
        ))}
      </div>
    </div>
  );
};

export default PDFToAIHero;
