CREATE OR REPLACE FUNCTION public.set_snapshot_strategy_link(
  p_snapshot_id UUID,
  p_strategy_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot RECORD;
  v_strategy_group_id UUID;
BEGIN
  SELECT id, group_id, user_id
  INTO v_snapshot
  FROM public.stash_snapshots
  WHERE id = p_snapshot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot not found for id %', p_snapshot_id;
  END IF;

  IF auth.uid() IS DISTINCT FROM v_snapshot.user_id
     AND NOT public.is_group_editor(v_snapshot.group_id) THEN
    RAISE EXCEPTION 'Only the snapshot owner or a group editor can update the strategy link.';
  END IF;

  IF p_strategy_id IS NOT NULL THEN
    SELECT group_id
    INTO v_strategy_group_id
    FROM public.strategies
    WHERE id = p_strategy_id;

    IF v_strategy_group_id IS NULL THEN
      RAISE EXCEPTION 'Strategy not found for id %', p_strategy_id;
    END IF;

    IF v_strategy_group_id IS DISTINCT FROM v_snapshot.group_id THEN
      RAISE EXCEPTION 'Strategy % does not belong to group %', p_strategy_id, v_snapshot.group_id;
    END IF;
  END IF;

  UPDATE public.stash_snapshots
  SET strategy_id = p_strategy_id
  WHERE id = p_snapshot_id;

  RETURN p_snapshot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_snapshot_strategy_link(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_group_history_strategy_link(
  p_group_history_id UUID,
  p_strategy_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_history RECORD;
  v_strategy_group_id UUID;
  v_snapshot_value_history_id UUID;
BEGIN
  SELECT id, group_id, triggered_by_snapshot_id, triggered_by_user_id
  INTO v_group_history
  FROM public.group_wealth_history
  WHERE id = p_group_history_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group wealth history row not found for id %', p_group_history_id;
  END IF;

  IF auth.uid() IS DISTINCT FROM v_group_history.triggered_by_user_id
     AND NOT public.is_group_editor(v_group_history.group_id) THEN
    RAISE EXCEPTION 'Only the snapshot owner or a group editor can update the strategy link.';
  END IF;

  IF p_strategy_id IS NOT NULL THEN
    SELECT group_id
    INTO v_strategy_group_id
    FROM public.strategies
    WHERE id = p_strategy_id;

    IF v_strategy_group_id IS NULL THEN
      RAISE EXCEPTION 'Strategy not found for id %', p_strategy_id;
    END IF;

    IF v_strategy_group_id IS DISTINCT FROM v_group_history.group_id THEN
      RAISE EXCEPTION 'Strategy % does not belong to group %', p_strategy_id, v_group_history.group_id;
    END IF;
  END IF;

  IF v_group_history.triggered_by_snapshot_id IS NOT NULL THEN
    PERFORM public.set_snapshot_strategy_link(
      v_group_history.triggered_by_snapshot_id,
      p_strategy_id
    );
    RETURN v_group_history.triggered_by_snapshot_id;
  END IF;

  UPDATE public.group_wealth_history
  SET strategy_id = p_strategy_id
  WHERE id = p_group_history_id;

  SELECT ghc.snapshot_value_history_id
  INTO v_snapshot_value_history_id
  FROM public.group_wealth_history_contributions ghc
  WHERE ghc.group_history_id = p_group_history_id
    AND ghc.user_id = v_group_history.triggered_by_user_id
  LIMIT 1;

  IF v_snapshot_value_history_id IS NOT NULL THEN
    UPDATE public.snapshot_value_history
    SET strategy_id = p_strategy_id
    WHERE id = v_snapshot_value_history_id;
  END IF;

  RETURN p_group_history_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_group_history_strategy_link(UUID, UUID) TO authenticated;
