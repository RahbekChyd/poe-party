-- Qualify columns in guest usage counter updates to avoid PL/pgSQL output-column ambiguity.

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

REVOKE ALL ON FUNCTION public.claim_guest_upgrade_analysis_daily_usage(DATE, TEXT, TEXT, INTEGER, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_guest_upgrade_analysis_daily_usage(DATE, TEXT, TEXT, INTEGER, INTEGER) TO service_role;
