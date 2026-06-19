-- Migration: Allow authenticated users to write their own stash data
-- Required for the client-side cookie-based stash snapshot flow.
-- Mirrors the approach in 0012_characters_user_write.sql.

-- stash_snapshots: users can already INSERT their own (snapshots_insert_own exists),
-- but UPDATE is service_role only. Add an authenticated update for own rows.
CREATE POLICY "snapshots_update_own"
  ON public.stash_snapshots FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- stash_tabs: allow users to insert their own rows
CREATE POLICY "stash_tabs_insert_own"
  ON public.stash_tabs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- stash_items: allow users to insert and delete their own rows
CREATE POLICY "stash_items_insert_own"
  ON public.stash_items FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "stash_items_delete_own"
  ON public.stash_items FOR DELETE TO authenticated
  USING (user_id = auth.uid());
