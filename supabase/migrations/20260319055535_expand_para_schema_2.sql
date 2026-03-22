-- 1. Helper function to extract auth UID from the Supabase JWT
-- In a generic JWT, the user ID is in the 'sub' claim.
CREATE OR REPLACE FUNCTION public.auth_uid() 
RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', '')::text;
$$ LANGUAGE sql STABLE;

-- 2. Enhance the existing `users` table with missing fields from the Para architecture
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS streak_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS trips INTEGER DEFAULT 0, -- Total completed trips count
ADD COLUMN IF NOT EXISTS distance NUMERIC DEFAULT 0.0, -- Total distance traveled in km
ADD COLUMN IF NOT EXISTS spent NUMERIC DEFAULT 0.0, -- Total fare spent
ADD COLUMN IF NOT EXISTS last_ride_at TIMESTAMP WITH TIME ZONE; -- To track streaks

-- 3. Static Badges reference table
CREATE TABLE IF NOT EXISTS public.badges (
    id TEXT PRIMARY KEY, -- e.g., 'first_ride', 'night_owl', 'early_bird', 'explorer'
    name TEXT NOT NULL,
    emoji TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. User Badges (mapping users to earned badges)
CREATE TABLE IF NOT EXISTS public.user_badges (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    badge_id TEXT REFERENCES public.badges(id) ON DELETE CASCADE NOT NULL,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, badge_id) -- A user can only earn a specific badge once
);

-- 5. Saved Routes (bookmarking user routes)
CREATE TABLE IF NOT EXISTS public.saved_routes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    origin_name TEXT,
    destination_name TEXT,
    total_fare NUMERIC DEFAULT 0.0,
    estimated_minutes INTEGER DEFAULT 0,
    total_km NUMERIC DEFAULT 0.0,
    legs JSONB NOT NULL DEFAULT '[]'::jsonb, -- Store transit mode combinations
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Trip History (For tracking stats and generating points)
CREATE TABLE IF NOT EXISTS public.trips (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    origin_name TEXT,
    destination_name TEXT,
    distance_km NUMERIC NOT NULL,
    fare NUMERIC NOT NULL,
    points_earned INTEGER DEFAULT 0,
    status TEXT DEFAULT 'completed', -- 'ongoing', 'completed', 'cancelled'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Note: we already have public.routes (for system-wide public transit paths) created in the initial migration
ALTER TABLE public.routes 
ADD COLUMN IF NOT EXISTS color TEXT,
ADD COLUMN IF NOT EXISTS fare_base NUMERIC,
ADD COLUMN IF NOT EXISTS fare_per_km NUMERIC;


-- 7. Setup Row Level Security (RLS) policies

-- Enable RLS on all tables
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

-- Badges and public Routes are readable by everyone
CREATE POLICY "Allow public read access on badges" ON public.badges FOR SELECT USING (true);

-- Users policies
-- Note: Requires IF NOT EXISTS equivalent for policies or just CREATE. If they already exist, it will throw an error, 
-- but since this is a new table/column set, we should be fine writing fresh policies.
CREATE POLICY "Users can insert their own profile" ON public.users FOR INSERT WITH CHECK (id = public.auth_uid());
CREATE POLICY "Users can read their own profile" ON public.users FOR SELECT USING (id = public.auth_uid());
CREATE POLICY "Users can update their own profile" ON public.users FOR UPDATE USING (id = public.auth_uid());

-- User Badges policies
CREATE POLICY "Users can read own badges" ON public.user_badges FOR SELECT USING (user_id = public.auth_uid());

-- Saved Routes policies
CREATE POLICY "Users can manage own saved routes" ON public.saved_routes FOR ALL USING (user_id = public.auth_uid());

-- Trips policies
CREATE POLICY "Users can read own trips" ON public.trips FOR SELECT USING (user_id = public.auth_uid());
CREATE POLICY "Users can insert their own trips" ON public.trips FOR INSERT WITH CHECK (user_id = public.auth_uid());
CREATE POLICY "Users can update their own trips" ON public.trips FOR UPDATE USING (user_id = public.auth_uid());

-- Initial Badge Seed Data
INSERT INTO public.badges (id, name, emoji, description) VALUES
('first_ride', 'First Ride', '🎉', 'Completed your very first ride with Para.'),
('night_owl', 'Night Owl', '🦉', 'Travelled between 12 AM and 4 AM.'),
('early_bird', 'Early Bird', '🌅', 'Started a commute before 6 AM.'),
('explorer', 'Explorer', '🗺️', 'Saved at least 5 different routes.')
ON CONFLICT (id) DO NOTHING;
