-- Item exclusion support for snapshot rows.
--
-- Excluded rows still remain visible, but are removed from wealth totals.
-- When an exclusion changes, we recalculate the owning snapshot summary and
-- every group history point that currently references that snapshot summary.

DROP VIEW IF EXISTS public.latest_stash_items;

CREATE VIEW public.latest_stash_items AS
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
  st.name      AS tab_name,
  st.tab_type  AS tab_type,
  st.colour_r  AS colour_r,
  st.colour_g  AS colour_g,
  st.colour_b  AS colour_b
FROM public.stash_items si
JOIN public.stash_tabs  st ON si.tab_id = st.id
WHERE st.snapshot_id IN (SELECT id FROM public.latest_snapshots);

CREATE OR REPLACE FUNCTION public.rebuild_group_wealth_history_from_contributions(
  p_group_history_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.group_wealth_history gwh
  SET
    total_wealth_chaos = COALESCE((
      SELECT SUM(ghc.total_chaos)
      FROM public.group_wealth_history_contributions ghc
      WHERE ghc.group_history_id = p_group_history_id
    ), 0),
    member_count = (
      SELECT COUNT(*)
      FROM public.group_wealth_history_contributions ghc
      WHERE ghc.group_history_id = p_group_history_id
    ),
    member_wealth_breakdown = COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'user_id', ghc.user_id,
          'display_name', COALESCE(u.display_name, u.poe_account_name, 'Unknown'),
          'total_chaos', ghc.total_chaos
        )
        ORDER BY ghc.total_chaos DESC, COALESCE(u.display_name, u.poe_account_name, 'Unknown')
      )
      FROM public.group_wealth_history_contributions ghc
      JOIN public.users u ON u.id = ghc.user_id
      WHERE ghc.group_history_id = p_group_history_id
    ), '[]'::jsonb)
  WHERE gwh.id = p_group_history_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_snapshot_item_excluded(
  p_item_id UUID,
  p_is_excluded BOOLEAN,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id UUID;
  v_history_id UUID;
  v_group_history_id UUID;
BEGIN
  SELECT st.snapshot_id
  INTO v_snapshot_id
  FROM public.stash_items si
  JOIN public.stash_tabs st ON st.id = si.tab_id
  WHERE si.id = p_item_id
    AND si.user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot item not found for id %', p_item_id;
  END IF;

  UPDATE public.stash_items
  SET
    is_excluded = p_is_excluded,
    excluded_reason = CASE WHEN p_is_excluded THEN p_reason ELSE NULL END,
    excluded_at = CASE WHEN p_is_excluded THEN now() ELSE NULL END,
    excluded_by = CASE WHEN p_is_excluded THEN auth.uid() ELSE NULL END
  WHERE id = p_item_id
    AND user_id = auth.uid();

  PERFORM public.bulk_update_snapshot_item_prices(v_snapshot_id, '[]'::jsonb);

  v_history_id := public.refresh_snapshot_value_history(v_snapshot_id);

  UPDATE public.group_wealth_history_contributions ghc
  SET total_chaos = svh.included_chaos_total
  FROM public.snapshot_value_history svh
  WHERE ghc.snapshot_value_history_id = svh.id
    AND svh.id = v_history_id;

  FOR v_group_history_id IN
    SELECT DISTINCT ghc.group_history_id
    FROM public.group_wealth_history_contributions ghc
    WHERE ghc.snapshot_value_history_id = v_history_id
  LOOP
    PERFORM public.rebuild_group_wealth_history_from_contributions(v_group_history_id);
  END LOOP;
END;
$$;
