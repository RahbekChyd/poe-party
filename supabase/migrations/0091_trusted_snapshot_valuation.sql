-- Server-owned capture/valuation, preserving all existing prices and history.
ALTER TABLE public.stash_snapshots ADD COLUMN pricing_summary JSONB;
ALTER TABLE public.snapshot_value_history ADD COLUMN pricing_summary JSONB;
ALTER TABLE public.group_wealth_history ADD COLUMN pricing_summary JSONB;
CREATE OR REPLACE VIEW public.latest_snapshots WITH (security_invoker = true) AS
SELECT DISTINCT ON (user_id, group_id) * FROM public.stash_snapshots
WHERE status = 'completed' ORDER BY user_id, group_id, completed_at DESC;

-- OAuth captures already run on the server. Clients use narrow exclusion/link RPCs.
REVOKE INSERT, UPDATE, DELETE ON public.stash_snapshots, public.stash_tabs, public.stash_items, public.snapshot_value_history, public.group_wealth_history, public.group_wealth_history_contributions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bulk_update_snapshot_item_prices(p_snapshot_id UUID, p_prices JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT public.can_write_snapshot(p_snapshot_id) THEN RAISE EXCEPTION 'Not authorized to update snapshot prices'; END IF;
  IF auth.role() IS DISTINCT FROM 'service_role' AND COALESCE(p_prices, '[]'::jsonb) <> '[]'::jsonb THEN
    RAISE EXCEPTION 'Snapshot prices are server-owned';
  END IF;
  -- Empty payload recalculates tab exclusion totals without changing item prices.
  PERFORM public.bulk_update_snapshot_item_prices_internal(p_snapshot_id, p_prices);
END;
$$;

-- Wrap internal refreshes as well: exclusion/link call chains must respect availability.
ALTER FUNCTION public.refresh_snapshot_value_history_internal(UUID) RENAME TO refresh_snapshot_value_history_legacy;
CREATE FUNCTION public.refresh_snapshot_value_history_internal(p_snapshot_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_summary JSONB; v_history UUID;
BEGIN
  SELECT pricing_summary INTO v_summary FROM public.stash_snapshots WHERE id = p_snapshot_id;
  IF v_summary->>'status' = 'unavailable' THEN RETURN NULL; END IF;
  v_history := public.refresh_snapshot_value_history_legacy(p_snapshot_id);
  UPDATE public.snapshot_value_history SET pricing_summary = v_summary WHERE id = v_history;
  RETURN v_history;
END;
$$;
ALTER FUNCTION public.refresh_group_wealth_history_for_snapshot_internal(UUID) RENAME TO refresh_group_wealth_history_for_snapshot_legacy;
CREATE FUNCTION public.refresh_group_wealth_history_for_snapshot_internal(p_snapshot_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_group UUID; v_history UUID; v_summary JSONB;
BEGIN
  SELECT group_id INTO v_group FROM public.stash_snapshots WHERE id = p_snapshot_id;
  IF EXISTS (SELECT 1 FROM public.stash_snapshots WHERE id = p_snapshot_id AND pricing_summary->>'status' = 'unavailable') THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.latest_snapshots WHERE group_id = v_group AND pricing_summary->>'status' = 'unavailable') THEN
    RETURN NULL;
  END IF;
  v_history := public.refresh_group_wealth_history_for_snapshot_legacy(p_snapshot_id);
  -- Metadata stays explicit when this point mixes legacy and current captures.
  SELECT jsonb_build_object(
    'status', CASE WHEN bool_or(COALESCE(pricing_summary->>'status', 'complete') = 'partial') THEN 'partial' ELSE 'complete' END,
    'version', CASE WHEN bool_and(COALESCE(pricing_summary->>'version' = '1', false)) THEN 1 ELSE NULL END,
    'source', 'poe.ninja', 'priced_at', now(),
    'priced_item_count', SUM(COALESCE((pricing_summary->>'priced_item_count')::integer, 0)),
    'unpriced_item_count', SUM(COALESCE((pricing_summary->>'unpriced_item_count')::integer, 0))
  ) INTO v_summary FROM public.latest_snapshots WHERE group_id = v_group;
  UPDATE public.group_wealth_history SET pricing_summary = v_summary WHERE id = v_history;
  RETURN v_history;
END;
$$;

CREATE FUNCTION public.finalize_priced_snapshot(p_snapshot_id UUID, p_prices JSONB, p_summary JSONB, p_warning TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_snapshot public.stash_snapshots; v_count INTEGER; v_priced INTEGER; v_summary JSONB;
BEGIN
  -- Serialize member completions before reading latest snapshots for a group.
  -- The second completion must observe the first member's committed valuation.
  PERFORM 1 FROM public.groups WHERE id = (
    SELECT group_id FROM public.stash_snapshots WHERE id = p_snapshot_id
  ) FOR UPDATE;
  SELECT * INTO v_snapshot FROM public.stash_snapshots WHERE id = p_snapshot_id FOR UPDATE;
  IF NOT FOUND OR v_snapshot.status <> 'in_progress' THEN RAISE EXCEPTION 'Snapshot is not in progress'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = v_snapshot.group_id AND user_id = v_snapshot.user_id) THEN
    RAISE EXCEPTION 'Snapshot owner is no longer a group member';
  END IF;
  IF jsonb_typeof(p_prices) IS DISTINCT FROM 'array' OR jsonb_typeof(p_summary) IS DISTINCT FROM 'object'
    OR COALESCE(p_summary->>'status', '') NOT IN ('complete', 'partial', 'unavailable') OR p_summary->>'version' IS DISTINCT FROM '1'
    OR p_summary->>'source' IS DISTINCT FROM 'poe.ninja' THEN RAISE EXCEPTION 'Invalid pricing summary'; END IF;
  SELECT count(*) INTO v_count FROM public.stash_items si JOIN public.stash_tabs st ON st.id = si.tab_id WHERE st.snapshot_id = p_snapshot_id;
  IF jsonb_array_length(p_prices) <> v_count OR
    (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_prices)) <> v_count OR
    EXISTS (SELECT 1 FROM jsonb_array_elements(p_prices) p WHERE NOT EXISTS (
      SELECT 1 FROM public.stash_items si JOIN public.stash_tabs st ON st.id = si.tab_id
      WHERE st.snapshot_id = p_snapshot_id AND si.id = (p.value->>'id')::UUID
        AND si.group_id = v_snapshot.group_id AND si.user_id = v_snapshot.user_id
    )) THEN RAISE EXCEPTION 'Pricing must cover exactly the snapshot items'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_prices) p, unnest(ARRAY['price_chaos','price_divine']) k
    WHERE p.value->k IS NOT NULL AND p.value->k <> 'null'::jsonb AND (
      jsonb_typeof(p.value->k) <> 'number' OR (p.value->>k)::numeric < 0 OR (p.value->>k)::numeric::text IN ('NaN','Infinity','-Infinity')
    )) THEN RAISE EXCEPTION 'Invalid item price'; END IF;
  IF p_summary->>'status' = 'unavailable' AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_prices) WHERE value->'price_chaos' <> 'null'::jsonb) THEN
    RAISE EXCEPTION 'Unavailable valuation cannot contain prices';
  END IF;
  WITH incoming AS (SELECT (value->>'id')::UUID id, (value->>'price_chaos')::numeric chaos, (value->>'price_divine')::numeric divine FROM jsonb_array_elements(p_prices))
  UPDATE public.stash_items si SET price_chaos = incoming.chaos, price_divine = incoming.divine FROM incoming WHERE si.id = incoming.id;
  SELECT count(*) FILTER (WHERE si.price_chaos IS NOT NULL) INTO v_priced FROM public.stash_items si JOIN public.stash_tabs st ON st.id = si.tab_id WHERE st.snapshot_id = p_snapshot_id;
  v_summary := p_summary || jsonb_build_object('priced_item_count', v_priced, 'unpriced_item_count', v_count - v_priced);
  PERFORM public.bulk_update_snapshot_item_prices_internal(p_snapshot_id, '[]'::jsonb);
  UPDATE public.stash_snapshots SET status = 'completed', item_count = v_count, completed_at = clock_timestamp(), pricing_summary = v_summary, error_msg = p_warning WHERE id = p_snapshot_id;
  IF v_summary->>'status' <> 'unavailable' THEN
    PERFORM public.refresh_snapshot_value_history_internal(p_snapshot_id);
    PERFORM public.refresh_group_wealth_history_for_snapshot_internal(p_snapshot_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_priced_snapshot(UUID, JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_priced_snapshot(UUID, JSONB, JSONB, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.refresh_snapshot_value_history_internal(UUID), public.refresh_group_wealth_history_for_snapshot_internal(UUID), public.refresh_snapshot_value_history_legacy(UUID), public.refresh_group_wealth_history_for_snapshot_legacy(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_snapshot_value_history_internal(UUID), public.refresh_group_wealth_history_for_snapshot_internal(UUID), public.refresh_snapshot_value_history_legacy(UUID), public.refresh_group_wealth_history_for_snapshot_legacy(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.bulk_update_snapshot_item_prices(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_snapshot_item_prices(UUID, JSONB) TO authenticated, service_role;
