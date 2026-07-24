BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(6);

SELECT results_eq(
  $$
    SELECT count(*)::BIGINT
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'poe_oauth_tokens'
      AND column_name IN ('access_token', 'refresh_token')
      AND is_nullable = 'YES'
  $$,
  $$ VALUES (2::BIGINT) $$,
  'legacy plaintext token columns are nullable during the expand window'
);

SELECT results_eq(
  $$
    SELECT count(*)::BIGINT
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'poe_oauth_tokens'
      AND column_name IN (
        'access_token_ciphertext',
        'refresh_token_ciphertext',
        'token_ciphertext_version',
        'token_encryption_key_id',
        'refresh_token_fingerprint'
      )
  $$,
  $$ VALUES (5::BIGINT) $$,
  'ciphertext and rotation metadata columns exist'
);

SELECT results_eq(
  $$
    SELECT count(*)::BIGINT
    FROM pg_constraint
    WHERE conrelid = 'public.poe_oauth_tokens'::regclass
      AND conname IN (
        'poe_oauth_tokens_plaintext_pair_check',
        'poe_oauth_tokens_ciphertext_pair_check',
        'poe_oauth_tokens_access_storage_check',
        'poe_oauth_tokens_refresh_storage_check',
        'poe_oauth_tokens_ciphertext_metadata_check'
      )
  $$,
  $$ VALUES (5::BIGINT) $$,
  'token rows retain complete plaintext or ciphertext storage constraints'
);

INSERT INTO auth.users (id, email)
VALUES
  ('10000000-0000-4000-8000-000000000087', 'token-legacy@example.invalid'),
  ('20000000-0000-4000-8000-000000000087', 'token-encrypted@example.invalid');

INSERT INTO public.users (id, poe_account_name)
VALUES
  ('10000000-0000-4000-8000-000000000087', 'TokenLegacy#0087'),
  ('20000000-0000-4000-8000-000000000087', 'TokenEncrypted#0087');

SELECT lives_ok(
  $$
    INSERT INTO public.poe_oauth_tokens(user_id, access_token, refresh_token, expires_at)
    VALUES (
      '10000000-0000-4000-8000-000000000087',
      'legacy-access',
      'legacy-refresh',
      now() + interval '1 hour'
    )
  $$,
  'migration remains compatible with a legacy plaintext writer'
);

SELECT lives_ok(
  $$
    INSERT INTO public.poe_oauth_tokens(
      user_id,
      access_token_ciphertext,
      refresh_token_ciphertext,
      token_ciphertext_version,
      token_encryption_key_id,
      refresh_token_fingerprint,
      expires_at
    )
    VALUES (
      '20000000-0000-4000-8000-000000000087',
      '{"v":1,"kid":"test","n":"nonce","c":"ciphertext"}',
      '{"v":1,"kid":"test","n":"nonce","c":"ciphertext"}',
      1,
      'test',
      'sha256:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      now() + interval '1 hour'
    )
  $$,
  'migration accepts ciphertext-only token rows'
);

SELECT results_eq(
  $$
    SELECT
      count(*) FILTER (WHERE access_token IS NOT NULL)::BIGINT,
      count(*) FILTER (WHERE access_token_ciphertext IS NOT NULL)::BIGINT
    FROM public.poe_oauth_tokens
    WHERE user_id IN (
      '10000000-0000-4000-8000-000000000087',
      '20000000-0000-4000-8000-000000000087'
    )
  $$,
  $$ VALUES (1::BIGINT, 1::BIGINT) $$,
  'legacy and encrypted rows coexist during staged backfill'
);

SELECT * FROM finish();
ROLLBACK;
