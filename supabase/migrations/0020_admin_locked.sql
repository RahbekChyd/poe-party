-- Migration: Member roles data migration + admin_locked feature.
-- Runs in its own transaction after 0019, which committed the 'editor'/'viewer'
-- enum values. Everything here is idempotent (IF NOT EXISTS / DROP IF EXISTS /
-- CREATE OR REPLACE) so a re-run after a partial failure is safe.

-- ── 1. Member role data migration ───────────────────────────────────────────

-- Migrate any remaining 'member' rows to 'editor'
UPDATE public.group_members SET role = 'editor' WHERE role = 'member';

-- New members now default to 'editor'
ALTER TABLE public.group_members ALTER COLUMN role SET DEFAULT 'editor';

-- ── 2. Helper functions ──────────────────────────────────────────────────────

-- True if the current user is admin OR editor in the given group
CREATE OR REPLACE FUNCTION public.is_group_editor(p_group_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'editor')
  );
$$;

-- True if the current user is admin OR editor in the group owning a strategy
CREATE OR REPLACE FUNCTION public.is_strategy_editor(p_strategy_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.strategies s
    JOIN public.group_members gm ON gm.group_id = s.group_id
    WHERE s.id = p_strategy_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('admin', 'editor')
  );
$$;

-- Update join_group_by_invite to insert new members as 'editor' (was 'member')
CREATE OR REPLACE FUNCTION public.join_group_by_invite(p_invite_code TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_group_id UUID;
BEGIN
  SELECT id INTO v_group_id
  FROM public.groups
  WHERE invite_code = p_invite_code
    AND deleted_at IS NULL;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_group_id, auth.uid(), 'editor')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  RETURN v_group_id;
END;
$$;

-- ── 3. Add admin_locked columns ──────────────────────────────────────────────

ALTER TABLE public.strategies      ADD COLUMN IF NOT EXISTS admin_locked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.gear_suggestions ADD COLUMN IF NOT EXISTS admin_locked BOOLEAN NOT NULL DEFAULT false;

-- ── 4. Strategies RLS ────────────────────────────────────────────────────────

-- INSERT: only editors (and admins) can create strategies; viewers cannot
DROP POLICY IF EXISTS "strategies_insert_group_members" ON public.strategies;
CREATE POLICY "strategies_insert_group_members"
  ON public.strategies FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_group_editor(group_id));

-- UPDATE: admin can always update; editor-creator can update only when not locked
DROP POLICY IF EXISTS "strategies_update_creator_or_admin" ON public.strategies;
CREATE POLICY "strategies_update_creator_or_admin"
  ON public.strategies FOR UPDATE TO authenticated
  USING (
    public.is_group_admin(group_id)
    OR (NOT admin_locked AND public.is_group_editor(group_id) AND created_by = auth.uid())
  );

-- ── 5. Gear suggestions RLS ──────────────────────────────────────────────────

-- INSERT: only editors (and admins) can create suggestions; viewers cannot
DROP POLICY IF EXISTS "suggestions_insert_group_members" ON public.gear_suggestions;
CREATE POLICY "suggestions_insert_group_members"
  ON public.gear_suggestions FOR INSERT TO authenticated
  WITH CHECK (suggested_by = auth.uid() AND public.is_group_editor(group_id));

-- UPDATE: admin always; editor-target/suggester only when not locked
DROP POLICY IF EXISTS "suggestions_update_target_or_suggester" ON public.gear_suggestions;
CREATE POLICY "suggestions_update_target_or_suggester"
  ON public.gear_suggestions FOR UPDATE TO authenticated
  USING (
    public.is_group_admin(group_id)
    OR (
      NOT admin_locked
      AND public.is_group_editor(group_id)
      AND (target_user_id = auth.uid() OR suggested_by = auth.uid())
    )
  );

-- ── 6. Strategy assignments RLS ──────────────────────────────────────────────

-- INSERT: only editors (and admins) can assign characters; viewers cannot
DROP POLICY IF EXISTS "assignments_insert_group_members" ON public.strategy_assignments;
CREATE POLICY "assignments_insert_group_members"
  ON public.strategy_assignments FOR INSERT TO authenticated
  WITH CHECK (assigned_by = auth.uid() AND public.is_strategy_editor(strategy_id));

-- DELETE: only editors (and admins) can unassign; viewers cannot
DROP POLICY IF EXISTS "assignments_delete_assigner_or_admin" ON public.strategy_assignments;
CREATE POLICY "assignments_delete_assigner_or_admin"
  ON public.strategy_assignments FOR DELETE TO authenticated
  USING (
    (assigned_by = auth.uid() AND public.is_strategy_editor(strategy_id))
    OR public.is_strategy_admin(strategy_id)
  );
