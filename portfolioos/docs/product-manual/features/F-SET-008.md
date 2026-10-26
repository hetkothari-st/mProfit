---
id: F-SET-008
title: "Account Access overview"
module: "Account Access"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-SET-004, S-SET-008]
related: [F-SET-009, F-SET-010, F-SET-011, F-SET-012, F-SET-013]
---

[← Account Access](../modules/account-access.md) · [Index](../INDEX.md)

# Account Access overview

`F-SET-008` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Lists every professional relationship in three groups: **With access** (can open your books now), **Waiting to accept** (invited, nothing shared yet) and **Past access** (withdrawn). Each active row shows a "reach" strip: **Sees**, **Can**, **Until**.

**Why it exists:** The code comment: the page answers "who may look at it, what they may look at, and until when" for each professional "at a glance".

**Where to find it:** Sidebar → **Account Access**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). While managing a family member's account ([R-MANAGER](../roles.md#r-manager)) the page shows your own relationships, not theirs.

**Steps**
1. Open **Account Access**. While loading, two grey placeholders show.
2. With no relationships: "Nobody else can see your books" with three numbered steps (Invite them by email — a link that "works once and expires in 14 days"; They accept from their own account — "Signing up is free for them"; You decide what they reach) and **Invite a professional**.
3. Otherwise read **With access N** ("These people can open your books right now.") and **Waiting to accept N** ("Nothing of yours is shared until they accept from their own account.").
4. Click **Past access (N)** to expand withdrawn relationships ("No access since <date>").
5. When a professional accepts while the page is open, a toast says "<name> accepted your invitation."

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Invite a professional** | Button (header and empty state) | [F-SET-009](F-SET-009.md) | — |
| **Manage access** / **Close** | Button | [F-SET-010](F-SET-010.md) | Active rows only |
| **Withdraw** | Button | [F-SET-011](F-SET-011.md) | Active rows only |
| **Send again** | Button | Opens "Send the invitation again" (same link, same expiry) | Invited rows only |
| **Cancel invitation** | Button | [F-SET-011](F-SET-011.md) | Invited rows only |
| **Past access (N)** | Expander | Shows withdrawn rows | Hidden when there are none |
| **Restore** | Button | [F-SET-011](F-SET-011.md) | Past rows where someone had accepted |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None directly; the reach strip summarises [S-SET-004](../settings/settings.md#s-set-004) to [S-SET-008](../settings/settings.md#s-set-008).

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Page shows the empty state even though you invited someone | The relationship feature is switched off on this server (ENABLE_FAMILY) | Contact the operator |

**Limitations:** Invited rows show "Link expires <date>"; an expired invitation stays in **Waiting to accept** until you cancel it.

**How it works:** GET `/api/me/professional-access/grants` returns every relationship you are the subject of, including unaccepted invitations, refreshed on a short live interval (and the activity feed at twice that interval). **Sees** reads "Everything" or counts of portfolios/categories/asset classes; **Can** reads "View only", "Make some changes" or "Keep your books"; **Until** reads the end date or "No end date".

**Related features:** [F-SET-009](F-SET-009.md), [F-SET-010](F-SET-010.md), [F-SET-011](F-SET-011.md), [F-SET-012](F-SET-012.md), [F-SET-013](F-SET-013.md), [D-SET-004](../dependencies.md#d-set-004).

**Sources:** `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:55`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:68`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:141`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:187`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:264`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:400`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:470`, `packages/api/src/routes/ca.routes.ts:182`
