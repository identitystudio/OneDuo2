import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { HeroProductDemo } from '@/components/HeroProductDemo';
import { X } from 'lucide-react';

interface VSLDemoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const VSLDemoModal = ({ open, onOpenChange }: VSLDemoModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 w-[calc(100vw-1.5rem)] max-w-xl max-h-[90vh] bg-[#030303] text-white border border-white/10 overflow-hidden flex flex-col items-center [&>button]:hidden">
        <VisuallyHidden>
          <DialogTitle>OneDuo Demo</DialogTitle>
        </VisuallyHidden>

        {/* Close button */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-3 right-3 z-50 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors"
          aria-label="Close demo"
        >
          <X className="w-4 h-4 text-white/60 hover:text-white" />
        </button>

        {/* Demo body */}
        <div className="relative w-full">
          {/* Subtle background glow */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-gradient-to-b from-cyan-500/10 via-cyan-500/5 to-transparent blur-3xl" />
          </div>

          <div className="relative z-0 p-4 md:p-5 flex flex-col items-center">
            <div className="text-center mb-4">
              <h3 className="text-lg font-semibold text-white mb-1">See OneDuo in Action</h3>
              <p className="text-white/60 text-xs">Watch how OneDuo transforms your videos into AI-ready context</p>
            </div>
            {/* Auto-play immediately when modal opens */}
            <div className="w-full flex justify-center">
              {open && <HeroProductDemo />}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
