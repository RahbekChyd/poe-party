# Security Policy

## Reporting A Vulnerability

Please report suspected vulnerabilities privately by emailing `support@poe-party.com`.

Include:

- affected route, endpoint, function, or table;
- reproduction steps;
- expected impact;
- any relevant logs or screenshots with secrets removed.

Do not publicly disclose vulnerabilities until they have been reviewed and fixed or mitigated.

## Supported Surface

The public repository includes the app, Supabase schema/functions, optimizer worker, analyser logic, and local development documentation. The hosted production service also depends on private infrastructure configuration, secrets, monitoring, and operator runbooks that are intentionally not published.

## Security Expectations

- Never commit production secrets, local secrets, OAuth tokens, Stripe secrets, service-role keys, worker tokens, or user data exports.
- Treat stash snapshots, PoE OAuth tokens, billing state, and private group data as sensitive.
- Keep Supabase Row Level Security as the primary enforcement layer for user-facing data access.
- Keep hosted-service mutations behind explicit operator confirmation.
- Do not claim an external audit unless one has actually been completed.
