import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Loader2, Sparkles, AlertTriangle, CheckCircle, HelpCircle, Zap, RotateCcw, BookOpen, Upload, ArrowRight, Share2, Video, Download, Clock, MousePointer2, Eye, Copy, Mail, Settings, FileText, Users, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface NeduAction {
  id: string;
  label: string;
  description: string;
  actionType: 'fix_stall' | 'retry_course' | 'retry_module' | 'check_status' | 'contact_support' | 'tell_more' | 'confirm_done';
  courseId?: string;
  moduleId?: string;
  topic?: string;
}

interface StepProgress {
  current: number;
  total: number;
}

interface VisualHint {
  type: 'click' | 'look' | 'copy' | 'wait' | 'success';
  icon: React.ReactNode;
  location?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: NeduAction[];
  stepProgress?: StepProgress;
  visualHint?: VisualHint;
  timestamp: Date;
}

interface QuickAction {
  icon: React.ReactNode;
  label: string;
  message: string;
}

// Visual aid component for inline step illustrations
const VisualStepGuide = ({ type, location }: { type: string; location?: string }) => {
  const iconMap: Record<string, { icon: React.ReactNode; bg: string; label: string }> = {
    'share': { icon: <Share2 className="w-5 h-5" />, bg: 'from-cyan-500 to-cyan-600', label: 'Share' },
    'upload': { icon: <Upload className="w-5 h-5" />, bg: 'from-emerald-500 to-emerald-600', label: 'Upload' },
    'download': { icon: <Download className="w-5 h-5" />, bg: 'from-purple-500 to-purple-600', label: 'Download' },
    'wait': { icon: <Clock className="w-5 h-5" />, bg: 'from-amber-500 to-amber-600', label: 'Wait' },
    'click': { icon: <MousePointer2 className="w-5 h-5" />, bg: 'from-pink-500 to-pink-600', label: 'Click' },
    'view': { icon: <Eye className="w-5 h-5" />, bg: 'from-blue-500 to-blue-600', label: 'View' },
    'copy': { icon: <Copy className="w-5 h-5" />, bg: 'from-violet-500 to-violet-600', label: 'Copy' },
    'email': { icon: <Mail className="w-5 h-5" />, bg: 'from-rose-500 to-rose-600', label: 'Email' },
    'settings': { icon: <Settings className="w-5 h-5" />, bg: 'from-slate-500 to-slate-600', label: 'Settings' },
  };

  const visual = iconMap[type] || iconMap['click'];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="inline-flex items-center gap-2 my-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10"
    >
      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${visual.bg} flex items-center justify-center text-white shadow-lg`}>
        {visual.icon}
      </div>
      <div className="flex flex-col">
        <span className="text-xs font-medium text-white/80">{visual.label}</span>
        {location && <span className="text-[10px] text-white/50">{location}</span>}
      </div>
      <ArrowRight className="w-4 h-4 text-white/30 ml-1" />
    </motion.div>
  );
};

// Mini diagram for showing UI locations
const MiniDiagram = ({ type }: { type: 'dashboard' | 'course-row' | 'upload-page' }) => {
  if (type === 'dashboard') {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="my-3 p-3 rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10"
      >
        <div className="text-[10px] text-white/40 mb-2 font-medium">📍 Dashboard View</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/5 border border-dashed border-cyan-500/50">
            <Video className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs text-white/70">Your Course</span>
            <div className="ml-auto flex items-center gap-1">
              <div className="w-6 h-5 rounded bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center animate-pulse">
                <Share2 className="w-3 h-3 text-cyan-400" />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1 text-[10px] text-cyan-400">
          <MousePointer2 className="w-3 h-3" />
          Click the Share button here
        </div>
      </motion.div>
    );
  }

  if (type === 'upload-page') {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="my-3 p-3 rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10"
      >
        <div className="text-[10px] text-white/40 mb-2 font-medium">📍 Upload Page</div>
        <div className="flex flex-col items-center gap-2 py-3 rounded-lg bg-white/5 border-2 border-dashed border-white/20">
          <Upload className="w-6 h-6 text-cyan-400" />
          <span className="text-xs text-white/60">Drop video here</span>
        </div>
        <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-400">
          <FileText className="w-3 h-3" />
          Supports MP4, MOV, WEBM
        </div>
      </motion.div>
    );
  }

  return null;
};

// Parse message content and inject visual aids
const parseMessageWithVisuals = (content: string): { text: string; visuals: Array<{ type: string; location?: string; diagram?: string }> } => {
  const visuals: Array<{ type: string; location?: string; diagram?: string }> = [];
  
  // Detect sharing instructions
  if (content.toLowerCase().includes('share') && content.toLowerCase().includes('button')) {
    visuals.push({ type: 'share', location: 'Next to your course', diagram: 'dashboard' });
  }
  
  // Detect upload instructions
  if (content.toLowerCase().includes('upload') && (content.toLowerCase().includes('video') || content.toLowerCase().includes('drag'))) {
    visuals.push({ type: 'upload', location: 'Upload page', diagram: 'upload-page' });
  }
  
  // Detect download instructions
  if (content.toLowerCase().includes('download') && content.toLowerCase().includes('pdf')) {
    visuals.push({ type: 'download', location: 'After processing completes' });
  }
  
  // Detect waiting/processing
  if (content.toLowerCase().includes('processing') || content.toLowerCase().includes('wait') || content.toLowerCase().includes('takes')) {
    visuals.push({ type: 'wait' });
  }
  
  // Detect email mentions
  if (content.toLowerCase().includes('email') && content.toLowerCase().includes('send')) {
    visuals.push({ type: 'email' });
  }
  
  // Detect copy/link actions
  if (content.toLowerCase().includes('copy') && content.toLowerCase().includes('link')) {
    visuals.push({ type: 'copy', location: 'Copy the share link' });
  }

  return { text: content, visuals };
};

interface NeduChatProps {
  email: string;
  onActionComplete?: () => void;
  stalledCount?: number;
  currentProgress?: number;
}

export function NeduChat({ email, onActionComplete, stalledCount = 0, currentProgress }: NeduChatProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const [hasShownProgressTip, setHasShownProgressTip] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const quickActions: QuickAction[] = [
    { icon: <Zap className="w-3.5 h-3.5" />, label: "Fix stuck video", message: "My video seems stuck. Can you help?" },
    { icon: <HelpCircle className="w-3.5 h-3.5" />, label: "How does this work?", message: "How does OneDuo work?" },
    { icon: <Upload className="w-3.5 h-3.5" />, label: "Upload help", message: "How do I upload a video?" },
    { icon: <BookOpen className="w-3.5 h-3.5" />, label: "Share with VA", message: "How do I share with my VA?" },
  ];

  // Extended prompt examples shown in a scrollable section
  const promptExamples = [
    "What can I ask you about my OneDuo?",
    "Why is my video taking so long?",
    "Can I upload multiple videos at once?",
    "What file formats are supported?",
    "How do I give feedback on my OneDuo?",
    "What does 'executable memory' mean?",
    "How do I delete a processed video?",
    "Can my VA edit the OneDuo after I share it?",
  ];

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Add welcome message when first opened
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const greetings = [
        "Hey there! 👋",
        "Hi! Good to see you!",
        "Hello! Ready to help!",
      ];
      const greeting = greetings[Math.floor(Math.random() * greetings.length)];
      
      const welcomeMessage = stalledCount > 0
        ? `${greeting} I noticed ${stalledCount === 1 ? 'a video' : `${stalledCount} videos`} might need attention. Want me to fix ${stalledCount === 1 ? 'it' : 'them'}?`
        : `${greeting} I'm Nedu, your OneDuo assistant. How can I help today?`;
      
      setMessages([{
        id: crypto.randomUUID(),
        role: 'assistant',
        content: welcomeMessage,
        actions: stalledCount > 0 ? [{
          id: crypto.randomUUID(),
          label: 'Fix now',
          description: 'Check and fix any stalled videos',
          actionType: 'fix_stall',
        }] : undefined,
        timestamp: new Date(),
      }]);
    }
  }, [isOpen, stalledCount]);

  // Proactive tip when progress is around 27-35%
  useEffect(() => {
    if (
      currentProgress !== undefined &&
      currentProgress >= 27 &&
      currentProgress <= 35 &&
      !hasShownProgressTip &&
      !isOpen
    ) {
      setHasShownProgressTip(true);
      setIsOpen(true);
      setMessages([{
        id: crypto.randomUUID(),
        role: 'assistant',
        content: "Quick heads up! 🎬 If progress looks stuck around 30%, that's totally normal — frame extraction takes a bit for longer videos. You're all good!",
        timestamp: new Date(),
      }]);
    }
  }, [currentProgress, hasShownProgressTip, isOpen]);

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    setShowQuickActions(false);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error } = await supabase.functions.invoke('nedu-chat', {
        body: {
          message: messageText,
          email,
          conversationHistory,
        },
      });

      if (error) throw error;

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.message || "I'm having a moment. Try asking again!",
        actions: data.actions,
        stepProgress: data.stepProgress,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Nedu chat error:', err);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: "Oops! Hit a small snag. Try again in a sec!",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const executeAction = async (action: NeduAction) => {
    setExecutingAction(action.id);

    try {
      switch (action.actionType) {
        case 'tell_more':
          await sendMessage(`Tell me more about ${action.topic || 'that'}`);
          break;

        case 'confirm_done':
          await sendMessage("Ok, I did that. What's next?");
          break;

        case 'fix_stall':
        case 'check_status':
          await supabase.functions.invoke('process-course', {
            body: { action: 'watchdog' },
          });
          
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: "✨ Done! Gave everything a nudge. Refresh the page to see the latest status.",
            timestamp: new Date(),
          }]);
          
          toast.success('Processing restarted!');
          onActionComplete?.();
          break;

        case 'retry_course':
          if (!action.courseId) {
            toast.error("Need to know which video — try Smart Fix on dashboard.");
            break;
          }

          await supabase.functions.invoke('process-course', {
            body: { action: 'retry', courseId: action.courseId },
          });

          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: "🔄 Restarting that video now! Progress will reset to 0% — totally normal.",
            timestamp: new Date(),
          }]);

          toast.success('Video processing restarted!');
          onActionComplete?.();
          break;

        case 'retry_module':
          if (!action.moduleId) {
            toast.error("Need to know which chapter — try Smart Fix on dashboard.");
            break;
          }

          await supabase.functions.invoke('process-course', {
            body: { action: 'retry-module', moduleId: action.moduleId },
          });

          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: "🔄 Restarting that chapter! Other completed chapters are safe.",
            timestamp: new Date(),
          }]);

          toast.success('Chapter processing restarted!');
          onActionComplete?.();
          break;

        case 'contact_support':
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: "📧 Email support@oneduo.ai — Mikhaela will take care of you!",
            timestamp: new Date(),
          }]);
          break;
      }
    } catch (err) {
      console.error('Action failed:', err);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: "Hmm, that didn't work. Try again or email support@oneduo.ai",
        timestamp: new Date(),
      }]);
    } finally {
      setExecutingAction(null);
    }
  };

  const handleQuickAction = (action: QuickAction) => {
    sendMessage(action.message);
  };

  return (
    <>
      {/* Floating button */}
      <motion.button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-3 rounded-full shadow-2xl transition-all ${
          stalledCount > 0 
            ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black shadow-amber-500/30' 
            : 'bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white shadow-cyan-500/30'
        }`}
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: isOpen ? 0 : 1, y: isOpen ? 20 : 0 }}
        style={{ display: isOpen ? 'none' : 'flex' }}
      >
        {stalledCount > 0 ? (
          <>
            <AlertTriangle className="w-5 h-5" />
            <span className="font-semibold">Need help?</span>
            <span className="bg-black/20 px-2 py-0.5 rounded-full text-xs font-bold">{stalledCount}</span>
          </>
        ) : (
          <>
            <div className="relative">
              <Sparkles className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            </div>
            <span className="font-semibold">Ask Nedu</span>
          </>
        )}
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[400px] max-w-[calc(100vw-2rem)] bg-gradient-to-b from-[#0a0a0a] to-black backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col"
            style={{ maxHeight: 'min(650px, calc(100vh - 5rem))' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-gradient-to-r from-cyan-500/10 via-cyan-500/5 to-transparent">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-cyan-400 via-cyan-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#0a0a0a]" />
                </div>
                <div>
                  <h3 className="font-semibold text-white flex items-center gap-1.5">
                    Nedu
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">AI</span>
                  </h3>
                  <p className="text-xs text-white/50">Always here to help</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/help')}
                  className="text-white/40 hover:text-white hover:bg-white/10 text-xs"
                >
                  <BookOpen className="w-3.5 h-3.5 mr-1" />
                  FAQs
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(false)}
                  className="text-white/60 hover:text-white hover:bg-white/10 h-8 w-8"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => {
                // Parse visuals for assistant messages
                const { visuals } = message.role === 'assistant' 
                  ? parseMessageWithVisuals(message.content) 
                  : { visuals: [] };

                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        message.role === 'user'
                          ? 'bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-br-md shadow-lg shadow-cyan-500/20'
                          : 'bg-white/[0.08] text-white rounded-bl-md border border-white/[0.05]'
                      }`}
                    >
                      {/* Step progress indicator */}
                      {message.stepProgress && (
                        <div className="mb-2.5 flex items-center gap-2">
                          <div className="flex gap-1">
                            {Array.from({ length: message.stepProgress.total }).map((_, i) => (
                              <div
                                key={i}
                                className={`w-2 h-2 rounded-full transition-all ${
                                  i < message.stepProgress!.current
                                    ? 'bg-cyan-400 scale-110'
                                    : 'bg-white/20'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-white/50">
                            Step {message.stepProgress.current}/{message.stepProgress.total}
                          </span>
                        </div>
                      )}
                      
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                      
                      {/* Visual aids for visual learners */}
                      {message.role === 'assistant' && visuals.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {/* Show visual step guides */}
                          {visuals.map((visual, i) => (
                            <div key={i}>
                              <VisualStepGuide type={visual.type} location={visual.location} />
                              {visual.diagram === 'dashboard' && <MiniDiagram type="dashboard" />}
                              {visual.diagram === 'upload-page' && <MiniDiagram type="upload-page" />}
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Action buttons */}
                      {message.actions && message.actions.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {message.actions.map((action) => (
                            <button
                              key={action.id}
                              onClick={() => executeAction(action)}
                              disabled={executingAction === action.id}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 disabled:from-cyan-500/50 disabled:to-cyan-600/50 text-white rounded-xl font-medium text-sm transition-all shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30"
                            >
                              {executingAction === action.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Working...
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="w-4 h-4" />
                                  {action.label}
                                </>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
              
              {/* Typing indicator */}
              {isLoading && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="bg-white/[0.08] rounded-2xl rounded-bl-md px-4 py-3 border border-white/[0.05]">
                    <div className="flex items-center gap-1.5">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-xs text-white/50 ml-2">Nedu is thinking...</span>
                    </div>
                  </div>
                </motion.div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Quick action chips */}
            {showQuickActions && messages.length <= 1 && !isLoading && (
              <div className="px-4 pb-2 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {quickActions.map((action, i) => (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.1 + i * 0.05 }}
                      onClick={() => handleQuickAction(action)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs font-medium hover:bg-white/10 hover:text-white hover:border-white/20 transition-all"
                    >
                      {action.icon}
                      {action.label}
                    </motion.button>
                  ))}
                </div>
                
                {/* More prompt examples */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="space-y-2"
                >
                  <p className="text-xs text-white/40 px-1">Or try asking:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {promptExamples.map((example, i) => (
                      <motion.button
                        key={i}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 + i * 0.03 }}
                        onClick={() => {
                          setInput(example);
                          inputRef.current?.focus();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/5 text-white/50 text-[11px] hover:bg-white/[0.06] hover:text-white/70 hover:border-white/10 transition-all"
                      >
                        "{example}"
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-white/10 bg-black/30">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage(input);
                }}
                className="flex gap-2"
              >
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask me anything..."
                  disabled={isLoading}
                  className="flex-1 bg-white/[0.06] border-white/10 text-white placeholder:text-white/40 focus:border-cyan-500/50 focus:ring-cyan-500/20 h-11"
                />
                <Button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white h-11 px-4 shadow-lg shadow-cyan-500/20"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
