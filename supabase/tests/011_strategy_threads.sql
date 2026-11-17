BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(18);
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
SELECT is((SELECT threads FROM strategies WHERE id='33000000-0000-0000-0000-000000000001'),'[]'::jsonb,'Existing-style setup starts with empty Threads');
SELECT is((SELECT scarabs->0->>'name' FROM strategies WHERE id='33000000-0000-0000-0000-000000000001'),'Ambush Scarab','Legacy Scarab remains intact');
SELECT ok(valid_strategy_threads('[{"name":"Breach Thread","quantity":8,"required":true,"alternatives":[]}]'),'Eight spent Threads valid');
SELECT ok(NOT valid_strategy_threads('[{"name":"Frayed Thread","quantity":1,"required":true,"alternatives":[]}]'),'Frayed Thread not usable in planner');
SELECT ok(NOT valid_strategy_threads('[{"name":"Breach Thread","quantity":8,"required":true,"alternatives":[]},{"name":"Legion Thread","quantity":1,"required":false,"alternatives":[]}]'),'Optional inputs still count toward spent maximum');
SELECT ok(NOT valid_strategy_threads('[{"name":"Breach Thread","quantity":1.5,"required":true,"alternatives":[]}]'),'Fractional quantity rejected');
SELECT ok(NOT valid_strategy_threads('[{"name":"Breach Thread","quantity":1,"required":true,"alternatives":[{"name":"Frayed Thread"}]}]'),'Invalid alternatives rejected');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000002',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT lives_ok($$SELECT subscribe_to_public_strategy('22000000-0000-0000-0000-000000000002','33000000-0000-0000-0000-000000000001')$$,'Editor can subscribe');
SELECT is((SELECT threads FROM strategies WHERE source_strategy_id='33000000-0000-0000-0000-000000000001'),'[]'::jsonb,'Subscription starts empty too');
UPDATE strategies SET threads='[{"name":"Ritual Thread","quantity":1,"required":true,"alternatives":[]}]' WHERE source_strategy_id='33000000-0000-0000-0000-000000000001';
SELECT is((SELECT threads FROM strategies WHERE source_strategy_id='33000000-0000-0000-0000-000000000001'),'[]'::jsonb,'RLS silently denies direct writes to subscribed setup');
RESET ROLE;
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
