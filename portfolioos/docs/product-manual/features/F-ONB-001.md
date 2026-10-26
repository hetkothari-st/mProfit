---
id: F-ONB-001
title: "Welcome panels"
module: "First-run setup"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-AUTH-002, F-AUTH-003, F-ONB-002, F-ONB-003]
---

[← First-run setup](../modules/first-run-setup.md) · [Index](../INDEX.md)

# Welcome panels

`F-ONB-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Shows three panels before asking for anything: a greeting, what the app does, and what happens to your data.

**Why it exists:** The code comment: "somebody deciding whether to trust a stranger with their net worth has the answer before they are asked for a single number", while "Somebody who wants to get on with entering their fixed deposits can be past all of it in one tap".

**Where to find it:** Route `/onboarding`, reached automatically after sign-up ([F-AUTH-002](F-AUTH-002.md)/[F-AUTH-003](F-AUTH-003.md)) or when you sign in with setup unfinished in this browser.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). Not available while managing a family member's account ([R-MANAGER](../roles.md#r-manager)): you are sent to **Portfolios** instead.

**Steps**
1. Panel 1 ("Welcome"): "Let's get your books in order, <first name>." with one randomly chosen line (for example "You cannot compound what you cannot count."). Click **Continue**.
2. Panel 2 ("What you get"): "Built for everything you actually own" with six points — All of it, in one place; Returns you can defend; Your statements do the typing; The whole household; Nothing lapses quietly; Ready for the return. Click **Continue**.
3. Panel 3 ("Privacy"): "Your money is your business" with five commitments and the footer "We are moving to keeping your ledger on your own device. Until that ships, this is exactly what happens to it." Click **Set up my account**.
4. **Skip** on any panel jumps straight to the picker.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Continue** | Button | Next panel | Panels 1–2 |
| **Set up my account** | Button | Ends the panels | Panel 3 |
| **Skip** | Link | Ends the panels | — |
| Three dots | Indicator | Shows which panel you are on | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing is saved by the panels themselves; the starter portfolio ([F-ONB-002](F-ONB-002.md)) is created in the background while you read.

**Errors and troubleshooting:** None.

**Limitations:** The privacy panel shows the "hosted" wording. A "data stays on your device" version exists in code but is switched off until that storage model ships.

**How it works:** The panel copy comes from fixed lists in the web app. The privacy copy is chosen by a single constant `STORAGE_MODE`, currently `hosted`.

**Related features:** [F-ONB-002](F-ONB-002.md), [F-ONB-003](F-ONB-003.md).

**Sources:** `apps/web/src/pages/onboarding/WelcomePanels.tsx:26`, `apps/web/src/pages/onboarding/WelcomePanels.tsx:43`, `apps/web/src/pages/onboarding/welcomeContent.ts:29`, `apps/web/src/pages/onboarding/welcomeContent.ts:67`, `apps/web/src/lib/privacyPromise.ts:31`, `apps/web/src/lib/privacyPromise.ts:45`, `apps/web/src/components/family/NotWhileManaging.tsx:15`, `apps/web/src/App.tsx:147`
