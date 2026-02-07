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
SELECT pg_catalog.set_config('search_path', '', false);
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