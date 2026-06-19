# Release Checklist

Source of truth: repo `README.md`, `.github/workflows/`, and `docs/security-checklist.md`.

Workflows:

- `App Validate`: frontend release checks on PRs and optimizer-worker Docker image build.
- `Supabase Validate`: PR validation for changes under `supabase/`.
- Production deploy and preview-domain automation live in private operations outside the public repo.

Recommended readiness:

- Local `pnpm type-check`, `pnpm lint`, and `pnpm build` pass when relevant.
- Supabase changes pass validation before any private production deploy.
- Vercel Preview is checked for browser-visible or crawler-visible changes.
- Production deploys keep staging/local/prod credentials separated.
- Function secrets and optimizer-worker service configuration are managed outside GitHub Actions unless repo docs say otherwise.

Security-sensitive areas:

- OAuth/cookie auth.
- Token storage and refresh.
- RLS and membership checks.
- Snapshot/stash data.
- Public discovery output.
- Billing/subscription gates.
- Logs and error payloads.
