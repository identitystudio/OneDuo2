import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Keyboard, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface Command {
  code: string;
  emoji?: string;
  label: string;
  description: string;
}

interface CommandGroup {
  title: string;
  color: string;
  commands: Command[];
}

const commandGroups: CommandGroup[] = [
  {
    title: "EXECUTIVE BOARD",
    color: "text-indigo-600",
    commands: [
      { code: "⚖️ 🧐", label: "Governor", description: "Detail Sentinel — Risk & Translation Tax" },
      { code: "🛠️ ⚙️", label: "Engineer", description: "Industrial Mechanic — 3 FPS Logic" },
      { code: "🏗️ 😎", label: "Architect", description: "Cool Strategist — Empire Scaling" },
      { code: "🔨 👑", label: "Judge (YOU)", description: "Final authority on all decisions" },
    ],
  },
  {
    title: "MODES",
    color: "text-amber-600",
    commands: [
      { code: "🕹️", label: "Game Mode", description: "Guided playback with Executive Board (default)" },
      { code: "📚", label: "Library Mode", description: "Knowledge lookup mode" },
      { code: "DO", label: "Doing Mode", description: "≤280 chars, one step at a time" },
      { code: "PT", label: "Pointe Mode", description: "One sentence only — fastest" },
      { code: "NM", label: "Normal Mode", description: "Full explanations allowed" },
    ],
  },
  {
    title: "ESSENTIAL REMOTE",
    color: "text-blue-600",
    commands: [
      { code: "GO", emoji: "▶️", label: "Start / Continue", description: "Begin or resume" },
      { code: "GPS", emoji: "⏲️", label: "GPS Location", description: "[■■■■□□] + COMPLETED / CURRENT / UP NEXT" },
      { code: ">>", emoji: "⏩", label: "Fast-Forward", description: "Jump to next section" },
      { code: "<<", emoji: "⏪", label: "Rewind", description: "Go back to previous section" },
      { code: "DO", emoji: "🎯", label: "Action Mode", description: "280 chars only" },
    ],
  },
  {
    title: "BOARDROOM",
    color: "text-purple-600",
    commands: [
      { code: "COUNCIL", emoji: "⚖️", label: "Trinity Debate", description: "Governor, Engineer, Architect deliberate" },
      { code: "??", label: "Where Am I?", description: "Context map (past / now / next)" },
      { code: "WY", emoji: "❓", label: "Why?", description: "Explain this step only" },
    ],
  },
  {
    title: "VIDEO NAVIGATION",
    color: "text-green-600",
    commands: [
      { code: "NV", emoji: "🎬", label: "Next Video", description: "Switch video (confirm first)" },
      { code: "PV", emoji: "📺", label: "Prev Video", description: "Previous video (confirm first)" },
      { code: "NX", emoji: "⏭️", label: "Next Step", description: "Advance to next step" },
      { code: "BK", emoji: "⏮️", label: "Back", description: "Previous step" },
    ],
  },
  {
    title: "SAFETY",
    color: "text-red-600",
    commands: [
      { code: "RS", label: "Reset", description: "Return to Step 1" },
      { code: "SK [n]", label: "Skip", description: "Jump to step number" },
      { code: "ASK", label: "Force Confirm", description: "Require approval each step" },
      { code: "LOG", label: "Show Decisions", description: "Display human decision history" },
    ],
  },
];

export function CommandReference() {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copyCommand = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    toast.success(`Copied "${code}" to clipboard`);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Card className="border-dashed">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Keyboard className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Universal Keyboard</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  🕹️ AI Remote
                </Badge>
              </div>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              Use these commands when working with your artifact in any AI system
            </p>
            
            {commandGroups.map((group) => (
              <div key={group.title} className="space-y-2">
                <h4 className={`text-xs font-semibold uppercase tracking-wide ${group.color}`}>
                  {group.title}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {group.commands.map((cmd) => (
                    <div
                      key={cmd.code}
                      className="flex items-center gap-2 p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 font-mono text-xs font-bold shrink-0"
                        onClick={() => copyCommand(cmd.code)}
                      >
                        {copied === cmd.code ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3 mr-1 opacity-50" />
                        )}
                        {cmd.emoji && <span className="mr-1">{cmd.emoji}</span>}
                        {cmd.code}
                      </Button>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{cmd.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{cmd.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}