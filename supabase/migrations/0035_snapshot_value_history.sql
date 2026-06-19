-- Durable per-snapshot value history + exclusion-ready item fields.
--
-- This preserves historical totals and strategy links even when raw snapshots
-- are removed by retention, and prepares item rows for future exclusion logic.

ALTER TABLE public.stash_items
  ADD COLUMN is_excluded BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN excluded_at TIMESTAMPTZ,
  ADD COLUMN excluded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN excluded_reason TEXT;

CREATE TABLE public.snapshot_value_history (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id          UUID UNIQUE REFERENCES public.stash_snapshots(id) ON DELETE SET NULL,
  group_id             UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  strategy_id          UUID REFERENCES public.strategies(id) ON DELETE SET NULL,
  completed_at         TIMESTAMPTZ NOT NULL,
  included_chaos_total NUMERIC(14, 4) NOT NULL DEFAULT 0,
  excluded_chaos_total NUMERIC(14, 4) NOT NULL DEFAULT 0,
  included_item_count  INTEGER NOT NULL DEFAULT 0,
  excluded_item_count  INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX snapshot_value_history_group_user_completed_idx
  ON public.snapshot_value_history(group_id, user_id, completed_at);

CREATE INDEX snapshot_value_history_strategy_completed_idx
  ON public.snapshot_value_history(strategy_id, completed_at)
  WHERE strategy_id IS NOT NULL;

ALTER TABLE public.snapshot_value_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshot_value_history_select"
  ON public.snapshot_value_history FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

CREATE TABLE public.group_wealth_history_contributions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_history_id          UUID NOT NULL REFERENCES public.group_wealth_history(id) ON DELETE CASCADE,
  user_id                   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  snapshot_value_history_id UUID NOT NULL REFERENCES public.snapshot_value_history(id) ON DELETE CASCADE,
  total_chaos               NUMERIC(14, 4) NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_history_id, user_id)
);

CREATE INDEX group_wealth_history_contrib_snapshot_idx
  ON public.group_wealth_history_contributions(snapshot_value_history_id);

ALTER TABLE public.group_wealth_history_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_wealth_history_contributions_select"
  ON public.group_wealth_history_contributions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.group_wealth_history gwh
      WHERE gwh.id = group_history_id
        AND public.is_group_member(gwh.group_id)
    )
  );

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
  WITH incoming AS (
    SELECT
      (value->>'id')::UUID AS id,
      COALESCE((value->>'price_chaos')::NUMERIC, 0) AS price_chaos,
      COALESCE((value->>'price_divine')::NUMERIC, 0) AS price_divine
    FROM jsonb_array_elements(COALESCE(p_prices, '[]'::jsonb))
  )
  UPDATE public.stash_items si
  SET
    price_chaos = incoming.price_chaos,
    price_divine = incoming.price_divine
  FROM incoming, public.stash_tabs st
  WHERE si.id = incoming.id
    AND st.id = si.tab_id
    AND st.snapshot_id = p_snapshot_id;

  UPDATE public.stash_tabs st
  SET estimated_value_chaos = COALESCE(agg.total_chaos, 0)
  FROM (
    SELECT
      st2.id,
      SUM(
        CASE
          WHEN COALESCE(si.is_excluded, false) THEN 0
          ELSE COALESCE(si.price_chaos, 0)
        END
      ) AS total_chaos
    FROM public.stash_tabs st2
    LEFT JOIN public.stash_items si ON si.tab_id = st2.id
    WHERE st2.snapshot_id = p_snapshot_id
    GROUP BY st2.id
  ) agg
  WHERE st.id = agg.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_snapshot_value_history(
  p_snapshot_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot RECORD;
  v_history_id UUID;
BEGIN
  SELECT
    s.id,
    s.group_id,
    s.user_id,
    s.strategy_id,
    s.completed_at
  INTO v_snapshot
  FROM public.stash_snapshots s
  WHERE s.id = p_snapshot_id
    AND s.status = 'completed'
    AND s.completed_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Completed snapshot not found for id %', p_snapshot_id;
  END IF;

  INSERT INTO public.snapshot_value_history (
    snapshot_id,
    group_id,
    user_id,
    strategy_id,
    completed_at,
    included_chaos_total,
    excluded_chaos_total,
    included_item_count,
    excluded_item_count
  )
  SELECT
    v_snapshot.id,
    v_snapshot.group_id,
    v_snapshot.user_id,
    v_snapshot.strategy_id,
    v_snapshot.completed_at,
    COALESCE(SUM(CASE WHEN COALESCE(si.is_excluded, false) THEN 0 ELSE COALESCE(si.price_chaos, 0) END), 0),
    COALESCE(SUM(CASE WHEN COALESCE(si.is_excluded, false) THEN COALESCE(si.price_chaos, 0) ELSE 0 END), 0),
    COUNT(*) FILTER (WHERE NOT COALESCE(si.is_excluded, false)),
    COUNT(*) FILTER (WHERE COALESCE(si.is_excluded, false))
  FROM public.stash_tabs st
  LEFT JOIN public.stash_items si ON si.tab_id = st.id
  WHERE st.snapshot_id = v_snapshot.id
  ON CONFLICT (snapshot_id) DO UPDATE
  SET
    group_id = EXCLUDED.group_id,
    user_id = EXCLUDED.user_id,
    strategy_id = EXCLUDED.strategy_id,
    completed_at = EXCLUDED.completed_at,
    included_chaos_total = EXCLUDED.included_chaos_total,
    excluded_chaos_total = EXCLUDED.excluded_chaos_total,
    included_item_count = EXCLUDED.included_item_count,
    excluded_item_count = EXCLUDED.excluded_item_count
  RETURNING id INTO v_history_id;

  RETURN v_history_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_group_wealth_history_for_snapshot(
  p_snapshot_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot RECORD;
  v_group_history_id UUID;
BEGIN
  PERFORM public.refresh_snapshot_value_history(p_snapshot_id);

  SELECT
    s.id,
    s.group_id,
    s.user_id,
    s.strategy_id
  INTO v_snapshot
  FROM public.stash_snapshots s
  WHERE s.id = p_snapshot_id
    AND s.status = 'completed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Completed snapshot not found for id %', p_snapshot_id;
  END IF;

  INSERT INTO public.group_wealth_history (
    group_id,
    triggered_by_snapshot_id,
    triggered_by_user_id,
    total_wealth_chaos,
    member_count,
    member_wealth_breakdown,
    strategy_id
  )
  SELECT
    v_snapshot.group_id,
    v_snapshot.id,
    v_snapshot.user_id,
    COALESCE(SUM(svh.included_chaos_total), 0),
    COUNT(*),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'user_id', svh.user_id,
          'display_name', COALESCE(u.display_name, u.poe_account_name, 'Unknown'),
          'total_chaos', svh.included_chaos_total
        )
        ORDER BY svh.included_chaos_total DESC, COALESCE(u.display_name, u.poe_account_name, 'Unknown')
      ),
      '[]'::jsonb
    ),
    v_snapshot.strategy_id
  FROM public.latest_snapshots ls
  JOIN public.snapshot_value_history svh ON svh.snapshot_id = ls.id
  JOIN public.users u ON u.id = svh.user_id
  WHERE ls.group_id = v_snapshot.group_id
  ON CONFLICT (triggered_by_snapshot_id) DO UPDATE
  SET
    total_wealth_chaos = EXCLUDED.total_wealth_chaos,
    member_count = EXCLUDED.member_count,
    member_wealth_breakdown = EXCLUDED.member_wealth_breakdown,
    strategy_id = EXCLUDED.strategy_id
  RETURNING id INTO v_group_history_id;

  DELETE FROM public.group_wealth_history_contributions
  WHERE group_history_id = v_group_history_id;

  INSERT INTO public.group_wealth_history_contributions (
    group_history_id,
    user_id,
    snapshot_value_history_id,
    total_chaos
  )
  SELECT
    v_group_history_id,
    svh.user_id,
    svh.id,
    svh.included_chaos_total
  FROM public.latest_snapshots ls
  JOIN public.snapshot_value_history svh ON svh.snapshot_id = ls.id
  WHERE ls.group_id = v_snapshot.group_id;

  RETURN v_group_history_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_snapshot_history_strategy_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.strategy_id IS NOT DISTINCT FROM OLD.strategy_id THEN
    RETURN NEW;
  END IF;

  UPDATE public.snapshot_value_history
  SET strategy_id = NEW.strategy_id
  WHERE snapshot_id = NEW.id;

  UPDATE public.group_wealth_history
  SET strategy_id = NEW.strategy_id
  WHERE triggered_by_snapshot_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_snapshot_history_strategy_link_trigger ON public.stash_snapshots;

CREATE TRIGGER sync_snapshot_history_strategy_link_trigger
  AFTER UPDATE OF strategy_id ON public.stash_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_snapshot_history_strategy_link();
