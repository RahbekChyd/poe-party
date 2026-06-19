-- Scope public discovery and subscriptions by both game and league so PoE1 and
-- PoE2 workspaces never see each other's data when league names overlap.

DROP FUNCTION IF EXISTS public.get_public_strategy_detail(UUID, UUID);
DROP FUNCTION IF EXISTS public.list_public_strategies(UUID);
DROP FUNCTION IF EXISTS public.search_public_characters(UUID, TEXT);
DROP FUNCTION IF EXISTS public.search_public_groups(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_public_group_detail(UUID, UUID);
DROP FUNCTION IF EXISTS public.get_public_strategy_preview(UUID);
DROP FUNCTION IF EXISTS public.list_public_strategies_for_league(TEXT);
DROP FUNCTION IF EXISTS public.search_public_characters_for_league(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.search_public_groups_for_league(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.list_public_strategies(p_viewer_group_id UUID)
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
  benchmark_chaos_per_hour NUMERIC,
  live_subscription_id UUID
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
    bench.chaos_per_hour AS benchmark_chaos_per_hour,
    live_copy.id AS live_subscription_id
  FROM viewer_group vg
  JOIN public.groups g
    ON g.league = vg.league
   AND g.game = vg.game
  JOIN public.strategies s
    ON s.group_id = g.id
   AND s.source_strategy_id IS NULL
   AND s.is_active = true
   AND s.visibility = 'public'
   AND s.group_id <> vg.id
  LEFT JOIN LATERAL public.get_strategy_benchmark(s.id) bench ON true
  LEFT JOIN public.strategies live_copy
    ON live_copy.group_id = vg.id
   AND live_copy.source_strategy_id = s.id
   AND live_copy.subscription_state = 'live'
   AND live_copy.is_active = true
  ORDER BY s.updated_at DESC, s.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_public_strategy_detail(
  p_viewer_group_id UUID,
  p_strategy_id UUID
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
  benchmark_chaos_per_hour NUMERIC,
  live_subscription_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.list_public_strategies(p_viewer_group_id)
  WHERE id = p_strategy_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.search_public_characters(
  p_viewer_group_id UUID,
  p_query TEXT
)
RETURNS TABLE (
  profile_id UUID,
  group_id UUID,
  group_name TEXT,
  group_game TEXT,
  owner_name TEXT,
  character_name TEXT,
  class TEXT,
  ascendancy_class INTEGER,
  level INTEGER,
  league TEXT
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
    cps.id AS profile_id,
    cps.group_id,
    g.name AS group_name,
    g.game AS group_game,
    COALESCE(u.display_name, u.poe_account_name, 'Unknown') AS owner_name,
    cps.character_name,
    cps.class,
    cps.ascendancy_class,
    cps.level,
    cps.league
  FROM viewer_group vg
  JOIN public.character_profile_snapshots cps
    ON cps.visibility = 'public'
  JOIN public.groups g
    ON g.id = cps.group_id
   AND g.league = vg.league
   AND g.game = vg.game
  JOIN public.users u
    ON u.id = cps.user_id
  WHERE cps.character_name ILIKE '%' || trim(COALESCE(p_query, '')) || '%'
  ORDER BY cps.character_name ASC
  LIMIT 40;
$$;

CREATE OR REPLACE FUNCTION public.search_public_groups(
  p_viewer_group_id UUID,
  p_query TEXT
)
RETURNS TABLE (
  group_id UUID,
  group_name TEXT,
  game TEXT,
  league TEXT,
  public_character_count INTEGER,
  characters JSONB
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
  ),
  matched_groups AS (
    SELECT g.id, g.name, g.game, g.league
    FROM viewer_group vg
    JOIN public.groups g
      ON g.league = vg.league
     AND g.game = vg.game
    WHERE g.name ILIKE '%' || trim(COALESCE(p_query, '')) || '%'
  )
  SELECT
    g.id AS group_id,
    g.name AS group_name,
    g.game,
    g.league,
    count(cps.id)::INTEGER AS public_character_count,
    jsonb_agg(
      jsonb_build_object(
        'profile_id', cps.id,
        'character_name', cps.character_name,
        'class', cps.class,
        'ascendancy_class', cps.ascendancy_class,
        'level', cps.level,
        'owner_name', COALESCE(u.display_name, u.poe_account_name, 'Unknown')
      )
      ORDER BY cps.character_name ASC
    ) AS characters
  FROM matched_groups g
  JOIN public.character_profile_snapshots cps
    ON cps.group_id = g.id
   AND cps.visibility = 'public'
  JOIN public.users u
    ON u.id = cps.user_id
  GROUP BY g.id, g.name, g.game, g.league
  HAVING count(cps.id) > 0
  ORDER BY g.name ASC
  LIMIT 20;
$$;

CREATE OR REPLACE FUNCTION public.get_public_group_detail(
  p_viewer_group_id UUID,
  p_group_id UUID
)
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
  WITH viewer_group AS (
    SELECT g.id, g.game, g.league
    FROM public.groups g
    WHERE g.id = p_viewer_group_id
      AND public.is_group_member(g.id)
  )
  SELECT
    g.id AS group_id,
    g.name AS group_name,
    g.game,
    g.league,
    count(cps.id)::INTEGER AS public_character_count
  FROM viewer_group vg
  JOIN public.groups g
    ON g.id = p_group_id
   AND g.league = vg.league
   AND g.game = vg.game
  JOIN public.character_profile_snapshots cps
    ON cps.group_id = g.id
   AND cps.visibility = 'public'
  GROUP BY g.id, g.name, g.game, g.league
  HAVING count(cps.id) > 0
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.list_public_group_characters(
  p_viewer_group_id UUID,
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
  WITH viewer_group AS (
    SELECT g.id, g.game, g.league
    FROM public.groups g
    WHERE g.id = p_viewer_group_id
      AND public.is_group_member(g.id)
  )
  SELECT
    cps.id AS profile_id,
    COALESCE(u.display_name, u.poe_account_name, 'Unknown') AS owner_name,
    cps.character_name,
    cps.class,
    cps.ascendancy_class,
    cps.level
  FROM viewer_group vg
  JOIN public.groups g
    ON g.id = p_group_id
   AND g.league = vg.league
   AND g.game = vg.game
  JOIN public.character_profile_snapshots cps
    ON cps.group_id = g.id
   AND cps.visibility = 'public'
   AND (p_exclude_profile_id IS NULL OR cps.id <> p_exclude_profile_id)
  JOIN public.users u
    ON u.id = cps.user_id
  ORDER BY cps.character_name ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_public_character_detail(
  p_viewer_group_id UUID,
  p_profile_id UUID
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
    SELECT g.id, g.game, g.league
    FROM public.groups g
    WHERE g.id = p_viewer_group_id
      AND public.is_group_member(g.id)
  )
  SELECT
    cps.id,
    cps.user_id,
    cps.group_id,
    g.name AS group_name,
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
  FROM viewer_group vg
  JOIN public.character_profile_snapshots cps
    ON cps.id = p_profile_id
   AND cps.visibility = 'public'
  JOIN public.groups g
    ON g.id = cps.group_id
   AND g.league = vg.league
   AND g.game = vg.game
  JOIN public.users u
    ON u.id = cps.user_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.subscribe_to_public_strategy(
  p_viewer_group_id UUID,
  p_source_strategy_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.strategies%ROWTYPE;
  v_target_group public.groups%ROWTYPE;
  v_existing_live UUID;
  v_new_id UUID;
BEGIN
  IF NOT public.is_group_editor(p_viewer_group_id) THEN
    RAISE EXCEPTION 'Only admins or editors can subscribe to public strategies.';
  END IF;

  SELECT *
  INTO v_target_group
  FROM public.groups
  WHERE id = p_viewer_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target group not found.';
  END IF;

  SELECT *
  INTO v_source
  FROM public.strategies
  WHERE id = p_source_strategy_id
    AND source_strategy_id IS NULL
    AND is_active = true
    AND visibility = 'public';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Public strategy not found.';
  END IF;

  IF v_source.group_id = p_viewer_group_id THEN
    RAISE EXCEPTION 'You cannot subscribe to a strategy from the same group.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.groups source_group
    WHERE source_group.id = v_source.group_id
      AND (
        source_group.game <> v_target_group.game
        OR source_group.league <> v_target_group.league
      )
  ) THEN
    RAISE EXCEPTION 'Public strategy must be in the same game and league as the active group.';
  END IF;

  SELECT id
  INTO v_existing_live
  FROM public.strategies
  WHERE group_id = p_viewer_group_id
    AND source_strategy_id = p_source_strategy_id
    AND subscription_state = 'live'
    AND is_active = true
  LIMIT 1;

  IF v_existing_live IS NOT NULL THEN
    RETURN v_existing_live;
  END IF;

  INSERT INTO public.strategies (
    group_id,
    name,
    description,
    colour,
    difficulty,
    is_active,
    created_by,
    atlas_tree_url,
    scarabs,
    map_trade_link,
    map_requirements,
    map_cost,
    admin_locked,
    visibility,
    source_strategy_id,
    source_group_id,
    source_group_name,
    subscription_state,
    last_synced_from_source_at
  )
  SELECT
    p_viewer_group_id,
    s.name,
    s.description,
    s.colour,
    s.difficulty,
    true,
    auth.uid(),
    s.atlas_tree_url,
    s.scarabs,
    s.map_trade_link,
    s.map_requirements,
    s.map_cost,
    true,
    'group_only',
    s.id,
    s.group_id,
    source_group.name,
    'live',
    timezone('utc', now())
  FROM public.strategies s
  JOIN public.groups source_group
    ON source_group.id = s.group_id
  WHERE s.id = p_source_strategy_id
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

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
    SELECT g.id, g.game, g.league
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
   AND g.game = vg.game
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
    SELECT g.id, g.game, g.league
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
   AND g.game = vg.game
  JOIN public.character_profile_daily_snapshots cpds
    ON cpds.id = p_daily_snapshot_id
   AND cpds.profile_id = cps.id
   AND cpds.character_id = cps.character_id
   AND cpds.visibility = 'public'
  JOIN public.users u
    ON u.id = cpds.user_id
  LIMIT 1;
$$;

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

CREATE OR REPLACE FUNCTION public.search_public_characters_for_league(
  p_game TEXT,
  p_league TEXT,
  p_query TEXT
)
RETURNS TABLE (
  profile_id UUID,
  group_id UUID,
  group_name TEXT,
  group_game TEXT,
  owner_name TEXT,
  character_name TEXT,
  class TEXT,
  ascendancy_class INTEGER,
  level INTEGER,
  league TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cps.id AS profile_id,
    cps.group_id,
    g.name AS group_name,
    g.game AS group_game,
    COALESCE(u.display_name, u.poe_account_name, 'Unknown') AS owner_name,
    cps.character_name,
    cps.class,
    cps.ascendancy_class,
    cps.level,
    cps.league
  FROM public.character_profile_snapshots cps
  JOIN public.groups g
    ON g.id = cps.group_id
   AND g.game = trim(COALESCE(p_game, ''))
   AND g.league = trim(COALESCE(p_league, ''))
  JOIN public.users u
    ON u.id = cps.user_id
  WHERE cps.visibility = 'public'
    AND char_length(trim(COALESCE(p_query, ''))) >= 2
    AND cps.character_name ILIKE '%' || trim(COALESCE(p_query, '')) || '%'
  ORDER BY cps.character_name ASC
  LIMIT 40;
$$;

CREATE OR REPLACE FUNCTION public.search_public_groups_for_league(
  p_game TEXT,
  p_league TEXT,
  p_query TEXT
)
RETURNS TABLE (
  group_id UUID,
  group_name TEXT,
  game TEXT,
  league TEXT,
  public_character_count INTEGER,
  characters JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH matched_groups AS (
    SELECT g.id, g.name, g.game, g.league
    FROM public.groups g
    WHERE g.game = trim(COALESCE(p_game, ''))
      AND g.league = trim(COALESCE(p_league, ''))
      AND char_length(trim(COALESCE(p_query, ''))) >= 2
      AND g.name ILIKE '%' || trim(COALESCE(p_query, '')) || '%'
  )
  SELECT
    g.id AS group_id,
    g.name AS group_name,
    g.game,
    g.league,
    count(cps.id)::INTEGER AS public_character_count,
    jsonb_agg(
      jsonb_build_object(
        'profile_id', cps.id,
        'character_name', cps.character_name,
        'class', cps.class,
        'ascendancy_class', cps.ascendancy_class,
        'level', cps.level,
        'owner_name', COALESCE(u.display_name, u.poe_account_name, 'Unknown')
      )
      ORDER BY cps.character_name ASC
    ) AS characters
  FROM matched_groups g
  JOIN public.character_profile_snapshots cps
    ON cps.group_id = g.id
   AND cps.visibility = 'public'
  JOIN public.users u
    ON u.id = cps.user_id
  GROUP BY g.id, g.name, g.game, g.league
  HAVING count(cps.id) > 0
  ORDER BY g.name ASC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.list_public_strategies(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_strategy_detail(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_characters(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_groups(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_character_detail(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_group_detail(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_group_characters(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_character_daily_snapshot_summaries(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_character_daily_snapshot_detail(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.subscribe_to_public_strategy(UUID, UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION public.list_public_strategies_for_league(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.list_public_strategies_for_league(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_strategy_preview(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_strategy_preview(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_characters_for_league(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.search_public_characters_for_league(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_groups_for_league(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.search_public_groups_for_league(TEXT, TEXT, TEXT) TO authenticated;
