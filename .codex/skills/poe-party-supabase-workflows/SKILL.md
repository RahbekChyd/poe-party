---
name: poe-party-supabase-workflows
description: Supabase workflow guidance for PoE Party. Use when changing database migrations, RLS policies, SQL functions/RPCs, Supabase Edge Functions, auth helpers, token storage, local reset behavior, Supabase validation workflows, or Supabase deploy assumptions in the poe-group-tool repo.
---

# PoE Party Supabase Workflows

Treat Supabase changes as security-sensitive by default. Membership, public visibility, token access, and service-role boundaries must be enforced server-side, not only in React.

## Database and Migrations

- Add a new numbered migration in `supabase/migrations/`; do not edit old applied migrations unless explicitly doing local-only cleanup before release.
- Re-check RLS whenever adding a table, view, RPC, or policy-sensitive column.
- PostgreSQL views over RLS-protected tables must use `WITH (security_invoker = true)` or an explicitly authorized RPC. Default owner-rights views can bypass base-table RLS; verify final grants and test as `anon` plus unrelated authenticated users.
- For every `SECURITY DEFINER` function, revoke execution from `PUBLIC`, `anon`, and `authenticated` before granting only the intended role. Revoking only `anon`/`authenticated` does not remove execution inherited from `PUBLIC`.
- An own-row check such as `user_id = auth.uid()` is not sufficient for tenant data. Also validate group/workspace membership and parent-row consistency so callers cannot inject their rows into another group.
- Expose narrow mutation RPCs instead of granting broad table `UPDATE` privileges. Multi-step queue, quota, stale-state, billing, or membership transitions that must share one outcome belong in one database transaction.
- Preserve group membership boundaries and public/private strategy/service visibility in SQL.
- Keep PoE1/PoE2 scoping explicit for shared public discovery and workspace data.
- Local resets are migration-only by default; do not reintroduce seed/demo data without an explicit product decision.

## Edge Functions

- Reuse shared helpers in `supabase/functions/_shared/` for auth, admin clients, CORS, PoE API access, token storage, and game-aware behavior.
- Validate request auth before privileged reads/writes.
- Never return or log PoE OAuth tokens, cookies, service-role keys, or raw secret values.
- PoE OAuth tokens use the rotation-capable AES-256-GCM key-ring contract in `docs/poe-token-encryption-rollout.md`. Keep keys in Edge secrets, use dual-read expand/backfill/contract releases, and never attempt encryption or key handling inside SQL.
- Keep browser-facing env vars limited to intentional `VITE_` values.

## Local and Release Flow

- Local Supabase uses `4512x` ports; confirm `supabase/config.toml` and `README.md` before changing port assumptions.
- `supabase db reset` destroys local app data; ask before running it in a shared workspace. When a reset is not authorized, validate new migrations and pgTAP suites inside one outer transaction and roll the whole composite run back.
- Database validation should include final-schema privilege assertions and anonymous/two-account negative tests; `supabase db lint` and migration replay do not validate authorization semantics.
- PRs that touch `supabase/` should pass the `Supabase Validate` workflow.
- Production deployment is private operations work outside the public repo after validation.

## References

- Read `references/supabase-runbook.md` for stable environment/deploy notes.
- Read repo `docs/security-checklist.md` before auth, RLS, token, snapshot, or public data changes.
