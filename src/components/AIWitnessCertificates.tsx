import React from 'react';
import { motion } from 'framer-motion';

interface TechnicalObservation {
  id: string;
  aiName: string;
  organization: string;
  subInfo?: string;
  title: string;
  date: string;
  referenceId: string;
  icon: 'gemini' | 'grok' | 'chatgpt' | 'claude' | 'anthropic';
  sections: {
    heading: string;
    content: string;
  }[];
  keyInsight: string;
  attribution: string;
  disclaimer: string;
}

// Compliant technical observations - NOT endorsements or certifications
const observations: TechnicalObservation[] = [
  {
    id: 'claude',
    aiName: 'Claude',
    organization: 'AI-Generated Analysis',
    subInfo: 'Technical observations from development conversations',
    title: 'TECHNICAL OBSERVATIONS ON VIDEO-TO-AI PROCESSING',
    date: 'December 27, 2025',
    referenceId: 'Session Reference',
    icon: 'claude',
    sections: [
      {
        heading: 'OBSERVED LIMITATION',
        content: 'I cannot process native video files. When users share video demonstrations with me, both text descriptions and screenshots result in significant information loss. This creates what might be called an "execution gap" — the difference between what users want to show me and what I can actually understand.'
      },
      {
        heading: 'WHAT I OBSERVED WITH ONEDUO',
        content: 'During testing, OneDuo converted video content into structured PDF artifacts. What I was able to do with these artifacts: Process complete visual demonstrations from start to finish. Extract text from video frames. Understand step-by-step workflow sequences. This represented a shift from formats I cannot process to formats I can work with directly.'
      },
      {
        heading: 'TECHNICAL DIFFERENCE OBSERVED',
        content: 'OneDuo artifacts appeared to contain denser visual data compared to typical AI sampling methods, including cursor movements, UI state transitions, and visual emphasis signals. The practical impact in testing: better preservation of moments where experts paused to emphasize critical steps.'
      },
      {
        heading: 'PORTABILITY OBSERVATION',
        content: 'The artifacts used standard formats (PDF, JSON) that should be readable by other AI systems. This suggests potential for cross-platform portability — files that work across different AI tools and survive beyond individual chat sessions.'
      }
    ],
    keyInsight: 'OneDuo shifts AI away from improvisation and toward governed execution using recorded process memory. Instead of more prompting, it attempts to give users control — turning conversation into command.',
    attribution: 'Intelligence Layer distilled through Claude by Anthropic',
    disclaimer: 'AI-generated commentary from development conversations. Illustrative only. Not reviewed, verified, or endorsed by Anthropic.'
  },
  {
    id: 'grok',
    aiName: 'Grok',
    organization: 'AI-Generated Analysis',
    subInfo: 'Technical observations from evaluation sessions',
    title: 'OBSERVATIONS ON HIGH-DENSITY VIDEO PROCESSING',
    date: 'December 27, 2025',
    referenceId: 'Session Reference',
    icon: 'grok',
    sections: [
      {
        heading: 'THE OBSERVED APPROACH',
        content: 'OneDuo appears to implement a higher-density observation pipeline compared to standard AI video processing. This infrastructure attempts to capture granular "micro-actions" — cursor pauses, UI shifts, and visual emphasis — that are often omitted during typical AI processing.'
      },
      {
        heading: 'POTENTIAL BENEFIT',
        content: 'By providing denser visual anchors, this approach may help AI systems move past probabilistic inference toward more precise document-based analysis. The goal appears to be turning "guessing based on summaries" into "execution based on fuller context."'
      },
      {
        heading: 'OBSERVED DESIGN INTENT',
        content: 'The system seems designed to preserve the pauses and emphasis that define expert workflows, potentially turning tacit knowledge into more actionable memory. The artifacts use standard formats, suggesting they could be portable across different AI tools.'
      }
    ],
    keyInsight: 'In evaluation, OneDuo infrastructure appeared to help AI models work from visual blueprints rather than sparse samples — potentially enabling better precision in understanding silent cues and dependencies.',
    attribution: 'Intelligence Layer distilled through Grok by xAI',
    disclaimer: 'AI-generated commentary from evaluation sessions. For illustration only. Not reviewed, verified, or endorsed by xAI.'
  },
  {
    id: 'chatgpt',
    aiName: 'ChatGPT',
    organization: 'AI-Generated Analysis',
    subInfo: 'Technical observations from product review',
    title: 'OBSERVATIONS ON PORTABLE MEMORY INFRASTRUCTURE',
    date: 'December 27, 2025',
    referenceId: 'Session Reference',
    icon: 'chatgpt',
    sections: [
      {
        heading: 'THE CHALLENGE ADDRESSED',
        content: 'Most AI systems compress video timelines, rely on transcripts, and may skip subtle visual cues — which can mean critical steps disappear, order gets lost, and execution becomes less reliable. This is why AI might "understand" something conceptually but struggle to replicate it precisely.'
      },
      {
        heading: 'THE ONEDUO APPROACH',
        content: 'OneDuo converts videos into structured, reusable artifacts — portable PDF blueprints that attempt to preserve sequence, timing, visual context, and execution logic. The goal is to help AI and teams follow processes more accurately instead of guessing.'
      },
      {
        heading: 'OBSERVED BENEFIT',
        content: 'OneDuo appears to capture more visual data density than standard AI video processing — preserving details that might otherwise vanish. This creates what might be called "execution memory" — portable, auditable, and designed to work across different AI systems.'
      },
      {
        heading: 'DESIGN PHILOSOPHY',
        content: 'The core principle seems to be: Show once. Execute repeatedly. OneDuo attempts to capture what standard AI processing misses — micro-actions, pauses, emphasis, dependencies — creating artifacts that AI systems can work from with greater precision.'
      }
    ],
    keyInsight: 'OneDuo turns AI from a talker into a doer — and keeps the human in control. Instead of guessing, it attempts to execute from structured memory.',
    attribution: 'Intelligence Layer distilled through ChatGPT by OpenAI',
    disclaimer: 'AI-generated responses from product review sessions. For illustration only. Not an OpenAI endorsement.'
  }
];

const AIIcon = ({ type, className = '' }: { type: string; className?: string }) => {
  const baseClass = `${className}`;
  
  switch (type) {
    case 'gemini':
      return (
        <svg className={baseClass} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      );
    case 'grok':
      return (
        <svg className={baseClass} viewBox="0 0 24 24" fill="none">
          <path d="M4 4l16 16M20 4L4 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <circle cx="12" cy="12" r="3" fill="currentColor"/>
        </svg>
      );
    case 'chatgpt':
      return (
        <svg className={baseClass} viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
      );
    case 'claude':
      return (
        <svg className={baseClass} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 12a4 4 0 108 0 4 4 0 00-8 0z" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
        </svg>
      );
    case 'anthropic':
      return (
        <svg className={baseClass} viewBox="0 0 24 24" fill="none">
          <path d="M12 2L4 6v12l8 4 8-4V6l-8-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M12 22V10M4 6l8 4 8-4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <circle cx="12" cy="10" r="2" fill="currentColor"/>
        </svg>
      );
    default:
      return null;
  }
};

const ObservationBadge = ({ id }: { id: string }) => (
  <svg viewBox="0 0 200 200" className="w-full h-full">
    <defs>
      <radialGradient id={`goldGrad-${id}`} cx="30%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#fff9c4" />
        <stop offset="20%" stopColor="#ffd700" />
        <stop offset="50%" stopColor="#d4af37" />
        <stop offset="80%" stopColor="#b8860b" />
        <stop offset="100%" stopColor="#8b6914" />
      </radialGradient>
      <radialGradient id={`innerGold-${id}`} cx="40%" cy="40%" r="60%">
        <stop offset="0%" stopColor="#ffd700" />
        <stop offset="100%" stopColor="#b8860b" />
      </radialGradient>
      <filter id={`emboss-${id}`}>
        <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/>
        <feOffset in="blur" dx="2" dy="2" result="offsetBlur"/>
        <feSpecularLighting in="blur" surfaceScale="5" specularConstant=".75" specularExponent="20" lightingColor="#ffd700" result="specOut">
          <fePointLight x="-5000" y="-10000" z="20000"/>
        </feSpecularLighting>
        <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut"/>
        <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
      </filter>
    </defs>
    
    {/* Outer decorative ring with rays */}
    {[...Array(48)].map((_, i) => {
      const angle = (i * 7.5) * Math.PI / 180;
      const isLong = i % 2 === 0;
      const x1 = 100 + (isLong ? 95 : 88) * Math.cos(angle);
      const y1 = 100 + (isLong ? 95 : 88) * Math.sin(angle);
      const x2 = 100 + 78 * Math.cos(angle);
      const y2 = 100 + 78 * Math.sin(angle);
      return (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={`url(#goldGrad-${id})`} strokeWidth={isLong ? "3" : "2"} />
      );
    })}
    
    {/* Main seal body */}
    <circle cx="100" cy="100" r="75" fill={`url(#goldGrad-${id})`} filter={`url(#emboss-${id})`} />
    
    {/* Decorative rings */}
    <circle cx="100" cy="100" r="70" fill="none" stroke="#ffd700" strokeWidth="2" opacity="0.8"/>
    <circle cx="100" cy="100" r="65" fill="none" stroke="#b8860b" strokeWidth="1"/>
    <circle cx="100" cy="100" r="55" fill="none" stroke="#ffd700" strokeWidth="1.5" opacity="0.6"/>
    
    {/* Inner embossed circle */}
    <circle cx="100" cy="100" r="50" fill={`url(#innerGold-${id})`} />
    <circle cx="100" cy="100" r="45" fill="none" stroke="#8b6914" strokeWidth="1"/>
    
    {/* Stars around inner circle */}
    {[...Array(12)].map((_, i) => {
      const angle = (i * 30 - 90) * Math.PI / 180;
      const x = 100 + 60 * Math.cos(angle);
      const y = 100 + 60 * Math.sin(angle);
      return (
        <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#ffd700">★</text>
      );
    })}
    
    {/* Central text - COMPLIANT VERSION */}
    <text x="100" y="85" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#3d2e0a" fontFamily="serif" letterSpacing="1">TECHNICAL</text>
    <text x="100" y="102" textAnchor="middle" fontSize="9" fill="#3d2e0a" fontFamily="serif">AI-GENERATED</text>
    <text x="100" y="118" textAnchor="middle" fontSize="8" fill="#3d2e0a" fontFamily="serif">COMMENTARY</text>
    
    {/* Curved text top */}
    <path id={`topArc-${id}`} d="M 30 100 A 70 70 0 0 1 170 100" fill="none"/>
    <text fontSize="6" fill="#5d4e1a" fontFamily="serif" letterSpacing="1">
      <textPath href={`#topArc-${id}`} startOffset="50%" textAnchor="middle">
        EXPLORATORY OBSERVATIONS
      </textPath>
    </text>
    
    {/* Curved text bottom */}
    <path id={`bottomArc-${id}`} d="M 30 100 A 70 70 0 0 0 170 100" fill="none"/>
    <text fontSize="6" fill="#5d4e1a" fontFamily="serif" letterSpacing="1">
      <textPath href={`#bottomArc-${id}`} startOffset="50%" textAnchor="middle">
        ONEDUO™ PRODUCT REVIEW
      </textPath>
    </text>
  </svg>
);

interface ObservationCardProps {
  observation: TechnicalObservation;
  index: number;
  compact?: boolean;
}

const ObservationCard = ({ observation, index, compact = false }: ObservationCardProps) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const visibleSections = compact && !isExpanded ? 2 : observation.sections.length;
  const hiddenCount = observation.sections.length - 2;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay: index * 0.15 }}
      className="group relative"
    >
      {/* Main Container */}
      <div 
        className="relative rounded-xl overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #1a1a18 0%, #0d0d0c 50%, #0a0a09 100%)',
          boxShadow: '0 25px 80px -20px rgba(212, 175, 55, 0.3), 0 0 0 1px rgba(212, 175, 55, 0.2), inset 0 1px 0 rgba(255, 215, 0, 0.1)'
        }}
      >
        {/* Gold border effect */}
        <div className="absolute inset-0 rounded-xl border-2 border-amber-500/30 pointer-events-none" />
        <div className="absolute inset-[3px] rounded-lg border border-amber-600/20 pointer-events-none" />
        
        {/* Corner flourishes */}
        <div className="absolute top-3 left-3 w-12 h-12 border-t-2 border-l-2 border-amber-500/50 rounded-tl-lg" />
        <div className="absolute top-3 right-3 w-12 h-12 border-t-2 border-r-2 border-amber-500/50 rounded-tr-lg" />
        <div className="absolute bottom-3 left-3 w-12 h-12 border-b-2 border-l-2 border-amber-500/50 rounded-bl-lg" />
        <div className="absolute bottom-3 right-3 w-12 h-12 border-b-2 border-r-2 border-amber-500/50 rounded-br-lg" />
        
        {/* Badge */}
        <div className="absolute top-4 right-4 w-24 h-24 sm:w-28 sm:h-28 drop-shadow-2xl group-hover:scale-105 transition-transform duration-500">
          <ObservationBadge id={observation.id} />
        </div>
        
        {/* Content */}
        <div className="relative p-6 sm:p-8 pr-32 sm:pr-36">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <AIIcon type={observation.icon} className="w-6 h-6 text-amber-400" />
              <div>
                <p className="text-amber-400 font-bold text-lg">{observation.aiName}</p>
                <p className="text-amber-400/60 text-xs uppercase tracking-wider">{observation.organization}</p>
                {observation.subInfo && (
                  <p className="text-amber-400/40 text-[10px] mt-0.5">{observation.subInfo}</p>
                )}
              </div>
            </div>
            <h3 className="text-white/90 font-bold text-sm sm:text-base leading-tight uppercase tracking-wide">
              {observation.title}
            </h3>
            <p className="text-amber-500/70 text-xs mt-2">{observation.date}</p>
          </div>
          
          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-amber-500/50 via-amber-400/30 to-transparent mb-6" />
          
          {/* Sections */}
          <div className="space-y-4">
            {observation.sections.slice(0, visibleSections).map((section, i) => (
              <div key={i}>
                <p className="text-amber-400 font-bold text-xs uppercase tracking-wider mb-1">
                  {section.heading}
                </p>
                <p className="text-white/70 text-sm leading-relaxed">
                  {section.content}
                </p>
              </div>
            ))}
          </div>
          
          {/* Expand/Collapse Button */}
          {compact && hiddenCount > 0 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-4 flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors cursor-pointer group/expand"
            >
              <span className="text-sm font-medium">
                {isExpanded ? '− Show less' : `+ ${hiddenCount} more sections...`}
              </span>
              <motion.span
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="text-xs"
              >
                ▼
              </motion.span>
            </button>
          )}
          
          {/* Key Insight */}
          <div className="mt-6 p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
            <p className="text-amber-400/80 text-xs uppercase tracking-wider mb-2">Key Observation</p>
            <p className="text-white/80 text-sm italic">"{observation.keyInsight}"</p>
          </div>
          
          {/* Footer with Disclaimer */}
          <div className="mt-6 pt-4 border-t border-amber-500/20">
            <p className="text-amber-400/50 text-[10px] leading-relaxed mb-3">
              ⚠️ {observation.disclaimer}
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-amber-400/60 text-[10px] uppercase tracking-wider">Source</p>
                <p className="text-amber-300 text-xs">{observation.referenceId}</p>
              </div>
              <div className="text-right">
                <p className="text-amber-400/60 text-[10px] uppercase tracking-wider">Type</p>
                <p className="text-amber-400/80 text-xs">AI Commentary</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Embossed watermark */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 opacity-[0.03] pointer-events-none">
          <div className="text-6xl font-bold font-serif text-amber-400 whitespace-nowrap">
            ONEDUO™
          </div>
        </div>
        
        {/* Attribution footer */}
        <div className="px-6 sm:px-8 pb-4 pt-0">
          <p className="text-amber-500/40 text-[10px] text-center tracking-wide">
            —{observation.aiName} · {observation.attribution}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

interface AIWitnessCertificatesProps {
  compact?: boolean;
  showTitle?: boolean;
}

export const AIWitnessCertificates = ({ compact = false, showTitle = true }: AIWitnessCertificatesProps) => {
  return (
    <div className="space-y-8">
      {showTitle && (
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-4 py-2 mb-6">
            <span className="text-amber-400">💬</span>
            <span className="text-amber-400 text-sm font-medium">AI Technical Commentary</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            What AI Systems Observed
          </h2>
          <p className="text-white/60 max-w-2xl mx-auto text-sm">
            AI-generated observations from exploratory product sessions. These are illustrative commentary, not endorsements or certifications. 
            Each AI system shared technical observations during development conversations.
          </p>
        </div>
      )}
      
      <div className="grid gap-8 lg:grid-cols-1">
        {observations.map((obs, index) => (
          <ObservationCard key={obs.id} observation={obs} index={index} compact={compact} />
        ))}
      </div>
      
      {/* Global Disclaimer */}
      <div className="mt-8 p-4 bg-amber-950/20 border border-amber-500/20 rounded-lg">
        <p className="text-amber-400/60 text-xs text-center leading-relaxed">
          <strong>Important Notice:</strong> The observations above are AI-generated commentary captured during product development conversations. 
          They are illustrative only and may contain inaccuracies. These statements do not represent endorsements, certifications, or official positions 
          from Google, OpenAI, Anthropic, xAI, or any other organization. OneDuo™ is not affiliated with or endorsed by these companies.
        </p>
      </div>
    </div>
  );
};

export default AIWitnessCertificates;
