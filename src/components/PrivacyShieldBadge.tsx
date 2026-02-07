/**
 * Privacy Shield Badge
 * Zero-Knowledge Processing indicator for Ghost Upload architecture
 */

import { Shield, Ghost } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PrivacyShieldBadgeProps {
  variant?: 'compact' | 'full';
  className?: string;
}

export function PrivacyShieldBadge({ variant = 'compact', className }: PrivacyShieldBadgeProps) {
  const content = (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-full",
      "bg-emerald-500/10 border border-emerald-500/30",
      "text-emerald-400 text-xs font-medium",
      className
    )}>
      <Ghost className="w-3.5 h-3.5" />
      {variant === 'full' ? (
        <span>Zero-Knowledge Processing</span>
      ) : (
        <span>Ghost Upload</span>
      )}
    </div>
  );

  if (variant === 'compact') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {content}
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-2">
              <p className="font-medium text-emerald-400">Zero-Knowledge Processing</p>
              <p className="text-xs text-muted-foreground">
                Your original video is processed and <strong>immediately purged</strong>. 
                We retain only transformed artifacts — we can't see, share, or reproduce your source content.
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}
