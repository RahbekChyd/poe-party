-- Migration: Create users table extending auth.users
-- Stores PoE-specific profile data and (encrypted) OAuth tokens

CREATE TABLE public.users (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  poe_account_name      TEXT NOT NULL UNIQUE,
  -- Tokens stored via Supabase Vault (vault.create_secret / vault.read_secret)
  -- These columns store the vault secret UUIDs, not the raw tokens
  poe_access_token_id   UUID,
  poe_refresh_token_id  UUID,
  poe_token_expires_at  TIMESTAMPTZ,
  display_name          TEXT,
  avatar_url            TEXT,
  created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can read their own row
CREATE POLICY "users_read_own"
  ON public.users FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Users can update their own row (but not token columns — those are updated by Edge Functions)
CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Service role can insert (used by poe-oauth-callback Edge Function)
CREATE POLICY "users_insert_service"
  ON public.users FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "users_update_service"
  ON public.users FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);
