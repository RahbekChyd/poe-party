BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(21);

INSERT INTO auth.users (id, email)
VALUES ('13000000-0000-0000-0000-000000000001', 'atomic-queue@example.invalid');
INSERT INTO public.users (id, poe_account_name)
VALUES ('13000000-0000-0000-0000-000000000001', 'AtomicQueue#0001');
INSERT INTO public.groups (id, name, invite_code, created_by, game, league)
VALUES (
  '23000000-0000-0000-0000-000000000001',
  'Atomic Queue',
  'atomq001',
  '13000000-0000-0000-0000-000000000001',
  'poe1',
  'Test League'
);
INSERT INTO public.group_members (group_id, user_id, role)
VALUES (
  '23000000-0000-0000-0000-000000000001',
  '13000000-0000-0000-0000-000000000001',
  'admin'
);
INSERT INTO public.build_targets (id, group_id, user_id, created_by, name, raw_import)
VALUES (
  '63000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  '13000000-0000-0000-0000-000000000001',
  '13000000-0000-0000-0000-000000000001',
  'Atomic target',
  'test-import'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.queue_upgrade_analysis_run_atomic(uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,jsonb,jsonb,text,jsonb,date,integer)',
    'EXECUTE'
  ),
  'anonymous cannot call the atomic queue function'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.queue_upgrade_analysis_run_atomic(uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,jsonb,jsonb,text,jsonb,date,integer)',
    'EXECUTE'
  ),
  'authenticated clients cannot call the atomic queue function directly'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.queue_upgrade_analysis_run_atomic(uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,jsonb,jsonb,text,jsonb,date,integer)',
    'EXECUTE'
  ),
  'service role can call the atomic queue function'
);

SET LOCAL ROLE service_role;

SELECT ok(
  NOT COALESCE((public.queue_upgrade_analysis_run_atomic(
    '23000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000001',
    NULL,
    '13000000-0000-0000-0000-000000000001',
    NULL,
    '13000000-0000-0000-0000-000000000001',
    100,
    'quick',
    '{}'::JSONB,
    '[]'::JSONB,
    'atomic-input-1',
    '{}'::JSONB,
    DATE '2026-07-20',
    2
  )->>'reused')::BOOLEAN, false),
  'the first request creates a run'
);
SELECT is(
  (SELECT status FROM public.upgrade_analysis_runs WHERE input_hash = 'atomic-input-1'),
  'queued',
  'the created run is queued'
);
SELECT is(
  (SELECT queued_count FROM public.upgrade_analysis_daily_usage
   WHERE user_id = '13000000-0000-0000-0000-000000000001'
     AND usage_date = DATE '2026-07-20'),
  1,
  'the first new run consumes one Community allowance'
);

SELECT ok(
  (public.queue_upgrade_analysis_run_atomic(
    '23000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000001',
    NULL,
    '13000000-0000-0000-0000-000000000001',
    NULL,
    '13000000-0000-0000-0000-000000000001',
    100,
    'quick',
    '{}'::JSONB,
    '[]'::JSONB,
    'atomic-input-1',
    '{}'::JSONB,
    DATE '2026-07-20',
    2
  )->>'reused')::BOOLEAN,
  'an identical request reuses the existing run'
);
SELECT is(
  (SELECT count(*)::INTEGER FROM public.upgrade_analysis_runs
   WHERE build_target_id = '63000000-0000-0000-0000-000000000001'),
  1,
  'reuse does not create a duplicate run'
);
SELECT is(
  (SELECT queued_count FROM public.upgrade_analysis_daily_usage
   WHERE user_id = '13000000-0000-0000-0000-000000000001'
     AND usage_date = DATE '2026-07-20'),
  1,
  'reuse does not consume the daily allowance again'
);

SELECT ok(
  NOT (public.queue_upgrade_analysis_run_atomic(
    '23000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000001',
    NULL,
    '13000000-0000-0000-0000-000000000001',
    NULL,
    '13000000-0000-0000-0000-000000000001',
    200,
    'quick',
    '{}'::JSONB,
    '[]'::JSONB,
    'atomic-input-2',
    '{}'::JSONB,
    DATE '2026-07-20',
    2
  )->>'reused')::BOOLEAN,
  'a changed input creates the second run'
);
SELECT is(
  (SELECT status FROM public.upgrade_analysis_runs WHERE input_hash = 'atomic-input-1'),
  'stale',
  'creating a changed input stales the prior run in the same transaction'
);
SELECT is(
  (SELECT queued_count FROM public.upgrade_analysis_daily_usage
   WHERE user_id = '13000000-0000-0000-0000-000000000001'
     AND usage_date = DATE '2026-07-20'),
  2,
  'the second new run consumes the second allowance'
);

SELECT ok(
  (public.queue_upgrade_analysis_run_atomic(
    '23000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000001',
    NULL,
    '13000000-0000-0000-0000-000000000001',
    NULL,
    '13000000-0000-0000-0000-000000000001',
    300,
    'quick',
    '{}'::JSONB,
    '[]'::JSONB,
    'atomic-input-3',
    '{}'::JSONB,
    DATE '2026-07-20',
    2
  )->>'rate_limited')::BOOLEAN,
  'a third Community run is rejected at the atomic boundary'
);
SELECT is(
  (SELECT count(*)::INTEGER FROM public.upgrade_analysis_runs
   WHERE build_target_id = '63000000-0000-0000-0000-000000000001'),
  2,
  'a rate-limited request cannot create or stale a run'
);

UPDATE public.users
SET subscription_tier = 'pro', subscription_expires_at = NULL
WHERE id = '13000000-0000-0000-0000-000000000001';

SELECT ok(
  NOT (public.queue_upgrade_analysis_run_atomic(
    '23000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000001',
    NULL,
    '13000000-0000-0000-0000-000000000001',
    NULL,
    '13000000-0000-0000-0000-000000000001',
    300,
    'quick',
    '{}'::JSONB,
    '[]'::JSONB,
    'atomic-input-3',
    '{}'::JSONB,
    DATE '2026-07-20',
    2
  )->>'rate_limited')::BOOLEAN,
  'Supporter access can create a third run'
);
SELECT is(
  (SELECT queued_count FROM public.upgrade_analysis_daily_usage
   WHERE user_id = '13000000-0000-0000-0000-000000000001'
     AND usage_date = DATE '2026-07-20'),
  2,
  'Supporter runs do not increment Community allowance usage'
);
SELECT is(
  (SELECT count(*)::INTEGER FROM public.upgrade_analysis_runs
   WHERE build_target_id = '63000000-0000-0000-0000-000000000001'),
  3,
  'three runs are retained after the Supporter request'
);

SELECT lives_ok(
  $$ SELECT public.queue_upgrade_analysis_run_atomic(
    '23000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000001', NULL,
    '13000000-0000-0000-0000-000000000001', NULL,
    '13000000-0000-0000-0000-000000000001', 400, 'quick', '{}'::JSONB,
    '[]'::JSONB, 'atomic-input-4', '{}'::JSONB, DATE '2026-07-20', 2
  ) $$,
  'a fourth Supporter run is accepted'
);
SELECT lives_ok(
  $$ SELECT public.queue_upgrade_analysis_run_atomic(
    '23000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000001', NULL,
    '13000000-0000-0000-0000-000000000001', NULL,
    '13000000-0000-0000-0000-000000000001', 500, 'quick', '{}'::JSONB,
    '[]'::JSONB, 'atomic-input-5', '{}'::JSONB, DATE '2026-07-20', 2
  ) $$,
  'a fifth Supporter run is accepted'
);
SELECT is(
  (SELECT count(*)::INTEGER FROM public.upgrade_analysis_runs
   WHERE build_target_id = '63000000-0000-0000-0000-000000000001'),
  3,
  'retention is enforced inside the same queue transaction'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.upgrade_analysis_runs WHERE input_hash = 'atomic-input-1')
  AND EXISTS (SELECT 1 FROM public.upgrade_analysis_runs WHERE input_hash = 'atomic-input-5'),
  'retention removes the oldest run and preserves the newest run'
);

SELECT * FROM finish();
ROLLBACK;
