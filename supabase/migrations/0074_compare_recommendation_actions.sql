-- Migration: Add Compare-backed recommendation action metadata

ALTER TABLE public.upgrade_recommendation_items
  DROP CONSTRAINT IF EXISTS upgrade_recommendation_items_source_check;

ALTER TABLE public.upgrade_recommendation_items
  ADD CONSTRAINT upgrade_recommendation_items_source_check
  CHECK (source IN ('owned', 'market', 'compare'));

ALTER TABLE public.gear_suggestions
  ADD COLUMN IF NOT EXISTS action_type TEXT NOT NULL DEFAULT 'gear_item',
  ADD COLUMN IF NOT EXISTS action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_recommendation_plan_id UUID REFERENCES public.upgrade_recommendation_plans(id) ON DELETE SET NULL;

ALTER TABLE public.gear_suggestions
  DROP CONSTRAINT IF EXISTS gear_suggestions_action_type_check;

ALTER TABLE public.gear_suggestions
  ADD CONSTRAINT gear_suggestions_action_type_check
  CHECK (action_type IN (
    'gear_item',
    'passive_node',
    'skill_gem',
    'support_gem',
    'config_change',
    'reservation_fix'
  ));

CREATE INDEX IF NOT EXISTS gear_suggestions_source_recommendation_plan_id_idx
  ON public.gear_suggestions(source_recommendation_plan_id);
