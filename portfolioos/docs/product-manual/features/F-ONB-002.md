---
id: F-ONB-002
title: "Starter portfolio created automatically"
module: "First-run setup"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-ONB-004]
---

[← First-run setup](../modules/first-run-setup.md) · [Index](../INDEX.md)

# Starter portfolio created automatically

`F-ONB-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Creates a portfolio called "My Portfolio" (type Investment) for you as soon as the wizard opens, so the things you add have somewhere to go. If you already have a portfolio, it reuses your oldest one instead of creating another.

**Why it exists:** The code comment: "Every holding needs a portfolio, so one is created up front instead of asking the user to name it."

**Where to find it:** Not applicable — automatic when `/onboarding` opens.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps:** Not applicable — automatic. If it fails you see the error and **Try again**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Try again** | Button | Retries creating the portfolio | Shown only after a failure |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** A "My Portfolio" portfolio exists (or your oldest portfolio is used).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not set up your account" (or the server's message) with **Try again** | The create call failed | **Try again** |

**Limitations:** None.

**How it works:** POST `/api/portfolios` with `onboarding: true`. The server skips the plan's portfolio cap for this call and, inside a transaction, returns your oldest portfolio if one exists. The result is cached for the session so it is never posted twice.

**Related features:** [F-ONB-004](F-ONB-004.md).

**Sources:** `apps/web/src/pages/onboarding/OnboardingWizard.tsx:50`, `apps/web/src/pages/onboarding/OnboardingWizard.tsx:104`, `packages/api/src/controllers/portfolio.controller.ts:55`, `packages/api/src/services/holdings/portfolio.service.ts:311`
