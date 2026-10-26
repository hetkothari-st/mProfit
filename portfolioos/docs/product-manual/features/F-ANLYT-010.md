---
id: F-ANLYT-010
title: "Sector allocation and XIRR by asset class"
module: "Analytics"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: [S-ANLYT-001]
related: [F-ANLYT-005]
---

[← Analytics](../modules/analytics.md) · [Index](../INDEX.md)

# Sector allocation and XIRR by asset class

`F-ANLYT-010` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** **Sector allocation** — pie of directly held stocks by sector (unknown = Unclassified; slices over 6% labelled). **XIRR by asset class** — bars of annualised return per asset type over the whole holding time (up to 12 classes; green gain, red loss).

**Why it exists:** Sector tilt and which asset types actually earn. From info text.

**Where to find it:** **Analytics → Detail**.

**Who can use it:** [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager).

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" buttons | Popovers | Definitions | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-ANLYT-001](../settings/analytics.md#s-anlyt-001).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No equity holdings to classify" | No direct stocks | — |
| "Not enough cashflows to compute XIRR" | No class has an XIRR | — |

**Limitations:** Mutual funds and other assets are not in the sector pie. Across several portfolios, class XIRR is an invested-weighted average.

**How it works:** Snapshot `sectorAllocation` (from the stock master's sector) and `assetClassXirr`.

**Related features:** [F-ANLYT-005](F-ANLYT-005.md).

**Sources:** `apps/web/src/pages/analytics/widgets/AllocationWidgets.tsx:86`, `apps/web/src/pages/analytics/widgets/AllocationWidgets.tsx:111`, `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:151`, `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:170`, `packages/api/src/services/analytics/analytics.service.ts:384`, `packages/api/src/services/analytics/analytics.service.ts:777`, `apps/web/src/pages/analytics/infoCopy.ts:118`
