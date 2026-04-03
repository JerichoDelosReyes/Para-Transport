-- Backfill usernames from auth.users metadata into public.users
UPDATE public.users u
SET username = au.raw_user_meta_data->>'username'
FROM auth.users au
WHERE u.id = au.id::text AND u.username IS NULL AND au.raw_user_meta_data->>'username' IS NOT NULL;
