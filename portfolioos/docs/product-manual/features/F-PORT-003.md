---
id: F-PORT-003
title: "Delete a portfolio"
module: "Portfolios"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-PORT-002]
---

[← Portfolios](../modules/portfolios.md) · [Index](../INDEX.md)

# Delete a portfolio

`F-PORT-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Permanently deletes a portfolio and everything recorded in it.

**Why it exists:** Inferred from behavior: remove portfolios you no longer need (and free a slot on your plan).

**Where to find it:** **Portfolios → Edit → Delete**.

**Who can use it:** The portfolio's creator; any active OWNER of the family a portfolio is shared into ([R-FAMOWNER](../roles.md#r-famowner)).

**Steps**
1. Click **Edit** on the portfolio, then **Delete**.
2. Confirm "Delete portfolio "<name>"? This cannot be undone." "Portfolio deleted" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Delete** | Button | Asks for confirmation, then deletes | Disabled while deleting |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The portfolio, its transactions, holdings, cash flows, capital-gain records and group memberships are deleted. Bank accounts or other records that pointed at it lose the link but are kept.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Delete failed" or the server's message | Not allowed, or server error | Check you own it |

**Limitations:** No undo and no archive.

**How it works:** `DELETE /api/portfolios/:id` after an ownership check; related rows are removed by database cascade.

**Related features:** [F-PORT-002](F-PORT-002.md).

**Sources:** `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:95`, `packages/api/src/services/holdings/portfolio.service.ts:360`, `packages/api/prisma/schema.prisma:1053`
