CREATE OR REPLACE FUNCTION public.clear_strategy_snapshot_links(
  p_group_id UUID,
  p_strategy_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INTEGER := 0;
BEGIN
  IF NOT public.is_group_editor(p_group_id) THEN
    RAISE EXCEPTION 'Only group editors can clear strategy snapshot links.';
  END IF;

  -- Clear live snapshot links first so the existing sync trigger updates
  -- matching durable history rows that still point at a snapshot record.
  UPDATE public.stash_snapshots
  SET strategy_id = NULL
  WHERE group_id = p_group_id
    AND strategy_id = p_strategy_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  -- Retention can delete the raw snapshot row while leaving its durable
  -- history behind with snapshot_id / triggered_by_snapshot_id set to NULL.
  -- Those rows still drive strategy benchmarks, so clear them explicitly too.
  UPDATE public.snapshot_value_history
  SET strategy_id = NULL
  WHERE group_id = p_group_id
    AND strategy_id = p_strategy_id;

  UPDATE public.group_wealth_history
  SET strategy_id = NULL
  WHERE group_id = p_group_id
    AND strategy_id = p_strategy_id;

  RETURN v_updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_strategy_snapshot_links(UUID, UUID) TO authenticated;
