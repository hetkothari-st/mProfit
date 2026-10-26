---
id: F-INS-010
title: "Who to call"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-INS-011, F-INS-020]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Who to call

`F-INS-010` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** The **Who to call** card holds your own contacts for the policy — **Insurer helpline**, **Claims email**, **Claims web page**, **TPA** and **TPA helpline** (health only), **Agent or advisor**, **Agent's phone**, **Agent's email** — and, for recognised insurers, the insurer's published directory (customer care, claim numbers, WhatsApp, emails, claim page, complaints) with when it was checked.

**Why it exists:** "The numbers someone needs in the moment they have to claim." (code comment)

**Where to find it:** Policy page (route `/insurance/:id`), **Who to call** card.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click **Add** (or **Edit**). The **Who to call** dialog opens.
2. Fill any fields; click save. The toast "Contacts saved" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add** / **Edit** | Button | Opens the dialog | Never |
| Phone numbers | `tel:` links | Dial; 1800 numbers marked "toll-free", 1860 "charges apply" | — |
| Directory links | Links | Open the insurer's pages | Shown for recognised insurers |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Claims email**, **Agent's email** | Text | No | Valid email | Empty | "\"x\" isn't an email address." |
| **Claims web page** | Text | No | Must start with https:// | Empty | "The claims page should start with https://" |
| Other fields | Text | No | Up to 200 characters | Empty | — |

**Settings and toggles here:** None.

**Results:** Contacts are saved and appear on the **Family insurance sheet** and in **Start a claim**.

**Errors and troubleshooting:** None beyond the field messages.

**Limitations:** The directory covers only insurers in the built-in list; its numbers are as checked on the stated date.

**How it works:** `PATCH /api/insurance/policies/:id` (`contacts`; null when all empty). The directory is matched from the insurer name.

**Related features:** [F-INS-011](F-INS-011.md), [F-INS-020](F-INS-020.md).

**Sources:** `apps/web/src/components/insurance/ContactsCard.tsx:17`, `apps/web/src/components/insurance/ContactsCard.tsx:91`, `apps/web/src/components/insurance/ContactsCard.tsx:165`, `apps/web/src/lib/insurerContacts.ts:12`, `apps/web/src/lib/insurerContacts.ts:20`
