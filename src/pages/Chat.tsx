import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { 
  ArrowLeft, 
  Send, 
  Loader2, 
  Clock, 
  Search, 
  X, 
  ChevronRight, 
  ChevronDown,
  ListChecks,
  Sparkles,
  BookOpen,
  Hammer,
  Zap,
  Share2,
  Copy,
  Check
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  frames?: { frameUrl: string; timestamp: number; frameIndex: number }[];
  isLoading?: boolean;
  created_at?: string;
}

interface Course {
  id: string;
  title: string;
  status: string;
  video_duration_seconds?: number;
  total_frames?: number;
  modules?: Module[];
  transcript?: { start: number; end: number; text: string }[];
}

interface Module {
  index: number;
  title: string;
  startTime: number;
  endTime: number;
  keyTopics?: { timestamp: number; topic: string }[];
}

interface ProgressStep {
  id: string;
  step_number: number;
  step_title: string;
  step_description?: string;
  module_index?: number;
  completed: boolean;
  completed_at?: string;
  notes?: string;
}

export default function Chat() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // New states for enhanced features
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [progress, setProgress] = useState<ProgressStep[]>([]);
  const [showProgress, setShowProgress] = useState(false);
  const [showModules, setShowModules] = useState(false);
  const [expandedModule, setExpandedModule] = useState<number | null>(null);

  // Build Mode states
  const [buildMode, setBuildMode] = useState(false);
  const [platform, setPlatform] = useState<'lovable' | 'clickfunnels' | null>(null);
  const [showPlatformPicker, setShowPlatformPicker] = useState(false);
  const [shareUrlCopied, setShareUrlCopied] = useState(false);

  useEffect(() => {
    if (courseId) {
      loadCourseDetails();
      loadMessages();
    }
  }, [courseId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadCourseDetails = async () => {
    try {
      // Get basic course info first
      const { data: statusData, error: statusError } = await supabase.functions.invoke('process-course', {
        body: { action: 'get-status', courseId },
      });

      if (statusError) throw statusError;
      
      if (statusData.status !== 'completed') {
        toast.error('Course is still processing');
        navigate('/dashboard');
        return;
      }

      // Get full course details with modules and progress
      const { data: detailsData, error: detailsError } = await supabase.functions.invoke('course-search', {
        body: { action: 'get-course-details', courseId },
      });

      if (detailsError) throw detailsError;

      setCourse(detailsData.course);
      setProgress(detailsData.progress || []);

      // Generate modules if they don't exist
      if (!detailsData.course.modules || detailsData.course.modules.length === 0) {
        const { data: moduleData } = await supabase.functions.invoke('course-search', {
          body: { action: 'generate-modules', courseId },
        });
        if (moduleData?.modules) {
          setCourse(prev => prev ? { ...prev, modules: moduleData.modules } : null);
        }
        if (moduleData?.progressSteps) {
          // Reload progress after generation
          const { data: refreshData } = await supabase.functions.invoke('course-search', {
            body: { action: 'get-course-details', courseId },
          });
          if (refreshData?.progress) {
            setProgress(refreshData.progress);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load course:', err);
      toast.error('Failed to load course');
      navigate('/dashboard');
    }
  };

  const loadMessages = async () => {
    setIsFetching(true);
    try {
      const { data, error } = await supabase
        .from('course_chats')
        .select('*')
        .eq('course_id', courseId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setMessages(
        (data || []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          frames: m.frame_references || [],
          created_at: m.created_at,
        }))
      );
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setIsFetching(false);
    }
  };

  const searchMessages = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('course-search', {
        body: { action: 'search', courseId, query: searchQuery },
      });

      if (error) throw error;
      setSearchResults(data.results || []);
    } catch (err) {
      console.error('Search failed:', err);
      toast.error('Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const toggleProgress = async (stepNumber: number, completed: boolean) => {
    try {
      const { error } = await supabase.functions.invoke('course-search', {
        body: { action: 'update-progress', courseId, stepNumber, completed },
      });

      if (error) throw error;

      setProgress(prev => 
        prev.map(p => 
          p.step_number === stepNumber 
            ? { ...p, completed, completed_at: completed ? new Date().toISOString() : undefined }
            : p
        )
      );
    } catch (err) {
      console.error('Failed to update progress:', err);
      toast.error('Failed to update progress');
    }
  };

  const sendMessage = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    };

    const loadingMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMessage, loadingMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('course-chat', {
        body: {
          courseId,
          message: text,
          buildMode,
          platform: platform,
        },
      });

      if (error) throw error;

      setMessages((prev) =>
        prev.map((m) =>
          m.isLoading
            ? {
                id: crypto.randomUUID(),
                role: 'assistant' as const,
                content: data.message,
                frames: data.frames || [],
              }
            : m
        )
      );
    } catch (err) {
      console.error('Chat error:', err);
      setMessages((prev) => prev.filter((m) => !m.isLoading));
      toast.error('Failed to send message');
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  // Handle timestamp clicks
  const handleTimestampClick = (timestamp: string) => {
    sendMessage(`What happens at ${timestamp}? Show me what's being demonstrated.`);
  };

  // Parse message content to make timestamps clickable
  const renderMessageContent = (content: string) => {
    // Replace ⏱️HH:MM:SS or ⏱️MM:SS with clickable spans
    const parts = content.split(/(⏱️\d{1,2}:\d{2}(?::\d{2})?)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('⏱️')) {
        const timestamp = part.replace('⏱️', '');
        return (
          <button
            key={index}
            onClick={() => handleTimestampClick(timestamp)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium"
          >
            <Clock className="w-3 h-3" />
            {timestamp}
          </button>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  // Toggle Build Mode
  const toggleBuildMode = (enabled: boolean) => {
    setBuildMode(enabled);
    if (enabled && !platform) {
      setShowPlatformPicker(true);
    }
    if (enabled) {
      toast.success('🔨 Build Mode activated! Ready to coach you through implementation.');
    } else {
      toast.info('Build Mode deactivated. Back to learning mode.');
    }
  };

  const selectPlatform = (selectedPlatform: 'lovable' | 'clickfunnels') => {
    setPlatform(selectedPlatform);
    setShowPlatformPicker(false);
    const platformName = selectedPlatform === 'lovable' ? 'Lovable' : 'ClickFunnels 2.0';
    toast.success(`Platform set to ${platformName}. Let's build!`);
    
    // Auto-send a message to kick off build mode
    sendMessage(`I'm ready to start building in ${platformName}. What's the first step I should take?`);
  };

  const askWhatsNext = () => {
    const nextStep = progress.find(p => !p.completed);
    const question = nextStep 
      ? `I'm working on "${nextStep.step_title}". What exactly should I do next? Give me the specific steps from the course.`
      : "I've completed all the tracked steps. What else should I check or review from this course?";
    sendMessage(question);
  };

  const jumpToModule = (module: Module) => {
    const question = `What happens at ${formatTimestamp(module.startTime)}? Can you summarize what's covered in "${module.title}"?`;
    sendMessage(question);
    setShowModules(false);
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m} minutes`;
  };

  const formatTimestamp = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const suggestedQuestions = [
    "What should I do next?",
    "What's the first step in the course?",
    "What happens at 10:00?",
    "Can you summarize the key points?",
  ];

  const completedCount = progress.filter(p => p.completed).length;
  const progressPercent = progress.length > 0 ? Math.round((completedCount / progress.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-medium line-clamp-1 text-sm">{course?.title || 'Loading...'}</h1>
            {course && (
              <p className="text-xs text-muted-foreground">
                {formatDuration(course.video_duration_seconds)} • {progressPercent}% complete
              </p>
            )}
          </div>
          
          {/* Build Mode Toggle */}
          <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-muted/50 border border-border">
            <Hammer className={`w-4 h-4 ${buildMode ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className="text-xs font-medium hidden sm:inline">Build</span>
            <Switch
              checked={buildMode}
              onCheckedChange={toggleBuildMode}
              className="scale-75"
            />
          </div>
          
          {/* Header Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant={showModules ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => { setShowModules(!showModules); setShowProgress(false); setShowSearch(false); }}
              className="gap-1"
            >
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Modules</span>
            </Button>
            <Button
              variant={showProgress ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => { setShowProgress(!showProgress); setShowModules(false); setShowSearch(false); }}
              className="gap-1"
            >
              <ListChecks className="w-4 h-4" />
              <span className="hidden sm:inline">{completedCount}/{progress.length}</span>
            </Button>
            <Button
              variant={showSearch ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => { setShowSearch(!showSearch); setShowProgress(false); setShowModules(false); }}
            >
              <Search className="w-4 h-4" />
            </Button>
            {course?.status === 'completed' && (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  const shareUrl = `${window.location.origin}/view/${courseId}`;
                  navigator.clipboard.writeText(shareUrl);
                  setShareUrlCopied(true);
                  toast.success('AI Share Link copied! Paste this into ChatGPT, Claude, or any AI to let them see your course frames and transcript.');
                  setTimeout(() => setShareUrlCopied(false), 3000);
                }}
                className="gap-1 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white border-0"
              >
                {shareUrlCopied ? <Check className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                <span className="hidden sm:inline">{shareUrlCopied ? 'Copied!' : 'Share with AI'}</span>
                <span className="sm:hidden">{shareUrlCopied ? '✓' : 'AI'}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Platform Picker Modal */}
        <AnimatePresence>
          {showPlatformPicker && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => setShowPlatformPicker(false)}
            >
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  Choose Your Build Platform
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  I'll guide you through building step-by-step. Where are you working?
                </p>
                <div className="grid gap-3">
                  <Button
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-start gap-1"
                    onClick={() => selectPlatform('lovable')}
                  >
                    <span className="font-medium">🚀 Lovable</span>
                    <span className="text-xs text-muted-foreground">Build with AI-powered code generation</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-start gap-1"
                    onClick={() => selectPlatform('clickfunnels')}
                  >
                    <span className="font-medium">📊 ClickFunnels 2.0</span>
                    <span className="text-xs text-muted-foreground">Follow along in CF2 with exact steps</span>
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  className="w-full mt-3"
                  onClick={() => setShowPlatformPicker(false)}
                >
                  Cancel
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Build Mode Status Bar */}
        <AnimatePresence>
          {buildMode && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-primary/30 bg-primary/5 overflow-hidden"
            >
              <div className="container mx-auto px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hammer className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-primary">Build Mode Active</span>
                  {platform && (
                    <span className="text-xs bg-primary/20 px-2 py-0.5 rounded-full">
                      {platform === 'lovable' ? '🚀 Lovable' : '📊 ClickFunnels 2.0'}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setShowPlatformPicker(true)}
                >
                  Change Platform
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search Panel */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-border overflow-hidden"
            >
              <div className="container mx-auto px-4 py-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search past conversations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchMessages()}
                    className="flex-1"
                  />
                  <Button onClick={searchMessages} disabled={isSearching}>
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
                {searchResults.length > 0 && (
                  <div className="mt-3 space-y-2 max-h-48 overflow-auto">
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        className="p-2 rounded bg-muted/50 text-sm cursor-pointer hover:bg-muted"
                        onClick={() => {
                          const el = document.getElementById(`msg-${result.id}`);
                          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          setShowSearch(false);
                        }}
                      >
                        <span className="text-xs text-muted-foreground">{result.role}:</span>
                        <p className="line-clamp-2">{result.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modules Panel */}
        <AnimatePresence>
          {showModules && course?.modules && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-border overflow-hidden"
            >
              <div className="container mx-auto px-4 py-3 max-h-64 overflow-auto">
                <p className="text-xs text-muted-foreground mb-2">Click a module to ask about it</p>
                <div className="space-y-1">
                  {course.modules.map((module, idx) => (
                    <div key={idx}>
                      <button
                        className="w-full flex items-center gap-2 p-2 rounded hover:bg-muted text-left text-sm"
                        onClick={() => setExpandedModule(expandedModule === idx ? null : idx)}
                      >
                        {expandedModule === idx ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <span className="flex-1 line-clamp-1">{module.title}</span>
                        <span className="text-xs text-muted-foreground">{formatTimestamp(module.startTime)}</span>
                      </button>
                      {expandedModule === idx && (
                        <div className="ml-6 pl-2 border-l border-border">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-xs"
                            onClick={() => jumpToModule(module)}
                          >
                            Ask about this section
                          </Button>
                          {module.keyTopics?.map((topic, tIdx) => (
                            <button
                              key={tIdx}
                              className="w-full text-left text-xs p-1 hover:bg-muted rounded line-clamp-1"
                              onClick={() => sendMessage(`What does the instructor say at ${formatTimestamp(topic.timestamp)}?`)}
                            >
                              <span className="text-muted-foreground mr-1">{formatTimestamp(topic.timestamp)}</span>
                              {topic.topic}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress Panel */}
        <AnimatePresence>
          {showProgress && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-border overflow-hidden"
            >
              <div className="container mx-auto px-4 py-3 max-h-64 overflow-auto">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">Implementation Progress</p>
                  <span className="text-xs font-medium">{progressPercent}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full mb-3">
                  <div 
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {progress.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No steps generated yet. Ask the AI to help you get started!</p>
                ) : (
                  <div className="space-y-1">
                    {progress.map((step) => (
                      <div
                        key={step.step_number}
                        className="flex items-start gap-2 p-2 rounded hover:bg-muted"
                      >
                        <Checkbox
                          checked={step.completed}
                          onCheckedChange={(checked) => toggleProgress(step.step_number, !!checked)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${step.completed ? 'line-through text-muted-foreground' : ''}`}>
                            {step.step_title}
                          </p>
                          {step.step_description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">{step.step_description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4">
        <div className="max-w-3xl mx-auto py-6 space-y-6">
          {isFetching ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12">
              <h3 className="text-lg font-medium mb-2">Ask anything about this course</h3>
              <p className="text-muted-foreground mb-8">
                The AI has watched every frame and can answer questions with precision.
              </p>
              
              {/* What's Next Button */}
              <Button
                size="lg"
                className="mb-6 gap-2"
                onClick={askWhatsNext}
              >
                <Sparkles className="w-4 h-4" />
                What should I do next?
              </Button>
              
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestedQuestions.map((q, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={() => setInput(q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  id={`msg-${message.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border border-border'
                    }`}
                  >
                    {message.isLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">{buildMode ? 'Preparing your next action...' : 'Thinking...'}</span>
                      </div>
                    ) : (
                      <>
                        <div className="whitespace-pre-wrap">
                          {message.role === 'assistant' 
                            ? renderMessageContent(message.content)
                            : message.content
                          }
                        </div>
                        
                        {/* Frame References */}
                        {message.frames && message.frames.length > 0 && (
                          <div className="mt-4 space-y-3">
                            {message.frames.map((frame, idx) => (
                              <div key={idx} className="rounded-lg overflow-hidden border border-border">
                                <img
                                  src={frame.frameUrl}
                                  alt={`Frame at ${formatTimestamp(frame.timestamp)}`}
                                  className="w-full"
                                  loading="lazy"
                                />
                                <div className="bg-muted px-3 py-2 flex items-center gap-2 text-xs">
                                  <Clock className="w-3 h-3" />
                                  <span>{formatTimestamp(frame.timestamp)}</span>
                                  <span className="text-muted-foreground">
                                    (Frame #{frame.frameIndex + 1})
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4 max-w-3xl">
          {/* What's Next Quick Action */}
          {messages.length > 0 && (
            <div className="flex justify-center mb-3">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={askWhatsNext}
              >
                <Sparkles className="w-3 h-3" />
                What should I do next?
              </Button>
            </div>
          )}
          
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex gap-3"
          >
            <Input
              ref={inputRef}
              placeholder={buildMode 
                ? "Tell me when you've completed the step..." 
                : "Ask about the course... (e.g., 'What happens at 23:45?')"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {buildMode 
              ? 'Build Mode: I\'ll guide you step-by-step • Click timestamps to see demonstrations'
              : 'Search past conversations • Jump to modules • Track your progress'
            }
          </p>
        </div>
      </div>
    </div>
  );
}
