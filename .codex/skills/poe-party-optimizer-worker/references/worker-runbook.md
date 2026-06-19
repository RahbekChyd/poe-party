# Optimizer Worker Runbook

Source of truth: repo `optimizer-worker/README.md` and `optimizer-worker/LOCAL-DEV-README.md`.

Local shape currently documented:

- Image tag: `poe-optimizer-worker-local-image`.
- Container name: `poe-optimizer-worker-local`.
- Worker port: `8788`.
- Local Supabase URL from inside Docker: `http://host.docker.internal:45121`.

Fast local diagnosis:

```powershell
docker logs --tail 50 poe-optimizer-worker-local
docker ps --filter "name=poe-optimizer-worker-local"
```

If the container does not exist yet, follow `optimizer-worker/LOCAL-DEV-README.md` rather than reconstructing the command from memory.

If `docker start poe-optimizer-worker-local` succeeds but the logs show Supabase `JWT expired`, the stopped container is carrying a stale local admin credential. Recreate the container with the current `SECRET_KEY` from `pnpm exec supabase status -o json`, and keep `SUPABASE_URL=http://host.docker.internal:45121` inside Docker.

Production reminders:

- Frontend stays on Vercel.
- Database and Edge Functions stay on Supabase.
- Optimizer worker deploys as its own container service.
- The worker needs a Supabase admin key because it performs trusted server-side reads and writes.
- Use an identifiable `POE_TRADE_USER_AGENT` in production that follows GGG expectations.
