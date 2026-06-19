-- Add difficulty field to strategies
ALTER TABLE strategies
  ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'normal'
    CHECK (difficulty IN ('easy', 'normal', 'hard'));
