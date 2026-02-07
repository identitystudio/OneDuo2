import { useState } from 'react';
import { Folder, FolderPlus, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface FolderOption {
  id: string;
  name: string;
}

interface MoveToFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: FolderOption[];
  selectedCount: number;
  onMove: (folderId: string | null) => Promise<void>;
  onCreateAndMove: (folderName: string) => Promise<void>;
}

export function MoveToFolderDialog({
  open,
  onOpenChange,
  folders,
  selectedCount,
  onMove,
  onCreateAndMove,
}: MoveToFolderDialogProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | 'new'>('new');
  const [newFolderName, setNewFolderName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleMove = async () => {
    setIsSubmitting(true);
    try {
      if (selectedFolderId === 'new') {
        if (!newFolderName.trim()) return;
        await onCreateAndMove(newFolderName.trim());
      } else {
        await onMove(selectedFolderId);
      }
      onOpenChange(false);
      setSelectedFolderId('new');
      setNewFolderName('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = selectedFolderId === 'new' ? newFolderName.trim().length > 0 : true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Move to Folder</DialogTitle>
          <DialogDescription className="text-white/60">
            Move {selectedCount} selected training{selectedCount > 1 ? 's' : ''} to a folder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-64 overflow-y-auto py-2">
          {/* Uncategorized option */}
          <button
            onClick={() => setSelectedFolderId(null)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
              selectedFolderId === null
                ? 'bg-white/10 ring-1 ring-white/20 text-white'
                : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Folder className="w-5 h-5 text-white/40" />
            <span className="flex-1 text-left">Remove from folder</span>
            {selectedFolderId === null && <Check className="w-4 h-4 text-cyan-400" />}
          </button>

          {/* Existing folders */}
          {folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => setSelectedFolderId(folder.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                selectedFolderId === folder.id
                  ? 'bg-cyan-500/20 ring-1 ring-cyan-500/40 text-cyan-400'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Folder className={`w-5 h-5 ${selectedFolderId === folder.id ? 'text-cyan-400' : ''}`} />
              <span className="flex-1 text-left truncate">{folder.name}</span>
              {selectedFolderId === folder.id && <Check className="w-4 h-4 text-cyan-400" />}
            </button>
          ))}

          {/* Create new folder option */}
          <div
            className={`rounded-lg transition-colors ${
              selectedFolderId === 'new'
                ? 'bg-cyan-500/10 ring-1 ring-cyan-500/30'
                : 'hover:bg-white/5'
            }`}
          >
            <button
              onClick={() => setSelectedFolderId('new')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm ${
                selectedFolderId === 'new' ? 'text-cyan-400' : 'text-white/70'
              }`}
            >
              <FolderPlus className={`w-5 h-5 ${selectedFolderId === 'new' ? 'text-cyan-400' : 'text-white/40'}`} />
              <span className="flex-1 text-left">Create new folder</span>
              {selectedFolderId === 'new' && <Check className="w-4 h-4 text-cyan-400" />}
            </button>
            
            {selectedFolderId === 'new' && (
              <div className="px-4 pb-3">
                <Input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Enter folder name..."
                  className="h-9 text-sm bg-white/10 border-white/20 text-white placeholder:text-white/40"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canSubmit) {
                      e.preventDefault();
                      handleMove();
                    }
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/10 text-white hover:bg-white/5"
          >
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            disabled={!canSubmit || isSubmitting}
            className="bg-cyan-500 hover:bg-cyan-400 text-black"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {selectedFolderId === 'new' ? 'Create & Move' : 'Move'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
