# Color accessibility (WCAG 2.2 AA)

Frontend-only pass for users with color-vision deficiencies. No backend, schema, API route, Gemini, or business-logic changes.

## What changed

| File | Change |
|---|---|
| `src/app/globals.css` | New tokens: `--teal-strong`, `--control-border`, `--chart-1/2`, `--chart-hatch`. Optional high-contrast theme (`data-theme="contrast"`, or OS "more contrast" unless the user chose default). Only token values change. |
| `src/config/theme.ts` (new) | Theme storage key and a tiny pre-paint script so a saved theme never flashes. |
| `src/components/theme-toggle.tsx` (new) | "High-contrast colors" switch in the sidebar (`role="switch"`, On/Off text). Remembered per browser. |
| `src/app/layout.tsx` | Inlines the pre-paint script. |
| `src/components/nav-links.tsx` | Adds the toggle; unread badge is plum on rose tint with a rose border (was plum on rose, 3.75:1). |
| `src/components/dashboard/charts.tsx` | Bars use theme tokens; "Received" is striped and "Committed" solid, named in the legend. Committed bar teal darkened (2.67:1 → 4.13:1). |
| `src/components/ui.tsx` | Fit score ring uses `--teal-strong` (3:1+ against its track). |
| `src/components/funders/funder-drawer.tsx` | Fit component bars use `teal-strong` (2.0:1 → 3.7:1). |
| `src/components/funders/filters.tsx` | Field borders 1.3:1 → 4.0:1; active view also underlined (not just tinted). |
| `src/components/pipeline/pipeline-card.tsx`, `settings/settings-form.tsx`, `funders/outreach-panel.tsx` | Field borders 1.3:1 → 4.0:1. Awarded card edge uses `teal-strong`. |
| `src/components/settings/settings-actions.tsx` | "Refresh now": white on teal (2.23:1) → plum on teal (6.05:1). |
| `src/app/notifications/page.tsx` | Unread items show a visible "New" label (was a teal edge plus screen-reader-only text). |

## Already good (kept)

- Plum and muted text pass AA on every background (6.0–13.5:1).
- Every pill/badge carries a text label (fit band, "Open now", "Due …", "Past funder", funder type, stage names).
- Fit scores are numbers with "Fit score N out of 100"; fit components show percentages.
- Charts have a "Show as table" view.
- Global `:focus-visible` ring (plum, 3px).

## Visual differences

Default theme: slightly darker teal on bars, score rings and the unread edge; darker plum-grey edges on form fields; the "Received" bars are striped; the unread nav badge is a light rose chip; "New" label on unread notifications. Brand plum/teal/rose otherwise unchanged.

High-contrast theme: darker muted text (10:1), visible card borders, darker teal (`#00666b`) and rose (`#a8506a`) for graphics.

## How it was tested

- Contrast ratios computed for every color pair in use (WCAG relative luminance).
- Chrome DevTools vision-deficiency emulation (protanopia, deuteranopia, tritanopia, achromatopsia) on Funders, the funder drawer, Dashboard, Pipeline, Notifications. Under protanopia the two chart series are near-identical in color; the solid/striped texture still separates them.
- axe-core 4.14 (WCAG 2.0/2.1/2.2 A and AA rules) on all six pages plus the open drawer, in both themes: **0 color-contrast violations.**
- Keyboard: Tab order follows the page, every stop shows a focus ring, the drawer takes focus and closes on Escape.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.

## Unresolved (not color-related, pre-existing)

1. **Funder row buttons** (`action-buttons.tsx`): visible text isn't part of the accessible name (WCAG 2.5.3 Label in Name), e.g. visible "Add to pipeline" vs. name "Add Maxar Foundation to pipeline". Fix: name like "Add to pipeline: Maxar Foundation".
2. **Pipeline cards** (`pipeline-board.tsx`): the draggable card wrapper (`role="button"`) contains buttons and selects (axe `nested-interactive`). Needs a structural change to the drag handle.
3. Stage colors in `globals.css` (`.stage-*`) are hard-coded hex; they're decorative (stage names are text) so the high-contrast theme doesn't recolor them.
4. Not tested with real screen readers or real users with color-vision deficiencies.
