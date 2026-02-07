/**
 * Upload Recovery Dialog
 * Shows interrupted uploads as a non-blocking notification
 */

import { ActiveUploadState } from '@/hooks/useUploadPersistence';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

interface UploadRecoveryDialogProps {
  pendingUpload: ActiveUploadState | Omit<ActiveUploadState, 'id' | 'tabId'>;
  onResume: () => void;
  onStartFresh: () => void;
}

export function UploadRecoveryDialog({ 
  pendingUpload, 
  onResume, 
  onStartFresh 
}: UploadRecoveryDialogProps) {
  const minutesAgo = Math.floor((Date.now() - pendingUpload.startedAt) / (1000 * 60));
  const timeAgo = minutesAgo < 60 
    ? `${minutesAgo} minute${minutesAgo !== 1 ? 's' : ''} ago`
    : `${Math.floor(minutesAgo / 60)} hour${Math.floor(minutesAgo / 60) !== 1 ? 's' : ''} ago`;

  const uploadedCount = pendingUpload.uploadedModules;
  const totalCount = pendingUpload.totalModules;
  const remainingCount = totalCount - uploadedCount;

  return (
    <Dialog open={true} onOpenChange={() => onStartFresh()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <DialogTitle>Resume Previous Upload?</DialogTitle>
              <DialogDescription>Started {timeAgo}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <p className="font-medium text-foreground">{pendingUpload.courseTitle}</p>
            <p className="text-sm text-muted-foreground">
              {pendingUpload.email}
            </p>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Progress:</span>
              <span className="font-medium text-foreground">
                {uploadedCount} of {totalCount} videos uploaded
              </span>
            </div>
            {remainingCount > 0 && (
              <p className="text-xs text-amber-600">
                {remainingCount} video{remainingCount !== 1 ? 's' : ''} still need{remainingCount === 1 ? 's' : ''} to be uploaded
              </p>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            Would you like to continue this upload? You can also dismiss this and start a new upload.
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onStartFresh}
            className="gap-2"
          >
            <X className="w-4 h-4" />
            Dismiss
          </Button>
          <Button
            onClick={onResume}
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Resume Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
