import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAILS = ['christinaxcabral@gmail.com'];

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role for full access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Authenticate the request - require valid admin user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('[admin-stats] No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - no auth header' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.log('[admin-stats] Invalid token or user not found:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Check if user is an admin
    if (!user.email || !ADMIN_EMAILS.includes(user.email)) {
      console.log('[admin-stats] User not authorized as admin:', user.email);
      return new Response(
        JSON.stringify({ error: 'Forbidden - not an admin' }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log('[admin-stats] Authorized admin access:', user.email);

    // Get all subscribers
    const { data: subscribers, error: subError } = await supabase
      .from('email_subscribers')
      .select('*')
      .order('created_at', { ascending: false });

    if (subError) throw subError;

    // Get email logs
    const { data: emailLogs, error: logError } = await supabase
      .from('email_logs')
      .select('*')
      .order('sent_at', { ascending: false });

    if (logError) throw logError;

    // Get mock orders
    const { data: orders, error: orderError } = await supabase
      .from('mock_orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (orderError) throw orderError;

    // Calculate stats
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const stats = {
      // Tag counts
      tags: {
        in_sequence: subscribers?.filter(s => s.current_tag === 'in_sequence').length || 0,
        hot_lead: subscribers?.filter(s => s.current_tag === 'hot_lead').length || 0,
        cold_lead: subscribers?.filter(s => s.current_tag === 'cold_lead').length || 0,
        customer: subscribers?.filter(s => s.current_tag === 'customer').length || 0,
      },
      
      // Sequence breakdown
      sequence: {
        day1: subscribers?.filter(s => s.current_tag === 'in_sequence' && s.sequence_day === 1).length || 0,
        day2: subscribers?.filter(s => s.current_tag === 'in_sequence' && s.sequence_day === 2).length || 0,
        day3: subscribers?.filter(s => s.current_tag === 'in_sequence' && s.sequence_day === 3).length || 0,
        day4: subscribers?.filter(s => s.current_tag === 'in_sequence' && s.sequence_day === 4).length || 0,
        day5: subscribers?.filter(s => s.current_tag === 'in_sequence' && s.sequence_day === 5).length || 0,
      },

      // Email stats
      emails: {
        total_sent: emailLogs?.length || 0,
        sent_today: emailLogs?.filter(l => new Date(l.sent_at) >= today).length || 0,
        by_email: [1, 2, 3, 4, 5].map(num => ({
          email_number: num,
          sent: emailLogs?.filter(l => l.email_number === num).length || 0,
          opened: emailLogs?.filter(l => l.email_number === num && l.opened).length || 0,
          clicked: emailLogs?.filter(l => l.email_number === num && l.clicked).length || 0,
        }))
      },

      // Revenue stats
      revenue: {
        total: orders?.reduce((sum, o) => sum + o.amount, 0) || 0,
        total_orders: orders?.length || 0,
        by_plan: {
          single: {
            count: orders?.filter(o => o.plan === 'single').length || 0,
            revenue: orders?.filter(o => o.plan === 'single').reduce((sum, o) => sum + o.amount, 0) || 0,
          },
          starter: {
            count: orders?.filter(o => o.plan === 'starter').length || 0,
            revenue: orders?.filter(o => o.plan === 'starter').reduce((sum, o) => sum + o.amount, 0) || 0,
          },
          unlimited: {
            count: orders?.filter(o => o.plan === 'unlimited').length || 0,
            revenue: orders?.filter(o => o.plan === 'unlimited').reduce((sum, o) => sum + o.amount, 0) || 0,
          },
        },
        mrr: (orders?.filter(o => o.plan === 'starter').length || 0) * 4700 +
             (orders?.filter(o => o.plan === 'unlimited').length || 0) * 9700,
      },

      // Conversion stats
      conversions: {
        total_optins: subscribers?.length || 0,
        total_customers: subscribers?.filter(s => s.current_tag === 'customer').length || 0,
        optin_to_customer_rate: subscribers?.length 
          ? ((subscribers.filter(s => s.current_tag === 'customer').length / subscribers.length) * 100).toFixed(2)
          : '0.00',
      },

      // Recent activity
      recent_subscribers: subscribers?.slice(0, 10).map(s => ({
        id: s.id,
        email: s.email,
        first_name: s.first_name,
        tag: s.current_tag,
        sequence_day: s.sequence_day,
        optin_source: s.optin_source,
        optin_date: s.optin_date,
        purchased: s.purchased,
      })),

      recent_orders: orders?.slice(0, 10),
    };

    return new Response(
      JSON.stringify(stats),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in admin-stats:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
