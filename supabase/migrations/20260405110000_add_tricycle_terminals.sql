CREATE TABLE IF NOT EXISTS public.tricycle_terminals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  city TEXT,
  barangay TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tricycle_terminals_status ON public.tricycle_terminals (status);
CREATE INDEX IF NOT EXISTS idx_tricycle_terminals_lat_lng ON public.tricycle_terminals (latitude, longitude);

ALTER TABLE public.tricycle_terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active tricycle terminals"
ON public.tricycle_terminals
FOR SELECT TO anon, authenticated
USING (status = 'active');

CREATE OR REPLACE FUNCTION public.update_tricycle_terminals_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tricycle_terminals_updated_at ON public.tricycle_terminals;
CREATE TRIGGER trg_tricycle_terminals_updated_at
BEFORE UPDATE ON public.tricycle_terminals
FOR EACH ROW
EXECUTE FUNCTION public.update_tricycle_terminals_updated_at();
