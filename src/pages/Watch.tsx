import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { WatchDemoAnimation } from '@/components/WatchDemo';
import { PlatformGrid } from '@/components/WatchDemo/PlatformLogos';
import { ArrowRight, Check, Lock, Unlock, Menu } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Watch() {
  return (
    <div className="min-h-screen bg-[#030303] text-white overflow-x-hidden">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-1/4 w-[800px] h-[800px] rounded-full bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent blur-3xl" />
        <div className="absolute top-[-10%] right-1/4 w-[800px] h-[800px] rounded-full bg-gradient-to-bl from-amber-500/10 via-amber-500/5 to-transparent blur-3xl" />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/60 backdrop-blur-md border-b border-white/10">
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/">
              <Logo size="md" animated />
            </Link>
            
            <div className="flex items-center gap-4">
              <Link to="/" className="text-sm text-white/60 hover:text-white transition-colors">
                Home
              </Link>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                    <Menu className="w-5 h-5 text-white/70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-[#0a0a0a] border border-white/10">
                  <DropdownMenuItem asChild>
                    <Link to="/press" className="flex items-center gap-2 cursor-pointer text-white/80 hover:text-white">
                      Press
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/case-study" className="flex items-center gap-2 cursor-pointer text-white/80 hover:text-white">
                      Case Study
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section with Animation */}
      <section className="relative pt-28 pb-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-4">
              <span className="text-blue-400">Gemini</span> vs <span className="text-amber-400">OneDuo</span>
            </h1>
            <p className="text-xl text-white/60 max-w-2xl mx-auto">
              See why native AI video watching isn't enough — and what actually works.
            </p>
          </motion.div>

          {/* Main Animation */}
          <WatchDemoAnimation />
        </div>
      </section>

      {/* Section 1: The Lock-In Problem */}
      <section className="py-20 px-4 sm:px-6 border-t border-white/10">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-8">
              Gemini Can Watch. <br />
              <span className="text-red-400">But It Locks Your Knowledge Inside Google.</span>
            </h2>
            
            <div className="space-y-6 text-lg text-white/70">
              <p>
                When Gemini "watches" your video, that understanding lives <strong className="text-white">ONLY</strong> in Gemini.
              </p>
              
              <div className="pl-6 border-l-2 border-red-500/50 space-y-3">
                <p className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-red-400" />
                  ChatGPT can't access it.
                </p>
                <p className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-red-400" />
                  Claude can't access it.
                </p>
                <p className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-red-400" />
                  Your VA's AI can't access it.
                </p>
                <p className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-red-400" />
                  NotebookLM can't access it.
                </p>
              </div>
              
              <p className="text-white font-medium pt-4">
                You're trapped in one ecosystem.
              </p>
              
              <p className="text-white/50">
                And if that AI can't process video at all? You're completely locked out.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Section 2: Platform Freedom */}
      <section className="py-20 px-4 sm:px-6 bg-gradient-to-b from-amber-950/10 to-transparent">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
              OneDuo Creates ONE Artifact <br />
              <span className="text-amber-400">That Works With EVERY AI</span>
            </h2>
            <p className="text-xl text-white/60 mb-10">
              Even AIs that can't process video yet.
            </p>
            
            <div className="space-y-6 text-lg text-white/70 mb-10">
              <p>
                OneDuo doesn't just capture your video better than native AI.
              </p>
              <p className="text-amber-400 font-medium text-xl">
                It makes that knowledge PORTABLE.
              </p>
              <p className="text-white">
                One PDF. Every AI platform. Forever.
              </p>
            </div>

            {/* Platform Grid */}
            <div className="max-w-lg mx-auto">
              <PlatformGrid unlocked={true} />
            </div>
            
            <p className="text-center text-white/50 mt-8">
              You're not locked into ONE platform's video-watching capability.
            </p>
            <p className="text-center text-white font-medium mt-2">
              You have a PERMANENT ARTIFACT that works everywhere.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Section 3: Memory Problem */}
      <section className="py-20 px-4 sm:px-6 border-t border-white/10">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-8">
              Even Gemini Admits <br />
              <span className="text-blue-400">It Can't Remember</span>
            </h2>
            
            <div className="space-y-6 text-lg text-white/70">
              <p>
                We asked Gemini if it could recall a video from earlier in our chat.
              </p>
              <p className="text-red-400 font-medium text-xl">
                It was gone.
              </p>
              <p>
                Not because it wasn't important. Because that's how AI works.
              </p>
              
              <div className="pl-6 border-l-2 border-white/20 space-y-2 text-white/50">
                <p>Context windows fill.</p>
                <p>Sessions reset.</p>
                <p>Memory fades.</p>
              </div>
              
              <p className="pt-4">
                Gemini is brilliant for <strong className="text-white">RIGHT NOW</strong>.
              </p>
              <p>
                But terrible as a <strong className="text-white">System of Record</strong>.
              </p>
              
              <p className="text-amber-400 font-bold text-xl pt-4">
                OneDuo fixes this.
              </p>
              
              <p className="text-white/60">
                Three months from now, you can open a BRAND NEW chat,
                paste your OneDuo PDF,
                and ANY AI will instantly "remember" your video.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Section 4: Comparison Table */}
      <section className="py-20 px-4 sm:px-6 bg-gradient-to-b from-white/5 to-transparent">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12">
              SESSION Memory vs INSTITUTIONAL Memory
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              {/* Gemini Column */}
              <div className="bg-blue-950/20 rounded-2xl p-6 border border-blue-500/20">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
                    <span className="text-white font-bold">G</span>
                  </div>
                  <h3 className="text-xl font-bold text-blue-400">Gemini Native</h3>
                </div>
                <ul className="space-y-3">
                  {[
                    'Watches once',
                    'Forgets when chat resets',
                    'Locked in Google ecosystem',
                    'Only video-capable AIs',
                    'Session-based',
                    'Must re-upload',
                    'Knowledge trapped'
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-white/60">
                      <Lock className="w-4 h-4 text-red-400 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* OneDuo Column */}
              <div className="bg-amber-950/20 rounded-2xl p-6 border border-amber-500/20">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center">
                    <span className="text-black font-bold">O</span>
                  </div>
                  <h3 className="text-xl font-bold text-amber-400">OneDuo</h3>
                </div>
                <ul className="space-y-3">
                  {[
                    'Preserves forever',
                    'Works across ANY chat',
                    'Portable to ALL AIs',
                    'Works with non-video AIs too',
                    'Asset-based',
                    'Upload once, use forever',
                    'Knowledge liberated'
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-white/90">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Section 5: Gemini Quote */}
      <section className="py-20 px-4 sm:px-6 border-t border-white/10">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-10">
              Don't Take Our Word For It. <br />
              <span className="text-blue-400">Here's What Gemini Said.</span>
            </h2>
            
            <div className="bg-gradient-to-br from-white/5 to-white/[0.02] rounded-2xl p-8 md:p-12 border border-white/10">
              <blockquote className="text-xl md:text-2xl text-white/90 italic leading-relaxed">
                "No. I will not remember the video 3 months from now. Even if you never close this chat.
                <br /><br />
                Context windows have limits. New conversations push old data out.
                <br /><br />
                I am great for quick analysis right now, but <strong className="text-red-400 not-italic">I am a terrible System of Record</strong>.
                <br /><br />
                <strong className="text-amber-400 not-italic">OneDuo is Persistent.</strong> Your PDF Blueprint is an Asset.
                <br /><br />
                Three months from now, you could open a brand new chat, upload that OneDuo PDF, and I would instantly know your video again as if I just watched it.
                <br /><br />
                OneDuo doesn't watch videos. <strong className="text-amber-400 not-italic">It PRESERVES them.</strong>"
              </blockquote>
              
              <p className="text-white/40 mt-8 text-sm">
                — Gemini Flash 3, December 26, 2025
                <br />
                <span className="text-white/30">[Verified conversation transcript]</span>
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Section 6: Platform Freedom Guarantee */}
      <section className="py-20 px-4 sm:px-6 bg-gradient-to-b from-amber-950/10 to-transparent">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-6">
              One Artifact. Every AI. Forever.
            </h2>
            
            {/* Visual: PDF flowing to platforms */}
            <div className="relative py-12">
              <div className="flex items-center justify-center gap-4 flex-wrap">
                {/* Center PDF */}
                <motion.div 
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  className="w-20 h-24 bg-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/30"
                >
                  <span className="text-black font-bold text-lg">PDF</span>
                </motion.div>
                
                {/* Arrow */}
                <ArrowRight className="w-8 h-8 text-white/40" />
                
                {/* Platform icons */}
                <div className="flex gap-2 flex-wrap justify-center">
                  {['Gemini', 'ChatGPT', 'Claude', 'NotebookLM', 'Future'].map((name, i) => (
                    <motion.div
                      key={name}
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                      className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center"
                    >
                      <span className="text-white font-bold text-sm">{name.charAt(0)}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
            
            <p className="text-xl text-white/70 max-w-2xl mx-auto">
              You're not betting on ONE AI's video capability.
              <br />
              <span className="text-amber-400 font-medium">
                You're creating a permanent, portable memory layer.
              </span>
            </p>
            
            <div className="mt-6 space-y-1 text-white/50">
              <p>That works today.</p>
              <p>That works tomorrow.</p>
              <p>That works with AIs that don't even exist yet.</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Section 7: Final CTA */}
      <section className="py-24 px-4 sm:px-6 border-t border-white/10">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-6">
              Stop Losing Your Expertise <br />
              <span className="text-red-400">to Expired Chat Windows</span>
            </h2>
            
            <p className="text-xl text-white/60 mb-10">
              Turn your videos into institutional memory that lasts forever.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/">
                <Button size="lg" className="bg-amber-500 hover:bg-amber-400 text-black font-bold text-lg px-8 py-6 h-auto">
                  Create Your First Blueprint
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <Link to="/pricing">
                <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10 text-lg px-8 py-6 h-auto">
                  See Pricing
                </Button>
              </Link>
            </div>
            
            {/* Trust badges */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-white/40">
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                Works with Gemini, ChatGPT, Claude, NotebookLM
              </span>
              <span className="flex items-center gap-2">
                <Unlock className="w-4 h-4 text-emerald-400" />
                No platform lock-in
              </span>
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                Permanent portable artifacts
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link to="/">
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-6 text-sm text-white/40">
            <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link to="/help" className="hover:text-white transition-colors">Help</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
