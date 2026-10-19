# Mutual Funds Section — End-to-End Redesign Spec
**Date:** 2026-04-24  
**Status:** Approved for implementation

---

## 1. Overview

Redesign the Mutual Funds section from a single flat page into a two-level experience:

- `/mutual-funds` — scheme list with summary metrics, import history, grouping/search/sort
- `/mutual-funds/:fundId` — per-scheme detail with XIRR, capital gains, NAV chart, SIP tracker

All heavy computation moves server-side via a new `/api/mf/*` module. A small `SipPlan` DB migration enables manual SIP registry. Auto-SIP detection requires no migration.

---

## 2. Decisions Made

| Question | Answer |
|---|---|
| Navigation | List → detail page (not expand-in-place) |
| Detail metrics | Core + per-scheme XIRR + STCG/LTCG capital gains |
| SIP | Auto-detect from transaction patterns + manual registry |
| Charts | Value-over-time (invested vs current) + NAV history |
| List layout | Summary cards + sortable/filterable/groupable table |
| Import feedback | Persistent collapsible import history panel on list page |
| Architecture | New `/api/mf/*` module, new `mfInsights.service.ts` |

---

## 3. Database Change

### 3.1 New table: `SipPlan`

```prisma
model SipPlan {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  fundId     String?
  assetName  String?  // for schemes without a fundId
  amount     Decimal  @db.Decimal(12,2)
  frequency  String   // MONTHLY | QUARTERLY | ANNUAL
  dayOfMonth Int?     // 1–28, applicable for MONTHLY
  startDate  DateTime @db.Date
  isActive   Boolean  @default(true)
  notes      String?
  createdAt  DateTime @default(now())

  @@index([userId, isActive])
}
```

RLS policy: `USING (user_id = current_setting('app.current_user_id', true)::text)`.

### 3.2 Scheme identity rule

- Schemes with a `fundId` (AMFI-matched) get full detail pages.
- Schemes without a `fundId` (manually entered by name only) appear in the list with limited info. The "View details" link is disabled with a tooltip: "Add a scheme code to unlock full details."
- Route parameter: `:fundId` is the `MutualFundMaster.id`.

---

## 4. Backend: New `/api/mf/*` Module

### 4.1 New files

| File | Purpose |
|---|---|
| `packages/api/src/services/mfInsights.service.ts` | All MF aggregation logic |
| `packages/api/src/controllers/mf.controller.ts` | Route handlers |
| `packages/api/src/routes/mf.routes.ts` | Route definitions |

Register in `routes/index.ts`: `app.use('/api/mf', mfRouter)`.

### 4.2 Routes

```
GET  /api/mf/schemes                         listSchemes
GET  /api/mf/schemes/:fundId                 getScheme
GET  /api/mf/schemes/:fundId/xirr            getSchemeXirr
GET  /api/mf/schemes/:fundId/capital-gains   getSchemeCapitalGains  ?fy=2024-25
GET  /api/mf/schemes/:fundId/nav-history     getNavHistory          ?days=365
GET  /api/mf/schemes/:fundId/value-history   getValueHistory
GET  /api/mf/schemes/:fundId/transactions    getSchemeTransactions
GET  /api/mf/schemes/:fundId/sip             getSip
POST /api/mf/schemes/:fundId/sip             registerSip
DELETE /api/mf/schemes/:fundId/sip/:sipId    deleteSip
```

All routes require `authenticate` middleware. All Prisma queries scoped by `userId` (RLS also enforces).

### 4.3 `mfInsights.service.ts` — key functions

#### `listMfSchemes(userId)`
1. Query `HoldingProjection` where `portfolioId IN userPortfolios AND assetClass = MUTUAL_FUND`
2. Group by `fundId` (aggregate quantity, totalCost, currentValue, unrealisedPnL across portfolios)
3. Join `MutualFundMaster` for `schemeName`, `amcName`, `schemeCategory`, `isin`
4. Return sorted by `currentValue DESC` by default
5. **Does not compute XIRR** (loaded lazily on detail page)

Response shape per scheme:
```ts
{
  fundId: string
  schemeName: string
  amcName: string | null
  schemeCategory: string | null
  isin: string | null
  totalUnits: string          // Decimal serialised as string
  avgCostPrice: string
  totalCost: string
  currentValue: string | null
  unrealisedPnL: string | null
  unrealisedPnLPct: number | null
  currentNav: string | null
  navDate: string | null       // ISO date of last NAV
  portfolioCount: number       // how many portfolios hold this scheme
}
```

#### `computeSchemeXirr(userId, fundId)`
1. Get all MUTUAL_FUND transactions where `fundId = fundId AND portfolioId IN userPortfolios`
2. Build cashflow array: outflows (BUY/SIP/DEPOSIT types) negative, inflows (SELL/REDEMPTION/DIVIDEND_PAYOUT) positive
3. Terminal value: current holding value as of today (positive inflow at today's date)
4. Delegate to existing `computeXirr(cashflows)` from `xirr.service.ts`
5. Return `{ xirr: number | null, cashflowCount: number }`

#### `getSchemeCapitalGains(userId, fundId, fy?)`
1. Query `CapitalGain` where `fundId = fundId AND portfolioId IN userPortfolios`
2. Optionally filter by financial year (FY = April–March; e.g. `fy=2024-25` → April 2024 – March 2025)
3. Aggregate: totalStcg, totalLtcg, totalGain, rowCount
4. Return summary + individual rows

#### `getNavHistory(fundId, days = 365)`
1. Query `MFNav` where `fundId = fundId AND date >= today - days`
2. Return `{ date: string, nav: string }[]` sorted ascending

#### `getSchemeValueHistory(userId, fundId)`
1. Get all transactions for this scheme sorted by date
2. Generate weekly snapshot dates from first-buy-date to today
3. For each snapshot date:
   - `units = SUM(qty where buy-type AND date <= snapshot) - SUM(qty where sell-type AND date <= snapshot)`
   - `nav = nearest MFNav.nav on or before snapshot date`
   - `value = units × nav`
   - `invested = SUM(netAmount where buy-type AND date <= snapshot) - SUM(netAmount where sell-type AND date <= snapshot)`
4. Cap at 3 years (max ~156 weekly points). Return `{ date: string, value: string, invested: string }[]`

#### `detectSips(userId, fundId)`
Runs on transaction history, no DB writes needed:
1. Get BUY + SIP + DEPOSIT transactions for scheme, sorted by date
2. Compute intervals between consecutive transactions (in days)
3. Check for patterns: monthly (25–35 days apart), quarterly (85–95 days), annual (355–375 days)
4. A pattern is "detected" if 3+ consecutive transactions match the interval AND amounts are within 10% of each other
5. Return:
```ts
{
  detected: boolean
  frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | null
  typicalAmount: string | null
  streak: number             // consecutive matching installments
  startDate: string | null
  lastDate: string | null
  nextExpectedDate: string | null  // lastDate + interval
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
}
```

#### `getSipPlans(userId, fundId)` + `registerSip` + `deleteSip`
Standard CRUD on `SipPlan` table. `registerSip` validates: frequency, amount > 0, startDate valid, dayOfMonth 1–28 if MONTHLY.

---

## 5. Frontend

### 5.1 New files

| File | Purpose |
|---|---|
| `apps/web/src/api/mutualFunds.api.ts` | API client for `/api/mf/*` |
| `apps/web/src/pages/assetClasses/MutualFundsPage.tsx` | Redesigned list (replace existing) |
| `apps/web/src/pages/assetClasses/MutualFundDetailPage.tsx` | New per-scheme detail page |
| `apps/web/src/pages/assetClasses/components/ImportHistoryPanel.tsx` | Import history collapsible |
| `apps/web/src/pages/assetClasses/components/SipSection.tsx` | SIP auto-detect + manual registry |
| `apps/web/src/pages/assetClasses/components/CapGainsSection.tsx` | STCG/LTCG display |
| `apps/web/src/pages/assetClasses/components/SchemeCharts.tsx` | Value-over-time + NAV history charts |

Update `App.tsx`: add route `/mutual-funds/:fundId` → `<MutualFundDetailPage />`.

### 5.2 `MutualFundsPage` layout

```
PageHeader
  actions: [Import CAS] [Sync AMFI NAV] [+ Add Transaction]

ImportHistoryPanel  (collapsible, shows last 5 MF-related import jobs)

SummaryStrip
  [Total Value] [Invested] [Unrealised P&L] [Return %]  ← 4 metric cards

ActiveJobBanner  (only visible while a CAS import is PENDING/PROCESSING)

ControlsBar
  [Search schemes...]  [Sort: Value ▼]  [Group by: AMC ▼]

HoldingsTable  (grouped if group-by selected)
  Group header row (if grouped): AMC name, group subtotals
  Scheme rows: Name | AMC | Units | Avg Cost | NAV | Value | P&L | P&L% | →
    → clicking row navigates to /mutual-funds/:fundId
    → "View details" disabled + tooltip for schemes without fundId
```

The `[Import CAS]` button in the PageHeader toggles an inline upload section (dropzone) directly below the header — it does **not** navigate to `/import`. The dropzone is hidden by default and expands on click. This keeps the user on the list page so they can see the holdings update live after import completes.

Sort options: Value (desc), P&L % (desc/asc), Scheme name (A–Z).
Group options: None, By AMC, By Category.
Search: client-side filter on `schemeName` + `amcName`.

### 5.3 `MutualFundDetailPage` layout

```
← Back to Mutual Funds          [+ Add Transaction]

PageHeader
  title: schemeName
  subtitle: ISIN · AMC badge · Category badge · NAV last updated

MetricRow  (6 cards, skeleton while loading)
  Units Held | Avg Cost | Current NAV | Current Value | Unrealised P&L | XIRR

ChartsSection  (SchemeCharts component)
  Left panel: "Your Investment" — AreaChart (invested vs current value over time)
  Right panel: "Fund NAV" — LineChart (NAV price history, last 1Y default, 3M/6M/1Y/3Y toggle)

SipSection  (SipSection component)
  Auto-detected SIP card (if confidence >= MEDIUM):
    Frequency | Typical amount | Streak | Next expected: DD MMM YYYY
  "Register a manual SIP" button → inline form (amount, frequency, dayOfMonth, startDate)
  Manual SIP plans list (if any)

CapGainsSection  (CapGainsSection component)
  FY selector (All time | Current FY | dropdown of past FYs)
  Summary cards: [Total STCG] [Total LTCG] [Total Realised]
  Table: Sell date | Units | Buy price | Sell price | Gain | Type (STCG/LTCG)

TransactionSection
  "Transactions" heading with count badge
  Sortable table: Date | Type | Units | NAV | Amount | Portfolio | ✎ 🗑
  Inline add button at top
```

### 5.4 `ImportHistoryPanel`

- Uses `importsApi.list()`, filters to `importType === 'CAS_PDF' OR 'NSDL_CAS'`
- Shows last 5 completed jobs: file name, date, status badge, row count, errors
- Collapsed by default; auto-expands if any job is PENDING/PROCESSING
- "View all imports →" link to `/import`

### 5.5 `mutualFunds.api.ts` shape

```ts
export const mutualFundsApi = {
  listSchemes(): Promise<MfSchemeRow[]>
  getScheme(fundId: string): Promise<MfSchemeDetail>
  getXirr(fundId: string): Promise<{ xirr: number | null }>
  getCapitalGains(fundId: string, fy?: string): Promise<MfCapGainsSummary>
  getNavHistory(fundId: string, days?: number): Promise<NavPoint[]>
  getValueHistory(fundId: string): Promise<ValuePoint[]>
  getTransactions(fundId: string): Promise<TransactionDTO[]>
  getSip(fundId: string): Promise<SipInfo>
  registerSip(fundId: string, payload: RegisterSipPayload): Promise<SipPlan>
  deleteSip(fundId: string, sipId: string): Promise<void>
}
```

---

## 6. Data Loading Strategy (Detail Page)

To keep the detail page fast:

1. **Initial load** (parallel): `getScheme` + `getTransactions` + `getSip`
2. **Lazy load** (after initial render): `getXirr` (shows skeleton → value)
3. **On demand** (user scrolls to section or toggles): `getCapitalGains` + `getNavHistory` + `getValueHistory`

This ensures the page is interactive within ~300ms; heavy computations don't block it.

---

## 7. Accessibility Requirements

- All tables have `<caption>` and `scope` attributes on headers
- XIRR card: `aria-label="XIRR: 14.2%"` (not just the number)
- Charts: `role="img"` with `aria-label` describing the data
- Colour-only P&L indicators (green/red) also get an icon (▲/▼) and aria text
- Import history panel: `aria-expanded` toggle
- All buttons have descriptive labels (no icon-only buttons without `title`/`aria-label`)
- Keyboard navigable: scheme rows are `<a>` tags (not `<div onClick>`), so Tab/Enter work
- Screen reader announces when XIRR finishes loading (`aria-live="polite"` on metric cards)

---

## 8. Error States

| Scenario | Behaviour |
|---|---|
| No MF holdings | EmptyState with "Import CAS" and "Add transaction" CTAs |
| XIRR cannot converge | Show "—" with tooltip "Not enough data for XIRR calculation" |
| NAV not available | Show "—" in NAV column; nav-history chart shows gap |
| Capital gains empty | "No realisations in this period" message inside section |
| SIP detection insufficient data | Hide auto-detect card (< 3 transactions) |
| CAS import fails | Error badge on import history panel row; link to `/import/failures` |
| Scheme has no `fundId` | List row shows limited info; detail link disabled with tooltip |

---

## 9. Out of Scope (deferred)

- Goal allocation (which schemes mapped to which financial goals)
- Scheme comparison (A vs B performance)
- Direct plan vs Regular plan detection
- Exit load calculator
- Tax harvesting suggestions
- SIP pause/resume tracking
- Multi-currency MF holdings

---

## 10. Files Modified

**New files created:**
- `packages/api/src/services/mfInsights.service.ts`
- `packages/api/src/controllers/mf.controller.ts`
- `packages/api/src/routes/mf.routes.ts`
- `apps/web/src/api/mutualFunds.api.ts`
- `apps/web/src/pages/assetClasses/MutualFundDetailPage.tsx`
- `apps/web/src/pages/assetClasses/components/ImportHistoryPanel.tsx`
- `apps/web/src/pages/assetClasses/components/SipSection.tsx`
- `apps/web/src/pages/assetClasses/components/CapGainsSection.tsx`
- `apps/web/src/pages/assetClasses/components/SchemeCharts.tsx`
- `prisma/migrations/YYYYMMDD_sip_plan/migration.sql`

**Modified files:**
- `packages/api/src/routes/index.ts` (register mfRouter)
- `packages/api/prisma/schema.prisma` (add SipPlan model)
- `apps/web/src/App.tsx` (add `/mutual-funds/:fundId` route)
- `apps/web/src/pages/assetClasses/MutualFundsPage.tsx` (full rewrite)
