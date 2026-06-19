-- Let creators see their own public strategies in the same public library view
-- that other groups use. Subscribing to your own strategy remains blocked by
-- subscribe_to_public_strategy.

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
  LEFT JOIN LATERAL public.get_strategy_benchmark(s.id) bench ON true
  LEFT JOIN public.strategies live_copy
    ON live_copy.group_id = vg.id
   AND live_copy.source_strategy_id = s.id
   AND live_copy.subscription_state = 'live'
   AND live_copy.is_active = true
  ORDER BY s.updated_at DESC, s.created_at DESC;
$$;
