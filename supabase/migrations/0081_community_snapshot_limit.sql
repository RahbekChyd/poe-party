-- Raise Community retained raw snapshots while keeping internal billing identifiers stable.
-- Community: 5 retained completed raw snapshots across all groups
-- Supporter: 15 retained completed raw snapshots across all groups

CREATE OR REPLACE FUNCTION public.get_snapshot_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN u.subscription_tier = 'pro'
          AND (u.subscription_expires_at IS NULL OR u.subscription_expires_at > now())
          THEN 15
        ELSE 5
      END
      FROM public.users u
      WHERE u.id = p_user_id
    ),
    5
  );
$$;
