import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { analyzeError, type ErrorAnalysis } from '@/lib/errorAnalyzer';
import { ManualProcessingCard } from '@/components/ManualProcessingCard';
import {
  Plus, RefreshCw,
  CheckCircle, Clock, Loader2, Sparkles, Check,
  AlertTriangle, Zap, ArrowRight, Link2, FileText, ChevronDown, ChevronRight, Download, X, Layers, Mail, Upload, Globe, Lock, Paperclip, Pencil, Key, MoreHorizontal
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/components/AuthGuard';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Logo } from '@/components/Logo';
import { generateChatGPTPDF, generateMergedCoursePDF, downloadPDF, type ModuleData as PdfModuleData, type MergedCourseData } from '@/lib/pdfExporter';
import { downloadKnowledgeLayerMarkdown } from '@/lib/memoryExporter';
import { loadFilesInParallel } from '@/lib/parallelFileLoader';
import { SupportChatWidget } from '@/components/SupportChatWidget';
import { DownloadCountBadge } from '@/components/DownloadCountBadge';
import { QuickConfetti } from '@/components/QuickConfetti';
import { ProcessingProgressCard } from '@/components/ProcessingProgressCard';
import { ApiKeyManager } from '@/components/ApiKeyManager';
import { AddFilesDialog } from '@/components/AddFilesDialog';
import { FolderSidebar, FolderItem } from '@/components/FolderSidebar';
import { MoveToFolderDialog } from '@/components/MoveToFolderDialog';

interface CourseModule {
  id: string;
  course_id: string;
  module_number: number;
  title: string;
  status: string;
  progress: number;
  progress_step?: string;
  error_message?: string;
  created_at: string;
  updated_at?: string;
  video_duration_seconds?: number;
  heartbeat_at?: string;
  knowledge_layer_status?: string;
}

interface CourseFile {
  name: string;
  storagePath: string;
  size: number;
  uploadedAt?: string;
}

interface Course {
  id: string;
  title: string;
  description?: string;
  status: string;
  progress: number;
  progress_step?: string;
  error_message?: string;
  created_at: string;
  updated_at?: string;
  completed_at?: string;
  density_mode: string;
  fps_target?: number;
  video_duration_seconds?: number;
  total_frames?: number;
  transcript?: any;
  frame_urls?: any;
  modules?: CourseModule[];
  module_count?: number;
  share_enabled?: boolean;
  share_token?: string;
  course_files?: CourseFile[];
  last_heartbeat_at?: string;
  pdf_revision_pending?: boolean;
  knowledge_layer_status?: string;
  pdf_generation_status?: string;
  pdf_generation_progress?: { currentPart: number; totalParts: number; currentFrame: number; totalFrames: number; };
}

// Display item can be either a Course (single module) or a CourseModule (part of multi-module course)
interface DisplayItem {
  id: string;
  parentCourseId: string;
  moduleNumber: number;
  title: string;
  status: string;
  progress: number;
  progress_step?: string;
  error_message?: string;
  created_at: string;
  updated_at?: string;
  video_duration_seconds?: number;
  heartbeat_at?: string;
  share_enabled?: boolean;
  share_token?: string;
  isModule: boolean; // true if from course_modules, false if standalone course
  knowledge_layer_status?: string;
}

// Progress step configuration with labels and percentage ranges
const progressStepConfig: Record<string, { label: string; minProgress: number; maxProgress: number }> = {
  uploading: { label: 'Uploading video...', minProgress: 0, maxProgress: 3 },
  queued: { label: 'Starting processing...', minProgress: 1, maxProgress: 8 },
  extracting_frames: { label: 'Extracting frames...', minProgress: 8, maxProgress: 40 },
  transcribing: { label: 'Transcribing audio...', minProgress: 40, maxProgress: 60 },
  analyzing: { label: 'Analyzing content...', minProgress: 60, maxProgress: 80 },
  generating_artifact: { label: 'Generating artifact...', minProgress: 80, maxProgress: 95 },
  finalizing: { label: 'Finalizing...', minProgress: 95, maxProgress: 100 },
  manual_review: { label: 'Receiving special attention...', minProgress: 0, maxProgress: 100 },
  completed: { label: 'Complete', minProgress: 100, maxProgress: 100 },
  failed: { label: 'Failed', minProgress: 0, maxProgress: 0 },
};

// Group courses by their base title (training block name)
interface TrainingBlock {
  name: string;
  courses: Course[];
  displayItems: DisplayItem[]; // Flattened list of modules/courses for display
  totalModules: number;
  completedModules: number;
  processingModules: number;
  failedModules: number;
  queuedModules: number;
  densityMode: string;
  fpsTarget: number;
  courseFiles: CourseFile[];
  allCompleted: boolean; // NEW: true when all modules are completed
}

const statusConfig: Record<string, { label: string; color: string; icon: any; bgColor: string }> = {
  queued: { label: 'Queued', color: 'text-white/60', icon: Clock, bgColor: 'bg-white/10' },
  pending: { label: 'Queued', color: 'text-white/60', icon: Clock, bgColor: 'bg-white/10' },
  transcribing: { label: 'Transcribing', color: 'text-blue-400', icon: Loader2, bgColor: 'bg-blue-500/10' },
  extracting_frames: { label: 'Extracting Frames', color: 'text-purple-400', icon: Loader2, bgColor: 'bg-purple-500/10' },
  analyzing_audio: { label: 'Analyzing Audio', color: 'text-amber-400', icon: Loader2, bgColor: 'bg-amber-500/10' },
  training_ai: { label: 'Training AI', color: 'text-cyan-400', icon: Sparkles, bgColor: 'bg-cyan-500/10' },
  completed: { label: 'Complete', color: 'text-emerald-400', icon: CheckCircle, bgColor: 'bg-emerald-500/10' },
  failed: { label: 'Failed', color: 'text-red-400', icon: AlertTriangle, bgColor: 'bg-red-500/10' },
  stalled: { label: 'Stalled', color: 'text-orange-400', icon: AlertTriangle, bgColor: 'bg-orange-500/10' },
  manual_review: { label: 'Special Attention', color: 'text-purple-300', icon: Sparkles, bgColor: 'bg-purple-500/20' },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, signOut, isLoading: authLoading } = useAuth();
  const email = user?.email || '';

  const [courses, setCourses] = useState<Course[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [retryingCourses, setRetryingCourses] = useState<Set<string>>(new Set());
  const [generatingPDF, setGeneratingPDF] = useState<string | null>(null);
  const [pdfProgress, setPdfProgress] = useState({ progress: 0, status: '', title: '' });
  const [deletingCourse, setDeletingCourse] = useState<string | null>(null);
  const [reExtractingCourse, setReExtractingCourse] = useState<string | null>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [displayProgress, setDisplayProgress] = useState<Record<string, number>>({});
  const [justUploaded, setJustUploaded] = useState<{ courseTitle: string; timestamp: number; isNewCourse: boolean } | null>(null);
  const [togglingShare, setTogglingShare] = useState<string | null>(null);
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [editingBlockName, setEditingBlockName] = useState<string | null>(null);
  const [editingBlockValue, setEditingBlockValue] = useState('');
  const [isSavingBlockName, setIsSavingBlockName] = useState(false);
  const [showWelcomeConfetti, setShowWelcomeConfetti] = useState(false);
  const [addFilesDialog, setAddFilesDialog] = useState<{ open: boolean; courseId: string; courseTitle: string; existingFiles: CourseFile[] } | null>(null);

  // Folder state
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isFoldersLoading, setIsFoldersLoading] = useState(true);
  const [moveToFolderOpen, setMoveToFolderOpen] = useState(false);

  const lastSelfRecoveryAtRef = useRef(0);
  const apiKeysRef = useRef<HTMLDivElement>(null);

  // Call watchdog periodically to recover stuck jobs
  useEffect(() => {
    const runWatchdog = async () => {
      try {
        await supabase.functions.invoke('process-course', {
          body: { action: 'watchdog' },
        });
      } catch (err) {
        console.log('Watchdog check completed');
      }
    };

    // Run watchdog on mount and every 2 minutes
    runWatchdog();
    const watchdogInterval = setInterval(runWatchdog, 120000);

    return () => clearInterval(watchdogInterval);
  }, []);

  // Check for just-uploaded flag from Upload page
  useEffect(() => {
    const stored = localStorage.getItem('oneduo_just_uploaded');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        // Only show if uploaded within the last 60 seconds
        if (Date.now() - data.timestamp < 60000) {
          setJustUploaded(data);
        }
      } catch (e) {
        // ignore
      }
      // Clear it after reading
      localStorage.removeItem('oneduo_just_uploaded');
    }
  }, []);

  // Fast polling for processing courses - use ref to track current state
  const coursesRef = useRef(courses);
  coursesRef.current = courses;

  useEffect(() => {
    // IMPORTANT: useAuth() can report an empty user briefly on refresh.
    // Never flip the UI into the "empty state" during this transient period.
    if (!email) return;

    // Ensure we stay in loading state while the first dashboard fetch completes
    setIsInitialLoading(true);
    loadCourses(true);

    // Dynamic polling: check current state each tick
    const pollTick = () => {
      const currentCourses = coursesRef.current;
      const hasProcessing = currentCourses.some(c =>
        !['completed', 'failed'].includes(c.status) ||
        c.modules?.some(m => !['completed', 'failed'].includes(m.status)) ||
        c.pdf_generation_status === 'generating'
      );

      // Auto-retry stalled PDF generation (function timed out silently)
      for (const c of currentCourses) {
        if (c.pdf_generation_status === 'generating' && c.pdf_generation_progress?.startedAt) {
          const stalledMs = Date.now() - new Date(c.pdf_generation_progress.startedAt).getTime();
          if (stalledMs > 3 * 60 * 1000) {
            console.log(`[dashboard] PDF stalled for ${c.title}, auto-retrying...`);
            supabase.functions.invoke('generate-pdf-backend', {
              body: { courseId: c.id, email, action: 'generateAll', framesPerPart: 150 },
            }).catch(() => {});
          }
        }
      }

      // Fast poll (2s) when processing or PDF generating, slow poll (10s) when idle
      const nextDelay = hasProcessing ? 2000 : 10000;

      loadCourses(false);
      timeoutRef.current = setTimeout(pollTick, nextDelay);
    };

    // Start polling after initial delay
    const timeoutRef = { current: setTimeout(pollTick, 2000) as NodeJS.Timeout };

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [email]);

  // Trigger welcome confetti AFTER initial loading completes
  useEffect(() => {
    if (!isInitialLoading && email) {
      setShowWelcomeConfetti(true);
    }
  }, [isInitialLoading, email]);

  // Auto-expand blocks with processing modules
  useEffect(() => {
    const processingBlocks = new Set<string>();
    courses.forEach(course => {
      // Check if course itself or any of its modules are processing
      const courseProcessing = !['completed', 'failed'].includes(course.status);
      const modulesProcessing = course.modules?.some(m => !['completed', 'failed', 'queued'].includes(m.status));
      if (courseProcessing || modulesProcessing) {
        processingBlocks.add(course.title);
      }
    });
    if (processingBlocks.size > 0) {
      setExpandedBlocks(prev => new Set([...prev, ...processingBlocks]));
    }
  }, [courses]);

  // Micro-progress simulation - adds tiny increments between real updates
  // Track individual modules, not just courses
  useEffect(() => {
    // Build list of all processing items (modules or standalone courses)
    const processingItems: { id: string; progress: number; status: string; progress_step?: string }[] = [];

    courses.forEach(course => {
      if (course.modules && course.modules.length > 0) {
        // Add processing modules
        course.modules.forEach(mod => {
          if (!['completed', 'failed'].includes(mod.status)) {
            processingItems.push({
              id: mod.id,
              progress: mod.progress,
              status: mod.status,
              progress_step: mod.progress_step
            });
          }
        });
      } else if (!['completed', 'failed'].includes(course.status)) {
        // Standalone course
        processingItems.push({
          id: course.id,
          progress: course.progress,
          status: course.status,
          progress_step: course.progress_step
        });
      }
    });

    if (processingItems.length === 0) return;

    // Initialize display progress - start at 1% for queued items, respect actual progress for active items
    const initialProgress: Record<string, number> = {};
    processingItems.forEach(item => {
      const isQueued = item.status === 'queued' || item.progress_step === 'queued';
      const currentDisplay = displayProgress[item.id];
      const actualProgress = item.progress;

      // For queued items with 0 or very low backend progress, start at 1%
      if (isQueued && actualProgress < 5) {
        initialProgress[item.id] = currentDisplay ?? 1;
      } else if (actualProgress > (currentDisplay ?? 0)) {
        // Backend progress increased - use it
        initialProgress[item.id] = actualProgress;
      } else {
        // Keep current display or start from actual
        initialProgress[item.id] = currentDisplay ?? Math.max(1, actualProgress);
      }
    });

    setDisplayProgress(prev => ({ ...prev, ...initialProgress }));

    // Micro-increment timer - smooth progress updates every 800ms for visible decimal changes
    const microInterval = setInterval(() => {
      setDisplayProgress(prev => {
        const updated = { ...prev };
        processingItems.forEach(item => {
          const current = updated[item.id] ?? 1;
          const actualProgress = item.progress;
          const isQueued = item.status === 'queued' || item.progress_step === 'queued';

          // Calculate a reasonable target based on step - wider headroom to prevent visible freezing
          let targetMax = 99;
          if (isQueued) targetMax = 25; // Wider room so queued items don't freeze at 12%
          else if (actualProgress < 40) targetMax = Math.min(actualProgress + 8, 48);
          else if (actualProgress < 60) targetMax = Math.min(actualProgress + 6, 66);
          else if (actualProgress < 80) targetMax = Math.min(actualProgress + 4, 84);
          else targetMax = Math.min(actualProgress + 2, 99);

          if (current < targetMax) {
            // Slower increments to spread ceiling over more time (prevents abrupt freeze)
            const distanceToTarget = targetMax - current;
            const microIncrement = Math.min(0.2, distanceToTarget * 0.04);
            updated[item.id] = Math.min(current + Math.max(0.1, microIncrement), targetMax);
          }
        });
        return updated;
      });
    }, 800);

    return () => clearInterval(microInterval);
  }, [courses]);

  // Helper to get display progress for a course
  const getDisplayProgress = (course: Course): number => {
    if (['completed', 'failed'].includes(course.status)) return course.progress;
    return displayProgress[course.id] ?? course.progress;
  };

  const loadCourses = async (isInitial = false) => {
    if (!email) return;

    try {
      const { data, error } = await supabase.functions.invoke('process-course', {
        body: { action: 'get-dashboard', email },
      });

      if (error) throw error;

      // Force deep comparison by creating new course objects when progress changes
      const newCourses = (data.courses || []).map((course: Course) => ({
        ...course,
        // Force new object reference when progress/status changes
        _lastUpdate: `${course.id}-${course.status}-${course.progress}-${course.progress_step}`,
        modules: course.modules?.map(m => ({
          ...m,
          _lastUpdate: `${m.id}-${m.status}-${m.progress}-${m.progress_step}`,
        })),
      }));

      setCourses(newCourses);

      // Self-recovery: if we see a course in any non-terminal status for 3+ minutes,
      // trigger the backend watchdog to repair it (throttled).
      const hasPotentialStuck = newCourses.some((c: Course) => {
        if (['completed', 'failed', 'manual_review'].includes(c.status)) return false;
        const updatedAt = c.updated_at || c.created_at;
        if (!updatedAt) return false;
        return (Date.now() - new Date(updatedAt).getTime()) > 3 * 60 * 1000;
      });

      const now = Date.now();
      if (hasPotentialStuck && now - lastSelfRecoveryAtRef.current > 60000) {
        lastSelfRecoveryAtRef.current = now;
        supabase.functions.invoke('process-course', { body: { action: 'watchdog' } }).catch(() => { });
      }
    } catch (err) {
      console.error('Failed to load courses:', err);
    } finally {
      if (isInitial) {
        setIsInitialLoading(false);
      }
    }
  };

  // Extract module number from course - prioritize explicit module_number, then parse from text
  const extractModuleNumber = (course: Course): number => {
    // If the course has modules array, use the module_number from there
    if (course.modules && course.modules.length > 0) {
      return course.modules[0].module_number ?? 1;
    }

    // Try to extract from description first (e.g., "Module 2: Some Title" or just "Module 2")
    const descMatch = course.description?.match(/module\s*(\d+)/i);
    if (descMatch) return parseInt(descMatch[1], 10);

    // Fall back to checking if title ends with a number pattern
    const titleMatch = course.title?.match(/module\s*(\d+)/i);
    if (titleMatch) return parseInt(titleMatch[1], 10);

    // Return 0 to indicate "no explicit number" - will be assigned sequentially later
    return 0;
  };

  // Get display module number for a course within its block (uses explicit number or position)
  const getDisplayModuleNumber = (course: Course, positionInBlock: number): number => {
    const extracted = extractModuleNumber(course);
    // If we have an explicit module number (not 0), use it
    if (extracted > 0) return extracted;
    // Otherwise use the 1-indexed position in the block
    return positionInBlock + 1;
  };

  // Group courses into training blocks by title (strip module number from title for grouping)
  const groupCoursesIntoBlocks = (courses: Course[]): TrainingBlock[] => {
    const blockMap = new Map<string, Course[]>();

    courses.forEach(course => {
      // Use the course title as the block name (training block)
      const blockName = course.title;
      if (!blockMap.has(blockName)) {
        blockMap.set(blockName, []);
      }
      blockMap.get(blockName)!.push(course);
    });

    return Array.from(blockMap.entries()).map(([name, blockCourses]) => {
      // Build display items: if course has modules, use them; otherwise use the course itself
      const displayItems: DisplayItem[] = [];

      blockCourses.forEach(course => {
        if (course.modules && course.modules.length > 0) {
          // Multi-module course: add each module as a display item
          course.modules.forEach(mod => {
            displayItems.push({
              id: mod.id,
              parentCourseId: course.id,
              moduleNumber: mod.module_number,
              title: mod.title,
              status: mod.status,
              progress: mod.progress,
              progress_step: mod.progress_step,
              error_message: mod.error_message,
              created_at: mod.created_at,
              updated_at: mod.updated_at,
              video_duration_seconds: mod.video_duration_seconds,
              heartbeat_at: mod.heartbeat_at,
              share_enabled: course.share_enabled,
              share_token: course.share_token,
              isModule: true,
              knowledge_layer_status: mod.knowledge_layer_status,
            });
          });
        } else {
          // Single module course: use the course itself as display item
          displayItems.push({
            id: course.id,
            parentCourseId: course.id,
            moduleNumber: 1,
            title: course.title,
            status: course.status,
            progress: course.progress,
            progress_step: course.progress_step,
            error_message: course.error_message,
            created_at: course.created_at,
            updated_at: course.updated_at,
            video_duration_seconds: course.video_duration_seconds,
            heartbeat_at: course.last_heartbeat_at,
            share_enabled: course.share_enabled,
            share_token: course.share_token,
            isModule: false,
            knowledge_layer_status: course.knowledge_layer_status,
          });
        }
      });

      // Sort display items by module number
      displayItems.sort((a, b) => a.moduleNumber - b.moduleNumber);

      // Calculate counts from display items (not courses)
      const totalModules = displayItems.length;
      const completedModules = displayItems.filter(d => d.status === 'completed').length;
      const processingModules = displayItems.filter(d => !['completed', 'failed', 'queued', 'manual_review'].includes(d.status)).length;
      const failedModules = displayItems.filter(d => d.status === 'failed').length;
      const manualReviewModules = displayItems.filter(d => d.status === 'manual_review').length;
      const queuedModules = displayItems.filter(d => d.status === 'queued').length;

      return {
        name,
        courses: blockCourses,
        displayItems,
        totalModules,
        completedModules,
        processingModules,
        failedModules,
        queuedModules,
        densityMode: blockCourses[0]?.density_mode || 'standard',
        fpsTarget: blockCourses[0]?.fps_target || 1,
        // Collect course files from all courses in this block
        courseFiles: blockCourses.flatMap(c => c.course_files || []),
        // NEW: true when ALL modules are completed
        allCompleted: completedModules === totalModules && totalModules > 0,
      };
    }).sort((a, b) => {
      // Sort by most recent activity
      const aLatest = Math.max(...a.courses.map(c => new Date(c.created_at).getTime()));
      const bLatest = Math.max(...b.courses.map(c => new Date(c.created_at).getTime()));
      return bLatest - aLatest;
    });
  };

  // Load folders on mount
  const loadFolders = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('user_id', user.id)
        .order('name');

      if (error) throw error;

      // Calculate training block count per folder (unique course titles, not individual course rows)
      // A training block is a group of courses with the same title (e.g., multi-module courses)
      const folderTrainingBlocks = new Map<string, Set<string>>();
      courses.forEach(c => {
        const fId = (c as any).project_id;
        if (fId) {
          if (!folderTrainingBlocks.has(fId)) {
            folderTrainingBlocks.set(fId, new Set());
          }
          // Use course title as the unique training block identifier
          folderTrainingBlocks.get(fId)!.add(c.title);
        }
      });

      setFolders((data || []).map(f => ({
        id: f.id,
        name: f.name,
        courseCount: folderTrainingBlocks.get(f.id)?.size || 0,
      })));
    } catch (err) {
      console.error('Failed to load folders:', err);
    } finally {
      setIsFoldersLoading(false);
    }
  };

  // Load folders when user or courses change
  useEffect(() => {
    if (user?.id) {
      loadFolders();
    }
  }, [user?.id, courses]);

  // Folder CRUD operations
  const handleCreateFolder = async (name: string) => {
    if (!user?.id) return;
    try {
      const { error } = await supabase
        .from('projects')
        .insert({ name, user_id: user.id });

      if (error) throw error;
      toast.success('Folder created');
      loadFolders();
    } catch (err) {
      toast.error('Failed to create folder');
      throw err;
    }
  };

  const handleRenameFolder = async (folderId: string, newName: string) => {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ name: newName })
        .eq('id', folderId);

      if (error) throw error;
      toast.success('Folder renamed');
      loadFolders();
    } catch (err) {
      toast.error('Failed to rename folder');
      throw err;
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      // First, unset project_id on all courses in this folder
      await supabase
        .from('courses')
        .update({ project_id: null })
        .eq('project_id', folderId);

      // Then delete the folder
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', folderId);

      if (error) throw error;
      toast.success('Folder deleted');
      loadFolders();
      loadCourses();
    } catch (err) {
      toast.error('Failed to delete folder');
      throw err;
    }
  };

  const handleMoveToFolder = async (folderId: string | null) => {
    const courseIds = Array.from(selectedCourses);
    if (courseIds.length === 0) return;

    try {
      // Use edge function with service role to move (bypasses RLS)
      const { data, error } = await supabase.functions.invoke('process-course', {
        body: {
          action: 'move-to-folder',
          email,
          courseIds,
          folderId
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Moved ${courseIds.length} training${courseIds.length > 1 ? 's' : ''} to folder`);
      setSelectedCourses(new Set());
      loadCourses();
      loadFolders();
    } catch (err) {
      toast.error('Failed to move trainings');
      throw err;
    }
  };

  const handleCreateAndMoveToFolder = async (folderName: string) => {
    if (!user?.id) return;
    const courseIds = Array.from(selectedCourses);
    if (courseIds.length === 0) return;

    try {
      // Create folder (this should work with RLS since we're inserting as the user)
      const { data: newFolder, error: createError } = await supabase
        .from('projects')
        .insert({ name: folderName, user_id: user.id })
        .select('id')
        .single();

      if (createError) throw createError;

      // Move courses to new folder using edge function (bypasses RLS)
      const { data, error: moveError } = await supabase.functions.invoke('process-course', {
        body: {
          action: 'move-to-folder',
          email,
          courseIds,
          folderId: newFolder.id
        },
      });

      if (moveError) throw moveError;
      if (data?.error) throw new Error(data.error);

      toast.success(`Created folder and moved ${courseIds.length} training${courseIds.length > 1 ? 's' : ''}`);
      setSelectedCourses(new Set());
      loadCourses();
      loadFolders();
    } catch (err) {
      toast.error('Failed to create folder and move trainings');
      throw err;
    }
  };

  // Filter training blocks by selected folder
  const filteredTrainingBlocks = (() => {
    const allBlocks = groupCoursesIntoBlocks(courses);

    if (selectedFolderId === null || selectedFolderId === 'uncategorized') {
      // Main dashboard view: show only courses NOT in any folder
      const uncategorizedCourses = courses.filter(c => !(c as any).project_id);
      return groupCoursesIntoBlocks(uncategorizedCourses);
    }

    // Show only courses in the selected folder
    const folderCourses = courses.filter(c => (c as any).project_id === selectedFolderId);
    return groupCoursesIntoBlocks(folderCourses);
  })();

  // Calculate counts for sidebar
  const totalCourseCount = courses.length;
  const uncategorizedCount = courses.filter(c => !(c as any).project_id).length;

  const trainingBlocks = filteredTrainingBlocks;


  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadCourses();
    setIsRefreshing(false);
    toast.success('Refreshed');
  };

  const handleRetry = async (courseId: string, errorAnalysis: ErrorAnalysis) => {
    setRetryingCourses(prev => new Set([...prev, courseId]));

    try {
      const { error } = await supabase.functions.invoke('process-course', {
        body: {
          action: 'retry',
          courseId,
          fixStrategy: errorAnalysis.fixStrategy
        },
      });

      if (error) throw error;
      toast.success(errorAnalysis.canAutoFix
        ? `Retrying with smart fix: ${errorAnalysis.fixStrategy}`
        : 'Retrying processing...'
      );
      loadCourses();
    } catch (err) {
      toast.error('Failed to retry');
    } finally {
      setRetryingCourses(prev => {
        const next = new Set(prev);
        next.delete(courseId);
        return next;
      });
    }
  };

  const handleLogout = async () => {
    await signOut();
    setCourses([]);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m} min`;
  };

  const handleShareWithTeam = (courseId: string) => {
    const link = `${window.location.origin}/view/${courseId}?download=pdf`;
    navigator.clipboard.writeText(link);
    toast.success('Share link copied! Your team can download the AI PDF from this link.');
  };

  const handleCopyAILink = (courseId: string) => {
    const link = `${window.location.origin}/view/${courseId}`;
    navigator.clipboard.writeText(link);
    toast.success('AI-readable link copied! Paste directly into any AI chat.');
  };

  const handleCopyPDFShareLink = (courseId: string) => {
    const link = `${window.location.origin}/view/${courseId}?action=download-pdf`;
    navigator.clipboard.writeText(link);

    toast.success('PDF share link copied! Anyone with this link can download the PDF.');
  };

  const handleTeamEmailSubmit = async (courseId: string, teamEmail: string) => {
    try {
      const { error } = await supabase.functions.invoke('process-course', {
        body: { action: 'set-team-email', courseId, teamEmail }
      });

      if (error) throw error;
      toast.success(`We'll email ${teamEmail} when your OneDuo is ready!`);
    } catch (err) {
      console.error('Failed to save team email:', err);
      toast.error('Failed to save team email');
    }
  };

  const handleToggleSharing = async (courseId: string, currentlyEnabled: boolean) => {
    setTogglingShare(courseId);
    try {
      const { data, error } = await supabase.rpc('toggle_course_sharing', {
        p_course_id: courseId,
        p_enabled: !currentlyEnabled
      });

      if (error) throw error;

      // Update local state
      setCourses(prev => prev.map(c =>
        c.id === courseId ? { ...c, share_enabled: !currentlyEnabled } : c
      ));

      toast.success(!currentlyEnabled ? 'Public sharing enabled' : 'Public sharing disabled');
    } catch (err) {
      console.error('Failed to toggle sharing:', err);
      toast.error('Failed to update sharing settings');
    } finally {
      setTogglingShare(null);
    }
  };

  // Generate new secure access link and send email
  const handleResendAccessEmail = async (courseId: string) => {
    setResendingEmail(courseId);
    try {
      const { data, error } = await supabase.functions.invoke('resend-access-email', {
        body: { courseId, email }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('New secure access link sent to your email!', {
        description: 'Check your inbox for a fresh 24-hour access link.',
        duration: 5000
      });
    } catch (err) {
      console.error('Failed to resend access email:', err);
      const msg = err instanceof Error ? err.message : 'Failed to send email';
      toast.error(msg);
    } finally {
      setResendingEmail(null);
    }
  };

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Download course file from storage
  const handleDownloadCourseFile = async (file: CourseFile) => {
    try {
      const { data, error } = await supabase.storage
        .from('course-files')
        .download(file.storagePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.name}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Downloaded ${file.name}`);
    } catch (err) {
      console.error('Failed to download file:', err);
      toast.error('Failed to download file');
    }
  };

  // Calculate estimated completion time based on video duration and progress
  const getEstimatedTimeRemaining = (course: Course): string => {
    const duration = course.video_duration_seconds || 0;
    const progress = course.progress || 0;

    if (progress >= 95) return '< 1 min';
    if (progress >= 80) return '< 2 min';

    // For short videos (under 10 min), processing is fast
    if (duration > 0 && duration < 600) {
      const estimatedMins = Math.max(2, Math.ceil((duration / 60) * 0.5));
      const remainingProgress = 100 - progress;
      const remainingMins = Math.max(1, Math.ceil((remainingProgress / 100) * estimatedMins));
      return remainingMins <= 1 ? '< 1 min' : `~${remainingMins} min`;
    }

    // For medium videos (10-30 min), still reasonable
    if (duration >= 600 && duration < 1800) {
      const estimatedMins = Math.ceil((duration / 60) * 0.8);
      const remainingProgress = 100 - progress;
      const remainingMins = Math.max(2, Math.ceil((remainingProgress / 100) * estimatedMins));
      return `~${remainingMins} min`;
    }

    // For long videos, give realistic range
    if (duration >= 1800) {
      const estimatedMins = Math.ceil((duration / 60) * 1.2);
      const remainingProgress = 100 - progress;
      const remainingMins = Math.ceil((remainingProgress / 100) * estimatedMins);
      if (remainingMins < 60) return `~${remainingMins} min`;
      const hours = Math.floor(remainingMins / 60);
      const mins = remainingMins % 60;
      return `~${hours}h ${mins}m`;
    }

    // Fallback for unknown duration - short videos are fast
    return '~2-5 min';
  };

  // Check if activity is stale (no update in last 2 minutes = potential stall)
  const isActivityStale = (lastActivity?: string): boolean => {
    if (!lastActivity) return false; // No activity yet, processing just started
    const activityTime = new Date(lastActivity).getTime();
    const now = Date.now();
    const twoMinutes = 2 * 60 * 1000;
    return (now - activityTime) > twoMinutes;
  };

  // Get sync status message (on-brand naming instead of "heartbeat")
  const getSyncStatus = (course: Course): { isStale: boolean; message: string; isStarting: boolean } => {
    const lastActivity = course.last_heartbeat_at;
    // If no heartbeat yet, check how long since creation
    if (!lastActivity) {
      const isJustStarting = ['queued', 'transcribing'].includes(course.status);
      // If no heartbeat ever but created > 3 min ago, mark as stale (worker likely never started)
      if (course.created_at && (Date.now() - new Date(course.created_at).getTime()) > 3 * 60 * 1000) {
        return { isStale: true, message: 'Reconnecting...', isStarting: false };
      }
      return { isStale: false, message: isJustStarting ? 'Starting...' : 'Initializing...', isStarting: true };
    }

    const activityTime = new Date(lastActivity).getTime();
    const now = Date.now();
    const secondsAgo = Math.floor((now - activityTime) / 1000);

    if (secondsAgo < 30) return { isStale: false, message: 'Synced just now', isStarting: false };
    if (secondsAgo < 60) return { isStale: false, message: `Synced ${secondsAgo}s ago`, isStarting: false };
    if (secondsAgo < 120) return { isStale: false, message: `Synced ${Math.floor(secondsAgo / 60)}m ago`, isStarting: false };

    // Stale - no activity for 2+ minutes
    const minsAgo = Math.floor(secondsAgo / 60);
    return { isStale: true, message: `Paused ${minsAgo}m`, isStarting: false };
  };

  // Get stage label from progress_step or course status
  const getStageLabel = (item: { progress_step?: string; status?: string }, displayProgress: number): string => {
    const progressStep = item.progress_step?.toLowerCase() || '';
    const status = item.status?.toLowerCase() || '';

    // Priority 1: Use progress_step if available (new system)
    if (progressStep && progressStepConfig[progressStep]) {
      return progressStepConfig[progressStep].label;
    }

    // Priority 2: Use status if informative (legacy fallback)
    if (status === 'transcribing' || status.includes('transcrib')) return 'Transcribing audio...';
    if (status === 'extracting_frames' || status.includes('extract')) return 'Extracting frames...';
    if (status === 'analyzing_audio' || status.includes('analyz')) return 'Analyzing content...';
    if (status === 'training_ai' || status.includes('train')) return 'Building AI context...';
    if (status === 'rendering' || status.includes('render')) return 'Generating snapshots...';

    // Priority 3: Fall back to progress-based messaging
    if (displayProgress < 10) return 'Starting processing...';
    if (displayProgress < 40) return 'Extracting frames...';
    if (displayProgress < 60) return 'Transcribing audio...';
    if (displayProgress < 80) return 'Analyzing content...';
    if (displayProgress < 95) return 'Generating artifact...';
    return 'Finalizing...';
  };

  // Get estimated time based on progress step and video duration
  const getEstimatedTime = (item: DisplayItem): string | null => {
    if (!item.video_duration_seconds || item.video_duration_seconds <= 0) return null;

    const progressStep = item.progress_step || 'queued';
    const config = progressStepConfig[progressStep];
    if (!config) return null;

    // Rough estimate: 1 minute of video ≈ 30 seconds of processing
    const totalEstimate = Math.ceil(item.video_duration_seconds / 2);
    const remainingPercent = (100 - config.minProgress) / 100;
    const remainingSeconds = Math.ceil(totalEstimate * remainingPercent);

    if (remainingSeconds < 60) return `~${remainingSeconds}s remaining`;
    const mins = Math.ceil(remainingSeconds / 60);
    return `~${mins}m remaining`;
  };

  // Count stalled courses (includes module-level and no-heartbeat detection)
  const stalledCourseCount = courses.filter(c => {
    if (['completed', 'failed'].includes(c.status)) return false;
    // Course-level heartbeat staleness
    if (isActivityStale(c.last_heartbeat_at)) return true;
    // Module-level heartbeat staleness
    if (c.modules?.some(m => !['completed', 'failed'].includes(m.status) && isActivityStale(m.heartbeat_at))) return true;
    // No heartbeat ever + created > 3 minutes ago (worker likely never started)
    if (!c.last_heartbeat_at && c.created_at && (Date.now() - new Date(c.created_at).getTime()) > 3 * 60 * 1000) return true;
    return false;
  }).length;

  // Save block name (rename all courses in the block) - uses edge function to bypass RLS
  const handleSaveBlockName = async (oldName: string, newName: string, courseIds: string[]) => {
    if (!newName.trim() || newName === oldName) {
      setEditingBlockName(null);
      return;
    }

    setIsSavingBlockName(true);
    try {
      // Use edge function with service role to rename (bypasses RLS)
      // Email is derived from JWT token in edge function - no need to pass explicitly
      const { data, error } = await supabase.functions.invoke('process-course', {
        body: {
          action: 'rename-training',
          courseIds,
          newTitle: newName.trim()
        },
      });

      if (error) {
        console.error('[Dashboard] Rename invoke error:', error);
        throw error;
      }
      if (data?.error) {
        console.error('[Dashboard] Rename data.error:', data.error);
        throw new Error(data.error);
      }

      toast.success('Training renamed');
      loadCourses(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to rename');
      console.error('[Dashboard] Rename failed:', err);
    } finally {
      setIsSavingBlockName(false);
      setEditingBlockName(null);
    }
  };

  // Auto-recovery: trigger watchdog when stalls are detected
  useEffect(() => {
    if (stalledCourseCount > 0) {
      const now = Date.now();
      // Only trigger recovery every 30 seconds max
      if (now - lastSelfRecoveryAtRef.current > 30000) {
        lastSelfRecoveryAtRef.current = now;
        console.log('[Dashboard] Detected stalled courses, triggering auto-recovery...');
        supabase.functions.invoke('process-course', { body: { action: 'watchdog' } })
          .then(() => console.log('[Dashboard] Auto-recovery triggered'))
          .catch(() => console.log('[Dashboard] Auto-recovery attempted'));
      }
    }
  }, [stalledCourseCount]);

  // ProcessingCard is now imported from @/components/ProcessingProgressCard

  const handleReExtractFrames = async (courseId: string) => {
    setReExtractingCourse(courseId);
    const toastId = 'reextract-' + courseId;
    console.log('[ReExtract] Starting re-extraction for courseId:', courseId);
    try {
      // Fetch video_url from DB
      const { data: course, error: fetchError } = await supabase
        .from('courses')
        .select('video_url, video_duration_seconds')
        .eq('id', courseId)
        .single();
      console.log('[ReExtract] Course fetch:', { video_url: course?.video_url, duration: course?.video_duration_seconds, fetchError });
      if (fetchError) throw fetchError;
      if (!course?.video_url) throw new Error('No video URL found for this course');

      // Trigger async extraction via extract-frames-ffmpeg — returns immediately,
      // Replicate processes in background, replicate-webhook saves frames when done
      toast.loading('Queuing frame extraction — this runs in the background. Check back in a few minutes.', { id: toastId });
      const { data, error } = await supabase.functions.invoke('extract-frames-ffmpeg', {
        body: { videoUrl: course.video_url, courseId, fps: 2 },
      });
      console.log('[ReExtract] extract-frames-ffmpeg response:', { data, error });
      if (error) throw error;

      const estimatedFrames = data?.estimatedFrames;
      const successMsg = estimatedFrames
        ? `Extraction queued! Expecting ~${estimatedFrames.toLocaleString()} frames. Check back in a few minutes.`
        : 'Frame extraction queued! Frames will update automatically when Replicate finishes.';
      toast.success(successMsg, { id: toastId, duration: 8000 });
    } catch (err: any) {
      console.error('[ReExtract] Error:', err?.message || err);
      toast.error('Failed to queue frame extraction. Please try again.', { id: toastId });
    } finally {
      setReExtractingCourse(null);
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    console.log('[Dashboard] handleDeleteCourse called:', { courseId, email });
    setDeletingCourse(courseId);
    try {
      // Use edge function with service role to delete (bypasses RLS)
      const { data, error } = await supabase.functions.invoke('process-course', {
        body: {
          action: 'delete-course',
          courseId,
          email
        },
      });

      console.log('[Dashboard] Delete course response:', { data, error });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setCourses(prev => prev.filter(c => c.id !== courseId));
      toast.success('Module deleted successfully');
    } catch (err) {
      console.error('[Dashboard] Failed to delete module:', err);
      const msg = err instanceof Error ? err.message : 'Failed to delete module';
      toast.error(msg);
    } finally {
      setDeletingCourse(null);
    }
  };

  // Delete individual module via governance soft-delete
  const handleDeleteModule = async (moduleId: string) => {
    console.log('[Dashboard] handleDeleteModule called:', { moduleId, email });
    setDeletingCourse(moduleId);
    try {
      // GOVERNANCE: Use edge function for soft-delete via execution frame
      const { data, error } = await supabase.functions.invoke('process-course', {
        body: {
          action: 'delete-module',
          moduleId,
          email
        },
      });

      console.log('[Dashboard] Delete module response:', { data, error });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Refresh courses to get updated module list
      await loadCourses();
      toast.success('Module deleted successfully');
    } catch (err) {
      console.error('[Dashboard] Failed to delete module:', err);
      const msg = err instanceof Error ? err.message : 'Failed to delete module';
      toast.error(msg);
    } finally {
      setDeletingCourse(null);
    }
  };

  // Retry individual module
  const handleRetryModule = async (moduleId: string, errorAnalysis: ErrorAnalysis) => {
    setRetryingCourses(prev => new Set([...prev, moduleId]));

    try {
      const { error } = await supabase.functions.invoke('process-course', {
        body: {
          action: 'retry-module',
          moduleId,
          fixStrategy: errorAnalysis.fixStrategy
        },
      });

      if (error) throw error;
      toast.success(errorAnalysis.canAutoFix
        ? `Retrying with smart fix: ${errorAnalysis.fixStrategy}`
        : 'Retrying processing...'
      );
      loadCourses();
    } catch (err) {
      toast.error('Failed to retry module');
    } finally {
      setRetryingCourses(prev => {
        const next = new Set(prev);
        next.delete(moduleId);
        return next;
      });
    }
  };

  // Repair stalled module (one-click recovery)
  const handleRepairModule = async (moduleId: string) => {
    setRetryingCourses(prev => new Set([...prev, moduleId]));

    try {
      const { data, error } = await supabase.functions.invoke('process-course', {
        body: {
          action: 'repair-module',
          moduleId
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(
        data?.strategy === 'mark_partial_ready'
          ? 'Module marked as partial-ready for download'
          : 'Module queued for repair'
      );
      loadCourses();
    } catch (err: any) {
      toast.error(err.message || 'Failed to repair module');
    } finally {
      setRetryingCourses(prev => {
        const next = new Set(prev);
        next.delete(moduleId);
        return next;
      });
    }
  };

  // Kickstart - manually trigger queue processing for stuck/queued courses
  const [kickstartingCourses, setKickstartingCourses] = useState<Set<string>>(new Set());

  const handleKickstart = async (courseId: string) => {
    setKickstartingCourses(prev => new Set([...prev, courseId]));

    try {
      const { data, error } = await supabase.functions.invoke('process-course', {
        body: {
          action: 'kickstart',
          courseId
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(data?.message || 'Processing kickstarted!');
      loadCourses();
    } catch (err: any) {
      toast.error(err.message || 'Failed to kickstart');
    } finally {
      setKickstartingCourses(prev => {
        const next = new Set(prev);
        next.delete(courseId);
        return next;
      });
    }
  };

  // Resume failed course with recoverable data (race condition fix)
  const handleResumeFailed = async (courseId: string) => {
    setRetryingCourses(prev => new Set([...prev, courseId]));

    try {
      const { data, error } = await supabase.functions.invoke('process-course', {
        body: {
          action: 'resume-failed',
          courseId
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Resumed processing from ${data.resumeStep}`, {
        description: `Recovered ${data.hasFrames ? 'frames' : ''}${data.hasFrames && data.hasTranscript ? ' + ' : ''}${data.hasTranscript ? 'transcript' : ''}`,
        duration: 4000
      });
      loadCourses();
    } catch (err: any) {
      toast.error(err.message || 'Failed to resume processing');
    } finally {
      setRetryingCourses(prev => {
        const next = new Set(prev);
        next.delete(courseId);
        return next;
      });
    }
  };

  // Check if a failed course has recoverable data
  const hasRecoverableData = (course: Course): boolean => {
    const hasFrames = Array.isArray(course.frame_urls) && course.frame_urls.length > 0;
    const hasTranscript = course.transcript &&
      ((Array.isArray(course.transcript) && course.transcript.length > 0) ||
        (course.transcript?.segments && course.transcript.segments.length > 0));
    return hasFrames || hasTranscript;
  };

  // Check if a course has transcript but no frames (for transcript-only export fallback)
  const hasTranscriptOnly = (course: Course): boolean => {
    const hasFrames = Array.isArray(course.frame_urls) && course.frame_urls.length > 0;
    const hasTranscript = course.transcript &&
      ((Array.isArray(course.transcript) && course.transcript.length > 0) ||
        (course.transcript?.segments && course.transcript.segments.length > 0));
    return hasTranscript && !hasFrames;
  };

  // Check if a module/item is stalled (processing but no heartbeat for 5+ minutes)
  // FIX: Use multiple activity indicators to prevent false-positive stall detection
  // Jobs actively progressing via webhooks update progress/updated_at even without heartbeat
  const isItemStalled = (item: DisplayItem): boolean => {
    // Never show stalled for terminal states or jobs waiting for external services
    // 'awaiting_webhook' means we're waiting for Replicate/AssemblyAI - this is normal, not stalled
    const nonStalledStatuses = ['completed', 'failed', 'queued', 'pending', 'awaiting_webhook'];
    if (nonStalledStatuses.includes(item.status)) return false;

    // Also check progress_step - extracting_frames and transcribing involve external webhooks
    // These can take 30-60+ minutes for long videos (4+ hours) and are NOT stalled
    const webhookWaitingSteps = ['extracting_frames', 'transcribing', 'analyzing', 'transcribe_and_extract'];
    if (item.progress_step && webhookWaitingSteps.includes(item.progress_step)) {
      // For webhook-based steps, use a DYNAMIC threshold based on video duration
      // Base: 30 minutes, +10 min per hour of video beyond 1 hour, capped at 60 min
      const videoDurationHours = (item.video_duration_seconds || 0) / 3600;
      const baseThresholdMinutes = 30;
      const extraMinutesPerHour = Math.max(0, videoDurationHours - 1) * 10;
      const dynamicThresholdMinutes = Math.min(baseThresholdMinutes + extraMinutesPerHour, 60);
      const webhookThreshold = dynamicThresholdMinutes * 60 * 1000;

      const now = Date.now();
      const timestamps = [item.heartbeat_at, item.updated_at, item.created_at].filter(Boolean);
      if (timestamps.length === 0) return false;
      const mostRecentActivity = Math.max(...timestamps.map(ts => new Date(ts!).getTime()));
      return now - mostRecentActivity > webhookThreshold;
    }

    // Check multiple activity indicators - any recent activity = not stalled
    const now = Date.now();
    const stalledThreshold = 5 * 60 * 1000; // 5 minutes for other steps

    // Priority: heartbeat_at > updated_at > created_at
    // This prevents false positives when webhooks update progress but not heartbeat
    const timestamps = [
      item.heartbeat_at,
      item.updated_at,
      item.created_at
    ].filter(Boolean);

    if (timestamps.length === 0) return false; // No timestamps = not stalled yet

    // Find the most recent activity
    const mostRecentActivity = Math.max(
      ...timestamps.map(ts => new Date(ts!).getTime())
    );

    return now - mostRecentActivity > stalledThreshold;
  };

  const handleExportForChatGPT = async (course: Course) => {
    try {
      toast.loading('Generating export...', { id: 'export' });

      const { data: response, error } = await supabase.functions.invoke('get-public-course', {
        body: { courseId: course.id },
      });

      if (error) throw error;
      if (!response?.course) throw new Error('Course not found');

      const data = response.course;

      const duration = formatDuration(data.video_duration_seconds);
      const frameCount = data.frame_urls?.length || 0;

      let transcriptText = '';
      if (data.transcript && Array.isArray(data.transcript)) {
        transcriptText = data.transcript.map((segment: any) => {
          const start = Math.floor(segment.start || 0);
          const mins = Math.floor(start / 60);
          const secs = start % 60;
          const timestamp = `[${mins}:${secs.toString().padStart(2, '0')}]`;
          return `${timestamp} ${segment.text}`;
        }).join('\n');
      }

      let frameUrlsText = '';
      if (data.frame_urls && Array.isArray(data.frame_urls)) {
        const framesToShow = data.frame_urls.slice(0, 50);
        frameUrlsText = framesToShow.map((url: string, i: number) =>
          `Frame ${i + 1}: ${url}`
        ).join('\n');
        if (data.frame_urls.length > 50) {
          frameUrlsText += `\n... and ${data.frame_urls.length - 50} more frames`;
        }
      }

      const exportText = `# Course: ${data.title}
Duration: ${duration} | Frames: ${frameCount.toLocaleString()}

## Full Transcript:
${transcriptText || 'No transcript available'}

## Visual Frames (for reference):
${frameUrlsText || 'No frames available'}

---
Exported from OneDuo.ai - AI-powered course training
View full interactive version: ${window.location.origin}/view/${course.id}`;

      await navigator.clipboard.writeText(exportText);
      toast.success('Course content copied! Paste directly into ChatGPT.', { id: 'export' });
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Failed to export course content', { id: 'export' });
    }
  };

  // Visual Transcription PDF — every frame with LLaVA analysis, runs on backend, emails when done
  const handleGenerateVisualTranscriptionPDF = async (courseId: string, courseTitle: string) => {
    const userEmail = user?.email;
    setGeneratingPDF(`vt-${courseId}`);
    try {
      const { error } = await supabase.functions.invoke('generate-pdf-backend', {
        body: { courseId, email: userEmail, action: 'generateAll', framesPerPart: 150 },
      });
      if (error) throw error;
      toast.success(`Visual Transcription PDF queued for "${courseTitle}". We'll email ${userEmail} when ready.`, { duration: 6000 });
    } catch (err: any) {
      console.error('Visual transcription PDF failed:', err);
      toast.error('Failed to start PDF generation. Please try again.');
    } finally {
      setGeneratingPDF(null);
    }
  };

  // Export PDF for a single-module course (redirect to dedicated download page)
  const handleExportPDF = async (course: Course, moduleNumber: number, aiFidelityMode: boolean = false) => {
    navigate(`/download/${course.id}${aiFidelityMode ? '?fidelity=true' : ''}`);
  };

  // Export PDF for a specific module in a multi-module course (redirect to dedicated download page)
  const handleExportModulePDF = async (moduleId: string, moduleTitle: string, courseTitle: string, isPartialSalvage: boolean = false, aiFidelityMode: boolean = false) => {
    navigate(`/download/module/${moduleId}${aiFidelityMode ? '?fidelity=true' : ''}`);
  };

  // Export combined PDF for all modules in a training block (unified OneDuo)
  const handleExportCombinedPDF = async (block: TrainingBlock, aiFidelityMode: boolean = false) => {
    const blockId = block.courses[0]?.id;
    if (!blockId) return;

    const blockTitle = block.name || 'Combined Training';
    setGeneratingPDF(`block-${blockId}`);
    setPdfProgress({ progress: 0, status: 'Starting combined PDF generation...', title: blockTitle });

    // Use setTimeout to prevent UI blocking
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      const sortedItems = [...block.displayItems].sort((a, b) => a.moduleNumber - b.moduleNumber);
      const modules: PdfModuleData[] = [];
      const totalModules = sortedItems.length;
      const isSingleModuleCourse = sortedItems.length === 1 && !sortedItems[0].isModule;

      for (let i = 0; i < sortedItems.length; i++) {
        const item = sortedItems[i];
        setPdfProgress(prev => ({
          ...prev,
          progress: ((i + 1) / (totalModules * 2)) * 30,
          status: `Fetching ${isSingleModuleCourse ? 'course' : 'module'} ${i + 1} of ${totalModules}...`
        }));

        let moduleData: any = null;
        if (isSingleModuleCourse) {
          const { data: response, error } = await supabase.functions.invoke('get-public-course', {
            body: { courseId: item.id },
          });
          if (!error && response?.course) {
            const courseData = response.course;
            moduleData = {
              id: courseData.id,
              title: courseData.title,
              moduleNumber: 1,
              video_duration_seconds: courseData.video_duration_seconds,
              transcript: courseData.transcript,
              frame_urls: courseData.frame_urls,
              audio_events: courseData.audio_events,
              prosody_annotations: courseData.prosody_annotations,
              key_moments_index: courseData.key_moments_index,
              concepts_frameworks: courseData.concepts_frameworks,
              hidden_patterns: courseData.hidden_patterns,
              implementation_steps: courseData.implementation_steps,
            };
          }
        } else {
          const { data: response, error } = await supabase.functions.invoke('get-module-data', {
            body: { moduleId: item.id },
          });
          if (!error && response?.module) {
            moduleData = response.module;
            moduleData.moduleNumber = moduleData.moduleNumber || item.moduleNumber;
          }
        }

        if (moduleData) {
          // Fetch knowledge_layer for this module/course
          let knowledgeLayer: any = null;
          if (item.isModule) {
            const { data: klData } = await supabase
              .from('course_modules')
              .select('knowledge_layer')
              .eq('id', item.id)
              .maybeSingle();
            knowledgeLayer = klData?.knowledge_layer || null;
          } else {
            const { data: klData } = await supabase
              .from('courses')
              .select('knowledge_layer')
              .eq('id', item.id)
              .maybeSingle();
            knowledgeLayer = klData?.knowledge_layer || null;
          }

          modules.push({
            id: moduleData.id,
            moduleNumber: moduleData.moduleNumber || (i + 1),
            title: moduleData.title || `Module ${i + 1}`,
            video_duration_seconds: moduleData.video_duration_seconds,
            transcript: moduleData.transcript,
            frame_urls: moduleData.frame_urls,
            frame_analyses: moduleData.frame_analyses,
            audio_events: moduleData.audio_events,
            prosody_annotations: moduleData.prosody_annotations,
            key_moments_index: moduleData.key_moments_index,
            concepts_frameworks: moduleData.concepts_frameworks,
            hidden_patterns: moduleData.hidden_patterns,
            implementation_steps: moduleData.implementation_steps,
            knowledge_layer: knowledgeLayer,
          });
        }
      }

      if (modules.length === 0) {
        toast.error('No module data available to export.');
        return;
      }

      // Fetch supplemental files
      const EXCLUDED_EXTENSIONS = ['.pdf', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.zip', '.rar', '.7z', '.exe', '.dll', '.bin'];
      const courseFiles = (block.courseFiles || []).filter(file => {
        if (!file?.name) return false;
        const fileName = file.name.toLowerCase();
        return !EXCLUDED_EXTENSIONS.some(ext => fileName.endsWith(ext));
      });
      let supplementalFiles: { name: string; content: string; size?: number }[] = [];
      let fileLoadFailures: string[] = [];

      if (courseFiles.length > 0) {
        setPdfProgress(prev => ({ ...prev, progress: 32, status: `Loading ${courseFiles.length} supplemental document(s)...` }));
        const concurrency = courseFiles.length > 50 ? 10 : 8;
        const loadedFiles = await loadFilesInParallel(courseFiles, (progress) => {
          const progressValue = 32 + (progress.loaded / progress.total) * 18;
          setPdfProgress(prev => ({ ...prev, progress: progressValue, status: `Loading ${progress.loaded}/${progress.total} files` }));
        }, concurrency);

        supplementalFiles = loadedFiles.filter(f => f.success && f.content?.trim()).map(f => ({ name: f.name, content: f.content, size: f.size }));
        fileLoadFailures = loadedFiles.filter(f => !f.success).map(f => f.name);
      }

      // ========== CHUNKED PDF GENERATION (60-min parts for long videos) ==========
      const CHUNK_DURATION_SEC = 3600;
      const totalDuration = modules.reduce((sum, m) => sum + (m.video_duration_seconds || 0), 0);
      const isLongVideo = totalDuration > CHUNK_DURATION_SEC;
      const chunkCount = isLongVideo ? Math.ceil(totalDuration / CHUNK_DURATION_SEC) : 1;

      const filterModuleToRange = (m: any, globalStart: number, globalEnd: number, moduleOffset: number) => {
        const dur = m.video_duration_seconds || 0;
        const moduleEnd = moduleOffset + dur;
        if (moduleEnd <= globalStart || moduleOffset >= globalEnd) return null;
        const localStart = Math.max(0, globalStart - moduleOffset);
        const localEnd = Math.min(dur, globalEnd - moduleOffset);
        const total = (m.frame_urls || []).length;
        const startIdx = dur > 0 ? Math.floor(localStart / dur * total) : 0;
        const endIdx = dur > 0 ? Math.min(total, Math.ceil(localEnd / dur * total)) : total;
        return {
          ...m,
          frame_urls: (m.frame_urls || []).slice(startIdx, endIdx),
          transcript: (m.transcript || []).filter((seg: any) => (seg.start ?? 0) >= localStart && (seg.start ?? 0) < localEnd),
        };
      };

      const baseMergedData: MergedCourseData = {
        courseId: block.courses[0]?.id || blockId,
        title: block.name,
        modules,
        userEmail: user?.email,
        supplementalFiles: supplementalFiles.length > 0 ? supplementalFiles : undefined,
      };

      for (let chunkIdx = 0; chunkIdx < chunkCount; chunkIdx++) {
        const startSeconds = chunkIdx * CHUNK_DURATION_SEC;
        const endSeconds = Math.min((chunkIdx + 1) * CHUNK_DURATION_SEC, totalDuration);
        const partLabel = isLongVideo ? ` - Part ${chunkIdx + 1} of ${chunkCount}` : '';

        setPdfProgress(prev => ({
          ...prev,
          progress: 50,
          status: isLongVideo ? `Generating Part ${chunkIdx + 1} of ${chunkCount}...` : 'Building merged PDF...',
        }));

        let chunkedModules = modules;
        if (isLongVideo) {
          let offset = 0;
          chunkedModules = modules.map(m => {
            const filtered = filterModuleToRange(m, startSeconds, endSeconds, offset);
            offset += m.video_duration_seconds || 0;
            return filtered;
          }).filter(Boolean);
        }

        const chunkData: MergedCourseData = { ...baseMergedData, modules: chunkedModules };

        const pdfBlob = await generateMergedCoursePDF(
          chunkData,
          (progress, status) => {
            const scaledProgress = 50 + (progress * 0.50);
            const statusLabel = isLongVideo ? `Part ${chunkIdx + 1}/${chunkCount}: ${status}` : status;
            setPdfProgress(prev => ({ ...prev, progress: scaledProgress, status: statusLabel }));
          },
          { maxFrames: Infinity, aiFidelityMode }
        );

        try {
          const filename = `${block.name}${partLabel} - OneDuo.pdf`;
          downloadPDF(pdfBlob, filename);
          if (isLongVideo) toast.success(`✓ Part ${chunkIdx + 1} of ${chunkCount} downloaded!`);
        } catch (downloadError) {
          console.error(`Part ${chunkIdx + 1} download failed:`, downloadError);
        }
      }

      if (!isLongVideo) toast.success(`✓ OneDuo PDF downloaded!`);

      // Background cloud sync & email delivery
      try {
        const timestamp = Date.now();
        const storagePath = `exports/${blockId}/${timestamp}_oneduo.pdf`;
        setPdfProgress(prev => ({ ...prev, progress: 92, status: 'Syncing with cloud...' }));

        const { error: uploadError } = await supabase.storage.from('course-files').upload(storagePath, pdfBlob, {
          contentType: 'application/pdf',
          upsert: true
        });

        if (!uploadError) {
          const { data: courseData } = await supabase.from('courses').select('course_files').eq('id', blockId).single();
          const existingFiles = (courseData?.course_files as any[]) || [];
          const updatedFiles = [
            ...existingFiles.filter((f: any) => f?.type !== 'pdf'),
            {
              type: 'pdf',
              name: `${block.name} - OneDuo.pdf`,
              filename: `${block.name} - OneDuo.pdf`,
              storagePath: storagePath,
              storage_path: `course-files/${storagePath}`,
              size: pdfBlob.size,
              uploaded_at: new Date().toISOString(),
              is_combined: true
            }
          ];

          await supabase.from('courses').update({
            course_files: updatedFiles,
            pdf_revision_pending: false,
            share_enabled: true
          }).eq('id', blockId);

          setCourses(prev => prev.map(c => c.id === blockId ? { ...c, pdf_revision_pending: false } : c));

          // Send email
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const functionsUrl = supabaseUrl?.replace('.supabase.co', '.functions.supabase.co');
          const shareToken = block.courses[0]?.share_token;
          const downloadUrl = `${functionsUrl}/track-download?courseId=${blockId}&source=email${shareToken ? `&token=${shareToken}` : ''}`;

          await supabase.functions.invoke('send-pdf-email', {
            body: {
              email: user?.email,
              courseTitle: block.name,
              downloadUrl,
              courseId: blockId
            }
          });
        }
      } catch (cloudError) {
        console.warn('Background sync failed:', cloudError);
      }

      if (fileLoadFailures.length > 0) {
        toast.warning(`${fileLoadFailures.length} supplemental files failed to embed.`);
      }

    } catch (err: any) {
      console.error('Combined PDF export failed:', err);
      toast.error(err.message || 'Failed to generate combined PDF');
    } finally {
      setGeneratingPDF(null);
      setPdfProgress({ progress: 0, status: '', title: '' });
    }
  };

  // Download the AI Knowledge Layer (.md) for a course or module
  const handleDownloadKnowledgeLayer = async (courseId: string, moduleId?: string, title?: string) => {
    try {
      toast.loading('Preparing Txt File...', { id: 'kl-download' });
      await downloadKnowledgeLayerMarkdown(courseId, moduleId, title ? `${title}_AI_Artifact.md` : undefined);
      toast.success('✓ Txt File downloaded!', { id: 'kl-download' });
    } catch (err: any) {
      toast.error(err.message || 'AI Artifact not ready yet — still generating.', { id: 'kl-download' });
    }
  };

  const handleGenerateKnowledgeLayer = async (courseId: string, moduleId?: string) => {
    const toastId = `kl-gen-${courseId}${moduleId ? `-${moduleId}` : ''}`;
    try {
      toast.loading('Generating Txt File...', { id: toastId });
      const { error } = await supabase.functions.invoke('generate-knowledge-layer', {
        body: { courseId, moduleId },
      });
      if (error) throw error;
      toast.success('✓ Txt File generated! You can now download it.', { id: toastId });
      loadCourses(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate AI Artifact.', { id: toastId });
    }
  };

  const handleRegenerateKnowledgeLayer = async (courseId: string, moduleId?: string, title?: string) => {
    const toastId = `kl-regen-${courseId}${moduleId ? `-${moduleId}` : ''}`;
    try {
      toast.loading('Regenerating Txt File...', { id: toastId });
      // Reset status so the edge function doesn't skip it
      const table = moduleId ? 'course_modules' : 'courses';
      const rowId = moduleId || courseId;
      await supabase.from(table).update({ knowledge_layer_status: 'pending' }).eq('id', rowId);
      const { error } = await supabase.functions.invoke('generate-knowledge-layer', {
        body: { courseId, moduleId },
      });
      if (error) throw error;
      toast.success('✓ Txt File regenerated! Download it now.', { id: toastId });
      loadCourses(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to regenerate Txt File.', { id: toastId });
    }
  };

  const handleUpgradeAllKnowledgeLayer = async () => {
    // Build flat job list — multi-module courses generate per module (transcript on course_modules),
    // single-module courses generate at course level (transcript on courses)
    const jobs: Array<{ courseId: string; moduleId?: string }> = [];

    for (const course of courses) {
      if (course.status !== 'completed') continue;
      if (course.modules && course.modules.length > 0) {
        for (const mod of course.modules) {
          if (mod.status === 'completed' && mod.knowledge_layer_status !== 'complete' && mod.knowledge_layer_status !== 'generating') {
            jobs.push({ courseId: course.id, moduleId: mod.id });
          }
        }
      } else {
        if (course.knowledge_layer_status !== 'complete' && course.knowledge_layer_status !== 'generating') {
          jobs.push({ courseId: course.id });
        }
      }
    }

    if (jobs.length === 0) {
      toast.info('All completed videos already have Txt Files.');
      return;
    }

    toast.loading(`Generating Txt Files for ${jobs.length} video(s)... this may take a few minutes.`, { id: 'kl-upgrade-all' });

    // Fire all jobs in parallel with a 3-minute timeout per job
    // so one slow/stuck video never blocks the rest
    const withTimeout = (job: { courseId: string; moduleId?: string }) =>
      Promise.race([
        supabase.functions.invoke('generate-knowledge-layer', { body: job }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 180_000)
        ),
      ]);

    const results = await Promise.allSettled(jobs.map(withTimeout));
    const done = results.filter(r => r.status === 'fulfilled').length;

    toast.success(`✓ Txt Files generated for ${done}/${jobs.length} videos.`, { id: 'kl-upgrade-all' });
    loadCourses(false);
  };

  const toggleBlock = (blockName: string) => {
    setExpandedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(blockName)) {
        next.delete(blockName);
      } else {
        next.add(blockName);
      }
      return next;
    });
  };

  const toggleCourseSelection = (courseId: string) => {
    setSelectedCourses(prev => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  };

  const toggleSelectAll = (blockItems: DisplayItem[]) => {
    const blockIds = blockItems.map((i) => i.id);
    const allSelected = blockIds.length > 0 && blockIds.every((id) => selectedCourses.has(id));

    setSelectedCourses((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        blockIds.forEach((id) => next.delete(id));
      } else {
        blockIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const resolveSelectedItemKind = (id: string): 'module' | 'course' | null => {
    for (const c of courses) {
      if (c.id === id) return 'course';
      if (c.modules?.some((m) => m.id === id)) return 'module';
    }
    return null;
  };

  const handleBulkDelete = async () => {
    if (selectedCourses.size === 0) return;

    console.log('[Dashboard] handleBulkDelete:', {
      count: selectedCourses.size,
      ids: Array.from(selectedCourses),
      email,
    });

    setIsBulkDeleting(true);
    const toDelete = Array.from(selectedCourses);
    let deleted = 0;
    let failed = 0;

    for (const id of toDelete) {
      const kind = resolveSelectedItemKind(id);
      if (!kind) {
        console.warn('[Dashboard] Bulk delete: could not resolve item type for id:', id);
        failed++;
        continue;
      }

      try {
        const body =
          kind === 'module'
            ? { action: 'delete-module', moduleId: id, email }
            : { action: 'delete-course', courseId: id, email };

        const { data, error } = await supabase.functions.invoke('process-course', { body });

        if (error || data?.error) {
          console.warn('[Dashboard] Bulk delete failed:', { id, kind, error, data });
          failed++;
        } else {
          deleted++;
        }
      } catch (err) {
        console.warn('[Dashboard] Bulk delete exception:', { id, kind, err });
        failed++;
      }
    }

    setSelectedCourses(new Set());
    setIsBulkDeleting(false);
    await loadCourses(false);

    if (failed > 0) {
      toast.error(`Deleted ${deleted}, ${failed} failed`);
    } else {
      toast.success(`Deleted ${deleted}`);
    }
  };

  // AuthGuard handles unauthenticated users - no need for login form here

  return (
    <div className="min-h-screen bg-[#030303] text-white">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] rounded-full bg-gradient-to-b from-cyan-500/10 via-cyan-500/5 to-transparent blur-3xl" />
      </div>

      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Logo size="md" />
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-white/50 hidden sm:block">{email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => apiKeysRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="text-white/60 hover:text-white hover:bg-white/[0.06] gap-1.5"
            >
              <Key className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">API</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-white/60 hover:text-white hover:bg-white/[0.06]">
              Switch Account
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="border-white/[0.1] text-white hover:bg-white/[0.06]"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            {courses.some(c => c.status === 'completed' && c.knowledge_layer_status !== 'complete' && c.knowledge_layer_status !== 'generating') && (
              <Button
                variant="outline"
                onClick={handleUpgradeAllKnowledgeLayer}
                className="gap-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                title="Generate Txt Files for all completed videos that don't have one yet"
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">Generate All Txt Files</span>
                <span className="sm:hidden">Generate All</span>
              </Button>
            )}
            <Button onClick={() => navigate('/upload')} className="gap-2 bg-gradient-to-r from-cyan-500 to-cyan-400 text-black">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Training</span>
            </Button>
          </div>
        </div>

        {/* Just Uploaded Banner - shows once after redirect from Upload */}
        <AnimatePresence>
          {justUploaded && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6 p-4 rounded-xl bg-gradient-to-r from-green-500/10 to-cyan-500/10 border border-green-500/20"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-green-400 font-semibold mb-1">Upload Complete!</h3>
                    <p className="text-white/70 text-sm mb-2">
                      <span className="font-medium text-white">{justUploaded.courseTitle}</span> is now processing.
                    </p>
                    <div className="space-y-1.5">
                      <p className="text-white/50 text-xs flex items-center gap-2">
                        <CheckCircle className="w-3.5 h-3.5 text-green-400/70" />
                        {"It's"} safe to close this tab or navigate away
                      </p>
                      <p className="text-white/50 text-xs flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-cyan-400/70" />
                        {"We'll"} email you when your OneDuo is ready for download
                      </p>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setJustUploaded(null)}
                  className="text-white/40 hover:text-white hover:bg-white/10 flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PDF Generation Progress Overlay - Fixed at top */}
        <AnimatePresence>
          {generatingPDF && (
            <motion.div
              initial={{ opacity: 0, y: -100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -100 }}
              className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-lg p-4 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/40 backdrop-blur-xl shadow-2xl shadow-cyan-500/20"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-cyan-500/30 flex items-center justify-center flex-shrink-0">
                  <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-cyan-300/70 text-xs uppercase tracking-wide">Generating PDF</span>
                    <span className="text-cyan-300 font-bold text-2xl tabular-nums">
                      {Math.round(pdfProgress.progress)}%
                    </span>
                  </div>
                  {pdfProgress.title && (
                    <h3 className="text-white font-semibold truncate text-base mb-2" title={pdfProgress.title}>
                      {pdfProgress.title}
                    </h3>
                  )}
                  <div className="w-full bg-black/40 rounded-full h-3 mb-2 overflow-hidden">
                    <motion.div
                      className="bg-gradient-to-r from-cyan-400 to-cyan-500 h-3 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${pdfProgress.progress}%` }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    />
                  </div>
                  <p className="text-white/70 text-sm truncate">
                    {pdfProgress.status || 'Preparing...'}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Welcome confetti burst */}
        <QuickConfetti isActive={showWelcomeConfetti} onComplete={() => setShowWelcomeConfetti(false)} />

        {isInitialLoading || authLoading || !email ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          </div>
        ) : courses.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16 rounded-2xl bg-white/[0.02] border border-white/[0.08]"
          >
            <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center mx-auto mb-5">
              <Plus className="w-8 h-8 text-cyan-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Start Your First Training</h3>
            <p className="text-white/50 mb-6 text-sm">Upload a video to create your AI-powered OneDuo.</p>
            <Button onClick={() => navigate('/upload')} className="gap-2 bg-gradient-to-r from-cyan-500 to-cyan-400 text-black h-11 px-6">
              <Upload className="w-4 h-4" />
              Upload Course
            </Button>
          </motion.div>
        ) : (
          <>
            {/* Bulk Actions Bar */}
            {selectedCourses.size > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-between"
              >
                <span className="text-sm text-white">
                  <span className="font-semibold text-cyan-400">{selectedCourses.size}</span> training{selectedCourses.size > 1 ? 's' : ''} selected
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedCourses(new Set())}
                    className="text-white/60 hover:text-white"
                  >
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setMoveToFolderOpen(true)}
                    className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 gap-1.5"
                  >
                    <Layers className="w-4 h-4" />
                    Move to Folder
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-1.5"
                        disabled={isBulkDeleting}
                      >
                        {isBulkDeleting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-[#0a0a0a] border-white/10">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Delete {selectedCourses.size} trainings?</AlertDialogTitle>
                        <AlertDialogDescription className="text-white/60">
                          This will permanently delete all selected trainings and their associated data. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-white/10 text-white hover:bg-white/5">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleBulkDelete}
                          className="bg-red-500 hover:bg-red-600 text-white"
                        >
                          Delete All Selected
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </motion.div>
            )}

            {/* Main Layout with Sidebar */}
            <div className="flex gap-6">
              {/* Folder Sidebar - hidden on mobile */}
              <div className="hidden lg:block">
                <FolderSidebar
                  folders={folders}
                  selectedFolderId={selectedFolderId}
                  onSelectFolder={setSelectedFolderId}
                  onCreateFolder={handleCreateFolder}
                  onRenameFolder={handleRenameFolder}
                  onDeleteFolder={handleDeleteFolder}
                  totalCourseCount={totalCourseCount}
                  uncategorizedCount={uncategorizedCount}
                  isLoading={isFoldersLoading}
                />
              </div>

              {/* Main Content */}
              <div className="flex-1 min-w-0">
                {/* Stats Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                    <p className="text-sm text-white/50 mb-1">Training Blocks</p>
                    <p className="text-2xl font-semibold text-white">{trainingBlocks.length}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                    <p className="text-sm text-white/50 mb-1">Total Modules</p>
                    <p className="text-2xl font-semibold text-emerald-400">
                      {trainingBlocks.reduce((sum, b) => sum + b.completedModules, 0)}
                      <span className="text-white/40 text-lg">/{trainingBlocks.reduce((sum, b) => sum + b.totalModules, 0)}</span>
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                    <p className="text-sm text-white/50 mb-1">Processing</p>
                    <p className="text-2xl font-semibold text-cyan-400">
                      {trainingBlocks.reduce((sum, b) => sum + b.processingModules, 0)}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                    <p className="text-sm text-white/50 mb-1">Queued</p>
                    <p className="text-2xl font-semibold text-white/60">
                      {trainingBlocks.reduce((sum, b) => sum + b.queuedModules, 0)}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                    <p className="text-sm text-white/50 mb-1">Needs Attention</p>
                    <p className="text-2xl font-semibold text-red-400">
                      {trainingBlocks.reduce((sum, b) => sum + b.failedModules, 0)}
                    </p>
                  </div>
                </div>

                {/* Training Blocks */}
                <div className="space-y-4">
                  <AnimatePresence>
                    {trainingBlocks.map((block, blockIdx) => {
                      const isExpanded = expandedBlocks.has(block.name);
                      const hasProcessing = block.processingModules > 0;
                      const hasFailed = block.failedModules > 0;
                      const allCompleted = block.completedModules === block.totalModules;

                      return (
                        <motion.div
                          key={block.name}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: blockIdx * 0.05 }}
                          className="rounded-2xl bg-white/[0.02] border border-white/[0.08] overflow-hidden"
                        >
                          {/* Block Header */}
                          <div
                            className={`w-full px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-white/[0.02] transition-colors ${hasProcessing ? 'bg-cyan-500/5' : hasFailed ? 'bg-red-500/5' : ''
                              }`}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {/* Checkbox for bulk selection */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Toggle selection for all courses in this block
                                  const blockCourseIds = block.courses.map(c => c.id);
                                  const allSelected = blockCourseIds.every(id => selectedCourses.has(id));
                                  setSelectedCourses(prev => {
                                    const next = new Set(prev);
                                    if (allSelected) {
                                      blockCourseIds.forEach(id => next.delete(id));
                                    } else {
                                      blockCourseIds.forEach(id => next.add(id));
                                    }
                                    return next;
                                  });
                                }}
                                className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${block.courses.every(c => selectedCourses.has(c.id))
                                  ? 'bg-cyan-500 border-cyan-500'
                                  : block.courses.some(c => selectedCourses.has(c.id))
                                    ? 'bg-cyan-500/50 border-cyan-500'
                                    : 'border-white/20 hover:border-white/40'
                                  }`}
                              >
                                {block.courses.every(c => selectedCourses.has(c.id)) && (
                                  <Check className="w-3 h-3 text-black" />
                                )}
                                {block.courses.some(c => selectedCourses.has(c.id)) && !block.courses.every(c => selectedCourses.has(c.id)) && (
                                  <div className="w-2 h-0.5 bg-black rounded" />
                                )}
                              </button>
                              <button
                                onClick={() => toggleBlock(block.name)}
                                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${allCompleted ? 'bg-emerald-500/20' : hasProcessing ? 'bg-cyan-500/20' : hasFailed ? 'bg-red-500/20' : 'bg-white/10'
                                  }`}
                              >
                                <Layers className={`w-5 h-5 ${allCompleted ? 'text-emerald-400' : hasProcessing ? 'text-cyan-400' : hasFailed ? 'text-red-400' : 'text-white/60'
                                  }`} />
                              </button>
                              <div className="text-left flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  {editingBlockName === block.name ? (
                                    <form
                                      onSubmit={(e) => {
                                        e.preventDefault();
                                        handleSaveBlockName(block.name, editingBlockValue, block.courses.map(c => c.id));
                                      }}
                                      className="flex items-center gap-2 flex-1"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Input
                                        autoFocus
                                        value={editingBlockValue}
                                        onChange={(e) => setEditingBlockValue(e.target.value)}
                                        onBlur={(e) => {
                                          // Only save on blur if not triggered by Enter key (which handles its own save)
                                          // Check if the related target is within the form (e.g., save button) to avoid double-save
                                          const form = e.currentTarget.closest('form');
                                          if (form && !form.contains(e.relatedTarget as Node)) {
                                            handleSaveBlockName(block.name, editingBlockValue, block.courses.map(c => c.id));
                                          } else if (!e.relatedTarget) {
                                            // Clicked outside entirely
                                            handleSaveBlockName(block.name, editingBlockValue, block.courses.map(c => c.id));
                                          }
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Escape') {
                                            e.preventDefault();
                                            setEditingBlockName(null);
                                            setEditingBlockValue('');
                                          } else if (e.key === 'Enter') {
                                            e.preventDefault();
                                            e.currentTarget.blur(); // Blur first to prevent onBlur from running after
                                            handleSaveBlockName(block.name, editingBlockValue, block.courses.map(c => c.id));
                                          }
                                        }}
                                        className="h-8 text-lg font-semibold bg-white/10 border-white/20 text-white max-w-md"
                                        disabled={isSavingBlockName}
                                      />
                                      {isSavingBlockName && <Loader2 className="w-4 h-4 animate-spin text-white/50" />}
                                    </form>
                                  ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingBlockName(block.name);
                                        setEditingBlockValue(block.name);
                                      }}
                                      className="group flex items-center gap-2 hover:bg-white/5 rounded-lg px-2 py-1 -mx-2 transition-colors"
                                      title="Click to rename"
                                    >
                                      <h3 className="font-semibold text-white text-lg truncate">{block.name}</h3>
                                      <Pencil className="w-3.5 h-3.5 text-white/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                    </button>
                                  )}
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide shrink-0 ${block.fpsTarget >= 3
                                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                    : 'bg-white/10 text-white/50 border border-white/10'
                                    }`}>
                                    {block.fpsTarget} FPS
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 mt-0.5">
                                  <span className="text-sm text-white/50">
                                    {block.completedModules}/{block.totalModules} modules ready
                                  </span>
                                  {hasProcessing && (
                                    <span className="flex items-center gap-1 text-xs text-cyan-400">
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      {block.processingModules} processing
                                    </span>
                                  )}
                                  {hasFailed && (
                                    <span className="flex items-center gap-1 text-xs text-red-400">
                                      <AlertTriangle className="w-3 h-3" />
                                      {block.failedModules} failed
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                              {/* Actions - Only show when ALL modules completed */}
                              {block.allCompleted && (
                                <>
                                  {(() => {
                                    const course0 = block.courses[0];
                                    const pdfStatus = course0?.pdf_generation_status;
                                    const pdfProgress = course0?.pdf_generation_progress;
                                    const isGenerating = pdfStatus === 'generating';
                                    const isQueuing = generatingPDF === `vt-${course0?.id}`;
                                    return (
                                      <div className="flex flex-col items-end gap-0.5">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={isQueuing || isGenerating}
                                          className="relative gap-1.5 font-bold border-2 bg-transparent border-red-500 text-red-500 hover:bg-red-500/10"
                                          onClick={() => handleGenerateVisualTranscriptionPDF(course0?.id, block.name || course0?.title || 'Course')}
                                          title="Generate Visual Transcription PDF — every frame with AI analysis, emailed when ready"
                                        >
                                          {isQueuing ? (
                                            <><Loader2 className="w-4 h-4 animate-spin" /><span className="hidden sm:inline">Queuing...</span></>
                                          ) : isGenerating ? (
                                            <><Loader2 className="w-4 h-4 animate-spin" /><span className="hidden sm:inline">Generating...</span></>
                                          ) : (
                                            <>
                                              <Download className="w-4 h-4" />
                                              <span className="hidden sm:inline">{pdfStatus === 'complete' ? 'Re-generate PDF' : 'Generate PDF'}</span>
                                              {course0?.pdf_revision_pending && (
                                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-400 rounded-full animate-pulse" />
                                              )}
                                            </>
                                          )}
                                        </Button>
                                        {isGenerating && pdfProgress && (
                                          <span className="text-xs text-orange-400 font-mono">
                                            {pdfProgress.currentFrame}/{pdfProgress.totalFrames} frames · Part {pdfProgress.currentPart}/{pdfProgress.totalParts}
                                          </span>
                                        )}
                                        {pdfStatus === 'complete' && !isGenerating && (
                                          <span className="text-xs text-green-400">PDF ready · emailed</span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  {/* Txt File — generate or download depending on status */}
                                  {block.courses[0]?.knowledge_layer_status === 'generating' ? (
                                    <Button size="sm" variant="outline" disabled className="gap-1.5 border-emerald-500/30 text-emerald-400">
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      <span className="hidden sm:inline">Generating...</span>
                                    </Button>
                                  ) : block.courses[0]?.knowledge_layer_status === 'complete' ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => { e.stopPropagation(); handleDownloadKnowledgeLayer(block.courses[0].id, undefined, block.name); }}
                                      className="gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                                      title="Download Txt File"
                                    >
                                      <FileText className="w-3.5 h-3.5" />
                                      <span className="hidden sm:inline">Download Txt File</span>
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => { e.stopPropagation(); handleGenerateKnowledgeLayer(block.courses[0].id); }}
                                      className="gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                                      title="Generate Txt File"
                                    >
                                      <Sparkles className="w-3.5 h-3.5" />
                                      <span className="hidden sm:inline">Generate Txt File</span>
                                    </Button>
                                  )}
                                </>
                              )}
                              {isExpanded && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSelectAll(block.displayItems);
                                  }}
                                  className="text-white/50 hover:text-white text-xs"
                                >
                                  {block.displayItems.every((i) => selectedCourses.has(i.id)) ? 'Deselect All' : 'Select All'}
                                </Button>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => e.stopPropagation()}
                                    className="border-white/20 text-white/50 hover:text-white hover:bg-white/10 px-2"
                                  >
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48 bg-[#0f1117] border-white/10 text-white">
                                  {block.allCompleted && (
                                    <>
                                      <DropdownMenuItem
                                        onClick={() => handleCopyAILink(block.courses[0].id)}
                                        disabled={!block.courses[0]?.share_enabled}
                                        className="gap-2 cursor-pointer text-cyan-400 focus:text-cyan-400 focus:bg-cyan-500/10"
                                      >
                                        <Link2 className="w-4 h-4" />
                                        AI Link
                                        {!block.courses[0]?.share_enabled && (
                                          <span className="ml-auto text-[10px] text-white/30">enable sharing</span>
                                        )}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => handleToggleSharing(block.courses[0].id, block.courses[0]?.share_enabled ?? false)}
                                        disabled={togglingShare === block.courses[0].id}
                                        className={`gap-2 cursor-pointer ${block.courses[0]?.share_enabled ? 'text-green-400 focus:text-green-400 focus:bg-green-500/10' : 'text-white/50 focus:text-white focus:bg-white/10'}`}
                                      >
                                        {togglingShare === block.courses[0].id ? (
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : block.courses[0]?.share_enabled ? (
                                          <Globe className="w-4 h-4" />
                                        ) : (
                                          <Lock className="w-4 h-4" />
                                        )}
                                        {block.courses[0]?.share_enabled ? 'Public' : 'Private'}
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator className="bg-white/10" />
                                    </>
                                  )}
                                  <DropdownMenuItem
                                    onClick={() => setAddFilesDialog({
                                      open: true,
                                      courseId: block.courses[0].id,
                                      courseTitle: block.name,
                                      existingFiles: block.courseFiles || []
                                    })}
                                    className="gap-2 cursor-pointer text-cyan-400 focus:text-cyan-400 focus:bg-cyan-500/10"
                                  >
                                    <Paperclip className="w-4 h-4" />
                                    Add Files
                                  </DropdownMenuItem>
                                  {block.allCompleted && block.courses[0]?.knowledge_layer_status === 'complete' && (
                                    <>
                                      <DropdownMenuSeparator className="bg-white/10" />
                                      <DropdownMenuItem
                                        onClick={() => handleRegenerateKnowledgeLayer(block.courses[0].id, undefined, block.name)}
                                        className="gap-2 cursor-pointer text-white/50 focus:text-white focus:bg-white/10"
                                      >
                                        <RefreshCw className="w-4 h-4" />
                                        Regenerate Txt
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <button onClick={() => toggleBlock(block.name)}>
                                {isExpanded ? (
                                  <ChevronDown className="w-5 h-5 text-white/40" />
                                ) : (
                                  <ChevronRight className="w-5 h-5 text-white/40" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Expanded Modules */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="border-t border-white/[0.06] divide-y divide-white/[0.06]">
                                  {block.displayItems.map((item) => {
                                    // Check if item is stalled
                                    const itemIsStalled = isItemStalled(item);
                                    // Use stalled status config if stalled, otherwise normal
                                    const effectiveStatus = itemIsStalled ? 'stalled' : item.status;
                                    const config = statusConfig[effectiveStatus] || statusConfig.queued;
                                    const StatusIcon = config.icon;
                                    const isProcessing = !['completed', 'failed', 'queued', 'pending'].includes(item.status) && !itemIsStalled;
                                    const isQueued = item.status === 'queued' || item.status === 'pending';
                                    const isRetrying = retryingCourses.has(item.id);
                                    const errorAnalysis = (item.status === 'failed' || item.status === 'manual_review')
                                      ? analyzeError(item.error_message, undefined, item.status)
                                      : null;
                                    const isManualReview = item.status === 'manual_review';
                                    // Find the parent course for actions that need it
                                    const parentCourse = block.courses.find(c => c.id === item.parentCourseId);

                                    return (
                                      <div key={item.id} className="px-6 py-4 group hover:bg-white/[0.01]">
                                        <div className="flex items-start gap-4">
                                          {/* Checkbox for bulk selection */}
                                          <button
                                            onClick={() => toggleCourseSelection(item.id)}
                                            className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${selectedCourses.has(item.id)
                                              ? 'bg-cyan-500 border-cyan-500'
                                              : 'border-white/20 hover:border-white/40'
                                              }`}
                                          >
                                            {selectedCourses.has(item.id) && (
                                              <CheckCircle className="w-3 h-3 text-black" />
                                            )}
                                          </button>

                                          {/* Module Number Badge */}
                                          <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${config.bgColor} ${config.color}`}>
                                            {item.moduleNumber}
                                          </div>

                                          {/* Module Content */}
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                {/* Module title */}
                                                <span className="font-medium text-white">{item.title}</span>
                                                <StatusIcon className={`w-4 h-4 ${config.color} ${isProcessing ? 'animate-spin' : ''}`} />
                                                <span className={`text-xs ${config.color}`}>{config.label}</span>
                                                {item.video_duration_seconds && (
                                                  <span className="text-xs text-white/40">• {formatDuration(item.video_duration_seconds)}</span>
                                                )}
                                                {item.status === 'completed' && (
                                                  <DownloadCountBadge courseId={item.parentCourseId} />
                                                )}
                                              </div>
                                              <div className="flex items-center gap-2">
                                                {/* Re-extract Frames Button */}
                                                <button
                                                  className="p-1.5 rounded-lg hover:bg-purple-500/20 text-white/30 hover:text-purple-400 transition-colors"
                                                  title="Re-extract frames from video"
                                                  disabled={reExtractingCourse === (item.isModule ? item.parentCourseId : item.id)}
                                                  onClick={() => handleReExtractFrames(item.isModule ? item.parentCourseId : item.id)}
                                                >
                                                  {reExtractingCourse === (item.isModule ? item.parentCourseId : item.id) ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                  ) : (
                                                    <RefreshCw className="w-4 h-4" />
                                                  )}
                                                </button>
                                                {/* Delete Button - Always visible with subtle styling */}
                                                <AlertDialog>
                                                  <AlertDialogTrigger asChild>
                                                    <button
                                                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-colors"
                                                      disabled={deletingCourse === item.id}
                                                      onClick={(e) => {
                                                        console.log('[Dashboard] Delete button clicked for:', item.id, item.title);
                                                      }}
                                                    >
                                                      {deletingCourse === item.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                      ) : (
                                                        <X className="w-4 h-4" />
                                                      )}
                                                    </button>
                                                  </AlertDialogTrigger>
                                                  <AlertDialogContent className="bg-[#0a0a0a] border-white/10">
                                                    <AlertDialogHeader>
                                                      <AlertDialogTitle className="text-white">Delete {item.title}?</AlertDialogTitle>
                                                      <AlertDialogDescription className="text-white/60">
                                                        This will permanently delete this module and all associated data. This action cannot be undone.
                                                      </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                      <AlertDialogCancel className="border-white/10 text-white hover:bg-white/5">Cancel</AlertDialogCancel>
                                                      <AlertDialogAction
                                                        onClick={() => {
                                                          console.log('[Dashboard] Delete confirmed for:', item.id, 'isModule:', item.isModule);
                                                          return item.isModule ? handleDeleteModule(item.id) : handleDeleteCourse(item.id);
                                                        }}
                                                        className="bg-red-500 hover:bg-red-600 text-white"
                                                      >
                                                        Delete
                                                      </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                  </AlertDialogContent>
                                                </AlertDialog>
                                              </div>
                                            </div>

                                            <p className="text-xs text-white/40 mb-2">Added {formatDate(item.created_at)}</p>

                                            {/* Queued State - Enhanced with real progress */}
                                            {isQueued && (
                                              <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
                                                <div className="flex items-center justify-between gap-3 mb-2">
                                                  <div className="flex items-center gap-2">
                                                    <motion.div
                                                      className="w-2.5 h-2.5 rounded-full bg-cyan-400"
                                                      animate={{
                                                        scale: [1, 1.3, 1],
                                                        opacity: [0.6, 1, 0.6]
                                                      }}
                                                      transition={{
                                                        duration: 1.2,
                                                        repeat: Infinity,
                                                        ease: 'easeInOut'
                                                      }}
                                                    />
                                                    <span className="text-sm text-cyan-400 font-medium">Processing...</span>
                                                  </div>
                                                  <motion.span
                                                    className="text-xs text-cyan-400/80 font-medium px-2 py-0.5 rounded-full bg-cyan-500/10"
                                                    animate={{ opacity: [0.7, 1, 0.7] }}
                                                    transition={{ duration: 2, repeat: Infinity }}
                                                  >
                                                    Live
                                                  </motion.span>
                                                </div>

                                                {/* Progress percentage and ETA */}
                                                <div className="flex items-baseline justify-between mb-2">
                                                  <span className="text-2xl font-bold text-white tabular-nums">
                                                    {(displayProgress[item.id] ?? item.progress).toFixed(1)}%
                                                  </span>
                                                  <span className="text-xs text-white/40">
                                                    {getEstimatedTime(item) || (item.video_duration_seconds ? `~${Math.ceil(item.video_duration_seconds / 60 * 2)} min remaining` : '~2-5 min remaining')}
                                                  </span>
                                                </div>

                                                {/* Real progress bar */}
                                                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                                                  <motion.div
                                                    className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${Math.max(3, displayProgress[item.id] ?? item.progress)}%` }}
                                                    transition={{ duration: 0.5, ease: 'easeOut' }}
                                                  />
                                                </div>

                                                <p className="text-xs text-white/40 mt-2">Safe to close this page • We'll email you when ready</p>
                                              </div>
                                            )}

                                            {/* Processing Progress - Enhanced UI */}
                                            {isProcessing && parentCourse && (
                                              <ProcessingProgressCard
                                                title={item.title}
                                                progressStep={item.progress_step}
                                                displayProgress={displayProgress[item.id] ?? item.progress}
                                                estimatedTimeRemaining={getEstimatedTimeRemaining({
                                                  ...parentCourse,
                                                  video_duration_seconds: item.video_duration_seconds,
                                                  progress: displayProgress[item.id] ?? item.progress,
                                                })}
                                                videoDurationSeconds={item.video_duration_seconds}
                                                fpsTarget={parentCourse?.fps_target || 1}
                                                syncStatus={getSyncStatus({
                                                  ...parentCourse,
                                                  last_heartbeat_at: item.heartbeat_at,
                                                  status: item.status,
                                                })}
                                                isDelayed={Date.now() - new Date(item.created_at).getTime() > 60000 && (displayProgress[item.id] ?? item.progress) < 5}
                                                onTeamEmailSubmit={(teamEmail) => handleTeamEmailSubmit(item.parentCourseId, teamEmail)}
                                              />
                                            )}

                                            {/* Stalled State - module stuck without progress */}
                                            {itemIsStalled && item.status !== 'failed' && (
                                              <div className="mb-3 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
                                                <div className="flex items-start gap-2">
                                                  <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                                                  <div className="flex-1">
                                                    <p className="text-sm text-white/80">Processing appears to be stalled</p>
                                                    <p className="text-xs text-white/50 mt-1">
                                                      No activity for 5+ minutes. Try repairing or download partial data if available.
                                                    </p>
                                                  </div>
                                                  <div className="flex gap-2">
                                                    {/* Download PDF Button - Available for ALL modules with data */}
                                                    {(item.status === 'completed' || (itemIsStalled && item.isModule)) && (
                                                      <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className={`shrink-0 ${item.status === 'completed'
                                                          ? 'border-white/20 text-white hover:bg-white/10'
                                                          : 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10'}`}
                                                        onClick={() => handleExportModulePDF(item.id, item.title, block.name, item.status !== 'completed', true)}
                                                        disabled={generatingPDF === item.id}
                                                        title={item.status === 'completed' ? "Download PDF Manual" : "Salvage Partial PDF"}
                                                      >
                                                        {generatingPDF === item.id ? (
                                                          <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                          <><Download className="w-4 h-4 mr-1" /> {item.status === 'completed' ? 'PDF' : 'Salvage'}</>
                                                        )}
                                                      </Button>
                                                    )}
                                                    {/* Kickstart Button - manual trigger for stuck processing */}
                                                    <Button
                                                      size="sm"
                                                      variant="outline"
                                                      className="shrink-0 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                                                      onClick={() => handleKickstart(item.parentCourseId)}
                                                      disabled={kickstartingCourses.has(item.parentCourseId) || isRetrying}
                                                    >
                                                      {kickstartingCourses.has(item.parentCourseId) ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                      ) : (
                                                        <><Zap className="w-4 h-4 mr-1" /> Kickstart</>
                                                      )}
                                                    </Button>
                                                    {/* Repair Button */}
                                                    <Button
                                                      size="sm"
                                                      variant="outline"
                                                      className="shrink-0 border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                                                      onClick={() => handleRepairModule(item.id)}
                                                      disabled={isRetrying}
                                                    >
                                                      {isRetrying ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                      ) : (
                                                        <><RefreshCw className="w-4 h-4 mr-1" /> Repair</>
                                                      )}
                                                    </Button>
                                                  </div>
                                                </div>
                                              </div>
                                            )}

                                            {/* Manual Review State - Friendly "Special Attention" UI */}
                                            {isManualReview && (
                                              <ManualProcessingCard title={item.title} className="mb-3" />
                                            )}

                                            {/* Failed State (only for actual failures, not manual_review) */}
                                            {item.status === 'failed' && !isManualReview && errorAnalysis && (
                                              <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                                                <div className="flex items-start gap-2">
                                                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                                  <div className="flex-1">
                                                    <p className="text-sm text-white/80">{errorAnalysis.userMessage}</p>
                                                    <p className="text-xs text-white/50 mt-1">
                                                      {errorAnalysis.canAutoFix
                                                        ? `✨ ${errorAnalysis.fixStrategy}`
                                                        : errorAnalysis.fixStrategy
                                                      }
                                                    </p>
                                                    {/* Show recovery hint if parent course has recoverable data */}
                                                    {parentCourse && hasRecoverableData(parentCourse) && (
                                                      <p className="text-xs text-emerald-400 mt-1">
                                                        ✓ Data recovered - click Resume to continue
                                                      </p>
                                                    )}
                                                  </div>
                                                  <div className="flex gap-2 flex-wrap">
                                                    {/* Salvage Button for Failed Items */}
                                                    {item.isModule && (
                                                      <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="shrink-0 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                                                        onClick={() => handleExportModulePDF(item.id, item.title, block.name, true)}
                                                        disabled={generatingPDF === item.id}
                                                      >
                                                        {generatingPDF === item.id ? (
                                                          <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                          <><Download className="w-4 h-4 mr-1" /> Salvage</>
                                                        )}
                                                      </Button>
                                                    )}
                                                    {/* Resume Button - for courses with recoverable data (race condition fix) */}
                                                    {parentCourse && hasRecoverableData(parentCourse) && (
                                                      <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="shrink-0 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                                                        onClick={() => handleResumeFailed(item.parentCourseId)}
                                                        disabled={isRetrying}
                                                      >
                                                        {isRetrying ? (
                                                          <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                          <><ArrowRight className="w-4 h-4 mr-1" /> Resume</>
                                                        )}
                                                      </Button>
                                                    )}
                                                    <Button
                                                      size="sm"
                                                      variant="outline"
                                                      className={`shrink-0 ${errorAnalysis.canAutoFix ? 'border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10' : 'border-white/[0.1] text-white hover:bg-white/[0.06]'}`}
                                                      onClick={() => item.isModule ? handleRetryModule(item.id, errorAnalysis) : handleRetry(item.id, errorAnalysis)}
                                                      disabled={isRetrying}
                                                    >
                                                      {isRetrying ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                      ) : errorAnalysis.canAutoFix ? (
                                                        <><Zap className="w-4 h-4 mr-1" /> Smart Fix</>
                                                      ) : (
                                                        <><RefreshCw className="w-4 h-4 mr-1" /> Retry</>
                                                      )}
                                                    </Button>
                                                    {/* Generate without frames - for courses with transcript but failed frame extraction */}
                                                    {parentCourse && hasTranscriptOnly(parentCourse) && !item.isModule && (
                                                      <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="shrink-0 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                                                        onClick={() => handleExportPDF(parentCourse, item.moduleNumber, true)}
                                                        disabled={generatingPDF === item.id}
                                                        title="Generate PDF using transcript only (no visual frames)"
                                                      >
                                                        {generatingPDF === item.id ? (
                                                          <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                          <><FileText className="w-4 h-4 mr-1" /> Transcript Only</>
                                                        )}
                                                      </Button>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            )}

                                            {/* Completed Actions - Always show minimal UI, download is at block header */}
                                            {item.status === 'completed' && parentCourse && (
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-xs text-emerald-400 flex items-center gap-1">
                                                  <CheckCircle className="w-3.5 h-3.5" />
                                                  Ready
                                                </span>
                                                {item.video_duration_seconds && (
                                                  <span className="text-xs text-white/30">• {formatDuration(item.video_duration_seconds)}</span>
                                                )}
                                                {/* AI Artifact — per-module generate or download */}
                                                {item.isModule && (
                                                  item.knowledge_layer_status === 'generating' ? (
                                                    <Button size="sm" variant="ghost" disabled className="h-6 px-2 text-xs text-emerald-400/70 gap-1">
                                                      <Loader2 className="w-3 h-3 animate-spin" />
                                                      Generating...
                                                    </Button>
                                                  ) : item.knowledge_layer_status === 'complete' ? (
                                                    <>
                                                      <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-6 px-2 text-xs text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-500/10 gap-1"
                                                        onClick={() => handleDownloadKnowledgeLayer(item.parentCourseId, item.id, item.title)}
                                                        title="Download Txt File"
                                                      >
                                                        <FileText className="w-3 h-3" />
                                                        Download Txt File
                                                      </Button>
                                                      <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-6 px-2 text-xs text-emerald-400/40 hover:text-emerald-400 hover:bg-emerald-500/10 gap-1"
                                                        onClick={() => handleRegenerateKnowledgeLayer(item.parentCourseId, item.id, item.title)}
                                                        title="Regenerate Txt File"
                                                      >
                                                        <RefreshCw className="w-3 h-3" />
                                                        Regenerate
                                                      </Button>
                                                    </>
                                                  ) : (
                                                    <Button
                                                      size="sm"
                                                      variant="ghost"
                                                      className="h-6 px-2 text-xs text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-500/10 gap-1"
                                                      onClick={() => handleGenerateKnowledgeLayer(item.parentCourseId, item.id)}
                                                      title="Generate Txt File"
                                                    >
                                                      <Sparkles className="w-3 h-3" />
                                                      Generate Txt File
                                                    </Button>
                                                  )
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {/* Course Files Section */}
                                  {block.courseFiles.length > 0 && (
                                    <div className="px-6 py-4 bg-amber-500/5 border-t border-amber-500/10">
                                      <div className="flex items-center gap-2 mb-3">
                                        <Paperclip className="w-4 h-4 text-amber-400" />
                                        <span className="text-sm font-medium text-amber-400">Course Materials</span>
                                        <span className="text-xs text-white/40">({block.courseFiles.length} files)</span>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        {block.courseFiles.map((file, idx) => (
                                          <button
                                            key={idx}
                                            onClick={() => handleDownloadCourseFile(file)}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors group"
                                          >
                                            <FileText className="w-3.5 h-3.5 text-amber-400" />
                                            <span className="text-sm text-white/80 group-hover:text-white">{file.name}</span>
                                            <span className="text-xs text-white/40">{formatFileSize(file.size)}</span>
                                            <Download className="w-3 h-3 text-amber-400/60 group-hover:text-amber-400" />
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>


                {/* API Keys Section */}
                <div className="mt-12" ref={apiKeysRef}>
                  <ApiKeyManager />
                </div>
              </div>
            </div>

            {/* Move to Folder Dialog */}
            <MoveToFolderDialog
              open={moveToFolderOpen}
              onOpenChange={setMoveToFolderOpen}
              folders={folders.map(f => ({ id: f.id, name: f.name }))}
              selectedCount={selectedCourses.size}
              onMove={handleMoveToFolder}
              onCreateAndMove={handleCreateAndMoveToFolder}
            />
          </>
        )}
      </div>

      {/* AI Support Chat Widget */}
      {email && <SupportChatWidget userEmail={email} />}


      {/* Add Files Dialog */}
      {addFilesDialog && (
        <AddFilesDialog
          open={addFilesDialog.open}
          onOpenChange={(open) => {
            if (!open) setAddFilesDialog(null);
          }}
          courseId={addFilesDialog.courseId}
          courseTitle={addFilesDialog.courseTitle}
          existingFiles={addFilesDialog.existingFiles}
          onFilesAdded={() => loadCourses(false)}
        />
      )}
    </div>
  );
}
