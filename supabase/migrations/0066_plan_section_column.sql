ALTER TABLE public.upgrade_recommendation_plans
  ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'primary';

ALTER TABLE public.upgrade_recommendation_plans
  ADD CONSTRAINT upgrade_recommendation_plans_section_check
  CHECK (section IN ('primary', 'overview'));
