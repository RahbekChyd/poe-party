-- Persistent cache for the PoE trade API stats schema (`/api/trade/data/stats`).
-- The optimizer worker reads this on cold start so a single 403 from GGG's
-- Cloudflare layer no longer disables every analysis run for hours.
-- The schema is effectively static between league launches, so a stale-but-
-- usable copy is always preferable to a hard failure.

CREATE TABLE public.poe_trade_stats_cache (
  id          TEXT PRIMARY KEY DEFAULT 'default',
  payload     JSONB NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT  poe_trade_stats_cache_singleton CHECK (id = 'default')
);

ALTER TABLE public.poe_trade_stats_cache ENABLE ROW LEVEL SECURITY;

-- Worker-only table; only the service role reads or writes it.
CREATE POLICY "poe_trade_stats_cache_service_all"
  ON public.poe_trade_stats_cache FOR ALL TO service_role
  USING (true) WITH CHECK (true);
