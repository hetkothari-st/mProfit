---
id: F-TAX-005
title: "Schedule 112 tab"
module: "Tax Planning"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: [S-TAX-001]
related: [F-TAX-002, F-TAX-004]
---

[← Tax Planning](../modules/tax-planning.md) · [Index](../INDEX.md)

# Schedule 112 tab

`F-TAX-005` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** "Schedule 112 · LTCG on other assets (with indexation)": long-term sales of non-equity assets with an **Indexed Cost** column.

**Why it exists:** ITR Schedule 112 detail for debt, gold, property and other assets. Inferred from the title.

**Where to find it:** **Planning → Tax Planning → Schedule 112**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Open the tab and choose the year.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Review** badge | Tooltip | Reason a row needs checking | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-TAX-001](../settings/tax-planning.md#s-tax-001).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Indexation notice (as [F-TAX-004](F-TAX-004.md)) | CII year missing | Treat as provisional |

**Limitations:** No download on this tab.

**How it works:** `GET /api/tax/schedule-112?fy`. Indexed cost = cost × CII(sale year) ÷ CII(purchase year) where indexation is available (transfers before 23-Jul-2024, or property bought before that date).

**Related features:** [F-TAX-002](F-TAX-002.md).

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:355`, `packages/api/src/services/tax/tax.service.ts:189`, `packages/api/src/services/tax/capitalGains.service.ts:23`, `packages/shared/src/finance/capitalGainsTaxRules.ts:105`
