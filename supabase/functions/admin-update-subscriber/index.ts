import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UpdateRequest {
  subscriber_id: string;
  action: 'tag' | 'remove' | 'restart';
  new_tag?: 'in_sequence' | 'hot_lead' | 'cold_lead' | 'customer';
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { subscriber_id, action, new_tag }: UpdateRequest = await req.json();

    if (!subscriber_id || !action) {
      return new Response(
        JSON.stringify({ error: "subscriber_id and action are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role for full access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get current subscriber
    const { data: subscriber, error: fetchError } = await supabase
      .from('email_subscribers')
      .select('*')
      .eq('id', subscriber_id)
      .single();

    if (fetchError || !subscriber) {
      return new Response(
        JSON.stringify({ error: "Subscriber not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let updateData: any = {};
    let reason = '';

    switch (action) {
      case 'tag':
        if (!new_tag) {
          return new Response(
            JSON.stringify({ error: "new_tag is required for tag action" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        updateData = { current_tag: new_tag };
        if (new_tag === 'customer') {
          updateData.purchased = true;
          updateData.purchase_date = new Date().toISOString();
          updateData.sequence_day = null;
          updateData.next_email_at = null;
        } else if (new_tag !== 'in_sequence') {
          updateData.sequence_day = null;
          updateData.next_email_at = null;
        }
        reason = `Manual tag change to ${new_tag}`;
        break;

      case 'remove':
        updateData = { 
          unsubscribed: true,
          sequence_day: null,
          next_email_at: null
        };
        reason = 'Manually removed from automation';
        break;

      case 'restart':
        const now = new Date();
        updateData = {
          current_tag: 'in_sequence',
          sequence_day: 1,
          next_email_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          unsubscribed: false
        };
        reason = 'Manually restarted automation';
        break;

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Update subscriber
    const { error: updateError } = await supabase
      .from('email_subscribers')
      .update(updateData)
      .eq('id', subscriber_id);

    if (updateError) throw updateError;

    // Log tag history if tag changed
    if (action === 'tag' || action === 'restart') {
      await supabase.from('tag_history').insert({
        subscriber_id,
        old_tag: subscriber.current_tag,
        new_tag: updateData.current_tag || subscriber.current_tag,
        reason
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: reason }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in admin-update-subscriber:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
