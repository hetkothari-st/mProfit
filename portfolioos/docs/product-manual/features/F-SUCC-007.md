---
id: F-SUCC-007
title: "Email link actions: I'm OK, Confirm, Verifier answer"
module: "Succession"
status: Live
roles: "R-VISITOR (link holder)"
settings: []
related: [F-SUCC-006, F-SUCC-008]
---

[← Succession](../modules/succession.md) · [Index](../INDEX.md)

# Email link actions: I'm OK, Confirm, Verifier answer

`F-SUCC-007` · Live · Roles: [R-VISITOR](../roles.md#r-visitor) (link holder)

**What it does:** Three no-login pages behind emailed links. **I'm OK** resets the owner's countdown. **Confirm** lets a new nominee confirm their email works. The verifier page asks "Has something happened to them?" with **Yes, share their information now** (releases immediately) or **No, they're fine** (resets the countdown).

**Why it exists:** Code comment: "Nothing happens on load: the action is a button click, so email link scanners that open URLs can't trigger it."

**Where to find it:** Email links `/legacy/ok/:token`, `/legacy/ack/:token`, `/legacy/verify/:token`.

**Who can use it:** Whoever holds the link ([R-VISITOR](../roles.md#r-visitor)): the owner for I'm OK, a nominee for Confirm, the verifier nominee for the verifier page.

**Steps**
1. Open the link. The card "EveryPaisa Succession" appears.
2. Click the button. Messages: "Thanks. Your countdown has been reset." / "Confirmed. Thank you." / "Thank you. Their nominees now have access." / "Thank you. The countdown has been reset."

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **I'm OK** | Button | Resets the countdown | Disabled while busy |
| **Confirm** | Button | Confirms the nominee email | Disabled while busy |
| **Yes, share their information now** | Button | Releases now | Verifier page only |
| **No, they're fine** | Button | Resets | Verifier page only |

**Fields and rules:** Not applicable — no data entry.

**Settings and toggles here:** None.

**Results:** As above; verifier answers are audit-logged and the owner gets "Your verifier said you are OK" after a **No, they're fine**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This link is no longer valid." | Expired, used, from an older cycle, or the plan moved on | Nothing to do; the owner can sign in |

**Limitations:** Link lifetimes: Confirm 365 days, I'm OK 30 days, verifier 14 days. A verifier answer counts only during the 7-day notice stage and only if the owner has shown no activity since it began. An old cycle's I'm OK link still records activity but doesn't reset a newer stage. Limited to 10 requests a minute.

**How it works:** `POST /api/legacy-public/ok|ack/:token`, `GET/POST /api/legacy-public/verify/:token` (body CONFIRM or FINE).

**Related features:** [F-SUCC-006](F-SUCC-006.md), [F-SUCC-008](F-SUCC-008.md).

**Sources:** `apps/web/src/pages/legacy/LegacyLinkPage.tsx:16`, `packages/api/src/routes/legacy.routes.ts:39`, `packages/api/src/services/legacy/publicLinks.service.ts:25`, `packages/api/src/services/legacy/publicLinks.service.ts:74`, `packages/api/src/services/legacy/tokens.service.ts:18`
