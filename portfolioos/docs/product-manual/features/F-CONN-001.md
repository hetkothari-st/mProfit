---
id: F-CONN-001
title: "Connect ChatGPT or Claude (AI connectors)"
module: "Connections"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-CONN-002, F-CONN-003, F-CONN-004, F-CONN-005]
---

[← Connections](../modules/connections.md) · [Index](../INDEX.md)

# Connect ChatGPT or Claude (AI connectors)

`F-CONN-001` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Gives you the EveryPaisa connector address and step-by-step instructions to add it as a custom connector in ChatGPT or Claude. The actual approval happens on [F-CONN-005](F-CONN-005.md) when the chatbot calls back.

**Why it exists:** The page text: "Let your own ChatGPT or Claude answer questions about your money using your EveryPaisa data. It can only read what you choose, never change anything, and you can revoke it any time."

**Where to find it:** **Planning → AI connectors** (route `/settings/ai-connectors`), header "AI connectors — Use your own ChatGPT or Claude with your EveryPaisa data."

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). On Free the connect card is behind a lock card with **View plans**. Not while managing a family member's account ([R-MANAGER](../roles.md#r-manager)): "AI connectors work on your own account only. Switch back to your own account."

**Steps**
1. Click **Connect ChatGPT** or **Connect Claude**. The address is copied (toast "Connector address copied") and the chatbot's connector settings open in a new tab.
2. Follow the three steps shown, e.g. for Claude: "In Claude, open Settings > Connectors and choose Add custom connector." → "Paste the address we copied for you and name it EveryPaisa." → "Click Connect, sign in to EveryPaisa if asked, choose what to share and Approve."
3. The chatbot opens the approval page ([F-CONN-005](F-CONN-005.md)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Connect ChatGPT** / **Connect Claude** | Buttons | Copy address, open the chatbot's settings, show steps | Behind the lock card below Plus |
| Connector address + copy button ("Copy connector address") | Text + icon button | Copies the address (toast "Copied") | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None on this card (see [F-CONN-003](F-CONN-003.md), [F-CONN-004](F-CONN-004.md)).

**Results:** Nothing changes until you approve the chatbot.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not copy. Copy the address below by hand." | Clipboard blocked | Select and copy the address |
| "Not found" in the Connected list | AI connectors are switched off on this server (MCP_ENABLED/API_PUBLIC_URL) | Contact the operator |

**Limitations:** "Custom connectors need a paid ChatGPT or Claude plan." ChatGPT may need developer mode on.

**How it works:** The address is the API's public origin + `/mcp` (from the web build setting, else the page's own origin). ChatGPT settings open at chatgpt.com, Claude at claude.ai.

**Related features:** [F-CONN-005](F-CONN-005.md), [F-CONN-002](F-CONN-002.md), [D-CONN-003](../dependencies.md#d-conn-003), [W-CONN-001](../workflows/W-CONN-001.md).

**Sources:** `apps/web/src/pages/settings/AiConnectorsPage.tsx:21`, `apps/web/src/pages/settings/AiConnectorsPage.tsx:53`, `apps/web/src/pages/settings/AiConnectorsPage.tsx:82`, `apps/web/src/pages/settings/AiConnectorsPage.tsx:89`, `apps/web/src/pages/settings/aiConnectorSetup.ts:6`, `apps/web/src/pages/settings/aiConnectorSetup.ts:23`, `packages/api/src/routes/connect.routes.ts:14`
