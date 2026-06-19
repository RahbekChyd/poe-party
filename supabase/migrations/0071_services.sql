-- Services: public marketplace for boss carries, map carries, 5-way hosts, and
-- gold rotas. Mirrors the strategies + public discovery pattern (migration 0069):
-- data lives in the group's workspace, a SECURITY DEFINER RPC exposes the
-- public subset, scoped by (game, league) so PoE1 and PoE2 never collide.

CREATE TYPE public.service_type AS ENUM (
  'boss_carry',
  'map_carry',
  'five_way_host',
  'gold_rota'
);

CREATE TYPE public.service_availability AS ENUM (
  'available',
  'busy',
  'offline'
);

CREATE TABLE public.services (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id              UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  service_type          public.service_type NOT NULL,
  title                 TEXT NOT NULL,
  description           TEXT,
  region                TEXT,
  price_divine          NUMERIC,
  price_min_divine      NUMERIC,
  price_max_divine      NUMERIC,
  poe_ign               TEXT NOT NULL,
  whisper_template      TEXT,
  availability          public.service_availability NOT NULL DEFAULT 'available',
  mod_exclusions        TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  details               JSONB NOT NULL DEFAULT '{}'::jsonb,
  visibility            TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('group_only', 'public')),
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX services_group_id_idx ON public.services(group_id);
CREATE INDEX services_user_id_idx  ON public.services(user_id);
CREATE INDEX services_public_idx   ON public.services(group_id, updated_at DESC)
  WHERE visibility = 'public' AND is_active AND availability <> 'offline';

CREATE TRIGGER services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY services_read_group_members
  ON public.services FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

CREATE POLICY services_insert_own
  ON public.services FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id));

CREATE POLICY services_update_own_or_admin
  ON public.services FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_group_admin(group_id));

CREATE POLICY services_delete_own_or_admin
  ON public.services FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_group_admin(group_id));


-- Public (anon + authenticated) list scoped by game + league.
-- Excludes offline listings so buyers don't see dead entries.
CREATE OR REPLACE FUNCTION public.list_public_services_for_league(
  p_game TEXT,
  p_league TEXT,
  p_service_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id              UUID,
  group_id        UUID,
  group_name      TEXT,
  group_game      TEXT,
  group_league    TEXT,
  user_id         UUID,
  owner_name      TEXT,
  service_type    TEXT,
  title           TEXT,
  description     TEXT,
  region          TEXT,
  price_divine    NUMERIC,
  price_min_divine NUMERIC,
  price_max_divine NUMERIC,
  poe_ign         TEXT,
  whisper_template TEXT,
  availability    TEXT,
  mod_exclusions  TEXT[],
  details         JSONB,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.group_id,
    g.name AS group_name,
    g.game AS group_game,
    g.league AS group_league,
    s.user_id,
    COALESCE(u.display_name, u.poe_account_name, 'Unknown') AS owner_name,
    s.service_type::TEXT,
    s.title,
    s.description,
    s.region,
    s.price_divine,
    s.price_min_divine,
    s.price_max_divine,
    s.poe_ign,
    s.whisper_template,
    s.availability::TEXT,
    s.mod_exclusions,
    s.details,
    s.created_at,
    s.updated_at
  FROM public.services s
  JOIN public.groups g ON g.id = s.group_id
  JOIN public.users  u ON u.id = s.user_id
  WHERE s.visibility = 'public'
    AND s.is_active = true
    AND s.availability <> 'offline'
    AND g.game = trim(COALESCE(p_game, ''))
    AND g.league = trim(COALESCE(p_league, ''))
    AND (
      p_service_type IS NULL
      OR trim(p_service_type) = ''
      OR s.service_type::TEXT = trim(p_service_type)
    )
  ORDER BY s.updated_at DESC, s.created_at DESC;
$$;

-- Public (anon + authenticated) single-service preview. Still restricted to
-- public + active listings.
CREATE OR REPLACE FUNCTION public.get_public_service_preview(p_service_id UUID)
RETURNS TABLE (
  id              UUID,
  group_id        UUID,
  group_name      TEXT,
  group_game      TEXT,
  group_league    TEXT,
  user_id         UUID,
  owner_name      TEXT,
  service_type    TEXT,
  title           TEXT,
  description     TEXT,
  region          TEXT,
  price_divine    NUMERIC,
  price_min_divine NUMERIC,
  price_max_divine NUMERIC,
  poe_ign         TEXT,
  whisper_template TEXT,
  availability    TEXT,
  mod_exclusions  TEXT[],
  details         JSONB,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.group_id,
    g.name AS group_name,
    g.game AS group_game,
    g.league AS group_league,
    s.user_id,
    COALESCE(u.display_name, u.poe_account_name, 'Unknown') AS owner_name,
    s.service_type::TEXT,
    s.title,
    s.description,
    s.region,
    s.price_divine,
    s.price_min_divine,
    s.price_max_divine,
    s.poe_ign,
    s.whisper_template,
    s.availability::TEXT,
    s.mod_exclusions,
    s.details,
    s.created_at,
    s.updated_at
  FROM public.services s
  JOIN public.groups g ON g.id = s.group_id
  JOIN public.users  u ON u.id = s.user_id
  WHERE s.id = p_service_id
    AND s.visibility = 'public'
    AND s.is_active = true
  LIMIT 1;
$$;

-- Authenticated variant that scopes by the viewer's group (game + league).
-- Returns the same shape as list_public_services_for_league so the normalizer
-- can be shared.
CREATE OR REPLACE FUNCTION public.list_public_services(
  p_viewer_group_id UUID,
  p_service_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id              UUID,
  group_id        UUID,
  group_name      TEXT,
  group_game      TEXT,
  group_league    TEXT,
  user_id         UUID,
  owner_name      TEXT,
  service_type    TEXT,
  title           TEXT,
  description     TEXT,
  region          TEXT,
  price_divine    NUMERIC,
  price_min_divine NUMERIC,
  price_max_divine NUMERIC,
  poe_ign         TEXT,
  whisper_template TEXT,
  availability    TEXT,
  mod_exclusions  TEXT[],
  details         JSONB,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH viewer_group AS (
    SELECT g.id, g.game, g.league
    FROM public.groups g
    WHERE g.id = p_viewer_group_id
      AND public.is_group_member(g.id)
  )
  SELECT
    s.id,
    s.group_id,
    g.name AS group_name,
    g.game AS group_game,
    g.league AS group_league,
    s.user_id,
    COALESCE(u.display_name, u.poe_account_name, 'Unknown') AS owner_name,
    s.service_type::TEXT,
    s.title,
    s.description,
    s.region,
    s.price_divine,
    s.price_min_divine,
    s.price_max_divine,
    s.poe_ign,
    s.whisper_template,
    s.availability::TEXT,
    s.mod_exclusions,
    s.details,
    s.created_at,
    s.updated_at
  FROM viewer_group vg
  JOIN public.groups g
    ON g.game = vg.game
   AND g.league = vg.league
  JOIN public.services s
    ON s.group_id = g.id
   AND s.visibility = 'public'
   AND s.is_active = true
   AND s.availability <> 'offline'
  JOIN public.users u ON u.id = s.user_id
  WHERE (
    p_service_type IS NULL
    OR trim(p_service_type) = ''
    OR s.service_type::TEXT = trim(p_service_type)
  )
  ORDER BY s.updated_at DESC, s.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_public_services_for_league(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_service_preview(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_services(UUID, TEXT) TO authenticated;
