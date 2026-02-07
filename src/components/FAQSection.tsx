import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { HelpCircle, Search, X } from 'lucide-react';

export interface FAQItem {
  question: string;
  answer: string;
  category?: string;
}

interface FAQSectionProps {
  title?: string;
  subtitle?: string;
  faqs: FAQItem[];
  className?: string;
  variant?: 'default' | 'compact' | 'card' | 'full';
  showSearch?: boolean;
  showCategories?: boolean;
}

export function FAQSection({ 
  title = "Frequently Asked Questions", 
  subtitle,
  faqs, 
  className = "",
  variant = 'default',
  showSearch = false,
  showCategories = false
}: FAQSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Filter FAQs based on search query and category
  const filteredFAQs = useMemo(() => {
    let results = faqs;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      results = results.filter(
        faq => 
          faq.question.toLowerCase().includes(query) || 
          faq.answer.toLowerCase().includes(query)
      );
    }
    
    if (activeCategory) {
      results = results.filter(faq => faq.category === activeCategory);
    }
    
    return results;
  }, [faqs, searchQuery, activeCategory]);

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    faqs.forEach(faq => {
      if (faq.category) cats.add(faq.category);
    });
    return Array.from(cats);
  }, [faqs]);

  const SearchInput = () => (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input
        placeholder="Search questions..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
      />
      {searchQuery && (
        <button
          onClick={() => setSearchQuery('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  if (variant === 'compact') {
    return (
      <div className={className}>
        {showSearch && (
          <div className="mb-4">
            <SearchInput />
          </div>
        )}
        <Accordion type="single" collapsible className="space-y-2">
          {filteredFAQs.map((faq, index) => (
            <AccordionItem 
              key={index} 
              value={`item-${index}`}
              className="border border-border/50 rounded-lg bg-card/30 px-4 overflow-hidden"
            >
              <AccordionTrigger className="text-sm text-foreground hover:no-underline py-3">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-3">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
          {filteredFAQs.length === 0 && searchQuery && (
            <p className="text-center text-muted-foreground py-4">No questions match your search.</p>
          )}
        </Accordion>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className={`bg-card/50 border border-border/50 rounded-xl p-4 ${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <HelpCircle className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        {showSearch && (
          <div className="mb-3">
            <SearchInput />
          </div>
        )}
        <Accordion type="single" collapsible className="space-y-1">
          {filteredFAQs.map((faq, index) => (
            <AccordionItem 
              key={index} 
              value={`item-${index}`}
              className="border-b border-border/30 last:border-0"
            >
              <AccordionTrigger className="text-sm text-foreground/80 hover:text-foreground hover:no-underline py-2">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-2">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
          {filteredFAQs.length === 0 && searchQuery && (
            <p className="text-center text-muted-foreground py-4 text-sm">No results found.</p>
          )}
        </Accordion>
      </div>
    );
  }

  // Full variant - for Help Center page
  if (variant === 'full') {
    return (
      <div className={className}>
        {/* Search */}
        <div className="mb-8">
          <SearchInput />
          {searchQuery && (
            <p className="text-sm text-white/50 mt-2">
              {filteredFAQs.length} result{filteredFAQs.length !== 1 ? 's' : ''} for "{searchQuery}"
            </p>
          )}
        </div>

        {/* Category filters */}
        {showCategories && categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            <button
              onClick={() => setActiveCategory(null)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                !activeCategory 
                  ? 'bg-emerald-500 text-black' 
                  : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === cat 
                    ? 'bg-emerald-500 text-black' 
                    : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* FAQ List */}
        <Accordion type="single" collapsible className="space-y-3">
          {filteredFAQs.map((faq, index) => (
            <AccordionItem 
              key={index} 
              value={`item-${index}`}
              className="border border-white/[0.08] rounded-xl bg-white/[0.02] px-6 overflow-hidden hover:border-white/[0.15] transition-colors"
            >
              <AccordionTrigger className="text-left text-white/90 hover:text-white hover:no-underline py-5 text-base">
                <div className="flex flex-col items-start gap-1">
                  {faq.category && (
                    <span className="text-xs text-emerald-400/80 font-medium">{faq.category}</span>
                  )}
                  <span>{faq.question}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-white/60 pb-5 leading-relaxed">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
          {filteredFAQs.length === 0 && (
            <div className="text-center py-12">
              <HelpCircle className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <p className="text-white/60">
                {searchQuery ? `No questions match "${searchQuery}"` : 'No questions in this category.'}
              </p>
            </div>
          )}
        </Accordion>
      </div>
    );
  }

  // Default variant - full section style for Landing page with category grouping
  const groupedByCategory = useMemo(() => {
    const groups: Record<string, FAQItem[]> = {};
    filteredFAQs.forEach(faq => {
      const cat = faq.category || 'General';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(faq);
    });
    return groups;
  }, [filteredFAQs]);

  const categoryOrder = [
    "Who Is This For?",
    "Use Cases",
    "How It's Different",
    "Getting Started",
    "Results",
    "What OneDuo Captures",
    "Privacy & Security",
    "Pricing"
  ];

  const sortedCategories = Object.keys(groupedByCategory).sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a);
    const bIndex = categoryOrder.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return (
    <section className={`relative py-16 sm:py-24 px-4 sm:px-6 ${className}`}>
      <div className="max-w-[900px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            {title}
          </h2>
          {subtitle && (
            <p className="text-white/60">{subtitle}</p>
          )}
        </motion.div>

        {showSearch && (
          <div className="mb-8">
            <SearchInput />
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="space-y-10"
        >
          {sortedCategories.map((category) => (
            <div key={category}>
              <h3 className="text-lg font-semibold text-emerald-400 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                {category}
              </h3>
              <Accordion type="single" collapsible className="space-y-3">
                {groupedByCategory[category].map((faq, index) => (
                  <AccordionItem 
                    key={`${category}-${index}`} 
                    value={`${category}-item-${index}`}
                    className="border border-white/[0.08] rounded-xl bg-white/[0.02] px-6 overflow-hidden hover:border-white/[0.15] transition-colors"
                  >
                    <AccordionTrigger className="text-left text-white/90 hover:text-white hover:no-underline py-5 text-base">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-white/60 pb-5 leading-relaxed">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}
          {filteredFAQs.length === 0 && searchQuery && (
            <div className="text-center py-8">
              <p className="text-white/60">No questions match your search.</p>
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}

// Pre-defined FAQ sets for each page
export const landingFAQs: FAQItem[] = [
  // SECTION 1: WHO IS THIS FOR? (Identity Constraints)
  {
    question: "I'm not technical. Can I actually use this?",
    answer: "If you can record a Loom video explaining how you do something, you can use OneDuo. You're not building code. You're not engineering prompts. You're simply showing the AI how YOU think through decisions—the same way you'd train a junior team member. OneDuo translates your visual expertise into machine-executable intelligence. No engineering degree required.",
    category: "Who Is This For?"
  },
  {
    question: "I'm already using AI tools. Why do I need OneDuo?",
    answer: "Because current AI tools make you dumber, not smarter. ChatGPT, Claude, Gemini—they're all REACTIVE tools. You ask. They answer. But they can't REPLICATE your expertise. They can't EXECUTE your judgment. They can't SCALE your decision-making. OneDuo doesn't replace your current AI tools. It's the infrastructure layer that turns YOUR genius into something those tools can actually execute. It's the difference between asking AI to 'write me a sales email' (generic garbage) vs. Having AI execute YOUR sales methodology across 1,000 clients simultaneously.",
    category: "Who Is This For?"
  },
  {
    question: "What if I don't consider myself an 'expert'?",
    answer: "You don't need to be Tony Robbins or Elon Musk. You just need to know how to do ONE thing better than most people. Could be: How you close sales calls. How you analyze rental properties. How you edit videos for maximum retention. How you structure coaching sessions. How you evaluate job candidates. If people pay you for your judgment in ANY area, you have capturable expertise. OneDuo makes it executable.",
    category: "Who Is This For?"
  },
  {
    question: "Does this mean I can stop buying courses and workshops and attending summits?",
    answer: "No — and that's the beauty of OneDuo. We NEED you to keep learning from the best. Keep buying those VIP tickets. Keep getting the recordings. Keep attending the summits where the real insights happen. OneDuo doesn't replace human expertise — it requires it. The difference is now that knowledge doesn't rot in your downloads folder. That $5,000 mastermind recording? OneDuo turns it into executable intelligence. That summit keynote that changed your perspective? Now it's a Thinking Layer you can actually deploy. Keep investing in your education. OneDuo just makes sure you finally get the ROI you deserve.",
    category: "Who Is This For?"
  },

  // SECTION 2: WHAT CAN I ACTUALLY DO WITH THIS? (Use Case Scenarios)
  {
    question: "I run a coaching business. How does OneDuo help me?",
    answer: "Right now, your genius dies with every client session. Client asks a question. You give brilliant advice. Session ends. Next client asks the SAME question. You give the SAME advice. Again. Your expertise is trapped in 1:1 delivery. With OneDuo: You record yourself coaching ONE client through your methodology. OneDuo captures how you diagnose their real problem, what questions you ask to uncover root issues, how you structure breakthrough moments, what frameworks you deploy for specific situations. Now that coaching session becomes executable intelligence. An AI can replicate your methodology across 100 clients simultaneously. Instead of spending 20 hours/week on coaching calls, you spend 2 hours recording your frameworks, let OneDuo-powered AI handle initial client diagnosis, and only step in for high-leverage breakthrough moments.",
    category: "Use Cases"
  },
  {
    question: "I'm in sales/lead generation. What's my use case?",
    answer: "You have a 'golden sales call' recording buried somewhere. The one where everything clicked. Where the prospect was nodding. Where the close felt effortless. That call contains YOUR complete sales methodology: How you build rapport. What questions reveal buying intent. How you handle objections. When you know it's time to close. With OneDuo: Feed that call into the system. OneDuo extracts your exact questioning sequence, objection-handling frameworks, tonality patterns, and closing triggers. Now train AI to replicate that call structure across every prospect conversation. Your SDRs stop winging it. Your follow-up emails sound like YOU wrote them. Your qualifying questions filter out tire-kickers automatically. Your closing rate becomes predictable (because it's systematized).",
    category: "Use Cases"
  },
  {
    question: "I create content. How does this help me?",
    answer: "You've made 500+ pieces of content. Some bombed. Some went viral. But you can't explain WHY certain hooks work and others don't. With OneDuo: Record yourself analyzing your top 20 performing videos/posts. Talk through why this hook stopped the scroll, what pattern made this relatable, how this structure built curiosity, why this CTA drove action. OneDuo captures YOUR content instinct as executable criteria. Instead of 'hoping' your next video hits, you feed your draft hook into OneDuo-powered analysis, get instant feedback based on YOUR proven patterns, iterate until it matches your viral formula, and ship with confidence (because it's YOUR methodology, scaled).",
    category: "Use Cases"
  },
  {
    question: "I hire/manage people. What's my use case?",
    answer: "You've interviewed 200+ candidates. You can spot a great hire in 10 minutes. But you can't explain your gut instinct to your HR team. With OneDuo: Record yourself reviewing 10 candidate applications—5 you'd hire, 5 you'd reject. Talk through what red flags you spot in resumes, what answers reveal real competence vs. BS, how you assess culture fit, what questions separate A-players from pretenders. OneDuo turns your hiring instinct into executable screening criteria. AI pre-screens every application using YOUR criteria. Only qualified candidates reach your calendar. Your interview time drops 80%. Your mis-hire rate plummets.",
    category: "Use Cases"
  },
  {
    question: "I analyze deals/investments. How does this work for me?",
    answer: "You've evaluated 1,000+ deals. You know a winner when you see one. But your decision-making process is locked in your head. With OneDuo: Record yourself analyzing 5 deals you passed on and 5 you invested in. Walk through what numbers you look at first, what red flags kill deals instantly, how you assess risk/reward ratios, what 'gut checks' you always run. OneDuo captures your deal evaluation framework. AI filters 100 deals down to the 3 worth your time. Your analysts learn to think like YOU. Your portfolio quality improves (consistent criteria). You stop wasting weekends reviewing garbage deals.",
    category: "Use Cases"
  },

  // SECTION 3: HOW IS THIS DIFFERENT? (Competitive Constraints)
  {
    question: "How is this different from just recording SOPs or training videos?",
    answer: "SOPs are static instructions. Training videos are passive consumption. Neither one creates executable intelligence. OneDuo doesn't just document what you do. It captures HOW you think—your decision trees, your judgment calls, your pattern recognition—and makes it machine-executable. The difference: SOP says 'To qualify a lead, ask these 5 questions.' Training Video says 'Watch me ask these 5 questions on a call.' OneDuo Thinking Layer captures 'Here's how I DECIDE which questions to ask based on how they answered the PREVIOUS question, what their tonality reveals about buying intent, and what objections I'm sensing beneath their surface answers.' One is a checklist. One is a lecture. OneDuo is replicated expertise.",
    category: "How It's Different"
  },
  {
    question: "Can't I just hire someone and train them to do this?",
    answer: "You can. And you should. But here's what happens: Year 1: Junior person learns 30% of your methodology. Year 2: They leave for a competitor. Year 3: You start over with someone new. Meanwhile your expertise walks out the door every time someone quits. With OneDuo: Your expertise gets captured ONCE. Gets better over time (as you refine it). Never quits. Never forgets. Never needs a raise. And you can STILL hire people—except now they're learning from a perfected version of your methodology, not a watered-down interpretation.",
    category: "How It's Different"
  },
  {
    question: "Why can't I just use ChatGPT with good prompts?",
    answer: "Because ChatGPT doesn't know how YOU think. It knows how the AVERAGE person thinks (based on internet training data). Prompt engineering is just begging a generic AI to pretend it understands your context, re-explaining your methodology every single time, hoping it guesses what you meant, getting 70% accuracy at best. OneDuo is teaching AI your ACTUAL decision-making framework, capturing your expertise as permanent infrastructure, executing your judgment with YOUR level of precision, scaling your genius without degradation. One is renting. One is owning.",
    category: "How It's Different"
  },

  // SECTION 4: PRACTICAL CONCERNS (Resource/Implementation Constraints)
  {
    question: "How long does it take to set up?",
    answer: "First working Thinking Layer: 1-2 hours. Record 2-3 videos showing how you do something. Upload to OneDuo. AI analyzes and structures your expertise. You refine/test. Done. Then every additional expertise layer you add takes 30-60 minutes. The more you feed it, the smarter your infrastructure gets.",
    category: "Getting Started"
  },
  {
    question: "What if my expertise changes?",
    answer: "Then you update your Thinking Layer. Record a new video showing your evolved methodology. OneDuo updates the infrastructure. Your AI execution improves instantly. Unlike retraining entire teams (months), rewriting SOPs (weeks), updating training programs (forever)—OneDuo updates take minutes.",
    category: "Getting Started"
  },
  {
    question: "Do I need to understand AI or prompt engineering?",
    answer: "No. You need to understand YOUR expertise. OneDuo handles the translation.",
    category: "Getting Started"
  },
  {
    question: "What if I work in a regulated industry?",
    answer: "OneDuo doesn't replace human judgment in regulated decisions. It augments your process by ensuring consistency in evaluation criteria, documenting decision-making frameworks, flagging items that need human review, and scaling your expertise without cutting corners. You stay in control. AI executes YOUR standards.",
    category: "Getting Started"
  },

  // SECTION 5: RESULTS & PROOF (Belief Constraints)
  {
    question: "What kind of results should I expect?",
    answer: "Depends on what you're scaling. Common outcomes: Coaching/Consulting: 60-80% reduction in 1:1 time, ability to serve 5-10x more clients, consistent delivery quality. Sales/Lead Gen: 40-60% improvement in close rates, 70-80% reduction in unqualified conversations, predictable revenue (systematized process). Content Creation: 3-5x faster production, higher consistency in quality, viral patterns become repeatable. Hiring/Team Management: 80% reduction in interview time, 50-70% improvement in hire quality, faster team onboarding.",
    category: "Results"
  },
  {
    question: "How do I know this will work for MY specific expertise?",
    answer: "If people currently pay you for your judgment, it will work. If your expertise can be explained to another human, it can be captured by OneDuo. If you've ever thought 'I wish I could clone myself,' this is how.",
    category: "Results"
  },

  // EXISTING TECHNICAL FAQs (keeping the most important ones)
  {
    question: "Does OneDuo hear music and sound effects in my video?",
    answer: "Yes! OneDuo picks up music, sound effects, and background audio — and understands what they mean. So instead of just 'music detected,' you'll see notes like '[upbeat music kicks in]' or '(audience laughs)' so AI gets the vibe, not just the noise. The PDF isn't for you to read — it's for AI, so you're both on the same page before work begins.",
    category: "What OneDuo Captures"
  },
  {
    question: "Can OneDuo read text on screen — captions, slides, UI elements?",
    answer: "Absolutely. OneDuo reads everything visible: slides, captions, buttons, menus, highlighted text, even handwritten whiteboard notes. All tied to timestamps so AI knows exactly when each thing appeared. No more hallucinations or AI going down rabbit holes — it sees exactly what you showed.",
    category: "What OneDuo Captures"
  },
  {
    question: "Does it capture where I click and what I highlight?",
    answer: "Yes. OneDuo notices where your cursor goes, what you click, how long you hover on something, and what you highlight. If you pause on a button before clicking, OneDuo tells AI 'this matters.' AI now guides you based on YOUR workflow, not generic advice.",
    category: "What OneDuo Captures"
  },
  {
    question: "What about tone of voice — can AI tell if I'm emphasizing something?",
    answer: "Yes! OneDuo picks up on how you say things, not just what you say. If you slow down for emphasis or pause dramatically, it shows up in the transcript as notes like '(spoken with emphasis)' or '(long pause for effect).' AI won't miss the important parts.",
    category: "What OneDuo Captures"
  },
  {
    question: "Is my video kept or deleted?",
    answer: "Your original video is automatically deleted within 24 hours. We only keep the extracted intelligence (frames, transcript, AI notes). Your content doesn't sit on our servers.",
    category: "Privacy & Security"
  },
  {
    question: "Can I try before paying?",
    answer: "Yes — your first upload is completely free, no credit card needed. See exactly what you get before deciding.",
    category: "Pricing"
  },
];

export const uploadFAQs: FAQItem[] = [
  {
    question: "What happens after I upload?",
    answer: "Your video is uploaded to our secure cloud, then automatically processed: transcription, frame extraction, AI context generation, and PDF creation. You'll receive an email when it's ready (usually 5-15 minutes).",
    category: "Processing"
  },
  {
    question: "Can I close this tab after uploading?",
    answer: "Yes! Once you see the upload progress bar reach 100%, you can safely close the tab. All processing happens in the cloud. We'll email you when your artifact is ready.",
    category: "Processing"
  },
  {
    question: "What video formats are supported?",
    answer: "We support MP4, MOV, AVI, MKV, WebM, and most common video formats. If your video plays on your computer, it will likely work with OneDuo.",
    category: "Upload"
  },
  {
    question: "What's the file size limit?",
    answer: "There's no hard limit — our cloud processes videos of any size. Large videos (1GB+) may take longer to upload depending on your internet speed, but processing time scales with video length, not file size.",
    category: "Upload"
  },
  {
    question: "When will I get my email?",
    answer: "Typically 5-15 minutes after upload completes, depending on video length. Check your spam folder if you don't see it. The email contains direct download links for your PDF and shareable URL.",
    category: "Processing"
  },
  {
    question: "Is my video secure during upload?",
    answer: "Yes. Videos are encrypted in transit (TLS), processed in isolated cloud containers, and automatically deleted within 24 hours. Only the extracted intelligence (frames, transcript) is retained.",
    category: "Privacy & Security"
  },
];

export const dashboardFAQs: FAQItem[] = [
  {
    question: "How do I share this with my VA or team?",
    answer: "Click the 'Share' button to copy a direct PDF download link, or use 'AI Link' to copy a URL they can paste directly into any AI chat. Make sure 'Public' sharing is enabled for external access.",
    category: "Sharing"
  },
  {
    question: "What's the difference between the PDF and the AI Link?",
    answer: "The PDF is a downloadable file (15-20MB) optimized for uploading to ChatGPT. The AI Link is a URL that AI can read directly when pasted into chat. Both contain the same information — use whichever is more convenient.",
    category: "Usage"
  },
  {
    question: "Why is my video still processing?",
    answer: "Processing typically takes 5-15 minutes per video. If it's been longer, the status may show 'Stalled' — click 'Smart Fix' to retry automatically. Very long videos (1+ hour) may take up to 30 minutes.",
    category: "Processing"
  },
  {
    question: "Can I add more modules to this course?",
    answer: "Yes! Click 'Add Videos' on any training block to upload additional modules. They'll be processed and added to the same collection automatically.",
    category: "Usage"
  },
  {
    question: "What does 'Stalled' mean?",
    answer: "Stalled means processing paused unexpectedly (usually due to a temporary cloud issue). Click 'Smart Fix' to retry — this resolves most issues automatically. If it persists, our support bot can help.",
    category: "Troubleshooting"
  },
  {
    question: "How do I delete a module?",
    answer: "Click the three-dot menu on any module card and select 'Delete'. This permanently removes the module and its extracted data. Original videos are already auto-deleted after 24 hours.",
    category: "Usage"
  },
];

// All FAQs combined for Help Center
export const allFAQs: FAQItem[] = [
  ...landingFAQs,
  ...uploadFAQs.filter(faq => !landingFAQs.some(l => l.question === faq.question)),
  ...dashboardFAQs,
];
