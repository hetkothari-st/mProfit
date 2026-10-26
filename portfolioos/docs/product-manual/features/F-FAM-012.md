---
id: F-FAM-012
title: "Pay for an extra family seat"
module: "Family"
status: Live
roles: "R-FAMOWNER"
settings: []
related: [F-FAM-003, F-FAM-009, F-FAM-011]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Pay for an extra family seat

`F-FAM-012` · Live · Roles: [R-FAMOWNER](../roles.md#r-famowner)

**What it does:** When adding one more person (by invitation or as a managed member) would exceed the family's included seats, the app explains what is using the seats and opens a Razorpay checkout for one extra seat; the person is added only after the payment verifies.

**Why it exists:** Service comment: an earlier version allowed adding "on credit", which "meant a user could add a paid seat, use it, and churn before the deferred charge ever landed — pay-per-seat upfront closes that gap."

**Where to find it:** Appears automatically from [F-FAM-009](F-FAM-009.md) or [F-FAM-011](F-FAM-011.md).

**Who can use it:** Owners only ([R-FAMOWNER](../roles.md#r-famowner)).

**Steps**
1. Click **Add to family** or **Next: write the email** when the family is full. A toast explains: "Your family's 3 included seats are taken by … Pay ₹199 to add a seat…".
2. Complete payment in the Razorpay window ("Extra family seat").
3. The person is added (or the invitation created) and the flow continues.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Razorpay checkout | External payment window | Collects the seat price | Closing it cancels silently |

**Fields and rules:** Not applicable — payment handled by Razorpay.

**Settings and toggles here:** None.

**Results:** The family's included seats increase by 1 and the pending member or invitation becomes real.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This seat payment request has expired — start the invite again." | More than 30 minutes passed | Start again |
| "Order does not match this pending invite." / "This payment does not match this seat request." | Payment details did not verify | Start again |
| "… Payments are not configured on this server." | Razorpay keys missing | Free a seat instead |

**Limitations:** Seat price comes from the family record (default ₹199, a placeholder per the schema comment). Abandoned pending seat requests are not cleaned up but block nothing.

**How it works:** The add/invite call returns `seat_payment_required` with a Razorpay order; the pending payload is kept for 30 minutes in `PendingFamilyInvite`. `POST /api/families/:familyId/members/invite/verify-payment` checks the signature, re-reads the order notes from Razorpay, then increments `includedSeats` and creates the invitation or managed member atomically.

**Related features:** [F-FAM-003](F-FAM-003.md), [F-FAM-009](F-FAM-009.md), [F-FAM-011](F-FAM-011.md), [D-FAM-002](../dependencies.md#d-fam-002).

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:793`, `packages/api/src/services/family/family.service.ts:40`, `packages/api/src/services/family/family.service.ts:519`, `packages/api/src/services/family/family.service.ts:610`, `packages/api/src/services/family/family.service.ts:801`
