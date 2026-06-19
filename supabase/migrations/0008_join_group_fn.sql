-- Migration: RPC to join a group by invite code
-- Required because RLS on groups only allows reading groups you're already a member of,
-- so we need a SECURITY DEFINER function to look up a group by invite code before joining.

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
  VALUES (v_group_id, auth.uid(), 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  RETURN v_group_id;
END;
$$;
