CREATE OR REPLACE FUNCTION get_top_leaderboard(limit_val INT DEFAULT 3)
RETURNS TABLE(id TEXT, username TEXT, full_name TEXT, points INT)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, username, display_name AS full_name, points
  FROM public.users
  WHERE email != 'guest@para.ph' OR email IS NULL
  ORDER BY points DESC, id ASC
  LIMIT limit_val;
$$;

CREATE OR REPLACE FUNCTION get_user_global_rank(target_user_id TEXT, target_points INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  higher_score_count INT;
  tie_breaker_count INT;
BEGIN
  SELECT COUNT(*) INTO higher_score_count 
  FROM public.users 
  WHERE points > target_points AND (email != 'guest@para.ph' OR email IS NULL);

  SELECT COUNT(*) INTO tie_breaker_count 
  FROM public.users 
  WHERE points = target_points AND id < target_user_id AND (email != 'guest@para.ph' OR email IS NULL);

  RETURN higher_score_count + tie_breaker_count + 1;
END;
$$;
