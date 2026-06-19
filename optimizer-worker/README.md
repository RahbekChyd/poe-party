# Optimizer Worker

Containerized worker for queued gear-optimizer analysis jobs.

For the current local rebuild/restart workflow used in this repo, see [LOCAL-DEV-README.md](./LOCAL-DEV-README.md).

## Production Hosting

This service is meant to run as a separate long-lived container, not inside the frontend or a
short-lived edge/function runtime.

Recommended production shape:

- keep the frontend on Vercel
- keep database and Edge Functions on Supabase
- deploy `optimizer-worker` as its own container service

This package now includes `optimizer-worker/railway.json` with:

- Dockerfile builds enabled explicitly
- `GET /health` as the Railway health check
- restart-on-failure defaults suitable for the worker loop

If you deploy from this monorepo on Railway, point the service at the `optimizer-worker`
directory so Railway uses that package's `package.json`, Dockerfile, and config file.

## What The Worker Needs

Environment variables for the worker process:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` preferred, or `SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` as compatibility aliases
- `WORKER_AUTH_TOKEN` optional bearer token expected by `POST /jobs`
- `POE_TRADE_USER_AGENT` optional override for Path of Exile trade API requests
- `POB_RUNTIME_COMMAND` optional override for the exact PoB runtime command. On Railway or any Docker-based deploy, prefer leaving this unset so the bundled Linux launcher is used.
- `POB_REF` optional pinned PoB commit baked into the container image
- `POB_DISABLE_JIT` optional, defaults to `1` to avoid LuaJIT crashes in headless PoB runs
- `WORKER_POLL_INTERVAL_MS` optional, defaults to `5000`
- `WORKER_MAX_CONCURRENT_RUNS` optional, defaults to `1`
- `WORKER_HEARTBEAT_INTERVAL_MS` optional, defaults to `15000`
- `WORKER_STALE_RUNNING_AFTER_MS` optional, defaults to `180000`
- `PORT` optional, defaults to `8788`

Current behavior:

- accepts queued run notifications from the `queue-upgrade-analysis` edge function
- treats `/jobs` as a lightweight wake-up signal instead of a synchronous full analysis request
- processes up to `WORKER_MAX_CONCURRENT_RUNS` runs concurrently per replica
- polls for queued runs so processing still works if the edge-function notify call fails
- heartbeats active `running` rows and automatically reclaims stale non-waiting runs after worker crashes
- reads build targets, mapped stages, profile snapshots, and latest stash items from Supabase
- writes grouped recommendation plans and items back into Supabase
- runs exact PoB analysis and fails loudly when the PoB runtime is unavailable

Railway starting point:

- On 8 vCPU / 8 GB replicas, start with `WORKER_MAX_CONCURRENT_RUNS=2`
- If memory stays comfortable and PoB runs are stable, test `3`
- Horizontal replicas are usually safer than pushing too many PoB jobs into one container

Trade API note:

- the worker can enrich recommendations with Path of Exile trade links
- for production, set `POE_TRADE_USER_AGENT` to an identifiable value that follows GGG's documented format, for example `OAuth poeparty/1.0 (contact: support@poe-party.com) optimizer-worker`
- unique-item trade links no longer require a live trade-search POST and are generated as direct search URLs

The worker now builds a deterministic PoB runtime payload containing:

- raw imported PoB XML
- selected stage layouts and hard requirements
- current character snapshot, including equipped items serialized into best-effort PoB item text
- owned stash candidates with richer `mods`, `sockets`, and `raw_data`
- market unique candidates and payload diagnostics

The image now bakes in a pinned Path of Building Community source checkout and defaults `POB_RUNTIME_COMMAND` to `/app/pob/run-pob-runtime.sh`, which starts the headless LuaJIT harness in `optimizer-worker/pob/run-analysis.lua`.

If a Linux worker receives a stale Windows-only `POB_RUNTIME_COMMAND` override, it now ignores that override and falls back to `/app/pob/run-pob-runtime.sh`. The deploy should still remove that stale override so diagnostics stay clean.

The launcher also ignores a stale Windows-style `POB_ROOT` on Linux and falls back to `/opt/pob`, but that override should still be removed from the container config.

The launcher disables LuaJIT's JIT compiler by default because some real PoB payloads segfaulted during headless startup on Linux with JIT enabled. You can opt back in with `POB_DISABLE_JIT=0` if you want to experiment.

The worker contract is job-based and keyed by the persisted `upgrade_analysis_runs.input_hash`, so reruns can reuse cached results without duplicating records.

## Supabase Admin Key

The worker needs a Supabase admin key used by trusted server-side code.

It is required here because the worker reads and writes optimizer tables directly through the REST API with service-level permissions. Do not put this key in frontend `VITE_` env vars.

Use `SUPABASE_SECRET_KEY` as the Railway variable name for the worker. The code also accepts `SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, but those are aliases for compatibility.

For local development, get it from:

- `pnpm exec supabase status`

Look for the admin `Secret` value in the `Authentication Keys` section. Put that value into the worker's `SUPABASE_SECRET_KEY` variable.

## Edge Function Secrets

The `queue-upgrade-analysis` Edge Function also needs secrets.

It uses:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` preferred, or `SUPABASE_SERVICE_ROLE_KEY`
- `UPGRADE_ANALYZER_WORKER_URL`
- `UPGRADE_ANALYZER_WORKER_TOKEN` optional, but recommended

Notes:

- In this repo, both the shared admin client and the worker accept `SUPABASE_SECRET_KEY`, `SECRET_KEY`, or `SUPABASE_SERVICE_ROLE_KEY`.

## Local Development Setup

1. Start local Supabase.

- `pnpm exec supabase start`

2. Copy the local API URL and secret key from:

- `pnpm exec supabase status`

3. Start the worker with those values.

PowerShell example:

```powershell
$env:SUPABASE_URL="http://127.0.0.1:45121"
$env:SUPABASE_SECRET_KEY="<local-secret-from-supabase-status>"
$env:WORKER_AUTH_TOKEN="dev-worker-token"
docker build -t poe-optimizer-worker .\optimizer-worker
docker run --rm -p 8788:8788 `
  -e SUPABASE_URL=$env:SUPABASE_URL `
  -e SUPABASE_SECRET_KEY=$env:SUPABASE_SECRET_KEY `
  -e WORKER_AUTH_TOKEN=$env:WORKER_AUTH_TOKEN `
  poe-optimizer-worker
```

To inspect the exact-engine payload without a real PoB runtime yet, you can use the included mock adapter:

```powershell
$env:POB_RUNTIME_COMMAND="node /app/pob/mock-runtime.mjs"
```

That path returns `partial` runs with payload diagnostics only. It is useful for contract testing, not for real recommendations.

To run the real baseline PoB runtime, you can now simply use the default image command:

```powershell
docker build -t poe-optimizer-worker .\optimizer-worker
docker run --rm -p 8788:8788 `
  -e SUPABASE_URL=http://host.docker.internal:45121 `
  -e SUPABASE_SECRET_KEY="<local-secret-from-supabase-status>" `
  -e WORKER_AUTH_TOKEN="dev-worker-token" `
  poe-optimizer-worker
```

In the current state, the worker gives you:

- exact PoB baseline metrics for the selected stage plus current-character gear overlay
- exact stored plans when the PoB runtime surfaces actionable candidates
- summary metadata such as `pob_ref`, resolved set IDs, and `exact_baseline_metrics`

If the worker runs inside Docker and Supabase runs on the host, use `http://host.docker.internal:45121` for `SUPABASE_URL` instead of `http://127.0.0.1:45121`.

4. Provide Edge Function secrets locally.

Add the Edge Function callback values to `supabase/functions/.env`:

```dotenv
SUPABASE_URL=http://127.0.0.1:45121
SUPABASE_SECRET_KEY=<local-secret-from-supabase-status>
UPGRADE_ANALYZER_WORKER_URL=http://127.0.0.1:8788
UPGRADE_ANALYZER_WORKER_TOKEN=dev-worker-token
```

Then serve functions with:

- `pnpm exec supabase functions serve --env-file supabase/functions/.env`

5. If you deploy the function remotely, set the same function secrets in Supabase:

- `pnpm exec supabase secrets set --env-file <remote-edge-function-env-file>`

For remote deploys, set the same variable names with remote values. Do not upload the local
`supabase/functions/.env` unchanged.

## Env Split

There are two separate trusted runtimes here:

- Worker container:
  - `SUPABASE_URL`
  - `SUPABASE_SECRET_KEY` preferred, or `SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `WORKER_AUTH_TOKEN`
- `POE_TRADE_USER_AGENT`
- `POB_RUNTIME_COMMAND`
- `WORKER_POLL_INTERVAL_MS`
- `WORKER_MAX_CONCURRENT_RUNS`
- `WORKER_HEARTBEAT_INTERVAL_MS`
- `WORKER_STALE_RUNNING_AFTER_MS`

- Supabase Edge Function:
  - `SUPABASE_URL`
  - `SUPABASE_SECRET_KEY` preferred, or `SUPABASE_SERVICE_ROLE_KEY`
  - `UPGRADE_ANALYZER_WORKER_URL`
  - `UPGRADE_ANALYZER_WORKER_TOKEN`

If `UPGRADE_ANALYZER_WORKER_URL` is missing, runs can still be inserted into `upgrade_analysis_runs`, but the worker will not be notified automatically.
