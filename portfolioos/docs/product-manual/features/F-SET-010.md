---
id: F-SET-010
title: "Manage a professional's access (scope panel)"
module: "Account Access"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-SET-004, S-SET-005, S-SET-006, S-SET-007, S-SET-008]
related: [F-SET-008, F-SET-012]
---

[← Account Access](../modules/account-access.md) · [Index](../INDEX.md)

# Manage a professional's access (scope panel)

`F-SET-010` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Opens a panel under an active professional where you choose what they can do, which portfolios, categories and asset classes they can see, and the dates their access works.

**Why it exists:** The code comment: "the person whose books these are decides which portfolios a professional may open … and between which dates any of it works. A CA can read their own scope and nothing else."

**Where to find it:** **Account Access → With access → Manage access**.

**Who can use it:** The account holder ([R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)). Never the professional.

**Steps**
1. Click **Manage access**. The panel opens.
2. **What they can do** ("Reading is always included. Changing anything is up to you."): pick **View only** or **Keep my books**, or **Choose each permission** for the four switches.
3. **What they can see**: for **Portfolios**, **Categories** and **Asset classes** pick **All** or **Chosen** and tick items.
4. **When** ("Access stops by itself on the end date. Leave blank for no limit."): set **From** and/or **Until**.
5. The save bar says "You have unsaved changes". Click **Save access** (toast "Access saved") or **Discard**. With nothing changed, **Close**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **View only** / **Keep my books** | Mode cards | All permissions off / on | — |
| **Choose each permission** | Expander | Shows four switches | — |
| **Keep my books**, **Add and correct transactions**, **Upload statements**, **Set fair market values** | Switches | Individual permissions | — |
| **All** / **Chosen (n)** | Segmented control (×3) | Widen or narrow | — |
| Portfolio / category / asset-class chips | Chips | Pick items | — |
| **From**, **Until** | Date fields | Access window | — |
| **Save access** | Button | Saves | Disabled when nothing changed or while saving |
| **Discard** / **Close** | Button | Undo changes / close | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolios | Multi-select | No | Up to 200; must be yours | All | "One of those portfolios is not yours." |
| From / Until | Date | No | YYYY-MM-DD; Until not before From | Blank | "Access cannot end before it starts." / "<field> is not a real date." |

**Settings and toggles here:** [S-SET-004](../settings/settings.md#s-set-004) **What they can do** (default view only); [S-SET-005](../settings/settings.md#s-set-005) **Portfolios**, [S-SET-006](../settings/settings.md#s-set-006) **Categories**, [S-SET-007](../settings/settings.md#s-set-007) **Asset classes** (default All); [S-SET-008](../settings/settings.md#s-set-008) **When** (default no limit).

**Results:** The professional's access changes on their next request.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not save access" (or the server message) | Validation or permission failure | Read the message and correct |
| "That grant is not yours to manage." | Not your relationship | — |

**Limitations:** None beyond the rules above.

**How it works:** GET `/api/me/professional-access/<id>` returns the grant in full; PATCH `.../scope` accepts any subset: an absent field is untouched and an explicit `null` widens that dimension back to everything. Changes are logged in the professional activity log.

**Related features:** [F-SET-008](F-SET-008.md), [F-SET-012](F-SET-012.md), [D-SET-004](../dependencies.md#d-set-004).

**Sources:** `apps/web/src/components/ca/GrantScopePanel.tsx:42`, `apps/web/src/components/ca/GrantScopePanel.tsx:145`, `apps/web/src/components/ca/GrantScopePanel.tsx:300`, `apps/web/src/components/ca/GrantScopePanel.tsx:312`, `packages/api/src/controllers/ca.controller.ts:125`, `packages/api/src/services/ca/caAccess.service.ts:711`, `packages/api/src/services/ca/caAccess.service.ts:728`, `packages/api/prisma/schema.prisma:520`
