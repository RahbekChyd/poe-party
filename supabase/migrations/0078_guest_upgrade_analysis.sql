-- Guest upgrade analysis queue and results.
-- Guest rows are service-role only; browsers can read/write only through token-scoped Edge Functions.

CREATE TABLE public.guest_upgrade_analysis_runs (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_token_hash             TEXT NOT NULL UNIQUE,
  normalized_account_name    TEXT NOT NULL,
  account_name               TEXT NOT NULL,
  ip_hash                    TEXT,
  character_name             TEXT NOT NULL,
  character_class            TEXT,
  character_ascendancy_class INTEGER,
  character_league           TEXT,
  character_level            INTEGER,
  realm                      TEXT NOT NULL DEFAULT 'pc',
  target_name                TEXT NOT NULL DEFAULT 'Imported PoB',
  source_kind                TEXT NOT NULL DEFAULT 'pob_share_code'
                               CHECK (source_kind IN ('pob_share_code', 'pob_xml', 'legacy_pob_code')),
  raw_import                 TEXT NOT NULL,
  raw_xml                    TEXT,
  import_metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_stage               JSONB NOT NULL DEFAULT '{}'::jsonb,
  character_profile          JSONB NOT NULL DEFAULT '{}'::jsonb,
  budget_chaos               NUMERIC(14, 4) NOT NULL DEFAULT 0,
  analysis_mode              TEXT NOT NULL DEFAULT 'quick'
                               CHECK (analysis_mode IN ('quick', 'thorough')),
  search_constraints         JSONB NOT NULL DEFAULT '{}'::jsonb,
  party_config               JSONB NOT NULL DEFAULT '[]'::jsonb,
  input_hash                 TEXT NOT NULL,
  status                     TEXT NOT NULL DEFAULT 'queued'
                               CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed', 'stale')),
  stale_reason               TEXT,
  partial_reason             TEXT,
  error_detail               TEXT,
  summary                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at                 TIMESTAMPTZ,
  completed_at               TIMESTAMPTZ,
  expires_at                 TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX guest_upgrade_analysis_runs_status_idx
  ON public.guest_upgrade_analysis_runs(status, created_at ASC)
  WHERE status IN ('queued', 'running');

CREATE INDEX guest_upgrade_analysis_runs_account_created_idx
  ON public.guest_upgrade_analysis_runs(normalized_account_name, created_at DESC);

CREATE INDEX guest_upgrade_analysis_runs_expires_idx
  ON public.guest_upgrade_analysis_runs(expires_at);

CREATE TRIGGER guest_upgrade_analysis_runs_updated_at
  BEFORE UPDATE ON public.guest_upgrade_analysis_runs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.guest_upgrade_analysis_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guest_upgrade_analysis_runs_service_all"
  ON public.guest_upgrade_analysis_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE public.guest_upgrade_recommendation_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                UUID NOT NULL REFERENCES public.guest_upgrade_analysis_runs(id) ON DELETE CASCADE,
  category              TEXT NOT NULL
                          CHECK (category IN ('unlock_next_stage', 'best_single', 'owned_now')),
  kind                  TEXT NOT NULL CHECK (kind IN ('single', 'bundle')),
  title                 TEXT NOT NULL DEFAULT '',
  summary               TEXT,
  explanation           TEXT,
  effective_cost_chaos  NUMERIC(14, 4) NOT NULL DEFAULT 0,
  ask_price_chaos       NUMERIC(14, 4),
  score                 NUMERIC(14, 6) NOT NULL DEFAULT 0,
  stage_progress_score  NUMERIC(14, 6) NOT NULL DEFAULT 0,
  ranking_reason        JSONB NOT NULL DEFAULT '{}'::jsonb,
  before_metrics        JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_metrics         JSONB NOT NULL DEFAULT '{}'::jsonb,
  breaks_requirements   BOOLEAN NOT NULL DEFAULT false,
  section               TEXT NOT NULL DEFAULT 'primary'
                          CHECK (section IN ('primary', 'overview')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX guest_upgrade_recommendation_plans_run_idx
  ON public.guest_upgrade_recommendation_plans(run_id, section ASC, score DESC, created_at ASC);

ALTER TABLE public.guest_upgrade_recommendation_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guest_upgrade_recommendation_plans_service_all"
  ON public.guest_upgrade_recommendation_plans FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE public.guest_upgrade_recommendation_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id               UUID NOT NULL REFERENCES public.guest_upgrade_recommendation_plans(id) ON DELETE CASCADE,
  run_id                UUID NOT NULL REFERENCES public.guest_upgrade_analysis_runs(id) ON DELETE CASCADE,
  slot                  TEXT,
  source                TEXT NOT NULL CHECK (source IN ('owned', 'market', 'compare')),
  item_name             TEXT,
  item_payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
  trade_link            TEXT,
  ask_price_chaos       NUMERIC(14, 4),
  effective_price_chaos NUMERIC(14, 4) NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX guest_upgrade_recommendation_items_plan_idx
  ON public.guest_upgrade_recommendation_items(plan_id, created_at ASC);

ALTER TABLE public.guest_upgrade_recommendation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guest_upgrade_recommendation_items_service_all"
  ON public.guest_upgrade_recommendation_items FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE public.guest_upgrade_analysis_daily_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_date    DATE NOT NULL,
  limiter_kind  TEXT NOT NULL CHECK (limiter_kind IN ('account', 'ip')),
  limiter_key   TEXT NOT NULL,
  queued_count  INTEGER NOT NULL DEFAULT 0 CHECK (queued_count >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT guest_upgrade_analysis_daily_usage_unique
    UNIQUE (usage_date, limiter_kind, limiter_key)
);

CREATE INDEX guest_upgrade_analysis_daily_usage_kind_idx
  ON public.guest_upgrade_analysis_daily_usage(limiter_kind, usage_date);

CREATE TRIGGER guest_upgrade_analysis_daily_usage_updated_at
  BEFORE UPDATE ON public.guest_upgrade_analysis_daily_usage
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.guest_upgrade_analysis_daily_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guest_upgrade_analysis_daily_usage_service_all"
  ON public.guest_upgrade_analysis_daily_usage FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.claim_guest_upgrade_analysis_daily_usage(
  p_usage_date DATE,
  p_normalized_account_name TEXT,
  p_ip_hash TEXT,
  p_account_limit INTEGER DEFAULT 1,
  p_ip_limit INTEGER DEFAULT 20
)
RETURNS TABLE(allowed BOOLEAN, limiter_kind TEXT, queued_count INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_count INTEGER;
  v_ip_count INTEGER;
  v_reset_at TIMESTAMPTZ := ((p_usage_date::timestamp + interval '1 day') AT TIME ZONE 'UTC');
BEGIN
  IF p_normalized_account_name IS NULL OR btrim(p_normalized_account_name) = '' THEN
    RAISE EXCEPTION 'normalized account name is required';
  END IF;

  INSERT INTO public.guest_upgrade_analysis_daily_usage(usage_date, limiter_kind, limiter_key, queued_count)
  VALUES (p_usage_date, 'account', p_normalized_account_name, 0)
  ON CONFLICT ON CONSTRAINT guest_upgrade_analysis_daily_usage_unique DO NOTHING;

  SELECT usage.queued_count
  INTO v_account_count
  FROM public.guest_upgrade_analysis_daily_usage usage
  WHERE usage.usage_date = p_usage_date
    AND usage.limiter_kind = 'account'
    AND usage.limiter_key = p_normalized_account_name
  FOR UPDATE;

  IF COALESCE(v_account_count, 0) >= p_account_limit THEN
    RETURN QUERY SELECT false, 'account'::TEXT, COALESCE(v_account_count, 0), v_reset_at;
    RETURN;
  END IF;

  IF p_ip_hash IS NOT NULL AND btrim(p_ip_hash) <> '' THEN
    INSERT INTO public.guest_upgrade_analysis_daily_usage(usage_date, limiter_kind, limiter_key, queued_count)
    VALUES (p_usage_date, 'ip', p_ip_hash, 0)
    ON CONFLICT ON CONSTRAINT guest_upgrade_analysis_daily_usage_unique DO NOTHING;

    SELECT usage.queued_count
    INTO v_ip_count
    FROM public.guest_upgrade_analysis_daily_usage usage
    WHERE usage.usage_date = p_usage_date
      AND usage.limiter_kind = 'ip'
      AND usage.limiter_key = p_ip_hash
    FOR UPDATE;

    IF COALESCE(v_ip_count, 0) >= p_ip_limit THEN
      RETURN QUERY SELECT false, 'ip'::TEXT, COALESCE(v_ip_count, 0), v_reset_at;
      RETURN;
    END IF;
  END IF;

  UPDATE public.guest_upgrade_analysis_daily_usage
  SET queued_count = guest_upgrade_analysis_daily_usage.queued_count + 1
  WHERE guest_upgrade_analysis_daily_usage.usage_date = p_usage_date
    AND guest_upgrade_analysis_daily_usage.limiter_kind = 'account'
    AND guest_upgrade_analysis_daily_usage.limiter_key = p_normalized_account_name
  RETURNING guest_upgrade_analysis_daily_usage.queued_count INTO v_account_count;

  IF p_ip_hash IS NOT NULL AND btrim(p_ip_hash) <> '' THEN
    UPDATE public.guest_upgrade_analysis_daily_usage
    SET queued_count = guest_upgrade_analysis_daily_usage.queued_count + 1
    WHERE guest_upgrade_analysis_daily_usage.usage_date = p_usage_date
      AND guest_upgrade_analysis_daily_usage.limiter_kind = 'ip'
      AND guest_upgrade_analysis_daily_usage.limiter_key = p_ip_hash;
  END IF;

  RETURN QUERY SELECT true, 'none'::TEXT, v_account_count, v_reset_at;
END;
$$;

REVOKE ALL ON TABLE public.guest_upgrade_analysis_runs FROM anon, authenticated;
REVOKE ALL ON TABLE public.guest_upgrade_recommendation_plans FROM anon, authenticated;
REVOKE ALL ON TABLE public.guest_upgrade_recommendation_items FROM anon, authenticated;
REVOKE ALL ON TABLE public.guest_upgrade_analysis_daily_usage FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_guest_upgrade_analysis_daily_usage(DATE, TEXT, TEXT, INTEGER, INTEGER) FROM anon, authenticated;

GRANT ALL ON TABLE public.guest_upgrade_analysis_runs TO service_role;
GRANT ALL ON TABLE public.guest_upgrade_recommendation_plans TO service_role;
GRANT ALL ON TABLE public.guest_upgrade_recommendation_items TO service_role;
GRANT ALL ON TABLE public.guest_upgrade_analysis_daily_usage TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_guest_upgrade_analysis_daily_usage(DATE, TEXT, TEXT, INTEGER, INTEGER) TO service_role;
