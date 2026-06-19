-- Migration: Create characters table
-- Stores snapshotted PoE character data per group member

CREATE TABLE public.characters (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  group_id          UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  poe_character_id  TEXT NOT NULL,
  name              TEXT NOT NULL,
  league            TEXT NOT NULL,
  class             TEXT NOT NULL,
  ascendancy_class  INTEGER NOT NULL DEFAULT 0,
  level             INTEGER NOT NULL DEFAULT 1,
  experience        BIGINT NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT false,
  raw_data          JSONB NOT NULL,
  snapshotted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, poe_character_id)
);

CREATE INDEX characters_group_id_idx ON public.characters(group_id);
CREATE INDEX characters_user_id_idx ON public.characters(user_id);

CREATE TRIGGER characters_updated_at
  BEFORE UPDATE ON public.characters
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "characters_read_group_members"
  ON public.characters FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

-- Edge Function (service role) upserts characters during snapshot
CREATE POLICY "characters_upsert_service"
  ON public.characters FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "characters_update_service"
  ON public.characters FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);
