CREATE TABLE public.character_profile_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  group_id          UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  character_id      UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  character_name    TEXT NOT NULL,
  league            TEXT,
  class             TEXT,
  ascendancy_class  INTEGER,
  level             INTEGER,
  visibility        TEXT NOT NULL DEFAULT 'group_only' CHECK (visibility IN ('group_only', 'public')),
  gear              JSONB NOT NULL DEFAULT '[]'::jsonb,
  passive_tree      JSONB NOT NULL DEFAULT '{}'::jsonb,
  atlas_tree        JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_character     JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_league_account JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, group_id)
);

CREATE INDEX character_profile_snapshots_group_id_idx
  ON public.character_profile_snapshots(group_id);

CREATE INDEX character_profile_snapshots_user_id_idx
  ON public.character_profile_snapshots(user_id);

CREATE TRIGGER character_profile_snapshots_updated_at
  BEFORE UPDATE ON public.character_profile_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.character_profile_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "character_profile_snapshots_read_group_members"
  ON public.character_profile_snapshots FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

CREATE POLICY "character_profile_snapshots_insert_service"
  ON public.character_profile_snapshots FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "character_profile_snapshots_update_service"
  ON public.character_profile_snapshots FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);
