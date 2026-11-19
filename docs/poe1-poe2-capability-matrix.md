# PoE1 / PoE2 Capability Matrix

This document tracks what the current app supports for each game after the dual-workspace rollout. The goal is to keep PoE1 stable, ship useful PoE2 support quickly, and avoid pretending we have parity where upstream APIs do not support it.

| Area | Status | Notes |
| --- | --- | --- |
| Group model and active workspace context | `both` | Groups now carry `game` plus `league`, and the active workspace derives `game`, `league`, `apiRealm`, and capabilities. |
| Solo and group onboarding | `both` | New workspace creation chooses game first, then league, and supports solo or shared groups in both games. |
| Group switcher and workspace labels | `both` | Group selection surfaces now show both game and league so overlapping league names do not confuse users. |
| OAuth-based account access | `both` | OAuth character sync and profile sync are shared across both games. |
| Cookie/session auth | `poe1-only` | Cookie-based flows remain available for PoE1 and are intentionally hidden or blocked for PoE2. |
| League selection | `both` | League fetching is game-aware; PoE1 may enrich with account leagues, while PoE2 uses public league lists only. |
| Character sync | `both` | Character sync uses game-aware realms and class normalization for both games. |
| Character profiles and public profile views | `both` | Profiles render for both games, with PoE1-only tree helpers disabled when the active game does not support them. |
| Atlas tree handling | `poe1-only` | Atlas tree URLs, atlas profile rendering, and atlas planning remain PoE1-only. |
| Stash snapshots | `poe1-only` | Snapshot creation, scheduling, and stash sync are blocked for PoE2 because official PoE2 stash and account APIs are not available in the same way. |
| Group economy and wealth history | `poe1-only` | Group stash valuation, wealth history, tab pricing, and stash-based totals stay unchanged for PoE1. |
| Market overview | `both` | PoE1 keeps existing economy flows and PoE2 gets a market-only overview backed by game-aware market adapters. |
| poe.ninja integrations | `both` | Market endpoints are game-aware; PoE1-only item and Thread flows are disabled for PoE2 where the data shape does not map cleanly. |
| Strategy basics | `both` | Strategy name, description, difficulty, visibility, subscriptions, active-strategy selection, and shared notes work in both games. |
| Atlas, Thread, and map strategy planning | `poe1-only` | Atlas tree URLs, Thread planning (with saved Scarabs retained as legacy references), and map-cost-specific planning stay hidden for PoE2 workspaces. |
| Public strategy discovery and subscriptions | `both` | Public listings, previews, and subscriptions are scoped by both `game` and `league`. |
| Public character and group directory | `both` | Search and detail flows are scoped by both `game` and `league`, preventing PoE1 and PoE2 bleed-through. |
| Gear suggestions | `both` | Shared collaboration around manual gear suggestions remains available in both games. |
| Optimizer and trade-analysis tooling | `poe1-only` | The current optimizer stack is gated off for PoE2 pending a separate spike around PoB, trade stats, and party semantics. |
| Query and cache boundaries | `both` | Game-sensitive data uses `game + league` keys to avoid stale or mixed results after workspace switches. |
| Future PoE2 expansion | `planned` | PoE2 stash or account wealth tracking, deeper party assumptions, and optimizer parity need separate upstream validation before implementation. |

## Guardrails

- Preserve existing PoE1 behavior unless a change is specifically required to support both games.
- Treat PoE2 as first-class for shared workflows, not as a reskinned PoE1 workspace.
- Prefer capability checks over scattered `poe1` conditionals in UI and sync code.
- Keep public discovery, subscriptions, and caches scoped by both game and league.
