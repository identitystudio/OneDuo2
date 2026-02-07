import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  checks: {
    database: CheckResult;
    storage: CheckResult;
    edge_functions: CheckResult;
    assemblyai: CheckResult;
    resend: CheckResult;
    openai: CheckResult;
    replicate: CheckResult;
  };
  metrics?: {
    courses_count: number;
    active_jobs: number;
    storage_usage_mb: number;
  };
  ready_for_batch: boolean;
}

interface CheckResult {
  status: 'pass' | 'fail' | 'warn';
  latency_ms: number;
  message?: string;
}

async function checkDatabase(supabase: any): Promise<CheckResult> {
  const start = Date.now();
  try {
    const { data, error } = await supabase
      .from('courses')
      .select('id', { count: 'exact', head: true });

    const latency = Date.now() - start;

    if (error) throw error;

    return {
      status: latency > 1000 ? 'warn' : 'pass',
      latency_ms: latency,
      message: latency > 1000 ? 'High latency detected' : undefined
    };
  } catch (err: any) {
    return {
      status: 'fail',
      latency_ms: Date.now() - start,
      message: err.message
    };
  }
}

async function checkStorage(supabase: any): Promise<CheckResult> {
  const start = Date.now();
  try {
    const { data, error } = await supabase
      .storage
      .from('course-videos')
      .list('', { limit: 1 });

    const latency = Date.now() - start;

    if (error) throw error;

    return {
      status: latency > 2000 ? 'warn' : 'pass',
      latency_ms: latency
    };
  } catch (err: any) {
    return {
      status: 'fail',
      latency_ms: Date.now() - start,
      message: err.message
    };
  }
}

// Critical: Verify AssemblyAI is configured and responding
async function checkAssemblyAI(): Promise<CheckResult> {
  const start = Date.now();
  const apiKey = Deno.env.get('ASSEMBLYAI_API_KEY');

  if (!apiKey) {
    return { status: 'fail', latency_ms: 0, message: 'ASSEMBLYAI_API_KEY not configured' };
  }

  try {
    // Just verify we can reach AssemblyAI API (doesn't consume quota)
    const response = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'GET',
      headers: { 'Authorization': apiKey }
    });

    const latency = Date.now() - start;

    // 401 means bad key, 405 means method not allowed (but API is up!)
    if (response.status === 405 || response.status === 200) {
      return { status: 'pass', latency_ms: latency };
    }

    if (response.status === 401) {
      return { status: 'fail', latency_ms: latency, message: 'Invalid API key' };
    }

    return {
      status: latency > 3000 ? 'warn' : 'pass',
      latency_ms: latency
    };
  } catch (err: any) {
    return { status: 'fail', latency_ms: Date.now() - start, message: err.message };
  }
}

// Critical: Verify Resend is configured for email delivery
async function checkResend(): Promise<CheckResult> {
  const start = Date.now();
  const apiKey = Deno.env.get('RESEND_API_KEY');

  if (!apiKey) {
    return { status: 'fail', latency_ms: 0, message: 'RESEND_API_KEY not configured' };
  }

  try {
    // Verify API key by checking domains (doesn't send email)
    const response = await fetch('https://api.resend.com/domains', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const latency = Date.now() - start;

    if (response.ok) {
      return { status: 'pass', latency_ms: latency };
    }

    if (response.status === 401) {
      return { status: 'fail', latency_ms: latency, message: 'Invalid API key' };
    }

    return { status: 'warn', latency_ms: latency, message: `Status: ${response.status}` };
  } catch (err: any) {
    return { status: 'fail', latency_ms: Date.now() - start, message: err.message };
  }
}

async function checkOpenAI(): Promise<CheckResult> {
  const start = Date.now();
  const apiKey = Deno.env.get('OPENAI_API_KEY');

  if (!apiKey) {
    return { status: 'fail', latency_ms: 0, message: 'OPENAI_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const latency = Date.now() - start;

    if (response.ok) {
      return { status: 'pass', latency_ms: latency };
    }

    if (response.status === 401) {
      return { status: 'fail', latency_ms: latency, message: 'Invalid API key' };
    }

    return { status: 'warn', latency_ms: latency, message: `Status: ${response.status}` };
  } catch (err: any) {
    return { status: 'fail', latency_ms: Date.now() - start, message: err.message };
  }
}

async function checkReplicate(): Promise<CheckResult> {
  const start = Date.now();
  const apiKey = Deno.env.get('REPLICATE_API_KEY') || Deno.env.get('REPLICATE_API_TOKEN');

  if (!apiKey) {
    return { status: 'fail', latency_ms: 0, message: 'REPLICATE_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.replicate.com/v1/models', {
      headers: { 'Authorization': `Token ${apiKey}` }
    });

    const latency = Date.now() - start;

    if (response.ok) {
      return { status: 'pass', latency_ms: latency };
    }

    if (response.status === 401) {
      return { status: 'fail', latency_ms: latency, message: 'Invalid API key' };
    }

    return { status: 'warn', latency_ms: latency, message: `Status: ${response.status}` };
  } catch (err: any) {
    return { status: 'fail', latency_ms: Date.now() - start, message: err.message };
  }
}

async function getMetrics(supabase: any) {
  try {
    // Get courses count
    const { count: coursesCount } = await supabase
      .from('courses')
      .select('*', { count: 'exact', head: true });

    // Get active processing jobs
    const { count: activeJobs } = await supabase
      .from('processing_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'processing');

    return {
      courses_count: coursesCount || 0,
      active_jobs: activeJobs || 0,
      storage_usage_mb: 0
    };
  } catch {
    return undefined;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const start = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Run ALL health checks in parallel - including critical external services
    const [dbCheck, storageCheck, assemblyaiCheck, resendCheck, openaiCheck, replicateCheck, metrics] = await Promise.all([
      checkDatabase(supabase),
      checkStorage(supabase),
      checkAssemblyAI(),
      checkResend(),
      checkOpenAI(),
      checkReplicate(),
      getMetrics(supabase)
    ]);

    // Edge function check is implicit - if we got here, it works
    const edgeFunctionCheck: CheckResult = {
      status: 'pass',
      latency_ms: Date.now() - start
    };

    // Determine overall status
    const checks = {
      database: dbCheck,
      storage: storageCheck,
      edge_functions: edgeFunctionCheck,
      assemblyai: assemblyaiCheck,
      resend: resendCheck,
      openai: openaiCheck,
      replicate: replicateCheck
    };
    const allChecks = Object.values(checks);

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (allChecks.some(c => c.status === 'fail')) {
      overallStatus = 'unhealthy';
    } else if (allChecks.some(c => c.status === 'warn')) {
      overallStatus = 'degraded';
    }

    // Ready for batch = all critical services pass
    const readyForBatch = dbCheck.status === 'pass' &&
      storageCheck.status === 'pass' &&
      assemblyaiCheck.status === 'pass' &&
      resendCheck.status === 'pass' &&
      openaiCheck.status === 'pass' &&
      replicateCheck.status === 'pass';

    const health: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      checks,
      metrics,
      ready_for_batch: readyForBatch
    };

    console.log(`[health-check] Status: ${overallStatus}, ready_for_batch: ${readyForBatch}`);

    return new Response(JSON.stringify(health), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error: any) {
    console.error('Health check error:', error);

    return new Response(JSON.stringify({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      error: error.message,
      stack: error.stack,
      ready_for_batch: false,
      checks: {
        database: { status: 'fail', latency_ms: 0, message: `CRITICAL ERROR: ${error.message}` },
        storage: { status: 'fail', latency_ms: 0, message: 'Check failed' },
        edge_functions: { status: 'fail', latency_ms: Date.now() - start, message: error.message },
        assemblyai: { status: 'fail', latency_ms: 0, message: 'Check failed' },
        resend: { status: 'fail', latency_ms: 0, message: 'Check failed' },
        openai: { status: 'fail', latency_ms: 0, message: 'Check failed' },
        replicate: { status: 'fail', latency_ms: 0, message: 'Check failed' }
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 // Return 200 so the frontend can display the error
    });
  }
});
