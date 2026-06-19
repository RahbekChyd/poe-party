ALTER TABLE public.character_profile_snapshots
  ADD COLUMN inventory JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN jewels JSONB NOT NULL DEFAULT '[]'::jsonb;
