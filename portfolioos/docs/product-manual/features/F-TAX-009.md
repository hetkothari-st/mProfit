---
id: F-TAX-009
title: "Tax Harvest tab"
module: "Tax Planning"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: [S-TAX-001]
related: [F-ANLYT-008]
---

[← Tax Planning](../modules/tax-planning.md) · [Index](../INDEX.md)

# Tax Harvest tab

`F-TAX-009` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** Cards **Total Unrealised Loss**, **STCG Loss Available** (with "Realised STCG this FY"), **LTCG Loss Available** (with "Realised LTCG this FY") and a table "Holdings sorted by unrealised loss (harvest candidates)": Asset, Class, Portfolio, Qty, Avg, CMP, Invested, Value, P&L, %, Classification (STCG LOSS, LTCG LOSS, STCG GAIN, LTCG GAIN), Days to LTCG.

**Why it exists:** Shows which holdings could be sold at a loss to offset this year's gains (tax-loss harvesting). From the page text.

**Where to find it:** **Planning → Tax Planning → Tax Harvest**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Open the tab. Biggest losses are listed first.
2. Read **Days to LTCG**: "LTCG ✓" means all units are already long-term; otherwise the days left (hover for the oldest buy date).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | — | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-TAX-001](../settings/tax-planning.md#s-tax-001) (for the realised-gain lines).

**Results:** View only; nothing is sold.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No holdings to analyse." | No capital-asset holdings | — |

**Limitations:** The footnote says classification "uses the oldest BUY in the lot — actual FIFO matching at sell time may differ", but the server now classifies by remaining FIFO lots; **Days to LTCG** is computed in the browser with 365 days (equity, ETF, mutual funds), 730 (foreign equity) or 1095 (others), which can differ from the server's rules for non-equity funds bought after 23-Jul-2024 (24 months). Colouring: 7 days or fewer shows in the positive colour, 8–30 days amber.

**How it works:** `GET /api/tax/harvest?fy`. For each capital-asset holding the remaining FIFO lots are valued at today's price; lot P&L is split into short- and long-term; classification is by the larger of the two; holdings with no transaction history count as one short-term lot. Rows sorted by unrealised P&L ascending. Deposits, PF, insurance and similar classes are skipped.

**Related features:** [F-ANLYT-008](F-ANLYT-008.md).

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:119`, `apps/web/src/pages/tax/TaxPage.tsx:910`, `apps/web/src/pages/tax/TaxPage.tsx:950`, `apps/web/src/pages/tax/TaxPage.tsx:1018`, `apps/web/src/pages/tax/TaxPage.tsx:1046`, `packages/api/src/services/tax/tax.service.ts:527`, `packages/api/src/services/tax/tax.service.ts:627`
