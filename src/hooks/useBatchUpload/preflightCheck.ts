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
    let hasBlockingIssue = false;

    // Database status check - allow degraded/high latency as warning
    const dbStatus = data.checks?.database?.status;
    if (dbStatus === 'fail') {
      issues.push('Database unavailable');
      hasBlockingIssue = true;
    } else if (dbStatus === 'degraded' || dbStatus === 'high latency') {
      issues.push(`Database status: ${data.checks?.database?.message || 'High latency detected'}`);
    }

    // Other service checks - continue to block if they fail
    if (data.checks?.storage?.status === 'fail') {
      issues.push('Storage unavailable');
      hasBlockingIssue = true;
    }
    if (data.checks?.assemblyai?.status === 'fail') {
      issues.push(`Transcription service: ${data.checks.assemblyai.message || 'unavailable'}`);
      hasBlockingIssue = true;
    }
    if (data.checks?.resend?.status === 'fail') {
      issues.push(`Email service: ${data.checks.resend.message || 'unavailable'}`);
      hasBlockingIssue = true;
    }
    if (data.checks?.openai?.status === 'fail') {
      issues.push(`AI service: ${data.checks.openai.message || 'unavailable'}`);
      hasBlockingIssue = true;
    }
    if (data.checks?.replicate?.status === 'fail') {
      issues.push(`Frame service: ${data.checks.replicate.message || 'unavailable'}`);
      hasBlockingIssue = true;
    }

    return {
      // Ready if backend says so OR if it's only database latency causing ready_for_batch to be false
      ready: (data.ready_for_batch === true || (dbStatus === 'degraded' || dbStatus === 'high latency')) && !hasBlockingIssue,
      issues
    };
  } catch (err) {
    console.error('[PreflightCheck] Failed:', err);
    return { ready: false, issues: ['Pre-flight check failed'] };
  }
}
