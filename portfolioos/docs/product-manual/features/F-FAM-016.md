---
id: F-FAM-016
title: "Hand a managed account to its owner"
module: "Family"
status: Live
roles: "R-FAMOWNER"
settings: []
related: [F-FAM-011, F-FAM-015, F-FAM-020]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Hand a managed account to its owner

`F-FAM-016` · Live · Roles: [R-FAMOWNER](../roles.md#r-famowner)

**What it does:** Sends the person a managed profile belongs to an invitation to take it over: they set a password and the profile becomes their own account with the same holdings and place in the family.

**Why it exists:** Code comment: "The profile already holds their FDs, policies and history; this offers the key to it rather than a second account."

**Where to find it:** Tree → managed member → **Edit** → "Has <name> got an email now?" → **Hand the account to them**.

**Who can use it:** Owners through the UI (the server also allows the keeper to create the invitation, but sending the email needs an owner).

**Steps**
1. Click **Hand the account to them**. **Their email** appears, pre-filled from the noted contact email.
2. Click **Next**. The email composer opens with the subject "<you> has set up your EveryPaisa account".
3. Edit and click **Send email**, or copy the link.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Hand the account to them** | Button | Opens the email field | — |
| **Next** | Button | Creates the claim invitation | Disabled when empty or while saving |
| **Send email** / copy link / **Later** | Buttons | As in [F-FAM-011](F-FAM-011.md) | As in [F-FAM-011](F-FAM-011.md) |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Their email** | Email | Yes | Must not already have an EveryPaisa account | Noted contact email | "A valid email is required." / "<email> already has an EveryPaisa account. Ask them to sign in with it — or use another address for this profile." |

**Settings and toggles here:** None.

**Results:** A hand-over invitation valid for 14 days exists (it does not take a seat). After they claim, nobody keeps their books any more.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "That member is no longer in this family." | Membership not active | — |
| "Could not send that invitation" toast | Server refused | Read the server message |

**Limitations:** Two accounts cannot be merged; the address must be unused.

**How it works:** `POST /api/families/:familyId/members/:memberUserId/claim-invite` creates a `FamilyInvitation` with `claimForUserId` set; the email button reads "Take over my account" and links to `/family/claims/:token` ([F-FAM-020](F-FAM-020.md)).

**Related features:** [F-FAM-015](F-FAM-015.md), [F-FAM-020](F-FAM-020.md).

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:1650`, `apps/web/src/pages/family/FamilyPage.tsx:1692`, `packages/api/src/services/family/familyClaim.service.ts:39`, `packages/api/src/services/family/familyClaim.service.ts:54`, `packages/api/src/services/family/familyInviteEmail.service.ts:59`
