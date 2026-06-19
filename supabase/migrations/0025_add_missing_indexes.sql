-- Migration: Add missing indexes for query performance
--
-- 1. stash_tabs.snapshot_id — used by useSnapshotItems for historical snapshots
-- 2. strategy_assignments.strategy_id — used by strategies JOIN on assignments
-- 3. Composite index on stash_snapshots for latest_snapshots view (DISTINCT ON)

-- Historical snapshot queries: SELECT * FROM stash_tabs WHERE snapshot_id = ?
CREATE INDEX IF NOT EXISTS stash_tabs_snapshot_id_idx
  ON public.stash_tabs (snapshot_id);

-- Strategy detail queries join on strategy_id
CREATE INDEX IF NOT EXISTS strategy_assignments_strategy_id_idx
  ON public.strategy_assignments (strategy_id);

-- Optimise the latest_snapshots view: DISTINCT ON (user_id, group_id) ORDER BY completed_at DESC
-- Replaces the less optimal stash_snapshots_user_retention_idx which lacks group_id
-- and uses ASC order.
DROP INDEX IF EXISTS stash_snapshots_user_retention_idx;

CREATE INDEX stash_snapshots_user_group_latest_idx
  ON public.stash_snapshots (user_id, group_id, completed_at DESC)
  WHERE status = 'completed';

-- The retention trigger also benefits from (user_id, completed_at ASC) for its
-- "oldest completed" query, so keep a separate narrower index for that.
CREATE INDEX stash_snapshots_user_retention_idx
  ON public.stash_snapshots (user_id, completed_at ASC)
  WHERE status = 'completed';
