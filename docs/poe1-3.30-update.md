# PoE1 3.30 update

The update follows [GGG's patch notes](https://www.pathofexile.com/forum/view-thread/4013680),
[GGG's API changelog](https://www.pathofexile.com/developer/docs/changelog), and
[poe.ninja's supported economy API](https://poe.ninja/docs/api).

## Behavior

- Strategies support up to eight paid Threads per type and up to three types per map.
  Older saved setups with additional types can be used as saved and follow the new
  limits when their Thread selections change. Saved Scarabs remain a legacy
  reference. New requirements use Atlas Drops and Threads.
- Thread icons load independently of prices. Estimates use the workspace's
  poe.ninja economy league, so leagues without quotes still have the full picker.
- Future snapshots receive server-owned estimates for supported exchange items,
  uniques, gems, maps, Viscera and other supported special items. Ambiguous items
  remain unpriced. Member/group views use stored estimates and expose coverage.
  Existing snapshots and historical prices are not repriced.
- Pricing completion is atomic and serialized per group. Outages retain raw captures
  without publishing false wealth drops. Client writes cannot forge valued history.
- Current benchmarks require compatible complete valuations and begin again after
  setup changes. Historical observations remain intact.
- PoB 2.68.1 and modern LuaJIT are pinned with archive hashes. Imports preserve
  structured modifiers, passive/equipment data and Wickerman. Owned/trade Viscera
  use separate parts and exact swap scoring. Engine identity participates in caching.
  Unknown source completeness and unsupported flags produce partial results.
- Current editorial templates target 3.30; archived 3.29 URLs remain available.

See [snapshot pricing](./poe1-330-snapshot-pricing.md) and the
[worker contract](../optimizer-worker/README.md#poe1-330-runtime-contract).

## Validation

Checks include frontend types/lint/unit tests, desktop/mobile browser workflows,
public prerendering, bundle budgets, migration replay and authorization tests on
PostgreSQL 15 and 17, plus a two-connection snapshot-finalization regression.

The network-disabled PoB fixture verifies skill calculation, a controlled +100-life
Wickerman effect, clearing an absent part, and owned/market swaps with correct costs
and metric changes. CI runs this after the image build. These bounded fixtures do
not establish numerical parity for every complex desktop build.

## Release order

1. Review the source diff and validation through the existing private release process.
2. Apply migrations 0091-0093 after existing migrations on the confirmed target,
   followed by the updated snapshot and character-sync functions.
3. Release the verified worker before activating the queue functions' new engine
   contract, then release the frontend. Worker and queues must agree on that contract.
4. On staging, capture representative items, inspect member/group coverage, save a
   Thread setup, and run authenticated plus guest analysis. Guest Wickerman omissions
   must remain explicitly incomplete.
5. Production promotion requires explicit target confirmation and accepted staging
   evidence. Hosted changes and production smoke tests were not performed locally.

For the Strategy wizard and revised Thread limits, apply migration 0094 before
releasing the frontend. On staging, create a strategy with three types at eight
each and check the picker in a trade league and in a league without quotes.

Rollback must preserve recorded prices, legacy references and the server-owned
valuation boundary. Do not restore broad client pricing grants to roll back a UI.
