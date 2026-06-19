# Frontend SEO and Prerender Notes

Source of truth: repo `docs/public-prerender-seo-plan.md`.

First-pass public prerender scope:

- `/preview`
- `/preview/economy`
- `/preview/analysis`
- `/preview/gear`
- `/preview/members`
- `/preview/search`
- `/preview/services`
- `/preview/strategies`
- `/legal/terms`
- `/legal/privacy`
- `/legal/cookies`
- `/legal/security`
- `/legal/faq`
- `/tools/poe-wealth-tracker`
- `/tools/poe-stash-tracker`
- `/tools/poe-group-economy-tracker`
- `/tools/poe-farming-strategy-tracker`
- `/tools/poe-service-listings`
- `/tools/poe-gear-upgrade-planner`
- `/poe-strategies/harvest-farming`
- `/poe-strategies/essence-farming`
- `/poe-strategies/strongbox-farming`
- `/poe-strategies/boss-rush`
- `/poe-strategies/ultimatum-farming`

Use `src/lib/public-seo-pages.json` as the route manifest for public SEO
metadata, sitemap/llms generation, and prerender route selection. Run
`pnpm build:prerender` to generate SEO files, build, prerender public routes,
and validate title, description, and canonical tags.

Keep SPA-only/noindex:

- `/auth/*`
- `/dashboard/*`
- API/proxy routes

For SEO work, verify route-specific title, description, canonical URL, meaningful visible text, footer links, and JSON-LD where relevant. Do not prerender private dashboard data.
