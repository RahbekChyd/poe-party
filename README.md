# PoE Party

PoE Party is an independent open-source Path of Exile web app for group economy tracking, stash snapshots, public strategy and service listings, gear planning, and upgrade analysis for PoE 1 and Path of Exile 2.

The source is licensed under Apache-2.0. The public repo includes the app, Supabase schema/functions, optimizer worker, analyser logic, and local development tooling. Hosted production secrets, comp grants, live deploy automation, incident response, and abuse-sensitive runbooks are private operations material.

PoE Party is not affiliated with or endorsed by Grinding Gear Games.

## Architecture

- Frontend: Vite, React, TypeScript, TanStack Router, TanStack Query, HeroUI, Tailwind CSS.
- Backend/data: Supabase Auth, PostgreSQL migrations, RLS policies, RPCs, and Edge Functions.
- Optimizer: `optimizer-worker/`, a separate long-lived container that runs queued upgrade analysis with Path of Building.
- Billing: optional Stripe Checkout and webhooks for hosted Supporter access.

## Local Setup

Install dependencies:

```powershell
npm exec --yes pnpm@10.33.2 -- install
```

Copy the example env files:

```powershell
Copy-Item .env.example .env.local
Copy-Item supabase/functions/.env.example supabase/functions/.env
```

Fill the copied files with your own local Supabase keys, PoE OAuth credentials, Stripe sandbox keys if testing billing, and worker token values. Do not put server secrets in root `.env.local`; Vite exposes `VITE_*` values to the browser.

Start local Supabase and the frontend:

```powershell
npm exec --yes pnpm@10.33.2 -- supabase start
npm exec --yes pnpm@10.33.2 -- dev
```

The local Supabase config uses `4512x` ports because some Windows setups reserve the default `5432x` range.

## Environment Files

- `.env.local`: browser-readable local Vite values only.
- `supabase/functions/.env`: local Supabase Edge Function secrets.
- `.env.example`: frontend template for local and self-hosted setup.
- `supabase/functions/.env.example`: Edge Function template for local and self-hosted setup.

Important frontend variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_FUNCTIONS_KEY`
- `VITE_POE_CLIENT_ID`
- `VITE_POE_REDIRECT_URI`
- `VITE_ENABLE_COOKIE_AUTH`
- `VITE_POE2_ALLOWED_ACCOUNT_NAMES`: optional comma-separated PoE2 early-access account gate, or `*`.
- `VITE_BILLING_ALLOWED_POE_ACCOUNTS`: optional temporary billing rollout gate.

Important Edge Function secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY`
- `POE_CLIENT_ID`
- `POE_CLIENT_SECRET`
- `POE_REDIRECT_URI`
- `POE_ALLOWED_RETURN_URLS`: comma-separated exact frontend URLs accepted after OAuth callback.
- `POE_CONTACT`
- `POE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID`
- `POE_TOKEN_ENCRYPTION_KEYS`: JSON key ring of unpadded base64url AES-256 keys.
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_ID`
- `BILLING_ALLOWED_RETURN_ORIGINS`
- `BILLING_RETURN_ORIGIN`
- `UPGRADE_ANALYZER_WORKER_URL`
- `UPGRADE_ANALYZER_WORKER_TOKEN`

Hosted projects must use their own Supabase, Vercel, Stripe, PoE OAuth, and worker credentials. Never reuse local secrets or PoE Party production values.

The additive database rollout, exact token-encryption key-ring format, rotation process, and
plaintext backfill/contract gates are documented in
[`docs/poe-token-encryption-rollout.md`](docs/poe-token-encryption-rollout.md).

## Validation

Use the pinned pnpm version through npm exec when needed:

```powershell
npm exec --yes pnpm@10.33.2 -- type-check
npm exec --yes pnpm@10.33.2 -- lint
npm exec --yes pnpm@10.33.2 -- test
npm exec --yes pnpm@10.33.2 -- test:worker
npm exec --yes pnpm@10.33.2 -- build
npm exec --yes pnpm@10.33.2 -- check:bundle
```

Public browser smoke and accessibility checks run with:

```powershell
npm exec --yes pnpm@10.33.2 -- exec playwright install chromium
npm exec --yes pnpm@10.33.2 -- test:e2e
```

After changing routes, run:

```powershell
npm exec --yes pnpm@10.33.2 -- generate
```

After changing public SEO metadata, run:

```powershell
npm exec --yes pnpm@10.33.2 -- generate:seo
```

## Optimizer Worker

The optimizer worker is a separate container service. See `optimizer-worker/README.md` for Docker, worker environment variables, and health-check guidance.

The worker needs a Supabase service-role key because it reads and writes queued optimizer tables directly. Never expose that key through `VITE_*` variables.

## Billing Model

The app supports optional hosted Supporter billing through Stripe:

- Community: free, useful core workspace/public features, manual snapshots, limited raw snapshot retention, and a daily authenticated upgrade-analysis queue limit.
- Supporter: hosted support funding with higher retention, interval or Mix snapshot scheduling, and no app-enforced daily authenticated queue cap.

Internal billing identifiers still use `pro` naming for database and Stripe continuity. Customer-facing copy should say Community and Supporter.

Private comp-grant and billing-repair tooling is intentionally not part of this public repo.

## GitHub Actions

The public repo keeps validation workflows:

- `App Validate`: lints, type-checks, builds the app, and builds the optimizer-worker Docker image.
- `Supabase Validate`: validates Supabase migrations on pull requests that touch `supabase/`.

Production deploy workflows for hosted PoE Party infrastructure are private operations material.

## Security

Read `SECURITY.md`, `docs/security-checklist.md`, and `docs/open-source-policy.md` before changing auth, tokens, RLS, public data, billing, or hosted-service behavior.

The environment-neutral release sequence and staging gates are documented in
`docs/technical-remediation-rollout.md`. The repository-side manual sequence is in
`docs/manual-release-runbook.md`. Exact production targets, credentials, and private operator
procedures remain private and require explicit confirmation before use.

Do not commit secrets, production logs, local env files, user data exports, service-role keys, Stripe secrets, PoE OAuth secrets, or worker tokens.
