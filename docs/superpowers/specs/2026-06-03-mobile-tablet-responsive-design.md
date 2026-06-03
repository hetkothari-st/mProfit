# Mobile / Tablet Responsiveness — Design Spec

**Date:** 2026-06-03
**Status:** Approved (design), pending implementation plan
**Owner:** web (`portfolioos/apps/web`)

## Goal

Make the PortfolioOS web app usable on phones and tablets **without changing the
existing desktop experience in any way**.

## Iron Rule (non-negotiable)

Desktop rendering at the `md` breakpoint and above (≥768px) must remain
**byte-identical**. Every change in this work is one of:

1. Gated to render only below `md` (`md:hidden`, or conditional render keyed to a
   `< 768px` check), **or**
2. Pure CSS inside `@media (max-width: 767px)`, **or**
3. A non-visual refactor (extracting shared markup) that produces identical
   desktop output.

No shared UI component's props or contract changes. No desktop CSS is edited.
Tablet (portrait, ~768–1024px) is treated as **desktop** (sidebar visible at
`md`) per product decision.

## Decisions (locked)

| # | Decision | Value |
|---|---|---|
| 1 | Mobile nav | Hamburger drawer **+** bottom tab bar |
| 2 | Tables on mobile | Card list (each row → stacked label:value card) |
| 3 | Table technique | Pure CSS responsive transform, media-query gated |
| 4 | Scope this pass | Nav shell + key pages; rest is mechanical follow-up |
| 5 | Tablet | Treat as desktop (only `< 768px` gets mobile treatment) |
| 6 | Bottom bar slots | Dashboard, Portfolios, Transactions, Analytics, More |

## Architecture

### Component 1 — Mobile nav shell (renders only below `md`)

**Refactor (non-visual):**
- Extract the Sidebar nav body (brand block, `<nav>` sections, `BudgetGauge`,
  version footer) into a shared `SidebarNav` component.
- Existing desktop `<aside className="hidden md:flex …">` renders `<SidebarNav>`.
  Desktop output unchanged.
- `SidebarNav` accepts an optional `onNavigate?: () => void` so the drawer can
  close itself on link click. Desktop passes nothing → no behavior change.

**New `MobileNavDrawer`:**
- Built on existing `src/components/ui/sheet.tsx` (`side="left"`).
- Renders `<SidebarNav onNavigate={close} />` (forced expanded, never collapsed).
- Open/close state owned by `AppShell`.

**Header changes:**
- Add a hamburger `<button>` at the left, class `md:hidden`, that opens the drawer.
- Desktop (`md`+) never renders it.

**New `MobileTabBar`:**
- `md:hidden fixed bottom-0 inset-x-0 z-40`, respects `env(safe-area-inset-bottom)`.
- 5 slots: Dashboard, Portfolios, Transactions, Analytics, and **More**.
- First 4 use `NavLink` with active styling. **More** opens the same drawer.

**AppShell changes:**
- Own `drawerOpen` state; render `MobileNavDrawer` + `MobileTabBar`.
- Add bottom padding to `<main>` for the bar: `pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0`.
  Because it is `md:pb-0`, desktop spacing is unchanged.

### Component 2 — Responsive tables (CSS, gated `< 768px`)

**Technique:** pure CSS in `src/styles/` under `@media (max-width: 767px)`.

- A wrapper/utility class (e.g. `.rtable`) applied to a `<table>` (or its
  scroll wrapper) triggers, on mobile only:
  - `thead` hidden.
  - each `tr` → block "card" (border, radius, padding, margin).
  - each `td` → block flex row; left side is the column label, right side the
    value.
- Column labels come from a `data-label="…"` attribute on each `<td>`, surfaced
  via `td::before { content: attr(data-label); }`.
- Above 767px the class is inert → **desktop tables are untouched**.

**Per-table change** (key pages only this pass):
- Add `rtable` to the table (or wrapper).
- Add `data-label="Symbol"` etc. to each `<td>`.
- Cells that should stay full-width on the card (e.g. an actions row) may use a
  `data-fullrow` opt-out handled by the same CSS.

### Component 3 — Touch & spacing tweaks (below `md` only)

- Ensure interactive controls meet ~44px tap targets on mobile using responsive
  classes where current sizing is smaller. Desktop sizes unchanged.
- Audit stat/summary grids for any fixed multi-column layout that lacks a
  `grid-cols-1` base; most already use `grid-cols-1 md:grid-cols-N` and need no
  change.

## Scope (this pass)

Nav shell (applies app-wide automatically) **plus** card-list tables on:

- Dashboard
- Portfolios (detail)
- Transactions
- Stocks
- Mutual Funds
- Cashflows

The remaining ~25 page groups get the same mechanical treatment (add `rtable` +
`data-label`s) in follow-up; the pattern is documented so it needs no further
design.

## Data flow

No data-flow changes. This is presentation-only. No API, store, query, or schema
changes. No new dependencies (Sheet, NavLink, Tailwind, lucide already present).

## Error handling

N/A — no new failure modes. Drawer/tab-bar are stateless UI. CSS transform has no
runtime path.

## Testing

- **Manual viewport checks** at 375px (phone), 768px (tablet boundary), and a
  desktop width, verifying:
  - Desktop unchanged (sidebar visible, no hamburger, no bottom bar, tables as
    grids).
  - Phone: hamburger + drawer work, bottom bar visible and navigates, content not
    obscured by bar, key tables render as cards.
- **Regression guard:** confirm `md:hidden` / media-query gating by toggling DOM
  width; no desktop snapshot/visual change.
- `pnpm --filter @portfolioos/web typecheck` and `lint` green.

## Non-goals

- No redesign of desktop layout.
- No change to component contracts/props of shared UI.
- No charts rework (recharts already uses responsive containers; spot-check only).
- Not every page in this pass — only the listed key pages get card tables.

## File touch list (anticipated)

- `src/components/layout/Sidebar.tsx` — extract `SidebarNav` (new file
  `SidebarNav.tsx`), keep aside thin.
- `src/components/layout/SidebarNav.tsx` — new shared nav body.
- `src/components/layout/MobileNavDrawer.tsx` — new.
- `src/components/layout/MobileTabBar.tsx` — new.
- `src/components/layout/Header.tsx` — add `md:hidden` hamburger.
- `src/components/layout/AppShell.tsx` — drawer state, tab bar, main padding.
- `src/styles/*` — `.rtable` responsive-table CSS (media query).
- Key page tables listed above — add `rtable` + `data-label`s.
