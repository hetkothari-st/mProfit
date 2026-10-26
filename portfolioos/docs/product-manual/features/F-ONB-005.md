---
id: F-ONB-005
title: "Finish, skip and resume setup"
module: "First-run setup"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-AUTH-001, F-ONB-003]
---

[← First-run setup](../modules/first-run-setup.md) · [Index](../INDEX.md)

# Finish, skip and resume setup

`F-ONB-005` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Ends the wizard with a summary and sends you to the dashboard; remembers in this browser if you left setup unfinished so you are brought back to it.

**Why it exists:** The code comment: "an account that started setup and walked away should resume it".

**Where to find it:** The last screen of `/onboarding`, and **Skip — I'll add things later** on the picker.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. After the last step: "You're all set" with "N entries added. Your dashboard is ready — you can refine any of them from its own page." and a count per item — or "Nothing added yet" with "No problem — you can add investments any time from the sidebar."
2. Click **Go to dashboard**, or **Go back and add more** to return to the last step.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Go to dashboard** | Button | Finishes setup | — |
| **Go back and add more** | Link | Back to the last step | Hidden when nothing was ticked |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Setup is marked finished in this browser; all cached data is refreshed; you land on **Dashboard**.

**Errors and troubleshooting:** None.

**Limitations:** Both "setup unfinished" and "setup done" are kept in this browser only. On another device or after clearing site data, the dashboard sends an account with no portfolios to setup again, and a started-but-unfinished setup is not resumed.

**How it works:** Opening the wizard writes `everypaisa.onboarding.inProgress.<userId>` = 1; finishing removes it and writes `onboarding_v2_done` = 1. Sign-in sends you to `/onboarding` while the in-progress flag exists; the dashboard does the same, and also when `onboarding_v2_done` is missing and you have no portfolio.

**Related features:** [F-AUTH-001](F-AUTH-001.md), [F-ONB-003](F-ONB-003.md), [D-AUTH-003](../dependencies.md#d-auth-003), [W-ONB-001](../workflows/W-ONB-001.md).

**Sources:** `apps/web/src/pages/onboarding/OnboardingWizard.tsx:44`, `apps/web/src/pages/onboarding/OnboardingWizard.tsx:60`, `apps/web/src/pages/onboarding/OnboardingWizard.tsx:249`, `apps/web/src/lib/onboardingProgress.ts:12`, `apps/web/src/lib/onboardingProgress.ts:31`, `apps/web/src/App.tsx:151`, `apps/web/src/pages/dashboard/DashboardPage.tsx:358`, `apps/web/src/pages/dashboard/DashboardPage.tsx:367`

**What this area doesn't do**
- It does not ask for your PAN, phone or Gmail — those are in **Settings** and **Inbox**.
- It does not import statements; upload a CAS or contract note later from **Tools → CAS** or **Tools → Import**.
- There is no menu entry to reopen it once finished (typing `/onboarding` opens it again).
