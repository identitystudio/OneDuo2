/**
 * Simulator Controls - Failure scenario toggles and actions
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FailureConfig, FailureType } from '@/adapters/uploadAdapter';
import { Wifi, WifiOff, Zap, RefreshCw, AlertTriangle } from 'lucide-react';

interface SimulatorControlsProps {
  onConfigChange: (config: FailureConfig) => void;
  onTriggerFailure: (type: FailureType) => void;
  onRestoreNetwork: () => void;
  isNetworkDown: boolean;
  isUploading: boolean;
}

export function SimulatorControls({
  onConfigChange,
  onTriggerFailure,
  onRestoreNetwork,
  isNetworkDown,
  isUploading,
}: SimulatorControlsProps) {
  const [config, setConfig] = useState<FailureConfig>({
    networkDropAtPercent: undefined,
    chunkFailureEveryN: undefined,
    latencySpikeMs: undefined,
  });

  const [networkDropEnabled, setNetworkDropEnabled] = useState(false);
  const [chunkFailureEnabled, setChunkFailureEnabled] = useState(false);
  const [latencySpikeEnabled, setLatencySpikeEnabled] = useState(false);

  const updateConfig = (updates: Partial<FailureConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onConfigChange(newConfig);
  };

  const handleNetworkDropToggle = (enabled: boolean) => {
    setNetworkDropEnabled(enabled);
    updateConfig({
      networkDropAtPercent: enabled ? (config.networkDropAtPercent ?? 50) : undefined,
    });
  };

  const handleChunkFailureToggle = (enabled: boolean) => {
    setChunkFailureEnabled(enabled);
    updateConfig({
      chunkFailureEveryN: enabled ? (config.chunkFailureEveryN ?? 5) : undefined,
    });
  };

  const handleLatencySpikeToggle = (enabled: boolean) => {
    setLatencySpikeEnabled(enabled);
    updateConfig({
      latencySpikeMs: enabled ? (config.latencySpikeMs ?? 500) : undefined,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Failure Simulation Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Automatic Failure Configs */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground">Automatic Failures</h4>
          
          {/* Network Drop */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="network-drop"
                checked={networkDropEnabled}
                onCheckedChange={handleNetworkDropToggle}
              />
              <Label htmlFor="network-drop" className="text-sm">
                Network drop at
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={99}
                value={config.networkDropAtPercent ?? 50}
                onChange={(e) => updateConfig({ networkDropAtPercent: parseInt(e.target.value) || 50 })}
                className="w-20 h-8"
                disabled={!networkDropEnabled}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>

          {/* Chunk Failure */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="chunk-failure"
                checked={chunkFailureEnabled}
                onCheckedChange={handleChunkFailureToggle}
              />
              <Label htmlFor="chunk-failure" className="text-sm">
                Fail every
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={50}
                value={config.chunkFailureEveryN ?? 5}
                onChange={(e) => updateConfig({ chunkFailureEveryN: parseInt(e.target.value) || 5 })}
                className="w-20 h-8"
                disabled={!chunkFailureEnabled}
              />
              <span className="text-sm text-muted-foreground">chunks</span>
            </div>
          </div>

          {/* Latency Spike */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="latency-spike"
                checked={latencySpikeEnabled}
                onCheckedChange={handleLatencySpikeToggle}
              />
              <Label htmlFor="latency-spike" className="text-sm">
                Latency spikes up to
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={100}
                max={5000}
                step={100}
                value={config.latencySpikeMs ?? 500}
                onChange={(e) => updateConfig({ latencySpikeMs: parseInt(e.target.value) || 500 })}
                className="w-24 h-8"
                disabled={!latencySpikeEnabled}
              />
              <span className="text-sm text-muted-foreground">ms</span>
            </div>
          </div>
        </div>

        {/* Manual Failure Triggers */}
        <div className="space-y-3 pt-4 border-t">
          <h4 className="text-sm font-medium text-muted-foreground">Manual Triggers</h4>
          
          <div className="grid grid-cols-2 gap-2">
            {isNetworkDown ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onRestoreNetwork}
                className="gap-2"
              >
                <Wifi className="w-4 h-4" />
                Restore Network
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onTriggerFailure('network_drop')}
                disabled={!isUploading}
                className="gap-2"
              >
                <WifiOff className="w-4 h-4" />
                Drop Network
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => onTriggerFailure('chunk_failure')}
              disabled={!isUploading}
              className="gap-2"
            >
              <AlertTriangle className="w-4 h-4" />
              Fail Next Chunk
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onTriggerFailure('latency_spike')}
              disabled={!isUploading}
              className="gap-2"
            >
              <Zap className="w-4 h-4" />
              Add Latency
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onTriggerFailure('browser_refresh')}
              disabled={!isUploading}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Simulate Refresh
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
