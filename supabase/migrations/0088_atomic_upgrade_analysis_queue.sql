-- Serialize authenticated optimizer queue creation per build target. Reuse,
-- quota accounting, stale transitions, insertion, and retention now share one
-- transaction so concurrent requests cannot stale each other or double-charge
-- the Community daily allowance.

-- Keep this migration as one top-level statement. Supabase Branching executes
-- migration files through a prepared statement, which rejects multiple
-- top-level commands. Dynamic DDL also keeps creation and privilege hardening
-- in the same transaction.
DO $migration$
BEGIN
  EXECUTE $function_definition$
CREATE OR REPLACE FUNCTION public.queue_upgrade_analysis_run_atomic(
  p_group_id UUID,
  p_build_target_id UUID,
  p_target_stage_id UUID,
  p_target_user_id UUID,
  p_character_id UUID,
  p_queued_by UUID,
  p_budget_chaos NUMERIC,
  p_analysis_mode TEXT,
  p_search_constraints JSONB,
  p_party_config JSONB,
  p_input_hash TEXT,
  p_summary JSONB,
  p_usage_date DATE,
  p_free_limit INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function_body$
DECLARE
  v_existing public.upgrade_analysis_runs;
  v_inserted public.upgrade_analysis_runs;
  v_usage RECORD;
  v_is_supporter BOOLEAN := false;
BEGIN
  IF p_group_id IS NULL
     OR p_build_target_id IS NULL
     OR p_target_user_id IS NULL
     OR p_queued_by IS NULL
     OR p_usage_date IS NULL
     OR p_free_limit < 1
     OR btrim(COALESCE(p_input_hash, '')) = '' THEN
    RAISE EXCEPTION 'Invalid upgrade analysis queue request';
  END IF;

  -- A new run supersedes the prior live/result state for this build target,
  -- so build-target scope is the correct serialization boundary.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_build_target_id::TEXT, 0));

  SELECT *
  INTO v_existing
  FROM public.upgrade_analysis_runs
  WHERE build_target_id = p_build_target_id
    AND input_hash = p_input_hash
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'reused', true,
      'rate_limited', false,
      'run', to_jsonb(v_existing)
    );
  END IF;

  SELECT COALESCE(
    subscription_tier = 'pro'
      AND (subscription_expires_at IS NULL OR subscription_expires_at > now()),
    false
  )
  INTO v_is_supporter
  FROM public.users
  WHERE id = p_queued_by;

  IF NOT COALESCE(v_is_supporter, false) THEN
    SELECT *
    INTO v_usage
    FROM public.claim_upgrade_analysis_daily_usage(
      p_queued_by,
      p_usage_date,
      p_free_limit
    );

    IF NOT COALESCE(v_usage.allowed, false) THEN
      RETURN jsonb_build_object(
        'reused', false,
        'rate_limited', true,
        'queued_count', v_usage.queued_count,
        'reset_at', v_usage.reset_at
      );
    END IF;
  END IF;

  UPDATE public.upgrade_analysis_runs
  SET status = 'stale',
      stale_reason = 'budget-or-target-updated'
  WHERE group_id = p_group_id
    AND build_target_id = p_build_target_id
    AND status IN ('queued', 'running', 'completed', 'partial');

  INSERT INTO public.upgrade_analysis_runs (
    group_id,
    build_target_id,
    target_stage_id,
    target_user_id,
    character_id,
    queued_by,
    budget_chaos,
    analysis_mode,
    search_constraints,
    party_config,
    input_hash,
    status,
    summary,
    created_at,
    updated_at
  ) VALUES (
    p_group_id,
    p_build_target_id,
    p_target_stage_id,
    p_target_user_id,
    p_character_id,
    p_queued_by,
    GREATEST(COALESCE(p_budget_chaos, 0), 0),
    p_analysis_mode,
    COALESCE(p_search_constraints, '{}'::JSONB),
    COALESCE(p_party_config, '[]'::JSONB),
    p_input_hash,
    'queued',
    COALESCE(p_summary, '{}'::JSONB),
    clock_timestamp(),
    clock_timestamp()
  )
  RETURNING * INTO v_inserted;

  DELETE FROM public.upgrade_analysis_runs run
  WHERE run.id IN (
    SELECT old_run.id
    FROM public.upgrade_analysis_runs old_run
    WHERE old_run.build_target_id = p_build_target_id
      AND old_run.id <> v_inserted.id
    ORDER BY old_run.created_at DESC, old_run.id DESC
    OFFSET 2
  );

  RETURN jsonb_build_object(
    'reused', false,
    'rate_limited', false,
    'run', to_jsonb(v_inserted)
  );
END;
$function_body$;
$function_definition$;

  EXECUTE $permissions$
REVOKE ALL ON FUNCTION public.queue_upgrade_analysis_run_atomic(
  UUID, UUID, UUID, UUID, UUID, UUID, NUMERIC, TEXT, JSONB, JSONB, TEXT, JSONB, DATE, INTEGER
) FROM PUBLIC, anon, authenticated;
$permissions$;

  EXECUTE $permissions$
GRANT EXECUTE ON FUNCTION public.queue_upgrade_analysis_run_atomic(
  UUID, UUID, UUID, UUID, UUID, UUID, NUMERIC, TEXT, JSONB, JSONB, TEXT, JSONB, DATE, INTEGER
) TO service_role;
$permissions$;
END;
$migration$;
