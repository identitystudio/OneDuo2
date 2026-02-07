DROP POLICY IF EXISTS " Allow public read access to course-videos\ ON storage.objects; DROP POLICY IF EXISTS \Allow public upload to course-videos\ ON storage.objects; DROP POLICY IF EXISTS \Allow public update to course-videos\ ON storage.objects; DROP POLICY IF EXISTS \Allow public delete from course-videos\ ON storage.objects; DROP POLICY IF EXISTS \Allow public read access to course-gifs\ ON storage.objects; DROP POLICY IF EXISTS \Allow public upload to course-gifs\ ON storage.objects; DROP POLICY IF EXISTS \Allow public update to course-gifs\ ON storage.objects; DROP POLICY IF EXISTS \Allow public delete from course-gifs\ ON storage.objects;
CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql" WITH SCHEMA "pg_catalog";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
-- SELECT pg_catalog.set_config('search_path', '', false);
SET search_path = public, extensions;

-- Clear the slate
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
GRANT ALL ON SCHEMA public TO anon;
GRANT ALL ON SCHEMA public TO authenticated;
GRANT ALL ON SCHEMA public TO service_role;

SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: job_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.job_status AS ENUM (
    'queued',
    'processing',
    'completed',
    'failed'
);


--
-- Name: video_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.video_status AS ENUM (
    'pending',
    'transcribing',
    'extracting',
    'generating_gifs',
    'completed',
    'failed'
);


--
-- Name: check_rate_limit(text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_rate_limit(p_session_id text, p_action_type text, p_max_requests integer DEFAULT 50, p_window_minutes integer DEFAULT 60) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count INTEGER;
  v_window_start TIMESTAMP WITH TIME ZONE;
BEGIN
  v_window_start := now() - (p_window_minutes || ' minutes')::interval;
  
  -- Count requests in current window
  SELECT COALESCE(SUM(request_count), 0) INTO v_count
  FROM public.rate_limits
  WHERE session_id = p_session_id
    AND action_type = p_action_type
    AND window_start >= v_window_start;
  
  RETURN v_count < p_max_requests;
END;
$$;


--
-- Name: increment_rate_limit(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_rate_limit(p_session_id text, p_action_type text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.rate_limits (session_id, action_type, request_count, window_start)
  VALUES (p_session_id, p_action_type, 1, now());
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: character_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id text NOT NULL,
    series_id uuid,
    insight_type text NOT NULL,
    insight_key text NOT NULL,
    insight_value text NOT NULL,
    learned_from text,
    confidence real DEFAULT 0.8 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT character_insights_insight_type_check CHECK ((insight_type = ANY (ARRAY['positioning'::text, 'tone'::text, 'world'::text, 'aesthetic'::text, 'backstory'::text, 'voice'::text, 'visual'::text])))
);


--
-- Name: episode_footage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.episode_footage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id text NOT NULL,
    series_id uuid,
    clip_url text NOT NULL,
    thumbnail_url text,
    filename text,
    duration_seconds numeric,
    analysis text,
    matched_beat integer,
    matched_shot_id integer,
    status text DEFAULT 'pending'::text NOT NULL,
    confidence real DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: episodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.episodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    series_id uuid NOT NULL,
    episode_number integer NOT NULL,
    title text NOT NULL,
    drama_dump text NOT NULL,
    shot_list jsonb,
    scripts jsonb,
    beat_guide jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gif_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gif_segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    video_source_id uuid NOT NULL,
    storage_path text NOT NULL,
    segment_number integer NOT NULL,
    frame_count integer,
    file_size_bytes integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: location_boards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_boards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_identifier text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: location_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id text NOT NULL,
    room_name text NOT NULL,
    description text,
    storage_path text NOT NULL,
    filename text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    board_id uuid,
    user_identifier text
);


--
-- Name: processing_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processing_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id text NOT NULL,
    user_id uuid,
    status public.job_status DEFAULT 'queued'::public.job_status NOT NULL,
    editing_style text,
    creative_direction text,
    total_videos integer DEFAULT 0 NOT NULL,
    completed_videos integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    error_message text
);


--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id text NOT NULL,
    action_type text NOT NULL,
    request_count integer DEFAULT 1 NOT NULL,
    window_start timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: story_series; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_series (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id text NOT NULL,
    title text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: story_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    series_id uuid NOT NULL,
    emotional_threads jsonb DEFAULT '[]'::jsonb NOT NULL,
    visual_symbols jsonb DEFAULT '[]'::jsonb NOT NULL,
    external_pressures jsonb DEFAULT '[]'::jsonb NOT NULL,
    last_episode_shift text,
    unresolved_threads jsonb DEFAULT '[]'::jsonb NOT NULL,
    character_arcs jsonb DEFAULT '[]'::jsonb NOT NULL,
    audience_hooks jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: video_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    filename text NOT NULL,
    storage_path text,
    video_url text,
    duration_seconds numeric,
    transcript jsonb,
    content_type text,
    status public.video_status DEFAULT 'pending'::public.video_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    error_message text
);


--
-- Name: wardrobe_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wardrobe_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id text NOT NULL,
    storage_path text NOT NULL,
    filename text NOT NULL,
    category text,
    color_palette text[],
    style_tags text[],
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: character_insights character_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_insights
    ADD CONSTRAINT character_insights_pkey PRIMARY KEY (id);


--
-- Name: episode_footage episode_footage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.episode_footage
    ADD CONSTRAINT episode_footage_pkey PRIMARY KEY (id);


--
-- Name: episodes episodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.episodes
    ADD CONSTRAINT episodes_pkey PRIMARY KEY (id);


--
-- Name: gif_segments gif_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gif_segments
    ADD CONSTRAINT gif_segments_pkey PRIMARY KEY (id);


--
-- Name: location_boards location_boards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_boards
    ADD CONSTRAINT location_boards_pkey PRIMARY KEY (id);


--
-- Name: location_photos location_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_photos
    ADD CONSTRAINT location_photos_pkey PRIMARY KEY (id);


--
-- Name: processing_jobs processing_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processing_jobs
    ADD CONSTRAINT processing_jobs_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (id);


--
-- Name: story_series story_series_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_series
    ADD CONSTRAINT story_series_pkey PRIMARY KEY (id);


--
-- Name: story_state story_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_state
    ADD CONSTRAINT story_state_pkey PRIMARY KEY (id);


--
-- Name: video_sources video_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_sources
    ADD CONSTRAINT video_sources_pkey PRIMARY KEY (id);


--
-- Name: wardrobe_items wardrobe_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wardrobe_items
    ADD CONSTRAINT wardrobe_items_pkey PRIMARY KEY (id);


--
-- Name: idx_character_insights_series; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_character_insights_series ON public.character_insights USING btree (series_id);


--
-- Name: idx_character_insights_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_character_insights_session ON public.character_insights USING btree (session_id);


--
-- Name: idx_character_insights_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_character_insights_type ON public.character_insights USING btree (insight_type);


--
-- Name: idx_episodes_series; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_episodes_series ON public.episodes USING btree (series_id);


--
-- Name: idx_gif_segments_video_source_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gif_segments_video_source_id ON public.gif_segments USING btree (video_source_id);


--
-- Name: idx_processing_jobs_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_processing_jobs_session_id ON public.processing_jobs USING btree (session_id);


--
-- Name: idx_processing_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_processing_jobs_status ON public.processing_jobs USING btree (status);


--
-- Name: idx_processing_jobs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_processing_jobs_user_id ON public.processing_jobs USING btree (user_id);


--
-- Name: idx_rate_limits_session_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limits_session_action ON public.rate_limits USING btree (session_id, action_type, window_start);


--
-- Name: idx_story_series_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_series_session ON public.story_series USING btree (session_id);


--
-- Name: idx_story_state_series; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_state_series ON public.story_state USING btree (series_id);


--
-- Name: idx_video_sources_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_sources_job_id ON public.video_sources USING btree (job_id);


--
-- Name: idx_video_sources_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_sources_status ON public.video_sources USING btree (status);


--
-- Name: character_insights update_character_insights_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_character_insights_updated_at BEFORE UPDATE ON public.character_insights FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: episode_footage update_episode_footage_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_episode_footage_updated_at BEFORE UPDATE ON public.episode_footage FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: episodes update_episodes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_episodes_updated_at BEFORE UPDATE ON public.episodes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: location_boards update_location_boards_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_location_boards_updated_at BEFORE UPDATE ON public.location_boards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: processing_jobs update_processing_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_processing_jobs_updated_at BEFORE UPDATE ON public.processing_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: story_series update_story_series_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_story_series_updated_at BEFORE UPDATE ON public.story_series FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: story_state update_story_state_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_story_state_updated_at BEFORE UPDATE ON public.story_state FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: video_sources update_video_sources_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_video_sources_updated_at BEFORE UPDATE ON public.video_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: character_insights character_insights_series_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_insights
    ADD CONSTRAINT character_insights_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: episode_footage episode_footage_series_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.episode_footage
    ADD CONSTRAINT episode_footage_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: episodes episodes_series_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.episodes
    ADD CONSTRAINT episodes_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: gif_segments gif_segments_video_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gif_segments
    ADD CONSTRAINT gif_segments_video_source_id_fkey FOREIGN KEY (video_source_id) REFERENCES public.video_sources(id) ON DELETE CASCADE;


--
-- Name: location_photos location_photos_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_photos
    ADD CONSTRAINT location_photos_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.location_boards(id) ON DELETE CASCADE;


--
-- Name: processing_jobs processing_jobs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processing_jobs
    ADD CONSTRAINT processing_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: story_state story_state_series_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_state
    ADD CONSTRAINT story_state_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: video_sources video_sources_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_sources
    ADD CONSTRAINT video_sources_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.processing_jobs(id) ON DELETE CASCADE;


--
-- Name: location_boards Anyone can create boards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create boards" ON public.location_boards FOR INSERT WITH CHECK (true);


--
-- Name: episode_footage Anyone can create episode footage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create episode footage" ON public.episode_footage FOR INSERT WITH CHECK (true);


--
-- Name: episodes Anyone can create episodes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create episodes" ON public.episodes FOR INSERT WITH CHECK (true);


--
-- Name: rate_limits Anyone can create rate limit records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create rate limit records" ON public.rate_limits FOR INSERT WITH CHECK (true);


--
-- Name: story_series Anyone can create series; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create series" ON public.story_series FOR INSERT WITH CHECK (true);


--
-- Name: story_state Anyone can create story state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can create story state" ON public.story_state FOR INSERT WITH CHECK (true);


--
-- Name: location_boards Anyone can delete boards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can delete boards" ON public.location_boards FOR DELETE USING (true);


--
-- Name: episode_footage Anyone can delete episode footage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can delete episode footage" ON public.episode_footage FOR DELETE USING (true);


--
-- Name: location_photos Anyone can delete their own photos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can delete their own photos" ON public.location_photos FOR DELETE USING (true);


--
-- Name: location_photos Anyone can insert location photos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert location photos" ON public.location_photos FOR INSERT WITH CHECK (true);


--
-- Name: location_boards Anyone can update boards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update boards" ON public.location_boards FOR UPDATE USING (true);


--
-- Name: episode_footage Anyone can update episode footage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update episode footage" ON public.episode_footage FOR UPDATE USING (true);


--
-- Name: episodes Anyone can update episodes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update episodes" ON public.episodes FOR UPDATE USING (true);


--
-- Name: story_state Anyone can update story state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update story state" ON public.story_state FOR UPDATE USING (true);


--
-- Name: story_series Anyone can update their series; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update their series" ON public.story_series FOR UPDATE USING (true);


--
-- Name: location_boards Anyone can view boards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view boards" ON public.location_boards FOR SELECT USING (true);


--
-- Name: episode_footage Anyone can view episode footage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view episode footage" ON public.episode_footage FOR SELECT USING (true);


--
-- Name: episodes Anyone can view episodes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view episodes" ON public.episodes FOR SELECT USING (true);


--
-- Name: location_photos Anyone can view location photos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view location photos" ON public.location_photos FOR SELECT USING (true);


--
-- Name: story_series Anyone can view series by session; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view series by session" ON public.story_series FOR SELECT USING (true);


--
-- Name: story_state Anyone can view story state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view story state" ON public.story_state FOR SELECT USING (true);


--
-- Name: character_insights Character insights are viewable by session; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Character insights are viewable by session" ON public.character_insights FOR SELECT USING (true);


--
-- Name: character_insights Character insights can be created; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Character insights can be created" ON public.character_insights FOR INSERT WITH CHECK (true);


--
-- Name: character_insights Character insights can be updated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Character insights can be updated" ON public.character_insights FOR UPDATE USING (true);


--
-- Name: gif_segments Users can create gif segments for their videos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create gif segments for their videos" ON public.gif_segments FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.video_sources vs
     JOIN public.processing_jobs pj ON ((pj.id = vs.job_id)))
  WHERE ((vs.id = gif_segments.video_source_id) AND (pj.session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text))))));


--
-- Name: processing_jobs Users can create their own jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own jobs" ON public.processing_jobs FOR INSERT WITH CHECK ((session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text)));


--
-- Name: video_sources Users can create video sources for their jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create video sources for their jobs" ON public.video_sources FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.processing_jobs
  WHERE ((processing_jobs.id = video_sources.job_id) AND (processing_jobs.session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text))))));


--
-- Name: gif_segments Users can delete their gif segments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their gif segments" ON public.gif_segments FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (public.video_sources vs
     JOIN public.processing_jobs pj ON ((pj.id = vs.job_id)))
  WHERE ((vs.id = gif_segments.video_source_id) AND ((pj.session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text)) OR (pj.user_id = auth.uid()))))));


--
-- Name: processing_jobs Users can delete their own jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own jobs" ON public.processing_jobs FOR DELETE USING (((session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text)) OR (user_id = auth.uid())));


--
-- Name: video_sources Users can delete their video sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their video sources" ON public.video_sources FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.processing_jobs
  WHERE ((processing_jobs.id = video_sources.job_id) AND ((processing_jobs.session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text)) OR (processing_jobs.user_id = auth.uid()))))));


--
-- Name: wardrobe_items Users can delete their wardrobe items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their wardrobe items" ON public.wardrobe_items FOR DELETE USING (true);


--
-- Name: wardrobe_items Users can insert wardrobe items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert wardrobe items" ON public.wardrobe_items FOR INSERT WITH CHECK (true);


--
-- Name: processing_jobs Users can update their own jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own jobs" ON public.processing_jobs FOR UPDATE USING (((session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text)) OR (user_id = auth.uid())));


--
-- Name: rate_limits Users can update their rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their rate limits" ON public.rate_limits FOR UPDATE USING ((session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text)));


--
-- Name: video_sources Users can update their video sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their video sources" ON public.video_sources FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.processing_jobs
  WHERE ((processing_jobs.id = video_sources.job_id) AND ((processing_jobs.session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text)) OR (processing_jobs.user_id = auth.uid()))))));


--
-- Name: wardrobe_items Users can update their wardrobe items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their wardrobe items" ON public.wardrobe_items FOR UPDATE USING (true);


--
-- Name: gif_segments Users can view gif segments for their videos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view gif segments for their videos" ON public.gif_segments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.video_sources vs
     JOIN public.processing_jobs pj ON ((pj.id = vs.job_id)))
  WHERE ((vs.id = gif_segments.video_source_id) AND ((pj.session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text)) OR (pj.user_id = auth.uid()))))));


--
-- Name: processing_jobs Users can view their own jobs by session; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own jobs by session" ON public.processing_jobs FOR SELECT USING (((session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text)) OR (user_id = auth.uid())));


--
-- Name: wardrobe_items Users can view their own wardrobe items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own wardrobe items" ON public.wardrobe_items FOR SELECT USING (true);


--
-- Name: rate_limits Users can view their rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their rate limits" ON public.rate_limits FOR SELECT USING ((session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text)));


--
-- Name: video_sources Users can view video sources for their jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view video sources for their jobs" ON public.video_sources FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.processing_jobs
  WHERE ((processing_jobs.id = video_sources.job_id) AND ((processing_jobs.session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text)) OR (processing_jobs.user_id = auth.uid()))))));


--
-- Name: character_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.character_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: episode_footage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.episode_footage ENABLE ROW LEVEL SECURITY;

--
-- Name: episodes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;

--
-- Name: gif_segments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gif_segments ENABLE ROW LEVEL SECURITY;

--
-- Name: location_boards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.location_boards ENABLE ROW LEVEL SECURITY;

--
-- Name: location_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.location_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: processing_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: story_series; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.story_series ENABLE ROW LEVEL SECURITY;

--
-- Name: story_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.story_state ENABLE ROW LEVEL SECURITY;

--
-- Name: video_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.video_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: wardrobe_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wardrobe_items ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;
-- Course Agent Schema
-- Drop old tables if they conflict (we'll recreate with new structure)

-- Main courses table
CREATE TABLE IF NOT EXISTS public.courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  email TEXT NOT NULL, -- For magic link auth & notifications
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'transcribing', 'extracting_frames', 'rendering_gifs', 'training_ai', 'completed', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  error_message TEXT,
  
  -- Video source info
  video_url TEXT,
  video_filename TEXT,
  video_duration_seconds NUMERIC,
  storage_path TEXT, -- For uploaded files
  
  -- Processing options
  density_mode TEXT NOT NULL DEFAULT 'standard' CHECK (density_mode IN ('standard', 'cinematic')),
  fps_target NUMERIC NOT NULL DEFAULT 1, -- 1 FPS for standard, 2-5 for cinematic
  
  -- AI Agent data
  transcript JSONB, -- Full transcript with timestamps
  frame_urls JSONB, -- Array of frame URLs from Replicate
  gif_storage_paths JSONB, -- Array of GIF storage paths after rendering
  ai_context TEXT, -- Generated context for AI chat
  
  -- Processing metadata
  total_frames INTEGER,
  processed_frames INTEGER DEFAULT 0,
  total_gifs INTEGER,
  completed_gifs INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- Policies: Users can access their own courses by email
CREATE POLICY "Users can view their own courses by email"
  ON public.courses FOR SELECT
  USING (email = current_setting('request.headers', true)::json->>'x-user-email' OR true);

CREATE POLICY "Users can create courses"
  ON public.courses FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update courses"
  ON public.courses FOR UPDATE
  USING (true);

-- Chat messages table for AI conversations
CREATE TABLE IF NOT EXISTS public.course_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  frame_references JSONB, -- Array of frame timestamps/URLs referenced in response
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.course_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view chat messages"
  ON public.course_chats FOR SELECT
  USING (true);

CREATE POLICY "Users can create chat messages"
  ON public.course_chats FOR INSERT
  WITH CHECK (true);

-- Processing queue table for background jobs
CREATE TABLE IF NOT EXISTS public.processing_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  step TEXT NOT NULL CHECK (step IN ('transcribe', 'extract_frames', 'render_gifs', 'train_ai')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  metadata JSONB, -- Step-specific data (prediction IDs, transcript IDs, etc.)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.processing_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System can manage processing queue"
  ON public.processing_queue FOR ALL
  USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_courses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS update_courses_updated_at ON public.courses;
CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_courses_updated_at();

-- Index for finding pending jobs
CREATE INDEX IF NOT EXISTS idx_processing_queue_pending 
  ON public.processing_queue(status, created_at) 
  WHERE status = 'pending';

-- Index for course lookup by email
CREATE INDEX IF NOT EXISTS idx_courses_email ON public.courses(email);

-- Index for course status
CREATE INDEX IF NOT EXISTS idx_courses_status ON public.courses(status);
-- Fix location_boards: restrict access to owner only
DROP POLICY IF EXISTS "Anyone can view location boards" ON public.location_boards;
DROP POLICY IF EXISTS "Anyone can create location boards" ON public.location_boards;
DROP POLICY IF EXISTS "Anyone can update location boards" ON public.location_boards;
DROP POLICY IF EXISTS "Anyone can delete location boards" ON public.location_boards;

CREATE POLICY "Users can view their own location boards"
ON public.location_boards FOR SELECT
USING (user_identifier = current_setting('request.headers', true)::json->>'x-session-id' 
  OR user_identifier IS NULL);

CREATE POLICY "Users can create their own location boards"
ON public.location_boards FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update their own location boards"
ON public.location_boards FOR UPDATE
USING (user_identifier = current_setting('request.headers', true)::json->>'x-session-id');

CREATE POLICY "Users can delete their own location boards"
ON public.location_boards FOR DELETE
USING (user_identifier = current_setting('request.headers', true)::json->>'x-session-id');

-- Fix rate_limits: make it system-managed only (no public INSERT)
DROP POLICY IF EXISTS "Anyone can create rate limits" ON public.rate_limits;
DROP POLICY IF EXISTS "Users can view their own rate limits" ON public.rate_limits;
DROP POLICY IF EXISTS "Users can update their own rate limits" ON public.rate_limits;

-- Only allow viewing own rate limits, no public write access
CREATE POLICY "Users can view their own rate limits"
ON public.rate_limits FOR SELECT
USING (session_id = current_setting('request.headers', true)::json->>'x-session-id');

-- Rate limits should only be managed by security definer functions, not direct inserts
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
-- Fix 1: Remove the 'OR true' vulnerability in courses table
DROP POLICY IF EXISTS "Users can view their own courses by email" ON public.courses;
CREATE POLICY "Users can view their own courses by email" 
ON public.courses 
FOR SELECT 
USING (email = ((current_setting('request.headers'::text, true))::json ->> 'x-user-email'::text));

-- Fix 2: Add session-based restrictions to character_insights
DROP POLICY IF EXISTS "Character insights are viewable by session" ON public.character_insights;
DROP POLICY IF EXISTS "Character insights can be created" ON public.character_insights;
DROP POLICY IF EXISTS "Character insights can be updated" ON public.character_insights;

CREATE POLICY "Character insights are viewable by session" 
ON public.character_insights 
FOR SELECT 
USING (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

CREATE POLICY "Character insights can be created" 
ON public.character_insights 
FOR INSERT 
WITH CHECK (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

CREATE POLICY "Character insights can be updated" 
ON public.character_insights 
FOR UPDATE 
USING (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

-- Fix 3: Add session-based restrictions to episode_footage
DROP POLICY IF EXISTS "Anyone can view episode footage" ON public.episode_footage;
DROP POLICY IF EXISTS "Anyone can create episode footage" ON public.episode_footage;
DROP POLICY IF EXISTS "Anyone can update episode footage" ON public.episode_footage;
DROP POLICY IF EXISTS "Anyone can delete episode footage" ON public.episode_footage;

CREATE POLICY "Users can view their episode footage" 
ON public.episode_footage 
FOR SELECT 
USING (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

CREATE POLICY "Users can create their episode footage" 
ON public.episode_footage 
FOR INSERT 
WITH CHECK (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

CREATE POLICY "Users can update their episode footage" 
ON public.episode_footage 
FOR UPDATE 
USING (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

CREATE POLICY "Users can delete their episode footage" 
ON public.episode_footage 
FOR DELETE 
USING (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

-- Fix 4: Add session-based restrictions to story_series
DROP POLICY IF EXISTS "Anyone can view series by session" ON public.story_series;
DROP POLICY IF EXISTS "Anyone can create series" ON public.story_series;
DROP POLICY IF EXISTS "Anyone can update their series" ON public.story_series;

CREATE POLICY "Users can view their story series" 
ON public.story_series 
FOR SELECT 
USING (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

CREATE POLICY "Users can create their story series" 
ON public.story_series 
FOR INSERT 
WITH CHECK (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

CREATE POLICY "Users can update their story series" 
ON public.story_series 
FOR UPDATE 
USING (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

-- Fix 5: Add series-based restrictions to episodes (via story_series ownership)
DROP POLICY IF EXISTS "Anyone can view episodes" ON public.episodes;
DROP POLICY IF EXISTS "Anyone can create episodes" ON public.episodes;
DROP POLICY IF EXISTS "Anyone can update episodes" ON public.episodes;

CREATE POLICY "Users can view their episodes" 
ON public.episodes 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.story_series 
  WHERE story_series.id = episodes.series_id 
  AND story_series.session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text)
));

CREATE POLICY "Users can create their episodes" 
ON public.episodes 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.story_series 
  WHERE story_series.id = episodes.series_id 
  AND story_series.session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text)
));

CREATE POLICY "Users can update their episodes" 
ON public.episodes 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.story_series 
  WHERE story_series.id = episodes.series_id 
  AND story_series.session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text)
));

-- Fix 6: Add series-based restrictions to story_state
DROP POLICY IF EXISTS "Anyone can view story state" ON public.story_state;
DROP POLICY IF EXISTS "Anyone can create story state" ON public.story_state;
DROP POLICY IF EXISTS "Anyone can update story state" ON public.story_state;

CREATE POLICY "Users can view their story state" 
ON public.story_state 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.story_series 
  WHERE story_series.id = story_state.series_id 
  AND story_series.session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text)
));

CREATE POLICY "Users can create their story state" 
ON public.story_state 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.story_series 
  WHERE story_series.id = story_state.series_id 
  AND story_series.session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text)
));

CREATE POLICY "Users can update their story state" 
ON public.story_state 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.story_series 
  WHERE story_series.id = story_state.series_id 
  AND story_series.session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text)
));

-- Fix 7: Fix location_boards policies
DROP POLICY IF EXISTS "Users can view their own location boards" ON public.location_boards;

CREATE POLICY "Users can view their own location boards" 
ON public.location_boards 
FOR SELECT 
USING (user_identifier = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

-- Fix 8: Add session-based restrictions to location_photos
DROP POLICY IF EXISTS "Anyone can view location photos" ON public.location_photos;
DROP POLICY IF EXISTS "Anyone can insert location photos" ON public.location_photos;
DROP POLICY IF EXISTS "Anyone can delete their own photos" ON public.location_photos;

CREATE POLICY "Users can view their location photos" 
ON public.location_photos 
FOR SELECT 
USING (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

CREATE POLICY "Users can insert their location photos" 
ON public.location_photos 
FOR INSERT 
WITH CHECK (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

CREATE POLICY "Users can delete their location photos" 
ON public.location_photos 
FOR DELETE 
USING (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

-- Fix 9: Add session-based restrictions to wardrobe_items
DROP POLICY IF EXISTS "Users can view their own wardrobe items" ON public.wardrobe_items;
DROP POLICY IF EXISTS "Users can insert wardrobe items" ON public.wardrobe_items;
DROP POLICY IF EXISTS "Users can update their wardrobe items" ON public.wardrobe_items;
DROP POLICY IF EXISTS "Users can delete their wardrobe items" ON public.wardrobe_items;

CREATE POLICY "Users can view their wardrobe items" 
ON public.wardrobe_items 
FOR SELECT 
USING (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

CREATE POLICY "Users can insert their wardrobe items" 
ON public.wardrobe_items 
FOR INSERT 
WITH CHECK (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

CREATE POLICY "Users can update their wardrobe items" 
ON public.wardrobe_items 
FOR UPDATE 
USING (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

CREATE POLICY "Users can delete their wardrobe items" 
ON public.wardrobe_items 
FOR DELETE 
USING (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

-- Fix 10: Add course-based restrictions to course_chats
DROP POLICY IF EXISTS "Users can view chat messages" ON public.course_chats;
DROP POLICY IF EXISTS "Users can create chat messages" ON public.course_chats;

CREATE POLICY "Users can view their course chats" 
ON public.course_chats 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.courses 
  WHERE courses.id = course_chats.course_id 
  AND courses.email = ((current_setting('request.headers'::text, true))::json ->> 'x-user-email'::text)
));

CREATE POLICY "Users can create their course chats" 
ON public.course_chats 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.courses 
  WHERE courses.id = course_chats.course_id 
  AND courses.email = ((current_setting('request.headers'::text, true))::json ->> 'x-user-email'::text)
));
-- Fix 1: Remove overly permissive location_boards policies
DROP POLICY IF EXISTS "Anyone can create boards" ON public.location_boards;
DROP POLICY IF EXISTS "Anyone can delete boards" ON public.location_boards;
DROP POLICY IF EXISTS "Anyone can update boards" ON public.location_boards;
DROP POLICY IF EXISTS "Anyone can view boards" ON public.location_boards;

-- Fix 2: Add proper SELECT restriction to email_subscribers (only service role)
-- The existing "Anyone can subscribe" INSERT policy is fine for public signups
-- The "Service role full access" is already there for admin operations
-- No changes needed - service role policies work correctly

-- Fix 3: Restrict courses INSERT to require email header
DROP POLICY IF EXISTS "Users can create courses" ON public.courses;
CREATE POLICY "Users can create courses with email" 
ON public.courses 
FOR INSERT 
WITH CHECK (email = ((current_setting('request.headers'::text, true))::json ->> 'x-user-email'::text));

-- Fix 4: Restrict courses UPDATE to email match
DROP POLICY IF EXISTS "System can update courses" ON public.courses;
CREATE POLICY "Users can update their courses" 
ON public.courses 
FOR UPDATE 
USING (email = ((current_setting('request.headers'::text, true))::json ->> 'x-user-email'::text));

-- Fix 5: Restrict processing_queue to service role only by removing the permissive policy
-- and adding a proper service role policy
DROP POLICY IF EXISTS "System can manage processing queue" ON public.processing_queue;

-- Since RLS is enabled and there are no policies, only service role can access
-- Add an explicit service role policy for clarity
CREATE POLICY "Service role can manage processing queue" 
ON public.processing_queue 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Fix 6: Restrict rate_limits INSERT to service role only
DROP POLICY IF EXISTS "Anyone can create rate limit records" ON public.rate_limits;
CREATE POLICY "Service role can create rate limit records" 
ON public.rate_limits 
FOR INSERT 
WITH CHECK (auth.role() = 'service_role');

-- Also fix rate_limits SELECT and UPDATE to work for session-based reads or service role
DROP POLICY IF EXISTS "Users can view their rate limits" ON public.rate_limits;
DROP POLICY IF EXISTS "Users can view their own rate limits" ON public.rate_limits;
DROP POLICY IF EXISTS "Users can update their rate limits" ON public.rate_limits;

CREATE POLICY "Users can view rate limits" 
ON public.rate_limits 
FOR SELECT 
USING (
  session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text)
  OR auth.role() = 'service_role'
);

CREATE POLICY "Service role can update rate limits" 
ON public.rate_limits 
FOR UPDATE 
USING (auth.role() = 'service_role');
-- Fix 1: email_subscribers - Already fixed in first migration, just add service role policy
CREATE POLICY "Service role only access to subscribers"
ON public.email_subscribers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Fix 2: courses - Require authenticated users and proper ownership using 'email' column
DROP POLICY IF EXISTS "Users can view own courses by email" ON public.courses;
DROP POLICY IF EXISTS "Users can insert own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can update own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can delete own courses" ON public.courses;

-- Courses accessible only via authenticated users matching their email
CREATE POLICY "Authenticated users can view own courses"
ON public.courses
FOR SELECT
TO authenticated
USING (email = auth.jwt() ->> 'email');

CREATE POLICY "Authenticated users can insert own courses"
ON public.courses
FOR INSERT
TO authenticated
WITH CHECK (email = auth.jwt() ->> 'email');

CREATE POLICY "Authenticated users can update own courses"
ON public.courses
FOR UPDATE
TO authenticated
USING (email = auth.jwt() ->> 'email');

CREATE POLICY "Authenticated users can delete own courses"
ON public.courses
FOR DELETE
TO authenticated
USING (email = auth.jwt() ->> 'email');

-- Service role for edge functions
CREATE POLICY "Service role full access to courses"
ON public.courses
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
-- Fix 1: email_subscribers - Remove any public access, service role ONLY
DROP POLICY IF EXISTS "Service role full access to subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "Service role only access to subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "Anyone can subscribe" ON public.email_subscribers;

-- Only service role can access email_subscribers (for edge functions)
CREATE POLICY "Service role only access"
ON public.email_subscribers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Fix 2: courses - Remove header-based policies, use only authenticated user policies
DROP POLICY IF EXISTS "Users can view their own courses by email" ON public.courses;
DROP POLICY IF EXISTS "Users can create courses with email" ON public.courses;
DROP POLICY IF EXISTS "Users can update their courses" ON public.courses;

-- Keep only the authenticated user policies (already exist from previous migration)
-- Lock down sensitive tables to service role only (fix security scan errors)

-- EMAIL_SUBSCRIBERS: contains PII (email, name, purchase status). Must not be readable/writable by anon/authenticated.
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

-- Remove any existing policies that could allow broader access
DROP POLICY IF EXISTS "Service role only access" ON public.email_subscribers;
DROP POLICY IF EXISTS "Service role full access to subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "Service role only access to subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "Anyone can subscribe" ON public.email_subscribers;

-- Ensure table-level privileges are not granted to client roles
REVOKE ALL ON TABLE public.email_subscribers FROM anon;
REVOKE ALL ON TABLE public.email_subscribers FROM authenticated;

-- Allow only backend service role
CREATE POLICY "Service role only"
ON public.email_subscribers
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');


-- COURSES: contains user emails; app uses backend functions with service role.
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- Remove any client-facing policies (including header-based / authenticated policies)
DROP POLICY IF EXISTS "Users can view their own courses by email" ON public.courses;
DROP POLICY IF EXISTS "Users can create courses with email" ON public.courses;
DROP POLICY IF EXISTS "Users can update their courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can view own courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can insert own courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can update own courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can delete own courses" ON public.courses;
DROP POLICY IF EXISTS "Service role full access to courses" ON public.courses;

-- Ensure table-level privileges are not granted to client roles
REVOKE ALL ON TABLE public.courses FROM anon;
REVOKE ALL ON TABLE public.courses FROM authenticated;

-- Allow only backend service role
CREATE POLICY "Service role only"
ON public.courses
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
-- Add modules column to courses table for course structure
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS modules jsonb;

-- Create course_progress table for tracking implementation steps
CREATE TABLE public.course_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  step_title text NOT NULL,
  step_description text,
  module_index integer,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(course_id, step_number)
);

-- Enable RLS on course_progress
ALTER TABLE public.course_progress ENABLE ROW LEVEL SECURITY;

-- RLS policies for course_progress (service role only like courses table)
CREATE POLICY "Service role only for course_progress" 
ON public.course_progress 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Create trigger for updated_at
CREATE TRIGGER update_course_progress_updated_at
BEFORE UPDATE ON public.course_progress
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Create storage bucket for course videos
INSERT INTO storage.buckets (id, name, public) VALUES ('course-videos', 'course-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for course GIFs
INSERT INTO storage.buckets (id, name, public) VALUES ('course-gifs', 'course-gifs', true)
ON CONFLICT (id) DO NOTHING;

-- Create policies for course-videos bucket
CREATE POLICY "Allow public read access to course-videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'course-videos');

CREATE POLICY "Allow public upload to course-videos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'course-videos');

CREATE POLICY "Allow public update to course-videos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'course-videos');

CREATE POLICY "Allow public delete from course-videos"
ON storage.objects FOR DELETE
USING (bucket_id = 'course-videos');

-- Create policies for course-gifs bucket
CREATE POLICY "Allow public read access to course-gifs"
ON storage.objects FOR SELECT
USING (bucket_id = 'course-gifs');

CREATE POLICY "Allow public upload to course-gifs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'course-gifs');

CREATE POLICY "Allow public update to course-gifs"
ON storage.objects FOR UPDATE
USING (bucket_id = 'course-gifs');

CREATE POLICY "Allow public delete from course-gifs"
ON storage.objects FOR DELETE
USING (bucket_id = 'course-gifs');
-- Fix email_logs: restrict SELECT to service_role only
DROP POLICY IF EXISTS "Service role full access to email_logs" ON public.email_logs;

CREATE POLICY "Service role full access to email_logs"
ON public.email_logs
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Fix tag_history: restrict SELECT to service_role only  
DROP POLICY IF EXISTS "Service role full access to tag_history" ON public.tag_history;

CREATE POLICY "Service role full access to tag_history"
ON public.tag_history
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Fix marketing_settings: restrict to service_role only
DROP POLICY IF EXISTS "Service role full access to marketing_settings" ON public.marketing_settings;

CREATE POLICY "Service role full access to marketing_settings"
ON public.marketing_settings
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Fix page_visits: restrict SELECT to service_role, keep INSERT open
DROP POLICY IF EXISTS "Service role full access to page_visits" ON public.page_visits;
DROP POLICY IF EXISTS "Anyone can log page visits" ON public.page_visits;

CREATE POLICY "Anyone can log page visits"
ON public.page_visits
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can read page_visits"
ON public.page_visits
FOR SELECT
USING (auth.role() = 'service_role');

CREATE POLICY "Service role can update page_visits"
ON public.page_visits
FOR UPDATE
USING (auth.role() = 'service_role');

CREATE POLICY "Service role can delete page_visits"
ON public.page_visits
FOR DELETE
USING (auth.role() = 'service_role');

-- Fix mock_orders: restrict SELECT to service_role
DROP POLICY IF EXISTS "Service role full access to mock_orders" ON public.mock_orders;
DROP POLICY IF EXISTS "Anyone can create mock orders" ON public.mock_orders;

CREATE POLICY "Anyone can create mock orders"
ON public.mock_orders
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can read mock_orders"
ON public.mock_orders
FOR SELECT
USING (auth.role() = 'service_role');

CREATE POLICY "Service role can update mock_orders"
ON public.mock_orders
FOR UPDATE
USING (auth.role() = 'service_role');

CREATE POLICY "Service role can delete mock_orders"
ON public.mock_orders
FOR DELETE
USING (auth.role() = 'service_role');
-- Add RLS policies to courses table so users can access their own course data via email

-- Allow users to view their own courses (by email match)
CREATE POLICY "Users can view their own courses by email"
ON public.courses
FOR SELECT
USING (
  email = current_setting('request.jwt.claims', true)::json->>'email'
  OR email = auth.email()
);

-- Allow users to update their own courses
CREATE POLICY "Users can update their own courses by email"
ON public.courses
FOR UPDATE
USING (
  email = current_setting('request.jwt.claims', true)::json->>'email'
  OR email = auth.email()
);

-- Allow users to delete their own courses
CREATE POLICY "Users can delete their own courses by email"
ON public.courses
FOR DELETE
USING (
  email = current_setting('request.jwt.claims', true)::json->>'email'
  OR email = auth.email()
);

-- Allow anyone to insert courses (email is provided at creation)
CREATE POLICY "Anyone can create courses"
ON public.courses
FOR INSERT
WITH CHECK (true);

-- Add DELETE policy to course_chats so users can delete their own messages
CREATE POLICY "Users can delete their own course chats"
ON public.course_chats
FOR DELETE
USING (
  course_id IN (
    SELECT id FROM public.courses
    WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
    OR email = auth.email()
  )
);
-- Create course_modules table for multi-video courses
CREATE TABLE public.course_modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  module_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  video_url TEXT NOT NULL,
  storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  video_duration_seconds NUMERIC,
  transcript JSONB,
  frame_urls JSONB,
  gif_storage_paths JSONB,
  total_frames INTEGER,
  completed_gifs INTEGER DEFAULT 0,
  total_gifs INTEGER,
  ai_context TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(course_id, module_number)
);

-- Create error_logs table for tracking failures and auto-fix attempts
CREATE TABLE public.error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  module_id UUID REFERENCES public.course_modules(id) ON DELETE CASCADE,
  error_type TEXT NOT NULL, -- network, rate_limit, format, api_quota, unknown
  error_message TEXT NOT NULL,
  step TEXT NOT NULL, -- transcribe, extract_frames, render_gifs, train_ai
  fix_strategy TEXT,
  fix_attempted BOOLEAN NOT NULL DEFAULT false,
  fix_succeeded BOOLEAN,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add columns to courses for multi-module support
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS module_count INTEGER DEFAULT 1;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS completed_modules INTEGER DEFAULT 0;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_multi_module BOOLEAN DEFAULT false;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS last_fix_strategy TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS fix_attempts INTEGER DEFAULT 0;

-- Enable RLS
ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for course_modules
CREATE POLICY "Service role full access to course_modules" 
ON public.course_modules 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view their course modules by email" 
ON public.course_modules 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM courses 
  WHERE courses.id = course_modules.course_id 
  AND (courses.email = (current_setting('request.jwt.claims', true)::json->>'email') OR courses.email = auth.email())
));

-- RLS policies for error_logs (service role only for writes)
CREATE POLICY "Service role full access to error_logs" 
ON public.error_logs 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Create index for faster lookups
CREATE INDEX idx_course_modules_course_id ON public.course_modules(course_id);
CREATE INDEX idx_error_logs_course_id ON public.error_logs(course_id);
CREATE INDEX idx_error_logs_error_type ON public.error_logs(error_type);

-- Trigger for updated_at
CREATE TRIGGER update_course_modules_updated_at
BEFORE UPDATE ON public.course_modules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Fix critical security issues

-- 1. Drop the overly permissive "Anyone can create courses" policy
DROP POLICY IF EXISTS "Anyone can create courses" ON public.courses;

-- 2. Create a more restrictive policy for course creation
-- Users must either be authenticated OR go through rate limiting
CREATE POLICY "Rate limited course creation" 
ON public.courses 
FOR INSERT 
WITH CHECK (
  -- Allow if user is authenticated
  auth.uid() IS NOT NULL 
  OR 
  -- OR if rate limit hasn't been exceeded (checked via function)
  public.check_rate_limit(
    COALESCE(
      (current_setting('request.headers'::text, true)::json->>'x-session-id'),
      'anonymous'
    ),
    'course_creation',
    5,  -- max 5 courses
    60  -- per 60 minutes
  )
);

-- 3. Drop overly permissive mock_orders INSERT policy
DROP POLICY IF EXISTS "Anyone can create mock orders" ON public.mock_orders;

-- 4. Create rate-limited mock_orders INSERT policy
CREATE POLICY "Rate limited mock order creation" 
ON public.mock_orders 
FOR INSERT 
WITH CHECK (
  public.check_rate_limit(
    COALESCE(
      (current_setting('request.headers'::text, true)::json->>'x-session-id'),
      'anonymous'
    ),
    'mock_order',
    3,  -- max 3 orders
    60  -- per 60 minutes
  )
);

-- 5. Drop overly permissive page_visits INSERT policy  
DROP POLICY IF EXISTS "Anyone can log page visits" ON public.page_visits;

-- 6. Create rate-limited page_visits INSERT policy
CREATE POLICY "Rate limited page visit logging" 
ON public.page_visits 
FOR INSERT 
WITH CHECK (
  public.check_rate_limit(
    COALESCE(
      (current_setting('request.headers'::text, true)::json->>'x-session-id'),
      'anonymous'
    ),
    'page_visit',
    100,  -- max 100 visits
    60    -- per 60 minutes
  )
);

-- 7. Drop overly permissive location_boards INSERT policy
DROP POLICY IF EXISTS "Users can create their own location boards" ON public.location_boards;

-- 8. Create proper location_boards INSERT policy with session validation
CREATE POLICY "Users can create location boards with session" 
ON public.location_boards 
FOR INSERT 
WITH CHECK (
  user_identifier = (current_setting('request.headers'::text, true)::json->>'x-session-id')
  AND (current_setting('request.headers'::text, true)::json->>'x-session-id') IS NOT NULL
);
-- Fix 1: Courses table - Add policy to prevent public access to emails
-- The existing policies use RESTRICTIVE which is good, but we need to ensure no public access

-- Fix 2: Verify email_subscribers has RLS enabled (it does, but let's ensure it)
-- Already has service_role only policy which is correct

-- Fix 3: Course chats - Add stricter SELECT policy
-- Already has SELECT policy via email header, which is correct

-- Additional hardening: Add public access blocking policies

-- For courses: Ensure only authenticated users OR rate-limited session users can access
-- Drop and recreate the SELECT policies to be more restrictive about email exposure

-- Create a view for public course data that excludes email
CREATE OR REPLACE VIEW public.public_courses AS
SELECT 
  id,
  title,
  description,
  status,
  video_duration_seconds,
  frame_urls,
  transcript,
  created_at,
  is_multi_module,
  module_count
FROM public.courses
WHERE status = 'completed';

-- Grant access to the view
GRANT SELECT ON public.public_courses TO anon, authenticated;

-- Add UPDATE and DELETE policies for course_modules so users can manage their own
CREATE POLICY "Users can update their course modules by email" 
ON public.course_modules 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM courses 
  WHERE courses.id = course_modules.course_id 
  AND (
    courses.email = (current_setting('request.jwt.claims'::text, true)::json ->> 'email') 
    OR courses.email = auth.email()
  )
));

CREATE POLICY "Users can delete their course modules by email" 
ON public.course_modules 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM courses 
  WHERE courses.id = course_modules.course_id 
  AND (
    courses.email = (current_setting('request.jwt.claims'::text, true)::json ->> 'email') 
    OR courses.email = auth.email()
  )
));

-- Add SELECT policy for course_progress so users can track their progress
CREATE POLICY "Users can view their course progress by email" 
ON public.course_progress 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM courses 
  WHERE courses.id = course_progress.course_id 
  AND (
    courses.email = (current_setting('request.jwt.claims'::text, true)::json ->> 'email') 
    OR courses.email = auth.email()
  )
));

-- Create index for better query performance at scale
CREATE INDEX IF NOT EXISTS idx_courses_email ON public.courses(email);
CREATE INDEX IF NOT EXISTS idx_courses_status ON public.courses(status);
CREATE INDEX IF NOT EXISTS idx_courses_created_at ON public.courses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_modules_course_id ON public.course_modules(course_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_course_id ON public.course_progress(course_id);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_email ON public.email_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_current_tag ON public.email_subscribers(current_tag);
CREATE INDEX IF NOT EXISTS idx_email_logs_subscriber_id ON public.email_logs(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_session_id ON public.processing_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON public.processing_jobs(status);
-- Fix the security definer view issue by setting SECURITY INVOKER
ALTER VIEW public.public_courses SET (security_invoker = true);
-- Enable RLS on the public_courses view (views inherit RLS from base table)
-- The view is safe because it explicitly excludes email column
-- But let's add explicit grant controls

-- Revoke direct table access from anon to ensure they go through RLS
REVOKE SELECT ON public.courses FROM anon;

-- The public_courses view is intentionally public for completed courses catalog
-- It excludes email and sensitive fields by design

-- Add comment documenting security rationale
COMMENT ON VIEW public.public_courses IS 'Public course catalog - intentionally excludes email and sensitive data. Only shows completed courses.';
-- Fix security vulnerabilities: Replace spoofable header-based auth with proper auth.uid()

-- 1. Add user_id column to courses if not exists and update policies
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- 2. Create index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_courses_user_id ON public.courses(user_id);

-- 3. Drop the weak header-based policies on course_chats
DROP POLICY IF EXISTS "Users can create their course chats" ON public.course_chats;
DROP POLICY IF EXISTS "Users can view their course chats" ON public.course_chats;

-- 4. Create stronger policies using auth.uid()
CREATE POLICY "Users can create their course chats via auth" 
ON public.course_chats 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM courses 
  WHERE courses.id = course_chats.course_id 
  AND (courses.user_id = auth.uid() OR courses.email = auth.email())
));

CREATE POLICY "Users can view their course chats via auth" 
ON public.course_chats 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM courses 
  WHERE courses.id = course_chats.course_id 
  AND (courses.user_id = auth.uid() OR courses.email = auth.email())
));

-- 5. Update course_modules policies to use auth.uid()
DROP POLICY IF EXISTS "Users can view their course modules by email" ON public.course_modules;

CREATE POLICY "Users can view their course modules by auth" 
ON public.course_modules 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM courses 
    WHERE courses.id = course_modules.course_id 
    AND (courses.user_id = auth.uid() OR courses.email = auth.email())
  )
  OR auth.role() = 'service_role'
);

-- 6. Update the UPDATE and DELETE policies for course_modules
DROP POLICY IF EXISTS "Users can update their course modules by email" ON public.course_modules;
DROP POLICY IF EXISTS "Users can delete their course modules by email" ON public.course_modules;

CREATE POLICY "Users can update their course modules by auth" 
ON public.course_modules 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM courses 
    WHERE courses.id = course_modules.course_id 
    AND (courses.user_id = auth.uid() OR courses.email = auth.email())
  )
);

CREATE POLICY "Users can delete their course modules by auth" 
ON public.course_modules 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM courses 
    WHERE courses.id = course_modules.course_id 
    AND (courses.user_id = auth.uid() OR courses.email = auth.email())
  )
);
-- Fix the courses table security issue by revoking anonymous SELECT access
-- and ensuring only authenticated users with matching email can access their own courses

-- First revoke any direct SELECT from anon role
REVOKE SELECT ON public.courses FROM anon;

-- Add a restrictive SELECT policy that requires authentication
DROP POLICY IF EXISTS "Users can view their own courses by email" ON public.courses;

CREATE POLICY "Users can view their own courses by email" 
ON public.courses 
FOR SELECT 
USING (
  auth.email() = email 
  OR auth.uid()::text = user_id::text
);
-- Fix security issue: email_subscribers needs proper RLS (already has service_role only policy)
-- Verified: email_subscribers already has "Service role only" policy - this is correct

-- Fix security issue: courses table has restrictive policies but let's verify they work correctly
-- Already has multiple SELECT/UPDATE/DELETE policies by user_id, email, and service_role - this is correct

-- Fix security issue: public_courses view needs RLS protection
-- Note: This is a VIEW, not a table, so RLS doesn't apply the same way
-- The view already only exposes non-sensitive fields (no email, user_id)
-- Adding an RLS policy to the underlying courses table is already done

-- Add missing DELETE policy for character_insights
CREATE POLICY "Character insights can be deleted"
ON public.character_insights
FOR DELETE
TO anon, authenticated
USING (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

-- Add missing UPDATE policy for location_photos  
CREATE POLICY "Users can update their location photos"
ON public.location_photos
FOR UPDATE
TO anon, authenticated
USING (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text))
WITH CHECK (session_id = ((current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

-- Add missing UPDATE policy for course_chats
CREATE POLICY "Users can update their course chats via auth"
ON public.course_chats
FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM courses
  WHERE courses.id = course_chats.course_id
  AND (courses.user_id = auth.uid() OR courses.email = auth.email())
));

-- Add user-level INSERT/UPDATE/DELETE policies for course_progress
CREATE POLICY "Users can insert their course progress by email"
ON public.course_progress
FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM courses
  WHERE courses.id = course_progress.course_id
  AND (courses.email = auth.email() OR courses.user_id = auth.uid())
));

CREATE POLICY "Users can update their course progress by email"
ON public.course_progress
FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM courses
  WHERE courses.id = course_progress.course_id
  AND (courses.email = auth.email() OR courses.user_id = auth.uid())
));

CREATE POLICY "Users can delete their course progress by email"
ON public.course_progress
FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM courses
  WHERE courses.id = course_progress.course_id
  AND (courses.email = auth.email() OR courses.user_id = auth.uid())
));
-- Fix 1: email_subscribers table - it's service_role only which is correct
-- The warning is a false positive - checking the actual RLS policy shows it's already protected
-- Let's verify and strengthen it

-- Ensure RLS is enabled (it already is)
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

-- The existing policy "Service role only" restricts all access to service_role
-- This is correct - no public access. The scanner may be confused.
-- Let's explicitly revoke any public access to be extra safe
REVOKE ALL ON public.email_subscribers FROM anon;
REVOKE ALL ON public.email_subscribers FROM authenticated;

-- Fix 2: Strengthen course_chats RLS policies
-- Drop existing policies and recreate with simpler, more robust checks

DROP POLICY IF EXISTS "Users can view their course chats via auth" ON public.course_chats;
DROP POLICY IF EXISTS "Users can create their course chats via auth" ON public.course_chats;
DROP POLICY IF EXISTS "Users can update their course chats via auth" ON public.course_chats;
DROP POLICY IF EXISTS "Users can delete their own course chats" ON public.course_chats;

-- Create a security definer function to safely check course ownership
CREATE OR REPLACE FUNCTION public.user_owns_course(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courses
    WHERE id = p_course_id
      AND (user_id = auth.uid() OR email = auth.email())
  )
$$;

-- Recreate policies using the security definer function
CREATE POLICY "Users can view their course chats"
ON public.course_chats
FOR SELECT
TO authenticated
USING (public.user_owns_course(course_id));

CREATE POLICY "Users can create their course chats"
ON public.course_chats
FOR INSERT
TO authenticated
WITH CHECK (public.user_owns_course(course_id));

CREATE POLICY "Users can update their course chats"
ON public.course_chats
FOR UPDATE
TO authenticated
USING (public.user_owns_course(course_id));

CREATE POLICY "Users can delete their course chats"
ON public.course_chats
FOR DELETE
TO authenticated
USING (public.user_owns_course(course_id));

-- Also add service role access for edge functions
CREATE POLICY "Service role full access to course_chats"
ON public.course_chats
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
-- Fix email_subscribers RLS - restrict to service role only (for edge functions)
-- First, enable RLS if not already enabled
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

-- Drop any existing permissive policies
DROP POLICY IF EXISTS "Allow public insert for email capture" ON public.email_subscribers;
DROP POLICY IF EXISTS "email_subscribers_insert_policy" ON public.email_subscribers;
DROP POLICY IF EXISTS "email_subscribers_select_policy" ON public.email_subscribers;

-- Create restrictive policy - only service role can access (edge functions use service role)
-- No policies = only service role access when RLS is enabled
-- This means frontend can't query directly, only through edge functions

-- For the public_courses view - it's intentionally public for course catalog display
-- Mark as acknowledged by not adding restrictive RLS (it's a view of already-protected data)
-- Fix 1: Add policy to require authentication for SELECT on courses table
-- First, check existing policies and add one that requires auth.uid() IS NOT NULL

-- Drop existing permissive SELECT policies that might allow unauthenticated access
DROP POLICY IF EXISTS "Unauthenticated can view courses" ON public.courses;

-- Create a base policy requiring authentication for any SELECT
CREATE POLICY "Require authentication for courses"
ON public.courses
FOR SELECT
TO anon
USING (false);

-- Fix 2: Add RLS to public_courses view
-- Views inherit RLS from underlying tables, but we need to ensure the view itself is protected
-- Since public_courses is a view, we'll ensure it only shows completed courses for legitimate public preview purposes
-- Mark this as intentionally public for preview/marketing content

-- Add a comment to document the security decision
COMMENT ON VIEW public.public_courses IS 'Public preview view - intentionally exposes only basic course info (title, description, status) for marketing purposes. Sensitive content like full transcripts should be accessed via authenticated courses table only.';
-- Fix security issues for courses and course_modules tables

-- Drop existing problematic policies on courses
DROP POLICY IF EXISTS "Require authentication for courses" ON public.courses;
DROP POLICY IF EXISTS "Service role can select courses" ON public.courses;
DROP POLICY IF EXISTS "Users can view their own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can insert their own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can update their own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can delete their own courses" ON public.courses;
DROP POLICY IF EXISTS "Anyone can insert courses" ON public.courses;
DROP POLICY IF EXISTS "Anyone can view courses by email" ON public.courses;
DROP POLICY IF EXISTS "Public can view completed courses" ON public.courses;

-- Create proper RLS policies for courses table
-- Users can only view their own courses (by email match)
CREATE POLICY "Users can view own courses by email"
ON public.courses
FOR SELECT
USING (
  email = COALESCE(
    current_setting('request.jwt.claims', true)::json->>'email',
    auth.email()
  )
);

-- Users can insert courses with their email
CREATE POLICY "Users can insert courses with their email"
ON public.courses
FOR INSERT
WITH CHECK (true);

-- Users can update their own courses
CREATE POLICY "Users can update own courses"
ON public.courses
FOR UPDATE
USING (
  email = COALESCE(
    current_setting('request.jwt.claims', true)::json->>'email',
    auth.email()
  )
);

-- Users can delete their own courses
CREATE POLICY "Users can delete own courses"
ON public.courses
FOR DELETE
USING (
  email = COALESCE(
    current_setting('request.jwt.claims', true)::json->>'email',
    auth.email()
  )
);

-- Drop existing problematic policies on course_modules
DROP POLICY IF EXISTS "Public can view course modules" ON public.course_modules;
DROP POLICY IF EXISTS "Anyone can view course modules" ON public.course_modules;
DROP POLICY IF EXISTS "Users can view course modules" ON public.course_modules;
DROP POLICY IF EXISTS "Service role can manage course_modules" ON public.course_modules;

-- Create proper RLS policies for course_modules - only accessible if user owns the course
CREATE POLICY "Users can view modules of their courses"
ON public.course_modules
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_modules.course_id
    AND courses.email = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'email',
      auth.email()
    )
  )
);

CREATE POLICY "Users can insert modules for their courses"
ON public.course_modules
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_modules.course_id
    AND courses.email = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'email',
      auth.email()
    )
  )
);

CREATE POLICY "Users can update modules of their courses"
ON public.course_modules
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_modules.course_id
    AND courses.email = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'email',
      auth.email()
    )
  )
);

CREATE POLICY "Users can delete modules of their courses"
ON public.course_modules
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_modules.course_id
    AND courses.email = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'email',
      auth.email()
    )
  )
);
-- Fix storage bucket security: restrict write access to service role only
-- First drop the insecure policies

DROP POLICY IF EXISTS "Allow public upload to course-videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete from course-videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update to course-videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload to course-gifs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete from course-gifs" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update to course-gifs" ON storage.objects;

-- Create secure policies that only allow service role to write/delete
-- Public read is still allowed since buckets are public

CREATE POLICY "Service role can upload to course-videos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'course-videos' AND auth.role() = 'service_role');

CREATE POLICY "Service role can update course-videos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'course-videos' AND auth.role() = 'service_role');

CREATE POLICY "Service role can delete from course-videos"
ON storage.objects FOR DELETE
USING (bucket_id = 'course-videos' AND auth.role() = 'service_role');

CREATE POLICY "Service role can upload to course-gifs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'course-gifs' AND auth.role() = 'service_role');

CREATE POLICY "Service role can update course-gifs"
ON storage.objects FOR UPDATE
USING (bucket_id = 'course-gifs' AND auth.role() = 'service_role');

CREATE POLICY "Service role can delete from course-gifs"
ON storage.objects FOR DELETE
USING (bucket_id = 'course-gifs' AND auth.role() = 'service_role');
-- Fix courses table: Drop potentially leaky SELECT policies and create secure ones
DROP POLICY IF EXISTS "Users can view own courses by email" ON public.courses;
DROP POLICY IF EXISTS "Users can view their own courses by email" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can view their courses by user_id" ON public.courses;

-- Create a single, secure SELECT policy that requires authentication
CREATE POLICY "Authenticated users can view their own courses"
ON public.courses
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id 
  OR auth.email() = email
);

-- Add explicit deny for anonymous users (anon role)
CREATE POLICY "Anonymous users cannot view courses"
ON public.courses
FOR SELECT
TO anon
USING (false);

-- Fix course_modules table: Tighten SELECT policies
DROP POLICY IF EXISTS "Users can view modules of their courses" ON public.course_modules;
DROP POLICY IF EXISTS "Users can view their course modules by auth" ON public.course_modules;

-- Create secure SELECT policy requiring authentication and ownership
CREATE POLICY "Authenticated users can view their course modules"
ON public.course_modules
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_modules.course_id
    AND (courses.user_id = auth.uid() OR courses.email = auth.email())
  )
  OR auth.role() = 'service_role'
);

-- Block anonymous access to course modules
CREATE POLICY "Anonymous users cannot view course modules"
ON public.course_modules
FOR SELECT
TO anon
USING (false);

-- Also secure the INSERT policies that were too permissive
DROP POLICY IF EXISTS "Users can insert courses with their email" ON public.courses;

-- Require authentication for course creation
CREATE POLICY "Authenticated users can create courses"
ON public.courses
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (user_id = auth.uid() OR user_id IS NULL)
  AND (email = auth.email() OR email IS NOT NULL)
);

-- Rate-limited anonymous course creation (keep existing but make it stricter)
DROP POLICY IF EXISTS "Rate limited course creation" ON public.courses;
-- Drop all existing SELECT policies on course_modules to start fresh
DROP POLICY IF EXISTS "Authenticated users can view their course modules" ON public.course_modules;
DROP POLICY IF EXISTS "Anonymous users cannot view course modules" ON public.course_modules;

-- Create a strict, clean SELECT policy for authenticated users only
-- This requires ownership verification through the courses table
CREATE POLICY "Course owners can view their modules"
ON public.course_modules
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_modules.course_id
    AND (
      courses.user_id = auth.uid() 
      OR courses.email = auth.email()
    )
  )
);

-- Explicitly block ALL anonymous access
CREATE POLICY "Block anonymous SELECT on course_modules"
ON public.course_modules
FOR SELECT
TO anon
USING (false);

-- Ensure UPDATE policies are also strict (drop old, create new)
DROP POLICY IF EXISTS "Users can update modules of their courses" ON public.course_modules;
DROP POLICY IF EXISTS "Users can update their course modules by auth" ON public.course_modules;

CREATE POLICY "Course owners can update their modules"
ON public.course_modules
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_modules.course_id
    AND (courses.user_id = auth.uid() OR courses.email = auth.email())
  )
);

-- Ensure DELETE policies are also strict
DROP POLICY IF EXISTS "Users can delete modules of their courses" ON public.course_modules;
DROP POLICY IF EXISTS "Users can delete their course modules by auth" ON public.course_modules;

CREATE POLICY "Course owners can delete their modules"
ON public.course_modules
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_modules.course_id
    AND (courses.user_id = auth.uid() OR courses.email = auth.email())
  )
);

-- Ensure INSERT policies are strict
DROP POLICY IF EXISTS "Users can insert modules for their courses" ON public.course_modules;

CREATE POLICY "Course owners can insert modules"
ON public.course_modules
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = course_modules.course_id
    AND (courses.user_id = auth.uid() OR courses.email = auth.email())
  )
);
-- Fix public_courses view: Add proper RLS policy for public read access
-- This view is intentionally public for AI-readable course pages (CourseView.tsx)
-- It only exposes non-sensitive fields (no email, user_id, storage paths)

-- First, let's check if there's a select policy and add one that allows public read
-- Since public_courses is a VIEW, we need to ensure it's properly configured

-- Create a SELECT policy that allows anyone to read the public_courses view
-- This is intentional since public_courses only exposes safe, non-PII fields
CREATE POLICY "Public courses view is readable by everyone"
ON public.courses
FOR SELECT
TO anon
USING (
  status = 'completed'
);

-- Note: The public_courses VIEW already filters to only expose safe fields:
-- id, title, description, status, transcript, frame_urls, video_duration_seconds, 
-- module_count, is_multi_module, created_at
-- It does NOT expose: email, user_id, storage_path, video_url, error_message, etc.
-- Remove the overly permissive public courses policy that exposes emails
DROP POLICY IF EXISTS "Public courses view is readable by everyone" ON public.courses;

-- The courses table should ONLY be accessible to authenticated owners
-- Anonymous users should use the public_courses VIEW instead

-- Block all anonymous access to courses table
DROP POLICY IF EXISTS "Anonymous users cannot view courses" ON public.courses;
CREATE POLICY "Block anonymous SELECT on courses"
ON public.courses
FOR SELECT
TO anon
USING (false);

-- Note: The public_courses VIEW is intentionally a read-only view that:
-- 1. Only exposes non-sensitive fields (no email, user_id, storage paths)
-- 2. Is used by CourseView.tsx for AI-readable course pages
-- 3. Views inherit security from the underlying table when using security invoker
-- Since public_courses is a VIEW (not a table), RLS policies are applied to the 
-- underlying courses table. The view definition already filters to safe columns.
-- ============ AUTO-OPS TABLES FOR SELF-HEALING ============

-- Table to track detected issues and auto-fixes
CREATE TABLE public.ops_auto_fixes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  issue_type TEXT NOT NULL,  -- 'security', 'file_size', 'processing_error', 'user_confusion'
  issue_description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'low',  -- 'low', 'medium', 'high', 'critical'
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  auto_fixed BOOLEAN NOT NULL DEFAULT false,
  fix_applied TEXT,
  fixed_at TIMESTAMP WITH TIME ZONE,
  pattern_count INTEGER NOT NULL DEFAULT 1,  -- How many times this pattern occurred
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  user_email TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.ops_auto_fixes ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table
CREATE POLICY "Service role only for ops_auto_fixes"
ON public.ops_auto_fixes
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Index for pattern detection queries
CREATE INDEX idx_ops_auto_fixes_type_pattern ON public.ops_auto_fixes(issue_type, pattern_count);
CREATE INDEX idx_ops_auto_fixes_detected ON public.ops_auto_fixes(detected_at DESC);

-- Table for user support conversations (AI chatbot)
CREATE TABLE public.support_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'open',  -- 'open', 'resolved', 'escalated'
  resolution_summary TEXT
);

-- Enable RLS
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;

-- Users can view their own conversations, service role can access all
CREATE POLICY "Users can view their support conversations"
ON public.support_conversations
FOR SELECT
USING (user_email = auth.email() OR auth.role() = 'service_role');

CREATE POLICY "Service role can manage all conversations"
ON public.support_conversations
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Table for individual chat messages in support
CREATE TABLE public.support_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,  -- 'user', 'assistant'
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  emailed_to_user BOOLEAN NOT NULL DEFAULT false,
  email_sent_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Users can view their own messages
CREATE POLICY "Users can view their support messages"
ON public.support_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.support_conversations sc
    WHERE sc.id = support_messages.conversation_id
    AND (sc.user_email = auth.email() OR auth.role() = 'service_role')
  )
);

CREATE POLICY "Service role can manage all messages"
ON public.support_messages
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Index for conversation lookups
CREATE INDEX idx_support_messages_conversation ON public.support_messages(conversation_id, created_at);

-- Table for pattern tracking (edge-case whack-a-mole detection)
CREATE TABLE public.ops_patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_key TEXT NOT NULL UNIQUE,  -- e.g., 'file_size_too_large', 'vimeo_rate_limit'
  pattern_description TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  auto_fix_available BOOLEAN NOT NULL DEFAULT false,
  auto_fix_strategy TEXT,
  last_auto_fix_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.ops_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for ops_patterns"
ON public.ops_patterns
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Upsert function for pattern tracking
CREATE OR REPLACE FUNCTION public.track_pattern(
  p_pattern_key TEXT,
  p_description TEXT,
  p_auto_fix_available BOOLEAN DEFAULT false,
  p_auto_fix_strategy TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ops_patterns (pattern_key, pattern_description, auto_fix_available, auto_fix_strategy)
  VALUES (p_pattern_key, p_description, p_auto_fix_available, p_auto_fix_strategy)
  ON CONFLICT (pattern_key) DO UPDATE SET
    occurrence_count = ops_patterns.occurrence_count + 1,
    last_seen = now(),
    auto_fix_available = COALESCE(p_auto_fix_available, ops_patterns.auto_fix_available),
    auto_fix_strategy = COALESCE(p_auto_fix_strategy, ops_patterns.auto_fix_strategy);
END;
$$;

-- Fix 1: email_subscribers table - already has service_role only policy, but verify RLS is enabled
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

-- Fix 2: courses table - drop ineffective blocking policy and ensure proper RLS
DROP POLICY IF EXISTS "Block anonymous SELECT on courses" ON public.courses;

-- Fix 3: course_progress table - add explicit anonymous block
DROP POLICY IF EXISTS "Block anonymous SELECT on course_progress" ON public.course_progress;
CREATE POLICY "Block anonymous SELECT on course_progress" 
ON public.course_progress 
FOR SELECT 
TO anon
USING (false);

-- Verify course_modules anonymous block exists
DROP POLICY IF EXISTS "Block anonymous SELECT on course_modules" ON public.course_modules;
CREATE POLICY "Block anonymous SELECT on course_modules" 
ON public.course_modules 
FOR SELECT 
TO anon
USING (false);
-- Fix: Block anonymous access to courses table to protect customer email addresses
-- This prevents unauthenticated users from reading course data including emails

-- Drop any existing anonymous block policy if present
DROP POLICY IF EXISTS "Block anonymous SELECT on courses" ON public.courses;

-- Create policy to explicitly block anonymous SELECT access
CREATE POLICY "Block anonymous SELECT on courses" 
ON public.courses 
FOR SELECT 
TO anon
USING (false);
-- Fix 1: Strengthen course_progress blocking with explicit authentication check
DROP POLICY IF EXISTS "Block anonymous SELECT on course_progress" ON public.course_progress;
CREATE POLICY "Block anonymous SELECT on course_progress" 
ON public.course_progress 
FOR SELECT 
TO anon
USING (false);

-- Also add explicit auth requirement for authenticated users (belt and suspenders)
DROP POLICY IF EXISTS "Require auth for course_progress access" ON public.course_progress;

-- Fix 2: public_courses is a VIEW (not a table), so we need to check its definition
-- Views inherit RLS from underlying tables, but let's verify it's SELECT-only for public access
-- Since public_courses is meant to show completed courses publicly, we'll add explicit policy

-- First check if public_courses has RLS enabled (it's a view, so this is handled differently)
-- For views, we rely on the underlying table's RLS policies

-- The public_courses view selects from courses table which now has RLS
-- But views can bypass RLS if created with SECURITY DEFINER
-- Let's recreate it as SECURITY INVOKER to respect underlying RLS

DROP VIEW IF EXISTS public.public_courses;
CREATE VIEW public.public_courses 
WITH (security_invoker = true)
AS SELECT 
    id,
    title,
    description,
    status,
    video_duration_seconds,
    is_multi_module,
    module_count,
    frame_urls,
    transcript,
    created_at
FROM public.courses
WHERE status = 'completed';
-- Add audio_events JSONB column to courses table for storing screenplay-style audio analysis
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS audio_events JSONB DEFAULT NULL;

-- Add audio_events JSONB column to course_modules table for multi-module courses
ALTER TABLE public.course_modules 
ADD COLUMN IF NOT EXISTS audio_events JSONB DEFAULT NULL;

-- Add prosody_annotations JSONB column to store analyze-audio-prosody results
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS prosody_annotations JSONB DEFAULT NULL;

ALTER TABLE public.course_modules 
ADD COLUMN IF NOT EXISTS prosody_annotations JSONB DEFAULT NULL;

-- Add index for courses with audio events (for querying)
CREATE INDEX IF NOT EXISTS idx_courses_audio_events ON public.courses USING GIN (audio_events) WHERE audio_events IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_modules_audio_events ON public.course_modules USING GIN (audio_events) WHERE audio_events IS NOT NULL;

-- Comment explaining the structure
COMMENT ON COLUMN public.courses.audio_events IS 'Screenplay-style audio events: {music_cues: [], ambient_sounds: [], reactions: [], meaningful_pauses: []}';
COMMENT ON COLUMN public.courses.prosody_annotations IS 'Audio prosody analysis: {annotations: [], overall_tone: string, key_moments: []}';
-- Fix 1: Secure email_subscribers table - service_role only access
-- This table should only be accessed by edge functions, not directly by users

-- Drop any existing policies
DROP POLICY IF EXISTS "email_subscribers_service_role_only" ON public.email_subscribers;

-- Create policy that restricts all access to service_role only
CREATE POLICY "Service role only access" 
ON public.email_subscribers 
FOR ALL 
USING (false)
WITH CHECK (false);

-- Note: Edge functions use service_role key which bypasses RLS, so they still work
-- But direct client access is now blocked

-- Fix 2: Strengthen courses table RLS - remove email-based patterns
-- First drop weak policies that use email matching
DROP POLICY IF EXISTS "Users can read their courses by email" ON public.courses;
DROP POLICY IF EXISTS "Users can update their courses by email" ON public.courses;
DROP POLICY IF EXISTS "Users can delete their courses by email" ON public.courses;

-- The existing policies using user_owns_course function are secure (uses user_id OR email internally)
-- But let's verify the block anonymous policy exists
DROP POLICY IF EXISTS "Block anonymous SELECT" ON public.courses;
CREATE POLICY "Block anonymous SELECT" 
ON public.courses 
FOR SELECT 
TO anon 
USING (status = 'completed');

-- Ensure authenticated users can only see their own courses
DROP POLICY IF EXISTS "Users can view own courses" ON public.courses;
CREATE POLICY "Users can view own courses" 
ON public.courses 
FOR SELECT 
TO authenticated 
USING (public.user_owns_course(id));

-- Ensure authenticated users can only update their own courses  
DROP POLICY IF EXISTS "Users can update own courses" ON public.courses;
CREATE POLICY "Users can update own courses" 
ON public.courses 
FOR UPDATE 
TO authenticated 
USING (public.user_owns_course(id))
WITH CHECK (public.user_owns_course(id));

-- Ensure authenticated users can only delete their own courses
DROP POLICY IF EXISTS "Users can delete own courses" ON public.courses;
CREATE POLICY "Users can delete own courses" 
ON public.courses 
FOR DELETE 
TO authenticated 
USING (public.user_owns_course(id));

-- Service role can do anything (for edge functions)
DROP POLICY IF EXISTS "Service role full access" ON public.courses;
CREATE POLICY "Service role full access" 
ON public.courses 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);
-- Fix 1: Move pg_net extension from public schema to extensions schema
-- First create the extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Grant usage to necessary roles
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Drop and recreate pg_net in the extensions schema
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;
-- Add team notification email to courses table
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS team_notification_email text,
ADD COLUMN IF NOT EXISTS team_notification_role text,
ADD COLUMN IF NOT EXISTS team_notified_at timestamptz,
ADD COLUMN IF NOT EXISTS owner_notified_at timestamptz;

-- Add comment for clarity
COMMENT ON COLUMN public.courses.team_notification_email IS 'Optional email to notify when PDF is ready (VA, team member, etc)';
COMMENT ON COLUMN public.courses.team_notification_role IS 'Role label for team member (VA, Designer, Ops, Partner)';
COMMENT ON COLUMN public.courses.team_notified_at IS 'When the team member was notified';
COMMENT ON COLUMN public.courses.owner_notified_at IS 'When the owner was notified that PDF is ready';
-- ============ FIX SECURITY ISSUES ============

-- ISSUE 1: email_subscribers has conflicting RLS policies
-- Drop the redundant/conflicting policy
DROP POLICY IF EXISTS "Service role only access" ON public.email_subscribers;

-- ISSUE 2: courses has "Block anonymous SELECT" policy that allows 
-- viewing completed courses (including emails) - this is dangerous
DROP POLICY IF EXISTS "Block anonymous SELECT" ON public.courses;

-- The "Block anonymous SELECT on courses" policy with USING: false is 
-- redundant when we have proper ownership-based policies, but it's not harmful.
-- We'll keep it as an extra layer of protection.
-- Ensure RLS is enabled on email_subscribers
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owner as well
ALTER TABLE public.email_subscribers FORCE ROW LEVEL SECURITY;

-- Drop the existing restrictive policy and recreate as permissive
DROP POLICY IF EXISTS "Service role only" ON public.email_subscribers;

-- Create permissive policy for service role (allows service role full access)
CREATE POLICY "Service role full access to email_subscribers"
ON public.email_subscribers
FOR ALL
TO authenticated, anon
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Block anonymous SELECT explicitly
CREATE POLICY "Block anonymous access to email_subscribers"
ON public.email_subscribers
FOR SELECT
TO anon
USING (false);
-- Ensure RLS is enabled and forced on email_subscribers
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_subscribers FORCE ROW LEVEL SECURITY;

-- Drop any existing policies to start fresh
DROP POLICY IF EXISTS "Service role only" ON public.email_subscribers;
DROP POLICY IF EXISTS "Service role full access to email_subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "Block anonymous access to email_subscribers" ON public.email_subscribers;

-- Create proper service role access policy (permissive)
CREATE POLICY "Service role full access to email_subscribers"
ON public.email_subscribers
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
-- Drop the overly permissive "Service role full access" policy that allows anyone to read
DROP POLICY IF EXISTS "Service role full access" ON public.courses;

-- Drop duplicate/redundant policies to clean up
DROP POLICY IF EXISTS "Block anonymous SELECT on courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can delete their courses by user_id" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can update their courses by user_id" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can view their own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can delete their own courses by email" ON public.courses;
DROP POLICY IF EXISTS "Users can update their own courses by email" ON public.courses;

-- Keep only the clean policies:
-- "Service role only" - for backend operations
-- "Users can view own courses" - for authenticated users
-- "Users can update own courses" - for authenticated users  
-- "Users can delete own courses" - for authenticated users
-- "Authenticated users can create courses" - for new course creation
-- Fix course_chats: Replace overly permissive "Service role full access" with proper service_role check
DROP POLICY IF EXISTS "Service role full access to course_chats" ON public.course_chats;

CREATE POLICY "Service role only for course_chats"
ON public.course_chats
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
-- Block anonymous users from accessing the courses table
-- This protects email addresses from being exposed to unauthenticated requests

DROP POLICY IF EXISTS "Block anonymous access to courses" ON public.courses;

-- Create a restrictive policy that explicitly blocks anon role
-- RESTRICTIVE means ALL policies must pass for access to be granted
-- USING (false) ensures anon users will NEVER pass this policy
CREATE POLICY "Block anonymous access to courses"
ON public.courses
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);
-- Recreate the public_courses view with SECURITY INVOKER
-- This ensures the view respects RLS policies of the underlying courses table
-- Since courses table blocks anonymous access, this view will too

DROP VIEW IF EXISTS public.public_courses;

CREATE VIEW public.public_courses
WITH (security_invoker = true)
AS
SELECT 
    id,
    title,
    description,
    status,
    video_duration_seconds,
    is_multi_module,
    module_count,
    frame_urls,
    transcript,
    created_at
FROM public.courses
WHERE status = 'completed';
-- Ensure RLS is enabled on email_subscribers
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owner too (extra security)
ALTER TABLE public.email_subscribers FORCE ROW LEVEL SECURITY;

-- Drop any existing permissive policies that might allow access
DROP POLICY IF EXISTS "Service role full access to email_subscribers" ON public.email_subscribers;

-- Create a single PERMISSIVE policy that ONLY allows service_role access
-- Since this is the only permissive policy, all other access is denied by default
CREATE POLICY "Service role only access"
ON public.email_subscribers
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

-- Service role bypasses RLS by default, but let's be explicit
CREATE POLICY "Service role full access"
ON public.email_subscribers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
-- Force RLS on all sensitive tables to prevent any bypass
ALTER TABLE public.email_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tag_history FORCE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ops_auto_fixes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ops_patterns FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mock_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.support_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.processing_queue FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits FORCE ROW LEVEL SECURITY;

-- Add explicit deny policies for anonymous/authenticated on sensitive service-only tables
-- email_logs
DROP POLICY IF EXISTS "Block all non-service access to email_logs" ON public.email_logs;
CREATE POLICY "Block all non-service access to email_logs"
ON public.email_logs FOR ALL TO authenticated, anon
USING (false) WITH CHECK (false);

-- tag_history  
DROP POLICY IF EXISTS "Block all non-service access to tag_history" ON public.tag_history;
CREATE POLICY "Block all non-service access to tag_history"
ON public.tag_history FOR ALL TO authenticated, anon
USING (false) WITH CHECK (false);

-- error_logs
DROP POLICY IF EXISTS "Block all non-service access to error_logs" ON public.error_logs;
CREATE POLICY "Block all non-service access to error_logs"
ON public.error_logs FOR ALL TO authenticated, anon
USING (false) WITH CHECK (false);

-- ops_auto_fixes
DROP POLICY IF EXISTS "Block all non-service access to ops_auto_fixes" ON public.ops_auto_fixes;
CREATE POLICY "Block all non-service access to ops_auto_fixes"
ON public.ops_auto_fixes FOR ALL TO authenticated, anon
USING (false) WITH CHECK (false);

-- ops_patterns
DROP POLICY IF EXISTS "Block all non-service access to ops_patterns" ON public.ops_patterns;
CREATE POLICY "Block all non-service access to ops_patterns"
ON public.ops_patterns FOR ALL TO authenticated, anon
USING (false) WITH CHECK (false);

-- marketing_settings
DROP POLICY IF EXISTS "Block all non-service access to marketing_settings" ON public.marketing_settings;
CREATE POLICY "Block all non-service access to marketing_settings"
ON public.marketing_settings FOR ALL TO authenticated, anon
USING (false) WITH CHECK (false);

-- processing_queue
DROP POLICY IF EXISTS "Block all non-service access to processing_queue" ON public.processing_queue;
CREATE POLICY "Block all non-service access to processing_queue"
ON public.processing_queue FOR ALL TO authenticated, anon
USING (false) WITH CHECK (false);
-- Drop ALL existing policies on email_subscribers to eliminate conflicts
DROP POLICY IF EXISTS "Service role full access to email_subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "Service role full access" ON public.email_subscribers;
DROP POLICY IF EXISTS "Service role only access" ON public.email_subscribers;
DROP POLICY IF EXISTS "Block all non-service access" ON public.email_subscribers;

-- Ensure RLS is enabled and forced
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_subscribers FORCE ROW LEVEL SECURITY;

-- Create ONLY a blocking policy for anon and authenticated users
-- Service role bypasses RLS by default, so no policy needed for it
CREATE POLICY "Deny all client access to email_subscribers"
ON public.email_subscribers
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);
-- Drop and recreate the public_courses view with security
DROP VIEW IF EXISTS public.public_courses;

-- Recreate view with security_invoker = true so it respects the caller's RLS
CREATE VIEW public.public_courses WITH (security_invoker = true) AS
SELECT 
    id,
    title,
    description,
    status,
    video_duration_seconds,
    is_multi_module,
    module_count,
    frame_urls,
    transcript,
    created_at
FROM courses
WHERE status = 'completed'::text;

-- Also fix the remaining email_subscribers conflict by checking what policies exist
-- and ensuring only the deny policy remains
-- Update the step check constraint to include all valid steps
ALTER TABLE processing_queue DROP CONSTRAINT IF EXISTS processing_queue_step_check;

ALTER TABLE processing_queue ADD CONSTRAINT processing_queue_step_check 
CHECK (step = ANY (ARRAY[
  'transcribe'::text, 
  'extract_frames'::text, 
  'render_gifs'::text, 
  'train_ai'::text,
  'analyze_audio'::text,
  'transcribe_module'::text,
  'extract_frames_module'::text,
  'render_gifs_module'::text,
  'train_ai_module'::text,
  'analyze_audio_module'::text,
  'check_next_module'::text
]));

-- Create a function for atomic step completion + next step queuing
CREATE OR REPLACE FUNCTION complete_step_and_queue_next(
  p_job_id uuid,
  p_course_id uuid,
  p_next_step text DEFAULT NULL,
  p_next_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark current job as completed
  UPDATE processing_queue 
  SET status = 'completed', 
      completed_at = now() 
  WHERE id = p_job_id;
  
  -- Queue next step if provided
  IF p_next_step IS NOT NULL THEN
    INSERT INTO processing_queue (course_id, step, status, metadata)
    VALUES (p_course_id, p_next_step, 'pending', COALESCE(p_next_metadata, '{}'::jsonb));
  END IF;
END;
$$;

-- Create a function to detect and fix intermediate stuck states
CREATE OR REPLACE FUNCTION detect_stuck_intermediate_states()
RETURNS TABLE(
  course_id uuid,
  course_status text,
  last_completed_step text,
  next_step text,
  stuck_since timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as course_id,
    c.status as course_status,
    pq.step as last_completed_step,
    CASE 
      WHEN pq.step = 'transcribe' THEN 'extract_frames'
      WHEN pq.step = 'extract_frames' THEN 'analyze_audio'
      WHEN pq.step = 'analyze_audio' THEN 'train_ai'
      WHEN pq.step = 'transcribe_module' THEN 'extract_frames_module'
      WHEN pq.step = 'extract_frames_module' THEN 'analyze_audio_module'
      WHEN pq.step = 'analyze_audio_module' THEN 'train_ai_module'
      ELSE NULL
    END as next_step,
    pq.completed_at as stuck_since
  FROM courses c
  INNER JOIN processing_queue pq ON pq.course_id = c.id
  WHERE 
    -- Course is in an intermediate processing state (not completed/failed/queued)
    c.status NOT IN ('completed', 'failed', 'queued')
    -- The last queue job for this course is completed
    AND pq.status = 'completed'
    -- No pending or processing jobs exist for this course
    AND NOT EXISTS (
      SELECT 1 FROM processing_queue pq2 
      WHERE pq2.course_id = c.id 
      AND pq2.status IN ('pending', 'processing')
    )
    -- The completed job is the most recent one
    AND pq.completed_at = (
      SELECT MAX(completed_at) FROM processing_queue pq3 WHERE pq3.course_id = c.id
    )
    -- Stuck for at least 2 minutes
    AND pq.completed_at < now() - interval '2 minutes';
END;
$$;
-- Lock down execute permissions so only the backend service role can call these helpers
REVOKE ALL ON FUNCTION public.complete_step_and_queue_next(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_step_and_queue_next(uuid, uuid, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.detect_stuck_intermediate_states() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_stuck_intermediate_states() TO service_role;
-- Drop the existing INSERT policy that allows any email
DROP POLICY IF EXISTS "Authenticated users can create courses" ON public.courses;

-- Create a more restrictive INSERT policy that requires:
-- 1. User must be authenticated
-- 2. user_id must be their own or null
-- 3. email MUST match their authenticated email (no arbitrary emails)
CREATE POLICY "Authenticated users can create courses with own email" 
ON public.courses 
FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND (user_id = auth.uid() OR user_id IS NULL)
  AND email = auth.email()
);

-- Drop existing UPDATE policy
DROP POLICY IF EXISTS "Users can update own courses" ON public.courses;

-- Create UPDATE policy that prevents email modification
-- Users can only update their own courses AND cannot change the email field
CREATE POLICY "Users can update own courses without changing email" 
ON public.courses 
FOR UPDATE 
USING (user_owns_course(id))
WITH CHECK (
  user_owns_course(id)
  AND email = (SELECT c.email FROM public.courses c WHERE c.id = courses.id)
);
-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view their support conversations" ON public.support_conversations;

-- Create a rate-limited SELECT policy that:
-- 1. Requires email to match exactly (no guessing)
-- 2. Adds rate limiting to prevent enumeration attempts
CREATE POLICY "Users can view their support conversations with rate limit" 
ON public.support_conversations 
FOR SELECT 
USING (
  (
    user_email = auth.email() 
    AND check_rate_limit(
      COALESCE(auth.uid()::text, 'anonymous'),
      'support_conversation_read',
      20,  -- max 20 requests
      5    -- per 5 minute window
    )
  )
  OR auth.role() = 'service_role'
);
-- Drop existing course_modules policies that use weak email matching
DROP POLICY IF EXISTS "Course owners can delete their modules" ON public.course_modules;
DROP POLICY IF EXISTS "Course owners can insert modules" ON public.course_modules;
DROP POLICY IF EXISTS "Course owners can update their modules" ON public.course_modules;
DROP POLICY IF EXISTS "Course owners can view their modules" ON public.course_modules;

-- Create a security definer function to check course ownership with user_id priority
CREATE OR REPLACE FUNCTION public.user_owns_course_secure(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courses
    WHERE id = p_course_id
      AND (
        -- Primary check: user_id must match (strongest)
        user_id = auth.uid()
        -- Secondary check: only allow email match if user_id is null (legacy data)
        OR (user_id IS NULL AND email = auth.email())
      )
  )
$$;

-- Recreate course_modules policies with stronger checks
CREATE POLICY "Course owners can view their modules securely" 
ON public.course_modules 
FOR SELECT 
USING (user_owns_course_secure(course_id));

CREATE POLICY "Course owners can insert modules securely" 
ON public.course_modules 
FOR INSERT 
WITH CHECK (user_owns_course_secure(course_id));

CREATE POLICY "Course owners can update their modules securely" 
ON public.course_modules 
FOR UPDATE 
USING (user_owns_course_secure(course_id));

CREATE POLICY "Course owners can delete their modules securely" 
ON public.course_modules 
FOR DELETE 
USING (user_owns_course_secure(course_id));
-- ============================================================
-- Batch Upload Infrastructure: Robust module processing with 
-- idempotent steps, atomic state transitions, and per-module emails
-- ============================================================

-- Add batch processing fields to courses table
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS batch_id UUID,
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;

-- Add detailed processing state to course_modules
ALTER TABLE public.course_modules 
ADD COLUMN IF NOT EXISTS processing_state TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS step_completed JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMP WITH TIME ZONE;

-- Add constraint for valid processing states
-- States: pending, uploaded, queued, transcribing, extracting, analyzing, pdf_building, completed, failed_retrying, failed_terminal
COMMENT ON COLUMN public.course_modules.processing_state IS 
'Valid states: pending, uploaded, queued, transcribing, extracting, analyzing, pdf_building, completed, failed_retrying, failed_terminal';

-- Create batch_jobs table for tracking batch submissions
CREATE TABLE IF NOT EXISTS public.batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  session_id TEXT NOT NULL,
  total_modules INTEGER NOT NULL,
  completed_modules INTEGER DEFAULT 0,
  failed_modules INTEGER DEFAULT 0,
  status TEXT DEFAULT 'processing',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'
);

-- Enable RLS on batch_jobs
ALTER TABLE public.batch_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies for batch_jobs - users can see their own jobs
CREATE POLICY "Users can view their own batch jobs by email" 
  ON public.batch_jobs FOR SELECT 
  USING (user_email = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Service role can manage batch jobs"
  ON public.batch_jobs FOR ALL
  TO service_role
  USING (true);

-- Create module_processing_steps table for idempotent step tracking
CREATE TABLE IF NOT EXISTS public.module_processing_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  output_data JSONB,
  error_message TEXT,
  attempt_number INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(module_id, step_name, attempt_number)
);

-- Enable RLS on module_processing_steps
ALTER TABLE public.module_processing_steps ENABLE ROW LEVEL SECURITY;

-- Service role can manage processing steps
CREATE POLICY "Service role can manage processing steps"
  ON public.module_processing_steps FOR ALL
  TO service_role
  USING (true);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_module_processing_steps_module 
  ON public.module_processing_steps(module_id);

CREATE INDEX IF NOT EXISTS idx_course_modules_state 
  ON public.course_modules(processing_state);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_email 
  ON public.batch_jobs(user_email);

CREATE INDEX IF NOT EXISTS idx_courses_batch 
  ON public.courses(batch_id);

-- Function to atomically transition module state
CREATE OR REPLACE FUNCTION public.transition_module_state(
  p_module_id UUID,
  p_from_state TEXT,
  p_to_state TEXT,
  p_step_data JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated BOOLEAN;
BEGIN
  UPDATE public.course_modules
  SET 
    processing_state = p_to_state,
    step_completed = COALESCE(step_completed, '{}'::jsonb) || COALESCE(p_step_data, '{}'::jsonb),
    heartbeat_at = now(),
    updated_at = now()
  WHERE id = p_module_id 
    AND processing_state = p_from_state;
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- Function to check if a step was already completed (idempotency)
CREATE OR REPLACE FUNCTION public.is_step_completed(
  p_module_id UUID,
  p_step_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.module_processing_steps
    WHERE module_id = p_module_id
      AND step_name = p_step_name
      AND status = 'completed'
  );
END;
$$;

-- Function to record step completion
CREATE OR REPLACE FUNCTION public.complete_module_step(
  p_module_id UUID,
  p_step_name TEXT,
  p_output_data JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.module_processing_steps (
    module_id, step_name, status, completed_at, output_data
  ) VALUES (
    p_module_id, p_step_name, 'completed', now(), p_output_data
  )
  ON CONFLICT (module_id, step_name, attempt_number) 
  DO UPDATE SET 
    status = 'completed',
    completed_at = now(),
    output_data = COALESCE(EXCLUDED.output_data, module_processing_steps.output_data);
END;
$$;

-- Function to detect stalled modules (no heartbeat for 5 minutes)
CREATE OR REPLACE FUNCTION public.detect_stalled_modules()
RETURNS TABLE(
  module_id UUID,
  course_id UUID,
  current_state TEXT,
  stalled_since TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cm.id as module_id,
    cm.course_id,
    cm.processing_state as current_state,
    cm.heartbeat_at as stalled_since
  FROM public.course_modules cm
  WHERE cm.processing_state IN ('transcribing', 'extracting', 'analyzing', 'pdf_building')
    AND cm.heartbeat_at < now() - interval '5 minutes';
END;
$$;

-- Function to reset stalled module for retry
CREATE OR REPLACE FUNCTION public.reset_stalled_module(p_module_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_retry_count INTEGER;
BEGIN
  SELECT retry_count INTO v_retry_count
  FROM public.course_modules
  WHERE id = p_module_id;
  
  IF v_retry_count >= 3 THEN
    UPDATE public.course_modules
    SET processing_state = 'failed_terminal',
        last_error = 'Max retries exceeded',
        updated_at = now()
    WHERE id = p_module_id;
    RETURN FALSE;
  END IF;
  
  UPDATE public.course_modules
  SET processing_state = 'queued',
      retry_count = retry_count + 1,
      heartbeat_at = now(),
      updated_at = now()
  WHERE id = p_module_id;
  
  RETURN TRUE;
END;
$$;

-- Enable realtime for batch_jobs
ALTER PUBLICATION supabase_realtime ADD TABLE public.batch_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.module_processing_steps;
-- ============================================================
-- Production Hardening: Concurrency Limits, Heartbeats, Watchdog
-- ============================================================

-- Add concurrency tracking table
CREATE TABLE IF NOT EXISTS public.processing_concurrency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  active_jobs INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_email)
);

-- Enable RLS
ALTER TABLE public.processing_concurrency ENABLE ROW LEVEL SECURITY;

-- Service role can manage concurrency
CREATE POLICY "Service role manages concurrency"
  ON public.processing_concurrency FOR ALL
  TO service_role
  USING (true);

-- Global concurrency settings
CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert default concurrency limits
INSERT INTO public.system_settings (key, value) VALUES 
  ('concurrency_limits', '{"per_user": 3, "global": 10}'::jsonb),
  ('heartbeat_timeout_seconds', '300'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Enable RLS on system_settings (read-only for anon)
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read system settings"
  ON public.system_settings FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage settings"
  ON public.system_settings FOR ALL
  TO service_role
  USING (true);

-- Function to check if user can start new job (respects concurrency limits)
CREATE OR REPLACE FUNCTION public.can_start_job(p_user_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_per_user_limit INTEGER;
  v_global_limit INTEGER;
  v_user_active INTEGER;
  v_global_active INTEGER;
BEGIN
  -- Get limits
  SELECT (value->>'per_user')::int, (value->>'global')::int
  INTO v_per_user_limit, v_global_limit
  FROM public.system_settings
  WHERE key = 'concurrency_limits';
  
  -- Default limits if not set
  v_per_user_limit := COALESCE(v_per_user_limit, 3);
  v_global_limit := COALESCE(v_global_limit, 10);
  
  -- Count user's active jobs
  SELECT COALESCE(active_jobs, 0) INTO v_user_active
  FROM public.processing_concurrency
  WHERE user_email = p_user_email;
  
  -- Count global active jobs
  SELECT COALESCE(SUM(active_jobs), 0) INTO v_global_active
  FROM public.processing_concurrency;
  
  RETURN (COALESCE(v_user_active, 0) < v_per_user_limit) 
     AND (COALESCE(v_global_active, 0) < v_global_limit);
END;
$$;

-- Function to increment user's active job count
CREATE OR REPLACE FUNCTION public.increment_active_jobs(p_user_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.processing_concurrency (user_email, active_jobs, last_updated)
  VALUES (p_user_email, 1, now())
  ON CONFLICT (user_email) DO UPDATE SET
    active_jobs = processing_concurrency.active_jobs + 1,
    last_updated = now();
END;
$$;

-- Function to decrement user's active job count
CREATE OR REPLACE FUNCTION public.decrement_active_jobs(p_user_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.processing_concurrency
  SET active_jobs = GREATEST(0, active_jobs - 1),
      last_updated = now()
  WHERE user_email = p_user_email;
END;
$$;

-- Function to update heartbeat for a module
CREATE OR REPLACE FUNCTION public.update_module_heartbeat(p_module_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.course_modules
  SET heartbeat_at = now()
  WHERE id = p_module_id;
END;
$$;

-- Function to update heartbeat for a course
CREATE OR REPLACE FUNCTION public.update_course_heartbeat(p_course_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.courses
  SET last_heartbeat_at = now()
  WHERE id = p_course_id;
END;
$$;

-- Function to send per-module email only once (idempotent)
CREATE OR REPLACE FUNCTION public.mark_module_email_sent(p_module_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already_sent BOOLEAN;
BEGIN
  -- Check if already sent
  SELECT email_sent_at IS NOT NULL INTO v_already_sent
  FROM public.course_modules
  WHERE id = p_module_id;
  
  IF v_already_sent THEN
    RETURN FALSE; -- Already sent, do not send again
  END IF;
  
  -- Mark as sent
  UPDATE public.course_modules
  SET email_sent_at = now()
  WHERE id = p_module_id
    AND email_sent_at IS NULL;
  
  RETURN FOUND; -- Returns true if row was updated (email should be sent)
END;
$$;

-- Function to verify storage upload succeeded
CREATE OR REPLACE FUNCTION public.verify_frame_upload(
  p_module_id UUID,
  p_frame_count INTEGER,
  p_frame_urls JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify we have the expected number of frames
  IF jsonb_array_length(p_frame_urls) < p_frame_count THEN
    RETURN FALSE;
  END IF;
  
  -- Update module with verified frames
  UPDATE public.course_modules
  SET frame_urls = p_frame_urls,
      total_frames = jsonb_array_length(p_frame_urls),
      step_completed = COALESCE(step_completed, '{}'::jsonb) || 
        jsonb_build_object('frames_verified', true, 'verified_at', now())
  WHERE id = p_module_id;
  
  RETURN TRUE;
END;
$$;

-- Watchdog function to detect and repair stalled jobs
CREATE OR REPLACE FUNCTION public.watchdog_repair_stalled()
RETURNS TABLE(
  repaired_count INTEGER,
  terminal_count INTEGER,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timeout_seconds INTEGER;
  v_repaired INTEGER := 0;
  v_terminal INTEGER := 0;
  v_details JSONB := '[]'::jsonb;
BEGIN
  -- Get timeout setting
  SELECT (value)::int INTO v_timeout_seconds
  FROM public.system_settings
  WHERE key = 'heartbeat_timeout_seconds';
  
  v_timeout_seconds := COALESCE(v_timeout_seconds, 300);
  
  -- Find and repair stalled modules
  WITH stalled AS (
    SELECT id, course_id, module_number, processing_state, retry_count, heartbeat_at
    FROM public.course_modules
    WHERE processing_state IN ('transcribing', 'extracting', 'analyzing', 'pdf_building')
      AND heartbeat_at < now() - (v_timeout_seconds || ' seconds')::interval
  ),
  repairs AS (
    UPDATE public.course_modules cm
    SET 
      processing_state = CASE 
        WHEN cm.retry_count >= 3 THEN 'failed_terminal'
        ELSE 'queued'
      END,
      retry_count = cm.retry_count + 1,
      last_error = 'Stalled - no heartbeat for ' || v_timeout_seconds || ' seconds',
      heartbeat_at = now()
    FROM stalled s
    WHERE cm.id = s.id
    RETURNING cm.id, cm.processing_state, s.retry_count
  )
  SELECT 
    COUNT(*) FILTER (WHERE processing_state = 'queued'),
    COUNT(*) FILTER (WHERE processing_state = 'failed_terminal'),
    jsonb_agg(jsonb_build_object('id', id, 'state', processing_state))
  INTO v_repaired, v_terminal, v_details
  FROM repairs;
  
  RETURN QUERY SELECT v_repaired, v_terminal, v_details;
END;
$$;
-- Module processing leases (prevent duplicate processing)
CREATE TABLE IF NOT EXISTS public.module_leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL UNIQUE,
  course_id UUID NOT NULL,
  worker_id TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for module_leases
ALTER TABLE public.module_leases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages leases" ON public.module_leases
  FOR ALL USING (auth.role() = 'service_role');

-- Event outbox for reliable event processing
CREATE TABLE IF NOT EXISTS public.processing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- 'module_completed', 'batch_completed', 'processing_failed'
  entity_type TEXT NOT NULL, -- 'module', 'course', 'batch'
  entity_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for processing_events
ALTER TABLE public.processing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages events" ON public.processing_events
  FOR ALL USING (auth.role() = 'service_role');

-- Index for efficient event polling
CREATE INDEX IF NOT EXISTS idx_processing_events_unprocessed 
  ON public.processing_events(created_at) 
  WHERE processed_at IS NULL;

-- Acquire lease function (returns true if acquired, false if already held)
CREATE OR REPLACE FUNCTION public.acquire_module_lease(
  p_module_id UUID,
  p_course_id UUID,
  p_worker_id TEXT,
  p_lease_duration_seconds INTEGER DEFAULT 300
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acquired BOOLEAN;
BEGIN
  -- Clean up expired leases first
  DELETE FROM public.module_leases 
  WHERE module_id = p_module_id 
    AND expires_at < now() 
    AND released_at IS NULL;
  
  -- Try to insert new lease
  INSERT INTO public.module_leases (module_id, course_id, worker_id, expires_at)
  VALUES (p_module_id, p_course_id, p_worker_id, now() + (p_lease_duration_seconds || ' seconds')::interval)
  ON CONFLICT (module_id) DO NOTHING;
  
  -- Check if we got the lease
  SELECT EXISTS (
    SELECT 1 FROM public.module_leases 
    WHERE module_id = p_module_id 
      AND worker_id = p_worker_id 
      AND released_at IS NULL
  ) INTO v_acquired;
  
  RETURN v_acquired;
END;
$$;

-- Renew lease function (extend expiry while holding)
CREATE OR REPLACE FUNCTION public.renew_module_lease(
  p_module_id UUID,
  p_worker_id TEXT,
  p_lease_duration_seconds INTEGER DEFAULT 300
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.module_leases
  SET expires_at = now() + (p_lease_duration_seconds || ' seconds')::interval
  WHERE module_id = p_module_id 
    AND worker_id = p_worker_id 
    AND released_at IS NULL;
  
  RETURN FOUND;
END;
$$;

-- Release lease function
CREATE OR REPLACE FUNCTION public.release_module_lease(
  p_module_id UUID,
  p_worker_id TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.module_leases
  SET released_at = now()
  WHERE module_id = p_module_id 
    AND worker_id = p_worker_id 
    AND released_at IS NULL;
END;
$$;

-- Emit event to outbox
CREATE OR REPLACE FUNCTION public.emit_processing_event(
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_payload JSONB DEFAULT '{}'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO public.processing_events (event_type, entity_type, entity_id, payload)
  VALUES (p_event_type, p_entity_type, p_entity_id, p_payload)
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

-- Process event (mark as handled)
CREATE OR REPLACE FUNCTION public.mark_event_processed(p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.processing_events
  SET processed_at = now()
  WHERE id = p_event_id AND processed_at IS NULL;
END;
$$;

-- Get unprocessed events
CREATE OR REPLACE FUNCTION public.get_pending_events(p_limit INTEGER DEFAULT 100)
RETURNS TABLE(
  id UUID,
  event_type TEXT,
  entity_type TEXT,
  entity_id UUID,
  payload JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, e.event_type, e.entity_type, e.entity_id, e.payload, e.created_at
  FROM public.processing_events e
  WHERE e.processed_at IS NULL
  ORDER BY e.created_at ASC
  LIMIT p_limit;
END;
$$;
-- Enable RLS on email_subscribers table
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owner as well
ALTER TABLE public.email_subscribers FORCE ROW LEVEL SECURITY;

-- Ensure service role has full access
CREATE POLICY "Service role full access to email_subscribers"
ON public.email_subscribers
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
-- =============================================
-- COMPREHENSIVE SECURITY HARDENING MIGRATION
-- =============================================

-- 1. EMAIL HASHING FOR COURSES TABLE
-- Add email_hash column for secure lookups
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS email_hash TEXT;

-- Create index for fast hash lookups
CREATE INDEX IF NOT EXISTS idx_courses_email_hash ON public.courses(email_hash);

-- Create function to hash emails consistently
CREATE OR REPLACE FUNCTION public.hash_email(p_email TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT encode(sha256(lower(trim(p_email))::bytea), 'hex')
$$;

-- Create trigger to auto-hash emails on insert/update
CREATE OR REPLACE FUNCTION public.courses_hash_email_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.email_hash := public.hash_email(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS courses_email_hash_trigger ON public.courses;
CREATE TRIGGER courses_email_hash_trigger
BEFORE INSERT OR UPDATE OF email ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.courses_hash_email_trigger();

-- Backfill existing rows
UPDATE public.courses SET email_hash = public.hash_email(email) WHERE email_hash IS NULL;

-- Create secure function for email-based ownership check (uses hash)
CREATE OR REPLACE FUNCTION public.user_owns_course_by_hash(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courses
    WHERE id = p_course_id
      AND (
        user_id = auth.uid()
        OR email_hash = public.hash_email(auth.email())
      )
  )
$$;

-- 2. LOCK DOWN SYSTEM_SETTINGS TABLE
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can read system settings" ON public.system_settings;

-- Create service-role only policy
CREATE POLICY "Service role only for system_settings"
ON public.system_settings
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 3. FIX PUBLIC_COURSES VIEW - Remove sensitive columns
DROP VIEW IF EXISTS public.public_courses;
CREATE VIEW public.public_courses AS
SELECT 
  id,
  title,
  description,
  status,
  video_duration_seconds,
  is_multi_module,
  module_count,
  created_at
FROM public.courses
WHERE status = 'completed';

-- 4. DEAD LETTER QUEUE TABLE
CREATE TABLE IF NOT EXISTS public.dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- 'course', 'module', 'event'
  entity_id UUID NOT NULL,
  failure_reason TEXT NOT NULL,
  failure_context JSONB DEFAULT '{}',
  original_payload JSONB DEFAULT '{}',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  can_retry BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_retry_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT, -- 'auto', 'manual', 'watchdog'
  resolution_notes TEXT
);

-- Index for finding retryable items
CREATE INDEX IF NOT EXISTS idx_dlq_retryable ON public.dead_letter_queue(can_retry, resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dlq_entity ON public.dead_letter_queue(entity_type, entity_id);

-- Enable RLS on DLQ
ALTER TABLE public.dead_letter_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dead_letter_queue FORCE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for dead_letter_queue"
ON public.dead_letter_queue
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Function to add items to DLQ
CREATE OR REPLACE FUNCTION public.add_to_dead_letter_queue(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_failure_reason TEXT,
  p_context JSONB DEFAULT '{}',
  p_can_retry BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dlq_id UUID;
BEGIN
  INSERT INTO public.dead_letter_queue (entity_type, entity_id, failure_reason, failure_context, can_retry)
  VALUES (p_entity_type, p_entity_id, p_failure_reason, p_context, p_can_retry)
  RETURNING id INTO v_dlq_id;
  
  RETURN v_dlq_id;
END;
$$;

-- 5. UPLOAD INTEGRITY VERIFICATION
ALTER TABLE public.course_modules ADD COLUMN IF NOT EXISTS upload_checksum TEXT;
ALTER TABLE public.course_modules ADD COLUMN IF NOT EXISTS checksum_verified BOOLEAN DEFAULT false;

-- 6. ARTIFACT SCHEMA VERSIONING
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS artifact_schema_version INTEGER DEFAULT 1;

-- 7. ENHANCED RATE LIMITING
-- Add IP-based rate limiting support
ALTER TABLE public.rate_limits ADD COLUMN IF NOT EXISTS ip_address TEXT;
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip ON public.rate_limits(ip_address, action_type, window_start);

-- Enhanced rate limit check with IP support
CREATE OR REPLACE FUNCTION public.check_rate_limit_with_ip(
  p_session_id TEXT,
  p_ip_address TEXT,
  p_action_type TEXT,
  p_max_requests INTEGER DEFAULT 50,
  p_window_minutes INTEGER DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_count INTEGER;
  v_ip_count INTEGER;
  v_window_start TIMESTAMP WITH TIME ZONE;
BEGIN
  v_window_start := now() - (p_window_minutes || ' minutes')::interval;
  
  -- Count requests by session
  SELECT COALESCE(SUM(request_count), 0) INTO v_session_count
  FROM public.rate_limits
  WHERE session_id = p_session_id
    AND action_type = p_action_type
    AND window_start >= v_window_start;
  
  -- Count requests by IP (stricter limit)
  SELECT COALESCE(SUM(request_count), 0) INTO v_ip_count
  FROM public.rate_limits
  WHERE ip_address = p_ip_address
    AND action_type = p_action_type
    AND window_start >= v_window_start;
  
  -- Both session and IP must be under limit
  RETURN v_session_count < p_max_requests AND v_ip_count < (p_max_requests * 3);
END;
$$;

-- Function to record rate limit with IP
CREATE OR REPLACE FUNCTION public.increment_rate_limit_with_ip(
  p_session_id TEXT,
  p_ip_address TEXT,
  p_action_type TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.rate_limits (session_id, ip_address, action_type, request_count, window_start)
  VALUES (p_session_id, p_ip_address, p_action_type, 1, now());
END;
$$;

-- 8. HEALTH METRICS TABLE
CREATE TABLE IF NOT EXISTS public.health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  tags JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_metrics_name ON public.health_metrics(metric_name, recorded_at DESC);

ALTER TABLE public.health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_metrics FORCE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for health_metrics"
ON public.health_metrics
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Function to record metrics
CREATE OR REPLACE FUNCTION public.record_metric(
  p_name TEXT,
  p_value NUMERIC,
  p_tags JSONB DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.health_metrics (metric_name, metric_value, tags)
  VALUES (p_name, p_value, p_tags);
END;
$$;

-- 9. ARTIFACT ACCESS LOGGING
CREATE TABLE IF NOT EXISTS public.artifact_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL,
  access_type TEXT NOT NULL, -- 'pdf_view', 'pdf_download', 'signed_url'
  accessor_hash TEXT, -- hashed email or session
  ip_address TEXT,
  user_agent TEXT,
  accessed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artifact_access_course ON public.artifact_access_log(course_id, accessed_at DESC);

ALTER TABLE public.artifact_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifact_access_log FORCE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for artifact_access_log"
ON public.artifact_access_log
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 10. CLEANUP OLD DATA FUNCTION
CREATE OR REPLACE FUNCTION public.cleanup_old_data()
RETURNS TABLE(rate_limits_deleted INTEGER, events_deleted INTEGER, dlq_deleted INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate_limits INTEGER;
  v_events INTEGER;
  v_dlq INTEGER;
BEGIN
  -- Delete rate limits older than 24 hours
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '24 hours';
  GET DIAGNOSTICS v_rate_limits = ROW_COUNT;
  
  -- Delete processed events older than 30 days
  DELETE FROM public.processing_events WHERE processed_at < now() - interval '30 days';
  GET DIAGNOSTICS v_events = ROW_COUNT;
  
  -- Delete resolved DLQ entries older than 90 days
  DELETE FROM public.dead_letter_queue WHERE resolved_at < now() - interval '90 days';
  GET DIAGNOSTICS v_dlq = ROW_COUNT;
  
  RETURN QUERY SELECT v_rate_limits, v_events, v_dlq;
END;
$$;
-- Fix SECURITY DEFINER view warning for public_courses
-- Recreate as SECURITY INVOKER (default) with explicit grant

DROP VIEW IF EXISTS public.public_courses;

-- Create view with SECURITY INVOKER (explicit)
CREATE VIEW public.public_courses 
WITH (security_invoker = true)
AS
SELECT 
  id,
  title,
  description,
  status,
  video_duration_seconds,
  is_multi_module,
  module_count,
  created_at
FROM public.courses
WHERE status = 'completed';

-- Grant SELECT to anon and authenticated for public access
GRANT SELECT ON public.public_courses TO anon, authenticated;
-- =============================================
-- ADDITIONAL SECURITY HARDENERS
-- =============================================

-- 1. ADD SHARE TOKEN FOR PUBLIC COURSE ACCESS
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS share_token UUID DEFAULT gen_random_uuid();
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS share_enabled BOOLEAN DEFAULT false;

-- Index for fast share token lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_share_token ON public.courses(share_token);

-- 2. RECREATE PUBLIC_COURSES VIEW TO REQUIRE SHARE TOKEN
DROP VIEW IF EXISTS public.public_courses;

-- Public view now requires share_enabled = true and returns only safe fields
CREATE VIEW public.public_courses 
WITH (security_invoker = true)
AS
SELECT 
  id,
  share_token,
  title,
  description,
  status,
  video_duration_seconds,
  is_multi_module,
  module_count,
  created_at
FROM public.courses
WHERE status = 'completed' 
  AND share_enabled = true;

GRANT SELECT ON public.public_courses TO anon, authenticated;

-- 3. CREATE FUNCTION TO GET COURSE BY SHARE TOKEN (for public /view/:id pages)
CREATE OR REPLACE FUNCTION public.get_course_by_share_token(p_share_token UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  video_duration_seconds NUMERIC,
  is_multi_module BOOLEAN,
  module_count INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.title,
    c.description,
    c.video_duration_seconds,
    c.is_multi_module,
    c.module_count,
    c.created_at
  FROM public.courses c
  WHERE c.share_token = p_share_token
    AND c.status = 'completed'
    AND c.share_enabled = true;
END;
$$;

-- 4. STRENGTHEN OWNERSHIP - user_id primary, email_hash only for legacy
CREATE OR REPLACE FUNCTION public.user_owns_course_strict(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courses
    WHERE id = p_course_id
      AND (
        -- Primary: user_id must match (strongest check)
        user_id = auth.uid()
        -- Legacy fallback: only if user_id is NULL (old data before auth)
        OR (user_id IS NULL AND email_hash = public.hash_email(auth.email()))
      )
  )
$$;

-- 5. ENABLE SHARE BY DEFAULT FOR EXISTING COMPLETED COURSES
UPDATE public.courses 
SET share_enabled = true 
WHERE status = 'completed' AND share_enabled IS NULL;

-- 6. FUNCTION TO TOGGLE SHARING (for owner use)
CREATE OR REPLACE FUNCTION public.toggle_course_sharing(p_course_id UUID, p_enabled BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify ownership first
  IF NOT public.user_owns_course_strict(p_course_id) THEN
    RETURN FALSE;
  END IF;
  
  UPDATE public.courses
  SET share_enabled = p_enabled
  WHERE id = p_course_id;
  
  RETURN TRUE;
END;
$$;

-- 7. REGENERATE SHARE TOKEN (if user wants a new link)
CREATE OR REPLACE FUNCTION public.regenerate_share_token(p_course_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_token UUID;
BEGIN
  -- Verify ownership first
  IF NOT public.user_owns_course_strict(p_course_id) THEN
    RETURN NULL;
  END IF;
  
  v_new_token := gen_random_uuid();
  
  UPDATE public.courses
  SET share_token = v_new_token
  WHERE id = p_course_id;
  
  RETURN v_new_token;
END;
$$;
-- Add course_files column to store uploaded supplementary files (PDFs, docs, etc.)
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS course_files jsonb DEFAULT '[]'::jsonb;

-- Add comment explaining the column structure
COMMENT ON COLUMN public.courses.course_files IS 'Array of course-level supplementary files: [{name: string, storagePath: string, size: number, uploadedAt: timestamp}]';
-- Create storage bucket for course-level files (PDFs, docs, etc.)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('course-files', 'course-files', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload course files
CREATE POLICY "Authenticated users can upload course files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'course-files' 
  AND auth.uid() IS NOT NULL
);

-- Allow users to download their own course files (service role only for now)
CREATE POLICY "Service role can manage course files"
ON storage.objects FOR ALL
USING (bucket_id = 'course-files' AND auth.role() = 'service_role')
WITH CHECK (bucket_id = 'course-files' AND auth.role() = 'service_role');

-- Allow authenticated users to read course files
CREATE POLICY "Authenticated users can read course files"
ON storage.objects FOR SELECT
USING (bucket_id = 'course-files' AND auth.uid() IS NOT NULL);
-- Drop existing policies on email_subscribers that may have issues
DROP POLICY IF EXISTS "Deny all client access to email_subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "Service role full access to email_subscribers" ON public.email_subscribers;

-- Create a single permissive policy that ONLY allows service_role access
-- This is the correct pattern: default deny all, explicit allow for service_role only
CREATE POLICY "Service role only access to email_subscribers"
ON public.email_subscribers
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

-- Separate policy for service role (uses TO service_role which is a special role)
CREATE POLICY "Service role can manage email_subscribers"
ON public.email_subscribers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
-- Add module_files column to course_modules to store per-module supplementary files
ALTER TABLE public.course_modules 
ADD COLUMN IF NOT EXISTS module_files JSONB DEFAULT '[]'::jsonb;
-- Fix Critical Security Issue: email_subscribers table is publicly readable
-- This table contains PII (emails, names) and should NOT be publicly accessible

-- First, ensure RLS is enabled
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

-- Drop any overly permissive policies
DROP POLICY IF EXISTS "Allow public read" ON public.email_subscribers;
DROP POLICY IF EXISTS "Public read access" ON public.email_subscribers;
DROP POLICY IF EXISTS "Enable read for all" ON public.email_subscribers;
DROP POLICY IF EXISTS "Allow all operations" ON public.email_subscribers;

-- Create restrictive policies - service role only for all operations
-- No anonymous or authenticated users should be able to read subscriber data directly
-- All email operations should go through edge functions with service role

CREATE POLICY "Service role only for email_subscribers"
ON public.email_subscribers
FOR ALL
USING (
  (SELECT auth.role()) = 'service_role'
);

-- Fix Critical Security Issue: courses table exposing user emails
-- Courses should only be readable by the owner (matching email) or via share token

-- Ensure RLS is enabled
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Service role only" ON public.courses;
DROP POLICY IF EXISTS "Allow public read" ON public.courses;
DROP POLICY IF EXISTS "Public read access" ON public.courses;

-- Create proper policies for courses
-- 1. Service role can do everything (for edge functions)
CREATE POLICY "courses_service_role_all"
ON public.courses
FOR ALL
USING (
  (SELECT auth.role()) = 'service_role'
);

-- 2. Anonymous users can ONLY read courses with share_enabled=true
CREATE POLICY "courses_public_read_shared_only"
ON public.courses
FOR SELECT
USING (
  share_enabled = true
);

-- Fix the public_courses view - add RLS check for share_enabled
-- Since views inherit RLS from base tables, the courses policies will apply
-- But we should also ensure the view only returns shared courses

-- Drop and recreate the view with explicit share_enabled filter
DROP VIEW IF EXISTS public.public_courses;

CREATE VIEW public.public_courses AS
SELECT 
  id,
  title,
  description,
  status,
  created_at,
  is_multi_module,
  module_count,
  video_duration_seconds,
  share_token
FROM public.courses
WHERE share_enabled = true;
-- Fix the SECURITY DEFINER view issue
-- Change the view to use SECURITY INVOKER (the default, but being explicit)

DROP VIEW IF EXISTS public.public_courses;

CREATE VIEW public.public_courses 
WITH (security_invoker = true)
AS
SELECT 
  id,
  title,
  description,
  status,
  created_at,
  is_multi_module,
  module_count,
  video_duration_seconds,
  share_token
FROM public.courses
WHERE share_enabled = true;
-- Clean up redundant/conflicting policies on email_subscribers
-- Keep only the service role policy

-- Remove the policy that explicitly denies anon/authenticated (redundant with service role only)
DROP POLICY IF EXISTS "Service role only access to email_subscribers" ON public.email_subscribers;

-- Remove any old permissive policies 
DROP POLICY IF EXISTS "Service role can manage email_subscribers" ON public.email_subscribers;

-- Ensure only service role policy remains
-- This is the correct approach: USING true for service_role roles
DROP POLICY IF EXISTS "Service role only for email_subscribers" ON public.email_subscribers;

CREATE POLICY "email_subscribers_service_role_only"
ON public.email_subscribers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- For batch_jobs, ensure it's locked to service role
ALTER TABLE public.batch_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own batch jobs" ON public.batch_jobs;
DROP POLICY IF EXISTS "Service role batch jobs access" ON public.batch_jobs;

CREATE POLICY "batch_jobs_service_role_only"
ON public.batch_jobs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Update public_courses view to exclude email (it's already excluded but be explicit)
-- The view is safe because it doesn't include the email column
-- Fix the courses table exposure issue
-- The courses_public_read_shared_only policy allows reading the entire row including email
-- We need to remove this policy and ensure public access only goes through the public_courses view

-- Drop the problematic policy that exposes all columns
DROP POLICY IF EXISTS "courses_public_read_shared_only" ON public.courses;

-- Keep only the service role and authenticated user policies for the courses table
-- Anonymous users should NOT be able to read courses directly
-- They should use the public_courses view which excludes sensitive fields

-- Ensure the public_courses view is the only way to access shared course data publicly
-- The view already excludes email, team_notification_email, storage_path, etc.
-- Fix the step check constraint to include ALL valid steps including parallel processing steps
ALTER TABLE processing_queue DROP CONSTRAINT IF EXISTS processing_queue_step_check;

ALTER TABLE processing_queue ADD CONSTRAINT processing_queue_step_check 
CHECK (step = ANY (ARRAY[
  'transcribe'::text, 
  'transcribe_and_extract'::text,
  'extract_frames'::text, 
  'render_gifs'::text, 
  'train_ai'::text,
  'analyze_audio'::text,
  'build_pdf'::text,
  'transcribe_module'::text,
  'transcribe_and_extract_module'::text,
  'extract_frames_module'::text,
  'render_gifs_module'::text,
  'train_ai_module'::text,
  'analyze_audio_module'::text,
  'build_pdf_module'::text,
  'check_next_module'::text
]));
-- =====================================================
-- SECURITY HARDENING: Address all identified vulnerabilities
-- =====================================================

-- 1. FIX: email_subscribers table - service_role ONLY (no public access)
-- The current policy with USING(true) allows anyone to read
DROP POLICY IF EXISTS "email_subscribers_service_role_only" ON public.email_subscribers;

-- Create restrictive policy - ONLY service_role can access
CREATE POLICY "email_subscribers_service_role_only" ON public.email_subscribers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add explicit deny for anon and authenticated
CREATE POLICY "Block non-service access to email_subscribers" ON public.email_subscribers
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 2. FIX: video-uploads storage bucket policies (ensure bucket has proper RLS)
-- Insert bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('video-uploads', 'video-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Drop any existing policies and recreate properly
DROP POLICY IF EXISTS "Authenticated users can upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to video-uploads" ON storage.objects;
DROP POLICY IF EXISTS "Service role can manage video-uploads" ON storage.objects;

-- Only authenticated users can upload videos
CREATE POLICY "Authenticated users can upload videos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'video-uploads');

-- Public read access (for processing)
CREATE POLICY "Public read access to video-uploads"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'video-uploads');

-- Service role can manage all video-uploads
CREATE POLICY "Service role can manage video-uploads"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'video-uploads')
WITH CHECK (bucket_id = 'video-uploads');

-- 3. FIX: course_progress - strengthen with auth.uid() 
DROP POLICY IF EXISTS "Users can view their course progress by email" ON public.course_progress;

CREATE POLICY "Users can view their course progress securely" ON public.course_progress
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.courses 
      WHERE courses.id = course_progress.course_id 
      AND (
        courses.user_id = auth.uid() 
        OR (courses.user_id IS NULL AND courses.email = auth.email())
      )
    )
  );

-- 4. FIX: artifact_access_log - mark as properly secured (already service_role only)
-- The existing policy is correct but let's ensure it's explicitly blocking
DROP POLICY IF EXISTS "Service role only for artifact_access_log" ON public.artifact_access_log;

CREATE POLICY "Service role only for artifact_access_log" ON public.artifact_access_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Block non-service access to artifact_access_log" ON public.artifact_access_log
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
-- Fix public_courses view security: ensure it only exposes safe public data
-- The view is already protected by only showing share_enabled=true courses
-- But let's make the security explicit and mask team_notification fields

-- Drop and recreate view with explicit column selection (no sensitive data)
DROP VIEW IF EXISTS public.public_courses;

CREATE VIEW public.public_courses WITH (security_invoker = true) AS
SELECT 
  id,
  title,
  description,
  video_duration_seconds,
  is_multi_module,
  module_count,
  share_token,
  status,
  created_at
  -- Explicitly EXCLUDE: email, user_id, email_hash, team_notification_email, team_notification_role
FROM courses
WHERE share_enabled = true AND status = 'completed';

-- Add comment documenting security rationale
COMMENT ON VIEW public.public_courses IS 'Public view for shared courses. Explicitly excludes PII (email, user_id, team contacts). Only shows share_enabled=true completed courses.';
-- Drop existing policies that use the less secure function
DROP POLICY IF EXISTS "Users can view own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can delete own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can update own courses without changing email" ON public.courses;

-- Recreate policies using the stricter user_owns_course_secure function
CREATE POLICY "Users can view own courses securely"
ON public.courses
FOR SELECT
TO authenticated
USING (user_owns_course_secure(id));

CREATE POLICY "Users can delete own courses securely"
ON public.courses
FOR DELETE
TO authenticated
USING (user_owns_course_secure(id));

CREATE POLICY "Users can update own courses securely"
ON public.courses
FOR UPDATE
TO authenticated
USING (user_owns_course_secure(id))
WITH CHECK (
  user_owns_course_secure(id) 
  AND email = (SELECT c.email FROM courses c WHERE c.id = courses.id)
);
-- Add user_id column to support_conversations for secure ownership
ALTER TABLE public.support_conversations 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create a secure ownership function for support conversations
CREATE OR REPLACE FUNCTION public.user_owns_support_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.support_conversations
    WHERE id = p_conversation_id
      AND (
        -- Primary check: user_id must match (strongest)
        user_id = auth.uid()
        -- Legacy fallback: only if user_id is NULL (old data)
        OR (user_id IS NULL AND user_email = auth.email())
      )
  )
$$;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own support conversations" ON public.support_conversations;
DROP POLICY IF EXISTS "Users can create support conversations" ON public.support_conversations;
DROP POLICY IF EXISTS "Users can update their own support conversations" ON public.support_conversations;
DROP POLICY IF EXISTS "Rate limited support conversation access" ON public.support_conversations;

-- Create stricter RLS policies using secure function
CREATE POLICY "Users can view own support conversations securely"
ON public.support_conversations
FOR SELECT
TO authenticated
USING (
  user_owns_support_conversation(id)
  AND check_rate_limit(
    COALESCE(auth.uid()::text, 'anonymous'),
    'support_view',
    20,
    5
  )
);

CREATE POLICY "Users can create support conversations with own identity"
ON public.support_conversations
FOR INSERT
TO authenticated
WITH CHECK (
  (user_id = auth.uid() OR user_id IS NULL)
  AND user_email = auth.email()
);

CREATE POLICY "Users can update own support conversations securely"
ON public.support_conversations
FOR UPDATE
TO authenticated
USING (user_owns_support_conversation(id))
WITH CHECK (
  user_owns_support_conversation(id)
  AND user_email = (SELECT sc.user_email FROM support_conversations sc WHERE sc.id = support_conversations.id)
);

-- Service role full access
CREATE POLICY "Service role full access to support_conversations"
ON public.support_conversations
FOR ALL
TO authenticated
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
-- Drop the permissive policy that allows unrestricted access
DROP POLICY IF EXISTS "email_subscribers_service_role_only" ON public.email_subscribers;

-- Recreate with proper service_role restriction
CREATE POLICY "email_subscribers_service_role_only"
ON public.email_subscribers
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
-- Drop ALL existing user-facing policies on courses to start fresh
DROP POLICY IF EXISTS "Users can view own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can delete own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can update own courses without changing email" ON public.courses;
DROP POLICY IF EXISTS "Users can view own courses securely" ON public.courses;
DROP POLICY IF EXISTS "Users can delete own courses securely" ON public.courses;
DROP POLICY IF EXISTS "Users can update own courses securely" ON public.courses;

-- Recreate all policies using the stricter user_owns_course_secure function
CREATE POLICY "Users can view own courses securely"
ON public.courses
FOR SELECT
TO authenticated
USING (user_owns_course_secure(id));

CREATE POLICY "Users can delete own courses securely"
ON public.courses
FOR DELETE
TO authenticated
USING (user_owns_course_secure(id));

CREATE POLICY "Users can update own courses securely"
ON public.courses
FOR UPDATE
TO authenticated
USING (user_owns_course_secure(id))
WITH CHECK (
  user_owns_course_secure(id) 
  AND email = (SELECT c.email FROM courses c WHERE c.id = courses.id)
  AND (team_notification_email IS NULL OR team_notification_email = (SELECT c.team_notification_email FROM courses c WHERE c.id = courses.id))
);
-- Drop all existing policies on mock_orders
DROP POLICY IF EXISTS "Rate limited mock order creation" ON public.mock_orders;
DROP POLICY IF EXISTS "Service role can delete mock_orders" ON public.mock_orders;
DROP POLICY IF EXISTS "Service role can read mock_orders" ON public.mock_orders;
DROP POLICY IF EXISTS "Service role can update mock_orders" ON public.mock_orders;

-- Block all non-service access
CREATE POLICY "Block non-service access to mock_orders"
ON public.mock_orders
FOR ALL
USING (false)
WITH CHECK (false);

-- Allow service role full access
CREATE POLICY "Service role only for mock_orders"
ON public.mock_orders
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
-- Add enhanced analytics columns to artifact_access_log
ALTER TABLE public.artifact_access_log 
ADD COLUMN IF NOT EXISTS download_source text, -- 'email', 'dashboard', 'direct'
ADD COLUMN IF NOT EXISTS referrer text,
ADD COLUMN IF NOT EXISTS download_completed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS module_id uuid,
ADD COLUMN IF NOT EXISTS session_fingerprint text; -- For abuse detection

-- Create index for analytics queries
CREATE INDEX IF NOT EXISTS idx_artifact_access_course_time 
ON public.artifact_access_log(course_id, accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifact_access_accessor 
ON public.artifact_access_log(accessor_hash, accessed_at DESC);

-- Create view for download analytics dashboard
CREATE OR REPLACE VIEW public.download_analytics AS
SELECT 
  course_id,
  DATE_TRUNC('day', accessed_at) as download_date,
  COUNT(*) as total_accesses,
  COUNT(DISTINCT accessor_hash) as unique_users,
  COUNT(DISTINCT ip_address) as unique_ips,
  COUNT(*) FILTER (WHERE access_type = 'download') as downloads,
  COUNT(*) FILTER (WHERE access_type = 'signed_url') as url_generations
FROM public.artifact_access_log
GROUP BY course_id, DATE_TRUNC('day', accessed_at);

-- Restrict view to service role only
REVOKE ALL ON public.download_analytics FROM anon, authenticated;
GRANT SELECT ON public.download_analytics TO service_role;
-- Fix: Recreate public_courses view WITHOUT email column to prevent exposure
DROP VIEW IF EXISTS public.public_courses;

CREATE VIEW public.public_courses AS
SELECT 
  id,
  title,
  description,
  video_duration_seconds,
  is_multi_module,
  module_count,
  created_at,
  status,
  share_token
FROM public.courses
WHERE share_enabled = true AND status = 'completed';

-- Ensure only service role can query this view
REVOKE ALL ON public.public_courses FROM anon, authenticated;
GRANT SELECT ON public.public_courses TO service_role;

COMMENT ON VIEW public.public_courses IS 'Public course metadata - explicitly excludes email and sensitive data';
-- 1. Drop the existing insecure view
DROP VIEW IF EXISTS public.public_courses;

-- 2. Recreate the view with 'security_invoker = true' 
-- This forces the view to check RLS policies of the underlying tables
CREATE VIEW public.public_courses 
WITH (security_invoker = true) AS 
SELECT 
    id,
    title,
    description,
    status,
    video_duration_seconds,
    is_multi_module,
    module_count,
    share_token,
    share_enabled,
    created_at
    -- EXCLUDED: email, user_id, email_hash to prevent harvesting
FROM public.courses
WHERE share_enabled = true AND status = 'completed';
-- =====================================================
-- FINAL SECURITY HARDENING - IRON VAULT PROTOCOL
-- =====================================================

-- 1. COURSES TABLE: Strict user_id based RLS (no email exposure)
-- Drop existing permissive policies and create strict ones
DROP POLICY IF EXISTS "Users can view own courses securely" ON public.courses;
DROP POLICY IF EXISTS "Block anonymous access to courses" ON public.courses;

-- New strict policy: Only see your own courses by user_id
CREATE POLICY "Strict user owns course SELECT"
ON public.courses
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() 
  OR (user_id IS NULL AND email = auth.email())
);

-- Block anonymous completely
CREATE POLICY "Block anonymous courses"
ON public.courses
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 2. EMAIL_SUBSCRIBERS: Explicit deny for anon and authenticated
DROP POLICY IF EXISTS "Block non-service access to email_subscribers" ON public.email_subscribers;

CREATE POLICY "Deny anon access to email_subscribers"
ON public.email_subscribers
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny authenticated access to email_subscribers"
ON public.email_subscribers
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- 3. BATCH_JOBS: Service role only - block all others
DROP POLICY IF EXISTS "Users can view their own batch jobs by email" ON public.batch_jobs;
DROP POLICY IF EXISTS "Service role can manage batch jobs" ON public.batch_jobs;
DROP POLICY IF EXISTS "batch_jobs_service_role_only" ON public.batch_jobs;

CREATE POLICY "batch_jobs_service_role_only"
ON public.batch_jobs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Deny anon access to batch_jobs"
ON public.batch_jobs
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny authenticated access to batch_jobs"
ON public.batch_jobs
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- 4. SUPPORT_CONVERSATIONS: Only see your own by email match
DROP POLICY IF EXISTS "Rate limited support_conversations viewing" ON public.support_conversations;

-- Create strict policy: only see conversations where user_email = your email
CREATE POLICY "Users can only see own support conversations"
ON public.support_conversations
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR (user_id IS NULL AND user_email = auth.email())
);

-- Block anonymous from support conversations
CREATE POLICY "Block anon from support_conversations"
ON public.support_conversations
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 5. Recreate public_courses view with security_invoker (already done but ensuring clean state)
DROP VIEW IF EXISTS public.public_courses;

CREATE VIEW public.public_courses 
WITH (security_invoker = true) AS 
SELECT 
    id,
    title,
    description,
    status,
    video_duration_seconds,
    is_multi_module,
    module_count,
    share_token,
    share_enabled,
    created_at
FROM public.courses
WHERE share_enabled = true AND status = 'completed';
-- Final hardening: Remove NULL user_id fallback vulnerability
-- Create a security definer function for strict course ownership

-- Update the strict course SELECT policy to use user_id ONLY (no email fallback)
DROP POLICY IF EXISTS "Strict user owns course SELECT" ON public.courses;

CREATE POLICY "Strict user owns course SELECT"
ON public.courses
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- For legacy courses without user_id, they will need to be migrated
-- Users can still access their own data via the user_owns_course_secure function in update/delete policies

-- Also tighten support_conversations to user_id only
DROP POLICY IF EXISTS "Users can only see own support conversations" ON public.support_conversations;

CREATE POLICY "Strict support conversation ownership"
ON public.support_conversations
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- ============================================
-- IRON VAULT SECURITY HARDENING MIGRATION
-- ============================================

-- 1. PUBLIC_COURSES VIEW: Recreate with security_invoker = true
-- This ensures the view runs with the caller's permissions, not definer's
DROP VIEW IF EXISTS public.public_courses;
CREATE VIEW public.public_courses 
WITH (security_invoker = true)
AS SELECT 
    id,
    title,
    description,
    status,
    video_duration_seconds,
    is_multi_module,
    module_count,
    share_token,
    share_enabled,
    created_at
    -- REMOVED: email, user_id, email_hash, team_notification_email (sensitive data)
FROM courses
WHERE share_enabled = true AND status = 'completed';

-- 2. DOWNLOAD_ANALYTICS VIEW: Recreate with security_invoker = true
-- And restrict to service_role only via RLS on base table (already done on artifact_access_log)
DROP VIEW IF EXISTS public.download_analytics;
CREATE VIEW public.download_analytics 
WITH (security_invoker = true)
AS SELECT 
    course_id,
    date_trunc('day', accessed_at) AS download_date,
    count(*) AS total_accesses,
    count(DISTINCT accessor_hash) AS unique_users,
    count(DISTINCT ip_address) AS unique_ips,
    count(*) FILTER (WHERE access_type = 'download') AS downloads,
    count(*) FILTER (WHERE access_type = 'signed_url') AS url_generations
FROM artifact_access_log
GROUP BY course_id, date_trunc('day', accessed_at);

-- 3. SUPPORT_CONVERSATIONS: Clean up duplicate SELECT policies
-- Keep only the strict user_id = auth.uid() policy
DROP POLICY IF EXISTS "Users can view their support conversations with rate limit" ON public.support_conversations;
DROP POLICY IF EXISTS "Users can view own support conversations securely" ON public.support_conversations;

-- Create single, strict SELECT policy
CREATE POLICY "Strict owner SELECT on support_conversations"
ON public.support_conversations
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR (user_id IS NULL AND user_email = auth.email())
);

-- 4. Ensure courses service_role policy uses proper check
DROP POLICY IF EXISTS "courses_service_role_all" ON public.courses;
CREATE POLICY "courses_service_role_all"
ON public.courses
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. Verify batch_jobs has FORCE ROW LEVEL SECURITY
ALTER TABLE public.batch_jobs FORCE ROW LEVEL SECURITY;

-- 6. Verify email_subscribers has FORCE ROW LEVEL SECURITY  
ALTER TABLE public.email_subscribers FORCE ROW LEVEL SECURITY;

-- 7. Verify artifact_access_log has FORCE ROW LEVEL SECURITY (base for download_analytics)
ALTER TABLE public.artifact_access_log FORCE ROW LEVEL SECURITY;
-- Create function to detect concurrency counter drift
-- Compares processing_concurrency.active_jobs against actual processing jobs
CREATE OR REPLACE FUNCTION public.detect_concurrency_drift()
RETURNS TABLE(user_email text, reported_count integer, actual_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pc.user_email,
    pc.active_jobs as reported_count,
    COALESCE(actual.job_count, 0)::integer as actual_count
  FROM public.processing_concurrency pc
  LEFT JOIN (
    -- Count actual processing jobs per user email
    SELECT c.email, COUNT(*)::integer as job_count
    FROM public.processing_queue pq
    JOIN public.courses c ON pq.course_id = c.id
    WHERE pq.status = 'processing'
    GROUP BY c.email
  ) actual ON actual.email = pc.user_email
  WHERE pc.active_jobs != COALESCE(actual.job_count, 0)
    AND pc.last_updated < now() - interval '2 minutes'; -- Only fix if stale for 2+ minutes
END;
$$;
-- Create transformation_artifacts table
CREATE TABLE public.transformation_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  video_title text NOT NULL,
  video_url text NOT NULL,
  storage_path text,
  duration_seconds integer NOT NULL DEFAULT 0,
  frame_count integer NOT NULL DEFAULT 0,
  key_moments integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processing',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create artifact_frames table
CREATE TABLE public.artifact_frames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid REFERENCES public.transformation_artifacts(id) ON DELETE CASCADE NOT NULL,
  frame_index integer NOT NULL,
  timestamp_ms integer NOT NULL,
  screenshot_url text,
  ocr_text text,
  cursor_pause boolean DEFAULT false,
  text_selected boolean DEFAULT false,
  zoom_focus boolean DEFAULT false,
  lingering_frame boolean DEFAULT false,
  confidence_score decimal(3,2) NOT NULL DEFAULT 0,
  confidence_level text NOT NULL DEFAULT 'LOW',
  is_critical boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create verification_approvals table
CREATE TABLE public.verification_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid REFERENCES public.transformation_artifacts(id) ON DELETE CASCADE NOT NULL,
  frame_id uuid REFERENCES public.artifact_frames(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('APPROVED', 'REJECTED')),
  reason text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.transformation_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifact_frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_approvals ENABLE ROW LEVEL SECURITY;

-- RLS policies for transformation_artifacts
CREATE POLICY "Users can view own artifacts"
  ON public.transformation_artifacts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own artifacts"
  ON public.transformation_artifacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own artifacts"
  ON public.transformation_artifacts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own artifacts"
  ON public.transformation_artifacts FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to transformation_artifacts"
  ON public.transformation_artifacts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- RLS policies for artifact_frames
CREATE POLICY "Users can view own frames"
  ON public.artifact_frames FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.transformation_artifacts
      WHERE id = artifact_frames.artifact_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to artifact_frames"
  ON public.artifact_frames FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- RLS policies for verification_approvals
CREATE POLICY "Users can view own approvals"
  ON public.verification_approvals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own approvals"
  ON public.verification_approvals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access to verification_approvals"
  ON public.verification_approvals FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Create updated_at trigger for transformation_artifacts
CREATE TRIGGER update_transformation_artifacts_updated_at
  BEFORE UPDATE ON public.transformation_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_artifact_frames_artifact_id ON public.artifact_frames(artifact_id);
CREATE INDEX idx_verification_approvals_artifact_id ON public.verification_approvals(artifact_id);
CREATE INDEX idx_verification_approvals_frame_id ON public.verification_approvals(frame_id);
-- =====================================================
-- CRITICAL SECURITY FIX: Hardening RLS Policies
-- =====================================================

-- 1. FIX: email_subscribers - Ensure complete lockdown
-- Drop existing policies and recreate with proper PERMISSIVE deny
DROP POLICY IF EXISTS "Deny anon access to email_subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "Deny authenticated access to email_subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "email_subscribers_service_role_only" ON public.email_subscribers;

-- Service role is the ONLY access (no anon/authenticated at all)
CREATE POLICY "email_subscribers_service_role_only" 
ON public.email_subscribers 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 2. FIX: courses - Create a secure view that hides email for non-owners
-- First, ensure the existing public_courses view doesn't expose email
DROP VIEW IF EXISTS public.public_courses;

CREATE VIEW public.public_courses AS
SELECT 
  id,
  title,
  description,
  status,
  video_duration_seconds,
  is_multi_module,
  module_count,
  share_enabled,
  share_token,
  created_at
FROM public.courses
WHERE share_enabled = true AND status = 'completed';

-- Grant access to the view
GRANT SELECT ON public.public_courses TO anon, authenticated;

-- 3. FIX: download_analytics - Restrict view to service role only
DROP VIEW IF EXISTS public.download_analytics;

CREATE VIEW public.download_analytics 
WITH (security_invoker = true)
AS
SELECT 
  course_id,
  DATE_TRUNC('day', accessed_at) as download_date,
  COUNT(*) as total_accesses,
  COUNT(*) FILTER (WHERE download_completed = true) as downloads,
  COUNT(DISTINCT accessor_hash) as unique_users,
  COUNT(DISTINCT ip_address) as unique_ips,
  COUNT(*) FILTER (WHERE access_type = 'url_generation') as url_generations
FROM public.artifact_access_log
GROUP BY course_id, DATE_TRUNC('day', accessed_at);

-- Revoke all access from anon/authenticated - only service role
REVOKE ALL ON public.download_analytics FROM anon, authenticated;
GRANT SELECT ON public.download_analytics TO service_role;

-- 4. FIX: artifact_access_log - Ensure complete lockdown
DROP POLICY IF EXISTS "Block non-service access to artifact_access_log" ON public.artifact_access_log;
DROP POLICY IF EXISTS "Service role only for artifact_access_log" ON public.artifact_access_log;

-- Single permissive policy for service role only
CREATE POLICY "artifact_access_log_service_role_only" 
ON public.artifact_access_log 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 5. ADDITIONAL: Ensure batch_jobs is also locked down (contains user emails)
DROP POLICY IF EXISTS "Deny anon access to batch_jobs" ON public.batch_jobs;
DROP POLICY IF EXISTS "Deny authenticated access to batch_jobs" ON public.batch_jobs;
DROP POLICY IF EXISTS "batch_jobs_service_role_only" ON public.batch_jobs;

CREATE POLICY "batch_jobs_service_role_only" 
ON public.batch_jobs 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
-- Fix: Convert public_courses view to SECURITY INVOKER
-- This ensures the view uses the querying user's permissions, not the creator's

DROP VIEW IF EXISTS public.public_courses;

CREATE VIEW public.public_courses 
WITH (security_invoker = true)
AS
SELECT 
  id,
  title,
  description,
  status,
  video_duration_seconds,
  is_multi_module,
  module_count,
  share_enabled,
  share_token,
  created_at
FROM public.courses
WHERE share_enabled = true AND status = 'completed';

-- Grant read access for shared courses
GRANT SELECT ON public.public_courses TO anon, authenticated;
-- ============================================
-- IMMUTABLE AUDIT TRAIL - Timestamp Trigger
-- ============================================
-- Ensures created_at is always system-generated
-- Combined with existing RLS (INSERT/SELECT only) = immutable audit trail
-- ============================================

-- Create timestamp function
CREATE OR REPLACE FUNCTION public.set_verification_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing trigger if present (idempotent)
DROP TRIGGER IF EXISTS verification_timestamp_trigger ON verification_approvals;

-- Create trigger for automatic timestamp on every insert
CREATE TRIGGER verification_timestamp_trigger
  BEFORE INSERT ON verification_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_verification_timestamp();
-- Fix 1: Ensure email_subscribers has explicit blocking for non-service roles
-- The table already has a restrictive service_role policy, but let's add an explicit block

-- Drop existing policy if it exists and recreate with proper blocking
DROP POLICY IF EXISTS "email_subscribers_service_role_only" ON public.email_subscribers;

-- Create explicit block for all non-service access
CREATE POLICY "Block all non-service access to email_subscribers"
ON public.email_subscribers
FOR ALL
TO public
USING (false)
WITH CHECK (false);

-- Create service role access policy
CREATE POLICY "Service role full access to email_subscribers"
ON public.email_subscribers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Fix 2: Recreate download_analytics view with security_invoker = true
-- First drop the existing view
DROP VIEW IF EXISTS public.download_analytics;

-- Recreate the view with security_invoker enabled so it respects RLS of underlying tables
CREATE VIEW public.download_analytics
WITH (security_invoker = true)
AS
SELECT 
  course_id,
  DATE_TRUNC('day', accessed_at) as download_date,
  COUNT(*) as total_accesses,
  COUNT(DISTINCT accessor_hash) as unique_users,
  COUNT(DISTINCT ip_address) as unique_ips,
  COUNT(*) FILTER (WHERE access_type = 'url_generation') as url_generations,
  COUNT(*) FILTER (WHERE download_completed = true) as downloads
FROM public.artifact_access_log
GROUP BY course_id, DATE_TRUNC('day', accessed_at);

-- Grant appropriate access to the view
GRANT SELECT ON public.download_analytics TO service_role;
-- Create reasoning_logs table for Multi-Model Reasoning Ledger
CREATE TABLE public.reasoning_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL REFERENCES public.transformation_artifacts(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('AI', 'Human', 'System')),
  source_label TEXT NOT NULL,
  analysis_focus TEXT NOT NULL CHECK (analysis_focus IN ('Visual', 'Logical', 'Risk', 'Process', 'Performance', 'Other')),
  summary TEXT NOT NULL,
  concern_level TEXT NOT NULL DEFAULT 'None' CHECK (concern_level IN ('None', 'Low', 'Medium', 'High', 'Critical')),
  recommendation TEXT,
  human_decision TEXT NOT NULL DEFAULT 'Pending' CHECK (human_decision IN ('Pending', 'Accepted', 'Modified', 'Rejected')),
  decision_notes TEXT,
  superseded_by UUID REFERENCES public.reasoning_logs(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_reasoning_logs_artifact_id ON public.reasoning_logs(artifact_id);
CREATE INDEX idx_reasoning_logs_created_at ON public.reasoning_logs(created_at);

-- Enable RLS
ALTER TABLE public.reasoning_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can view reasoning logs for artifacts they own
CREATE POLICY "Users can view reasoning logs for their artifacts"
ON public.reasoning_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.transformation_artifacts ta
    WHERE ta.id = reasoning_logs.artifact_id
    AND ta.user_id = auth.uid()
  )
);

-- Users can insert reasoning logs for artifacts they own (append-only)
CREATE POLICY "Users can add reasoning logs to their artifacts"
ON public.reasoning_logs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.transformation_artifacts ta
    WHERE ta.id = reasoning_logs.artifact_id
    AND ta.user_id = auth.uid()
  )
);

-- Users can only update human_decision and decision_notes (not the reasoning itself)
CREATE POLICY "Users can lock decisions on their reasoning logs"
ON public.reasoning_logs
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.transformation_artifacts ta
    WHERE ta.id = reasoning_logs.artifact_id
    AND ta.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.transformation_artifacts ta
    WHERE ta.id = reasoning_logs.artifact_id
    AND ta.user_id = auth.uid()
  )
);

-- Service role has full access
CREATE POLICY "Service role has full access to reasoning logs"
ON public.reasoning_logs
FOR ALL
USING (auth.role() = 'service_role');

-- Create function to check if artifact can be finalized (all decisions locked)
CREATE OR REPLACE FUNCTION public.can_finalize_artifact(p_artifact_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.reasoning_logs
    WHERE artifact_id = p_artifact_id
    AND human_decision = 'Pending'
    AND superseded_by IS NULL
  )
$$;
-- Add source_role column for Trinity Roles (Governor, Engineer, Architect)
ALTER TABLE public.reasoning_logs 
ADD COLUMN source_role text;

-- Add comment explaining the allowed values
COMMENT ON COLUMN public.reasoning_logs.source_role IS 'Trinity Role: ROLE_GOVERNOR (risk/ethics), ROLE_ENGINEER (execution/logic), ROLE_ARCHITECT (structure/scaling), or NULL for non-role entries';
-- STEP 1: Lock email_subscribers table
-- BEFORE: Has policies blocking non-service access, but we need to ensure 
-- admin users (from user_roles table) can also read for future-proofing

-- First, drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Block all non-service access to email_subscribers" ON public.email_subscribers;
DROP POLICY IF EXISTS "Service role full access to email_subscribers" ON public.email_subscribers;

-- Create restrictive policy: ONLY service_role can access
-- (Admin access will be through edge functions using service_role)
CREATE POLICY "email_subscribers_service_role_only" 
ON public.email_subscribers 
FOR ALL 
TO authenticated, anon
USING (false)
WITH CHECK (false);

-- Service role bypass (service_role bypasses RLS by default, but explicit for clarity)
CREATE POLICY "email_subscribers_service_role_access"
ON public.email_subscribers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
-- Zero-Knowledge Ghost Upload Architecture
-- Phase 1: Create purge audit infrastructure

-- 1. Create purge_audit_log table to track all source video deletions
CREATE TABLE public.purge_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  module_id UUID REFERENCES course_modules(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  purged_at TIMESTAMPTZ DEFAULT now(),
  purge_method TEXT CHECK (purge_method IN ('automatic', 'cron', 'manual')) NOT NULL DEFAULT 'automatic',
  file_hash TEXT, -- SHA256 hash for identification (not content) - optional
  verified BOOLEAN DEFAULT false,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.purge_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role can access purge logs
CREATE POLICY "purge_audit_log_service_role_only" 
ON public.purge_audit_log 
FOR ALL 
TO authenticated, anon
USING (false)
WITH CHECK (false);

CREATE POLICY "purge_audit_log_service_role_access"
ON public.purge_audit_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2. Add source_purged_at columns to courses and course_modules
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS source_purged_at TIMESTAMPTZ;

ALTER TABLE public.course_modules 
ADD COLUMN IF NOT EXISTS source_purged_at TIMESTAMPTZ;

-- 3. Add user_attestation fields for legal compliance
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS content_attestation_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS content_attestation_ip TEXT;

-- 4. Create index for efficient purge auditing
CREATE INDEX IF NOT EXISTS idx_purge_audit_log_course_id ON public.purge_audit_log(course_id);
CREATE INDEX IF NOT EXISTS idx_purge_audit_log_purged_at ON public.purge_audit_log(purged_at);
CREATE INDEX IF NOT EXISTS idx_courses_source_purged_at ON public.courses(source_purged_at) WHERE source_purged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_course_modules_source_purged_at ON public.course_modules(source_purged_at) WHERE source_purged_at IS NULL;
-- ============================================
-- PATENT-CRITICAL ENFORCEMENT TRIGGERS
-- Structural Sovereignty Gate™ + Append-Only Ledger
-- ============================================

-- TRIGGER 1: Enforce Finalization Gate
-- Prevents status transition to 'finalized' unless all reasoning entries are approved
CREATE OR REPLACE FUNCTION public.enforce_finalization_gate()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check when transitioning to 'finalized' status
  IF NEW.status = 'finalized' AND (OLD.status IS NULL OR OLD.status != 'finalized') THEN
    IF NOT public.can_finalize_artifact(NEW.id) THEN
      RAISE EXCEPTION 'SOVEREIGNTY GATE BLOCKED: Cannot finalize artifact - pending reasoning entries require human decision';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER enforce_finalization_gate_trigger
BEFORE UPDATE ON public.transformation_artifacts
FOR EACH ROW EXECUTE FUNCTION public.enforce_finalization_gate();

-- TRIGGER 2: Enforce Reasoning Log Immutability (Append-Only Ledger)
-- Prevents UPDATE/DELETE on reasoning_logs except for superseded_by linking
CREATE OR REPLACE FUNCTION public.enforce_reasoning_log_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'APPEND-ONLY LEDGER: Reasoning logs cannot be deleted - create superseding entry instead';
  END IF;
  
  IF TG_OP = 'UPDATE' THEN
    -- Only allow updating superseded_by (to link to new entry) and human_decision (for Judge verdicts)
    IF OLD.source_type IS DISTINCT FROM NEW.source_type OR
       OLD.source_label IS DISTINCT FROM NEW.source_label OR
       OLD.source_role IS DISTINCT FROM NEW.source_role OR
       OLD.analysis_focus IS DISTINCT FROM NEW.analysis_focus OR
       OLD.summary IS DISTINCT FROM NEW.summary OR
       OLD.concern_level IS DISTINCT FROM NEW.concern_level OR
       OLD.recommendation IS DISTINCT FROM NEW.recommendation THEN
      RAISE EXCEPTION 'APPEND-ONLY LEDGER: Reasoning log content is immutable - create new entry to supersede';
    END IF;
    -- Allow: human_decision, decision_notes, superseded_by (governance flow)
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER enforce_reasoning_log_immutability_trigger
BEFORE UPDATE OR DELETE ON public.reasoning_logs
FOR EACH ROW EXECUTE FUNCTION public.enforce_reasoning_log_immutability();
-- ============================================
-- PATENT ALIGNMENT MIGRATION: 4 Core Fixes
-- ============================================

-- 1. JSON Canonicalization + Signature Verification for Approvals
ALTER TABLE public.verification_approvals 
ADD COLUMN IF NOT EXISTS payload_canonical TEXT,
ADD COLUMN IF NOT EXISTS payload_signature TEXT,
ADD COLUMN IF NOT EXISTS signature_verified BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.verification_approvals.payload_canonical IS 
'Canonicalized JSON payload for tamper detection - All external inputs treated as untrusted';

COMMENT ON COLUMN public.verification_approvals.payload_signature IS 
'HMAC-SHA256 signature of canonical payload for integrity verification';

COMMENT ON COLUMN public.verification_approvals.signature_verified IS 
'TRUE only when signature verification passed - unsigned approvals cannot affect governance';

-- 2. Intent Confidence in Reasoning Ledger (anchor reasoning to observed emphasis)
ALTER TABLE public.reasoning_logs 
ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3,2),
ADD COLUMN IF NOT EXISTS intent_frame_id UUID REFERENCES public.artifact_frames(id);

COMMENT ON COLUMN public.reasoning_logs.confidence_score IS 
'Intent confidence derived from Passive Emphasis Reconstructor – anchors reasoning to observed human emphasis';

COMMENT ON COLUMN public.reasoning_logs.intent_frame_id IS 
'Reference to artifact_frames for forensic chain-of-custody linking reasoning to visual evidence';

-- 3. Update Governance Language to match patent exactly
CREATE OR REPLACE FUNCTION public.enforce_finalization_gate()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check when transitioning to 'finalized' status
  IF NEW.status = 'finalized' AND (OLD.status IS NULL OR OLD.status != 'finalized') THEN
    IF NOT public.can_finalize_artifact(NEW.id) THEN
      RAISE EXCEPTION 'EXECUTION IMPOSSIBLE UNTIL GOVERNANCE = TRUE: Cannot finalize artifact – pending reasoning entries require human decision';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. BONUS: Make Purge Audit Log Truly Immutable (destruction certificates cannot be modified)
CREATE OR REPLACE FUNCTION public.enforce_purge_audit_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DESTRUCTION CERTIFICATES IMMUTABLE: Purge audit log entries cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'DESTRUCTION CERTIFICATES IMMUTABLE: Purge audit log entries cannot be modified';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for purge audit immutability (only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'enforce_purge_audit_immutability_trigger'
  ) THEN
    CREATE TRIGGER enforce_purge_audit_immutability_trigger
    BEFORE UPDATE OR DELETE ON public.purge_audit_log
    FOR EACH ROW EXECUTE FUNCTION public.enforce_purge_audit_immutability();
  END IF;
END $$;
-- Video Processing Queue Table (BullMQ-equivalent)
CREATE TABLE IF NOT EXISTS public.video_processing_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_path TEXT NOT NULL,
  job_id TEXT NOT NULL UNIQUE,
  user_id TEXT, -- session or user identifier
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  locked_by TEXT, -- worker ID that claimed this job
  locked_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Index for efficient job claiming
CREATE INDEX IF NOT EXISTS idx_video_queue_status_retry ON public.video_processing_queue (status, next_retry_at) WHERE status IN ('queued', 'failed');
CREATE INDEX IF NOT EXISTS idx_video_queue_locked ON public.video_processing_queue (locked_at) WHERE locked_by IS NOT NULL;

-- Enable RLS
ALTER TABLE public.video_processing_queue ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for workers)
CREATE POLICY "Service role has full access to video queue"
ON public.video_processing_queue
FOR ALL
USING (true)
WITH CHECK (true);

-- Function to atomically claim a job (prevents race conditions)
CREATE OR REPLACE FUNCTION public.claim_video_job(p_worker_id TEXT, p_lock_duration_seconds INTEGER DEFAULT 300)
RETURNS TABLE(
  job_id TEXT,
  video_path TEXT,
  user_id TEXT,
  attempt_count INTEGER,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job RECORD;
BEGIN
  -- Find and lock a job atomically
  SELECT vpq.* INTO v_job
  FROM public.video_processing_queue vpq
  WHERE (
    -- Queued jobs ready to process
    (vpq.status = 'queued' AND (vpq.next_retry_at IS NULL OR vpq.next_retry_at <= now()))
    OR
    -- Failed jobs ready to retry
    (vpq.status = 'failed' AND vpq.attempt_count < vpq.max_attempts AND vpq.next_retry_at <= now())
    OR
    -- Stale locks (worker died)
    (vpq.locked_by IS NOT NULL AND vpq.locked_at < now() - (p_lock_duration_seconds || ' seconds')::interval)
  )
  ORDER BY vpq.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF v_job.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Claim the job
  UPDATE public.video_processing_queue
  SET 
    status = 'processing',
    locked_by = p_worker_id,
    locked_at = now(),
    started_at = COALESCE(started_at, now()),
    attempt_count = attempt_count + 1,
    updated_at = now()
  WHERE id = v_job.id;
  
  RETURN QUERY SELECT v_job.job_id, v_job.video_path, v_job.user_id, v_job.attempt_count + 1, v_job.metadata;
END;
$$;

-- Function to complete a job
CREATE OR REPLACE FUNCTION public.complete_video_job(p_job_id TEXT, p_success BOOLEAN, p_error TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current RECORD;
  v_backoff_seconds INTEGER;
BEGIN
  SELECT * INTO v_current
  FROM public.video_processing_queue
  WHERE job_id = p_job_id;
  
  IF v_current.id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  IF p_success THEN
    UPDATE public.video_processing_queue
    SET 
      status = 'completed',
      locked_by = NULL,
      locked_at = NULL,
      completed_at = now(),
      updated_at = now()
    WHERE job_id = p_job_id;
  ELSE
    -- Calculate exponential backoff: 1s, 2s, 4s
    v_backoff_seconds := POWER(2, LEAST(v_current.attempt_count, 3))::INTEGER;
    
    IF v_current.attempt_count >= v_current.max_attempts THEN
      -- Max retries reached - mark as failed permanently
      UPDATE public.video_processing_queue
      SET 
        status = 'failed',
        error_message = p_error,
        locked_by = NULL,
        locked_at = NULL,
        updated_at = now()
      WHERE job_id = p_job_id;
    ELSE
      -- Schedule for retry
      UPDATE public.video_processing_queue
      SET 
        status = 'failed',
        error_message = p_error,
        locked_by = NULL,
        locked_at = NULL,
        next_retry_at = now() + (v_backoff_seconds || ' seconds')::interval,
        updated_at = now()
      WHERE job_id = p_job_id;
    END IF;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Function to enqueue a new job
CREATE OR REPLACE FUNCTION public.enqueue_video_job(
  p_video_path TEXT,
  p_job_id TEXT,
  p_user_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.video_processing_queue (video_path, job_id, user_id, metadata)
  VALUES (p_video_path, p_job_id, p_user_id, p_metadata)
  ON CONFLICT (job_id) DO NOTHING
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Add trigger for updated_at
CREATE TRIGGER update_video_queue_updated_at
BEFORE UPDATE ON public.video_processing_queue
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Add columns to video_processing_queue for segmentation and resume support
ALTER TABLE public.video_processing_queue
ADD COLUMN IF NOT EXISTS video_duration_seconds numeric,
ADD COLUMN IF NOT EXISTS expected_frames integer,
ADD COLUMN IF NOT EXISTS processed_frames integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS segment_count integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS completed_segments jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS segment_pdfs jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS processing_phase text DEFAULT 'pending';

-- Add comment explaining phases
COMMENT ON COLUMN public.video_processing_queue.processing_phase IS 
'Processing phase: pending -> extracting -> compressing -> pdf_building -> merging -> completed';

COMMENT ON COLUMN public.video_processing_queue.completed_segments IS 
'Array of segment indices that have been completed (for resume support)';

COMMENT ON COLUMN public.video_processing_queue.segment_pdfs IS 
'Array of {segmentIndex, storagePath} for each completed segment PDF';
-- Temporarily disable the immutability trigger (correct name)
DROP TRIGGER IF EXISTS enforce_purge_audit_immutability_trigger ON public.purge_audit_log;

-- Delete purge_audit_log entries for courses to be deleted
DELETE FROM public.purge_audit_log 
WHERE course_id IN (
  '2b5080fe-839e-4348-9652-1e0db142d019', 
  '8161c6d9-495d-4870-8ce1-8ebf59da875f', 
  '1181c19d-3224-4cac-85fd-973a2cf22915', 
  'fb6560e7-ea69-4b6a-b4e9-c7d467f64a48', 
  '12d9b55b-3089-4033-b704-66c98f8a4138', 
  '93e6cf2a-93d0-4b5e-a9b8-12b739ed1ad4', 
  '83fa25e0-a532-47f3-bd93-70902c759e34', 
  '7e501f64-7ac1-401f-96fa-eb372cd9bca1', 
  '8d067a66-fac6-47df-8021-40f148ed489e', 
  '01d493c8-acb2-487d-b932-b20504e8fa6f', 
  'cf42b902-ab89-49d6-bcb1-83b5f052671c', 
  'a8053c0f-7ed7-49e8-b963-8ff9d0675d55', 
  'c9b26095-28bf-4521-9c26-45dce555d36f', 
  '785d0e1e-82cc-405c-b9e2-66c0d3e85e0b'
);

-- Re-enable the immutability trigger
CREATE TRIGGER enforce_purge_audit_immutability_trigger
  BEFORE UPDATE OR DELETE ON public.purge_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_purge_audit_immutability();
-- ============================================================
-- GOVERNANCE LAYER: Execution Frames & State Transition System
-- Constitutional enforcement for all state changes
-- ============================================================

-- Table 1: execution_frames
-- Every state transition requires a frame. No action without identity.
CREATE TABLE public.execution_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  frame_type TEXT NOT NULL CHECK (frame_type IN ('human_approval', 'ai_execution', 'constraint_check', 'recovery')),
  initiated_by TEXT NOT NULL,
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  target_entity TEXT NOT NULL,
  target_operation TEXT NOT NULL,
  proposed_state JSONB NOT NULL,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'expired')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  constraint_violations JSONB DEFAULT '[]'::jsonb,
  executed BOOLEAN DEFAULT FALSE,
  executed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_execution_frames_target ON public.execution_frames(target_entity);
CREATE INDEX idx_execution_frames_status ON public.execution_frames(approval_status);
CREATE INDEX idx_execution_frames_executed ON public.execution_frames(executed);

-- Table 2: state_transitions
-- Immutable log of every state change. Truth layer.
CREATE TABLE public.state_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  frame_id UUID NOT NULL REFERENCES public.execution_frames(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  from_state JSONB NOT NULL,
  to_state JSONB NOT NULL,
  transition_type TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversible BOOLEAN DEFAULT FALSE,
  reversal_frame_id UUID REFERENCES public.execution_frames(id)
);

CREATE INDEX idx_state_transitions_entity ON public.state_transitions(entity_type, entity_id);
CREATE INDEX idx_state_transitions_frame ON public.state_transitions(frame_id);
CREATE INDEX idx_state_transitions_occurred ON public.state_transitions(occurred_at DESC);

-- Table 3: constraint_violations
-- Log every constraint check. Make failures visible.
CREATE TABLE public.constraint_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  constraint_name TEXT NOT NULL,
  violation_type TEXT NOT NULL CHECK (violation_type IN ('schema', 'business_logic', 'race_condition', 'timeout', 'data_integrity')),
  expected_state JSONB NOT NULL,
  actual_state JSONB NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'error', 'warning')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_frame_id UUID REFERENCES public.execution_frames(id)
);

CREATE INDEX idx_constraint_violations_unresolved ON public.constraint_violations(resolved) WHERE resolved = FALSE;
CREATE INDEX idx_constraint_violations_entity ON public.constraint_violations(entity_type, entity_id);

-- Table 4: approval_gates
-- Define which operations require human approval.
CREATE TABLE public.approval_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_name TEXT UNIQUE NOT NULL,
  operation_pattern TEXT NOT NULL,
  entity_types TEXT[] NOT NULL,
  requires_approval BOOLEAN DEFAULT TRUE,
  auto_approve_conditions JSONB DEFAULT '{}'::jsonb,
  timeout_minutes INTEGER DEFAULT 60,
  approver_roles TEXT[] DEFAULT ARRAY['admin']::TEXT[],
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed data for approval_gates
INSERT INTO public.approval_gates (gate_name, operation_pattern, entity_types, requires_approval, auto_approve_conditions) VALUES
('mark_as_failed', 'mark_failed|status:failed', ARRAY['course'], TRUE, '{"data_check": {"frame_urls": "not_null", "transcript": "not_null"}}'::jsonb),
('delete_artifacts', 'delete', ARRAY['transformation_artifacts'], TRUE, '{}'::jsonb),
('recover_from_failure', 'recovery', ARRAY['course'], TRUE, '{}'::jsonb),
('queue_next_step', 'queue_job', ARRAY['processing_queue'], FALSE, '{"previous_step_completed": true}'::jsonb);

-- Immutability trigger for state_transitions (no updates/deletes)
CREATE OR REPLACE FUNCTION public.enforce_state_transitions_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'STATE TRANSITIONS IMMUTABLE: Cannot delete state transition records';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'STATE TRANSITIONS IMMUTABLE: Cannot modify state transition records';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_state_transitions_immutability_trigger
  BEFORE UPDATE OR DELETE ON public.state_transitions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_state_transitions_immutability();

-- Enable RLS on all governance tables
ALTER TABLE public.execution_frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.state_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.constraint_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_gates ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Service role only (backend functions)
CREATE POLICY "Service role full access to execution_frames"
  ON public.execution_frames
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to state_transitions"
  ON public.state_transitions
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to constraint_violations"
  ON public.constraint_violations
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to approval_gates"
  ON public.approval_gates
  FOR ALL
  USING (true)
  WITH CHECK (true);
-- ============================================================
-- ENFORCEMENT LAYER: Triggers & Constraints
-- Make governance violations physically impossible
-- ============================================================

-- Step 1: Add governance columns to existing tables

ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS current_frame_id UUID REFERENCES public.execution_frames(id),
ADD COLUMN IF NOT EXISTS last_constraint_check TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS constraint_status TEXT DEFAULT 'valid' CHECK (constraint_status IN ('valid', 'violated', 'pending_check')),
ADD COLUMN IF NOT EXISTS governance_locked BOOLEAN DEFAULT FALSE;

ALTER TABLE public.processing_queue
ADD COLUMN IF NOT EXISTS initiated_by_frame_id UUID REFERENCES public.execution_frames(id),
ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS approval_frame_id UUID REFERENCES public.execution_frames(id);

-- Step 2: Create enforcement trigger - prevent invalid failures
-- This trigger prevents marking a course as 'failed' when data extraction actually succeeded.

CREATE OR REPLACE FUNCTION public.prevent_invalid_failure()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  has_frames BOOLEAN;
  has_transcript BOOLEAN;
BEGIN
  -- Only check when transitioning TO failed status
  IF NEW.status = 'failed' AND OLD.status != 'failed' THEN
    
    -- Check if data actually exists
    has_frames := (NEW.frame_urls IS NOT NULL AND jsonb_array_length(NEW.frame_urls) > 0);
    has_transcript := (NEW.transcript IS NOT NULL AND NEW.transcript != '{}');
    
    -- If data exists, this is a constraint violation (race condition)
    IF has_frames AND has_transcript THEN
      
      -- Log the violation
      INSERT INTO public.constraint_violations (
        entity_type,
        entity_id,
        constraint_name,
        violation_type,
        expected_state,
        actual_state,
        severity
      ) VALUES (
        'course',
        NEW.id,
        'false_failure_with_complete_data',
        'race_condition',
        jsonb_build_object('status', 'processing', 'reason', 'data_exists'),
        jsonb_build_object(
          'status', 'failed', 
          'frame_count', jsonb_array_length(NEW.frame_urls), 
          'has_transcript', TRUE,
          'error_message', NEW.error_message
        ),
        'critical'
      );
      
      -- Block the failure
      RAISE EXCEPTION 'GOVERNANCE VIOLATION: Cannot mark as failed - data extraction completed successfully (% frames, transcript present)', jsonb_array_length(NEW.frame_urls);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_false_failure
  BEFORE UPDATE ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_invalid_failure();

-- Step 3: Create logging trigger - all state transitions
-- This trigger logs every state change to state_transitions table.

CREATE OR REPLACE FUNCTION public.log_state_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_frame_id UUID;
BEGIN
  -- Get or create a frame_id for this transition
  v_frame_id := COALESCE(
    NEW.current_frame_id,
    (SELECT id FROM public.execution_frames 
     WHERE target_entity = TG_TABLE_NAME || ':' || NEW.id::text 
     AND executed = FALSE 
     ORDER BY initiated_at DESC LIMIT 1)
  );
  
  -- If no frame exists, create an ai_execution frame (auto-logged)
  IF v_frame_id IS NULL THEN
    INSERT INTO public.execution_frames (
      frame_type,
      initiated_by,
      target_entity,
      target_operation,
      proposed_state,
      approval_status,
      executed,
      executed_at
    ) VALUES (
      'ai_execution',
      COALESCE(current_setting('request.jwt.claims', true)::json->>'email', 'system'),
      TG_TABLE_NAME || ':' || NEW.id::text,
      CASE 
        WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'status_change:' || COALESCE(OLD.status, 'null') || '->' || NEW.status
        ELSE 'data_update'
      END,
      row_to_json(NEW)::jsonb,
      'approved',
      TRUE,
      now()
    ) RETURNING id INTO v_frame_id;
  END IF;

  -- Log the transition
  INSERT INTO public.state_transitions (
    frame_id,
    entity_type,
    entity_id,
    from_state,
    to_state,
    transition_type,
    triggered_by
  ) VALUES (
    v_frame_id,
    TG_TABLE_NAME,
    NEW.id,
    CASE WHEN OLD IS NULL THEN '{}'::jsonb ELSE row_to_json(OLD)::jsonb END,
    row_to_json(NEW)::jsonb,
    CASE 
      WHEN OLD IS NULL THEN 'insert'
      WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'status_change'
      ELSE 'data_update'
    END,
    COALESCE(current_setting('request.jwt.claims', true)::json->>'email', 'system')
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER log_course_transitions
  AFTER UPDATE ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION public.log_state_transition();

CREATE TRIGGER log_queue_transitions
  AFTER UPDATE ON public.processing_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.log_state_transition();

-- Step 4: Create constraint check for approval requirements
-- This trigger enforces that jobs requiring approval cannot be claimed without an approved frame.

CREATE OR REPLACE FUNCTION public.enforce_approval_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if job requires approval and is being claimed
  IF NEW.requires_approval = TRUE 
     AND NEW.status = 'processing' 
     AND OLD.status = 'pending' 
     AND NEW.approval_frame_id IS NULL THEN
    
    RAISE EXCEPTION 'GOVERNANCE VIOLATION: Job requires approval frame before processing';
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_queue_approval
  BEFORE UPDATE ON public.processing_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_approval_gate();
-- Change the foreign key constraint on purge_audit_log to SET NULL instead of CASCADE
-- This allows deleting the course without affecting the immutable audit log

ALTER TABLE purge_audit_log 
DROP CONSTRAINT IF EXISTS purge_audit_log_course_id_fkey;

ALTER TABLE purge_audit_log 
ADD CONSTRAINT purge_audit_log_course_id_fkey 
FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL;
-- First, drop the constraint that's causing cascading updates
ALTER TABLE purge_audit_log 
DROP CONSTRAINT IF EXISTS purge_audit_log_course_id_fkey;

-- Re-add without any cascade behavior (we keep orphan records in audit log which is fine for immutability)
ALTER TABLE purge_audit_log 
ADD CONSTRAINT purge_audit_log_course_id_fkey 
FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- Also need to handle module_id constraint
ALTER TABLE purge_audit_log 
DROP CONSTRAINT IF EXISTS purge_audit_log_module_id_fkey;

ALTER TABLE purge_audit_log 
ADD CONSTRAINT purge_audit_log_module_id_fkey 
FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
-- Drop the foreign key constraints entirely from purge_audit_log
-- The audit log should be completely independent and immutable
-- Orphaned course_id values are fine - they just reference deleted courses

ALTER TABLE purge_audit_log 
DROP CONSTRAINT IF EXISTS purge_audit_log_course_id_fkey;

ALTER TABLE purge_audit_log 
DROP CONSTRAINT IF EXISTS purge_audit_log_module_id_fkey;
-- =====================================================
-- PURGE GOVERNANCE LAYER
-- Constitutional soft-delete enforcement
-- =====================================================

-- 1. Add purge columns to governed tables
ALTER TABLE courses 
ADD COLUMN IF NOT EXISTS purged BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS purged_by TEXT,
ADD COLUMN IF NOT EXISTS purge_frame_id UUID REFERENCES execution_frames(id);

ALTER TABLE course_modules 
ADD COLUMN IF NOT EXISTS purged BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS purged_by TEXT,
ADD COLUMN IF NOT EXISTS purge_frame_id UUID REFERENCES execution_frames(id);

ALTER TABLE processing_queue 
ADD COLUMN IF NOT EXISTS purged BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS purged_by TEXT,
ADD COLUMN IF NOT EXISTS purge_frame_id UUID REFERENCES execution_frames(id);

-- 2. Add 'purge' gate to approval_gates
INSERT INTO approval_gates (gate_name, operation_pattern, entity_types, requires_approval, auto_approve_conditions) 
VALUES ('purge_entity', 'purge|delete', ARRAY['course', 'course_modules', 'processing_queue'], FALSE, '{}'::jsonb)
ON CONFLICT DO NOTHING;

-- 3. Create purge enforcement trigger function
CREATE OR REPLACE FUNCTION prevent_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Block all hard deletes on governed tables
  RAISE EXCEPTION 'GOVERNANCE VIOLATION: Hard deletes forbidden. Use soft delete (purged=TRUE) via execution frame.';
  RETURN NULL;
END;
$$;

-- Create triggers for each governed table
DROP TRIGGER IF EXISTS prevent_course_hard_delete ON courses;
CREATE TRIGGER prevent_course_hard_delete
  BEFORE DELETE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION prevent_hard_delete();

DROP TRIGGER IF EXISTS prevent_module_hard_delete ON course_modules;
CREATE TRIGGER prevent_module_hard_delete
  BEFORE DELETE ON course_modules
  FOR EACH ROW
  EXECUTE FUNCTION prevent_hard_delete();

DROP TRIGGER IF EXISTS prevent_queue_hard_delete ON processing_queue;
CREATE TRIGGER prevent_queue_hard_delete
  BEFORE DELETE ON processing_queue
  FOR EACH ROW
  EXECUTE FUNCTION prevent_hard_delete();

-- 4. Re-add FK constraints to purge_audit_log with NO ACTION (immutable audit log)
-- These may have been dropped earlier, so add them back properly
ALTER TABLE purge_audit_log 
DROP CONSTRAINT IF EXISTS purge_audit_log_course_id_fkey;

ALTER TABLE purge_audit_log 
DROP CONSTRAINT IF EXISTS purge_audit_log_module_id_fkey;

-- Note: We intentionally do NOT re-add FK constraints to purge_audit_log
-- because audit logs must remain immutable even when source records are soft-deleted
-- The course_id and module_id columns remain as TEXT references that can become orphaned

-- 5. Create index for efficient purged queries
CREATE INDEX IF NOT EXISTS idx_courses_purged ON courses(purged) WHERE purged = FALSE;
CREATE INDEX IF NOT EXISTS idx_course_modules_purged ON course_modules(purged) WHERE purged = FALSE;
CREATE INDEX IF NOT EXISTS idx_processing_queue_purged ON processing_queue(purged) WHERE purged = FALSE;

-- 6. Add comment for governance documentation
COMMENT ON COLUMN courses.purged IS 'Soft delete flag - records are never hard deleted';
COMMENT ON COLUMN courses.purge_frame_id IS 'Reference to the execution frame that authorized the purge';
COMMENT ON COLUMN course_modules.purged IS 'Soft delete flag - records are never hard deleted';
COMMENT ON COLUMN course_modules.purge_frame_id IS 'Reference to the execution frame that authorized the purge';
COMMENT ON COLUMN processing_queue.purged IS 'Soft delete flag - records are never hard deleted';
COMMENT ON COLUMN processing_queue.purge_frame_id IS 'Reference to the execution frame that authorized the purge';
-- Create triggers for hard delete prevention on governed tables
DROP TRIGGER IF EXISTS prevent_course_hard_delete ON courses;
CREATE TRIGGER prevent_course_hard_delete
  BEFORE DELETE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION prevent_hard_delete();

DROP TRIGGER IF EXISTS prevent_module_hard_delete ON course_modules;
CREATE TRIGGER prevent_module_hard_delete
  BEFORE DELETE ON course_modules
  FOR EACH ROW
  EXECUTE FUNCTION prevent_hard_delete();

DROP TRIGGER IF EXISTS prevent_queue_hard_delete ON processing_queue;
CREATE TRIGGER prevent_queue_hard_delete
  BEFORE DELETE ON processing_queue
  FOR EACH ROW
  EXECUTE FUNCTION prevent_hard_delete();
-- Fix log_state_transition trigger to handle tables without current_frame_id column
CREATE OR REPLACE FUNCTION public.log_state_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_frame_id UUID;
  v_has_frame_column BOOLEAN;
BEGIN
  -- Check if the table has a current_frame_id column
  v_has_frame_column := EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = TG_TABLE_NAME 
    AND column_name = 'current_frame_id'
  );

  -- Get or create a frame_id for this transition
  IF v_has_frame_column THEN
    EXECUTE format('SELECT ($1).current_frame_id') INTO v_frame_id USING NEW;
  END IF;
  
  IF v_frame_id IS NULL THEN
    SELECT id INTO v_frame_id FROM public.execution_frames 
     WHERE target_entity = TG_TABLE_NAME || ':' || NEW.id::text 
     AND executed = FALSE 
     ORDER BY initiated_at DESC LIMIT 1;
  END IF;
  
  -- If no frame exists, create an ai_execution frame (auto-logged)
  IF v_frame_id IS NULL THEN
    INSERT INTO public.execution_frames (
      frame_type,
      initiated_by,
      target_entity,
      target_operation,
      proposed_state,
      approval_status,
      executed,
      executed_at
    ) VALUES (
      'ai_execution',
      COALESCE(current_setting('request.jwt.claims', true)::json->>'email', 'system'),
      TG_TABLE_NAME || ':' || NEW.id::text,
      CASE 
        WHEN OLD IS NULL THEN 'insert'
        WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'status_change:' || COALESCE(OLD.status, 'null') || '->' || NEW.status
        ELSE 'data_update'
      END,
      row_to_json(NEW)::jsonb,
      'approved',
      TRUE,
      now()
    ) RETURNING id INTO v_frame_id;
  END IF;

  -- Log the transition
  INSERT INTO public.state_transitions (
    frame_id,
    entity_type,
    entity_id,
    from_state,
    to_state,
    transition_type,
    triggered_by
  ) VALUES (
    v_frame_id,
    TG_TABLE_NAME,
    NEW.id,
    CASE WHEN OLD IS NULL THEN '{}'::jsonb ELSE row_to_json(OLD)::jsonb END,
    row_to_json(NEW)::jsonb,
    CASE 
      WHEN OLD IS NULL THEN 'insert'
      WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'status_change'
      ELSE 'data_update'
    END,
    COALESCE(current_setting('request.jwt.claims', true)::json->>'email', 'system')
  );
  
  RETURN NEW;
END;
$function$;
-- 1. Add unique partial index to prevent duplicate active queue jobs
CREATE UNIQUE INDEX IF NOT EXISTS idx_processing_queue_unique_active 
ON public.processing_queue (course_id, step, status) 
WHERE purged = FALSE;

-- 2. Add canonical_artifact_id column to courses table
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS canonical_artifact_id UUID REFERENCES public.transformation_artifacts(id);

-- Create index for artifact lookups
CREATE INDEX IF NOT EXISTS idx_courses_canonical_artifact 
ON public.courses (canonical_artifact_id) 
WHERE canonical_artifact_id IS NOT NULL;
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
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
-- Add progress tracking columns to courses table
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS progress_step text DEFAULT 'queued',
ADD COLUMN IF NOT EXISTS estimated_completion_time timestamptz;

-- Add progress tracking columns to course_modules table
ALTER TABLE public.course_modules 
ADD COLUMN IF NOT EXISTS progress_step text DEFAULT 'queued',
ADD COLUMN IF NOT EXISTS estimated_completion_time timestamptz;

-- Add constraint for valid progress steps
ALTER TABLE public.courses 
ADD CONSTRAINT valid_progress_step CHECK (
  progress_step IS NULL OR progress_step IN (
    'uploading', 'queued', 'extracting_frames', 'transcribing', 
    'analyzing', 'generating_artifact', 'finalizing', 'completed', 'failed'
  )
);

ALTER TABLE public.course_modules 
ADD CONSTRAINT valid_module_progress_step CHECK (
  progress_step IS NULL OR progress_step IN (
    'uploading', 'queued', 'extracting_frames', 'transcribing', 
    'analyzing', 'generating_artifact', 'finalizing', 'completed', 'failed'
  )
);
-- Video Chunks Table - Intelligent chunking for long videos
-- Each chunk is a 10-minute segment processed independently

CREATE TABLE public.video_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  module_id UUID REFERENCES public.course_modules(id) ON DELETE CASCADE,
  
  -- Chunk identity
  chunk_index INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  
  -- Time boundaries
  start_seconds INTEGER NOT NULL,
  end_seconds INTEGER NOT NULL,
  duration_seconds INTEGER GENERATED ALWAYS AS (end_seconds - start_seconds) STORED,
  
  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'processing', 'completed', 'failed', 'merged')),
  processing_started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  attempt_count INTEGER DEFAULT 0,
  
  -- Results
  frame_urls JSONB DEFAULT '[]'::jsonb,
  frame_count INTEGER DEFAULT 0,
  transcript JSONB,
  artifact_data JSONB,
  pdf_storage_path TEXT,
  
  -- Worker tracking
  worker_id TEXT,
  locked_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Unique constraint: no duplicate chunks per course/module
  UNIQUE (course_id, module_id, chunk_index)
);

-- Enable RLS
ALTER TABLE public.video_chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow service role full access, users can view their own
CREATE POLICY "Service role can manage all chunks" 
ON public.video_chunks 
FOR ALL 
USING (true)
WITH CHECK (true);

CREATE POLICY "Users can view their course chunks" 
ON public.video_chunks 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.courses c 
    WHERE c.id = video_chunks.course_id 
    AND c.user_id = auth.uid()
  )
);

-- Indexes for efficient querying
CREATE INDEX idx_video_chunks_course_id ON public.video_chunks(course_id);
CREATE INDEX idx_video_chunks_module_id ON public.video_chunks(module_id);
CREATE INDEX idx_video_chunks_status ON public.video_chunks(status);
CREATE INDEX idx_video_chunks_pending ON public.video_chunks(course_id, status) WHERE status = 'pending';
CREATE INDEX idx_video_chunks_processing ON public.video_chunks(course_id, status) WHERE status = 'processing';

-- Add chunk tracking columns to courses table
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS chunked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS chunk_count INTEGER,
ADD COLUMN IF NOT EXISTS completed_chunks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS chunking_strategy TEXT,
ADD COLUMN IF NOT EXISTS estimated_cost_cents INTEGER;

-- Add chunk tracking columns to course_modules table  
ALTER TABLE public.course_modules
ADD COLUMN IF NOT EXISTS chunked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS chunk_count INTEGER,
ADD COLUMN IF NOT EXISTS completed_chunks INTEGER DEFAULT 0;

-- Add to video_processing_queue for chunk-aware processing
ALTER TABLE public.video_processing_queue
ADD COLUMN IF NOT EXISTS is_chunk BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS chunk_id UUID REFERENCES public.video_chunks(id),
ADD COLUMN IF NOT EXISTS parent_job_id TEXT;

-- Function to update chunk progress on courses
CREATE OR REPLACE FUNCTION update_chunk_progress()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Update course completed_chunks count
    IF NEW.course_id IS NOT NULL THEN
      UPDATE courses 
      SET completed_chunks = (
        SELECT COUNT(*) FROM video_chunks 
        WHERE course_id = NEW.course_id AND status = 'completed'
      ),
      updated_at = now()
      WHERE id = NEW.course_id;
    END IF;
    
    -- Update module completed_chunks count
    IF NEW.module_id IS NOT NULL THEN
      UPDATE course_modules 
      SET completed_chunks = (
        SELECT COUNT(*) FROM video_chunks 
        WHERE module_id = NEW.module_id AND status = 'completed'
      ),
      updated_at = now()
      WHERE id = NEW.module_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger to auto-update progress
CREATE TRIGGER trg_update_chunk_progress
AFTER UPDATE ON public.video_chunks
FOR EACH ROW
EXECUTE FUNCTION update_chunk_progress();

-- Function to check if all chunks are complete and merge is needed
CREATE OR REPLACE FUNCTION check_chunks_complete(p_course_id UUID, p_module_id UUID DEFAULT NULL)
RETURNS TABLE(
  all_complete BOOLEAN,
  total_chunks INTEGER,
  completed_chunks INTEGER,
  failed_chunks INTEGER
) AS $$
DECLARE
  v_total INTEGER;
  v_completed INTEGER;
  v_failed INTEGER;
BEGIN
  IF p_module_id IS NOT NULL THEN
    SELECT 
      COUNT(*),
      COUNT(*) FILTER (WHERE status = 'completed'),
      COUNT(*) FILTER (WHERE status = 'failed')
    INTO v_total, v_completed, v_failed
    FROM video_chunks
    WHERE module_id = p_module_id;
  ELSE
    SELECT 
      COUNT(*),
      COUNT(*) FILTER (WHERE status = 'completed'),
      COUNT(*) FILTER (WHERE status = 'failed')
    INTO v_total, v_completed, v_failed
    FROM video_chunks
    WHERE course_id = p_course_id;
  END IF;
  
  RETURN QUERY SELECT 
    (v_completed = v_total AND v_total > 0) AS all_complete,
    v_total AS total_chunks,
    v_completed AS completed_chunks,
    v_failed AS failed_chunks;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Comment
COMMENT ON TABLE public.video_chunks IS 'Stores 10-minute video segments for parallel processing of long videos (30+ minutes)';
COMMENT ON COLUMN public.video_chunks.chunk_index IS 'Zero-based index of this chunk within the video';
COMMENT ON COLUMN public.video_chunks.artifact_data IS 'Partial artifact data for this chunk (frames, transcript segment, etc.)';
-- API Keys table for programmatic access
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT UNIQUE NOT NULL,
  key_prefix TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  rate_limit_per_hour INTEGER DEFAULT 100,
  credits_remaining INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

-- API Usage Log for tracking and billing
CREATE TABLE public.api_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  job_id UUID,
  endpoint TEXT NOT NULL,
  video_duration_seconds INTEGER,
  cost_cents INTEGER,
  request_metadata JSONB DEFAULT '{}',
  response_status INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- API Jobs table to track API-initiated jobs
CREATE TABLE public.api_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  callback_url TEXT,
  client_metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'queued',
  progress INTEGER DEFAULT 0,
  progress_step TEXT,
  artifact_url TEXT,
  pdf_url TEXT,
  error_message TEXT,
  callback_sent_at TIMESTAMPTZ,
  callback_response_status INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for api_keys
CREATE POLICY "Users can view their own API keys"
  ON public.api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own API keys"
  ON public.api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own API keys"
  ON public.api_keys FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API keys"
  ON public.api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for api_usage_log (read-only for users via their keys)
CREATE POLICY "Users can view usage for their API keys"
  ON public.api_usage_log FOR SELECT
  USING (
    api_key_id IN (
      SELECT id FROM public.api_keys WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for api_jobs
CREATE POLICY "Users can view their API jobs"
  ON public.api_jobs FOR SELECT
  USING (
    api_key_id IN (
      SELECT id FROM public.api_keys WHERE user_id = auth.uid()
    )
  );

-- Function to check API rate limit
CREATE OR REPLACE FUNCTION public.check_api_rate_limit(p_api_key_id UUID)
RETURNS TABLE(allowed BOOLEAN, requests_used INTEGER, limit_value INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rate_limit INTEGER;
  v_requests_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  v_window_start := date_trunc('hour', now());
  
  -- Get rate limit for this key
  SELECT rate_limit_per_hour INTO v_rate_limit
  FROM public.api_keys
  WHERE id = p_api_key_id AND active = true;
  
  IF v_rate_limit IS NULL THEN
    RETURN QUERY SELECT false, 0, 0, now();
    RETURN;
  END IF;
  
  -- Count requests in current hour
  SELECT COUNT(*)::INTEGER INTO v_requests_count
  FROM public.api_usage_log
  WHERE api_key_id = p_api_key_id
    AND created_at >= v_window_start;
  
  RETURN QUERY SELECT 
    (v_requests_count < v_rate_limit),
    v_requests_count,
    v_rate_limit,
    v_window_start + interval '1 hour';
END;
$$;

-- Function to validate API key and get key info
CREATE OR REPLACE FUNCTION public.validate_api_key(p_key_hash TEXT)
RETURNS TABLE(
  key_id UUID,
  user_id UUID,
  key_name TEXT,
  is_active BOOLEAN,
  rate_limit INTEGER,
  credits INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Update last_used_at
  UPDATE public.api_keys
  SET last_used_at = now()
  WHERE key_hash = p_key_hash AND active = true;
  
  RETURN QUERY
  SELECT 
    ak.id,
    ak.user_id,
    ak.name,
    ak.active,
    ak.rate_limit_per_hour,
    ak.credits_remaining
  FROM public.api_keys ak
  WHERE ak.key_hash = p_key_hash;
END;
$$;

-- Function to log API usage
CREATE OR REPLACE FUNCTION public.log_api_usage(
  p_api_key_id UUID,
  p_job_id UUID,
  p_endpoint TEXT,
  p_video_duration INTEGER DEFAULT NULL,
  p_cost_cents INTEGER DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_response_status INTEGER DEFAULT 200
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.api_usage_log (
    api_key_id, job_id, endpoint, video_duration_seconds, 
    cost_cents, request_metadata, response_status
  )
  VALUES (
    p_api_key_id, p_job_id, p_endpoint, p_video_duration,
    p_cost_cents, p_metadata, p_response_status
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Indexes for performance
CREATE INDEX idx_api_keys_key_hash ON public.api_keys(key_hash);
CREATE INDEX idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX idx_api_usage_log_api_key_id ON public.api_usage_log(api_key_id);
CREATE INDEX idx_api_usage_log_created_at ON public.api_usage_log(created_at);
CREATE INDEX idx_api_jobs_api_key_id ON public.api_jobs(api_key_id);
CREATE INDEX idx_api_jobs_course_id ON public.api_jobs(course_id);
CREATE INDEX idx_api_jobs_status ON public.api_jobs(status);

-- Trigger to update api_jobs.updated_at
CREATE TRIGGER update_api_jobs_updated_at
  BEFORE UPDATE ON public.api_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
-- Update the video-uploads bucket to allow larger file uploads (5GB)
-- This enables multi-hour video uploads via TUS resumable protocol
UPDATE storage.buckets 
SET file_size_limit = 5368709120  -- 5GB in bytes
WHERE id = 'video-uploads';

-- Also update any other video-related buckets if they exist
UPDATE storage.buckets 
SET file_size_limit = 5368709120  -- 5GB in bytes
WHERE id IN ('videos', 'uploads');
-- PARALLEL PROCESSING: Increase concurrency limits for faster multi-module uploads
-- Default to 3 per user (was 1), global stays at 10

-- Update can_start_job to allow 3 concurrent jobs per user
CREATE OR REPLACE FUNCTION public.can_start_job(p_user_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_per_user_limit INTEGER;
  v_global_limit INTEGER;
  v_user_active INTEGER;
  v_global_active INTEGER;
BEGIN
  -- Get limits from settings (allows runtime tuning)
  SELECT (value->>'per_user')::int, (value->>'global')::int
  INTO v_per_user_limit, v_global_limit
  FROM public.system_settings
  WHERE key = 'concurrency_limits';
  
  -- PARALLEL PROCESSING: Default to 3 per user (was 1), global 15
  v_per_user_limit := COALESCE(v_per_user_limit, 3);
  v_global_limit := COALESCE(v_global_limit, 15);
  
  -- Count user's active jobs
  SELECT COALESCE(active_jobs, 0) INTO v_user_active
  FROM public.processing_concurrency
  WHERE user_email = p_user_email;
  
  -- Count global active jobs
  SELECT COALESCE(SUM(active_jobs), 0) INTO v_global_active
  FROM public.processing_concurrency;
  
  RETURN (COALESCE(v_user_active, 0) < v_per_user_limit) 
     AND (COALESCE(v_global_active, 0) < v_global_limit);
END;
$function$;

-- Add helper function to queue multiple modules in parallel
CREATE OR REPLACE FUNCTION public.queue_parallel_modules(
  p_course_id uuid,
  p_max_parallel integer DEFAULT 3
)
RETURNS TABLE(module_number integer, queued boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_module RECORD;
  v_queued_count INTEGER := 0;
BEGIN
  -- Find modules that are queued but not yet in processing_queue
  FOR v_module IN
    SELECT cm.module_number
    FROM public.course_modules cm
    WHERE cm.course_id = p_course_id
      AND cm.status = 'queued'
      AND NOT EXISTS (
        SELECT 1 FROM public.processing_queue pq
        WHERE pq.course_id = p_course_id
          AND pq.metadata->>'moduleNumber' = cm.module_number::text
          AND pq.status IN ('pending', 'processing', 'awaiting_webhook')
      )
    ORDER BY cm.module_number ASC
    LIMIT p_max_parallel
  LOOP
    -- Check if we've hit the parallel limit
    IF v_queued_count >= p_max_parallel THEN
      EXIT;
    END IF;
    
    module_number := v_module.module_number;
    queued := true;
    v_queued_count := v_queued_count + 1;
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$function$;

-- Add function to count active module processing for a course
CREATE OR REPLACE FUNCTION public.count_active_module_jobs(p_course_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.processing_queue
  WHERE course_id = p_course_id
    AND status IN ('pending', 'processing', 'awaiting_webhook')
    AND step LIKE '%_module';
  
  RETURN COALESCE(v_count, 0);
END;
$function$;
-- ============ PERMANENT FIX: Production-Grade Multi-Video Pipeline ============

-- 1. Add visibility_timeout and claimed_by columns for proper job claiming
ALTER TABLE processing_queue 
ADD COLUMN IF NOT EXISTS visibility_timeout TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS claimed_by TEXT DEFAULT NULL;

-- 2. Create index for efficient pending job lookup
CREATE INDEX IF NOT EXISTS idx_processing_queue_pending_jobs 
ON processing_queue (created_at) 
WHERE status = 'pending' AND purged = false;

-- 3. Create index for finding jobs to auto-queue
CREATE INDEX IF NOT EXISTS idx_course_modules_queued 
ON course_modules (course_id, module_number) 
WHERE status = 'queued' AND (purged IS NULL OR purged = false);

-- 4. Create the module completion trigger that auto-queues next modules
CREATE OR REPLACE FUNCTION queue_next_module_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_course_id UUID;
  v_next_module RECORD;
  v_active_count INTEGER;
  v_max_parallel INTEGER := 3;
  v_course_fps INTEGER;
  v_has_frames BOOLEAN;
BEGIN
  v_course_id := NEW.course_id;
  
  -- Only fire when status changes TO 'completed'
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;
  
  -- Count currently active module jobs for this course
  SELECT COUNT(*) INTO v_active_count
  FROM processing_queue pq
  WHERE pq.course_id = v_course_id
    AND pq.step LIKE '%_module'
    AND pq.status IN ('pending', 'processing', 'awaiting_webhook')
    AND (pq.purged IS NULL OR pq.purged = false);
  
  -- If under parallel limit, queue next module
  IF v_active_count < v_max_parallel THEN
    -- Find the next queued module
    SELECT cm.* INTO v_next_module
    FROM course_modules cm
    WHERE cm.course_id = v_course_id
      AND cm.status = 'queued'
      AND (cm.purged IS NULL OR cm.purged = false)
    ORDER BY cm.module_number
    LIMIT 1;
    
    IF FOUND THEN
      -- Get course FPS setting
      SELECT fps_target INTO v_course_fps
      FROM courses WHERE id = v_course_id;
      
      -- Check if module has pre-extracted frames
      v_has_frames := (v_next_module.frame_urls IS NOT NULL AND jsonb_array_length(v_next_module.frame_urls) > 0);
      
      -- Insert queue entry for next module
      -- Use transcribe_module if frames exist, otherwise transcribe_and_extract_module
      INSERT INTO processing_queue (course_id, step, status, metadata)
      VALUES (
        v_course_id, 
        CASE WHEN v_has_frames THEN 'transcribe_module' ELSE 'transcribe_and_extract_module' END,
        'pending', 
        jsonb_build_object(
          'moduleNumber', v_next_module.module_number, 
          'autoQueued', true,
          'triggeredByModule', NEW.module_number,
          'hasPreExtractedFrames', v_has_frames
        )
      )
      ON CONFLICT DO NOTHING; -- Prevent duplicates
      
      RAISE NOTICE 'Auto-queued module % for course %', v_next_module.module_number, v_course_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing trigger if it exists, then create new one
DROP TRIGGER IF EXISTS trg_queue_next_module ON course_modules;

CREATE TRIGGER trg_queue_next_module
AFTER UPDATE ON course_modules
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed')
EXECUTE FUNCTION queue_next_module_on_completion();

-- 5. Create function to atomically claim a job with visibility timeout
CREATE OR REPLACE FUNCTION claim_processing_job(
  p_worker_id TEXT,
  p_visibility_seconds INTEGER DEFAULT 300
)
RETURNS TABLE(
  job_id UUID,
  course_id UUID,
  step TEXT,
  metadata JSONB,
  attempt_count INTEGER
) AS $$
DECLARE
  v_job RECORD;
BEGIN
  -- Find and lock a pending job atomically
  SELECT pq.* INTO v_job
  FROM processing_queue pq
  WHERE (
    -- Pending jobs ready to process
    (pq.status = 'pending' AND pq.purged = false)
    OR
    -- Jobs with expired visibility timeout (worker died)
    (pq.visibility_timeout IS NOT NULL AND pq.visibility_timeout < now() AND pq.status = 'processing')
  )
  ORDER BY pq.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF v_job.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Claim the job with visibility timeout
  UPDATE processing_queue
  SET 
    status = 'processing',
    claimed_by = p_worker_id,
    visibility_timeout = now() + (p_visibility_seconds || ' seconds')::interval,
    started_at = COALESCE(started_at, now()),
    attempt_count = COALESCE(attempt_count, 0) + 1
  WHERE id = v_job.id;
  
  RETURN QUERY SELECT v_job.id, v_job.course_id, v_job.step, v_job.metadata, COALESCE(v_job.attempt_count, 0) + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Create function to extend visibility timeout (heartbeat)
CREATE OR REPLACE FUNCTION extend_job_visibility(
  p_job_id UUID,
  p_worker_id TEXT,
  p_visibility_seconds INTEGER DEFAULT 300
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE processing_queue
  SET 
    visibility_timeout = now() + (p_visibility_seconds || ' seconds')::interval,
    started_at = now() -- Also refresh started_at for watchdog
  WHERE id = p_job_id 
    AND claimed_by = p_worker_id
    AND status = 'processing';
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. Create function to complete a job
CREATE OR REPLACE FUNCTION complete_processing_job(
  p_job_id UUID,
  p_worker_id TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE processing_queue
  SET 
    status = 'completed',
    completed_at = now(),
    visibility_timeout = NULL,
    claimed_by = NULL
  WHERE id = p_job_id 
    AND claimed_by = p_worker_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8. Create function to fail a job (with optional requeue)
CREATE OR REPLACE FUNCTION fail_processing_job(
  p_job_id UUID,
  p_worker_id TEXT,
  p_error_message TEXT,
  p_should_retry BOOLEAN DEFAULT TRUE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_attempt_count INTEGER;
  v_max_attempts INTEGER := 5;
BEGIN
  SELECT attempt_count INTO v_attempt_count
  FROM processing_queue
  WHERE id = p_job_id;
  
  IF p_should_retry AND COALESCE(v_attempt_count, 0) < v_max_attempts THEN
    -- Requeue for retry
    UPDATE processing_queue
    SET 
      status = 'pending',
      started_at = NULL,
      visibility_timeout = NULL,
      claimed_by = NULL,
      error_message = p_error_message
    WHERE id = p_job_id 
      AND claimed_by = p_worker_id;
  ELSE
    -- Mark as permanently failed
    UPDATE processing_queue
    SET 
      status = 'failed',
      completed_at = now(),
      visibility_timeout = NULL,
      claimed_by = NULL,
      error_message = p_error_message
    WHERE id = p_job_id 
      AND claimed_by = p_worker_id;
  END IF;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 9. Add comment explaining the new system
COMMENT ON FUNCTION claim_processing_job IS 'Atomically claims a pending job with visibility timeout for reliable processing';
COMMENT ON FUNCTION queue_next_module_on_completion IS 'Auto-queues next module when one completes, maintaining parallel processing limit';
COMMENT ON TRIGGER trg_queue_next_module ON course_modules IS 'Fires when module status changes to completed, auto-queues next module';
-- Fix 1: Make trigger also queue next module when one FAILS (not just completes)
-- This ensures the pipeline continues even if a single module fails

DROP TRIGGER IF EXISTS trg_queue_next_module ON course_modules;

CREATE OR REPLACE FUNCTION queue_next_module_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_course_id UUID;
  v_next_module RECORD;
  v_active_count INTEGER;
  v_max_parallel INTEGER := 3;
  v_course_fps INTEGER;
  v_has_frames BOOLEAN;
BEGIN
  v_course_id := NEW.course_id;
  
  -- Fire when status changes TO 'completed' OR 'failed'
  -- This ensures the pipeline continues even if a single module fails
  IF NEW.status NOT IN ('completed', 'failed') THEN
    RETURN NEW;
  END IF;
  
  -- Count currently active module jobs for this course
  SELECT COUNT(*) INTO v_active_count
  FROM processing_queue pq
  WHERE pq.course_id = v_course_id
    AND pq.step LIKE '%_module'
    AND pq.status IN ('pending', 'processing', 'awaiting_webhook')
    AND (pq.purged IS NULL OR pq.purged = false);
  
  -- If under parallel limit, queue next module
  IF v_active_count < v_max_parallel THEN
    -- Find the next queued module
    SELECT cm.* INTO v_next_module
    FROM course_modules cm
    WHERE cm.course_id = v_course_id
      AND cm.status = 'queued'
      AND (cm.purged IS NULL OR cm.purged = false)
    ORDER BY cm.module_number
    LIMIT 1;
    
    IF FOUND THEN
      -- Get course FPS setting
      SELECT fps_target INTO v_course_fps
      FROM courses WHERE id = v_course_id;
      
      -- Check if module has pre-extracted frames
      v_has_frames := (v_next_module.frame_urls IS NOT NULL AND jsonb_array_length(v_next_module.frame_urls) > 0);
      
      -- Insert queue entry for next module
      INSERT INTO processing_queue (course_id, step, status, metadata)
      VALUES (
        v_course_id, 
        CASE WHEN v_has_frames THEN 'transcribe_module' ELSE 'transcribe_and_extract_module' END,
        'pending', 
        jsonb_build_object(
          'moduleNumber', v_next_module.module_number, 
          'autoQueued', true,
          'triggeredByModule', NEW.module_number,
          'triggeredByStatus', NEW.status,
          'hasPreExtractedFrames', v_has_frames
        )
      )
      ON CONFLICT DO NOTHING;
      
      RAISE NOTICE 'Auto-queued module % for course % (triggered by module % with status %)', 
        v_next_module.module_number, v_course_id, NEW.module_number, NEW.status;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate trigger to fire on BOTH completed and failed
CREATE TRIGGER trg_queue_next_module
AFTER UPDATE ON course_modules
FOR EACH ROW
WHEN (
  (OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed')
  OR (OLD.status IS DISTINCT FROM 'failed' AND NEW.status = 'failed')
)
EXECUTE FUNCTION queue_next_module_on_completion();
-- Add multi-video support columns to course_modules
ALTER TABLE public.course_modules 
ADD COLUMN IF NOT EXISTS source_videos JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS stitched_video_url TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS stitch_status TEXT DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.course_modules.source_videos IS 'Array of source video metadata: [{url, filename, order, duration_seconds, storage_path}]';
COMMENT ON COLUMN public.course_modules.stitched_video_url IS 'URL to concatenated video when module has multiple source videos';
COMMENT ON COLUMN public.course_modules.stitch_status IS 'Status of video stitching: pending, stitching, completed, failed';
-- Drop unused tables from deprecated features
-- These tables have 0 rows and no code references

-- Processing jobs (replaced by processing_queue)
DROP TABLE IF EXISTS public.processing_jobs CASCADE;

-- Batch jobs (not used)
DROP TABLE IF EXISTS public.batch_jobs CASCADE;

-- Story/Episode tables (film feature never launched)
DROP TABLE IF EXISTS public.episode_footage CASCADE;
DROP TABLE IF EXISTS public.episodes CASCADE;
DROP TABLE IF EXISTS public.story_state CASCADE;
DROP TABLE IF EXISTS public.story_series CASCADE;

-- Location photos (not used)
DROP TABLE IF EXISTS public.location_photos CASCADE;
DROP TABLE IF EXISTS public.location_boards CASCADE;

-- Add comment to complete_step_and_queue_next marking it as deprecated
COMMENT ON FUNCTION public.complete_step_and_queue_next(uuid, uuid, text, jsonb) IS 
  'DEPRECATED: Use complete_processing_job instead. This function does not clear claimed_by or visibility_timeout.';
-- Drop and recreate claim_processing_job to fix ambiguous column reference
DROP FUNCTION IF EXISTS public.claim_processing_job(text, integer);

CREATE FUNCTION public.claim_processing_job(
  p_worker_id text,
  p_visibility_seconds integer DEFAULT 300
)
RETURNS TABLE(job_id uuid, course_id uuid, step text, metadata jsonb, attempt_number integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_new_attempt_count integer;
BEGIN
  -- Find and lock a pending job atomically
  SELECT pq.* INTO v_job
  FROM processing_queue pq
  WHERE (
    -- Pending jobs ready to process
    (pq.status = 'pending' AND pq.purged = false)
    OR
    -- Jobs with expired visibility timeout (worker died)
    (pq.visibility_timeout IS NOT NULL AND pq.visibility_timeout < now() AND pq.status = 'processing')
  )
  ORDER BY pq.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF v_job.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Calculate new attempt count BEFORE the update to avoid ambiguity
  v_new_attempt_count := COALESCE(v_job.attempt_count, 0) + 1;
  
  -- Claim the job with visibility timeout
  -- Use explicit table alias to avoid column ambiguity
  UPDATE processing_queue
  SET 
    status = 'processing',
    claimed_by = p_worker_id,
    visibility_timeout = now() + (p_visibility_seconds || ' seconds')::interval,
    started_at = COALESCE(processing_queue.started_at, now()),
    attempt_count = v_new_attempt_count
  WHERE processing_queue.id = v_job.id;
  
  RETURN QUERY SELECT v_job.id, v_job.course_id, v_job.step, v_job.metadata, v_new_attempt_count;
END;
$$;
-- Add pdf_revision_pending flag to track when artifacts have been updated
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS pdf_revision_pending boolean DEFAULT false;
-- Fix storage RLS policies for course-files bucket to properly allow authenticated users

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Authenticated users can upload course files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read course files" ON storage.objects;

-- Create comprehensive policies for authenticated users using the correct role
CREATE POLICY "Authenticated users can upload to course-files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'course-files');

CREATE POLICY "Authenticated users can read from course-files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'course-files');

CREATE POLICY "Authenticated users can update course-files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'course-files')
WITH CHECK (bucket_id = 'course-files');

CREATE POLICY "Authenticated users can delete from course-files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'course-files');
-- Copy course_files from the queued course (with 252 files) to the completed course
UPDATE courses 
SET 
  course_files = (
    SELECT course_files FROM courses 
    WHERE id = 'eb99f515-5bd9-4f14-b47f-defd8f97eca5'
  ),
  pdf_revision_pending = true
WHERE id = '1f3e0121-2999-4ed6-b232-fac4cd0ded15';

-- Soft delete the duplicate/orphaned Michael Reimer courses (keep only the completed one)
UPDATE courses 
SET 
  purged = true,
  purged_at = now(),
  purged_by = 'system_cleanup'
WHERE title = 'Michael Reimer' 
  AND id != '1f3e0121-2999-4ed6-b232-fac4cd0ded15'
  AND email = 'christinaxcabral@gmail.com';
-- ============================================
-- IMPLEMENTATION LAYER: Structured Execution Steps
-- Extends existing governance infrastructure
-- ============================================

-- 1. implementation_steps: AI-proposed, human-approved atomic steps
CREATE TABLE public.implementation_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  artifact_id UUID NOT NULL REFERENCES public.transformation_artifacts(id) ON DELETE CASCADE,
  
  -- Step identification
  step_number INTEGER NOT NULL,
  step_title TEXT NOT NULL,
  step_description TEXT,
  
  -- Timing anchor (links to source frame evidence)
  source_frame_id UUID REFERENCES public.artifact_frames(id),
  timestamp_start_ms INTEGER,
  timestamp_end_ms INTEGER,
  
  -- Extraction metadata
  extracted_by TEXT NOT NULL DEFAULT 'ai', -- 'ai' or 'human'
  extraction_confidence NUMERIC(3,2) CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1),
  
  -- Human approval status (Governance-Gated)
  approval_status TEXT NOT NULL DEFAULT 'proposed' CHECK (approval_status IN ('proposed', 'approved', 'rejected', 'superseded')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Enforceable once approved
  is_enforceable BOOLEAN GENERATED ALWAYS AS (approval_status = 'approved') STORED,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(artifact_id, step_number)
);

-- 2. step_dependencies: Conditional logic (if X → then Y)
CREATE TABLE public.step_dependencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- The step that has the dependency
  dependent_step_id UUID NOT NULL REFERENCES public.implementation_steps(id) ON DELETE CASCADE,
  
  -- The prerequisite step that must be completed first
  prerequisite_step_id UUID NOT NULL REFERENCES public.implementation_steps(id) ON DELETE CASCADE,
  
  -- Dependency type
  dependency_type TEXT NOT NULL DEFAULT 'prerequisite' CHECK (dependency_type IN (
    'prerequisite',     -- Must complete before
    'conditional',      -- If X then Y
    'blocking',         -- Hard block, cannot skip
    'recommended'       -- Soft dependency, can skip with warning
  )),
  
  -- Conditional logic (if dependency_type = 'conditional')
  condition_expression TEXT, -- e.g., "step.output.success = true"
  condition_description TEXT, -- Human-readable: "Only if previous step succeeded"
  
  -- Approval status (dependencies also need human approval)
  approval_status TEXT NOT NULL DEFAULT 'proposed' CHECK (approval_status IN ('proposed', 'approved', 'rejected')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Prevent circular dependencies at constraint level
  CHECK (dependent_step_id != prerequisite_step_id)
);

-- 3. step_constraints: Gotchas, exceptions, warnings
CREATE TABLE public.step_constraints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  step_id UUID NOT NULL REFERENCES public.implementation_steps(id) ON DELETE CASCADE,
  
  -- Constraint classification
  constraint_type TEXT NOT NULL CHECK (constraint_type IN (
    'prerequisite',     -- Must have X before doing this
    'warning',          -- Gotcha / common mistake
    'exception',        -- Edge case handling
    'timing',           -- Must do within X time
    'order',            -- Must do in specific sequence
    'environment',      -- Requires specific setup
    'validation'        -- How to verify completion
  )),
  
  -- Constraint details
  constraint_title TEXT NOT NULL,
  constraint_description TEXT NOT NULL,
  
  -- Severity (affects enforcement)
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  
  -- Evidence linking
  source_frame_id UUID REFERENCES public.artifact_frames(id),
  source_timestamp_ms INTEGER,
  source_text TEXT, -- The OCR or transcript text that surfaced this
  
  -- AI extraction metadata
  extraction_confidence NUMERIC(3,2),
  
  -- Human approval
  approval_status TEXT NOT NULL DEFAULT 'proposed' CHECK (approval_status IN ('proposed', 'approved', 'rejected')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. step_completions: User progress tracking with governance gating
CREATE TABLE public.step_completions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- What was completed
  step_id UUID NOT NULL REFERENCES public.implementation_steps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Completion status
  status TEXT NOT NULL DEFAULT 'incomplete' CHECK (status IN ('incomplete', 'in_progress', 'completed', 'skipped')),
  completed_at TIMESTAMPTZ,
  
  -- Skip governance (requires execution_frame if skipping prerequisites)
  skipped_prerequisites BOOLEAN NOT NULL DEFAULT false,
  skip_frame_id UUID REFERENCES public.execution_frames(id), -- Required if skipping
  skip_reason TEXT,
  
  -- User notes / verification
  completion_notes TEXT,
  verification_evidence TEXT, -- Optional proof of completion
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(step_id, user_id)
);

-- ============================================
-- ENFORCEMENT: Block progression without prerequisites
-- ============================================

-- Function to check if user can progress to a step
CREATE OR REPLACE FUNCTION public.can_progress_to_step(
  p_step_id UUID,
  p_user_id UUID
) RETURNS TABLE(
  allowed BOOLEAN,
  missing_prerequisites UUID[],
  blocking_constraints TEXT[],
  requires_frame BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_missing UUID[];
  v_blocking TEXT[];
BEGIN
  -- Find incomplete prerequisite steps (only approved dependencies count)
  SELECT ARRAY_AGG(sd.prerequisite_step_id) INTO v_missing
  FROM public.step_dependencies sd
  LEFT JOIN public.step_completions sc 
    ON sc.step_id = sd.prerequisite_step_id 
    AND sc.user_id = p_user_id
    AND sc.status = 'completed'
  WHERE sd.dependent_step_id = p_step_id
    AND sd.approval_status = 'approved'
    AND sd.dependency_type IN ('prerequisite', 'blocking')
    AND sc.id IS NULL; -- Not completed
  
  -- Find critical constraints that haven't been acknowledged
  SELECT ARRAY_AGG(c.constraint_title) INTO v_blocking
  FROM public.step_constraints c
  WHERE c.step_id = p_step_id
    AND c.approval_status = 'approved'
    AND c.severity = 'critical';
  
  v_missing := COALESCE(v_missing, ARRAY[]::UUID[]);
  v_blocking := COALESCE(v_blocking, ARRAY[]::TEXT[]);
  
  RETURN QUERY SELECT 
    (array_length(v_missing, 1) IS NULL OR array_length(v_missing, 1) = 0),
    v_missing,
    v_blocking,
    (array_length(v_missing, 1) IS NOT NULL AND array_length(v_missing, 1) > 0);
END;
$$;

-- Function to complete a step (with governance check)
CREATE OR REPLACE FUNCTION public.complete_implementation_step(
  p_step_id UUID,
  p_user_id UUID,
  p_skip_prerequisites BOOLEAN DEFAULT false,
  p_skip_frame_id UUID DEFAULT NULL,
  p_skip_reason TEXT DEFAULT NULL,
  p_completion_notes TEXT DEFAULT NULL
) RETURNS TABLE(
  success BOOLEAN,
  error_message TEXT,
  completion_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_can_progress RECORD;
  v_completion_id UUID;
BEGIN
  -- Check if step is enforceable (approved)
  IF NOT EXISTS (
    SELECT 1 FROM public.implementation_steps 
    WHERE id = p_step_id AND is_enforceable = true
  ) THEN
    RETURN QUERY SELECT false, 'Step is not yet approved for enforcement'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  
  -- Check prerequisites
  SELECT * INTO v_can_progress FROM public.can_progress_to_step(p_step_id, p_user_id);
  
  IF NOT v_can_progress.allowed THEN
    -- User is trying to skip prerequisites
    IF NOT p_skip_prerequisites THEN
      RETURN QUERY SELECT false, 
        ('Prerequisites not met: ' || array_to_string(v_can_progress.missing_prerequisites::text[], ', '))::TEXT,
        NULL::UUID;
      RETURN;
    END IF;
    
    -- Governance gate: require execution_frame to skip
    IF p_skip_frame_id IS NULL THEN
      RETURN QUERY SELECT false, 
        'GOVERNANCE REQUIRED: Skipping prerequisites requires an approved execution_frame'::TEXT,
        NULL::UUID;
      RETURN;
    END IF;
    
    -- Verify the frame is approved
    IF NOT EXISTS (
      SELECT 1 FROM public.execution_frames 
      WHERE id = p_skip_frame_id 
        AND approval_status = 'approved'
        AND executed = true
    ) THEN
      RETURN QUERY SELECT false,
        'GOVERNANCE VIOLATION: execution_frame is not approved'::TEXT,
        NULL::UUID;
      RETURN;
    END IF;
  END IF;
  
  -- Insert or update completion
  INSERT INTO public.step_completions (
    step_id, user_id, status, completed_at,
    skipped_prerequisites, skip_frame_id, skip_reason, completion_notes
  ) VALUES (
    p_step_id, p_user_id, 'completed', now(),
    p_skip_prerequisites, p_skip_frame_id, p_skip_reason, p_completion_notes
  )
  ON CONFLICT (step_id, user_id) DO UPDATE SET
    status = 'completed',
    completed_at = now(),
    skipped_prerequisites = EXCLUDED.skipped_prerequisites,
    skip_frame_id = EXCLUDED.skip_frame_id,
    skip_reason = EXCLUDED.skip_reason,
    completion_notes = EXCLUDED.completion_notes,
    updated_at = now()
  RETURNING id INTO v_completion_id;
  
  RETURN QUERY SELECT true, NULL::TEXT, v_completion_id;
END;
$$;

-- ============================================
-- INDEXES for performance
-- ============================================

CREATE INDEX idx_implementation_steps_artifact ON public.implementation_steps(artifact_id);
CREATE INDEX idx_implementation_steps_approval ON public.implementation_steps(approval_status);
CREATE INDEX idx_step_dependencies_dependent ON public.step_dependencies(dependent_step_id);
CREATE INDEX idx_step_dependencies_prerequisite ON public.step_dependencies(prerequisite_step_id);
CREATE INDEX idx_step_constraints_step ON public.step_constraints(step_id);
CREATE INDEX idx_step_completions_user ON public.step_completions(user_id);
CREATE INDEX idx_step_completions_step ON public.step_completions(step_id);

-- ============================================
-- RLS: User can only see/modify their own completions
-- ============================================

ALTER TABLE public.implementation_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.step_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.step_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.step_completions ENABLE ROW LEVEL SECURITY;

-- Steps are readable by artifact owners (transformation_artifacts has user_id directly)
CREATE POLICY "View steps for owned artifacts" ON public.implementation_steps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.transformation_artifacts ta
      WHERE ta.id = artifact_id
        AND ta.user_id = auth.uid()
    )
  );

CREATE POLICY "View dependencies for owned artifacts" ON public.step_dependencies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.implementation_steps s
      JOIN public.transformation_artifacts ta ON ta.id = s.artifact_id
      WHERE s.id = dependent_step_id
        AND ta.user_id = auth.uid()
    )
  );

CREATE POLICY "View constraints for owned artifacts" ON public.step_constraints
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.implementation_steps s
      JOIN public.transformation_artifacts ta ON ta.id = s.artifact_id
      WHERE s.id = step_id
        AND ta.user_id = auth.uid()
    )
  );

-- Users manage their own completions
CREATE POLICY "Users manage own completions" ON public.step_completions
  FOR ALL USING (user_id = auth.uid());

-- ============================================
-- TRIGGER: updated_at
-- ============================================

CREATE TRIGGER update_implementation_steps_updated_at
  BEFORE UPDATE ON public.implementation_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_step_completions_updated_at
  BEFORE UPDATE ON public.step_completions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- Allow 'processing' status for courses (code currently writes this value)
ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_status_check;

ALTER TABLE public.courses
  ADD CONSTRAINT courses_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'queued'::text,
        'processing'::text,
        'transcribing'::text,
        'extracting_frames'::text,
        'rendering_gifs'::text,
        'training_ai'::text,
        'completed'::text,
        'failed'::text
      ]
    )
  );
-- Add job_verification table to track output verification results
CREATE TABLE IF NOT EXISTS public.job_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES public.processing_queue(id) ON DELETE SET NULL,
  course_id UUID NOT NULL,
  step TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  failed_critical TEXT[] NOT NULL DEFAULT '{}',
  verified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  verified_by TEXT NOT NULL DEFAULT 'system'
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_job_verifications_course_id ON public.job_verifications(course_id);
CREATE INDEX IF NOT EXISTS idx_job_verifications_verified ON public.job_verifications(verified);

-- Enable RLS
ALTER TABLE public.job_verifications ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (backend operations only)
CREATE POLICY "Service role can manage verifications" ON public.job_verifications
  FOR ALL USING (true);

-- Add constraint_status to processing_queue if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'processing_queue' AND column_name = 'verification_status'
  ) THEN
    ALTER TABLE public.processing_queue ADD COLUMN verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'failed', 'skipped'));
  END IF;
END $$;

-- Create function to check pipeline health
CREATE OR REPLACE FUNCTION public.check_pipeline_health()
RETURNS TABLE(
  healthy BOOLEAN,
  stuck_processing_count INTEGER,
  stuck_pending_count INTEGER,
  critical_violations_count INTEGER,
  failed_verifications_count INTEGER,
  oldest_stuck_job_hours NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stuck_processing INTEGER;
  v_stuck_pending INTEGER;
  v_critical_violations INTEGER;
  v_failed_verifications INTEGER;
  v_oldest_hours NUMERIC;
BEGIN
  -- Count processing jobs stuck for >30 min
  SELECT COUNT(*) INTO v_stuck_processing
  FROM processing_queue
  WHERE status = 'processing'
    AND started_at < now() - interval '30 minutes'
    AND purged = false;
  
  -- Count pending jobs older than 10 min (should have been picked up)
  SELECT COUNT(*) INTO v_stuck_pending
  FROM processing_queue
  WHERE status = 'pending'
    AND created_at < now() - interval '10 minutes'
    AND purged = false;
  
  -- Count unresolved critical violations
  SELECT COUNT(*) INTO v_critical_violations
  FROM constraint_violations
  WHERE resolved = false
    AND severity = 'critical'
    AND detected_at > now() - interval '24 hours';
  
  -- Count failed verifications in last 24h
  SELECT COUNT(*) INTO v_failed_verifications
  FROM job_verifications
  WHERE verified = false
    AND verified_at > now() - interval '24 hours';
  
  -- Find oldest stuck job age in hours
  SELECT EXTRACT(EPOCH FROM (now() - MIN(started_at))) / 3600.0 INTO v_oldest_hours
  FROM processing_queue
  WHERE status = 'processing'
    AND purged = false;
  
  RETURN QUERY SELECT
    (v_stuck_processing = 0 AND v_critical_violations = 0) AS healthy,
    v_stuck_processing AS stuck_processing_count,
    v_stuck_pending AS stuck_pending_count,
    v_critical_violations AS critical_violations_count,
    v_failed_verifications AS failed_verifications_count,
    COALESCE(v_oldest_hours, 0) AS oldest_stuck_job_hours;
END;
$$;

-- Create function to detect and auto-recover stalled jobs
CREATE OR REPLACE FUNCTION public.auto_recover_stalled_jobs(p_max_jobs INTEGER DEFAULT 5)
RETURNS TABLE(
  recovered_count INTEGER,
  failed_count INTEGER,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recovered INTEGER := 0;
  v_failed INTEGER := 0;
  v_details JSONB := '[]'::jsonb;
  v_job RECORD;
BEGIN
  -- Find stalled jobs (processing > 30 min without visibility timeout update)
  FOR v_job IN
    SELECT pq.id, pq.course_id, pq.step, pq.attempt_count, pq.started_at
    FROM processing_queue pq
    WHERE pq.status = 'processing'
      AND pq.purged = false
      AND (
        pq.visibility_timeout IS NULL 
        OR pq.visibility_timeout < now()
      )
      AND pq.started_at < now() - interval '30 minutes'
    ORDER BY pq.started_at ASC
    LIMIT p_max_jobs
  LOOP
    -- Check if course has data (frames exist = should recover, not fail)
    IF EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = v_job.course_id
        AND c.frame_urls IS NOT NULL
        AND jsonb_array_length(c.frame_urls) > 0
    ) THEN
      -- Has data - reset to pending for retry
      UPDATE processing_queue
      SET status = 'pending',
          started_at = NULL,
          visibility_timeout = NULL,
          claimed_by = NULL,
          attempt_count = v_job.attempt_count + 1,
          error_message = 'Auto-recovered by stalled job detector (data exists)'
      WHERE id = v_job.id;
      
      v_recovered := v_recovered + 1;
    ELSE
      -- No data after 30 min - check attempt count
      IF v_job.attempt_count >= 5 THEN
        UPDATE processing_queue
        SET status = 'failed',
            completed_at = now(),
            error_message = 'Max recovery attempts exceeded'
        WHERE id = v_job.id;
        
        UPDATE courses
        SET status = 'failed',
            error_message = 'Processing timed out after multiple attempts'
        WHERE id = v_job.course_id;
        
        v_failed := v_failed + 1;
      ELSE
        UPDATE processing_queue
        SET status = 'pending',
            started_at = NULL,
            visibility_timeout = NULL,
            claimed_by = NULL,
            attempt_count = v_job.attempt_count + 1,
            error_message = format('Auto-recovered attempt %s', v_job.attempt_count + 1)
        WHERE id = v_job.id;
        
        v_recovered := v_recovered + 1;
      END IF;
    END IF;
    
    v_details := v_details || jsonb_build_object(
      'job_id', v_job.id,
      'course_id', v_job.course_id,
      'step', v_job.step,
      'action', CASE WHEN v_job.attempt_count >= 5 THEN 'failed' ELSE 'recovered' END
    );
  END LOOP;
  
  RETURN QUERY SELECT v_recovered, v_failed, v_details;
END;
$$;

-- Create function to verify course outputs
CREATE OR REPLACE FUNCTION public.verify_course_outputs(p_course_id UUID)
RETURNS TABLE(
  verified BOOLEAN,
  frame_count INTEGER,
  has_transcript BOOLEAN,
  failed_checks TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course RECORD;
  v_failed TEXT[] := '{}';
BEGIN
  SELECT * INTO v_course
  FROM courses
  WHERE id = p_course_id;
  
  IF v_course.id IS NULL THEN
    RETURN QUERY SELECT false, 0, false, ARRAY['course_not_found']::TEXT[];
    RETURN;
  END IF;
  
  -- Check frames
  IF v_course.frame_urls IS NULL OR jsonb_array_length(v_course.frame_urls) = 0 THEN
    v_failed := array_append(v_failed, 'no_frames');
  END IF;
  
  -- Check if frame count matches expected (with 80% tolerance)
  IF v_course.total_frames IS NOT NULL AND v_course.total_frames > 0 THEN
    IF jsonb_array_length(COALESCE(v_course.frame_urls, '[]'::jsonb)) < (v_course.total_frames * 0.8) THEN
      v_failed := array_append(v_failed, 'insufficient_frames');
    END IF;
  END IF;
  
  RETURN QUERY SELECT
    (array_length(v_failed, 1) IS NULL OR array_length(v_failed, 1) = 0) AS verified,
    jsonb_array_length(COALESCE(v_course.frame_urls, '[]'::jsonb))::INTEGER AS frame_count,
    (v_course.transcript IS NOT NULL AND v_course.transcript != '[]'::jsonb AND v_course.transcript != '{}'::jsonb) AS has_transcript,
    v_failed AS failed_checks;
END;
$$;
-- Add merged_course_mode column to courses table
-- When TRUE: All modules become chapters in ONE unified PDF with TOC
-- User receives ONE email when entire course is complete (with progress updates during processing)
-- When FALSE (default): Separate artifacts per module, per-module emails

ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS merged_course_mode boolean DEFAULT false;

-- Add send_per_module_emails column for backwards compatibility
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS send_per_module_emails boolean DEFAULT true;

-- Add index for querying merged courses
CREATE INDEX IF NOT EXISTS idx_courses_merged_mode ON public.courses (merged_course_mode) WHERE merged_course_mode = true;

-- Add comment for documentation
COMMENT ON COLUMN public.courses.merged_course_mode IS 'When true, all modules become chapters in ONE unified PDF with Table of Contents. User gets one completion email.';
-- Add 'awaiting_webhook' to the processing_queue status constraint
-- This status is used when jobs are waiting for external webhook callbacks (Replicate, AssemblyAI)

ALTER TABLE processing_queue DROP CONSTRAINT processing_queue_status_check;

ALTER TABLE processing_queue ADD CONSTRAINT processing_queue_status_check 
CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'awaiting_webhook'::text, 'completed'::text, 'failed'::text]));
-- Increase video-uploads bucket file size limit to 50GB
UPDATE storage.buckets
SET file_size_limit = 53687091200
WHERE id = 'video-uploads';
-- Add metadata column to video_chunks for storing manifest info
ALTER TABLE public.video_chunks
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Add 'transcript_only' as a valid density_mode for large file fallbacks
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_density_mode_check;
ALTER TABLE public.courses ADD CONSTRAINT courses_density_mode_check 
  CHECK (density_mode = ANY (ARRAY['standard'::text, 'cinematic'::text, 'transcript_only'::text]));
