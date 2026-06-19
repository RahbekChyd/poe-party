-- Non-owners now read everything from the list endpoints
-- (list_public_services_for_league / list_public_services) and expand inline
-- on the services page, so the single-service preview RPC is unused.
DROP FUNCTION IF EXISTS public.get_public_service_preview(UUID);
