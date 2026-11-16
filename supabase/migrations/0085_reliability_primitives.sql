-- Atomic usage, bounded cleanup, and billing idempotency/lease primitives.

CREATE TABLE public.upgrade_analysis_daily_usage (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  queued_count INTEGER NOT NULL DEFAULT 0 CHECK (queued_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);

CREATE TRIGGER upgrade_analysis_daily_usage_updated_at
  BEFORE UPDATE ON public.upgrade_analysis_daily_usage
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.upgrade_analysis_daily_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upgrade_analysis_daily_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.upgrade_analysis_daily_usage TO service_role;
CREATE POLICY upgrade_analysis_daily_usage_service_only
  ON public.upgrade_analysis_daily_usage FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.claim_upgrade_analysis_daily_usage(
  p_user_id UUID,
  p_usage_date DATE,
  p_limit INTEGER
)
RETURNS TABLE(allowed BOOLEAN, queued_count INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_existing_count INTEGER;
  v_reset_at TIMESTAMPTZ := ((p_usage_date::timestamp + interval '1 day') AT TIME ZONE 'UTC');
BEGIN
  IF p_user_id IS NULL OR p_limit < 1 THEN
    RAISE EXCEPTION 'Invalid analysis usage claim';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_existing_count
  FROM public.upgrade_analysis_runs run
  WHERE run.queued_by = p_user_id
    AND run.created_at >= p_usage_date::timestamptz
    AND run.created_at < (p_usage_date + 1)::timestamptz;

  INSERT INTO public.upgrade_analysis_daily_usage(user_id, usage_date, queued_count)
  VALUES (p_user_id, p_usage_date, v_existing_count)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  SELECT usage.queued_count
  INTO v_count
  FROM public.upgrade_analysis_daily_usage usage
  WHERE usage.user_id = p_user_id
    AND usage.usage_date = p_usage_date
  FOR UPDATE;

  v_count := GREATEST(COALESCE(v_count, 0), v_existing_count);
  UPDATE public.upgrade_analysis_daily_usage
  SET queued_count = v_count
  WHERE user_id = p_user_id AND usage_date = p_usage_date;

  IF v_count >= p_limit THEN
    RETURN QUERY SELECT false, v_count, v_reset_at;
    RETURN;
  END IF;

  UPDATE public.upgrade_analysis_daily_usage
  SET queued_count = upgrade_analysis_daily_usage.queued_count + 1
  WHERE user_id = p_user_id AND usage_date = p_usage_date
  RETURNING upgrade_analysis_daily_usage.queued_count INTO v_count;

  RETURN QUERY SELECT true, v_count, v_reset_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_guest_analysis(p_batch_size INTEGER DEFAULT 500)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
  v_batch_size INTEGER := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 2000);
BEGIN
  WITH expired AS (
    SELECT id
    FROM public.guest_upgrade_analysis_runs
    WHERE expires_at <= now()
    ORDER BY expires_at ASC
    LIMIT v_batch_size
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.guest_upgrade_analysis_runs run
  USING expired
  WHERE run.id = expired.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM public.guest_upgrade_analysis_daily_usage
  WHERE usage_date < (now() AT TIME ZONE 'UTC')::DATE - 8;

  DELETE FROM public.upgrade_market_search_cache
  WHERE expires_at < now() - interval '1 day';

  RETURN v_deleted;
END;
$$;

ALTER TABLE public.billing_events
  ADD COLUMN lease_owner UUID,
  ADD COLUMN lease_expires_at TIMESTAMPTZ,
  ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0);

CREATE OR REPLACE FUNCTION public.claim_billing_event(
  p_event_id TEXT,
  p_event_type TEXT,
  p_stripe_created_at TIMESTAMPTZ,
  p_lease_owner UUID,
  p_lease_seconds INTEGER DEFAULT 120
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.billing_events;
  v_lease_until TIMESTAMPTZ := now() + make_interval(secs => LEAST(GREATEST(p_lease_seconds, 30), 600));
BEGIN
  INSERT INTO public.billing_events (
    stripe_event_id,
    event_type,
    stripe_created_at,
    processing_status,
    lease_owner,
    lease_expires_at,
    attempt_count
  )
  VALUES (
    p_event_id,
    p_event_type,
    p_stripe_created_at,
    'processing',
    p_lease_owner,
    v_lease_until,
    1
  )
  ON CONFLICT (stripe_event_id) DO NOTHING
  RETURNING * INTO v_event;

  IF FOUND THEN
    RETURN 'claimed';
  END IF;

  SELECT *
  INTO v_event
  FROM public.billing_events
  WHERE stripe_event_id = p_event_id
  FOR UPDATE;

  IF v_event.processing_status IN ('processed', 'ignored') THEN
    RETURN 'duplicate';
  END IF;

  IF v_event.processing_status = 'processing'
    AND v_event.lease_expires_at IS NOT NULL
    AND v_event.lease_expires_at > now()
  THEN
    RETURN 'busy';
  END IF;

  UPDATE public.billing_events
  SET processing_status = 'processing',
      lease_owner = p_lease_owner,
      lease_expires_at = v_lease_until,
      attempt_count = attempt_count + 1,
      error_message = NULL,
      processed_at = NULL
  WHERE stripe_event_id = p_event_id;

  RETURN 'claimed';
END;
$$;

CREATE TABLE public.billing_checkout_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  idempotency_key UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status TEXT NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed', 'open', 'completed', 'expired', 'failed')),
  stripe_session_id TEXT UNIQUE,
  checkout_url TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX billing_checkout_intents_one_live_user_idx
  ON public.billing_checkout_intents(user_id)
  WHERE status IN ('claimed', 'open');

CREATE TRIGGER billing_checkout_intents_updated_at
  BEFORE UPDATE ON public.billing_checkout_intents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.billing_checkout_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_checkout_intents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_checkout_intents TO service_role;
CREATE POLICY billing_checkout_intents_service_only
  ON public.billing_checkout_intents FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.claim_billing_checkout_intent(p_user_id UUID)
RETURNS public.billing_checkout_intents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intent public.billing_checkout_intents;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Billing user is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  UPDATE public.billing_checkout_intents
  SET status = 'expired'
  WHERE user_id = p_user_id
    AND status IN ('claimed', 'open')
    AND expires_at <= now();

  SELECT *
  INTO v_intent
  FROM public.billing_checkout_intents
  WHERE user_id = p_user_id
    AND status IN ('claimed', 'open')
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN v_intent;
  END IF;

  INSERT INTO public.billing_checkout_intents(user_id)
  VALUES (p_user_id)
  RETURNING * INTO v_intent;

  RETURN v_intent;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_billing_checkout_intent(
  p_intent_id UUID,
  p_stripe_session_id TEXT,
  p_checkout_url TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.billing_checkout_intents
  SET status = 'open',
      stripe_session_id = p_stripe_session_id,
      checkout_url = p_checkout_url,
      expires_at = p_expires_at
  WHERE id = p_intent_id
    AND status IN ('claimed', 'open');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing checkout intent is not claimable';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_billing_checkout_intent(p_intent_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.billing_checkout_intents
  SET status = 'failed'
  WHERE id = p_intent_id AND status = 'claimed';
$$;

REVOKE ALL ON FUNCTION public.claim_upgrade_analysis_daily_usage(UUID, DATE, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_upgrade_analysis_daily_usage(UUID, DATE, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.purge_expired_guest_analysis(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_guest_analysis(INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.claim_billing_event(TEXT, TEXT, TIMESTAMPTZ, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_billing_event(TEXT, TEXT, TIMESTAMPTZ, UUID, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.claim_billing_checkout_intent(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_billing_checkout_intent(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.open_billing_checkout_intent(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_billing_checkout_intent(UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION public.fail_billing_checkout_intent(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_billing_checkout_intent(UUID) TO service_role;
