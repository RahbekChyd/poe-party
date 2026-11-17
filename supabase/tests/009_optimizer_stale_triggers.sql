BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(28);

SELECT results_eq(
  $$
    SELECT count(*)::BIGINT FROM pg_proc
    WHERE oid IN (
      'public.on_build_target_change_mark_upgrade_runs_stale()'::regprocedure,
      'public.on_build_target_stage_change_mark_upgrade_runs_stale()'::regprocedure,
      'public.on_character_profile_change_mark_upgrade_runs_stale()'::regprocedure,
      'public.on_stash_snapshot_change_mark_upgrade_runs_stale()'::regprocedure,
      'public.on_stash_tab_pricing_change_mark_upgrade_runs_stale()'::regprocedure
    ) AND prosecdef AND 'search_path=pg_catalog, public, pg_temp' = ANY(proconfig)
  $$,
  $$ VALUES (5::BIGINT) $$,
  'all stale-state trigger wrappers have a pinned definer context'
);
SELECT is_empty(
  $$
    SELECT p.oid::regprocedure::TEXT FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND (p.proname = 'mark_upgrade_runs_stale' OR p.proname LIKE 'on_%mark_upgrade_runs_stale')
      AND (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
        OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
      )
  $$,
  'stale-state helper and wrappers are service-only'
);

INSERT INTO auth.users (id, email) VALUES
  ('19000000-0000-0000-0000-000000000001', 'stale-owner-a@example.invalid'),
  ('19000000-0000-0000-0000-000000000002', 'stale-owner-b@example.invalid');
INSERT INTO public.users (id, poe_account_name) VALUES
  ('19000000-0000-0000-0000-000000000001', 'StaleOwnerA#0001'),
  ('19000000-0000-0000-0000-000000000002', 'StaleOwnerB#0002');
INSERT INTO public.groups (id, name, invite_code, created_by, game, league) VALUES
  ('29000000-0000-0000-0000-000000000001', 'Stale A', 'stale001', '19000000-0000-0000-0000-000000000001', 'poe1', 'Test League'),
  ('29000000-0000-0000-0000-000000000002', 'Stale B', 'stale002', '19000000-0000-0000-0000-000000000002', 'poe1', 'Test League');
INSERT INTO public.group_members (group_id, user_id, role) VALUES
  ('29000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', 'admin'),
  ('29000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000002', 'viewer'),
  ('29000000-0000-0000-0000-000000000002', '19000000-0000-0000-0000-000000000002', 'admin');
INSERT INTO public.characters (id, user_id, group_id, poe_character_id, name, league, class, raw_data) VALUES
  ('39000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 'stale-char-a', 'StaleA', 'Test League', 'Scion', '{}'),
  ('39000000-0000-0000-0000-000000000002', '19000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000002', 'stale-char-b', 'StaleB', 'Test League', 'Scion', '{}');
INSERT INTO public.character_profile_snapshots (user_id, group_id, character_id, character_name, league) VALUES
  ('19000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', 'StaleA', 'Test League'),
  ('19000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000002', '39000000-0000-0000-0000-000000000002', 'StaleB', 'Test League');
INSERT INTO public.stash_snapshots (id, user_id, group_id, status)
VALUES ('49000000-0000-0000-0000-000000000004', '19000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 'failed');
INSERT INTO public.stash_tabs (id, snapshot_id, user_id, group_id, poe_tab_id, name, tab_type, tab_index)
VALUES ('49000000-0000-0000-0000-000000000002', '49000000-0000-0000-0000-000000000004', '19000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 'stale-tab', 'Stale Tab', 'NormalStash', 0);
INSERT INTO public.build_targets (id, group_id, user_id, created_by, character_id, name, raw_import) VALUES
  ('69000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', 'Target A', 'test'),
  ('69000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000002', '19000000-0000-0000-0000-000000000002', '19000000-0000-0000-0000-000000000002', '39000000-0000-0000-0000-000000000002', 'Target B', 'test'),
  ('69000000-0000-0000-0000-000000000003', '29000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000002', '19000000-0000-0000-0000-000000000001', NULL, 'Other member target', 'test');
INSERT INTO public.build_target_stages (id, build_target_id, order_index, label, primary_offensive_metric)
VALUES ('59000000-0000-0000-0000-000000000001', '69000000-0000-0000-0000-000000000001', 0, 'Stage A', 'dps');
UPDATE public.build_targets SET selected_stage_id = '59000000-0000-0000-0000-000000000001'
WHERE id = '69000000-0000-0000-0000-000000000001';
INSERT INTO public.upgrade_analysis_runs (id, group_id, build_target_id, target_stage_id, target_user_id, queued_by, character_id, input_hash, status) VALUES
  ('79000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', '69000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', 'stale-a', 'completed'),
  ('79000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000002', '69000000-0000-0000-0000-000000000002', NULL, '19000000-0000-0000-0000-000000000002', '19000000-0000-0000-0000-000000000002', '39000000-0000-0000-0000-000000000002', 'stale-b', 'completed'),
  ('79000000-0000-0000-0000-000000000003', '29000000-0000-0000-0000-000000000001', '69000000-0000-0000-0000-000000000003', NULL, '19000000-0000-0000-0000-000000000002', '19000000-0000-0000-0000-000000000001', NULL, 'stale-a-other', 'completed');
INSERT INTO public.upgrade_recommendation_plans (id, run_id, group_id, target_user_id, target_stage_id, category, kind)
VALUES ('89000000-0000-0000-0000-000000000001', '79000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000001', 'best_single', 'single');
INSERT INTO public.upgrade_recommendation_items (plan_id, run_id, source)
VALUES ('89000000-0000-0000-0000-000000000001', '79000000-0000-0000-0000-000000000001', 'owned');

SET LOCAL ROLE anon;
SELECT throws_like(
  $$ SELECT public.mark_upgrade_runs_stale('29000000-0000-0000-0000-000000000001') $$,
  '%permission denied%', 'anonymous callers cannot invoke the stale-state helper'
);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT results_eq(
  $$ DELETE FROM public.groups WHERE id = '29000000-0000-0000-0000-000000000001' RETURNING id $$,
  $$ SELECT NULL::UUID WHERE false $$, 'a viewer cannot delete the group'
);
SELECT results_eq(
  $$ UPDATE public.build_targets SET name = 'Forbidden' WHERE id = '69000000-0000-0000-0000-000000000001' RETURNING id $$,
  $$ SELECT NULL::UUID WHERE false $$, 'a viewer cannot trigger stale updates through another member target'
);

SELECT set_config('request.jwt.claim.sub', '19000000-0000-0000-0000-000000000001', true);
SELECT throws_like(
  $$ SELECT public.mark_upgrade_runs_stale('29000000-0000-0000-0000-000000000002') $$,
  '%permission denied%', 'authenticated callers cannot directly stale another group'
);
SELECT results_eq(
  $$ DELETE FROM public.groups WHERE id = '29000000-0000-0000-0000-000000000002' RETURNING id $$,
  $$ SELECT NULL::UUID WHERE false $$, 'an unrelated admin cannot delete another group'
);
SELECT throws_like(
  $$ UPDATE public.build_targets SET group_id = '29000000-0000-0000-0000-000000000002' WHERE id = '69000000-0000-0000-0000-000000000001' $$,
  '%must belong to its group%', 'the trigger cannot be redirected to another tenant'
);
SELECT lives_ok(
  $$ UPDATE public.build_targets SET name = 'Updated target' WHERE id = '69000000-0000-0000-0000-000000000001' $$,
  'an authorized target update can invoke the service-only helper'
);
SELECT results_eq(
  $$ SELECT status, stale_reason FROM public.upgrade_analysis_runs WHERE id = '79000000-0000-0000-0000-000000000001' $$,
  $$ VALUES ('stale'::TEXT, 'build-target-updated'::TEXT) $$, 'target edits stale the matching run'
);
SELECT results_eq(
  $$ SELECT status FROM public.upgrade_analysis_runs WHERE id = '79000000-0000-0000-0000-000000000003' $$,
  $$ VALUES ('completed'::TEXT) $$, 'target edits preserve other member runs in the same group'
);
RESET ROLE;
UPDATE public.upgrade_analysis_runs SET status = 'completed', stale_reason = NULL
WHERE group_id = '29000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ UPDATE public.build_target_stages SET label = 'Updated stage' WHERE id = '59000000-0000-0000-0000-000000000001' $$,
  'an authorized stage update can invoke the helper'
);
SELECT results_eq(
  $$ SELECT stale_reason FROM public.upgrade_analysis_runs WHERE id = '79000000-0000-0000-0000-000000000001' $$,
  $$ VALUES ('stage-mapping-updated'::TEXT) $$, 'stage edits stale the matching run'
);
RESET ROLE;
UPDATE public.upgrade_analysis_runs SET status = 'completed', stale_reason = NULL
WHERE group_id = '29000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ UPDATE public.character_profile_snapshots SET level = 90 WHERE group_id = '29000000-0000-0000-0000-000000000001' $$,
  'an authorized character profile update can invoke the helper'
);
SELECT results_eq(
  $$ SELECT stale_reason FROM public.upgrade_analysis_runs WHERE id = '79000000-0000-0000-0000-000000000001' $$,
  $$ VALUES ('character-profile-updated'::TEXT) $$, 'character changes stale the matching user run'
);
SELECT results_eq(
  $$ SELECT status FROM public.upgrade_analysis_runs WHERE id = '79000000-0000-0000-0000-000000000003' $$,
  $$ VALUES ('completed'::TEXT) $$, 'character changes preserve other member runs'
);
RESET ROLE;
UPDATE public.upgrade_analysis_runs SET status = 'completed', stale_reason = NULL
WHERE group_id = '29000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ INSERT INTO public.stash_snapshots (id, user_id, group_id, status)
     VALUES ('49000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 'pending') $$,
  'an authorized stash snapshot can invoke the helper'
);
SELECT results_eq(
  $$ SELECT count(*)::BIGINT FROM public.upgrade_analysis_runs WHERE group_id = '29000000-0000-0000-0000-000000000001' AND status = 'stale' AND stale_reason = 'stash-refreshed' $$,
  $$ VALUES (2::BIGINT) $$, 'stash changes stale all runs in their group'
);
RESET ROLE;
UPDATE public.upgrade_analysis_runs SET status = 'completed', stale_reason = NULL
WHERE group_id = '29000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ UPDATE public.stash_tabs SET estimated_value_chaos = 10 WHERE id = '49000000-0000-0000-0000-000000000002' $$,
  'an authorized stash pricing update can invoke the helper'
);
SELECT results_eq(
  $$ SELECT count(*)::BIGINT FROM public.upgrade_analysis_runs WHERE group_id = '29000000-0000-0000-0000-000000000001' AND status = 'stale' AND stale_reason = 'pricing-refreshed' $$,
  $$ VALUES (2::BIGINT) $$, 'pricing updates stale only runs in their group'
);
RESET ROLE;
SELECT results_eq(
  $$ SELECT status, stale_reason FROM public.upgrade_analysis_runs WHERE id = '79000000-0000-0000-0000-000000000002' $$,
  $$ VALUES ('completed'::TEXT, NULL::TEXT) $$, 'all authorized trigger paths leave the unrelated group unchanged'
);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ DELETE FROM public.build_targets WHERE id = '69000000-0000-0000-0000-000000000003' $$,
  'an admin can delete a build target through its stale-state trigger'
);
RESET ROLE;
SELECT is_empty(
  $$ SELECT id FROM public.upgrade_analysis_runs WHERE id = '79000000-0000-0000-0000-000000000003' $$,
  'target deletion also removes its analysis run'
);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ DELETE FROM public.groups WHERE id = '29000000-0000-0000-0000-000000000001' $$,
  'an admin can delete a group with populated optimizer and character data'
);
RESET ROLE;
SELECT is_empty(
  $$ SELECT id FROM public.groups WHERE id = '29000000-0000-0000-0000-000000000001' $$,
  'the group was actually deleted'
);
SELECT results_eq(
  $$ SELECT
    (SELECT count(*) FROM public.build_targets WHERE group_id = '29000000-0000-0000-0000-000000000001'),
    (SELECT count(*) FROM public.upgrade_analysis_runs WHERE group_id = '29000000-0000-0000-0000-000000000001'),
    (SELECT count(*) FROM public.character_profile_snapshots WHERE group_id = '29000000-0000-0000-0000-000000000001'),
    (SELECT count(*) FROM public.character_profile_daily_snapshots WHERE group_id = '29000000-0000-0000-0000-000000000001'),
    (SELECT count(*) FROM public.stash_tabs WHERE group_id = '29000000-0000-0000-0000-000000000001'),
    (SELECT count(*) FROM public.upgrade_recommendation_plans WHERE group_id = '29000000-0000-0000-0000-000000000001') $$,
  $$ VALUES (0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT) $$,
  'group deletion cascades through character, stash and optimizer children'
);
SELECT results_eq(
  $$ SELECT status FROM public.upgrade_analysis_runs WHERE id = '79000000-0000-0000-0000-000000000002' $$,
  $$ VALUES ('completed'::TEXT) $$, 'group deletion preserves the other group run'
);
SELECT results_eq(
  $$ SELECT count(*)::BIGINT FROM public.groups WHERE id = '29000000-0000-0000-0000-000000000002' $$,
  $$ VALUES (1::BIGINT) $$, 'group deletion preserves the other group'
);

SELECT * FROM finish();
ROLLBACK;
