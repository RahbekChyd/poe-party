# Snapshot Scaling Plan

Last updated: June 19, 2026

## Baseline

Measured from the local Supabase database:

- Full snapshot sample: 5 tabs, 197 items
- Logical payload size: 332,082 bytes
- Snapshot baseline with 20% padding: ~398,498 bytes / ~389 KiB
- Estimated PostgreSQL storage with indexes/TOAST: ~1.24 MiB per full snapshot

At 10,000 Community users with 5 retained snapshots each:

- 50,000 full snapshots
- ~60.5 GiB PostgreSQL storage at the current baseline
- Supabase Pro DB overage would be low; performance and payload size matter more than raw storage cost

## Recommended Limits

Use these defaults until real production distribution says otherwise:

- Community: 5 retained full snapshots
- Supporter: 15 retained full snapshots
- Retention remains account-wide across all groups
- Raw snapshots continue to be deleted by retention
- Durable summary history remains in `snapshot_value_history`

Revisit limits when either condition is true:

- At least 100 real completed snapshots have been measured
- p95 full snapshot DB storage exceeds 5 MiB

## Phase 1: Measure First

Add snapshot storage telemetry before changing architecture.

Implement:

- A private `snapshot_storage_metrics` table keyed by `snapshot_id`
- A security-definer RPC that records:
  - `tab_count`
  - `item_count`
  - logical payload bytes
  - raw JSON bytes
  - estimated DB storage bytes
  - measured timestamp
- A simple SQL report for storage by user tier, group, and completion date

Goal:

- Know real p50, p90, p95, and max snapshot size
- Identify whether large users are common or rare
- Avoid premature database migration decisions

## Phase 2: Keep Reads Lean

Optimize the common UI/API paths before changing storage vendors.

Implement:

- Do not fetch `raw_data`, `mods`, or `sockets` for normal snapshot views
- Paginate item loading:
  - default page size: 100
  - max page size: 250
- Keep charts and totals powered by `snapshot_value_history`
- Avoid loading all latest group items unless a view explicitly needs item-level detail

Recommended indexes:

- `stash_tabs(snapshot_id, user_id, id)`
- `stash_items(tab_id, user_id)`

Verify with `EXPLAIN ANALYZE` on:

- latest snapshot item query
- historical snapshot item query
- group economy item query

## Phase 3: Add Guardrails

Do not hard-block large snapshots immediately. Warn and measure first.

Add:

- Warning telemetry when a snapshot exceeds 2,000 items
- Admin-visible large snapshot flag when estimated DB storage exceeds 5 MiB
- Optional later Community-tier hard cap if needed, defaulting to 5,000 items per snapshot

## Phase 4: Archive Only If Needed

Keep Supabase/Postgres as the primary database unless metrics show a real problem.

If DB growth or query performance becomes material:

- Keep normalized searchable item columns in Postgres
- Move old non-latest raw JSON payloads to compressed Supabase Storage
- Keep latest snapshots fully queryable
- Keep summary history in Postgres permanently

Do not implement archive storage until telemetry proves it is needed.

## Acceptance Criteria

- Snapshot completion records storage metrics automatically
- Retention still deletes raw snapshot rows and cascades tabs/items
- Summary history survives raw retention
- Snapshot detail initial load does not fetch every item for large snapshots
- Item pagination works for latest and historical snapshots
- RLS still enforces group membership boundaries
- Query plans use the intended indexes
