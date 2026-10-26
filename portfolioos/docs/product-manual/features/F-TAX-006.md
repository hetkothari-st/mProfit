---
id: F-TAX-006
title: "STCG, LTCG and Intraday tabs"
module: "Tax Planning"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: [S-TAX-001]
related: [F-REPORT-006, F-REPORT-010, F-TAX-004]
---

[← Tax Planning](../modules/tax-planning.md) · [Index](../INDEX.md)

# STCG, LTCG and Intraday tabs

`F-TAX-006` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** Three lists for the FY: "Short-Term Capital Gains", "Long-Term Capital Gains" (with Indexed Cost) and "Intraday (Sec. 43(5) Speculative)", across all portfolios, with the same columns as [F-TAX-004](F-TAX-004.md).

**Why it exists:** Per-sale detail by tax bucket. Inferred from behavior.

**Where to find it:** **Planning → Tax Planning → STCG / LTCG / Intraday**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Open a tab and choose the year.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Review** badge | Tooltip | Reason for review | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-TAX-001](../settings/tax-planning.md#s-tax-001).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No records for selected FY." | No such sales | — |

**Limitations:** No download here; use Reports ([F-REPORT-006](F-REPORT-006.md), [F-REPORT-010](F-REPORT-010.md)).

**How it works:** `GET /api/tax/stcg|ltcg|intraday?fy` from the FIFO capital-gains engine over all your portfolios.

**Related features:** [F-REPORT-006](F-REPORT-006.md).

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:359`, `apps/web/src/pages/tax/TaxPage.tsx:748`, `packages/api/src/controllers/tax.controller.ts:74`
