# CRED-style theme reskin — Dashboard first pass

Date: 2026-07-01

## Goal

Reskin PortfolioOS to match the visual language of cred.club (bold high-contrast
serif headlines, near-black canvas, signature lime accent, pill CTAs, hairline
borders) — starting with the Dashboard page as the proving ground. Because
the app's styling runs entirely through Tailwind semantic tokens backed by CSS
custom properties, this is fundamentally a **global theme change**: editing
`globals.css`/`tailwind.config.ts` repaints every page immediately. The
Dashboard is where we validate the look (it exercises the richest set of
patterns: hero card, metric cards, charts, alerts, tables) before sweeping any
page-specific leftovers (hardcoded hex/HSL literals that don't run through
tokens) elsewhere.

## Decisions locked (from brainstorming)

1. **Dark-only.** Drop the light/dark toggle entirely. One CRED-black theme,
   everywhere, always.
2. **Signature lime accent.** Single consistent neon lime (`~#E2FE53` family)
   as the one accent color — used for `--accent`, and echoed by `--positive`.
   Negative/destructive stays a warm coral-red for contrast against black.
3. **Fraunces + Inter Tight pairing.** Fraunces (variable serif, real
   Black/Bold weights, real italics) replaces Instrument Serif as
   `font-display`, used only for headlines/section titles/pull-quotes.
   Inter Tight remains for all body text, UI chrome, and — critically — all
   monetary/tabular figures (money never goes serif; precision/legibility
   matters more there than brand flourish).
4. **Global tokens now; Dashboard is the review checkpoint.** Not a scoped
   per-route theme. Other pages inherit the new look for free via tokens;
   any hardcoded-color offenders found outside the Dashboard get **noted**,
   not fixed, in this pass.

## Non-goals

- Rebuilding every other page's layout/copy to match cred.club's marketing
  site structure (hero sections, feature grids, etc.). This is a **theme**
  reskin (color/type/shape system), not a content redesign.
- Hunting the whole repo for hardcoded hex colors. Only `DashboardPage.tsx`'s
  known offenders (`PIE_COLORS`, `ASSET_CLASS_COLORS`, `urgencyColor`/
  `urgencyBg`) are addressed here since they're in scope for the dashboard.
- Multi-currency, accessibility contrast audit beyond basic WCAG AA sanity
  (lime-on-black and white-on-black both need a real contrast check during
  implementation, not deferred, but no formal audit report).

## 1. Color tokens (`src/styles/globals.css`)

Replace the two-mode (`:root` light / `.dark`) system with **one** dark
palette living directly in `:root` (no `.dark` class needed anymore, though
leaving the class applied permanently is harmless and avoids touching every
consumer of `dark:` Tailwind variants scattered through the codebase).

Approximate HSL targets (final values tuned visually during implementation,
verified for WCAG AA text contrast against `--background`):

| Token | Value (approx) | Notes |
|---|---|---|
| `--background` | `0 0% 5%` | near-black, not pure #000 — keeps existing grain/mesh texture visible |
| `--foreground` | `0 0% 96%` | off-white |
| `--card` | `0 0% 9%` | one step up from bg — existing `.dark .shadow-elev` lift technique already assumes this ladder |
| `--card-foreground` | `0 0% 96%` | |
| `--popover` / `--popover-foreground` | `0 0% 11%` / `0 0% 96%` | |
| `--primary` | `0 0% 96%` | inverted (white primary buttons on black, like CRED's white pill CTAs) |
| `--primary-foreground` | `0 0% 6%` | |
| `--secondary` | `0 0% 14%` | |
| `--accent` | `~70 95% 65%` (`#E2FE53` family) | signature lime |
| `--accent-foreground` | `0 0% 8%` | near-black text on lime (lime is too bright for white text) |
| `--muted` | `0 0% 13%` | |
| `--muted-foreground` | `0 0% 62%` | |
| `--destructive` / `--negative` | `~4 85% 62%` | warm coral-red, reads clearly against black without visually competing with lime |
| `--positive` | `~85 75% 58%` | greener-lime, distinct from `--accent` but clearly "same family" so gains read as on-brand |
| `--warning` | `~40 90% 60%` | amber, kept distinct from both lime and coral |
| `--border` / `--input` | `0 0% 100% / ~8%` (low-alpha white hairline) | CRED's "invisible until you look" line |
| `--ring` | `--accent` | lime focus ring |
| `--sidebar*` | near-`--background`/`--card` values, no separate warm tint | |
| `--shadow-color` | `0 0% 0%` | |
| `--chart-1..8` | new vivid, higher-lightness set (lime, ivory, coral, teal, violet, amber, blue, rose) tuned to hold up on near-black | |

Dashboard-specific hardcoded arrays to update in lockstep (currently literal
HSL strings tuned for the old parchment/gunmetal backgrounds — they'd look
muddy/low-contrast on black if left as-is):

- `PIE_COLORS` (12 entries)
- `ASSET_CLASS_COLORS` (per asset-class map)
- `urgencyColor()` / `urgencyBg()` (Tailwind `red-600`/`amber-600`/`blue-600`
  + `dark:` variants) — re-tuned for the new near-black surface so alert bars
  stay legible.

## 2. Typography

- `index.html`: add Fraunces to the existing Google Fonts link
  (`family=Fraunces:opsz,wght@9..144,300..900&display=swap`, plus italic
  axis), keep Inter Tight/JetBrains Mono/Geist as-is (Geist's `font-brand`
  wordmark usage is untouched).
- `tailwind.config.ts`: `fontFamily.display` / `fontFamily.serif` →
  `['"Fraunces"', 'ui-serif', 'Georgia', 'serif']`.
- `globals.css` `.font-display` / `.font-display-italic` utilities: swap
  font-family to Fraunces, bump default weight (Fraunces ships real 600-900
  weights, unlike Instrument Serif's fixed 400) — target ~700 for headlines,
  keep italic variant for pull-quotes at a lighter weight (~500) for contrast.
- `PageHeader.tsx` title (`text-[44px] sm:text-[52px]`) and `CardTitle`
  (`text-[20px]`) get slightly larger/heavier treatment to carry Fraunces'
  bolder presence — exact sizes tuned visually, not pre-committed here.
- No changes to `.numeric`, `.numeric-display`, `.money-digits` families —
  money stays Inter Tight, tabular, as today.

## 3. Shape & component primitives

- `--radius`: bump from `0.625rem` to `1rem` (16px) — cards/inputs/popovers
  read as CRED's soft-rounded surfaces.
- `card.tsx`: currently hardcodes `rounded-lg` rather than consuming
  `var(--radius)` directly — switch to `rounded-[var(--radius)]` (or the
  Tailwind `rounded-lg`/`md`/`sm` scale already wired to the radius var in
  `tailwind.config.ts`, whichever renders correctly at the new 16px value)
  so the radius token actually drives card shape.
- `button.tsx`: base class changes `rounded-md` → `rounded-full` (pill) —
  applies to every variant. Default/accent variants get slightly more
  horizontal padding to suit the pill shape. No new variant is introduced;
  existing `variant`/`size` API is unchanged so no call-site changes needed
  beyond the visual result.
- `MetricCard.tsx`: icon chip `rounded-md` → `rounded-full` (circle), swap
  the "top hairline on hover" accent treatment for a soft lime glow ring on
  hover (`ring-2 ring-accent/40` on `.group:hover`, roughly).
- Hero card (`tone="hero"` in `card.tsx` + `.hero-canvas` in `globals.css`):
  no structural change — the existing radial-mesh-gradient + grain overlay
  technique, once fed the new near-black/lime tokens, naturally produces the
  moody vignette-glow look from the reference images. Opacity values in
  `.hero-canvas`/`.hero-canvas::before` get tuned visually if the first pass
  looks too washed-out or too dark.

## 4. Dark-only toggle removal

- `theme.store.ts`: delete (only 2 consumers — `Header.tsx`, `AuthLayout.tsx`).
- `Header.tsx`: remove the toggle button and its `useThemeStore` usage.
- `AuthLayout.tsx`: remove its `useThemeStore` usage; force the `dark` class
  permanently (e.g. set on `<html>` in `index.html` or once in `main.tsx`,
  whichever the app's existing bootstrap favors) so `dark:` Tailwind variants
  scattered through the codebase keep resolving correctly without every one
  of them needing a rewrite.
- `meta[name="theme-color"]` gets hardcoded to the new `--background` hex
  equivalent (no more light/dark branch).

## 5. Verification plan

- Visual check in browser (dev server) on the Dashboard: hero net worth card,
  alerts bar, liabilities grid, metric cards, trajectory chart, allocation
  pie + legend, top holdings table (both desktop table and mobile card list
  views) — confirm legibility, no washed-out/invisible borders, chart colors
  distinguishable on black.
- Spot-check 2-3 other pages (e.g. a list page, a form/modal) to confirm the
  global token change didn't produce any obviously broken hardcoded-color
  spot — noted as follow-up work, not fixed here, per Non-goals.
- No automated test suite covers visual theming; this is a manual
  verification task (per the project's `verify`/`run` skill workflow if
  available) rather than a unit-test target.
