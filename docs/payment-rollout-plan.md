# Payment Rollout Plan

Last updated: June 19, 2026

## Current architecture

- Stripe handles Checkout, subscriptions, invoices, and the customer portal.
- Supabase Edge Functions create checkout sessions, create portal sessions, and process Stripe webhooks.
- Supabase stores billing state for app gates and support workflows.
- `users.subscription_tier` and `users.subscription_expires_at` are cached read-model fields derived from billing tables and manual grants.
- Normal authenticated clients must not write `subscription_tier` or `subscription_expires_at` directly.
- Operators must not edit `users.subscription_tier` or `users.subscription_expires_at` directly; use trusted billing state and `recompute_user_subscription_tier(user_id)`.

## Access sources

- Paid Supporter: user self-serve Stripe Checkout through `create-checkout-session`, backed by a normal Stripe subscription and webhook sync. Internally this still uses `plan_key = 'pro'`.
- Comped Supporter: owner-created Stripe subscription from private operator tooling, with a direct 100%-off forever coupon supplied by `STRIPE_COMP_COUPON_ID`. Internally this still uses `plan_key = 'pro'`.
- Manual grant: emergency/internal-only `billing_manual_grants` rows for support repair or short-lived internal access when Stripe is not the source of truth.

Giveaways should use comped Supporter access. Do not create Stripe Promotion Codes for giveaways, and keep Stripe Customer Portal promotion-code redemption disabled so users cannot self-apply giveaway discounts.

## Implemented components

- Database billing state:
  - `billing_customers`
  - `billing_subscriptions`
  - `billing_events`
  - `billing_manual_grants`
- Access recompute:
  - `recompute_user_subscription_tier(user_id)` grants internal `pro`/Supporter only for active manual grants or Stripe subscriptions in `active` or `trialing`.
  - `get_snapshot_limit(user_id)` treats expired cached Supporter access as Community.
- Edge Functions:
  - `create-checkout-session`
  - `create-billing-portal-session`
  - `stripe-webhook`
- Private operator scripts:
  - Comped Supporter and billing-repair scripts live outside the public repo.
- Frontend:
  - Support PoE Party page starts Stripe Checkout for Community users.
  - Supporters open the Stripe billing portal.
  - Success and cancellation redirects are shown on `/dashboard/support`.
  - `/dashboard/subscription` remains a compatibility redirect to `/dashboard/support`.

## Public plan facts

- Supporter billing is live and public for signed-in users in production.
- Community: $0, 5 retained raw stash snapshots, manual stash snapshots, core workspace/public features, and 3 newly queued authenticated upgrade-analysis runs per UTC day.
- Supporter: $5/month, 15 retained raw stash snapshots, Mix mode interval snapshot scheduling, and no app-enforced daily authenticated upgrade-analysis queue cap.
- Worker capacity, abuse controls, failed payments, and non-Supporter Stripe statuses can still limit access operationally.
- Internal billing keys stay `subscription_tier = 'pro'`, `plan_key = 'pro'`, and `STRIPE_PRO_PRICE_ID`.

## Stripe setup

Start in a Stripe sandbox before live mode. Keep sandbox products, prices, API keys, webhook
secrets, customers, and test subscriptions separate from live mode. Use sandbox test cards and
event simulation to validate the integration without real money movement.

Create in the matching Stripe test/live environment:

- Product: customer-facing `Supporter` if creating a new Stripe product. Existing Stripe products may still be named `Pro` internally; do not churn live product or price ids only for naming. Configure a Stripe Tax product tax code appropriate for a web app/SaaS
  subscription. If unsure, confirm the exact code with a Danish VAT/accounting advisor before live
  collection.
- Recurring price: $5/month, stored as `STRIPE_PRO_PRICE_ID`. Set the price tax behavior before
  first use, or configure the default tax behavior in Stripe Tax settings. Use inclusive pricing for
  VAT/GST-style consumer pricing unless an accountant advises otherwise.
- Stripe Tax registrations for the jurisdictions where PoE Party is registered to collect tax.
  Stripe shows zero tax in locations where no live registration is configured.
- Customer portal configuration
- Webhook endpoint:
  - URL: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
  - Events:
    - `checkout.session.completed`
    - `customer.subscription.created`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`
    - `invoice.paid`
    - `invoice.payment_failed`

Required Supabase secrets:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_ID`
- `BILLING_ALLOWED_RETURN_ORIGINS`
- `BILLING_RETURN_ORIGIN`

Hosted Supabase billing functions require `BILLING_ALLOWED_RETURN_ORIGINS`. Local Supabase falls
back to `http://localhost:5173`, but staging and production should fail checkout/portal session
creation instead of redirecting to an unintended origin when this secret is missing.

Optional temporary operator account gate:

- Leave `BILLING_ALLOWED_POE_ACCOUNTS` and `VITE_BILLING_ALLOWED_POE_ACCOUNTS` unset for normal public production billing.
- Set `BILLING_ALLOWED_POE_ACCOUNTS` in hosted Supabase only when checkout creation needs a temporary allowlist safety gate.
- Set `VITE_BILLING_ALLOWED_POE_ACCOUNTS` in Vercel only when the frontend should hide billing UI from non-allowlisted Community accounts during the same temporary gate.
- Keep both allowlist variables aligned when the gate is enabled; remove both when returning to normal public checkout.

Optional Supabase secrets:

- `STRIPE_ALLOW_PROMOTION_CODES`
- `STRIPE_AUTOMATIC_TAX_ENABLED` (`true` sends `automatic_tax[enabled]=true` when creating Checkout
  sessions)
- `STRIPE_BILLING_PORTAL_CONFIGURATION_ID`

Private comped Supporter operator env:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRO_PRICE_ID`
- `STRIPE_COMP_COUPON_ID`

`STRIPE_COMP_COUPON_ID` is not a browser or user-redemption setting. Create the coupon in the
matching Stripe sandbox/live mode, configure it as 100% off with `duration=forever`, and apply it
directly with the private CLI.

Stripe MCP can speed up sandbox product, price, coupon, customer, and subscription checks if it is connected. It is not required by the app and should be used with OAuth or a restricted sandbox API key plus human confirmation for write actions.

## Sandbox rollout

- Create or open a dedicated Stripe sandbox from the Dashboard account picker.
- Configure a sandbox Supporter product, recurring price, customer portal, and webhook endpoint.
- Set sandbox secrets on the local/staging Supabase project only.
- Use test cards and Stripe event simulation for successful checkout, failed payment, cancellation,
  duplicate webhook delivery, and subscription updates.
- Promote to live mode only after sandbox checkout, portal, webhook processing, manual grants, and
  direct-tier-write blocking are verified.

## Support workflow

Comped Stripe grants:

- Use private operator tooling from an owner-controlled shell/session with sandbox or live secrets for the intended environment.
- Dry-run first to validate the user, Stripe internal `pro`/Supporter price, 100% forever coupon, existing customer, and duplicate-subscription guard.
- Confirmed private tooling creates or reuses the Stripe Customer, creates a real internal `pro`/Supporter subscription with the direct coupon, mirrors `billing_customers` and `billing_subscriptions`, and calls `recompute_user_subscription_tier`.
- Revoke by canceling the comped subscription in Stripe Dashboard; webhook sync then removes Supporter access when Stripe reports a non-Supporter status.

Manual grants are separate from Stripe and should be emergency/internal-only:

- Insert a row into `billing_manual_grants` only for emergency repair, internal testing, or
  temporary access that intentionally bypasses Stripe.
- Use `plan_key = 'pro'`.
- Leave `ends_at` null for an indefinite grant, or set a future timestamp.
- Set `revoked_at = now()` to revoke.
- Triggers recompute the cached user tier after insert, update, or delete.

Billing repair:

- Check `billing_events` for failed webhook processing.
- Re-deliver the event from Stripe when possible.
- If needed, inspect the matching Stripe subscription and update `billing_subscriptions` with service-role access, then call `recompute_user_subscription_tier(user_id)`.

## Security rules

- Never expose Stripe secret keys or price ids through frontend `VITE_` variables.
- Never trust the client to request a tier change.
- Never grant Supporter access from a post-checkout redirect alone.
- Verify every Stripe webhook with the raw body and webhook signing secret.
- Keep billing tables service-role-only.
- Keep giveaway discounts private: direct coupons on owner-created subscriptions only, no customer-facing Promotion Codes.
- Keep Stripe Customer Portal promotion-code redemption disabled.
- Treat `past_due`, `unpaid`, `canceled`, `incomplete`, `incomplete_expired`, and `paused` as non-Supporter.

## Test checklist

- Successful Stripe Checkout grants Supporter access after webhook sync.
- Canceled checkout leaves the user on Community.
- Any eligible Community user can use normal paid Checkout when no temporary account gate is enabled.
- Billing portal opens for users with Stripe customers.
- Private comped Supporter dry-run resolves the sandbox user and prints planned Stripe/Supabase actions without mutation.
- Confirmed sandbox comp grant creates an active Stripe subscription, $0 invoice, `billing_customers` row, `billing_subscriptions` row, and `users.subscription_tier = 'pro'`.
- Canceling the sandbox comp subscription in Stripe and processing the webhook returns the user to Community.
- Manual grant grants internal `pro`/Supporter access and manual revocation removes it.
- Duplicate webhook delivery is idempotent.
- Out-of-order subscription webhooks still sync current Stripe state.
- Failed payment removes Supporter access unless Stripe still reports `active` or `trialing`.
- Direct client updates to `subscription_tier` and `subscription_expires_at` fail.
