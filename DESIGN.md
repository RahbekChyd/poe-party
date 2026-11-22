# PoE Party design

## Overview

The entry pages pair original seasonal art with editorial typography. Inside the workspace, a full-width top bar and grouped sidebar frame the open content canvas. Dense screens keep their focus on data, controls, and the next action.

## Colors

The moonlit workbench palette uses a blue-black canvas `#07080D`, slate work surfaces `#10161D`, raised overlays `#19222C`, and reading text `#DAD9D9`. Shared routes use weathered-silver actions. Covens of Umbra uses spectral blue `#75BBD1` for primary actions and `#83C7DC` for links and selected markers. Use `border-divider` for structure and `border-control` for recognizable interactive boundaries. Parchment is reserved for the seasonal art caption. Wealth charts use verdigris, value accents use muted amber, and feedback colors remain shared across league presets. Game rarity, modifiers, and sockets keep their established colors. The semantic roles live in `src/index.css`.

## Typography

Use Cinzel Medium for the wordmark, major headings, and prominent strategy titles. Use slate `#898EA5` for headings on opaque work surfaces and strong ink on interactive fills. Set data, labels, and controls in the system sans-serif, with tabular numerals for comparable values. Georgia is available for short flavor text and the seasonal caption. The self-hosted Cinzel face is distributed under the [SIL Open Font License](src/assets/fonts/cinzel-OFL.txt).

## Layout

The landing page pairs an environmental image with a short product headline, two actions, and a sample result. The image sits beside the headline and above it on phones. Sign-in crops into the same scene and uses an opaque panel for the connection action and access details.

At 1024 CSS pixels, a full-width top bar anchors the brand and workspace switcher at left and currency, live status, and account controls at right. A 216 px sidebar below it groups workspace and discovery links. The current destination uses a tinted background, a leading marker, and `aria-current`. Public routes group the sample destinations above Explore links. Below 1024 px, the dashboard uses a five-group bottom dock with safe-area spacing. The sample keeps four workspace links and an Explore menu.

The page canvas extends to the content gutters. Shared page headings sit above opaque controls and reading surfaces. Today places the active strategy and latest result with its action in one compact summary. The two sections stack within that surface on phones. Wealth history and metrics sit together where space allows. Economy places stash value, pricing coverage, and snapshot controls together, followed by full-width history and breakdown. Analysis places current progress above recommendations.

## Components

The HTML declares dark on every route. Register new seasonal accents in `src/lib/league-theme.ts` and `src/index.css`. The featured preset drives home and sign-in. The sample and each active workspace resolve a preset from their game and league. Public tools use the base palette. Theme scope is applied to the document so portal-based controls inherit it.

### Covens frames

Use the dark timber edge and tarnished silver hairline at the boundary between the masthead and the reading pane. On desktop, a pair of bound-twig corners sits at the ends of the upper rail. A feather-and-cord tie finishes the page heading rule on wider screens. Keep the frame behind content and within existing gutters so focus outlines and controls remain clear while scrolling. At narrow widths, keep the shallow join and let the dock retain its full touch area. Forced colors uses the underlying structural borders.

The entry scene has a narrow recessed rim and uses the same desktop corners. The existing seasonal caption uses a restrained parchment edge. Use plain semantic borders on tables, cards, filters, and overlays.

### Seasonal artwork

- `covens-workbench.webp`, `covens-workbench-close.webp`, and `covens-workbench-masthead.webp` are crops of an original ImageGen illustration. The brief called for a moonlit woodland workbench with a wicker effigy, damp blue-black wood, coarse twine, cold light on feathers, and one dim ember. The crops serve desktop home, mobile home and sign-in, and the 1280 px desktop masthead. The respective budgets are 300, 150, and 50 KiB. Text and controls sit on opaque surfaces around the art.
- `covens-talisman.webp` is an original transparent ImageGen engraving of bound twigs, feathers, and a small matte bone charm. It accompanies the no-capture state.
- `covens-frame-corner-start.webp`, `covens-frame-corner-end.webp`, and `covens-frame-divider.webp` are original transparent ImageGen cutouts. The brief called for two distinct crooked, cord-bound twigs with short downturned ends and one nearly horizontal feather lashed to split wood. Cool edge light keeps their silhouettes legible at small sizes. The three compressed assets total under 24 KiB.

The material references are from the [official Covens of Umbra page](https://www.pathofexile.com/covens) and the [official trailer](https://www.youtube.com/watch?v=XaySR0RjRPA). The seasonal assets depict independent PoE Party illustrations. Item imagery follows the app's existing game-data sources.
