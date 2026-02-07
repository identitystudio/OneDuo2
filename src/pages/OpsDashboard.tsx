import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft,
  RefreshCw,
  Shield,
  Zap,
  Activity,
  CheckCircle,
  AlertTriangle,
  Clock,
  Wrench,
  TrendingUp,
  Bot,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { Logo } from '@/components/Logo';

interface AutoFix {
  id: string;
  issue_type: string;
  issue_description: string;
  severity: string;
  auto_fixed: boolean;
  fix_applied: string | null;
  fixed_at: string | null;
  detected_at: string;
  course_id: string | null;
  user_email: string | null;
}

interface Pattern {
  id: string;
  pattern_key: string;
  pattern_description: string;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
  auto_fix_available: boolean;
  auto_fix_strategy: string | null;
}

interface ProcessingCourse {
  id: string;
  title: string;
  status: string;
  progress: number;
}

interface DashboardData {
  recentFixes: AutoFix[];
  patterns: Pattern[];
  processingCourses: ProcessingCourse[];
  summary: {
    totalFixesToday: number;
    activeProcessing: number;
    topPattern: string;
  };
}

export default function OpsDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [watchdogResult, setWatchdogResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunningWatchdog, setIsRunningWatchdog] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const adminEmails = ['christinaxcabral@gmail.com'];
      
      if (user && adminEmails.includes(user.email || '')) {
        setIsAdmin(true);
        fetchDashboard();
      } else {
        toast.error('Admin access required');
        navigate('/');
      }
    };

    checkAdmin();
  }, [navigate]);

  const fetchDashboard = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ops-watchdog', {
        body: { action: 'get-dashboard' }
      });
      
      if (error) throw error;
      setData(data);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to fetch ops dashboard:', err);
      toast.error('Failed to load ops data');
    } finally {
      setIsLoading(false);
    }
  };

  const runWatchdog = async () => {
    setIsRunningWatchdog(true);
    try {
      const { data, error } = await supabase.functions.invoke('ops-watchdog', {
        body: { action: 'run-checks' }
      });
      
      if (error) throw error;
      
      setWatchdogResult(data);
      toast.success(`Watchdog complete: ${data.results?.autoFixesApplied || 0} auto-fixes applied`);
      
      // Refresh dashboard after watchdog runs
      await fetchDashboard();
    } catch (err) {
      console.error('Watchdog failed:', err);
      toast.error('Watchdog run failed');
    } finally {
      setIsRunningWatchdog(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'border-red-500/50 text-red-400';
      case 'medium': return 'border-yellow-500/50 text-yellow-400';
      case 'low': return 'border-green-500/50 text-green-400';
      default: return 'border-white/30 text-white/60';
    }
  };

  const getSeverityBg = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-500/10';
      case 'medium': return 'bg-yellow-500/10';
      case 'low': return 'bg-green-500/10';
      default: return 'bg-white/5';
    }
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
            <Badge variant="outline" className="border-cyan-500/50 text-cyan-400">
              <Bot className="w-3 h-3 mr-1" />
              Ops Center
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/30">
              Last: {lastRefresh.toLocaleTimeString()}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchDashboard}
              disabled={isLoading}
              className="border-white/20"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button 
              size="sm" 
              onClick={runWatchdog}
              disabled={isRunningWatchdog}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              <Zap className={`w-4 h-4 mr-2 ${isRunningWatchdog ? 'animate-pulse' : ''}`} />
              Run Watchdog
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Summary Cards */}
        <section className="mb-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-[#0a0f14] border border-cyan-500/20">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Auto-Fixes Today</span>
                  <Wrench className="w-5 h-5 text-cyan-400" />
                </div>
                <p className="text-2xl font-bold mt-2 text-cyan-400">
                  {data?.summary?.totalFixesToday || 0}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-[#0a0f14] border border-yellow-500/20">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Active Processing</span>
                  <Activity className="w-5 h-5 text-yellow-400" />
                </div>
                <p className="text-2xl font-bold mt-2 text-yellow-400">
                  {data?.summary?.activeProcessing || 0}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-[#0a0f14] border border-purple-500/20">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Patterns Tracked</span>
                  <Eye className="w-5 h-5 text-purple-400" />
                </div>
                <p className="text-2xl font-bold mt-2 text-purple-400">
                  {data?.patterns?.length || 0}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-[#0a0f14] border border-green-500/20">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">System Status</span>
                  <Shield className="w-5 h-5 text-green-400" />
                </div>
                <p className="text-lg font-bold mt-2 text-green-400">
                  Self-Healing
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Watchdog Result */}
        {watchdogResult && (
          <section className="mb-8">
            <Card className="bg-cyan-500/5 border border-cyan-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-cyan-400">
                  <Zap className="w-4 h-4" />
                  Latest Watchdog Run
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span>{watchdogResult.results?.stuckJobsFixed || 0} stuck jobs fixed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                    <span>{watchdogResult.results?.patternsDetected || 0} patterns detected</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-cyan-400" />
                    <span>{watchdogResult.results?.autoFixesApplied || 0} auto-fixes applied</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Auto-Fixes */}
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Wrench className="w-5 h-5 text-cyan-400" />
              Recent Auto-Fixes
            </h2>
            <Card className="bg-[#0a0f14] border border-white/10">
              <CardContent className="pt-4">
                {!data?.recentFixes?.length ? (
                  <p className="text-white/50 text-center py-8">No auto-fixes in last 24h</p>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {data.recentFixes.map((fix) => (
                      <div 
                        key={fix.id} 
                        className={`p-3 rounded-lg border ${getSeverityBg(fix.severity)} ${getSeverityColor(fix.severity).split(' ')[0]}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge variant="outline" className={`text-xs ${getSeverityColor(fix.severity)}`}>
                                {fix.issue_type}
                              </Badge>
                              {fix.auto_fixed && (
                                <Badge variant="outline" className="border-green-500/50 text-green-400 text-xs">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Auto-Fixed
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-white/70 line-clamp-2">{fix.issue_description}</p>
                            {fix.fix_applied && (
                              <p className="text-xs text-cyan-400/70 mt-1">→ {fix.fix_applied}</p>
                            )}
                          </div>
                          <span className="text-xs text-white/30 whitespace-nowrap">
                            {new Date(fix.detected_at).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Pattern Recognition */}
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-400" />
              Detected Patterns
            </h2>
            <Card className="bg-[#0a0f14] border border-white/10">
              <CardContent className="pt-4">
                {!data?.patterns?.length ? (
                  <p className="text-white/50 text-center py-8">No patterns detected yet</p>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {data.patterns.map((pattern) => (
                      <div 
                        key={pattern.id} 
                        className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <code className="text-xs bg-purple-500/20 px-2 py-0.5 rounded text-purple-300">
                                {pattern.pattern_key}
                              </code>
                              <Badge variant="outline" className="border-purple-500/50 text-purple-400 text-xs">
                                {pattern.occurrence_count}x
                              </Badge>
                              {pattern.auto_fix_available && (
                                <Badge variant="outline" className="border-green-500/50 text-green-400 text-xs">
                                  Auto-fixable
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-white/70 line-clamp-2">{pattern.pattern_description}</p>
                            {pattern.auto_fix_strategy && (
                              <p className="text-xs text-purple-400/70 mt-1">Strategy: {pattern.auto_fix_strategy}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-4 mt-2 text-xs text-white/30">
                          <span>First: {new Date(pattern.first_seen).toLocaleDateString()}</span>
                          <span>Last: {new Date(pattern.last_seen).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </div>

        {/* Active Processing */}
        {data?.processingCourses && data.processingCourses.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-400" />
              Active Processing Jobs
            </h2>
            <Card className="bg-[#0a0f14] border border-white/10">
              <CardContent className="pt-4">
                <div className="space-y-3">
                  {data.processingCourses.map((course) => (
                    <div 
                      key={course.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20"
                    >
                      <div className="flex items-center gap-3">
                        <Activity className="w-4 h-4 text-yellow-400 animate-pulse" />
                        <span className="text-sm font-medium truncate max-w-xs">{course.title}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="border-yellow-500/50 text-yellow-400">
                          {course.status}
                        </Badge>
                        <span className="text-sm text-yellow-400 font-mono">{course.progress}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Cron Status */}
        <section className="mt-8">
          <Card className="bg-green-500/5 border border-green-500/20">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-sm text-white/70">
                    Watchdog runs automatically every 5 minutes
                  </span>
                </div>
                <Badge variant="outline" className="border-green-500/50 text-green-400">
                  <Shield className="w-3 h-3 mr-1" />
                  Auto-Healing Active
                </Badge>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
