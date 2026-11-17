BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(7);
INSERT INTO auth.users(id,email) VALUES
 ('12000000-0000-0000-0000-000000000001','benchmark-one@example.invalid'),
 ('12000000-0000-0000-0000-000000000002','benchmark-two@example.invalid');
INSERT INTO public.users(id,poe_account_name) VALUES
 ('12000000-0000-0000-0000-000000000001','BenchmarkOne#0001'),
 ('12000000-0000-0000-0000-000000000002','BenchmarkTwo#0002');
INSERT INTO public.groups(id,name,invite_code,created_by,game,league) VALUES
 ('23000000-0000-0000-0000-000000000001','Threads source','bench001','12000000-0000-0000-0000-000000000001','poe1','Covens'),
 ('23000000-0000-0000-0000-000000000002','Threads target','bench002','12000000-0000-0000-0000-000000000002','poe1','Covens');
INSERT INTO public.group_members(group_id,user_id,role) VALUES
 ('23000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','admin'),
 ('23000000-0000-0000-0000-000000000002','12000000-0000-0000-0000-000000000002','admin');

INSERT INTO strategies(id,group_id,name,created_by,setup_cutoff_at) VALUES
 ('34000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','Current setup','12000000-0000-0000-0000-000000000001','2026-01-01');
INSERT INTO group_wealth_history(group_id,triggered_by_user_id,strategy_id,total_wealth_chaos,created_at,pricing_summary)
SELECT '23000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','34000000-0000-0000-0000-000000000001', amount, stamp::timestamptz, summary::jsonb
FROM (VALUES
 (1,'2025-12-31 00:00Z','{"status":"complete","version":1}'),
 (100,'2026-01-01 00:00Z','{"status":"complete","version":1}'),
 (100000,'2026-01-01 01:00Z','{"status":"partial","version":1}'),
 (150,'2026-01-01 02:00Z','{"status":"complete","version":1}'),
 (170,'2026-01-01 03:00Z','{"status":"complete","version":1}')
) AS observations(amount,stamp,summary);
SELECT is((SELECT sample_count FROM get_strategy_benchmark('34000000-0000-0000-0000-000000000001')),1,'Only adjacent complete intervals count; cutoff and partial capture cannot inflate rate');
SELECT is((SELECT chaos_per_hour FROM get_strategy_benchmark('34000000-0000-0000-0000-000000000001')),20::numeric,'Rate is weighted from eligible interval only');
UPDATE strategies SET name='Renamed' WHERE id='34000000-0000-0000-0000-000000000001';
SELECT is((SELECT sample_count FROM get_strategy_benchmark('34000000-0000-0000-0000-000000000001')),1,'Renaming preserves setup benchmark window');
UPDATE strategies SET threads='[{"name":"Breach Thread","quantity":1,"required":true,"alternatives":[]}]' WHERE id='34000000-0000-0000-0000-000000000001';
SELECT is((SELECT sample_count FROM get_strategy_benchmark('34000000-0000-0000-0000-000000000001')),0,'Changed setup starts a fresh benchmark window');
SELECT is((SELECT count(*)::integer FROM group_wealth_history),5,'Historical observations remain intact');
SELECT ok(NOT has_function_privilege('authenticated','public.get_strategy_benchmark(uuid)','EXECUTE'),'Clients cannot query private aggregate helper directly');
SELECT ok(NOT has_function_privilege('anon','public.get_strategy_benchmark(uuid)','EXECUTE'),'Anonymous clients cannot query private aggregate helper directly');
SELECT * FROM finish();
ROLLBACK;
