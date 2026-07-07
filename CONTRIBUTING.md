# Contributing

PoE Party is an open-source Path of Exile group tool. Contributions are welcome when they keep the hosted product safe, respect private player data, and preserve the Community/Supporter product model.

## What Belongs In This Repo

- Frontend app code, public pages, and shared UI.
- Supabase migrations, Row Level Security policies, and Edge Functions.
- Optimizer worker code, analyser contracts, recommendation scoring, and public analysis behavior.
- Local development tooling, validation workflows, and self-hosting documentation.

Production operator tooling, live deployment credentials, incident response details, comp grants, and abuse-sensitive automation belong in private operations material, not this public repo.

## Local Validation

Use the pinned pnpm version through npm exec when the global pnpm launcher is unreliable:

```powershell
npm exec --yes pnpm@10.33.2 -- type-check
npm exec --yes pnpm@10.33.2 -- lint
npm exec --yes pnpm@10.33.2 -- build
```

Run `npm exec --yes pnpm@10.33.2 -- generate` after changing TanStack route files if generated route metadata is not updated automatically.

## Commit Messages

Use Conventional Commits for commit subjects:

```text
<type>(optional-scope): short summary
```

Keep the subject concise, lower-case the type, and do not end it with a period.

Common types:

- `feat`: user-facing feature or product behavior
- `fix`: bug fix
- `docs`: documentation, public copy, SEO text, or policy copy
- `refactor`: code change that preserves behavior
- `test`: test coverage or test infrastructure
- `build`: build system, dependencies, or generated build metadata
- `ci`: GitHub Actions or CI configuration
- `chore`: maintenance without user-facing behavior

Examples:

```text
feat(optimizer): queue authenticated upgrade analysis
fix(auth): preserve return path after OAuth callback
docs: add open-source trust links
ci: validate Supabase migrations
```

Use `!` after the type or scope for breaking changes, and explain the break in the commit body.

## Security And Privacy

- Do not commit `.env`, `.env.local`, `supabase/functions/.env`, service-role keys, Stripe secrets, PoE OAuth secrets, worker tokens, logs, or production exports.
- Do not add client-writeable gates for billing or subscription state.
- Re-check public/private data boundaries when changing dashboard data, public discovery, snapshots, recommendations, or billing.
- Report vulnerabilities privately through the process in `SECURITY.md`.

## Product Direction

Community access should stay useful and source-complete. Supporter access is hosted convenience and support funding: higher retention, scheduling, queue capacity, and operational support. Do not introduce a closed analyser gate without an explicit product decision.
