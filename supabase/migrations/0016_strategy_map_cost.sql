-- Add optional map cost field (chaos) to strategies
ALTER TABLE strategies
  ADD COLUMN IF NOT EXISTS map_cost integer;
