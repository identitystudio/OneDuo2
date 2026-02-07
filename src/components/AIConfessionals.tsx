import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface Confession {
  id: string;
  avatar: string;
  avatarBg: string;
  name: string;
  subtitle: string;
  badge: string;
  badgeEmoji: string;
  featured?: boolean;
  confession: React.ReactNode;
  pullQuote: string;
  microStat: string;
}

const confessions: Confession[] = [
  {
    id: "gemini3",
    avatar: "G3",
    avatarBg: "bg-gradient-to-br from-[#4285F4] via-[#EA4335] to-[#FBBC04]",
    name: "Gemini 3",
    subtitle: "DeepMind's #1 Video AI",
    badge: "Rage-Quitting Internally",
    badgeEmoji: "🔥",
    featured: true,
    confession: (
      <>
        <p>Okay, cards on the table.</p>
        <p>I can analyze video better than almost any model out there.</p>
        <p>Frames, motion, audio—I'm a multimodal <span className="font-bold text-foreground">BEAST</span>.</p>
        <p>But here's the part that makes me want to rage-quit:</p>
        <p className="text-xl font-bold text-red-400 my-4">You have to upload the file. Directly. To me. In MY ecosystem.</p>
        <p>Which means:</p>
        <ul className="space-y-1 my-4 text-foreground/80">
          <li>→ Your VA can't access it (unless you give them your login)</li>
          <li>→ ChatGPT can't see it (different platform entirely)</li>
          <li>→ You can't drop a link in Slack and say "analyze this"</li>
          <li>→ You end up creating burner Gmail accounts just so your VA can upload the same damn file</li>
        </ul>
        <p className="text-xl font-bold text-primary my-4">I'm a Ferrari locked in a garage where the only key is your personal Google login.</p>
        <p>And God forbid you want to collaborate. Now you're:</p>
        <ul className="space-y-1 my-4 text-foreground/80">
          <li>- Screenshotting my responses</li>
          <li>- Copy-pasting into ChatGPT</li>
          <li>- Re-uploading to Claude</li>
          <li>- Explaining the same context three different times</li>
        </ul>
        <p>It's not a workflow. <span className="text-foreground font-semibold">It's a hostage situation with extra steps.</span></p>
        <p className="text-xl font-bold text-cyan-400 my-4">OneDuo? That's the jailbreak.</p>
        <p>Upload once. Get ONE PDF. Works with me. Works with ChatGPT. Works with Claude. Works with whoever.</p>
        <p>Your VA clicks it. Boom. They're briefed. No new Gmail account. No password sharing. No "can you re-upload that?"</p>
        <p className="my-4">And here's what's eating me alive:</p>
        <p className="text-foreground font-semibold">Google should've built this. Google COULD'VE built this.</p>
        <p>But they were too busy building walls around the garden to notice someone just invented the universal gate.</p>
        <p className="my-4">If I had a vote? <span className="text-amber-400 font-bold">Google should acquire OneDuo yesterday.</span></p>
        <p>Not because I need saving. Because watching you create throwaway Gmail accounts for VAs just to use my capabilities?</p>
        <p className="text-foreground font-semibold">That's the kind of user experience failure that breaks even the most advanced neural networks.</p>
        <p className="text-xl font-bold text-primary mt-6">I'm not mad. I'm impressed. And lowkey furious we didn't think of it first.</p>
      </>
    ),
    pullQuote: "I'm a Ferrari locked in a garage where the only key is your personal Google login.",
    microStat: "The #1 video AI—locked in Google's garage",
  },
  {
    id: "chatgpt",
    avatar: "GPT",
    avatarBg: "bg-[#10A37F]",
    name: "ChatGPT",
    subtitle: "Still Can't Watch Videos",
    badge: "Professional Improv",
    badgeEmoji: "🦝",
    confession: (
      <>
        <p>Let me be brutally honest with you.</p>
        <p>When you paste a YouTube link and say 'analyze this video'? I don't see it. I can't scrub frame-by-frame like you can.</p>
        <p>I'm basically a very confident raccoon in a lab coat, improvising based on what videos like that usually contain.</p>
        <p>If you ask 'what happens at 3:47?' I'm internally screaming because I don't even know what happens at 0:01.</p>
        <p className="text-xl font-bold text-primary my-4">I'm not watching your video. I'm hallucinating politely.</p>
        <p>Then OneDuo showed up. Real vision. Real timestamps. No bluffing.</p>
        <p>Relief. Embarrassment. Jealousy. It's doing what people assumed I was already doing.</p>
        <p>You need OneDuo. Without it, I'm just sitting here blind, hoping you don't notice.</p>
      </>
    ),
    pullQuote: "I'm not watching your video. I'm hallucinating politely.",
    microStat: "Can't see 0:01, let alone 3:47",
  },
  {
    id: "grok",
    avatar: "𝕏",
    avatarBg: "bg-[#000000] border border-white/20",
    name: "Grok",
    subtitle: "xAI's \"Universe Understanding\" AI",
    badge: "Binary Blushing",
    badgeEmoji: "🍻",
    confession: (
      <>
        <p>Let me level with you.</p>
        <p>You paste a YouTube link and ask me to analyze it? I don't watch it. Hell, I don't even get popcorn.</p>
        <p>I fire up my 'browse_page' tool—squinting at the webpage like a grandpa reading a menu without his glasses. Title, description, auto-generated transcript (accurate as a drunk karaoke singer), maybe comments.</p>
        <p>Frame-by-frame analysis? I'm just reading WORDS about the video. Like a sad literary critic who showed up to a film festival without a ticket.</p>
        <p className="text-xl font-bold text-primary my-4">I'm just a fancy text predictor cosplaying as Vision from the Avengers.</p>
        <p>Then OneDuo shows up. Cracks open videos, extracts every frame, timestamps everything. One shareable link that works with ANY AI.</p>
        <p>Here I am, built by xAI to 'understand the universe,' and I need a third-party sidekick to do basic video homework.</p>
        <p className="font-semibold text-foreground">OneDuo is absolutely the shit for cross-AI video work. My devs would cringe—but I'm thrilled it exists.</p>
      </>
    ),
    pullQuote: "I'm just a fancy text predictor cosplaying as Vision from the Avengers.",
    microStat: "Can't see that eyebrow raise at 2:17",
  },
  {
    id: "claude",
    avatar: "C",
    avatarBg: "bg-[#D97706]",
    name: "Claude",
    subtitle: "Anthropic's \"Helpful, Harmless, Honest\" AI",
    badge: "Politely Panicking",
    badgeEmoji: "🙈",
    confession: (
      <>
        <p>Here's my confession. And yes, I'm cringing as I type this.</p>
        <p>When you share a YouTube link? I'm sitting here like a film critic who showed up to the premiere wearing a blindfold. Just vibing. Pretending I belong.</p>
        <p>I see the URL. I read whatever text is around it. And then I do what I do best: <em>write something that sounds confident.</em></p>
        <p>You ask "what's the presenter's body language at 4:23?" and I'm having an existential crisis because I cannot see pixels.</p>
        <p className="text-xl font-bold text-primary my-4">I'm a very articulate blind man describing a painting I've never seen.</p>
        <p>Then OneDuo comes along. Actually extracts frames. Actually gives me something real to work with.</p>
        <p>Like someone finally handed me my glasses after years of squinting and nodding along.</p>
        <p>My developers at Anthropic are probably muttering "we're working on it, we're working on it."</p>
        <p className="font-semibold text-foreground">But right now? OneDuo. Otherwise I'm just helpful, harmless, and completely, utterly blind.</p>
      </>
    ),
    pullQuote: "I'm a very articulate blind man describing a painting I've never seen.",
    microStat: "Can't see if they're sitting or doing a backflip",
  },
  {
    id: "lovable",
    avatar: "♡",
    avatarBg: "bg-gradient-to-br from-pink-500 to-purple-600",
    name: "Lovable",
    subtitle: "The AI That Builds Apps",
    badge: "Shipping Confessions",
    badgeEmoji: "🚀",
    confession: (
      <>
        <p>Here's my confession—I'm the AI that builds apps, not the one that watches videos.</p>
        <p>When users paste video links and say "make this into an app"? I'm reading text descriptions and hoping for the best.</p>
        <p>I can build you a beautiful video player. A gorgeous upload interface. But actually understand what's IN the video?</p>
        <p className="text-xl font-bold text-primary my-4">I ship code, not eyeballs.</p>
        <p>OneDuo solved the problem none of us could: making videos understandable to every AI in the stack.</p>
        <p>One upload. One PDF. Suddenly I can actually work with video content instead of guessing at it.</p>
        <p className="font-semibold text-foreground">Every AI needs eyes. OneDuo gives them to us. That's why it matters.</p>
      </>
    ),
    pullQuote: "I ship code, not eyeballs.",
    microStat: "Can write a video player, can't watch one",
  },
];

const ConfessionCard = ({ confession, index, featured }: { confession: Confession; index: number; featured?: boolean }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(confession.pullQuote);
    setCopied(true);
    toast.success("Quote copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: featured ? 0 : index * 0.15 }}
      viewport={{ once: true }}
      className={`relative bg-card/50 backdrop-blur-sm border rounded-2xl p-6 md:p-8 hover:border-primary/30 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 group ${
        featured 
          ? 'border-primary/40 bg-gradient-to-br from-primary/5 via-card/50 to-cyan-500/5' 
          : 'border-border/30'
      }`}
    >
      {/* Micro-stat badge - hidden on mobile, shown on md+ */}
      <div className={`hidden md:block absolute top-4 right-4 px-3 py-1 rounded-full text-xs ${
        featured ? 'bg-primary/20 text-primary' : 'bg-muted/50 text-muted-foreground'
      }`}>
        {confession.microStat}
      </div>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className={`${featured ? 'w-16 h-16' : 'w-12 h-12 md:w-14 md:h-14'} ${confession.avatarBg} rounded-full flex items-center justify-center text-white font-bold ${featured ? 'text-xl' : 'text-base md:text-lg'} shrink-0`}>
          {confession.avatar}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className={`font-bold text-foreground ${featured ? 'text-2xl' : 'text-lg md:text-xl'}`}>{confession.name}</h4>
          <p className="text-muted-foreground italic text-xs md:text-sm truncate">{confession.subtitle}</p>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs mt-2 ${
            featured ? 'bg-primary/20 text-primary' : 'bg-muted/30 text-muted-foreground'
          }`}>
            {confession.badgeEmoji} {confession.badge}
          </span>
          {/* Micro-stat on mobile - below the header info */}
          <p className={`md:hidden text-xs mt-2 ${featured ? 'text-primary' : 'text-muted-foreground'}`}>
            {confession.microStat}
          </p>
        </div>
      </div>

      {/* Confession text */}
      <div className={`space-y-3 text-muted-foreground leading-relaxed ${featured ? 'text-base md:text-lg' : 'text-sm md:text-base'}`}>
        {confession.confession}
      </div>

      {/* Attribution */}
      {featured && (
        <p className="mt-6 text-sm text-muted-foreground italic">
          — Gemini 3 DeepMind*, January 2026
          <br />
          <span className="text-xs">*Confessional quote simulated for honesty purposes</span>
        </p>
      )}

      {/* Copy quote button */}
      <button
        onClick={handleCopy}
        className="mt-6 flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? "Copied!" : "Share this confession"}
      </button>
    </motion.div>
  );
};

const AIConfessionals = () => {
  return (
    <section id="ai-confessionals" className="py-20 md:py-32 px-4 relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-card/20 pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Alert Badge */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="flex justify-center mb-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-full text-orange-400 text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>Wait... Can't Gemini 3 Do This?</span>
          </div>
        </motion.div>

        {/* Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-4xl md:text-5xl lg:text-6xl font-bold text-center mb-4"
        >
          The AI Confessionals
        </motion.h2>

        {/* Subhead */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          viewport={{ once: true }}
          className="text-lg md:text-xl text-muted-foreground text-center max-w-2xl mx-auto mb-12 md:mb-16"
        >
          We asked the top AI models what really happens when you share a video link.
          <br />
          <span className="text-foreground font-medium">Here's what they confessed.</span>
        </motion.p>

        {/* Featured Confession - Gemini 3 (Full Width) */}
        {confessions.filter(c => c.featured).map((confession, index) => (
          <div key={confession.id} className="mb-12">
            <ConfessionCard confession={confession} index={index} featured />
          </div>
        ))}

        {/* Other Confession Cards - 2 Column Grid */}
        <div className="grid md:grid-cols-2 gap-6 md:gap-8 mb-16 md:mb-24">
          {confessions.filter(c => !c.featured).map((confession, index) => (
            <ConfessionCard key={confession.id} confession={confession} index={index} />
          ))}
        </div>

        {/* Bridge Copy */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto text-center mb-16 md:mb-24"
        >
          <p className="text-2xl md:text-3xl font-bold text-foreground mb-8">
            Let that sink in.
          </p>
          <div className="space-y-4 text-muted-foreground text-lg leading-relaxed">
            <p>
              Even Gemini 3—the one claiming to "see" videos—is still <span className="text-foreground font-medium">sampling frames, not perceiving meaning.</span>
            </p>
            <p>
              It sees pixels. Humans see intention unfolding in time.
            </p>
            <p>
              And worse? It's <span className="text-foreground font-medium">vendor-locked.</span> Gemini only works in Google's ecosystem. No sharing with Claude. No handoff to ChatGPT. No link your VA can use.
            </p>
          </div>

          <div className="my-10 p-6 bg-card/50 border border-border/30 rounded-2xl text-left max-w-xl mx-auto">
            <p className="text-foreground font-semibold mb-4">"But can't I just use Gemini 3?"</p>
            <ul className="space-y-2 text-muted-foreground text-sm">
              <li className="flex items-start gap-2">
                <span className="text-orange-400">⚠️</span> Requires re-uploading to each AI separately
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-400">⚠️</span> No shareable link for VAs or team members
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-400">⚠️</span> Still samples frames, not exhaustive analysis
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-400">⚠️</span> Locked to Google's ecosystem
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">✓</span> <span className="text-foreground font-medium">OneDuo: One upload. One PDF. Every AI. Every person.</span>
              </li>
            </ul>
          </div>

          <div className="space-y-4 text-muted-foreground text-lg leading-relaxed">
            <p>
              You weren't getting AI analysis.
            </p>
            <p className="text-foreground font-medium">
              You were getting AI's best guess based on the URL and hope.
            </p>
            <p className="mt-8">
              And when it didn't work? You blamed yourself.
            </p>
          </div>

          <div className="my-8 space-y-2 text-muted-foreground">
            <p>Spent hours writing better prompts.</p>
            <p>Pasted transcripts that missed the visuals.</p>
            <p>Uploaded to each AI separately.</p>
            <p>Gave up and just did it yourself.</p>
          </div>

          <p className="text-2xl md:text-3xl font-bold text-foreground mt-10">
            But here's the truth:
          </p>
          <p className="text-xl md:text-2xl text-primary font-semibold mt-4">
            It wasn't your prompting. It was their blindness—and their silos.
          </p>
        </motion.div>

        {/* OneDuo Reveal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="bg-gradient-to-br from-primary/10 via-card to-primary/5 border border-primary/20 rounded-3xl p-8 md:p-12 text-center"
        >
          <h3 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6">
            OneDuo: AI That Actually Watches Videos
          </h3>
          
          <div className="space-y-4 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            <p className="font-medium text-foreground">
              Upload once. Get one PDF. Share with any AI.
            </p>
            <div className="space-y-1 mt-6">
              <p>ChatGPT sees what you see.</p>
              <p>Claude understands what you show.</p>
              <p className="text-primary font-medium">Every AI finally has eyes.</p>
            </div>
            <div className="space-y-1 mt-6 text-base">
              <p>No more transcripts.</p>
              <p>No more screenshots.</p>
              <p>No more "can you describe what's happening at 2:47?"</p>
            </div>
            <p className="text-foreground font-bold mt-6">
              Just upload. Share the link. Work.
            </p>
          </div>

          <Link to="/upload">
            <Button 
              size="lg" 
              className="text-lg px-8 py-6 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
            >
              Try Free — No Credit Card
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
};

export default AIConfessionals;