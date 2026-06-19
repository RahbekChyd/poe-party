-- Allow authenticated users to cancel (mark stale) their own queued/running analysis runs.
CREATE POLICY "upgrade_analysis_runs_cancel_own"
  ON public.upgrade_analysis_runs FOR UPDATE TO authenticated
  USING (
    queued_by = auth.uid()
    AND public.is_group_member(group_id)
    AND status IN ('queued', 'running')
  )
  WITH CHECK (
    status = 'stale'
  );
