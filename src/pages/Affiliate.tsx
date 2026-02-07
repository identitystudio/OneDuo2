import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Clock, Users, DollarSign, Shield, Zap, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";

const Affiliate = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email");
      return;
    }
    
    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke("email-capture", {
        body: { email, source: "affiliate_page" },
      });
      
      if (error) throw error;
      
      toast.success("You're on the early affiliate list!");
      setEmail("");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Something went wrong. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white overflow-x-hidden">
      {/* Floating Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo size="md" />
            <span className="font-bold text-lg">OneDuo</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/upload" className="text-sm text-white/60 hover:text-white transition-colors">
              Try Free
            </Link>
            <button
              onClick={scrollToForm}
              className="px-4 py-2 rounded-lg bg-[#a3e635] text-black font-bold text-sm hover:scale-[1.02] transition-all"
            >
              Join Affiliate Program
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* Urgency Badge */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-8"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Founding Affiliate Spots Closing Soon</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight mb-6"
          >
            <span className="text-white">Your Audience Already Needs This.</span>
            <br />
            <span className="text-[#a3e635]">Get Paid When They Find Out.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-white/70 mb-8 max-w-2xl mx-auto"
          >
            Every VA manager, agency owner, and course buyer in your audience 
            is wasting hours translating video context for AI. 
            You can be the one who shows them the fix—and earn recurring commissions.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
          >
            <button
              onClick={scrollToForm}
              className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-[#a3e635] text-black font-bold text-lg hover:scale-[1.02] transition-all"
            >
              Claim Your Affiliate Link
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <p className="text-white/40 text-sm">30% recurring • Lifetime cookies • No approval wait</p>
          </motion.div>

          {/* Stats Row */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="grid grid-cols-3 gap-4 max-w-xl mx-auto"
          >
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <p className="text-2xl font-bold text-[#a3e635]">30%</p>
              <p className="text-xs text-white/50">Recurring Commission</p>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <p className="text-2xl font-bold text-[#a3e635]">∞</p>
              <p className="text-xs text-white/50">Cookie Duration</p>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <p className="text-2xl font-bold text-[#a3e635]">$0</p>
              <p className="text-xs text-white/50">Minimum Payout</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* The Real Talk Section */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06]"
          >
            <h2 className="text-2xl font-bold mb-6 text-white">Here's the uncomfortable truth:</h2>
            
            <div className="space-y-4 text-white/80 text-lg leading-relaxed">
              <p>
                Right now, someone in your audience is going to share OneDuo.
              </p>
              <p>
                Maybe a competitor. Maybe a friend. Maybe some random person 
                who stumbled on it before you did.
              </p>
              <p className="text-white font-medium">
                And when your audience signs up through <span className="text-red-400">their</span> link?
              </p>
              <p className="text-white font-bold text-xl">
                They get paid. Forever.
              </p>
              <p className="text-white/60 pt-4 border-t border-white/10">
                That's not a threat. That's just how this works.
                <br />
                <span className="text-[#a3e635]">First mover wins the commission. Period.</span>
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Who This Is For */}
      <section className="py-16 px-4 bg-gradient-to-b from-transparent via-[#a3e635]/5 to-transparent">
        <div className="max-w-4xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl font-bold text-center mb-12"
          >
            Perfect For People Who Already Have <span className="text-[#a3e635]">The Audience</span>
          </motion.h2>

          <div className="grid sm:grid-cols-2 gap-6">
            {[
              {
                icon: Users,
                title: "Agency Owners",
                description: "Your clients ask how you train VAs. Now you have an answer that pays you.",
              },
              {
                icon: TrendingUp,
                title: "Course Creators",
                description: "Students can't implement your course with dumb AI. This makes you look good AND pays.",
              },
              {
                icon: Zap,
                title: "VA Managers",
                description: "Every ops person you know is drowning in 'what did he mean' messages. You're the hero.",
              },
              {
                icon: DollarSign,
                title: "Twitter/X Operators",
                description: "One thread about OneDuo = passive income from your followers' subscriptions.",
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="p-6 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-[#a3e635]/30 transition-colors"
              >
                <item.icon className="w-8 h-8 text-[#a3e635] mb-4" />
                <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                <p className="text-white/60">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* The Math Section */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl font-bold mb-8"
          >
            The Math Is Stupid Simple
          </motion.h2>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="p-8 rounded-2xl bg-gradient-to-br from-[#a3e635]/10 to-transparent border border-[#a3e635]/20"
          >
            <div className="space-y-4 text-left max-w-md mx-auto">
              <div className="flex justify-between items-center py-2 border-b border-white/10">
                <span className="text-white/60">You refer 10 paying users</span>
                <span className="text-white font-mono">10 × $29/mo</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/10">
                <span className="text-white/60">Your 30% cut</span>
                <span className="text-[#a3e635] font-mono font-bold">$87/mo</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/10">
                <span className="text-white/60">After 1 year (they stay)</span>
                <span className="text-[#a3e635] font-mono font-bold">$1,044</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-white">100 referrals = </span>
                <span className="text-[#a3e635] font-mono font-bold text-2xl">$10,440/yr</span>
              </div>
            </div>
            
            <p className="text-white/50 text-sm mt-6">
              And that's just the base plan. Pro users pay more. You earn more.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Why Now Section */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="p-8 rounded-2xl bg-red-500/5 border border-red-500/20"
          >
            <div className="flex items-start gap-4">
              <Clock className="w-8 h-8 text-red-400 flex-shrink-0 mt-1" />
              <div>
                <h2 className="text-2xl font-bold mb-4 text-white">
                  Why Founding Affiliates Get Better Terms
                </h2>
                <div className="space-y-3 text-white/80">
                  <p>
                    We're pre-launch. We need distribution. You need proof it works.
                  </p>
                  <p>
                    So founding affiliates get:
                  </p>
                  <ul className="space-y-2 pl-4">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#a3e635]" />
                      <span><strong className="text-white">30% recurring</strong> (drops to 20% after launch)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#a3e635]" />
                      <span><strong className="text-white">Lifetime cookies</strong> (shortens to 90 days later)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#a3e635]" />
                      <span><strong className="text-white">Direct Slack access</strong> to founders</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#a3e635]" />
                      <span><strong className="text-white">Early access</strong> to new features for content</span>
                    </li>
                  </ul>
                  <p className="text-white/50 text-sm pt-4 border-t border-red-500/20">
                    These terms are locked for founding affiliates. Even after we tighten it for everyone else.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* The Psychology Section */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl font-bold mb-6"
          >
            The Real Win Condition
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-xl text-white/70 mb-8"
          >
            People don't share because something is good.
            <br />
            They share when:
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="grid sm:grid-cols-3 gap-4 mb-8"
          >
            {[
              { emoji: "🧠", text: "It makes them look smart" },
              { emoji: "💰", text: "It makes them money" },
              { emoji: "⚡", text: "It makes them early" },
            ].map((item, i) => (
              <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <span className="text-3xl mb-2 block">{item.emoji}</span>
                <p className="text-white/80">{item.text}</p>
              </div>
            ))}
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-2xl font-bold text-[#a3e635]"
          >
            OneDuo affiliates get all three.
          </motion.p>
        </div>
      </section>

      {/* CTA Section */}
      <section ref={formRef} className="py-20 px-4">
        <div className="max-w-xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="p-8 rounded-2xl bg-gradient-to-br from-[#1a2a1a] to-[#0f1a0f] border border-[#a3e635]/30"
          >
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4">
                Lock In Founding Affiliate Terms
              </h2>
              <p className="text-white/60">
                Enter your email. We'll send your unique affiliate link within 24 hours.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-4 rounded-xl bg-black/50 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-[#a3e635]/50 transition-colors"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 rounded-xl bg-[#a3e635] text-black font-bold text-lg hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  "Joining..."
                ) : (
                  <>
                    Get My Affiliate Link
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-white/10 space-y-2 text-center">
              <p className="text-white/40 text-sm flex items-center justify-center gap-2">
                <Shield className="w-4 h-4" />
                No spam. Just your link and affiliate resources.
              </p>
              <p className="text-white/30 text-xs">
                Founding terms locked for early signups only.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Final Push */}
      <section className="py-16 px-4 text-center">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-lg text-white/50 max-w-2xl mx-auto"
        >
          Someone in your audience will share OneDuo.
          <br />
          <span className="text-white font-medium">The only question is whether you're the one getting paid for it.</span>
        </motion.p>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Logo size="sm" />
            <span className="text-white/40 text-sm">© 2024 OneDuo</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-white/40">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Affiliate;
