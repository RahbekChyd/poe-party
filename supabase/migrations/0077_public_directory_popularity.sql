-- Track lightweight public-directory popularity for server-side search ordering.
-- Counts are aggregate-only and are incremented through a SECURITY DEFINER RPC
-- that verifies the target is public before updating the counter.

CREATE TABLE IF NOT EXISTS public.public_directory_view_counts (
  target_type    TEXT NOT NULL CHECK (target_type IN ('character', 'group')),
  target_id      UUID NOT NULL,
  view_count     BIGINT NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (target_type, target_id)
);

CREATE INDEX IF NOT EXISTS public_directory_view_counts_popularity_idx
  ON public.public_directory_view_counts(target_type, view_count DESC, target_id);

ALTER TABLE public.public_directory_view_counts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_directory_view_counts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_directory_view_counts TO service_role;

DROP POLICY IF EXISTS "public_directory_view_counts_service_only"
  ON public.public_directory_view_counts;
CREATE POLICY "public_directory_view_counts_service_only"
  ON public.public_directory_view_counts FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.record_public_directory_view(
  p_target_type TEXT,
  p_target_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_target_type TEXT := lower(trim(COALESCE(p_target_type, '')));
  target_is_public BOOLEAN := false;
BEGIN
  IF p_target_id IS NULL OR normalized_target_type NOT IN ('character', 'group') THEN
    RETURN;
  END IF;

  IF normalized_target_type = 'character' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.character_profile_snapshots cps
      WHERE cps.id = p_target_id
        AND cps.visibility = 'public'
    )
    INTO target_is_public;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.groups g
      JOIN public.character_profile_snapshots cps
        ON cps.group_id = g.id
       AND cps.visibility = 'public'
      WHERE g.id = p_target_id
    )
    INTO target_is_public;
  END IF;

  IF NOT target_is_public THEN
    RETURN;
  END IF;

  INSERT INTO public.public_directory_view_counts (
    target_type,
    target_id,
    view_count,
    first_viewed_at,
    last_viewed_at,
    updated_at
  )
  VALUES (
    normalized_target_type,
    p_target_id,
    1,
    now(),
    now(),
    now()
  )
  ON CONFLICT (target_type, target_id) DO UPDATE
  SET view_count = public_directory_view_counts.view_count + 1,
      last_viewed_at = now(),
      updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.search_public_characters(
  p_viewer_group_id UUID,
  p_query TEXT
)
RETURNS TABLE (
  profile_id UUID,
  group_id UUID,
  group_name TEXT,
  group_game TEXT,
  owner_name TEXT,
  character_name TEXT,
  class TEXT,
  ascendancy_class INTEGER,
  level INTEGER,
  league TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH viewer_group AS (
    SELECT g.id, g.game, g.league
    FROM public.groups g
    WHERE g.id = p_viewer_group_id
      AND public.is_group_member(g.id)
  )
  SELECT
    cps.id AS profile_id,
    cps.group_id,
    g.name AS group_name,
    g.game AS group_game,
    COALESCE(u.display_name, u.poe_account_name, 'Unknown') AS owner_name,
    cps.character_name,
    cps.class,
    cps.ascendancy_class,
    cps.level,
    cps.league
  FROM viewer_group vg
  JOIN public.character_profile_snapshots cps
    ON cps.visibility = 'public'
  JOIN public.groups g
    ON g.id = cps.group_id
   AND g.league = vg.league
   AND g.game = vg.game
  JOIN public.users u
    ON u.id = cps.user_id
  LEFT JOIN public.public_directory_view_counts pvc
    ON pvc.target_type = 'character'
   AND pvc.target_id = cps.id
  WHERE cps.character_name ILIKE '%' || trim(COALESCE(p_query, '')) || '%'
  ORDER BY COALESCE(pvc.view_count, 0) DESC, cps.character_name ASC
  LIMIT 40;
$$;

CREATE OR REPLACE FUNCTION public.search_public_groups(
  p_viewer_group_id UUID,
  p_query TEXT
)
RETURNS TABLE (
  group_id UUID,
  group_name TEXT,
  game TEXT,
  league TEXT,
  public_character_count INTEGER,
  characters JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH viewer_group AS (
    SELECT g.id, g.game, g.league
    FROM public.groups g
    WHERE g.id = p_viewer_group_id
      AND public.is_group_member(g.id)
  ),
  matched_groups AS (
    SELECT g.id, g.name, g.game, g.league
    FROM viewer_group vg
    JOIN public.groups g
      ON g.league = vg.league
     AND g.game = vg.game
    WHERE g.name ILIKE '%' || trim(COALESCE(p_query, '')) || '%'
  )
  SELECT
    g.id AS group_id,
    g.name AS group_name,
    g.game,
    g.league,
    count(cps.id)::INTEGER AS public_character_count,
    jsonb_agg(
      jsonb_build_object(
        'profile_id', cps.id,
        'character_name', cps.character_name,
        'class', cps.class,
        'ascendancy_class', cps.ascendancy_class,
        'level', cps.level,
        'owner_name', COALESCE(u.display_name, u.poe_account_name, 'Unknown')
      )
      ORDER BY cps.character_name ASC
    ) AS characters
  FROM matched_groups g
  JOIN public.character_profile_snapshots cps
    ON cps.group_id = g.id
   AND cps.visibility = 'public'
  JOIN public.users u
    ON u.id = cps.user_id
  LEFT JOIN public.public_directory_view_counts gvc
    ON gvc.target_type = 'group'
   AND gvc.target_id = g.id
  LEFT JOIN public.public_directory_view_counts cvc
    ON cvc.target_type = 'character'
   AND cvc.target_id = cps.id
  GROUP BY g.id, g.name, g.game, g.league
  HAVING count(cps.id) > 0
  ORDER BY COALESCE(max(gvc.view_count), 0) + COALESCE(sum(cvc.view_count), 0) DESC,
           g.name ASC
  LIMIT 20;
$$;

CREATE OR REPLACE FUNCTION public.search_public_characters_for_league(
  p_game TEXT,
  p_league TEXT,
  p_query TEXT
)
RETURNS TABLE (
  profile_id UUID,
  group_id UUID,
  group_name TEXT,
  group_game TEXT,
  owner_name TEXT,
  character_name TEXT,
  class TEXT,
  ascendancy_class INTEGER,
  level INTEGER,
  league TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cps.id AS profile_id,
    cps.group_id,
    g.name AS group_name,
    g.game AS group_game,
    COALESCE(u.display_name, u.poe_account_name, 'Unknown') AS owner_name,
    cps.character_name,
    cps.class,
    cps.ascendancy_class,
    cps.level,
    cps.league
  FROM public.character_profile_snapshots cps
  JOIN public.groups g
    ON g.id = cps.group_id
   AND g.game = trim(COALESCE(p_game, ''))
   AND g.league = trim(COALESCE(p_league, ''))
  JOIN public.users u
    ON u.id = cps.user_id
  LEFT JOIN public.public_directory_view_counts pvc
    ON pvc.target_type = 'character'
   AND pvc.target_id = cps.id
  WHERE cps.visibility = 'public'
    AND char_length(trim(COALESCE(p_query, ''))) >= 2
    AND cps.character_name ILIKE '%' || trim(COALESCE(p_query, '')) || '%'
  ORDER BY COALESCE(pvc.view_count, 0) DESC, cps.character_name ASC
  LIMIT 40;
$$;

CREATE OR REPLACE FUNCTION public.search_public_groups_for_league(
  p_game TEXT,
  p_league TEXT,
  p_query TEXT
)
RETURNS TABLE (
  group_id UUID,
  group_name TEXT,
  game TEXT,
  league TEXT,
  public_character_count INTEGER,
  characters JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH matched_groups AS (
    SELECT g.id, g.name, g.game, g.league
    FROM public.groups g
    WHERE g.game = trim(COALESCE(p_game, ''))
      AND g.league = trim(COALESCE(p_league, ''))
      AND char_length(trim(COALESCE(p_query, ''))) >= 2
      AND g.name ILIKE '%' || trim(COALESCE(p_query, '')) || '%'
  )
  SELECT
    g.id AS group_id,
    g.name AS group_name,
    g.game,
    g.league,
    count(cps.id)::INTEGER AS public_character_count,
    jsonb_agg(
      jsonb_build_object(
        'profile_id', cps.id,
        'character_name', cps.character_name,
        'class', cps.class,
        'ascendancy_class', cps.ascendancy_class,
        'level', cps.level,
        'owner_name', COALESCE(u.display_name, u.poe_account_name, 'Unknown')
      )
      ORDER BY cps.character_name ASC
    ) AS characters
  FROM matched_groups g
  JOIN public.character_profile_snapshots cps
    ON cps.group_id = g.id
   AND cps.visibility = 'public'
  JOIN public.users u
    ON u.id = cps.user_id
  LEFT JOIN public.public_directory_view_counts gvc
    ON gvc.target_type = 'group'
   AND gvc.target_id = g.id
  LEFT JOIN public.public_directory_view_counts cvc
    ON cvc.target_type = 'character'
   AND cvc.target_id = cps.id
  GROUP BY g.id, g.name, g.game, g.league
  HAVING count(cps.id) > 0
  ORDER BY COALESCE(max(gvc.view_count), 0) + COALESCE(sum(cvc.view_count), 0) DESC,
           g.name ASC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.record_public_directory_view(TEXT, UUID) TO anon, authenticated;
