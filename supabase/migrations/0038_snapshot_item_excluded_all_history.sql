-- Allow propagating an item exclusion across all stored snapshots for the same item.

CREATE OR REPLACE FUNCTION public.set_snapshot_item_excluded_all_history(
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
  v_group_id UUID;
  v_poe_item_id TEXT;
  v_snapshot_id UUID;
  v_history_id UUID;
  v_group_history_id UUID;
BEGIN
  SELECT
    si.group_id,
    si.poe_item_id
  INTO
    v_group_id,
    v_poe_item_id
  FROM public.stash_items si
  WHERE si.id = p_item_id
    AND si.user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot item not found for id %', p_item_id;
  END IF;

  IF v_poe_item_id IS NULL THEN
    RAISE EXCEPTION 'Snapshot item % cannot be matched across history', p_item_id;
  END IF;

  FOR v_snapshot_id IN
    WITH updated_items AS (
      UPDATE public.stash_items
      SET
        is_excluded = p_is_excluded,
        excluded_reason = CASE WHEN p_is_excluded THEN p_reason ELSE NULL END,
        excluded_at = CASE WHEN p_is_excluded THEN now() ELSE NULL END,
        excluded_by = CASE WHEN p_is_excluded THEN auth.uid() ELSE NULL END
      WHERE user_id = auth.uid()
        AND group_id = v_group_id
        AND poe_item_id = v_poe_item_id
      RETURNING tab_id
    )
    SELECT DISTINCT st.snapshot_id
    FROM updated_items ui
    JOIN public.stash_tabs st ON st.id = ui.tab_id
  LOOP
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
  END LOOP;
END;
$$;
