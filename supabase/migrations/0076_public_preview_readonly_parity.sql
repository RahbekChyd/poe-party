-- Keep anonymous Community previews aligned with signed-in public Community views.
-- These functions expose only rows already marked public and omit authenticated-only actions.

DROP FUNCTION IF EXISTS public.get_public_strategy_preview(UUID);
DROP FUNCTION IF EXISTS public.list_public_strategies_for_league(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.list_public_strategies_for_league(
  p_game TEXT,
  p_league TEXT
)
RETURNS TABLE (
  id UUID,
  group_id UUID,
  group_name TEXT,
  group_game TEXT,
  group_league TEXT,
  name TEXT,
  description TEXT,
  colour TEXT,
  difficulty TEXT,
  created_at TIMESTAMPTZ,
  atlas_tree_url TEXT,
  scarabs JSONB,
  map_trade_link TEXT,
  map_requirements JSONB,
  map_cost INTEGER,
  benchmark_sample_count INTEGER,
  benchmark_chaos_per_hour NUMERIC
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
    s.name,
    s.description,
    s.colour,
    s.difficulty,
    s.created_at,
    s.atlas_tree_url,
    s.scarabs,
    s.map_trade_link,
    s.map_requirements,
    s.map_cost,
    COALESCE(bench.sample_count, 0) AS benchmark_sample_count,
    bench.chaos_per_hour AS benchmark_chaos_per_hour
  FROM public.strategies s
  JOIN public.groups g
    ON g.id = s.group_id
  LEFT JOIN LATERAL public.get_strategy_benchmark(s.id) bench ON true
  WHERE s.source_strategy_id IS NULL
    AND s.is_active = true
    AND s.visibility = 'public'
    AND g.game = trim(COALESCE(p_game, ''))
    AND g.league = trim(COALESCE(p_league, ''))
  ORDER BY s.updated_at DESC, s.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_public_strategy_preview(p_strategy_id UUID)
RETURNS TABLE (
  id UUID,
  group_id UUID,
  group_name TEXT,
  group_game TEXT,
  group_league TEXT,
  name TEXT,
  description TEXT,
  colour TEXT,
  difficulty TEXT,
  created_at TIMESTAMPTZ,
  atlas_tree_url TEXT,
  scarabs JSONB,
  map_trade_link TEXT,
  map_requirements JSONB,
  map_cost INTEGER,
  benchmark_sample_count INTEGER,
  benchmark_chaos_per_hour NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.list_public_strategies_for_league(
    (
      SELECT g.game
      FROM public.strategies s
      JOIN public.groups g ON g.id = s.group_id
      WHERE s.id = p_strategy_id
        AND s.source_strategy_id IS NULL
        AND s.is_active = true
        AND s.visibility = 'public'
      LIMIT 1
    ),
    (
      SELECT g.league
      FROM public.strategies s
      JOIN public.groups g ON g.id = s.group_id
      WHERE s.id = p_strategy_id
        AND s.source_strategy_id IS NULL
        AND s.is_active = true
        AND s.visibility = 'public'
      LIMIT 1
    )
  )
  WHERE id = p_strategy_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_public_character_detail_preview(p_profile_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  group_id UUID,
  group_name TEXT,
  group_game TEXT,
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
  SELECT
    cps.id,
    cps.user_id,
    cps.group_id,
    g.name AS group_name,
    g.game AS group_game,
    COALESCE(u.display_name, u.poe_account_name, 'Unknown') AS owner_name,
    cps.character_id,
    cps.character_name,
    cps.league,
    cps.class,
    cps.ascendancy_class,
    cps.level,
    cps.visibility,
    cps.gear,
    cps.inventory,
    cps.jewels,
    cps.passive_tree,
    cps.atlas_tree,
    cps.raw_character,
    cps.raw_league_account,
    cps.last_synced_at
  FROM public.character_profile_snapshots cps
  JOIN public.groups g
    ON g.id = cps.group_id
  JOIN public.users u
    ON u.id = cps.user_id
  WHERE cps.id = p_profile_id
    AND cps.visibility = 'public'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_public_group_detail_preview(p_group_id UUID)
RETURNS TABLE (
  group_id UUID,
  group_name TEXT,
  game TEXT,
  league TEXT,
  public_character_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    g.id AS group_id,
    g.name AS group_name,
    g.game,
    g.league,
    count(cps.id)::INTEGER AS public_character_count
  FROM public.groups g
  JOIN public.character_profile_snapshots cps
    ON cps.group_id = g.id
   AND cps.visibility = 'public'
  WHERE g.id = p_group_id
  GROUP BY g.id, g.name, g.game, g.league
  HAVING count(cps.id) > 0
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.list_public_group_characters_preview(
  p_group_id UUID,
  p_exclude_profile_id UUID DEFAULT NULL
)
RETURNS TABLE (
  profile_id UUID,
  owner_name TEXT,
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
  SELECT
    cps.id AS profile_id,
    COALESCE(u.display_name, u.poe_account_name, 'Unknown') AS owner_name,
    cps.character_name,
    cps.class,
    cps.ascendancy_class,
    cps.level
  FROM public.character_profile_snapshots cps
  JOIN public.users u
    ON u.id = cps.user_id
  WHERE cps.group_id = p_group_id
    AND cps.visibility = 'public'
    AND (p_exclude_profile_id IS NULL OR cps.id <> p_exclude_profile_id)
  ORDER BY cps.character_name ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_public_character_daily_snapshot_summaries_preview(
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
  SELECT
    cpds.id,
    cpds.snapshot_date,
    cpds.last_synced_at,
    cpds.character_name,
    cpds.class,
    cpds.ascendancy_class,
    cpds.level
  FROM public.character_profile_snapshots cps
  JOIN public.character_profile_daily_snapshots cpds
    ON cpds.profile_id = cps.id
   AND cpds.character_id = cps.character_id
   AND cpds.visibility = 'public'
  WHERE cps.id = p_profile_id
    AND cps.visibility = 'public'
    AND cps.character_id IS NOT NULL
  ORDER BY cpds.snapshot_date DESC, cpds.last_synced_at DESC
  LIMIT 14;
$$;

CREATE OR REPLACE FUNCTION public.get_public_character_daily_snapshot_detail_preview(
  p_profile_id UUID,
  p_daily_snapshot_id UUID
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  group_id UUID,
  group_name TEXT,
  group_game TEXT,
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
  SELECT
    cpds.id,
    cpds.user_id,
    cpds.group_id,
    g.name AS group_name,
    g.game AS group_game,
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
  FROM public.character_profile_snapshots cps
  JOIN public.groups g
    ON g.id = cps.group_id
  JOIN public.character_profile_daily_snapshots cpds
    ON cpds.id = p_daily_snapshot_id
   AND cpds.profile_id = cps.id
   AND cpds.character_id = cps.character_id
   AND cpds.visibility = 'public'
  JOIN public.users u
    ON u.id = cpds.user_id
  WHERE cps.id = p_profile_id
    AND cps.visibility = 'public'
    AND cps.character_id IS NOT NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.list_public_strategies_for_league(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_strategy_preview(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_character_detail_preview(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_group_detail_preview(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_group_characters_preview(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_character_daily_snapshot_summaries_preview(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_character_daily_snapshot_detail_preview(UUID, UUID) TO anon, authenticated;
