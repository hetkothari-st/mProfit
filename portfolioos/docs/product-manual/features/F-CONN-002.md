---
id: F-CONN-002
title: "Connected chatbots: revoke and recent activity"
module: "Connections"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-CONN-003, F-CONN-006]
---

[← Connections](../modules/connections.md) · [Index](../INDEX.md)

# Connected chatbots: revoke and recent activity

`F-CONN-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Lists every chatbot connected to your account with when it was connected and last used and what it may read; lets you revoke it and see its last 20 lookups.

**Why it exists:** The code comment: list and revoke are "Ungated on purpose: a downgraded user must always be able to see and revoke."

**Where to find it:** **AI connectors → Connected**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Each card shows the chatbot (ChatGPT or Claude), "Connected <date> - last used <date>" or "Not used yet", and badges for shared areas ("Overview only" when none) and "+N family".
2. Click **Recent activity** to see lines like "<tool> - one person - N rows - <date>" ("failed" when a lookup failed; "No lookups yet.").
3. Click **Revoke**, then **Revoke access** in "Revoke <chatbot>?" ("It will lose access to your EveryPaisa data straight away. You can connect it again later."). Toast "Access revoked".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Edit sharing** | Button | [F-CONN-003](F-CONN-003.md) | Hidden below Plus |
| **Revoke** → **Revoke access** | Buttons | Ends the connection | — |
| **Recent activity** | Link | Expands activity | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** A revoked chatbot is refused on its very next call.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not load your connections." | Load failed (or connectors switched off) | Reload |
| "Could not revoke. Try again." / "Connection not found" | Failure or already revoked | Reload |
| "Could not load activity." | Load failed | Retry |

**Limitations:** Activity shows the tool name, number of people and rows only, never the data itself. Only the last 20 lookups.

**How it works:** GET `/api/connect/connections` lists unrevoked grants, newest first. DELETE `/api/connect/connections/<id>` marks the grant revoked (audit `mcp_revoked`). Activity reads `mcp_tool_called` audit rows for that grant (20 newest). The chatbot's token is checked on every call with no caching.

**Related features:** [F-CONN-003](F-CONN-003.md), [F-CONN-006](F-CONN-006.md).

**Sources:** `apps/web/src/pages/settings/AiConnectorsPage.tsx:94`, `apps/web/src/pages/settings/AiConnectorsPage.tsx:137`, `apps/web/src/pages/settings/AiConnectionExtras.tsx:64`, `packages/api/src/routes/connect.routes.ts:30`, `packages/api/src/services/mcp/oauth.service.ts:323`, `packages/api/src/services/mcp/oauth.service.ts:337`, `packages/api/src/services/mcp/oauth.service.ts:394`
