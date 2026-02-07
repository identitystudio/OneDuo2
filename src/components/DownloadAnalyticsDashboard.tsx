import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Download, 
  Users, 
  Eye, 
  AlertTriangle, 
  TrendingUp,
  Calendar,
  Globe,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

interface DownloadStats {
  totalDownloads: number;
  uniqueUsers: number;
  emailClicks: number;
  directAccess: number;
  dashboardAccess: number;
  potentialAbuse: AbuseAlert[];
  recentActivity: RecentDownload[];
  dailyStats: DailyStats[];
}

interface AbuseAlert {
  course_id: string;
  ip_address: string;
  download_count: number;
  first_access: string;
  last_access: string;
}

interface RecentDownload {
  id: string;
  course_id: string;
  course_title?: string;
  access_type: string;
  download_source: string;
  accessed_at: string;
  ip_address: string;
}

interface DailyStats {
  date: string;
  downloads: number;
  unique_users: number;
}

export function DownloadAnalyticsDashboard() {
  const [stats, setStats] = useState<DownloadStats>({
    totalDownloads: 0,
    uniqueUsers: 0,
    emailClicks: 0,
    directAccess: 0,
    dashboardAccess: 0,
    potentialAbuse: [],
    recentActivity: [],
    dailyStats: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-download-analytics');
      
      if (error) throw error;
      
      if (data) {
        setStats({
          totalDownloads: data.totalDownloads || 0,
          uniqueUsers: data.uniqueUsers || 0,
          emailClicks: data.emailClicks || 0,
          directAccess: data.directAccess || 0,
          dashboardAccess: data.dashboardAccess || 0,
          potentialAbuse: data.potentialAbuse || [],
          recentActivity: data.recentActivity || [],
          dailyStats: data.dailyStats || []
        });
      }
      
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to fetch download analytics:', err);
      toast.error('Failed to load download analytics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getSourceBadgeColor = (source: string) => {
    switch (source) {
      case 'email':
        return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
      case 'dashboard':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'direct':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-white/10 text-white/60 border-white/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Download className="w-6 h-6 text-cyan-400" />
          <h2 className="text-xl font-semibold text-white">Download Analytics</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/30">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </span>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchAnalytics}
            disabled={isLoading}
            className="border-white/20"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-[#0a0f14] border border-white/10">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Total Downloads</span>
              <Download className="w-5 h-5 text-cyan-400" />
            </div>
            <p className="text-2xl font-bold mt-2 text-white">{stats.totalDownloads}</p>
          </CardContent>
        </Card>

        <Card className="bg-[#0a0f14] border border-green-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Unique Users</span>
              <Users className="w-5 h-5 text-green-400" />
            </div>
            <p className="text-2xl font-bold mt-2 text-green-400">{stats.uniqueUsers}</p>
          </CardContent>
        </Card>

        <Card className="bg-[#0a0f14] border border-cyan-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Email Clicks</span>
              <TrendingUp className="w-5 h-5 text-cyan-400" />
            </div>
            <p className="text-2xl font-bold mt-2 text-cyan-400">{stats.emailClicks}</p>
          </CardContent>
        </Card>

        <Card className="bg-[#0a0f14] border border-yellow-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Dashboard</span>
              <Eye className="w-5 h-5 text-yellow-400" />
            </div>
            <p className="text-2xl font-bold mt-2 text-yellow-400">{stats.dashboardAccess}</p>
          </CardContent>
        </Card>

        <Card className="bg-[#0a0f14] border border-white/10">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Direct Access</span>
              <Globe className="w-5 h-5 text-white/60" />
            </div>
            <p className="text-2xl font-bold mt-2 text-white/80">{stats.directAccess}</p>
          </CardContent>
        </Card>
      </div>

      {/* Abuse Alerts */}
      {stats.potentialAbuse.length > 0 && (
        <Card className="bg-red-500/5 border border-red-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Potential Abuse Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.potentialAbuse.map((alert, i) => (
                <div 
                  key={i}
                  className="p-3 rounded-lg bg-red-500/10 border border-red-500/20"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="border-red-500/50 text-red-400 text-xs">
                          {alert.download_count} downloads
                        </Badge>
                        <span className="text-xs text-white/50">from {alert.ip_address}</span>
                      </div>
                      <p className="text-sm text-white/70">Course: {alert.course_id.slice(0, 8)}...</p>
                    </div>
                    <span className="text-xs text-white/30 whitespace-nowrap">
                      {formatDate(alert.last_access)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <Card className="bg-[#0a0f14] border border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-white">
            <Calendar className="w-5 h-5 text-cyan-400" />
            Recent Downloads
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentActivity.length === 0 ? (
            <p className="text-white/50 text-center py-8">No download activity yet</p>
          ) : (
            <div className="space-y-2">
              {stats.recentActivity.slice(0, 20).map((activity) => (
                <div 
                  key={activity.id}
                  className="p-3 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant="outline" 
                      className={getSourceBadgeColor(activity.download_source)}
                    >
                      {activity.download_source || 'unknown'}
                    </Badge>
                    <span className="text-sm text-white/70">
                      {activity.course_title || activity.course_id.slice(0, 8) + '...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-white/40">{activity.ip_address}</span>
                    <span className="text-xs text-white/30">{formatDate(activity.accessed_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily Stats Chart (Simple Table) */}
      {stats.dailyStats.length > 0 && (
        <Card className="bg-[#0a0f14] border border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-white">
              <TrendingUp className="w-5 h-5 text-green-400" />
              Daily Trends (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {stats.dailyStats.slice(-7).map((day, i) => (
                <div key={i} className="text-center p-3 rounded-lg bg-white/5">
                  <p className="text-xs text-white/40 mb-1">
                    {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                  </p>
                  <p className="text-lg font-bold text-cyan-400">{day.downloads}</p>
                  <p className="text-xs text-white/30">{day.unique_users} users</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
