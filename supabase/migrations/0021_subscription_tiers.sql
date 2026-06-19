-- Migration: Add subscription tiers to users
-- Free tier: 1 snapshot retained total across all groups
-- Pro tier:  10 snapshots retained total across all groups

CREATE TYPE public.subscription_tier AS ENUM ('free', 'pro');

ALTER TABLE public.users
  ADD COLUMN subscription_tier public.subscription_tier NOT NULL DEFAULT 'free',
  ADD COLUMN subscription_expires_at TIMESTAMPTZ;

-- Returns the snapshot retention limit for a given user based on their tier.
-- Called by the retention trigger (0022) to determine how many completed
-- snapshots to keep when a new one is marked completed.
CREATE OR REPLACE FUNCTION public.get_snapshot_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT CASE subscription_tier
    WHEN 'pro' THEN 10
    ELSE 1
  END
  FROM public.users WHERE id = p_user_id;
$$;
