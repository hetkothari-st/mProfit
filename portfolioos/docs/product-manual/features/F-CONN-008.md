---
id: F-CONN-008
title: "Legacy broker connections (deprecated)"
module: "Connections"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-CONN-007]
---

[← Connections](../modules/connections.md) · [Index](../INDEX.md)

# Legacy broker connections (deprecated)

`F-CONN-008` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Lists broker accounts linked through an older paste-token flow, lets you sync them once more or remove them.

**Why it exists:** The card text: "These were linked via the older paste-token flow. Reconnect via the OAuth cards above to keep them in sync."

**Where to find it:** **Tools → Connectors → Legacy connections** (badge "deprecated"), shown only if you have any.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Each row shows label/provider, status (CONNECTED/ERROR/…), user id, "Last synced …" or "Never synced", and any last error.
2. Click the refresh icon ("Sync now"); toast "Synced N trades".
3. Click the bin icon ("Remove"), confirm "Remove this legacy connection?"; toast "Removed".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Sync now (icon) | Button | Syncs | Disabled while syncing |
| Remove (icon) | Button | Removes after confirm | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Synced trades are imported; removed connections disappear.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Server error message as a toast | Sync failed | Reconnect via the broker cards above |

**Limitations:** No way to add new legacy connections in the UI.

**How it works:** GET `/api/connectors`, POST `/api/connectors/<id>/sync`, DELETE `/api/connectors/<id>`.

**Related features:** [F-CONN-007](F-CONN-007.md).

**Sources:** `apps/web/src/pages/connectors/ConnectorsPage.tsx:336`, `apps/web/src/pages/connectors/ConnectorsPage.tsx:347`, `packages/api/src/routes/connectors.routes.ts:15`
