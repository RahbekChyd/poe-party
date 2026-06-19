-- Add Stripe-backed billing state, manual Pro grants, and harden tier writes.

CREATE TABLE public.billing_customers (
  user_id            UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER billing_customers_updated_at
  BEFORE UPDATE ON public.billing_customers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.billing_customers FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_customers TO service_role;

CREATE POLICY "billing_customers_service_only"
  ON public.billing_customers FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE public.billing_subscriptions (
  stripe_subscription_id TEXT PRIMARY KEY,
  user_id                UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_customer_id     TEXT NOT NULL REFERENCES public.billing_customers(stripe_customer_id) ON DELETE CASCADE,
  status                 TEXT NOT NULL CHECK (
    status IN (
      'active',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'past_due',
      'paused',
      'trialing',
      'unpaid'
    )
  ),
  price_id               TEXT,
  plan_key               TEXT NOT NULL,
  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN NOT NULL DEFAULT false,
  raw_event_updated_at   TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX billing_subscriptions_user_status_idx
  ON public.billing_subscriptions(user_id, status);

CREATE INDEX billing_subscriptions_customer_idx
  ON public.billing_subscriptions(stripe_customer_id);

CREATE TRIGGER billing_subscriptions_updated_at
  BEFORE UPDATE ON public.billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.billing_subscriptions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_subscriptions TO service_role;

CREATE POLICY "billing_subscriptions_service_only"
  ON public.billing_subscriptions FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE public.billing_events (
  stripe_event_id    TEXT PRIMARY KEY,
  event_type         TEXT NOT NULL,
  stripe_created_at  TIMESTAMPTZ,
  processed_at       TIMESTAMPTZ,
  processing_status  TEXT NOT NULL DEFAULT 'processing'
                     CHECK (processing_status IN ('processing', 'processed', 'failed', 'ignored')),
  error_message      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX billing_events_status_idx
  ON public.billing_events(processing_status, created_at);

CREATE TRIGGER billing_events_updated_at
  BEFORE UPDATE ON public.billing_events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.billing_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_events TO service_role;

CREATE POLICY "billing_events_service_only"
  ON public.billing_events FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE public.billing_manual_grants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_key    TEXT NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at     TIMESTAMPTZ,
  reason      TEXT,
  granted_by  TEXT,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX billing_manual_grants_active_idx
  ON public.billing_manual_grants(user_id, plan_key, starts_at, ends_at)
  WHERE revoked_at IS NULL;

CREATE TRIGGER billing_manual_grants_updated_at
  BEFORE UPDATE ON public.billing_manual_grants
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.billing_manual_grants ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.billing_manual_grants FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_manual_grants TO service_role;

CREATE POLICY "billing_manual_grants_service_only"
  ON public.billing_manual_grants FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.recompute_user_subscription_tier(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_indefinite_pro BOOLEAN;
  v_expires_at TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.billing_subscriptions
    WHERE user_id = p_user_id
      AND plan_key = 'pro'
      AND status IN ('active', 'trialing')
      AND current_period_end IS NULL
    UNION ALL
    SELECT 1
    FROM public.billing_manual_grants
    WHERE user_id = p_user_id
      AND plan_key = 'pro'
      AND revoked_at IS NULL
      AND starts_at <= now()
      AND ends_at IS NULL
  )
  INTO v_has_indefinite_pro;

  SELECT MAX(expires_at)
  INTO v_expires_at
  FROM (
    SELECT current_period_end AS expires_at
    FROM public.billing_subscriptions
    WHERE user_id = p_user_id
      AND plan_key = 'pro'
      AND status IN ('active', 'trialing')
      AND current_period_end IS NOT NULL
      AND current_period_end > now()
    UNION ALL
    SELECT ends_at AS expires_at
    FROM public.billing_manual_grants
    WHERE user_id = p_user_id
      AND plan_key = 'pro'
      AND revoked_at IS NULL
      AND starts_at <= now()
      AND ends_at IS NOT NULL
      AND ends_at > now()
  ) active_expirations;

  IF v_has_indefinite_pro OR v_expires_at IS NOT NULL THEN
    UPDATE public.users
    SET
      subscription_tier = 'pro',
      subscription_expires_at = CASE WHEN v_has_indefinite_pro THEN NULL ELSE v_expires_at END
    WHERE id = p_user_id;
  ELSE
    UPDATE public.users
    SET
      subscription_tier = 'free',
      subscription_expires_at = NULL
    WHERE id = p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_user_subscription_tier(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_user_subscription_tier(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.recompute_user_subscription_tier_from_billing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
    PERFORM public.recompute_user_subscription_tier(v_user_id);
    RETURN OLD;
  END IF;

  v_user_id := NEW.user_id;
  PERFORM public.recompute_user_subscription_tier(v_user_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_user_subscription_tier_from_billing() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER billing_subscriptions_recompute_tier
  AFTER INSERT OR UPDATE OR DELETE ON public.billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.recompute_user_subscription_tier_from_billing();

CREATE TRIGGER billing_manual_grants_recompute_tier
  AFTER INSERT OR UPDATE OR DELETE ON public.billing_manual_grants
  FOR EACH ROW EXECUTE FUNCTION public.recompute_user_subscription_tier_from_billing();

-- Snapshot retention should only treat Pro as active while the cached tier is unexpired.
CREATE OR REPLACE FUNCTION public.get_snapshot_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT CASE
    WHEN subscription_tier = 'pro'
      AND (subscription_expires_at IS NULL OR subscription_expires_at > now())
      THEN 15
    ELSE 3
  END
  FROM public.users WHERE id = p_user_id;
$$;

-- RLS policies constrain rows; column privileges constrain what authenticated clients may write.
REVOKE INSERT, UPDATE ON public.users FROM authenticated;

GRANT INSERT (
  id,
  poe_account_name,
  display_name,
  avatar_url,
  avatar_color,
  theme,
  pob_code,
  pob_support_code,
  has_seen_early_access_notice
) ON public.users TO authenticated;

GRANT UPDATE (
  display_name,
  avatar_url,
  avatar_color,
  theme,
  pob_code,
  pob_support_code,
  has_seen_early_access_notice
) ON public.users TO authenticated;
