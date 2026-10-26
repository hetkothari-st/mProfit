---
id: F-REPORT-013
title: "Tax & CA Report Catalog (Plus)"
module: "Reports"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO (R-FREE: lock card)"
settings: []
related: [F-REPORT-012, F-REPORT-014, F-TAX-001]
---

[← Reports](../modules/reports.md) · [Index](../INDEX.md)

# Tax & CA Report Catalog (Plus)

`F-REPORT-013` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) ([R-FREE](../roles.md#r-free): lock card)

**What it does:** 34 further catalog reports, available from the Plus plan: Grandfathering LTCG (Sec 112A); Demat Account-wise Holdings; M2M Report — Equity + F&O; Short Term / Long Term / Speculation; Income Tax — Schedule 112A; Mutual Fund Capital Gain (Short + Long); Daily Transactions — Broker Bill Register; Income Statement; XIRR / TWR Performance; Tax Summary (Form 16 helper); Combined Realised / Unrealised G/L (Equity); Family-wise Holdings; Scriptwise — Qtywise; Contract Note Charges (Brokerage Statement); M2M Report — Mutual Funds; Financial Ledger; Closing Balance Report; Top Holdings Report; Sector Wise Allocation; Contract Notes Summary; Brokerwise Capital G/L; Tax P&L Summary; STT 10 DB Report; Capital Gains — FIFO; Advance Tax Summary; Opening Stock Report; Holding Period Return; Script Account Ledger; Fund Flow Statement; Broker Bill Register — Family/Member-wise; Portfolio Snapshot; Day Book; Dividend Report (Date-wise); Bank Reconciliation. Each card's description (shown on the page) states its content.

**Why it exists:** The paid "Tax & CA Report Catalog" for investors and their CAs. Inferred from the lock card wording.

**Where to find it:** **Tools → Reports → Tax & MIS downloads**, below the two free reports.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). [R-FREE](../roles.md#r-free) sees one card instead: "N more reports waiting for you — 34 in the Tax & CA Report Catalog on Plus — plus 6 Accounting Reports (Trial Balance, P&L, Balance Sheet, Tally exports) on Pro/Advisor." with **See plans**.

**Steps**
1. As [F-REPORT-012](F-REPORT-012.md): set inputs, click **PDF** or **Excel** on a card.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **PDF**, **Excel** | Buttons | Download | Cards hidden for [R-FREE](../roles.md#r-free) |
| **See plans** | Link | Opens `/pricing` | Shown only to [R-FREE](../roles.md#r-free) |

**Fields and rules:** As [F-REPORT-012](F-REPORT-012.md).

**Settings and toggles here:** As [F-REPORT-012](F-REPORT-012.md).

**Results:** A file is saved.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This feature requires the PLUS plan or higher" (inside the alert) | Plan lapsed or not Plus | Upgrade on **Pricing** ([D-REPORT-004](../dependencies.md#d-report-004)) |

**Limitations:** The Schedule 112A and other tax reports here accept **Whole family**, producing one section per member; the Tax Planning page refuses a combined filing for the same reason ([F-TAX-001](F-TAX-001.md)). Each card lists the inputs it uses; **Dividend Report (Date-wise)** is the only one that takes Financial year, From and To together.

**How it works:** Server gate `requireFeature('TAX_REPORT_CATALOG')` (minimum PLUS) on each `/api/reports/download/<endpoint>`. The browser hides the cards when the signed-in plan is below PLUS. Reports are built with the shared print layout engine and stamped with data-check lines.

**Related features:** [F-REPORT-012](F-REPORT-012.md), [F-REPORT-014](F-REPORT-014.md).

**Sources:** `apps/web/src/pages/reports/TaxMisDownloads.tsx:38`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:474`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:490`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:529`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:649`, `packages/api/src/routes/reports.routes.ts:85`, `packages/api/src/routes/reports.routes.ts:125`, `packages/api/src/middleware/requirePlan.ts:18`
