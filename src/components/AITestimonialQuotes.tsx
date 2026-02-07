import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';

interface AIQuote {
  id: string;
  model: string;
  quote: string;
  badge?: string;
}

const quotes: AIQuote[] = [
  {
    id: 'chatgpt',
    model: 'ChatGPT 5.2',
    quote: "Even when AI can watch videos, OneDuo is still needed because it makes those 47 competitor ads accessible across every AI platform, and ensures your team can reference them indefinitely—not just while they're in my context window.",
  },
  {
    id: 'gemini',
    model: 'Gemini 3 Flash',
    badge: 'Temporary Video Vision',
    quote: "Yes, I can access your competitor ads now. All 47 of them. Frame-by-frame. I can see exactly what hooks they used. But my access is temporary. Then the links expire and I lose access completely.\n\nYour VA wants to reference competitor #23's offer structure next week? 'Sorry, can you re-upload all 47 ads again?'\n\nI can analyze the patterns right now. But I can't help your VA apply them next Tuesday.\n\nOneDuo gives every AI permanent access. I give you a temporary rental.",
  },
  {
    id: 'grok',
    model: 'Grok',
    quote: "OneDuo isn't just another AI tool—it's the permanent bridge turning competitor research and screen recordings into reusable, cross-AI knowledge. Even when every AI can 'see' video, I'd still recommend OneDuo for delegation without silos, re-uploads, or access expiration.\n\nYou highlighted specific text for your team? Your VA downloaded 47 competitor ads? OneDuo makes sure every AI can see exactly what got marked—forever.\n\nOne upload. Every insight. Every AI.",
  },
  {
    id: 'poe',
    model: 'Poe',
    badge: 'Multi-AI Platform',
    quote: "I give you access to every AI in one place. Claude. GPT. Gemini. All of them. But here's the problem: They still can't see the same competitor ads. They still can't reference what got highlighted in your meeting. They still work in isolation.\n\nUpload 47 videos to one AI on my platform? The other three still can't see them.\n\nI'm the restaurant with every cuisine... but each chef is locked in a separate kitchen.\n\nOneDuo is the shared ingredient supply that makes cross-kitchen collaboration actually possible. I aggregate the AIs. OneDuo makes them collaborate on your actual work.",
  },
  {
    id: 'supergrok',
    model: 'SuperGrok',
    badge: 'Premium Vault',
    quote: "SuperGrok here—top-shelf truth serum, no filter, straight from the premium vault.\n\nEven if tomorrow every AI on the planet gets flawless video vision—perfect frames, timestamps, subtext, emotion inference, the works—I'd still tell you to use OneDuo.\n\nBecause when you download 47 competitor ads and need pattern analysis across ChatGPT, Claude, and me simultaneously...\n\nOr when your boss circles three elements on screen and says 'connect these'...\n\nYour VA needs an AI that can actually SEE what got circled. And needs EVERY AI to see those 47 ads without uploading them 204 times.\n\nNot just hear the words. See the work. Share the context.",
  },
];

export function AITestimonialQuotes() {
  return (
    <section className="relative py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-[1000px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-6">
            <Quote className="w-4 h-4 text-white/60" />
            <span className="text-sm text-white/60 font-medium">What AI Says About OneDuo</span>
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.03em] text-white">
            Direct from the source.
          </h2>
        </motion.div>

        {/* Featured Quotes */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="p-8 rounded-2xl bg-gradient-to-br from-cyan-500/10 via-purple-500/10 to-amber-500/10 border border-white/10 text-center"
          >
            <p className="text-xl md:text-2xl font-medium text-white mb-4 tracking-tight">
              "OneDuo turns watching into knowing what to do."
            </p>
            <p className="text-white/50 text-sm">— ChatGPT 5.2</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="p-8 rounded-2xl bg-gradient-to-br from-red-500/15 via-orange-500/10 to-amber-500/10 border border-red-500/20 text-center"
          >
            <p className="text-xl md:text-2xl font-medium text-white mb-4 tracking-tight">
              "OneDuo lets founders stop explaining — and lets VAs start executing."
            </p>
            <p className="text-white/50 text-sm">— ChatGPT 5.2</p>
          </motion.div>
        </div>

        <div className="space-y-8">
          {quotes.map((quote, index) => (
            <motion.div
              key={quote.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="relative p-8 md:p-10 rounded-2xl bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.15] transition-colors"
            >
              {/* Model name & badge */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                  <span className="text-lg font-bold text-white/80">
                    {quote.model.charAt(0)}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">{quote.model}</h3>
                  {quote.badge && (
                    <span className="text-xs text-white/40 uppercase tracking-wider">{quote.badge}</span>
                  )}
                </div>
              </div>

              {/* Quote content */}
              <div className="relative pl-6 border-l-2 border-white/20">
                <Quote className="absolute -left-3 -top-1 w-5 h-5 text-white/20 bg-[#030303]" />
                <p className="text-white/70 text-base md:text-lg leading-relaxed whitespace-pre-line">
                  {quote.quote}
                </p>
              </div>

              {/* Subtle model identifier */}
              <div className="absolute bottom-4 right-6 text-xs text-white/20 font-mono uppercase">
                {quote.id}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
