# CRED light mode + toggle restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the light/dark toggle (removed during the CRED-dark reskin) and give light mode its own CRED-styled palette — near-white canvas, same Fraunces/lime/pill-button language, contrast-safe accent/negative/positive text colors — so users can switch between CRED-dark and CRED-light.

**Architecture:** `globals.css` splits back into `:root` (light) + `.dark` (dark, values unchanged from the merged dark-only work) CSS custom properties. A new `--accent-ink` token decouples "bright lime for fills" from "readable-on-background accent for text," resolving to the same bright lime in dark mode and a darker olive in light mode. `theme.store.ts` (a Zustand store, deleted during the dark-only work) is recreated with `dark: true` as the default, and its toggle button returns to `Header.tsx`/`AuthLayout.tsx`. Two files have hardcoded literal color arrays that don't run through CSS tokens (`DashboardPage.tsx`, `AuthLayout.tsx`'s mock pie) — each gets a light-tuned counterpart array, selected at render time by reading the restored store's `dark` flag.

**Tech Stack:** React 18 + TypeScript + Vite, Tailwind CSS (CSS-variable-driven theme), Zustand (+ persist middleware) for the theme store.

## Global Constraints

- Default theme on first load (no stored preference yet) is **dark**, not light.
- `--accent` stays bright lime (`70 95% 65%`) in BOTH modes — used only for solid fills (buttons, chips, badges) where black text/icons sit on top regardless of page background.
- `--accent-ink` (new token) is what text/icon/ring uses resolve to: `70 95% 65%` (dark mode, same as `--accent`) / `70 75% 28%` (light mode, darker olive for contrast on white).
- `--negative`/`--destructive` darken in light mode (`4 75% 45%`) vs dark mode (`4 85% 62%`) for the same text-contrast reason.
- `--positive` in light mode is `100 65% 30%` — hue shifted ~30° from `--accent-ink`'s hue (70) so the two remain visually distinct, mirroring the ~15° separation already present between dark mode's `--accent` (hue 70) and `--positive` (hue 85).
- `--warning` in light mode is `35 85% 38%`.
- `--border`/`--input`/`--sidebar-border` must stay plain HSL triples (no embedded alpha) in both modes — the codebase uses Tailwind opacity modifiers (`border-border/70`, `bg-card/60`) extensively; a variable with embedded alpha breaks those.
- Light background: `--background: 0 0% 98%`, `--card: 0 0% 100%` (card brighter than background, mirroring dark mode's card-lifts-above-bg relationship), `--foreground: 0 0% 8%`.
- `--primary` inverts per mode: `0 0% 96%` (near-white pill, dark mode) / `0 0% 8%` (near-black pill, light mode).
- Dashboard/AuthLayout hardcoded color literals get a parallel light-tuned array each, selected by the restored `useThemeStore((s) => s.dark)` flag — not a CSS-token/SVG-var refactor.
- No automated test suite covers visual theming — verification is build/typecheck passing plus a manual visual check in both modes, not new unit tests.

---

### Task 1: Recreate `theme.store.ts` and wire `index.html`'s pre-hydration script

**Files:**
- Create: `portfolioos/apps/web/src/stores/theme.store.ts`
- Modify: `portfolioos/apps/web/index.html`

**Interfaces:**
- Consumes: nothing.
- Produces: `useThemeStore` — a Zustand hook exposing `{ dark: boolean; toggle: () => void }`. Tasks 2, 3, and 5 all import and call this hook.

- [ ] **Step 1: Create `theme.store.ts`**

Create `portfolioos/apps/web/src/stores/theme.store.ts` with:

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  dark: boolean;
  toggle: () => void;
}

function applyClass(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0d0d0d' : '#fafafa');
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      dark: true,
      toggle: () =>
        set((s) => {
          const next = !s.dark;
          applyClass(next);
          return { dark: next };
        }),
    }),
    {
      name: 'portfolioos.theme',
      onRehydrateStorage: () => (state) => {
        if (state) applyClass(state.dark);
      },
    },
  ),
);
```

(This is the pre-Task-6 file with two changes: `dark: false` → `dark: true`, and the `theme-color` hex values updated from the old `#0f172a`/`#022B54` to the new palette's `#0d0d0d`/`#fafafa`.)

- [ ] **Step 2: Replace `index.html`'s hardcoded dark class with a real pre-hydration script**

In `portfolioos/apps/web/index.html`, find:

```html
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

Replace with:

```html
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <script>
      try {
        var t = JSON.parse(localStorage.getItem('portfolioos.theme') || '{}');
        var dark = t.state ? t.state.dark !== false : true;
        if (dark) document.documentElement.classList.add('dark');
      } catch (e) {
        document.documentElement.classList.add('dark');
      }
    </script>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

(`t.state.dark !== false` means: if a stored preference exists and is explicitly `false`, honor light mode; otherwise — nothing stored yet, or stored value is `true` — default to dark. The `catch` block also defaults to dark, matching the "default dark" constraint even if `localStorage` is unavailable or the stored JSON is malformed.)

Then find:

```html
    <meta name="theme-color" content="#0d0d0d" />
```

Leave this line unchanged — it's the correct default for a dark first paint before the store hydrates; `theme.store.ts`'s `applyClass` (Step 1) updates it dynamically after hydration and on every toggle.

- [ ] **Step 3: Build check**

Run: `cd portfolioos/apps/web && npm run build`
Expected: build succeeds (no CSS/TS errors). This step only confirms the app compiles — it does not verify the toggle behaves correctly at runtime (that's Task 6).

- [ ] **Step 4: Commit**

```bash
git add portfolioos/apps/web/src/stores/theme.store.ts portfolioos/apps/web/index.html
git commit -m "feat(theme): recreate theme store + pre-hydration script, default dark"
```

---

### Task 2: Restore the toggle button in `Header.tsx`

**Files:**
- Modify: `portfolioos/apps/web/src/components/layout/Header.tsx`

**Interfaces:**
- Consumes: `useThemeStore` from `@/stores/theme.store` (produced by Task 1) — destructure `{ dark, toggle }`.
- Produces: nothing new for later tasks (this is a leaf UI change).

- [ ] **Step 1: Add the `Sun`/`Moon` icon imports and `useThemeStore` import**

In `portfolioos/apps/web/src/components/layout/Header.tsx`, find:

```tsx
import { LogOut, User, ChevronDown, Bell, Eye, EyeOff, Menu } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { usePrivacyStore } from '@/stores/privacy.store';
```

Replace with:

```tsx
import { LogOut, User, ChevronDown, Sun, Moon, Bell, Eye, EyeOff, Menu } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeStore } from '@/stores/theme.store';
import { usePrivacyStore } from '@/stores/privacy.store';
```

- [ ] **Step 2: Read `dark`/`toggle` from the store**

Find:

```tsx
  const { user, refreshToken, clearSession } = useAuthStore();
  const { hideSensitive, toggleHideSensitive } = usePrivacyStore();
```

Replace with:

```tsx
  const { user, refreshToken, clearSession } = useAuthStore();
  const { dark, toggle } = useThemeStore();
  const { hideSensitive, toggleHideSensitive } = usePrivacyStore();
```

- [ ] **Step 3: Add the toggle button, right before the Privacy toggle**

Find:

```tsx
        {/* Privacy toggle */}
        <button
          type="button"
          onClick={toggleHideSensitive}
```

Replace with:

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

        {/* Privacy toggle */}
        <button
          type="button"
          onClick={toggleHideSensitive}
```

- [ ] **Step 4: Build check**

Run: `cd portfolioos/apps/web && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add portfolioos/apps/web/src/components/layout/Header.tsx
git commit -m "feat(theme): restore theme toggle button in Header"
```

---

### Task 3: Restore the toggle button in `AuthLayout.tsx` + make its mock pie theme-aware

**Files:**
- Modify: `portfolioos/apps/web/src/components/layout/AuthLayout.tsx`

**Interfaces:**
- Consumes: `useThemeStore` from `@/stores/theme.store` (produced by Task 1) — destructure `{ dark, toggle }`.
- Produces: nothing new for later tasks (leaf UI change).

- [ ] **Step 1: Add the `Sun`/`Moon`/`cn`/`useThemeStore` imports**

In `portfolioos/apps/web/src/components/layout/AuthLayout.tsx`, find:

```tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, TrendingUp, BarChart3 } from 'lucide-react';
```

Replace with:

```tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, ShieldCheck, TrendingUp, BarChart3 } from 'lucide-react';
import { useThemeStore } from '@/stores/theme.store';
import { cn } from '@/lib/cn';
```

- [ ] **Step 2: Read `dark`/`toggle` from the store**

Find:

```tsx
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
```

Replace with:

```tsx
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  const { dark, toggle } = useThemeStore();
```

- [ ] **Step 3: Add the toggle button, right before the mobile brand mark**

Find:

```tsx
        {/* ─── Right — form panel ─── */}
        <main className="relative flex flex-col">
          {/* Mobile brand mark — only shows when left panel hidden */}
```

Replace with:

```tsx
        {/* ─── Right — form panel ─── */}
        <main className="relative flex flex-col">
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

          {/* Mobile brand mark — only shows when left panel hidden */}
```

- [ ] **Step 4: Make the mock allocation pie theme-aware**

Find:

```tsx
                <svg viewBox="0 0 120 120" className="h-[88px] w-[88px] shrink-0">
                  <circle cx="60" cy="60" r="46" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" />
                  {/* Donut segments — refined editorial palette */}
                  <circle cx="60" cy="60" r="40" fill="none" stroke="hsl(70 95% 65%)" strokeWidth="14" strokeDasharray="100 251" strokeDashoffset="0" transform="rotate(-90 60 60)" />
                  <circle cx="60" cy="60" r="40" fill="none" stroke="hsl(265 70% 72%)" strokeWidth="14" strokeDasharray="62 251" strokeDashoffset="-100" transform="rotate(-90 60 60)" />
                  <circle cx="60" cy="60" r="40" fill="none" stroke="hsl(25 80% 60%)" strokeWidth="14" strokeDasharray="48 251" strokeDashoffset="-162" transform="rotate(-90 60 60)" />
                  <circle cx="60" cy="60" r="40" fill="none" stroke="hsl(0 0% 70%)" strokeWidth="14" strokeDasharray="41 251" strokeDashoffset="-210" transform="rotate(-90 60 60)" />
                </svg>
                <div className="space-y-1.5 text-[11.5px]">
                  {[
                    { label: 'Equities', pct: '40%', color: 'hsl(70 95% 65%)' },
                    { label: 'Mutual Funds', pct: '25%', color: 'hsl(265 70% 72%)' },
                    { label: 'Real Estate', pct: '19%', color: 'hsl(25 80% 60%)' },
                    { label: 'Other', pct: '16%', color: 'hsl(0 0% 70%)' },
                  ].map((row) => (
```

Replace with:

```tsx
                <svg viewBox="0 0 120 120" className="h-[88px] w-[88px] shrink-0">
                  <circle cx="60" cy="60" r="46" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" />
                  {/* Donut segments — refined editorial palette, theme-aware */}
                  <circle cx="60" cy="60" r="40" fill="none" stroke={dark ? 'hsl(70 95% 65%)' : 'hsl(70 80% 38%)'} strokeWidth="14" strokeDasharray="100 251" strokeDashoffset="0" transform="rotate(-90 60 60)" />
                  <circle cx="60" cy="60" r="40" fill="none" stroke={dark ? 'hsl(265 70% 72%)' : 'hsl(265 55% 45%)'} strokeWidth="14" strokeDasharray="62 251" strokeDashoffset="-100" transform="rotate(-90 60 60)" />
                  <circle cx="60" cy="60" r="40" fill="none" stroke={dark ? 'hsl(25 80% 60%)' : 'hsl(25 75% 42%)'} strokeWidth="14" strokeDasharray="48 251" strokeDashoffset="-162" transform="rotate(-90 60 60)" />
                  <circle cx="60" cy="60" r="40" fill="none" stroke={dark ? 'hsl(0 0% 70%)' : 'hsl(0 0% 50%)'} strokeWidth="14" strokeDasharray="41 251" strokeDashoffset="-210" transform="rotate(-90 60 60)" />
                </svg>
                <div className="space-y-1.5 text-[11.5px]">
                  {[
                    { label: 'Equities', pct: '40%', color: dark ? 'hsl(70 95% 65%)' : 'hsl(70 80% 38%)' },
                    { label: 'Mutual Funds', pct: '25%', color: dark ? 'hsl(265 70% 72%)' : 'hsl(265 55% 45%)' },
                    { label: 'Real Estate', pct: '19%', color: dark ? 'hsl(25 80% 60%)' : 'hsl(25 75% 42%)' },
                    { label: 'Other', pct: '16%', color: dark ? 'hsl(0 0% 70%)' : 'hsl(0 0% 50%)' },
                  ].map((row) => (
```

- [ ] **Step 5: Build check**

Run: `cd portfolioos/apps/web && npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add portfolioos/apps/web/src/components/layout/AuthLayout.tsx
git commit -m "feat(theme): restore theme toggle + theme-aware mock pie in AuthLayout"
```

---

### Task 4: Split `globals.css` back into light/dark tokens, add `--accent-ink`

**Files:**
- Modify: `portfolioos/apps/web/src/styles/globals.css`

**Interfaces:**
- Consumes: nothing.
- Produces: `--accent-ink` custom property and its `.text-accent-ink` utility — consumed by every existing call site of that class (no code changes needed at those call sites, the class stays named the same).

- [ ] **Step 1: Replace the top doc comment**

Find:

```css
/* ─────────────────────────────────────────────────────────────────────────
   PortfolioOS — CRED-dark theme
   Near-black canvas, signature lime accent, Fraunces display serif.
   Dark-only — no light mode.
   ───────────────────────────────────────────────────────────────────────── */
```

Replace with:

```css
/* ─────────────────────────────────────────────────────────────────────────
   PortfolioOS — CRED theme
   Light : near-white canvas, darker olive accent-ink for text contrast
   Dark  : near-black canvas, signature bright-lime accent
   Both  : Fraunces display serif, lime fills, pill buttons
   ───────────────────────────────────────────────────────────────────────── */
```

- [ ] **Step 2: Replace the single `:root` block with a light `:root` + `.dark` split**

Find the entire current `:root { ... }` block:

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

Replace with:

```css
  :root {
    /* Surfaces — near-white, card brighter than bg (mirrors dark mode's lift) */
    --background: 0 0% 98%;
    --foreground: 0 0% 8%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 8%;
    --card-highlight: 0 0% 100%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 8%;

    /* Brand — black primary CTAs on white, mirrors dark mode's white-on-black pills */
    --primary: 0 0% 8%;
    --primary-foreground: 0 0% 98%;

    --secondary: 0 0% 94%;
    --secondary-foreground: 0 0% 8%;

    --accent: 70 95% 65%;                /* signature lime, ~#E2FE53 — same fill color both modes */
    --accent-foreground: 0 0% 8%;
    --accent-ink: 70 75% 28%;            /* darker olive — text/icon/ring use, passes contrast on white */

    --muted: 0 0% 95%;
    --muted-foreground: 0 0% 40%;

    --destructive: 4 75% 45%;             /* darker red than dark mode — text contrast on white */
    --destructive-foreground: 0 0% 98%;

    --border: 0 0% 88%;
    --input: 0 0% 88%;
    --ring: 70 75% 28%;                   /* = --accent-ink */

    --positive: 100 65% 30%;              /* darker green, hue shifted from --accent-ink for separation */
    --negative: 4 75% 45%;
    --warning: 35 85% 38%;

    --sidebar: 0 0% 97%;
    --sidebar-foreground: 0 0% 10%;
    --sidebar-accent: 0 0% 93%;
    --sidebar-accent-foreground: 70 75% 28%;
    --sidebar-border: 0 0% 88%;

    --shadow-color: 0 0% 10%;

    --radius: 1rem;

    /* Chart palette — darker/richer so it holds up on near-white */
    --chart-1: 70 80% 38%;
    --chart-2: 0 0% 25%;
    --chart-3: 4 75% 45%;
    --chart-4: 185 65% 35%;
    --chart-5: 265 55% 45%;
    --chart-6: 40 85% 40%;
    --chart-7: 210 75% 45%;
    --chart-8: 330 55% 45%;
  }

  .dark {
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
    --accent-ink: 70 95% 65%;            /* same as --accent — bright lime already pops on black */

    --muted: 0 0% 13%;
    --muted-foreground: 0 0% 62%;

    --destructive: 4 85% 62%;             /* warm coral-red */
    --destructive-foreground: 0 0% 96%;

    --border: 0 0% 18%;                   /* hairline, subtle-but-opaque against 5%/9% surfaces */
    --input: 0 0% 18%;
    --ring: 70 95% 65%;                   /* = --accent */

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

(`--radius` and `--shadow-color`'s dark value are duplicated verbatim into `.dark` rather than left mode-independent at `:root` — this matches how every other token in this file is organized, one block per mode, and avoids any surprise if a future edit touches one block assuming the other still has the same value.)

- [ ] **Step 3: Point `.text-accent-ink` at the new token**

Find:

```css
  .text-accent-ink { color: hsl(var(--accent)); }
```

Replace with:

```css
  .text-accent-ink { color: hsl(var(--accent-ink)); }
```

- [ ] **Step 4: Build check**

Run: `cd portfolioos/apps/web && npm run build`
Expected: build succeeds. Also run:

```bash
cd portfolioos/apps/web && grep -c "^\s*:root {" src/styles/globals.css && grep -c "^\s*\.dark {" src/styles/globals.css
```

Expected: both commands print `1` (exactly one `:root` block, exactly one `.dark` block — confirms the split landed cleanly with no duplicate/leftover blocks).

- [ ] **Step 5: Commit**

```bash
git add portfolioos/apps/web/src/styles/globals.css
git commit -m "feat(theme): split tokens back into light/dark, add --accent-ink"
```

---

### Task 5: Light-mode palettes for Dashboard's hardcoded colors

**Files:**
- Modify: `portfolioos/apps/web/src/pages/dashboard/DashboardPage.tsx`

**Interfaces:**
- Consumes: `useThemeStore` from `@/stores/theme.store` (produced by Task 1) — read `dark` inside the `DashboardPage` component.
- Produces: `urgencyColor(urgency, dark)`, `urgencyBg(urgency, dark)`, `assetClassColor(cls, dark)` — signatures now take an explicit `dark: boolean` second parameter (was: no second parameter). `UrgencyIcon` now takes `{ urgency, dark }` (was: `{ urgency }`). These are all call sites within this same file — nothing outside `DashboardPage.tsx` imports any of these.

- [ ] **Step 1: Import `useThemeStore`**

Find:

```tsx
import { usePrivacyStore } from '@/stores/privacy.store';
import { useAssetSectionsStore } from '@/stores/assetSections.store';
```

Replace with:

```tsx
import { usePrivacyStore } from '@/stores/privacy.store';
import { useThemeStore } from '@/stores/theme.store';
import { useAssetSectionsStore } from '@/stores/assetSections.store';
```

- [ ] **Step 2: Split `PIE_COLORS` into dark/light arrays**

Find:

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

Replace with:

```ts
// CRED-style chart palette — vivid, high-lightness so it reads on near-black
const PIE_COLORS_DARK = [
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

// Same hue families as PIE_COLORS_DARK, darkened/enriched to hold contrast on near-white
const PIE_COLORS_LIGHT = [
  'hsl(70 80% 38%)',    // olive-lime
  'hsl(0 0% 25%)',      // charcoal (replaces ivory, which vanishes on white)
  'hsl(4 75% 45%)',     // coral
  'hsl(185 65% 35%)',   // teal
  'hsl(265 55% 45%)',   // violet
  'hsl(40 85% 40%)',    // amber
  'hsl(210 75% 45%)',   // blue
  'hsl(330 55% 45%)',   // rose
  'hsl(150 55% 32%)',   // green
  'hsl(25 75% 42%)',    // orange
  'hsl(280 55% 45%)',   // purple
  'hsl(190 60% 35%)',   // cyan
];
```

- [ ] **Step 3: Split `urgencyColor`/`urgencyBg` to take a `dark` parameter**

Find:

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

Replace with:

```ts
function urgencyColor(urgency: 'HIGH' | 'MEDIUM' | 'LOW', dark: boolean) {
  if (dark) {
    if (urgency === 'HIGH') return 'text-[hsl(4_85%_70%)]';
    if (urgency === 'MEDIUM') return 'text-[hsl(40_90%_66%)]';
    return 'text-[hsl(210_85%_70%)]';
  }
  if (urgency === 'HIGH') return 'text-[hsl(4_75%_42%)]';
  if (urgency === 'MEDIUM') return 'text-[hsl(35_85%_38%)]';
  return 'text-[hsl(210_75%_42%)]';
}

function urgencyBg(urgency: 'HIGH' | 'MEDIUM' | 'LOW', dark: boolean) {
  if (dark) {
    if (urgency === 'HIGH') return 'bg-[hsl(4_85%_62%/0.12)] border-[hsl(4_85%_62%/0.35)]';
    if (urgency === 'MEDIUM') return 'bg-[hsl(40_90%_60%/0.12)] border-[hsl(40_90%_60%/0.35)]';
    return 'bg-[hsl(210_85%_65%/0.12)] border-[hsl(210_85%_65%/0.35)]';
  }
  if (urgency === 'HIGH') return 'bg-[hsl(4_75%_50%/0.08)] border-[hsl(4_75%_50%/0.3)]';
  if (urgency === 'MEDIUM') return 'bg-[hsl(35_85%_45%/0.08)] border-[hsl(35_85%_45%/0.3)]';
  return 'bg-[hsl(210_75%_50%/0.08)] border-[hsl(210_75%_50%/0.3)]';
}
```

- [ ] **Step 4: Update `UrgencyIcon` to take and thread `dark`**

Find:

```tsx
function UrgencyIcon({ urgency }: { urgency: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  if (urgency === 'HIGH') return <XCircle className={`h-4 w-4 flex-shrink-0 ${urgencyColor(urgency)}`} />;
  if (urgency === 'MEDIUM') return <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${urgencyColor(urgency)}`} />;
  return <Bell className={`h-4 w-4 flex-shrink-0 ${urgencyColor(urgency)}`} />;
}
```

Replace with:

```tsx
function UrgencyIcon({ urgency, dark }: { urgency: 'HIGH' | 'MEDIUM' | 'LOW'; dark: boolean }) {
  if (urgency === 'HIGH') return <XCircle className={`h-4 w-4 flex-shrink-0 ${urgencyColor(urgency, dark)}`} />;
  if (urgency === 'MEDIUM') return <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${urgencyColor(urgency, dark)}`} />;
  return <Bell className={`h-4 w-4 flex-shrink-0 ${urgencyColor(urgency, dark)}`} />;
}
```

- [ ] **Step 5: Split `ASSET_CLASS_COLORS` into dark/light maps**

Find:

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
function assetClassColor(cls: string): string {
  return ASSET_CLASS_COLORS[cls] ?? 'hsl(0 0% 70%)';
}
```

Replace with:

```ts
const ASSET_CLASS_COLORS_DARK: Record<string, string> = {
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

// Same hue families as ASSET_CLASS_COLORS_DARK, darkened for contrast on near-white
const ASSET_CLASS_COLORS_LIGHT: Record<string, string> = {
  EQUITY: 'hsl(70 80% 38%)',
  FUTURES: 'hsl(70 80% 38%)',
  OPTIONS: 'hsl(70 80% 38%)',
  MUTUAL_FUND: 'hsl(265 55% 45%)',
  ETF: 'hsl(265 55% 45%)',
  BOND: 'hsl(185 65% 35%)',
  GOVT_BOND: 'hsl(185 65% 35%)',
  CORPORATE_BOND: 'hsl(185 65% 35%)',
  FIXED_DEPOSIT: 'hsl(210 75% 45%)',
  RECURRING_DEPOSIT: 'hsl(210 75% 45%)',
  NPS: 'hsl(150 55% 32%)',
  PPF: 'hsl(150 55% 32%)',
  EPF: 'hsl(150 55% 32%)',
  PMS: 'hsl(190 60% 35%)',
  AIF: 'hsl(190 60% 35%)',
  PRIVATE_EQUITY: 'hsl(190 60% 35%)',
  REIT: 'hsl(25 75% 42%)',
  INVIT: 'hsl(25 75% 42%)',
  GOLD_BOND: 'hsl(40 85% 40%)',
  GOLD_ETF: 'hsl(40 85% 40%)',
  PHYSICAL_GOLD: 'hsl(40 85% 40%)',
  PHYSICAL_SILVER: 'hsl(0 0% 40%)',
  ULIP: 'hsl(330 55% 45%)',
  INSURANCE: 'hsl(330 55% 45%)',
  REAL_ESTATE: 'hsl(25 75% 42%)',
  CRYPTOCURRENCY: 'hsl(4 75% 45%)',
  CASH: 'hsl(150 55% 32%)',
  NSC: 'hsl(40 85% 40%)',
  ART_COLLECTIBLES: 'hsl(0 0% 50%)',
  OTHER: 'hsl(0 0% 50%)',
};

function assetClassColor(cls: string, dark: boolean): string {
  const map = dark ? ASSET_CLASS_COLORS_DARK : ASSET_CLASS_COLORS_LIGHT;
  return map[cls] ?? (dark ? 'hsl(0 0% 70%)' : 'hsl(0 0% 50%)');
}
```

- [ ] **Step 6: Read `dark` inside the component and select the active palettes**

Find:

```tsx
  const hideSensitive = usePrivacyStore((s) => s.hideSensitive);
```

Replace with:

```tsx
  const hideSensitive = usePrivacyStore((s) => s.hideSensitive);
  const dark = useThemeStore((s) => s.dark);
  const PIE_COLORS = dark ? PIE_COLORS_DARK : PIE_COLORS_LIGHT;
```

(`PIE_COLORS` is now a component-local `const`, computed once per render from the module-level `_DARK`/`_LIGHT` arrays — its two existing use sites, `PIE_COLORS[index % PIE_COLORS.length]` in the `<Cell>` fill and `PIE_COLORS[i % PIE_COLORS.length]` in the legend swatch, need no changes since the name `PIE_COLORS` still resolves, now to the theme-correct array.)

- [ ] **Step 7: Update all `urgencyColor`/`urgencyBg`/`UrgencyIcon`/`assetClassColor` call sites to pass `dark`**

Seven call sites in this file need the new `dark` argument added. Each is a small, exact substitution:

1. Find `<UrgencyIcon urgency={a.urgency} />` → replace with `<UrgencyIcon urgency={a.urgency} dark={dark} />`
2. Find `<UrgencyIcon urgency={highest} />` → replace with `<UrgencyIcon urgency={highest} dark={dark} />`
3. Find `` `flex items-stretch rounded-lg border text-sm ${urgencyBg(a.urgency)}` `` → replace with `` `flex items-stretch rounded-lg border text-sm ${urgencyBg(a.urgency, dark)}` ``
4. Find `` `text-xs font-medium flex-shrink-0 ${urgencyColor(a.urgency)}` `` → replace with `` `text-xs font-medium flex-shrink-0 ${urgencyColor(a.urgency, dark)}` ``
5. Find `` `w-full flex items-center gap-3 rounded-lg border px-4 py-2 text-sm text-left transition-colors hover:bg-foreground/[0.02] ${urgencyBg(highest)}` `` → replace with `` `w-full flex items-center gap-3 rounded-lg border px-4 py-2 text-sm text-left transition-colors hover:bg-foreground/[0.02] ${urgencyBg(highest, dark)}` ``
6. Find (in the top-holdings mobile list) `const color = assetClassColor(h.assetClass);` (first occurrence) → replace with `const color = assetClassColor(h.assetClass, dark);`
7. Find (in the top-holdings desktop table) `const color = assetClassColor(h.assetClass);` (second occurrence) → replace with `const color = assetClassColor(h.assetClass, dark);`

Then find the three remaining `urgencyBg`/`urgencyColor` call sites in the alerts/reminders section further down the file (goal/insurance renewal reminders):

8. Find `` `flex items-center justify-between rounded px-2.5 py-1.5 text-xs border ${urgencyBg(item.daysUntil <= 7 ? 'HIGH' : item.daysUntil <= 15 ? 'MEDIUM' : 'LOW')}` `` → replace with `` `flex items-center justify-between rounded px-2.5 py-1.5 text-xs border ${urgencyBg(item.daysUntil <= 7 ? 'HIGH' : item.daysUntil <= 15 ? 'MEDIUM' : 'LOW', dark)}` ``
9. Find `` `ml-2 flex-shrink-0 font-semibold ${urgencyColor(item.daysUntil <= 7 ? 'HIGH' : item.daysUntil <= 15 ? 'MEDIUM' : 'LOW')}` `` → replace with `` `ml-2 flex-shrink-0 font-semibold ${urgencyColor(item.daysUntil <= 7 ? 'HIGH' : item.daysUntil <= 15 ? 'MEDIUM' : 'LOW', dark)}` ``
10. Find `` `flex items-center justify-between rounded px-2.5 py-1.5 text-xs border ${urgencyBg(r.daysUntil <= 7 ? 'HIGH' : r.daysUntil <= 15 ? 'MEDIUM' : 'LOW')}` `` → replace with `` `flex items-center justify-between rounded px-2.5 py-1.5 text-xs border ${urgencyBg(r.daysUntil <= 7 ? 'HIGH' : r.daysUntil <= 15 ? 'MEDIUM' : 'LOW', dark)}` ``
11. Find `` `font-semibold ${urgencyColor(r.daysUntil <= 7 ? 'HIGH' : r.daysUntil <= 15 ? 'MEDIUM' : 'LOW')}` `` → replace with `` `font-semibold ${urgencyColor(r.daysUntil <= 7 ? 'HIGH' : r.daysUntil <= 15 ? 'MEDIUM' : 'LOW', dark)}` ``

(11 call sites total across steps 7-8-9-10-11 above — all within `DashboardPage.tsx`, all mechanical additions of a `, dark` / `dark={dark}` argument.)

- [ ] **Step 8: Typecheck and build**

Run: `cd portfolioos/apps/web && npm run typecheck && npm run build`
Expected: both succeed. TypeScript will fail loudly (missing argument) if any call site was missed, since `urgencyColor`/`urgencyBg`/`assetClassColor` now require a second parameter and `UrgencyIcon` now requires a `dark` prop — treat any typecheck error here as a signal to find the missed call site, not as an unrelated failure.

- [ ] **Step 9: Verify no old-only call sites remain**

Run:

```bash
cd portfolioos/apps/web && grep -n "urgencyColor(\|urgencyBg(\|assetClassColor(\|<UrgencyIcon" src/pages/dashboard/DashboardPage.tsx
```

Expected: every `urgencyColor(...)`, `urgencyBg(...)`, and `assetClassColor(...)` call shown includes `dark` as its final argument, and every `<UrgencyIcon .../>` includes `dark={dark}`. (The two function *definitions* — `function urgencyColor(urgency, dark) {` etc. — will also show up in this grep; that's expected, they're not call sites.)

- [ ] **Step 10: Commit**

```bash
git add portfolioos/apps/web/src/pages/dashboard/DashboardPage.tsx
git commit -m "feat(theme): light-mode palettes for dashboard charts/alerts/asset-class colors"
```

---

### Task 6: Manual visual verification (both modes)

**Files:** none (verification only).

**Interfaces:** N/A.

- [ ] **Step 1: Start the dev server**

Run: `cd portfolioos/apps/web && npm run dev`
Expected: Vite dev server starts on `http://localhost:3030` with no console errors.

- [ ] **Step 2: Verify dark mode (default) on `/login`**

Navigate to `http://localhost:3030/login`. Confirm: near-black background (unchanged from before this plan), the theme toggle button is now visible (top-right of the form panel), clicking it does nothing visually broken (transitions to light).

- [ ] **Step 3: Verify light mode on `/login`**

With the toggle now in light mode: confirm near-white background, near-black text, the "Sign in" pill button is now solid black (was white in dark mode) with white text, the mock allocation pie's four segments/legend swatches are all clearly visible against the white card (not washed out), the eyebrow label ("Private Wealth · India · est. 2026") and any `.text-accent-ink`-styled text reads as a darker olive rather than the bright lime (contrast check). Toggle back to dark and confirm it returns to the exact prior look.

- [ ] **Step 4: Reload and confirm persistence**

Reload the page while in light mode. Expected: light mode persists (localStorage-backed), no flash of the wrong theme before paint.

- [ ] **Step 5: If a backend is reachable, verify `/dashboard` in both modes**

Log in (demo credentials, if available) and check both light and dark mode on `/dashboard`: pie chart segments distinguishable in both modes, urgency alert colors (coral/amber/blue family) readable in both modes, top-holdings asset-class dot colors distinguishable in both modes. If no backend is reachable in this environment, note that explicitly rather than claiming this was checked — same limitation as the original CRED-dark plan's Task 7.

No commit for this task (verification only, no file changes expected unless Step 2-5 surfaces a must-fix regression, in which case fix it as its own follow-up task with its own commit).
