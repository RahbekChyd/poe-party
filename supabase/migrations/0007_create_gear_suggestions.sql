-- Migration: Create gear_suggestions table

CREATE TYPE public.suggestion_status AS ENUM ('open', 'acknowledged', 'implemented', 'dismissed');

CREATE TABLE public.gear_suggestions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  target_user_id  UUID NOT NULL REFERENCES public.users(id),
  character_id    UUID REFERENCES public.characters(id),
  suggested_by    UUID NOT NULL REFERENCES public.users(id),
  slot            TEXT,
  item_name       TEXT,
  item_data       JSONB,
  source_item_id  UUID REFERENCES public.stash_items(id),
  notes           TEXT,
  status          public.suggestion_status NOT NULL DEFAULT 'open',
  status_note     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX gear_suggestions_group_id_idx ON public.gear_suggestions(group_id);
CREATE INDEX gear_suggestions_target_user_id_idx ON public.gear_suggestions(target_user_id);

CREATE TRIGGER gear_suggestions_updated_at
  BEFORE UPDATE ON public.gear_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.gear_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suggestions_read_group_members"
  ON public.gear_suggestions FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

CREATE POLICY "suggestions_insert_group_members"
  ON public.gear_suggestions FOR INSERT TO authenticated
  WITH CHECK (suggested_by = auth.uid() AND public.is_group_member(group_id));

-- Target user or suggester can update status
CREATE POLICY "suggestions_update_target_or_suggester"
  ON public.gear_suggestions FOR UPDATE TO authenticated
  USING (
    target_user_id = auth.uid() OR suggested_by = auth.uid()
  );
