ALTER TABLE public.upgrade_analysis_runs
  ADD COLUMN party_config JSONB NOT NULL DEFAULT '[]'::jsonb;
