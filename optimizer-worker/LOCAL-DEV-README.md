# Optimizer Worker Local Runbook

This file is for future agents working in this repo who need to rebuild, restart, or verify the local `optimizer-worker`.

## Current Local Shape

The worker is currently run locally with Docker, not with a separate Node build step.

- Image tag: `poe-optimizer-worker-local-image`
- Container name: `poe-optimizer-worker-local`
- Host port: `8788`
- Health endpoint: `http://127.0.0.1:8788/health`
- Local Supabase URL from inside Docker: `http://host.docker.internal:45121`

Important:

- There is no dedicated worker build script in `optimizer-worker/package.json`.
- "Rebuild the worker locally" means rebuilding the Docker image from `optimizer-worker/Dockerfile`.
- The container already carries the required worker env vars, including `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `WORKER_AUTH_TOKEN`, and `POB_RUNTIME_COMMAND`.

## Fast Restart Workflow

Run these commands from the repo root in PowerShell.

```powershell
$containerName = 'poe-optimizer-worker-local'
$imageName = 'poe-optimizer-worker-local-image'

$inspect = docker inspect $containerName | ConvertFrom-Json
if (-not $inspect -or -not $inspect[0]) {
  throw "Container $containerName not found"
}

$envMap = @{}
foreach ($entry in $inspect[0].Config.Env) {
  $parts = $entry -split '=', 2
  if ($parts.Length -eq 2) {
    $envMap[$parts[0]] = $parts[1]
  }
}

docker build -t $imageName .\optimizer-worker
docker rm -f $containerName | Out-Null

$runArgs = @(
  'run', '-d', '--name', $containerName,
  '-p', '8788:8788'
)

foreach ($name in @('SUPABASE_URL','SUPABASE_SECRET_KEY','WORKER_AUTH_TOKEN','POE_TRADE_USER_AGENT','WORKER_POLL_INTERVAL_MS','WORKER_MAX_CONCURRENT_RUNS','WORKER_HEARTBEAT_INTERVAL_MS','WORKER_STALE_RUNNING_AFTER_MS')) {
  if ($envMap.ContainsKey($name) -and $envMap[$name]) {
    $runArgs += @('-e', ("{0}={1}" -f $name, $envMap[$name]))
  }
}

$runArgs += $imageName
docker @runArgs
```

This rebuilds the image, removes the old container, and recreates it with the same local service credentials and worker tuning values.

It intentionally does not carry forward image-baked PoB path vars such as `POB_RUNTIME_COMMAND`, `POB_ROOT`, or `POB_REF`.
Those should usually come from the Docker image itself so stale host-specific values do not leak back into the Linux container.

If a stopped container starts but logs `JWT expired` from Supabase polling, recreate it with the current local admin secret from `pnpm exec supabase status -o json` / `SECRET_KEY` instead of reusing the old `SUPABASE_SECRET_KEY` from `docker inspect`.

## Verification

After restart:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8788/health | Select-Object -ExpandProperty Content
docker logs --tail 50 poe-optimizer-worker-local
docker ps --filter "name=poe-optimizer-worker-local"
```

Healthy output should include:

- `"ok":true`
- `"optimizer_engine":"pob"`
- `"pob_runtime_configured":true`
- `"poll_loop_active":true`

## If The Container Does Not Exist Yet

If you need to create the local worker from scratch instead of reusing an existing container:

1. Start local Supabase with `pnpm exec supabase start`.
2. Get the local secret key with `pnpm exec supabase status`.
3. Build and run:

```powershell
$env:SUPABASE_URL = 'http://host.docker.internal:45121'
$env:SUPABASE_SECRET_KEY = '<local-secret-from-supabase-status>'
$env:WORKER_AUTH_TOKEN = 'dev-worker-token'

docker build -t poe-optimizer-worker-local-image .\optimizer-worker
docker run -d --name poe-optimizer-worker-local -p 8788:8788 `
  -e SUPABASE_URL=$env:SUPABASE_URL `
  -e SUPABASE_SECRET_KEY=$env:SUPABASE_SECRET_KEY `
  -e WORKER_AUTH_TOKEN=$env:WORKER_AUTH_TOKEN `
  poe-optimizer-worker-local-image
```

## Notes

- The worker process inside the container starts with `npm run start`, which resolves to `node src/server.mjs`.
- The Docker image already bakes in the PoB runtime launcher and sets `POB_RUNTIME_COMMAND=/app/pob/run-pob-runtime.sh`.
- If the worker looks "up" but analyses fail later, check `docker logs poe-optimizer-worker-local` before changing env or code.
