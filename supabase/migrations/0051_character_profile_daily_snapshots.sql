CREATE TABLE public.character_profile_daily_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.character_profile_snapshots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('group_only', 'public')),
  character_name TEXT NOT NULL,
  league TEXT,
  class TEXT,
  ascendancy_class INTEGER,
  level INTEGER,
  gear JSONB NOT NULL DEFAULT '[]'::jsonb,
  inventory JSONB NOT NULL DEFAULT '[]'::jsonb,
  jewels JSONB NOT NULL DEFAULT '[]'::jsonb,
  passive_tree JSONB NOT NULL DEFAULT '{}'::jsonb,
  atlas_tree JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_character JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_league_account JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, character_id, snapshot_date)
);

CREATE INDEX character_profile_daily_snapshots_profile_character_date_idx
  ON public.character_profile_daily_snapshots(profile_id, character_id, snapshot_date DESC);

CREATE INDEX character_profile_daily_snapshots_group_id_idx
  ON public.character_profile_daily_snapshots(group_id);

CREATE TRIGGER character_profile_daily_snapshots_updated_at
  BEFORE UPDATE ON public.character_profile_daily_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.character_profile_daily_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "character_profile_daily_snapshots_read_group_members"
  ON public.character_profile_daily_snapshots FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

CREATE OR REPLACE FUNCTION public.sync_character_profile_daily_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_date DATE;
  v_current_utc_date DATE := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF NEW.character_id IS NULL OR NEW.last_synced_at IS NULL THEN
    RETURN NEW;
  END IF;

  v_snapshot_date := (NEW.last_synced_at AT TIME ZONE 'UTC')::date;

  IF TG_OP = 'UPDATE'
     AND NEW.last_synced_at IS NOT DISTINCT FROM OLD.last_synced_at
     AND v_snapshot_date <> v_current_utc_date THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.character_profile_daily_snapshots (
    profile_id,
    user_id,
    group_id,
    character_id,
    snapshot_date,
    visibility,
    character_name,
    league,
    class,
    ascendancy_class,
    level,
    gear,
    inventory,
    jewels,
    passive_tree,
    atlas_tree,
    raw_character,
    raw_league_account,
    last_synced_at
  )
  VALUES (
    NEW.id,
    NEW.user_id,
    NEW.group_id,
    NEW.character_id,
    v_snapshot_date,
    NEW.visibility,
    NEW.character_name,
    NEW.league,
    NEW.class,
    NEW.ascendancy_class,
    NEW.level,
    NEW.gear,
    NEW.inventory,
    NEW.jewels,
    NEW.passive_tree,
    NEW.atlas_tree,
    NEW.raw_character,
    NEW.raw_league_account,
    NEW.last_synced_at
  )
  ON CONFLICT (profile_id, character_id, snapshot_date) DO UPDATE
  SET
    visibility = EXCLUDED.visibility,
    character_name = EXCLUDED.character_name,
    league = EXCLUDED.league,
    class = EXCLUDED.class,
    ascendancy_class = EXCLUDED.ascendancy_class,
    level = EXCLUDED.level,
    gear = EXCLUDED.gear,
    inventory = EXCLUDED.inventory,
    jewels = EXCLUDED.jewels,
    passive_tree = EXCLUDED.passive_tree,
    atlas_tree = EXCLUDED.atlas_tree,
    raw_character = EXCLUDED.raw_character,
    raw_league_account = EXCLUDED.raw_league_account,
    last_synced_at = EXCLUDED.last_synced_at,
    updated_at = now();

  DELETE FROM public.character_profile_daily_snapshots
  WHERE profile_id = NEW.id
    AND character_id = NEW.character_id
    AND snapshot_date < (v_snapshot_date - 13);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_character_profile_daily_snapshot_trigger
  ON public.character_profile_snapshots;

CREATE TRIGGER sync_character_profile_daily_snapshot_trigger
  AFTER INSERT OR UPDATE OF
    character_id,
    character_name,
    league,
    class,
    ascendancy_class,
    level,
    visibility,
    gear,
    inventory,
    jewels,
    passive_tree,
    atlas_tree,
    raw_character,
    raw_league_account,
    last_synced_at
  ON public.character_profile_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_character_profile_daily_snapshot();

INSERT INTO public.character_profile_daily_snapshots (
  profile_id,
  user_id,
  group_id,
  character_id,
  snapshot_date,
  visibility,
  character_name,
  league,
  class,
  ascendancy_class,
  level,
  gear,
  inventory,
  jewels,
  passive_tree,
  atlas_tree,
  raw_character,
  raw_league_account,
  last_synced_at,
  created_at,
  updated_at
)
SELECT
  cps.id,
  cps.user_id,
  cps.group_id,
  cps.character_id,
  (cps.last_synced_at AT TIME ZONE 'UTC')::date,
  cps.visibility,
  cps.character_name,
  cps.league,
  cps.class,
  cps.ascendancy_class,
  cps.level,
  cps.gear,
  cps.inventory,
  cps.jewels,
  cps.passive_tree,
  cps.atlas_tree,
  cps.raw_character,
  cps.raw_league_account,
  cps.last_synced_at,
  cps.created_at,
  cps.updated_at
FROM public.character_profile_snapshots cps
WHERE cps.character_id IS NOT NULL
  AND cps.last_synced_at IS NOT NULL
ON CONFLICT (profile_id, character_id, snapshot_date) DO UPDATE
SET
  visibility = EXCLUDED.visibility,
  character_name = EXCLUDED.character_name,
  league = EXCLUDED.league,
  class = EXCLUDED.class,
  ascendancy_class = EXCLUDED.ascendancy_class,
  level = EXCLUDED.level,
  gear = EXCLUDED.gear,
  inventory = EXCLUDED.inventory,
  jewels = EXCLUDED.jewels,
  passive_tree = EXCLUDED.passive_tree,
  atlas_tree = EXCLUDED.atlas_tree,
  raw_character = EXCLUDED.raw_character,
  raw_league_account = EXCLUDED.raw_league_account,
  last_synced_at = EXCLUDED.last_synced_at,
  updated_at = EXCLUDED.updated_at;

CREATE OR REPLACE FUNCTION public.get_public_character_daily_snapshot_summaries(
  p_viewer_group_id UUID,
  p_profile_id UUID
)
RETURNS TABLE (
  id UUID,
  snapshot_date DATE,
  last_synced_at TIMESTAMPTZ,
  character_name TEXT,
  class TEXT,
  ascendancy_class INTEGER,
  level INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH viewer_group AS (
    SELECT g.id, g.league
    FROM public.groups g
    WHERE g.id = p_viewer_group_id
      AND public.is_group_member(g.id)
  )
  SELECT
    cpds.id,
    cpds.snapshot_date,
    cpds.last_synced_at,
    cpds.character_name,
    cpds.class,
    cpds.ascendancy_class,
    cpds.level
  FROM viewer_group vg
  JOIN public.character_profile_snapshots cps
    ON cps.id = p_profile_id
   AND cps.visibility = 'public'
   AND cps.character_id IS NOT NULL
  JOIN public.groups g
    ON g.id = cps.group_id
   AND g.league = vg.league
  JOIN public.character_profile_daily_snapshots cpds
    ON cpds.profile_id = cps.id
   AND cpds.character_id = cps.character_id
   AND cpds.visibility = 'public'
  ORDER BY cpds.snapshot_date DESC, cpds.last_synced_at DESC
  LIMIT 14;
$$;

CREATE OR REPLACE FUNCTION public.get_public_character_daily_snapshot_detail(
  p_viewer_group_id UUID,
  p_profile_id UUID,
  p_daily_snapshot_id UUID
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  group_id UUID,
  group_name TEXT,
  owner_name TEXT,
  character_id UUID,
  character_name TEXT,
  league TEXT,
  class TEXT,
  ascendancy_class INTEGER,
  level INTEGER,
  visibility TEXT,
  gear JSONB,
  inventory JSONB,
  jewels JSONB,
  passive_tree JSONB,
  atlas_tree JSONB,
  raw_character JSONB,
  raw_league_account JSONB,
  last_synced_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH viewer_group AS (
    SELECT g.id, g.league
    FROM public.groups g
    WHERE g.id = p_viewer_group_id
      AND public.is_group_member(g.id)
  )
  SELECT
    cpds.id,
    cpds.user_id,
    cpds.group_id,
    g.name AS group_name,
    COALESCE(u.display_name, u.poe_account_name, 'Unknown') AS owner_name,
    cpds.character_id,
    cpds.character_name,
    cpds.league,
    cpds.class,
    cpds.ascendancy_class,
    cpds.level,
    cpds.visibility,
    cpds.gear,
    cpds.inventory,
    cpds.jewels,
    cpds.passive_tree,
    cpds.atlas_tree,
    cpds.raw_character,
    cpds.raw_league_account,
    cpds.last_synced_at
  FROM viewer_group vg
  JOIN public.character_profile_snapshots cps
    ON cps.id = p_profile_id
   AND cps.visibility = 'public'
   AND cps.character_id IS NOT NULL
  JOIN public.groups g
    ON g.id = cps.group_id
   AND g.league = vg.league
  JOIN public.character_profile_daily_snapshots cpds
    ON cpds.id = p_daily_snapshot_id
   AND cpds.profile_id = cps.id
   AND cpds.character_id = cps.character_id
   AND cpds.visibility = 'public'
  JOIN public.users u
    ON u.id = cpds.user_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_character_daily_snapshot_summaries(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_character_daily_snapshot_detail(UUID, UUID, UUID) TO authenticated;
