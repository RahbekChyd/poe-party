-- Store per-user GGG OAuth tokens server-side for Edge Functions.

CREATE TABLE IF NOT EXISTS public.poe_oauth_tokens (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER poe_oauth_tokens_updated_at
  BEFORE UPDATE ON public.poe_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.poe_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "poe_oauth_tokens_service_only"
  ON public.poe_oauth_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
