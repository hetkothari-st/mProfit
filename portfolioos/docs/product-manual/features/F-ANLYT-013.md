---
id: F-ANLYT-013
title: "What-if: simulate a sale"
module: "Analytics"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: []
related: [F-ANLYT-008]
---

[← Analytics](../modules/analytics.md) · [Index](../INDEX.md)

# What-if: simulate a sale

`F-ANLYT-013` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** Pick a holding, a **Sell qty** and optionally a **Sell price (opt.)**, click **Simulate**: shows Proceeds, the realised gain (labelled Realised STCG / Realised LTCG / Realised gain (mixed)), Est. tax (with rate), Net cash after tax, the split for mixed lots, the share taxed at your slab rate, "Matched N purchase lots oldest-first (FIFO), from <date> · cost basis ₹…", and "This holding: x% → y% of portfolio · N units left (₹…)". Nothing is sold.

**Why it exists:** To preview the tax and concentration effect of a sale before making it. From info text.

**Where to find it:** **Analytics → Detail**, card **What-if: simulate a sale**.

**Who can use it:** [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Choose a holding in **Select a holding…** (all your portfolios, units shown).
2. Enter **Sell qty** (placeholder = units held) and optionally a price (placeholder = current price).
3. Click **Simulate**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Holding** | Select | Holding to sell | — |
| **Sell qty** | Number | Units | — |
| **Sell price (opt.)** | Number | Price; blank = current price | — |
| **Simulate** | Button | Runs the simulation | Disabled until a holding and qty > 0 are set, and while running |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Sell qty | Number | Yes | > 0 and ≤ units held | Empty | "Sell quantity must be positive", "Sell quantity exceeds holding" |
| Sell price | Number | No | Decimal | Current price (else value ÷ qty, else average cost) | — |

**Settings and toggles here:** None (ignores the page's portfolio selector).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Holding not found" | Holding removed | Reload |
| "holdingId and sellQty are required" | Missing input | Fill both |

**Limitations:** "LTCG figures are approximate (the ₹1.25L exemption applies at the aggregate FY level); … Charges (brokerage, STT, stamp duty) are excluded." (disclaimer shown under the result).

**How it works:** `POST /api/analytics/what-if {holdingId, sellQty, sellPrice}` replays the portfolio's transactions to get open FIFO lots (holdings-only imports count as one short-term lot), prices the sale and taxes each part by its term and asset type at today's rates; non-equity short-term gains use your slab (30% if not on file).

**Related features:** [F-ANLYT-008](F-ANLYT-008.md).

**Sources:** `apps/web/src/pages/analytics/widgets/WhatIfSimulator.tsx:18`, `apps/web/src/pages/analytics/widgets/WhatIfSimulator.tsx:41`, `apps/web/src/pages/analytics/widgets/WhatIfSimulator.tsx:58`, `apps/web/src/pages/analytics/widgets/WhatIfSimulator.tsx:83`, `apps/web/src/pages/analytics/widgets/WhatIfSimulator.tsx:144`, `packages/api/src/controllers/analytics.controller.ts:28`, `packages/api/src/services/analytics/whatIf.service.ts:27`, `packages/api/src/services/analytics/whatIf.service.ts:32`, `packages/api/src/services/analytics/whatIf.service.ts:155`, `packages/api/src/services/analytics/whatIf.service.ts:84`

**What this area doesn't do**
- No benchmark comparison is drawn on the page (the API has one, unused).
- No export or download of the charts.
- It doesn't place or record trades — the what-if is a preview only.
- It doesn't show Sharpe ratio or beta.
