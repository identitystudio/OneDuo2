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