-- Migration: Support full snapshot history
--
-- 1. Index to speed up the retention trigger's per-user completed-snapshot
--    queries (user_id + status + completed_at).
--
-- 2. View `latest_stash_items` — items scoped to each user's most recent
--    completed snapshot per group, with tab name/type pre-joined.
--    Replaces direct stash_items queries in useGroupSnapshotItems /
--    useSnapshotItems now that multiple historical snapshots can exist.
--
-- Note: ON DELETE CASCADE on stash_tabs.snapshot_id and stash_items.tab_id
--       was already defined in 0005 — no FK changes needed here.

CREATE INDEX IF NOT EXISTS stash_snapshots_user_retention_idx
  ON public.stash_snapshots (user_id, completed_at ASC)
  WHERE status = 'completed';

-- Items belonging to each user's latest completed snapshot per group,
-- with their tab name and type pre-joined.
CREATE OR REPLACE VIEW public.latest_stash_items AS
SELECT
  si.id,
  si.tab_id,
  si.user_id,
  si.group_id,
  si.poe_item_id,
  si.name,
  si.base_type,
  si.type_line,
  si.item_class,
  si.frame_type,
  si.ilvl,
  si.icon_url,
  si.stack_size,
  si.identified,
  si.corrupted,
  si.fractured,
  si.synthesised,
  si.price_chaos,
  si.price_divine,
  si.mods,
  si.created_at,
  st.name      AS tab_name,
  st.tab_type  AS tab_type,
  st.colour_r  AS colour_r,
  st.colour_g  AS colour_g,
  st.colour_b  AS colour_b
FROM public.stash_items si
JOIN public.stash_tabs  st ON si.tab_id = st.id
WHERE st.snapshot_id IN (SELECT id FROM public.latest_snapshots);
