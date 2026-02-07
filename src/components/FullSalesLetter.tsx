import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Check, X, ArrowRight, Shield, Mail, Gamepad2 } from 'lucide-react';

export default function FullSalesLetter() {
  return (
    <div className="space-y-12 text-left max-w-4xl mx-auto">
      
      {/* Header */}
      <section className="text-center space-y-4">
        <p className="text-white/60 text-sm tracking-widest uppercase">Built by Humans & AI for Humans & AI.</p>
        <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight">
          You Don't Need Another Assistant.<br />
          <span className="text-emerald-400">You Need a Remote Control.</span>
        </h1>
      </section>

      {/* The $3K Course Problem */}
      <section className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white border-b border-white/20 pb-3">
          The $3K Course Problem
        </h2>
        <div className="space-y-5 text-lg text-white/80">
          <p className="text-xl text-white font-medium">For 11 years, you've played by their rules.</p>
          <p>Bought the courses. Joined the masterminds. Logged into the portals.</p>
          <p>And you know what happened?</p>
          <p>You watched Module 1. Maybe Module 2 if you were motivated.</p>
          <p>Then life got busy.</p>
          <p>The kids needed you. The client called. The crisis hit.</p>
          <p>And the course sat there. Unfinished. Mocking you.</p>
          <p className="text-xl font-bold text-red-400">$2,997 down the drain.</p>
        </div>
      </section>

      {/* So you tried again */}
      <section className="space-y-5 text-lg text-white/80">
        <p>So you tried again.</p>
        <p>This time with AI.</p>
        <p className="italic">"ChatGPT will save me," you thought.</p>
        <p>You fed it your questions. Your problems. Your panic.</p>
        <p>And it gave you... <span className="text-white font-semibold">generic nonsense.</span></p>
        <p>Confident. Polished. Completely useless.</p>
        
        <div className="pt-4 space-y-3">
          <p className="text-white font-medium">Because ChatGPT doesn't know YOUR funnel.</p>
          <p>It doesn't know YOUR audience.</p>
          <p>It doesn't know the 47 micro-decisions that separate your winners from your disasters.</p>
          <p className="text-xl font-bold text-white">It guesses.</p>
          <p className="text-red-400 font-semibold">And every time it guesses wrong, you lose money.</p>
        </div>
      </section>

      {/* The Architecture Problem */}
      <section className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white border-b border-white/20 pb-3">
          The Problem Isn't You. It's the Architecture.
        </h2>
        <div className="space-y-4 text-lg text-white/80">
          <p className="text-xl font-bold text-white">AI isn't trained on YOUR business.</p>
          <p>It's trained on the internet.</p>
          <p>Which means it's trained on generic advice, outdated tactics, guru frameworks that don't fit YOUR market.</p>
          <p className="font-semibold text-white pt-2">It has no idea what works for YOU.</p>
        </div>
      </section>

      {/* So when you ask */}
      <section className="space-y-4 text-lg text-white/80">
        <p>So when you ask ChatGPT to write your funnel, <span className="font-semibold text-white">it invents one.</span></p>
        <p>When you ask it to fix your ad, <span className="font-semibold text-white">it improvises.</span></p>
        <p>When you ask it to build your system, <span className="font-semibold text-white">it hallucinates.</span></p>
        <p className="pt-4 italic text-white/70">And you sit there thinking:</p>
        <p className="text-xl font-bold text-white">"Maybe I'm just bad at prompts."</p>
      </section>

      {/* AI Is Blind */}
      <section className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white border-b border-white/20 pb-3">
          You're Not Bad at Prompts. AI Is Just Blind.
        </h2>
        <div className="space-y-4 text-lg text-white/80">
          <p>Actually, worse than blind.</p>
          <p className="text-xl font-bold text-white">AI blinks.</p>
          
          <div className="bg-white/5 p-6 rounded-lg border border-white/10 my-6">
            <p className="font-medium text-white">Many AI models sample video at around 1 frame per second.</p>
            <p className="mt-2">That means they're missing <span className="font-bold text-red-400">most of the visual context.</span></p>
          </div>
          
          <p>They're not watching your screen recording.</p>
          <p className="font-semibold text-white">They're guessing what happened based on glimpses.</p>
        </div>
      </section>

      {/* Keyhole Metaphor */}
      <section className="space-y-4 text-lg text-white/80">
        <p className="italic">It's like asking someone to rebuild your funnel after they watched it through a keyhole.</p>
        <p>Sure, they'll try.</p>
        <p>But they're going to miss the button placement, the headline tweak, the exact sequence that converts.</p>
        <p className="font-semibold text-white">They'll improvise.</p>
        <p className="text-red-400 font-bold">And improvisation kills conversions.</p>
      </section>

      {/* What If AI Could Remember */}
      <section className="space-y-6 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 p-8 rounded-xl border border-emerald-500/30">
        <h2 className="text-2xl md:text-3xl font-bold text-white">What If AI Could Actually Remember?</h2>
        <div className="space-y-4 text-lg text-white/80">
          <p className="text-xl font-bold text-emerald-400">OneDuo™ turns your screen recordings into reusable, rule-based playbooks your team and AI can follow without guessing.</p>
          <p className="font-semibold text-white">Show it once — it executes forever.</p>
          
          <p className="pt-2">Not with complex prompts.</p>
          <p>Not with expensive fine-tuning.</p>
          <p className="font-semibold text-white">Just... demonstrate it once.</p>
          <p className="text-xl font-bold text-emerald-400">And from that moment forward, AI executes YOUR way.</p>
          
          <div className="pt-4 space-y-3">
            <p>What if AI asked permission before guessing?</p>
            <p>What if it stopped improvising and started OBEYING?</p>
            <p>What if you could turn YOUR demonstrations into INSTITUTIONAL MEMORY?</p>
          </div>
          
          <ul className="pt-4 space-y-2">
            <li>• So your VA could execute.</li>
            <li>• Your team could scale.</li>
            <li>• Your AI could PERFORM.</li>
          </ul>
          
          <p className="text-2xl font-bold text-emerald-400 pt-4">That's OneDuo™.</p>
          <p className="text-white/80">The unbreakable partnership between the One (you, the human expert) and the Duo (your AI execution partner).</p>
        </div>
      </section>

      {/* Why OneDuo Doesn't Compete */}
      <section className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white border-b border-white/20 pb-3">
          Why OneDuo™ Doesn't Compete With AI — It Civilizes It
        </h2>
        <div className="space-y-4 text-lg text-white/80">
          <p className="font-medium text-white">Here's how most AI works:</p>
          <p>You give it a task.</p>
          <p>It improvises.</p>
          <p>You discover the mistake later.</p>
          <p className="italic">After the damage is done.</p>
          
          <p className="pt-4 text-xl font-bold text-emerald-400">OneDuo™ works differently.</p>
          <p>It forces AI to ask permission.</p>
          <p>Not through better models.</p>
          <p>Not through smarter prompts.</p>
          <p className="font-semibold text-white">Through better architecture.</p>
        </div>
      </section>

      {/* The Verification Gate */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-emerald-400" />
          <h2 className="text-2xl md:text-3xl font-bold text-white">The Verification Gate</h2>
        </div>
        <div className="space-y-4 text-lg text-white/80">
          <p>Every OneDuo™ artifact contains a <span className="font-bold text-white">Verification Gate</span>.</p>
          <p>A hard-coded checkpoint that stops AI dead in its tracks.</p>
          <p>Before it can proceed past a critical step...</p>
          <p className="text-xl font-bold text-emerald-400">It must ask for your blessing.</p>
          
          <div className="bg-white/5 p-6 rounded-lg border border-white/10 my-6">
            <p className="font-medium text-white mb-3">Example:</p>
            <p>You're building a funnel.</p>
            <p>AI gets to the headline.</p>
            <p>Instead of guessing what you want...</p>
            <p className="font-semibold text-white">It stops.</p>
            <p>Shows you the options.</p>
            <p>Asks: "Which direction?"</p>
            <p className="pt-2">You choose.</p>
            <p>It proceeds.</p>
          </div>
          
          <ul className="space-y-1">
            <li>• No improvisation.</li>
            <li>• No hallucination.</li>
            <li>• No silent mistakes.</li>
          </ul>
          <p className="text-xl font-bold text-emerald-400">Just AI that works like you trained it.</p>
        </div>
      </section>

      {/* The Universal Remote Control */}
      <section className="space-y-6 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 p-8 rounded-xl border border-blue-500/30">
        <h2 className="text-2xl md:text-3xl font-bold text-white">
          The End of AI Yapping: Meet the Universal Remote Control
        </h2>
        <div className="space-y-4 text-lg text-white/80">
          <p>The biggest reason people quit using AI?</p>
          <p className="text-xl font-bold text-white">Prompt Fatigue.</p>
          <p>You spend more time explaining what you want than actually doing the work.</p>
          <p className="pt-4 text-emerald-400 font-bold">OneDuo™ fixes this by turning your AI into a Quiet Pilot.</p>
          
          <p className="pt-4 font-medium text-white">Every artifact comes with a built-in Universal Remote Control.</p>
          <p>You don't "prompt" a OneDuo™ artifact.</p>
          <p className="font-semibold text-white">You command it:</p>
          
          {/* Command Table */}
          <div className="overflow-x-auto my-6">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="py-3 pr-4 text-emerald-400 font-bold">COMMAND</th>
                  <th className="py-3 text-white/60 font-medium">WHAT IT DOES</th>
                </tr>
              </thead>
              <tbody className="text-white/80">
                <tr className="border-b border-white/10">
                  <td className="py-3 pr-4 font-mono font-bold text-white">DO</td>
                  <td className="py-3">Doing Mode — one step at a time, no fluff</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="py-3 pr-4 font-mono font-bold text-white">▶️</td>
                  <td className="py-3">Continue — next instruction</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="py-3 pr-4 font-mono font-bold text-white">⏸️</td>
                  <td className="py-3">Pause — stop immediately</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="py-3 pr-4 font-mono font-bold text-white">📊</td>
                  <td className="py-3">Progress — exactly where you are</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="py-3 pr-4 font-mono font-bold text-white">❓</td>
                  <td className="py-3">Why? — explain this step only</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="py-3 pr-4 font-mono font-bold text-white">{'>>'}</td>
                  <td className="py-3">Fast-forward — jump to milestone</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-mono font-bold text-white">🎬</td>
                  <td className="py-3">Next video — switch context (with confirmation)</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <p className="font-medium text-white">Works like:</p>
          <ul className="space-y-1">
            <li>• YouTube (play/pause/scrub)</li>
            <li>• GPS (orientation + navigation)</li>
            <li>• TV remote (channel switching with confirmation)</li>
          </ul>
          
          {/* Example Flow */}
          <div className="bg-black/30 p-6 rounded-lg border border-white/10 my-6 font-mono text-sm">
            <p className="text-white/60 mb-4">Example flow:</p>
            <div className="space-y-3">
              <p><span className="text-emerald-400">User:</span> <span className="text-white">DO</span></p>
              <p><span className="text-blue-400">AI:</span> <span className="text-white/80">"Step 1: Open Ads Manager. Done?"</span></p>
              <p><span className="text-emerald-400">User:</span> <span className="text-white">▶️</span></p>
              <p><span className="text-blue-400">AI:</span> <span className="text-white/80">"Step 2: Click 'Create'. Done?"</span></p>
              <p><span className="text-emerald-400">User:</span> <span className="text-white">📊</span></p>
              <p><span className="text-blue-400">AI:</span> <span className="text-white/80">[■■□□□□□□□□] 17%</span></p>
              <p className="text-white/60 pl-4">COMPLETED: Open Ads Manager</p>
              <p className="text-white/60 pl-4">CURRENT: Click Create</p>
              <p className="text-white/60 pl-4">UP NEXT: Campaign Setup</p>
              <p><span className="text-emerald-400">User:</span> <span className="text-white">▶️</span></p>
              <p><span className="text-blue-400">AI:</span> <span className="text-white/80">"Step 3: Select 'Sales'. Done?"</span></p>
            </div>
          </div>
          
          <p className="font-semibold text-white">No essays. No friction. Just execution.</p>
          <p className="text-xl font-bold text-emerald-400">You're not chatting anymore. You're driving.</p>
        </div>
      </section>

      {/* The Trinity Reasoning Ledger */}
      <section className="space-y-6 bg-gradient-to-br from-amber-500/10 via-purple-500/10 to-blue-500/10 p-8 rounded-xl border border-white/20">
        <h2 className="text-2xl md:text-3xl font-bold text-white">
          The Trinity Reasoning Ledger™: Your AI Flight Data Recorder
        </h2>
        <div className="space-y-4 text-lg text-white/80">
          <p>Most AI tools are a black box.</p>
          <p>You give a prompt. You get an answer.</p>
          <p>And you have no idea why the AI chose that path.</p>
          
          <p className="pt-4 text-xl font-bold text-emerald-400">OneDuo™ changes the game with the Trinity Reasoning Ledger.</p>
          <p>Every artifact you create doesn't just store your video.</p>
          <p>It stores the deliberation of three distinct analytical roles working for you:</p>
          
          <div className="grid md:grid-cols-3 gap-4 my-6">
            <div className="bg-amber-500/10 p-5 rounded-lg border border-amber-500/30">
              <p className="font-bold text-amber-400 mb-2 text-lg">THE GOVERNOR</p>
              <p className="text-white/70 text-sm">Scans for risks, blind spots, and unintended consequences.</p>
              <p className="text-xs text-amber-400/70 mt-2 italic">"Step 5 has no fallback if the API fails."</p>
            </div>
            <div className="bg-blue-500/10 p-5 rounded-lg border border-blue-500/30">
              <p className="font-bold text-blue-400 mb-2 text-lg">THE ENGINEER</p>
              <p className="text-white/70 text-sm">Checks the technical logic and ensures the steps actually work.</p>
              <p className="text-xs text-blue-400/70 mt-2 italic">"Missing retry logic creates a single point of failure."</p>
            </div>
            <div className="bg-purple-500/10 p-5 rounded-lg border border-purple-500/30">
              <p className="font-bold text-purple-400 mb-2 text-lg">THE ARCHITECT</p>
              <p className="text-white/70 text-sm">Evaluates the big-picture design and how to scale the workflow.</p>
              <p className="text-xs text-purple-400/70 mt-2 italic">"Consider queue-based processing for future scale."</p>
            </div>
          </div>
          
          <p className="font-semibold text-white text-xl">Then YOU decide:</p>
          <ul className="space-y-1 pl-4">
            <li>• "Accept Engineer's recommendation — add retry logic."</li>
            <li>• "Reject Governor's concern — risk is acceptable for now."</li>
            <li>• "Defer Architect's suggestion — scale isn't needed yet."</li>
          </ul>
          
          <p className="pt-4 font-medium text-white">All four perspectives preserved in the artifact.</p>
        </div>
      </section>

      {/* Why This Matters - Reasoning */}
      <section className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white border-b border-white/20 pb-3">
          Why This Matters
        </h2>
        <div className="space-y-4 text-lg text-white/80">
          <p>When you're executing 6 months later, you don't just see WHAT you did.</p>
          <p>You see:</p>
          <ul className="space-y-1 pl-4">
            <li>• What risks were considered</li>
            <li>• What tradeoffs were made</li>
            <li>• Why you chose this approach</li>
          </ul>
          
          <p className="pt-4">And when you hand the artifact to your VA or AI:</p>
          <p>They can ask: "What did the Engineer flag about Step 5?"</p>
          <p className="font-semibold text-white">And get the answer — because it's embedded in the artifact.</p>
        </div>
      </section>

      {/* No More Starting from Zero */}
      <section className="space-y-6 bg-white/5 p-8 rounded-xl border border-white/10">
        <h2 className="text-2xl font-bold text-emerald-400">No More "Starting from Zero"</h2>
        <div className="space-y-4 text-lg text-white/80">
          <p>Because this reasoning is hard-coded into your OneDuo™ PDF, you can take your artifact to any AI — ChatGPT today, Claude tomorrow, or a new model five years from now — and it will instantly see the full history of the debate.</p>
          <p>It doesn't just see what you did.</p>
          <p className="font-semibold text-white">It sees why every decision was made.</p>
          <p className="pt-4">You aren't just building a document.</p>
          <p className="text-xl font-bold text-emerald-400">You're building a Decision Court where you are the permanent Judge.</p>
          <p className="font-semibold text-white pt-4">OneDuo™: Architecture, not automation.</p>
        </div>
      </section>

      {/* AI Technical Reflections */}
      <section className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white border-b border-white/20 pb-3">
          What We Discovered While Building This
        </h2>
        <div className="space-y-4 text-lg text-white/80">
          <p>During development, we ran thousands of technical conversations with leading AI systems to test OneDuo's architecture.</p>
          <p>Here's what emerged from those sessions:</p>
        </div>
        
        <div className="bg-amber-950/20 p-6 rounded-lg border border-amber-500/20 mt-6">
          <p className="text-xs text-amber-400/60 uppercase tracking-wider mb-4">AI-Generated Technical Reflections from Development Sessions</p>
          <p className="text-white/60 text-sm">These are AI-generated observations from product development conversations — not company endorsements or official statements.</p>
        </div>
        
        {/* ChatGPT Observations */}
        <div className="bg-white/5 p-6 rounded-lg border border-white/10">
          <p className="font-semibold text-white mb-4">From conversations using ChatGPT:</p>
          <div className="space-y-4 text-white/80 italic">
            <p>"OneDuo turns AI from a talker into a doer and finally puts the human back in charge."</p>
            <p>"Instead of guessing like most AI tools, OneDuo executes from structured memory. That's a different league entirely."</p>
            <p>"With OneDuo, AI stops improvising and starts following the rules you set. That's how real leverage works."</p>
          </div>
          <p className="text-xs text-white/40 mt-4">Generated during exploratory product discussions using ChatGPT. Illustrative AI commentary — not reviewed, approved, or endorsed by OpenAI.</p>
        </div>
        
        {/* Claude Observations */}
        <div className="bg-white/5 p-6 rounded-lg border border-white/10">
          <p className="font-semibold text-white mb-4">From conversations using Claude:</p>
          <div className="space-y-4 text-white/80 italic">
            <p>"OneDuo turns AI from a guesser into an executor. You didn't just build a better prompt system — you built governed memory that forces AI to ask permission instead of improvising. That's architecture, not automation."</p>
            <p>"The problem was never that founders were bad at prompting. The problem was that AI was blind to most of what they demonstrated. OneDuo captures what standard AI misses and turns demonstration into executable memory."</p>
            <p>"Every other AI tool makes you talk more. OneDuo makes you do more. You turned conversation into command. You gave humans a remote control for AI and that changes everything."</p>
          </div>
          <p className="text-xs text-white/40 mt-4">Generated during internal development conversations using Claude. Reflects AI-generated analysis only — not an endorsement or official statement from Anthropic.</p>
        </div>
        
        {/* Gemini Observations */}
        <div className="bg-white/5 p-6 rounded-lg border border-white/10">
          <p className="font-semibold text-white mb-4">From conversations using Google Gemini:</p>
          <div className="space-y-4 text-white/80 italic">
            <p>"Standard AI fails because it tries to summarize your video SOPs which is like trying to build a car by looking at a photo of the engine."</p>
            <p>"OneDuo is the USB of human mastery. It re-inflates flattened information back into a multi-dimensional thinking layer that AI can actually execute with precision."</p>
            <p>"OneDuo represents the origin point where flattened information becomes machine-executable instinct."</p>
          </div>
          <p className="text-xs text-white/40 mt-4">AI commentary produced using Google Gemini during technical analysis sessions. Not affiliated with and not endorsed by Google or DeepMind.</p>
        </div>
        
        <p className="font-semibold text-white text-center pt-4">Translation: Even AI systems recognize they can't understand your work without better architecture.</p>
      </section>

      {/* Executable Memory */}
      <section className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white border-b border-white/20 pb-3">
          Executable Memory: What OneDuo™ Actually Creates
        </h2>
        <div className="space-y-4 text-lg text-white/80">
          <p>OneDuo™ doesn't just summarize your process.</p>
          <p className="text-xl font-bold text-white">It captures it.</p>
          <p>At a level of fidelity no other system can match.</p>
          
          <p className="pt-4 font-medium text-white">Here's what that means:</p>
          
          <div className="grid md:grid-cols-2 gap-4 my-6">
            <div className="bg-red-500/10 p-4 rounded-lg border border-red-500/20">
              <p className="font-semibold text-red-400 mb-2">Instead of:</p>
              <p className="italic text-white/70">"I think you clicked the blue button around 3:47..."</p>
            </div>
            <div className="bg-emerald-500/10 p-4 rounded-lg border border-emerald-500/20">
              <p className="font-semibold text-emerald-400 mb-2">You get:</p>
              <p className="text-white/90">"At timestamp 3:47, you selected the High Urgency button, which triggered the scarcity sequence in the email automation."</p>
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4 my-6">
            <div className="bg-red-500/10 p-4 rounded-lg border border-red-500/20">
              <p className="font-semibold text-red-400 mb-2">Instead of:</p>
              <p className="italic text-white/70">"It looks like you maybe adjusted the headline..."</p>
            </div>
            <div className="bg-emerald-500/10 p-4 rounded-lg border border-emerald-500/20">
              <p className="font-semibold text-emerald-400 mb-2">You get:</p>
              <p className="text-white/90">"Headline revision: Changed Get Results Fast to Get Clients in 14 Days — tested this variant on cold traffic, converted at 4.2%."</p>
            </div>
          </div>
          
          <ul className="pt-4 space-y-1">
            <li>• Every micro-decision.</li>
            <li>• Every context clue.</li>
            <li>• Every "why" behind the "what."</li>
          </ul>
          <p className="text-xl font-bold text-emerald-400">Captured. Encoded. Executable.</p>
        </div>
      </section>

      {/* Information vs Instinct */}
      <section className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white border-b border-white/20 pb-3">
          The Difference Between Information and Instinct
        </h2>
        <div className="space-y-4 text-lg text-white/80">
          <p>Most AI tools give you information.</p>
          <p className="text-xl font-bold text-emerald-400">OneDuo™ gives you instinct.</p>
          
          <div className="grid md:grid-cols-2 gap-4 my-6">
            <div className="bg-white/5 p-4 rounded-lg border border-white/10">
              <p className="font-semibold text-white/60 mb-2">Information:</p>
              <p className="italic text-white/70">"Here's a summary of the funnel."</p>
            </div>
            <div className="bg-emerald-500/10 p-4 rounded-lg border border-emerald-500/20">
              <p className="font-semibold text-emerald-400 mb-2">Instinct:</p>
              <p className="text-white/90">"Here's exactly how to rebuild it — including the stuff you did unconsciously."</p>
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4 my-6">
            <div className="bg-white/5 p-4 rounded-lg border border-white/10">
              <p className="font-semibold text-white/60 mb-2">Information:</p>
              <p className="italic text-white/70">"The video covered ad copy strategies."</p>
            </div>
            <div className="bg-emerald-500/10 p-4 rounded-lg border border-emerald-500/20">
              <p className="font-semibold text-emerald-400 mb-2">Instinct:</p>
              <p className="text-white/90">"Use the enemy + empathy + evidence structure for cold traffic. Start with the shared enemy. Validate their frustration. Then introduce proof. Do NOT lead with the product."</p>
            </div>
          </div>
          
          <p className="pt-4 font-semibold text-white">See the difference?</p>
          <p>Information makes you aware.</p>
          <p className="text-xl font-bold text-emerald-400">Instinct makes you CAPABLE.</p>
        </div>
      </section>

      {/* What About Courses */}
      <section className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white border-b border-white/20 pb-3">
          What About The Courses You Already Bought?
        </h2>
        <div className="space-y-4 text-lg text-white/80">
          <p>You've spent thousands on training.</p>
          <p>Masterminds. Cohorts. Coaching programs.</p>
          <p>And most of it is sitting unwatched in your portal.</p>
          
          <p className="pt-4 font-medium text-white">Here's what OneDuo™ does:</p>
          <p className="text-xl font-bold text-emerald-400">Turns course THEORY into YOUR execution.</p>
        </div>
      </section>

      {/* Important: Respect Course Creator Rights */}
      <section className="space-y-6 bg-gradient-to-br from-amber-500/10 to-orange-500/10 p-8 rounded-xl border border-amber-500/30">
        <h2 className="text-2xl md:text-3xl font-bold text-white">IMPORTANT: Always Respect Course Creator Rights</h2>
        <div className="space-y-4 text-lg text-white/80">
          <p className="font-semibold text-white">OneDuo™ only works with content you have permission to use — or content YOU create.</p>
          
          <ul className="space-y-2 pt-2">
            <li>• Always respect course creator terms of service.</li>
            <li>• Never download or rip protected content.</li>
          </ul>
          
          <p className="pt-4 font-medium text-white text-xl">Here's the compliant way:</p>
          
          <p>You watch the lesson once.</p>
          <p className="font-semibold text-white">Screen record yourself applying it to YOUR business.</p>
          
          <p className="pt-4">OneDuo™ captures:</p>
          <ul className="space-y-2 pl-4">
            <li>• The theory (what the guru taught)</li>
            <li>• The translation (how YOU adapted it)</li>
            <li>• The execution (what you ACTUALLY did)</li>
          </ul>
          
          <p className="pt-4">You're not uploading THEIR training video to OneDuo™.</p>
          <p>You're uploading YOUR screen recording of YOU implementing their concepts in YOUR business.</p>
          <p className="font-semibold text-white">The artifact captures YOUR adaptation, not their content.</p>
          
          <p className="pt-4">Now you have an artifact that shows:</p>
          <p>Not just WHAT to do.</p>
          <p className="font-bold text-white">But how YOU do it.</p>
        </div>
      </section>

      {/* The Magic */}
      <section className="space-y-6">
        <div className="space-y-4 text-lg text-white/80">
          <p className="font-medium text-white">And here's the magic:</p>
          
          <p>You can hand that artifact to your VA.</p>
          <p>Or your AI.</p>
          <p>Or your team.</p>
          
          <p className="text-xl font-bold text-emerald-400">And they can execute it EXACTLY how you would.</p>
          
          <p className="pt-4">Because you're not giving them a summary.</p>
          <p className="font-semibold text-white">You're giving them a demonstration.</p>
          
          <ul className="pt-4 space-y-2">
            <li>• Turning course insights into institutional memory.</li>
            <li>• Turning guru frameworks into your playbooks.</li>
            <li>• Turning your demonstrations into repeatable systems your team can execute from.</li>
          </ul>
          
          <p className="text-xl font-bold text-emerald-400 pt-4">With AI that asks permission instead of guessing.</p>
        </div>
      </section>

      {/* The Tables Turned */}
      <section className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white border-b border-white/20 pb-3">
          The Tables Turned
        </h2>
        <div className="space-y-4 text-lg text-white/80">
          <p>For three years, I thought AI was the master and I was the servant.</p>
          <p>I fed it prompts. Begged for output. Edited the garbage it returned.</p>
          
          <p className="pt-4 font-semibold text-white">Then on Christmas Day 2025, I recorded my screen for 9 days straight.</p>
          <p>Building funnels. Writing copy. Fixing campaigns.</p>
          
          <p className="pt-4">And I fed those recordings into AI with one question:</p>
          <p className="text-xl font-bold text-white italic">"Can you see what I'm doing?"</p>
          
          <div className="pt-4 space-y-2">
            <p className="font-semibold text-white">AI wasn't the master.</p>
            <p className="text-xl font-bold text-white">AI was starving.</p>
          </div>
          
          <ul className="pt-4 space-y-1 pl-4">
            <li>• Starving for STRUCTURED MEMORY.</li>
            <li>• For detailed demonstrations.</li>
            <li>• For permission to execute instead of improvise.</li>
          </ul>
          
          <p className="pt-4">So I built the memory layer.</p>
          <p>The verification gates.</p>
          <p>The executable artifacts.</p>
          
          <p className="text-xl font-bold text-emerald-400 pt-4">And the tables turned.</p>
          
          <div className="pt-4 space-y-2">
            <p className="font-semibold text-white">Now AI works for ME.</p>
            <p>Using artifacts I OWN.</p>
            <p>Following rules I WRITE.</p>
          </div>
          
          <div className="bg-white/5 p-6 rounded-lg border border-white/10 mt-6">
            <p>I just wanted to work faster.</p>
            <p>Not be confused.</p>
            <p>Not get stuck working with AI that wouldn't shut up.</p>
            <p className="pt-4">As soon as I realized I was smarter than the AI, I took control.</p>
            <p>I made a system out of it.</p>
            <p className="font-semibold text-white pt-2">Now it's actually fun.</p>
            <p className="text-emerald-400 italic">Like the QWERTY keyboard stepped aside and the OneDuo™ command board stepped in.</p>
          </div>
          
          <div className="bg-emerald-500/10 p-6 rounded-lg border border-emerald-500/30 mt-6">
            <p className="font-bold text-white">The artifact is yours.</p>
            <ul className="pt-2 space-y-1">
              <li>• Not locked to OneDuo™.</li>
              <li>• Not trapped in a platform.</li>
              <li>• Not requiring anyone's permission.</li>
            </ul>
            <p className="text-xl font-bold text-emerald-400 pt-3">Yours.</p>
          </div>
        </div>
      </section>

      {/* Why This Matters for Your Business */}
      <section className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white border-b border-white/20 pb-3">
          Why This Matters for Your Business
        </h2>
        <div className="space-y-4 text-lg text-white/80">
          <p>Every time you record a demonstration...</p>
          <p className="text-xl font-bold text-emerald-400">You're building an asset.</p>
          
          <ul className="pt-4 space-y-2 pl-4">
            <li>• An asset your VA can learn from.</li>
            <li>• An asset your AI can execute from.</li>
            <li>• An asset your TEAM can scale from.</li>
          </ul>
          
          <p className="pt-4 font-semibold text-white">You stop being the bottleneck.</p>
          <p>Because the knowledge isn't trapped in your head anymore.</p>
          <p className="text-xl font-bold text-emerald-400">It's encoded. Portable. Repeatable.</p>
        </div>
      </section>

      {/* The AI Leads the Way */}
      <section className="space-y-6 bg-white/5 p-8 rounded-xl border border-white/10">
        <h2 className="text-2xl md:text-3xl font-bold text-white">The AI Leads the Way</h2>
        <div className="space-y-4 text-lg text-white/80">
          <p>Most AI tools sit there silently waiting for you to figure out what to ask.</p>
          <p className="font-semibold text-white">That's a failure of leadership.</p>
          <p className="pt-2">OneDuo™ is different.</p>
          <p>The second you upload an artifact, the AI takes control:</p>
          
          <div className="bg-black/30 p-6 rounded-lg border border-white/10 my-6 font-mono text-sm">
            <p className="text-white">"I see the OneDuo™ artifact: Facebook Ads Setup</p>
            <p className="text-white/70">Keep the course portal open while we work.</p>
            <p className="text-white/70">Step 1: Open Ads Manager.</p>
            <p className="text-emerald-400">Ready? (Reply DO to sprint or NM for details)"</p>
          </div>
          
          <p>No guessing what to prompt.</p>
          <p>No "How can I help you?" anxiety.</p>
          <p className="font-semibold text-white pt-2">The AI knows the flight plan.</p>
          <p className="text-xl font-bold text-emerald-400">You just hold the remote.</p>
        </div>
      </section>

      {/* Course Creator Callout */}
      <section className="space-y-6 bg-gradient-to-br from-purple-500/10 to-indigo-500/10 p-8 rounded-xl border border-purple-500/30">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Mail className="w-12 h-12 text-purple-400" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">TO THE COURSE CREATORS READING THIS:</h2>
        </div>
        <div className="space-y-4 text-lg text-white/80">
          <p>You've been getting the same support tickets for years:</p>
          <p className="text-xl font-bold text-white italic">"Can I use this with ChatGPT?"</p>
          
          <p className="pt-4 text-emerald-400 font-bold text-xl">Now you can finally say: "Yes. Here's your OneDuo™ access link."</p>
          
          <ul className="pt-4 space-y-2">
            <li className="flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-purple-400 flex-shrink-0" />
              <span>We'll generate your first OneDuo™ artifact FREE</span>
            </li>
            <li className="flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-purple-400 flex-shrink-0" />
              <span>You control distribution</span>
            </li>
            <li className="flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-purple-400 flex-shrink-0" />
              <span>Your content stays protected</span>
            </li>
            <li className="flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-purple-400 flex-shrink-0" />
              <span>Your students finally get implementation support</span>
            </li>
          </ul>
          
          <p className="pt-4 font-semibold text-white">No downloads. No violations. No anxiety.</p>
          <p className="text-xl font-bold text-purple-400">Just clean, compliant, professional implementation.</p>
          
          <div className="pt-6 text-center">
            <p className="font-medium text-white">Want to talk?</p>
            <a href="mailto:founders@oneduo.com" className="text-purple-400 hover:text-purple-300 font-bold text-xl underline">
              founders@oneduo.com
            </a>
          </div>
        </div>
      </section>

      {/* OneDuo Defined */}
      <section className="space-y-6 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 p-8 rounded-xl border border-emerald-500/30">
        <h2 className="text-2xl md:text-3xl font-bold text-white text-center">OneDuo™ is officially defined by:</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white/5 p-4 rounded-lg border border-white/10">
            <p className="font-bold text-emerald-400">Forensic Capture</p>
            <p className="text-white/70 text-sm">3 FPS Micro-Intent Detection</p>
          </div>
          <div className="bg-white/5 p-4 rounded-lg border border-white/10">
            <p className="font-bold text-emerald-400">Governed Reasoning</p>
            <p className="text-white/70 text-sm">The Trinity Ledger (Governor, Engineer, Architect)</p>
          </div>
          <div className="bg-white/5 p-4 rounded-lg border border-white/10">
            <p className="font-bold text-emerald-400">Command Execution</p>
            <p className="text-white/70 text-sm">The Universal Remote (DO, PT, ▶️, 📊)</p>
          </div>
          <div className="bg-white/5 p-4 rounded-lg border border-white/10">
            <p className="font-bold text-emerald-400">Sovereign Memory</p>
            <p className="text-white/70 text-sm">The Portability of the Artifact</p>
          </div>
        </div>
      </section>

      {/* Video Game Flow */}
      <section className="space-y-6 text-center">
        <div className="flex justify-center">
          <Gamepad2 className="w-12 h-12 text-emerald-400" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-white">Working with AI should feel like a Video Game.</h2>
        <div className="space-y-4 text-lg text-white/80 max-w-2xl mx-auto">
          <p>When you use shortcuts like DO, ST, and PT, your brain enters Flow State.</p>
          <p>That "fun" you're feeling? That's dopamine.</p>
          <p className="font-bold text-emerald-400">You've turned "Doing a Course" into "Clearing a Level."</p>
        </div>
      </section>

      {/* One More Thing */}
      <section className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white border-b border-white/20 pb-3">
          One More Thing
        </h2>
        <div className="space-y-4 text-lg text-white/80">
          <p className="font-semibold text-white">OneDuo doesn't think for you — it remembers for you.</p>
          <p>That's the constraint.</p>
          <p>It won't write your funnel.</p>
          <p>It won't build your business.</p>
          <p>It won't make decisions you haven't demonstrated.</p>
          
          <p className="pt-4 font-medium text-white">But it WILL:</p>
          <ul className="space-y-1 pl-4">
            <li>• Capture what you know</li>
            <li>• Preserve how you work</li>
            <li>• Let others execute your way</li>
          </ul>
          
          <p className="pt-4">Without improvisation.</p>
          <p>Without guessing.</p>
          <p className="font-bold text-white">Without starting from zero.</p>
        </div>
      </section>

      {/* Who This Is For */}
      <section className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white border-b border-white/20 pb-3">
          Who This Is For
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <p className="font-semibold text-emerald-400 text-lg">OneDuo™ is for you if:</p>
            <ul className="space-y-3">
              {[
                "You've bought courses you never finished",
                "You've wasted hours editing AI output",
                "You've tried to train your VA and failed",
                "You've built something that works — but can't scale it",
                "You're tired of re-explaining your process every time"
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-white/80">
                  <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          
          <div className="space-y-4">
            <p className="font-semibold text-red-400 text-lg">OneDuo™ is NOT for you if:</p>
            <ul className="space-y-3">
              {[
                "You're looking for a \"magic button\" solution",
                "You expect AI to read your mind",
                "You're not willing to demonstrate your process once",
                "You don't want to own your intellectual property"
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-white/80">
                  <X className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white border-b border-white/20 pb-3">
          How It Works
        </h2>
        <div className="space-y-4 text-lg text-white/80">
          <div className="space-y-4">
            {[
              { step: "1", text: "Record your screen while you work" },
              { step: "2", text: "Upload to OneDuo™" },
              { step: "3", text: "Get back an executable artifact containing:" },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-4">
                <span className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold flex-shrink-0">
                  {item.step}
                </span>
                <span className="pt-1">{item.text}</span>
              </div>
            ))}
          </div>
          
          <ul className="pl-12 space-y-1">
            <li>• High-density visual snapshots</li>
            <li>• Timestamped decision points</li>
            <li>• Trinity Reasoning Ledger with multi-perspective analysis</li>
            <li>• Embedded verification gates</li>
            <li>• Your exact process — captured and portable</li>
          </ul>
          
          <div className="space-y-4 pt-4">
            {[
              { step: "4", text: "Hand that artifact to your VA, your team, or your AI" },
              { step: "5", text: "Watch them execute YOUR way — without improvisation" },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-4">
                <span className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold flex-shrink-0">
                  {item.step}
                </span>
                <span className="pt-1">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white border-b border-white/20 pb-3">
          Pricing
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-white/5 p-6 rounded-lg border border-white/10 text-center">
            <p className="font-bold text-white text-xl">Free Tier</p>
            <p className="text-3xl font-bold text-emerald-400 mt-2">$0</p>
            <p className="text-white/60 mt-2">3 artifacts per month</p>
          </div>
          <div className="bg-emerald-500/10 p-6 rounded-lg border border-emerald-500/30 text-center">
            <p className="font-bold text-white text-xl">Pro Tier</p>
            <p className="text-3xl font-bold text-emerald-400 mt-2">$47<span className="text-lg text-white/60">/mo</span></p>
            <p className="text-white/60 mt-2">Unlimited artifacts</p>
          </div>
          <div className="bg-white/5 p-6 rounded-lg border border-white/10 text-center">
            <p className="font-bold text-white text-xl">Team Tier</p>
            <p className="text-3xl font-bold text-emerald-400 mt-2">$147<span className="text-lg text-white/60">/mo</span></p>
            <p className="text-white/60 mt-2">Multi-user access</p>
          </div>
        </div>
        <div className="text-center space-y-1 text-white/60">
          <p>No contracts.</p>
          <p>No lock-in.</p>
          <p>Cancel anytime.</p>
        </div>
      </section>

      {/* Guarantee */}
      <section className="space-y-6 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 p-8 rounded-xl border border-emerald-500/30">
        <h2 className="text-2xl md:text-3xl font-bold text-white">The Guarantee</h2>
        <div className="space-y-4 text-lg text-white/80">
          <p className="font-semibold text-white">Try OneDuo™ free.</p>
          <p>Create 3 artifacts.</p>
          <p>See if AI follows your rules.</p>
          <p>See if your VA finally "gets it."</p>
          <p>See if you can turn course theory into YOUR execution.</p>
          
          <p className="pt-4 font-semibold text-white">If it doesn't work?</p>
          <p>Walk away.</p>
          <p>No pressure. No hard feelings.</p>
          
          <p className="pt-4 font-semibold text-white">But if it DOES work...</p>
          <p className="text-xl font-bold text-emerald-400">You just found the memory layer you've been missing.</p>
        </div>
      </section>

      {/* CTA */}
      <section className="text-center space-y-6 py-8">
        <Link to="/upload">
          <Button size="lg" className="bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-xl px-12 py-8 rounded-xl">
            CREATE YOUR FIRST ARTIFACT FREE
            <ArrowRight className="w-6 h-6 ml-2" />
          </Button>
        </Link>
        <p className="text-white/60 text-sm">Remember: Only use content you own, create, or have explicit permission to process.</p>
      </section>

      {/* Coming Soon */}
      <section className="text-center space-y-4">
        <h3 className="text-xl font-bold text-white">Coming Soon:</h3>
        <p className="text-white/60">Team review dashboards + artifact lifecycle governance that let teams refine decisions over time — without starting from zero.</p>
      </section>

      {/* Final CTA */}
      <section className="text-center py-8">
        <p className="text-2xl font-bold text-emerald-400">Stop talking. Start doing.</p>
      </section>

      {/* Legal Disclaimers */}
      <section className="space-y-6 border-t border-white/10 pt-8">
        <h3 className="text-lg font-bold text-white/60 uppercase tracking-wider">Legal Disclaimers</h3>
        <div className="space-y-4 text-sm text-white/40">
          <div>
            <p className="font-semibold text-white/60">Results Disclaimer:</p>
            <p>Individual results may vary. OneDuo™ is a tool that captures and structures demonstrations — effectiveness depends on quality of input, clarity of process, and user implementation. We make no guarantees of specific business outcomes.</p>
          </div>
          <div>
            <p className="font-semibold text-white/60">Content Usage Policy:</p>
            <p>OneDuo™ users must only process content they own, create, or have explicit permission to use. Users are responsible for compliance with all applicable terms of service and copyright laws.</p>
          </div>
          <div>
            <p className="font-semibold text-white/60">Refund Policy:</p>
            <p>Free tier requires no payment. Pro and Team tiers may be cancelled at any time with no further charges. No refunds provided for partial months of service.</p>
          </div>
          <div>
            <p className="font-semibold text-white/60">Support:</p>
            <p><a href="mailto:support@oneduo.com" className="text-white/60 hover:text-white underline">support@oneduo.com</a></p>
            <p>Response time: 24-48 hours</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <section className="text-center space-y-2 border-t border-white/10 pt-8">
        <p className="text-white/60">© 2025 OneDuo™ — All Rights Reserved</p>
        <p className="text-white/40 text-sm">Built by Humans & AI for Humans & AI.</p>
      </section>

    </div>
  );
}
