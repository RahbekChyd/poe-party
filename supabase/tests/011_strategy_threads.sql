BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(34);
INSERT INTO auth.users(id,email) VALUES
 ('11000000-0000-0000-0000-000000000001','thread-one@example.invalid'),
 ('11000000-0000-0000-0000-000000000002','thread-two@example.invalid');
INSERT INTO public.users(id,poe_account_name) VALUES
 ('11000000-0000-0000-0000-000000000001','ThreadOne#0001'),
 ('11000000-0000-0000-0000-000000000002','ThreadTwo#0002');
INSERT INTO public.groups(id,name,invite_code,created_by,game,league) VALUES
 ('22000000-0000-0000-0000-000000000001','Threads source','thread01','11000000-0000-0000-0000-000000000001','poe1','Covens'),
 ('22000000-0000-0000-0000-000000000002','Threads target','thread02','11000000-0000-0000-0000-000000000002','poe1','Covens');
INSERT INTO public.group_members(group_id,user_id,role) VALUES
 ('22000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','admin'),
 ('22000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000002','admin');
INSERT INTO public.strategies(id,group_id,name,created_by,visibility,scarabs) VALUES
 ('33000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','Legacy setup','11000000-0000-0000-0000-000000000001','public','[{"name":"Ambush Scarab","quantity":2}]');
CREATE TEMP TABLE thread_setups(label TEXT PRIMARY KEY, threads JSONB NOT NULL);
INSERT INTO thread_setups VALUES
 ('full', '[
    {"name":"Breach Thread","quantity":8,"required":true,"alternatives":[{"name":"Incursion Thread"}]},
    {"name":"Legion Thread","quantity":8,"required":false,"alternatives":[]},
    {"name":"Blight Thread","quantity":8,"required":true,"alternatives":[]}
  ]'),
 ('legacy', '[
    {"name":"Breach Thread","quantity":1,"required":true,"alternatives":[]},
    {"name":"Legion Thread","quantity":1,"required":false,"alternatives":[]},
    {"name":"Blight Thread","quantity":1,"required":true,"alternatives":[]},
    {"name":"Ritual Thread","quantity":1,"required":true,"alternatives":[]}
  ]');
GRANT SELECT ON thread_setups TO authenticated;
-- This setup was valid under the old eight-total cap.
ALTER TABLE strategies DISABLE TRIGGER enforce_strategy_thread_type_limit;
INSERT INTO strategies(id,group_id,name,created_by,visibility,threads)
SELECT '33000000-0000-0000-0000-000000000002',
       '22000000-0000-0000-0000-000000000001',
       'Four saved Thread types',
       '11000000-0000-0000-0000-000000000001',
       'public', threads
FROM thread_setups WHERE label='legacy';
ALTER TABLE strategies ENABLE TRIGGER enforce_strategy_thread_type_limit;

SELECT is((SELECT threads FROM strategies WHERE id='33000000-0000-0000-0000-000000000001'),'[]'::jsonb,'Existing-style setup starts with empty Threads');
SELECT is((SELECT scarabs->0->>'name' FROM strategies WHERE id='33000000-0000-0000-0000-000000000001'),'Ambush Scarab','Legacy Scarab remains intact');
SELECT ok(valid_strategy_threads('[{"name":"Breach Thread","quantity":8,"required":true,"alternatives":[]}]'),'Eight spent Threads valid');
SELECT ok(NOT valid_strategy_threads('[{"name":"Frayed Thread","quantity":1,"required":true,"alternatives":[]}]'),'Frayed Thread not usable in planner');
SELECT ok(NOT valid_strategy_threads('[{"name":"Breach Thread","quantity":8,"required":true,"alternatives":[]},{"name":"Breach Thread","quantity":1,"required":false,"alternatives":[]}]'),'Repeated optional rows count toward their type maximum');
SELECT ok(valid_strategy_threads('[{"name":"Breach Thread","quantity":4,"required":true,"alternatives":[]},{"name":"Breach Thread","quantity":4,"required":false,"alternatives":[]}]'),'Repeated paid rows totaling eight for a type are valid');
SELECT ok(valid_strategy_threads((SELECT threads FROM thread_setups WHERE label='full')),'Eight Threads of three types are valid with an alternative');
SELECT ok(NOT valid_strategy_threads('[{"name":"Breach Thread","quantity":1.5,"required":true,"alternatives":[]}]'),'Fractional quantity rejected');
SELECT ok(NOT valid_strategy_threads('[{"name":"Breach Thread","quantity":1,"required":true,"alternatives":[{"name":"Frayed Thread"}]}]'),'Invalid alternatives rejected');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000002',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT lives_ok($$SELECT subscribe_to_public_strategy('22000000-0000-0000-0000-000000000002','33000000-0000-0000-0000-000000000001')$$,'Editor can subscribe');
SELECT is((SELECT threads FROM strategies WHERE source_strategy_id='33000000-0000-0000-0000-000000000001'),'[]'::jsonb,'Subscription starts empty too');
UPDATE strategies SET threads='[{"name":"Ritual Thread","quantity":1,"required":true,"alternatives":[]}]' WHERE source_strategy_id='33000000-0000-0000-0000-000000000001';
SELECT is((SELECT threads FROM strategies WHERE source_strategy_id='33000000-0000-0000-0000-000000000001'),'[]'::jsonb,'RLS silently denies direct writes to subscribed setup');
SELECT lives_ok($$
  INSERT INTO strategies (group_id, name, created_by, threads)
  SELECT '22000000-0000-0000-0000-000000000002', 'Full setup', auth.uid(), threads
  FROM thread_setups WHERE label='full'
$$,'Workspace admin can create a strategy with 24 paid Threads');
SELECT throws_ok($$
  INSERT INTO strategies (group_id, name, created_by, threads)
  SELECT '22000000-0000-0000-0000-000000000001', 'Wrong workspace', auth.uid(), threads
  FROM thread_setups WHERE label='full'
$$,'P0001','Strategy creator must belong to its group','Workspace admin cannot create a strategy in a different workspace');
SELECT throws_ok($$
  INSERT INTO strategies (group_id, name, created_by, threads)
  SELECT '22000000-0000-0000-0000-000000000002', 'Fourth type', auth.uid(), threads
  FROM thread_setups WHERE label='legacy'
$$,'23514','Use up to three Thread types per map.','A new setup with four types is rejected even when it costs four paid Threads');
SELECT throws_ok($$
  INSERT INTO strategies (group_id, name, created_by, threads)
  VALUES ('22000000-0000-0000-0000-000000000002', 'Ninth Thread', auth.uid(), '[
    {"name":"Breach Thread","quantity":8,"required":true,"alternatives":[]},
    {"name":"Breach Thread","quantity":1,"required":false,"alternatives":[]}
  ]')
$$,'23514',NULL,'The table check rejects a ninth Thread of one type');
SELECT throws_ok($$
  INSERT INTO strategies (group_id, name, created_by, source_strategy_id, subscription_state, threads)
  SELECT '22000000-0000-0000-0000-000000000002', 'Forged copy', auth.uid(),
         '33000000-0000-0000-0000-000000000002', 'live', threads
  FROM thread_setups WHERE label='legacy'
$$,'42501',NULL,'A client cannot mark a direct insert as a subscription to bypass the limit');
SELECT lives_ok($$SELECT subscribe_to_public_strategy('22000000-0000-0000-0000-000000000002','33000000-0000-0000-0000-000000000002')$$,
  'The authorized subscription RPC can copy a legacy four-type setup');
SELECT is((SELECT threads FROM strategies WHERE source_strategy_id='33000000-0000-0000-0000-000000000002'),
  (SELECT threads FROM thread_setups WHERE label='legacy'),'The legacy subscription copies all four types exactly');
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);
SELECT lives_ok($$
  UPDATE strategies SET name='Legacy setup renamed', threads=threads
  WHERE id='33000000-0000-0000-0000-000000000002'
$$,'Existing clients can submit unchanged legacy Threads during an unrelated edit');
SELECT is((SELECT setup_cutoff_at FROM strategies WHERE id='33000000-0000-0000-0000-000000000002'),
  transaction_timestamp(),'Renaming does not reset the source strategy benchmark cutoff');
SELECT throws_ok($$
  UPDATE strategies SET threads=jsonb_set(threads, '{0,quantity}', '2')
  WHERE id='33000000-0000-0000-0000-000000000002'
$$,'23514','Use up to three Thread types per map.','An edited legacy setup must satisfy the new cap');
RESET ROLE;
SELECT is((SELECT name FROM strategies WHERE source_strategy_id='33000000-0000-0000-0000-000000000002'),
  'Legacy setup renamed','Unrelated edits still propagate to legacy subscriptions');
SELECT throws_ok($$
  UPDATE strategies SET threads=jsonb_set(threads, '{0,quantity}', '2')
  WHERE source_strategy_id='33000000-0000-0000-0000-000000000002'
$$,'23514','Use up to three Thread types per map.','An over-cap live copy must exactly match its public source');
SELECT lives_ok($$
  UPDATE strategies SET threads=(SELECT threads FROM thread_setups WHERE label='full')
  WHERE id='33000000-0000-0000-0000-000000000002'
$$,'A legacy source can switch to a valid 24-Thread setup');
SELECT is((SELECT threads FROM strategies WHERE source_strategy_id='33000000-0000-0000-0000-000000000002'),
  (SELECT threads FROM thread_setups WHERE label='full'),'A 24-Thread setup syncs to its live subscription');
UPDATE strategies SET threads='[{"name":"Breach Thread","quantity":3,"required":true,"alternatives":[]}]' WHERE id='33000000-0000-0000-0000-000000000001';
SELECT is((SELECT threads->0->>'quantity' FROM strategies WHERE source_strategy_id='33000000-0000-0000-0000-000000000001'),'3','Thread-only edits propagate to live copy');
SELECT is((SELECT scarabs->0->>'name' FROM strategies WHERE source_strategy_id='33000000-0000-0000-0000-000000000001'),'Ambush Scarab','Legacy reference follows copy');
UPDATE strategies SET subscription_state='frozen' WHERE source_strategy_id='33000000-0000-0000-0000-000000000001';
UPDATE strategies SET threads='[{"name":"Legion Thread","quantity":4,"required":true,"alternatives":[]}]' WHERE id='33000000-0000-0000-0000-000000000001';
SELECT is((SELECT threads->0->>'name' FROM strategies WHERE source_strategy_id='33000000-0000-0000-0000-000000000001'),'Breach Thread','Frozen copies keep their Thread setup');
SET LOCAL ROLE anon;
SELECT is((SELECT threads->0->>'name' FROM get_public_strategy_preview('33000000-0000-0000-0000-000000000001')),'Legion Thread','Anonymous public detail projects Threads');
SELECT is((SELECT count(*)::integer FROM get_public_strategy_preview((SELECT NULL::uuid))),0,'Unknown public setup does not expose data');
RESET ROLE;
UPDATE strategies SET visibility='group_only' WHERE id='33000000-0000-0000-0000-000000000001';
SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM get_public_strategy_preview('33000000-0000-0000-0000-000000000001')),0,'Private source not exposed');
SELECT ok(NOT has_function_privilege('anon','public.subscribe_to_public_strategy(uuid,uuid)','EXECUTE'),'Anonymous cannot subscribe');
SELECT ok(NOT has_function_privilege('authenticated','public.sync_strategy_subscribers_from_source()','EXECUTE'),'Trigger helper service-only');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
