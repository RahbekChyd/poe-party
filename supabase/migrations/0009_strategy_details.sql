-- Migration: Add planning detail fields to strategies

ALTER TABLE public.strategies
  ADD COLUMN atlas_tree_url      TEXT,
  ADD COLUMN map_name            TEXT,
  ADD COLUMN map_tier            INTEGER,
  ADD COLUMN scarabs             JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN other_requirements  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN cost_per_map_chaos  NUMERIC(10, 2);

COMMENT ON COLUMN public.strategies.scarabs IS
  'Array of {name: string, quantity: number, required: boolean}';
COMMENT ON COLUMN public.strategies.other_requirements IS
  'Array of plain-text requirement strings';
COMMENT ON COLUMN public.strategies.atlas_tree_url IS
  'Link to a PoEPlanner atlas tree snapshot for this strategy';
