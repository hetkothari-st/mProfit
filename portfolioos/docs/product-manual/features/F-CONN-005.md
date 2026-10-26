---
id: F-CONN-005
title: "Approve a chatbot connection"
module: "Connections"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO (decline: all signed in)"
settings: [S-CONN-001, S-CONN-002]
related: [F-CONN-001, F-CONN-006, F-PLAN-001]
---

[← Connections](../modules/connections.md) · [Index](../INDEX.md)

# Approve a chatbot connection

`F-CONN-005` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (decline: all signed in)

**What it does:** The page your chatbot sends you to when you click Connect in it. You choose what it can read and click **Approve**, or **Cancel**; either way the browser returns to the chatbot.

**Why it exists:** The code comment: "The user picks what to share; Approve or Cancel sends the browser back to the chatbot with a code or access_denied."

**Where to find it:** Opened by the chatbot (route `/connect/authorize?req=…`), outside the normal app layout. Signed-out visitors sign in first and come back.

**Who can use it:** Approve: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). Cancel: any signed-in person. Not [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Read "<chatbot> wants read-only access to your EveryPaisa data" and "Verified address: <host>".
2. On Free: "Connecting your own ChatGPT or Claude needs the Plus plan." with **See plans** and **Cancel**.
3. Otherwise tick areas ([S-CONN-001](../settings/connections.md#s-conn-001)) and people ([S-CONN-002](../settings/connections.md#s-conn-002)), read the four promises (read-only; account, card, policy and ID numbers shown as last 4 characters; data goes to OpenAI/Anthropic under your account; revocable in Settings > AI connectors).
4. Click **Approve** or **Cancel**. The browser goes back to the chatbot.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Area and person checkboxes | Checkboxes | What to share | Hidden below Plus |
| **Approve** | Button | Grants access | Hidden below Plus; disabled while saving |
| **Cancel** | Button | Declines | Disabled while saving |
| **See plans** | Link button | Opens Pricing | Only below Plus |
| **Go to Settings > AI connectors** | Link | Shown with an expired/missing request | — |

**Fields and rules:** Not applicable — checkboxes only.

**Settings and toggles here:** [S-CONN-001](../settings/connections.md#s-conn-001) (defaults: nine areas on, Will and succession and Documents off; a reconnect keeps the previous choice); [S-CONN-002](../settings/connections.md#s-conn-002) (nobody by default; a reconnect keeps previous shareable people).

**Results:** Approve: a connection (grant) is created or updated; you get an in-app alert and an email "<chatbot> connected to your EveryPaisa" ("Not you? Revoke it in Settings > AI connectors."). Cancel: the chatbot is told access was denied.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This connection request has expired. Start again from your chatbot." | More than 10 minutes, or already answered | Reconnect from the chatbot |
| "This link is missing its connection request. Start again from your chatbot." | Opened without `?req=` | Reconnect from the chatbot |
| "This connection request was already answered." | Double click | Reconnect if needed |
| "Could not save your choice. Try again." | Other failure | Retry |

**Limitations:** The chatbot's name shown is derived from where the approval code is sent (chatgpt.com/chat.openai.com → ChatGPT, claude.ai/claude.com → Claude), never from what the client calls itself. Only callback addresses on the server's allow-list can register.

**How it works:** The chatbot calls `/oauth/authorize`, which stores a 10-minute request and redirects to this page. GET `/api/connect/requests/<reqId>` returns the client name, host, current sharing and shareable people. POST `/decision` validates input, claims the request (single use), and on approval creates/updates the grant and a 60-second one-time code bound to the chatbot's PKCE challenge, then redirects to the chatbot's callback. Audit `mcp_connected` or `mcp_sharing_changed`.

**Related features:** [F-CONN-001](F-CONN-001.md), [F-CONN-006](F-CONN-006.md), [F-PLAN-001](F-PLAN-001.md), [W-CONN-001](../workflows/W-CONN-001.md).

**Sources:** `apps/web/src/pages/connect/ConnectAuthorizePage.tsx:24`, `apps/web/src/pages/connect/ConnectAuthorizePage.tsx:34`, `apps/web/src/pages/connect/ConnectAuthorizePage.tsx:71`, `apps/web/src/pages/connect/ConnectAuthorizePage.tsx:92`, `apps/web/src/pages/connect/ConnectAuthorizePage.tsx:105`, `packages/api/src/routes/connect.routes.ts:53`, `packages/api/src/services/mcp/oauth.service.ts:104`, `packages/api/src/services/mcp/oauth.service.ts:172`, `packages/api/src/services/mcp/notice.service.ts:12`, `packages/shared/src/aiConnector.ts:13`, `packages/shared/src/aiConnector.ts:39`
