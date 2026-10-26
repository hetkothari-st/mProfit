---
id: F-CONN-003
title: "Edit what a chatbot can read"
module: "Connections"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO"
settings: [S-CONN-001, S-CONN-002, S-CONN-003]
related: [F-CONN-002, F-CONN-004, F-CONN-005]
---

[← Connections](../modules/connections.md) · [Index](../INDEX.md)

# Edit what a chatbot can read

`F-CONN-003` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Changes which areas, and which family members' data, an already-connected chatbot may read.

**Why it exists:** The code comment: "Widening what a chatbot reads is like approving it, so it needs the plan."

**Where to find it:** **AI connectors → (connection) → Edit sharing**.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click **Edit sharing**. "Edit what <chatbot> can read" opens.
2. Tick or untick areas under "Choose what <chatbot> can read", and people under "Whose data".
3. Click **Save**. Toast "Sharing updated".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Area checkboxes (11) | Checkboxes | [S-CONN-001](../settings/connections.md#s-conn-001) | — |
| Person checkboxes | Checkboxes | [S-CONN-002](../settings/connections.md#s-conn-002) | Disabled for people who have not opted in |
| **Save** / **Cancel** | Buttons | Save / close | Save disabled while saving |

**Fields and rules:** Not applicable — checkboxes only. Server errors: "Unknown sharing area", "One of these people cannot be shared".

**Settings and toggles here:** [S-CONN-001](../settings/connections.md#s-conn-001) **Choose what <chatbot> can read**; [S-CONN-002](../settings/connections.md#s-conn-002) **Whose data**.

**Results:** Takes effect on the chatbot's next call.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "One of these people cannot be shared" | Adding someone who has not opted in | Ask them to turn on [S-CONN-003](../settings/connections.md#s-conn-003) |
| "Could not save. Try again." / "This feature requires the PLUS plan or higher" | Failure / plan lapsed | Retry / upgrade |

**Limitations:** On Free you can no longer narrow sharing either; only revoke is available.

**How it works:** PATCH `/api/connect/connections/<id>` (requires the AI_CONNECTOR plan feature). People already on the connection who have since opted out or left are dropped quietly; adding someone new who cannot be shared is refused. Audit `mcp_sharing_changed`.

**Related features:** [F-CONN-002](F-CONN-002.md), [F-CONN-004](F-CONN-004.md), [F-CONN-005](F-CONN-005.md).

**Sources:** `apps/web/src/pages/settings/AiConnectionExtras.tsx:19`, `apps/web/src/pages/connect/SharingToggles.tsx:15`, `packages/api/src/routes/connect.routes.ts:71`, `packages/api/src/services/mcp/oauth.service.ts:159`, `packages/api/src/services/mcp/oauth.service.ts:374`
