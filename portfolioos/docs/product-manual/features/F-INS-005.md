---
id: F-INS-005
title: "Show the full policy number"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-INS-001, F-INS-008]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Show the full policy number

`F-INS-005` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Policy numbers are shown masked as "●●●● 1234". The eye button fetches and shows the full number; clicking again hides it.

**Why it exists:** The number is needed when calling the insurer, but is kept encrypted and masked by default; each reveal is logged. Stated in code comments.

**Where to find it:** On each policy card and in the header of the policy page (**Policy no.**).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click the eye button (label "Show policy number"). The full number appears.
2. Click it again ("Hide policy number") to mask it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "Show policy number" / "Hide policy number" | Icon toggle | Reveals or hides | Disabled while loading |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** The number is shown only in that card or header; it is not cached. An audit log entry (`pii_view`) is written for each reveal.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No policy number is saved. Edit the policy to add it." | No number on file | Edit the policy and add it |
| "Could not show the policy number. Try again in a minute." | More than 5 reveals in a minute, or the number could not be decrypted | Wait a minute; if it persists the server key may have changed (operator) |

**Limitations:** At most 5 reveals per minute per account.

**How it works:** `POST /api/insurance/policies/:id/reveal`, rate-limited to 5 per minute per user; the server decrypts, writes an `AuditLog` row with action `pii_view`, and replies with `Cache-Control: no-store`. A legacy plaintext number is encrypted on the way.

**Related features:** [F-INS-001](F-INS-001.md), [F-INS-008](F-INS-008.md).

**Sources:** `apps/web/src/components/insurance/PolicyNumberReveal.tsx:6`, `apps/web/src/components/insurance/PolicyNumberReveal.tsx:55`, `packages/api/src/routes/insurance.routes.ts:46`, `packages/api/src/middleware/rateLimit.ts:196`, `packages/api/src/services/insurance/insurance.service.ts:664`
