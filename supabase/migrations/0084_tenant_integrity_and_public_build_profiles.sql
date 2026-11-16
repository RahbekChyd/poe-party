-- Enforce tenant/parent consistency for new writes and expose a deliberately
-- curated public build-profile contract.

CREATE OR REPLACE FUNCTION public.enforce_tenant_consistent_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row JSONB := to_jsonb(NEW);
  v_group_id UUID := NULLIF(v_row->>'group_id', '')::UUID;
  v_user_id UUID := NULLIF(v_row->>'user_id', '')::UUID;
BEGIN
  IF TG_TABLE_NAME IN (
    'characters',
    'stash_snapshots',
    'character_profile_snapshots',
    'services',
    'build_targets'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = v_group_id
      AND gm.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION '% user must belong to its group', TG_TABLE_NAME;
  END IF;

  IF TG_TABLE_NAME = 'characters' AND NOT EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = v_group_id
      AND g.league = v_row->>'league'
  ) THEN
    RAISE EXCEPTION 'Character league must match its group';
  ELSIF TG_TABLE_NAME = 'stash_snapshots' AND NOT EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = v_group_id AND g.game = 'poe1'
  ) THEN
    RAISE EXCEPTION 'Stash snapshots are only supported for PoE1 groups';
  ELSIF TG_TABLE_NAME = 'stash_tabs' AND NOT EXISTS (
    SELECT 1
    FROM public.stash_snapshots snapshot
    WHERE snapshot.id = NULLIF(v_row->>'snapshot_id', '')::UUID
      AND snapshot.group_id = v_group_id
      AND snapshot.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Stash tab tenant must match its snapshot';
  ELSIF TG_TABLE_NAME = 'stash_items' AND NOT EXISTS (
    SELECT 1
    FROM public.stash_tabs tab
    WHERE tab.id = NULLIF(v_row->>'tab_id', '')::UUID
      AND tab.group_id = v_group_id
      AND tab.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Stash item tenant must match its tab';
  ELSIF TG_TABLE_NAME = 'character_profile_snapshots'
    AND v_row->>'character_id' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.characters character
      WHERE character.id = NULLIF(v_row->>'character_id', '')::UUID
        AND character.group_id = v_group_id
        AND character.user_id = v_user_id
    ) THEN
    RAISE EXCEPTION 'Character profile tenant must match its character';
  ELSIF TG_TABLE_NAME = 'character_profile_daily_snapshots' AND NOT EXISTS (
    SELECT 1
    FROM public.character_profile_snapshots profile
    JOIN public.characters character
      ON character.id = NULLIF(v_row->>'character_id', '')::UUID
    WHERE profile.id = NULLIF(v_row->>'profile_id', '')::UUID
      AND profile.group_id = v_group_id
      AND profile.user_id = v_user_id
      AND character.group_id = v_group_id
      AND character.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Daily character profile tenant must match its profile and character';
  ELSIF TG_TABLE_NAME = 'strategies' AND NOT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = v_group_id
      AND gm.user_id = NULLIF(v_row->>'created_by', '')::UUID
  ) THEN
    RAISE EXCEPTION 'Strategy creator must belong to its group';
  ELSIF TG_TABLE_NAME = 'strategy_assignments' AND NOT EXISTS (
    SELECT 1
    FROM public.strategies strategy
    JOIN public.characters character
      ON character.id = NULLIF(v_row->>'character_id', '')::UUID
    JOIN public.group_members gm
      ON gm.group_id = strategy.group_id
     AND gm.user_id = NULLIF(v_row->>'assigned_by', '')::UUID
    WHERE strategy.id = NULLIF(v_row->>'strategy_id', '')::UUID
      AND character.group_id = strategy.group_id
  ) THEN
    RAISE EXCEPTION 'Strategy assignment parents must share a group';
  ELSIF TG_TABLE_NAME = 'strategy_tabs' AND NOT EXISTS (
    SELECT 1
    FROM public.strategies strategy
    JOIN public.stash_tabs tab
      ON tab.id = NULLIF(v_row->>'tab_id', '')::UUID
    JOIN public.group_members gm
      ON gm.group_id = strategy.group_id
     AND gm.user_id = NULLIF(v_row->>'tagged_by', '')::UUID
    WHERE strategy.id = NULLIF(v_row->>'strategy_id', '')::UUID
      AND tab.group_id = strategy.group_id
  ) THEN
    RAISE EXCEPTION 'Strategy tab parents must share a group';
  ELSIF TG_TABLE_NAME = 'gear_suggestions' AND (
    NOT EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = v_group_id
        AND gm.user_id = NULLIF(v_row->>'target_user_id', '')::UUID
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = v_group_id
        AND gm.user_id = NULLIF(v_row->>'suggested_by', '')::UUID
    )
    OR (
      v_row->>'character_id' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.characters character
        WHERE character.id = NULLIF(v_row->>'character_id', '')::UUID
          AND character.group_id = v_group_id
          AND character.user_id = NULLIF(v_row->>'target_user_id', '')::UUID
      )
    )
    OR (
      v_row->>'source_item_id' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.stash_items item
        WHERE item.id = NULLIF(v_row->>'source_item_id', '')::UUID
          AND item.group_id = v_group_id
      )
    )
    OR (
      v_row->>'source_recommendation_plan_id' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.upgrade_recommendation_plans plan
        WHERE plan.id = NULLIF(v_row->>'source_recommendation_plan_id', '')::UUID
          AND plan.group_id = v_group_id
          AND plan.target_user_id = NULLIF(v_row->>'target_user_id', '')::UUID
      )
    )
  ) THEN
    RAISE EXCEPTION 'Gear suggestion tenant fields are inconsistent';
  ELSIF TG_TABLE_NAME = 'build_targets' AND (
    NOT EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = v_group_id
        AND gm.user_id = NULLIF(v_row->>'created_by', '')::UUID
    )
    OR (
      v_row->>'character_id' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.characters character
        WHERE character.id = NULLIF(v_row->>'character_id', '')::UUID
          AND character.group_id = v_group_id
          AND character.user_id = v_user_id
      )
    )
    OR (
      v_row->>'selected_stage_id' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.build_target_stages stage
        WHERE stage.id = NULLIF(v_row->>'selected_stage_id', '')::UUID
          AND stage.build_target_id = NULLIF(v_row->>'id', '')::UUID
      )
    )
  ) THEN
    RAISE EXCEPTION 'Build target tenant fields are inconsistent';
  ELSIF TG_TABLE_NAME = 'upgrade_analysis_runs' AND (
    NOT EXISTS (
      SELECT 1
      FROM public.build_targets target
      WHERE target.id = NULLIF(v_row->>'build_target_id', '')::UUID
        AND target.group_id = v_group_id
        AND target.user_id = NULLIF(v_row->>'target_user_id', '')::UUID
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = v_group_id
        AND gm.user_id = NULLIF(v_row->>'queued_by', '')::UUID
    )
    OR (
      v_row->>'target_stage_id' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.build_target_stages stage
        WHERE stage.id = NULLIF(v_row->>'target_stage_id', '')::UUID
          AND stage.build_target_id = NULLIF(v_row->>'build_target_id', '')::UUID
      )
    )
    OR (
      v_row->>'character_id' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.characters character
        WHERE character.id = NULLIF(v_row->>'character_id', '')::UUID
          AND character.group_id = v_group_id
          AND character.user_id = NULLIF(v_row->>'target_user_id', '')::UUID
      )
    )
  ) THEN
    RAISE EXCEPTION 'Analysis run tenant fields are inconsistent';
  ELSIF TG_TABLE_NAME = 'upgrade_recommendation_plans' AND NOT EXISTS (
    SELECT 1
    FROM public.upgrade_analysis_runs run
    WHERE run.id = NULLIF(v_row->>'run_id', '')::UUID
      AND run.group_id = v_group_id
      AND run.target_user_id = NULLIF(v_row->>'target_user_id', '')::UUID
      AND run.target_stage_id IS NOT DISTINCT FROM NULLIF(v_row->>'target_stage_id', '')::UUID
  ) THEN
    RAISE EXCEPTION 'Recommendation plan tenant must match its run';
  ELSIF TG_TABLE_NAME = 'upgrade_recommendation_items' AND NOT EXISTS (
    SELECT 1
    FROM public.upgrade_recommendation_plans plan
    WHERE plan.id = NULLIF(v_row->>'plan_id', '')::UUID
      AND plan.run_id = NULLIF(v_row->>'run_id', '')::UUID
  ) THEN
    RAISE EXCEPTION 'Recommendation item run must match its plan';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'characters',
    'stash_snapshots',
    'stash_tabs',
    'stash_items',
    'character_profile_snapshots',
    'character_profile_daily_snapshots',
    'strategies',
    'strategy_assignments',
    'strategy_tabs',
    'gear_suggestions',
    'services',
    'build_targets',
    'upgrade_analysis_runs',
    'upgrade_recommendation_plans',
    'upgrade_recommendation_items'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS enforce_tenant_consistency ON public.%I',
      v_table
    );
    EXECUTE format(
      'CREATE TRIGGER enforce_tenant_consistency BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_consistent_write()',
      v_table
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "characters_insert_own" ON public.characters;
CREATE POLICY "characters_insert_own"
  ON public.characters FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id));

DROP POLICY IF EXISTS "characters_update_own" ON public.characters;
CREATE POLICY "characters_update_own"
  ON public.characters FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_group_member(group_id))
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id));

DROP POLICY IF EXISTS "snapshots_insert_own" ON public.stash_snapshots;
CREATE POLICY "snapshots_insert_own"
  ON public.stash_snapshots FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id));

DROP POLICY IF EXISTS "snapshots_update_own" ON public.stash_snapshots;
CREATE POLICY "snapshots_update_own"
  ON public.stash_snapshots FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_group_member(group_id))
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id));

DROP POLICY IF EXISTS "stash_tabs_insert_own" ON public.stash_tabs;
CREATE POLICY "stash_tabs_insert_own"
  ON public.stash_tabs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id));

DROP POLICY IF EXISTS "stash_tabs_update_own" ON public.stash_tabs;
CREATE POLICY "stash_tabs_update_own"
  ON public.stash_tabs FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_group_member(group_id))
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id));

DROP POLICY IF EXISTS "stash_items_insert_own" ON public.stash_items;
CREATE POLICY "stash_items_insert_own"
  ON public.stash_items FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id));

DROP POLICY IF EXISTS "stash_items_update_own" ON public.stash_items;
CREATE POLICY "stash_items_update_own"
  ON public.stash_items FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_group_member(group_id))
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id));

DROP POLICY IF EXISTS "character_profile_snapshots_insert_own" ON public.character_profile_snapshots;
CREATE POLICY "character_profile_snapshots_insert_own"
  ON public.character_profile_snapshots FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id));

DROP POLICY IF EXISTS "character_profile_snapshots_update_own" ON public.character_profile_snapshots;
CREATE POLICY "character_profile_snapshots_update_own"
  ON public.character_profile_snapshots FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_group_member(group_id))
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id));

DROP POLICY IF EXISTS services_insert_own ON public.services;
CREATE POLICY services_insert_own
  ON public.services FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id));

DROP POLICY IF EXISTS services_update_own_or_admin ON public.services;
CREATE POLICY services_update_own_or_admin
  ON public.services FOR UPDATE TO authenticated
  USING ((user_id = auth.uid() AND public.is_group_member(group_id)) OR public.is_group_admin(group_id))
  WITH CHECK ((user_id = auth.uid() AND public.is_group_member(group_id)) OR public.is_group_admin(group_id));

DROP POLICY IF EXISTS "group_wealth_history_insert" ON public.group_wealth_history;

  -- Curated public build profile. The normalized item arrays deliberately strip
  -- stable item ids and user notes, including those on socketed items; raw
  -- account/character payloads and inventory are never part of this contract.
CREATE OR REPLACE FUNCTION public.get_public_build_profile_preview(p_profile_id UUID)
RETURNS TABLE (
  profile_id UUID,
  group_id UUID,
  group_name TEXT,
  group_game TEXT,
  group_league TEXT,
  owner_name TEXT,
  character_name TEXT,
  class TEXT,
  ascendancy_class INTEGER,
  level INTEGER,
  gear JSONB,
  jewels JSONB,
  passive_tree JSONB,
  last_synced_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    profile.id,
    profile.group_id,
    g.name,
    g.game,
    g.league,
    COALESCE(u.display_name, u.poe_account_name, 'Unknown'),
    profile.character_name,
    profile.class,
    profile.ascendancy_class,
    profile.level,
    COALESCE((
      SELECT jsonb_agg(
        (item.value - 'id' - 'note' - 'socketedItems')
        || CASE
          WHEN jsonb_typeof(item.value -> 'socketedItems') = 'array' THEN
            jsonb_build_object(
              'socketedItems',
              COALESCE((
                SELECT jsonb_agg(socketed.value - 'id' - 'note')
                FROM jsonb_array_elements(item.value -> 'socketedItems') socketed(value)
              ), '[]'::jsonb)
            )
          ELSE '{}'::jsonb
        END
      )
      FROM jsonb_array_elements(profile.gear) item(value)
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(
        (item.value - 'id' - 'note' - 'socketedItems')
        || CASE
          WHEN jsonb_typeof(item.value -> 'socketedItems') = 'array' THEN
            jsonb_build_object(
              'socketedItems',
              COALESCE((
                SELECT jsonb_agg(socketed.value - 'id' - 'note')
                FROM jsonb_array_elements(item.value -> 'socketedItems') socketed(value)
              ), '[]'::jsonb)
            )
          ELSE '{}'::jsonb
        END
      )
      FROM jsonb_array_elements(profile.jewels) item(value)
    ), '[]'::jsonb),
    profile.passive_tree,
    profile.last_synced_at
  FROM public.character_profile_snapshots profile
  JOIN public.groups g ON g.id = profile.group_id
  JOIN public.users u ON u.id = profile.user_id
  WHERE profile.id = p_profile_id
    AND profile.visibility = 'public'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_public_build_profile(
  p_viewer_group_id UUID,
  p_profile_id UUID
)
RETURNS TABLE (
  profile_id UUID,
  group_id UUID,
  group_name TEXT,
  group_game TEXT,
  group_league TEXT,
  owner_name TEXT,
  character_name TEXT,
  class TEXT,
  ascendancy_class INTEGER,
  level INTEGER,
  gear JSONB,
  jewels JSONB,
  passive_tree JSONB,
  last_synced_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public_profile.*
  FROM public.groups viewer_group
  CROSS JOIN LATERAL public.get_public_build_profile_preview(p_profile_id) public_profile
  WHERE viewer_group.id = p_viewer_group_id
    AND public.is_group_member(viewer_group.id)
    AND viewer_group.game = public_profile.group_game
    AND viewer_group.league = public_profile.group_league;
$$;

CREATE OR REPLACE FUNCTION public.list_latest_stash_items_page(
  p_group_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_after_created_at TIMESTAMPTZ DEFAULT NULL,
  p_after_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  name TEXT,
  type_line TEXT,
  base_type TEXT,
  frame_type INTEGER,
  ilvl INTEGER,
  icon_url TEXT,
  stack_size INTEGER,
  tab_name TEXT,
  tab_type TEXT,
  price_chaos NUMERIC,
  is_excluded BOOLEAN,
  excluded_reason TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    item.id,
    item.user_id,
    item.name,
    item.type_line,
    item.base_type,
    item.frame_type,
    item.ilvl,
    item.icon_url,
    item.stack_size,
    item.tab_name,
    item.tab_type,
    item.price_chaos,
    item.is_excluded,
    item.excluded_reason,
    item.created_at
  FROM public.latest_stash_items item
  WHERE item.group_id = p_group_id
    AND (p_user_id IS NULL OR item.user_id = p_user_id)
    AND (
      p_after_created_at IS NULL
      OR (item.created_at, item.id) > (p_after_created_at, p_after_id)
    )
  ORDER BY item.created_at ASC, item.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.enforce_tenant_consistent_write() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_tenant_consistent_write() TO service_role;
REVOKE ALL ON FUNCTION public.get_public_build_profile_preview(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_build_profile_preview(UUID) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_public_build_profile(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_build_profile(UUID, UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_latest_stash_items_page(UUID, UUID, TIMESTAMPTZ, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_latest_stash_items_page(UUID, UUID, TIMESTAMPTZ, UUID, INTEGER) TO authenticated, service_role;
