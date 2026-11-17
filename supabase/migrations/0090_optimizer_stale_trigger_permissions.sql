-- 0083 made the stale-state helper service-only, but its trigger callers still
-- ran as the client. Authorized writes (including group-delete cascades) must
-- reach the helper without exposing an unrestricted stale-state RPC.
ALTER FUNCTION public.mark_upgrade_runs_stale(UUID, UUID, UUID, TEXT)
  SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.on_build_target_change_mark_upgrade_runs_stale()
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.on_build_target_stage_change_mark_upgrade_runs_stale()
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.on_character_profile_change_mark_upgrade_runs_stale()
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.on_stash_snapshot_change_mark_upgrade_runs_stale()
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.on_stash_tab_pricing_change_mark_upgrade_runs_stale()
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;

-- Trigger execution follows the originating table's authorization and uses row
-- identifiers. None of these functions is a browser-callable mutation API.
REVOKE ALL ON FUNCTION public.mark_upgrade_runs_stale(UUID, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_build_target_change_mark_upgrade_runs_stale()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_build_target_stage_change_mark_upgrade_runs_stale()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_character_profile_change_mark_upgrade_runs_stale()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_stash_snapshot_change_mark_upgrade_runs_stale()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_stash_tab_pricing_change_mark_upgrade_runs_stale()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mark_upgrade_runs_stale(UUID, UUID, UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.on_build_target_change_mark_upgrade_runs_stale()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.on_build_target_stage_change_mark_upgrade_runs_stale()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.on_character_profile_change_mark_upgrade_runs_stale()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.on_stash_snapshot_change_mark_upgrade_runs_stale()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.on_stash_tab_pricing_change_mark_upgrade_runs_stale()
  TO service_role;
