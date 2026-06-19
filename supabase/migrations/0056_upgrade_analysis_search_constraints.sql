ALTER TABLE public.upgrade_analysis_runs
  ADD COLUMN IF NOT EXISTS search_constraints JSONB NOT NULL DEFAULT '{}'::jsonb;
