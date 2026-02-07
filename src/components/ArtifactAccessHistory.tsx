import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Download, Link, Eye } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface AccessLog {
  id: string;
  access_type: string;
  accessed_at: string;
  download_completed: boolean;
  download_source: string | null;
}

interface ArtifactAccessHistoryProps {
  courseId: string;
  courseTitle: string;
}

export const ArtifactAccessHistory = ({ courseId, courseTitle }: ArtifactAccessHistoryProps) => {
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAccessHistory();
  }, [courseId]);

  const fetchAccessHistory = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-download-analytics', {
        body: { courseId, action: 'get-course-history' }
      });

      if (error) throw error;
      setAccessLogs(data?.logs || []);
    } catch (err) {
      console.error('Failed to fetch access history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getAccessIcon = (type: string) => {
    switch (type) {
      case 'download':
        return <Download className="h-4 w-4" />;
      case 'link_generated':
        return <Link className="h-4 w-4" />;
      default:
        return <Eye className="h-4 w-4" />;
    }
  };

  const getAccessLabel = (type: string) => {
    switch (type) {
      case 'download':
        return 'Downloaded';
      case 'link_generated':
        return 'Link Generated';
      case 'view':
        return 'Viewed';
      default:
        return type;
    }
  };

  if (isLoading) {
    return (
      <div className="animate-pulse h-20 bg-muted rounded-lg" />
    );
  }

  if (accessLogs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Clock className="h-4 w-4" />
        No access history yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium flex items-center gap-2">
        <Clock className="h-4 w-4" />
        Access History
      </h4>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {accessLogs.slice(0, 5).map((log) => (
          <div 
            key={log.id} 
            className="flex items-center justify-between text-xs p-2 bg-muted/50 rounded"
          >
            <div className="flex items-center gap-2">
              {getAccessIcon(log.access_type)}
              <span>{getAccessLabel(log.access_type)}</span>
              {log.download_source && (
                <Badge variant="outline" className="text-[10px]">
                  {log.download_source}
                </Badge>
              )}
            </div>
            <span className="text-muted-foreground">
              {formatDistanceToNow(new Date(log.accessed_at), { addSuffix: true })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
