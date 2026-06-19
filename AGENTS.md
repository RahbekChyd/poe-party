# Agent Instructions

- Read `PROJECT_MEMORY.md` early in each session.
- At the end of meaningful tasks, update `PROJECT_MEMORY.md`.
- Prefer replacing stale memory over appending a changelog.
- Keep memory concise: latest conclusions, concrete next steps, active blockers/assumptions, and verification last run.
- Only update broader instructions when the session produced durable knowledge future agents should not rediscover.
- Do not use memory for one-off task history, verbose logs, or duplicate documentation.
- Do not interact with production services automatically. For production Supabase, Vercel, Stripe, worker, or other hosted-service changes, double-verify the exact target and ask for explicit confirmation first, or provide manual steps for the user to run.

## Agent Routing

Use sub-agents when a task is broad enough to benefit from focused ownership. Keep small, direct edits in the main agent unless the user asks for delegation.

- Use `frontend-engineer` for substantial React/TanStack Router UI, HeroUI controls, workspace/game/party flows, layout, interaction, accessibility, and visual polish. Require PoE Party frontend guidance and browser verification for visible route changes.
- Use `backend-data-engineer` for Supabase schema, migrations, RLS, RPCs/functions, repositories, queue/worker behavior, Path of Building or optimizer-worker integration, stash/character/economy data, and server-side domain logic.
- Use `security-reviewer` for auth, RLS, workspace membership, tokens, public/private data, Stripe or billing behavior, production secrets, and any hosted-service access boundary.
- Use `release-engineer` for public-release readiness, production Supabase/Vercel/worker deploys, CI failures, env changes, migrations, domains, rollback planning, and hosted-service verification.
- Use `qa-browser-verifier` after user-facing route changes, party/workspace flows, import/snapshot flows, optimizer workflows, and before public-release smoke tests.

The main agent remains responsible for integrating sub-agent output, preserving repo rules, and avoiding unrelated rewrites.
