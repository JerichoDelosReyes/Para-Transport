ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS path_data JSONB DEFAULT '[]'::jsonb;
