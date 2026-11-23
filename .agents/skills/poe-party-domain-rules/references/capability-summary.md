# PoE1 / PoE2 Capability Summary

Source of truth: repo `docs/poe1-poe2-capability-matrix.md`.

Shared / both games:

- Group model and active workspace context.
- Solo and group onboarding.
- OAuth character sync and profile sync.
- League selection with game-aware behavior.
- Character profiles and public profile views.
- Market overview with game-aware adapters.
- Strategy basics: name, description, difficulty, visibility, subscriptions, active-strategy selection, and shared notes.
- Public strategy discovery and subscriptions scoped by game and league.
- Public character and group directory scoped by game and league.
- Manual gear suggestions.
- Query/cache boundaries that include game and league where relevant.

PoE1-only:

- Cookie/session auth fallback.
- Atlas tree handling.
- Stash snapshots.
- Group economy and wealth history.
- Atlas, scarab, and map strategy planning.
- Current optimizer and trade-analysis tooling.

Guardrails:

- Preserve existing PoE1 behavior unless intentionally changing it.
- Treat PoE2 as first-class where supported.
- Prefer capability checks over scattered conditionals.
- Do not imply unsupported PoE2 stash, account wealth, or optimizer parity without fresh upstream validation.
