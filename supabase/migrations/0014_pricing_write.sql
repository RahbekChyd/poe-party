-- Migration: Allow authenticated users to update pricing fields on their own stash data.
-- These policies are needed for the client-side pricing pass that runs after stash snapshotting:
-- it reads poe.ninja prices and writes price_chaos to each stash_item, then sums per tab.

-- stash_items: allow UPDATE of own rows (for price_chaos / price_divine)
CREATE POLICY "stash_items_update_own"
  ON public.stash_items FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- stash_tabs: allow UPDATE of own rows (for estimated_value_chaos)
CREATE POLICY "stash_tabs_update_own"
  ON public.stash_tabs FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
