---
id: F-ADV-001
title: "Advisor page, plan lock and disclaimer"
module: "Investment Advisor"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO, R-MANAGER (R-FREE: locked)"
settings: [S-ADV-001, S-ADV-009]
related: [F-ADV-002, F-ADV-003, F-ADV-004, F-ADV-005, F-ADV-006, F-ADV-010]
---

[← Investment Advisor](../modules/investment-advisor.md) · [Index](../INDEX.md)

# Advisor page, plan lock and disclaimer

`F-ADV-001` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) ([R-FREE](../roles.md#r-free): locked)

**What it does:** Opens the **Investment Advisor** page (eyebrow "Intelligence"). If your plan is below Plus, the body is replaced by a locked card for "Investment Advisor". If you have never taken the risk assessment, the page shows only the disclaimer and the questionnaire ([F-ADV-002](F-ADV-002.md)). Once you have a profile it shows, top to bottom: the disclaimer, your risk profile ([F-ADV-003](F-ADV-003.md)), the allocation card ([F-ADV-004](F-ADV-004.md)), the recommendation feed ([F-ADV-006](F-ADV-006.md)) and the **Override list** ([F-ADV-010](F-ADV-010.md)).

**Why it exists:** The page header states the purpose: "A ranked, explained set of moves for your portfolio — built from your risk profile, your target allocation, and what you actually hold today. Every suggestion shows its reasoning, not just its conclusion." The permanent disclaimer exists because nothing on the page executes a trade (code comment: "Permanent, non-dismissible. Nothing on this page places an order.").

**Where to find it:** **Overview → Advisor** (route `/advisor`).

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (and [R-ADMIN](../roles.md#r-admin) on one of those plans). [R-FREE](../roles.md#r-free) sees the locked card. [R-MANAGER](../roles.md#r-manager) can use it on the managed person's data; the plan checked is the manager's. Not available to [R-AICONN](../roles.md#r-aiconn) (no AI-connector tool exposes advisor data) or [R-NOMINEE](../roles.md#r-nominee).

**Steps**
1. Open **Overview → Advisor**. While your profile loads the page shows "Loading…".
2. If you see the questionnaire, answer it ([F-ADV-002](F-ADV-002.md)). Otherwise read the sections below the disclaimer.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh recommendations** | Button (page header) | Runs the advice engine now ([F-ADV-005](F-ADV-005.md)) | Disabled until a risk profile exists, and while a run is in progress |
| Locked card | Card | Replaces the page body below Plus; links to upgrade (shell component, [D-ADV-001](../dependencies.md#d-adv-001)) | Shown only below Plus |

**Fields and rules:** None — view only.

**Settings and toggles here:** None on this feature; see [S-ADV-001](../settings/investment-advisor.md#s-adv-001) to [S-ADV-009](../settings/investment-advisor.md#s-adv-009) in the features below.

**Results:** Nothing is changed by opening the page.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load your advisor profile. Try again shortly." | The risk-profile request failed | Reload the page later |
| Locked card instead of the page | Your effective plan is Free (or a paid plan expired) | Upgrade on **Pricing** |

**Limitations:** The disclaimer cannot be dismissed. The **Refresh recommendations** button sits outside the plan lock, but it stays disabled on Free because no profile can be loaded.

**How it works:** Every `/api/advisor/*` route runs `authenticate` and then `requireFeature('ADVICE_ENGINE')`, whose minimum tier is PLUS; a lower plan gets 403 "This feature requires the PLUS plan or higher". The web wraps the body in `LockedFeature requiredTier="PLUS"`. The page reads `GET /api/advisor/risk-profile` (returns `{ profile, history }`) and `GET /api/advisor/llm-status` (cached 5 minutes) to decide whether to offer AI narration.

**Related features:** [F-ADV-002](F-ADV-002.md), [F-ADV-003](F-ADV-003.md), [F-ADV-004](F-ADV-004.md), [F-ADV-005](F-ADV-005.md), [F-ADV-006](F-ADV-006.md), [F-ADV-010](F-ADV-010.md), [D-ADV-001](../dependencies.md#d-adv-001).

**Sources:** `apps/web/src/pages/advisor/AdvisorPage.tsx:43`, `apps/web/src/pages/advisor/AdvisorPage.tsx:85`, `apps/web/src/pages/advisor/AdvisorPage.tsx:117`, `apps/web/src/pages/advisor/AdvisorPage.tsx:140`, `apps/web/src/pages/advisor/AdvisorPage.tsx:182`, `packages/api/src/routes/advisor.routes.ts:27`, `packages/shared/src/entitlements.ts:38`, `packages/api/src/middleware/requirePlan.ts:18`
