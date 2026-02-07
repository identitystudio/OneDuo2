import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Key, Plus, Copy, Trash2, Eye, EyeOff, Activity, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  active: boolean;
  rate_limit_per_hour: number;
  credits_remaining: number | null;
  created_at: string;
  last_used_at: string | null;
}

interface ApiKeyUsage {
  endpoint: string;
  count: number;
  last_used: string;
}

export function ApiKeyManager() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedKeyUsage, setSelectedKeyUsage] = useState<ApiKeyUsage[]>([]);
  const [showUsageDialog, setShowUsageDialog] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('id, key_prefix, name, active, rate_limit_per_hour, credits_remaining, created_at, last_used_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApiKeys(data || []);
    } catch (error) {
      console.error('Failed to fetch API keys:', error);
      toast.error('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const generateApiKey = (): string => {
    const prefix = 'od_live_';
    const randomBytes = new Uint8Array(24);
    crypto.getRandomValues(randomBytes);
    const key = Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return prefix + key;
  };

  const hashApiKey = async (key: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const createApiKey = async () => {
    if (!newKeyName.trim()) {
      toast.error('Please enter a name for the API key');
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const apiKey = generateApiKey();
      const keyHash = await hashApiKey(apiKey);
      const keyPrefix = apiKey.substring(0, 12) + '...';

      const { error } = await supabase
        .from('api_keys')
        .insert({
          key_hash: keyHash,
          key_prefix: keyPrefix,
          name: newKeyName.trim(),
          user_id: user.id,
          rate_limit_per_hour: 100
        });

      if (error) throw error;

      setNewKeyValue(apiKey);
      await fetchApiKeys();
      toast.success('API key created! Copy it now - it won\'t be shown again.');
    } catch (error) {
      console.error('Failed to create API key:', error);
      toast.error('Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const revokeApiKey = async (keyId: string) => {
    try {
      const { error } = await supabase
        .from('api_keys')
        .update({ active: false })
        .eq('id', keyId);

      if (error) throw error;
      await fetchApiKeys();
      toast.success('API key revoked');
    } catch (error) {
      console.error('Failed to revoke API key:', error);
      toast.error('Failed to revoke API key');
    }
  };

  const deleteApiKey = async (keyId: string) => {
    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId);

      if (error) throw error;
      await fetchApiKeys();
      toast.success('API key deleted');
    } catch (error) {
      console.error('Failed to delete API key:', error);
      toast.error('Failed to delete API key');
    }
  };

  const viewUsage = async (keyId: string) => {
    setSelectedKeyId(keyId);
    try {
      const { data, error } = await supabase
        .from('api_usage_log')
        .select('endpoint, created_at')
        .eq('api_key_id', keyId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Aggregate by endpoint
      const usageMap = new Map<string, { count: number; last_used: string }>();
      (data || []).forEach(row => {
        const existing = usageMap.get(row.endpoint);
        if (existing) {
          existing.count++;
        } else {
          usageMap.set(row.endpoint, { count: 1, last_used: row.created_at });
        }
      });

      const usage: ApiKeyUsage[] = Array.from(usageMap.entries()).map(([endpoint, stats]) => ({
        endpoint,
        count: stats.count,
        last_used: stats.last_used
      }));

      setSelectedKeyUsage(usage);
      setShowUsageDialog(true);
    } catch (error) {
      console.error('Failed to fetch usage:', error);
      toast.error('Failed to load usage data');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const resetCreateDialog = () => {
    setNewKeyName('');
    setNewKeyValue(null);
    setShowCreateDialog(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Keys
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Keys
            </CardTitle>
            <CardDescription>
              Manage API keys for programmatic access to OneDuo
            </CardDescription>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={(open) => {
            if (!open) resetCreateDialog();
            else setShowCreateDialog(true);
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Create Key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create API Key</DialogTitle>
                <DialogDescription>
                  {newKeyValue 
                    ? 'Copy your API key now. It won\'t be shown again!'
                    : 'Give your API key a descriptive name to help you identify it later.'
                  }
                </DialogDescription>
              </DialogHeader>
              
              {newKeyValue ? (
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg border-2 border-primary">
                    <Label className="text-xs text-muted-foreground mb-2 block">Your API Key</Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-sm break-all font-mono">{newKeyValue}</code>
                      <Button size="sm" variant="outline" onClick={() => copyToClipboard(newKeyValue)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>This key will only be displayed once. Store it securely.</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="key-name">Key Name</Label>
                    <Input
                      id="key-name"
                      placeholder="e.g., Production Server"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                    />
                  </div>
                </div>
              )}
              
              <DialogFooter>
                {newKeyValue ? (
                  <Button onClick={resetCreateDialog}>Done</Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={resetCreateDialog}>Cancel</Button>
                    <Button onClick={createApiKey} disabled={creating || !newKeyName.trim()}>
                      {creating ? 'Creating...' : 'Create Key'}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {apiKeys.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No API keys yet</p>
            <p className="text-sm">Create an API key to start using the OneDuo API</p>
          </div>
        ) : (
          <div className="space-y-3">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  key.active ? 'bg-card' : 'bg-muted/50 opacity-60'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{key.name}</span>
                    {key.active ? (
                      <Badge variant="outline" className="text-green-600 border-green-600">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-600 border-red-600">Revoked</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <code className="font-mono">{key.key_prefix}</code>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Created {format(new Date(key.created_at), 'MMM d, yyyy')}
                    </span>
                    {key.last_used_at && (
                      <span className="flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        Last used {format(new Date(key.last_used_at), 'MMM d, h:mm a')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => viewUsage(key.id)}
                    title="View usage"
                  >
                    <Activity className="h-4 w-4" />
                  </Button>
                  {key.active && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm('Revoke this API key? It will no longer work for API requests.')) {
                          revokeApiKey(key.id);
                        }
                      }}
                      title="Revoke key"
                      className="text-amber-600 hover:text-amber-700"
                    >
                      <EyeOff className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm('Delete this API key permanently?')) {
                        deleteApiKey(key.id);
                      }
                    }}
                    title="Delete key"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* API Documentation hint */}
        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <h4 className="font-medium mb-2">Quick Start</h4>
          <pre className="text-xs bg-background p-3 rounded border overflow-x-auto">
{`curl -X POST https://gtfvtezmjrcsmoebuxrw.supabase.co/functions/v1/api-transform/v1/transform \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"video_url": "https://example.com/video.mp4"}'`}
          </pre>
        </div>
      </CardContent>

      {/* Usage Dialog */}
      <Dialog open={showUsageDialog} onOpenChange={setShowUsageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Usage</DialogTitle>
            <DialogDescription>Recent API calls made with this key</DialogDescription>
          </DialogHeader>
          {selectedKeyUsage.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No usage recorded yet</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {selectedKeyUsage.map((usage, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <code className="text-sm font-mono">{usage.endpoint}</code>
                    <p className="text-xs text-muted-foreground">
                      Last: {format(new Date(usage.last_used), 'MMM d, h:mm a')}
                    </p>
                  </div>
                  <Badge variant="secondary">{usage.count} calls</Badge>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowUsageDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
