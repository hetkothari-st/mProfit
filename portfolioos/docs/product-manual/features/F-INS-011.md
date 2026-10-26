---
id: F-INS-011
title: "Start a claim"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-INS-010, F-INS-012, F-INS-021, F-INS-022]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Start a claim

`F-INS-011` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** **Start a claim** asks "What happened?" with the claim kinds that fit the policy type, shows who to tell first (your saved helpline or the insurer's customer-care line), the step-by-step guide, documents checklist and rules, then records the claim to track it.

**Why it exists:** "Pick what happened, read what to do and what to gather, then start tracking it (the insurer still has to be told — this says how)." (code comment)

**Where to find it:** Policy page (route `/insurance/:id`), **Claims** card → **Start a claim**, or a kind button under "Nothing claimed on this policy."

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click **Start a claim**. Pick a kind (for example **Cashless hospitalisation**, **Reimbursement**, **Death claim**, **Maturity or survival benefit**, **Accident damage to your vehicle**, **Vehicle stolen**, **Home and contents**, **Accident — injury, disability or death**, **Travel**) or **Something else**. A policy with one fitting kind skips this step.
2. Read "First, tell <insurer>." and the guide.
3. Under **Track it here**, fill **Reported to the insurer on**, **Claim number** (optional), **What for** and **Amount claimed (₹)**.
4. Click **Start tracking**. The toast "Claim started — track it under Claims" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Kind tiles / **Something else** | Buttons | Choose the claim kind | — |
| **Choose a different kind of claim** | Button | Back to the kinds | Shown when more than one kind fits or for Something else |
| Helpline link | `tel:` link | Calls the insurer | Shown when a number is known |
| **Start tracking** | Button | Saves; "Saving…" | Hidden until a kind is chosen; disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Reported to the insurer on** | Date | Yes | — | Today | "Add the date you reported the claim" |
| **Claim number** | Text | No | Up to 100 | Empty | — |
| **What for** | Text | Yes | Up to 200 | The guide's title | "Say what the claim is for" |
| **Amount claimed (₹)** | Text | Yes | Digits with optional decimals | Empty | "Enter the amount you're claiming, like 85000" |

**Settings and toggles here:** None.

**Results:** A claim with status **Reported** is added and tracked ([F-INS-012](F-INS-012.md)); follow-up reminders start ([F-INS-022](F-INS-022.md)).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not start the claim" | Server error | Try again |

**Limitations:** Recording a claim here does not file it with the insurer.

**How it works:** `POST /api/insurance/policies/:id/claims` with `status: SUBMITTED` and the chosen kind. Guides and time limits come from the shared claims guide (for example a cashless or reimbursement health claim must be settled within 15 days of the claim being submitted; a death claim within 15 days, or 45 days if investigated; motor and home claims: survey report within 15 days of the surveyor's appointment, decision within 7 days).

**Related features:** [F-INS-010](F-INS-010.md), [F-INS-012](F-INS-012.md), [F-INS-021](F-INS-021.md).

**Sources:** `apps/web/src/components/insurance/StartClaimDialog.tsx:24`, `apps/web/src/components/insurance/StartClaimDialog.tsx:74`, `apps/web/src/components/insurance/StartClaimDialog.tsx:110`, `apps/web/src/components/insurance/ClaimsSection.tsx:30`, `packages/shared/src/insurance/claimsGuide.ts:113`, `packages/shared/src/insurance/claimsGuide.ts:410`, `packages/api/src/services/insurance/insurance.service.ts:869`
