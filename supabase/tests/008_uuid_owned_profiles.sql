BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(18);

INSERT INTO auth.users (id, email)
VALUES
  ('10000000-0000-4000-8000-000000000089', 'identity-legacy@example.invalid'),
  ('20000000-0000-4000-8000-000000000089', 'identity-fresh@example.invalid'),
  ('30000000-0000-4000-8000-000000000089', 'identity-other@example.invalid'),
  ('60000000-0000-4000-8000-000000000089', 'identity-unverified@example.invalid');

INSERT INTO public.users (id, poe_account_name, subscription_tier, subscription_expires_at)
VALUES ('10000000-0000-4000-8000-000000000089', 'SharedDisplay#0089', 'pro', now() + interval '30 days');

INSERT INTO public.groups (id, name, invite_code, created_by, game, league)
VALUES ('40000000-0000-4000-8000-000000000089', 'Legacy identity group', 'id000089',
  '10000000-0000-4000-8000-000000000089', 'poe1', 'Test League');

INSERT INTO public.group_members (group_id, user_id, role)
VALUES ('40000000-0000-4000-8000-000000000089', '10000000-0000-4000-8000-000000000089', 'admin');

INSERT INTO public.stash_snapshots (id, user_id, group_id, status, completed_at)
VALUES ('50000000-0000-4000-8000-000000000089', '10000000-0000-4000-8000-000000000089',
  '40000000-0000-4000-8000-000000000089', 'completed', now());

INSERT INTO public.billing_customers (user_id, stripe_customer_id)
VALUES ('10000000-0000-4000-8000-000000000089', 'cus_identity_fixture_0089');

SET LOCAL ROLE service_role;

SELECT lives_ok($$
  INSERT INTO public.users (id, poe_account_name, poe_account_sub)
  VALUES ('20000000-0000-4000-8000-000000000089', 'SharedDisplay#0089', 'aaaaaaaa-bbbb-4ccc-8ddd-000000000089')
$$, 'a fresh verified UUID can use a name already cached on a legacy profile');

SELECT lives_ok($$
  INSERT INTO public.users (id, poe_account_name, poe_account_sub)
  VALUES ('30000000-0000-4000-8000-000000000089', 'SharedDisplay#0089', 'aaaaaaaa-bbbb-4ccc-8ddd-000000000099')
$$, 'different verified UUIDs may retain the same cached display name');

RESET ROLE;

SELECT is((SELECT count(*) FROM public.users WHERE poe_account_name = 'SharedDisplay#0089'),
  3::BIGINT, 'same-name profiles remain separate rows');

SELECT throws_ok($$
  UPDATE public.users SET poe_account_sub = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000089'
  WHERE id = '30000000-0000-4000-8000-000000000089'
$$, '23505', 'duplicate key value violates unique constraint "users_poe_account_sub_key"',
  'an immutable provider UUID still has exactly one profile owner');

SELECT ok((SELECT poe_account_sub IS NULL FROM public.users WHERE id = '10000000-0000-4000-8000-000000000089'),
  'fresh registration does not bind the legacy profile');

SELECT is((SELECT created_by FROM public.groups WHERE id = '40000000-0000-4000-8000-000000000089'),
  '10000000-0000-4000-8000-000000000089'::UUID, 'legacy group ownership is retained');

SELECT is((SELECT user_id FROM public.stash_snapshots WHERE id = '50000000-0000-4000-8000-000000000089'),
  '10000000-0000-4000-8000-000000000089'::UUID, 'legacy snapshot ownership is retained');

SELECT is((SELECT user_id FROM public.billing_customers WHERE stripe_customer_id = 'cus_identity_fixture_0089'),
  '10000000-0000-4000-8000-000000000089'::UUID, 'legacy billing is not reassigned by display name');

SELECT is((SELECT subscription_tier FROM public.users WHERE id = '20000000-0000-4000-8000-000000000089'),
  'free', 'a fresh profile does not inherit the legacy subscription');

SELECT is((SELECT count(*) FROM public.group_members WHERE user_id = '20000000-0000-4000-8000-000000000089'),
  0::BIGINT, 'a fresh profile does not inherit legacy membership');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000089","role":"authenticated"}', true);

SELECT lives_ok($$
  UPDATE public.users SET display_name = 'Fresh owner preference'
  WHERE id = '20000000-0000-4000-8000-000000000089'
$$, 'authenticated owners retain profile-preference UPDATE access');

SELECT is((SELECT display_name FROM public.users WHERE id = '20000000-0000-4000-8000-000000000089'),
  'Fresh owner preference', 'authenticated owners can still read their own profile');

SELECT is((SELECT count(*) FROM public.groups WHERE id = '40000000-0000-4000-8000-000000000089'),
  0::BIGINT, 'same display name does not grant read access to the legacy group');

SELECT is((SELECT count(*) FROM public.stash_snapshots WHERE id = '50000000-0000-4000-8000-000000000089'),
  0::BIGINT, 'same display name does not grant read access to legacy history');

SELECT is((SELECT count(*) FROM public.users WHERE id = '10000000-0000-4000-8000-000000000089'),
  0::BIGINT, 'same display name does not expose the old private profile');

SELECT throws_ok($$
  UPDATE public.users SET poe_account_sub = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000099'
  WHERE id = '20000000-0000-4000-8000-000000000089'
$$, '42501', 'permission denied for table users', 'clients still cannot reassign provider UUID ownership');

SELECT ok(NOT has_any_column_privilege('authenticated', 'public.users', 'INSERT'),
  'authenticated clients have no table or column INSERT privilege on profiles');

SELECT set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000089","role":"authenticated"}', true);
SELECT throws_ok($$
  INSERT INTO public.users (id, poe_account_name)
  VALUES ('60000000-0000-4000-8000-000000000089', 'SharedDisplay#0089')
$$, '42501', 'permission denied for table users',
  'an Auth signup cannot forge its own NULL-subject profile with a chosen account name');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
