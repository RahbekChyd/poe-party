-- Migration: Auto-enforce snapshot retention limits per user tier
--
-- When a snapshot transitions to 'completed', if the user now holds more
-- completed snapshots than their tier allows (across ALL groups combined),
-- delete the oldest one(s). Cascade deletes on stash_tabs and stash_items
-- (set up in 0005) mean no manual child cleanup is needed.

CREATE OR REPLACE FUNCTION public.enforce_snapshot_retention()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_limit  INTEGER;
  v_count  INTEGER;
  v_oldest UUID;
BEGIN
  -- Only fire when a snapshot transitions TO completed
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT public.get_snapshot_limit(NEW.user_id) INTO v_limit;

  LOOP
    SELECT COUNT(*) INTO v_count
    FROM public.stash_snapshots
    WHERE user_id = NEW.user_id
      AND status  = 'completed'
      AND id     <> NEW.id;

    EXIT WHEN v_count < v_limit;

    -- Delete oldest completed snapshot for this user (any group)
    SELECT id INTO v_oldest
    FROM public.stash_snapshots
    WHERE user_id = NEW.user_id
      AND status  = 'completed'
      AND id     <> NEW.id
    ORDER BY completed_at ASC
    LIMIT 1;

    DELETE FROM public.stash_snapshots WHERE id = v_oldest;
    -- stash_tabs and stash_items are removed via ON DELETE CASCADE
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_snapshot_retention_trigger
  AFTER UPDATE ON public.stash_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_snapshot_retention();
