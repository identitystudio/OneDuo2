import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

async function sendEmail(to: string, subject: string, text: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "OneDuo <hello@oneduo.ai>",
      to: [to],
      subject,
      text,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${error}`);
  }
  
  return response.json();
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Email content for the 5-day sequence
const emailSequence = [
  {
    subject: "Your VA is waiting on you right now",
    body: `Yo,

Quick question...

How much are you paying your VA per month?

$500? $1,000? $2,000?

Cool.

Now here's the uncomfortable question:

How much of that time are they spending waiting on YOU?

Because here's what actually happens...

You buy a course.

Something you need implemented in your business.

Facebook ads. Funnel building. Cold outreach. Whatever.

You send it to your VA and say "watch this and handle it."

Sounds great.

Except...

You haven't watched it yet either.

So when your VA asks what to do next...

You have no fucking clue.

You scramble to ChatGPT.

You skim through the course trying to find the answer.

You tell them "let me get back to you on that."

Meanwhile... they're just sitting there.

Waiting.

On you.

You're literally paying someone to wait while YOU figure out what to tell them.

You're the bottleneck.

OneDuo fixes this.

It watches the entire course FOR you.

So when your VA needs to know what to do next...

They ask OneDuo.

Not you.

They get the answer. They execute. They keep moving.

You're not involved.

You're not the thing slowing everything down anymore.

⇒ Stop being the bottleneck - Get OneDuo: https://oneduo.ai/pricing

$10 for one course if you want to test it.

$97/month for unlimited if you're ready to stop being the reason nothing gets done.

Your VA is ready to work.

The question is... are you ready to get out of their way?

-Mario

P.S. Every hour your VA spends waiting on you is money down the drain. You know this.`
  },
  {
    subject: "You hired them to execute. Not to wait.",
    body: `Let's be honest about what's actually happening...

You hired a VA because you wanted to DELEGATE.

Get shit off your plate.

Stop doing everything yourself.

Makes sense.

So you buy a course on how to do the thing you want delegated.

You send it to your VA.

You say "learn this and implement it."

Perfect plan.

Except...

You haven't watched the course yet.

So when your VA has questions...

When they need clarification...

When they need to know what step comes next...

They come to YOU.

And you don't have the answers.

Because you haven't watched it either.

So now you're stuck.

Either you sit down and watch the whole damn course yourself...

(Which defeats the point of hiring someone in the first place)

Or your VA sits there doing nothing while you "get back to them."

Either way... nothing gets done.

Here's what OneDuo does:

It watches the course completely.

Understands every step.

Becomes your VA's resource.

Your VA asks OneDuo what to do next.

OneDuo answers immediately.

Your VA executes.

You're not the bottleneck anymore.

The thing you ACTUALLY wanted when you hired them?

That finally happens.

⇒ Let your VA actually work - Get OneDuo: https://oneduo.ai/pricing

You're already paying them.

Might as well let them do something.

-Mario

P.S. Be honest... how many times this week has your VA asked you a question you didn't know the answer to? Yeah. That's the problem.`
  },
  {
    subject: "Your VA doesn't need you to be smart. They need you to get out of the way.",
    body: `Here's the thing nobody wants to admit...

Your VA is probably MORE capable than you think.

They can learn.

They can execute.

They can get shit done.

The problem isn't them.

It's you.

Not because you're lazy.

Not because you're incompetent.

But because you're the BOTTLENECK.

You bought the course.

You told them to implement it.

But you haven't watched it yet.

So when they need guidance...

When they need to know the next step...

When they need ANYTHING from that course...

They're stuck waiting on you to figure it out.

And you're busy.

You've got other shit to do.

So they wait.

And you pay them.

To sit there.

Doing nothing.

OneDuo removes you from the equation.

It watches the course FOR you.

Your VA asks it questions.

It answers.

They execute.

You're not involved.

You don't need to "learn" the course.

You don't need to become the expert.

You just need to get out of the way.

And let your VA do what you hired them to do.

⇒ Get out of the way - Get OneDuo: https://oneduo.ai/pricing

$10 to test it.

$97/month for unlimited.

Your VA is ready to work.

You just need to stop being the thing stopping them.

-Mario

P.S. If you're still thinking about it, ask yourself this: How much is it costing you to have your VA wait on you right now? Do that math.`
  },
  {
    subject: "Let's talk about what you're actually paying for",
    body: `Quick math exercise...

Let's say your VA costs you $1,000/month.

Now...

How much of their time is spent actually EXECUTING?

And how much is spent waiting on YOU to tell them what to do next?

If we're being honest...

Probably 30-40% of their time is wasted.

Waiting for you to watch the course.

Waiting for you to answer their questions.

Waiting for you to stop being busy so you can give them direction.

That's $300-400/month you're paying them to do absolutely nothing.

Because you're the bottleneck.

Now let's compare that to OneDuo.

$97/month for unlimited courses.

What does that get you?

Your VA stops waiting.

They ask OneDuo what to do next.

They get answers immediately.

They execute without you.

So instead of paying $300+/month in wasted VA time...

You pay $97/month to eliminate the bottleneck completely.

And your VA actually does what you hired them to do.

The math isn't even close.

⇒ Stop wasting money - Get OneDuo: https://oneduo.ai/pricing

You're already paying your VA.

You might as well let them work.

-Mario

P.S. And that's just the DIRECT cost. The real cost is the shit that doesn't get done. The revenue you don't generate. The growth that doesn't happen. All because your VA is stuck waiting on you.`
  },
  {
    subject: "Last time I'm bringing this up",
    body: `I'm not gonna keep emailing you about this.

Either you see the problem or you don't.

But before I move on...

Let me ask you one question:

Why did you hire a VA?

I'm guessing it was so you could delegate.

So you could get shit off your plate.

So you could focus on the things only YOU can do.

Right?

Cool.

So how's that going?

Because if we're being honest...

Your VA probably can't do much without you.

They need your input.

They need your direction.

They need you to watch the course and tell them what it says.

Which means you're not actually delegating.

You're just adding another person to manage.

Another person who needs YOUR time.

That's not what you wanted.

OneDuo gives you what you actually wanted.

Your VA gets answers without you.

They execute without waiting.

They handle the thing you delegated.

And you finally get your time back.

The way it was supposed to work from the beginning.

⇒ Actually delegate - Get OneDuo: https://oneduo.ai/pricing

$10 to test it with one course.

$97/month for unlimited.

Your VA is ready.

Question is... are you ready to stop being the reason they can't move?

This is the last email about this.

Your call.

-Mario

P.S. If this isn't for you right now, no worries. I'll still send you useful shit occasionally. But this offer? It's gone after today.`
  }
];

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role for full access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();

    // Find subscribers who need their next email
    const { data: subscribers, error: fetchError } = await supabase
      .from('email_subscribers')
      .select('*')
      .eq('current_tag', 'in_sequence')
      .eq('unsubscribed', false)
      .eq('purchased', false)
      .lte('next_email_at', now.toISOString())
      .lt('sequence_day', 6); // Only process days 1-5

    if (fetchError) {
      console.error("Error fetching subscribers:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${subscribers?.length || 0} subscribers to process`);

    let processed = 0;
    let errors = 0;

    for (const subscriber of subscribers || []) {
      try {
        const currentDay = subscriber.sequence_day;
        const emailIndex = currentDay - 1; // Array is 0-indexed, days are 1-indexed
        
        // Skip if email was already sent today (prevent duplicates)
        const { data: existingLog } = await supabase
          .from('email_logs')
          .select('id')
          .eq('subscriber_id', subscriber.id)
          .eq('email_number', currentDay + 1) // We're sending the NEXT email
          .maybeSingle();

        if (existingLog) {
          console.log(`Email ${currentDay + 1} already sent to ${subscriber.email}, skipping`);
          continue;
        }

        // Get the next email content (current day + 1, because day 1 was sent on optin)
        const nextEmailIndex = currentDay; // Since day 1 was already sent, current day points to next email
        if (nextEmailIndex >= emailSequence.length) {
          // Completed sequence, mark as cold_lead
          await supabase
            .from('email_subscribers')
            .update({
              current_tag: 'cold_lead',
              sequence_day: null,
              next_email_at: null
            })
            .eq('id', subscriber.id);

          await supabase.from('tag_history').insert({
            subscriber_id: subscriber.id,
            old_tag: 'in_sequence',
            new_tag: 'cold_lead',
            reason: 'Completed 5-day sequence without purchase'
          });

          console.log(`${subscriber.email} completed sequence, tagged as cold_lead`);
          continue;
        }

        const emailContent = emailSequence[nextEmailIndex];
        const greeting = subscriber.first_name || "Yo";

        // Send the email
        const emailText = emailContent.body.replace(/^Yo,/, `${greeting},`);
        const emailResponse = await sendEmail(
          subscriber.email,
          emailContent.subject,
          emailText
        );

        console.log(`Email ${nextEmailIndex + 1} sent to ${subscriber.email}:`, emailResponse);

        // Log email sent
        await supabase.from('email_logs').insert({
          subscriber_id: subscriber.id,
          email_number: nextEmailIndex + 1,
          resend_id: emailResponse?.id || null,
        });

        // Update subscriber for next email
        const nextDay = currentDay + 1;
        if (nextDay >= 5) {
          // This was the last email, mark as cold_lead
          await supabase
            .from('email_subscribers')
            .update({
              current_tag: 'cold_lead',
              sequence_day: null,
              next_email_at: null
            })
            .eq('id', subscriber.id);

          await supabase.from('tag_history').insert({
            subscriber_id: subscriber.id,
            old_tag: 'in_sequence',
            new_tag: 'cold_lead',
            reason: 'Completed 5-day sequence without purchase'
          });
        } else {
          // Schedule next email
          const nextEmailAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          await supabase
            .from('email_subscribers')
            .update({
              sequence_day: nextDay,
              next_email_at: nextEmailAt.toISOString()
            })
            .eq('id', subscriber.id);
        }

        processed++;
      } catch (emailError) {
        console.error(`Error processing ${subscriber.email}:`, emailError);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed, 
        errors,
        timestamp: now.toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in process-email-sequence:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
