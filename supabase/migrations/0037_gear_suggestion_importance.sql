-- Add importance field to gear suggestions
ALTER TABLE public.gear_suggestions
  ADD COLUMN IF NOT EXISTS importance text NOT NULL DEFAULT 'medium'
    CHECK (importance IN ('high', 'medium', 'low'));
