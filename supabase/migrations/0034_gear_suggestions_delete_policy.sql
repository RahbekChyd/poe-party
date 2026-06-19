-- Migration: Allow deleting gear suggestions under same role constraints as updates.

DROP POLICY IF EXISTS "suggestions_delete_target_or_suggester" ON public.gear_suggestions;
CREATE POLICY "suggestions_delete_target_or_suggester"
  ON public.gear_suggestions FOR DELETE TO authenticated
  USING (
    public.is_group_admin(group_id)
    OR (
      NOT admin_locked
      AND public.is_group_editor(group_id)
      AND (target_user_id = auth.uid() OR suggested_by = auth.uid())
    )
  );
