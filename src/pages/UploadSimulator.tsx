/**
 * Upload Reliability Simulator
 * Sandbox page for testing upload resilience with simulated failures
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  getUploadAdapter,
  UploadEvent,
  UploadSession,
  FailureConfig,
  FailureType,
} from '@/adapters/uploadAdapter';
import { SimulatorControls } from '@/components/simulator/SimulatorControls';
import { ProgressDisplay } from '@/components/simulator/ProgressDisplay';
import { EventLog } from '@/components/simulator/EventLog';
import { Upload, Play, Pause, X, RotateCcw, AlertCircle } from 'lucide-react';

export default function UploadSimulator() {
  const [session, setSession] = useState<UploadSession | null>(null);
  const [events, setEvents] = useState<UploadEvent[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [hasResumable, setHasResumable] = useState(false);
  const [isNetworkDown, setIsNetworkDown] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  
  const adapterRef = useRef(getUploadAdapter());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to adapter events
  useEffect(() => {
    const adapter = adapterRef.current;
    
    const unsubscribe = adapter.onEvent((event) => {
      setEvents(prev => [...prev, event]);
      setSession(adapter.getSession());
      
      // Track network state
      if (event.type === 'NETWORK_LOST') {
        setIsNetworkDown(true);
      } else if (event.type === 'NETWORK_RESTORED') {
        setIsNetworkDown(false);
      }
    });

    // Check for resumable session on mount
    setHasResumable(adapter.hasResumableSession());

    return () => {
      unsubscribe();
    };
  }, []);

  // Polling for session updates during upload
  useEffect(() => {
    if (!session || session.status === 'completed' || session.status === 'failed') {
      return;
    }

    const interval = setInterval(() => {
      setSession(adapterRef.current.getSession());
    }, 100);

    return () => clearInterval(interval);
  }, [session?.status]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleStartUpload = async () => {
    if (!selectedFile) return;
    
    setEvents([]);
    setStartTime(Date.now());
    await adapterRef.current.startUpload(selectedFile);
  };

  const handleResumeUpload = async () => {
    setStartTime(Date.now());
    await adapterRef.current.resumeUpload();
    setHasResumable(false);
  };

  const handlePauseUpload = () => {
    adapterRef.current.pauseUpload();
  };

  const handleCancelUpload = () => {
    adapterRef.current.cancelUpload();
    setSession(null);
    setEvents([]);
    setSelectedFile(null);
    setStartTime(null);
    setHasResumable(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleReset = () => {
    adapterRef.current.reset();
    setSession(null);
    setEvents([]);
    setSelectedFile(null);
    setStartTime(null);
    setIsNetworkDown(false);
    setHasResumable(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfigChange = useCallback((config: FailureConfig) => {
    adapterRef.current.setFailureConfig(config);
  }, []);

  const handleTriggerFailure = useCallback((type: FailureType) => {
    adapterRef.current.simulateFailure(type);
  }, []);

  const handleRestoreNetwork = useCallback(() => {
    adapterRef.current.restoreNetwork();
    setIsNetworkDown(false);
  }, []);

  const isUploading = session?.status === 'uploading' || session?.status === 'retrying';
  const isPaused = session?.status === 'paused';
  const isComplete = session?.status === 'completed';
  const isFailed = session?.status === 'failed';

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Upload Reliability Simulator</h1>
          <p className="text-muted-foreground">
            Test upload resilience with simulated network failures, chunk errors, and recovery
          </p>
        </div>

        {/* Resume Alert */}
        {hasResumable && !session && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>A previous upload session was found. Would you like to resume?</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setHasResumable(false)}>
                  Dismiss
                </Button>
                <Button size="sm" onClick={handleResumeUpload}>
                  Resume Upload
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Upload & Progress */}
          <div className="space-y-6">
            {/* File Selection */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">File Selection</CardTitle>
                <CardDescription>
                  Choose a file to simulate upload (file data is not actually sent anywhere)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileSelect}
                    disabled={isUploading}
                    className="flex-1"
                  />
                </div>
                
                {selectedFile && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                  </p>
                )}

                <Separator />

                <div className="flex gap-2">
                  {!isUploading && !isPaused && (
                    <Button
                      onClick={handleStartUpload}
                      disabled={!selectedFile || isComplete}
                      className="gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      Start Upload
                    </Button>
                  )}
                  
                  {isPaused && (
                    <Button onClick={handleResumeUpload} className="gap-2">
                      <Play className="w-4 h-4" />
                      Resume
                    </Button>
                  )}
                  
                  {isUploading && (
                    <Button onClick={handlePauseUpload} variant="secondary" className="gap-2">
                      <Pause className="w-4 h-4" />
                      Pause
                    </Button>
                  )}
                  
                  {(isUploading || isPaused) && (
                    <Button onClick={handleCancelUpload} variant="destructive" className="gap-2">
                      <X className="w-4 h-4" />
                      Cancel
                    </Button>
                  )}
                  
                  {(isComplete || isFailed) && (
                    <Button onClick={handleReset} variant="outline" className="gap-2">
                      <RotateCcw className="w-4 h-4" />
                      Reset
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Progress Display */}
            <ProgressDisplay session={session} startTime={startTime} />

            {/* Simulator Controls */}
            <SimulatorControls
              onConfigChange={handleConfigChange}
              onTriggerFailure={handleTriggerFailure}
              onRestoreNetwork={handleRestoreNetwork}
              isNetworkDown={isNetworkDown}
              isUploading={isUploading || isPaused}
            />
          </div>

          {/* Right Column - Event Log */}
          <div className="space-y-6">
            <EventLog events={events} />
            
            {/* Stats Summary */}
            {events.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Session Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Total Events</p>
                      <p className="font-medium">{events.length}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Chunks Sent</p>
                      <p className="font-medium">
                        {events.filter(e => e.type === 'CHUNK_SENT').length}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Failures</p>
                      <p className="font-medium text-red-600">
                        {events.filter(e => e.type === 'CHUNK_FAILED' || e.type === 'NETWORK_LOST').length}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Retries</p>
                      <p className="font-medium text-yellow-600">
                        {events.filter(e => e.type === 'RETRY_ATTEMPTED').length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
