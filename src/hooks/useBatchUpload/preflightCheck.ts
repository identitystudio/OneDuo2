/**
 * Pre-flight Check Utility
 * Verifies all backend services are ready before starting batch upload
 */

import { supabase } from '@/integrations/supabase/client';
import type { PreflightResult } from './types';

/**
 * Run pre-flight checks to verify all services are ready
 * Checks: database, storage, transcription service, email service
 */
export async function runPreflightCheck(): Promise<PreflightResult> {
  try {
    const { data, error } = await supabase.functions.invoke('health-check');

    if (error || !data) {
      return { ready: false, issues: ['Could not reach backend services'] };
    }

    const issues: string[] = [];

    if (data.checks?.database?.status === 'fail') {
      issues.push('Database unavailable');
    }
    if (data.checks?.storage?.status === 'fail') {
      issues.push('Storage unavailable');
    }
    if (data.checks?.assemblyai?.status === 'fail') {
      issues.push(`Transcription service: ${data.checks.assemblyai.message || 'unavailable'}`);
    }
    if (data.checks?.resend?.status === 'fail') {
      issues.push(`Email service: ${data.checks.resend.message || 'unavailable'}`);
    }
    if (data.checks?.openai?.status === 'fail') {
      issues.push(`AI service: ${data.checks.openai.message || 'unavailable'}`);
    }
    if (data.checks?.replicate?.status === 'fail') {
      issues.push(`Frame service: ${data.checks.replicate.message || 'unavailable'}`);
    }

    return {
      ready: data.ready_for_batch === true && issues.length === 0,
      issues
    };
  } catch (err) {
    console.error('[PreflightCheck] Failed:', err);
    return { ready: false, issues: ['Pre-flight check failed'] };
  }
}
