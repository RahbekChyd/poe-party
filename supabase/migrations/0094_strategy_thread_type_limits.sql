-- Validate paid Thread quantities per type. Every setup accepted by the
-- previous eight-total check also satisfies this replacement CHECK function.
CREATE OR REPLACE FUNCTION public.valid_strategy_threads(p_threads JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  thread_names CONSTANT TEXT[] := ARRAY[
    'Abyss Thread', 'Bestiary Thread', 'Betrayal Thread', 'Blight Thread', 'Breach Thread',
    'Expedition Thread', 'Incursion Thread', 'Legion Thread', 'Ritual Thread', 'Ultimatum Thread'
  ];
  thread JSONB;
  alternative JSONB;
  thread_name TEXT;
  type_quantity INTEGER;
  quantities JSONB := '{}'::JSONB;
BEGIN
  IF jsonb_typeof(p_threads) IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;

  FOR thread IN SELECT value FROM jsonb_array_elements(p_threads) LOOP
    thread_name := thread->>'name';
    IF jsonb_typeof(thread) <> 'object'
       OR NOT COALESCE(thread_name = ANY(thread_names), false)
       OR jsonb_typeof(thread->'quantity') IS DISTINCT FROM 'number'
       OR (thread->>'quantity') !~ '^[1-8]$'
       OR jsonb_typeof(thread->'required') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(thread->'alternatives') IS DISTINCT FROM 'array' THEN
      RETURN false;
    END IF;

    type_quantity := COALESCE((quantities->>thread_name)::INTEGER, 0)
                     + (thread->>'quantity')::INTEGER;
    IF type_quantity > 8 THEN
      RETURN false;
    END IF;
    quantities := jsonb_set(quantities, ARRAY[thread_name], to_jsonb(type_quantity));

    FOR alternative IN SELECT value FROM jsonb_array_elements(thread->'alternatives') LOOP
      IF NOT COALESCE(alternative->>'name' = ANY(thread_names), false) THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;
  RETURN true;
END;
$$;

-- Apply the stricter type count to new selections without rewriting older strategies.
CREATE FUNCTION public.enforce_strategy_thread_type_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.threads = OLD.threads THEN
    RETURN NEW;
  END IF;

  IF (SELECT count(DISTINCT thread->>'name') FROM jsonb_array_elements(NEW.threads) AS thread) <= 3 THEN
    RETURN NEW;
  END IF;

  -- The subscription RPC and sync trigger can copy the exact public setup of a legacy source.
  IF NEW.subscription_state = 'live' AND EXISTS (
    SELECT 1
    FROM public.strategies AS source
    WHERE source.id = NEW.source_strategy_id
      AND source.source_strategy_id IS NULL
      AND source.visibility = 'public'
      AND source.is_active
      AND source.threads = NEW.threads
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Use up to three Thread types per map.' USING ERRCODE = '23514';
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_strategy_thread_type_limit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER enforce_strategy_thread_type_limit
AFTER INSERT OR UPDATE OF threads ON public.strategies
FOR EACH ROW EXECUTE FUNCTION public.enforce_strategy_thread_type_limit();

-- Copies are created by the existing authorized RPC. Clients insert originals.
ALTER POLICY "strategies_insert_group_members" ON public.strategies
WITH CHECK (
  created_by = auth.uid()
  AND public.is_group_editor(group_id)
  AND source_strategy_id IS NULL
);
