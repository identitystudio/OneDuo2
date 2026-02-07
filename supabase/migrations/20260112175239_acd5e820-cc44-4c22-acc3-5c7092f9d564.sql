-- Store cron secret in system_settings (user must set this to match CRON_SECRET env var)
INSERT INTO public.system_settings (key, value)
VALUES ('cron_poll_secret', '"REPLACE_WITH_YOUR_CRON_SECRET"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Create cron job that reads secret from system_settings
SELECT cron.schedule(
  'poll-queue-every-minute',
  '*/1 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gtfvtezmjrcsmoebuxrw.supabase.co/functions/v1/cron-poll-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT value::text FROM public.system_settings WHERE key = 'cron_poll_secret')
    ),
    body := jsonb_build_object('triggered_at', now()::text)
  );
  $$
);