-- Group wealth history: accumulates a data point each time a member
-- completes a snapshot + pricing pass, storing aggregated KPIs.

CREATE TABLE public.group_wealth_history (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id                 UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  triggered_by_snapshot_id UUID REFERENCES public.stash_snapshots(id) ON DELETE SET NULL,
  triggered_by_user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  total_wealth_chaos       NUMERIC NOT NULL DEFAULT 0,
  member_count             INTEGER NOT NULL DEFAULT 0,
  member_wealth_breakdown  JSONB NOT NULL DEFAULT '[]'::jsonb,
  strategy_id              UUID REFERENCES public.strategies(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Primary query path: fetch all history for a group ordered by time
CREATE INDEX idx_group_wealth_history_group_created
  ON public.group_wealth_history(group_id, created_at);

-- Idempotency: one history record per triggering snapshot
CREATE UNIQUE INDEX idx_group_wealth_history_snapshot_unique
  ON public.group_wealth_history(triggered_by_snapshot_id)
  WHERE triggered_by_snapshot_id IS NOT NULL;

-- RLS
ALTER TABLE public.group_wealth_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_wealth_history_select"
  ON public.group_wealth_history FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

CREATE POLICY "group_wealth_history_insert"
  ON public.group_wealth_history FOR INSERT TO authenticated
  WITH CHECK (
    triggered_by_user_id = auth.uid()
    AND public.is_group_member(group_id)
  );
