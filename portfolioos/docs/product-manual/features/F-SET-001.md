---
id: F-SET-001
title: "Profile (name, phone, PAN, date of birth)"
module: "Settings"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-SET-002]
---

[← Settings](../modules/settings.md) · [Index](../INDEX.md)

# Profile (name, phone, PAN, date of birth)

`F-SET-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Lets you edit your full name, phone, PAN and date of birth. Your email is shown but cannot be changed.

**Why it exists:** The page hint says the date of birth is "Used only as a password for encrypted CAS PDFs (CAMS sometimes uses PAN+DOB)". PAN is stored encrypted; the code comment says the full PAN was removed from the profile payload because it ended up in the browser's storage.

**Where to find it:** **Tools → Settings → Profile**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). While managing a family member's account ([R-MANAGER](../roles.md#r-manager)) this card still edits your own profile.

**Steps**
1. Edit **Full name**, **Phone**, **PAN** and/or **Date of birth**.
2. Click **Save profile**. Toast "Profile updated".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Full name** | Text | Your display name | — |
| **Email** | Text | Shows your sign-in email | Always disabled |
| **Phone** | Text | Your phone | — |
| **PAN** | Text, upper-case, max 10 | Sets a new PAN | — |
| **Date of birth** | Date | Your date of birth | — |
| **Save profile** | Button | Saves | Disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Full name | Text | Yes | 2–100 characters | Current name | Generic length message from the form library (no custom text) |
| Phone | Text | No | Any text | Current phone | — |
| PAN | Text | No | 5 letters, 4 digits, 1 letter; trimmed and upper-cased | Always blank (your saved PAN is never shown here) | "Invalid PAN format (e.g., <sample PAN>)" |
| Date of birth | Date | No | YYYY-MM-DD | Current date of birth | "Use YYYY-MM-DD" |

**Settings and toggles here:** None.

**Results:** Your profile is updated; the header greeting uses the new name. A typed PAN replaces the stored one (encrypted, with only the last 4 characters kept readable for masking).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Invalid PAN format (e.g., …)" | PAN not in the form five letters, four digits, one letter | Correct it |
| "Update failed" | Server error | Try again |

**Limitations:** The PAN box is always empty — there is no indication in Settings whether a PAN is already saved, and leaving it blank keeps the saved one; you cannot clear a saved PAN here. The Phone box sends whatever is typed, so clearing it saves an empty phone. You cannot change your email.

**How it works:** PATCH `/api/auth/me` with only the fields sent. The server validates the same PAN pattern ("Invalid PAN format"), stores PAN in encrypted columns, and returns your profile with the PAN masked (XXXXX + last part) and a `hasPan` flag. The full PAN can be read only through a separate audited, rate-limited (5 a minute) endpoint used by the mutual fund CAS mailback dialog ([D-AUTH-002](../dependencies.md#d-auth-002)).

**Related features:** [F-SET-002](F-SET-002.md), [D-AUTH-002](../dependencies.md#d-auth-002).

**Sources:** `apps/web/src/pages/settings/SettingsPage.tsx:21`, `apps/web/src/pages/settings/SettingsPage.tsx:50`, `apps/web/src/pages/settings/SettingsPage.tsx:94`, `apps/web/src/pages/settings/SettingsPage.tsx:119`, `packages/api/src/controllers/auth.controller.ts:75`, `packages/api/src/services/auth/auth.service.ts:61`, `packages/api/src/services/auth/auth.service.ts:668`, `packages/api/src/controllers/auth.controller.ts:201`, `packages/api/src/middleware/rateLimit.ts:196`
