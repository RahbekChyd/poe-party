# Manual Release Runbook

This runbook turns the July 2026 remediation into a controlled staging-to-production release.
It contains no hosted project references, credentials, or private operator tooling. Replace every
placeholder only after confirming the target in the same session.

Do not skip staging, deploy from an uncommitted worktree, or reuse credentials between environments.
Database security revocations are forward-only: recover with a compatible forward fix or disable
the affected flow, never by restoring an unsafe grant or policy.

## 1. Record the release and targets

Create a private worksheet containing:

- release branch and commit SHA;
- staging/production Supabase project references;
- staging/production Vercel projects and domains;
- staging/production worker services and image tags;
- Stripe mode (`test` in staging, `live` in production);
- PoE OAuth clients and exact callback URLs;
- Supabase Auth signing-key mode (do not combine this release with signing-key rotation);
- backup/PITR status and restoration owner;
- current migration, Edge Function, frontend, and worker versions;
- release operator, window, stop criteria, and flow-disable owners.

Stop if any target is ambiguous, staging shares production credentials, or production recovery
status cannot be verified.

## 2. Freeze and validate the artifact

Review the worktree without resetting or discarding unrelated work:

```powershell
git status --short
git diff --stat
git diff --check
git diff
```

Run the full gate from the repository root:

```powershell
npm exec --yes pnpm@10.33.2 -- install --frozen-lockfile
npm exec --yes pnpm@10.33.2 -- type-check
npm exec --yes pnpm@10.33.2 -- lint
npm exec --yes pnpm@10.33.2 -- test
npm exec --yes pnpm@10.33.2 -- test:worker
npm exec --yes pnpm@10.33.2 -- build
npm exec --yes pnpm@10.33.2 -- check:bundle
npm exec --yes pnpm@10.33.2 -- build:prerender
npm exec --yes pnpm@10.33.2 -- exec playwright install chromium
npm exec --yes pnpm@10.33.2 -- test:e2e
docker build -t poe-optimizer-worker:<release-sha> .\optimizer-worker
```

After reviewing the staged diff, create a Conventional Commit, push it, and open a pull request.
Require **App Validate** and **Supabase Validate** to pass. Record the reviewed commit SHA after
merge and use that exact SHA for every release unit.

Keep the repository-pinned Supabase CLI `2.76.11` for this release. Do not combine the application
rollout with a CLI/toolchain upgrade.

## 3. Prepare staging

In the hosted dashboards, verify:

1. Supabase has an acceptable staging restore point.
2. Stripe uses test keys, price, webhook endpoint, and signing secret.
3. The PoE OAuth client has the exact staging callback URL.
4. Supabase Auth Site URL and redirect allowlist contain the intended staging origins/callback.
5. Vercel and the worker both point to staging Supabase, never production.

Link and verify the project before every database action:

```powershell
npm exec --yes pnpm@10.33.2 -- supabase link --project-ref <STAGING_PROJECT_REF>
Get-Content -LiteralPath supabase\.temp\project-ref
npm exec --yes pnpm@10.33.2 -- supabase migration list --linked
npm exec --yes pnpm@10.33.2 -- supabase db push --linked --dry-run
```

The dry run must show only the expected unapplied migrations: `0082` through `0088`, in order.
Stop on unexplained migration-history divergence or any additional change.

## 4. Apply the staging database release

Let the CLI prompt for sensitive credentials rather than placing them on the command line:

```powershell
Get-Content -LiteralPath supabase\.temp\project-ref
npm exec --yes pnpm@10.33.2 -- supabase db push --linked
npm exec --yes pnpm@10.33.2 -- supabase migration list --linked
```

Confirm `0082` through `0088` are present exactly once. In the staging SQL editor, run the count-only
report from `docs/poe-token-encryption-rollout.md` and privately record plaintext rows, incomplete
ciphertext rows, and counts by key ID/version. Never query, export, screenshot, or log token or
ciphertext values.

## 5. Configure staging Edge secrets

Generate a new staging-only 32-byte AES key. Its unpadded base64url representation must be exactly
43 characters. Use a staging-only ID such as `staging-2026-07`; do not reuse the production key.

Set secrets through the Supabase dashboard or an approved private file outside the repository. Do
not pass them inline where shell history or CI logs can retain them. Confirm at least:

- `POE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID` and `POE_TOKEN_ENCRYPTION_KEYS`;
- `POE_CLIENT_ID`, `POE_CLIENT_SECRET`, `POE_REDIRECT_URI`, and `POE_CONTACT`;
- `POE_ALLOWED_RETURN_URLS` as comma-separated exact frontend return URLs;
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SECRET_KEY`;
- Stripe test secrets, `BILLING_ALLOWED_RETURN_ORIGINS`, and `BILLING_RETURN_ORIGIN`;
- `UPGRADE_ANALYZER_WORKER_URL` and a strong `UPGRADE_ANALYZER_WORKER_TOKEN` that exactly matches
  the worker's `WORKER_AUTH_TOKEN`.

Never put server secrets in Vercel `VITE_*` variables.

## 6. Deploy the coordinated staging Edge release

Deploy every function from the same SHA so all token consumers and the queue/billing changes move
together:

```powershell
npm exec --yes pnpm@10.33.2 -- supabase functions deploy --project-ref <STAGING_PROJECT_REF> --use-api
```

Do not use `--prune` or override per-function JWT settings during the release; use the reviewed
`supabase/config.toml` contract. A multi-function deploy is not transactional, so the partial-deploy
stop gate below is mandatory.

The seven token consumers are `poe-oauth-callback`, `poe-refresh-token`, `poe-account-leagues`,
`poe-list-stash-tabs`, `poe-snapshot`, `poe-sync-character-profile`, and `poe-sync-characters`.
Also confirm the deployed set includes the changed queue, guest, billing, webhook, and retired
cookie-auth functions.

Inspect function logs for configuration failures without printing headers, tokens, cookies, or raw
stash payloads. Stop if a token consumer reports a missing/invalid key or if only part of the set
deployed. Correct configuration and redeploy the same SHA before allowing OAuth traffic.

## 7. Deploy one staging worker canary

Publish the worker image from the recorded SHA and configure one replica with:

- staging `SUPABASE_URL` and `SUPABASE_SECRET_KEY`;
- a unique `WORKER_AUTH_TOKEN` of at least 32 bytes;
- an identifiable `POE_TRADE_USER_AGENT`;
- `WORKER_MAX_CONCURRENT_RUNS=1` initially;
- documented defaults for heartbeat, stale attempts, stash bound, and shutdown;
- no Windows-only `POB_RUNTIME_COMMAND` or `POB_ROOT` override.

Migration `0086` must already exist. Verify:

```powershell
Invoke-RestMethod -Method Get -Uri 'https://<STAGING_WORKER_HOST>/health/live'
Invoke-RestMethod -Method Get -Uri 'https://<STAGING_WORKER_HOST>/health/ready'
```

Both must return HTTP 200. Readiness must show the poll loop active, task acceptance enabled, PoB
configured, and no unexplained recent poll failure.

## 8. Deploy the staging frontend

Configure Vercel with browser-safe values only:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_FUNCTIONS_KEY`;
- `VITE_POE_CLIENT_ID` and exact `VITE_POE_REDIRECT_URI`;
- `VITE_ENABLE_COOKIE_AUTH=false`;
- the reviewed `VITE_POE2_ALLOWED_ACCOUNT_NAMES`, consistent with the database/product gate;
- `VITE_BILLING_ALLOWED_POE_ACCOUNTS` only for an intentional billing canary.

Deploy the recorded SHA to Preview/staging and recheck project/domain before testing.

Privately verify the database setting `app.allowed_poe2_accounts` matches the intended normalized
account list (or `*`) before accepting PoE2 workspace creation. The public repo does not currently
provide a hosted-setting operator; treat any frontend/database mismatch as a release blocker.

## 9. Run staging acceptance

Use anonymous browsing plus at least two accounts in different workspaces. Test desktop, 768 px,
and 390 x 844 px widths.

1. Public home, Analysis, Strategies/detail, Discover, legal pages, metadata, sitemap, and crawler
   output load without authentication or raw-data exposure.
2. OAuth requests only the shared four-scope contract, returns only to an exact allowed URL, binds
   the immutable provider subject, refreshes, and logs out cleanly.
3. Hosted cookie auth and POESESSID proxy calls return deterministic `410`; no cookie is stored/logged.
4. Create/join/switch workspaces and test admin/editor/viewer rights. Cross-workspace reads/writes
   from the unrelated account must fail.
5. Sync characters/profile, list leagues/tabs, create a snapshot larger than one PostgREST page,
   and verify exclusions, totals, history, and retention.
6. Opt a build profile into discovery. Only curated fields may be public—never inventory, atlas,
   raw provider data, internal IDs, or private workspace data.
7. Queue, reuse, quota-limit, cancel, retry, and retain authenticated analyses. Exercise two attempt
   owners, expired leases, backoff, and a stale owner; stale attempts must not persist results.
8. Test guest success, expiry/cleanup, oversized input (`413`), quota (`429`), upstream timeout, and
   sanitized status/errors.
9. In Stripe test mode, exercise concurrent/retried Checkout, Supporter activation, the portal, and
   duplicate/out-of-order webhooks. There must be no duplicate charge or stuck lease.
10. Verify query retry states, mobile navigation, OAuth above the mobile fold, keyboard focus, and
    critical-page accessibility.

Stop promotion on unexplained tenant denial, identity collision, decrypt/config failure, duplicate
charge, partial optimizer result, raw-data disclosure, unexpected OAuth scope, or secret leakage.

## 10. Production preflight and rollout

Require staging sign-off against the recorded SHA. Reconfirm production targets, backup/PITR,
Stripe live mode, callback URL, migration parity, a separately generated production key ring,
previous deployment identifiers, disable paths, and a low-traffic release window.

Do not reuse the staging link by assumption:

```powershell
npm exec --yes pnpm@10.33.2 -- supabase link --project-ref <PRODUCTION_PROJECT_REF>
Get-Content -LiteralPath supabase\.temp\project-ref
npm exec --yes pnpm@10.33.2 -- supabase migration list --linked
npm exec --yes pnpm@10.33.2 -- supabase db push --linked --dry-run
```

Have a second person or independent check verify the project reference, release SHA, Stripe mode,
callback URL, worker service, and backup before mutation. Then keep this order compact:

1. Apply `0082` through `0088`; verify migration history.
2. Configure the complete production key ring and other Edge secrets.
3. Deploy all Edge Functions from the recorded SHA; canary OAuth callback/refresh, leagues,
   character, stash, queue, guest, and webhook flows.
4. Deploy exactly one worker canary; require live/ready 200 and one successful authenticated run.
5. Deploy the same SHA to production Vercel; smoke public, OAuth, workspace, snapshot, public profile,
   analysis, and billing entry points.
6. Promote worker replicas/concurrency gradually while watching queue age, leases, memory, and PoB.

Do not restore revoked grants. A pre-encryption Edge build is unsafe after encrypted rows exist.
Disable the affected flow and deploy a forward-compatible fix. Roll back the frontend only to a
version compatible with the new RPC/database contracts.

## 11. Observe for at least 24 hours

Monitor authorization denials, OAuth/identity/redirect failures, token storage counts and decrypt
errors, oldest queue age, retries/backoff/expired leases, worker health/memory/PoB failures, guest
`429`/`413`/timeouts, webhook leases, duplicate Checkouts, activation, sanitized errors, CSP reports,
raw-data reports, and the privacy-safe activation funnel. Stop/disable the affected flow on any
unexplained security or billing anomaly. Never copy tokens, cookies, full headers, or raw stash data
into incident tickets.

## 12. Backfill and later contract work

Normal reads opportunistically rewrite plaintext or old-key tokens. Inactive accounts need a
reviewed private batch that selects only user IDs and invokes the shared Edge read/rewrite path in
bounded batches. This public repository intentionally has no token-backfill or legacy OAuth
identity/session reconciliation operator.

The private process must report counts/key IDs only, stop on decrypt/concurrency errors, never put
keys in SQL, retain old keys until their count is zero, and reconcile legacy identities through
separately reviewed operations. Do not create/apply the destructive token contract migration until
every gate in `docs/poe-token-encryption-rollout.md` is green and no old Edge build can write
plaintext. Make that a separate reviewed release after the observation window.

Before production, also resolve or explicitly accept these operational gaps: no automated
authenticated staging browser suite, no CSP report collector, no documented hosted PoE2-setting
operator, no provider-specific worker image promote command, and no one-command OAuth/optimizer
kill switch. Rehearse the maintenance/flow-disable release used if a canary must stop.

## Completion record

Record deployed database/Edge/worker/frontend versions, staging and production sign-off, the 24-hour
monitoring result, token counts by state/key ID (never values), unresolved issues/owners, and
confirmation that no destructive contract migration was bundled into this release.
