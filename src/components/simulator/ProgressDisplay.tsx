/**
 * Progress Display - Shows upload progress with status and metrics
 */

import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { UploadSession } from '@/adapters/uploadAdapter';
import { Loader2, CheckCircle, XCircle, Pause, AlertTriangle } from 'lucide-react';

interface ProgressDisplayProps {
  session: UploadSession | null;
  startTime: number | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

const statusConfig = {
  idle: { label: 'Idle', color: 'bg-gray-100 text-gray-700', icon: null },
  uploading: { label: 'Uploading', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
  retrying: { label: 'Retrying', color: 'bg-yellow-100 text-yellow-700', icon: AlertTriangle },
  paused: { label: 'Paused', color: 'bg-orange-100 text-orange-700', icon: Pause },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: XCircle },
};

export function ProgressDisplay({ session, startTime }: ProgressDisplayProps) {
  if (!session) {
    return (
      <div className="p-6 border rounded-lg bg-muted/30 text-center">
        <p className="text-muted-foreground">Select a file to begin upload simulation</p>
      </div>
    );
  }

  const progress = session.totalChunks > 0 
    ? (session.uploadedChunks / session.totalChunks) * 100 
    : 0;

  const config = statusConfig[session.status];
  const StatusIcon = config.icon;

  // Calculate speed and ETA
  const elapsed = startTime ? Date.now() - startTime : 0;
  const speed = elapsed > 0 ? session.bytesUploaded / (elapsed / 1000) : 0;
  const remaining = session.fileSize - session.bytesUploaded;
  const eta = speed > 0 ? remaining / speed : 0;

  return (
    <div className="p-6 border rounded-lg bg-card space-y-4">
      {/* File info */}
      <div className="flex items-center justify-between">
        <div className="truncate">
          <p className="font-medium truncate">{session.fileName}</p>
          <p className="text-sm text-muted-foreground">
            {formatBytes(session.fileSize)} • {session.totalChunks} chunks
          </p>
        </div>
        <Badge className={config.color}>
          {StatusIcon && (
            <StatusIcon className={`w-3 h-3 mr-1 ${session.status === 'uploading' ? 'animate-spin' : ''}`} />
          )}
          {config.label}
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <Progress value={progress} className="h-3" />
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>
            Chunk {session.uploadedChunks} / {session.totalChunks}
          </span>
          <span>{progress.toFixed(1)}%</span>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4 pt-2 border-t">
        <div>
          <p className="text-xs text-muted-foreground">Uploaded</p>
          <p className="font-medium">{formatBytes(session.bytesUploaded)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Speed</p>
          <p className="font-medium">
            {session.status === 'uploading' ? `${formatBytes(speed)}/s` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">ETA</p>
          <p className="font-medium">
            {session.status === 'uploading' && eta > 0 ? formatDuration(eta * 1000) : '—'}
          </p>
        </div>
      </div>

      {/* Retry info */}
      {session.totalRetries > 0 && (
        <div className="pt-2 border-t">
          <p className="text-sm text-muted-foreground">
            Total retries: <span className="font-medium text-foreground">{session.totalRetries}</span>
            {session.status === 'retrying' && (
              <span className="ml-2">
                (attempt {session.currentRetryAttempt})
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
