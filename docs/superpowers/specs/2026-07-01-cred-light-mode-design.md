# CRED theme — restore light mode + toggle

Date: 2026-07-01

## Goal

The prior CRED-dark reskin (merged to `main` via PR #48) deliberately went dark-only and removed
the light/dark toggle. The user has since asked for light mode back, styled with the same CRED
design language (not the old pre-reskin "Editorial Finance" light theme). This spec restores the
toggle mechanism and designs a light-mode counterpart palette that holds the same aesthetic:
near-white canvas, Fraunces display serif, pill buttons, lime accent — adapted for contrast on a
light background instead of black.

## Decisions locked (from brainstorming)

1. **Default theme on first load is dark**, not light — matches CRED's brand identity; the
   toggle lets users switch to light after that, and their choice persists (localStorage, as
   before).
2. **Accent contrast fix via a new `--accent-ink` token.** `--accent` stays bright lime
   (`~70 95% 65%`, `#E2FE53` family) in both modes for solid-fill uses (buttons, chips, badges,
   the logo mark) — black text/icons sit on top of the fill regardless of page background, so
   fills don't need to change per mode. `--accent-ink` — what `.text-accent-ink` and `--ring`
   resolve to — is the mode-dependent one: in dark mode it equals the bright lime (already
   proven to pop on near-black); in light mode it becomes a darker olive-green (`~70 75% 28%`)
   that passes WCAG text contrast against white. The same "bright fill / darker text" split
   applies to `--negative`/`--destructive` (darker, more saturated red in light mode) and
   `--warning` (darker amber in light mode) — the dark-mode values were tuned to read as text
   on black and would fail contrast as text on white.
3. **Light background is near-white**, not warm off-white: `--background: 0 0% 98%`,
   `--card: 0 0% 100%` (card brighter than background, mirroring dark mode's card-lifts-above-bg
   relationship), `--foreground: 0 0% 8%` (near-black text). `--primary` inverts to solid
   black-on-white pills in light mode (mirroring dark mode's white-on-black pills).
4. **Dashboard/AuthLayout hardcoded palettes get a parallel light-tuned literal array each**,
   selected at render time by reading the restored `useThemeStore((s) => s.dark)` flag — not a
   token-driven (CSS-var-in-SVG) refactor. This matches the existing code pattern (the dark
   arrays are already literal, not token-driven) and is lower-risk than introducing CSS custom
   properties inside SVG `fill`/`stroke` for the first time in this codebase.

## Non-goals

- No change to the `--chart-1..8` CSS tokens — the final review on the dark-mode work flagged
  them as already vestigial/unused (nothing in the app consumes `var(--chart-N)`); adding light
  variants for tokens nothing reads would be pure scope creep.
- No redesign of the toggle's visual placement or icon (Sun/Moon swap) — restoring it exactly as
  it existed before Task 6 deleted it, just with an updated default and updated `theme-color`
  hex values to match the new palette.
- No accessibility audit beyond the contrast reasoning above — same level of rigor as the
  dark-mode spec (verified visually during implementation, not a formal WCAG report).

## 1. Restore the toggle mechanism

- **`portfolioos/apps/web/src/stores/theme.store.ts`** (recreate — exact prior shape, two
  changes): default `dark: true` (was `false`); `applyClass`'s `meta[name="theme-color"]` values
  updated to the new palette's hex equivalents (`#0d0d0d` dark / a near-white hex for light,
  e.g. `#fafafa`) instead of the old `#0f172a`/`#022B54`.
- **`portfolioos/apps/web/src/components/layout/Header.tsx`**: restore the `Sun`/`Moon` import,
  `useThemeStore` import and hook call, and the toggle `<button>` block, in the same place it
  was removed from (between the notifications bell and the privacy toggle).
- **`portfolioos/apps/web/src/components/layout/AuthLayout.tsx`**: restore the `Sun`/`Moon`
  import, `useThemeStore` import and hook call, the toggle button block (top-right of the form
  panel), and the `cn` import (needed again once the button returns).
- **`portfolioos/apps/web/index.html`**: replace the hardcoded `class="dark"` with a real
  pre-hydration script that reads `localStorage['portfolioos.theme']` and applies `dark` unless
  the stored value explicitly says otherwise — defaulting to dark when nothing is stored yet
  (first-time visitors). `<meta name="theme-color">` reverts to a static dark-mode default
  (`#0d0d0d`) since the inline script can't easily pre-compute the light value before paint
  without flash-of-wrong-color risk; the store's `applyClass` call keeps it in sync after
  hydration on every toggle.

## 2. Light-mode CSS tokens (`globals.css`)

The single `:root` palette from the dark-mode work splits back into `:root` (light) + `.dark`
(dark, values unchanged from the merged work) — mirroring the original pre-CRED two-mode
structure, but both sides now speak the CRED design language instead of parchment/gunmetal.

| Token | Light value (approx) | Dark value (unchanged from merged work) |
|---|---|---|
| `--background` | `0 0% 98%` | `0 0% 5%` |
| `--foreground` | `0 0% 8%` | `0 0% 96%` |
| `--card` | `0 0% 100%` | `0 0% 9%` |
| `--card-foreground` | `0 0% 8%` | `0 0% 96%` |
| `--popover` / `--popover-foreground` | `0 0% 100%` / `0 0% 8%` | `0 0% 11%` / `0 0% 96%` |
| `--primary` | `0 0% 8%` (black pill) | `0 0% 96%` (white pill) |
| `--primary-foreground` | `0 0% 98%` | `0 0% 6%` |
| `--secondary` | `0 0% 94%` | `0 0% 14%` |
| `--accent` | `70 95% 65%` (same lime, fills only) | `70 95% 65%` |
| `--accent-foreground` | `0 0% 8%` | `0 0% 8%` |
| `--accent-ink` *(new token)* | `70 75% 28%` (darker olive, same hue as `--accent`, text/ring use) | `70 95% 65%` (same as `--accent`) |
| `--muted` | `0 0% 95%` | `0 0% 13%` |
| `--muted-foreground` | `0 0% 40%` | `0 0% 62%` |
| `--destructive` / `--negative` | `4 75% 45%` (darker red) | `4 85% 62%` |
| `--positive` | `100 65% 30%` (darker green, hue shifted 30° from `--accent-ink` for clear separation) | `85 75% 58%` |
| `--warning` | `35 85% 38%` (darker amber) | `40 90% 60%` |
| `--border` / `--input` | `0 0% 88%` (plain HSL, no embedded alpha) | `0 0% 18%` |
| `--ring` | `70 75% 28%` (= `--accent-ink`) | `70 95% 65%` (= `--accent`) |
| `--sidebar` | `0 0% 97%` | `0 0% 6%` |
| `--sidebar-foreground` | `0 0% 10%` | `0 0% 90%` |
| `--sidebar-accent` | `0 0% 93%` | `0 0% 12%` |
| `--sidebar-accent-foreground` | `70 75% 28%` (= `--accent-ink`) | `70 95% 65%` |
| `--sidebar-border` | `0 0% 88%` | `0 0% 14%` |
| `--shadow-color` | `0 0% 10%` (soft dark for natural shadows on white) | `0 0% 0%` |
| `--radius` | `1rem` (unchanged, mode-independent) | `1rem` |

`.text-accent-ink` utility (currently `color: hsl(var(--accent))`) changes to
`color: hsl(var(--accent-ink))` so it resolves per-mode correctly — every existing call site
(`PageHeader` eyebrow, `MetricCard` icon, etc.) picks this up with no code change on their end.

## 3. Dashboard + AuthLayout light-mode palettes

`DashboardPage.tsx` gains light-tuned counterparts, selected by `useThemeStore((s) => s.dark)`:

- `PIE_COLORS_LIGHT` (12 entries) — same hue family as the dark set (lime, coral, teal, violet,
  amber, blue, rose, green, orange, purple, cyan, ivory-equivalent), each darkened/adjusted for
  visibility against white instead of near-black.
- `ASSET_CLASS_COLORS_LIGHT` — same key set as `ASSET_CLASS_COLORS`, values drawn from
  `PIE_COLORS_LIGHT`'s palette so the two stay coherent, matching how the dark set was built.
- `urgencyColor`/`urgencyBg` gain a light-mode branch (darker text colors, lighter tinted
  backgrounds) instead of the current dark-only arbitrary-value classes.
- `assetClassColor()`'s fallback gray gets a light-mode-safe counterpart.

`AuthLayout.tsx`'s inline SVG mock pie (donut strokes + legend swatches) gains a second set of
four colors for light mode, selected the same way.

## 4. Verification plan

Same shape as the dark-mode work: manual browser check (dev server, Playwright screenshots) of
both modes on `/login` (toggle button visible, both palettes render correctly, contrast holds
for `--accent-ink`/`--negative`/`--positive` as text) and, if a backend is reachable this time,
`/dashboard` in both modes (pie/chart colors, urgency alerts, holdings table). No automated test
suite covers visual theming, consistent with the prior spec.
