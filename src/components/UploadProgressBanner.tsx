/**
 * Global Upload Progress Banner
 * Shows a persistent banner across all routes when an upload is in progress
 */

import { useUploadPersistence } from '@/hooks/useUploadPersistence';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Cloud, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export function UploadProgressBanner() {
  const { activeUploads, currentTabId, removeUploadSession } = useUploadPersistence();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Only show banner if NOT already on /upload page
  const isOnUploadPage = location.pathname === '/upload';
  
  // Get uploads for current tab only
  const myActiveUploads = activeUploads.filter(u => u.tabId === currentTabId && u.stage === 'uploading');
  
  // Don't show if on upload page or no active uploads for this tab
  if (isOnUploadPage || myActiveUploads.length === 0) {
    return null;
  }
  
  const upload = myActiveUploads[0]; // Show first active upload
  const progressPercent = upload.totalModules > 0 
    ? (upload.uploadedModules / upload.totalModules) * 100 
    : 0;
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        className="fixed top-0 left-0 right-0 z-50 bg-primary/95 backdrop-blur-sm border-b border-primary-foreground/20 shadow-lg"
      >
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            {/* Icon */}
            <div className="flex-shrink-0">
              <Cloud className="w-5 h-5 text-primary-foreground animate-pulse" />
            </div>
            
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-primary-foreground truncate">
                  Uploading: {upload.courseTitle}
                </span>
                <span className="text-xs text-primary-foreground/70">
                  {upload.uploadedModules}/{upload.totalModules} modules
                </span>
              </div>
              <Progress 
                value={progressPercent} 
                className="h-1.5 bg-primary-foreground/20"
              />
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigate('/upload')}
                className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
              >
                View Progress
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
              <button
                onClick={() => removeUploadSession(upload.id)}
                className="p-1 hover:bg-primary-foreground/20 rounded transition-colors"
                title="Dismiss banner"
              >
                <X className="w-4 h-4 text-primary-foreground/70" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
