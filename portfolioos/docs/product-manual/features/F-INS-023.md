---
id: F-INS-023
title: "Premiums matched from bank and payment emails"
module: "Insurance"
status: Live
roles: "Users with approved events"
settings: []
related: [F-INS-007]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Premiums matched from bank and payment emails

`F-INS-023` · Live · Roles: Users with approved events

**What it does:** When an approved email event of type "premium paid" is turned into a cash-flow entry, EveryPaisa tries to link it to one of your active policies and records the premium payment.

**Why it exists:** To mark premiums paid without manual entry. Stated in code comments.

**Where to find it:** The result appears in the policy's **Premiums** card ([F-INS-007](F-INS-007.md)).

**Who can use it:** Users whose inbox events are approved ([D-INS-007](../dependencies.md#d-ins-007)).

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** A premium payment dated today, covering the premium that was next due, linked to the email event.

**Errors and troubleshooting:** None shown; a failed match is logged only.

**Limitations:** The payment's **Paid on** is the day the event was processed, not the email's date. Matching needs the policy number in the event, or exactly one active policy whose insurer name matches and whose premium is within ±5% of the amount.

**How it works:** `hookAutoMatchPremiumPayment` is called by the projection pipeline after a PREMIUM_PAID event; policy number by fingerprint first, then insurer + amount.

**Related features:** [F-INS-007](F-INS-007.md), [D-INS-007](../dependencies.md#d-ins-007).

**Sources:** `packages/api/src/services/insurance/insurance.service.ts:986`, `packages/api/src/services/insurance/insurance.service.ts:1033`, `packages/api/src/services/insurance/insurance.service.ts:1054`
