import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart3, 
  Users, 
  Video, 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  TrendingUp,
  Server,
  Database,
  Zap,
  ArrowLeft,
  RefreshCw,
  Download
} from 'lucide-react';
import { toast } from 'sonner';
import { Logo } from '@/components/Logo';
import { DownloadAnalyticsDashboard } from '@/components/DownloadAnalyticsDashboard';
import { ExpiryReminderAnalytics } from '@/components/ExpiryReminderAnalytics';

interface AdminStats {
  totalCourses: number;
  completedCourses: number;
  failedCourses: number;
  processingCourses: number;
  totalSubscribers: number;
  activeSubscribers: number;
  recentErrors: ErrorLog[];
  healthStatus: HealthStatus | null;
}

interface ErrorLog {
  id: string;
  error_type: string;
  error_message: string;
  step: string;
  created_at: string;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: { status: string; latency_ms: number };
    storage: { status: string; latency_ms: number };
    edge_functions: { status: string; latency_ms: number };
  };
  metrics?: {
    courses_count: number;
    active_jobs: number;
  };
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats>({
    totalCourses: 0,
    completedCourses: 0,
    failedCourses: 0,
    processingCourses: 0,
    totalSubscribers: 0,
    activeSubscribers: 0,
    recentErrors: [],
    healthStatus: null
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    // Check admin access (simple email-based for now)
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const adminEmails = ['christinaxcabral@gmail.com'];
      
      if (user && adminEmails.includes(user.email || '')) {
        setIsAdmin(true);
        fetchStats();
      } else {
        toast.error('Admin access required');
        navigate('/');
      }
    };

    checkAdmin();
  }, [navigate]);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      // Fetch stats from edge function
      const { data, error } = await supabase.functions.invoke('admin-stats');
      
      if (error) throw error;
      
      if (data) {
        setStats(prev => ({
          ...prev,
          totalCourses: data.totalCourses || 0,
          completedCourses: data.completedCourses || 0,
          failedCourses: data.failedCourses || 0,
          processingCourses: data.processingCourses || 0,
          totalSubscribers: data.totalSubscribers || 0,
          activeSubscribers: data.activeSubscribers || 0,
          recentErrors: data.recentErrors || []
        }));
      }

      // Fetch health status
      try {
        const healthResponse = await supabase.functions.invoke('health-check');
        if (healthResponse.data) {
          setStats(prev => ({ ...prev, healthStatus: healthResponse.data }));
        }
      } catch (healthError) {
        console.error('Health check failed:', healthError);
      }

      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to fetch admin stats:', err);
      toast.error('Failed to load admin stats');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'pass':
        return 'text-green-400';
      case 'degraded':
      case 'warn':
        return 'text-yellow-400';
      case 'unhealthy':
      case 'fail':
        return 'text-red-400';
      default:
        return 'text-white/50';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'pass':
        return 'bg-green-500/10 border-green-500/20';
      case 'degraded':
      case 'warn':
        return 'bg-yellow-500/10 border-yellow-500/20';
      case 'unhealthy':
      case 'fail':
        return 'bg-red-500/10 border-red-500/20';
      default:
        return 'bg-white/5 border-white/10';
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
              onClick={() => navigate('/')}
              className="text-white/50 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Logo size="sm" />
            <Badge variant="outline" className="border-amber-500/50 text-amber-400">
              Admin
            </Badge>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate('/admin/ops')}
              className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
            >
              <Zap className="w-4 h-4 mr-2" />
              Ops Center
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/30">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchStats}
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
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-[#0a0f14] border border-white/10">
            <TabsTrigger value="overview" className="data-[state=active]:bg-cyan-500/20">
              <BarChart3 className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="downloads" className="data-[state=active]:bg-cyan-500/20">
              <Download className="w-4 h-4 mr-2" />
              Downloads
            </TabsTrigger>
            <TabsTrigger value="reminders" className="data-[state=active]:bg-amber-500/20">
              <Clock className="w-4 h-4 mr-2" />
              Reminders
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8">
            {/* System Health */}
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Server className="w-5 h-5 text-cyan-400" />
                System Health
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className={`bg-[#0a0f14] border ${getStatusBg(stats.healthStatus?.status || 'unknown')}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-white/60 text-sm">Overall Status</span>
                      <Activity className={`w-5 h-5 ${getStatusColor(stats.healthStatus?.status || 'unknown')}`} />
                    </div>
                    <p className={`text-xl font-bold mt-2 capitalize ${getStatusColor(stats.healthStatus?.status || 'unknown')}`}>
                      {stats.healthStatus?.status || 'Unknown'}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-[#0a0f14] border border-white/10">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-white/60 text-sm">Database</span>
                      <Database className={`w-5 h-5 ${getStatusColor(stats.healthStatus?.checks?.database?.status || 'unknown')}`} />
                    </div>
                    <p className="text-xl font-bold mt-2">
                      {stats.healthStatus?.checks?.database?.latency_ms || 0}ms
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-[#0a0f14] border border-white/10">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-white/60 text-sm">Storage</span>
                      <Zap className={`w-5 h-5 ${getStatusColor(stats.healthStatus?.checks?.storage?.status || 'unknown')}`} />
                    </div>
                    <p className="text-xl font-bold mt-2">
                      {stats.healthStatus?.checks?.storage?.latency_ms || 0}ms
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-[#0a0f14] border border-white/10">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-white/60 text-sm">Edge Functions</span>
                      <Zap className={`w-5 h-5 ${getStatusColor(stats.healthStatus?.checks?.edge_functions?.status || 'unknown')}`} />
                    </div>
                    <p className="text-xl font-bold mt-2">
                      {stats.healthStatus?.checks?.edge_functions?.latency_ms || 0}ms
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Key Metrics */}
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-cyan-400" />
                Key Metrics
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-[#0a0f14] border border-white/10">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-white/60 text-sm">Total Courses</span>
                      <Video className="w-5 h-5 text-cyan-400" />
                    </div>
                    <p className="text-2xl font-bold mt-2">{stats.totalCourses}</p>
                  </CardContent>
                </Card>

                <Card className="bg-[#0a0f14] border border-green-500/20">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-white/60 text-sm">Completed</span>
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    </div>
                    <p className="text-2xl font-bold mt-2 text-green-400">{stats.completedCourses}</p>
                  </CardContent>
                </Card>

                <Card className="bg-[#0a0f14] border border-yellow-500/20">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-white/60 text-sm">Processing</span>
                      <Clock className="w-5 h-5 text-yellow-400" />
                    </div>
                    <p className="text-2xl font-bold mt-2 text-yellow-400">{stats.processingCourses}</p>
                  </CardContent>
                </Card>

                <Card className="bg-[#0a0f14] border border-red-500/20">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-white/60 text-sm">Failed</span>
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                    </div>
                    <p className="text-2xl font-bold mt-2 text-red-400">{stats.failedCourses}</p>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Subscribers */}
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-cyan-400" />
                Subscribers
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-[#0a0f14] border border-white/10">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-white/60 text-sm">Total Subscribers</span>
                      <Users className="w-5 h-5 text-cyan-400" />
                    </div>
                    <p className="text-2xl font-bold mt-2">{stats.totalSubscribers}</p>
                  </CardContent>
                </Card>

                <Card className="bg-[#0a0f14] border border-green-500/20">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-white/60 text-sm">Active (In Sequence)</span>
                      <TrendingUp className="w-5 h-5 text-green-400" />
                    </div>
                    <p className="text-2xl font-bold mt-2 text-green-400">{stats.activeSubscribers}</p>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Recent Errors */}
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                Recent Errors
              </h2>
              <Card className="bg-[#0a0f14] border border-white/10">
                <CardContent className="pt-4">
                  {stats.recentErrors.length === 0 ? (
                    <p className="text-white/50 text-center py-8">No recent errors 🎉</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.recentErrors.slice(0, 10).map((error) => (
                        <div 
                          key={error.id} 
                          className="p-3 rounded-lg bg-red-500/5 border border-red-500/20"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="border-red-500/50 text-red-400 text-xs">
                                  {error.error_type}
                                </Badge>
                                <span className="text-xs text-white/30">{error.step}</span>
                              </div>
                              <p className="text-sm text-white/70 truncate">{error.error_message}</p>
                            </div>
                            <span className="text-xs text-white/30 whitespace-nowrap">
                              {new Date(error.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          </TabsContent>

          <TabsContent value="downloads">
            <DownloadAnalyticsDashboard />
          </TabsContent>

          <TabsContent value="reminders">
            <ExpiryReminderAnalytics />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
