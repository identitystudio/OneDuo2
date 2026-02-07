import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { getSessionId } from '@/hooks/useSessionId';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Create a Supabase client with session ID header for RLS policies
export function getSupabaseWithSession() {
  const sessionId = getSessionId();
  
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        'x-session-id': sessionId,
      },
    },
  });
}
