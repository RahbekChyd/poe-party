-- Migration: Create strategies, strategy_assignments, and strategy_tabs tables

CREATE TABLE public.strategies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  colour       TEXT NOT NULL DEFAULT '#6366f1',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   UUID NOT NULL REFERENCES public.users(id),
  deleted_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX strategies_group_id_idx ON public.strategies(group_id);

CREATE TRIGGER strategies_updated_at
  BEFORE UPDATE ON public.strategies
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "strategies_read_group_members"
  ON public.strategies FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

CREATE POLICY "strategies_insert_group_members"
  ON public.strategies FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_group_member(group_id));

CREATE POLICY "strategies_update_creator_or_admin"
  ON public.strategies FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_group_admin(group_id));

-- Strategy character assignments

-- Helper functions that join through strategies without triggering RLS chains
CREATE OR REPLACE FUNCTION public.is_strategy_member(p_strategy_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.strategies s
    JOIN public.group_members gm ON s.group_id = gm.group_id
    WHERE s.id = p_strategy_id AND gm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_strategy_admin(p_strategy_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.strategies s
    JOIN public.group_members gm ON s.group_id = gm.group_id
    WHERE s.id = p_strategy_id AND gm.user_id = auth.uid() AND gm.role = 'admin'
  );
$$;

CREATE TABLE public.strategy_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id  UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  notes        TEXT,
  assigned_by  UUID NOT NULL REFERENCES public.users(id),
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(strategy_id, character_id)
);

ALTER TABLE public.strategy_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assignments_read_group_members"
  ON public.strategy_assignments FOR SELECT TO authenticated
  USING (public.is_strategy_member(strategy_id));

CREATE POLICY "assignments_insert_group_members"
  ON public.strategy_assignments FOR INSERT TO authenticated
  WITH CHECK (assigned_by = auth.uid() AND public.is_strategy_member(strategy_id));

CREATE POLICY "assignments_delete_assigner_or_admin"
  ON public.strategy_assignments FOR DELETE TO authenticated
  USING (assigned_by = auth.uid() OR public.is_strategy_admin(strategy_id));

-- Strategy stash tab tagging
CREATE TABLE public.strategy_tabs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  tab_id      UUID NOT NULL REFERENCES public.stash_tabs(id) ON DELETE CASCADE,
  tagged_by   UUID NOT NULL REFERENCES public.users(id),
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(strategy_id, tab_id)
);

ALTER TABLE public.strategy_tabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "strategy_tabs_read_group_members"
  ON public.strategy_tabs FOR SELECT TO authenticated
  USING (public.is_strategy_member(strategy_id));

CREATE POLICY "strategy_tabs_insert_group_members"
  ON public.strategy_tabs FOR INSERT TO authenticated
  WITH CHECK (tagged_by = auth.uid() AND public.is_strategy_member(strategy_id));

CREATE POLICY "strategy_tabs_delete_tagger_or_admin"
  ON public.strategy_tabs FOR DELETE TO authenticated
  USING (tagged_by = auth.uid() OR public.is_strategy_admin(strategy_id));
