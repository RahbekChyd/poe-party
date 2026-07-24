BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(14);

SELECT ok(
  NOT has_table_privilege('anon', 'public.latest_snapshots', 'SELECT'),
  'anonymous cannot read latest_snapshots'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.latest_stash_items', 'SELECT'),
  'anonymous cannot read latest_stash_items'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.latest_snapshots', 'SELECT'),
  'authenticated users can query the RLS-invoker snapshot view'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.latest_stash_items', 'SELECT'),
  'authenticated users can query the RLS-invoker item view'
);
SELECT results_eq(
  $$
    SELECT count(*)::BIGINT
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('latest_snapshots', 'latest_stash_items')
      AND 'security_invoker=true' = ANY(COALESCE(c.reloptions, ARRAY[]::TEXT[]))
  $$,
  $$ VALUES (2::BIGINT) $$,
  'both private stash views use security_invoker'
);
SELECT is_empty(
  $$
    SELECT p.oid::regprocedure::TEXT
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  $$,
  'no SECURITY DEFINER function inherits EXECUTE from PUBLIC'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.bulk_update_snapshot_item_prices_internal(uuid,jsonb)', 'EXECUTE'),
  'anonymous cannot call internal snapshot price mutation'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.mark_upgrade_runs_stale(uuid,uuid,uuid,text)', 'EXECUTE'),
  'authenticated users cannot globally stale optimizer runs'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.claim_guest_upgrade_analysis_daily_usage(date,text,text,integer,integer)', 'EXECUTE'),
  'anonymous cannot forge guest quota claims'
);
SELECT ok(
  has_function_privilege('service_role', 'public.claim_guest_upgrade_analysis_daily_usage(date,text,text,integer,integer)', 'EXECUTE'),
  'service role can claim guest quota'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.create_group_with_owner(text,text,text,text,boolean)', 'EXECUTE'),
  'authenticated users can use atomic group creation'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.upgrade_analysis_runs', 'UPDATE'),
  'authenticated users cannot rewrite optimizer run rows directly'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.cancel_upgrade_analysis_run(uuid)', 'EXECUTE'),
  'authenticated users can use the narrow optimizer cancellation RPC'
);
SELECT ok(
  (
    SELECT udt_name = 'uuid'
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'poe_account_sub'
  ),
  'OAuth subject is stored as a UUID'
);

SELECT * FROM finish();
ROLLBACK;
