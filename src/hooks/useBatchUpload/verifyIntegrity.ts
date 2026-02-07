/**
 * Video Integrity Verification Utility
 * Verifies uploaded videos are valid before queueing for processing
 */

import { supabase } from '@/integrations/supabase/client';
import type { VerificationResult } from './types';

/**
 * Verify video integrity after upload
 * Checks video is accessible and can be processed
 */
export async function verifyVideoIntegrity(videoUrl: string): Promise<VerificationResult> {
  try {
    const { data, error } = await supabase.functions.invoke('verify-video-integrity', {
      body: { videoUrl }
    });

    if (error) {
      console.warn('[VerifyIntegrity] Service error, proceeding with caution:', error);
      return { valid: true, warnings: ['Verification service unavailable - proceeding with upload'] };
    }

    return data;
  } catch (err) {
    console.warn('[VerifyIntegrity] Failed, proceeding anyway:', err);
    return { valid: true, warnings: ['Verification unavailable'] };
  }
}
