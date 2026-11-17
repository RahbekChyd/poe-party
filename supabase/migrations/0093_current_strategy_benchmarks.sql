-- Keep old observations, but do not use old pricing or changed setups as current benchmarks.
ALTER TABLE public.strategies ADD COLUMN setup_cutoff_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE FUNCTION public.mark_strategy_setup_changed()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF (NEW.threads, NEW.atlas_tree_url, NEW.map_requirements, NEW.map_cost, NEW.map_trade_link)
    IS DISTINCT FROM (OLD.threads, OLD.atlas_tree_url, OLD.map_requirements, OLD.map_cost, OLD.map_trade_link) THEN
    NEW.setup_cutoff_at := clock_timestamp();
  ELSE
    NEW.setup_cutoff_at := OLD.setup_cutoff_at;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER strategy_setup_changed BEFORE UPDATE ON public.strategies
FOR EACH ROW EXECUTE FUNCTION public.mark_strategy_setup_changed();
REVOKE ALL ON FUNCTION public.mark_strategy_setup_changed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_strategy_setup_changed() TO service_role;

CREATE OR REPLACE FUNCTION public.get_strategy_benchmark(p_strategy_id UUID)
RETURNS TABLE (sample_count INTEGER, chaos_per_hour NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  WITH ordered AS (
    SELECT gwh.*, lag(gwh.total_wealth_chaos) OVER w previous_total,
      lag(gwh.created_at) OVER w previous_at, lag(gwh.strategy_id) OVER w previous_strategy,
      lag(gwh.pricing_summary) OVER w previous_pricing
    FROM public.group_wealth_history gwh
    JOIN public.strategies s ON s.group_id = gwh.group_id
    WHERE s.id = p_strategy_id AND gwh.created_at >= s.setup_cutoff_at
    WINDOW w AS (ORDER BY gwh.created_at, gwh.id)
  ), intervals AS (
    SELECT total_wealth_chaos - previous_total delta,
      extract(epoch FROM (created_at - previous_at)) / 3600.0 hours
    FROM ordered WHERE strategy_id = p_strategy_id AND previous_strategy = p_strategy_id
      AND pricing_summary->>'status' = 'complete' AND previous_pricing->>'status' = 'complete'
      AND pricing_summary->>'version' = '1' AND previous_pricing->>'version' = '1'
      AND created_at > previous_at
  )
  SELECT count(*)::INTEGER, CASE WHEN sum(hours) > 0 THEN sum(delta) / sum(hours) ELSE NULL END FROM intervals;
$$;
-- Only discovery RPCs and service code may calculate public aggregates.
REVOKE ALL ON FUNCTION public.get_strategy_benchmark(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_strategy_benchmark(UUID) TO service_role;
