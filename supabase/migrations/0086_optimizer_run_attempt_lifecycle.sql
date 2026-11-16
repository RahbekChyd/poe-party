-- Retryable optimizer attempt ownership and transactional result persistence.
-- Both authenticated and guest workers use the same service-role-only RPC contract.

ALTER TABLE public.upgrade_analysis_runs
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retry_not_before TIMESTAMPTZ;

ALTER TABLE public.guest_upgrade_analysis_runs
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retry_not_before TIMESTAMPTZ;

ALTER TABLE public.upgrade_analysis_runs
  DROP CONSTRAINT IF EXISTS upgrade_analysis_runs_attempt_number_check,
  DROP CONSTRAINT IF EXISTS upgrade_analysis_runs_max_attempts_check,
  DROP CONSTRAINT IF EXISTS upgrade_analysis_runs_status_check;
ALTER TABLE public.upgrade_analysis_runs
  ADD CONSTRAINT upgrade_analysis_runs_attempt_number_check CHECK (attempt_number >= 0),
  ADD CONSTRAINT upgrade_analysis_runs_max_attempts_check CHECK (max_attempts BETWEEN 1 AND 10),
  ADD CONSTRAINT upgrade_analysis_runs_status_check
    CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed', 'stale', 'cancelled'));

ALTER TABLE public.guest_upgrade_analysis_runs
  DROP CONSTRAINT IF EXISTS guest_upgrade_analysis_runs_attempt_number_check,
  DROP CONSTRAINT IF EXISTS guest_upgrade_analysis_runs_max_attempts_check,
  DROP CONSTRAINT IF EXISTS guest_upgrade_analysis_runs_status_check;
ALTER TABLE public.guest_upgrade_analysis_runs
  ADD CONSTRAINT guest_upgrade_analysis_runs_attempt_number_check CHECK (attempt_number >= 0),
  ADD CONSTRAINT guest_upgrade_analysis_runs_max_attempts_check CHECK (max_attempts BETWEEN 1 AND 10),
  ADD CONSTRAINT guest_upgrade_analysis_runs_status_check
    CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed', 'stale', 'cancelled'));

CREATE INDEX IF NOT EXISTS upgrade_analysis_runs_lease_idx
  ON public.upgrade_analysis_runs(status, lease_expires_at)
  WHERE status = 'running';
CREATE INDEX IF NOT EXISTS guest_upgrade_analysis_runs_lease_idx
  ON public.guest_upgrade_analysis_runs(status, lease_expires_at)
  WHERE status = 'running';

CREATE TABLE public.optimizer_run_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upgrade_run_id UUID REFERENCES public.upgrade_analysis_runs(id) ON DELETE CASCADE,
  guest_run_id UUID REFERENCES public.guest_upgrade_analysis_runs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  lease_owner TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'waiting', 'completed', 'failed', 'abandoned')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_expires_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  error_detail TEXT,
  CONSTRAINT optimizer_run_attempts_one_run_check
    CHECK (num_nonnulls(upgrade_run_id, guest_run_id) = 1)
);

CREATE UNIQUE INDEX optimizer_run_attempts_upgrade_number_key
  ON public.optimizer_run_attempts(upgrade_run_id, attempt_number)
  WHERE upgrade_run_id IS NOT NULL;
CREATE UNIQUE INDEX optimizer_run_attempts_guest_number_key
  ON public.optimizer_run_attempts(guest_run_id, attempt_number)
  WHERE guest_run_id IS NOT NULL;
CREATE INDEX optimizer_run_attempts_active_lease_idx
  ON public.optimizer_run_attempts(status, lease_expires_at)
  WHERE status IN ('running', 'waiting');

ALTER TABLE public.optimizer_run_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.optimizer_run_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.optimizer_run_attempts TO service_role;
CREATE POLICY "optimizer_run_attempts_service_all"
  ON public.optimizer_run_attempts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.cleanup_optimizer_terminal_attempt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt_fk TEXT;
BEGIN
  IF NEW.status IN ('stale', 'cancelled')
     AND OLD.status = 'running'
     AND OLD.attempt_number > 0 THEN
    v_attempt_fk := CASE
      WHEN TG_TABLE_NAME = 'upgrade_analysis_runs' THEN 'upgrade_run_id'
      WHEN TG_TABLE_NAME = 'guest_upgrade_analysis_runs' THEN 'guest_run_id'
      ELSE NULL
    END;
    IF v_attempt_fk IS NOT NULL THEN
      EXECUTE format(
        'UPDATE public.optimizer_run_attempts
           SET status = ''abandoned'', ended_at = now(), lease_expires_at = NULL,
               error_detail = COALESCE(error_detail, $4)
         WHERE %I = $1 AND attempt_number = $2 AND ($3 IS NULL OR lease_owner = $3)
           AND status IN (''running'', ''waiting'')',
        v_attempt_fk
      ) USING OLD.id, OLD.attempt_number, OLD.lease_owner, 'Run became ' || NEW.status;
    END IF;
    NEW.lease_owner := NULL;
    NEW.lease_expires_at := NULL;
    NEW.last_heartbeat_at := now();
    NEW.retry_not_before := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_optimizer_terminal_attempt
  ON public.upgrade_analysis_runs;
CREATE TRIGGER cleanup_optimizer_terminal_attempt
  BEFORE UPDATE OF status ON public.upgrade_analysis_runs
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_optimizer_terminal_attempt();
DROP TRIGGER IF EXISTS cleanup_optimizer_terminal_attempt
  ON public.guest_upgrade_analysis_runs;
CREATE TRIGGER cleanup_optimizer_terminal_attempt
  BEFORE UPDATE OF status ON public.guest_upgrade_analysis_runs
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_optimizer_terminal_attempt();

REVOKE ALL ON FUNCTION public.cleanup_optimizer_terminal_attempt() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_optimizer_terminal_attempt() TO service_role;

CREATE OR REPLACE FUNCTION public.claim_optimizer_run_attempt(
  p_run_kind TEXT,
  p_run_id UUID,
  p_lease_owner TEXT,
  p_lease_seconds INTEGER DEFAULT 180,
  p_resume_waiting BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_table TEXT;
  v_attempt_fk TEXT;
  v_run JSONB;
  v_now TIMESTAMPTZ := now();
  v_lease INTERVAL;
  v_status TEXT;
  v_attempt INTEGER;
  v_max_attempts INTEGER;
  v_next_attempt INTEGER;
  v_waiting BOOLEAN;
  v_retry_at TIMESTAMPTZ;
  v_summary JSONB;
  v_reason TEXT;
BEGIN
  IF p_run_kind = 'upgrade_analysis' THEN
    v_run_table := 'upgrade_analysis_runs';
    v_attempt_fk := 'upgrade_run_id';
  ELSIF p_run_kind = 'guest_upgrade_analysis' THEN
    v_run_table := 'guest_upgrade_analysis_runs';
    v_attempt_fk := 'guest_run_id';
  ELSE
    RAISE EXCEPTION 'Unsupported optimizer run kind';
  END IF;

  IF p_lease_owner IS NULL OR length(btrim(p_lease_owner)) < 8 OR length(p_lease_owner) > 200 THEN
    RAISE EXCEPTION 'Invalid optimizer lease owner';
  END IF;
  IF p_lease_seconds < 30 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'Optimizer lease seconds must be between 30 and 3600';
  END IF;
  v_lease := make_interval(secs => p_lease_seconds);

  EXECUTE format(
    'SELECT to_jsonb(run) FROM public.%I run WHERE run.id = $1 FOR UPDATE',
    v_run_table
  ) INTO v_run USING p_run_id;

  IF v_run IS NULL THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_found');
  END IF;

  v_status := v_run->>'status';
  v_attempt := COALESCE((v_run->>'attempt_number')::INTEGER, 0);
  v_max_attempts := COALESCE((v_run->>'max_attempts')::INTEGER, 3);
  v_summary := COALESCE(v_run->'summary', '{}'::JSONB);
  v_waiting := COALESCE((v_summary#>>'{rare_trade_search,waiting_for_retry}')::BOOLEAN, false);

  IF v_status = 'queued' THEN
    IF NULLIF(v_run->>'retry_not_before', '')::TIMESTAMPTZ > v_now THEN
      RETURN jsonb_build_object(
        'claimed', false,
        'reason', 'retry_backoff',
        'retry_not_before', v_run->>'retry_not_before'
      );
    END IF;
    IF v_attempt >= v_max_attempts THEN
      EXECUTE format(
        'UPDATE public.%I SET status = ''failed'', error_detail = COALESCE(error_detail, ''Maximum optimizer attempts exhausted''), completed_at = $2, lease_owner = NULL, lease_expires_at = NULL WHERE id = $1',
        v_run_table
      ) USING p_run_id, v_now;
      RETURN jsonb_build_object('claimed', false, 'reason', 'attempts_exhausted');
    END IF;
    v_next_attempt := v_attempt + 1;
    v_reason := CASE WHEN v_attempt = 0 THEN 'claimed' ELSE 'retry_claimed' END;
  ELSIF v_status = 'running' AND v_waiting THEN
    IF NOT p_resume_waiting THEN
      RETURN jsonb_build_object('claimed', false, 'reason', 'waiting_for_retry');
    END IF;
    BEGIN
      v_retry_at := NULLIF(v_summary#>>'{rare_trade_search,retry_at}', '')::TIMESTAMPTZ;
    EXCEPTION WHEN OTHERS THEN
      v_retry_at := NULL;
    END;
    IF v_retry_at IS NULL OR v_retry_at > v_now THEN
      RETURN jsonb_build_object('claimed', false, 'reason', 'retry_not_due');
    END IF;
    v_next_attempt := GREATEST(v_attempt, 1);
    v_reason := 'waiting_resumed';
    v_summary := jsonb_set(
      v_summary,
      '{rare_trade_search}',
      COALESCE(v_summary->'rare_trade_search', '{}'::JSONB)
        || '{"waiting_for_retry":false,"retry_at":null,"retry_after_ms":null}'::JSONB,
      true
    ) || '{"rare_trade_rate_limited":false}'::JSONB;
  ELSIF v_status = 'running' THEN
    IF NULLIF(v_run->>'lease_expires_at', '')::TIMESTAMPTZ > v_now THEN
      RETURN jsonb_build_object('claimed', false, 'reason', 'lease_active');
    END IF;
    IF v_attempt >= v_max_attempts THEN
      EXECUTE format(
        'UPDATE public.%I SET status = ''failed'', error_detail = COALESCE(error_detail, ''Maximum optimizer attempts exhausted''), completed_at = $2, lease_owner = NULL, lease_expires_at = NULL WHERE id = $1',
        v_run_table
      ) USING p_run_id, v_now;
      EXECUTE format(
        'UPDATE public.optimizer_run_attempts SET status = ''abandoned'', ended_at = $3, lease_expires_at = NULL, error_detail = COALESCE(error_detail, ''Lease expired'') WHERE %I = $1 AND attempt_number = $2 AND status IN (''running'', ''waiting'')',
        v_attempt_fk
      ) USING p_run_id, v_attempt, v_now;
      RETURN jsonb_build_object('claimed', false, 'reason', 'attempts_exhausted');
    END IF;
    EXECUTE format(
      'UPDATE public.optimizer_run_attempts SET status = ''abandoned'', ended_at = $3, lease_expires_at = NULL, error_detail = COALESCE(error_detail, ''Lease expired'') WHERE %I = $1 AND attempt_number = $2 AND status IN (''running'', ''waiting'')',
      v_attempt_fk
    ) USING p_run_id, v_attempt, v_now;
    v_next_attempt := v_attempt + 1;
    v_reason := 'lease_reclaimed';
  ELSE
    RETURN jsonb_build_object('claimed', false, 'reason', 'status_' || v_status);
  END IF;

  EXECUTE format(
    'UPDATE public.%I AS run
       SET status = ''running'',
           attempt_number = $2,
           lease_owner = $3,
           lease_expires_at = $4,
           last_heartbeat_at = $5,
           retry_not_before = NULL,
           started_at = CASE WHEN $6 THEN COALESCE(run.started_at, $5) ELSE $5 END,
           completed_at = NULL,
           stale_reason = NULL,
           partial_reason = NULL,
           error_detail = NULL,
           summary = $7
     WHERE run.id = $1
     RETURNING to_jsonb(run)',
    v_run_table
  ) INTO v_run USING
    p_run_id,
    v_next_attempt,
    p_lease_owner,
    v_now + v_lease,
    v_now,
    v_reason = 'waiting_resumed',
    v_summary;

  EXECUTE format(
    'INSERT INTO public.optimizer_run_attempts (
       %I, attempt_number, lease_owner, status, started_at, last_heartbeat_at, lease_expires_at
     ) VALUES ($1, $2, $3, ''running'', $4, $4, $5)
     ON CONFLICT (%I, attempt_number) WHERE %I IS NOT NULL
     DO UPDATE SET
       lease_owner = EXCLUDED.lease_owner,
       status = ''running'',
       last_heartbeat_at = EXCLUDED.last_heartbeat_at,
       lease_expires_at = EXCLUDED.lease_expires_at,
       ended_at = NULL,
       error_detail = NULL',
    v_attempt_fk,
    v_attempt_fk,
    v_attempt_fk
  ) USING p_run_id, v_next_attempt, p_lease_owner, v_now, v_now + v_lease;

  RETURN jsonb_build_object('claimed', true, 'reason', v_reason, 'run', v_run);
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_optimizer_run_attempt(
  p_run_kind TEXT,
  p_run_id UUID,
  p_lease_owner TEXT,
  p_lease_seconds INTEGER DEFAULT 180,
  p_summary JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_table TEXT;
  v_attempt_fk TEXT;
  v_attempt INTEGER;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_run_kind = 'upgrade_analysis' THEN
    v_run_table := 'upgrade_analysis_runs';
    v_attempt_fk := 'upgrade_run_id';
  ELSIF p_run_kind = 'guest_upgrade_analysis' THEN
    v_run_table := 'guest_upgrade_analysis_runs';
    v_attempt_fk := 'guest_run_id';
  ELSE
    RAISE EXCEPTION 'Unsupported optimizer run kind';
  END IF;
  IF p_lease_seconds < 30 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'Optimizer lease seconds must be between 30 and 3600';
  END IF;

  EXECUTE format(
    'UPDATE public.%I AS run
       SET lease_expires_at = $3 + make_interval(secs => $4),
           last_heartbeat_at = $3,
           summary = COALESCE($5, run.summary)
     WHERE run.id = $1
       AND run.status = ''running''
       AND run.lease_owner = $2
     RETURNING run.attempt_number',
    v_run_table
  ) INTO v_attempt USING p_run_id, p_lease_owner, v_now, p_lease_seconds, p_summary;

  IF v_attempt IS NULL THEN
    RETURN false;
  END IF;

  EXECUTE format(
    'UPDATE public.optimizer_run_attempts
       SET last_heartbeat_at = $4,
           lease_expires_at = $4 + make_interval(secs => $5),
           status = ''running''
     WHERE %I = $1 AND attempt_number = $2 AND lease_owner = $3',
    v_attempt_fk
  ) USING p_run_id, v_attempt, p_lease_owner, v_now, p_lease_seconds;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.defer_optimizer_run_attempt(
  p_run_kind TEXT,
  p_run_id UUID,
  p_lease_owner TEXT,
  p_summary JSONB,
  p_partial_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_table TEXT;
  v_attempt_fk TEXT;
  v_attempt INTEGER;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_run_kind = 'upgrade_analysis' THEN
    v_run_table := 'upgrade_analysis_runs';
    v_attempt_fk := 'upgrade_run_id';
  ELSIF p_run_kind = 'guest_upgrade_analysis' THEN
    v_run_table := 'guest_upgrade_analysis_runs';
    v_attempt_fk := 'guest_run_id';
  ELSE
    RAISE EXCEPTION 'Unsupported optimizer run kind';
  END IF;

  EXECUTE format(
    'UPDATE public.%I
       SET summary = $3,
           partial_reason = $4,
           completed_at = NULL,
           error_detail = NULL,
           lease_owner = NULL,
           lease_expires_at = NULL,
           last_heartbeat_at = $5
     WHERE id = $1 AND status = ''running'' AND lease_owner = $2
     RETURNING attempt_number',
    v_run_table
  ) INTO v_attempt USING p_run_id, p_lease_owner, p_summary, p_partial_reason, v_now;

  IF v_attempt IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE format(
    'UPDATE public.optimizer_run_attempts
       SET status = ''waiting'', last_heartbeat_at = $4, lease_expires_at = NULL
     WHERE %I = $1 AND attempt_number = $2 AND lease_owner = $3',
    v_attempt_fk
  ) USING p_run_id, v_attempt, p_lease_owner, v_now;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_optimizer_run_attempt(
  p_run_kind TEXT,
  p_run_id UUID,
  p_lease_owner TEXT,
  p_status TEXT,
  p_summary JSONB,
  p_partial_reason TEXT,
  p_plans JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_table TEXT;
  v_attempt_fk TEXT;
  v_run JSONB;
  v_attempt INTEGER;
  v_plan JSONB;
  v_item JSONB;
  v_plan_id UUID;
  v_now TIMESTAMPTZ := now();
  v_row_count BIGINT;
BEGIN
  IF p_run_kind = 'upgrade_analysis' THEN
    v_run_table := 'upgrade_analysis_runs';
    v_attempt_fk := 'upgrade_run_id';
  ELSIF p_run_kind = 'guest_upgrade_analysis' THEN
    v_run_table := 'guest_upgrade_analysis_runs';
    v_attempt_fk := 'guest_run_id';
  ELSE
    RAISE EXCEPTION 'Unsupported optimizer run kind';
  END IF;
  IF p_status NOT IN ('completed', 'partial') THEN
    RAISE EXCEPTION 'Invalid optimizer completion status';
  END IF;
  IF jsonb_typeof(COALESCE(p_plans, '[]'::JSONB)) <> 'array'
     OR jsonb_array_length(COALESCE(p_plans, '[]'::JSONB)) > 500 THEN
    RAISE EXCEPTION 'Invalid optimizer plans payload';
  END IF;

  EXECUTE format(
    'SELECT to_jsonb(run) FROM public.%I run WHERE run.id = $1 FOR UPDATE',
    v_run_table
  ) INTO v_run USING p_run_id;
  IF v_run IS NULL
     OR v_run->>'status' <> 'running'
     OR v_run->>'lease_owner' IS DISTINCT FROM p_lease_owner THEN
    RETURN false;
  END IF;
  v_attempt := (v_run->>'attempt_number')::INTEGER;

  IF p_run_kind = 'upgrade_analysis' THEN
    DELETE FROM public.upgrade_recommendation_items WHERE run_id = p_run_id;
    DELETE FROM public.upgrade_recommendation_plans WHERE run_id = p_run_id;
  ELSE
    DELETE FROM public.guest_upgrade_recommendation_items WHERE run_id = p_run_id;
    DELETE FROM public.guest_upgrade_recommendation_plans WHERE run_id = p_run_id;
  END IF;

  FOR v_plan IN SELECT value FROM jsonb_array_elements(COALESCE(p_plans, '[]'::JSONB))
  LOOP
    IF jsonb_typeof(COALESCE(v_plan->'items', '[]'::JSONB)) <> 'array'
       OR jsonb_array_length(COALESCE(v_plan->'items', '[]'::JSONB)) > 100 THEN
      RAISE EXCEPTION 'Invalid optimizer recommendation items payload';
    END IF;

    IF p_run_kind = 'upgrade_analysis' THEN
      INSERT INTO public.upgrade_recommendation_plans (
        run_id, group_id, target_user_id, target_stage_id, category, kind, title, summary,
        explanation, effective_cost_chaos, ask_price_chaos, score, stage_progress_score,
        ranking_reason, before_metrics, after_metrics, breaks_requirements, section
      ) VALUES (
        p_run_id,
        (v_run->>'group_id')::UUID,
        (v_run->>'target_user_id')::UUID,
        NULLIF(v_run->>'target_stage_id', '')::UUID,
        v_plan->>'category',
        v_plan->>'kind',
        COALESCE(v_plan->>'title', ''),
        v_plan->>'summary',
        v_plan->>'explanation',
        COALESCE(NULLIF(v_plan->>'effective_cost_chaos', '')::NUMERIC, 0),
        NULLIF(v_plan->>'ask_price_chaos', '')::NUMERIC,
        COALESCE(NULLIF(v_plan->>'score', '')::NUMERIC, 0),
        COALESCE(NULLIF(v_plan->>'stage_progress_score', '')::NUMERIC, 0),
        COALESCE(v_plan->'ranking_reason', '{}'::JSONB),
        COALESCE(v_plan->'before_metrics', '{}'::JSONB),
        COALESCE(v_plan->'after_metrics', '{}'::JSONB),
        COALESCE((v_plan->>'breaks_requirements')::BOOLEAN, false),
        CASE WHEN v_plan->>'section' = 'overview' THEN 'overview' ELSE 'primary' END
      ) RETURNING id INTO v_plan_id;

      FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(v_plan->'items', '[]'::JSONB))
      LOOP
        INSERT INTO public.upgrade_recommendation_items (
          plan_id, run_id, slot, source, item_name, item_payload, trade_link,
          ask_price_chaos, effective_price_chaos
        ) VALUES (
          v_plan_id,
          p_run_id,
          v_item->>'slot',
          v_item->>'source',
          v_item->>'item_name',
          COALESCE(v_item->'item_payload', '{}'::JSONB),
          v_item->>'trade_link',
          NULLIF(v_item->>'ask_price_chaos', '')::NUMERIC,
          COALESCE(NULLIF(v_item->>'effective_price_chaos', '')::NUMERIC, 0)
        );
      END LOOP;
    ELSE
      INSERT INTO public.guest_upgrade_recommendation_plans (
        run_id, category, kind, title, summary, explanation, effective_cost_chaos,
        ask_price_chaos, score, stage_progress_score, ranking_reason, before_metrics,
        after_metrics, breaks_requirements, section
      ) VALUES (
        p_run_id,
        v_plan->>'category',
        v_plan->>'kind',
        COALESCE(v_plan->>'title', ''),
        v_plan->>'summary',
        v_plan->>'explanation',
        COALESCE(NULLIF(v_plan->>'effective_cost_chaos', '')::NUMERIC, 0),
        NULLIF(v_plan->>'ask_price_chaos', '')::NUMERIC,
        COALESCE(NULLIF(v_plan->>'score', '')::NUMERIC, 0),
        COALESCE(NULLIF(v_plan->>'stage_progress_score', '')::NUMERIC, 0),
        COALESCE(v_plan->'ranking_reason', '{}'::JSONB),
        COALESCE(v_plan->'before_metrics', '{}'::JSONB),
        COALESCE(v_plan->'after_metrics', '{}'::JSONB),
        COALESCE((v_plan->>'breaks_requirements')::BOOLEAN, false),
        CASE WHEN v_plan->>'section' = 'overview' THEN 'overview' ELSE 'primary' END
      ) RETURNING id INTO v_plan_id;

      FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(v_plan->'items', '[]'::JSONB))
      LOOP
        INSERT INTO public.guest_upgrade_recommendation_items (
          plan_id, run_id, slot, source, item_name, item_payload, trade_link,
          ask_price_chaos, effective_price_chaos
        ) VALUES (
          v_plan_id,
          p_run_id,
          v_item->>'slot',
          v_item->>'source',
          v_item->>'item_name',
          COALESCE(v_item->'item_payload', '{}'::JSONB),
          v_item->>'trade_link',
          NULLIF(v_item->>'ask_price_chaos', '')::NUMERIC,
          COALESCE(NULLIF(v_item->>'effective_price_chaos', '')::NUMERIC, 0)
        );
      END LOOP;
    END IF;
  END LOOP;

  EXECUTE format(
    'UPDATE public.%I
       SET status = $3,
           summary = COALESCE($4, ''{}''::JSONB),
           partial_reason = $5,
           error_detail = NULL,
           completed_at = $6,
           lease_owner = NULL,
           lease_expires_at = NULL,
           last_heartbeat_at = $6,
           retry_not_before = NULL
     WHERE id = $1 AND status = ''running'' AND lease_owner = $2',
    v_run_table
  ) USING p_run_id, p_lease_owner, p_status, p_summary, p_partial_reason, v_now;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'Optimizer ownership changed during completion';
  END IF;
  EXECUTE format(
    'UPDATE public.optimizer_run_attempts
       SET status = ''completed'', ended_at = $4, last_heartbeat_at = $4, lease_expires_at = NULL
     WHERE %I = $1 AND attempt_number = $2 AND lease_owner = $3',
    v_attempt_fk
  ) USING p_run_id, v_attempt, p_lease_owner, v_now;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_optimizer_run_attempt(
  p_run_kind TEXT,
  p_run_id UUID,
  p_lease_owner TEXT,
  p_error_detail TEXT,
  p_retryable BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_table TEXT;
  v_attempt_fk TEXT;
  v_run JSONB;
  v_attempt INTEGER;
  v_max_attempts INTEGER;
  v_retry BOOLEAN;
  v_next_status TEXT;
  v_retry_not_before TIMESTAMPTZ;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_run_kind = 'upgrade_analysis' THEN
    v_run_table := 'upgrade_analysis_runs';
    v_attempt_fk := 'upgrade_run_id';
  ELSIF p_run_kind = 'guest_upgrade_analysis' THEN
    v_run_table := 'guest_upgrade_analysis_runs';
    v_attempt_fk := 'guest_run_id';
  ELSE
    RAISE EXCEPTION 'Unsupported optimizer run kind';
  END IF;

  EXECUTE format(
    'SELECT to_jsonb(run) FROM public.%I run WHERE run.id = $1 FOR UPDATE',
    v_run_table
  ) INTO v_run USING p_run_id;
  IF v_run IS NULL
     OR v_run->>'status' <> 'running'
     OR v_run->>'lease_owner' IS DISTINCT FROM p_lease_owner THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'ownership_lost');
  END IF;

  v_attempt := (v_run->>'attempt_number')::INTEGER;
  v_max_attempts := (v_run->>'max_attempts')::INTEGER;
  v_retry := COALESCE(p_retryable, false) AND v_attempt < v_max_attempts;
  v_next_status := CASE WHEN v_retry THEN 'queued' ELSE 'failed' END;
  v_retry_not_before := CASE
    WHEN v_retry THEN v_now + make_interval(
      secs => CASE v_attempt WHEN 1 THEN 5 WHEN 2 THEN 10 ELSE 20 END
    )
    ELSE NULL
  END;

  EXECUTE format(
    'UPDATE public.%I
       SET status = $3,
           partial_reason = NULL,
           error_detail = $4,
           completed_at = CASE WHEN $3 = ''failed'' THEN $5 ELSE NULL END,
           lease_owner = NULL,
           lease_expires_at = NULL,
           last_heartbeat_at = $5,
           retry_not_before = $6
     WHERE id = $1 AND status = ''running'' AND lease_owner = $2',
    v_run_table
  ) USING p_run_id, p_lease_owner, v_next_status, left(COALESCE(p_error_detail, 'Optimizer attempt failed'), 2000), v_now, v_retry_not_before;

  EXECUTE format(
    'UPDATE public.optimizer_run_attempts
       SET status = ''failed'', ended_at = $4, last_heartbeat_at = $4,
           lease_expires_at = NULL, error_detail = $5
     WHERE %I = $1 AND attempt_number = $2 AND lease_owner = $3',
    v_attempt_fk
  ) USING p_run_id, v_attempt, p_lease_owner, v_now, left(COALESCE(p_error_detail, 'Optimizer attempt failed'), 2000);

  RETURN jsonb_build_object(
    'accepted', true,
    'status', v_next_status,
    'retry_scheduled', v_retry,
    'retry_not_before', v_retry_not_before,
    'attempt_number', v_attempt,
    'max_attempts', v_max_attempts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_optimizer_run_attempt(TEXT, UUID, TEXT, INTEGER, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_optimizer_run_attempt(TEXT, UUID, TEXT, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.defer_optimizer_run_attempt(TEXT, UUID, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_optimizer_run_attempt(TEXT, UUID, TEXT, TEXT, JSONB, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_optimizer_run_attempt(TEXT, UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_optimizer_run_attempt(TEXT, UUID, TEXT, INTEGER, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_optimizer_run_attempt(TEXT, UUID, TEXT, INTEGER, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.defer_optimizer_run_attempt(TEXT, UUID, TEXT, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_optimizer_run_attempt(TEXT, UUID, TEXT, TEXT, JSONB, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_optimizer_run_attempt(TEXT, UUID, TEXT, TEXT, BOOLEAN) TO service_role;
