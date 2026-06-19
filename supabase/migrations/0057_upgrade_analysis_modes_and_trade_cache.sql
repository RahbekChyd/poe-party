ALTER TABLE public.upgrade_analysis_runs
  ADD COLUMN IF NOT EXISTS analysis_mode TEXT NOT NULL DEFAULT 'quick';

ALTER TABLE public.upgrade_analysis_runs
  DROP CONSTRAINT IF EXISTS upgrade_analysis_runs_analysis_mode_check;

ALTER TABLE public.upgrade_analysis_runs
  ADD CONSTRAINT upgrade_analysis_runs_analysis_mode_check
  CHECK (analysis_mode IN ('quick', 'thorough'));

CREATE TABLE IF NOT EXISTS public.upgrade_market_search_cache (
  cache_key     TEXT PRIMARY KEY,
  league        TEXT NOT NULL,
  cache_scope   TEXT NOT NULL DEFAULT 'rare_candidates',
  item_count    INTEGER NOT NULL DEFAULT 0,
  result_items  JSONB NOT NULL DEFAULT '[]'::jsonb,
  diagnostics   JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS upgrade_market_search_cache_league_scope_idx
  ON public.upgrade_market_search_cache(league, cache_scope, expires_at DESC);

DROP TRIGGER IF EXISTS upgrade_market_search_cache_updated_at ON public.upgrade_market_search_cache;
CREATE TRIGGER upgrade_market_search_cache_updated_at
  BEFORE UPDATE ON public.upgrade_market_search_cache
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.upgrade_market_search_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "upgrade_market_search_cache_select_service" ON public.upgrade_market_search_cache;
CREATE POLICY "upgrade_market_search_cache_select_service"
  ON public.upgrade_market_search_cache FOR SELECT TO service_role
  USING (true);

DROP POLICY IF EXISTS "upgrade_market_search_cache_insert_service" ON public.upgrade_market_search_cache;
CREATE POLICY "upgrade_market_search_cache_insert_service"
  ON public.upgrade_market_search_cache FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "upgrade_market_search_cache_update_service" ON public.upgrade_market_search_cache;
CREATE POLICY "upgrade_market_search_cache_update_service"
  ON public.upgrade_market_search_cache FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "upgrade_market_search_cache_delete_service" ON public.upgrade_market_search_cache;
CREATE POLICY "upgrade_market_search_cache_delete_service"
  ON public.upgrade_market_search_cache FOR DELETE TO service_role
  USING (true);

CREATE TABLE IF NOT EXISTS public.upgrade_trade_rate_limits (
  league          TEXT NOT NULL,
  scope           TEXT NOT NULL,
  retry_at        TIMESTAMPTZ NOT NULL,
  retry_after_ms  INTEGER,
  detail          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (league, scope)
);

CREATE INDEX IF NOT EXISTS upgrade_trade_rate_limits_retry_idx
  ON public.upgrade_trade_rate_limits(retry_at DESC);

DROP TRIGGER IF EXISTS upgrade_trade_rate_limits_updated_at ON public.upgrade_trade_rate_limits;
CREATE TRIGGER upgrade_trade_rate_limits_updated_at
  BEFORE UPDATE ON public.upgrade_trade_rate_limits
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.upgrade_trade_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "upgrade_trade_rate_limits_select_service" ON public.upgrade_trade_rate_limits;
CREATE POLICY "upgrade_trade_rate_limits_select_service"
  ON public.upgrade_trade_rate_limits FOR SELECT TO service_role
  USING (true);

DROP POLICY IF EXISTS "upgrade_trade_rate_limits_insert_service" ON public.upgrade_trade_rate_limits;
CREATE POLICY "upgrade_trade_rate_limits_insert_service"
  ON public.upgrade_trade_rate_limits FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "upgrade_trade_rate_limits_update_service" ON public.upgrade_trade_rate_limits;
CREATE POLICY "upgrade_trade_rate_limits_update_service"
  ON public.upgrade_trade_rate_limits FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "upgrade_trade_rate_limits_delete_service" ON public.upgrade_trade_rate_limits;
CREATE POLICY "upgrade_trade_rate_limits_delete_service"
  ON public.upgrade_trade_rate_limits FOR DELETE TO service_role
  USING (true);
