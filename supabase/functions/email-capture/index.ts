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
    subject: "Yeah, you COULD use Gemini... but here's why you won't",
    body: `Yo,

Quick question...

Have you thought about just uploading your courses to Gemini yourself?

I mean... it's free (for now).

It can "watch" videos.

So why not just do that?

Fair question.

And I'm not gonna sit here and pretend like it's NOT possible.

You're smart. You're resourceful.

You could ABSOLUTELY figure out a way to make Gemini work for this.

But here's the thing...

You won't actually do it.

And even if you DO...

You're gonna hate it.

Here's why:

1) It's not BUILT for this.

Sure, you can upload a video to Gemini.

But then what?

You're gonna manually ask it questions every time your VA needs help?

Cool.

So you're STILL the bottleneck.

You just added an extra step.

2) Your VA isn't gonna use it correctly.

Let's be real...

Your VA doesn't know how to prompt AI.

They're gonna type "how do I do the thing?" and get a garbage answer.

Then they're gonna come BACK to you...

And ask how to ask Gemini the right question.

Congratulations.

You just became the IT department.

3) No organization. No memory. No system.

Gemini doesn't SAVE the course in a way your VA can access it later.

It doesn't organize it by module.

It doesn't remember what questions were already asked.

So every time your VA needs help...

You're starting from scratch.

Fun times.

4) It's gonna cost you MORE time (and sanity).

Sure, Gemini is "free."

But what's your time worth?

How much is it worth to NOT have to babysit this process?

OneDuo costs $10 to $97 a month.

That's literally LESS than one hour of your time.

If you're spending MORE than one hour a month managing your VA's questions...

(And you are...)

Then you're LOSING money by not using OneDuo.

The math literally doesn't math.

Look...

I'm not gonna stop you from DIY-ing it.

If you want to spend your time managing prompts and training your VA...

Go for it.

But if you want to ACTUALLY delegate...

And never be the bottleneck again...

Then OneDuo is the way.

⇒ Watch the demo and see how simple it actually is: https://oneduo.ai/watch

Peace,

-Mario

P.S. I built OneDuo specifically BECAUSE I tried the DIY route first.

It sucked.

So I built something that doesn't suck.

You're welcome.`
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

interface CaptureRequest {
  email: string;
  first_name?: string;
  source: 'homepage' | 'vsl_page';
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, first_name, source }: CaptureRequest = await req.json();

    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: "Valid email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role for full access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if subscriber already exists
    const { data: existingSubscriber } = await supabase
      .from('email_subscribers')
      .select('id, current_tag, unsubscribed')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (existingSubscriber) {
      // If they're a customer or unsubscribed, don't restart sequence
      if (existingSubscriber.current_tag === 'customer' || existingSubscriber.unsubscribed) {
        return new Response(
          JSON.stringify({ success: true, message: "Already subscribed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Already in sequence
      return new Response(
        JSON.stringify({ success: true, message: "Already in sequence" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create new subscriber
    const now = new Date();
    const { data: newSubscriber, error: insertError } = await supabase
      .from('email_subscribers')
      .insert({
        email: email.toLowerCase().trim(),
        first_name: first_name || null,
        optin_source: source,
        optin_date: now.toISOString(),
        current_tag: 'in_sequence',
        sequence_day: 1,
        next_email_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), // Next email in 24h
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating subscriber:", insertError);
      throw insertError;
    }

    // Log tag history
    await supabase.from('tag_history').insert({
      subscriber_id: newSubscriber.id,
      old_tag: null,
      new_tag: 'in_sequence',
      reason: `New optin from ${source}`
    });

    // Send Email 1 immediately
    const greeting = first_name ? first_name : "Yo";
    const emailContent = emailSequence[0];
    
    try {
      const emailResponse = await sendEmail(
        email.toLowerCase().trim(),
        emailContent.subject,
        emailContent.body.replace(/^Yo,/, `${greeting},`)
      );

      console.log("Email 1 sent successfully:", emailResponse);

      // Log email sent
      await supabase.from('email_logs').insert({
        subscriber_id: newSubscriber.id,
        email_number: 1,
        resend_id: emailResponse?.id || null,
      });
    } catch (emailError) {
      console.error("Failed to send email 1:", emailError);
      // Don't fail the whole request if email fails
    }

    return new Response(
      JSON.stringify({ success: true, subscriber_id: newSubscriber.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in email-capture:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
