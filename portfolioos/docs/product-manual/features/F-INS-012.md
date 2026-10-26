---
id: F-INS-012
title: "Claim tracker"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-INS-011, F-INS-013, F-INS-021, F-INS-022]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Claim tracker

`F-INS-012` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Each claim on the policy page shows what is claimed, when it was reported and its status; a "next" box (**Waiting — until <date>**, **Waiting on the insurer**, **Next: raise a complaint**, **Next: the Insurance Ombudsman**, **Settled**, **Nothing to do**) with the reason; milestones; the escalation steps when relevant; the documents checklist with "N of M ready"; the guide's steps and rights on demand; and a **Notes** log. Settled claims fold under "N settled claim(s)".

**Why it exists:** To give "a nudge if the insurer runs past its time limit" (Claims card text) and keep a record of the claim.

**Where to find it:** Policy page (route `/insurance/:id`), **Claims** card.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Tick documents in the checklist as you gather them (saved at once).
2. Add a note: pick its date, type it, click **Add note**.
3. Click **Update** to change status and dates in **Update claim**; click **Save**. The toast "Claim updated" appears.
4. Click the bin to remove a claim; confirm "Remove this claim and its notes?". The toast "Claim removed" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Update** | Button | Opens **Update claim** | Never |
| Bin (aria "Remove the <type> claim") | Button | Removes after confirmation | Disabled while removing |
| Checklist boxes | Checkboxes | Mark documents ready | Disabled while saving; shown for claims with a known kind |
| **Show / Hide the steps and your rights** | Toggle | Shows the guide | Shown for claims with a known kind |
| **Add note** | Button | Appends a dated note | Disabled with an empty note |
| **Your complaint rights, in full** | Link | Opens the help library | In the escalation panel |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Status** | Select: Reported, Under review, Approved, Rejected, Settled | Yes | — | Current | — |
| **Claim number** | Text | No | Up to 100 | Current | — |
| **Every document submitted on** | Date | No | — | — | — |
| **Surveyor appointed on** | Date | No | Motor/home claims | — | — |
| **Amount paid (₹)** | Text | No | Digits | — | "Enter the amount paid, like 85000" |
| **Paid / decided on** | Date | No | — | — | — |
| **Reason given** | Text | No | Up to 1000 | — | — |
| **Complaint to insurer on**, **Complaint reference**, **Filed with Ombudsman on**, **Ombudsman reference** | Date / text | No | References up to 100; complaint dates not before the claim | — | "The complaint can't be dated before the claim" / "The Ombudsman complaint can't be dated before the claim" |
| Note | Date + text | Text required | Up to 500 characters; at most 200 notes | Today | "A claim can keep up to 200 notes" |

**Settings and toggles here:** None.

**Results:** Status, dates and notes are saved; the "next" action and reminders follow them. Settled in full moves the claim into the folded list.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not update the claim" / "Could not save" | Server rule or error | Read the message |

**Limitations:** A claim recorded with **Something else** has no checklist, guide or time limit.

**How it works:** `PATCH /api/insurance/claims/:claimId` and `DELETE /api/insurance/claims/:claimId`. Progress is computed by the shared `claimProgress`: decision due = clock start + the kind's days (clock starts at the claim date, the "every document submitted" date, or the surveyor date plus 1 day by default); short payment = settled amount below claimed. After a complaint, the insurer must reply within 14 days; after 30 days you can go to the Ombudsman, for claims up to ₹50 lakh.

**Related features:** [F-INS-011](F-INS-011.md), [F-INS-013](F-INS-013.md), [F-INS-022](F-INS-022.md), [F-INS-021](F-INS-021.md).

**Sources:** `apps/web/src/components/insurance/ClaimTracker.tsx:26`, `apps/web/src/components/insurance/ClaimTracker.tsx:302`, `apps/web/src/components/insurance/ClaimTracker.tsx:370`, `apps/web/src/components/insurance/ClaimTracker.tsx:465`, `apps/web/src/components/insurance/ClaimsSection.tsx:59`, `packages/shared/src/insurance/claimsGuide.ts:479`, `packages/shared/src/insurance/claimsGuide.ts:368`, `packages/api/src/services/insurance/insurance.service.ts:767`, `packages/api/src/services/insurance/insurance.service.ts:859`
