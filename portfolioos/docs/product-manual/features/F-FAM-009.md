---
id: F-FAM-009
title: "Add a member directly (managed member)"
module: "Family"
status: Live
roles: "R-FAMOWNER"
settings: [S-FAM-001, S-FAM-002, S-FAM-009]
related: [F-FAM-010, F-FAM-012, F-FAM-015, F-FAM-016, F-FAM-024]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Add a member directly (managed member)

`F-FAM-009` · Live · Roles: [R-FAMOWNER](../roles.md#r-famowner)

**What it does:** Adds a relative who has no email or login — a grandparent, a child — as a **managed member**: a real EveryPaisa profile that cannot sign in, kept by a member you choose, with its own default portfolio "<first name>'s portfolio". This is the default choice in the add dialog (**Add them now**).

**Why it exists:** Dialog comment: "Adding someone directly is the common case — a grandparent, a child, a spouse whose books the family already keeps." Service comment: "A grandparent without an email still has FDs, a pension and an LIC policy, and somebody in the family keeps them."

**Where to find it:** **Family → Members & sharing → Add member** (or a tree card's **Add a relative**) → **Add them now**.

**Who can use it:** Owners only ([R-FAMOWNER](../roles.md#r-famowner)).

**Steps**
1. Click **Add member**. The dialog "Add a family member" (or "Add a relative of <name>") opens with **Add them now** selected.
2. Enter **Their name**; optionally **Their email (optional)**.
3. In the relation picker, choose **Related to** and a relation under **As their** (or **Other…** and type one).
4. Choose **Their place in the family** and **Who keeps their books**.
5. Click **Add to family**. If a seat is free, the toast "<name> added to the family" appears and the dialog says "<name> is on the tree." If no seat is free, the seat payment starts ([F-FAM-012](F-FAM-012.md)).
6. If you keep their books, click **Open <name>'s account** to start recording for them ([F-FAM-024](F-FAM-024.md)); otherwise **Done**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add them now** / **Add several** / **Invite by email** | Radio cards | Choose how to add | Hidden after a member or invitation is created |
| **Add to family** | Button | Creates the managed member | Disabled until name, relation and keeper are set, or while saving |
| **Cancel** | Button | Closes | Disabled while saving |
| **Open <name>'s account** | Button | Enters their account | Shown only if you chose yourself as keeper |
| **Done** | Button | Closes | — |
| **Close** (×) / Escape | Button / key | Closes the dialog | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Their name** | Text | Yes | ≤ 80 characters | Empty | "Their name is required." / "That name is too long." |
| **Their email (optional)** | Email | No | Must contain "@" | Empty | "That email does not look right." |
| **Related to** | Select | Yes (UI) | An active member | You (or the tree card's person) | "They must be related to an active member of this family." |
| **As their** | Chips / free text | Yes (UI) | ≤ 40 characters stored | None | — |
| **Their place in the family** | Select | No | Contributor / Viewer | Contributor | — |
| **Who keeps their books** | Select | Yes | An active member with a login | You | "The manager must be an active member of this family." / "A managed profile cannot manage another one." |

**Settings and toggles here:** [S-FAM-001](../settings/family.md#s-fam-001) **Their place in the family** — Contributor: "counted in the household"; Viewer: "listed, but kept to the side" (it grants nothing, the person never signs in). [S-FAM-002](../settings/family.md#s-fam-002) **Who keeps their books** — only this person can open the account. [S-FAM-009](../settings/family.md#s-fam-009) **Related to / As their** — places them on the tree.

**Results:** A new profile, membership and default portfolio exist; the profile appears on the tree, in the portfolios list and in the keeper's "Accounts you manage" menu. The email is noted for a later hand-over and is never emailed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "OWNER role required." | You are not an owner | Ask an owner |
| Seat message then payment window | No free seat | Pay ([F-FAM-012](F-FAM-012.md)) or cancel an invitation |
| "… Payments are not configured on this server." | No free seat and payments not set up | Free a seat |

**Limitations:** A managed member can never be made an Owner. Members without a login are greyed out as keepers ("— no login yet").

**How it works:** `POST /api/families/:familyId/members/managed` (owner check in the service). Creates a `User` with an unroutable placeholder email under `.invalid`, an unusable password hash, role INVESTOR, plan FREE, `isShadowClient` true and `managedById` = keeper; an ACTIVE membership; and a default INVESTMENT portfolio in INR. Every sign-in path refuses such profiles. Tree placement happens after the commit and never undoes the add.

**Related features:** [F-FAM-010](F-FAM-010.md), [F-FAM-012](F-FAM-012.md), [F-FAM-015](F-FAM-015.md), [F-FAM-016](F-FAM-016.md), [F-FAM-024](F-FAM-024.md).

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:836`, `apps/web/src/pages/family/FamilyPage.tsx:947`, `apps/web/src/pages/family/FamilyPage.tsx:1088`, `apps/web/src/pages/family/FamilyPage.tsx:1126`, `apps/web/src/components/family/RelationPicker.tsx:76`, `packages/api/src/routes/families.routes.ts:132`, `packages/api/src/services/family/family.service.ts:862`, `packages/api/src/services/family/family.service.ts:1018`, `packages/api/src/services/family/managedProfile.service.ts:57`
