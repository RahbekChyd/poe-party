---
name: poe-party-release-security
description: Release and security guidance for PoE Party. Use before production deploys, when reviewing PR readiness, changing auth/token/RLS/public-data behavior, touching secrets or environment variables, preparing Vercel/Supabase/Railway releases, or validating security-sensitive changes in the poe-group-tool repo.
---

# PoE Party Release Security

Use this skill when a change could affect production safety, data exposure, auth, billing, public SEO output, or deployment readiness.

## Release Gates

- Run the relevant local checks before calling a change ready: `pnpm type-check`, `pnpm lint`, and `pnpm build` for frontend/shared TypeScript changes.
- For Supabase changes, require migration/RLS review and the PR `Supabase Validate` workflow.
- Validate Vercel Preview for UI, SEO, or shared behavior changes that need browser confirmation.
- Route production deploys through private operations outside the public repo after validation.
- Keep optimizer worker deployment separate from frontend and Supabase releases.

## Security Checks

- Read repo `docs/security-checklist.md` for auth, RLS, tokens, snapshots, public data, logging, or production release changes.
- Keep production, staging, and local credentials separated.
- Confirm no client-readable `VITE_` env var contains secrets.
- Re-check public/private boundaries for dashboard data, public discovery, services, strategies, groups, characters, and subscriptions.
- Do not claim external security review or audit unless it actually happened.

## External Docs

Verify current official docs for Vercel, Supabase, Stripe, GGG OAuth/API behavior, and hosting/deploy behavior when a release decision depends on current platform rules.

## References

Read `references/release-checklist.md` for stable repo-specific release notes and workflow names.
