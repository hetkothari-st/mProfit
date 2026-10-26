---
id: F-ANLYT-006
title: "Best and worst holdings"
module: "Analytics"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: [S-ANLYT-001]
related: [F-ANLYT-005]
---

[← Analytics](../modules/analytics.md) · [Index](../INDEX.md)

# Best and worst holdings

`F-ANLYT-006` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** One table of up to 5 biggest losers and 5 biggest gainers ranked by rupees, with Asset, Class, Value, Gain / loss and %.

**Why it exists:** "Ranked by rupees on purpose: a small holding down 40% matters less than a large one down 5%." (info text).

**Where to find it:** **Analytics → Overview**.

**Who can use it:** [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager).

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" button | Popover | Definition | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-ANLYT-001](../settings/analytics.md#s-anlyt-001).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No holdings yet" | No priced holdings | — |

**Limitations:** The server sends the top 10 gainers and losers by percentage; the page re-ranks only those by rupees, so a large-rupee loser outside the top 10 by percentage is not shown. Holdings without a price are left out.

**How it works:** Snapshot `topWinnersLosers` (n = 10 each, by % gain); browser re-sorts the union by rupee P&L and takes 5 each side.

**Related features:** [F-ANLYT-005](F-ANLYT-005.md).

**Sources:** `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:33`, `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:36`, `packages/api/src/services/analytics/analytics.service.ts:340`
