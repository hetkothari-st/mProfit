---
id: F-REPORT-008
title: "XIRR tab"
module: "Reports"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER"
settings: [S-REPORT-001]
related: [F-ANLYT-002, F-REPORT-004]
---

[← Reports](../modules/reports.md) · [Index](../INDEX.md)

# XIRR tab

`F-REPORT-008` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager)

**What it does:** Table "Annualized Returns (XIRR)" with rows Overall, 1 Year, 3 Year, 5 Year and columns XIRR, Invested, Terminal Value, Cashflows.

**Why it exists:** Shows a money-weighted annual return that accounts for when each rupee went in or out. Inferred from behavior.

**Where to find it:** **Tools → Reports → XIRR**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Click **XIRR**. Hover a "—" to see "Less history than needed for a meaningful annual rate".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | — | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-REPORT-001](../settings/reports.md#s-report-001).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| XIRR "—" | Less than 90 days of history in the window | Wait |

**Limitations:** No download for this tab.

**How it works:** `GET /api/reports/xirr`; for **All portfolios** the user-level overall and rolling 1/3/5-year XIRR are computed, otherwise the portfolio's. A window is "reliable" only with at least 90 days of cash flows.

**Related features:** [F-REPORT-004](F-REPORT-004.md), [F-ANLYT-002](F-ANLYT-002.md).

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:867`, `apps/web/src/pages/reports/ReportsPage.tsx:905`, `packages/api/src/controllers/reports.controller.ts:281`, `packages/api/src/services/analytics/xirr.reliability.ts:7`
