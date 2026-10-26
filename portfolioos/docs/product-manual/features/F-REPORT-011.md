---
id: F-REPORT-011
title: "Statements tab"
module: "Reports"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER"
settings: [S-REPORT-001, S-REPORT-002, S-REPORT-003]
related: [F-REPORT-010]
---

[← Reports](../modules/reports.md) · [Index](../INDEX.md)

# Statements tab

`F-REPORT-011` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager)

**What it does:** Four download cards, each with **PDF** and **Excel**: **Holdings Statement** (per-asset positions by class with avg cost, market value, unrealised P&L and allocation %), **Capital Gains Statement** (FIFO-matched Intraday, STCG and LTCG sections with FY totals), **Income Statement** (dividends, interest and maturity credits by category with FY totals) and **Transaction Ledger** (chronological book-style ledger with running balance). The two FY-based cards show "FY <year>".

**Why it exists:** Sectioned, FY-grouped statements in an industry-standard layout for filing and record keeping (code comment). The household versions of holdings live here.

**Where to find it:** **Tools → Reports → Statements**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (ungated); [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Choose **Portfolio** (and **Report for** if offered). Switch to an FY tab first if you need a different year — the Statements tab has no FY selector and uses the year last chosen (current FY by default).
2. Open **Statements** and click **PDF** or **Excel** on a card. A spinner shows on that card until the file is saved as `everypaisa-<card>-<FY>.pdf|xlsx`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **PDF**, **Excel** (per card) | Buttons | Download that statement | Disabled on that card while it downloads |

**Fields and rules:** Not applicable — uses the page filters.

**Settings and toggles here:** [S-REPORT-001](../settings/reports.md#s-report-001), [S-REPORT-002](../settings/reports.md#s-report-002), [S-REPORT-003](../settings/reports.md#s-report-003).

**Results:** A file is saved on your device.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Not signed in" | Session token missing | Sign in again |
| Alert with "Forbidden" | One portfolio is selected while **Report for** names another member | Set **Portfolio** to **All portfolios** |

**Limitations:** The FY selector is hidden on this tab. The ledger has no date range here (whole history). The file name carries the FY even for Holdings and Ledger.

**How it works:** `GET /api/reports/statement/holdings|capital-gains|income|ledger?portfolioIds&fy&format&theme` (capital gains with `kind=all`). `portfolioIds=all` means every portfolio of the person reported on; a specific id must belong to that person.

**Related features:** [F-REPORT-010](F-REPORT-010.md).

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:75`, `apps/web/src/pages/reports/ReportsPage.tsx:984`, `apps/web/src/pages/reports/ReportsPage.tsx:1002`, `apps/web/src/pages/reports/ReportsPage.tsx:1024`, `apps/web/src/pages/reports/ReportsPage.tsx:1078`, `packages/api/src/routes/reports.routes.ts:107`, `packages/api/src/controllers/reports.controller.ts:898`, `packages/api/src/controllers/reports.controller.ts:912`
