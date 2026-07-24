# Technical Remediation Rollout

This document is the public, environment-neutral release contract for the July 2026 security,
reliability, and product remediation. Exact hosted project references, credentials, incident data,
and operator commands remain in private operations material.

For the repository-side sequence, commands, acceptance matrix, and stop gates, use
`docs/manual-release-runbook.md`.

## Release order

1. Review migrations `0082` through `0088` and apply them in numeric order. They cover strategy
   metadata, security containment, tenant/public-profile contracts, guest and billing primitives,
   optimizer attempt ownership, additive OAuth token encryption, and atomic analysis queuing.
2. Before deploying token consumers, configure the complete server-only AES-256-GCM key ring from
   `docs/poe-token-encryption-rollout.md`. Missing or invalid encryption configuration fails closed.
3. Deploy the coordinated Edge Function set, including the atomic queue caller and all seven OAuth
   token consumers. Keep legacy plaintext token columns during this expand window.
4. Deploy one optimizer worker canary only after migration `0086` is present; the worker requires
   its lease/attempt RPCs. Promote the worker after retry, cancellation, and transactional result
   checks pass.
5. Deploy the frontend with the new OAuth-only production login, tab-scoped sessions, product home,
   navigation, query states, accessibility changes, and route splitting.
6. Backfill legacy token rows through the shared encryption path, observe a stable release, and
   defer every destructive contract migration until its documented zero-row gates pass.

Security revocations are forward-only. If a release needs to be rolled back, disable the affected
flow or deploy a safe compatibility adapter; never restore an unsafe grant or policy.

## Environment gate

Before any hosted mutation, an operator must confirm all of the following in the same session:

- exact Supabase project reference and environment label;
- exact Vercel project/environment and frontend release SHA;
- exact optimizer worker service and image SHA;
- Stripe sandbox versus live mode;
- database migration parity and current function versions;
- Supabase signing-key mode and the session impact of the selected rotation path;
- a recent backup or point-in-time recovery status;
- the rollback/disable path for every affected user flow.

No command in this repository performs a production deployment or global session revocation.

## Staging acceptance

- Run migrations from an empty local database and on an isolated staging copy.
- Run privilege tests as anonymous, Group A admin/editor/viewer, and unrelated Group B users.
- Verify that raw stash views and raw public-character payloads are unavailable.
- Verify atomic workspace creation/join and rejection of every cross-tenant write fixture.
- Queue synthetic optimizer runs with multiple workers, expired leases, retries, cancellation, and
  an item set larger than one PostgREST page.
- Exercise guest quota, oversized input, upstream timeout, expiry cleanup, and safe status output.
- Exercise Stripe sandbox Checkout concurrency plus duplicate and out-of-order webhooks.
- Run the browser matrix at desktop, 768 px, and 390 x 844 px for public, login, onboarding,
  workspace, snapshot, strategy, analysis, and public-profile flows.

## Production canary

After explicit target confirmation, use this order:

1. Database migrations `0082` through `0088`.
2. Confirm the complete OAuth token key ring, then deploy the coordinated Edge Functions.
3. One optimizer worker canary, followed by worker promotion.
4. Frontend release.
5. Count-only token backfill/key-rotation reporting and OAuth session reconciliation.
6. Compatibility observation window.
7. A later contract migration and legacy-column removal only after every gate is green.

For 24 hours, monitor authorization denials, OAuth failures, queue age, expired attempts, optimizer
failure rate, guest `429`/`413` responses, webhook leases, duplicate Checkout attempts, sanitized
client errors, and activation completion. Stop promotion on any unexplained tenant-boundary denial,
identity collision, duplicate charge, partial optimizer persistence, or raw-data disclosure.

## Product invariants

- The core loop is **Plan -> Play -> Snapshot -> Learn -> Upgrade**.
- The authenticated information architecture is Today, Runs, Builds, Party, and Discover.
- Stash snapshots/history, atlas/scarab planning, and optimizer analysis remain PoE1-only.
- PoE2 supports character sync, market overview, and shared strategy planning without implying
  stash or optimizer parity.
- Public profiles are explicit opt-in curated build profiles; they never expose inventory, atlas,
  raw provider payloads, or internal identifiers.
- POESESSID is a localhost development transport only and never establishes application identity.
