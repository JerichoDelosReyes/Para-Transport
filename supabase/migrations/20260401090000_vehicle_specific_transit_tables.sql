-- Vehicle-specific transit schema (jeepney, bus, tricycle, uv_express)
-- and cleanup of legacy generic transit rows.

-- Ensure updated_at helper exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Jeepney tables
-- ============================================================
CREATE TABLE IF NOT EXISTS public.jeepney_routes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_relation_id TEXT UNIQUE,
  route_code TEXT UNIQUE,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  from_label TEXT,
  to_label TEXT,
  description TEXT DEFAULT '',
  operator TEXT DEFAULT '',
  network TEXT DEFAULT '',
  fare_base NUMERIC DEFAULT 13,
  status TEXT DEFAULT 'active',
  path_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.jeepney_route_stops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID NOT NULL REFERENCES public.jeepney_routes(id) ON DELETE CASCADE,
  stop_name TEXT NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  stop_order INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(route_id, stop_order)
);

CREATE INDEX IF NOT EXISTS idx_jeepney_route_stops_route_id ON public.jeepney_route_stops(route_id);

DROP TRIGGER IF EXISTS jeepney_routes_updated_at ON public.jeepney_routes;
CREATE TRIGGER jeepney_routes_updated_at
  BEFORE UPDATE ON public.jeepney_routes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Bus tables
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bus_routes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_relation_id TEXT UNIQUE,
  route_code TEXT UNIQUE,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  from_label TEXT,
  to_label TEXT,
  description TEXT DEFAULT '',
  operator TEXT DEFAULT '',
  network TEXT DEFAULT '',
  fare_base NUMERIC DEFAULT 13,
  status TEXT DEFAULT 'active',
  path_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bus_route_stops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID NOT NULL REFERENCES public.bus_routes(id) ON DELETE CASCADE,
  stop_name TEXT NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  stop_order INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(route_id, stop_order)
);

CREATE INDEX IF NOT EXISTS idx_bus_route_stops_route_id ON public.bus_route_stops(route_id);

DROP TRIGGER IF EXISTS bus_routes_updated_at ON public.bus_routes;
CREATE TRIGGER bus_routes_updated_at
  BEFORE UPDATE ON public.bus_routes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Tricycle tables
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tricycle_routes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_relation_id TEXT UNIQUE,
  route_code TEXT UNIQUE,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  from_label TEXT,
  to_label TEXT,
  description TEXT DEFAULT '',
  operator TEXT DEFAULT '',
  network TEXT DEFAULT '',
  fare_base NUMERIC DEFAULT 13,
  status TEXT DEFAULT 'active',
  path_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tricycle_route_stops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID NOT NULL REFERENCES public.tricycle_routes(id) ON DELETE CASCADE,
  stop_name TEXT NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  stop_order INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(route_id, stop_order)
);

CREATE INDEX IF NOT EXISTS idx_tricycle_route_stops_route_id ON public.tricycle_route_stops(route_id);

DROP TRIGGER IF EXISTS tricycle_routes_updated_at ON public.tricycle_routes;
CREATE TRIGGER tricycle_routes_updated_at
  BEFORE UPDATE ON public.tricycle_routes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- UV Express tables
-- ============================================================
CREATE TABLE IF NOT EXISTS public.uv_express_routes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_relation_id TEXT UNIQUE,
  route_code TEXT UNIQUE,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  from_label TEXT,
  to_label TEXT,
  description TEXT DEFAULT '',
  operator TEXT DEFAULT '',
  network TEXT DEFAULT '',
  fare_base NUMERIC DEFAULT 13,
  status TEXT DEFAULT 'active',
  path_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.uv_express_route_stops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID NOT NULL REFERENCES public.uv_express_routes(id) ON DELETE CASCADE,
  stop_name TEXT NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  stop_order INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(route_id, stop_order)
);

CREATE INDEX IF NOT EXISTS idx_uv_express_route_stops_route_id ON public.uv_express_route_stops(route_id);

DROP TRIGGER IF EXISTS uv_express_routes_updated_at ON public.uv_express_routes;
CREATE TRIGGER uv_express_routes_updated_at
  BEFORE UPDATE ON public.uv_express_routes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS + read policies
-- ============================================================
ALTER TABLE public.jeepney_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jeepney_route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bus_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bus_route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tricycle_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tricycle_route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uv_express_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uv_express_route_stops ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'jeepney_routes' AND policyname = 'Public read access on jeepney_routes'
  ) THEN
    CREATE POLICY "Public read access on jeepney_routes" ON public.jeepney_routes FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'jeepney_route_stops' AND policyname = 'Public read access on jeepney_route_stops'
  ) THEN
    CREATE POLICY "Public read access on jeepney_route_stops" ON public.jeepney_route_stops FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bus_routes' AND policyname = 'Public read access on bus_routes'
  ) THEN
    CREATE POLICY "Public read access on bus_routes" ON public.bus_routes FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bus_route_stops' AND policyname = 'Public read access on bus_route_stops'
  ) THEN
    CREATE POLICY "Public read access on bus_route_stops" ON public.bus_route_stops FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tricycle_routes' AND policyname = 'Public read access on tricycle_routes'
  ) THEN
    CREATE POLICY "Public read access on tricycle_routes" ON public.tricycle_routes FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tricycle_route_stops' AND policyname = 'Public read access on tricycle_route_stops'
  ) THEN
    CREATE POLICY "Public read access on tricycle_route_stops" ON public.tricycle_route_stops FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'uv_express_routes' AND policyname = 'Public read access on uv_express_routes'
  ) THEN
    CREATE POLICY "Public read access on uv_express_routes" ON public.uv_express_routes FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'uv_express_route_stops' AND policyname = 'Public read access on uv_express_route_stops'
  ) THEN
    CREATE POLICY "Public read access on uv_express_route_stops" ON public.uv_express_route_stops FOR SELECT USING (true);
  END IF;
END $$;

-- ============================================================
-- Cleanup existing transit rows from legacy generic tables
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'routes'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'route_stops'
  ) THEN
    TRUNCATE TABLE public.route_stops, public.routes RESTART IDENTITY CASCADE;
  END IF;
END $$;
