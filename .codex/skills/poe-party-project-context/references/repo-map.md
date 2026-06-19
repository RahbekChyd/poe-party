# PoE Party Repo Map

Repo root is the current PoE Party checkout.

Stable sources:

- `README.md`: environments, GitHub Actions, GGG OAuth, release flow.
- `docs/security-checklist.md`: auth, token, RLS, public data, and production safety checks.
- `docs/poe1-poe2-capability-matrix.md`: supported PoE1/PoE2 behavior and guardrails.
- `docs/public-prerender-seo-plan.md`: public prerender scope, verification, and exclusions.
- `docs/payment-rollout-plan.md`: billing architecture and app gating.
- `optimizer-worker/README.md`: worker production/local env and runtime expectations.
- `optimizer-worker/LOCAL-DEV-README.md`: local Docker restart and verification runbook.

Project shape:

- `src/routes/`: TanStack file routes.
- `src/components/`: feature-organized UI.
- `src/hooks/`: TanStack Query hooks and flow hooks.
- `src/lib/`: shared clients, parsers, domain helpers, query keys, SEO helpers.
- `src/store/`: Zustand client state.
- `supabase/migrations/`: numbered SQL migrations.
- `supabase/functions/`: Edge Functions and shared server helpers.
- `optimizer-worker/src/`: worker server, job runner, engines, and domain libs.
- `public/`: generated/static crawler assets and public images.

Default checks:

```powershell
pnpm type-check
pnpm lint
pnpm build
```
