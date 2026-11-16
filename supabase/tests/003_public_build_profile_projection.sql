BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(6);

INSERT INTO auth.users (id, email)
VALUES ('11000000-0000-0000-0000-000000000001', 'public-profile@example.invalid');

INSERT INTO public.users (id, poe_account_name, display_name)
VALUES (
  '11000000-0000-0000-0000-000000000001',
  'PublicProfile#0001',
  'Public Profile'
);

INSERT INTO public.groups (id, name, invite_code, created_by, game, league)
VALUES (
  '21000000-0000-0000-0000-000000000001',
  'Public Builds',
  'public01',
  '11000000-0000-0000-0000-000000000001',
  'poe1',
  'Test League'
);

INSERT INTO public.group_members (group_id, user_id, role)
VALUES (
  '21000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  'admin'
);

INSERT INTO public.character_profile_snapshots (
  id,
  user_id,
  group_id,
  character_name,
  visibility,
  gear,
  jewels,
  passive_tree,
  atlas_tree,
  raw_character,
  raw_league_account,
  inventory
)
VALUES (
  '61000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  'PublicCharacter',
  'public',
  '[{"id":"gear-secret","note":"gear-note","name":"Body Armour","socketedItems":[{"id":"socket-secret","note":"socket-note","name":"Skill Gem"}]}]'::JSONB,
  '[{"id":"jewel-secret","note":"jewel-note","name":"Jewel","socketedItems":[{"id":"jewel-socket-secret","note":"jewel-socket-note","name":"Support Gem"}]}]'::JSONB,
  '{"hashes":[1,2,3]}'::JSONB,
  '{"sensitive":"atlas"}'::JSONB,
  '{"sensitive":"character"}'::JSONB,
  '{"sensitive":"league-account"}'::JSONB,
  '[{"id":"inventory-secret"}]'::JSONB
);

SET LOCAL ROLE anon;

SELECT results_eq(
  $$ SELECT count(*)::BIGINT FROM public.get_public_build_profile_preview('61000000-0000-0000-0000-000000000001') $$,
  $$ VALUES (1::BIGINT) $$,
  'anonymous users can read an explicitly public build profile'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.get_public_build_profile_preview('61000000-0000-0000-0000-000000000001') profile
    WHERE profile.gear->0 ? 'id'
      OR profile.jewels->0 ? 'id'
  ),
  'top-level item ids are removed from the public projection'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.get_public_build_profile_preview('61000000-0000-0000-0000-000000000001') profile
    WHERE profile.gear->0->'socketedItems'->0 ? 'id'
      OR profile.jewels->0->'socketedItems'->0 ? 'id'
  ),
  'socketed item ids are removed from the public projection'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.get_public_build_profile_preview('61000000-0000-0000-0000-000000000001') profile
    WHERE profile.gear->0 ? 'note'
      OR profile.gear->0->'socketedItems'->0 ? 'note'
      OR profile.jewels->0 ? 'note'
      OR profile.jewels->0->'socketedItems'->0 ? 'note'
  ),
  'private item notes are removed from the public projection'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.get_public_build_profile_preview('61000000-0000-0000-0000-000000000001') profile
    WHERE to_jsonb(profile) ?| ARRAY[
      'user_id',
      'character_id',
      'atlas_tree',
      'raw_character',
      'raw_league_account',
      'inventory'
    ]
  ),
  'private identity and raw profile fields are absent from the contract'
);

RESET ROLE;
UPDATE public.character_profile_snapshots
SET visibility = 'group_only'
WHERE id = '61000000-0000-0000-0000-000000000001';
SET LOCAL ROLE anon;

SELECT results_eq(
  $$ SELECT count(*)::BIGINT FROM public.get_public_build_profile_preview('61000000-0000-0000-0000-000000000001') $$,
  $$ VALUES (0::BIGINT) $$,
  'group-only build profiles are not exposed publicly'
);

SELECT * FROM finish();
ROLLBACK;
