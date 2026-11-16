BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(40);

INSERT INTO auth.users (id, email)
VALUES ('12000000-0000-0000-0000-000000000001', 'optimizer-owner@example.invalid');
INSERT INTO public.users (id, poe_account_name)
VALUES ('12000000-0000-0000-0000-000000000001', 'OptimizerOwner#0001');
INSERT INTO public.groups (id, name, invite_code, created_by, game, league)
VALUES (
  '22000000-0000-0000-0000-000000000001',
  'Optimizer Lifecycle',
  'optlife1',
  '12000000-0000-0000-0000-000000000001',
  'poe1',
  'Test League'
);
INSERT INTO public.group_members (group_id, user_id, role)
VALUES (
  '22000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000001',
  'admin'
);
INSERT INTO public.build_targets (
  id, group_id, user_id, created_by, name, raw_import
)
VALUES (
  '62000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000001',
  'Lifecycle target',
  'test-import'
);

INSERT INTO public.upgrade_analysis_runs (
  id, group_id, build_target_id, target_user_id, queued_by, input_hash, max_attempts
)
VALUES
  (
    '72000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    '62000000-0000-0000-0000-000000000001',
    '12000000-0000-0000-0000-000000000001',
    '12000000-0000-0000-0000-000000000001',
    'auth-lifecycle-1',
    2
  ),
  (
    '72000000-0000-0000-0000-000000000002',
    '22000000-0000-0000-0000-000000000001',
    '62000000-0000-0000-0000-000000000001',
    '12000000-0000-0000-0000-000000000001',
    '12000000-0000-0000-0000-000000000001',
    'auth-lifecycle-2',
    2
  );

INSERT INTO public.guest_upgrade_analysis_runs (
  id, run_token_hash, normalized_account_name, account_name, character_name,
  raw_import, input_hash, max_attempts
)
VALUES
  (
    '82000000-0000-0000-0000-000000000001', 'guest-token-1', 'guest#0001',
    'Guest#0001', 'GuestOne', 'guest-import-1', 'guest-lifecycle-1', 2
  ),
  (
    '82000000-0000-0000-0000-000000000002', 'guest-token-2', 'guest#0002',
    'Guest#0002', 'GuestTwo', 'guest-import-2', 'guest-lifecycle-2', 2
  ),
  (
    '82000000-0000-0000-0000-000000000003', 'guest-token-3', 'guest#0003',
    'Guest#0003', 'GuestThree', 'guest-import-3', 'guest-lifecycle-3', 2
  ),
  (
    '82000000-0000-0000-0000-000000000004', 'guest-token-4', 'guest#0004',
    'Guest#0004', 'GuestFour', 'guest-import-4', 'guest-lifecycle-4', 2
  );

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.claim_optimizer_run_attempt(text,uuid,text,integer,boolean)',
    'EXECUTE'
  ),
  'anonymous cannot claim optimizer attempts'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.claim_optimizer_run_attempt(text,uuid,text,integer,boolean)',
    'EXECUTE'
  ),
  'authenticated clients cannot claim optimizer attempts'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.complete_optimizer_run_attempt(text,uuid,text,text,jsonb,text,jsonb)',
    'EXECUTE'
  ),
  'service role can complete optimizer attempts'
);

SET LOCAL ROLE service_role;

SELECT ok(
  (public.claim_optimizer_run_attempt(
    'upgrade_analysis',
    '72000000-0000-0000-0000-000000000001',
    'worker-auth-attempt-one',
    180,
    false
  )->>'claimed')::BOOLEAN,
  'authenticated run is claimed atomically'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.upgrade_analysis_runs
    WHERE id = '72000000-0000-0000-0000-000000000001'
      AND status = 'running'
      AND attempt_number = 1
      AND lease_owner = 'worker-auth-attempt-one'
      AND lease_expires_at > now()
  ),
  'claim records attempt number and lease ownership'
);
SELECT is(
  public.heartbeat_optimizer_run_attempt(
    'upgrade_analysis',
    '72000000-0000-0000-0000-000000000001',
    'wrong-worker-owner',
    180,
    NULL
  ),
  false,
  'wrong owner cannot heartbeat an attempt'
);
SELECT is(
  public.heartbeat_optimizer_run_attempt(
    'upgrade_analysis',
    '72000000-0000-0000-0000-000000000001',
    'worker-auth-attempt-one',
    180,
    '{"current_phase":{"id":"testing"}}'::JSONB
  ),
  true,
  'lease owner can heartbeat an attempt'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.upgrade_analysis_runs
    WHERE id = '72000000-0000-0000-0000-000000000001'
      AND summary#>>'{current_phase,id}' = 'testing'
  ),
  'guarded heartbeat can persist phase diagnostics'
);
SELECT is(
  (public.claim_optimizer_run_attempt(
    'upgrade_analysis',
    '72000000-0000-0000-0000-000000000001',
    'worker-auth-attempt-two',
    180,
    false
  )->>'claimed')::BOOLEAN,
  false,
  'an active lease cannot be stolen'
);
SELECT is(
  public.complete_optimizer_run_attempt(
    'upgrade_analysis',
    '72000000-0000-0000-0000-000000000001',
    'worker-auth-attempt-one',
    'completed',
    '{"engine":"pob"}'::JSONB,
    NULL,
    '[{
      "category":"best_single",
      "kind":"single",
      "title":"Upgrade",
      "score":10,
      "items":[{
        "source":"owned",
        "item_name":"Owned item",
        "item_payload":{"safe":true},
        "effective_price_chaos":0
      }]
    }]'::JSONB
  ),
  true,
  'completion transaction accepts the current owner'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.upgrade_analysis_runs
    WHERE id = '72000000-0000-0000-0000-000000000001'
      AND status = 'completed'
      AND lease_owner IS NULL
      AND lease_expires_at IS NULL
  ),
  'completion clears the run lease and marks it completed'
);
SELECT results_eq(
  $$
    SELECT
      (SELECT count(*) FROM public.upgrade_recommendation_plans WHERE run_id = '72000000-0000-0000-0000-000000000001')::BIGINT,
      (SELECT count(*) FROM public.upgrade_recommendation_items WHERE run_id = '72000000-0000-0000-0000-000000000001')::BIGINT
  $$,
  $$ VALUES (1::BIGINT, 1::BIGINT) $$,
  'plans and items are replaced in the completion transaction'
);
SELECT is(
  (public.fail_optimizer_run_attempt(
    'upgrade_analysis',
    '72000000-0000-0000-0000-000000000001',
    'worker-auth-attempt-one',
    'late failure',
    true
  )->>'accepted')::BOOLEAN,
  false,
  'a completed attempt cannot be overwritten by a late failure'
);

SELECT ok(
  (public.claim_optimizer_run_attempt(
    'guest_upgrade_analysis',
    '82000000-0000-0000-0000-000000000001',
    'worker-guest-attempt-one',
    180,
    false
  )->>'claimed')::BOOLEAN,
  'guest run is claimed through the same lifecycle contract'
);
SELECT is(
  public.defer_optimizer_run_attempt(
    'guest_upgrade_analysis',
    '82000000-0000-0000-0000-000000000001',
    'worker-guest-attempt-one',
    jsonb_build_object(
      'rare_trade_search', jsonb_build_object(
        'waiting_for_retry', true,
        'retry_at', (now() + interval '5 minutes')::TEXT
      )
    ),
    'waiting for trade API'
  ),
  true,
  'trade rate-limit wait releases the run lease'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.guest_upgrade_analysis_runs run
    JOIN public.optimizer_run_attempts attempt
      ON attempt.guest_run_id = run.id AND attempt.attempt_number = run.attempt_number
    WHERE run.id = '82000000-0000-0000-0000-000000000001'
      AND run.lease_owner IS NULL
      AND attempt.status = 'waiting'
  ),
  'waiting state keeps the same explicit attempt without an active lease'
);
SELECT is(
  (public.claim_optimizer_run_attempt(
    'guest_upgrade_analysis',
    '82000000-0000-0000-0000-000000000001',
    'worker-guest-resume-too-early',
    180,
    true
  )->>'claimed')::BOOLEAN,
  false,
  'trade wait cannot resume before retry_at'
);
UPDATE public.guest_upgrade_analysis_runs
SET summary = jsonb_set(summary, '{rare_trade_search,retry_at}', to_jsonb((now() - interval '1 second')::TEXT))
WHERE id = '82000000-0000-0000-0000-000000000001';
SELECT ok(
  (public.claim_optimizer_run_attempt(
    'guest_upgrade_analysis',
    '82000000-0000-0000-0000-000000000001',
    'worker-guest-resumed',
    180,
    true
  )->>'claimed')::BOOLEAN,
  'due trade wait resumes atomically'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.guest_upgrade_analysis_runs
    WHERE id = '82000000-0000-0000-0000-000000000001'
      AND attempt_number = 1
      AND lease_owner = 'worker-guest-resumed'
      AND COALESCE((summary#>>'{rare_trade_search,waiting_for_retry}')::BOOLEAN, false) = false
  ),
  'trade resume reuses the attempt and clears its wait marker'
);
SELECT is(
  public.complete_optimizer_run_attempt(
    'guest_upgrade_analysis',
    '82000000-0000-0000-0000-000000000001',
    'worker-guest-attempt-one',
    'completed', '{}'::JSONB, NULL, '[]'::JSONB
  ),
  false,
  'the pre-resume owner cannot complete the resumed attempt'
);
UPDATE public.guest_upgrade_analysis_runs
SET status = 'stale', stale_reason = 'test-stale-transition'
WHERE id = '82000000-0000-0000-0000-000000000001';
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.guest_upgrade_analysis_runs run
    JOIN public.optimizer_run_attempts attempt
      ON attempt.guest_run_id = run.id AND attempt.attempt_number = run.attempt_number
    WHERE run.id = '82000000-0000-0000-0000-000000000001'
      AND run.lease_owner IS NULL
      AND run.lease_expires_at IS NULL
      AND attempt.status = 'abandoned'
  ),
  'stale transition clears the lease and abandons the owned attempt'
);
SELECT is(
  public.complete_optimizer_run_attempt(
    'guest_upgrade_analysis',
    '82000000-0000-0000-0000-000000000001',
    'worker-guest-resumed',
    'completed', '{}'::JSONB, NULL, '[]'::JSONB
  ),
  false,
  'a stale run cannot be overwritten by completion'
);

SELECT ok(
  (public.claim_optimizer_run_attempt(
    'guest_upgrade_analysis',
    '82000000-0000-0000-0000-000000000004',
    'worker-wait-cancelled',
    180,
    false
  )->>'claimed')::BOOLEAN,
  'waiting cancellation test run is leased'
);
SELECT ok(
  public.defer_optimizer_run_attempt(
    'guest_upgrade_analysis',
    '82000000-0000-0000-0000-000000000004',
    'worker-wait-cancelled',
    jsonb_build_object(
      'rare_trade_search', jsonb_build_object(
        'waiting_for_retry', true,
        'retry_at', now() + interval '1 minute'
      )
    ),
    'waiting before cancellation'
  ),
  'waiting cancellation test releases its active lease'
);
UPDATE public.guest_upgrade_analysis_runs
SET status = 'stale', stale_reason = 'cancelled-while-waiting'
WHERE id = '82000000-0000-0000-0000-000000000004';
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.guest_upgrade_analysis_runs run
    JOIN public.optimizer_run_attempts attempt
      ON attempt.guest_run_id = run.id AND attempt.attempt_number = run.attempt_number
    WHERE run.id = '82000000-0000-0000-0000-000000000004'
      AND run.status = 'stale'
      AND run.lease_owner IS NULL
      AND attempt.status = 'abandoned'
  ),
  'terminal transition abandons a waiting attempt even after its run lease was released'
);

SELECT ok(
  (public.claim_optimizer_run_attempt(
    'guest_upgrade_analysis',
    '82000000-0000-0000-0000-000000000002',
    'worker-retry-attempt-one',
    180,
    false
  )->>'claimed')::BOOLEAN,
  'retry test run claims attempt one'
);
SELECT ok(
  (public.fail_optimizer_run_attempt(
    'guest_upgrade_analysis',
    '82000000-0000-0000-0000-000000000002',
    'worker-retry-attempt-one',
    'transient failure',
    true
  )->>'retry_scheduled')::BOOLEAN,
  'retryable failure requeues below the attempt bound'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.guest_upgrade_analysis_runs
    WHERE id = '82000000-0000-0000-0000-000000000002'
      AND status = 'queued'
      AND retry_not_before > now()
  ),
  'retry uses a minimal backoff instead of immediate hot-looping'
);
SELECT results_eq(
  $$
    SELECT public.claim_optimizer_run_attempt(
      'guest_upgrade_analysis',
      '82000000-0000-0000-0000-000000000002',
      'worker-retry-too-early',
      180,
      false
    )->>'reason'
  $$,
  $$ VALUES ('retry_backoff'::TEXT) $$,
  'claim reports retry backoff while the delay is active'
);
UPDATE public.guest_upgrade_analysis_runs
SET retry_not_before = now() - interval '1 second'
WHERE id = '82000000-0000-0000-0000-000000000002';
SELECT ok(
  (public.claim_optimizer_run_attempt(
    'guest_upgrade_analysis',
    '82000000-0000-0000-0000-000000000002',
    'worker-retry-attempt-two',
    180,
    false
  )->>'claimed')::BOOLEAN,
  'retry claims the next attempt after backoff'
);
SELECT is(
  (public.fail_optimizer_run_attempt(
    'guest_upgrade_analysis',
    '82000000-0000-0000-0000-000000000002',
    'worker-retry-attempt-two',
    'second transient failure',
    true
  )->>'status'),
  'failed',
  'failure at max attempts becomes terminal'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.guest_upgrade_analysis_runs
    WHERE id = '82000000-0000-0000-0000-000000000002'
      AND status = 'failed'
      AND attempt_number = 2
      AND retry_not_before IS NULL
  ),
  'bounded retry run stops after two configured attempts'
);
SELECT results_eq(
  $$
    SELECT count(*)::BIGINT
    FROM public.optimizer_run_attempts
    WHERE guest_run_id = '82000000-0000-0000-0000-000000000002'
  $$,
  $$ VALUES (2::BIGINT) $$,
  'attempt history records both bounded attempts'
);

SELECT ok(
  (public.claim_optimizer_run_attempt(
    'upgrade_analysis',
    '72000000-0000-0000-0000-000000000002',
    'worker-cancel-attempt-one',
    180,
    false
  )->>'claimed')::BOOLEAN,
  'cancellation test run is leased'
);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT lives_ok(
  $$ SELECT public.cancel_upgrade_analysis_run('72000000-0000-0000-0000-000000000002') $$,
  'authenticated owner can cancel its leased run'
);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.upgrade_analysis_runs run
    JOIN public.optimizer_run_attempts attempt
      ON attempt.upgrade_run_id = run.id AND attempt.attempt_number = run.attempt_number
    WHERE run.id = '72000000-0000-0000-0000-000000000002'
      AND run.status = 'stale'
      AND run.lease_owner IS NULL
      AND attempt.status = 'abandoned'
  ),
  'authenticated cancellation cannot leave a live attempt lease'
);
SELECT is(
  public.complete_optimizer_run_attempt(
    'upgrade_analysis',
    '72000000-0000-0000-0000-000000000002',
    'worker-cancel-attempt-one',
    'completed', '{}'::JSONB, NULL, '[]'::JSONB
  ),
  false,
  'cancelled run rejects a racing completion'
);

INSERT INTO public.guest_upgrade_recommendation_plans (
  run_id, category, kind, title
) VALUES (
  '82000000-0000-0000-0000-000000000003', 'best_single', 'single', 'Existing plan'
);
SELECT ok(
  (public.claim_optimizer_run_attempt(
    'guest_upgrade_analysis',
    '82000000-0000-0000-0000-000000000003',
    'worker-rollback-attempt',
    180,
    false
  )->>'claimed')::BOOLEAN,
  'transaction rollback test run is leased'
);
SELECT throws_like(
  $$
    SELECT public.complete_optimizer_run_attempt(
      'guest_upgrade_analysis',
      '82000000-0000-0000-0000-000000000003',
      'worker-rollback-attempt',
      'completed',
      '{}'::JSONB,
      NULL,
      '[{"category":"invalid-category","kind":"single","items":[]}]'::JSONB
    )
  $$,
  '%check constraint%',
  'invalid result payload aborts the completion transaction'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.guest_upgrade_analysis_runs run
    WHERE run.id = '82000000-0000-0000-0000-000000000003'
      AND run.status = 'running'
      AND run.lease_owner = 'worker-rollback-attempt'
  )
  AND EXISTS (
    SELECT 1
    FROM public.guest_upgrade_recommendation_plans
    WHERE run_id = '82000000-0000-0000-0000-000000000003'
      AND title = 'Existing plan'
  ),
  'failed completion preserves the previous results and active run atomically'
);

SELECT * FROM finish();
ROLLBACK;
