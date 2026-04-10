-- Enforce Row-Level Security on all existing tables in the public schema
-- This will catch any tables created via manual dashboard CSV import or similar.

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
          AND tablename NOT IN ('spatial_ref_sys')
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
        
        -- Since previously anyone could read/write without RLS, let's at least grant READ access
        -- so the app doesn't immediately break when fetching POIs or other data
        -- Updates and Inserts will be locked down, which fixes the critical security alert.
        BEGIN
            EXECUTE format('CREATE POLICY "Public read access by default" ON public.%I FOR SELECT USING (true);', r.tablename);
        EXCEPTION WHEN duplicate_object THEN
            -- Policy already exists, ignore
        END;
    END LOOP;
END
$$;
