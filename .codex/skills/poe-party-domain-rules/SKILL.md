---
name: poe-party-domain-rules
description: Product and domain rules for PoE Party. Use when work involves PoE1/PoE2 capabilities, games/leagues/workspaces, group economy, stash snapshots, character sync, public discovery, strategies, services, subscriptions, gear suggestions, optimizer availability, or Path of Exile API assumptions.
---

# PoE Party Domain Rules

Use this skill to avoid accidentally treating PoE2 as a reskinned PoE1 workflow or leaking private group data into public surfaces.

## Core Rules

- Preserve PoE1 behavior unless a change is intentionally shared or PoE2-specific.
- Treat PoE2 as first-class for supported shared workflows, but do not imply parity where upstream APIs are missing.
- Prefer capability checks over scattered hard-coded game checks.
- Scope public listings, subscriptions, search, caches, and workspace data by both game and league where relevant.
- Keep stash snapshots, group wealth history, Atlas/Thread planning, and optimizer/trade-analysis tooling PoE1-only unless a separate upstream validation proves support.
- Strategies do not expose member/character assignment as a product workflow. Keep strategy execution centered on strategy content, active-strategy selection, and snapshot-linked results.

## Public and Private Boundaries

- Public discovery and public detail pages must expose only fields intended for discovery.
- Dashboard data belongs to authenticated users and group members.
- Strategies, services, groups, characters, and subscriptions need clear visibility and membership rules.
- Subscription/billing gates should not be client-writeable.

## External Truth

Before changing assumptions about GGG APIs, OAuth scopes, PoE2 support, poe.ninja data shape, trade search behavior, or Path of Building behavior, verify current official or primary sources. Record stable conclusions in repo docs or the relevant skill reference only if they will matter again.

## References

- Read `references/capability-summary.md` for the current PoE1/PoE2 capability summary.
- Read repo `docs/poe1-poe2-capability-matrix.md` for the source-of-truth matrix.
- Read repo `docs/payment-rollout-plan.md` for subscription and billing boundaries.
