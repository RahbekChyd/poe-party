-- Migration: Create stash_snapshots, stash_tabs, and stash_items tables

CREATE TYPE public.snapshot_status AS ENUM ('pending', 'in_progress', 'completed', 'failed');

-- One snapshot per sync session
CREATE TABLE public.stash_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  group_id     UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  status       public.snapshot_status NOT NULL DEFAULT 'pending',
  tab_count    INTEGER,
  item_count   INTEGER,
  error_msg    TEXT,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX stash_snapshots_group_id_idx ON public.stash_snapshots(group_id);
CREATE INDEX stash_snapshots_user_id_idx ON public.stash_snapshots(user_id);

-- Only one in-progress snapshot per user at a time
CREATE UNIQUE INDEX stash_snapshots_one_active_per_user
  ON public.stash_snapshots(user_id)
  WHERE status IN ('pending', 'in_progress');

ALTER TABLE public.stash_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshots_read_group_members"
  ON public.stash_snapshots FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

CREATE POLICY "snapshots_insert_own"
  ON public.stash_snapshots FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "snapshots_update_service"
  ON public.stash_snapshots FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);

-- Individual stash tabs
CREATE TABLE public.stash_tabs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id     UUID NOT NULL REFERENCES public.stash_snapshots(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  group_id        UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  poe_tab_id      TEXT NOT NULL,
  name            TEXT NOT NULL,
  tab_type        TEXT NOT NULL,
  tab_index       INTEGER NOT NULL,
  colour_r        INTEGER,
  colour_g        INTEGER,
  colour_b        INTEGER,
  estimated_value_chaos NUMERIC(14, 4),
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX stash_tabs_group_id_idx ON public.stash_tabs(group_id);
CREATE INDEX stash_tabs_user_id_idx ON public.stash_tabs(user_id);

ALTER TABLE public.stash_tabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stash_tabs_read_group_members"
  ON public.stash_tabs FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

CREATE POLICY "stash_tabs_insert_service"
  ON public.stash_tabs FOR INSERT TO service_role
  WITH CHECK (true);

-- Denormalized items for queryability
CREATE TABLE public.stash_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id          UUID NOT NULL REFERENCES public.stash_tabs(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  group_id        UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  poe_item_id     TEXT NOT NULL,
  name            TEXT NOT NULL,
  base_type       TEXT,
  type_line       TEXT NOT NULL,
  item_class      TEXT,
  frame_type      INTEGER NOT NULL DEFAULT 0,
  ilvl            INTEGER NOT NULL DEFAULT 0,
  icon_url        TEXT,
  stack_size      INTEGER NOT NULL DEFAULT 1,
  identified      BOOLEAN NOT NULL DEFAULT true,
  corrupted       BOOLEAN NOT NULL DEFAULT false,
  fractured       BOOLEAN NOT NULL DEFAULT false,
  synthesised     BOOLEAN NOT NULL DEFAULT false,
  price_chaos     NUMERIC(14, 4),
  price_divine    NUMERIC(14, 6),
  mods            JSONB,        -- {implicit: [], explicit: [], crafted: [], fractured: []}
  sockets         JSONB,
  raw_data        JSONB NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for search and grouping
CREATE INDEX stash_items_group_id_idx ON public.stash_items(group_id);
CREATE INDEX stash_items_user_id_idx ON public.stash_items(user_id);
CREATE INDEX stash_items_tab_id_idx ON public.stash_items(tab_id);
CREATE INDEX stash_items_item_class_idx ON public.stash_items(item_class);
CREATE INDEX stash_items_frame_type_idx ON public.stash_items(frame_type);
-- Full-text search on item name
CREATE INDEX stash_items_name_fts_idx ON public.stash_items
  USING gin(to_tsvector('english', name || ' ' || COALESCE(base_type, '') || ' ' || type_line));

ALTER TABLE public.stash_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stash_items_read_group_members"
  ON public.stash_items FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

CREATE POLICY "stash_items_insert_service"
  ON public.stash_items FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "stash_items_delete_service"
  ON public.stash_items FOR DELETE TO service_role
  USING (true);

-- View: latest snapshot per user per group
CREATE OR REPLACE VIEW public.latest_snapshots AS
SELECT DISTINCT ON (user_id, group_id)
  *
FROM public.stash_snapshots
WHERE status = 'completed'
ORDER BY user_id, group_id, completed_at DESC;
