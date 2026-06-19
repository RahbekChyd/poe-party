-- Migration: Create groups table

CREATE TABLE public.groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  invite_code  TEXT NOT NULL UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  created_by   UUID NOT NULL REFERENCES public.users(id),
  league       TEXT NOT NULL,
  description  TEXT,
  deleted_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TRIGGER groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "groups_insert_authenticated"
  ON public.groups FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Allows reading back a group immediately after creation (before member row exists)
CREATE POLICY "groups_read_creator"
  ON public.groups FOR SELECT TO authenticated
  USING (created_by = auth.uid());
