-- Enable RLS on spatial_ref_sys to resolve security warning (ignore if not table owner)
DO $$
BEGIN
  ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping spatial_ref_sys RLS: %', SQLERRM;
END;
$$;

