-- PoE account names are mutable display attributes, not identity keys. A verified
-- new UUID may use the same current name as an unbound or stale cached profile.
-- Preserve every existing profile and its relationships; only UUID ownership is
-- unique. In particular, do not copy memberships, history or billing by name.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_poe_account_name_key;

CREATE INDEX IF NOT EXISTS users_poe_account_name_idx
  ON public.users (poe_account_name);

COMMENT ON COLUMN public.users.poe_account_name IS
  'Cached PoE display name; may repeat across profiles and must never identify an account owner.';

-- The retired cookie flow created profiles from the browser. Only the verified
-- server callback may create them now; otherwise an Auth signup could fabricate
-- a NULL-subject profile with a trusted-looking account name. Table revocation
-- alone does not revoke the column INSERT grants introduced in migration 0075.
REVOKE INSERT ON public.users FROM PUBLIC, anon, authenticated;
REVOKE INSERT (
  id,
  poe_account_name,
  display_name,
  avatar_url,
  avatar_color,
  theme,
  pob_code,
  pob_support_code,
  has_seen_early_access_notice
) ON public.users FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS users_insert_own ON public.users;
GRANT INSERT ON public.users TO service_role;
