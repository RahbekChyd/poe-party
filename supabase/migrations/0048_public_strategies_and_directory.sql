ALTER TABLE public.strategies
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'group_only'
    CHECK (visibility IN ('group_only', 'public')),
  ADD COLUMN IF NOT EXISTS source_strategy_id UUID,
  ADD COLUMN IF NOT EXISTS source_group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_group_name TEXT,
  ADD COLUMN IF NOT EXISTS subscription_state TEXT
    CHECK (subscription_state IS NULL OR subscription_state IN ('live', 'frozen')),
  ADD COLUMN IF NOT EXISTS last_synced_from_source_at TIMESTAMPTZ;

ALTER TABLE public.strategies
  DROP CONSTRAINT IF EXISTS strategies_subscription_shape_check;

ALTER TABLE public.strategies
  ADD CONSTRAINT strategies_subscription_shape_check
  CHECK (
    (source_strategy_id IS NULL AND subscription_state IS NULL)
    OR (source_strategy_id IS NOT NULL AND subscription_state IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS strategies_public_listing_idx
  ON public.strategies (visibility, is_active, group_id)
  WHERE source_strategy_id IS NULL;

CREATE INDEX IF NOT EXISTS strategies_source_strategy_live_idx
  ON public.strategies (source_strategy_id)
  WHERE source_strategy_id IS NOT NULL AND subscription_state = 'live';

CREATE UNIQUE INDEX IF NOT EXISTS strategies_group_live_source_unique_idx
  ON public.strategies (group_id, source_strategy_id)
  WHERE source_strategy_id IS NOT NULL AND subscription_state = 'live' AND is_active = true;

CREATE OR REPLACE FUNCTION public.freeze_strategy_subscribers(p_source_strategy_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.strategies
  SET
    subscription_state = 'frozen',
    last_synced_from_source_at = COALESCE(last_synced_from_source_at, now())
  WHERE source_strategy_id = p_source_strategy_id
    AND subscription_state = 'live'
    AND is_active = true;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.freeze_strategy_subscribers_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.source_strategy_id IS NULL THEN
    PERFORM public.freeze_strategy_subscribers(OLD.id);
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS sync_strategy_subscribers_from_source_trigger ON public.strategies;
CREATE TRIGGER sync_strategy_subscribers_from_source_trigger
  AFTER UPDATE OF
    name,
    description,
    colour,
    difficulty,
    atlas_tree_url,
    scarabs,
    map_trade_link,
    map_requirements,
    map_cost,
    visibility,
    is_active
  ON public.strategies
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_strategy_subscribers_from_source();

DROP TRIGGER IF EXISTS freeze_strategy_subscribers_on_delete_trigger ON public.strategies;
CREATE TRIGGER freeze_strategy_subscribers_on_delete_trigger
  BEFORE DELETE ON public.strategies
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_strategy_subscribers_on_delete();

DROP POLICY IF EXISTS "strategies_update_creator_or_admin" ON public.strategies;
CREATE POLICY "strategies_update_creator_or_admin"
  ON public.strategies FOR UPDATE TO authenticated
  USING (
    source_strategy_id IS NULL
    AND (
      public.is_group_admin(group_id)
      OR (NOT admin_locked AND public.is_group_editor(group_id))
    )
  )
  WITH CHECK (
    source_strategy_id IS NULL
    AND (
      public.is_group_admin(group_id)
      OR (NOT admin_locked AND public.is_group_editor(group_id))
    )
  );

CREATE OR REPLACE FUNCTION public.get_strategy_benchmark(p_strategy_id UUID)
RETURNS TABLE (
  sample_count INTEGER,
  chaos_per_hour NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ordered AS (
    SELECT
      gwh.created_at,
      gwh.total_wealth_chaos,
      row_number() OVER (ORDER BY gwh.created_at ASC) AS asc_row,
      row_number() OVER (ORDER BY gwh.created_at DESC) AS desc_row,
      count(*) OVER () AS total_rows
    FROM public.group_wealth_history gwh
    WHERE gwh.strategy_id = p_strategy_id
  ),
  bounds AS (
    SELECT
      max(total_rows)::INTEGER AS sample_count,
      max(created_at) FILTER (WHERE asc_row = 1) AS first_created_at,
      max(total_wealth_chaos) FILTER (WHERE asc_row = 1) AS first_total,
      max(created_at) FILTER (WHERE desc_row = 1) AS last_created_at,
      max(total_wealth_chaos) FILTER (WHERE desc_row = 1) AS last_total
    FROM ordered
  )
  SELECT
    COALESCE(sample_count, 0) AS sample_count,
    CASE
      WHEN sample_count IS NULL OR sample_count < 2 THEN NULL
      WHEN extract(epoch FROM (last_created_at - first_created_at)) <= 0 THEN NULL
      ELSE (last_total - first_total) / (extract(epoch FROM (last_created_at - first_created_at)) / 3600.0)
    END AS chaos_per_hour
  FROM bounds;
$$;

CREATE OR REPLACE FUNCTION public.list_public_strategies(p_viewer_group_id UUID)
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
    SELECT g.id, g.league
    FROM public.groups g
    WHERE g.id = p_viewer_group_id
      AND public.is_group_member(g.id)
  )
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
      AND source_group.league <> v_target_group.league
  ) THEN
    RAISE EXCEPTION 'Public strategy must be in the same league as the active group.';
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
    g.name,
    'live',
    now()
  FROM public.strategies s
  JOIN public.groups g ON g.id = s.group_id
  WHERE s.id = p_source_strategy_id
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_public_characters(
  p_viewer_group_id UUID,
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
  WITH viewer_group AS (
    SELECT g.id, g.league
    FROM public.groups g
    WHERE g.id = p_viewer_group_id
      AND public.is_group_member(g.id)
  )
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
  FROM viewer_group vg
  JOIN public.character_profile_snapshots cps
    ON cps.visibility = 'public'
  JOIN public.groups g
    ON g.id = cps.group_id
   AND g.league = vg.league
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
    SELECT g.id, g.league
    FROM public.groups g
    WHERE g.id = p_viewer_group_id
      AND public.is_group_member(g.id)
  ),
  matched_groups AS (
    SELECT g.id, g.name, g.league
    FROM viewer_group vg
    JOIN public.groups g
      ON g.league = vg.league
    WHERE g.name ILIKE '%' || trim(COALESCE(p_query, '')) || '%'
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
    SELECT g.id, g.league
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
  JOIN public.users u
    ON u.id = cps.user_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_public_group_detail(
  p_viewer_group_id UUID,
  p_group_id UUID
)
RETURNS TABLE (
  group_id UUID,
  group_name TEXT,
  league TEXT,
  public_character_count INTEGER
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
    g.id AS group_id,
    g.name AS group_name,
    g.league,
    count(cps.id)::INTEGER AS public_character_count
  FROM viewer_group vg
  JOIN public.groups g
    ON g.id = p_group_id
   AND g.league = vg.league
  JOIN public.character_profile_snapshots cps
    ON cps.group_id = g.id
   AND cps.visibility = 'public'
  GROUP BY g.id, g.name, g.league
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
    SELECT g.id, g.league
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
  JOIN public.character_profile_snapshots cps
    ON cps.group_id = g.id
   AND cps.visibility = 'public'
   AND (p_exclude_profile_id IS NULL OR cps.id <> p_exclude_profile_id)
  JOIN public.users u
    ON u.id = cps.user_id
  ORDER BY cps.character_name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_strategy_benchmark(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_strategies(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_strategy_detail(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.subscribe_to_public_strategy(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_characters(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_groups(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_character_detail(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_group_detail(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_group_characters(UUID, UUID, UUID) TO authenticated;
