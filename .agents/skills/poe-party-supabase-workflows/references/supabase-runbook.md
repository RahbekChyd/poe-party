# Supabase Runbook

Stable repo facts from `README.md`:

- Environments: local, staging, production.
- Local uses Vite plus local Supabase CLI.
- Hosted preview and production environments use separate Supabase projects managed outside the public repo.
- Local Supabase intentionally uses `4512x` ports instead of the default `5432x` range.
- `.env.local` is machine-specific local development; `.env.example` is the tracked onboarding template.

Local reset behavior:

- The public repo does not keep local demo seed data by default.
- `supabase db reset` applies migrations and starts from an empty local app dataset.

Release flow:

- Frontend validation runs through `App Validate`.
- Supabase changes on PRs should pass `Supabase Validate`.
- Production Supabase deploy is private operations work outside the public repo.
- Supabase migrations use `supabase db push`.
- Edge Functions are deployed with `supabase functions deploy --use-api`.

Security reminders:

- Keep service-role/admin keys server-side only.
- Do not put worker admin keys or OAuth secrets in frontend `VITE_` env vars.
- Re-check repo `docs/security-checklist.md` for auth, RLS, token, and public-data changes.
