CREATE POLICY "groups_delete_admins"
  ON public.groups FOR DELETE TO authenticated
  USING (public.is_group_admin(id));
