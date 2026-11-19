---
name: poe-party-frontend-patterns
description: Frontend implementation guidance for PoE Party. Use when changing React components, TanStack Router routes, TanStack Query hooks, HeroUI controls, Tailwind styling, preview/dashboard pages, SEO metadata, prerender behavior, or route generation in the poe-group-tool repo.
---

# PoE Party Frontend Patterns

Use existing nearby patterns first. This app is a product workspace, so favor dense, scannable, task-focused UI over landing-page ornamentation unless the route is explicitly public marketing/trust content.

## Implementation Rules

- Keep routes in `src/routes/` and user-facing screens in `src/components/` aligned with existing feature folders.
- Put Supabase read/write logic in hooks or shared libs where the repo already does so; keep components focused on state composition and rendering.
- Use TanStack Query query keys from `src/lib/queryKeys.ts` or established adjacent hooks when possible.
- Use HeroUI components and lucide icons consistently with nearby pages.
- Preserve dashboard privacy boundaries: authenticated dashboard routes stay client-rendered; public preview/legal routes can be SEO-oriented.
- Run route generation if route files change and generated route output is stale.
- Keep PoE Party brand primary at `#f5a524`. In HeroUI v3 this belongs in `src/index.css` as the `--accent` token override, not as one-off button styling; without it, HeroUI's default accent makes primary buttons blue.

## HeroUI Trigger Styling

- HeroUI v3 `Tooltip.Trigger` renders an outer `role="button"` wrapper and can fail around complex nested card/link structures. For card-level or nested-control hover help, prefer the local `HoverTooltip` from `src/components/ui/hover-tooltip.tsx`; keep trigger layout explicit (`block` for cards, `inline-flex` for icons/chips).
- Do not force `inline-flex` on full equipment/item-card tooltip wrappers; it can shrink grid cells and distort the Equipped gear layout. Use block/default flow for full cards and reserve `inline-flex` for compact inline triggers.
- Analysis recommendation cards should not contain nested hover tooltips inside the card. The card already has an item-style hover popover; put chip/price/trade explanations into that popover's notes section instead of adding child hover overlays.
- Selection-style custom dropdown triggers should visually match HeroUI `Select`, not pill/action buttons. Use the HeroUI select class family directly: `select__trigger` on the trigger, `select__value` for the flexing/truncated label, and `select__indicator` on the caret. This applies to controls such as group switchers, snapshot/tab/member selectors, and character selectors when they behave like choosing a value.
- Do not style selection dropdown triggers with `button button--*`; those classes produce rounded action-button surfaces and misalign carets compared with default HeroUI selects.
- Icon-only dropdown triggers, such as the top-right account/avatar menu, should not show a caret.
- Loading spinners inside selection-style dropdown triggers belong inside the value slot, not next to button icons, so they are not affected by button SVG styling. Keep spinner and label in a stable inline-flex row inside `select__value`.
- Normal selection menus should show `Dropdown.ItemIndicator` for active items. Snapshot tab-filter multi-selects use custom right-aligned check pills so selected tabs are visible without shifting the label column.

## HeroUI Modal Sizing

- Controlled HeroUI v3 modals should use `Modal.Backdrop` with `isOpen/onOpenChange`, then `Modal.Container`, `Modal.Dialog`, and `Modal.Heading`.
- For custom wide dialogs, put restored panel width/max-width classes on `Modal.Dialog`, not `Modal.Container`. The v3 container has its own desktop padding and fit-content behavior, so container sizing can make the visible dialog narrower than intended.
- Long dialog bodies should use `min-h-0 overflow-y-auto` inside a capped `Modal.Dialog` so headers/footers remain visible.

## Data and State

- Scope game-sensitive and league-sensitive queries by both `game` and `league` when relevant.
- Invalidate the same families of queries as adjacent mutations.
- Keep Zustand for lightweight persisted UI/workspace preferences, not server-owned data.
- When React Hook Form fields render through shared HeroUI wrappers such as `FieldInput`, use `Controller` with explicit `value` / `onValueChange` for fields that hydrate from `reset()`. Plain `register(...)` can leave HeroUI inputs blank after async data loads.
- PoE1 Thread planning uses the ten official usable Thread names and poe.ninja exchange overview (`type=Thread`) for exact-league market estimates. Never restore removed Scarabs through a Standard fallback. Retain saved Scarabs only as a legacy reference. Missing prices remain unknown. Relative `/gen/image/...` URLs are served by `https://web.poecdn.com`.

## SEO and Public Pages

For public preview/legal changes, read `references/frontend-seo.md` and repo `docs/public-prerender-seo-plan.md`. Keep `/auth/*` and `/dashboard/*` out of public prerender/SEO output.

Public routes with real anonymous functionality, such as Analysis, Directory, Services, and Strategies, should feel usable-first rather than gated. Avoid intro-level login/unlock cards, repeated "guest" or "signed-in features" copy, and primary connect-account CTAs on those pages. Keep sign-in as a quiet secondary path, and reserve stronger gated/private-workspace framing for sample or locked panels that truly require account data.

## Verification

Run the smallest useful checks, then broaden when shared behavior changed:

```powershell
pnpm type-check
pnpm lint
pnpm build
```

For visual UI work, start the dev server and verify in a browser when feasible.
