import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CheckoutRequest {
  email: string;
  plan: 'single' | 'starter' | 'unlimited';
  card_number?: string; // For mock validation
}

const planPrices = {
  single: 1000, // $10.00
  starter: 4700, // $47.00/month
  unlimited: 9700, // $97.00/month
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, plan, card_number }: CheckoutRequest = await req.json();

    if (!email || !plan) {
      return new Response(
        JSON.stringify({ error: "Email and plan are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!planPrices[plan]) {
      return new Response(
        JSON.stringify({ error: "Invalid plan" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mock card validation - accept test cards
    const validTestCards = ['4242424242424242', '4000056655665556', '5555555555554444'];
    if (card_number && !validTestCards.includes(card_number.replace(/\s/g, ''))) {
      return new Response(
        JSON.stringify({ error: "Card declined. Use test card 4242 4242 4242 4242" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role for full access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create mock order
    const { data: subscriber } = await supabase
      .from('email_subscribers')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    const { data: order, error: orderError } = await supabase
      .from('mock_orders')
      .insert({
        subscriber_id: subscriber?.id || null,
        email: email.toLowerCase().trim(),
        plan,
        amount: planPrices[plan],
      })
      .select()
      .single();

    if (orderError) {
      console.error("Error creating order:", orderError);
      throw orderError;
    }

    // If subscriber exists, update their status
    if (subscriber) {
      // Get old tag for history
      const { data: subData } = await supabase
        .from('email_subscribers')
        .select('current_tag')
        .eq('id', subscriber.id)
        .single();

      // Update subscriber to customer
      await supabase
        .from('email_subscribers')
        .update({
          current_tag: 'customer',
          purchased: true,
          purchase_date: new Date().toISOString(),
          sequence_day: null,
          next_email_at: null,
        })
        .eq('id', subscriber.id);

      // Log tag change
      await supabase.from('tag_history').insert({
        subscriber_id: subscriber.id,
        old_tag: subData?.current_tag || 'in_sequence',
        new_tag: 'customer',
        reason: `Purchased ${plan} plan via mock checkout`
      });
    }

    console.log("Mock order created:", order);

    return new Response(
      JSON.stringify({ 
        success: true, 
        order_id: order.id,
        amount: planPrices[plan],
        plan,
        message: "Mock payment successful! In production, this would be a real Stripe charge."
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in mock-checkout:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
