import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Copy, Check, ExternalLink, ArrowLeft, Clock, Image as ImageIcon, Sparkles, MessageSquare, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface CourseData {
  id: string;
  title: string;
  video_duration_seconds: number | null;
  frame_urls: string[] | null;
  transcript: TranscriptSegment[] | null;
  created_at: string;
}

const formatTime = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default function CourseView() {
  const { courseId } = useParams<{ courseId: string }>();
  const [course, setCourse] = useState<CourseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchCourse = async () => {
      if (!courseId) {
        setError('No course ID provided');
        setLoading(false);
        return;
      }

      try {
        // Use edge function to fetch course data publicly
        const { data, error: fetchError } = await supabase.functions.invoke('get-public-course', {
          body: { courseId }
        });

        if (fetchError) throw fetchError;
        if (!data || !data.course) {
          setError('Course not found');
          setLoading(false);
          return;
        }

        setCourse(data.course);
      } catch (err) {
        console.error('Error fetching course:', err);
        setError('Failed to load course');
      } finally {
        setLoading(false);
      }
    };

    fetchCourse();
  }, [courseId]);

  const copyPrompt = () => {
    const prompt = `I've shared a course with you. This page contains all ${course?.frame_urls?.length || 0} frames from the video and the complete transcript.

Please analyze this course and help me:
1. Understand the key concepts being taught
2. Create step-by-step implementation instructions for my VA
3. Identify the most important visual moments I should reference

The frames are numbered sequentially with timestamps. Use them to provide specific, actionable guidance.`;

    navigator.clipboard.writeText(prompt);
    setCopied(true);
    toast.success('Prompt copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030303] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">Loading course...</p>
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="min-h-screen bg-[#030303] text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error || 'Course not found'}</p>
          <Link to="/">
            <Button variant="outline">Go Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const frameUrls = course.frame_urls || [];
  const transcript = course.transcript || [];
  const duration = course.video_duration_seconds || 0;
  const frameInterval = duration > 0 && frameUrls.length > 0 ? duration / frameUrls.length : 5;

  return (
    <div className="min-h-screen bg-[#030303] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#030303]/90 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back to OneDuo</span>
            </Link>
            <div className="flex items-center gap-3">
              <Button
                onClick={copyPrompt}
                className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white border-0"
              >
                {copied ? <Check className="w-4 h-4 mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Copy AI Prompt
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-12">
        {/* Hero Banner for AI */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 p-8 rounded-3xl bg-gradient-to-br from-cyan-500/20 via-blue-500/10 to-purple-500/20 border border-cyan-500/30 relative overflow-hidden"
        >
          <div className="absolute top-4 right-4 flex items-center gap-2 text-xs text-white/50 bg-white/5 px-3 py-1 rounded-full">
            <Bot className="w-3 h-3" />
            AI-Readable Page
          </div>
          
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white mb-2">This page is designed for AI!</h2>
              <p className="text-white/70 mb-4">
                Paste this URL into <span className="text-cyan-400">ChatGPT</span>, <span className="text-purple-400">Claude</span>, or any AI. 
                They can see all <span className="font-semibold">{frameUrls.length} frames</span> and the complete transcript to help you implement what you learned.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button 
                  onClick={copyPrompt} 
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20"
                >
                  {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                  {copied ? 'Prompt Copied!' : 'Copy Suggested Prompt'}
                </Button>
                <Link to={`/chat/${courseId}`}>
                  <Button variant="outline" className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10">
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Chat with OneDuo AI
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Course Header */}
        <div className="mb-12 pb-8 border-b border-white/[0.06]">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">{course.title}</h1>
          <div className="flex flex-wrap items-center gap-6 text-white/60">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>Duration: {formatTime(duration)}</span>
            </div>
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4" />
              <span>{frameUrls.length} frames extracted</span>
            </div>
          </div>
        </div>

        {/* Quick Stats for AI */}
        <div className="mb-12 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
            <p className="text-2xl font-bold text-cyan-400">{frameUrls.length}</p>
            <p className="text-sm text-white/50">Frames</p>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
            <p className="text-2xl font-bold text-purple-400">{formatTime(duration)}</p>
            <p className="text-sm text-white/50">Duration</p>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
            <p className="text-2xl font-bold text-green-400">{transcript.length}</p>
            <p className="text-sm text-white/50">Transcript Segments</p>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
            <p className="text-2xl font-bold text-amber-400">{Math.round(frameInterval)}s</p>
            <p className="text-sm text-white/50">Frame Interval</p>
          </div>
        </div>

        {/* Transcript Section */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 text-sm">T</span>
            Complete Transcript
          </h2>
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] max-h-[400px] overflow-y-auto">
            {transcript.length > 0 ? (
              <div className="space-y-3">
                {transcript.map((segment, i) => (
                  <p key={i} className="text-white/70">
                    <span className="text-cyan-400 font-mono text-sm mr-3">
                      [{formatTime(segment.start)}-{formatTime(segment.end)}]
                    </span>
                    {segment.text}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-white/40 italic">No transcript available</p>
            )}
          </div>
        </section>

        {/* Frames Section */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400 text-sm">F</span>
            All Frames ({frameUrls.length})
          </h2>
          <p className="text-white/50 mb-6">
            Each frame is displayed with its sequence number and approximate timestamp. 
            Click any frame to view full size.
          </p>
          
          {frameUrls.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {frameUrls.map((url, i) => {
                const timestamp = formatTime(i * frameInterval);
                return (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-video rounded-lg overflow-hidden bg-white/[0.02] border border-white/[0.06] hover:border-cyan-500/50 transition-all"
                  >
                    <img
                      src={url}
                      alt={`Frame ${i + 1} at ${timestamp}`}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-0 left-0 right-0 p-2 text-center">
                      <p className="text-xs font-mono text-white/80">
                        F{(i + 1).toString().padStart(3, '0')}
                      </p>
                      <p className="text-[10px] text-white/50">{timestamp}</p>
                    </div>
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ExternalLink className="w-4 h-4 text-white/60" />
                    </div>
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="p-12 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center">
              <p className="text-white/40">No frames available for this course</p>
            </div>
          )}
        </section>

        {/* Frame URLs for AI crawling (hidden visually but accessible) */}
        <section className="mt-16 p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
          <h2 className="text-lg font-semibold text-white mb-4">Frame URLs (for AI reference)</h2>
          <div className="max-h-[300px] overflow-y-auto font-mono text-xs text-white/50 space-y-1">
            {frameUrls.map((url, i) => (
              <p key={i}>
                Frame {i + 1} ({formatTime(i * frameInterval)}): {url}
              </p>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8 mt-16">
        <div className="max-w-[1400px] mx-auto px-6 text-center">
          <p className="text-white/40 text-sm">
            Generated by <Link to="/" className="text-cyan-400 hover:underline">OneDuo</Link> — 
            Making videos visible to AI
          </p>
        </div>
      </footer>
    </div>
  );
}
