# Post Office — Expandable Scheme Sections + Per-Holding Detail Pages

**Date:** 2026-07-04
**Status:** Approved design, pending implementation plan
**Area:** `apps/web` (frontend only — no backend/schema change)

---

## 1. Goal

Turn the Post Office page from a single flat list into a two-level experience:

1. **Landing** — an accordion of the 8 India Post schemes. Each scheme is an
   expandable section showing its holdings.
2. **Detail** — clicking a holding opens a dedicated page where the user manages
   that account/certificate: records transactions/deposits, and sees growth,
   composition, returns, and payout graphs.

No new asset classes, no backend or Prisma changes. XIRR and holdings are already
served by the API (`HoldingRow.xirr`, `portfoliosApi.holdings`).

---

## 2. Scope

**In scope**
- Rewrite `PostOfficePage` into an 8-scheme accordion (both levels of drill-down:
  section expands inline → holding row opens its own detail page).
- New `PostOfficeDetailPage` at route `/post-office/:holdingId`.
- Extract FD detail's pure math into a shared `depositMath.ts`; refactor
  `FdDetailPage` to import it (no behavior change).
- Extract the per-scheme config (`SCHEMES`) out of `PostOfficeFormDialog` into a
  shared module so the detail page and form share one source of truth; add a
  scheme→family behavior map.
- Unit tests for the shared math and the scheme→family map; a component smoke
  test per family.

**Out of scope**
- Any backend, API, or Prisma schema change.
- New asset classes or new transaction types.
- Changing FD/RD page behavior (only a mechanical import refactor).
- Consolidating FD and PO into one shared detail page (rejected — regression risk).

---

## 3. Chosen approach

**Accordion landing + new shared-math detail page (Approach A).**

Rejected alternatives:
- **B — one unified `DepositDetailPage` for FD + PO.** Maximum dedup but rewrites a
  working, tested FD surface. Not worth the regression risk now.
- **C — minimal (keep `SimpleAssetPage`, add grouping + click-to-detail).** Weakest
  "expandable section" UX and a detail page is needed regardless.

Approach A keeps FD rendering untouched, shares only pure functions, and delivers
the exact requested UX.

---

## 4. Landing page — `PostOfficePage`

Replaces the current `SimpleAssetPage` wrapper.

- **Top summary strip** (reused): total PO invested / current value / unrealised
  P&L across all 8 schemes.
- **Accordion** of all 8 schemes in `SCHEME_ORDER`
  (NSC, KVP, SCSS, SSY, MIS, RD, TD, Savings).

Each scheme section:
- **Header (always visible):** scheme label + full name, holding count, aggregate
  invested, aggregate current value, P&L (coloured), expand chevron.
- **Expanded body:** holdings table for that scheme. Each row is clickable and
  navigates to the detail page (`navigate('/post-office/:holdingId', { state: { holding } })`).
  A per-scheme **"Add [scheme]"** button opens `PostOfficeFormDialog` with the
  scheme preselected.
- **Empty scheme (0 holdings):** rendered collapsed as a thin "Add first NSC →"
  affordance so the user can still start one.

**Data:** same queries `SimpleAssetPage` uses today — portfolios list,
per-portfolio `portfoliosApi.holdings`, per-class `transactionsApi.list`. Holdings
are grouped by `assetClass` into sections; aggregates summed with `Decimal`.

**Accordion state** is local UI state (which sections are open). Default: sections
with holdings start expanded; empty ones collapsed.

---

## 5. Detail page — `PostOfficeDetailPage`

- **Route:** `/post-office/:holdingId` (added to `App.tsx`).
- **Holding source:** `location.state.holding` (same pattern as `FdDetailPage`).
  If absent, redirect to `/post-office`.
- **Transactions:** `transactionsApi.list({ assetClass: holding.assetClass, pageSize: 500 })`,
  filtered to this holding via the progressive isin/name match logic (reused from
  shared).

### 5.1 Scheme families

A `poSchemes.ts` map assigns each PO asset class a **family** that drives layout:

| Family | Schemes | Model |
|---|---|---|
| `LUMPSUM` | NSC, KVP, POST_OFFICE_TD | single deposit compounds → maturity |
| `RECURRING` | POST_OFFICE_RD, SSY | periodic installments, corpus grows |
| `PAYOUT` | POST_OFFICE_MIS, SCSS | principal flat, interest paid out periodically |
| `SAVINGS` | POST_OFFICE_SAVINGS | running balance, no maturity |

Each entry also carries `periodsPerYear` and a `payout` flag. Rate/label/maturity
data is reused from the shared `SCHEMES` config.

### 5.2 Layout (reuses FD detail shells)

- **Hero:** scheme badge, account name/number, rate %, term-progress bar +
  maturity badge. Term-progress bar and maturity badge are omitted for `SAVINGS`.
- **Stat grid:** Principal/Deposited · Current value · Interest earned (+%) · At maturity.
- **Graphs (all four):**
  1. **Projected growth** — area chart, deposit → maturity with a "today" marker
     (`LUMPSUM`/`RECURRING`). For `SAVINGS`, a running-balance line built from
     deposits/withdrawals instead.
  2. **Principal vs interest** — composition donut + stacked accrual area.
  3. **Returns (XIRR / CAGR)** — a stat + small gauge/bar, sourced from
     `holding.xirr`. No client recompute.
  4. **Interest payout timeline** — bar chart of periodic interest credits (real
     `INTEREST_RECEIVED` txns plus synthetic accruals). Primary graph for `PAYOUT`;
     shown as accrual bars for the others.
- **RECURRING** also renders the installment schedule (mark-paid / undo), reused
  from FD's `InstallmentSchedule`.
- **Transaction log:** add / edit / delete via `PostOfficeFormDialog`.
- **Missing rate/maturity:** amber CTA banner (like FD) prompting the user to add
  details; graphs gate on data presence.

---

## 6. Shared code

### 6.1 `apps/web/src/lib/depositMath.ts` (new)

Extract these pure functions from `FdDetailPage` (verbatim, no logic change):
`accruedValue`, `monthsBetween`, `addMonthsIso`, `shortMonth`, `formatDate`,
`daysUntil`, `INR_COMPACT`, and the chart tooltip style constants.

`FdDetailPage` is refactored to import them (delete local copies + import). This is
a mechanical change — the FD page must render and behave identically afterward.

### 6.2 Scheme config extraction

Move the `SCHEMES` / `SCHEME_ORDER` / `SchemeType` / `assetClassToScheme` config
out of `PostOfficeFormDialog` into a shared module (e.g.
`apps/web/src/lib/poSchemes.ts`). `PostOfficeFormDialog` imports from there; the
detail page and landing page reuse the same labels, rates, and ordering. Add the
family behavior map alongside.

---

## 7. Routing

Add to `App.tsx`:

```tsx
import { PostOfficeDetailPage } from './pages/assetClasses/PostOfficeDetailPage';
// ...
<Route path="/post-office/:holdingId" element={<PostOfficeDetailPage />} />
```

The existing `/post-office` route stays, now rendering the accordion landing.

---

## 8. Error handling

- Detail page with no `location.state.holding` → redirect to `/post-office`.
- Holding with no matched transactions → progressive match falls back to showing
  all txns in that portfolio+class (FD behavior), never an empty page.
- Missing rate/maturity → amber CTA banner; growth/composition graphs hidden until
  data present; returns/log still render.
- Money math via `Decimal` throughout (project invariant §3.2). No `Number`
  arithmetic on money.

---

## 9. Testing

- **`depositMath.test.ts`** — accrual correctness: LUMPSUM compounding to maturity,
  RECURRING staggered installments, PAYOUT flat-principal periodic interest. Assert
  exact `Decimal` values on known inputs.
- **`poSchemes.test.ts`** — every PO asset class maps to exactly one family with a
  valid `periodsPerYear`.
- **Component smoke test** — `PostOfficeDetailPage` renders without crashing for one
  holding of each family (LUMPSUM, RECURRING, PAYOUT, SAVINGS).

---

## 10. Files touched

**New**
- `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx`
- `apps/web/src/lib/depositMath.ts`
- `apps/web/src/lib/poSchemes.ts`
- `apps/web/src/lib/depositMath.test.ts`
- `apps/web/src/lib/poSchemes.test.ts`

**Modified**
- `apps/web/src/pages/assetClasses/PostOfficePage.tsx` (rewrite → accordion)
- `apps/web/src/pages/assetClasses/PostOfficeFormDialog.tsx` (import shared config)
- `apps/web/src/pages/assetClasses/FdDetailPage.tsx` (import shared math)
- `apps/web/src/App.tsx` (add detail route)

---

## 11. Done criteria

- Post Office landing shows 8 expandable scheme sections with per-scheme aggregates.
- Expanding a scheme lists its holdings; each holding row opens its detail page.
- Detail page renders all four graphs, adapts layout per family, and supports
  add/edit/delete of transactions.
- FD page behaves identically after the math extraction.
- New unit + smoke tests pass; full web build + typecheck + lint green.
