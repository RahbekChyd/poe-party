-- Allow authenticated users to insert their own profile row.
-- Needed for the cookie-based login flow where the frontend creates the
-- public.users record directly (no Edge Function involved).
-- The WITH CHECK ensures a user can only insert a row for their own auth.uid().

CREATE POLICY "users_insert_own"
  ON public.users FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
