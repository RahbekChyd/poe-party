CREATE TABLE public.build_targets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  character_id        UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  created_by          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  source_kind         TEXT NOT NULL DEFAULT 'pob_share_code'
                        CHECK (source_kind IN ('pob_share_code', 'pob_xml', 'legacy_pob_code')),
  raw_import          TEXT NOT NULL,
  raw_xml             TEXT,
  import_metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  compatibility_status TEXT NOT NULL DEFAULT 'pending'
                        CHECK (compatibility_status IN ('pending', 'compatible', 'partial', 'unsupported')),
  compatibility_notes TEXT,
  is_selected         BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX build_targets_group_user_idx
  ON public.build_targets(group_id, user_id, updated_at DESC);

CREATE UNIQUE INDEX build_targets_one_selected_per_user_idx
  ON public.build_targets(group_id, user_id)
  WHERE is_selected;

CREATE TRIGGER build_targets_updated_at
  BEFORE UPDATE ON public.build_targets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.build_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "build_targets_read_group_members"
  ON public.build_targets FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

CREATE POLICY "build_targets_insert_editors_or_owner"
  ON public.build_targets FOR INSERT TO authenticated
  WITH CHECK (
    public.is_group_member(group_id)
    AND created_by = auth.uid()
    AND (public.is_group_editor(group_id) OR user_id = auth.uid())
  );

CREATE POLICY "build_targets_update_editors_or_owner"
  ON public.build_targets FOR UPDATE TO authenticated
  USING (
    public.is_group_admin(group_id)
    OR (public.is_group_member(group_id) AND user_id = auth.uid())
    OR public.is_group_editor(group_id)
  );

CREATE POLICY "build_targets_delete_editors_or_owner"
  ON public.build_targets FOR DELETE TO authenticated
  USING (
    public.is_group_admin(group_id)
    OR (public.is_group_member(group_id) AND user_id = auth.uid())
    OR public.is_group_editor(group_id)
  );

CREATE TABLE public.build_target_stages (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_target_id         UUID NOT NULL REFERENCES public.build_targets(id) ON DELETE CASCADE,
  order_index             INTEGER NOT NULL,
  label                   TEXT NOT NULL,
  notes                   TEXT,
  tree_spec_id            TEXT,
  tree_spec_title         TEXT,
  item_set_id             TEXT,
  item_set_title          TEXT,
  skill_set_id            TEXT,
  skill_set_title         TEXT,
  primary_offensive_metric TEXT NOT NULL,
  target_metrics          JSONB NOT NULL DEFAULT '{}'::jsonb,
  hard_requirements       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(build_target_id, order_index)
);

CREATE INDEX build_target_stages_target_idx
  ON public.build_target_stages(build_target_id, order_index ASC);

CREATE TRIGGER build_target_stages_updated_at
  BEFORE UPDATE ON public.build_target_stages
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.build_target_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "build_target_stages_read_group_members"
  ON public.build_target_stages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.build_targets bt
      WHERE bt.id = build_target_id
        AND public.is_group_member(bt.group_id)
    )
  );

CREATE POLICY "build_target_stages_insert_editors_or_owner"
  ON public.build_target_stages FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.build_targets bt
      WHERE bt.id = build_target_id
        AND public.is_group_member(bt.group_id)
        AND (public.is_group_editor(bt.group_id) OR bt.user_id = auth.uid())
    )
  );

CREATE POLICY "build_target_stages_update_editors_or_owner"
  ON public.build_target_stages FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.build_targets bt
      WHERE bt.id = build_target_id
        AND (
          public.is_group_admin(bt.group_id)
          OR public.is_group_editor(bt.group_id)
          OR bt.user_id = auth.uid()
        )
    )
  );

CREATE POLICY "build_target_stages_delete_editors_or_owner"
  ON public.build_target_stages FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.build_targets bt
      WHERE bt.id = build_target_id
        AND (
          public.is_group_admin(bt.group_id)
          OR public.is_group_editor(bt.group_id)
          OR bt.user_id = auth.uid()
        )
    )
  );

ALTER TABLE public.build_targets
  ADD COLUMN selected_stage_id UUID REFERENCES public.build_target_stages(id) ON DELETE SET NULL;

CREATE TABLE public.upgrade_analysis_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  build_target_id UUID NOT NULL REFERENCES public.build_targets(id) ON DELETE CASCADE,
  target_stage_id UUID REFERENCES public.build_target_stages(id) ON DELETE SET NULL,
  target_user_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  character_id    UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  queued_by       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  budget_chaos    NUMERIC(14, 4) NOT NULL DEFAULT 0,
  input_hash      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed', 'stale')),
  stale_reason    TEXT,
  partial_reason  TEXT,
  error_detail    TEXT,
  summary         JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(build_target_id, input_hash)
);

CREATE INDEX upgrade_analysis_runs_group_target_idx
  ON public.upgrade_analysis_runs(group_id, target_user_id, created_at DESC);

CREATE INDEX upgrade_analysis_runs_target_idx
  ON public.upgrade_analysis_runs(build_target_id, created_at DESC);

CREATE TRIGGER upgrade_analysis_runs_updated_at
  BEFORE UPDATE ON public.upgrade_analysis_runs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.upgrade_analysis_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "upgrade_analysis_runs_read_group_members"
  ON public.upgrade_analysis_runs FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

CREATE POLICY "upgrade_analysis_runs_insert_service"
  ON public.upgrade_analysis_runs FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "upgrade_analysis_runs_update_service"
  ON public.upgrade_analysis_runs FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "upgrade_analysis_runs_delete_service"
  ON public.upgrade_analysis_runs FOR DELETE TO service_role
  USING (true);

CREATE TABLE public.upgrade_recommendation_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                UUID NOT NULL REFERENCES public.upgrade_analysis_runs(id) ON DELETE CASCADE,
  group_id              UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  target_user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_stage_id       UUID REFERENCES public.build_target_stages(id) ON DELETE SET NULL,
  category              TEXT NOT NULL
                          CHECK (category IN ('unlock_next_stage', 'best_single', 'owned_now')),
  kind                  TEXT NOT NULL CHECK (kind IN ('single', 'bundle')),
  title                 TEXT NOT NULL DEFAULT '',
  summary               TEXT,
  explanation           TEXT,
  effective_cost_chaos  NUMERIC(14, 4) NOT NULL DEFAULT 0,
  ask_price_chaos       NUMERIC(14, 4),
  score                 NUMERIC(14, 6) NOT NULL DEFAULT 0,
  stage_progress_score  NUMERIC(14, 6) NOT NULL DEFAULT 0,
  ranking_reason        JSONB NOT NULL DEFAULT '{}'::jsonb,
  before_metrics        JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_metrics         JSONB NOT NULL DEFAULT '{}'::jsonb,
  breaks_requirements   BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX upgrade_recommendation_plans_run_idx
  ON public.upgrade_recommendation_plans(run_id, score DESC, created_at ASC);

ALTER TABLE public.upgrade_recommendation_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "upgrade_recommendation_plans_read_group_members"
  ON public.upgrade_recommendation_plans FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

CREATE POLICY "upgrade_recommendation_plans_insert_service"
  ON public.upgrade_recommendation_plans FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "upgrade_recommendation_plans_update_service"
  ON public.upgrade_recommendation_plans FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "upgrade_recommendation_plans_delete_service"
  ON public.upgrade_recommendation_plans FOR DELETE TO service_role
  USING (true);

CREATE TABLE public.upgrade_recommendation_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id              UUID NOT NULL REFERENCES public.upgrade_recommendation_plans(id) ON DELETE CASCADE,
  run_id               UUID NOT NULL REFERENCES public.upgrade_analysis_runs(id) ON DELETE CASCADE,
  slot                 TEXT,
  source               TEXT NOT NULL CHECK (source IN ('owned', 'market')),
  item_name            TEXT,
  item_payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  trade_link           TEXT,
  ask_price_chaos      NUMERIC(14, 4),
  effective_price_chaos NUMERIC(14, 4) NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX upgrade_recommendation_items_plan_idx
  ON public.upgrade_recommendation_items(plan_id, created_at ASC);

ALTER TABLE public.upgrade_recommendation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "upgrade_recommendation_items_read_group_members"
  ON public.upgrade_recommendation_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.upgrade_recommendation_plans plan
      WHERE plan.id = plan_id
        AND public.is_group_member(plan.group_id)
    )
  );

CREATE POLICY "upgrade_recommendation_items_insert_service"
  ON public.upgrade_recommendation_items FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "upgrade_recommendation_items_update_service"
  ON public.upgrade_recommendation_items FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "upgrade_recommendation_items_delete_service"
  ON public.upgrade_recommendation_items FOR DELETE TO service_role
  USING (true);

CREATE OR REPLACE FUNCTION public.set_selected_build_target(p_build_target_id UUID)
RETURNS public.build_targets
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target public.build_targets;
BEGIN
  SELECT *
  INTO v_target
  FROM public.build_targets
  WHERE id = p_build_target_id;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Build target not found';
  END IF;

  IF NOT public.is_group_member(v_target.group_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT (public.is_group_editor(v_target.group_id) OR v_target.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to select build target';
  END IF;

  UPDATE public.build_targets
  SET is_selected = false
  WHERE group_id = v_target.group_id
    AND user_id = v_target.user_id
    AND is_selected = true;

  UPDATE public.build_targets
  SET is_selected = true
  WHERE id = p_build_target_id
  RETURNING * INTO v_target;

  RETURN v_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_upgrade_runs_stale(
  p_group_id UUID,
  p_target_user_id UUID DEFAULT NULL,
  p_build_target_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT 'inputs-changed'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.upgrade_analysis_runs
  SET status = 'stale',
      stale_reason = COALESCE(p_reason, stale_reason, 'inputs-changed'),
      updated_at = now()
  WHERE group_id = p_group_id
    AND (p_target_user_id IS NULL OR target_user_id = p_target_user_id)
    AND (p_build_target_id IS NULL OR build_target_id = p_build_target_id)
    AND status IN ('queued', 'running', 'completed', 'partial');
END;
$$;

CREATE OR REPLACE FUNCTION public.on_build_target_change_mark_upgrade_runs_stale()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.mark_upgrade_runs_stale(
    COALESCE(NEW.group_id, OLD.group_id),
    COALESCE(NEW.user_id, OLD.user_id),
    COALESCE(NEW.id, OLD.id),
    'build-target-updated'
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.on_build_target_stage_change_mark_upgrade_runs_stale()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_build_target_id UUID := COALESCE(NEW.build_target_id, OLD.build_target_id);
  v_group_id UUID;
  v_user_id UUID;
BEGIN
  SELECT group_id, user_id
  INTO v_group_id, v_user_id
  FROM public.build_targets
  WHERE id = v_build_target_id;

  IF v_group_id IS NOT NULL THEN
    PERFORM public.mark_upgrade_runs_stale(v_group_id, v_user_id, v_build_target_id, 'stage-mapping-updated');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.on_character_profile_change_mark_upgrade_runs_stale()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.mark_upgrade_runs_stale(
    COALESCE(NEW.group_id, OLD.group_id),
    COALESCE(NEW.user_id, OLD.user_id),
    NULL,
    'character-profile-updated'
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.on_stash_snapshot_change_mark_upgrade_runs_stale()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.mark_upgrade_runs_stale(
      COALESCE(NEW.group_id, OLD.group_id),
      NULL,
      NULL,
      'stash-refreshed'
    );
  ELSIF NEW.status = 'completed' OR OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.mark_upgrade_runs_stale(
      COALESCE(NEW.group_id, OLD.group_id),
      NULL,
      NULL,
      'stash-refreshed'
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.on_stash_tab_pricing_change_mark_upgrade_runs_stale()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(OLD.estimated_value_chaos, -1) IS DISTINCT FROM COALESCE(NEW.estimated_value_chaos, -1) THEN
    PERFORM public.mark_upgrade_runs_stale(NEW.group_id, NULL, NULL, 'pricing-refreshed');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER build_targets_mark_upgrade_runs_stale
  AFTER INSERT OR UPDATE OR DELETE ON public.build_targets
  FOR EACH ROW EXECUTE FUNCTION public.on_build_target_change_mark_upgrade_runs_stale();

CREATE TRIGGER build_target_stages_mark_upgrade_runs_stale
  AFTER INSERT OR UPDATE OR DELETE ON public.build_target_stages
  FOR EACH ROW EXECUTE FUNCTION public.on_build_target_stage_change_mark_upgrade_runs_stale();

CREATE TRIGGER character_profile_snapshots_mark_upgrade_runs_stale
  AFTER INSERT OR UPDATE OR DELETE ON public.character_profile_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.on_character_profile_change_mark_upgrade_runs_stale();

CREATE TRIGGER stash_snapshots_mark_upgrade_runs_stale
  AFTER INSERT OR UPDATE ON public.stash_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.on_stash_snapshot_change_mark_upgrade_runs_stale();

CREATE TRIGGER stash_tabs_mark_upgrade_runs_stale
  AFTER UPDATE OF estimated_value_chaos ON public.stash_tabs
  FOR EACH ROW EXECUTE FUNCTION public.on_stash_tab_pricing_change_mark_upgrade_runs_stale();
