import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  ArrowLeft,
  RefreshCw,
  PlayCircle,
  XCircle,
  List,
  BarChart3
} from 'lucide-react';
import { toast } from 'sonner';
import { Logo } from '@/components/Logo';

interface QueueStats {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

interface QueueJob {
  id: string;
  job_id: string;
  video_path: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  locked_by: string | null;
  next_retry_at: string | null;
}

interface JobLog {
  id: string;
  job_id: string;
  step: string;
  level: string;
  message: string | null;
  error_reason: string | null;
  error_stack: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const ADMIN_EMAILS = ['christinaxcabral@gmail.com'];

export default function QueueMonitor() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<QueueStats>({ queued: 0, processing: 0, completed: 0, failed: 0, total: 0 });
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user && ADMIN_EMAILS.includes(user.email || '')) {
        setIsAdmin(true);
        fetchData();
      } else {
        toast.error('Admin access required');
        navigate('/');
      }
    };

    checkAdmin();
  }, [navigate]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch queue stats via edge function
      const { data: statsData, error: statsError } = await supabase.functions.invoke('queue-stats');
      
      if (statsError) throw statsError;
      
      if (statsData) {
        setStats(statsData.stats || { queued: 0, processing: 0, completed: 0, failed: 0, total: 0 });
        setJobs(statsData.recentJobs || []);
        setLogs(statsData.recentLogs || []);
      }

      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to fetch queue data:', err);
      toast.error('Failed to load queue data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchJobLogs = async (jobId: string) => {
    setSelectedJobId(jobId);
    try {
      const { data, error } = await supabase.functions.invoke('queue-stats', {
        body: { action: 'job-logs', jobId }
      });
      
      if (error) throw error;
      if (data?.logs) {
        setLogs(data.logs);
      }
    } catch (err) {
      console.error('Failed to fetch job logs:', err);
      toast.error('Failed to load job logs');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'processing': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'queued': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'failed': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-white/10 text-white/60 border-white/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'processing': return <Activity className="w-4 h-4 animate-pulse" />;
      case 'queued': return <Clock className="w-4 h-4" />;
      case 'failed': return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      default: return 'text-white/60';
    }
  };

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleString();
  };

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start || !end) return '-';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#030303] flex items-center justify-center">
        <div className="text-white/50">Checking access...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030303] text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/admin')}
              className="text-white/50 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Admin
            </Button>
            <Logo size="sm" />
            <Badge variant="outline" className="border-purple-500/50 text-purple-400">
              Queue Monitor
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/30">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchData}
              disabled={isLoading}
              className="border-white/20"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <Card className="bg-[#0a0f14] border border-white/10">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <span className="text-white/60 text-sm">Total</span>
                <BarChart3 className="w-5 h-5 text-white/40" />
              </div>
              <p className="text-2xl font-bold mt-2">{stats.total}</p>
            </CardContent>
          </Card>

          <Card className="bg-[#0a0f14] border border-blue-500/20">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <span className="text-white/60 text-sm">Queued</span>
                <Clock className="w-5 h-5 text-blue-400" />
              </div>
              <p className="text-2xl font-bold mt-2 text-blue-400">{stats.queued}</p>
            </CardContent>
          </Card>

          <Card className="bg-[#0a0f14] border border-yellow-500/20">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <span className="text-white/60 text-sm">Processing</span>
                <PlayCircle className="w-5 h-5 text-yellow-400" />
              </div>
              <p className="text-2xl font-bold mt-2 text-yellow-400">{stats.processing}</p>
            </CardContent>
          </Card>

          <Card className="bg-[#0a0f14] border border-green-500/20">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <span className="text-white/60 text-sm">Completed</span>
                <CheckCircle className="w-5 h-5 text-green-400" />
              </div>
              <p className="text-2xl font-bold mt-2 text-green-400">{stats.completed}</p>
            </CardContent>
          </Card>

          <Card className="bg-[#0a0f14] border border-red-500/20">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <span className="text-white/60 text-sm">Failed</span>
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <p className="text-2xl font-bold mt-2 text-red-400">{stats.failed}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-[#0a0f14] border border-white/10">
            <TabsTrigger value="overview" className="data-[state=active]:bg-purple-500/20">
              <List className="w-4 h-4 mr-2" />
              Jobs
            </TabsTrigger>
            <TabsTrigger value="logs" className="data-[state=active]:bg-purple-500/20">
              <Activity className="w-4 h-4 mr-2" />
              Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card className="bg-[#0a0f14] border border-white/10">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <List className="w-5 h-5 text-purple-400" />
                  Recent Jobs
                </CardTitle>
              </CardHeader>
              <CardContent>
                {jobs.length === 0 ? (
                  <p className="text-white/50 text-center py-8">No jobs in queue</p>
                ) : (
                  <div className="space-y-3">
                    {jobs.map((job) => (
                      <div 
                        key={job.id}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors hover:bg-white/5 ${
                          selectedJobId === job.job_id ? 'bg-purple-500/10 border-purple-500/30' : 'bg-[#030303] border-white/10'
                        }`}
                        onClick={() => fetchJobLogs(job.job_id)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className={getStatusColor(job.status)}>
                                {getStatusIcon(job.status)}
                                <span className="ml-1">{job.status}</span>
                              </Badge>
                              <span className="text-xs text-white/30 font-mono">{job.job_id.slice(0, 8)}...</span>
                              <span className="text-xs text-white/30">
                                Attempt {job.attempt_count}/{job.max_attempts}
                              </span>
                            </div>
                            <p className="text-sm text-white/70 truncate font-mono">{job.video_path}</p>
                            {job.error_message && (
                              <p className="text-xs text-red-400 mt-1 truncate">{job.error_message}</p>
                            )}
                          </div>
                          <div className="text-right text-xs text-white/30">
                            <div>Created: {formatTimestamp(job.created_at)}</div>
                            {job.status === 'completed' && (
                              <div>Duration: {formatDuration(job.started_at, job.completed_at)}</div>
                            )}
                            {job.next_retry_at && (
                              <div className="text-yellow-400">Retry at: {formatTimestamp(job.next_retry_at)}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <Card className="bg-[#0a0f14] border border-white/10">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="w-5 h-5 text-purple-400" />
                  {selectedJobId ? `Logs for ${selectedJobId.slice(0, 8)}...` : 'Recent Logs'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <p className="text-white/50 text-center py-8">No logs available</p>
                ) : (
                  <div className="space-y-2 font-mono text-sm">
                    {logs.map((log) => (
                      <div 
                        key={log.id}
                        className={`p-3 rounded-lg border ${
                          log.level === 'error' ? 'bg-red-500/5 border-red-500/20' :
                          log.level === 'warn' ? 'bg-yellow-500/5 border-yellow-500/20' :
                          'bg-[#030303] border-white/10'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-xs text-white/30 whitespace-nowrap">
                            {formatTimestamp(log.created_at)}
                          </span>
                          <Badge variant="outline" className={`text-xs ${getLevelColor(log.level)}`}>
                            {log.level.toUpperCase()}
                          </Badge>
                          <span className="text-xs text-purple-400">[{log.step}]</span>
                          <span className="text-xs text-white/30 font-mono">{log.job_id.slice(0, 8)}</span>
                        </div>
                        {log.message && (
                          <p className="text-white/70 mt-1 text-xs">{log.message}</p>
                        )}
                        {log.error_reason && (
                          <p className="text-red-400 mt-1 text-xs">{log.error_reason}</p>
                        )}
                        {log.error_stack && (
                          <pre className="text-red-400/60 mt-1 text-xs overflow-x-auto max-h-24 overflow-y-auto">
                            {log.error_stack}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
