// Credential-free two-connection regression. Run only against a disposable local database with migrations applied.
import { spawn, execFileSync } from 'node:child_process'
const container = process.argv[2]
if (!container)
  throw Error(
    'Usage: node scripts/test-snapshot-finalization-concurrency.mjs <disposable-local-db-container> [socket-directory]',
  )
const socketDirectory = process.argv[3] ?? '/var/run/postgresql'
const args = [
  'exec',
  '-i',
  container,
  'psql',
  '-h',
  socketDirectory,
  '-U',
  'postgres',
  '-d',
  'postgres',
  '-v',
  'ON_ERROR_STOP=1',
  '-At',
]
const sql = (s) => execFileSync('docker', args, { input: s, encoding: 'utf8' })
const uid = (n) => `1d000000-0000-0000-0000-00000000000${n}`,
  sid = (n) => `4d000000-0000-0000-0000-00000000000${n}`,
  tid = (n) => `5d000000-0000-0000-0000-00000000000${n}`,
  iid = (n) => `6d000000-0000-0000-0000-00000000000${n}`,
  gid = '2d000000-0000-0000-0000-000000000001'
let setup = `INSERT INTO auth.users(id,email) VALUES('${uid(1)}','concurrent-a@example.invalid'),('${uid(2)}','concurrent-b@example.invalid'); INSERT INTO public.users(id,poe_account_name) VALUES('${uid(1)}','ConcurrentA#0001'),('${uid(2)}','ConcurrentB#0002'); INSERT INTO public.groups(id,name,invite_code,created_by,game,league) VALUES('${gid}','Concurrent','conc001','${uid(1)}','poe1','Covens');`
for (const n of [1, 2])
  setup += `INSERT INTO public.group_members(group_id,user_id,role) VALUES('${gid}','${uid(n)}','admin'); INSERT INTO public.stash_snapshots(id,user_id,group_id,status) VALUES('${sid(n)}','${uid(n)}','${gid}','in_progress'); INSERT INTO public.stash_tabs(id,snapshot_id,user_id,group_id,poe_tab_id,name,tab_type,tab_index) VALUES('${tid(n)}','${sid(n)}','${uid(n)}','${gid}','tab${n}','Tab','NormalStash',0); INSERT INTO public.stash_items(id,tab_id,user_id,group_id,poe_item_id,name,type_line,raw_data) VALUES('${iid(n)}','${tid(n)}','${uid(n)}','${gid}','item${n}','Chaos Orb','Chaos Orb','{}');`
sql(setup)
function query(n) {
  return `SET LOCAL ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',true); SELECT public.finalize_priced_snapshot('${sid(n)}','[{"id":"${iid(n)}","price_chaos":${n * 10},"price_divine":null}]','{"status":"complete","version":1,"source":"poe.ninja"}');`
}
let ready
const marked = new Promise((r) => (ready = r))
function run(input, mark = false) {
  return new Promise((resolve, reject) => {
    const p = spawn('docker', args)
    const timer = setTimeout(() => p.kill(), 30_000)
    let out = '',
      err = ''
    p.stdout.on('data', (b) => {
      out += b
      if (mark && out.includes('FIRST_FINALIZED')) ready()
    })
    p.stderr.on('data', (b) => (err += b))
    p.on('close', (code) => {
      clearTimeout(timer)
      code ? reject(Error(err)) : resolve(out)
    })
    p.stdin.end(input)
  })
}
try {
  const first = run(
    `BEGIN;${query(1)} SELECT 'FIRST_FINALIZED'; SELECT pg_sleep(0.6); COMMIT;`,
    true,
  )
  await Promise.race([
    marked,
    first.then(() => {
      throw Error('First finalization did not reach marker')
    }),
  ])
  const started = Date.now()
  await run(`BEGIN;${query(2)} COMMIT;`)
  await first
  const last = sql(
    `SELECT total_wealth_chaos FROM public.group_wealth_history WHERE group_id='${gid}' ORDER BY created_at DESC LIMIT 1;`,
  ).trim()
  if (Number(last) !== 30) throw Error('Expected combined30,got' + last)
  console.log(
    'Two-connection finalization PASS; finalwealth30; secondwaited',
    Date.now() - started,
    'ms',
  )
} finally {
  sql(
    `DELETE FROM public.groups WHERE id='${gid}';DELETE FROM public.users WHERE id IN('${uid(1)}','${uid(2)}');DELETE FROM auth.users WHERE id IN('${uid(1)}','${uid(2)}');`,
  )
}
