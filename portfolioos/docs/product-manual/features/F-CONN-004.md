---
id: F-CONN-004
title: "Allow family to include me in their AI connectors"
module: "Connections"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-CONN-003]
related: [F-CONN-003, F-CONN-005]
---

[← Connections](../modules/connections.md) · [Index](../INDEX.md)

# Allow family to include me in their AI connectors

`F-CONN-004` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Your consent for relatives who can already see your data in EveryPaisa to let their own chatbot read it too.

**Why it exists:** The code comment: "being included in a relative's connector is the relative's plan, not this user's" — so the consent is free on every plan.

**Where to find it:** **AI connectors**, bottom card.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Tick or untick "Allow family to include me in their AI connectors" ("When on, family members who can already see your data in EveryPaisa may also let their own ChatGPT or Claude read it. Off by default.").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Opt-in checkbox | Checkbox | Saves immediately | Disabled while loading or saving |

**Fields and rules:** Not applicable.

**Settings and toggles here:** [S-CONN-003](../settings/connections.md#s-conn-003) **Allow family to include me in their AI connectors** — on: you can be shared by relatives; off (default): you cannot.

**Results:** Turning it off removes you from relatives' chatbots on their next call.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not save. Try again." | Failure | Retry |

**Limitations:** Managed profiles (relatives without their own login) don't need this; the person keeping their books can share them.

**How it works:** GET/PUT `/api/connect/family-opt-in` reads/writes `User.aiConnectorFamilyOptIn`; audit `mcp_sharing_changed`.

**Related features:** [F-CONN-003](F-CONN-003.md), [F-CONN-005](F-CONN-005.md).

**Sources:** `apps/web/src/pages/settings/AiConnectorsPage.tsx:27`, `apps/web/src/pages/settings/AiConnectorsPage.tsx:126`, `packages/api/src/routes/connect.routes.ts:60`, `packages/api/src/services/mcp/oauth.service.ts:367`
