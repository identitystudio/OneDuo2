import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { 
  ArrowLeft,
  RefreshCw,
  Shield,
  Users,
  Activity,
  CheckCircle,
  AlertTriangle,
  Clock,
  Loader2,
  Eye,
  EyeOff,
  ImageIcon,
  FileText,
  Sparkles,
  Search,
  ChevronDown,
  ChevronRight,
  Layers
} from 'lucide-react';
import { toast } from 'sonner';
import { Logo } from '@/components/Logo';
import { formatDistanceToNow } from 'date-fns';

interface CourseModule {
  id: string;
  course_id: string;
  module_number: number;
  title: string;
  status: string;
  progress: number;
  progress_step?: string;
  total_frames?: number;
  frame_urls?: any;
  transcript?: any;
  audio_events?: any;
  prosody_annotations?: any;
  created_at: string;
  updated_at?: string;
  heartbeat_at?: string;
}

interface UserCourse {
  id: string;
  email: string;
  title: string;
  status: string;
  progress: number;
  progress_step?: string;
  total_frames?: number;
  frame_urls?: any;
  transcript?: any;
  audio_events?: any;
  prosody_annotations?: any;
  is_multi_module?: boolean;
  module_count?: number;
  completed_modules?: number;
  merged_course_mode?: boolean;
  course_files?: any;
  created_at: string;
  updated_at?: string;
  completed_at?: string;
  modules?: CourseModule[];
}

interface UserGroup {
  email: string;
  courses: UserCourse[];
  totalCourses: number;
  processingCourses: number;
  completedCourses: number;
  failedCourses: number;
}

const statusConfig: Record<string, { label: string; color: string; icon: any; bgColor: string }> = {
  queued: { label: 'Queued', color: 'text-white/60', icon: Clock, bgColor: 'bg-white/10' },
  pending: { label: 'Queued', color: 'text-white/60', icon: Clock, bgColor: 'bg-white/10' },
  extracting_frames: { label: 'Extracting Frames', color: 'text-purple-400', icon: Loader2, bgColor: 'bg-purple-500/10' },
  transcribing: { label: 'Transcribing', color: 'text-blue-400', icon: Loader2, bgColor: 'bg-blue-500/10' },
  analyzing_audio: { label: 'Analyzing Audio', color: 'text-amber-400', icon: Loader2, bgColor: 'bg-amber-500/10' },
  analyzing: { label: 'Analyzing', color: 'text-cyan-400', icon: Sparkles, bgColor: 'bg-cyan-500/10' },
  completed: { label: 'Complete', color: 'text-emerald-400', icon: CheckCircle, bgColor: 'bg-emerald-500/10' },
  failed: { label: 'Failed', color: 'text-red-400', icon: AlertTriangle, bgColor: 'bg-red-500/10' },
  manual_review: { label: 'Special Attention', color: 'text-purple-300', icon: Sparkles, bgColor: 'bg-purple-500/20' },
};

export default function UserViewDashboard() {
  const navigate = useNavigate();
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [showProcessingOnly, setShowProcessingOnly] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const adminEmails = ['christinaxcabral@gmail.com'];
      
      if (user && adminEmails.includes(user.email || '')) {
        setIsAdmin(true);
        fetchAllUserCourses();
      } else {
        toast.error('Admin access required');
        navigate('/');
      }
    };

    checkAdmin();
  }, [navigate]);

  const fetchAllUserCourses = async () => {
    setIsLoading(true);
    try {
      // Fetch all courses with modules
      const { data: courses, error } = await supabase
        .from('courses')
        .select(`
          id,
          email,
          title,
          status,
          progress,
          progress_step,
          total_frames,
          frame_urls,
          transcript,
          audio_events,
          prosody_annotations,
          is_multi_module,
          module_count,
          completed_modules,
          merged_course_mode,
          course_files,
          created_at,
          updated_at,
          completed_at
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      // Fetch modules for all courses
      const courseIds = courses?.map(c => c.id) || [];
      const { data: modules, error: modulesError } = await supabase
        .from('course_modules')
        .select(`
          id,
          course_id,
          module_number,
          title,
          status,
          progress,
          progress_step,
          total_frames,
          frame_urls,
          transcript,
          audio_events,
          prosody_annotations,
          created_at,
          updated_at,
          heartbeat_at
        `)
        .in('course_id', courseIds);

      if (modulesError) throw modulesError;

      // Group modules by course
      const modulesByCourse: Record<string, CourseModule[]> = {};
      modules?.forEach(m => {
        if (!modulesByCourse[m.course_id]) {
          modulesByCourse[m.course_id] = [];
        }
        modulesByCourse[m.course_id].push(m);
      });

      // Attach modules to courses
      const coursesWithModules: UserCourse[] = (courses || []).map(c => ({
        ...c,
        modules: modulesByCourse[c.id] || [],
      }));

      // Group by user email
      const groupedByEmail: Record<string, UserCourse[]> = {};
      coursesWithModules.forEach(course => {
        const email = course.email || 'unknown';
        if (!groupedByEmail[email]) {
          groupedByEmail[email] = [];
        }
        groupedByEmail[email].push(course);
      });

      // Create user groups with stats
      const groups: UserGroup[] = Object.entries(groupedByEmail).map(([email, courses]) => {
        const processing = courses.filter(c => 
          !['completed', 'failed'].includes(c.status) ||
          c.modules?.some(m => !['completed', 'failed'].includes(m.status))
        ).length;
        const completed = courses.filter(c => c.status === 'completed').length;
        const failed = courses.filter(c => c.status === 'failed').length;

        return {
          email,
          courses,
          totalCourses: courses.length,
          processingCourses: processing,
          completedCourses: completed,
          failedCourses: failed,
        };
      });

      // Sort: users with processing first, then by most recent activity
      groups.sort((a, b) => {
        if (a.processingCourses > 0 && b.processingCourses === 0) return -1;
        if (b.processingCourses > 0 && a.processingCourses === 0) return 1;
        
        const aRecent = new Date(a.courses[0]?.created_at || 0).getTime();
        const bRecent = new Date(b.courses[0]?.created_at || 0).getTime();
        return bRecent - aRecent;
      });

      setUserGroups(groups);
      setLastRefresh(new Date());

      // Auto-expand users with processing jobs
      const processingUsers = groups
        .filter(g => g.processingCourses > 0)
        .map(g => g.email);
      setExpandedUsers(new Set(processingUsers));

    } catch (err) {
      console.error('Failed to fetch user courses:', err);
      toast.error('Failed to load user data');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusDisplay = (status: string) => {
    const config = statusConfig[status] || statusConfig.queued;
    const Icon = config.icon;
    const isSpinning = ['extracting_frames', 'transcribing', 'analyzing_audio', 'analyzing'].includes(status);
    
    return (
      <Badge 
        variant="outline" 
        className={`${config.bgColor} ${config.color} border-0 gap-1`}
      >
        <Icon className={`w-3 h-3 ${isSpinning ? 'animate-spin' : ''}`} />
        {config.label}
      </Badge>
    );
  };

  const getFrameStats = (item: UserCourse | CourseModule) => {
    const frameUrls = item.frame_urls;
    const extractedFrames = Array.isArray(frameUrls) ? frameUrls.length : 0;
    const totalFrames = item.total_frames || 0;
    const hasTranscript = item.transcript && (Array.isArray(item.transcript) ? item.transcript.length > 0 : true);
    const hasAudioEvents = item.audio_events && (Array.isArray(item.audio_events) ? item.audio_events.length > 0 : true);
    const hasProsody = item.prosody_annotations && (Array.isArray(item.prosody_annotations) ? item.prosody_annotations.length > 0 : true);
    const courseFiles = 'course_files' in item ? item.course_files : null;
    const fileCount = Array.isArray(courseFiles) ? courseFiles.length : 0;

    return { extractedFrames, totalFrames, hasTranscript, hasAudioEvents, hasProsody, fileCount };
  };

  const toggleUserExpand = (email: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(email)) {
        next.delete(email);
      } else {
        next.add(email);
      }
      return next;
    });
  };

  const toggleCourseExpand = (courseId: string) => {
    setExpandedCourses(prev => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  };

  const filteredGroups = userGroups.filter(group => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesEmail = group.email.toLowerCase().includes(query);
      const matchesCourse = group.courses.some(c => c.title.toLowerCase().includes(query));
      if (!matchesEmail && !matchesCourse) return false;
    }
    
    // Processing filter
    if (showProcessingOnly && group.processingCourses === 0) {
      return false;
    }
    
    return true;
  });

  const totalStats = {
    users: userGroups.length,
    courses: userGroups.reduce((sum, g) => sum + g.totalCourses, 0),
    processing: userGroups.reduce((sum, g) => sum + g.processingCourses, 0),
    completed: userGroups.reduce((sum, g) => sum + g.completedCourses, 0),
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
      <header className="border-b border-white/10 px-4 sm:px-6 py-4 sticky top-0 bg-[#030303]/95 backdrop-blur z-10">
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
              <Eye className="w-3 h-3 mr-1" />
              User View (Read-Only)
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/30">
              Last: {lastRefresh.toLocaleTimeString()}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchAllUserCourses}
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
        {/* Summary Cards */}
        <section className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-[#0a0f14] border border-blue-500/20">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Total Users</span>
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                <p className="text-2xl font-bold mt-2 text-blue-400">
                  {totalStats.users}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-[#0a0f14] border border-cyan-500/20">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Total Artifacts</span>
                  <Layers className="w-5 h-5 text-cyan-400" />
                </div>
                <p className="text-2xl font-bold mt-2 text-cyan-400">
                  {totalStats.courses}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-[#0a0f14] border border-yellow-500/20">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Processing Now</span>
                  <Activity className="w-5 h-5 text-yellow-400" />
                </div>
                <p className="text-2xl font-bold mt-2 text-yellow-400">
                  {totalStats.processing}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-[#0a0f14] border border-emerald-500/20">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Completed</span>
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                </div>
                <p className="text-2xl font-bold mt-2 text-emerald-400">
                  {totalStats.completed}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Search and Filters */}
        <section className="mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <Input
                placeholder="Search by email or artifact title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-white/5 border-white/10"
              />
            </div>
            <Button
              variant={showProcessingOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowProcessingOnly(!showProcessingOnly)}
              className={showProcessingOnly ? "bg-yellow-600 hover:bg-yellow-700" : "border-white/20"}
            >
              <Activity className="w-4 h-4 mr-2" />
              Processing Only
            </Button>
          </div>
        </section>

        {/* Privacy Notice */}
        <section className="mb-6">
          <Card className="bg-purple-500/5 border border-purple-500/20">
            <CardContent className="py-3">
              <div className="flex items-center gap-3">
                <EyeOff className="w-5 h-5 text-purple-400" />
                <span className="text-sm text-white/70">
                  <strong className="text-purple-300">Privacy Mode:</strong> PDF downloads are disabled. You can see processing status and frame counts but cannot access actual content.
                </span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* User List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-white/50" />
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="text-center py-20 text-white/50">
            {searchQuery || showProcessingOnly ? 'No matching users found' : 'No users yet'}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredGroups.map((group) => (
              <Card 
                key={group.email} 
                className={`bg-[#0a0f14] border transition-colors ${
                  group.processingCourses > 0 
                    ? 'border-yellow-500/30' 
                    : 'border-white/10'
                }`}
              >
                {/* User Header */}
                <div 
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => toggleUserExpand(group.email)}
                >
                  <div className="flex items-center gap-3">
                    {expandedUsers.has(group.email) ? (
                      <ChevronDown className="w-4 h-4 text-white/50" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-white/50" />
                    )}
                    <div>
                      <p className="font-medium text-white">{group.email}</p>
                      <p className="text-xs text-white/50">
                        {group.totalCourses} artifact{group.totalCourses !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {group.processingCourses > 0 && (
                      <Badge variant="outline" className="border-yellow-500/50 text-yellow-400 gap-1">
                        <Activity className="w-3 h-3 animate-pulse" />
                        {group.processingCourses} processing
                      </Badge>
                    )}
                    <Badge variant="outline" className="border-emerald-500/50 text-emerald-400">
                      {group.completedCourses} complete
                    </Badge>
                    {group.failedCourses > 0 && (
                      <Badge variant="outline" className="border-red-500/50 text-red-400">
                        {group.failedCourses} failed
                      </Badge>
                    )}
                  </div>
                </div>

                {/* User's Courses */}
                {expandedUsers.has(group.email) && (
                  <div className="border-t border-white/10 p-4 space-y-3">
                    {group.courses.map((course) => {
                      const stats = getFrameStats(course);
                      const isProcessing = !['completed', 'failed'].includes(course.status);
                      const hasModules = course.modules && course.modules.length > 0;
                      const isExpanded = expandedCourses.has(course.id);

                      return (
                        <div 
                          key={course.id}
                          className={`rounded-lg border p-3 ${
                            isProcessing 
                              ? 'bg-yellow-500/5 border-yellow-500/20' 
                              : course.status === 'completed'
                                ? 'bg-emerald-500/5 border-emerald-500/20'
                                : 'bg-red-500/5 border-red-500/20'
                          }`}
                        >
                          {/* Course Header */}
                          <div 
                            className={`flex items-start justify-between gap-3 ${hasModules ? 'cursor-pointer' : ''}`}
                            onClick={() => hasModules && toggleCourseExpand(course.id)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {hasModules && (
                                  isExpanded 
                                    ? <ChevronDown className="w-3 h-3 text-white/50" />
                                    : <ChevronRight className="w-3 h-3 text-white/50" />
                                )}
                                <span className="font-medium text-sm truncate">{course.title}</span>
                                {course.merged_course_mode && (
                                  <Badge variant="outline" className="text-[10px] border-cyan-500/50 text-cyan-400">
                                    Merged
                                  </Badge>
                                )}
                                {hasModules && (
                                  <Badge variant="outline" className="text-[10px] border-purple-500/50 text-purple-400">
                                    {course.modules!.length} modules
                                  </Badge>
                                )}
                              </div>
                              
                              {/* Progress for processing items */}
                              {isProcessing && (
                                <div className="mt-2">
                                  <div className="flex items-center justify-between text-xs mb-1">
                                    <span className="text-white/50">{course.progress_step || course.status}</span>
                                    <span className="text-white/70">{course.progress}%</span>
                                  </div>
                                  <Progress value={course.progress} className="h-1.5" />
                                </div>
                              )}

                              {/* Frame stats */}
                              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-white/50">
                                <span className="flex items-center gap-1">
                                  <ImageIcon className="w-3 h-3" />
                                  {stats.extractedFrames}/{stats.totalFrames || '?'} frames
                                </span>
                                {stats.hasTranscript && (
                                  <span className="flex items-center gap-1 text-blue-400">
                                    <FileText className="w-3 h-3" />
                                    Transcript
                                  </span>
                                )}
                                {stats.hasAudioEvents && (
                                  <span className="flex items-center gap-1 text-amber-400">
                                    <Activity className="w-3 h-3" />
                                    Audio
                                  </span>
                                )}
                                {stats.hasProsody && (
                                  <span className="flex items-center gap-1 text-purple-400">
                                    <Sparkles className="w-3 h-3" />
                                    Prosody
                                  </span>
                                )}
                                {stats.fileCount > 0 && (
                                  <span className="flex items-center gap-1 text-cyan-400">
                                    <Layers className="w-3 h-3" />
                                    {stats.fileCount} files
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {getStatusDisplay(course.status)}
                              <span className="text-[10px] text-white/30">
                                {formatDistanceToNow(new Date(course.created_at), { addSuffix: true })}
                              </span>
                            </div>
                          </div>

                          {/* Module Details */}
                          {hasModules && isExpanded && (
                            <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                              {course.modules!.map((mod) => {
                                const modStats = getFrameStats(mod);
                                const modProcessing = !['completed', 'failed'].includes(mod.status);

                                return (
                                  <div 
                                    key={mod.id}
                                    className={`rounded p-2 ${
                                      modProcessing 
                                        ? 'bg-yellow-500/10' 
                                        : mod.status === 'completed'
                                          ? 'bg-emerald-500/10'
                                          : 'bg-red-500/10'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium truncate">
                                          Module {mod.module_number}: {mod.title}
                                        </p>
                                        {modProcessing && (
                                          <div className="mt-1">
                                            <Progress value={mod.progress} className="h-1" />
                                          </div>
                                        )}
                                        <div className="flex items-center gap-2 mt-1 text-[10px] text-white/40">
                                          <span>{modStats.extractedFrames}/{modStats.totalFrames || '?'} frames</span>
                                          {modStats.hasTranscript && <span className="text-blue-400">T</span>}
                                          {modStats.hasAudioEvents && <span className="text-amber-400">A</span>}
                                          {modStats.hasProsody && <span className="text-purple-400">P</span>}
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        {getStatusDisplay(mod.status)}
                                        {modProcessing && (
                                          <p className="text-[10px] text-white/30 mt-1">{mod.progress}%</p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Auto-refresh indicator */}
        <section className="mt-8">
          <Card className="bg-blue-500/5 border border-blue-500/20">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-blue-400" />
                  <span className="text-sm text-white/70">
                    This view is read-only. No downloads or modifications possible.
                  </span>
                </div>
                <Badge variant="outline" className="border-blue-500/50 text-blue-400">
                  <Eye className="w-3 h-3 mr-1" />
                  Observer Mode
                </Badge>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
