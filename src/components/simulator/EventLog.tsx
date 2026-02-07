/**
 * Event Log - Displays structured timeline of upload events
 */

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { UploadEvent, UploadEventType } from '@/adapters/uploadAdapter';

interface EventLogProps {
  events: UploadEvent[];
}

const eventStyles: Record<UploadEventType, { color: string; bg: string }> = {
  UPLOAD_STARTED: { color: 'text-blue-600', bg: 'bg-blue-100' },
  CHUNK_SENT: { color: 'text-green-600', bg: 'bg-green-100' },
  CHUNK_FAILED: { color: 'text-red-600', bg: 'bg-red-100' },
  NETWORK_LOST: { color: 'text-orange-600', bg: 'bg-orange-100' },
  NETWORK_RESTORED: { color: 'text-teal-600', bg: 'bg-teal-100' },
  RETRY_SCHEDULED: { color: 'text-yellow-600', bg: 'bg-yellow-100' },
  RETRY_ATTEMPTED: { color: 'text-yellow-700', bg: 'bg-yellow-100' },
  RESUMED_FROM_CHECKPOINT: { color: 'text-purple-600', bg: 'bg-purple-100' },
  UPLOAD_COMPLETED: { color: 'text-green-700', bg: 'bg-green-200' },
  UPLOAD_FAILED: { color: 'text-red-700', bg: 'bg-red-200' },
  UPLOAD_PAUSED: { color: 'text-gray-600', bg: 'bg-gray-100' },
  UPLOAD_CANCELLED: { color: 'text-gray-700', bg: 'bg-gray-200' },
  STALL_DETECTED: { color: 'text-orange-700', bg: 'bg-orange-200' },
  STALL_RECOVERED: { color: 'text-teal-700', bg: 'bg-teal-200' },
  LATENCY_SPIKE: { color: 'text-amber-600', bg: 'bg-amber-100' },
};

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

function formatEventData(event: UploadEvent): string {
  const { type, data } = event;
  
  switch (type) {
    case 'UPLOAD_STARTED':
      return `${data.fileName} (${formatBytes(data.fileSize as number)}, ${data.totalChunks} chunks)`;
    case 'CHUNK_SENT':
      return `(${data.chunkNumber}/${data.totalChunks})`;
    case 'CHUNK_FAILED':
      return `(${data.chunkNumber}) - ${data.error}`;
    case 'NETWORK_LOST':
      return `at ${(data.atPercent as number).toFixed(1)}%`;
    case 'NETWORK_RESTORED':
      return `resuming from chunk ${data.resumingFrom}`;
    case 'RETRY_SCHEDULED':
      return `in ${data.delayMs}ms (attempt ${data.attempt}/${data.maxAttempts})`;
    case 'RETRY_ATTEMPTED':
      return `attempt ${data.attempt}/${data.maxAttempts}`;
    case 'RESUMED_FROM_CHECKPOINT':
      return `from chunk ${data.fromChunk}/${data.totalChunks}`;
    case 'UPLOAD_COMPLETED':
      return `${formatDuration(data.totalTime as number)}, ${data.chunksRetried} retries`;
    case 'UPLOAD_FAILED':
      return data.error as string;
    case 'LATENCY_SPIKE':
      return `chunk ${data.chunkNumber} +${data.additionalMs}ms`;
    default:
      return JSON.stringify(data);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function EventLog({ events }: EventLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  return (
    <div className="border rounded-lg bg-muted/30">
      <div className="p-3 border-b bg-muted/50">
        <h3 className="font-semibold text-sm">Event Log ({events.length})</h3>
      </div>
      <ScrollArea className="h-64">
        <div className="p-2 space-y-1 font-mono text-xs">
          {events.length === 0 ? (
            <div className="text-muted-foreground text-center py-8">
              No events yet. Start an upload to see the event log.
            </div>
          ) : (
            events.map((event, idx) => {
              const style = eventStyles[event.type] || { color: 'text-gray-600', bg: 'bg-gray-100' };
              return (
                <div key={idx} className="flex items-start gap-2 py-1 px-2 rounded hover:bg-muted/50">
                  <span className="text-muted-foreground shrink-0">
                    {formatTimestamp(event.timestamp)}
                  </span>
                  <Badge variant="outline" className={`${style.bg} ${style.color} shrink-0 text-[10px] font-medium`}>
                    {event.type}
                  </Badge>
                  <span className="text-muted-foreground truncate">
                    {formatEventData(event)}
                  </span>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
