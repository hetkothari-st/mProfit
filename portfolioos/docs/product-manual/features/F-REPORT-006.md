---
id: F-REPORT-006
title: "Capital gains tabs: Intraday, STCG, LTCG, Schedule 112A"
module: "Reports"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER"
settings: [S-REPORT-001, S-REPORT-002, S-REPORT-003]
related: [F-REPORT-001, F-REPORT-010, F-TAX-004, F-TAX-006]
---

[← Reports](../modules/reports.md) · [Index](../INDEX.md)

# Capital gains tabs: Intraday, STCG, LTCG, Schedule 112A

`F-REPORT-006` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager)

**What it does:** Four tabs listing realised gains for the chosen FY, one row per FIFO match of a sale to a purchase: Asset, Buy Date, Sell Date, Qty, Buy ₹, Sell ₹, Cost, Proceeds, Gain/Loss, Taxable. The heading shows "<kind> · N rows · Total ₹…", plus "Exemption ₹…" and "Taxable ₹…" where they apply. **Intraday** = bought and sold the same day; **STCG** = short-term; **LTCG** = long-term; **Schedule 112A** = long-term gains on listed equity and equity-oriented funds, with the year's exemption.

**Why it exists:** Gives the per-sale detail a tax return needs, split the way the return asks for it. Inferred from behavior.

**Where to find it:** **Tools → Reports → Intraday / STCG / LTCG / Schedule 112A**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (on-screen and download are ungated); [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Open the tab, choose **Financial Year**.
2. Read the rows; click **Excel** or **PDF** to download.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Financial Year** | Select | Year of the sale | — |
| **Excel**, **PDF** | Buttons | Download | — |

**Fields and rules:** As [F-REPORT-001](F-REPORT-001.md).

**Settings and toggles here:** [S-REPORT-001](../settings/reports.md#s-report-001), [S-REPORT-002](../settings/reports.md#s-report-002) (download), [S-REPORT-003](../settings/reports.md#s-report-003).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No records for selected FY." | No sale of that kind in the FY | Pick another year |
| Gains look too high | A sale with no purchase is booked at zero cost (data checks: OVERSOLD) | Add the missing purchase |

**Limitations:** Long-term vs short-term follows the app's capital-gains rules table (equity long-term after 12 months; other classes 24 or 36 months depending on the transfer date). The Schedule 112A "Taxable" figure is after the FY exemption (₹1,00,000 from FY 2018-19, ₹1,25,000 from FY 2024-25) and includes grandfathered cost for equity bought on or before 31-Jan-2018.

**How it works:** `GET /api/reports/intraday|stcg|ltcg|schedule-112a?portfolioId&fy`. Rows come from the FIFO capital-gains engine; the Schedule 112A list keeps rows that are LONG_TERM and equity-oriented, and totals apply each FY's own exemption.

**Related features:** [F-REPORT-010](F-REPORT-010.md), [F-TAX-004](F-TAX-004.md), [F-TAX-006](F-TAX-006.md).

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:738`, `apps/web/src/pages/reports/ReportsPage.tsx:801`, `packages/api/src/controllers/reports.controller.ts:120`, `packages/api/src/services/reports/reports.service.ts:42`, `packages/api/src/services/reports/reports.service.ts:85`, `packages/shared/src/finance/capitalGainsTaxRules.ts:91`
