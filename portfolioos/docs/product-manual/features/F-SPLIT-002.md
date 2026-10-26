---
id: F-SPLIT-002
title: "Add a person"
module: "Split Expenses"
status: Live
roles: "R-FREE…R-PRO, R-MANAGER"
settings: []
related: [F-SPLIT-003, F-SPLIT-015, F-SPLIT-019, F-SPLIT-020]
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# Add a person

`F-SPLIT-002` · Live · Roles: [R-FREE](../roles.md#r-free)…[R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** **Add a person** saves someone you split with: **Name**, **Email (optional)**, **Phone (optional)** ("Optional — used later to invite them.").

**Why it exists:** Inferred from behavior: people are reusable across groups and can later be invited or linked to an account by email.

**Where to find it:** **Tools → Split Expenses → Add person**; also **+ Add a person** in **New group** and **+ New person** in a group's **Settings** tab.

**Who can use it:** [R-FREE](../roles.md#r-free) and above, [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Enter **Name** (and optionally email/phone). Click **Add person**. The toast "<name> added" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add person** | Submit | Saves | While saving |
| **Cancel** | Button | Closes | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Name | Text | Yes | 1–120 characters | — | "Enter a name" |
| Email (optional) | Email | No | Valid email, up to 254 | — | "Invalid email address" |
| Phone (optional) | Text | No | 10–15 digits after cleaning; 10-digit numbers get 91 added | — | "Invalid phone number" |

**Settings and toggles here:** None.

**Results:** The person is saved to your contacts. If the email belongs to an existing account, they are linked to it.

**Errors and troubleshooting:** "Could not add the person" with the reason.

**Limitations:** The page has no way to edit or delete a person, or to store their UPI ID (the API supports all three, [F-SPLIT-020](F-SPLIT-020.md)).

**How it works:** `POST /api/split/contacts`. Email and phone are stored encrypted with a hash for matching.

**Related features:** [F-SPLIT-003](F-SPLIT-003.md), [F-SPLIT-015](F-SPLIT-015.md), [F-SPLIT-019](F-SPLIT-019.md).

**Sources:** `apps/web/src/pages/split/ContactDialog.tsx:36`, `apps/web/src/pages/split/ContactDialog.tsx:57`, `packages/api/src/controllers/split.controller.ts:28`, `packages/api/src/services/split/contacts.service.ts:65`
