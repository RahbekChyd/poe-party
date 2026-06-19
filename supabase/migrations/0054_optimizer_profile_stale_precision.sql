CREATE OR REPLACE FUNCTION public.on_character_profile_change_mark_upgrade_runs_stale()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
    PERFORM public.mark_upgrade_runs_stale(
      COALESCE(NEW.group_id, OLD.group_id),
      COALESCE(NEW.user_id, OLD.user_id),
      NULL,
      'character-profile-updated'
    );
  ELSIF
    NEW.character_id IS DISTINCT FROM OLD.character_id OR
    NEW.character_name IS DISTINCT FROM OLD.character_name OR
    NEW.league IS DISTINCT FROM OLD.league OR
    NEW.class IS DISTINCT FROM OLD.class OR
    NEW.ascendancy_class IS DISTINCT FROM OLD.ascendancy_class OR
    NEW.level IS DISTINCT FROM OLD.level OR
    NEW.gear IS DISTINCT FROM OLD.gear OR
    NEW.inventory IS DISTINCT FROM OLD.inventory OR
    NEW.jewels IS DISTINCT FROM OLD.jewels OR
    NEW.passive_tree IS DISTINCT FROM OLD.passive_tree OR
    NEW.atlas_tree IS DISTINCT FROM OLD.atlas_tree
  THEN
    PERFORM public.mark_upgrade_runs_stale(
      NEW.group_id,
      NEW.user_id,
      NULL,
      'character-profile-updated'
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
