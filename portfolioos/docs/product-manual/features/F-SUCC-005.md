---
id: F-SUCC-005
title: "Confirm it's you (step-up)"
module: "Succession"
status: Live
roles: "Plan owner"
settings: []
related: [F-SUCC-001, F-SUCC-002, F-SUCC-004]
---

[← Succession](../modules/succession.md) · [Index](../INDEX.md)

# Confirm it's you (step-up)

`F-SUCC-005` · Live · Roles: Plan owner

**What it does:** Before any change to Succession, asks for a fresh code: your authenticator code (or a backup code) if two-factor sign-in is on, otherwise a 6-digit code emailed to you. A confirmation lasts about 15 minutes in that tab.

**Why it exists:** Code comment: "Every owner mutation needs a fresh step-up grant."

**Where to find it:** Opens automatically from any Succession change (dialog "Confirm it's you").

**Who can use it:** The plan owner.

**Steps**
1. Make a change. The dialog reads "Enter the code from your authenticator app (or a backup code)." or "We emailed you a 6-digit code."
2. Enter **Code** and click **Confirm** (or press Enter). The change then runs.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Code** | Text | The code | — |
| **Confirm** | Button | Verifies | Disabled under 6 characters or while busy |
| **Cancel** | Button | Abandons the change | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Code** | Text | Yes | 6–20 characters; emailed codes expire in 10 minutes; 5 wrong tries lock for 30 minutes | Empty | "That code didn't match." / "That code has expired. Request a new one." / "Too many attempts. Try again in 30 minutes." |

**Settings and toggles here:** None (two-factor sign-in is set in Settings, [D-SUCC-002](../dependencies.md#d-succ-002)).

**Results:** A 15-minute grant is held in memory; a page reload asks again.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "We couldn't send the code. Try again shortly." | Email send failed | Retry |
| Rate limit error | More than 5 step-up requests a minute | Wait a minute |

**Limitations:** The grant is not shared across tabs.

**How it works:** `POST /api/legacy/step-up` then `/step-up/verify` (both limited to 5 per minute) return a grant sent as the `X-Legacy-Grant` header on changes.

**Related features:** [F-SUCC-001](F-SUCC-001.md), [F-SUCC-002](F-SUCC-002.md), [F-SUCC-004](F-SUCC-004.md), [D-SUCC-002](../dependencies.md#d-succ-002).

**Sources:** `apps/web/src/pages/legacy/StepUpDialog.tsx:11`, `apps/web/src/api/legacy/legacy.api.ts:26`, `packages/api/src/controllers/legacy.controller.ts:23`, `packages/api/src/services/legacy/tokens.service.ts:18`, `packages/api/src/services/legacy/tokens.service.ts:143`
