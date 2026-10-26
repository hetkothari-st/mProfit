---
id: F-DASH-018
title: "Daily net-worth snapshot"
module: "Dashboard"
status: Live
roles: "All users"
settings: []
related: [F-DASH-005]
---

[← Dashboard](../modules/dashboard.md) · [Index](../INDEX.md)

# Daily net-worth snapshot

`F-DASH-018` · Live · Roles: All users

**What it does:** Every night at 23:45 India time, EveryPaisa records each active user's net worth (gross, liabilities, net after liabilities and the breakdown) for that day. These records draw the Net worth over time chart.

**Why it exists:** Code comment: "so the dashboard trend chart has a time series to render", scheduled after the last price updates of the day.

**Where to find it:** Not a page; results appear in **Dashboard → Net worth over time**.

**Who can use it:** Runs for every active account automatically.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** None.

**Settings and toggles here:** None for users. Operators can switch it off (`ENABLE_NET_WORTH_SNAPSHOT_CRON=false`).

**Results:** One snapshot per user per day; running again the same day replaces it.

**Errors and troubleshooting:** None visible — a failure for one user is logged and the others continue.

**Limitations:** Snapshots use your personal figures with all portfolios (no family, no filter). A backend endpoint `POST /api/intelligence/net-worth/snapshot` can take today's snapshot on demand but the app has no button for it.

**How it works:** For each active user, runs the same net-worth calculation as the Dashboard under that user's data context and upserts `NetWorthSnapshot (userId, asOf)`. A second run while one is in progress is skipped.

**Related features:** [F-DASH-005](F-DASH-005.md).

**Sources:** `packages/api/src/jobs/netWorthSnapshotJob.ts:28`, `packages/api/src/jobs/netWorthSnapshotJob.ts:54`, `packages/api/src/jobs/netWorthSnapshotJob.ts:86`, `packages/api/src/jobs/netWorthSnapshotJob.ts:92`, `packages/api/src/controllers/intelligence.controller.ts:32`
