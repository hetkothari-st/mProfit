---
id: F-PORT-006
title: "Portfolio groups: create, edit, delete"
module: "Portfolios"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-PORT-007]
---

[← Portfolios](../modules/portfolios.md) · [Index](../INDEX.md)

# Portfolio groups: create, edit, delete

`F-PORT-006` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** "Create a portfolio group" ("Bundle multiple portfolios (e.g. each family member's investments) into a single consolidated view. Member portfolios stay independent for transactions.") lets you name a group, describe it and tick member portfolios. Edit changes them; **Delete group** removes the group only.

**Why it exists:** Code comment: "a user-owned bucket that bundles N of that same user's Portfolios into a single read view".

**Where to find it:** **Portfolios → New group**, or **Edit** on a group card.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) — only with portfolios you created.

**Steps**
1. Click **New group** (enabled once you have a portfolio).
2. Enter **Name** (placeholder "e.g. Kotharis") and optional **Description (optional)**.
3. Tick portfolios under **Member portfolios**. After the first tick, portfolios in other currencies are greyed out ("Group currency locked to <code>. Other-currency portfolios disabled.").
4. Click **Create group** (or **Save changes**). "Group created" / "Group updated" appears.
5. To delete, open **Edit**, click **Delete group** and confirm "Delete group "<name>"? Member portfolios are unaffected."

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Name** | Text | Group name | — |
| **Description (optional)** | Text area | Notes | — |
| **Member portfolios** checkboxes | Checkbox list | Choose members | Other-currency portfolios disabled once one is ticked |
| **Delete group** | Button | Deletes the group | Edit only |
| **Cancel** / **Create group** / **Save changes** | Buttons | Close / save | Save disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Name | Text | Yes | 1–100 characters | Empty | "Name is required"; server "Group name is required" |
| Description | Text | No | Up to 500 characters | Empty | — |
| Members | List | No | Your own portfolios, one currency | None | "One or more portfolios not owned by user"; "Group members must share a currency; got …" |

**Settings and toggles here:** None.

**Results:** The group card appears under **Family groups**. Deleting a group leaves its portfolios untouched.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Save failed" with a server message | Not your portfolio, or mixed currencies | Pick your own portfolios in one currency |
| "No portfolios available. Create individual portfolios first." | No portfolios | Create one first |

**Limitations:** Groups cannot include family members' portfolios or another person's; they are a personal view only, despite the "Family groups" heading. A group can be empty. Saving an edit sends name/description and members as two requests.

**How it works:** `POST /api/portfolio-groups` with `memberIds`; `PATCH /api/portfolio-groups/:id` then `PUT /api/portfolio-groups/:id/members`; every write checks the group and each portfolio belong to you and that member currencies match.

**Related features:** [F-PORT-007](F-PORT-007.md).

**Sources:** `apps/web/src/pages/portfolios/PortfolioGroupFormDialog.tsx:25`, `apps/web/src/pages/portfolios/PortfolioGroupFormDialog.tsx:65`, `apps/web/src/pages/portfolios/PortfolioGroupFormDialog.tsx:81`, `apps/web/src/pages/portfolios/PortfolioGroupFormDialog.tsx:114`, `apps/web/src/pages/portfolios/PortfolioGroupFormDialog.tsx:166`, `apps/web/src/pages/portfolios/PortfolioGroupFormDialog.tsx:194`, `packages/api/src/controllers/portfolioGroup.controller.ts:19`, `packages/api/src/services/holdings/portfolioGroup.service.ts:37`, `packages/api/src/services/holdings/portfolioGroup.service.ts:44`, `packages/api/src/services/holdings/portfolioGroup.service.ts:57`
