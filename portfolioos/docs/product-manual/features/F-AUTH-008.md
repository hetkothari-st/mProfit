---
id: F-AUTH-008
title: "Security notice emails (new device, failed sign-ins)"
module: "Sign-in & session"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-AUTH-001, F-AUTH-004, F-AUTH-005]
---

[← Sign-in & session](../modules/sign-in-session.md) · [Index](../INDEX.md)

# Security notice emails (new device, failed sign-ins)

`F-AUTH-008` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Emails you when your account is signed in from a device type not seen in the last 90 days, and when there have been 5 failed sign-in attempts in 15 minutes.

**Why it exists:** The email text: "If it wasn't, reset your password now from the sign-in page".

**Where to find it:** Your inbox. Subjects: "New sign-in to your EveryPaisa account" and "Failed sign-in attempts on your EveryPaisa account".

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) — automatic.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None — these emails cannot be turned off.

**Results:** New-device email: device description, time (IST) and network address of the sign-in, and advice. Failed-sign-in email: "There have been 5 failed attempts to sign in to your account in the last 15 minutes."

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| No email on your first ever sign-in | The first sign-in is not "new device" news | None |
| No email after the 6th or later failure | Only the 5th failure in the window sends one | None |

**Limitations:** "Device" is a coarse description built from the browser's user-agent, so a different browser on the same computer can count as new. Failed Google sign-ins are not counted.

**How it works:** After each audited sign-in the server compares the device description against `login` audit rows from the last 90 days (up to 200). After each audited failure it counts `login_failed` rows for that email in 15 minutes and emails only when the count equals 5. Both run in the background and never block sign-in. Separately, an operator-only scan every 15 minutes looks for credential stuffing and unusual export or PII-reveal volume (operator configuration).

**Related features:** [F-AUTH-001](F-AUTH-001.md), [F-AUTH-004](F-AUTH-004.md), [F-AUTH-005](F-AUTH-005.md).

**Sources:** `packages/api/src/services/security/securityAlerts.service.ts:25`, `packages/api/src/services/security/securityAlerts.service.ts:80`, `packages/api/src/services/security/securityAlerts.service.ts:105`, `packages/api/src/services/security/securityAlerts.service.ts:120`, `packages/api/src/controllers/auth.controller.ts:144`, `packages/api/src/jobs/securityAlertJobs.ts:9`
