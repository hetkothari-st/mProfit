---
id: F-ANLYT-011
title: "Money in and out; What you own and owe"
module: "Analytics"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: [S-ANLYT-001, S-ANLYT-002]
related: []
---

[← Analytics](../modules/analytics.md) · [Index](../INDEX.md)

# Money in and out; What you own and owe

`F-ANLYT-011` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** **Money in and out** — monthly bars of cash coming back to you (sales, dividends, interest, maturities) against money you put in (buys, SIPs, deposits), last 12 months. **What you own and owe** — You own, You owe, Net worth.

**Why it exists:** Cash direction and the net-worth picture. From info text ("Neither is good or bad — investing steadily sits below").

**Where to find it:** **Analytics → Detail**.

**Who can use it:** [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager).

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" buttons | Popovers | Definitions | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-ANLYT-001](../settings/analytics.md#s-anlyt-001), [S-ANLYT-002](../settings/analytics.md#s-anlyt-002) (cash chart).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No cashflow recorded" | No investment cash flows | — |

**Limitations:** Liabilities come from the dashboard net-worth service (loans, cards).

**How it works:** Snapshot `cashflowWaterfall` and `liabilitiesVsAssets` (dashboard net worth: total, liabilities, after liabilities).

**Related features:** [D-INTEL-001](../dependencies.md#d-intel-001).

**Sources:** `apps/web/src/pages/analytics/widgets/CashflowWidget.tsx:26`, `apps/web/src/pages/analytics/widgets/LiabilitiesWidget.tsx:15`, `packages/api/src/services/analytics/analytics.service.ts:883`, `packages/api/src/services/analytics/analytics.service.ts:937`, `apps/web/src/pages/analytics/infoCopy.ts:140`
