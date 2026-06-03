# Mobile / Tablet Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PortfolioOS web app usable on phones (<768px) without changing the desktop (≥768px) experience at all.

**Architecture:** All mobile behavior is additive and gated below the Tailwind `md` breakpoint (`md:hidden`) or inside a `@media (max-width:767px)` CSS block. A non-visual refactor extracts the Sidebar's nav body into a reusable `SidebarNav` so a mobile drawer can reuse it. A bottom tab bar + hamburger drawer provide navigation. Wide tables become stacked "cards" on phones via a CSS-only `.rtable` transform driven by `data-label` attributes.

**Tech Stack:** React 18, Vite, Tailwind, Radix (`@radix-ui/react-dialog` via existing `sheet.tsx`), `react-router-dom`, `lucide-react`. No new dependencies.

**Note on testing:** This is presentation-only work in a codebase with no DOM test harness (no jsdom/testing-library; vitest runs pure-logic tests only). Per-task verification is `typecheck` + `lint`, with a final manual/Playwright viewport check. Do **not** add jsdom just for this; it adds risk for no behavioral coverage on pure CSS/layout.

---

## File Structure

**New files:**
- `src/components/layout/SidebarNav.tsx` — shared nav body (brand, sections, budget, footer). One responsibility: render the nav.
- `src/components/layout/MobileNavDrawer.tsx` — left Sheet wrapping `SidebarNav`. One responsibility: the slide-in drawer.
- `src/components/layout/MobileTabBar.tsx` — fixed bottom bar, 5 slots. One responsibility: bottom nav.

**Modified files:**
- `src/components/layout/Sidebar.tsx` — becomes a thin desktop `<aside>` wrapper around `SidebarNav` (desktop DOM unchanged).
- `src/components/layout/Header.tsx` — add `md:hidden` hamburger that opens the drawer (via prop callback).
- `src/components/layout/AppShell.tsx` — own `drawerOpen` state, render drawer + tab bar, add mobile bottom padding to `<main>`, close drawer on route change.
- `src/styles/globals.css` — append `.rtable` responsive-table CSS in a `@media (max-width:767px)` block.
- Key page tables (Task 7): add `rtable` class + `data-label`s.

---

### Task 1: Extract `SidebarNav` (non-visual refactor)

Desktop output must stay byte-identical. We move the existing Sidebar body into `SidebarNav`, parameterized by `collapsed` and an optional `renderToggle` slot (desktop injects its current toggle button → identical DOM; drawer injects nothing).

**Files:**
- Create: `src/components/layout/SidebarNav.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create `SidebarNav.tsx`**

Move the brand block, `<nav>`, and footer out of `Sidebar.tsx` into this component. Keep markup identical; the only change is `renderToggle` is rendered where the toggle button used to sit, and the outer element is a plain `<div className="flex flex-col h-full">` (the `<aside>` stays in `Sidebar.tsx`).

```tsx
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { BudgetGauge } from './BudgetGauge';
import { AssetClassSectionList } from './AssetClassSectionList';
import { NavSection, OVERVIEW_ITEMS, ASSET_CLASS_ITEMS, NAV_SECTIONS } from './navItems';

export function SidebarNav({
  collapsed,
  renderToggle,
}: {
  collapsed: boolean;
  renderToggle?: ReactNode;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* brand mark + collapse */}
      <div className="flex items-center justify-between px-4 h-[72px] border-b border-sidebar-border/70">
        {!collapsed && (
          <Link
            to="/dashboard"
            aria-label="Go to dashboard"
            title="Dashboard"
            className="flex items-center gap-3 min-w-0 rounded-md focus-ring transition-opacity hover:opacity-90"
          >
            <div
              aria-hidden="true"
              className="relative h-10 w-10 rounded-md grid place-items-center bg-gradient-to-br from-accent via-accent/95 to-accent/75 text-accent-foreground shadow-sm shrink-0"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 4v16" />
                <path d="M5 4h8a4.5 4.5 0 0 1 0 9H5" />
                <path d="M14 13l4 7" />
              </svg>
              <span className="absolute -inset-px rounded-md ring-1 ring-inset ring-foreground/10" />
            </div>
            <div className="leading-none min-w-0">
              <div className="flex items-baseline gap-[1px] -mt-0.5">
                <span className="font-brand text-[22px] leading-none text-sidebar-foreground">Portfolio</span>
                <span className="font-brand text-[22px] leading-none text-accent">OS</span>
              </div>
              <div className="mt-1.5 text-[9.5px] font-medium uppercase tracking-kerned text-sidebar-foreground/45">
                Wealth · Ledger
              </div>
            </div>
          </Link>
        )}
        {collapsed && (
          <Link
            to="/dashboard"
            aria-label="Go to dashboard"
            title="Dashboard"
            className="mx-auto h-10 w-10 rounded-md grid place-items-center bg-gradient-to-br from-accent via-accent/95 to-accent/75 text-accent-foreground shadow-sm focus-ring transition-opacity hover:opacity-90"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 4v16" />
              <path d="M5 4h8a4.5 4.5 0 0 1 0 9H5" />
              <path d="M14 13l4 7" />
            </svg>
          </Link>
        )}
        {renderToggle}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        <NavSection section={{ heading: 'Overview', items: OVERVIEW_ITEMS }} collapsed={collapsed} />
        <AssetClassSectionList items={ASSET_CLASS_ITEMS} collapsed={collapsed} />
        {NAV_SECTIONS.map((section, i) => (
          <NavSection key={i} section={section} collapsed={collapsed} />
        ))}
      </nav>

      <div className="border-t border-sidebar-border/70">
        <BudgetGauge collapsed={collapsed} />
        {!collapsed && (
          <div className="px-4 py-3 flex items-center justify-between text-[10px] uppercase tracking-kerned text-sidebar-foreground/45">
            <span>v0.5.0</span>
            <span className="h-1 w-1 rounded-full bg-accent/60" />
            <span>Phase 5-E</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Extract nav data + `NavSection` into `navItems.tsx`**

`NavSection`, `OVERVIEW_ITEMS`, `ASSET_CLASS_ITEMS`, `NAV_SECTIONS`, and the `NavItem` interface currently live in `Sidebar.tsx`. Move them verbatim into a new `src/components/layout/navItems.tsx` and export each. Keep `ASSET_CLASS_ITEMS` exported (it already is, and `AssetClassSectionList` / other files import it — preserve the symbol). Re-export from `Sidebar.tsx` for any existing importers:

```tsx
// at top of Sidebar.tsx, after refactor:
export { ASSET_CLASS_ITEMS } from './navItems';
```

Verify existing importers still resolve:

Run: `cd portfolioos/apps/web && grep -rn "ASSET_CLASS_ITEMS" src`
Expected: every import still points to a valid export (either `./navItems` or `./Sidebar` re-export).

- [ ] **Step 3: Rewrite `Sidebar.tsx` as thin desktop wrapper**

The `<aside>`, collapse state, and the toggle button stay here. The toggle button JSX is passed to `SidebarNav` via `renderToggle` so the rendered DOM is identical to today.

```tsx
import { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SidebarNav } from './SidebarNav';

export { ASSET_CLASS_ITEMS } from './navItems';

const SIDEBAR_KEY = 'sidebar_collapsed';

export function Sidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(SIDEBAR_KEY) === 'true',
  );

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      return next;
    });
  }

  const toggle = (
    <button
      type="button"
      onClick={toggleCollapsed}
      className={cn(
        'p-1.5 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors focus-ring',
        collapsed && 'absolute top-4 right-2',
      )}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
    </button>
  );

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-200 relative',
        collapsed ? 'w-[72px]' : 'w-64',
      )}
    >
      <SidebarNav collapsed={collapsed} renderToggle={toggle} />
    </aside>
  );
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `cd portfolioos/apps/web && pnpm typecheck && pnpm lint`
Expected: PASS, no errors.

- [ ] **Step 5: Visual parity check (desktop)**

Run dev server (`pnpm dev`), open at ≥1024px. Confirm sidebar looks and behaves exactly as before: brand, all sections, collapse toggle works, budget gauge + footer present.

- [ ] **Step 6: Commit**

```bash
git add portfolioos/apps/web/src/components/layout/SidebarNav.tsx \
        portfolioos/apps/web/src/components/layout/navItems.tsx \
        portfolioos/apps/web/src/components/layout/Sidebar.tsx
git commit -m "refactor(layout): extract SidebarNav from Sidebar (no visual change)"
```

---

### Task 2: `MobileNavDrawer`

Left-side Sheet that renders `SidebarNav` (always expanded). Controlled by props from `AppShell`.

**Files:**
- Create: `src/components/layout/MobileNavDrawer.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { SidebarNav } from './SidebarNav';

export function MobileNavDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[280px] max-w-[85vw] p-0 bg-sidebar text-sidebar-foreground md:hidden"
        aria-label="Navigation menu"
      >
        <SidebarNav collapsed={false} />
      </SheetContent>
    </Sheet>
  );
}
```

Note: `sheet.tsx` already renders a close (X) button inside `SheetContent`. The `md:hidden` on content is belt-and-suspenders; the drawer is only ever opened from mobile-only triggers.

- [ ] **Step 2: Typecheck**

Run: `cd portfolioos/apps/web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add portfolioos/apps/web/src/components/layout/MobileNavDrawer.tsx
git commit -m "feat(layout): mobile nav drawer reusing SidebarNav"
```

---

### Task 3: Header hamburger (mobile only)

Add a `md:hidden` hamburger to the left of the date block. It calls an `onOpenMenu` prop. Desktop never renders it.

**Files:**
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Add prop + import**

Change the import line `import { LogOut, User, ChevronDown, Sun, Moon, Bell, Eye, EyeOff } from 'lucide-react';` to also import `Menu`:

```tsx
import { LogOut, User, ChevronDown, Sun, Moon, Bell, Eye, EyeOff, Menu } from 'lucide-react';
```

Change the signature:

```tsx
export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
```

- [ ] **Step 2: Render hamburger inside the left group**

Replace the opening of the left group:

```tsx
      <div className="flex items-baseline gap-4 min-w-0">
        <div className="leading-tight min-w-0">
```

with:

```tsx
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          className="md:hidden h-9 w-9 -ml-1 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors focus-ring"
        >
          <Menu className="h-5 w-5" strokeWidth={1.7} />
        </button>
        <div className="leading-tight min-w-0">
```

> The wrapper's `items-baseline` → `items-center` change applies to the header's left group only. The hamburger is `md:hidden`; at `md`+ the group contains a single child exactly as before, so vertical alignment of that single text block is unchanged. Verify in Step 4.

- [ ] **Step 3: Typecheck**

Run: `cd portfolioos/apps/web && pnpm typecheck`
Expected: FAIL — `AppShell` still calls `<Header />` without `onOpenMenu`. This is expected; fixed in Task 5. (If running this task in isolation, temporarily make the prop optional; Task 5 makes it required-by-usage.)

To keep each task independently green, make the prop optional with a no-op default for now:

```tsx
export function Header({ onOpenMenu = () => {} }: { onOpenMenu?: () => void }) {
```

Re-run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Desktop parity check**

At ≥768px confirm the header date/welcome block sits exactly as before and no hamburger shows.

- [ ] **Step 5: Commit**

```bash
git add portfolioos/apps/web/src/components/layout/Header.tsx
git commit -m "feat(layout): mobile hamburger in header (md:hidden)"
```

---

### Task 4: `MobileTabBar`

Fixed bottom bar, `md:hidden`, 5 slots: Dashboard, Portfolios, Transactions, Analytics, More. First four navigate; More opens the drawer.

**Files:**
- Create: `src/components/layout/MobileTabBar.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Briefcase, Receipt, BarChart3, Menu } from 'lucide-react';
import { cn } from '@/lib/cn';

const TABS = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, end: true },
  { label: 'Portfolios', to: '/portfolios', icon: Briefcase, end: false },
  { label: 'Transactions', to: '/transactions', icon: Receipt, end: false },
  { label: 'Analytics', to: '/analytics', icon: BarChart3, end: false },
];

export function MobileTabBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-md border-t border-border/70 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-0.5 h-14 text-[10px] font-medium transition-colors',
                  isActive ? 'text-accent' : 'text-muted-foreground',
                )
              }
            >
              <t.icon className="h-5 w-5" strokeWidth={1.7} />
              <span>{t.label}</span>
            </NavLink>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="More navigation"
            className="w-full flex flex-col items-center justify-center gap-0.5 h-14 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Menu className="h-5 w-5" strokeWidth={1.7} />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd portfolioos/apps/web && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add portfolioos/apps/web/src/components/layout/MobileTabBar.tsx
git commit -m "feat(layout): mobile bottom tab bar (md:hidden)"
```

---

### Task 5: Wire drawer + tab bar into `AppShell`

Own `drawerOpen` state, pass `onOpenMenu` to Header and TabBar, render drawer + bar, add mobile bottom padding to `<main>`, and close the drawer on route change.

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNavDrawer } from './MobileNavDrawer';
import { MobileTabBar } from './MobileTabBar';
import { GmailAutoConnectBanner } from './GmailAutoConnectBanner';
import { ScanProvider } from '@/context/ScanContext';
import { usePrivacyStore } from '@/stores/privacy.store';
import { useTokenRefresh } from '@/hooks/useTokenRefresh';

export function AppShell() {
  const { hideSensitive } = usePrivacyStore();
  useTokenRefresh();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes (e.g. user taps a nav link).
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  return (
    <ScanProvider>
      <div className={`h-screen flex overflow-hidden bg-background ${hideSensitive ? 'privacy-mask' : ''}`}>
        <Sidebar />
        <MobileNavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header onOpenMenu={() => setDrawerOpen(true)} />
          <GmailAutoConnectBanner />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1480px] px-6 py-7 lg:px-10 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] md:pb-7">
              <Outlet />
            </div>
          </main>
        </div>
        <MobileTabBar onOpenMenu={() => setDrawerOpen(true)} />
      </div>
    </ScanProvider>
  );
}
```

> The inner content `<div>` previously had `py-7` (top+bottom 1.75rem). We keep `py-7` for top, and override bottom: below `md` use `pb-[calc(3.5rem+safe-area+1rem)]` to clear the 3.5rem (`h-14`) tab bar; at `md`+ `md:pb-7` restores the original 1.75rem. Desktop bottom padding therefore unchanged.

- [ ] **Step 2: Make `Header.onOpenMenu` required again (optional cleanup)**

Now that `AppShell` always passes it, you may revert the default in `Header.tsx` to `onOpenMenu: () => void` (required). Optional — leaving the default is harmless. Skip to keep the diff small.

- [ ] **Step 3: Typecheck + lint + build**

Run: `cd portfolioos/apps/web && pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 4: Manual check at 375px and 1280px**

- 375px: hamburger + bottom bar visible; tapping a tab navigates; tapping More opens drawer; drawer closes on nav; content not hidden behind bar (scroll to bottom).
- 1280px: no hamburger, no bottom bar, sidebar visible; layout identical to before.

- [ ] **Step 5: Commit**

```bash
git add portfolioos/apps/web/src/components/layout/AppShell.tsx portfolioos/apps/web/src/components/layout/Header.tsx
git commit -m "feat(layout): wire mobile drawer + tab bar into AppShell"
```

---

### Task 6: `.rtable` responsive-table CSS

CSS-only transform: below 767px, a table marked `.rtable` becomes a stack of cards. Above 767px the class is inert.

**Files:**
- Modify: `src/styles/globals.css` (append at end)

- [ ] **Step 1: Append the CSS block**

Add at the very end of `globals.css`:

```css
/* ───────────────────────────────────────────────────────────
   Responsive tables: below md, a `.rtable` table renders as a
   vertical list of cards. Desktop (≥768px) is completely
   unaffected — the rules live only inside this media query.
   Each <td> must carry data-label="Column name"; the label is
   shown via ::before. Use data-fullrow on a <td> to make it span
   the whole card (e.g. an actions cell) without a label.
   ─────────────────────────────────────────────────────────── */
@media (max-width: 767px) {
  table.rtable thead {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  table.rtable,
  table.rtable tbody,
  table.rtable tr,
  table.rtable td {
    display: block;
    width: 100%;
  }

  table.rtable tr {
    margin-bottom: 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: hsl(var(--card));
  }

  table.rtable td {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    text-align: right;
    padding: 0.35rem 0;
    border: 0;
    width: auto;
  }

  table.rtable td::before {
    content: attr(data-label);
    text-align: left;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: hsl(var(--muted-foreground));
    font-weight: 600;
    flex-shrink: 0;
  }

  /* Cells with no label (data-label="") drop the label column. */
  table.rtable td[data-label='']::before {
    content: '';
  }

  /* Full-width cell: span the card, hide label, left-align. */
  table.rtable td[data-fullrow]::before {
    content: '';
  }
  table.rtable td[data-fullrow] {
    justify-content: flex-start;
    text-align: left;
  }
}
```

- [ ] **Step 2: Build (CSS compiles)**

Run: `cd portfolioos/apps/web && pnpm build`
Expected: PASS (Tailwind/PostCSS processes the file without error).

- [ ] **Step 3: Commit**

```bash
git add portfolioos/apps/web/src/styles/globals.css
git commit -m "feat(styles): .rtable mobile card-list table transform (<768px only)"
```

---

### Task 7: Apply `.rtable` to key page tables

Add `rtable` to each target table and `data-label="…"` to every `<td>`. Header labels are the existing `<th>` text. This task is repeated per page; below is the exact procedure plus the column maps for each.

**Files (modify):**
- `src/pages/assetClasses/StocksPage.tsx`
- `src/pages/assetClasses/MutualFundsPage.tsx`
- `src/pages/transactions/*` (the transactions list table)
- `src/pages/cashflows/CashFlowsPage.tsx`
- `src/pages/portfolios/PortfolioDetailPage.tsx`
- `src/pages/dashboard/DashboardPage.tsx` (its holdings/allocation table(s))

**Procedure per table:**

1. Find the `<table className="…">` and add `rtable` to its class list, e.g. `className="w-full text-sm rtable"`.
2. For each `<td>` in the `<tbody>` rows, add `data-label="<matching th text>"`.
   - For the leading icon/spacer `<td>` (e.g. StocksPage `<th className="… w-8">` with no label) add `data-label=""`.
   - For an actions cell (buttons), add `data-fullrow` instead of a label.
3. Leave `<thead>`/`<th>` untouched (CSS hides thead on mobile).

- [ ] **Step 1: StocksPage**

Reference header (from current file): `'' | Symbol | Name | Qty | Avg cost | LTP | Value | P&L | %` (plus any trailing actions cell).

Edit the table tag:

```tsx
<table className="w-full text-sm rtable">
```

Add to each body `<td>` in order: `data-label=""`, `data-label="Symbol"`, `data-label="Name"`, `data-label="Qty"`, `data-label="Avg cost"`, `data-label="LTP"`, `data-label="Value"`, `data-label="P&L"`, `data-label="%"`. Any trailing actions/expander `<td>` → `data-fullrow`.

Verify the body cells you edited match the header order:

Run: `cd portfolioos/apps/web && grep -n "<th\|<td" src/pages/assetClasses/StocksPage.tsx`
Expected: each `<td>` in a data row now has a `data-label`/`data-fullrow`; count of labeled `<td>`s per row equals the `<th>` count.

- [ ] **Step 2: Repeat for the remaining target pages**

For each of `MutualFundsPage.tsx`, the transactions list table, `CashFlowsPage.tsx`, `PortfolioDetailPage.tsx`, and the dashboard holdings/allocation table:

1. Run `grep -n "<th\|<td\|<table" src/pages/<file>` to read the column order.
2. Add `rtable` to the `<table>` class.
3. Map each `<td>` to its `<th>` text via `data-label`; spacer cells → `data-label=""`; action cells → `data-fullrow`.

(There is no shared code to DRY here — each table is hand-rolled — so each is edited directly. Keep labels identical to the visible header text.)

- [ ] **Step 3: Typecheck + lint**

Run: `cd portfolioos/apps/web && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Mobile visual check (375px)**

For each edited page at 375px: header row hidden, each row is a bordered card, every value line shows `Label … value`, no horizontal scroll needed for these tables. At ≥768px the same tables render as normal grids (unchanged).

- [ ] **Step 5: Commit**

```bash
git add portfolioos/apps/web/src/pages
git commit -m "feat(pages): mobile card-list tables on key pages via .rtable"
```

---

### Task 8: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full gate**

Run: `cd portfolioos/apps/web && pnpm typecheck && pnpm lint && pnpm build`
Expected: all PASS.

- [ ] **Step 2: Desktop regression sweep (≥768px)**

Open Dashboard, Portfolios, Transactions, Stocks, Mutual Funds, Cashflows at 1280px. Confirm each is visually identical to `main` (sidebar present, no hamburger, no bottom bar, tables as grids). If any differs, the change leaked above `md` — fix the gating.

- [ ] **Step 3: Mobile acceptance (375px) + tablet (768px)**

- 375px: nav reachable via hamburger drawer and bottom bar; key-page tables are cards; content never hidden behind the bar.
- 768px: treated as desktop — sidebar visible, no bottom bar (boundary check).

Optional: capture screenshots with the Playwright MCP at 375 / 768 / 1280 for the six pages to attach to the PR.

- [ ] **Step 4: Final commit (if any fixes)**

```bash
git add -A && git commit -m "fix(layout): mobile responsiveness polish from verification sweep"
```

---

## Self-Review Notes

- **Spec coverage:** Component 1 (nav shell) → Tasks 1–5. Component 2 (responsive tables) → Tasks 6–7. Component 3 (touch/spacing) → folded into Task 5 (main padding, tap targets in tab bar/hamburger sized ≥36–44px) and verified in Task 8. Iron Rule (desktop unchanged) → every task gates with `md:hidden` / `@media (max-width:767px)` and has an explicit desktop parity check.
- **Scope:** Key pages only (Task 7 list), matching the spec's scope section. Remaining pages are the documented mechanical follow-up (same procedure).
- **Type consistency:** `onOpenMenu: () => void` used in Header, MobileTabBar, AppShell. `MobileNavDrawer` uses `open`/`onOpenChange` matching Radix Sheet. `SidebarNav` props `collapsed`/`renderToggle` consistent across Sidebar (desktop) and drawer.
- **No new deps.** All imports (Sheet, NavLink, lucide icons, cn) already exist.
