# Security Checklist

Last updated: March 10, 2026

This checklist is specific to the current PoE Party stack: Vite frontend, Supabase auth/database/functions, Path of Exile OAuth integration, optional session-cookie flow, and poe.ninja pricing ingestion.

## 1. Authentication and Token Handling

- Confirm the production login path uses PoE OAuth only and does not expose client secrets in the browser.
- Review every place PoE access tokens and refresh tokens are stored.
- Verify token storage is server-side only where possible and not leaked through client-readable tables.
- Confirm tokens are not printed in frontend logs, edge function logs, Vercel logs, or error payloads.
- Check token refresh flows for replay, missing expiry handling, and stale-token cleanup.
- Document exactly which OAuth scopes are requested and why each one is still needed.

## 2. Cookie-Based Auth Fallback

- Verify `VITE_ENABLE_COOKIE_AUTH` is disabled in production unless there is an explicit decision to keep it.
- Confirm the session-cookie flow is clearly labeled as non-primary and not presented to normal production users.
- Review whether `POESESSID` or related cookie values can ever be persisted, logged, or returned in an error.
- Validate the derived internal auth-account pattern cannot be abused for account takeover or unintended account linking.
- Confirm failed cookie-auth attempts do not leak whether a PoE account exists.

## 3. Supabase Auth and RLS

- Audit Row Level Security on every user-facing table, view, and RPC used by the app.
- Confirm group membership checks are enforced in the database, not only in the client.
- Verify viewers cannot mutate strategies, gear suggestions, assignments, or group settings through direct API calls.
- Confirm users cannot read snapshot rows, token rows, or derived history for groups they do not belong to.
- Review service-role usage in edge functions and ensure user identity is revalidated before privileged reads or writes.
- Re-check policies after every migration that adds a table, view, or function.

## 4. Edge Functions

- Review all functions under `supabase/functions/` for auth checks, parameter validation, and least-privilege access.
- Confirm public functions do not allow privilege escalation or unauthenticated sensitive actions.
- Validate `cookie-auth`, `poe-oauth-callback`, `poe-refresh-token`, `poe-snapshot`, and sync functions for input validation and authorization boundaries.
- Ensure CORS settings only allow intended origins and methods.
- Confirm function errors are sanitized before being returned to the client.

## 5. Snapshot and Stash Data

- Inventory exactly what raw stash data is stored per snapshot and why it is needed.
- Confirm item exclusion behavior is enforced consistently in pricing, totals, and history.
- Verify retention deletes the intended raw snapshot records and leaves only the intended summary data.
- Review whether any personal or sensitive stash metadata is stored beyond the product need.
- Confirm snapshot detail routes enforce membership and ownership boundaries.

## 6. Frontend and Client Safety

- Check that no secrets are referenced through `VITE_` env vars unless they are intentionally public.
- Review all login, callback, and auth-adjacent screens for misleading copy or overbroad trust claims.
- Add or verify UI copy stating that PoE passwords should never be entered into PoE Party.
- Confirm external links use safe `target="_blank"` patterns with `rel="noopener noreferrer"`.
- Ensure error toasts and network error handlers do not expose internal stack traces or secret values.

## 7. Abuse and Operational Controls

- Add rate limiting or practical throttling for login-related public endpoints if missing.
- Review invite code generation and joining flow for brute-force resistance and predictable identifiers.
- Confirm there is a clear path to revoke access, delete account data, and respond to abuse reports.
- Confirm billing tables remain service-role-only and clients cannot write subscription tier fields.
- Define who receives security reports and how quickly critical issues are triaged.
- Keep production, staging, and local credentials fully separated.

## 8. Logging, Monitoring, and Backups

- Review Supabase and Vercel logging for accidental capture of tokens, cookies, stash payloads, or personal data.
- Confirm production error monitoring keeps enough detail to debug issues without storing secrets.
- Verify backups and exports are protected with the same sensitivity as the live database.
- Document the incident response steps for token leakage, RLS failure, or accidental public exposure.

## 9. Release Gates

- Before each production deploy, review changed migrations, changed edge functions, and changed auth flows.
- Run a manual permission test with at least two accounts in different groups.
- Test logout, token refresh, group switching, snapshotting, and access revocation flows after deploy.
- Update the public Security & Trust page when the app’s data handling or auth model changes.
- Do not claim the app is audited unless an independent external audit has actually been completed.
