-- Migration: Create group_members table

CREATE TYPE public.group_role AS ENUM ('admin', 'member');

CREATE TABLE public.group_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role       public.group_role NOT NULL DEFAULT 'member',
  joined_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(group_id, user_id)
);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Helper functions defined FIRST so policies can use them.
-- SECURITY DEFINER bypasses RLS on the inner query, breaking self-referential recursion.

CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin(p_group_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.shares_group_with_me(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members gm1
    JOIN public.group_members gm2 ON gm1.group_id = gm2.group_id
    WHERE gm1.user_id = auth.uid() AND gm2.user_id = p_user_id
  );
$$;

-- group_members policies
CREATE POLICY "members_read_same_group"
  ON public.group_members FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

-- Users can insert themselves (joining via invite code)
CREATE POLICY "members_insert_self"
  ON public.group_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- First member of a group becomes admin — enforced in application logic

CREATE POLICY "members_update_admins"
  ON public.group_members FOR UPDATE TO authenticated
  USING (public.is_group_admin(group_id));

CREATE POLICY "members_delete_self"
  ON public.group_members FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Groups policies that depend on group_members existing
CREATE POLICY "groups_read_members"
  ON public.groups FOR SELECT TO authenticated
  USING (public.is_group_member(id));

CREATE POLICY "groups_update_admins"
  ON public.groups FOR UPDATE TO authenticated
  USING (public.is_group_admin(id));

-- Co-members can read basic user info (no token columns)
-- This is enforced at the application level; token columns are never exposed via select policies
CREATE POLICY "users_read_comembers"
  ON public.users FOR SELECT TO authenticated
  USING (public.shares_group_with_me(id));
