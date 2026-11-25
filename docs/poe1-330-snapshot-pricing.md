# PoE1 3.30 snapshot valuation

Snapshot capture and valuation are server-owned. Migration 0091 adds nullable
`pricing_summary` metadata and the service-only `finalize_priced_snapshot` RPC.
Existing prices/history are not backfilled or repriced; null metadata means legacy
coverage is unknown. Deploy the migration before the updated `poe-snapshot` function.
Hosted changes still require the normal reviewed operations release process.

## Data and matching

The supported public poe.ninja economy API supplies exchange and stash estimates:
https://poe.ninja/docs/api. Browser and Edge code share category definitions and
exchange validation. Public snapshots use the exact group league for pricing.
Private snapshots use the public market whose PoE league category and game mode
match the account's private league, provided poe.ninja lists that market. This
preserves the Hardcore, Solo Self-Found, and Ruthless distinctions. The private
league still identifies the stash and workspace. When the account metadata or matching
market is unavailable, capture still completes and prices remain unknown.
Requests use bounded concurrency, timeouts, conditional HTTP caching and a
descriptive server User-Agent. Divine conversion uses a quoted exchange rate.
The signed-in Economy overview prefers the live league rate, then the newest
valid rate from current member snapshots. If both are unavailable, it displays
amounts in Chaos Orbs.

Exchange identities are exact names. Equipment is never priced by that lookup.
Supported stash matchers require the available variant identity: unique base and
links/corruption/foil/mutated state; gem level/quality/corruption or imbued support;
map category/tier and special identity; Wombgift level; corpse full name; Viscera
implicit signature. Generic rare gear and ambiguous/special unsupported variants
remain unknown. These are market estimates, not roll-perfect sale quotations.

## Completion and history

The finalizer serializes completions per group, then locks the in-progress capture and verifies the submitted item IDs
cover exactly the stored items. It atomically stores nullable values, recomputes
exclusion-aware tab subtotals, marks completion and publishes applicable history.
The server reads item rows in stable 500-row pages before finalization.

`pricing_summary.status` is feed availability (`complete`, `partial`, `unavailable`),
not a claim that every item can be valued. The summary separately records priced
and unpriced counts, failed categories, source/version/time and nullable Divine rate.
New valuations also record `pricing_league` when a market was resolved. An
entirely empty market feed is unavailable even if its requests succeeded.
An unavailable feed still permits raw capture completion but publishes no valued
history point. A group history update is suppressed when any member's latest raw
snapshot has unavailable valuation, preventing that member from disappearing from
the group subtotal. Partial points carry metadata and are ineligible for comparative
profit calculations. Item exclusions/linking retain their narrow authorized RPCs.

Authenticated clients cannot insert/update/delete capture or wealth-history tables,
submit nonempty price-update payloads, or call the finalizer. They retain scoped
reads and exclusion/link operations. This prevents client-provided prices or summary
metadata from manufacturing public strategy benchmark results.

## Verification

- `pnpm exec vitest run src/lib/ninja-economy.test.ts`: matching, malformed feeds,
  missing conversion, total/partial failure, bounded requests, cache and stacks.
- `supabase/tests/010_trusted_snapshot_valuation.sql`: atomic exact coverage,
  >1,000 items, outage history, exclusions, and tenant/privilege boundaries.
- Replay all migrations and run the full SQL authorization suite in isolated CI or
  a disposable local database; never reset a shared database without authorization.

The two-connection regression can run against a disposable local database after
migration replay: `node scripts/test-snapshot-finalization-concurrency.mjs <container> [socket-directory]`.
It seeds isolated fixture identities, overlaps two member finalizations, verifies
the last group total includes both, and removes its fixture records.
