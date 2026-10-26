---
id: F-TAX-004
title: "Schedule 112A tab and ITR-portal CSV"
module: "Tax Planning"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: [S-TAX-001, S-TAX-002, S-TAX-003]
related: [F-REPORT-006, F-TAX-010]
---

[← Tax Planning](../modules/tax-planning.md) · [Index](../INDEX.md)

# Schedule 112A tab and ITR-portal CSV

`F-TAX-004` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** Lists the FY's long-term sales of listed equity and equity-oriented funds ("Schedule 112A · LTCG on listed equity / equity MF") with Asset, ISIN, Buy, Sell, Qty, Cost, Proceeds, Gain/Loss, Taxable, Review; heading adds Exemption, Taxable, Rate and Est. Tax. When grandfathered lots exist, a line "FMV data: X of Y rows have FMV" with **Edit FMV values →**. **ITR-portal CSV** downloads the Schedule 112A file in the income-tax portal's column layout (ISIN, name, units, sale price, full value of consideration, cost without indexation, cost per unit, acquired before 01/02/2018, FMV per unit on 31/01/2018, …).

**Why it exists:** To fill ITR-2/ITR-3 Schedule 112A without retyping each sale. From the report descriptions.

**Where to find it:** **Planning → Tax Planning → Schedule 112A**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Open **Schedule 112A**, choose the year.
2. If "FMV data" shows rows without FMV, click **Edit FMV values →** ([F-TAX-010](F-TAX-010.md)).
3. Click **ITR-portal CSV**. The file `schedule-112a-<FY><member suffix>.csv` is saved.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **ITR-portal CSV** | Button | Download CSV | This tab only |
| **Edit FMV values →** | Link | Opens the Grandfathering tab | Shown when grandfathered rows exist |
| **Review** badge | Tooltip | Shows why a row needs checking | Only on rows needing review |

**Fields and rules:** Not applicable.

**Settings and toggles here:** [S-TAX-001](../settings/tax-planning.md#s-tax-001), [S-TAX-002](../settings/tax-planning.md#s-tax-002), [S-TAX-003](../settings/tax-planning.md#s-tax-003) (FMV overrides feed the CSV).

**Results:** A CSV is saved.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Amber notice "N row(s) qualify for indexation but the CII table has no entry for that financial year — …" | Missing cost inflation index year | Treat those rows as provisional |
| "No records for selected FY." | No such sales | — |

**Limitations:** The CSV button always downloads your own data even when **Download reports for** names another member (the file name then carries the member's name) — see DOCUMENTATION_GAPS.md.

**How it works:** Table: `GET /api/tax/schedule-112a?fy`. Rate shown = estimated tax ÷ taxable (or the statutory rate when nothing is taxable). The CSV button calls `GET /api/tax/grandfathering.csv?fy` (same builder as the grandfathering CSV, FMV column filled where known).

**Related features:** [F-TAX-010](F-TAX-010.md), [F-REPORT-006](F-REPORT-006.md).

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:212`, `apps/web/src/pages/tax/TaxPage.tsx:215`, `apps/web/src/pages/tax/TaxPage.tsx:304`, `apps/web/src/pages/tax/TaxPage.tsx:657`, `apps/web/src/pages/tax/TaxPage.tsx:665`, `apps/web/src/pages/tax/TaxPage.tsx:670`, `packages/api/src/services/tax/tax.service.ts:160`, `packages/api/src/services/tax/tax.service.ts:381`, `packages/api/src/controllers/fmv.controller.ts:117`
