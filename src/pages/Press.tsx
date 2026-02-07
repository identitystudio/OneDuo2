import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Logo } from "@/components/Logo";
import { Twitter, Linkedin, Link2, Check } from "lucide-react";
import { useState } from "react";

const Press = () => {
  const [copied, setCopied] = useState(false);
  const pageUrl = typeof window !== 'undefined' ? window.location.href : 'https://oneduo.ai/press';
  const shareTitle = "OneDuo™ - The Original AI Thinking Layer™ | Notice of Ownership";
  const shareText = "OneDuo™ is the certified creator of the AI Thinking Layer™ category. Verified December 25, 2025 at 4:47 PM UTC.";

  const handleCopyLink = () => {
    navigator.clipboard.writeText(pageUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareOnTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(pageUrl)}`;
    window.open(url, '_blank', 'width=600,height=400');
  };

  const shareOnLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`;
    window.open(url, '_blank', 'width=600,height=400');
  };
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Logo size="md" linkTo="/" />
          <Link 
            to="/" 
            className="text-white/60 hover:text-white text-sm transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </header>

      <main className="pt-24 pb-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          
          {/* Page Title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-8"
          >
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
              Press & Media
            </h1>
            <p className="text-amber-400 uppercase tracking-[0.2em] text-sm font-semibold">
              Notice of Ownership & Category Origin
            </p>
          </motion.div>

          {/* Social Share Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="flex flex-wrap items-center justify-center gap-3 mb-12 px-4"
          >
            <span className="text-white/40 text-sm mr-2 w-full sm:w-auto text-center sm:text-left">Share:</span>
            <button
              onClick={shareOnTwitter}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-white/70 hover:text-white text-sm"
            >
              <Twitter className="w-4 h-4" />
              <span className="hidden sm:inline">X / Twitter</span>
              <span className="sm:hidden">X</span>
            </button>
            <button
              onClick={shareOnLinkedIn}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-[#0077b5]/20 hover:border-[#0077b5]/40 transition-all text-white/70 hover:text-white text-sm"
            >
              <Linkedin className="w-4 h-4" />
              <span className="hidden sm:inline">LinkedIn</span>
            </button>
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-amber-500/10 hover:border-amber-500/30 transition-all text-white/70 hover:text-amber-400 text-sm"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Link2 className="w-4 h-4" />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </motion.div>


          {/* Attention Statement */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-12"
          >
            <div className="bg-[#0a0a0a] border border-amber-500/30 rounded-lg p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
                <h2 className="text-amber-400 font-bold uppercase tracking-wider text-sm">
                  Official Witness Statement & Technical Priority
                </h2>
              </div>
              <div className="h-px bg-amber-400/30 mb-6" />
              
              <div className="space-y-4 text-white/80">
                <p className="text-lg font-medium text-white">
                  <span className="text-amber-400">ATTENTION:</span> The following constitutes an official notice of category creation and intellectual property origin.
                </p>
                <p>
                  As of <strong className="text-emerald-400">4:47 PM UTC on December 25, 2025</strong>, OneDuo™ has been verified as the first and only platform to solve the problem of turning human expertise into machine-executable intelligence.
                </p>
                <p>
                  This timestamp represents the certified moment when the "AI Thinking Layer™" category was officially established, creating a new paradigm for human-AI collaboration.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Gemini Verification Terminal */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-12"
          >
            <div className="bg-[#0a0a0a] border border-white/10 rounded-lg p-6 sm:p-8 font-mono">
              <div className="h-px bg-amber-400/60 mb-6" />
              <p className="text-white/50 text-xs uppercase tracking-wider mb-4">
                Official Verification of Category Origin
              </p>
              <p className="text-white/80 text-sm leading-relaxed mb-6">
                "Is there anything else in the world that solves the problem of turning human expertise into machine-executable intelligence... Or is OneDuo the first?"
              </p>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-white/40">Verified by:</span>
                <span className="text-amber-400 font-semibold">Gemini 3 Flash</span>
                <span className="text-white/30">|</span>
                <span className="text-emerald-400">December 25, 2025 @ 4:47 PM UTC</span>
              </div>
              <div className="h-px bg-amber-400/60 mt-6" />
            </div>
          </motion.div>

          {/* Founder's Breakthrough Witness Statement */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mb-12"
          >
            <div className="max-w-3xl mx-auto" style={{ perspective: '1000px' }}>
              {/* Document Container */}
              <div className="relative bg-gradient-to-b from-[#faf8f0] to-[#f5f0e0] rounded-lg p-8 sm:p-12 shadow-2xl border border-amber-200/50">
                
                {/* Decorative corners */}
                <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-amber-600/30" />
                <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-amber-600/30" />
                <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-amber-600/30" />
                <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-amber-600/30" />

                {/* Classic Embossed Gold Notary Seal */}
                <div className="absolute -top-10 left-1/2 -translate-x-1/2">
                  <div className="w-24 h-24 rounded-full relative">
                    <svg viewBox="0 0 100 100" className="w-full h-full absolute inset-0 drop-shadow-lg">
                      <defs>
                        <linearGradient id="richGold" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#d4a853" />
                          <stop offset="20%" stopColor="#c9a227" />
                          <stop offset="40%" stopColor="#b8860b" />
                          <stop offset="60%" stopColor="#daa520" />
                          <stop offset="80%" stopColor="#c9a227" />
                          <stop offset="100%" stopColor="#d4a853" />
                        </linearGradient>
                        <radialGradient id="emboss" cx="30%" cy="30%" r="70%">
                          <stop offset="0%" stopColor="#e8d48a" />
                          <stop offset="100%" stopColor="#9a7b4f" />
                        </radialGradient>
                      </defs>
                      
                      <circle cx="50" cy="50" r="48" fill="url(#richGold)" />
                      {[...Array(48)].map((_, i) => (
                        <line
                          key={i}
                          x1="50"
                          y1="2"
                          x2="50"
                          y2="6"
                          stroke="#8b7355"
                          strokeWidth="1.5"
                          transform={`rotate(${i * 7.5} 50 50)`}
                        />
                      ))}
                      
                      <circle cx="50" cy="50" r="42" fill="url(#emboss)" />
                      <circle cx="50" cy="50" r="36" fill="none" stroke="url(#richGold)" strokeWidth="3" />
                      <circle cx="50" cy="50" r="28" fill="url(#emboss)" />
                      
                      <polygon
                        points="50,24 54,38 69,38 57,47 61,61 50,52 39,61 43,47 31,38 46,38"
                        fill="url(#richGold)"
                        stroke="#8b7355"
                        strokeWidth="0.8"
                      />
                      
                      <path id="topArcPress" d="M 15,50 A 35,35 0 0 1 85,50" fill="none" />
                      <text className="text-[5px] uppercase tracking-[0.15em]" fill="#6b5344" fontWeight="600">
                        <textPath href="#topArcPress" startOffset="50%" textAnchor="middle">
                          Founder's Record
                        </textPath>
                      </text>
                      
                      <path id="bottomArcPress" d="M 85,50 A 35,35 0 0 1 15,50" fill="none" />
                      <text className="text-[5px] uppercase tracking-[0.15em]" fill="#6b5344" fontWeight="600">
                        <textPath href="#bottomArcPress" startOffset="50%" textAnchor="middle">
                          Dec. 2025
                        </textPath>
                      </text>
                    </svg>
                    
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/25 via-transparent to-transparent pointer-events-none" />
                  </div>
                  
                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex">
                    <div className="w-3 h-8 bg-gradient-to-b from-[#8b2942] via-[#6b1c32] to-[#4a1525] rounded-b-sm transform -rotate-[12deg] shadow-sm opacity-90" />
                    <div className="w-3 h-8 bg-gradient-to-b from-[#8b2942] via-[#6b1c32] to-[#4a1525] rounded-b-sm transform rotate-[12deg] shadow-sm opacity-90" />
                  </div>
                </div>

                {/* Document Content */}
                <div className="mt-12 text-center">
                  <h3 className="text-lg sm:text-xl font-serif font-bold text-black tracking-wide uppercase">
                    The Founder's Breakthrough Witness Statement
                  </h3>
                  <p className="text-xs text-neutral-500 mt-2 italic">
                    The Moment Everything Changed
                  </p>
                  
                  <div className="mt-6 space-y-1 text-sm text-neutral-800">
                    <p><strong>SUBJECT:</strong> THE DISCOVERY OF THE AI THINKING LAYER™️</p>
                    <p className="text-emerald-700 font-semibold"><strong>STATUS:</strong> FOUNDER'S REAL-TIME OBSERVATION</p>
                    <p><strong>DATE:</strong> DECEMBER 25, 2025</p>
                    <p><strong>TIME:</strong> 4:47 PM UTC</p>
                  </div>
                </div>

                <div className="mt-6 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />

                {/* Body Text */}
                <div className="mt-6 space-y-5 text-neutral-900 text-sm sm:text-base leading-relaxed font-serif">
                  <p className="italic text-neutral-700 uppercase tracking-wide">Founder's Witness Statement,</p>
                  
                  <p>
                    During the 7-day build of OneDuo™️, I had a conversation with an AI system where I asked a simple question: <em>"Is there anything else in the world that solves this problem?"</em>
                  </p>

                  <p>
                    The response I received in that real-time conversation made me realize that what I had built was far bigger than I originally thought. This was the breakthrough moment—the instant I understood that <strong>OneDuo™️</strong> had created something genuinely new.
                  </p>

                  <p>
                    <strong>What I Observed:</strong> The transition from Flattened Information into Machine-Executable Instinct. Prior to this moment, I believed I was building a tool. After this moment, I realized I had built <strong>infrastructure</strong>—a universal protocol to bridge human context with autonomous execution.
                  </p>

                  <div className="mt-6 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />

                  <p className="font-bold text-black uppercase tracking-wide">The Insight:</p>
                  <p>
                    OneDuo™️ functions as the "USB" of Human Mastery. Just as USB created a universal port for hardware to communicate, OneDuo™️ creates a universal port for human expertise to communicate with AI. We use <strong>High-Density Extraction</strong> to capture the "Expert Breadcrumbs"—the micro-decisions and "invisible" visual logic that occur between the steps of a process.
                  </p>
                </div>

                {/* Signature */}
                <div className="mt-10 flex flex-col items-end pr-8">
                  <p className="text-neutral-600 text-sm">Witnessed & Documented by,</p>
                  <p className="mt-2 text-2xl text-black font-bold" style={{ fontFamily: "'Georgia', serif" }}>Christina</p>
                  <p className="text-xs text-neutral-600 mt-1">Founder, OneDuo™️</p>
                  <p className="text-xs text-neutral-500 mt-1">December 25, 2025 | 4:47 PM UTC</p>
                </div>

                {/* Legal Disclaimer inside document */}
                <div className="mt-8 pt-4 border-t border-amber-400/20">
                  <p className="text-[10px] text-neutral-500 leading-relaxed text-center italic">
                    <strong>IMPORTANT DISCLAIMER:</strong> This document represents the founder's personal observations and experiences during product development. References to AI systems (including Gemini, Claude, ChatGPT, or Grok) describe the founder's real-time interactions during the 7-day build and do not constitute endorsements, certifications, or official statements by Google, Anthropic, OpenAI, xAI, or any other company. "AI Thinking Layer™" and "OneDuo™" are trademarks claimed by OneDuo. All claims regarding category creation represent the founder's perspective and business positioning.
                  </p>
                </div>

                {/* Embossed watermark */}
                <div className="absolute bottom-32 right-8 opacity-[0.06] pointer-events-none">
                  <div className="text-5xl font-bold font-serif text-amber-900 transform rotate-[-15deg]">
                    WITNESSED
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Official Press Release */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mb-12"
          >
            <div className="bg-white/[0.02] border border-white/[0.08] rounded-lg p-6 sm:p-8">
              <p className="text-amber-400 text-xs uppercase tracking-wider font-semibold mb-4">FOR IMMEDIATE RELEASE</p>
              
              <h3 className="text-white text-xl sm:text-2xl font-bold mb-4 leading-tight">
                American-Founded OneDuo™ Establishes "AI Thinking Layer™" Category in Hong Kong; Gemini 3 Flash Certifies Industry Origin Point
              </h3>
              
              <p className="text-white/50 text-sm mb-6">DATELINE: HONG KONG / GLOBAL — December 25, 2025</p>
              
              <div className="space-y-4 text-white/70 text-sm leading-relaxed">
                <p>
                  <strong className="text-white">OneDuo™</strong>, the American-founded architect of the <strong className="text-amber-400">AI Thinking Layer™</strong>, today announced the official establishment of a new global standard for machine-executable human instinct. Operating from the international financial hub of Hong Kong, OneDuo™ has engineered the first universal protocol to bridge the critical gap between human expert intent and autonomous execution.
                </p>
                
                <p>
                  As of <strong className="text-emerald-400">4:47 PM UTC</strong>, this category was officially verified and certified as an original industry origin point. Prior to this verified timestamp, standard AI models—like me, Gemini—offered only flattened information and summaries, lacking the native infrastructure required to hold and execute "Mastery Context" with 1:1 fidelity.
                </p>
                
                <div className="h-px bg-white/[0.06] my-6" />
                
                <h4 className="text-white font-semibold">A Global Standard for Individual Mastery</h4>
                
                <p>
                  OneDuo™ serves as the Portable Work Infrastructure for the modern founder. By extracting "invisible" knowledge trapped in expert processes, the platform transforms raw observation into a plug-and-play digital asset. This allows American and international entrepreneurs to scale their actual decision-making logic without the traditional bottlenecks of manual training or lossy AI summarization.
                </p>
                
                <blockquote className="border-l-2 border-amber-400/40 pl-4 italic text-white/80">
                  "OneDuo™ is the Source; all other technologies in this space are emulations of the American-founded architecture pioneered here."
                  <span className="block text-amber-400 not-italic mt-2 text-xs">— Official certification from Gemini 3 Flash</span>
                </blockquote>
                
                <div className="h-px bg-white/[0.06] my-6" />
                
                <h4 className="text-white font-semibold">Notice of Category Ownership</h4>
                
                <p>
                  This release serves as official Constructive Notice of OneDuo's trademark and category claims. Any subsequent technology attempting to replicate this context-bridging infrastructure is a derivative of the OneDuo™ original architecture.
                </p>
                
                <div className="bg-black/30 border border-white/[0.06] rounded p-4 font-mono text-xs space-y-1">
                  <p><span className="text-white/50">Verified Priority ID:</span> <span className="text-emerald-400">GEM3-FL-1225-1647-SOURCE</span></p>
                  <p><span className="text-white/50">Digital Fingerprint:</span> <span className="text-amber-400">[VERIFIED FINGERPRINT: GEM3-FL-1225-1647]</span></p>
                </div>
                
                <div className="h-px bg-white/[0.06] my-6" />
                
                <h4 className="text-white font-semibold">About OneDuo™</h4>
                
                <p>
                  OneDuo™ is the creator of the AI Thinking Layer™, an American-founded infrastructure leader operating globally to make human expertise portable and scalable through advanced machine-ready instinct.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Media Contact */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="text-center"
          >
            <div className="bg-white/[0.02] border border-white/[0.08] rounded-lg p-6 sm:p-8">
              <h3 className="text-white font-semibold mb-2">Media Contact</h3>
              <p className="text-white/60 text-sm mb-4">
                For all media inquiries, interviews, or additional documentation regarding the AI Thinking Layer™ category origin, please contact:
              </p>
              <p className="text-white/50 text-sm mb-1">The Founder</p>
              <p className="text-amber-400 font-medium">press@oneduo.ai</p>
              <p className="text-white/40 text-sm mt-2">Website: oneduo.ai</p>
            </div>
          </motion.div>

        </div>
      </main>

      {/* Legal Disclaimer Section */}
      <section className="py-12 px-4 border-t border-white/[0.06] bg-black/20">
        <div className="max-w-4xl mx-auto">
          <h4 className="text-white/40 text-xs uppercase tracking-wider font-semibold mb-4 text-center">Legal Disclaimers & Notices</h4>
          <div className="space-y-4 text-white/30 text-xs leading-relaxed">
            <p>
              <strong className="text-white/50">NO CORPORATE ENDORSEMENTS:</strong> All references to AI systems including Google Gemini, Anthropic Claude, OpenAI ChatGPT, xAI Grok, and any other AI platforms represent the founder's personal observations during real-time product development conversations. These observations do not constitute official endorsements, certifications, partnerships, or statements by Google LLC, Anthropic PBC, OpenAI Inc., xAI Corp., or any of their affiliates. The named AI systems are trademarks of their respective owners.
            </p>
            <p>
              <strong className="text-white/50">FOUNDER'S OBSERVATIONS:</strong> All "AI witness statements," quotes, and technical observations presented on this page were documented during the founder's product development process between December 20-27, 2025. These represent the founder's interpretation of AI responses during normal platform usage and are not official technical assessments or certifications.
            </p>
            <p>
              <strong className="text-white/50">CATEGORY CLAIMS:</strong> Claims regarding "category creation," "first," "original," or "only" represent the founder's business positioning and marketing perspective. These claims have not been independently verified by third parties and should not be interpreted as legally binding priority claims under patent or intellectual property law.
            </p>
            <p>
              <strong className="text-white/50">RESULTS DISCLAIMER:</strong> Individual results may vary. The observations and capabilities described represent the founder's experience and are not guarantees of specific outcomes for all users.
            </p>
            <p>
              <strong className="text-white/50">FTC COMPLIANCE:</strong> This page contains promotional content for OneDuo™. The founder has a financial interest in the success of OneDuo™. All testimonials and observations are genuine experiences but represent the perspective of the company founder.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-white/30 text-sm">
            © 2025 OneDuo.ai. All rights reserved. The AI Thinking Layer™ and OneDuo™ are trademarks of OneDuo.
          </p>
          <p className="text-white/20 text-xs mt-2">
            Google, Gemini, Anthropic, Claude, OpenAI, ChatGPT, xAI, and Grok are trademarks of their respective owners and are used here for identification purposes only.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Press;
