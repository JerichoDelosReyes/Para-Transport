-- Route schema enhancements: add missing columns, unique constraint, indexes

-- Add missing columns to routes table
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS operator TEXT DEFAULT '';
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- Unique constraint on route_code to prevent duplicate imports
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routes_route_code_unique') THEN
    ALTER TABLE public.routes ADD CONSTRAINT routes_route_code_unique UNIQUE (route_code);
  END IF;
END $$;

-- Index on route_stops.route_id for faster joins
CREATE INDEX IF NOT EXISTS idx_route_stops_route_id ON public.route_stops (route_id);

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS routes_updated_at ON public.routes;
CREATE TRIGGER routes_updated_at
  BEFORE UPDATE ON public.routes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
