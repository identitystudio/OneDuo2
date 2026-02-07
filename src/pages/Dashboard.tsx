import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { analyzeError, type ErrorAnalysis } from '@/lib/errorAnalyzer';
import { ManualProcessingCard } from '@/components/ManualProcessingCard';
import {
  Plus, RefreshCw,
  CheckCircle, Clock, Loader2, Sparkles, Check,
  AlertTriangle, Zap, ArrowRight, Link2, FileText, ChevronDown, ChevronRight, Download, X, Layers, Mail, Upload, Globe, Lock, Paperclip, Pencil, Key
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/components/AuthGuard';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
        c.modules?.some(m => !['completed', 'failed'].includes(m.status))
      );

      // Fast poll (2s) when processing, slow poll (10s) when idle
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

          // Calculate a reasonable target based on step - allow more headroom for visible increments
          let targetMax = 99;
          if (isQueued) targetMax = 12; // Allow more room for queued items
          else if (actualProgress < 40) targetMax = Math.min(actualProgress + 4, 42);
          else if (actualProgress < 60) targetMax = Math.min(actualProgress + 3, 63);
          else if (actualProgress < 80) targetMax = Math.min(actualProgress + 2, 82);
          else targetMax = Math.min(actualProgress + 1, 99);

          if (current < targetMax) {
            // Minimum 0.1 increment ensures visible decimal changes (8.0 -> 8.1 -> 8.2)
            const distanceToTarget = targetMax - current;
            const microIncrement = Math.min(0.4, distanceToTarget * 0.08);
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

      // Self-recovery: if we see a course in an intermediate status but its queue is missing,
      // trigger the backend watchdog to repair it (throttled).
      const hasPotentialStuck = newCourses.some((c: Course) => {
        const s = String(c.status || '');
        return s.includes('extracting_frames') || s.includes('analyzing_audio') || s.includes('training_ai');
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
      const { error } = await supabase
        .from('courses')
        .update({ team_notification_email: teamEmail })
        .eq('id', courseId);

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
    // If no heartbeat yet and status is queued/transcribing, it's starting up
    if (!lastActivity) {
      const isJustStarting = ['queued', 'transcribing'].includes(course.status);
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

  // Count stalled courses for Nedu
  const stalledCourseCount = courses.filter(c => {
    if (['completed', 'failed'].includes(c.status)) return false;
    return isActivityStale(c.last_heartbeat_at);
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

  // Export PDF for a single-module course (with salvage fallback for failed/stalled courses)
  const handleExportPDF = async (course: Course, moduleNumber: number) => {
    setGeneratingPDF(course.id);
    setPdfProgress({ progress: 0, status: 'Starting...', title: course.title });

    // Use setTimeout to prevent UI blocking
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      let courseData: any = null;
      let usedSalvagePath = false;

      // First try the standard public course path (works for completed courses)
      try {
        const { data: response, error } = await supabase.functions.invoke('get-public-course', {
          body: { courseId: course.id },
        });

        if (!error && response?.course) {
          courseData = response.course;
        }
      } catch (e) {
        console.log('[handleExportPDF] Public path failed, will try salvage path');
      }

      // If standard path failed or returned no data, AND user is logged in, try salvage path
      if ((!courseData || (!courseData.transcript?.length && !courseData.frame_urls?.length)) && email) {
        console.log(`[handleExportPDF] Trying salvage path for course ${course.id}`);
        setPdfProgress(prev => ({ ...prev, progress: 5, status: 'Recovering data...' }));

        const { data: salvageResponse, error: salvageError } = await supabase.functions.invoke('process-course', {
          body: {
            action: 'get-export-data',
            courseId: course.id,
            email,
          },
        });

        if (salvageError) {
          console.error('[handleExportPDF] Salvage path also failed:', salvageError);
          throw new Error('Could not retrieve course data');
        }

        if (salvageResponse?.error) {
          throw new Error(salvageResponse.error);
        }

        // Check if salvage returned usable data
        if (!salvageResponse?.hasTranscript && !salvageResponse?.hasFrames) {
          toast.error('No data available yet. Processing may still be in progress.');
          return;
        }

        courseData = salvageResponse.course;
        usedSalvagePath = true;

        if (salvageResponse.isPartial) {
          toast.info('Generating PDF with partial data. Some content may be missing.');
        }
      }

      if (!courseData) {
        throw new Error('Course not found');
      }

      // Check if we actually have data to generate PDF
      if (!courseData.transcript?.length && !courseData.frame_urls?.length) {
        toast.error('Module data not ready yet. Please wait for processing to complete.');
        return;
      }

      // ========== LOAD SUPPLEMENTAL FILES ==========
      let loadedSupplementalFiles: { name: string; content: string; size?: number }[] = [];
      const courseFiles = (courseData.course_files || []).filter((file: any) => {
        const fileName = file.name.toLowerCase();
        const binaryExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.zip', '.rar', '.7z', '.exe', '.dll', '.bin'];
        return !binaryExts.some(ext => fileName.endsWith(ext));
      });

      if (courseFiles.length > 0) {
        setPdfProgress(prev => ({ ...prev, progress: 10, status: `Loading ${courseFiles.length} supplemental file(s)...` }));
        const loadedResults = await loadFilesInParallel(courseFiles, (prog) => {
          setPdfProgress(prev => ({ ...prev, progress: 10 + (prog.loaded / prog.total) * 15, status: `Loading ${prog.currentFile}...` }));
        });
        loadedSupplementalFiles = loadedResults.map(r => ({ name: r.name, content: r.content, size: r.size }));
      }

      // Wrap PDF generation in a try-catch to prevent UI crashes
      let pdfBlob: Blob;
      try {
        pdfBlob = await generateChatGPTPDF(
          {
            id: course.id, // Required for frame persistence
            title: courseData.title,
            video_duration_seconds: courseData.video_duration_seconds,
            transcript: courseData.transcript,
            frame_urls: courseData.frame_urls,
            audio_events: courseData.audio_events,
            prosody_annotations: courseData.prosody_annotations,
            supplementalFiles: loadedSupplementalFiles
          },
          (progress, status) => {
            setPdfProgress(prev => ({ ...prev, progress: 25 + (progress / 100) * 75, status }));
          }
        );
      } catch (pdfError) {
        console.error('PDF generation failed:', pdfError);
        throw new Error('PDF generation failed. Please try again.');
      }

      // Trigger download safely
      try {
        // Create clean filename: use original video filename (without extension) + " - OneDuo.pdf"
        const getCleanFilename = (course: any): string => {
          // Try to use original video filename first
          if (course.video_filename) {
            // Remove extension (.mov, .mp4, etc.)
            const nameWithoutExt = course.video_filename.replace(/\.[^.]+$/, '');
            return `${nameWithoutExt} - OneDuo.pdf`;
          }
          // Fallback to course title
          return `${course.title} - OneDuo.pdf`;
        };

        const filename = getCleanFilename(courseData);
        downloadPDF(pdfBlob, filename);

        const successMessage = usedSalvagePath
          ? '✓ PDF downloaded from salvaged data! Upload it to ChatGPT.'
          : '✓ PDF downloaded successfully! Upload it to ChatGPT to enable visual analysis.';
        toast.success(successMessage);
      } catch (downloadError) {
        console.error('Download failed:', downloadError);
        throw new Error('Download failed. Please try again.');
      }
    } catch (err) {
      console.error('PDF export failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate PDF';
      toast.error(errorMessage);
    } finally {
      setGeneratingPDF(null);
      setPdfProgress({ progress: 0, status: '', title: '' });
    }
  };

  // Export PDF for a specific module in a multi-module course
  const handleExportModulePDF = async (moduleId: string, moduleTitle: string, courseTitle: string, isPartialSalvage: boolean = false) => {
    setGeneratingPDF(moduleId);
    setPdfProgress({ progress: 0, status: 'Starting...', title: `${courseTitle} - ${moduleTitle}` });

    // Use setTimeout to prevent UI blocking
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      let moduleData: any;

      if (isPartialSalvage) {
        // SALVAGE PATH: Use get-export-data endpoint which works for partial/failed courses
        // First find the module's parent course and module number
        const moduleItem = courses
          .flatMap(c => c.modules || [])
          .find(m => m.id === moduleId);

        if (!moduleItem) {
          throw new Error('Module not found');
        }

        // Find the parent course to get the course ID
        const parentCourse = courses.find(c => c.id === moduleItem.course_id);

        if (!parentCourse) {
          throw new Error('Parent course not found');
        }

        const { data: response, error } = await supabase.functions.invoke('process-course', {
          body: {
            action: 'get-export-data',
            courseId: parentCourse.id,
            email,
            moduleNumber: moduleItem.module_number
          },
        });

        if (error) throw error;
        if (response?.error) throw new Error(response.error);

        // Check if any data exists at all
        if (!response?.hasTranscript && !response?.hasFrames) {
          toast.error('No data available yet. Processing may still be in progress.');
          return;
        }

        moduleData = response.module || {};
        moduleData.isPartial = response.isPartial;
      } else {
        // Standard path: Use get-module-data
        const { data: response, error } = await supabase.functions.invoke('get-module-data', {
          body: { moduleId },
        });

        if (error) throw error;
        if (response?.error) throw new Error(response.error);
        if (!response?.module) throw new Error('Module not found');

        moduleData = response.module;
      }

      // Check if we actually have data to generate PDF
      if (!moduleData.transcript?.length && !moduleData.frame_urls?.length) {
        toast.error('Module data not ready yet. Please wait for processing to complete.');
        return;
      }

      // Show warning for partial data
      if (moduleData.isPartial || isPartialSalvage) {
        toast.info('Generating PDF with partial data. Some content may be missing.');
      }

      const fullTitle = `${courseTitle} - ${moduleTitle}`;

      // ========== LOAD SUPPLEMENTAL FILES ==========
      // Note: Supplemental files are typically linked at the COURSE level.
      // We fetch the course files for the parent course if it's a module.
      let loadedSupplementalFiles: { name: string; content: string; size?: number }[] = [];
      const parentCourse = courses.find(c => c.id === (moduleData.course_id || moduleId));
      const courseFiles = (parentCourse?.course_files || moduleData.course_files || []).filter((file: any) => {
        const fileName = file.name.toLowerCase();
        const binaryExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.zip', '.rar', '.7z', '.exe', '.dll', '.bin'];
        return !binaryExts.some(ext => fileName.endsWith(ext));
      });

      if (courseFiles.length > 0) {
        setPdfProgress(prev => ({ ...prev, progress: 10, status: `Loading ${courseFiles.length} supplemental file(s)...` }));
        const loadedResults = await loadFilesInParallel(courseFiles, (prog) => {
          setPdfProgress(prev => ({ ...prev, progress: 10 + (prog.loaded / prog.total) * 15, status: `Loading ${prog.currentFile}...` }));
        });
        loadedSupplementalFiles = loadedResults.map(r => ({ name: r.name, content: r.content, size: r.size }));
      }

      // Wrap PDF generation in a try-catch to prevent UI crashes
      let pdfBlob: Blob;
      try {
        pdfBlob = await generateChatGPTPDF(
          {
            id: moduleId, // Required for frame persistence
            title: fullTitle,
            video_duration_seconds: moduleData.video_duration_seconds,
            transcript: moduleData.transcript || [],
            frame_urls: moduleData.frame_urls || [],
            audio_events: moduleData.audio_events,
            prosody_annotations: moduleData.prosody_annotations,
            supplementalFiles: loadedSupplementalFiles
          },
          (progress, status) => {
            setPdfProgress(prev => ({ ...prev, progress: 25 + (progress / 100) * 75, status }));
          }
        );
      } catch (pdfError) {
        console.error('PDF generation failed:', pdfError);
        throw new Error('PDF generation failed. Please try again.');
      }

      // Trigger download safely
      try {
        // Create clean filename: use original video filename (without extension) + " - OneDuo.pdf"
        const getModuleCleanFilename = (moduleData: any, courseTitle: string, moduleTitle: string): string => {
          // For multi-module courses, use "CourseTitle - ModuleTitle - OneDuo.pdf"
          // For single module, just use course title
          if (moduleData.video_filename) {
            const nameWithoutExt = moduleData.video_filename.replace(/\.[^.]+$/, '');
            return `${nameWithoutExt} - OneDuo.pdf`;
          }
          // Fallback to course + module title
          const combinedTitle = moduleTitle ? `${courseTitle} - ${moduleTitle}` : courseTitle;
          return `${combinedTitle} - OneDuo.pdf`;
        };

        const filename = getModuleCleanFilename(moduleData, courseTitle, moduleTitle);
        downloadPDF(pdfBlob, filename);

        toast.success(moduleData.isPartial
          ? '✓ Partial PDF downloaded! Some frames or transcript may be missing.'
          : '✓ PDF downloaded successfully! Upload it to ChatGPT to enable visual analysis.'
        );
      } catch (downloadError) {
        console.error('Download failed:', downloadError);
        throw new Error('Download failed. Please try again.');
      }
    } catch (err: any) {
      console.error('PDF export failed:', err);
      toast.error(err.message || 'Failed to generate PDF');
    } finally {
      setGeneratingPDF(null);
      setPdfProgress({ progress: 0, status: '', title: '' });
    }
  };

  // Export combined PDF for all modules in a training block (unified OneDuo)
  const handleExportCombinedPDF = async (block: TrainingBlock) => {
    const blockId = block.courses[0]?.id;
    if (!blockId) return;

    // Get the block title from the block name
    const blockTitle = block.name || 'Combined Training';

    setGeneratingPDF(`block-${blockId}`);
    setPdfProgress({ progress: 0, status: 'Starting combined PDF generation...', title: blockTitle });

    // Use setTimeout to prevent UI blocking
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      // Sort display items by module number
      const sortedItems = [...block.displayItems].sort((a, b) => a.moduleNumber - b.moduleNumber);

      // Collect modules data for merged PDF generation
      const modules: PdfModuleData[] = [];

      const totalModules = sortedItems.length;

      // Detect single-module course (data is on courses table, not course_modules)
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
          // Single-module course: fetch from get-public-course (data is on courses table)
          const { data: response, error } = await supabase.functions.invoke('get-public-course', {
            body: { courseId: item.id },
          });

          if (error) {
            console.error(`Failed to fetch course ${item.id}:`, error);
            continue;
          }

          // Map course data to module data format
          const courseData = response?.course;
          if (courseData) {
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
          // Multi-module course: fetch from get-module-data
          const { data: response, error } = await supabase.functions.invoke('get-module-data', {
            body: { moduleId: item.id },
          });

          if (error) {
            console.error(`Failed to fetch module ${item.id}:`, error);
            continue;
          }

          moduleData = response?.module;
          if (moduleData) {
            // Ensure moduleNumber is set
            moduleData.moduleNumber = moduleData.moduleNumber || item.moduleNumber;
          }
        }

        if (!moduleData) continue;

        // Add to modules array for merged PDF
        modules.push({
          id: moduleData.id,
          moduleNumber: moduleData.moduleNumber || (i + 1),
          title: moduleData.title || `Module ${i + 1}`,
          video_duration_seconds: moduleData.video_duration_seconds,
          transcript: moduleData.transcript,
          frame_urls: moduleData.frame_urls,
          audio_events: moduleData.audio_events,
          prosody_annotations: moduleData.prosody_annotations,
          key_moments_index: moduleData.key_moments_index,
          concepts_frameworks: moduleData.concepts_frameworks,
          hidden_patterns: moduleData.hidden_patterns,
          implementation_steps: moduleData.implementation_steps,
        });
      }

      // Check if we have any data
      const hasFrames = modules.some(m => m.frame_urls && m.frame_urls.length > 0);
      const hasTranscripts = modules.some(m => m.transcript && m.transcript.length > 0);
      if (!hasFrames && !hasTranscripts) {
        toast.error('No data available. Please wait for processing to complete.');
        return;
      }

      // ========== FETCH SUPPLEMENTAL FILE CONTENTS (PARALLEL) ==========
      // This embeds user-uploaded documents (templates, scripts, guides) into the PDF
      // Using parallel loading with concurrency limit for better performance

      // Filter out binary/unsupported formats that shouldn't be embedded as text
      const EXCLUDED_EXTENSIONS = [
        '.pdf', '.mp4', '.mov', '.avi', '.mkv', '.webm',
        '.zip', '.rar', '.7z', '.exe', '.dll', '.bin'
      ];
      // Filter out only serious binary/unsupported formats
      // Images (.jpg, .png, etc.) and Docs (.docx, .pdf) are handled by OCR/Extraction in loader
      const courseFiles = (block.courseFiles || []).filter(file => {
        const fileName = file.name.toLowerCase();
        const binaryExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.zip', '.rar', '.7z', '.exe', '.dll', '.bin'];
        return !binaryExts.some(ext => fileName.endsWith(ext));
      });
      let supplementalFiles: { name: string; content: string; size?: number }[] = [];
      let fileLoadFailures: string[] = [];

      if (courseFiles.length > 0) {
        setPdfProgress(prev => ({
          ...prev,
          progress: 32,
          status: `Loading ${courseFiles.length} supplemental document(s) in parallel...`
        }));

        // Use parallel loader with progress tracking and higher concurrency for large file sets
        const concurrency = courseFiles.length > 100 ? 15 : courseFiles.length > 50 ? 10 : 8;
        console.log(`[CombinedPDF] Loading ${courseFiles.length} files with concurrency ${concurrency}`);

        const loadedFiles = await loadFilesInParallel(
          courseFiles,
          (progress) => {
            const percentComplete = (progress.loaded / progress.total) * 100;
            // Allocate more progress range for large file sets (32% to 50%)
            const progressValue = 32 + (percentComplete / 100) * 18;

            let statusText = `Loading ${progress.loaded}/${progress.total} files`;
            if (progress.failed > 0) {
              statusText += ` (${progress.failed} skipped)`;
            }

            setPdfProgress(prev => ({ ...prev, progress: progressValue, status: statusText }));
          },
          concurrency
        );

        // Process results
        supplementalFiles = loadedFiles
          .filter(f => f.content && f.content.trim().length > 0)
          .map(f => ({
            name: f.name,
            content: f.content,
            size: f.size,
          }));

        fileLoadFailures = loadedFiles.filter(f => !f.success).map(f => f.name);

        const successCount = loadedFiles.filter(f => f.success).length;
        console.log(`Loaded ${successCount}/${courseFiles.length} supplemental files for PDF embedding`);

        if (fileLoadFailures.length > 0) {
          console.warn(`Failed to load ${fileLoadFailures.length} files:`, fileLoadFailures.slice(0, 10));
        }
      }

      setPdfProgress(prev => ({ ...prev, progress: 50, status: 'Building merged PDF with chapters...' }));

      // Generate merged course PDF with proper chapter structure and TOC
      let pdfBlob: Blob;
      try {
        // Build merged course data structure
        const mergedCourseData: MergedCourseData = {
          courseId: block.courses[0]?.id || blockId,
          title: block.name,
          modules: modules,
          userEmail: user?.email,
          supplementalFiles: supplementalFiles.length > 0 ? supplementalFiles : undefined,
        };

        console.log(`[CombinedPDF] Generating merged PDF with ${modules.length} chapters, ${supplementalFiles.length} supplemental files`);

        pdfBlob = await generateMergedCoursePDF(
          mergedCourseData,
          (progress, status) => {
            // Scale progress from 50-100%
            const scaledProgress = 50 + (progress * 0.50);
            setPdfProgress(prev => ({ ...prev, progress: scaledProgress, status }));
          },
          { maxFrames: 1000 } // Allow more frames per module for merged PDFs
        );
      } catch (pdfError) {
        console.error('PDF generation failed:', pdfError);
        throw new Error('PDF generation failed. Please try again.');
      }

      // Trigger download
      try {
        const filename = `${block.name} - OneDuo.pdf`;
        downloadPDF(pdfBlob, filename);

        // Clear the pdf_revision_pending flag after successful download
        if (block.courses[0]?.pdf_revision_pending) {
          await supabase
            .from('courses')
            .update({ pdf_revision_pending: false })
            .eq('id', blockId);

          // Update local state to remove the "Updated" badge immediately
          setCourses(prev => prev.map(c =>
            c.id === blockId ? { ...c, pdf_revision_pending: false } : c
          ));
        }

        // Enhanced success message with detailed summary
        let supplementalNote = '';
        if (courseFiles.length > 0) {
          const successCount = supplementalFiles.length;
          const failCount = fileLoadFailures.length;
          if (failCount === 0) {
            supplementalNote = ` All ${successCount} supplemental document(s) embedded.`;
          } else {
            supplementalNote = ` ${successCount}/${courseFiles.length} supplemental files embedded (${failCount} failed).`;
          }
        }

        toast.success(`✓ Combined PDF downloaded! All ${totalModules} modules merged.${supplementalNote}`);

        // Show warning if files failed
        if (fileLoadFailures.length > 0 && fileLoadFailures.length <= 5) {
          toast.warning(`${fileLoadFailures.length} file(s) could not be loaded: ${fileLoadFailures.slice(0, 3).join(', ')}${fileLoadFailures.length > 3 ? '...' : ''}`);
        } else if (fileLoadFailures.length > 5) {
          toast.warning(`${fileLoadFailures.length} supplemental files failed to load. Check console for details.`);
        }
      } catch (downloadError) {
        console.error('Download failed:', downloadError);
        throw new Error('Download failed. Please try again.');
      }
    } catch (err: any) {
      console.error('Combined PDF export failed:', err);
      toast.error(err.message || 'Failed to generate combined PDF');
    } finally {
      setGeneratingPDF(null);
      setPdfProgress({ progress: 0, status: '', title: '' });
    }
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
                            className={`w-full px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors ${hasProcessing ? 'bg-cyan-500/5' : hasFailed ? 'bg-red-500/5' : ''
                              }`}
                          >
                            <div className="flex items-center gap-4 flex-1 min-w-0">
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
                            <div className="flex items-center gap-3">
                              {/* Actions - Only show when ALL modules completed */}
                              {block.allCompleted && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleExportCombinedPDF(block);
                                    }}
                                    disabled={generatingPDF === `block-${block.courses[0]?.id}`}
                                    className={`relative w-9 h-9 p-0 text-white ${block.courses[0]?.pdf_revision_pending
                                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
                                      : 'bg-gradient-to-r from-[#DC2626] to-[#B91C1C] hover:from-[#B91C1C] hover:to-[#991B1B]'
                                      }`}
                                    title={block.courses[0]?.pdf_revision_pending ? 'Download Updated OneDuo' : 'Download OneDuo'}
                                  >
                                    {generatingPDF === `block-${block.courses[0]?.id}` ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <>
                                        <Download className="w-4 h-4" />
                                        {block.courses[0]?.pdf_revision_pending && (
                                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-400 rounded-full animate-pulse" />
                                        )}
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopyAILink(block.courses[0].id);
                                    }}
                                    className="gap-1.5 border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/10"
                                    disabled={!block.courses[0]?.share_enabled}
                                    title={block.courses[0]?.share_enabled ? 'Copy AI link' : 'Enable sharing first'}
                                  >
                                    <Link2 className="w-3.5 h-3.5" />
                                    AI Link
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleSharing(block.courses[0].id, block.courses[0]?.share_enabled ?? false);
                                    }}
                                    disabled={togglingShare === block.courses[0].id}
                                    className={`gap-1.5 ${block.courses[0]?.share_enabled
                                      ? 'border-green-500/30 text-green-400 hover:bg-green-500/10'
                                      : 'border-white/20 text-white/50 hover:bg-white/10'
                                      }`}
                                    title={block.courses[0]?.share_enabled ? 'Public sharing is ON' : 'Public sharing is OFF'}
                                  >
                                    {togglingShare === block.courses[0].id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : block.courses[0]?.share_enabled ? (
                                      <Globe className="w-3.5 h-3.5" />
                                    ) : (
                                      <Lock className="w-3.5 h-3.5" />
                                    )}
                                    {block.courses[0]?.share_enabled ? 'Public' : 'Private'}
                                  </Button>
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
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAddFilesDialog({
                                    open: true,
                                    courseId: block.courses[0].id,
                                    courseTitle: block.name,
                                    existingFiles: block.courseFiles || []
                                  });
                                }}
                                className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 gap-1"
                              >
                                <Paperclip className="w-4 h-4" />
                                Add Files
                              </Button>
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
                                                        onClick={() => handleExportModulePDF(item.id, item.title, block.name, item.status !== 'completed')}
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
                                                        onClick={() => handleExportPDF(parentCourse, item.moduleNumber)}
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
                                              <div className="flex items-center gap-2">
                                                <span className="text-xs text-emerald-400 flex items-center gap-1">
                                                  <CheckCircle className="w-3.5 h-3.5" />
                                                  Ready
                                                </span>
                                                {item.video_duration_seconds && (
                                                  <span className="text-xs text-white/30">• {formatDuration(item.video_duration_seconds)}</span>
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
