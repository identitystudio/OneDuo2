import { useState, useEffect } from "react";
import { Download, Eye, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DownloadCountBadgeProps {
  courseId: string;
}

interface DownloadStats {
  downloads: number;
  views: number;
  linkGenerations: number;
}

export const DownloadCountBadge = ({ courseId }: DownloadCountBadgeProps) => {
  const [stats, setStats] = useState<DownloadStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('admin-download-analytics', {
          body: { 
            action: 'get-course-stats',
            courseId 
          }
        });

        if (error) throw error;
        
        setStats({
          downloads: data?.downloads || 0,
          views: data?.views || 0,
          linkGenerations: data?.linkGenerations || 0,
        });
      } catch (err) {
        console.error('Failed to fetch download stats:', err);
        setStats({ downloads: 0, views: 0, linkGenerations: 0 });
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [courseId]);

  if (isLoading || !stats) {
    return null;
  }

  const totalActivity = stats.downloads + stats.views;
  
  if (totalActivity === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5">
            {stats.downloads > 0 && (
              <Badge 
                variant="secondary" 
                className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-1 text-xs px-2 py-0.5"
              >
                <Download className="w-3 h-3" />
                {stats.downloads}
              </Badge>
            )}
            {stats.views > 0 && (
              <Badge 
                variant="secondary" 
                className="bg-blue-500/10 text-blue-400 border-blue-500/20 gap-1 text-xs px-2 py-0.5"
              >
                <Eye className="w-3 h-3" />
                {stats.views}
              </Badge>
            )}
            {stats.linkGenerations > 0 && (
              <Badge 
                variant="secondary" 
                className="bg-purple-500/10 text-purple-400 border-purple-500/20 gap-1 text-xs px-2 py-0.5"
              >
                <Link2 className="w-3 h-3" />
                {stats.linkGenerations}
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-[#1a1a1a] border-white/10">
          <div className="text-xs space-y-1">
            <div className="flex items-center gap-2">
              <Download className="w-3 h-3 text-emerald-400" />
              <span>{stats.downloads} downloads</span>
            </div>
            <div className="flex items-center gap-2">
              <Eye className="w-3 h-3 text-blue-400" />
              <span>{stats.views} views</span>
            </div>
            <div className="flex items-center gap-2">
              <Link2 className="w-3 h-3 text-purple-400" />
              <span>{stats.linkGenerations} links generated</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
