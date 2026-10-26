---
id: F-TAX-008
title: "Dividend & Interest tab"
module: "Tax Planning"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: [S-TAX-001]
related: [F-REPORT-007]
---

[← Tax Planning](../modules/tax-planning.md) · [Index](../INDEX.md)

# Dividend & Interest tab

`F-TAX-008` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** "Dividends ₹… · Interest ₹… · Maturity ₹… · Total ₹…" and a table Date, Type, Portfolio, Asset, Amount, Narration across all portfolios.

**Why it exists:** Income from other sources for the return. Inferred from behavior.

**Where to find it:** **Planning → Tax Planning → Dividend & Interest**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Open the tab and choose the year.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | — | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-TAX-001](../settings/tax-planning.md#s-tax-001).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No income in this FY." | Nothing recorded | — |

**Limitations:** The "Total" in this heading is computed by the server; the Reports Income tab labels maturity proceeds as principal, not income.

**How it works:** `GET /api/tax/income?fy`.

**Related features:** [F-REPORT-007](F-REPORT-007.md).

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:861`, `apps/web/src/pages/tax/TaxPage.tsx:898`, `packages/api/src/services/tax/tax.service.ts:210`
