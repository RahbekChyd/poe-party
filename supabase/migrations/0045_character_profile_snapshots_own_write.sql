CREATE POLICY "character_profile_snapshots_insert_own"
  ON public.character_profile_snapshots FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "character_profile_snapshots_update_own"
  ON public.character_profile_snapshots FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
