import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, FolderPlus, ChevronRight, X, Check, Loader2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export interface FolderItem {
  id: string;
  name: string;
  courseCount: number;
}

interface FolderSidebarProps {
  folders: FolderItem[];
  selectedFolderId: string | null; // null = "All", "uncategorized" = no folder
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onRenameFolder: (folderId: string, newName: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  totalCourseCount: number;
  uncategorizedCount: number;
  isLoading?: boolean;
}

export function FolderSidebar({
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  totalCourseCount,
  uncategorizedCount,
  isLoading = false,
}: FolderSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setIsSubmitting(true);
    try {
      await onCreateFolder(newFolderName.trim());
      setNewFolderName('');
      setIsCreating(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRenameFolder = async (folderId: string) => {
    if (!editingName.trim()) {
      setEditingFolderId(null);
      return;
    }
    setIsSubmitting(true);
    try {
      await onRenameFolder(folderId, editingName.trim());
      setEditingFolderId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    setIsSubmitting(true);
    try {
      await onDeleteFolder(folderId);
      setDeletingFolderId(null);
      // If we deleted the selected folder, go back to "All"
      if (selectedFolderId === folderId) {
        onSelectFolder(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditing = (folder: FolderItem) => {
    setEditingFolderId(folder.id);
    setEditingName(folder.name);
  };

  return (
    <div className="w-44 shrink-0 pr-2 border-r border-white/[0.08]">
      <div className="sticky top-8">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] font-medium text-white/50 uppercase tracking-wider">Folders</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCreating(true)}
            className="h-5 w-5 p-0 text-white/40 hover:text-white hover:bg-white/10"
          >
            <FolderPlus className="w-3 h-3" />
          </Button>
        </div>

        <div className="space-y-0.5">
          {/* All Trainings */}
          <button
            onClick={() => onSelectFolder(null)}
            className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors ${
              selectedFolderId === null
                ? 'bg-white/10 text-white'
                : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Folder className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate flex-1 text-left">All Trainings</span>
            <span className="text-[10px] text-white/40">{totalCourseCount}</span>
          </button>

          {/* Uncategorized */}
          <button
            onClick={() => onSelectFolder('uncategorized')}
            className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors ${
              selectedFolderId === 'uncategorized'
                ? 'bg-white/10 text-white'
                : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Folder className="w-3.5 h-3.5 shrink-0 text-white/40" />
            <span className="truncate flex-1 text-left">Uncategorized</span>
            <span className="text-[10px] text-white/40">{uncategorizedCount}</span>
          </button>

          {/* User Folders */}
          <AnimatePresence>
            {folders.map((folder) => (
              <motion.div
                key={folder.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="group"
              >
                {editingFolderId === folder.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleRenameFolder(folder.id);
                    }}
                    className="flex items-center gap-1 px-2"
                  >
                    <Input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => handleRenameFolder(folder.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditingFolderId(null);
                      }}
                      className="h-8 text-sm bg-white/10 border-white/20 text-white"
                      disabled={isSubmitting}
                    />
                    {isSubmitting && <Loader2 className="w-3 h-3 animate-spin text-white/50" />}
                  </form>
                ) : (
                  <div
                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors ${
                      selectedFolderId === folder.id
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : 'text-white/70 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <button
                      onClick={() => onSelectFolder(folder.id)}
                      className="flex items-center gap-1.5 flex-1 min-w-0"
                    >
                      <Folder className={`w-3.5 h-3.5 shrink-0 ${selectedFolderId === folder.id ? 'text-cyan-400' : ''}`} />
                      <span className="truncate text-left">{folder.name}</span>
                    </button>
                    <span className="text-[10px] text-white/40">{folder.courseCount}</span>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-opacity">
                          <MoreHorizontal className="w-3.5 h-3.5 text-white/50" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-[#1a1a1a] border-white/10">
                        <DropdownMenuItem onClick={() => startEditing(folder)} className="text-white/80 hover:text-white">
                          <Pencil className="w-3.5 h-3.5 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => setDeletingFolderId(folder.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Create New Folder */}
          <AnimatePresence>
            {isCreating && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCreateFolder();
                  }}
                  className="flex items-center gap-1 px-2 py-1"
                >
                  <Folder className="w-4 h-4 text-cyan-400 shrink-0" />
                  <Input
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Folder name..."
                    className="h-7 text-sm bg-white/10 border-white/20 text-white placeholder:text-white/30"
                    disabled={isSubmitting}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsCreating(false);
                        setNewFolderName('');
                      }
                    }}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isSubmitting || !newFolderName.trim()}
                    className="h-7 w-7 p-0 bg-cyan-500 hover:bg-cyan-400"
                  >
                    {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsCreating(false);
                      setNewFolderName('');
                    }}
                    className="h-7 w-7 p-0 text-white/50 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {isLoading && folders.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-white/40">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingFolderId} onOpenChange={() => setDeletingFolderId(null)}>
        <AlertDialogContent className="bg-[#1a1a1a] border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Folder?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              This will remove the folder but keep all trainings inside (they'll become uncategorized).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 text-white hover:bg-white/5">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingFolderId && handleDeleteFolder(deletingFolderId)}
              className="bg-red-500 hover:bg-red-600 text-white"
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete Folder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
