# Post Office — Expandable Sections + Detail Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Post Office page into an 8-scheme accordion whose holdings open a per-holding detail page with transaction management and four graphs.

**Architecture:** Frontend-only (`apps/web`). Extract FD detail's pure math into `apps/web/src/lib/depositMath.ts`; extract the PO scheme config out of `PostOfficeFormDialog` into `apps/web/src/lib/poSchemes.ts` and add a scheme→family behaviour map. Rewrite `PostOfficePage` as an accordion; add `PostOfficeDetailPage` at `/post-office/:holdingId`. No backend/Prisma change.

**Tech Stack:** React 18 + TS + Vite, TanStack Query, recharts, decimal.js, react-router v6, Vitest.

## Global Constraints

- Money math via `decimal.js` only — no JS `Number` arithmetic on money (§3.2).
- Path alias `@/` → `apps/web/src`; `@everypaisa/shared` → shared src.
- Vitest default (node) env for pure-logic tests; component smoke test uses jsdom + `@testing-library/react`.
- `xirr` on `HoldingRow` is a fraction — display as `(xirr * 100).toFixed(2)%`.

---

### Task 1: Shared deposit math (`depositMath.ts`) + FD refactor

**Files:**
- Create: `apps/web/src/lib/depositMath.ts`
- Create: `apps/web/src/lib/depositMath.test.ts`
- Modify: `apps/web/src/pages/assetClasses/FdDetailPage.tsx` (delete local copies, import)

**Interfaces produced:** `accruedValue({principal,rate,startIso,valuationIso,periodsPerYear}): Decimal`, `monthsBetween(from,to): number`, `addMonthsIso(iso,months): string`, `shortMonth(iso): string`, `formatDate(iso): string`, `daysUntil(iso): number`, `normalizeText(v): string`, `INR_COMPACT(v:number): string`, `TOOLTIP_STYLE`, `TOOLTIP_LABEL_STYLE`.

- [ ] Move the pure functions/constants verbatim from `FdDetailPage.tsx` into `depositMath.ts`.
- [ ] Replace them in `FdDetailPage.tsx` with an import; FD renders identically.
- [ ] Write `depositMath.test.ts`: LUMPSUM compounding, staggered installment accrual, `monthsBetween`/`addMonthsIso` edge cases.
- [ ] Run `pnpm --filter @everypaisa/web test` → pass. Run `pnpm --filter @everypaisa/web typecheck` → clean.
- [ ] Commit `refactor(post-office): extract shared depositMath from FD detail`.

### Task 2: Scheme config + family map (`poSchemes.ts`)

**Files:**
- Create: `apps/web/src/lib/poSchemes.ts`
- Create: `apps/web/src/lib/poSchemes.test.ts`
- Modify: `apps/web/src/pages/assetClasses/PostOfficeFormDialog.tsx` (import config)

**Interfaces produced:** `SchemeType`, `SchemeConfig` (extended with `family: PoFamily; periodsPerYear: number; payout: boolean`), `PoFamily = 'LUMPSUM'|'RECURRING'|'PAYOUT'|'SAVINGS'`, `SCHEMES`, `SCHEME_ORDER`, `assetClassToScheme(ac): SchemeType`.

- [ ] Move config out of `PostOfficeFormDialog`; add `family`/`periodsPerYear`/`payout` per scheme.
- [ ] `PostOfficeFormDialog` imports from `poSchemes`.
- [ ] `poSchemes.test.ts`: every PO asset class → exactly one family with valid `periodsPerYear`.
- [ ] Test + typecheck pass. Commit `feat(post-office): shared scheme config + family map`.

### Task 3: Detail page (`PostOfficeDetailPage.tsx`) + route

**Files:**
- Create: `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx`
- Create: `apps/web/src/pages/assetClasses/PostOfficeDetailPage.test.tsx`
- Modify: `apps/web/src/App.tsx` (add route + import)

- [ ] Build detail page: hero, stat grid, four graphs, transaction log via `PostOfficeFormDialog`, family-driven layout, missing-rate CTA, redirect when no `location.state.holding`.
- [ ] Add `/post-office/:holdingId` route.
- [ ] Smoke test mounts one holding per family without crashing.
- [ ] Test + typecheck pass. Commit `feat(post-office): per-holding detail page with graphs`.

### Task 4: Accordion landing (`PostOfficePage.tsx` rewrite)

**Files:**
- Modify: `apps/web/src/pages/assetClasses/PostOfficePage.tsx`

- [ ] Rewrite as summary strip + 8-scheme accordion; expanded body lists holdings, row → detail page, per-scheme Add button.
- [ ] Full `pnpm --filter @everypaisa/web build && typecheck && lint && test` green.
- [ ] Commit `feat(post-office): expandable scheme-section landing page`.

---

## Self-Review

- Spec §4 landing → Task 4; §5 detail + 4 graphs → Task 3; §6.1 math → Task 1; §6.2 config → Task 2; §7 route → Task 3; §9 tests → Tasks 1-3. Covered.
- No placeholders; interfaces named consistently (`accruedValue`, `assetClassToScheme`, `SCHEME_FAMILY` via `SchemeConfig.family`).
