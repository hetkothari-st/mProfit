# CRED-style theme reskin (Dashboard first pass) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin PortfolioOS to a CRED.club-style dark theme (near-black canvas, signature lime accent, Fraunces display serif, pill buttons) via the app's existing CSS-token system, validated on the Dashboard page, with the light/dark toggle removed (dark-only).

**Architecture:** The app's entire look runs through Tailwind semantic classes backed by CSS custom properties defined once in `src/styles/globals.css` (`--background`, `--card`, `--accent`, etc.) and consumed via `tailwind.config.ts`. Editing those property values repaints every page that uses the semantic classes — no per-component rewiring needed for the base palette. Component-level work is limited to: (a) the two known hardcoded-color hotspots on the Dashboard (`PIE_COLORS`/`ASSET_CLASS_COLORS`/urgency helpers), (b) `Button`/`MetricCard` shape tweaks that aren't expressible as a token, and (c) removing the theme-toggle store and its two call sites.

**Tech Stack:** React 18 + TypeScript + Vite, Tailwind CSS (CSS-variable-driven theme), no CSS-in-JS.

## Global Constraints

- Dark-only: no `.dark`/light mode branching survives this change; one palette lives in `:root`.
- Signature accent color is lime, approx `#E2FE53` (~`70 95% 65%` HSL) — used for `--accent` and `--positive`.
- Negative/destructive stays a warm coral-red (~`4 85% 62%` HSL), distinct from lime.
- Display/headline font is **Fraunces** (variable serif); body/UI/money stays **Inter Tight**. Never move monetary/tabular figures to a serif font.
- `--radius` becomes `1rem` (16px); `Button` becomes pill-shaped (`rounded-full`) regardless of the radius token.
- Only `DashboardPage.tsx`'s known hardcoded color literals are in scope for recoloring in this plan (per spec's Non-goals) — no repo-wide hex hunt.
- No automated test suite exists for visual theming (per spec Section 5) — verification is build/typecheck passing plus a manual/Playwright visual check on the Dashboard, not new unit tests.

---

### Task 1: Rewrite color tokens to a single CRED-dark palette

**Files:**
- Modify: `portfolioos/apps/web/src/styles/globals.css:11-120` (the `:root` and `.dark` blocks inside the first `@layer base`)
- Modify: `portfolioos/apps/web/index.html` (add `class="dark"` to the `<html>` tag, update `<meta name="theme-color">`)

**Interfaces:**
- Consumes: nothing (this is the root token definition).
- Produces: every CSS custom property consumed by `tailwind.config.ts`'s `theme.extend.colors` and by every component using `bg-*`/`text-*`/`border-*` Tailwind classes (all downstream tasks and all existing pages depend on these values existing with the same names).

- [ ] **Step 1: Replace the `:root` block with the CRED-dark palette**

Replace lines 12–66 of `portfolioos/apps/web/src/styles/globals.css` (the existing `:root { ... }` block) with:

```css
  :root {
    /* Surfaces — near-black, not pure #000, so grain/mesh texture still reads */
    --background: 0 0% 5%;
    --foreground: 0 0% 96%;
    --card: 0 0% 9%;
    --card-foreground: 0 0% 96%;
    --card-highlight: 0 0% 100%;
    --popover: 0 0% 11%;
    --popover-foreground: 0 0% 96%;

    /* Brand — inverted: white primary CTAs on black, like CRED's pill buttons */
    --primary: 0 0% 96%;
    --primary-foreground: 0 0% 6%;

    --secondary: 0 0% 14%;
    --secondary-foreground: 0 0% 96%;

    --accent: 70 95% 65%;                /* signature lime, ~#E2FE53 */
    --accent-foreground: 0 0% 8%;

    --muted: 0 0% 13%;
    --muted-foreground: 0 0% 62%;

    --destructive: 4 85% 62%;             /* warm coral-red */
    --destructive-foreground: 0 0% 96%;

    --border: 0 0% 18%;                   /* hairline, subtle-but-opaque against 5%/9% surfaces */
    --input: 0 0% 18%;
    --ring: 70 95% 65%;

    --positive: 85 75% 58%;               /* greener-lime, on-brand for gains */
    --negative: 4 85% 62%;
    --warning: 40 90% 60%;

    /* Sidebar — same near-black family, no separate warm tint */
    --sidebar: 0 0% 6%;
    --sidebar-foreground: 0 0% 90%;
    --sidebar-accent: 0 0% 12%;
    --sidebar-accent-foreground: 70 95% 65%;
    --sidebar-border: 0 0% 14%;

    --shadow-color: 0 0% 0%;

    --radius: 1rem;

    /* Chart palette — vivid, higher-lightness so it holds up on near-black */
    --chart-1: 70 95% 65%;    /* lime */
    --chart-2: 0 0% 90%;      /* ivory */
    --chart-3: 4 85% 66%;     /* coral */
    --chart-4: 185 70% 55%;   /* teal */
    --chart-5: 265 70% 72%;   /* violet */
    --chart-6: 40 90% 62%;    /* amber */
    --chart-7: 210 85% 65%;   /* blue */
    --chart-8: 330 70% 68%;   /* rose */
  }
```

Then delete the entire `.dark { ... }` block that follows (originally lines 68–119) — the CRED palette lives in `:root` now, there is no second mode. Leave every other rule in the file (the `@layer base { * { ... } }` block, `@layer utilities { ... }`, the `.dark .shadow-elev` / `.dark .hero-canvas::before` / `.dark .money-digits` etc. rules further down) **untouched** — those `.dark`-scoped rules stay in the file and keep working because `<html>` will now always carry the `dark` class (Step 3), preserving the existing "lifted card" shadow technique and dark-tuned money-digit text-shadows without having to touch every one of those call sites individually.

- [ ] **Step 2: Verify no leftover references to deleted light-mode values**

Run:
```bash
cd portfolioos/apps/web && grep -n "^\s*--" src/styles/globals.css | head -40
```
Expected: exactly one set of custom-property declarations (the new `:root` block above), no second block redefining the same properties under `.dark`.

- [ ] **Step 3: Force dark mode permanently in `index.html`**

In `portfolioos/apps/web/index.html`, change:
```html
<html lang="en">
```
to:
```html
<html lang="en" class="dark">
```
And change:
```html
<meta name="theme-color" content="#022B54" />
```
to:
```html
<meta name="theme-color" content="#0d0d0d" />
```

- [ ] **Step 4: Build check**

Run: `cd portfolioos/apps/web && npm run build`
Expected: build succeeds (no CSS/TS errors). This does not visually verify the theme — that happens in Task 8.

- [ ] **Step 5: Commit**

```bash
git add portfolioos/apps/web/src/styles/globals.css portfolioos/apps/web/index.html
git commit -m "feat(theme): replace light/dark tokens with single CRED-dark palette"
```

---

### Task 2: Swap display font to Fraunces

**Files:**
- Modify: `portfolioos/apps/web/index.html:24` (Google Fonts `<link>`)
- Modify: `portfolioos/apps/web/tailwind.config.ts` (the `fontFamily` block)
- Modify: `portfolioos/apps/web/src/styles/globals.css` (the `.font-display` / `.font-display-italic` utilities, inside `@layer utilities`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `font-display` / `font-display-italic` Tailwind/utility classes now render in Fraunces at heavier weights; every existing call site (`PageHeader.tsx`, `CardTitle` in `card.tsx`, `AuthLayout.tsx`) picks this up automatically with no code change on their end.

- [ ] **Step 1: Add Fraunces to the Google Fonts link**

In `portfolioos/apps/web/index.html`, find the existing font link (currently on line 24):
```html
      href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital,wght@0,400;1,400&family=Inter+Tight:wght@400;500;600;700&family=Geist:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
```
Replace with:
```html
      href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Inter+Tight:wght@400;500;600;700&family=Geist:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
```
(This drops Instrument Serif and adds Fraunces across its full optical-size + weight + italic axis range; Inter Tight, Geist, and JetBrains Mono are unchanged.)

- [ ] **Step 2: Point `font-display`/`font-serif` at Fraunces in Tailwind config**

In `portfolioos/apps/web/tailwind.config.ts`, find:
```ts
      fontFamily: {
        sans: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        serif: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        numeric: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
      },
```
Replace with:
```ts
      fontFamily: {
        sans: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
        serif: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        numeric: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
      },
```

- [ ] **Step 3: Update the `.font-display`/`.font-display-italic` utilities in `globals.css`**

Find (inside `@layer utilities`):
```css
  /* Title typography — Instrument Serif, modern editorial */
  .font-display {
    font-family: 'Instrument Serif', ui-serif, Georgia, serif;
    font-feature-settings: 'liga', 'kern';
    letter-spacing: -0.012em;
    font-weight: 400;
  }
  .font-display-italic {
    font-family: 'Instrument Serif', ui-serif, Georgia, serif;
    font-style: italic;
    letter-spacing: -0.005em;
  }
```
Replace with:
```css
  /* Title typography — Fraunces, bold editorial weight for CRED-style headlines */
  .font-display {
    font-family: 'Fraunces', ui-serif, Georgia, serif;
    font-feature-settings: 'liga', 'kern';
    font-variation-settings: 'opsz' 40, 'SOFT' 0;
    letter-spacing: -0.015em;
    font-weight: 700;
  }
  .font-display-italic {
    font-family: 'Fraunces', ui-serif, Georgia, serif;
    font-style: italic;
    font-variation-settings: 'opsz' 40, 'SOFT' 0;
    letter-spacing: -0.008em;
    font-weight: 500;
  }
```

- [ ] **Step 4: Build check**

Run: `cd portfolioos/apps/web && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add portfolioos/apps/web/index.html portfolioos/apps/web/tailwind.config.ts portfolioos/apps/web/src/styles/globals.css
git commit -m "feat(theme): swap display font from Instrument Serif to Fraunces"
```

---

### Task 3: Pill-shaped buttons

**Files:**
- Modify: `portfolioos/apps/web/src/components/ui/button.tsx`

**Interfaces:**
- Consumes: nothing new (same `ButtonProps`/`variant`/`size` API as before).
- Produces: unchanged `Button` component export/props — every existing call site across the app (dozens of pages) needs no changes, only the rendered shape changes.

- [ ] **Step 1: Change the base class from `rounded-md` (implicit, via no override) to explicit `rounded-full`**

In `portfolioos/apps/web/src/components/ui/button.tsx`, find the `cva` base string:
```ts
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium tracking-tight ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.99]',
```
Replace `rounded-md` with `rounded-full` so it reads:
```ts
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium tracking-tight ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.99]',
```

- [ ] **Step 2: Widen horizontal padding on `default` size for the pill shape, and drop the now-redundant `rounded-md` from the `sm` size variant**

Find:
```ts
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-[13px]',
        lg: 'h-11 rounded-md px-7',
        icon: 'h-9 w-9',
      },
```
Replace with:
```ts
      size: {
        default: 'h-9 px-5 py-2',
        sm: 'h-8 px-3.5 text-[13px]',
        lg: 'h-11 px-8',
        icon: 'h-9 w-9',
      },
```
(The per-size `rounded-md` overrides are removed since the base class now sets `rounded-full` for every size; `icon` stays square-ish visually but is still a circle since it's `h-9 w-9` with `rounded-full`.)

- [ ] **Step 3: Build check**

Run: `cd portfolioos/apps/web && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add portfolioos/apps/web/src/components/ui/button.tsx
git commit -m "feat(theme): pill-shaped buttons for CRED-style CTAs"
```

---

### Task 4: MetricCard — circular icon chip + lime hover glow

**Files:**
- Modify: `portfolioos/apps/web/src/components/portfolio/MetricCard.tsx`

**Interfaces:**
- Consumes: `Card` from `@/components/ui/card` (unchanged), same `MetricCardProps` as before.
- Produces: unchanged `MetricCard` export/props — `DashboardPage.tsx`'s four `<MetricCard .../>` call sites need no changes.

- [ ] **Step 1: Replace the top hairline hover accent with a lime hover ring on the card**

Find:
```tsx
  return (
    <Card className="group relative overflow-hidden p-5 hover:shadow-elev-lg transition-shadow">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
```
Replace with:
```tsx
  return (
    <Card className="group relative overflow-hidden p-5 transition-shadow hover:shadow-elev-lg hover:ring-2 hover:ring-accent/40">
```
(Drop the top-hairline `<div>` entirely — the hover ring on the `Card` itself replaces it.)

- [ ] **Step 2: Make the icon chip a circle**

Find:
```tsx
        {Icon && (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border/70 bg-background/40">
            <Icon className="h-4 w-4 text-accent-ink" strokeWidth={1.6} />
          </div>
        )}
```
Replace with:
```tsx
        {Icon && (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border/70 bg-background/40 transition-colors group-hover:border-accent/50">
            <Icon className="h-4 w-4 text-accent-ink" strokeWidth={1.6} />
          </div>
        )}
```

- [ ] **Step 3: Build check**

Run: `cd portfolioos/apps/web && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add portfolioos/apps/web/src/components/portfolio/MetricCard.tsx
git commit -m "feat(theme): circular icon chip + lime hover ring on MetricCard"
```

---

### Task 5: Recolor Dashboard's hardcoded chart/alert palettes

**Files:**
- Modify: `portfolioos/apps/web/src/pages/dashboard/DashboardPage.tsx:70-96` (`PIE_COLORS`, `urgencyColor`, `urgencyBg`)
- Modify: `portfolioos/apps/web/src/pages/dashboard/DashboardPage.tsx:109-140` (`ASSET_CLASS_COLORS`)

**Interfaces:**
- Consumes: nothing new.
- Produces: same `PIE_COLORS: string[]`, `ASSET_CLASS_COLORS: Record<string,string>`, `assetClassColor(cls: string): string`, `urgencyColor(urgency): string`, `urgencyBg(urgency): string`, `UrgencyIcon` — signatures unchanged, only the literal color values inside change, so every call site in this same file keeps working untouched.

- [ ] **Step 1: Replace `PIE_COLORS`**

Find:
```ts
// Editorial chart palette — refined, restrained, never neon
const PIE_COLORS = [
  'hsl(213 53% 22%)',   // ink
  'hsl(36 60% 48%)',    // gold
  'hsl(130 35% 34%)',   // forest
  'hsl(12 50% 44%)',    // terracotta
  'hsl(260 28% 42%)',   // plum
  'hsl(195 40% 34%)',   // slate teal
  'hsl(28 70% 54%)',    // amber
  'hsl(340 35% 40%)',   // rosewood
  'hsl(80 28% 38%)',    // moss
  'hsl(220 25% 50%)',   // dust blue
  'hsl(50 55% 45%)',    // mustard
  'hsl(165 30% 36%)',   // pine
];
```
Replace with:
```ts
// CRED-style chart palette — vivid, high-lightness so it reads on near-black
const PIE_COLORS = [
  'hsl(70 95% 65%)',    // lime (signature accent)
  'hsl(0 0% 88%)',      // ivory
  'hsl(4 85% 66%)',     // coral
  'hsl(185 70% 55%)',   // teal
  'hsl(265 70% 72%)',   // violet
  'hsl(40 90% 62%)',    // amber
  'hsl(210 85% 65%)',   // blue
  'hsl(330 70% 68%)',   // rose
  'hsl(150 55% 55%)',   // green
  'hsl(25 80% 60%)',    // orange
  'hsl(280 60% 68%)',   // purple
  'hsl(190 60% 60%)',   // cyan
];
```

- [ ] **Step 2: Replace `urgencyColor` and `urgencyBg`**

Find:
```ts
function urgencyColor(urgency: 'HIGH' | 'MEDIUM' | 'LOW') {
  if (urgency === 'HIGH') return 'text-red-600 dark:text-red-400';
  if (urgency === 'MEDIUM') return 'text-amber-600 dark:text-amber-400';
  return 'text-blue-600 dark:text-blue-400';
}

function urgencyBg(urgency: 'HIGH' | 'MEDIUM' | 'LOW') {
  if (urgency === 'HIGH') return 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800';
  if (urgency === 'MEDIUM') return 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800';
  return 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800';
}
```
Replace with:
```ts
function urgencyColor(urgency: 'HIGH' | 'MEDIUM' | 'LOW') {
  if (urgency === 'HIGH') return 'text-[hsl(4_85%_70%)]';
  if (urgency === 'MEDIUM') return 'text-[hsl(40_90%_66%)]';
  return 'text-[hsl(210_85%_70%)]';
}

function urgencyBg(urgency: 'HIGH' | 'MEDIUM' | 'LOW') {
  if (urgency === 'HIGH') return 'bg-[hsl(4_85%_62%/0.12)] border-[hsl(4_85%_62%/0.35)]';
  if (urgency === 'MEDIUM') return 'bg-[hsl(40_90%_60%/0.12)] border-[hsl(40_90%_60%/0.35)]';
  return 'bg-[hsl(210_85%_65%/0.12)] border-[hsl(210_85%_65%/0.35)]';
}
```
(These no longer need `dark:` variants since the app is dark-only now; the bracket-syntax arbitrary values keep the same HSL family used for `--negative`/`--warning`/chart-blue elsewhere so alerts stay visually consistent with the rest of the palette.)

- [ ] **Step 3: Replace `ASSET_CLASS_COLORS`**

Find the full block:
```ts
const ASSET_CLASS_COLORS: Record<string, string> = {
  EQUITY: 'hsl(213 53% 22%)',
  FUTURES: 'hsl(213 53% 22%)',
  OPTIONS: 'hsl(213 53% 22%)',
  MUTUAL_FUND: 'hsl(260 28% 42%)',
  ETF: 'hsl(260 28% 42%)',
  BOND: 'hsl(195 40% 34%)',
  GOVT_BOND: 'hsl(195 40% 34%)',
  CORPORATE_BOND: 'hsl(195 40% 34%)',
  FIXED_DEPOSIT: 'hsl(220 25% 50%)',
  RECURRING_DEPOSIT: 'hsl(220 25% 50%)',
  NPS: 'hsl(130 35% 34%)',
  PPF: 'hsl(130 35% 34%)',
  EPF: 'hsl(130 35% 34%)',
  PMS: 'hsl(165 30% 36%)',
  AIF: 'hsl(165 30% 36%)',
  PRIVATE_EQUITY: 'hsl(165 30% 36%)',
  REIT: 'hsl(12 50% 44%)',
  INVIT: 'hsl(12 50% 44%)',
  GOLD_BOND: 'hsl(36 60% 48%)',
  GOLD_ETF: 'hsl(36 60% 48%)',
  PHYSICAL_GOLD: 'hsl(36 60% 48%)',
  PHYSICAL_SILVER: 'hsl(220 10% 60%)',
  ULIP: 'hsl(340 35% 40%)',
  INSURANCE: 'hsl(340 35% 40%)',
  REAL_ESTATE: 'hsl(12 50% 44%)',
  CRYPTOCURRENCY: 'hsl(28 70% 54%)',
  CASH: 'hsl(80 28% 38%)',
  NSC: 'hsl(50 55% 45%)',
  ART_COLLECTIBLES: 'hsl(220 10% 60%)',
  OTHER: 'hsl(220 10% 60%)',
};
```
Replace with:
```ts
const ASSET_CLASS_COLORS: Record<string, string> = {
  EQUITY: 'hsl(70 95% 65%)',
  FUTURES: 'hsl(70 95% 65%)',
  OPTIONS: 'hsl(70 95% 65%)',
  MUTUAL_FUND: 'hsl(265 70% 72%)',
  ETF: 'hsl(265 70% 72%)',
  BOND: 'hsl(185 70% 55%)',
  GOVT_BOND: 'hsl(185 70% 55%)',
  CORPORATE_BOND: 'hsl(185 70% 55%)',
  FIXED_DEPOSIT: 'hsl(210 85% 65%)',
  RECURRING_DEPOSIT: 'hsl(210 85% 65%)',
  NPS: 'hsl(150 55% 55%)',
  PPF: 'hsl(150 55% 55%)',
  EPF: 'hsl(150 55% 55%)',
  PMS: 'hsl(190 60% 60%)',
  AIF: 'hsl(190 60% 60%)',
  PRIVATE_EQUITY: 'hsl(190 60% 60%)',
  REIT: 'hsl(25 80% 60%)',
  INVIT: 'hsl(25 80% 60%)',
  GOLD_BOND: 'hsl(40 90% 62%)',
  GOLD_ETF: 'hsl(40 90% 62%)',
  PHYSICAL_GOLD: 'hsl(40 90% 62%)',
  PHYSICAL_SILVER: 'hsl(0 0% 70%)',
  ULIP: 'hsl(330 70% 68%)',
  INSURANCE: 'hsl(330 70% 68%)',
  REAL_ESTATE: 'hsl(25 80% 60%)',
  CRYPTOCURRENCY: 'hsl(4 85% 66%)',
  CASH: 'hsl(150 55% 55%)',
  NSC: 'hsl(40 90% 62%)',
  ART_COLLECTIBLES: 'hsl(0 0% 70%)',
  OTHER: 'hsl(0 0% 70%)',
};
```

- [ ] **Step 4: Build check**

Run: `cd portfolioos/apps/web && npm run build`
Expected: build succeeds. Also run:
```bash
cd portfolioos/apps/web && grep -n "hsl(213 53%\|hsl(36 60%\|hsl(130 35%" src/pages/dashboard/DashboardPage.tsx
```
Expected: no matches (old palette fully removed from this file).

- [ ] **Step 5: Commit**

```bash
git add portfolioos/apps/web/src/pages/dashboard/DashboardPage.tsx
git commit -m "feat(theme): recolor dashboard charts/alerts for CRED-dark palette"
```

---

### Task 6: Remove the light/dark theme toggle

**Files:**
- Delete: `portfolioos/apps/web/src/stores/theme.store.ts`
- Modify: `portfolioos/apps/web/src/components/layout/Header.tsx`
- Modify: `portfolioos/apps/web/src/components/layout/AuthLayout.tsx`

**Interfaces:**
- Consumes: nothing (this task removes a dependency, doesn't add one).
- Produces: `Header` and `AuthLayout` no longer export or rely on any theme-toggle state; no other file in the codebase imports `useThemeStore` after this task (verified in Step 4).

- [ ] **Step 1: Delete the theme store**

```bash
rm portfolioos/apps/web/src/stores/theme.store.ts
```

- [ ] **Step 2: Remove the toggle from `Header.tsx`**

In `portfolioos/apps/web/src/components/layout/Header.tsx`:

Change the import line (currently line 3):
```tsx
import { LogOut, User, ChevronDown, Sun, Moon, Bell, Eye, EyeOff, Menu } from 'lucide-react';
```
to:
```tsx
import { LogOut, User, ChevronDown, Bell, Eye, EyeOff, Menu } from 'lucide-react';
```

Delete the import (currently line 6):
```tsx
import { useThemeStore } from '@/stores/theme.store';
```

Change (currently line 16):
```tsx
  const { dark, toggle } = useThemeStore();
```
Delete that line entirely.

Delete the theme-toggle button block (currently lines 83–92):
```tsx
        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggle}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="relative h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors focus-ring overflow-hidden"
        >
          <Sun className={cn('absolute h-4 w-4 transition-all', dark ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0')} strokeWidth={1.7} />
          <Moon className={cn('absolute h-4 w-4 transition-all', dark ? '-rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100')} strokeWidth={1.7} />
        </button>

```
(Delete the whole block, including the blank line after it — leave the `{/* Privacy toggle */}` button that follows untouched.)

- [ ] **Step 3: Remove the toggle from `AuthLayout.tsx`**

In `portfolioos/apps/web/src/components/layout/AuthLayout.tsx`:

Change the import line (currently line 3):
```tsx
import { Sun, Moon, ShieldCheck, TrendingUp, BarChart3 } from 'lucide-react';
```
to:
```tsx
import { ShieldCheck, TrendingUp, BarChart3 } from 'lucide-react';
```

Delete the import (currently line 4):
```tsx
import { useThemeStore } from '@/stores/theme.store';
```

Change (currently line 21):
```tsx
  const { dark, toggle } = useThemeStore();
```
Delete that line entirely.

Delete the theme-toggle block (currently lines 132–146):
```tsx
          {/* Theme toggle */}
          <div className="absolute top-5 right-6 z-10">
            <button
              type="button"
              onClick={toggle}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              className={cn(
                'relative h-9 w-9 rounded-md flex items-center justify-center border border-border/70 bg-card/70 backdrop-blur-sm',
                'text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors focus-ring overflow-hidden',
              )}
            >
              <Sun className={cn('absolute h-4 w-4 transition-all', dark ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0')} strokeWidth={1.7} />
              <Moon className={cn('absolute h-4 w-4 transition-all', dark ? '-rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100')} strokeWidth={1.7} />
            </button>
          </div>

```
(Delete the whole block, including the trailing blank line.)

- [ ] **Step 4: Verify no remaining references to the deleted store**

Run:
```bash
cd portfolioos/apps/web && grep -rn "theme.store\|useThemeStore" src
```
Expected: no output (no matches).

- [ ] **Step 5: Typecheck and build**

Run: `cd portfolioos/apps/web && npm run typecheck && npm run build`
Expected: both succeed with no errors (confirms `cn` import in both files is still used elsewhere in each file — check if either file's only use of `cn` was in the deleted block; if `npm run typecheck` flags an unused `cn` import in either file, remove that specific import line too).

- [ ] **Step 6: Commit**

```bash
git add -A portfolioos/apps/web/src
git commit -m "refactor(theme): remove light/dark toggle, app is dark-only now"
```

---

### Task 7: Manual visual verification on the Dashboard

**Files:** none (verification only).

**Interfaces:** N/A.

- [ ] **Step 1: Start the dev server**

Run (from repo root or `portfolioos/apps/web`):
```bash
cd portfolioos/apps/web && npm run dev
```
Expected: Vite dev server starts on `http://localhost:3030` with no console errors.

- [ ] **Step 2: Log in and open the Dashboard**

Navigate to `http://localhost:3030`, log in with an existing test account (or use whatever seeded credentials the project already uses for manual QA), land on `/dashboard`.

- [ ] **Step 3: Visual checklist**

Confirm each of the following against the reference cred.club screenshots and the spec's Section 5 checklist:
- Background reads as near-black (not pure `#000`, not the old parchment/gunmetal), body text is off-white and legible.
- `PageHeader` title ("Your financial portrait") renders in Fraunces at a bold weight, visibly different from the old thin Instrument Serif.
- Hero net-worth card (`tone="hero"`): radial mesh + grain reads as a moody vignette-glow, not washed out or overly dark; the `₹` figure and holdings/portfolios counts are legible.
- Alerts bar (if any test data has alerts): urgency colors (coral/amber/blue) are distinguishable from each other and from the lime accent.
- Liabilities card / metric cards: circular icon chips, lime hover ring visible on hover, no invisible borders.
- Trajectory chart + allocation pie: chart line and pie slice colors are distinguishable from each other and from the black background; legend text is legible.
- Top holdings table (desktop) and mobile card list (resize to ~375px width): asset-class dot colors distinguishable, positive/negative P&L colors read correctly (lime-family for gains, coral for losses).
- All buttons (Refresh, Export, View all, period-selector pills) render as full pills.
- No leftover "Switch to light/dark mode" toggle button anywhere in the header or auth pages.

If Playwright MCP tools are available in this environment, use them to navigate to `/dashboard` and take a screenshot for side-by-side comparison instead of (or in addition to) manual browser inspection.

- [ ] **Step 4: Record any follow-up items**

If any other page (spot-check at least one list page and one form/modal, per the spec's Non-goals) shows an obviously broken hardcoded color left over from the old palette, note it in a short list at the end of this plan file's execution log (or in a follow-up `BLOCKED.md`/task) — do not fix it in this pass, per the spec's scope.

No commit for this task (verification only, no file changes expected unless Step 4 surfaces a must-fix regression, in which case fix it as its own follow-up task with its own commit).
