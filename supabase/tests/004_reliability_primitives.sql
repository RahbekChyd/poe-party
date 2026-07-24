BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(12);

INSERT INTO auth.users (id, email)
VALUES ('10000000-0000-0000-0000-000000000004', 'reliability@example.invalid');

INSERT INTO public.users (id, poe_account_name)
VALUES ('10000000-0000-0000-0000-000000000004', 'Reliability#0004');

SELECT results_eq(
  $$
    SELECT allowed, queued_count
    FROM public.claim_upgrade_analysis_daily_usage(
      '10000000-0000-0000-0000-000000000004', current_date, 2
    )
  $$,
  $$ VALUES (true, 1) $$,
  'the first authenticated daily usage claim succeeds'
);

SELECT results_eq(
  $$
    SELECT allowed, queued_count
    FROM public.claim_upgrade_analysis_daily_usage(
      '10000000-0000-0000-0000-000000000004', current_date, 2
    )
  $$,
  $$ VALUES (true, 2) $$,
  'the second authenticated daily usage claim reaches the cap'
);

SELECT results_eq(
  $$
    SELECT allowed, queued_count
    FROM public.claim_upgrade_analysis_daily_usage(
      '10000000-0000-0000-0000-000000000004', current_date, 2
    )
  $$,
  $$ VALUES (false, 2) $$,
  'a daily usage claim cannot race past the cap'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.claim_upgrade_analysis_daily_usage(uuid,date,integer)',
    'EXECUTE'
  ),
  'authenticated clients cannot forge analysis usage claims'
);

CREATE TEMP TABLE first_checkout_intent AS
SELECT (public.claim_billing_checkout_intent(
  '10000000-0000-0000-0000-000000000004'
)).*;

SELECT is(
  (
    SELECT (public.claim_billing_checkout_intent(
      '10000000-0000-0000-0000-000000000004'
    )).id
  ),
  (SELECT id FROM first_checkout_intent),
  'concurrent checkout claims reuse the one live intent'
);

SELECT lives_ok(
  format(
    $$SELECT public.open_billing_checkout_intent(%L, 'cs_test_reliability', 'https://checkout.stripe.test/session', now() + interval '30 minutes')$$,
    (SELECT id FROM first_checkout_intent)
  ),
  'a claimed checkout intent can be opened exactly once'
);

SELECT is(
  (
    SELECT (public.claim_billing_checkout_intent(
      '10000000-0000-0000-0000-000000000004'
    )).checkout_url
  ),
  'https://checkout.stripe.test/session',
  'a later checkout request reuses the open Stripe URL'
);

SELECT is(
  public.claim_billing_event(
    'evt_reliability',
    'customer.subscription.updated',
    now(),
    '60000000-0000-4000-8000-000000000001',
    120
  ),
  'claimed',
  'the first webhook delivery claims its event lease'
);

SELECT is(
  public.claim_billing_event(
    'evt_reliability',
    'customer.subscription.updated',
    now(),
    '60000000-0000-4000-8000-000000000002',
    120
  ),
  'busy',
  'a concurrent webhook delivery cannot take a live lease'
);

UPDATE public.billing_events
SET lease_expires_at = now() - interval '1 second'
WHERE stripe_event_id = 'evt_reliability';

SELECT is(
  public.claim_billing_event(
    'evt_reliability',
    'customer.subscription.updated',
    now(),
    '60000000-0000-4000-8000-000000000002',
    120
  ),
  'claimed',
  'an expired webhook lease can be recovered'
);

SELECT is(
  (SELECT attempt_count FROM public.billing_events WHERE stripe_event_id = 'evt_reliability'),
  2,
  'webhook lease recovery records another attempt'
);

UPDATE public.billing_events
SET processing_status = 'processed'
WHERE stripe_event_id = 'evt_reliability';

SELECT is(
  public.claim_billing_event(
    'evt_reliability',
    'customer.subscription.updated',
    now(),
    '60000000-0000-4000-8000-000000000003',
    120
  ),
  'duplicate',
  'a processed webhook event is permanently idempotent'
);

SELECT * FROM finish();
ROLLBACK;
