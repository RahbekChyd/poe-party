BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(14);

INSERT INTO auth.users (id, email)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'group-a@example.invalid'),
  ('10000000-0000-0000-0000-000000000002', 'group-b@example.invalid');

INSERT INTO public.users (id, poe_account_name)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'GroupA#0001'),
  ('10000000-0000-0000-0000-000000000002', 'GroupB#0002');

INSERT INTO public.groups (id, name, invite_code, created_by, game, league)
VALUES
  ('20000000-0000-0000-0000-000000000001', 'Group A', 'aaa00001', '10000000-0000-0000-0000-000000000001', 'poe1', 'Test League'),
  ('20000000-0000-0000-0000-000000000002', 'Group B', 'bbb00002', '10000000-0000-0000-0000-000000000002', 'poe1', 'Test League'),
  ('20000000-0000-0000-0000-000000000003', 'Bootstrap A', 'aaa00003', '10000000-0000-0000-0000-000000000001', 'poe1', 'Test League');

INSERT INTO public.group_members (group_id, user_id, role)
VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'admin'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'admin');

INSERT INTO public.stash_snapshots (
  id, user_id, group_id, status, completed_at
)
VALUES (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'completed',
  now()
);

INSERT INTO public.stash_tabs (
  id, snapshot_id, user_id, group_id, poe_tab_id, name, tab_type, tab_index
)
VALUES (
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'tab-a', 'Private tab', 'NormalStash', 0
);

INSERT INTO public.stash_items (
  id, tab_id, user_id, group_id, poe_item_id, name, type_line, raw_data
)
VALUES (
  '50000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'item-a', 'Private item', 'Private item', '{}'::jsonb
);

INSERT INTO public.build_targets (
  id, group_id, user_id, created_by, name, raw_import
)
VALUES (
  '70000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Group A target',
  'test-import'
);

INSERT INTO public.upgrade_analysis_runs (
  id, group_id, build_target_id, target_user_id, queued_by, input_hash
)
VALUES (
  '80000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'group-a-cancellation-test'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT results_eq(
  $$ SELECT count(*)::BIGINT FROM public.latest_snapshots $$,
  $$ VALUES (0::BIGINT) $$,
  'Group B cannot read Group A latest snapshots'
);
SELECT results_eq(
  $$ SELECT count(*)::BIGINT FROM public.latest_stash_items $$,
  $$ VALUES (0::BIGINT) $$,
  'Group B cannot read Group A latest stash items'
);
SELECT throws_like(
  $$
    INSERT INTO public.group_members(group_id, user_id, role)
    VALUES (
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      'admin'
    )
  $$,
  '%row-level security%',
  'Group B cannot self-insert as Group A admin'
);
SELECT throws_like(
  $$
    INSERT INTO public.characters (
      user_id, group_id, poe_character_id, name, league, class, raw_data
    ) VALUES (
      '10000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001',
      'foreign-character', 'Foreign', 'Test League', 'Scion', '{}'::jsonb
    )
  $$,
  '%must belong to its group%',
  'Group B cannot inject a character into Group A'
);
SELECT throws_like(
  $$ SELECT public.cancel_upgrade_analysis_run('80000000-0000-0000-0000-000000000001') $$,
  '%Analysis run is not cancellable%',
  'Group B cannot cancel Group A optimizer runs'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT results_eq(
  $$ SELECT count(*)::BIGINT FROM public.latest_snapshots $$,
  $$ VALUES (1::BIGINT) $$,
  'Group A can read its latest snapshot'
);
SELECT results_eq(
  $$ SELECT count(*)::BIGINT FROM public.latest_stash_items $$,
  $$ VALUES (1::BIGINT) $$,
  'Group A can read its latest stash item'
);
SELECT lives_ok(
  $$ SELECT public.cancel_upgrade_analysis_run('80000000-0000-0000-0000-000000000001') $$,
  'the queuing user can cancel through the narrow RPC'
);
SELECT lives_ok(
  $$
    INSERT INTO public.group_members(group_id, user_id, role)
    VALUES (
      '20000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000001',
      'admin'
    )
  $$,
  'a group creator can perform the transitional first-admin bootstrap'
);
SELECT results_eq(
  $$
    SELECT role::TEXT
    FROM public.group_members
    WHERE group_id = '20000000-0000-0000-0000-000000000003'
      AND user_id = '10000000-0000-0000-0000-000000000001'
  $$,
  $$ VALUES ('admin'::TEXT) $$,
  'transitional bootstrap always creates an admin'
);
SELECT lives_ok(
  $$ SELECT public.create_group_with_owner('Atomic A', 'poe1', 'Test League', NULL, false) $$,
  'atomic group creation succeeds for an authenticated user'
);
SELECT results_eq(
  $$
    SELECT gm.role::TEXT
    FROM public.groups g
    JOIN public.group_members gm ON gm.group_id = g.id
    WHERE g.name = 'Atomic A'
      AND gm.user_id = '10000000-0000-0000-0000-000000000001'
  $$,
  $$ VALUES ('admin'::TEXT) $$,
  'atomic group creation also creates the owner membership'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT lives_ok(
  $$ SELECT public.join_group_by_invite('aaa00001') $$,
  'a valid invite joins the intended group'
);
SELECT results_eq(
  $$
    SELECT role::TEXT
    FROM public.group_members
    WHERE group_id = '20000000-0000-0000-0000-000000000001'
      AND user_id = '10000000-0000-0000-0000-000000000002'
  $$,
  $$ VALUES ('editor'::TEXT) $$,
  'invite joining cannot choose an elevated role'
);

SELECT * FROM finish();
ROLLBACK;
