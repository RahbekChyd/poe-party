-- Fix: Replace partial unique index with a regular unique index.
-- PostgREST cannot specify the WHERE predicate needed for ON CONFLICT
-- with a partial index, causing upserts (and conflict detection) to fail.
-- PostgreSQL already allows multiple NULLs in a regular UNIQUE index,
-- so this is safe for rows where triggered_by_snapshot_id IS NULL.

DROP INDEX IF EXISTS public.idx_group_wealth_history_snapshot_unique;

CREATE UNIQUE INDEX idx_group_wealth_history_snapshot_unique
  ON public.group_wealth_history(triggered_by_snapshot_id);
