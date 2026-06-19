DROP INDEX IF EXISTS public.upgrade_analysis_runs_completed_at_idx;

CREATE INDEX IF NOT EXISTS upgrade_analysis_runs_finished_at_idx
  ON public.upgrade_analysis_runs(completed_at DESC)
  WHERE status IN ('completed', 'partial', 'stale')
    AND started_at IS NOT NULL
    AND completed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.estimate_analysis_runtime(
  p_analysis_mode TEXT DEFAULT NULL
)
RETURNS TABLE (
  median_seconds   NUMERIC,
  p90_seconds      NUMERIC,
  sample_size      INTEGER,
  source           TEXT,
  active_runs      INTEGER,
  oldest_active_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_median NUMERIC;
  v_p90 NUMERIC;
  v_count INTEGER;
  v_source TEXT;
  v_window INTERVAL;
BEGIN
  FOR v_window, v_source IN
    SELECT * FROM (VALUES
      (INTERVAL '1 hour', 'last_hour'),
      (INTERVAL '24 hours', 'last_24h'),
      (INTERVAL '7 days', 'last_7d'),
      (INTERVAL '30 days', 'last_30d')
    ) AS w(win, src)
  LOOP
    SELECT
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at))
      ),
      percentile_cont(0.9) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at))
      ),
      COUNT(*)
    INTO v_median, v_p90, v_count
    FROM public.upgrade_analysis_runs
    WHERE status IN ('completed', 'partial', 'stale')
      AND started_at IS NOT NULL
      AND completed_at IS NOT NULL
      AND completed_at >= now() - v_window
      AND (p_analysis_mode IS NULL OR analysis_mode = p_analysis_mode);

    EXIT WHEN v_count >= 3;
  END LOOP;

  IF v_count IS NULL OR v_count = 0 THEN
    v_source := 'none';
  END IF;

  RETURN QUERY
  SELECT
    v_median,
    v_p90,
    COALESCE(v_count, 0),
    v_source,
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM public.upgrade_analysis_runs
      WHERE status IN ('queued', 'running')
        AND (p_analysis_mode IS NULL OR analysis_mode = p_analysis_mode)
    ), 0),
    (
      SELECT MIN(COALESCE(started_at, created_at))
      FROM public.upgrade_analysis_runs
      WHERE status IN ('queued', 'running')
        AND (p_analysis_mode IS NULL OR analysis_mode = p_analysis_mode)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.estimate_analysis_runtime(TEXT) TO authenticated;
