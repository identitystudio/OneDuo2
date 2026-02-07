import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, BellOff, Mail, Clock, TrendingUp, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ReminderStats {
  totalScheduled: number;
  totalCancelled: number;
  remindersSent: number;
  conversionRate: number;
  recentActivity: {
    date: string;
    scheduled: number;
    cancelled: number;
    sent: number;
  }[];
}

export function ExpiryReminderAnalytics() {
  const [stats, setStats] = useState<ReminderStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchReminderStats();
  }, []);

  const fetchReminderStats = async () => {
    try {
      // Fetch reminder-related access logs
      const { data: logs, error } = await supabase
        .from('artifact_access_log')
        .select('access_type, accessed_at')
        .in('access_type', ['reminder_scheduled', 'reminder_cancelled', 'reminder_sent'])
        .order('accessed_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      // Calculate stats
      const scheduled = logs?.filter(l => l.access_type === 'reminder_scheduled').length || 0;
      const cancelled = logs?.filter(l => l.access_type === 'reminder_cancelled').length || 0;
      const sent = logs?.filter(l => l.access_type === 'reminder_sent').length || 0;

      // Group by date for recent activity (last 7 days)
      const today = new Date();
      const recentActivity: ReminderStats['recentActivity'] = [];
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const dayLogs = logs?.filter(l => 
          l.accessed_at?.startsWith(dateStr)
        ) || [];

        recentActivity.push({
          date: dateStr,
          scheduled: dayLogs.filter(l => l.access_type === 'reminder_scheduled').length,
          cancelled: dayLogs.filter(l => l.access_type === 'reminder_cancelled').length,
          sent: dayLogs.filter(l => l.access_type === 'reminder_sent').length,
        });
      }

      setStats({
        totalScheduled: scheduled,
        totalCancelled: cancelled,
        remindersSent: sent,
        conversionRate: scheduled > 0 ? Math.round((sent / scheduled) * 100) : 0,
        recentActivity,
      });
    } catch (err) {
      console.error('Failed to fetch reminder stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-8 bg-muted rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="h-5 w-5 text-amber-400" />
          Expiry Reminder Analytics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <div className="flex items-center gap-2 text-emerald-400 text-sm mb-1">
              <Bell className="h-4 w-4" />
              Scheduled
            </div>
            <div className="text-2xl font-bold text-foreground">{stats.totalScheduled}</div>
          </div>
          
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="flex items-center gap-2 text-red-400 text-sm mb-1">
              <BellOff className="h-4 w-4" />
              Cancelled
            </div>
            <div className="text-2xl font-bold text-foreground">{stats.totalCancelled}</div>
          </div>
          
          <div className="p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
            <div className="flex items-center gap-2 text-cyan-400 text-sm mb-1">
              <Mail className="h-4 w-4" />
              Sent
            </div>
            <div className="text-2xl font-bold text-foreground">{stats.remindersSent}</div>
          </div>
          
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-2 text-amber-400 text-sm mb-1">
              <TrendingUp className="h-4 w-4" />
              Delivery Rate
            </div>
            <div className="text-2xl font-bold text-foreground">{stats.conversionRate}%</div>
          </div>
        </div>

        {/* Recent Activity Chart */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Last 7 Days</h4>
          <div className="flex items-end gap-1 h-24">
            {stats.recentActivity.map((day, i) => {
              const total = day.scheduled + day.sent;
              const maxHeight = Math.max(...stats.recentActivity.map(d => d.scheduled + d.sent));
              const height = maxHeight > 0 ? (total / maxHeight) * 100 : 0;
              
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                  <div 
                    className="w-full rounded-t bg-gradient-to-t from-cyan-500/50 to-emerald-500/50 transition-all duration-300 hover:from-cyan-500/70 hover:to-emerald-500/70"
                    style={{ height: `${Math.max(height, 4)}%` }}
                    title={`${day.date}: ${day.scheduled} scheduled, ${day.sent} sent`}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
          <Clock className="h-4 w-4" />
          <span>Reminders are sent 2 hours before link expiry via automated cron job</span>
        </div>
      </CardContent>
    </Card>
  );
}
