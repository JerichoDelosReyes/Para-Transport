-- Add JSONB array columns to users table to support local state syncing
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS commute_history JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS saved_routes JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS saved_places JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS badges JSONB DEFAULT '[]'::jsonb;

-- Trigger a schema cache reload so the API picks up the new columns immediately
NOTIFY pgrst, 'reload schema';
