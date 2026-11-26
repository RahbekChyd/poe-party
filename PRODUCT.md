# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

PoE Party serves Path of Exile players who plan and track their own progress or coordinate with a party. Solo players can run a workspace of their own. Party members can join a shared workspace, see the active strategy, and review shared progress. Visitors can explore public listings and try public analysis before connecting a PoE account.

Audience priority is open. The current home page gives solo and party play a shared framing around planning a run, reviewing its outcome, and choosing the next upgrade. Which audience or job should lead future product decisions remains unconfirmed.

## Product Purpose

Keep run planning, character context, economy, and gear decisions in one workspace for the selected game and league. A player can see what the party is running, review what changed after play, and decide what to run or upgrade next. Available steps depend on the game.

## Positioning

In PoE1, a workspace can link stash snapshots to an active farming strategy and review the resulting wealth changes in strategy history. This connects a shared plan to measured outcomes and places those outcomes alongside gear suggestions and upgrade analysis.

## Operating Context

- Players connect their PoE account, choose a game and league, and create a solo workspace or create or join a party. They can switch among workspaces.
- Strategies have their own content, visibility, notes, and active selection. PoE1 workspaces can link snapshots to strategies. Estimated currency per hour uses changes between group wealth history points over elapsed time. Repricing, exclusions, stash changes, and member updates can influence it.
- Public surfaces include strategy and service listings, the group and character directory, and guest analysis. Private workspace data is visible to authorized users. Public discovery exposes only fields intended for public viewing.

## Capabilities and Constraints

- Both games support solo and shared workspaces, character sync, market overview, basic strategies, public discovery, and manual gear suggestions where workspace access is enabled. Scope game-sensitive data and listings by game and league.
- PoE1 supports stash snapshots and wealth history, Atlas and Thread planning, and Path of Building and trade-backed upgrade analysis. Extending those workflows to PoE2 requires upstream validation. See the [capability matrix](docs/poe1-poe2-capability-matrix.md).
- Community provides core workspace and public features. Optional hosted Supporter access increases snapshot retention and scheduling options and removes the app-enforced daily cap on newly queued authenticated upgrade analyses. Use **Community** and **Supporter** in player-facing copy.
- PoE Party is a passion project. Explain Community capacity limits in terms of storage and computing costs, and describe Supporter as an optional way to help cover the cost of additional capacity.

## Brand Commitments

The name is **PoE Party**. It is an independent, Apache-2.0 open-source project with no affiliation with or endorsement by Grinding Gear Games. See the [open-source policy](docs/open-source-policy.md).

## Evidence on Hand

- [Home page](src/components/home/ProductHomePage.tsx) and [player FAQ](src/components/legal/FaqPage.tsx) describe the workflow, game support, and how group wealth and currency per hour are calculated.
- [Guest analysis](src/routes/preview/analysis.tsx) is an interactive entry point. [Workspace preview fixtures](src/lib/preview-fixtures.ts) provide sample data for public demonstrations.
- [PoE Party logo](src/assets/poe-party-logo.png) is the existing in-app brand asset.

## Product Principles

- Keep the strategy, workspace, and result connected so players can act on what they learn from a run.
- Make the active game and league clear and describe supported capabilities accurately for each game.
- Explain what economy and upgrade estimates measure and which inputs can shift the result.
- Preserve useful Community workflows and let players deliberately choose what they share publicly.
