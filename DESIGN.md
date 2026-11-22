# PoE Party design

## Overview

The entry pages pair original seasonal art with editorial typography. Inside the workspace, a full-width top bar and grouped sidebar frame the open content canvas. Dense screens keep their focus on data, controls, and the next action.

## Colors

The dark theme uses soot-dark canvas `#11100E`, warm stone panels `#211B16`, bone text `#EEE5D4`, and worn brass `#D2B484`. Covens of Umbra uses icy blue `#9ACCF1` for actions, links, focus, and selection. Structural dividers stay brass-toned. Control edges use a more visible tone. Wealth charts use verdigris, and status colors remain shared across presets. The semantic roles live in `src/index.css`.

## Typography

Use Cormorant Garamond at weight 600 for display headings and prominent workspace titles. Set data, labels, and controls in the system sans-serif. Use tabular numerals for comparable values. The self-hosted display font is distributed under the [SIL Open Font License](src/assets/fonts/cormorant-garamond-OFL.txt).

## Layout

The landing page pairs an environmental image with a short product headline, two actions, and a sample result. The image sits beside the headline and above it on phones. Sign-in crops into the same scene and uses an opaque panel for the connection action and access details.

At 1024 CSS pixels, a full-width top bar anchors the brand and workspace switcher at left and currency, live status, and account controls at right. A 216 px sidebar below it groups workspace and discovery links. The current destination uses a tinted background, a complete border, and `aria-current`. Public routes group the sample destinations above Explore links. Below 1024 px, the dashboard uses a five-group bottom dock with safe-area spacing. The sample keeps four workspace links and an Explore menu.

The page canvas extends to the content gutters. Shared page headings sit above opaque controls and reading surfaces. Today places the active strategy and latest result with its action in one compact summary. The two sections stack within that surface on phones. Wealth history and metrics sit together where space allows. Economy places stash value, pricing coverage, and snapshot controls together, followed by full-width history and breakdown. Analysis places current progress above recommendations.

## Components

The HTML declares dark on every route. Register new seasonal accents in `src/lib/league-theme.ts` and `src/index.css`. The featured preset drives home and sign-in. The sample and each active workspace resolve a preset from their game and league. Public tools use the base palette. Theme scope is applied to the document so portal-based controls inherit it.

Supply a desktop illustration, a close crop for phones and sign-in, and a narrow crop for the top bar at 1280 px and above. Keep each crop at or below 300, 150, and 50 KiB respectively. The existing Covens illustration is an original ImageGen artwork of a moonlit stone circle in a dark woodland. Text and controls sit on opaque surfaces around the artwork.
