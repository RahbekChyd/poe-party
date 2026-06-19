# Open-Source Policy

PoE Party is open source under Apache-2.0. The public source should be useful for understanding, self-hosting, auditing, and contributing to the product.

## Open By Default

The public repo includes:

- the frontend app and public pages;
- Supabase migrations, RLS policies, RPCs, and Edge Functions;
- the optimizer worker, analyser contracts, scoring, and recommendation explanation logic;
- local development scripts, validation workflows, and self-hosting docs.

## Private Operations

The public repo must not include:

- production secrets or environment files;
- production deploy automation for hosted PoE Party services;
- comp-grant, incident-response, moderation, or billing-repair scripts;
- abuse-sensitive heuristics or live infrastructure runbooks;
- user data exports, logs, or production database dumps.

## Supporter Model

Supporter is optional hosted support funding. It may provide higher retained snapshot history, interval or Mix snapshot scheduling, queue capacity, and operational support. Community access should remain source-complete and practically useful.

Do not make the analyser a hidden paid-only core by default. If a future private enhancement is added, the public app must still include a working baseline analyser and documented replacement interface.

## Release Hygiene

Before making the repo public or cutting a public release:

- run a current-tree secret scan;
- run a full-history secret scan;
- remove tracked logs, temp files, and production-specific automation;
- verify README setup instructions use self-hoster-owned credentials only;
- run the normal type-check, lint, build, and whitespace checks.
