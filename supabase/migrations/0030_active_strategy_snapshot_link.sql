-- ── 1. Add current_strategy_id to groups ────────────────────────────────────
ALTER TABLE public.groups
  ADD COLUMN current_strategy_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL;

-- Allow editors (admin or editor) to update the current strategy on a group.
-- The existing "groups_update_admins" policy covers admin-only updates; this
-- broader policy lets editors set the active strategy without full admin access.
CREATE POLICY "groups_update_current_strategy_editors"
  ON public.groups FOR UPDATE TO authenticated
  USING (public.is_group_editor(id));

-- ── 2. Add strategy_id to stash_snapshots ───────────────────────────────────
ALTER TABLE public.stash_snapshots
  ADD COLUMN strategy_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL;

CREATE INDEX idx_stash_snapshots_strategy_id
  ON public.stash_snapshots(strategy_id)
  WHERE strategy_id IS NOT NULL;

-- Allow users to update strategy_id on their own snapshots (link / unlink).
CREATE POLICY "snapshots_update_own_strategy"
  ON public.stash_snapshots FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
