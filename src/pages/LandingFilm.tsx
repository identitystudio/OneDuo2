import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { ArrowRight, Play, Film, Clapperboard, Scissors, Camera, Palette, BookOpen } from 'lucide-react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/Logo';
import { toast } from 'sonner';
import { UseCaseDemo } from '@/components/UseCaseDemo';
import { VSLDemoModal } from '@/components/VSLDemoModal';
import { useUTMTracking } from '@/hooks/useUTMTracking';
import { useABTest, landingFilmHeadlines } from '@/hooks/useABTest';

export default function LandingFilm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const emailGateRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  
  // Track UTM parameters and page visits
  useUTMTracking();
  
  // A/B testing for headline
  const { headline: abHeadline } = useABTest(landingFilmHeadlines);
  
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  });
  
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.85]);
  const heroScale = useTransform(scrollYProgress, [0, 0.8], [1, 0.98]);

  const scrollToEmailGate = () => {
    emailGateRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('email-capture', {
        body: { email, source: 'film_landing' }
      });
      
      if (error) throw error;
      localStorage.setItem('courseagent_email', email);
      toast.success('Welcome to OneDuo!');
      navigate('/upload');
    } catch (err) {
      console.error('Email capture error:', err);
      navigate('/upload');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#030303] text-white overflow-hidden">
      {/* Ambient Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-1/4 w-[800px] h-[800px] rounded-full bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent blur-3xl" />
        <div className="absolute top-[-10%] right-1/4 w-[800px] h-[800px] rounded-full bg-gradient-to-bl from-purple-500/15 via-purple-500/5 to-transparent blur-3xl" />
        <div className="absolute top-[40%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-amber-500/5 blur-3xl" />
      </div>

      {/* Floating Header */}
      <motion.header 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="fixed top-0 left-0 right-0 z-50"
      >
        <div className="mx-2 sm:mx-4 mt-2 sm:mt-4 md:mx-8 md:mt-6">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 sm:py-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-2xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 sm:gap-4">
                <Logo size="sm" animated className="sm:hidden" linkTo="/" />
                <Logo size="md" animated className="hidden sm:flex" linkTo="/" />
                <div className="hidden md:flex items-center">
                  <span className="w-px h-5 bg-white/20 mr-4" />
                  <span className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-400 uppercase tracking-wide">For Filmmakers</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2 sm:gap-3">
                <button 
                  onClick={() => setShowDemoModal(true)}
                  className="hidden lg:flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/60 hover:text-white transition-colors rounded-lg hover:bg-white/[0.05]"
                >
                  <Play className="w-4 h-4" />
                  Demo
                </button>
                <Link to="/upload" className="text-amber-400 hover:text-amber-300 font-semibold text-sm sm:text-base transition-colors">
                  Try Free →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      {/* HERO SECTION */}
      <section ref={heroRef} className="relative min-h-auto flex items-center justify-center px-3 sm:px-6 md:px-8 pt-24 sm:pt-32 pb-10 sm:pb-16">
        <motion.div 
          style={{ opacity: heroOpacity, scale: heroScale }}
          className="w-full max-w-[900px] mx-auto text-center relative z-10"
        >
          {/* KEY POSITIONING - Above the fold */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.08]">
              <span className="text-white/50 text-xs sm:text-sm">🔑</span>
              <span className="text-white/70 text-xs sm:text-sm">OneDuo is <span className="text-white font-semibold">not an AI</span>.</span>
              <span className="text-amber-400 text-xs sm:text-sm font-semibold">It's the translator for VIDEO CONTEXT between all AIs.</span>
            </div>
          </motion.div>
          {/* THE GRABBER */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-8 sm:mb-10"
          >
            <div className="inline-block px-5 sm:px-10 py-6 sm:py-8 rounded-2xl bg-[#1a1a1a] border border-white/10 shadow-[0_0_60px_-15px_rgba(0,0,0,0.5)]">
              <div className="font-mono text-[clamp(1.2rem,3.5vw,2.4rem)] leading-tight mb-4">
                <p className="text-amber-400">"Claude can't see the Bridgerton scene</p>
                <p className="text-white/90">I'm studying."</p>
              </div>
              <p className="text-[clamp(0.9rem,2.5vw,1.3rem)] text-white/70 mb-6 leading-relaxed">
                Now <span className="text-amber-400 font-semibold">every AI</span> can analyze cinematography, pacing, and emotional beats with you.
              </p>
              <Link to="/upload">
                <button className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-amber-500 text-black font-bold text-base hover:scale-[1.02] transition-all">
                  Upload Your Reference Footage
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </Link>
            </div>
          </motion.div>

          {/* THE PROBLEM */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="w-full max-w-[700px] mx-auto mb-10 p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-left"
          >
            <p className="text-white/80 text-base sm:text-lg leading-relaxed mb-4">
              You want to study how a show builds <span className="text-amber-400 font-semibold">suspense</span>.
            </p>
            <p className="text-white/80 text-base sm:text-lg leading-relaxed mb-4">
              The emotional beats. The B-roll cuts. The pacing decisions.
            </p>
            
            <div className="space-y-2 text-white/60 text-sm sm:text-base mb-6 pl-4 border-l-2 border-amber-500/30">
              <p>→ What lighting choices create that mood?</p>
              <p>→ Why does this cut feel so jarring?</p>
              <p>→ How is tension building frame-by-frame?</p>
              <p>→ What makes this scene WORK?</p>
            </div>
            
            <p className="text-white font-semibold">But here's the catch:</p>
            <p className="text-white/60 mt-2 mb-4">A transcript tells you what was said. Not what you SAW.</p>
            <p className="text-white/60">Even if AI can "see" video now—that understanding is <span className="text-red-400 font-semibold">trapped in one platform</span>. Can't take it to Claude for script analysis. Can't share it with a study group.</p>
          </motion.div>

          {/* THE SOLUTION */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.36 }}
            className="w-full max-w-[700px] mx-auto mb-10"
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-amber-400 mb-6">
              OneDuo lets AI SEE the craft.
            </h2>
            
            <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-amber-500/10 to-purple-500/10 border border-amber-500/30 text-center">
              <p className="text-lg sm:text-xl text-white mb-4">Upload your reference footage. Get a PDF.</p>
              <p className="text-2xl sm:text-3xl font-bold text-white mb-4">
                Every AI sees <span className="text-amber-400">every frame</span>.
              </p>
              
              <div className="space-y-2 text-white/80 text-base sm:text-lg mt-6 text-left max-w-lg mx-auto">
                <p>→ Ask ChatGPT: <span className="text-white/90 italic">"What's building tension in frames 0:45-1:20?"</span></p>
                <p>→ Ask Claude: <span className="text-white/90 italic">"Compare this scene's pacing to the opening."</span></p>
                <p>→ Ask Gemini: <span className="text-white/90 italic">"Why does this cut feel jarring?"</span></p>
                <p>→ Ask any AI: <span className="text-white/90 italic">"Help me understand why this scene WORKS."</span></p>
              </div>
              
              <div className="mt-6 pt-6 border-t border-white/10">
                <p className="text-white/60 text-sm">
                  It's like a super student that saw everything, heard everything, and <span className="text-white font-semibold">remembers everything</span>.
                </p>
              </div>
            </div>
          </motion.div>

          {/* VIDEO → One PDF → Every AI */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.42 }}
            className="mb-10"
          >
            <p className="text-xl sm:text-2xl md:text-3xl font-mono text-white/60 tracking-wide mb-6">
              <span className="text-white">REFERENCE</span> → <span className="text-amber-400">One PDF</span> → <span className="text-cyan-400">Every AI</span>
            </p>
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.54 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link to="/upload">
              <button className="group relative inline-flex items-center gap-3 h-14 px-8 text-base font-semibold rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]">
                <div className="absolute inset-0 bg-amber-500 rounded-2xl blur-xl opacity-40 group-hover:opacity-60 transition-opacity" />
                <div className="absolute inset-0 bg-amber-500 rounded-2xl" />
                <span className="relative text-black font-bold">Try Free — No Credit Card</span>
                <ArrowRight className="relative w-5 h-5 text-black group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* USE CASES FOR FILMMAKERS */}
      <section className="relative py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-[900px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6">
              <Clapperboard className="w-4 h-4 text-amber-400" />
              <span className="text-sm text-amber-400 font-medium">Film & Screenwriting Use Cases</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.03em] mb-6">
              <span className="text-white">Study the craft </span>
              <span className="text-amber-400">at a new level</span>
            </h2>
          </motion.div>

          {/* Main filmmaking demo */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-16"
          >
            <div className="mb-8">
              <UseCaseDemo type="screenwriters" />
            </div>

            <div className="p-8 rounded-3xl bg-gradient-to-br from-amber-500/5 via-transparent to-purple-500/5 border border-amber-500/20">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center">
                  <Film className="w-7 h-7 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">🎬 Screenwriters & Filmmakers</h3>
                  <p className="text-sm text-white/40">Study the craft at a new level</p>
                </div>
              </div>
              
              <p className="text-white/70 mb-6 leading-relaxed">
                You want to study how a show builds <span className="text-amber-400 font-semibold">suspense</span>. 
                The emotional beats. The B-roll cuts. The pacing decisions.
              </p>

              {/* AI Honest Disclosure */}
              <div className="mt-6 p-5 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                <p className="text-white/50 text-xs uppercase tracking-wider mb-3 font-semibold">The honest truth about AI + film:</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                  <div className="space-y-2">
                    <p className="text-red-400/80 text-sm font-medium">AI still won't:</p>
                    <div className="space-y-1 text-white/50 text-sm">
                      <p>✗ "Feel" emotion like you do</p>
                      <p>✗ Have taste like a human writer</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-cyan-400 text-sm font-medium">But with OneDuo, AI can:</p>
                    <div className="space-y-1 text-white/70 text-sm">
                      <p>✓ Track emotional arcs frame-by-frame</p>
                      <p>✓ Notice tension builds you might miss</p>
                      <p>✓ Explain WHY a cut matters</p>
                      <p>✓ Compare scenes structurally</p>
                      <p>✓ Help you geek out intelligently</p>
                    </div>
                  </div>
                </div>

                <p className="text-amber-400 font-semibold text-base">
                  Your taste. Your vision. AI as your film school that never closes.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Additional use cases */}
          <div className="grid md:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08]"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4">
                <Camera className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Cinematography Study</h3>
              <p className="text-white/60 text-sm mb-4">
                Upload reference clips. Ask AI: "How did Fincher frame this tension?" or "What color grading made that scene feel cold?"
              </p>
              <p className="text-amber-400 text-sm font-medium">Learn from masters, frame by frame</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08]"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4">
                <Scissors className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Edit Pattern Analysis</h3>
              <p className="text-white/60 text-sm mb-4">
                Analyze cut timing, B-roll patterns, and pacing decisions. Understand what makes editing feel invisible or jarring.
              </p>
              <p className="text-amber-400 text-sm font-medium">Decode professional editing</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08]"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4">
                <Palette className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Mood Board Creation</h3>
              <p className="text-white/60 text-sm mb-4">
                Upload visual references. Ask AI to analyze and describe the visual language for your pitch decks and lookbooks.
              </p>
              <p className="text-amber-400 text-sm font-medium">Articulate your vision</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08]"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4">
                <BookOpen className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Script Development</h3>
              <p className="text-white/60 text-sm mb-4">
                Study how dialogue and visuals work together. Analyze blocking, character positioning, and visual storytelling.
              </p>
              <p className="text-amber-400 text-sm font-medium">Write more visual scripts</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* TESTIMONIAL */}
      <section className="relative py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-[700px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="p-8 rounded-3xl bg-gradient-to-br from-amber-500/10 to-purple-500/10 border border-amber-500/20"
          >
            <div className="text-4xl text-amber-400/30 font-serif mb-4">"</div>
            <p className="text-white/80 text-lg leading-relaxed mb-6">
              I collect reference videos for every script—cinematography, tone, character blocking. Used to keep messy folders and forget what inspired what.
              <br /><br />
              Now I upload references to OneDuo. When I'm writing, I paste the link and ask: 'How did Fincher frame this tension?' or 'What color grading made that scene feel cold?'
              <br /><br />
              <span className="text-amber-400 font-semibold">The AI sees the EXACT frames I'm referencing. My scripts got tighter. My visual references became a creative weapon instead of a cluttered mess.</span>
            </p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-purple-500 flex items-center justify-center">
                <span className="text-white font-bold">J</span>
              </div>
              <div>
                <p className="text-white font-medium">Jessica R.</p>
                <p className="text-white/40 text-sm">Screenwriter</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section ref={emailGateRef} className="relative py-20 sm:py-32 px-4 sm:px-6">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-t from-amber-500/10 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-1/4 w-[600px] h-[600px] bg-gradient-to-t from-amber-500/15 to-transparent blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-gradient-to-t from-purple-500/15 to-transparent blur-3xl" />
        </div>

        <div className="max-w-[700px] mx-auto relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.03em] mb-6">
              <span className="text-white">Now you can prompt AI about </span>
              <span className="text-amber-400">what it actually SEES</span>
            </h2>
            <p className="text-xl text-white/60 mb-8">
              We dream together. We create together. As OneDuo.
            </p>

            <form onSubmit={handleEmailSubmit} className="flex flex-col sm:flex-row gap-4 max-w-[500px] mx-auto mb-6">
              <div className="relative flex-1">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-14 px-6 text-base bg-white/[0.06] border-white/[0.1] rounded-xl text-white placeholder:text-white/40 focus:border-amber-500/50 focus:ring-amber-500/20 transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="group h-14 px-8 text-base font-semibold rounded-xl bg-amber-500 text-black hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isLoading ? 'Loading...' : 'Try Free — No Credit Card'}
                {!isLoading && <ArrowRight className="inline-block ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />}
              </button>
            </form>

            <p className="text-sm text-white/30">
              No credit card required
            </p>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative py-8 sm:py-12 px-4 sm:px-6 border-t border-white/[0.06]">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <Logo size="sm" linkTo="/" />
              <span className="text-white/30 text-sm">|</span>
              <span className="text-white/40 text-sm">For screenwriters & filmmakers</span>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <Link to="/upload" className="text-white/40 hover:text-white transition-colors">
                Upload
              </Link>
              <Link to="/pricing" className="text-white/40 hover:text-white transition-colors">
                Pricing
              </Link>
              <span className="text-white/20">|</span>
              <Link to="/terms" className="text-white/40 hover:text-white transition-colors">
                Terms
              </Link>
              <Link to="/privacy" className="text-white/40 hover:text-white transition-colors">
                Privacy
              </Link>
            </div>
            <p className="text-white/30 text-sm">
              © 2025 OneDuo.ai
            </p>
          </div>
        </div>
      </footer>

      {/* VSL Demo Modal */}
      <VSLDemoModal open={showDemoModal} onOpenChange={setShowDemoModal} />
    </div>
  );
}
