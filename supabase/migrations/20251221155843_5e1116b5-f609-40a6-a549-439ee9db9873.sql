-- Create enum types
CREATE TYPE subscriber_tag AS ENUM ('in_sequence', 'hot_lead', 'cold_lead', 'customer');
CREATE TYPE optin_source AS ENUM ('homepage', 'vsl_page');

-- Email subscribers table
CREATE TABLE public.email_subscribers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  optin_source optin_source NOT NULL DEFAULT 'homepage',
  optin_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  current_tag subscriber_tag NOT NULL DEFAULT 'in_sequence',
  sequence_day INTEGER DEFAULT 1,
  next_email_at TIMESTAMP WITH TIME ZONE,
  purchased BOOLEAN NOT NULL DEFAULT false,
  purchase_date TIMESTAMP WITH TIME ZONE,
  unsubscribed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Email logs table
CREATE TABLE public.email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscriber_id UUID NOT NULL REFERENCES public.email_subscribers(id) ON DELETE CASCADE,
  email_number INTEGER NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resend_id TEXT,
  opened BOOLEAN DEFAULT false,
  clicked BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tag history table
CREATE TABLE public.tag_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscriber_id UUID NOT NULL REFERENCES public.email_subscribers(id) ON DELETE CASCADE,
  old_tag subscriber_tag,
  new_tag subscriber_tag NOT NULL,
  reason TEXT,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Marketing settings table (for manual inputs like ad spend)
CREATE TABLE public.marketing_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Page visits tracking
CREATE TABLE public.page_visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page TEXT NOT NULL,
  visitor_id TEXT,
  source TEXT,
  visited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Mock orders table (for testing until Stripe is connected)
CREATE TABLE public.mock_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscriber_id UUID REFERENCES public.email_subscribers(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  plan TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_orders ENABLE ROW LEVEL SECURITY;

-- RLS policies - allow public optins but restrict admin access
CREATE POLICY "Anyone can subscribe" ON public.email_subscribers FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role full access to subscribers" ON public.email_subscribers FOR ALL USING (true);

CREATE POLICY "Service role full access to email_logs" ON public.email_logs FOR ALL USING (true);
CREATE POLICY "Service role full access to tag_history" ON public.tag_history FOR ALL USING (true);
CREATE POLICY "Service role full access to marketing_settings" ON public.marketing_settings FOR ALL USING (true);

CREATE POLICY "Anyone can log page visits" ON public.page_visits FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role full access to page_visits" ON public.page_visits FOR ALL USING (true);

CREATE POLICY "Anyone can create mock orders" ON public.mock_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role full access to mock_orders" ON public.mock_orders FOR ALL USING (true);

-- Create indexes for performance
CREATE INDEX idx_subscribers_email ON public.email_subscribers(email);
CREATE INDEX idx_subscribers_tag ON public.email_subscribers(current_tag);
CREATE INDEX idx_subscribers_next_email ON public.email_subscribers(next_email_at);
CREATE INDEX idx_email_logs_subscriber ON public.email_logs(subscriber_id);
CREATE INDEX idx_page_visits_page ON public.page_visits(page);
CREATE INDEX idx_page_visits_visited_at ON public.page_visits(visited_at);

-- Trigger to update updated_at
CREATE TRIGGER update_email_subscribers_updated_at
  BEFORE UPDATE ON public.email_subscribers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();