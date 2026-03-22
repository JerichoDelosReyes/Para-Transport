-- 0. Drop existing tables to rebuild from scratch
DROP TABLE IF EXISTS public.user_badges CASCADE;
DROP TABLE IF EXISTS public.badges CASCADE;
DROP TABLE IF EXISTS public.trips CASCADE;
DROP TABLE IF EXISTS public.saved_routes CASCADE;
DROP TABLE IF EXISTS public.route_stops CASCADE;
DROP TABLE IF EXISTS public.routes CASCADE;
DROP TABLE IF EXISTS public.terminals CASCADE;
DROP TABLE IF EXISTS public.vehicle_types CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- 1. Helper function
CREATE OR REPLACE FUNCTION public.auth_uid() 
RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', '')::text;
$$ LANGUAGE sql STABLE;

-- 2. USERS TABLE
CREATE TABLE public.users (
    id TEXT PRIMARY KEY, -- Auth provider UID
    display_name TEXT,
    email TEXT,
    avatar_url TEXT,
    points INTEGER DEFAULT 0,
    streak_count INTEGER DEFAULT 0,
    last_ride_at TIMESTAMP WITH TIME ZONE,
    total_trips INTEGER DEFAULT 0,
    total_distance NUMERIC DEFAULT 0.0,
    total_fare NUMERIC DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. VEHICLE TYPES TABLE
CREATE TABLE public.vehicle_types (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    color_hex TEXT,
    icon_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO public.vehicle_types (id, display_name, color_hex, icon_name) VALUES
('jeepney', 'Jeepney', '#E8A020', 'bus'),
('tricycle', 'Tricycle', '#4285F4', 'bicycle'),
('uv_express', 'UV Express', '#34A853', 'car'),
('bus', 'Bus', '#EA4335', 'bus'),
('lrt', 'LRT', '#9C27B0', 'train');

-- 4. TERMINALS TABLE
CREATE TABLE public.terminals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    latitude NUMERIC NOT NULL,
    longitude NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. ROUTES TABLE
CREATE TABLE public.routes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    route_code TEXT,
    name TEXT NOT NULL,
    vehicle_type_id TEXT REFERENCES public.vehicle_types(id) ON DELETE SET NULL,
    origin_terminal_id UUID REFERENCES public.terminals(id) ON DELETE SET NULL,
    destination_terminal_id UUID REFERENCES public.terminals(id) ON DELETE SET NULL,
    fare_base NUMERIC NOT NULL,
    fare_per_km NUMERIC,
    estimated_travel_time INTEGER,
    total_distance NUMERIC,
    is_active BOOLEAN DEFAULT true,
    color_hex TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. ROUTE STOPS TABLE
CREATE TABLE public.route_stops (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    route_id UUID REFERENCES public.routes(id) ON DELETE CASCADE,
    stop_name TEXT NOT NULL,
    latitude NUMERIC NOT NULL,
    longitude NUMERIC NOT NULL,
    stop_order INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. SAVED ROUTES TABLE
CREATE TABLE public.saved_routes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    origin_name TEXT,
    destination_name TEXT,
    total_fare NUMERIC DEFAULT 0.0,
    estimated_minutes INTEGER DEFAULT 0,
    total_km NUMERIC DEFAULT 0.0,
    legs JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. TRIPS TABLE
CREATE TABLE public.trips (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
    origin_name TEXT,
    destination_name TEXT,
    distance_km NUMERIC NOT NULL,
    total_fare NUMERIC NOT NULL,
    points_earned INTEGER DEFAULT 0,
    status TEXT DEFAULT 'ongoing',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 9. BADGES TABLE
CREATE TABLE public.badges (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO public.badges (id, name, emoji, description) VALUES
('first_ride', 'First Ride', '🎉', 'Completed your very first ride with Para.'),
('night_owl', 'Night Owl', '🦉', 'Travelled between 12 AM and 4 AM.'),
('early_bird', 'Early Bird', '🌅', 'Started a commute before 6 AM.'),
('explorer', 'Explorer', '🗺️', 'Saved at least 5 different routes.'),
('frequent_rider', 'Frequent Rider', '🚌', 'Completed 10 trips.'),
('distance_king', 'Distance King', '📍', 'Travelled 100 km total.'),
('suki', 'Suki', '🏅', 'Achieved a 7-day streak.');

-- 10. USER BADGES TABLE
CREATE TABLE public.user_badges (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    badge_id TEXT REFERENCES public.badges(id) ON DELETE CASCADE NOT NULL,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, badge_id)
);

-- 11. ENABLE RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

-- 12. RLS POLICIES
-- public read for reference tables
CREATE POLICY "Public read access on vehicle_types" ON public.vehicle_types FOR SELECT USING (true);
CREATE POLICY "Public read access on terminals" ON public.terminals FOR SELECT USING (true);
CREATE POLICY "Public read access on routes" ON public.routes FOR SELECT USING (true);
CREATE POLICY "Public read access on route_stops" ON public.route_stops FOR SELECT USING (true);
CREATE POLICY "Public read access on badges" ON public.badges FOR SELECT USING (true);

-- users table policies
CREATE POLICY "Users can insert their own profile" ON public.users FOR INSERT WITH CHECK (id = public.auth_uid());
CREATE POLICY "Users can read their own profile" ON public.users FOR SELECT USING (id = public.auth_uid());
CREATE POLICY "Users can update their own profile" ON public.users FOR UPDATE USING (id = public.auth_uid());

-- saved_routes policies
CREATE POLICY "Users can read own saved routes" ON public.saved_routes FOR SELECT USING (user_id = public.auth_uid());
CREATE POLICY "Users can insert own saved routes" ON public.saved_routes FOR INSERT WITH CHECK (user_id = public.auth_uid());
CREATE POLICY "Users can update own saved routes" ON public.saved_routes FOR UPDATE USING (user_id = public.auth_uid());
CREATE POLICY "Users can delete own saved routes" ON public.saved_routes FOR DELETE USING (user_id = public.auth_uid());

-- trips policies
CREATE POLICY "Users can read own trips" ON public.trips FOR SELECT USING (user_id = public.auth_uid());
CREATE POLICY "Users can insert own trips" ON public.trips FOR INSERT WITH CHECK (user_id = public.auth_uid());
CREATE POLICY "Users can update own trips" ON public.trips FOR UPDATE USING (user_id = public.auth_uid());
CREATE POLICY "Users can delete own trips" ON public.trips FOR DELETE USING (user_id = public.auth_uid());

-- user_badges policies
CREATE POLICY "Users can read own badges" ON public.user_badges FOR SELECT USING (user_id = public.auth_uid());

-- 13. SEEDING ROUTES & STOPS
DO $$
DECLARE
    term_imus_crossing UUID := gen_random_uuid();
    term_bacoor_blvd UUID := gen_random_uuid();
    term_imus_centrum UUID := gen_random_uuid();
    term_dsma_burol UUID := gen_random_uuid();
    term_bacoor_term UUID := gen_random_uuid();
    term_moa UUID := gen_random_uuid();
    term_imus_market UUID := gen_random_uuid();
    term_kawit_pob UUID := gen_random_uuid();
    term_dma_term UUID := gen_random_uuid();

    r_bacoor UUID := gen_random_uuid();
    r_uv UUID := gen_random_uuid();
    r_bus UUID := gen_random_uuid();
    r_tricycle UUID := gen_random_uuid();
    r_jeep2 UUID := gen_random_uuid();

BEGIN
    -- Insert Terminals
    INSERT INTO public.terminals (id, name, city, latitude, longitude) VALUES
    (term_imus_crossing, 'Imus Crossing', 'Imus', 14.4251, 120.9404),
    (term_bacoor_blvd, 'Bacoor Boulevard', 'Bacoor', 14.4578, 120.9490),
    (term_imus_centrum, 'Imus Centrum', 'Imus', 14.4300, 120.9410),
    (term_dsma_burol, 'Dasmariñas Burol', 'Dasmariñas', 14.3275, 120.9460),
    (term_bacoor_term, 'Bacoor Terminal', 'Bacoor', 14.4600, 120.9500),
    (term_moa, 'Mall of Asia Terminal', 'Pasay', 14.5323, 120.9822),
    (term_imus_market, 'Imus Public Market', 'Imus', 14.4260, 120.9415),
    (term_kawit_pob, 'Kawit Poblacion', 'Kawit', 14.4468, 120.9026),
    (term_dma_term, 'Dasmariñas Terminal', 'Dasmariñas', 14.3200, 120.9400);

    -- Insert Routes
    INSERT INTO public.routes (id, route_code, name, vehicle_type_id, origin_terminal_id, destination_terminal_id, fare_base, fare_per_km, total_distance, estimated_travel_time, is_active, color_hex) VALUES
    (r_bacoor, 'J-01', 'Imus Crossing to Bacoor Boulevard', 'jeepney', term_imus_crossing, term_bacoor_blvd, 13.00, 2.00, 5.2, 20, true, '#E8A020'),
    (r_uv, 'U-01', 'Imus Centrum to Dasmariñas Burol', 'uv_express', term_imus_centrum, term_dsma_burol, 25.00, 0.00, 11.5, 30, true, '#34A853'),
    (r_bus, 'B-01', 'Bacoor to Mall of Asia', 'bus', term_bacoor_term, term_moa, 35.00, 0.00, 14.2, 45, true, '#EA4335'),
    (r_tricycle, 'T-01', 'Imus Public Market to Kawit Poblacion', 'tricycle', term_imus_market, term_kawit_pob, 10.00, 5.00, 4.8, 15, true, '#4285F4'),
    (r_jeep2, 'J-02', 'Dasmariñas to Imus Crossing', 'jeepney', term_dma_term, term_imus_crossing, 15.00, 2.00, 10.5, 35, true, '#E8A020');

    -- Insert Route Stops
    -- J-01
    INSERT INTO public.route_stops (route_id, stop_name, latitude, longitude, stop_order) VALUES
    (r_bacoor, 'Imus Crossing', 14.4251, 120.9404, 1),
    (r_bacoor, 'MCI', 14.4320, 120.9420, 2),
    (r_bacoor, 'Nomad', 14.4400, 120.9450, 3),
    (r_bacoor, 'Bacoor Boulevard', 14.4578, 120.9490, 4);

    -- U-01
    INSERT INTO public.route_stops (route_id, stop_name, latitude, longitude, stop_order) VALUES
    (r_uv, 'Imus Centrum', 14.4300, 120.9410, 1),
    (r_uv, 'District Imus', 14.3800, 120.9430, 2),
    (r_uv, 'Dasmariñas Burol', 14.3275, 120.9460, 3);

    -- B-01
    INSERT INTO public.route_stops (route_id, stop_name, latitude, longitude, stop_order) VALUES
    (r_bus, 'Bacoor Terminal', 14.4600, 120.9500, 1),
    (r_bus, 'PITX', 14.5300, 120.9800, 2),
    (r_bus, 'Mall of Asia Terminal', 14.5323, 120.9822, 3);

    -- T-01
    INSERT INTO public.route_stops (route_id, stop_name, latitude, longitude, stop_order) VALUES
    (r_tricycle, 'Imus Public Market', 14.4260, 120.9415, 1),
    (r_tricycle, 'Gahak', 14.4350, 120.9200, 2),
    (r_tricycle, 'Kawit Poblacion', 14.4468, 120.9026, 3);

    -- J-02
    INSERT INTO public.route_stops (route_id, stop_name, latitude, longitude, stop_order) VALUES
    (r_jeep2, 'Dasmariñas Terminal', 14.3200, 120.9400, 1),
    (r_jeep2, 'Salitran', 14.3500, 120.9420, 2),
    (r_jeep2, 'Anabu', 14.3900, 120.9450, 3),
    (r_jeep2, 'Imus Crossing', 14.4251, 120.9404, 4);
END $$;
