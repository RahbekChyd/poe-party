-- Migration: Increase retained snapshot history per subscription tier
-- Free tier: 3 snapshots retained total across all groups
-- Pro tier:  15 snapshots retained total across all groups

CREATE OR REPLACE FUNCTION public.get_snapshot_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT CASE subscription_tier
    WHEN 'pro' THEN 15
    ELSE 3
  END
  FROM public.users WHERE id = p_user_id;
$$;
