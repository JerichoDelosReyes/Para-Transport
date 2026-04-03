-- Backfill display_name from auth.users metadata into public.users if missing
UPDATE public.users u
SET display_name = au.raw_user_meta_data->>'display_name'
FROM auth.users au
WHERE u.id = au.id::text AND u.display_name IS NULL AND au.raw_user_meta_data->>'display_name' IS NOT NULL;

-- Also try to backfill from 'full_name' if display_name was null
UPDATE public.users u
SET display_name = au.raw_user_meta_data->>'full_name'
FROM auth.users au
WHERE u.id = au.id::text AND u.display_name IS NULL AND au.raw_user_meta_data->>'full_name' IS NOT NULL;
