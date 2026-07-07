# Project Memory

Purpose: low-context handoff for the next Codex session. Keep this file short, current, and overwrite-oriented.

## Latest Conclusions

- PoE Party is an Apache-2.0 open-source app at `https://github.com/RahbekChyd/poe-party`. Public trust copy should link GitHub, mention source availability as transparency, and avoid implying open source equals an independent audit.
- The public repo should include the frontend, Supabase schema/functions, optimizer worker, analyser/scoring logic, local tooling, and validation workflows.
- Commits should use Conventional Commits, documented in `CONTRIBUTING.md`, for example `docs: add open-source trust links` or `fix(auth): preserve OAuth return path`.
- Hosted production operations stay private: production deploy automation, preview-domain automation, comp grants, billing repair, incident response, abuse-sensitive tooling, secrets, logs, and user exports do not belong in this public repo.
- Subscription copy remains Community/Supporter. Supporter is hosted support funding for higher retention, scheduling, queue capacity, and support; do not introduce a closed analyser core by default. Internal billing identifiers can still use `pro` for Stripe/database continuity.
- Public validation workflows remain in `.github/workflows/app-validate.yml` and `.github/workflows/supabase-validate.yml`. Production deploy workflows are private operations outside the public repo.
- Canonical local env split: root `.env.local` is browser-safe Vite config only; local Supabase Edge Function secrets live in `supabase/functions/.env`. Root `.env` and `supabase/functions/.env.local` are not part of the default local setup.
- Local demo data has been removed for simplicity. There is no tracked `supabase/seed.sql`, no dev-login seeded credentials, no `create-demo-group` Edge Function, and no navbar demo-generation action. Local resets are migration-only by default.
- PoE2 early-access/workspace creation gates are configurable, not hard-coded to a real account. Frontend uses `VITE_POE2_ALLOWED_ACCOUNT_NAMES`; fresh database bootstrap reads Postgres setting `app.allowed_poe2_accounts` in `enforce_poe2_group_access()`. Private ops must configure hosted environments before deploying that function if the gate should remain restricted.
- Public Analysis must not prefill a real PoE account. Keep the account field empty by default and use `AccountName#1234` only as placeholder/example copy.
- Public Analysis uses internal `guest_*` tables/functions; browsers go through `guest-list-characters`, `guest-queue-upgrade-analysis`, and `guest-upgrade-analysis-status`. Run tokens and IPs are HMAC-hashed before storage.
- Frontend dependencies are React `^19.2.6`, `@heroui/react` `^3.0.4`, and `@heroui/styles` `^3.0.4`. Use native HeroUI v3 subpackage imports and shared helpers in `src/components/ui/heroui-native.tsx`; do not recreate a v2 compatibility bridge.
- Shared frontend billing facts live in `src/lib/billing.ts`; Support, FAQ, and snapshot-retention copy should import from there instead of duplicating plan limits.
- Stripe webhooks in Supabase Edge Runtime must use `await stripe.webhooks.constructEventAsync(...)`; the synchronous verifier fails in Deno with `SubtleCryptoProvider cannot be used in a synchronous context`.
- Global `pnpm.cmd` under Node `v25.9.0` has failed before project scripts with a syntax error in the global pnpm launcher. Prefer `npm exec --yes pnpm@10.33.2 -- <script>` for validation.

## Next Steps

1. Keep private comped Supporter/billing-repair tooling outside this repo; public docs should describe the workflow without exposing the scripts.
2. If production needs the configurable PoE2 gate deployed, configure the private hosted DB setting and matching frontend env first, then deploy through private ops after explicit target confirmation.
3. GitHub `origin/main` for `RahbekChyd/poe-party` has been force-updated from the clean public export. Future public-release edits should amend or add commits deliberately from `poe-group-tool-public-release`.
4. Re-check authenticated dashboard routes for any dashboard-only HeroUI tooltip/dialog console warnings when an authenticated browser/profile is available.

## Active Blockers Or Assumptions

- Do not mutate production hosted services automatically. For production Supabase, Vercel, Stripe, worker, or other hosted-service changes, double-verify the exact target and ask for explicit confirmation, or provide manual steps.
- Local frontend is expected on `http://localhost:5173`; a server may already be running there, so check before starting a competing Vite server.
- Local Supabase uses `4512x` ports and is currently running in this workspace. `supabase db reset` is destructive to local app data; ask before running it.
- `src/routeTree.gen.ts` was already modified before the open-source readiness work; do not assume it is part of this task without reviewing its diff.

## Latest Verification

- OSS-readiness source checks have passed with `npm exec --yes pnpm@10.33.2 -- generate:seo`, `type-check`, `lint`, `build`, and `node --check` for `scripts/generate-public-seo.mjs`, `optimizer-worker/src/lib/poe-trade-client.mjs`, and `optimizer-worker/src/lib/poe-wiki-icons.mjs`.
- Open-source trust-copy update on July 7, 2026: `npm exec --yes pnpm@10.33.2 -- generate:seo`, `type-check`, `lint`, and `build` passed. Build still emitted the known HeroUI CSS minifier warnings and Rollup large chunk warning. Playwright verified `/legal/security` and `/legal/faq` on desktop and mobile against local Vite with browser-safe Supabase env values.
- Local-demo removal checks on June 19, 2026: `npm exec --yes pnpm@10.33.2 -- type-check`, `lint`, and `build` passed. Build still emits the known upstream HeroUI CSS minifier warnings and existing large Rollup chunk warning.
- `npm exec --yes pnpm@10.33.2 -- supabase status` confirmed the local Supabase stack is running. `supabase db reset` was not run because it would wipe the local development database.
- `git diff --check` passes; it only prints existing Windows LF-to-CRLF warnings.
- Focused current-tree scans for removed private workflow/script references, old hosted project identifiers, personal account/contact literals, strict Stripe/JWT secret patterns, and removed demo/seed/dev-login identifiers returned no matches.
- Full-history secret scan on June 19, 2026: Dockerized Gitleaks v8.30.1 `detect --source=/repo --redact --no-banner --verbose` scanned 225 commits and found no leaks; Dockerized TruffleHog 3.95.6 `git file:///repo --only-verified --no-update` scanned 9,332 chunks and found 0 verified/unverified secrets.
- Raw Gitleaks `dir /repo` intentionally found ignored local runtime/build files (`.env.local`, `supabase/functions/.env`, `dist/`, `.tmp-pob-src/`). These are ignored and excluded from the clean public export.
- Private source history still contains non-secret public-release residue: personal author email metadata, old hosted project refs/contact/account literals, and deleted local artifacts. Keep using the clean public export instead of preserving private history.
- Clean public release repo lives at sibling path `poe-group-tool-public-release` with one root commit (`Initial open-source release`). On July 3, 2026, `git push --force-with-lease origin main` succeeded for `git@github.com:RahbekChyd/poe-party.git`; local `origin/main` matched the pushed clean import afterward.
