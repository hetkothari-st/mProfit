---
id: F-REPORT-004
title: "Summary tab"
module: "Reports"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER"
settings: [S-REPORT-001]
related: [F-REPORT-005, F-REPORT-006, F-REPORT-008]
---

[← Reports](../modules/reports.md) · [Index](../INDEX.md)

# Summary tab

`F-REPORT-004` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows three cards — **Portfolio** (name, currency, number of transactions and holdings), **Unrealised** (Invested, Value, P&L) and **XIRR** (Overall, 1Y, 3Y, 5Y) — and a table **Capital Gains by Financial Year** with columns FY, Intraday, STCG, LTCG, Taxable, newest year first.

**Why it exists:** A one-screen overview of a book before drilling into individual reports. Inferred from behavior.

**Where to find it:** **Tools → Reports → Summary** (default tab).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) (managed person's data).

**Steps**
1. Open Reports. **Summary** shows for **All portfolios** (card title "All portfolios").
2. Choose a portfolio to see that book only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None besides the page filters | — | — | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-REPORT-001](../settings/reports.md#s-report-001) **Portfolio**.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No realised gains yet." | No sale has been matched to a purchase | None needed |
| XIRR shows "—" | Less than 90 days of cash-flow history in that window | Wait for more history |

**Limitations:** XIRR windows with less than 90 days of history show "—" rather than a number.

**How it works:** `GET /api/reports/summary`. Unrealised figures come from stored holdings; capital gains are FIFO-matched per FY; XIRR overall and rolling 1/3/5-year values are computed from your dated cash flows and are null when the span is under 90 days. Money is formatted with Indian grouping and banker's rounding to 2 decimals.

**Related features:** [F-REPORT-005](F-REPORT-005.md), [F-REPORT-006](F-REPORT-006.md), [F-REPORT-008](F-REPORT-008.md).

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:556`, `apps/web/src/pages/reports/ReportsPage.tsx:604`, `apps/web/src/pages/reports/ReportsPage.tsx:634`, `packages/api/src/services/reports/reports.service.ts:297`, `packages/api/src/services/reports/reports.service.ts:470`, `packages/api/src/services/analytics/xirr.reliability.ts:7`
