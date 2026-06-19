CREATE OR REPLACE FUNCTION public.enforce_poe2_group_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poe_account_name TEXT;
  v_allowed_accounts TEXT;
  v_allowed_account TEXT;
BEGIN
  IF NEW.game <> 'poe2' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.game, 'poe1') = 'poe2' THEN
    RETURN NEW;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT lower(trim(u.poe_account_name))
  INTO v_poe_account_name
  FROM public.users u
  WHERE u.id = auth.uid();

  v_allowed_accounts := lower(coalesce(current_setting('app.allowed_poe2_accounts', true), ''));

  IF trim(v_allowed_accounts) = '*' THEN
    RETURN NEW;
  END IF;

  FOREACH v_allowed_account IN ARRAY string_to_array(v_allowed_accounts, ',') LOOP
    IF v_poe_account_name = trim(v_allowed_account) THEN
      RETURN NEW;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'PoE2 workspaces are currently limited to allowlisted accounts.';
END;
$$;

DROP TRIGGER IF EXISTS groups_enforce_poe2_access ON public.groups;

CREATE TRIGGER groups_enforce_poe2_access
  BEFORE INSERT OR UPDATE OF game ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_poe2_group_access();
