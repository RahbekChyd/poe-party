-- Migration: Drop deprecated strategy columns
--
-- map_name, map_tier, cost_per_map_chaos were replaced in 0010 by
-- map_trade_link, map_requirements, and map_cost (0016).
-- These columns are no longer read or written anywhere in the app.

ALTER TABLE public.strategies
  DROP COLUMN IF EXISTS map_name,
  DROP COLUMN IF EXISTS map_tier,
  DROP COLUMN IF EXISTS cost_per_map_chaos;
