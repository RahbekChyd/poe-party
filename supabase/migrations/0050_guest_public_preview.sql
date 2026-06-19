CREATE OR REPLACE FUNCTION public.list_public_strategies_for_league(p_league TEXT)
RETURNS TABLE (
  id UUID,
  group_id UUID,
  group_name TEXT,
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
    AND g.league = trim(COALESCE(p_league, ''))
  ORDER BY s.updated_at DESC, s.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_public_strategy_preview(p_strategy_id UUID)
RETURNS TABLE (
  id UUID,
  group_id UUID,
  group_name TEXT,
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
  FROM public.list_public_strategies_for_league((
    SELECT g.league
    FROM public.strategies s
    JOIN public.groups g ON g.id = s.group_id
    WHERE s.id = p_strategy_id
      AND s.source_strategy_id IS NULL
      AND s.is_active = true
      AND s.visibility = 'public'
    LIMIT 1
  ))
  WHERE id = p_strategy_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.search_public_characters_for_league(
  p_league TEXT,
  p_query TEXT
)
RETURNS TABLE (
  profile_id UUID,
  group_id UUID,
  group_name TEXT,
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
    COALESCE(u.display_name, u.poe_account_name, 'Unknown') AS owner_name,
    cps.character_name,
    cps.class,
    cps.ascendancy_class,
    cps.level,
    cps.league
  FROM public.character_profile_snapshots cps
  JOIN public.groups g
    ON g.id = cps.group_id
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
  p_league TEXT,
  p_query TEXT
)
RETURNS TABLE (
  group_id UUID,
  group_name TEXT,
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
    SELECT g.id, g.name, g.league
    FROM public.groups g
    WHERE g.league = trim(COALESCE(p_league, ''))
      AND char_length(trim(COALESCE(p_query, ''))) >= 2
      AND g.name ILIKE '%' || trim(COALESCE(p_query, '')) || '%'
  )
  SELECT
    g.id AS group_id,
    g.name AS group_name,
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
  GROUP BY g.id, g.name, g.league
  HAVING count(cps.id) > 0
  ORDER BY g.name ASC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.list_public_strategies_for_league(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.list_public_strategies_for_league(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_strategy_preview(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_strategy_preview(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_characters_for_league(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.search_public_characters_for_league(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_groups_for_league(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.search_public_groups_for_league(TEXT, TEXT) TO authenticated;
