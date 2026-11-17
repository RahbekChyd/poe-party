# Account identity and league data

## Sign-in identity

PoE Party identifies an account by the immutable UUID returned by a successful PoE OAuth
exchange. Account names are display attributes: they can change, and an old stored name
must not block a different verified UUID from signing in.

An existing verified UUID keeps its original profile ID and related data. A verified UUID
without a profile creates a new Auth user and profile, even when an older profile has the
same display name. The new profile starts with its own memberships, history and subscription
state. It receives no private records, tokens, billing customer or paid entitlement from a
same-name profile. New users see a notice after their session is verified before entering
the workspace.

Profile creation belongs to the verified server OAuth flow. Browser clients keep their
own profile-read and preference-update permissions, but cannot insert a profile with a
claimed PoE display name.

Older profiles and their relationships remain intact. Starting fresh does not recover their
data, cancel their subscriptions or merge their identities. Restoring records or purchases
from another profile requires a separately reviewed ownership and reassignment process;
name equality alone is insufficient, and no automatic merge is provided here.

Fresh sign-ins also leave older OAuth credential rows intact. They do not complete the
separate token-encryption backfill or its zero-plaintext-row gates; those remain an
independently reviewed operation.

### Rollout and validation

Apply migration `0089` before deploying the UUID-only callback, then deploy the frontend.
The migration removes account-name uniqueness while preserving provider-UUID uniqueness
and retires client-side profile creation. It does not delete data or grant new client
privileges. Confirm in staging that:

- A legacy profile and a new verified profile can share a display name while keeping distinct IDs.
- The new profile cannot see the older profile's private groups, snapshots or billing.
- Repeat sign-ins for the same UUID reuse the same profile.
- Verified name changes work even when another profile stores that name.
- A conflicting trusted Auth subject fails closed, and concurrent callbacks cannot delete
  the winning profile or choose a different UUID by its display name.
- New-profile notices are shown only to the matching server-verified session, and ordinary
  existing-account logins retain their normal redirect.

Once duplicate names exist, rolling back to the old name-gated callback can block sign-in.
Use a UUID-aware rollback or roll forward. Do not delete profiles to recreate the former
name constraint. Hosted deployment remains a separately confirmed operations task.

## Current retention

Raw stash snapshot retention already operates across an account's groups:

- Community keeps five completed raw snapshots.
- Supporter keeps fifteen completed raw snapshots while its cached entitlement is active.
- Removing a raw snapshot cascades its tabs and items.
- Durable summary history survives raw snapshot retention; it currently has no league-end expiry.

These are snapshot-count limits, not a scheduled cleanup of ended leagues. See
[`snapshot-scaling-plan.md`](snapshot-scaling-plan.md) for the existing storage and summary design.

## League-aware cleanup: a separate change

A new league is a useful point to start a new workspace, but it is not an account deletion
or entitlement reset event. A future cleanup policy should:

1. Scope candidates explicitly by game, league and data type. Confirm a temporary league
   has ended; permanent leagues and active workspaces need their own rules.
2. Define and review a grace period for raw character/snapshot data and a separate policy
   for compact summaries. Choose those periods before scheduling deletion.
3. Stop obsolete synchronization, queued analysis and snapshot schedules so cleanup does
   not immediately recreate the same records.
4. Preview bounded candidate counts, test cascades and cross-tenant isolation, and record
   sanitized deletion counts. Recheck scope before each batch.
5. Keep account identity, memberships, billing records and reusable strategy content outside
   automatic league cleanup unless a separate reviewed policy explicitly covers them.

This sign-in change introduces no league purge, scheduled deletion, new retention period,
account merge or destructive backfill.
