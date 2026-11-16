-- Security containment for membership bootstrap, stash views, OAuth identity,
-- and SECURITY DEFINER function privileges.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS poe_account_sub UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_poe_account_sub_key'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_poe_account_sub_key UNIQUE (poe_account_sub);
  END IF;
END;
$$;

-- Views must evaluate the base-table RLS policies as the caller.
CREATE OR REPLACE VIEW public.latest_snapshots
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (user_id, group_id)
  *
FROM public.stash_snapshots
WHERE status = 'completed'
ORDER BY user_id, group_id, completed_at DESC;

CREATE OR REPLACE VIEW public.latest_stash_items
WITH (security_invoker = true)
AS
SELECT
  si.id,
  si.tab_id,
  si.user_id,
  si.group_id,
  si.poe_item_id,
  si.name,
  si.base_type,
  si.type_line,
  si.item_class,
  si.frame_type,
  si.ilvl,
  si.icon_url,
  si.stack_size,
  si.identified,
  si.corrupted,
  si.fractured,
  si.synthesised,
  si.price_chaos,
  si.price_divine,
  si.mods,
  si.created_at,
  si.is_excluded,
  si.excluded_reason,
  st.name AS tab_name,
  st.tab_type,
  st.colour_r,
  st.colour_g,
  st.colour_b,
  si.sockets,
  si.raw_data
FROM public.stash_items si
JOIN public.stash_tabs st ON st.id = si.tab_id
WHERE st.snapshot_id IN (SELECT id FROM public.latest_snapshots);

REVOKE ALL ON public.latest_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.latest_stash_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.latest_snapshots TO authenticated, service_role;
GRANT SELECT ON public.latest_stash_items TO authenticated, service_role;

-- Preserve the old browser RPC names for local cookie transport, but put an
-- ownership check in front of the previously unrestricted maintenance bodies.
ALTER FUNCTION public.bulk_update_snapshot_item_prices(UUID, JSONB)
  RENAME TO bulk_update_snapshot_item_prices_internal;
ALTER FUNCTION public.refresh_snapshot_value_history(UUID)
  RENAME TO refresh_snapshot_value_history_internal;
ALTER FUNCTION public.refresh_group_wealth_history_for_snapshot(UUID)
  RENAME TO refresh_group_wealth_history_for_snapshot_internal;

CREATE OR REPLACE FUNCTION public.can_write_snapshot(p_snapshot_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.stash_snapshots snapshot
      WHERE snapshot.id = p_snapshot_id
        AND snapshot.user_id = auth.uid()
        AND public.is_group_member(snapshot.group_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.bulk_update_snapshot_item_prices(
  p_snapshot_id UUID,
  p_prices JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_write_snapshot(p_snapshot_id) THEN
    RAISE EXCEPTION 'Not authorized to update snapshot prices';
  END IF;

  PERFORM public.bulk_update_snapshot_item_prices_internal(p_snapshot_id, p_prices);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_snapshot_value_history(p_snapshot_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_history_id UUID;
BEGIN
  IF NOT public.can_write_snapshot(p_snapshot_id) THEN
    RAISE EXCEPTION 'Not authorized to refresh snapshot history';
  END IF;

  v_history_id := public.refresh_snapshot_value_history_internal(p_snapshot_id);
  RETURN v_history_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_group_wealth_history_for_snapshot(p_snapshot_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_history_id UUID;
BEGIN
  IF NOT public.can_write_snapshot(p_snapshot_id) THEN
    RAISE EXCEPTION 'Not authorized to refresh group wealth history';
  END IF;

  v_history_id := public.refresh_group_wealth_history_for_snapshot_internal(p_snapshot_id);
  RETURN v_history_id;
END;
$$;

-- Safe compatibility policy for the current two-step client flow. A caller can
-- only create the first admin row for a group they created themselves.
CREATE OR REPLACE FUNCTION public.can_bootstrap_group_membership(
  p_group_id UUID,
  p_user_id UUID,
  p_role public.group_role
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_id = auth.uid()
    AND p_role = 'admin'::public.group_role
    AND EXISTS (
      SELECT 1
      FROM public.groups g
      WHERE g.id = p_group_id
        AND g.created_by = auth.uid()
        AND g.deleted_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.group_members gm
      WHERE gm.group_id = p_group_id
    );
$$;

DROP POLICY IF EXISTS "members_insert_self" ON public.group_members;
DROP POLICY IF EXISTS "members_insert_creator_bootstrap" ON public.group_members;
CREATE POLICY "members_insert_creator_bootstrap"
  ON public.group_members FOR INSERT TO authenticated
  WITH CHECK (public.can_bootstrap_group_membership(group_id, user_id, role));

CREATE OR REPLACE FUNCTION public.create_group_with_owner(
  p_name TEXT,
  p_game TEXT,
  p_league TEXT,
  p_description TEXT DEFAULT NULL,
  p_is_solo BOOLEAN DEFAULT false
)
RETURNS public.groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group public.groups;
  v_name TEXT := btrim(COALESCE(p_name, ''));
  v_game TEXT := lower(btrim(COALESCE(p_game, '')));
  v_league TEXT := btrim(COALESCE(p_league, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF char_length(v_name) < 2 OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'Group name must be between 2 and 80 characters';
  END IF;
  IF v_game NOT IN ('poe1', 'poe2') THEN
    RAISE EXCEPTION 'Unsupported game';
  END IF;
  IF char_length(v_league) < 1 OR char_length(v_league) > 120 THEN
    RAISE EXCEPTION 'League is required';
  END IF;

  INSERT INTO public.groups (name, game, league, description, is_solo, created_by)
  VALUES (
    v_name,
    v_game,
    v_league,
    NULLIF(left(btrim(COALESCE(p_description, '')), 2000), ''),
    COALESCE(p_is_solo, false),
    auth.uid()
  )
  RETURNING * INTO v_group;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_group.id, auth.uid(), 'admin');

  RETURN v_group;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_group_by_invite(p_invite_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id UUID;
  v_invite_code TEXT := lower(btrim(COALESCE(p_invite_code, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF char_length(v_invite_code) <> 8 THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  SELECT id
  INTO v_group_id
  FROM public.groups
  WHERE lower(invite_code) = v_invite_code
    AND deleted_at IS NULL;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_group_id, auth.uid(), 'editor')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  RETURN v_group_id;
END;
$$;

-- Cancellation is a narrow mutation, not permission to rewrite the queued
-- analysis input, result, ownership, or tenant fields.
DROP POLICY IF EXISTS "upgrade_analysis_runs_cancel_own" ON public.upgrade_analysis_runs;
REVOKE UPDATE ON public.upgrade_analysis_runs FROM authenticated;

CREATE OR REPLACE FUNCTION public.cancel_upgrade_analysis_run(p_run_id UUID)
RETURNS public.upgrade_analysis_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.upgrade_analysis_runs;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.upgrade_analysis_runs run
  SET status = 'stale',
      stale_reason = 'user-cancelled'
  WHERE run.id = p_run_id
    AND run.queued_by = auth.uid()
    AND public.is_group_member(run.group_id)
    AND run.status IN ('queued', 'running')
  RETURNING run.* INTO v_run;

  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'Analysis run is not cancellable';
  END IF;

  RETURN v_run;
END;
$$;

-- Supabase grants function execution to PUBLIC by default. Reset every
-- SECURITY DEFINER function to service-only before adding the exact client API.
DO $$
DECLARE
  v_function REGPROCEDURE;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      v_function
    );
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_function);
  END LOOP;
END;
$$;

-- Authenticated policy helpers and mutations.
GRANT EXECUTE ON FUNCTION public.is_group_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_editor(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_group_with_me(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_strategy_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_strategy_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_strategy_editor(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_bootstrap_group_membership(UUID, UUID, public.group_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_snapshot(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_with_owner(TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_group_by_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_upgrade_analysis_run(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_snapshot_item_prices(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_snapshot_value_history(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_group_wealth_history_for_snapshot(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_strategy_snapshot_links(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_group_history_strategy_link(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_snapshot_strategy_link(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_snapshot_item_excluded(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_snapshot_item_excluded_all_history(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_selected_build_target(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.subscribe_to_public_strategy(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.estimate_analysis_runtime(TEXT) TO authenticated;

-- Authenticated public discovery.
GRANT EXECUTE ON FUNCTION public.list_public_strategies(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_strategy_detail(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_characters(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_groups(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_character_detail(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_group_detail(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_group_characters(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_character_daily_snapshot_summaries(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_character_daily_snapshot_detail(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_services(UUID, TEXT) TO authenticated;

-- Anonymous and authenticated read-only public discovery.
GRANT EXECUTE ON FUNCTION public.list_public_strategies_for_league(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_strategy_preview(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_characters_for_league(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_groups_for_league(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_character_detail_preview(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_group_detail_preview(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_group_characters_preview(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_character_daily_snapshot_summaries_preview(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_character_daily_snapshot_detail_preview(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_services_for_league(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_public_directory_view(TEXT, UUID) TO anon, authenticated;

-- Migration-time assertions catch a future accidental reintroduction in this
-- final schema. CI repeats these checks after every migration replay.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SECURITY DEFINER function remains executable by PUBLIC';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'latest_snapshots'
      AND 'security_invoker=true' = ANY(COALESCE(c.reloptions, ARRAY[]::TEXT[]))
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'latest_stash_items'
      AND 'security_invoker=true' = ANY(COALESCE(c.reloptions, ARRAY[]::TEXT[]))
  ) THEN
    RAISE EXCEPTION 'Stash views must use security_invoker';
  END IF;
END;
$$;
