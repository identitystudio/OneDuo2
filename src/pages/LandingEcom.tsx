import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { ArrowRight, Play, Video, TrendingUp, Package, DollarSign, ShoppingCart, BarChart3 } from 'lucide-react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/Logo';
import { toast } from 'sonner';
import { UseCaseDemo } from '@/components/UseCaseDemo';
import { VSLDemoModal } from '@/components/VSLDemoModal';
import { useUTMTracking } from '@/hooks/useUTMTracking';
import { useABTest, landingEcomHeadlines } from '@/hooks/useABTest';

export default function LandingEcom() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const emailGateRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  
  // Track UTM parameters and page visits
  useUTMTracking();
  
  // A/B testing for headline
  const { headline: abHeadline } = useABTest(landingEcomHeadlines);
  
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
        body: { email, source: 'ecom_landing' }
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
        <div className="absolute top-[-20%] left-1/4 w-[800px] h-[800px] rounded-full bg-gradient-to-br from-orange-500/15 via-orange-500/5 to-transparent blur-3xl" />
        <div className="absolute top-[-10%] right-1/4 w-[800px] h-[800px] rounded-full bg-gradient-to-bl from-red-500/15 via-red-500/5 to-transparent blur-3xl" />
        <div className="absolute top-[40%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-orange-500/5 blur-3xl" />
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
                  <span className="px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-xs font-semibold text-orange-400 uppercase tracking-wide">For E-commerce</span>
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
                <Link to="/upload" className="text-orange-400 hover:text-orange-300 font-semibold text-sm sm:text-base transition-colors">
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
              <span className="text-orange-400 text-xs sm:text-sm font-semibold">It's the translator for VIDEO CONTEXT between all AIs.</span>
            </div>
          </motion.div>
          {/* THE GRABBER - AI Chat Conversation */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-8 sm:mb-10"
          >
            {/* AI Chat Interface Mockup */}
            <div className="max-w-[500px] mx-auto">
              <div className="rounded-2xl bg-[#1a1a1a] border border-white/10 shadow-[0_0_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden">
                {/* Chat Header with Video Playing */}
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                    </div>
                    <span className="text-white/40 text-xs font-medium">ChatGPT</span>
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-orange-500/10 border border-orange-500/20">
                    <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                    <span className="text-orange-400 text-[10px] font-medium">Video Playing</span>
                  </div>
                </div>
                
                {/* Conversation - Quick back and forth */}
                <div className="px-4 py-3 space-y-3">
                  {/* User */}
                  <div className="flex justify-end">
                    <p className="text-white/90 text-sm bg-orange-500/20 px-3 py-2 rounded-2xl rounded-tr-sm max-w-[85%]">
                      Do you think this product will go viral?
                    </p>
                  </div>
                  
                  {/* AI */}
                  <div className="flex justify-start">
                    <p className="text-white/80 text-sm bg-white/[0.05] px-3 py-2 rounded-2xl rounded-tl-sm max-w-[85%]">
                      That hook at <span className="text-orange-400">0:02</span> is designed to stop the scroll. Strong pattern interrupt.
                    </p>
                  </div>
                  
                  {/* User */}
                  <div className="flex justify-end">
                    <p className="text-white/90 text-sm bg-orange-500/20 px-3 py-2 rounded-2xl rounded-tr-sm max-w-[85%]">
                      What about the demo section?
                    </p>
                  </div>
                  
                  {/* AI */}
                  <div className="flex justify-start">
                    <p className="text-white/80 text-sm bg-white/[0.05] px-3 py-2 rounded-2xl rounded-tl-sm max-w-[85%]">
                      <span className="text-orange-400">0:08-0:23</span> — clear problem → solution. They're showing the pain first.
                    </p>
                  </div>
                  
                  {/* User */}
                  <div className="flex justify-end">
                    <p className="text-white/90 text-sm bg-orange-500/20 px-3 py-2 rounded-2xl rounded-tr-sm max-w-[85%]">
                      Am I crazy or is this about to blow up?
                    </p>
                  </div>
                  
                  {/* AI - with typing indicator */}
                  <div className="flex justify-start">
                    <div className="text-white/80 text-sm bg-white/[0.05] px-3 py-2 rounded-2xl rounded-tl-sm max-w-[85%]">
                      <p className="mb-1">You're not crazy. This has <span className="text-green-400 font-semibold">viral signals</span>.</p>
                      <div className="flex gap-1">
                        <motion.div 
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1.2, repeat: Infinity }}
                          className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                        />
                        <motion.div 
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
                          className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                        />
                        <motion.div 
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
                          className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Subtext */}
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-white/50 text-sm mt-6 max-w-md mx-auto"
            >
              Every AI can finally <span className="text-orange-400 font-semibold">see</span> your product videos.
            </motion.p>
            
            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mt-6"
            >
              <Link to="/upload">
                <button className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-orange-500 text-black font-bold text-base hover:scale-[1.02] transition-all">
                  Upload Your First Product Video
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </Link>
            </motion.div>
          </motion.div>

          {/* THE PROBLEM */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="w-full max-w-[700px] mx-auto mb-10 p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-left"
          >
            <p className="text-white/80 text-base sm:text-lg leading-relaxed mb-4">
              You see a winning product on TikTok. The ad is fire. 🔥
            </p>
            <p className="text-white/80 text-base sm:text-lg leading-relaxed mb-4">
              You want to understand WHY it's working:
            </p>
            
            <div className="space-y-2 text-white/60 text-sm sm:text-base mb-6 pl-4 border-l-2 border-orange-500/30">
              <p>→ What's the hook in the first 3 seconds?</p>
              <p>→ How are they demonstrating the product?</p>
              <p>→ What emotional triggers are they hitting?</p>
              <p>→ What claims are they making?</p>
            </div>
            
            <p className="text-white font-semibold">But here's the trap:</p>
            <p className="text-white/60 mt-2 mb-4">You upload to Gemini. Build context. Get organized.</p>
            <p className="text-white/60">Then you need ChatGPT for strategy. Or Claude for copy. <span className="text-red-400 font-semibold">And all that context? Trapped in Gemini.</span></p>
          </motion.div>

          {/* THE SOLUTION */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.36 }}
            className="w-full max-w-[700px] mx-auto mb-10"
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-orange-400 mb-6">
              OneDuo is the universal adaptor.
            </h2>
            
            <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/30 text-center">
              <p className="text-lg sm:text-xl text-white mb-4">Screen record the TikTok. Upload to OneDuo.</p>
              <p className="text-2xl sm:text-3xl font-bold text-white mb-4">
                Get a PDF. Share with <span className="text-cyan-400">every AI</span>.
              </p>
              
              <div className="space-y-2 text-white/80 text-base sm:text-lg mt-6">
                <p>→ <span className="text-cyan-400">ChatGPT</span>: "Write 10 hooks like frame 0:23"</p>
                <p>→ <span className="text-purple-400">Claude</span>: "What's the strategic angle?"</p>
                <p>→ <span className="text-blue-400">Gemini</span>: "Break down the visual flow"</p>
                <p>→ <span className="text-orange-400">Grok</span>: "What market patterns does this exploit?"</p>
              </div>
              
              <div className="mt-6 pt-6 border-t border-white/10">
                <p className="text-white/60 text-sm">
                  OneDuo didn't make AI smarter. It gave AI <span className="text-white font-semibold">context it's never had access to before</span>.
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
              <span className="text-white">PRODUCT VIDEO</span> → <span className="text-orange-400">One PDF</span> → <span className="text-cyan-400">Every AI</span>
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
                <div className="absolute inset-0 bg-orange-500 rounded-2xl blur-xl opacity-40 group-hover:opacity-60 transition-opacity" />
                <div className="absolute inset-0 bg-orange-500 rounded-2xl" />
                <span className="relative text-black font-bold">Try Free — No Credit Card</span>
                <ArrowRight className="relative w-5 h-5 text-black group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* USE CASES FOR ECOMMERCE */}
      <section className="relative py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-[900px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500/10 border border-orange-500/20 mb-6">
              <ShoppingCart className="w-4 h-4 text-orange-400" />
              <span className="text-sm text-orange-400 font-medium">E-commerce Use Cases</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.03em] mb-6">
              <span className="text-white">Product research </span>
              <span className="text-orange-400">10x faster</span>
            </h2>
          </motion.div>

          {/* Main ecommerce demo */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-16"
          >
            <div className="mb-8">
              <UseCaseDemo type="ecommerce" />
            </div>

            <div className="p-8 rounded-3xl bg-gradient-to-br from-orange-500/5 via-transparent to-red-500/5 border border-orange-500/20">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-orange-500/20 flex items-center justify-center">
                  <Video className="w-7 h-7 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">📦 Product Video Analysis</h3>
                  <p className="text-sm text-white/40">Screen grab any product video. Get every AI analyzing it instantly.</p>
                </div>
              </div>
              
              <p className="text-white/70 mb-6 leading-relaxed">
                See a winning product on TikTok? <span className="text-orange-400 font-semibold">Screen record → Upload to OneDuo → Get shareable PDF</span>. 
                Send to your team: "Analyze this."
              </p>

              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-3 text-white/60 text-sm">
                  <ArrowRight className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                  <span><span className="text-white/80 font-medium">ChatGPT</span>: "Write 10 hooks like frame 0:23"</span>
                </div>
                <div className="flex items-start gap-3 text-white/60 text-sm">
                  <ArrowRight className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                  <span><span className="text-white/80 font-medium">Claude</span>: "What's the strategic angle?"</span>
                </div>
                <div className="flex items-start gap-3 text-white/60 text-sm">
                  <ArrowRight className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                  <span><span className="text-white/80 font-medium">Gemini</span>: "Break down the visual flow"</span>
                </div>
                <div className="flex items-start gap-3 text-white/60 text-sm">
                  <ArrowRight className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                  <span><span className="text-white/80 font-medium">Grok</span>: "What market patterns does this exploit?"</span>
                </div>
              </div>

              <p className="text-orange-400 font-semibold text-lg">
                One screen grab. Every AI. Forever.
              </p>
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
              <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-4">
                <BarChart3 className="w-6 h-6 text-orange-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Competitor Ad Analysis</h3>
              <p className="text-white/60 text-sm mb-4">
                Upload competitor video ads. Ask AI: "What's their hook structure? What claims are they making? How can we beat this?"
              </p>
              <p className="text-orange-400 text-sm font-medium">Saves 10+ hours/week</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08]"
            >
              <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-4">
                <Package className="w-6 h-6 text-orange-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Supplier Video Reviews</h3>
              <p className="text-white/60 text-sm mb-4">
                Upload supplier demo videos. AI analyzes: build quality, functionality, potential issues, even estimates shipping dimensions.
              </p>
              <p className="text-orange-400 text-sm font-medium">10x'd sourcing pipeline</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08]"
            >
              <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-orange-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">UGC & Review Mining</h3>
              <p className="text-white/60 text-sm mb-4">
                Upload customer video reviews. Extract common phrases, pain points, and testimonial gold for your own ads.
              </p>
              <p className="text-orange-400 text-sm font-medium">Better ad copy, faster</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08]"
            >
              <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-4">
                <DollarSign className="w-6 h-6 text-orange-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Ad Creative Breakdown</h3>
              <p className="text-white/60 text-sm mb-4">
                Upload your own ads or competitors'. Get frame-by-frame analysis of what's working and what's not.
              </p>
              <p className="text-orange-400 text-sm font-medium">Improve ROAS with data</p>
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
            className="p-8 rounded-3xl bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20"
          >
            <div className="text-4xl text-orange-400/30 font-serif mb-4">"</div>
            <p className="text-white/80 text-lg leading-relaxed mb-6">
              Chinese suppliers send me product demo videos. No English. Terrible quality. I used to waste HOURS trying to figure out if products were worth importing.
              <br /><br />
              Now I upload their videos to OneDuo. The AI watches the whole thing—frame by frame—and tells me: build quality, functionality, potential issues, even estimates shipping dimensions.
              <br /><br />
              <span className="text-orange-400 font-semibold">I evaluated 47 products last week in the time it used to take me to review 5.</span>
            </p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                <span className="text-white font-bold">M</span>
              </div>
              <div>
                <p className="text-white font-medium">Mike T.</p>
                <p className="text-white/40 text-sm">Ecommerce Seller</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section ref={emailGateRef} className="relative py-20 sm:py-32 px-4 sm:px-6">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-t from-orange-500/10 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-1/4 w-[600px] h-[600px] bg-gradient-to-t from-orange-500/15 to-transparent blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-gradient-to-t from-red-500/15 to-transparent blur-3xl" />
        </div>

        <div className="max-w-[700px] mx-auto relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.03em] mb-6">
              <span className="text-white">Your product research library </span>
              <span className="text-orange-400">never expires</span>
            </h2>
            <p className="text-xl text-white/60 mb-8">
              Every AI sees the frames. Every AI keeps permanent access.
            </p>

            <form onSubmit={handleEmailSubmit} className="flex flex-col sm:flex-row gap-4 max-w-[500px] mx-auto mb-6">
              <div className="relative flex-1">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-14 px-6 text-base bg-white/[0.06] border-white/[0.1] rounded-xl text-white placeholder:text-white/40 focus:border-orange-500/50 focus:ring-orange-500/20 transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="group h-14 px-8 text-base font-semibold rounded-xl bg-orange-500 text-black hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
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
              <span className="text-white/40 text-sm">For e-commerce operators</span>
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
