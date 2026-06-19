# Public Prerender SEO Plan

## Goal

Improve Google indexing and AI crawler comprehension by prerendering stable public pages into real HTML at build time, while keeping the authenticated PoE Party dashboard as the current client-rendered SPA.

This is a follow-up to the footer, public copy, metadata, sitemap, robots, and `llms.txt` SEO pass. It should be done as a separate branch after those changes are deployed.

## Recommended Scope

Prerender only public, stable, mostly static routes in the first pass:

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

Keep these routes as SPA-only/noindex:

- `/auth/*`
- `/dashboard/*`
- API/proxy routes

Defer these until phase two:

- `/preview/strategies/$strategyId`
- public group detail pages
- public character detail pages
- any page that needs live Supabase data in initial HTML

## Why This Shape

Full SSR would add a lot of complexity for limited upside in this application. The signed-in dashboard depends on auth, Supabase state, client interactions, and private group data, so it should stay client-rendered.

Public preview and legal pages are different. They are acquisition and trust pages, and crawlers benefit from seeing their text, metadata, canonical links, and structured data before JavaScript execution.

## Success Criteria

After `pnpm build`, the generated `dist` output should include static HTML files for the scoped routes. Examples:

- `dist/preview/index.html`
- `dist/preview/economy/index.html`
- `dist/preview/services/index.html`
- `dist/preview/strategies/index.html`
- `dist/legal/faq/index.html`

Each prerendered HTML page should contain, before JavaScript runs:

- route-specific `<title>`
- route-specific meta description
- one canonical URL
- meaningful visible page text
- footer product/legal links
- relevant JSON-LD, especially FAQ schema on `/legal/faq`

The existing SPA should still hydrate cleanly after the prerendered HTML loads.

## Implementation Approach

1. Pick a Vite-compatible prerender strategy.
   - Prefer a small static prerender script over a full framework migration.
   - Good candidates are a Puppeteer/Playwright-based post-build script or a Vite prerender plugin if it plays nicely with TanStack Router.

2. Add a route manifest for prerendered public pages.
   - Keep the list explicit.
   - Reuse the same route list for sitemap updates if practical.

3. Run normal Vite build first.
   - `pnpm build`

4. Start a local static server against `dist`.
   - Render each route in headless Chrome.
   - Wait for app idle enough that route content and head tags are present.
   - Save the resulting DOM to the matching `dist/.../index.html`.

5. Preserve static assets and Vercel rewrites.
   - Ensure direct visits to prerendered paths serve their generated HTML.
   - Keep the fallback rewrite to `/index.html` for non-prerendered SPA routes.

6. Add a command.
   - Example: `pnpm build:prerender`
   - It should run build, prerender, then validation.

## Verification Checklist

Run these before merging the prerender branch:

- `pnpm type-check`
- `pnpm lint`
- `pnpm build`
- `pnpm build:prerender`

For at least `/preview`, `/preview/services`, and `/legal/faq`, verify:

- response HTML contains route-specific text without relying on browser devtools
- exactly one canonical URL exists
- title and description match the route
- no `/dashboard` or `/auth` private content is included
- FAQ page contains FAQ JSON-LD
- app still hydrates and navigation works in the browser

Useful local checks:

```powershell
Select-String -Path dist\preview\index.html -Pattern "Path of Exile group economy"
Select-String -Path dist\preview\services\index.html -Pattern "service listings"
Select-String -Path dist\legal\faq\index.html -Pattern '"@type":"FAQPage"'
```

## Risks

- Hydration mismatches if the prerender captures state that differs from the client.
- Local storage/theme behavior can change rendered classes between prerender and runtime.
- Public pages that fetch live Supabase data may render empty states during prerender.
- Vercel rewrites may need adjustment so generated HTML files are served before the SPA fallback.
- Route metadata currently depends on client execution, so the prerender must wait until the head manager has written tags.

## Out Of Scope For First Pass

- Full SSR migration.
- Server-rendering authenticated dashboard routes.
- Build-time Supabase fetching for public detail pages.
- Dynamic strategy, character, and group detail SEO pages.
- Internationalization or alternate language pages.

## Phase Two Ideas

- Prerender public strategy detail pages for strategies marked public.
- Generate dynamic sitemap entries for public strategies, services, groups, and characters.
- Add richer structured data for public service listings and strategy pages.
- Consider static snapshots of public directory pages by league if they become important landing pages.
