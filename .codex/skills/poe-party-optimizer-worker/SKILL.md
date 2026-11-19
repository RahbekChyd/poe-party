---
name: poe-party-optimizer-worker
description: Optimizer worker guidance for PoE Party. Use when debugging, running, deploying, or changing optimizer-worker, Path of Building runtime integration, queued upgrade analysis jobs, trade stats/search behavior, recommendation generation, worker env vars, Docker/Railway setup, or optimizer verification in the poe-group-tool repo.
---

# PoE Party Optimizer Worker

Use this skill for the separate containerized worker under `optimizer-worker/`. Treat the worker as trusted server-side code: it can use admin credentials and must not leak secrets or raw sensitive payloads.

## Working Rules

- Read `optimizer-worker/README.md` before changing production hosting, env vars, or function/worker contracts.
- Read `optimizer-worker/LOCAL-DEV-README.md` before rebuilding or restarting the local Docker worker.
- Keep frontend, Supabase Edge Function, and worker env responsibilities separate.
- Preserve the PoE1-only optimizer boundary unless fresh upstream validation proves PoE2 support.
- Verify current GGG/trade/PoB behavior from primary sources when changing search assumptions, request formats, rate behavior, or runtime integration.

## Implementation Notes

- Worker source lives under `optimizer-worker/src/`.
- PoB runtime harness lives under `optimizer-worker/pob/`.
- `optimizer-worker/pob/run-analysis.lua` is near LuaJIT's top-level local-variable limit. When adding larger helper groups, attach functions to a table or define non-local helper functions instead of adding many new `local function` declarations at chunk scope; verify with `luajit -b` in the worker image.
- Character snapshot `raw_character` can be OAuth-shaped or legacy `items`/`passive_tree`. Use the canonical worker adapter to construct the flat decoded character expected by current PoB importers; preserve Wickerman/guardian/raw modifier objects and record source completeness. Do not pass legacy JSON strings or retain target Wickerman parts in empty current slots.
- Verify runtime compatibility with the real container fixture command in `optimizer-worker/README.md`, not only Node tests or Lua syntax compilation. Current PoB requires modern LuaJIT syntax and explicit `new("Class"):Class(...)` constructors; ordinary Debian LuaJIT packages may lag.
- PoB runtime output can include supplemental `summary.compare_power_report` rows; keep this additive to the existing recommendation plan contract unless intentionally changing the UI/API surface.
- In `summary.compare_power_report`, the worker's `totalDps` primary metric maps to PoB `TotalDPS`/Hit DPS. Do not map it to `FullDPS` unless the selected build actually populates PoB's Full DPS rollup.
- When adopting upstream PoB features, verify the Dockerfile `POB_REF` against the upstream commit/release that introduced the feature before assuming the bundled runtime has it.
- Queue entrypoints and promotion functions live under `supabase/functions/`.
- Startup requires a unique `WORKER_AUTH_TOKEN` of at least 32 bytes. `/health/live` is process liveness; `/health` and `/health/ready` are dependency-aware readiness and must become unready before graceful drain.
- Authenticated and guest analysis runs share the service-role-only attempt RPC lifecycle. Preserve lease ownership on heartbeat/complete/fail, bounded retries with `retry_not_before`, same-attempt trade cooldowns, and transactional plan/item replacement.
- Read stash inputs in deterministic 500-row keyset pages and fail explicitly above `WORKER_MAX_STASH_ITEMS`; never accept PostgREST's default page as a complete stash.
- Shared recommendation shape helpers appear in both frontend and worker libs; avoid drifting output contracts.
- Live market rare candidates may come from relaxed search attempts; preserve the original trade query/link that produced the priced candidate instead of rebuilding a stricter exact link downstream.
- Preserve market price context in recommendation payloads: live trade listings should carry original amount/currency, and poe.ninja unique prices should carry link count/variant details into trade-link generation.
- Prefer focused tests or local job verification before broad refactors.

## Local Verification

Use `references/worker-runbook.md` for the current Docker names, ports, and verification hints. Check worker logs before changing code when a local run fails.

## Safety

- Do not put `SUPABASE_SERVICE_ROLE_KEY`, worker auth tokens, or PoE secrets in frontend env vars.
- Sanitize errors that cross from worker/function boundaries back to the client.
- Keep logs useful for job diagnosis without dumping tokens, cookies, full account payloads, or private stash details.
