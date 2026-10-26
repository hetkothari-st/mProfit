---
id: F-REPORT-005
title: "Unrealised P&L tab"
module: "Reports"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER"
settings: [S-REPORT-001, S-REPORT-002]
related: [F-REPORT-003, F-REPORT-010]
---

[← Reports](../modules/reports.md) · [Index](../INDEX.md)

# Unrealised P&L tab

`F-REPORT-005` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager)

**What it does:** Lists every open holding with Asset, Class, Qty, Avg, CMP (current market price), Invested, Value, P&L and %, under a heading "N holdings · Invested ₹… · Value ₹… · P&L ₹…".

**Why it exists:** Shows what you would gain or lose if you sold everything today. Inferred from behavior.

**Where to find it:** **Tools → Reports → Unrealised P&L**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Click **Unrealised P&L**. The table loads for the selected portfolio(s).
2. Optional: click **Excel** or **PDF** to download it ([F-REPORT-010](F-REPORT-010.md)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Excel**, **PDF** | Buttons | Download this table | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-REPORT-001](../settings/reports.md#s-report-001) **Portfolio**; [S-REPORT-002](../settings/reports.md#s-report-002) **Report for** (download only).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A holding shows its cost as its value | No market price (see the data checks banner, MISSING_PRICE) | Wait for the price job or check the asset's identifier |

**Limitations:** Uses the latest stored price; no intraday pricing.

**How it works:** `GET /api/reports/unrealised` reads stored holdings and sums cost, value and P&L. Download uses the same endpoint with `format=xlsx|pdf`, footer "Total Cost / Total Value / Unrealised P&L".

**Related features:** [F-REPORT-003](F-REPORT-003.md), [F-REPORT-010](F-REPORT-010.md).

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:647`, `packages/api/src/controllers/reports.controller.ts:262`
