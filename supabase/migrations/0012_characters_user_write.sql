-- Migration: Allow authenticated users to write their own characters
-- Required for the client-side cookie-based character snapshot flow.
-- The service_role policies (used by Edge Functions) remain in place.

CREATE POLICY "characters_insert_own"
  ON public.characters FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "characters_update_own"
  ON public.characters FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
