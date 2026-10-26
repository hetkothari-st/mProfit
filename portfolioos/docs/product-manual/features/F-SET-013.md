---
id: F-SET-013
title: ""Do you keep books for clients?" card"
module: "Account Access"
status: Live
roles: "R-PRO"
settings: []
related: [F-SET-003]
---

[← Account Access](../modules/account-access.md) · [Index](../INDEX.md)

# "Do you keep books for clients?" card

`F-SET-013` · Live · Roles: [R-PRO](../roles.md#r-pro)

**What it does:** For people on the Pro/Advisor plan who have no clients yet, shows a card pointing to the client books workspace.

**Why it exists:** The code comment: the sidebar's **Client books** entry appears only once a professional holds a grant, "so a practice that has just subscribed would otherwise have nowhere to start".

**Where to find it:** **Account Access**, below the relationships.

**Who can use it:** [R-PRO](../roles.md#r-pro) with no clients.

**Steps**
1. Read "Do you keep books for clients? Your plan lets you act for other people. Invite your first client to get started."
2. Click **Open client books** (goes to `/ca`, [D-SET-004](../dependencies.md#d-set-004)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Open client books** | Link button | Opens the workspace | Card hidden below Pro/Advisor, when you have clients, or when the client list errors |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** The workspace itself requires two-factor sign-in.

**How it works:** Checks the CA_WORKSPACE entitlement in the browser and GET `/api/ca/clients`.

**Related features:** [D-SET-004](../dependencies.md#d-set-004), [F-SET-003](F-SET-003.md).

**Sources:** `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:522`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:541`, `packages/api/src/routes/ca.routes.ts:71`

**What this area doesn't do**
- It does not show professionals you act for (that is **Client books**).
- It does not let you pick which professional actions are logged; everything is.
- It has no plan gate and no per-professional notification settings.
