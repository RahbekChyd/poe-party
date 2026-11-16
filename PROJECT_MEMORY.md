# Project Memory

Purpose: low-context handoff for the next Codex session. Keep this file short, current, and overwrite-oriented.

## Latest Conclusions

- The July 2026 technical/product remediation is implemented locally in the current worktree. No hosted Supabase, Vercel, Stripe, worker, OAuth, or production data was inspected or changed.
- Product direction is the connected **Plan -> Play -> Snapshot -> Learn -> Upgrade** loop. Authenticated navigation is Today, Runs, Builds, Party, and Discover; public Analysis and Strategies are the primary acquisition paths.
- The public root is now a real product home. Login keeps OAuth above the mobile fold, onboarding is inline/nonblocking, query failures have retry states, mobile has bottom navigation, and a missing deployment configuration renders a safe fallback instead of a blank app.
- Migrations `0082`–`0088` are the coordinated local release set: strategy metadata; invoker-security views and explicit RPC grants; atomic workspace creation/join/cancellation; tenant consistency; curated public build profiles; guest/billing reliability; optimizer attempt leases; additive OAuth token encryption; and atomic analysis queue/reuse/quota/retention. Migration `0088` intentionally uses one top-level `DO` statement so Supabase Branching can prepare it while function creation and privilege hardening remain atomic.
- Cookie authentication and POESESSID transport are fully retired. Active UI/client/store/Vite proxy paths are removed; old credential-bearing browser keys are scrubbed at app boot while selected stash-tab IDs migrate to a credential-free store. Hosted legacy endpoints remain deterministic, credential-blind `410` tombstones.
- Production and `https://preview-poe-party.xyz/auth/callback` are known OAuth origins. The Edge callback exchanges each code with the exact browser callback only after server-side allowlist validation. OAuth must start on the same custom origin because PKCE and Supabase sessions are tab/origin scoped; an arbitrary `*.vercel.app` URL cannot relay through the stable callback.
- PoE OAuth identity binds to the provider UUID subject, never the mutable account name. Browser and callback scopes share the same four-scope contract and exclude `account:item_filter`; callback return URLs require an exact allowlist match.
- OAuth access/refresh tokens use application-layer AES-256-GCM envelopes with per-token nonces, user/kind-bound AAD, a rotation-capable server key ring, refresh fingerprints, dual-read legacy migration, and optimistic rewrite guards. Follow `docs/poe-token-encryption-rollout.md`; do not place keys in SQL or `VITE_*` variables.
- The optimizer worker requires a unique `WORKER_AUTH_TOKEN` of at least 32 bytes. It has separate live/ready health, structured redacted logs, 500-row keyset stash reads with a 50,000-item default bound, graceful drain, a non-root/checksummed image, and service-only attempt ownership with bounded retry/backoff and transactional result persistence.
- Authenticated analysis creation is one database transaction covering reuse, Community quota, stale transitions, insertion, and three-run retention. Stripe Checkout uses per-user idempotent intents; webhooks use recoverable leases; guest usage claims and cleanup are bounded.
- Frontend routes are automatically split. Current enforced budgets are 400 kB initial JS gzip, 250 kB per async JS chunk, 60 kB CSS gzip, and 100 kB per logo. Current measurements are 219.4 kB initial/largest JS gzip, 47.1 kB CSS gzip, and 18.3/67.5 kB logos.
- CI uses SHA-pinned actions, Gitleaks, dependency audit, lint/type/unit/worker/build/bundle/browser/Docker checks, migration replay, pgTAP, exact Edge imports, Deno checks, and OAuth/crypto tests.
- Canonical local env split remains: root `.env.local` contains browser-safe `VITE_*` values only; Edge secrets live in `supabase/functions/.env`. Local database reset is migration-only and destructive to current local data, so ask before running it.
- PoE1-only features remain stash snapshots/history, atlas/scarab planning, and optimizer analysis. PoE2 supports character sync, market overview, and shared strategy planning without implying parity. The configurable PoE2 creation gate must be set consistently in DB and frontend environments.
- Public strategy content is sourced from `src/content/public-strategy-content.json`; `generate:seo` synchronizes routes and produces the ignored editorial SQL. Editorial SQL and all hosted operations require separately confirmed private operations.

## Next Steps

1. Follow `docs/manual-release-runbook.md`: freeze a reviewed commit SHA, require App Validate and Supabase Validate, then execute database -> coordinated Edge -> one-worker canary -> frontend in staging before production.
2. Point `preview-poe-party.xyz` at the reviewed PR branch/deployment, configure the exact callback in Vercel Preview, Edge `POE_ALLOWED_RETURN_URLS`, and hosted Supabase Auth, then run the authenticated staging matrix through that origin. Browser automation covers public routes plus OAuth-only login/storage cleanup, not a live GGG callback.
3. Reconcile legacy OAuth identities/sessions through private operations, backfill plaintext/old-key token rows in bounded batches, report counts/key IDs only, and defer the destructive token contract migration until every documented zero-row gate passes.
4. Monitor authorization denials, OAuth failures, queue age/retries/expired attempts, optimizer failures, guest `429`/`413`, webhook leases, duplicate Checkout attempts, raw-data exposure, and the privacy-safe activation funnel for at least 24 hours after canary.

## Active Blockers Or Assumptions

- Hosted schema parity, historical exposure, affected legacy identities, and current plaintext token counts are unknown because production access was intentionally not performed.
- Hosted preview-domain assignment, Vercel build-time values, Edge secrets, and Supabase Auth redirect settings were not inspected or changed. Preview code must use staging-only services/test data and be reviewed before signing in.
- Private inactive-token backfill and legacy OAuth identity/session reconciliation tooling is intentionally absent from this public repository.
- The detailed CSP remains report-only while the structural policy is enforced; no report collection endpoint is configured yet.
- A worker that loses ownership during a single already-running PoB subprocess cannot currently kill that subprocess immediately. Persistence remains guarded and the next phase aborts, but some compute may be wasted.
- Worker polling examines the oldest 50 queued rows per run kind; more than 50 simultaneous short-backoff rows can delay a newer ready row without creating a hot loop.
- HeroUI-generated CSS still emits known empty `:is()` minifier warnings, and Rollup reports a raw chunk above 500 kB. Enforced gzip budgets and browser checks pass.

## Latest Verification

- August 1, 2026 preview-auth/cookie-retirement follow-up: type-check, lint, 5 frontend unit tests, production build, bundle budgets, and 18 Playwright + axe desktop/mobile checks passed. Login verification confirms no POESESSID UI and scrubs legacy credential storage while retaining only stash-tab IDs. OAuth exact-URL tests cover the preview callback and hostile lookalikes; Deno was unavailable locally, so CI `Supabase Validate` remains required. No hosted service was accessed or changed.
- July 25, 2026 PR follow-up: `seroval` resolved to patched `1.5.6`; the production dependency audit, type-check, and production build passed. Migration `0088` applied as one top-level statement with `anon=false`, `authenticated=false`, and `service_role=true` execution privileges; rollback-only replay of `0081`–`0088` plus the atomic queue pgTAP suite passed 21/21 assertions. No local reset or hosted operation was performed.
- July 24, 2026 PR follow-up: official Gitleaks 8.24.3 reproduced the App Validate commit-range scan and reported no leaks after exact fingerprint ignores were added for two deterministic worker-auth test fixtures; lint and all 16 worker tests passed.
- July 24, 2026 pre-commit gate: type-check, lint, 5 frontend unit tests, 16 worker tests, production build, bundle budgets, staged secret-signature scan, and staged `git diff --check` passed.
- July 20, 2026 full local matrix: type-check, lint, 5 frontend unit tests, 16 worker tests, production build, bundle budgets, 18 Playwright + axe desktop/mobile tests, 34-route SEO prerender, production dependency audit, 26 worker syntax checks, and `git diff --check` passed.
- Rollback-only composite replay of migrations `0082`–`0088` passed all seven pgTAP suites: 113/113 assertions. No local reset or persisted database mutation was performed.
- Deno 2.5.6 checked all 13 security-critical Edge Functions. OAuth identity/return-URL/scope tests passed 3/3; AES-GCM/key rotation/dual-read/concurrency tests passed 5/5.
- Optimizer Docker build passed with the pinned Path of Building checksum and non-root image; prior runtime smoke verified live `200`, dependency-aware unready `503`, and graceful SIGTERM behavior.
- `pnpm audit --prod --audit-level high` reported no known vulnerabilities. Bundle measurements: 219.4 kB initial/largest JS gzip, 47.1 kB CSS gzip, logos 18.3/67.5 kB.
