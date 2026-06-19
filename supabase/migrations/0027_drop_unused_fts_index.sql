-- Migration: Drop unused full-text search index on stash_items
--
-- This GIN index was created in 0005 but the app uses client-side filtering
-- (useDebouncedValue + Array.filter) instead of to_tsvector queries.
-- The index adds write overhead on every item insert with no read benefit.
-- Can be re-added later if server-side search is implemented.

DROP INDEX IF EXISTS stash_items_name_fts_idx;
