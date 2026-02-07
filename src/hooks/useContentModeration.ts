import { useState, useCallback } from 'react';
import { toast } from 'sonner';

interface ContentModerationResult {
  isAllowed: boolean;
  reason?: string;
  confidence?: number;
}

// List of prohibited content keywords (for filename/title checking)
const PROHIBITED_KEYWORDS = [
  'porn', 'xxx', 'adult', 'nsfw', 'nude', 'naked', 'sex', 'explicit',
  'pornography', 'erotic', 'hardcore', 'fetish', 'stripper', 'escort',
  'onlyfans', 'camgirl', 'webcam girl', 'live cam', 'adult content'
];

// Safe file extensions for video
const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v', '.wmv'];

/**
 * Content moderation hook for blocking prohibited uploads
 * Checks filenames, titles, and file metadata
 */
export function useContentModeration() {
  const [isChecking, setIsChecking] = useState(false);

  const checkFilename = useCallback((filename: string): ContentModerationResult => {
    const lowerFilename = filename.toLowerCase();
    
    for (const keyword of PROHIBITED_KEYWORDS) {
      if (lowerFilename.includes(keyword.toLowerCase())) {
        return {
          isAllowed: false,
          reason: `Content not allowed: filename contains prohibited term`,
          confidence: 0.95
        };
      }
    }
    
    return { isAllowed: true };
  }, []);

  const checkTitle = useCallback((title: string): ContentModerationResult => {
    const lowerTitle = title.toLowerCase();
    
    for (const keyword of PROHIBITED_KEYWORDS) {
      if (lowerTitle.includes(keyword.toLowerCase())) {
        return {
          isAllowed: false,
          reason: `Content not allowed: title contains prohibited term`,
          confidence: 0.95
        };
      }
    }
    
    return { isAllowed: true };
  }, []);

  const checkVideoFile = useCallback((file: File): ContentModerationResult => {
    // Check file extension
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_VIDEO_EXTENSIONS.includes(extension)) {
      return {
        isAllowed: false,
        reason: `Invalid video format. Allowed: ${ALLOWED_VIDEO_EXTENSIONS.join(', ')}`,
        confidence: 1.0
      };
    }

    // Check filename for prohibited content
    const filenameCheck = checkFilename(file.name);
    if (!filenameCheck.isAllowed) {
      return filenameCheck;
    }

    // Check file size (max 10GB for videos - supports multi-hour content)
    const maxSize = 10 * 1024 * 1024 * 1024; // 10GB
    if (file.size > maxSize) {
      const fileSizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(1);
      return {
        isAllowed: false,
        reason: `Video file too large (${fileSizeGB}GB). Maximum size is 10GB.`,
        confidence: 1.0
      };
    }

    return { isAllowed: true };
  }, [checkFilename]);

  const checkURL = useCallback((url: string): ContentModerationResult => {
    const lowerUrl = url.toLowerCase();
    
    // Check for prohibited domains
    const prohibitedDomains = [
      'pornhub', 'xvideos', 'xnxx', 'redtube', 'youporn',
      'tube8', 'spankbang', 'xhamster', 'chaturbate', 'onlyfans'
    ];
    
    for (const domain of prohibitedDomains) {
      if (lowerUrl.includes(domain)) {
        return {
          isAllowed: false,
          reason: 'URLs from adult content sites are not allowed',
          confidence: 1.0
        };
      }
    }

    // Check URL path for prohibited keywords
    for (const keyword of PROHIBITED_KEYWORDS) {
      if (lowerUrl.includes(keyword.toLowerCase())) {
        return {
          isAllowed: false,
          reason: 'URL contains prohibited content',
          confidence: 0.9
        };
      }
    }

    return { isAllowed: true };
  }, []);

  const moderateContent = useCallback(async (options: {
    file?: File;
    url?: string;
    title?: string;
  }): Promise<ContentModerationResult> => {
    setIsChecking(true);
    
    try {
      // Check file if provided
      if (options.file) {
        const fileResult = checkVideoFile(options.file);
        if (!fileResult.isAllowed) {
          toast.error(fileResult.reason || 'Content not allowed');
          return fileResult;
        }
      }

      // Check URL if provided
      if (options.url) {
        const urlResult = checkURL(options.url);
        if (!urlResult.isAllowed) {
          toast.error(urlResult.reason || 'URL not allowed');
          return urlResult;
        }
      }

      // Check title if provided
      if (options.title) {
        const titleResult = checkTitle(options.title);
        if (!titleResult.isAllowed) {
          toast.error(titleResult.reason || 'Title not allowed');
          return titleResult;
        }
      }

      return { isAllowed: true };
    } finally {
      setIsChecking(false);
    }
  }, [checkVideoFile, checkURL, checkTitle]);

  return {
    moderateContent,
    checkFilename,
    checkTitle,
    checkVideoFile,
    checkURL,
    isChecking
  };
}

/**
 * Utility to sanitize user input
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove potential HTML
    .trim();
}
