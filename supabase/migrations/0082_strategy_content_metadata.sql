-- Add editorial content metadata for public strategy pages and generated imports.
-- The metadata is descriptive only; existing RLS and public visibility rules still
-- control which strategies can be read, copied, or edited.

ALTER TABLE public.strategies
  ADD COLUMN IF NOT EXISTS content_slug TEXT,
  ADD COLUMN IF NOT EXISTS content_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.strategies
  DROP CONSTRAINT IF EXISTS strategies_content_metadata_object_check;

ALTER TABLE public.strategies
  ADD CONSTRAINT strategies_content_metadata_object_check
  CHECK (jsonb_typeof(content_metadata) = 'object');

CREATE UNIQUE INDEX IF NOT EXISTS strategies_content_slug_unique_idx
  ON public.strategies (content_slug)
  WHERE content_slug IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_strategy_content_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.content_slug := NULL;
      NEW.content_metadata := '{}'::jsonb;
    ELSE
      NEW.content_slug := OLD.content_slug;
      NEW.content_metadata := OLD.content_metadata;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_strategy_content_metadata_trigger ON public.strategies;
CREATE TRIGGER protect_strategy_content_metadata_trigger
  BEFORE INSERT OR UPDATE OF content_slug, content_metadata
  ON public.strategies
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_strategy_content_metadata();

DROP FUNCTION IF EXISTS public.get_public_strategy_detail(UUID, UUID);
DROP FUNCTION IF EXISTS public.list_public_strategies(UUID);
DROP FUNCTION IF EXISTS public.get_public_strategy_preview(UUID);
DROP FUNCTION IF EXISTS public.list_public_strategies_for_league(TEXT, TEXT);

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
  content_slug TEXT,
  content_metadata JSONB,
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
    s.content_slug,
    s.content_metadata,
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
  content_slug TEXT,
  content_metadata JSONB,
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
  content_slug TEXT,
  content_metadata JSONB,
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
    s.content_slug,
    s.content_metadata,
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
  content_slug TEXT,
  content_metadata JSONB,
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

GRANT EXECUTE ON FUNCTION public.list_public_strategies(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_strategy_detail(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_strategies_for_league(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_strategy_preview(UUID) TO anon, authenticated;
