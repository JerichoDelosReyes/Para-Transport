DROP FUNCTION IF EXISTS get_top_leaderboard(INT);

CREATE OR REPLACE FUNCTION get_top_leaderboard(limit_val INT DEFAULT 3)
RETURNS TABLE(id TEXT, username TEXT, full_name TEXT, points INT)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, username, username AS full_name, points
  FROM public.users
  WHERE (email != 'guest@para.ph' OR email IS NULL) AND points > 0
  ORDER BY points DESC, id ASC
  LIMIT limit_val;
$$;

UPDATE public.users u
SET 
  username = COALESCE(u.username, au.raw_user_meta_data->>'username'),
  display_name = COALESCE(u.display_name, au.raw_user_meta_data->>'display_name', au.raw_user_meta_data->>'full_name'),
  full_name = COALESCE(u.full_name, au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'display_name')
FROM auth.users au
WHERE u.id = au.id::text;
