---
name: poe-party-project-context
description: Baseline onboarding for the PoE Party poe-group-tool repository. Use before or during any task in this repo that needs stack orientation, local commands, environment boundaries, deployment shape, repo docs, or project-specific "do not casually change this" context.
---

# PoE Party Project Context

Use this skill to orient work in the PoE Party repo. Treat the current checkout as source of truth and re-check referenced files locally.

## Start Here

- Read repo `AGENTS.md`, `README.md` and relevant docs early. In public `poe-party`, `PROJECT_MEMORY.md` is optional, ignored local handoff material: read/update it if present, keep it concise, and never commit or force-add it. Clean clones must work without it. Follow the separate private operations repo's memory policy when working there.
- Inspect the relevant source before deciding; this repo has recent project docs and generated files.
- Prefer local repo truth first, official docs second, assumptions last.
- For current third-party behavior, verify official docs before relying on memory, especially Supabase, Vercel, TanStack Router, HeroUI, GGG OAuth/API behavior, poe.ninja, and PoE/PoE2 support.
- Do not expose or move secrets from `.env`, `.env.local`, Supabase service keys, OAuth secrets, or worker admin keys into frontend code.

## Repo Shape

- Frontend: Vite, React 19, TypeScript, TanStack Router, TanStack Query, HeroUI, Tailwind, Zustand.
- Backend/data: Supabase auth, database migrations, RLS, RPCs, and Edge Functions under `supabase/`.
- Worker: `optimizer-worker/` container service for queued gear optimizer analysis with PoB runtime and trade analysis.
- Deployment: frontend on Vercel, Supabase project for DB/functions, optimizer worker as its own container service.
- Docs: `README.md`, `docs/`, and worker readmes are active project sources.

## Common Commands

Use `pnpm` from repo root:

```powershell
pnpm type-check
pnpm lint
pnpm test
pnpm test:worker
pnpm build
pnpm check:bundle
pnpm test:e2e
pnpm dev
```

If the global pnpm launcher fails under the installed Node version, use the repository-pinned
launcher form: `npm exec --yes pnpm@10.33.2 -- <script>`.

Use `pnpm generate` after changing TanStack route files if route generation is not handled by the dev/build flow.

## Environment Files

- Keep root `.env.local` browser-safe and limited to `VITE_*` values.
- Keep local Supabase Edge Function secrets in `supabase/functions/.env`; do not put Stripe, service-role, or PoE client secrets in root env files.
- Root `.env` and `supabase/functions/.env.local` are not part of the canonical local setup. Check `README.md` and the two tracked env examples before changing env docs or scripts.

## References

- Read `references/repo-map.md` for stable repo orientation.
- Read repo `README.md` for environment and deployment details.
- Read `docs/security-checklist.md` before auth, tokens, RLS, public data, or production release work.
