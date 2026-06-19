---
name: poe-party-supabase-workflows
description: Supabase workflow guidance for PoE Party. Use when changing database migrations, RLS policies, SQL functions/RPCs, Supabase Edge Functions, auth helpers, token storage, local reset behavior, Supabase validation workflows, or Supabase deploy assumptions in the poe-group-tool repo.
---

# PoE Party Supabase Workflows

Treat Supabase changes as security-sensitive by default. Membership, public visibility, token access, and service-role boundaries must be enforced server-side, not only in React.

## Database and Migrations

- Add a new numbered migration in `supabase/migrations/`; do not edit old applied migrations unless explicitly doing local-only cleanup before release.
- Re-check RLS whenever adding a table, view, RPC, or policy-sensitive column.
- Preserve group membership boundaries and public/private strategy/service visibility in SQL.
- Keep PoE1/PoE2 scoping explicit for shared public discovery and workspace data.
- Local resets are migration-only by default; do not reintroduce seed/demo data without an explicit product decision.

## Edge Functions

- Reuse shared helpers in `supabase/functions/_shared/` for auth, admin clients, CORS, PoE API access, token storage, and game-aware behavior.
- Validate request auth before privileged reads/writes.
- Never return or log PoE OAuth tokens, cookies, service-role keys, or raw secret values.
- Keep browser-facing env vars limited to intentional `VITE_` values.

## Local and Release Flow

- Local Supabase uses `4512x` ports; confirm `supabase/config.toml` and `README.md` before changing port assumptions.
- Use `supabase db reset` for local migration reset checks when needed.
- PRs that touch `supabase/` should pass the `Supabase Validate` workflow.
- Production deployment is private operations work outside the public repo after validation.

## References

- Read `references/supabase-runbook.md` for stable environment/deploy notes.
- Read repo `docs/security-checklist.md` before auth, RLS, token, snapshot, or public data changes.
