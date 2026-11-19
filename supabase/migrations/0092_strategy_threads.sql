-- PoE1 3.30 map planning. Existing Scarabs remain a legacy reference, never converted.
ALTER TABLE public.strategies ADD COLUMN threads JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE FUNCTION public.valid_strategy_threads(p_threads JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE row JSONB; alternative JSONB; spent INTEGER := 0;
BEGIN
  IF jsonb_typeof(p_threads) <> 'array' THEN RETURN false; END IF;
  FOR row IN SELECT value FROM jsonb_array_elements(p_threads) LOOP
    IF jsonb_typeof(row) <> 'object' OR NOT COALESCE(row->>'name' = ANY(ARRAY[
      'Abyss Thread','Bestiary Thread','Betrayal Thread','Blight Thread','Breach Thread',
      'Expedition Thread','Incursion Thread','Legion Thread','Ritual Thread','Ultimatum Thread']), false)
      OR jsonb_typeof(row->'quantity') IS DISTINCT FROM 'number'
      OR (row->>'quantity') !~ '^[1-8]$'
      OR jsonb_typeof(row->'required') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(row->'alternatives') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    spent := spent + (row->>'quantity')::INTEGER;
    FOR alternative IN SELECT value FROM jsonb_array_elements(row->'alternatives') LOOP
      IF NOT COALESCE(alternative->>'name' = ANY(ARRAY[
        'Abyss Thread','Bestiary Thread','Betrayal Thread','Blight Thread','Breach Thread',
        'Expedition Thread','Incursion Thread','Legion Thread','Ritual Thread','Ultimatum Thread']),false)
        THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN spent <= 8;
END;
$$;
REVOKE ALL ON FUNCTION public.valid_strategy_threads(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.valid_strategy_threads(JSONB) TO anon, authenticated, service_role;
ALTER TABLE public.strategies ADD CONSTRAINT strategies_threads_valid CHECK (public.valid_strategy_threads(threads));

CREATE OR REPLACE FUNCTION public.sync_strategy_subscribers_from_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source_strategy_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_active = false OR NEW.visibility <> 'public' THEN
    PERFORM public.freeze_strategy_subscribers(NEW.id);
    RETURN NEW;
  END IF;

  UPDATE public.strategies
  SET
    name = NEW.name,
    description = NEW.description,
    colour = NEW.colour,
    difficulty = NEW.difficulty,
    atlas_tree_url = NEW.atlas_tree_url,
    scarabs = NEW.scarabs,
    threads = NEW.threads,
    map_trade_link = NEW.map_trade_link,
    map_requirements = NEW.map_requirements,
    map_cost = NEW.map_cost,
    source_group_id = NEW.group_id,
    source_group_name = (
      SELECT g.name
      FROM public.groups g
      WHERE g.id = NEW.group_id
      LIMIT 1
    ),
    last_synced_from_source_at = now()
  WHERE source_strategy_id = NEW.id
    AND subscription_state = 'live'
    AND is_active = true;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_strategy_subscribers_from_source() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_strategy_subscribers_from_source() TO service_role;
DROP TRIGGER sync_strategy_subscribers_from_source_trigger ON public.strategies;
CREATE TRIGGER sync_strategy_subscribers_from_source_trigger
AFTER UPDATE OF name, description, colour, difficulty, atlas_tree_url, scarabs, threads,
  map_trade_link, map_requirements, map_cost, visibility, is_active
ON public.strategies FOR EACH ROW EXECUTE FUNCTION public.sync_strategy_subscribers_from_source();
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
    AND visibility = 'public'
  FOR SHARE;

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
    threads,
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
    s.threads,
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
    AND s.source_strategy_id IS NULL
    AND s.is_active = true
    AND s.visibility = 'public'
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.subscribe_to_public_strategy(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.subscribe_to_public_strategy(UUID, UUID) TO authenticated, service_role;
DROP FUNCTION public.get_public_strategy_detail(UUID, UUID);
DROP FUNCTION public.get_public_strategy_preview(UUID);
DROP FUNCTION public.list_public_strategies(UUID);
DROP FUNCTION public.list_public_strategies_for_league(TEXT,TEXT);
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
  threads JSONB,
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
    s.threads,
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
REVOKE ALL ON FUNCTION public.list_public_strategies(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_strategies(UUID) TO authenticated, service_role;
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
  threads JSONB,
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
REVOKE ALL ON FUNCTION public.get_public_strategy_detail(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_strategy_detail(UUID, UUID) TO authenticated, service_role;
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
  threads JSONB,
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
    s.threads,
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
REVOKE ALL ON FUNCTION public.list_public_strategies_for_league(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_strategies_for_league(TEXT, TEXT) TO anon, authenticated, service_role;
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
  threads JSONB,
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
REVOKE ALL ON FUNCTION public.get_public_strategy_preview(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_strategy_preview(UUID) TO anon, authenticated, service_role;
