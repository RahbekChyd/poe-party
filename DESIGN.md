# PoE Party design

## Overview

The entry pages establish the featured league with original art and editorial typography. Inside the workspace, a horizontal route marks the current destination and carries the seasonal artwork at its edge. Dense screens keep their focus on data, controls, and the next action.

## Colors

Covens of Umbra uses ink-blue, pale stone, and blue-white light. The base palette uses petrol and verdigris. Both modes use the semantic palette in `src/index.css`. Keep amber for caution, use the shared chart and status colors, and define separate colors for structural dividers and required control edges.

## Typography

Use Cormorant Garamond at weight 600 for display headings and prominent workspace titles. Set data, labels, and controls in the system sans-serif. Use tabular numerals for comparable values. The self-hosted display font is distributed under the [SIL Open Font License](src/assets/fonts/cormorant-garamond-OFL.txt).

## Layout

The landing page pairs a wide environmental image with a short product headline, two actions, and a sample result. Sign-in crops into the same scene and uses an opaque panel for the connection action and access details.

At 1024 CSS pixels, the compact workspace bar sits above a route line with labeled stops. The current marker branches down toward the page. Below that width, the dashboard uses a five-group bottom dock with safe-area spacing. The sample keeps its four workspace stops and an Explore menu. The selection branch changes immediately when reduced motion is requested.

The page canvas extends to the viewport gutters. Shared page headings sit above opaque controls and reading surfaces. Today connects the active strategy, its latest linked snapshot, and the next action in a stepped sequence that stacks vertically on narrow screens. Wealth history and metrics sit together where space allows. Economy places stash value, pricing coverage, and snapshot controls together, followed by full-width history and breakdown. Analysis places current progress above recommendations.

## Components

Register new seasons in `src/lib/league-theme.ts` and add light and dark palette values in `src/index.css`. The featured preset drives home and sign-in. The sample and each active workspace resolve their own game and league. Theme scope is applied to the document so portal-based controls inherit it, while the saved light or dark preference remains independent.

Supply a desktop illustration, a close crop for phones and sign-in, and a narrow crop for the desktop route line. Keep each crop at or below 300, 150, and 50 KiB respectively. The Covens plate was generated with ImageGen as an original moonlit stone circle in a dark woodland, with a single blue-white light on the right and deep shadow on the left for live text.
