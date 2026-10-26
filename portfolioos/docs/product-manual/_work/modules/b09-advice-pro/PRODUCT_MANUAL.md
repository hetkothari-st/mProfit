# EveryPaisa User Manual — Advisor, Professional workspace and Split Expenses (B09 fragment)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Investment Advisor (`/advisor`), Professional workspace (`/ca`, `/ca/clients/:clientId`, `/ca/invitations/:token/accept`, `/professional-invitations/:token`), Split Expenses (`/split`, `/split/settings`, `/split/groups/:id`, `/split/expenses/:id`, `/split/friends/:key`)

## Contents
- [Investment Advisor](#investment-advisor)
- [Professional workspace (Client books)](#professional-workspace-client-books)
- [Split Expenses](#split-expenses)
- [Roles and profiles](#roles-and-profiles)
- [Glossary](#glossary)

<!-- BEGIN MODULES -->
## Investment Advisor

The **Advisor** page (sidebar **Overview → Advisor**) turns your risk profile, a target allocation and what you hold today into a ranked list of suggested moves, each with the reasoning and the figures behind it. It is advisory only: nothing on the page places an order, moves money or contacts a broker. The page needs the Plus plan or higher; on Free it shows a locked card.

### Advisor page, plan lock and disclaimer <!-- F-ADV-001 -->
**What it does:** Opens the **Investment Advisor** page (eyebrow "Intelligence"). If your plan is below Plus, the body is replaced by a locked card for "Investment Advisor". If you have never taken the risk assessment, the page shows only the disclaimer and the questionnaire (F-ADV-002). Once you have a profile it shows, top to bottom: the disclaimer, your risk profile (F-ADV-003), the allocation card (F-ADV-004), the recommendation feed (F-ADV-006) and the **Override list** (F-ADV-010).

**Why it exists:** The page header states the purpose: "A ranked, explained set of moves for your portfolio — built from your risk profile, your target allocation, and what you actually hold today. Every suggestion shows its reasoning, not just its conclusion." The permanent disclaimer exists because nothing on the page executes a trade (code comment: "Permanent, non-dismissible. Nothing on this page places an order.").

**Where to find it:** **Overview → Advisor** (route `/advisor`).

**Who can use it:** R-PLUS, R-FAMILY, R-PRO (and R-ADMIN on one of those plans). R-FREE sees the locked card. R-MANAGER can use it on the managed person's data; the plan checked is the manager's. Not available to R-AICONN (no AI-connector tool exposes advisor data) or R-NOMINEE.

**Steps**
1. Open **Overview → Advisor**. While your profile loads the page shows "Loading…".
2. If you see the questionnaire, answer it (F-ADV-002). Otherwise read the sections below the disclaimer.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh recommendations** | Button (page header) | Runs the advice engine now (F-ADV-005) | Disabled until a risk profile exists, and while a run is in progress |
| Locked card | Card | Replaces the page body below Plus; links to upgrade (shell component, D-ADV-001) | Shown only below Plus |

**Fields and rules:** None — view only.

**Settings and toggles here:** None on this feature; see S-ADV-001 to S-ADV-009 in the features below.

**Results:** Nothing is changed by opening the page.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load your advisor profile. Try again shortly." | The risk-profile request failed | Reload the page later |
| Locked card instead of the page | Your effective plan is Free (or a paid plan expired) | Upgrade on **Pricing** |

**Limitations:** The disclaimer cannot be dismissed. The **Refresh recommendations** button sits outside the plan lock, but it stays disabled on Free because no profile can be loaded.

**How it works:** Every `/api/advisor/*` route runs `authenticate` and then `requireFeature('ADVICE_ENGINE')`, whose minimum tier is PLUS; a lower plan gets 403 "This feature requires the PLUS plan or higher". The web wraps the body in `LockedFeature requiredTier="PLUS"`. The page reads `GET /api/advisor/risk-profile` (returns `{ profile, history }`) and `GET /api/advisor/llm-status` (cached 5 minutes) to decide whether to offer AI narration.

**Related features:** F-ADV-002, F-ADV-003, F-ADV-004, F-ADV-005, F-ADV-006, F-ADV-010, D-ADV-001.

**Sources:** `apps/web/src/pages/advisor/AdvisorPage.tsx:43`, `apps/web/src/pages/advisor/AdvisorPage.tsx:85`, `apps/web/src/pages/advisor/AdvisorPage.tsx:117`, `apps/web/src/pages/advisor/AdvisorPage.tsx:140`, `apps/web/src/pages/advisor/AdvisorPage.tsx:182`, `packages/api/src/routes/advisor.routes.ts:27`, `packages/shared/src/entitlements.ts:38`, `packages/api/src/middleware/requirePlan.ts:18`

### Risk questionnaire (take or retake) <!-- F-ADV-002 -->
**What it does:** Seven questions that set your risk category and therefore the target allocation every recommendation is measured against. The first time, the card is titled **Tell us how you invest** and the button is **Get my recommendations**; a retake (from **Retake assessment**) is titled **Retake your risk assessment**, starts pre-filled with your last answers, and the button is **Save new profile** with a **Cancel** next to it.

**Why it exists:** From the card text: "Your answers set the target allocation every recommendation is measured against — without them, advice would be a guess." A retake is pre-filled because "re-answering seven questions from scratch to change one is the kind of friction that stops people keeping their profile current" (code comment).

**Where to find it:** **Overview → Advisor** — shown automatically when you have no profile; otherwise **Retake assessment** on the risk-profile card.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO, R-MANAGER (manager's plan).

**Steps**
1. Type your age in **How old are you?**.
2. Pick one answer for each of questions 2–7 (they are button groups; the chosen one is highlighted).
3. Click **Get my recommendations** (or **Save new profile**). The app shows "Risk profile saved" and the page switches to the profile view.
4. Click **Refresh recommendations** to generate advice against the new profile (saving does not run the engine).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **How old are you?** | Number field | Age (S-ADV-001) | — |
| Questions 2–7 answer buttons | Radio-style buttons | One answer per question (S-ADV-002 to S-ADV-007) | — |
| **Get my recommendations** / **Save new profile** | Submit button | Saves a new assessment | Disabled while saving |
| **Cancel** | Button | Leaves a retake without saving | Only on a retake; disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| How old are you? | Whole number | Yes | Web: 18–100. Server accepts 0–120 (schema) and rejects ≤0 or >120 | Blank (retake: last answer) | "Enter an age between 18 and 100." |
| Questions 2–7 | One choice each | Yes | Fixed choices (see S-ADV-002…007) | None (retake: last answer) | "Answer every question to continue." |

**Settings and toggles here:** S-ADV-001 **Age**, S-ADV-002 **Investment horizon**, S-ADV-003 **Drawdown reaction**, S-ADV-004 **Investable share of income**, S-ADV-005 **Objective**, S-ADV-006 **Emergency fund**, S-ADV-007 **Tax slab** — each changes the score, the guardrails or the tax rate the engine uses (detail in the settings reference).

**Results:** A new assessment is stored (older ones are kept as history). On your first submission four model portfolios — Conservative, Balanced, Growth, Aggressive — are created for you with default target weights; later submissions never reset them. The profile card, allocation, recommendations and override list refresh.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Enter an age between 18 and 100." | Age missing or outside 18–100 | Enter a whole number in range |
| "Answer every question to continue." | A question has no answer | Pick an answer for each |
| Toast "Could not save your risk profile" or the server's message | Server rejected the answers | Retry; check the message |

**Limitations:** Saving does not generate recommendations; press **Refresh recommendations** afterwards. The assessment history is returned by the API but not shown on the page.

**How it works:** `POST /api/advisor/risk-profile` with `{ age, horizon, drawdownReaction, investableShareOfIncome, objective, hasEmergencyFund, taxSlab }`. Scoring (questionnaire version 1): each answer earns points × weight — horizon (weight 20: under 3 years 0, 3–7 years 0.4, 7–15 years 0.75, over 15 years 1), drawdown reaction (weight 25: sell everything 0, sell some 0.35, hold 0.8, buy more 1), investable share (weight 15: under 10% 0, 10–20% 0.4, 20–35% 0.75, over 35% 1), objective (weight 20: protect 0, income 0.35, steady growth 0.7, fast growth 1). Score = round(raw ÷ 80 × 100). Category: below 30 Conservative, 30–54 Balanced, 55–79 Growth, 80+ Aggressive. Two guardrails only lower risk and are recorded as "Adjustments we made": age 55 or more caps Aggressive at Growth; no emergency fund lowers Aggressive → Growth and Growth → Balanced. Tax slab maps to 5, 20 or 30%; "Not sure" is stored as unknown (not 30%). Each submission inserts a new `RiskProfileAssessment`; the newest one is "current".

**Related features:** F-ADV-003, F-ADV-004, F-ADV-005, F-ADV-010.

**Sources:** `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:176`, `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:190`, `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:259`, `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:325`, `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:334`, `packages/api/src/controllers/advisor.controller.ts:63`, `packages/api/src/services/advisor/riskProfile.service.ts:91`, `packages/api/src/services/advisor/riskProfile.service.ts:166`, `packages/api/src/services/advisor/riskProfile.service.ts:179`, `packages/api/src/services/analytics/riskProfileMath.ts:57`, `packages/api/src/services/analytics/riskProfileMath.ts:77`, `packages/api/src/services/analytics/riskProfileMath.ts:110`, `packages/api/src/services/analytics/riskProfileMath.ts:120`

### Risk profile summary <!-- F-ADV-003 -->
**What it does:** A card showing your current category (Conservative, Balanced, Growth or Aggressive) with its one-line description, a **Score** badge, three tiles — **Category**, **Score**, **Tax slab** (shows "Not sure" when unknown) — any guardrail adjustments under **Adjustments we made** ("from → to — reason"), and "Assessed" with the date and time in IST.

**Why it exists:** Inferred from behavior: it shows which profile the advice is steering by and explains any downgrade the guardrails applied ("Recorded rather than applied silently so a downgraded verdict can be explained to the person it was applied to" — code comment).

**Where to find it:** **Overview → Advisor**, first card under the disclaimer.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO, R-MANAGER.

**Steps**
1. Read the card. To change your answers click **Retake assessment** (opens F-ADV-002).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Retake assessment** | Button | Opens the questionnaire pre-filled | — |

**Fields and rules:** None — view only.

**Settings and toggles here:** Reflects S-ADV-001 to S-ADV-007.

**Results:** None.

**Errors and troubleshooting:** None specific; if a field is missing from the server the card shows what it has rather than failing.

**Limitations:** Category descriptions are fixed text: Conservative "Capital protection first. Modest equity, heavy on debt and cash."; Balanced "Steady growth with a cushion. Roughly even split between equity and debt."; Growth "Long-horizon compounding. Equity-led, with debt for ballast."; Aggressive "Maximum growth, accepting deep drawdowns along the way."

**How it works:** Reads the newest assessment from `GET /api/advisor/risk-profile`. Tax slab is stored as a percentage or null.

**Related features:** F-ADV-002.

**Sources:** `apps/web/src/pages/advisor/AdvisorPage.tsx:228`, `apps/web/src/pages/advisor/AdvisorPage.tsx:252`, `apps/web/src/api/advisor.api.ts:510`, `packages/api/src/services/advisor/riskProfile.service.ts:216`

### Allocation vs target (drift) <!-- F-ADV-004 -->
**What it does:** The card **Where you sit vs. your target** shows **Total value**, a bar chart of current vs target weight for each of seven buckets (Equity — Domestic, Equity — International, Debt, Gold, Real assets, Cash equivalent, Other / alternatives) and a table **Bucket / Current / Target / Drift / In rupees**. If the largest gap is 5 percentage points or more, a line reads "Your largest gap is <bucket> — overweight/underweight by N pp (₹…)". Drift under 5 pp is shown in grey.

**Why it exists:** Card text: "Drift is your current weight minus your target weight, in percentage points. Anything under 5 pp is usually noise — rebalancing it costs more in tax and charges than it gains." The server comment says the figure shown is computed by the same function the rebalance rule uses "so the two can never disagree".

**Where to find it:** **Overview → Advisor**, card under the risk profile.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO, R-MANAGER.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Chart tooltip | Hover | Shows Current / Target percentage for a bucket | — |

**Fields and rules:** None — view only.

**Settings and toggles here:** Target weights come from a model portfolio (default weights per category; editing them is API-only, F-ADV-012).

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load your allocation. Try again shortly." | Request failed | Reload later |
| "No allocation yet. Add holdings and we'll measure them against your model portfolio." | No holdings with a value | Add holdings |
| "No target weights are set yet, so every bucket below reads as a 100% overweight…" | No model portfolio with targets | Take the risk assessment |
| Targets do not match your risk category | Known defect — see Limitations | — |

**Limitations:** Known defect: the card's targets come from the most recently created *active* model portfolio, not from the model portfolio linked to your current assessment. All four model portfolios are created active in the order Conservative, Balanced, Growth, Aggressive, so the card normally measures you against the **Aggressive** targets whatever your category, while the recommendations use your category's targets (see DOCUMENTATION_GAPS.md). Holdings with no market value use their cost. Mutual funds are moved to Debt (categories DEBT, LIQUID, GILT, MONEY_MARKET, OVERNIGHT) or Gold (GOLD) by their scheme category; NPS, PPF and EPF count as Debt; FDs, RDs and post-office deposits as Cash equivalent; property, REITs, InvITs and silver as Real assets; derivatives, crypto, ULIPs and insurance as Other / alternatives.

**How it works:** `GET /api/advisor/allocation` reads every `HoldingProjection` in your portfolios, buckets each by asset class (and fund category), sums value per bucket, and calls `computeDrift(current, targets, total)`. Default targets (percent): Conservative — Equity Domestic 20, Intl 0, Debt 50, Gold 10, Cash 20; Balanced — 40, 5, 37, 8, 10; Growth — 58, 10, 22, 5, 5; Aggressive — 72, 10, 12, 3, 3; Real assets and Other 0 in all four. The material-drift threshold on screen is 5 pp; the engine's rebalance band is also 5 pp.

**Related features:** F-ADV-002, F-ADV-005, F-ADV-012.

**Sources:** `apps/web/src/pages/advisor/widgets/AllocationDriftCard.tsx:38`, `apps/web/src/pages/advisor/widgets/AllocationDriftCard.tsx:134`, `apps/web/src/pages/advisor/widgets/AllocationDriftCard.tsx:145`, `apps/web/src/pages/advisor/widgets/AllocationDriftCard.tsx:155`, `packages/api/src/controllers/advisor.controller.ts:203`, `packages/api/src/controllers/advisor.controller.ts:241`, `packages/api/src/services/advisor/riskProfile.service.ts:100`, `packages/api/src/services/advisor/constants.ts:98`, `packages/api/src/services/advisor/assetBuckets.ts:13`, `packages/api/src/services/advisor/assetBuckets.ts:80`

### Refresh recommendations (advice engine run) <!-- F-ADV-005 -->
**What it does:** **Refresh recommendations** runs six rules over your current data and updates your recommendation list. A toast reports "1 recommendation ready" or "N recommendations ready" (N = new plus re-affirmed live recommendations).

**Why it exists:** Code comment: "`/regenerate` is the user-facing 'refresh my advice' button". There is no scheduled run, so advice changes only when you press it.

**Where to find it:** **Overview → Advisor**, page header button.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO, R-MANAGER; requires a risk profile.

**Steps**
1. Click **Refresh recommendations**. The icon spins.
2. When the toast appears, the **Open** tab of the feed shows the current advice.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh recommendations** | Button | Runs the engine | No risk profile; run in progress |

**Fields and rules:** None.

**Settings and toggles here:** Uses S-ADV-001…S-ADV-007 (profile) and the override list (S-ADV-009, F-ADV-010).

**Results:** New recommendations are added with status Open; unchanged live ones keep their figures; materially changed ones are replaced (the old one is kept as history and hidden).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not refresh your recommendations" or the server message | The run failed | Retry later |
| "0 recommendations ready" | No rule found anything to suggest | Nothing to do |

**Limitations:** A recommendation that a rule no longer produces is not closed automatically — it stays in **Open** until you act on it. Tax-loss harvesting only runs from 1 October to 31 March. Named funds (rather than "buy debt" with no product) appear only when the operator has enabled the house methodology and a signed, fresh ranking exists (F-ADV-014), or when you have an override list for that bucket; otherwise a NAV-based fallback ranking or no product is used.

**How it works:** `POST /api/advisor/regenerate` (body optional, default triggered by USER). The engine builds facts once, records an `AdvisorRun` (engine version 1.0.0) with every rule's version, runs each rule (a failing rule is logged on the run; the others continue), sorts drafts by priority, then for each draft finds the newest recommendation with the same rule and dedupe key: none → create; existing Open/Snoozed and unchanged → refresh its input snapshot only; existing Open/Snoozed and materially changed → create a new row and point the old one at it; existing Accepted/Dismissed/Done and unchanged → suppressed; existing closed and changed → new row. "Materially changed" = different rule version, different instrument/direction/leg shape, or total amount moved by more than 10%. Rules and their base priority (lower = more urgent; plus 0–4 by size — 0 if ≥10% of the portfolio, 1 if ≥5%, 2 if ≥2%, 3 if ≥1%, else 4): Tax-loss harvest 5 (Oct–Mar only; loss ≥ ₹5,000; sells the whole position); Concentration trim 15 (any holding above 15% of the portfolio, trimmed back to 15%, one instruction capped at 25% of the portfolio, minimum trade ₹5,000); Rebalance 20 (buckets outside the 5 pp band; pairs the largest overweight with the largest underweight; trades only investable buckets; minimum ₹5,000); Cash deployment 35 (idle cash above a 6-month emergency fund, surplus over ₹25,000; silent when monthly expenses are unknown); Goal shortfall SIP 40 (off-track goals; top-up at least ₹500/month); Risk profile review 55 (profile older than 12 months, or never taken). Product naming order: your override list → house methodology → NAV-based fallback → none.

**Related features:** F-ADV-006, F-ADV-010, F-ADV-014, D-ADV-003, D-ADV-004.

**Sources:** `apps/web/src/pages/advisor/AdvisorPage.tsx:71`, `packages/api/src/routes/advisor.routes.ts:38`, `packages/api/src/controllers/advisor.controller.ts:304`, `packages/api/src/services/advisor/advisorEngine.service.ts:101`, `packages/api/src/services/advisor/advisorEngine.service.ts:172`, `packages/api/src/services/advisor/advisorEngine.service.ts:255`, `packages/api/src/services/advisor/constants.ts:20`, `packages/api/src/services/advisor/constants.ts:42`, `packages/api/src/services/advisor/constants.ts:47`, `packages/api/src/services/advisor/constants.ts:80`, `packages/api/src/services/advisor/rules/taxLossHarvest.rule.ts:59`, `packages/api/src/services/advisor/rules/rebalanceDrift.rule.ts:52`, `packages/api/src/services/advisor/productResolution.ts:11`

### Recommendation feed and status tabs <!-- F-ADV-006 -->
**What it does:** The section **Recommendations — What to do next** lists your recommendations as cards (F-ADV-007), filtered by the tabs **Open**, **Accepted**, **Snoozed**, **Done**, **Dismissed**, sorted by priority (most urgent first), ties newest first.

**Why it exists:** Inferred from behavior: it separates advice still to act on from advice you have already decided about.

**Where to find it:** **Overview → Advisor**, below the allocation card.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO, R-MANAGER.

**Steps**
1. Pick a tab. The list reloads for that status.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Open** / **Accepted** / **Snoozed** / **Done** / **Dismissed** | Tabs | Filters by status (S-ADV-008) | — |

**Fields and rules:** None.

**Settings and toggles here:** S-ADV-008 **Recommendation status tab** — not saved; the page always opens on **Open**.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load your recommendations. Try again shortly." | Request failed | Reload later |
| "No open recommendations" — "Nothing needs your attention right now. Refresh after your next set of transactions." | Nothing open | Refresh after new data |

**Limitations:** Up to 50 recommendations per tab (server default). Superseded recommendations are never shown. A snoozed recommendation stays on the **Snoozed** tab after its snooze date passes; it does not return to **Open** on its own (see DOCUMENTATION_GAPS.md).

**How it works:** `GET /api/advisor/recommendations?status=<tab>` (limit default 50, max 200, superseded excluded). The server's rule that hides still-snoozed items applies only when no status filter is sent, and the page always sends one.

**Related features:** F-ADV-005, F-ADV-007, F-ADV-008, F-ADV-009.

**Sources:** `apps/web/src/pages/advisor/widgets/RecommendationFeed.tsx:15`, `apps/web/src/pages/advisor/widgets/RecommendationFeed.tsx:33`, `packages/api/src/controllers/advisor.controller.ts:95`, `packages/api/src/services/advisor/advisorRecommendations.service.ts:165`

### Recommendation card and actions <!-- F-ADV-007 -->
**What it does:** Each card shows the category (for example "Tax Harvest", "Rebalance"), an urgency badge, the status if not Open, "Suggested <date>", where the product came from (**Adviser-approved product**, **House methodology**, **Algorithmically ranked** or **No product named**), **What to do** (Buy / Sell / Switch legs with instrument, bucket, units and amount, or "No trade attached — this is guidance only."), and **Why we're suggesting it** (the engine's reasoning text). Four buttons record your decision.

**Why it exists:** Code comment: "Status is the only field a user can change… a recommendation is a record of what was advised, not a mutable to-do item."

**Where to find it:** **Overview → Advisor → What to do next**.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO, R-MANAGER.

**Steps**
1. Read **What to do** and **Why we're suggesting it**.
2. Click **Accept**, **Done**, **Snooze 7 days** or **Dismiss**. A toast says "Marked accepted" (etc.) and the card moves to that tab.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Accept** | Button | Status → Accepted | Already Accepted; while saving |
| **Done** | Button | Status → Done | Already Done; while saving |
| **Snooze 7 days** | Button | Status → Snoozed until 7 days from now | Already Snoozed; while saving |
| **Dismiss** | Button | Status → Dismissed | Already Dismissed; while saving |
| **Why this** | Toggle link | Expands F-ADV-008 | — |
| **Explain in plain English** | Button | F-ADV-009 | Hidden unless narration is enabled and no narration exists |

**Fields and rules:** None (the API also accepts an optional note up to 1,000 characters; the page does not send one).

**Settings and toggles here:** None.

**Results:** Only the status, its time and (for Snooze) the snooze date change. Accepted, Dismissed and Done recommendations are not re-issued by later runs unless the advice changes materially.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This recommendation has been superseded by a newer one — act on that instead" | A later run replaced it | Act on the newer card |
| "Could not update this recommendation" | Request failed | Retry |

**Limitations:** Known defect: the urgency badge shows **Do first** only for priority 1 and **Soon** for 2–3, but the engine's lowest priority is 5, so every card shows **When convenient** (see DOCUMENTATION_GAPS.md). The buttons only record a decision; you place any trade yourself.

**How it works:** `PATCH /api/advisor/recommendations/:id/status` with `{ status }` (Snooze sends `snoozedUntil` = now + 7 days; the server defaults to 7 days when absent and rejects dates in the past). Leaving Snoozed clears the snooze date.

**Related features:** F-ADV-006, F-ADV-008, F-ADV-009.

**Sources:** `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:70`, `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:86`, `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:390`, `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:504`, `packages/api/src/controllers/advisor.controller.ts:106`, `packages/api/src/services/advisor/advisorRecommendations.service.ts:32`, `packages/api/src/services/advisor/advisorRecommendations.service.ts:209`, `packages/api/src/services/advisor/constants.ts:80`

### Why this — inputs and fund evidence <!-- F-ADV-008 -->
**What it does:** **Why this** expands **Inputs this was computed from**: every figure the rule used, with readable labels (rupee values formatted as money, percentages as %, dates in IST). Under it, a line says where the instrument came from ("Instrument taken from your approved product list.", "Chosen by the house ranking methodology, then fitted to this portfolio." or "Instrument ranked from NAV history, not from your approved list."). For a fund chosen by the house methodology it adds "Rank #N of its bucket", scheme code, methodology version and scoring date, the metrics used (Tracking difference, Tracking error, Beat its peers in, Downside captured, Sortino), any adjustments, the runner-up and why it lost, and metrics it could not score ("Not scored on … — we do not hold that data, so its weight went to the metrics we do.").

**Why it exists:** Code comment: "'why this fund?' is the question a named recommendation raises, and an answer that has to be asked for is not really an answer."

**Where to find it:** **Overview → Advisor → What to do next →** a card → **Why this**.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO, R-MANAGER.

**Steps**
1. Click **Why this**. Click again to collapse.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Why this** | Toggle | Show/hide the inputs | — |

**Fields and rules:** None — view only.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** "No input snapshot was recorded for this recommendation." when the engine stored none.

**Limitations:** Nested values are summarised (an object shows its name; a list shows "N items").

**How it works:** Renders `inputsSnapshot`, `provenance` and `selectionEvidence` stored on the recommendation. The snapshot is refreshed on each run while the recommendation is live and unchanged.

**Related features:** F-ADV-007, F-ADV-014.

**Sources:** `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:133`, `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:436`, `packages/api/src/services/advisor/advisorEngine.service.ts:125`

### Explain in plain English (AI narration) <!-- F-ADV-009 -->
**What it does:** **Explain in plain English** asks an AI model to rewrite the card's reasoning in 2–4 plain sentences, shown under **In plain English** with the note "AI-generated summary of the reasoning above. If the two ever disagree, the reasoning above is what the system actually used." and a **How we use AI** link.

**Why it exists:** Code comment: "This layer is decorative by construction… All this service adds is a friendlier paraphrase of that rationale."

**Where to find it:** **Overview → Advisor →** a card's footer.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO, R-MANAGER — only when the operator has switched narration on.

**Steps**
1. Click **Explain in plain English**. A spinner shows while it writes.
2. The narration appears, or a short message explains why not.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Explain in plain English** | Button | Generates narration | Hidden when narration is disabled on the server or already exists; disabled while generating |
| **How we use AI** | Link | Opens `/legal/ai-use` (D-ADV-002) | Shown with narration |

**Fields and rules:** None.

**Settings and toggles here:** None user-facing (operator switch, see the settings reference operator table).

**Results:** The narration is saved on the recommendation and shown on every later visit.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "You've used up plain-English explanations for now. The reasoning above still stands." | Your monthly AI budget is used up | Wait for the next month |
| "Plain-English explanations are turned off right now." | Narration disabled on the server | None |
| "Narration referenced figures absent from the rationale and was discarded: …" | The model invented a figure; it was rejected | Try again or rely on the reasoning |
| "Could not write a plain-English version right now." | Model call failed | Retry later |

**Limitations:** Whether narration is available, its cost and its wording depend on server configuration and the live model; not observed in this code-only run.

**How it works:** `POST /api/advisor/recommendations/:id/prose`. Gate: requires both an Anthropic key and `ENABLE_LLM_ADVISOR_PROSE=true`. Budget: checks the same monthly INR ledger used by email parsing and insights; spend is recorded on success and failure (estimated at USD 3 per million input and USD 15 per million output tokens, converted at the `llm.usd_inr_fx` setting, default 90). The model sees only the category, the reasoning text and the trade legs; its reply is limited to 900 characters and is discarded if it contains any figure or fund name not in the reasoning. Model: `llm.advisor_model` app setting, else `LLM_ADVISOR_MODEL`.

**Related features:** F-ADV-007, D-ADV-002, D-ADV-005.

**Sources:** `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:328`, `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:420`, `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:533`, `packages/api/src/services/advisor/advisorProse.service.ts:49`, `packages/api/src/services/advisor/advisorProse.service.ts:120`, `packages/api/src/services/advisor/advisorProse.service.ts:190`, `packages/api/src/services/advisor/advisorProse.service.ts:303`, `packages/api/src/config/env.ts:128`

### Override list (approved products) <!-- F-ADV-010 -->
**What it does:** The **Override list** card (marked "Optional") lets you name the exact funds or stocks the engine must use for a bucket. Pick a **Bucket**, search an **Instrument**, then **Add to <bucket>**. Saved items appear grouped by bucket in a table (**#**, **Instrument**, **Type** — "Mutual fund" or "Stock") with a remove button. Leave a bucket empty and the house methodology picks the fund.

**Why it exists:** Card text: "Add instruments here only to override that for a bucket: your choices then take precedence, in the order you set." Code comment: "A human's explicit judgement always beats an algorithm."

**Where to find it:** **Overview → Advisor**, last card.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO, R-MANAGER; needs a completed risk assessment.

**Steps**
1. Choose a **Bucket** (S-ADV-009).
2. Type in **Search a fund, stock, or ISIN…** and pick a result. "Selected: <name>" appears.
3. Click **Add to <bucket>**. The toast "Added to the approved list" appears and the item joins the table.
4. To remove, click the bin icon on its row ("Removed from the approved list").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Bucket** | Select | The bucket the product is approved for | — |
| Instrument search ("Search a fund, stock, or ISIN…") | Search | Finds a fund or stock | — |
| **Add to <bucket>** | Button | Adds the selected instrument | No selection; result not from the app's instrument list; no model portfolio; while saving |
| Remove (bin, "Remove <name>") | Icon button | Retires the product | While a removal is running |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Bucket | Choice of 7 | Yes | Fixed list | Equity — Domestic | — |
| Instrument | Search result | Yes | Must be a fund or stock in the app's master list; name cut to 200 characters | — | "That result came from a live price lookup rather than our instrument master, so it can't be shortlisted yet. Pick a fund or stock we already track." |

**Settings and toggles here:** S-ADV-009 **Bucket**.

**Results:** The product is attached to the model portfolio for your current category and ranked last in its bucket. Removal hides it (kept for audit) and renumbers the rest. Recommendations refresh on the next **Refresh recommendations**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "That product is already approved for this bucket" | Duplicate | None needed |
| "Complete the risk assessment first — an approved product is attached to a model portfolio, and you don't have one yet." | No profile | Take the assessment |
| "Couldn't load your approved products." | Request failed | Reload |

**Limitations:** The list is per model portfolio, so retaking the assessment into a different category shows that category's (possibly empty) list. The order can't be changed in the page (API only, F-ADV-011). Notes on a product can be stored by the API but not entered here.

**How it works:** `GET /api/advisor/approved-products?modelPortfolioId=…`, `POST /api/advisor/approved-products` (`modelPortfolioId`, `bucket`, exactly one of `fundId`/`stockId` — else "Provide exactly one of fundId or stockId" — and `label` 1–200 characters), `DELETE /api/advisor/approved-products/:id` (sets inactive and moves the rank to the negative range so live ranks stay 1…n).

**Related features:** F-ADV-005, F-ADV-011.

**Sources:** `apps/web/src/pages/advisor/ApprovedProductsPanel.tsx:52`, `apps/web/src/pages/advisor/ApprovedProductsPanel.tsx:100`, `apps/web/src/pages/advisor/ApprovedProductsPanel.tsx:190`, `apps/web/src/pages/advisor/ApprovedProductsPanel.tsx:201`, `packages/api/src/controllers/advisor.controller.ts:134`, `packages/api/src/services/advisor/approvedProducts.service.ts:190`, `packages/api/src/services/advisor/approvedProducts.service.ts:214`

### Nightly fund scoring (house methodology) <!-- F-ADV-014 -->
**What it does:** Each night the server scores mutual funds under the firm's ranking methodology. When the operator has turned on named-fund advice and the methodology is signed and fresh, recommendations name the top-ranked fund for a bucket (badge **House methodology**) with the evidence shown in F-ADV-008.

**Why it exists:** Code comment: it runs after the AMFI NAV sync "so today's NAVs are in before anything is scored. Scoring a market on yesterday's prices would be silently wrong".

**Where to find it:** No page of its own; the result appears as the provenance badge and fund evidence on recommendation cards.

**Who can use it:** Automatic; affects R-PLUS, R-FAMILY, R-PRO users with a risk profile.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** None.

**Settings and toggles here:** None user-facing (operator `RIA_VERDICTS_ENABLED`).

**Results:** A ranked snapshot per bucket; recommendations created afterwards can name a scheme.

**Errors and troubleshooting:** If named funds never appear, the run record states why (`flag_disabled`, `no_signed_methodology`, `snapshot_stale`, `no_risk_profile`); this is not shown on the page.

**Limitations:** Named funds require `RIA_VERDICTS_ENABLED=true`, a signed methodology and a fresh snapshot; without them advice falls back to category-level or NAV-ranked products. Production configuration was not observed.

**How it works:** Cron 22:45 IST daily, run as system (market reference data has no owner); skipped if the previous run is still going; failures are logged, never thrown. Signing a methodology is a separate manual operation. At startup the server refuses to run (exits) if named-fund advice is on but the data cannot support it.

**Related features:** F-ADV-005, F-ADV-008.

**Sources:** `packages/api/src/jobs/fundScoring.job.ts:117`, `packages/api/src/services/advisor/advisorFacts.builder.ts:314`, `packages/api/src/index.ts:222`

**What this area doesn't do**
- It never places orders, moves money or contacts your broker.
- It does not refresh advice on a schedule; only **Refresh recommendations** does.
- You can't edit target weights, reorder the override list or see past engine runs in the page (API only).
- It does not show your past risk assessments, although they are kept.
- AI connectors (ChatGPT/Claude) cannot read your recommendations.

## Professional workspace (Client books)

The professional workspace lets an accountant, CA or adviser open the books of people who have given them access. It has two halves: the account holder decides who can see their books and what they may change (sidebar **Account Access**, documented in the account-access chapter, D-CA-001); the professional works in **Client books** (`/ca`). Acting for someone who invited you is free on any plan. Inviting clients of your own needs the Pro/Advisor plan. Every page in the workspace needs two-factor sign-in that is switched on and was used for the current session.

### Client books entry and two-factor gate <!-- F-CA-001 -->
**What it does:** Adds **Client books** to the sidebar (next to **Account Access**) once you hold at least one client relationship, and guards `/ca` and `/ca/clients/:id` with a two-factor check. Without two-factor sign-in the page shows **Two-factor sign-in required** and either **Turn on two-factor sign-in** (opens Settings) or, if it is on but this session started without a code, **Sign out and sign in again**.

**Why it exists:** Gate text: "The professional workspace shows your clients' financial data, so it needs two-factor sign-in: a code from an authenticator app each time you sign in." The sidebar entry is "driven by grants HELD, not by plan" so people on the top plan who act for nobody are not shown an empty workspace (code comment).

**Where to find it:** Sidebar **Client books** (route `/ca`).

**Who can use it:** R-PROF (any plan) and R-PRO practices with clients. Not R-MANAGER (the `/api/ca` routes are refused while managing someone else's account). Not R-VISITOR, R-AICONN, R-NOMINEE.

**Steps**
1. If **Client books** is not in the sidebar, you hold no client relationship yet; accept an invitation (F-CA-006) or invite a client (F-CA-004).
2. Click **Client books**. If the two-factor card appears, follow its button, then come back.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Client books** | Sidebar link | Opens `/ca` | Hidden while you hold no client rows |
| **Turn on two-factor sign-in** | Button | Opens **Settings** (D-CA-002) | Shown when two-factor is off |
| **Sign out and sign in again** | Button | Clears the session and returns to `/login?next=/ca` | Shown when two-factor is on but not used this session |

**Fields and rules:** None.

**Settings and toggles here:** None (two-factor sign-in is set in Settings, D-CA-002).

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Turn on two-factor sign-in (Settings) to use the professional workspace. It protects your clients' data" | Two-factor off | Turn it on in Settings |
| "Sign out and sign in again with your authenticator code to use the professional workspace…" | Session started without a code | Sign out and in again with the code |

**Limitations:** The sidebar checks for client rows every 30 seconds and on window focus, so a new grant can take up to 30 s to show the entry. Revoked (past) relationships still count, so the entry stays after all your clients have left.

**How it works:** The sidebar calls `GET /api/ca/clients`, which is open to every signed-in user (an empty list needs no two-factor) but checks two-factor as soon as the list is non-empty; a `TWO_FACTOR_REQUIRED` answer is treated as "has clients" so the entry still appears. Every other `/api/ca` route runs `requireProfessionalSecondFactor`; every client-specific route also re-checks the grant (`getCaScope`) on each request. The web gate reads the two-factor status (`enabled`, `sessionVerified`).

**Related features:** F-CA-002, D-CA-001, D-CA-002.

**Sources:** `apps/web/src/components/layout/SidebarNav.tsx:170`, `apps/web/src/components/ca/ProfessionalTwoFactorGate.tsx:27`, `apps/web/src/components/ca/ProfessionalTwoFactorGate.tsx:45`, `apps/web/src/components/ca/ProfessionalTwoFactorGate.tsx:56`, `packages/api/src/routes/ca.routes.ts:71`, `packages/api/src/routes/ca.routes.ts:73`, `packages/api/src/controllers/ca.controller.ts:66`, `packages/api/src/lib/professionalMfa.ts:29`

### Clients list <!-- F-CA-002 -->
**What it does:** The **Clients** page (eyebrow "Practice") lists the people whose books you keep in three groups: **Your clients** (active; each card shows name, email, "Client since <date>", and a strip **Shared with you** — "All of their books" or "Part of their books", **You can** — "Keep the books", "Make some changes" or "View only", **Until** — end date or "No end date"), **Waiting to accept** (invited, with "Link expires <date>"), and a collapsed **Past engagements (N)** ("Ended <date>. What was done stays on the record.").

**Why it exists:** Page text: "The people whose books you keep. Each of them decides what you can see and do, and can withdraw it at any time."

**Where to find it:** **Client books** (route `/ca`).

**Who can use it:** R-PROF, R-PRO (with two-factor).

**Steps**
1. Open **Client books**.
2. Click **Open books** on a client to work in their books (F-CA-007).
3. Click **Past engagements** to show ended relationships.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Open books** | Button | Opens `/ca/clients/:id` | Active clients only |
| **Close** | Button | Starts closing the engagement (F-CA-003) | Active clients only |
| **Past engagements (N)** | Toggle | Shows/hides ended relationships | Only when there are any |
| **Invite a client** | Button | F-CA-004 | Only on Pro/Advisor |
| **Invite your own clients** | Link button | Meant to open the plans page | Shown below Pro/Advisor; see Limitations |

**Fields and rules:** None — view only.

**Settings and toggles here:** None here; reach and edit rights are set by each client on Account Access (D-CA-001).

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No clients yet" | No relationships | Wait for an invitation or invite a client |

**Limitations:** Known defect: **Invite your own clients** links to `/settings/billing`, which is not a route, so it shows the not-found page (see DOCUMENTATION_GAPS.md); use **Pricing** instead. Pending invitations you sent can't be resent, cancelled or copied from this page after the invite dialog is closed.

**How it works:** `GET /api/ca/clients` returns every client row where you are the professional (revoked included), ordered by status then name; the name and email shown are of the person whose books they are (for a client-initiated grant, that person's account name/email). The page refreshes every 5 seconds while visible and on focus, because the client changes access from their own session.

**Related features:** F-CA-001, F-CA-003, F-CA-004, F-CA-007, D-CA-001, D-CA-007.

**Sources:** `apps/web/src/pages/ca/CaWorkspacePage.tsx:45`, `apps/web/src/pages/ca/CaWorkspacePage.tsx:53`, `apps/web/src/pages/ca/CaWorkspacePage.tsx:83`, `apps/web/src/pages/ca/CaWorkspacePage.tsx:134`, `apps/web/src/pages/ca/CaWorkspacePage.tsx:155`, `apps/web/src/components/ca/AccessParts.tsx:72`, `apps/web/src/components/ca/accessModel.ts:21`, `packages/api/src/services/ca/caAccess.service.ts:175`

### Close an engagement <!-- F-CA-003 -->
**What it does:** Ends your access to one client's books from your side.

**Why it exists:** Code comment: "Either side may: the client withdrawing consent, or the CA closing an engagement."

**Where to find it:** **Client books →** an active client → **Close**.

**Who can use it:** R-PROF, R-PRO.

**Steps**
1. Click **Close** on the client card. The card asks "Close this engagement?".
2. Click **Close engagement** (or **Keep** to cancel). The toast "Engagement closed" appears and the client moves to **Past engagements**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Close** | Button | Asks for confirmation | — |
| **Close engagement** | Button | Revokes the grant | While closing |
| **Keep** | Button | Cancels | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The relationship becomes Revoked immediately; your next request for that client is refused. The client's activity feed records "Your CA closed the engagement for <name>."

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A generic error toast | Request failed (the page shows the browser's error text, not the server's) | Retry |

**Limitations:** Only the client can restore a relationship that was a real invitation ("Only the client can restore this access. Ask them, or send a fresh invitation."). Files you already downloaded cannot be recalled.

**How it works:** `POST /api/ca/clients/:clientId/revoke` sets status REVOKED, the revoke time and who revoked, clears any invitation token and writes a `GRANT_REVOKED` audit row, in one transaction. Nothing is cached, so it takes effect on the next request.

**Related features:** F-CA-002, D-CA-001.

**Sources:** `apps/web/src/pages/ca/CaWorkspacePage.tsx:59`, `apps/web/src/pages/ca/CaWorkspacePage.tsx:244`, `packages/api/src/routes/ca.routes.ts:100`, `packages/api/src/services/ca/caAccess.service.ts:538`, `packages/api/src/services/ca/caAccess.service.ts:832`

### Invite a client (practice) <!-- F-CA-004 -->
**What it does:** A Pro/Advisor practice invites someone to share their books. **Invite a client** opens a dialog asking **Client name** and **Their email**; **Create invitation** creates it, then the dialog becomes **Send the invitation**: a composer showing **To**, editable **Subject** and **Your message**, a live **Preview**, the accept link with a copy button, sends remaining, and **Send email** / **Later**.

**Why it exists:** Code comment: "What the advisor plan buys is a practice of your own — onboarding your own clients." The fixed link and expiry in the email are "what lets them tell this apart from a phishing mail" (composer text).

**Where to find it:** **Client books → Invite a client** (also on the empty state).

**Who can use it:** R-PRO only (with two-factor). R-PROF on a lower plan sees **Invite your own clients** instead.

**Steps**
1. Click **Invite a client**.
2. Enter **Client name** and **Their email** (the address on their account). Click **Create invitation**.
3. Edit **Subject** and **Your message** if you want; the preview updates after you stop typing.
4. Click **Send email**. The toast "Sent to <address>" appears and the dialog confirms the expiry date. Or copy the link and send it yourself, then click **Later**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Invite a client** | Button | Opens the dialog | Hidden below Pro/Advisor |
| **Create invitation** | Button | Creates the pending invitation | Name or email empty; while creating |
| **Cancel** | Button | Closes without creating | — |
| **Subject**, **Your message** | Text fields | Edit the email | — |
| Copy link | Icon button | Copies the accept link | — |
| **Send email** | Button | Emails the invitation | Email not configured on the server; no sends left; while sending |
| **Later** | Button | Closes the dialog | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Client name | Text | Yes | 1–200 characters | — | "A client name is required." |
| Their email | Text | Yes | Valid email | — | Server validation message |
| Subject | Text | No | Up to 160 characters, one line | Server draft | "Subject is too long (max 160 characters)." / "Subject must be a single line." |
| Your message | Text | No | Up to 4,000 characters | Server draft | "Message is too long (max 4000 characters)." |

**Settings and toggles here:** None.

**Results:** A pending client row appears under **Waiting to accept**. The link (`/ca/invitations/<token>/accept`) works once and expires after 14 days; it can be accepted only by an account with the invited email. Nothing of theirs is visible to you until they accept.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This invitation has already been emailed 5 times. Copy the link and send it yourself, or start a fresh invitation." | Per-invitation send limit | Copy the link |
| "You have sent a lot of invitations in the last hour. Try again shortly." | 20 sends per hour reached | Wait |
| "Email is not configured on this server, so copy the link above and send it yourself." | No SMTP | Copy the link |
| "This feature requires the PRO_ADVISOR plan or higher" | Not on Pro/Advisor | Upgrade |

**Limitations:** The invitation email can only be sent from this dialog; once closed there is no resend from the clients list. Errors on **Create invitation** show the browser's generic text rather than the server message.

**How it works:** `POST /api/ca/clients/invite` (gated by CA_WORKSPACE = PRO_ADVISOR) creates an INVITED, PENDING client row with a hashed token and an audit entry, and returns the token. `POST /api/ca/clients/:id/invite-email/preview` and `/send` render the same draft; send is limited to 5 per invitation and 20 per hour, replies go to your address, and it records an audit entry.

**Related features:** F-CA-002, F-CA-005, D-CA-008.

**Sources:** `apps/web/src/pages/ca/CaWorkspacePage.tsx:79`, `apps/web/src/pages/ca/CaWorkspacePage.tsx:375`, `apps/web/src/components/ca/InviteEmailComposer.tsx:145`, `apps/web/src/components/ca/InviteEmailComposer.tsx:200`, `apps/web/src/components/ca/InviteEmailComposer.tsx:223`, `packages/api/src/routes/ca.routes.ts:95`, `packages/api/src/services/ca/caAccess.service.ts:43`, `packages/api/src/services/ca/caAccess.service.ts:410`, `packages/api/src/services/ca/caInviteEmail.service.ts:42`, `packages/api/src/services/ca/caInviteEmail.service.ts:200`, `packages/api/src/services/ca/caInviteEmail.service.ts:231`

### Accept a practice's invitation (account holder) <!-- F-CA-005 -->
**What it does:** The page **Give your accountant access** explains what accepting grants and lets you **Accept** or choose **Not now**. It lists: "They cannot create or delete portfolios, or change your login.", "They cannot see your saved credentials or connected mailboxes.", "Every change they make is recorded, and you can read all of it.", "You can withdraw access at any time, and it stops immediately."

**Why it exists:** Code comment: "The page states what is being granted before it is granted… this is the only moment the person gets to decide."

**Where to find it:** The link in the practice's email (`/ca/invitations/<token>/accept`); you must be signed in.

**Who can use it:** Any signed-in account (R-FREE and up) whose email matches the invitation. Not R-MANAGER (account route).

**Steps**
1. Open the link and sign in with the invited email.
2. Click **Accept**. You are taken to **Account Access** (D-CA-001), where the practice now appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Accept** | Button | Accepts the invitation | While accepting |
| **Not now** | Button | Goes to the dashboard; the invitation stays open | — |

**Fields and rules:** None.

**Settings and toggles here:** After accepting, what the practice can see and change is set on Account Access (D-CA-001). A new grant starts view-only.

**Results:** The relationship becomes active; the practice can read your books from now on, within the scope you set.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "That invitation was sent to a different email address." | Signed in with another account | Sign in with the invited address |
| "That invitation has expired. Ask your CA to send a new one." | Older than 14 days | Ask for a new one |
| "That invitation has already been used." | Already accepted | None |
| "That invitation is no longer valid." | Withdrawn | Ask for a new one |
| "Invitation not found." | Wrong or old link | Ask for a new one |

**Limitations:** The page's wording says accepting lets them "keep your books: creating and editing vouchers, your chart of accounts, and corrections to your records", but a new grant starts view-only until you widen it on Account Access (see DOCUMENTATION_GAPS.md). The page does not show who invited you.

**How it works:** `POST /api/me/professional-access/invitations/:token/accept` runs as system inside one transaction: finds the row by token hash, checks it is an INVITED, unaccepted, unexpired, non-revoked invitation sent to your email, sets you as the subject, marks it ACTIVE, clears the token (single use) and records `GRANT_ACCEPTED`.

**Related features:** F-CA-004, D-CA-001.

**Sources:** `apps/web/src/pages/ca/AcceptCaInvitationPage.tsx:28`, `apps/web/src/pages/ca/AcceptCaInvitationPage.tsx:40`, `apps/web/src/pages/ca/AcceptCaInvitationPage.tsx:51`, `packages/api/src/routes/ca.routes.ts:187`, `packages/api/src/services/ca/caAccess.service.ts:463`, `packages/api/src/services/ca/caAccess.service.ts:490`, `packages/api/src/services/ca/caAccess.service.ts:496`

### Accept an account holder's invitation (professional) <!-- F-CA-006 -->
**What it does:** When an account holder invites their professional from Account Access, the emailed link opens a page — viewable before signing in — titled "<Name> would like you to see their books", stating which email may accept and the expiry date. After signing in with that email, **Accept and open their books** grants access; the confirmation "You can now see <Name>'s books" offers **Open their books**, **Set up my portfolio** and **See advisor plans**.

**Why it exists:** Code comment: "the person opening this link may never have heard of the product. So the page answers 'who is asking, and for what' BEFORE asking them to sign in." Accepting is free.

**Where to find it:** Email link `/professional-invitations/<token>` (outside the signed-in area).

**Who can use it:** R-VISITOR can view the invitation; accepting needs a signed-in account with the invited email and two-factor sign-in used this session (any plan). Becomes R-PROF.

**Steps**
1. Open the link. The page shows who invited you.
2. If not signed in, click **Sign in** or **Create account** (both return to this page). If signed in as another address, click **Sign in as <invited email>**.
3. Click **Accept and open their books**.
4. Click **Open their books** to go to **Client books**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Sign in** / **Create account** | Links | Go to login/register and back | Shown when signed out |
| **Sign in as <email>** | Button | Signs out and returns to login | Shown when signed in with another email |
| **Accept and open their books** | Button | Accepts | Shown only when the email matches; disabled while accepting |
| **Open their books** | Button | Opens `/ca` | After accepting |
| **Set up my portfolio** | Link | Opens the dashboard | After accepting |
| **See advisor plans** | Link | Meant to open the plans page | After accepting; see Limitations |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** You become the professional on that relationship; it appears under **Your clients**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This invitation isn't open" + "That invitation has expired. Ask them to send a new one." / "That invitation was withdrawn." / "That invitation has already been used." / "Invitation not found." | Link no longer valid | Ask the person to invite you again |
| "That invitation was sent to a different email address." | Wrong account | Sign in with the invited email |
| "You cannot accept your own invitation." | You invited yourself | — |
| "Turn on two-factor sign-in (Settings) to use the professional workspace…" | Two-factor off or not used this session | Turn it on / sign in again with the code |

**Limitations:** Known defect: **See advisor plans** links to `/settings/billing`, which does not exist (not-found page). The page does not warn before you click Accept that two-factor sign-in is required.

**How it works:** `GET /api/professional-invitations/:token` (no sign-in) returns only the inviter's name (or "An EveryPaisa user"), the invited email and the expiry. `POST /api/professional-invitations/:token/accept` runs `authenticate` and the two-factor check, then (as system, in one transaction) validates the token, email and expiry, sets you as the professional, marks it ACTIVE, clears the token and records `GRANT_ACCEPTED`.

**Related features:** F-CA-001, F-CA-007, D-CA-001, D-CA-007.

**Sources:** `apps/web/src/App.tsx:133`, `apps/web/src/pages/ca/AcceptProfessionalInvitePage.tsx:69`, `apps/web/src/pages/ca/AcceptProfessionalInvitePage.tsx:135`, `apps/web/src/pages/ca/AcceptProfessionalInvitePage.tsx:151`, `apps/web/src/pages/ca/AcceptProfessionalInvitePage.tsx:194`, `packages/api/src/routes/ca.routes.ts:206`, `packages/api/src/routes/ca.routes.ts:210`, `packages/api/src/services/ca/caAccess.service.ts:1033`, `packages/api/src/services/ca/caAccess.service.ts:1078`

### Client books header and live access changes <!-- F-CA-007 -->
**What it does:** At the top of `/ca/clients/:id`: **All clients** back link, the client's name and email, a badge (**Keep the books** / **Make some changes** / **View only**), the access strip, and a note — "View only. You can read everything here and download reports, but not post entries or change transactions. <Name> can widen this from their Account Access page." — or, when you can edit, "<Name> can see every change you make here, and can withdraw access at any time." Below is a tab bar: **Chart of accounts**, **Vouchers**, **Trial balance** | **Transactions**, **FMV (31 Jan 2018)** | **Reports**, **Documents** | **Activity**. If the client changes your access while the page is open, a toast says "<Name> has withdrawn your access.", "<Name> changed your access to view only." or "<Name> updated what you can do in their books." and buttons appear or disappear.

**Why it exists:** Code comment: "Everything here belongs to somebody else, who can read every change and end the arrangement; the page says so instead of implying it."

**Where to find it:** **Client books →** a client → **Open books**.

**Who can use it:** R-PROF, R-PRO with an active grant and two-factor.

**Steps**
1. Click a tab to open that section.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **All clients** | Link | Back to `/ca` | — |
| Section tabs (8) | Tabs | Switch section (not saved; opens on **Chart of accounts**) | — |

**Fields and rules:** None.

**Settings and toggles here:** Edit rights (books, transactions, imports, fair market values), portfolio/asset-class/category scope and the access window are set by the client (D-CA-001); each edit button below appears only when the matching right is on.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "That client is not yours." | Not your client (or doesn't exist) | Use **All clients** |
| "Your access to this client has been revoked." | Ended | — |
| "That client has not accepted your invitation yet." | Pending | Wait |
| "This access starts on <date>." / "This access ended on <date>. Ask the client to extend it." | Outside the client's access window (dates in IST) | Ask the client |
| "<Name> has given you view-only access, so you cannot <action>. They can change that from Account Access." | Missing edit right | Ask the client |

**Limitations:** Hiding a button is a convenience; the database enforces the same limits.

**How it works:** The page re-reads the client list every 5 seconds while visible. Every `/api/ca/clients/:id/*` request runs `getCaScope`, which checks two-factor, ownership, status and the access window (whole IST days) and returns the scope and the four edit flags; database row-level policies apply the same limits.

**Related features:** F-CA-008 to F-CA-017, D-CA-001.

**Sources:** `apps/web/src/pages/ca/ClientBooksPage.tsx:80`, `apps/web/src/pages/ca/ClientBooksPage.tsx:128`, `apps/web/src/pages/ca/ClientBooksPage.tsx:148`, `apps/web/src/pages/ca/ClientBooksPage.tsx:297`, `apps/web/src/pages/ca/ClientBooksPage.tsx:718`, `apps/web/src/pages/ca/ClientBooksPage.tsx:754`, `packages/api/src/services/ca/caAccess.service.ts:119`, `packages/api/src/services/ca/caAccess.service.ts:132`

### Chart of accounts <!-- F-CA-008 -->
**What it does:** The **Chart of accounts** tab lists the client's ledger heads (**Code**, **Account**, **Type**). With the books right you can add (**New account**), rename/recode (pencil) and delete (bin) accounts.

**Why it exists:** Tab hint: "The ledger heads every voucher posts to."

**Where to find it:** **Client books →** client → **Chart of accounts**.

**Who can use it:** View: R-PROF/R-PRO with a grant. Change: only with the client's books right.

**Steps**
1. Click **New account**, enter **Code**, **Name**, **Type** and optional **Opening balance (optional)**, click **Create account** ("Account created").
2. To edit, click the pencil, change code or name, **Save changes** ("Account updated").
3. To delete, click the bin ("Account deleted") — there is no confirmation.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **New account** | Button | Opens **New account** | Hidden without books right |
| Edit (pencil, "Edit <name>") | Icon | Opens **Edit account** | Hidden without books right |
| Delete (bin, "Delete <name>") | Icon | Deletes immediately | Hidden without books right |
| **Create account** / **Save changes** / **Cancel** | Buttons | Save or close | Save disabled until Code and Name are filled and the balance is valid |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Code | Text | Yes | 1–20 characters | — | — |
| Name | Text | Yes | 1–200 characters | — | — |
| Type | Select | Yes (new only) | Asset, Liability, Income, Expense, Equity (S-CA-001) | Asset | — |
| Opening balance (optional) | Number | No | Positive, digits and optional decimal point | — | "Enter a positive amount, digits and an optional decimal point only." |

**Settings and toggles here:** S-CA-001 **Account type** — fixed once created; to change it, delete and re-create.

**Results:** The client's chart changes; each change is recorded in both parties' activity.

**Errors and troubleshooting:** "Could not save the account" / "Could not delete the account" with the server reason.

**Limitations:** Type cannot be edited. Deletion has no confirmation step. Opening the tab with the books right creates the default chart the first time (recorded as "Created the default chart of accounts (N accounts).").

**How it works:** `GET /api/ca/clients/:id/accounts/flat`, `POST …/accounts`, `PATCH …/accounts/:id`, `DELETE …/accounts/:id`, each after `getCaScope` and (for writes) the books right; each write and its audit row share one transaction. Reading with the books right first seeds the default chart and derives vouchers (F-CA-010).

**Related features:** F-CA-009, F-CA-010, D-CA-005.

**Sources:** `apps/web/src/pages/ca/ClientBooksPage.tsx:349`, `apps/web/src/pages/ca/ClientBooksPage.tsx:381`, `apps/web/src/components/ca/AccountFormDialog.tsx:127`, `apps/web/src/components/ca/AccountFormDialog.tsx:136`, `apps/web/src/components/ca/AccountFormDialog.tsx:149`, `packages/api/src/schemas/accounting.schema.ts:38`, `packages/api/src/controllers/caAccounting.controller.ts:105`, `packages/api/src/controllers/caAccounting.controller.ts:296`

### Vouchers and receipts <!-- F-CA-009 -->
**What it does:** The **Vouchers** tab lists double-entry vouchers (**No.**, **Type**, **Date**, **Narration**). Each row can show its receipt (eye) or download it as PDF. **Receipts ZIP** downloads every rent, premium and loan receipt as one PDF each; **Excel** downloads the same receipts as one totalled spreadsheet. With the books right you can **Post voucher** and delete vouchers.

**Why it exists:** Tab hint: "The double-entry record behind the trial balance, P&L and balance sheet."

**Where to find it:** **Client books →** client → **Vouchers**.

**Who can use it:** View and download: R-PROF/R-PRO with a grant. Post/delete: books right.

**Steps**
1. Click **Post voucher**. Choose **Type**, check the suggested **Number**, set **Date** and optional **Narration (optional)**.
2. For each entry pick a **Debit** account, a **Credit** account and an **Amount**; **Add entry** for more lines.
3. Click **Post voucher** ("Voucher posted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Receipts ZIP** | Button | Downloads receipt PDFs as a ZIP | — |
| **Excel** | Button | Downloads receipts workbook | — |
| **Generate from activity** | Button | F-CA-010 | Hidden without books right |
| **Post voucher** | Button | Opens the dialog / posts it | Hidden without books right; disabled until valid |
| View receipt (eye) / Download receipt | Icons | Receipt PDF for a voucher | — |
| Delete voucher (bin) | Icon | Deletes immediately | Hidden without books right |
| **Add entry** / remove entry | Buttons | Add or remove debit/credit lines | Remove disabled with one entry |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Type | Select | Yes | Journal, Payment, Receipt, Contra, Purchase, Sales (S-CA-002) | Journal | — |
| Number | Text | Yes | 1–50 characters | Next number for the type | — |
| Date | Date | Yes | YYYY-MM-DD | Today | — |
| Narration (optional) | Text | No | Up to 500 characters | — | — |
| Entry debit / credit / amount | Selects + number | Yes | Different accounts; amount digits with optional decimals | — | "An entry cannot debit and credit the same account." / "Amounts take digits and an optional decimal point only." |

**Settings and toggles here:** S-CA-002 **Voucher type**.

**Results:** The voucher posts to the client's ledger and appears in their activity.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This client has no chart of accounts yet. Open the Chart of accounts tab once to create the defaults." | No accounts | Open **Chart of accounts** (books right needed) |
| "Could not post the voucher" / "Could not delete the voucher" + reason | Server refused | Read the reason |
| "Could not produce that receipt" / "Could not build that download" | Receipt generation failed | Retry |

**Limitations:** Vouchers cannot be edited in the page (API only, F-CA-019). Deleting has no confirmation.

**How it works:** `GET …/vouchers`, `GET …/vouchers/next-no?type=`, `POST …/vouchers` (each entry is one debit/credit pair, so the voucher balances by construction), `DELETE …/vouchers/:id`, receipts via `GET …/vouchers/:id/receipt.pdf`, `…/receipts.zip`, `…/receipts.xlsx` (these first bring the books up to date when the books right is on).

**Related features:** F-CA-008, F-CA-010, F-CA-011, D-CA-005.

**Sources:** `apps/web/src/pages/ca/ClientBooksPage.tsx:406`, `apps/web/src/pages/ca/ClientBooksPage.tsx:421`, `apps/web/src/pages/ca/ClientBooksPage.tsx:484`, `apps/web/src/components/ca/VoucherFormDialog.tsx:170`, `apps/web/src/components/ca/VoucherFormDialog.tsx:176`, `apps/web/src/components/ca/VoucherFormDialog.tsx:253`, `packages/api/src/schemas/accounting.schema.ts:55`, `packages/api/src/controllers/caAccounting.controller.ts:344`, `packages/api/src/controllers/caAccounting.controller.ts:844`

### Generate from activity <!-- F-CA-010 -->
**What it does:** Derives vouchers from what the client recorded (trades, loan payments, rent, premiums). It happens automatically when you open a books tab with the books right; the **Generate from activity** button repeats it on demand and reports "Generated N vouchers" or "Books are already up to date".

**Why it exists:** Code comment: projecting on open "is what makes the screen and the download agree"; the button covers "the client added transactions while the CA had the page open".

**Where to find it:** **Vouchers** and **Trial balance** tabs.

**Who can use it:** R-PROF/R-PRO with the books right.

**Steps**
1. Click **Generate from activity**. The icon spins, then the toast reports the count.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Generate from activity** | Button | Derives vouchers now | Hidden without books right; disabled while running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** New vouchers in the client's books.

**Errors and troubleshooting:** "Could not generate vouchers" with the reason (the button reports errors; the automatic pass logs them and shows existing figures).

**Limitations:** With view-only access nothing is derived, so you see only what the client's own books already hold.

**How it works:** `POST /api/ca/clients/:id/vouchers/generate` seeds the default chart if missing and runs the same projection the accounting module uses (D-CA-005), recording audit rows.

**Related features:** F-CA-009, F-CA-011.

**Sources:** `apps/web/src/pages/ca/ClientBooksPage.tsx:202`, `apps/web/src/pages/ca/ClientBooksPage.tsx:217`, `packages/api/src/controllers/caAccounting.controller.ts:193`, `packages/api/src/controllers/caAccounting.controller.ts:203`, `packages/api/src/controllers/caAccounting.controller.ts:223`

### Trial balance <!-- F-CA-011 -->
**What it does:** Shows every account's **Opening**, **Debit**, **Credit** and **Balance**, with a **Total** row and a badge "Debits and credits agree" or "Out of balance by ₹…".

**Why it exists:** Tab hint: "Every account's opening, movement and closing balance. The two totals must agree."

**Where to find it:** **Client books →** client → **Trial balance**.

**Who can use it:** R-PROF/R-PRO with a grant.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Generate from activity** | Button | F-CA-010 | Hidden without books right or when nothing is posted |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** "Nothing posted yet" — no vouchers yet; generate them from activity.

**Limitations:** Always as of today in the page (the API accepts an as-of date; the page does not send one).

**How it works:** `GET /api/ca/clients/:id/trial-balance` (brings the books up to date first when the books right is on). Totals are summed with decimal arithmetic to 4 places.

**Related features:** F-CA-009, F-CA-010, F-CA-015.

**Sources:** `apps/web/src/pages/ca/ClientBooksPage.tsx:912`, `packages/api/src/controllers/caAccounting.controller.ts:426`

### Client transactions <!-- F-CA-012 -->
**What it does:** The **Transactions** tab lists the client's trades (**Date**, **Asset**, **Type**, **Qty**, **Price**, **Net**). With the transactions right you can **Add transaction** and correct a trade (pencil → **Correct transaction**).

**Why it exists:** Tab hint: "Trades as this client recorded them. Corrections here flow into the vouchers." Code comment: a professional "may add a transaction and correct one, but never delete one".

**Where to find it:** **Client books →** client → **Transactions**.

**Who can use it:** View: R-PROF/R-PRO with a grant. Add/correct: transactions right.

**Steps**
1. **Add transaction**: pick **Type** and **Asset class**; fill **Scheme name**/**AMC** (mutual funds), **Symbol**/**Name** (equity, ETF, foreign equity) or **Asset name** (others), optional **ISIN (optional)**, **Trade date**, **Quantity**, **Price**, optional charges (**Add charges (optional)**: Brokerage, STT, Stamp duty, Exchange, GST, SEBI, Other, Broker) and **Narration (optional)**. Click **Add transaction** ("Transaction recorded").
2. **Correct**: click the pencil, change **Trade date**, **Quantity**, **Price**, **Asset name** or **Narration** ("Why this was corrected"), click **Save correction** ("Transaction corrected").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add transaction** | Button | Opens the add dialog / saves | Hidden without transactions right; save disabled until date, quantity, price and a name are valid |
| Correct (pencil) | Icon | Opens **Correct transaction** | Hidden without transactions right |
| **Add charges (optional)** / **Hide charges** | Toggle | Shows charge fields | — |
| **Save correction** | Button | Saves changed fields only | Disabled until something changed and values are valid |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Type | Select | Yes | Buy, Sell, SIP, Switch in, Switch out, Dividend payout, Dividend reinvest, Bonus, Split, Redemption (S-CA-003) | Buy | — |
| Asset class | Select | Yes | 26 classes (S-CA-003) | Equity | — |
| Quantity, Price | Number | Yes | Digits and one decimal point | — | "Digits and one decimal point." |
| Trade date | Date | Yes | — | Today | — |
| Charges | Number | No | Decimal strings | — | — |

**Settings and toggles here:** S-CA-003 **Transaction type and asset class**.

**Results:** Holdings and capital gains recalculate for the client. A correction re-derives gross and net amounts from quantity, price and charges, and the client sees the before and after values in their activity.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "None of the portfolios this client shared with you can take these entries. Ask the client to share one." | Grant narrowed to portfolios and none is usable | Ask the client |
| "Transaction not found for this client" | Wrong row | Reload |
| "Could not record the transaction" / "Could not save the correction" | Server refused | Read the reason |

**Limitations:** Transactions can't be deleted by a professional. Portfolio, asset class and buy/sell direction can't be corrected. Only the newest 200 transactions are listed. A new transaction goes into the client's first portfolio you can see; if the client has no portfolio and your grant covers all portfolios, a portfolio "My Portfolio" is created for them. Known defect: on correction, net amount adds charges only for **Buy**; for SIP, Switch in and Dividend reinvest the charges are subtracted (see DOCUMENTATION_GAPS.md).

**How it works:** `GET …/transactions` (newest 200), `POST …/transactions` (same schema and service as the client's own manual entry, minus the portfolio field), `PATCH …/transactions/:id` (write and audit in one transaction; holdings recompute after commit). There is no DELETE route and no database policy that would allow one.

**Related features:** F-CA-010, F-CA-013, D-CA-005.

**Sources:** `apps/web/src/pages/ca/ClientBooksPage.tsx:527`, `apps/web/src/components/ca/AddTransactionDialog.tsx:72`, `apps/web/src/components/ca/AddTransactionDialog.tsx:301`, `apps/web/src/components/ca/CorrectTransactionDialog.tsx:110`, `apps/web/src/components/ca/CorrectTransactionDialog.tsx:129`, `apps/web/src/api/ca.api.ts:406`, `packages/api/src/routes/ca.routes.ts:131`, `packages/api/src/controllers/caAccounting.controller.ts:154`, `packages/api/src/controllers/caAccounting.controller.ts:474`, `packages/api/src/controllers/caAccounting.controller.ts:591`, `packages/api/src/controllers/caAccounting.controller.ts:714`

### Import a statement for a client <!-- F-CA-013 -->
**What it does:** **Import file** uploads a statement, contract note or CAS into the client's books and parses it in the background ("File uploaded — parsing in the background"). **Recent imports** lists files with **Type**, **Status**, **Rows** (success / total) and **Uploaded**.

**Why it exists:** Code comment: it reuses "the SAME upload middleware, request body schema, createImportJob call and parser pipeline the client's own POST /api/imports route does".

**Where to find it:** **Client books →** client → **Transactions → Import file**.

**Who can use it:** R-PROF/R-PRO with the imports right.

**Steps**
1. Click **Import file** and choose a file (.pdf, .csv, .tsv, .xlsx, .xls, .html, .htm).
2. Watch **Recent imports**; pending rows update every 4 seconds until done.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Import file** | Button + file picker | Uploads a file | Hidden without imports right; disabled while uploading |

**Fields and rules:** File types as above; the type is inferred from the file name.

**Settings and toggles here:** None.

**Results:** Parsed rows land in the client's first visible portfolio, limited to the asset classes in your grant.

**Errors and troubleshooting:** "Upload failed" with the reason (for example a regulatory document type that isn't accepted, or a file that is not a supported kind).

**Limitations:** The page has no password field, so password-protected files can't be unlocked here (the API accepts a password).

**How it works:** `POST /api/ca/clients/:id/imports` (multipart field `file`) → `createImportJob` for the client with `caAllowedAssetClasses` from the grant; audit `IMPORT_JOB_CREATED`. `GET …/imports` lists the client's import jobs. Import processing is the shared pipeline (D-CA-004).

**Related features:** F-CA-012, D-CA-004.

**Sources:** `apps/web/src/pages/ca/ClientBooksPage.tsx:261`, `apps/web/src/pages/ca/ClientBooksPage.tsx:501`, `apps/web/src/pages/ca/ClientBooksPage.tsx:522`, `apps/web/src/pages/ca/ClientBooksPage.tsx:576`, `packages/api/src/routes/ca.routes.ts:150`, `packages/api/src/controllers/caAccounting.controller.ts:755`, `packages/api/src/controllers/caAccounting.controller.ts:819`

### Fair market value on 31 Jan 2018 <!-- F-CA-014 -->
**What it does:** The **FMV (31 Jan 2018)** tab lists per-scrip values used to grandfather long-term equity gains under Section 55(2)(ac) (**ISIN**, **Scrip**, **Source** — "Set here" or "Reference", **FMV per unit**). With the FMV right you can **Set a value**, edit or remove your own overrides.

**Why it exists:** Dialog text: "Changing it changes your client's taxable gain, so the previous figure is kept on the record."

**Where to find it:** **Client books →** client → **FMV (31 Jan 2018)**.

**Who can use it:** View: R-PROF/R-PRO with a grant. Change: FMV right.

**Steps**
1. Click **Set a value**, enter **ISIN**, optional **Scrip name (optional)** and **FMV per unit**, click **Save value** ("Fair market value saved").
2. To remove an override click its bin ("Override removed"); no confirmation.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Set a value** | Button | Opens the dialog | Hidden without FMV right |
| Edit / Remove | Icons | Edit or delete an override | Only on "Set here" rows and with FMV right |
| **Save value** | Button | Saves | Disabled until ISIN and value are valid |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| ISIN | Text | Yes | 2 letters + 9 alphanumerics + 1 digit; locked when editing | — | "An ISIN is 12 characters: two letters, then nine alphanumerics, then a digit." |
| Scrip name (optional) | Text | No | Up to 200 characters | — | — |
| FMV per unit | Number | Yes | Digits and optional decimal point | — | "Digits and an optional decimal point only." |

**Settings and toggles here:** None.

**Results:** The client's capital-gains calculations use the override for that ISIN.

**Errors and troubleshooting:** "No override set for that ISIN" when removing a missing one.

**Limitations:** Reference (shared) values cannot be edited here.

**How it works:** `GET …/fmv`, `PUT …/fmv/:isin` (upsert), `DELETE …/fmv/:isin`, with audit rows that keep the previous value.

**Related features:** F-CA-012, F-CA-015.

**Sources:** `apps/web/src/pages/ca/ClientBooksPage.tsx:614`, `apps/web/src/pages/ca/ClientBooksPage.tsx:653`, `apps/web/src/components/ca/FmvFormDialog.tsx:99`, `apps/web/src/components/ca/FmvFormDialog.tsx:104`, `apps/web/src/components/ca/FmvFormDialog.tsx:141`, `packages/api/src/routes/ca.routes.ts:160`, `packages/api/src/controllers/caAccounting.controller.ts:652`

### Client reports <!-- F-CA-015 -->
**What it does:** The **Reports** tab runs the app's report catalogue (D-CA-003) against the client's data. Filters **Financial year** (current and 5 previous), **As-of date**, **From**, **To**; a search box ("Search reports"); per-report download buttons; and two extra exports: **Provident fund** (Excel for the chosen year) and **Everything for <FY>** (a ZIP of every statement for the year; a failed report is named inside the ZIP).

**Why it exists:** Code comment: every download carries the client id, so the professional reads the client's data "through the read policies instead" of becoming the client.

**Where to find it:** **Client books →** client → **Reports**.

**Who can use it:** R-PROF/R-PRO with a grant — but see Limitations.

**Steps**
1. Set the filters a report needs.
2. Click its format button. The file downloads.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Financial year**, **As-of date**, **From**, **To** | Select / dates | Report parameters (S-CA-004) | — |
| Search reports | Text | Filters the list | — |
| Report format buttons | Buttons | Download PDF/Excel/XML/ZIP | While a download runs |
| **Provident fund** | Button | PF statement for the FY | While a download runs |
| **Everything for <FY>** | Button | Year bundle ZIP | While a download runs |

**Fields and rules:** None beyond the filters.

**Settings and toggles here:** S-CA-004 **Report period filters**.

**Results:** Files download; every download is recorded.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Browser alert with "This feature requires the PLUS plan or higher" or "…PRO_ADVISOR plan or higher" | Report gates check the professional's own plan | See Limitations |
| Browser alert "Download failed" | Other failure | Retry |

**Limitations:** Known defect: the report endpoints are gated on the caller's plan, so a professional on Free cannot download any catalogue report, Provident fund or the year bundle for a client, and anyone below Pro/Advisor cannot download the accounting reports (trial balance, ledger, P&L, balance sheet, chart of accounts), even though acting for a client who invited you is meant to be free (see DOCUMENTATION_GAPS.md). Errors appear as a raw browser alert.

**How it works:** Downloads call `/api/reports/download/<report>?clientId=…`, `/api/reports/statement/provident-fund?…&clientId=…` and `/api/reports/fy-bundle?fy=…&clientId=…`. The routes apply `requireFeature('TAX_REPORT_CATALOG')` (Plus) or `requireFeature('ACCOUNTING_MODULE')` (Pro/Advisor) to the signed-in professional before resolving the client.

**Related features:** F-CA-011, F-CA-014, D-CA-003.

**Sources:** `apps/web/src/components/ca/ClientReportsTab.tsx:37`, `apps/web/src/components/ca/ClientReportsTab.tsx:72`, `apps/web/src/components/ca/ClientReportsTab.tsx:81`, `apps/web/src/components/ca/ClientReportsTab.tsx:198`, `apps/web/src/components/ca/ClientReportsTab.tsx:216`, `packages/api/src/routes/reports.routes.ts:85`, `packages/api/src/routes/reports.routes.ts:111`, `packages/api/src/routes/reports.routes.ts:114`, `packages/api/src/routes/reports.routes.ts:128`, `packages/api/src/middleware/requirePlan.ts:16`

### Client documents <!-- F-CA-016 -->
**What it does:** The **Documents** tab lists files the client attached to properties, vehicles, policies and portfolios (name, owner type, category, size, date). Tick files (or **Select all**) and click **Download selected** to get `documents.zip`.

**Why it exists:** Inferred from behavior: lets the professional collect the client's supporting papers in one download.

**Where to find it:** **Client books →** client → **Documents**.

**Who can use it:** R-PROF/R-PRO with a grant.

**Steps**
1. Tick the files you want (or **Select all**).
2. Click **Download selected**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| File checkboxes | Checkbox | Select files | — |
| **Select all** / **Clear** | Button | Select or clear all | — |
| **Download selected** | Button | Downloads a ZIP | Nothing selected; while downloading |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** A ZIP downloads.

**Errors and troubleshooting:** "No documents" when the client has none; a browser alert "Download failed" on error.

**Limitations:** No per-file preview.

**How it works:** `GET /api/documents/all?clientId=…` and `POST /api/documents/bulk-download?clientId=…` with the selected ids (D-CA-006).

**Related features:** D-CA-006.

**Sources:** `apps/web/src/components/ca/ClientDocumentsTab.tsx:67`, `apps/web/src/components/ca/ClientDocumentsTab.tsx:107`, `apps/web/src/components/ca/ClientDocumentsTab.tsx:143`, `packages/api/src/routes/documents.routes.ts:39`

### Client activity <!-- F-CA-017 -->
**What it does:** The **Activity** tab, **Everything you have done here**, is a day-grouped timeline of your changes to this client's books (and access events), each with time and, where recorded, the previous value ("Was …").

**Why it exists:** Code comment: the same rows are shown to both sides "so neither party can be shown a version of events the other cannot see".

**Where to find it:** **Client books →** client → **Activity**.

**Who can use it:** R-PROF/R-PRO with a grant.

**Steps:** Not applicable — view only.

**Controls:** None.

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** "You haven't made any changes to these books yet." when empty.

**Limitations:** Shows the newest 100 entries only. Summaries are worded for the account holder (for example "You granted your CA access to your books.").

**How it works:** `GET /api/ca/activity?clientId=…` (checks the grant first) returns audit rows where you are the actor or subject, newest first, default 100, maximum 500.

**Related features:** D-CA-001.

**Sources:** `apps/web/src/pages/ca/ClientBooksPage.tsx:700`, `packages/api/src/controllers/ca.controller.ts:106`, `packages/api/src/services/ca/caAccess.service.ts:586`

**What this area doesn't do**
- A professional can't delete a client's transactions, create a second portfolio for a client, change the client's login or see their saved credentials or mailboxes.
- You can't widen your own access; only the client can (on Account Access).
- New records for clients without a login can no longer be created.
- There is no resend or cancel for a practice invitation on the clients list.
- The ledger, P&L and balance-sheet views exist only as API endpoints and report downloads, not as tabs.

## Split Expenses

**Split Expenses** (sidebar **Tools → Split Expenses**) shares costs with friends, flatmates and trips: add people and groups, record who paid and how a bill is split, see who owes whom, and settle up in cash or by UPI. It is available on every plan. People you split with do not need an account; if one signs up later with the email you saved, they are linked automatically.

### Split home <!-- F-SPLIT-001 -->
**What it does:** The **Split Expenses** page shows two totals (**You are owed**, **You owe**), your **Groups** (name, number of people, currency and your balance), **Friends** (each person's overall balance with you across groups) and **Recent activity** (the latest 20 events, each linking to its group). Archived groups are hidden behind **Show archived (N)**.

**Why it exists:** Page description: "Share costs with friends, flatmates and trips — see who owes whom and settle up."

**Where to find it:** **Tools → Split Expenses** (route `/split`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER (on the managed person's groups; your display name is the managed person's).

**Steps**
1. Open **Tools → Split Expenses**.
2. Click a group or a friend to open it; use **New group** or **Add person** to start.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Settings** | Link | Opens `/split/settings` (F-SPLIT-017) | — |
| **Add person** | Button | F-SPLIT-002 | — |
| **New group** | Button | F-SPLIT-003 | — |
| **Show archived (N)** / **Hide archived** | Link button | Shows archived groups | Only when archived groups exist |
| **Retry** | Link button | Reloads a failed section | On error |

**Fields and rules:** None — view only.

**Settings and toggles here:** S-SPLIT-008 **Home currency** — the currency of the totals and friend balances.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load balances." / "Couldn't load groups." / "Couldn't load activity." | Request failed | **Retry** |
| "No groups yet" | No groups | **New group** |
| "Balances with people appear here once you add expenses." | No friend balances | Add expenses in a group |

**Limitations:** Friend balances from groups in another currency are converted at the latest exchange rate and marked "≈"; if no rate exists for that currency pair, that group's balance is left out of the friend's total without a separate warning. A person you added appears under **Friends** only once they are in one of your groups.

**How it works:** `GET /api/split/friends` walks every group you are in (including 1:1 and archived), computes debts per pair (simplified or pairwise per the group setting), converts to your home currency and sums per person (rounded half-even to 2 places). `GET /api/split/groups` (active, non-1:1) and `?includeArchived=1`; `GET /api/split/activity` (default 50, max 200).

**Related features:** F-SPLIT-003, F-SPLIT-016, F-SPLIT-017.

**Sources:** `apps/web/src/pages/split/SplitHomePage.tsx:81`, `apps/web/src/pages/split/SplitHomePage.tsx:93`, `apps/web/src/pages/split/SplitHomePage.tsx:139`, `apps/web/src/pages/split/SplitHomePage.tsx:160`, `packages/api/src/services/split/ledger.service.ts:33`, `packages/api/src/services/split/ledger.service.ts:58`, `packages/api/src/services/split/ledger.service.ts:68`

### Add a person <!-- F-SPLIT-002 -->
**What it does:** **Add a person** saves someone you split with: **Name**, **Email (optional)**, **Phone (optional)** ("Optional — used later to invite them.").

**Why it exists:** Inferred from behavior: people are reusable across groups and can later be invited or linked to an account by email.

**Where to find it:** **Tools → Split Expenses → Add person**; also **+ Add a person** in **New group** and **+ New person** in a group's **Settings** tab.

**Who can use it:** R-FREE and above, R-MANAGER.

**Steps**
1. Enter **Name** (and optionally email/phone). Click **Add person**. The toast "<name> added" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add person** | Submit | Saves | While saving |
| **Cancel** | Button | Closes | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Name | Text | Yes | 1–120 characters | — | "Enter a name" |
| Email (optional) | Email | No | Valid email, up to 254 | — | "Invalid email address" |
| Phone (optional) | Text | No | 10–15 digits after cleaning; 10-digit numbers get 91 added | — | "Invalid phone number" |

**Settings and toggles here:** None.

**Results:** The person is saved to your contacts. If the email belongs to an existing account, they are linked to it.

**Errors and troubleshooting:** "Could not add the person" with the reason.

**Limitations:** The page has no way to edit or delete a person, or to store their UPI ID (the API supports all three, F-SPLIT-020).

**How it works:** `POST /api/split/contacts`. Email and phone are stored encrypted with a hash for matching.

**Related features:** F-SPLIT-003, F-SPLIT-015, F-SPLIT-019.

**Sources:** `apps/web/src/pages/split/ContactDialog.tsx:36`, `apps/web/src/pages/split/ContactDialog.tsx:57`, `packages/api/src/controllers/split.controller.ts:28`, `packages/api/src/services/split/contacts.service.ts:65`

### New group <!-- F-SPLIT-003 -->
**What it does:** **New group** creates a group with **Group name**, **Type** (Trip, Home, Couple, Other), **Currency** and **People** (tick saved people, or **+ Add a person**). You are added automatically under your name. After **Create group** the app opens the group.

**Why it exists:** Inferred from behavior: a group holds one shared ledger in one currency.

**Where to find it:** **Tools → Split Expenses → New group**.

**Who can use it:** R-FREE and above, R-MANAGER.

**Steps**
1. Enter **Group name**, choose **Type** and **Currency**, tick people.
2. Click **Create group** ("Group created"); the group page opens.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Type** | Select | S-SPLIT-001 | — |
| **Currency** | Select | S-SPLIT-002 | — |
| People checkboxes | Checkbox | Include a saved person | — |
| **+ Add a person** | Link | Opens F-SPLIT-002; the new person is ticked | — |
| **Create group** / **Cancel** | Buttons | Create or close | Create disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Group name | Text | Yes | 1–120 characters | — | "Name the group" |
| Type | Select | No | Trip / Home / Couple / Other | Trip (server default Other) | — |
| Currency | Select | No | INR, USD, EUR, GBP, AED, SGD, THB, JPY, AUD, CAD | INR | — |
| People | Checkboxes | No | Up to 50 | None | "That person is already in the group" |

**Settings and toggles here:** S-SPLIT-001 **Group type**, S-SPLIT-002 **Group currency** (fixed after creation), S-SPLIT-003 **Simplify debts** (on for new groups).

**Results:** A group with you and the chosen people; activity "created the group".

**Errors and troubleshooting:** "Could not create the group" with the reason.

**Limitations:** The currency can't be changed later ("fixed once a group is created"). The type can't be changed in the page.

**How it works:** `POST /api/split/groups` with `myDisplayName` (your name, or the managed person's when managing an account) and contact ids; created in one transaction with a `GROUP_CREATED` activity.

**Related features:** F-SPLIT-002, F-SPLIT-004, F-SPLIT-015.

**Sources:** `apps/web/src/pages/split/NewGroupDialog.tsx:15`, `apps/web/src/pages/split/NewGroupDialog.tsx:21`, `apps/web/src/pages/split/NewGroupDialog.tsx:41`, `apps/web/src/pages/split/NewGroupDialog.tsx:57`, `apps/web/src/pages/split/useSplitDisplayName.ts:5`, `packages/api/src/controllers/split.controller.ts:34`, `packages/api/src/services/split/groups.service.ts:123`

### Group page and expense list <!-- F-SPLIT-004 -->
**What it does:** A group page shows the name, people count and currency (or "Your 1:1 expenses"), **Your balance**, and four tabs: **Expenses**, **Balances** (F-SPLIT-011), **Activity**, **Settings** (F-SPLIT-015). **Expenses** lists expenses and payments by day (newest first): each expense shows a paperclip when it has a receipt, "<who> paid <amount>" (or "N people paid"), up to two label chips (+N), and your line ("you lent ₹…", "you borrowed ₹…", "settled", "not involved"); payments show "Payment — <A> paid <B> <amount>" with a delete button. Label chips at the top (**All**, then each label) filter expenses (payments are hidden while a label is selected).

**Why it exists:** Inferred from behavior: one view of what was spent and paid in the group.

**Where to find it:** **Tools → Split Expenses →** a group (route `/split/groups/:id`).

**Who can use it:** Active members of the group (R-FREE and above, R-MANAGER).

**Steps**
1. Click an expense to open it (F-SPLIT-006).
2. Click a label chip to filter; **All** to clear.
3. Click the bin on a payment and confirm **Delete** to remove it ("Payment deleted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Settle up** | Button | F-SPLIT-012 | — |
| **Add expense** | Button | F-SPLIT-005 | — |
| Tabs **Expenses** / **Balances** / **Activity** / **Settings** | Tabs | Switch view | — |
| Label filter chips | Toggle buttons | Filter by label | Shown when the group has labels |
| Delete payment (bin) | Icon | Asks "Delete this payment? Balances will change back." | — |

**Fields and rules:** None.

**Settings and toggles here:** S-SPLIT-003 affects balances.

**Results:** Deleting a payment restores the balances it had settled.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This group doesn't exist or you're no longer in it." | Not a member | **Back to Split Expenses** |
| "Couldn't load expenses." / "Couldn't load payments." / "Couldn't load activity." | Request failed | **Retry** |
| "No expenses yet." | Empty group | **Add expense** |

**Limitations:** Payments can't be edited in the page (API only). Deleted expenses are not listed in the group; you reach one again only through its own address or the **Undo** toast (the API can list them).

**How it works:** `GET /api/split/groups/:id`, `/expenses`, `/settlements`, `/balances`, `/labels`, `/activity`; `DELETE /api/split/settlements/:id` (soft delete with `SETTLEMENT_DELETED` activity; refused if it would leave a member who has left the group with a non-zero balance).

**Related features:** F-SPLIT-005, F-SPLIT-006, F-SPLIT-011, F-SPLIT-012, F-SPLIT-015.

**Sources:** `apps/web/src/pages/split/GroupPage.tsx:31`, `apps/web/src/pages/split/GroupPage.tsx:68`, `apps/web/src/pages/split/GroupPage.tsx:118`, `apps/web/src/pages/split/GroupPage.tsx:294`, `apps/web/src/pages/split/GroupPage.tsx:310`, `apps/web/src/pages/split/GroupPage.tsx:386`, `packages/api/src/services/split/groups.service.ts:47`

### Add or edit an expense <!-- F-SPLIT-005 -->
**What it does:** The **Add expense** / **Edit expense** dialog records **Description**, **Amount**, **Currency** (with "1 <ccy> in <group ccy>" exchange rate when different), **Date**, **Paid by** (one person or **Multiple people** with amounts), **Split** mode — **Equally** (tick people), **Exact** (amount each), **Percent**, **Shares** (all start at 1) — with a live per-person preview, and optional **Labels**.

**Why it exists:** Inferred from behavior: covers the common ways a bill is shared, keeping totals exact to the paisa.

**Where to find it:** Group page → **Add expense**; expense page → **Edit**; friend page → **Add expense** (1:1).

**Who can use it:** Active group members (any member can edit any expense).

**Steps**
1. Enter **Description** and **Amount**; change **Currency** if needed (leave the rate blank to use the latest rate).
2. Pick the **Date** (not later than today).
3. Choose **Paid by**; for several payers choose **Multiple people** and enter each amount.
4. Pick a **Split** mode and fill it in; check the preview column.
5. Optionally tick **Labels**. Click **Save expense** ("Expense added" / "Expense updated").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Currency** | Select | Expense currency (S-SPLIT-006) | — |
| **1 <ccy> in <group ccy>** | Number | Exchange rate | Shown only for a foreign currency |
| **Paid by** | Select | One payer or **Multiple people** | — |
| **Equally** / **Exact** / **Percent** / **Shares** | Tabs | Split mode (S-SPLIT-005) | — |
| Include / value per person | Checkbox / number | Shares per person | — |
| Label chips | Toggle buttons | Labels for the expense | Shown when the group has labels |
| **Save expense** / **Cancel** | Buttons | Save or close | Save disabled until the form checks out |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Description | Text | Yes | 1–200 characters | — | "Add a description" |
| Amount | Number | Yes | > 0, at most 2 decimals, below 1e12 | — | "Enter an amount above 0 with at most 2 decimals" |
| Exchange rate | Number | No | Positive | Latest rate | "Enter a valid exchange rate or leave it blank" |
| Date | Date | Yes | Real date, not more than 1 day ahead (server) / today (web) | Today | "Invalid date" |
| Paid amounts (multiple) | Numbers | Yes | Must add up to the amount | — | "Paid amounts add up to ₹X, not ₹Y" |
| Exact amounts | Numbers | Yes | At most 2 decimals; must add up | — | "₹X left to assign" / "Over by ₹X" |
| Percent | Numbers | Yes | Must total 100 | — | "Percentages add up to N%, not 100%" |
| Any mode | — | — | At least one person | — | "Pick at least one person to split with" |

**Settings and toggles here:** S-SPLIT-005 **Split mode**, S-SPLIT-006 **Expense currency and exchange rate**.

**Results:** The expense is saved with each person's share; balances, "Add my share to Cash Activity" entries and the activity feed update.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No <A>/<B> rate — enter one manually" | No stored exchange rate | Type a rate |
| "Re-add <name> before changing their past entries" | The change would leave a member who left with a balance | Re-add them first |
| "A participant is not in this group" | Someone left meanwhile | Reload |
| "Restore the expense before editing it" | Expense is deleted | Restore it |
| "Expense saved, but its labels could not be updated" | Labels step failed | Set labels on the expense page |

**Limitations:** Only the 10 listed currencies (plus the group's) can be picked. Members who left the group can't be chosen.

**How it works:** `POST /api/split/expenses` / `PATCH /api/split/expenses/:id`, then `PUT /api/split/expenses/:id/labels` if labels changed. Allocation is in whole paise: each person gets floor(total × weight ÷ total weight) and leftover paise go one at a time in ascending member-id order; Exact amounts must sum exactly; Percent must total 100. The base-currency amount = amount × rate rounded half-even to 2 places, then spread over shares and payers in proportion.

**Related features:** F-SPLIT-004, F-SPLIT-006, F-SPLIT-008, F-SPLIT-010.

**Sources:** `apps/web/src/pages/split/AddExpenseDialog.tsx:18`, `apps/web/src/pages/split/AddExpenseDialog.tsx:114`, `apps/web/src/pages/split/AddExpenseDialog.tsx:119`, `apps/web/src/pages/split/AddExpenseDialog.tsx:215`, `apps/web/src/pages/split/expenseForm.ts:152`, `apps/web/src/pages/split/expenseForm.ts:174`, `apps/web/src/pages/split/expenseForm.ts:199`, `apps/web/src/pages/split/expenseForm.ts:204`, `packages/api/src/controllers/split.controller.ts:48`, `packages/api/src/services/split/allocate.ts:31`, `packages/api/src/services/split/allocate.ts:83`, `packages/api/src/services/split/fx.ts:22`, `packages/api/src/services/split/validate.ts:10`, `packages/api/src/services/split/groups.service.ts:53`

### Expense details, delete and restore <!-- F-SPLIT-006 -->
**What it does:** The expense page shows the description, date and split mode ("Split equally", "Exact amounts", "By percent", "By shares"), the amount (and its group-currency equivalent with the rate if foreign), **Paid by** and **Split between** lists, receipt, labels, comments, Cash Activity (F-SPLIT-007 to F-SPLIT-010) and "Added <date>". **Edit** opens F-SPLIT-005; **Delete** deletes at once with an 8-second "Expense deleted — Undo" toast; a deleted expense shows **Restore**.

**Why it exists:** Inferred from behavior: a delete is reversible because it changes everyone's balances.

**Where to find it:** Click an expense in a group (route `/split/expenses/:id`).

**Who can use it:** Active group members.

**Steps**
1. Click **Delete**; click **Undo** in the toast to bring it back, or later open it and click **Restore** ("Expense restored").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Edit** | Button | Opens the edit dialog | Hidden when deleted |
| **Delete** | Button | Soft-deletes | Hidden when deleted |
| **Undo** | Toast button | Restores | For 8 seconds |
| **Restore** | Button | Restores | Only when deleted |
| <group name> | Back link | Back to the group | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Deleting removes the expense from balances and from linked Cash Activity entries; restoring puts both back.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This expense isn't available." | Not a member / doesn't exist | **Back** |
| "Could not delete" / "Could not restore" + reason | e.g. a member who left would be left with a balance | Re-add them |

**Limitations:** No confirmation before delete (Undo instead). Receipts, labels and comments are read-only on a deleted expense.

**How it works:** `DELETE /api/split/expenses/:id` sets `deletedAt` and records `EXPENSE_DELETED`; `POST …/restore` clears it. Both re-sync Cash Activity links.

**Related features:** F-SPLIT-005, F-SPLIT-007, F-SPLIT-010.

**Sources:** `apps/web/src/pages/split/ExpenseDetailPage.tsx:19`, `apps/web/src/pages/split/ExpenseDetailPage.tsx:47`, `apps/web/src/pages/split/ExpenseDetailPage.tsx:50`, `apps/web/src/pages/split/ExpenseDetailPage.tsx:74`, `packages/api/src/services/split/expenses.service.ts:184`, `packages/api/src/services/split/expenses.service.ts:190`

### Receipt <!-- F-SPLIT-007 -->
**What it does:** The **Receipt** card shows the attached image or an **Open PDF** link, with **Add receipt** / **Replace** and **Remove** ("Remove this receipt?").

**Why it exists:** Inferred from behavior: keeps the bill with the expense for everyone in the group.

**Where to find it:** Expense page → **Receipt**.

**Who can use it:** Active group members; changes only while the expense is not deleted.

**Steps**
1. Click **Add receipt**, choose a JPEG, PNG, WebP or PDF under 10 MB ("Receipt saved").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add receipt** / **Replace** | Button | Uploads | Hidden on a deleted expense; disabled while uploading |
| **Remove** | Button | Asks, then removes | Hidden on a deleted expense |
| **Retry** | Button | Reloads the receipt | When it failed to load |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Receipt file | File | — | JPEG, PNG, WebP or PDF; under 10 MB; 10 uploads/minute | — | "Receipts must be under 10 MB" / "Upload a JPEG, PNG, WebP or PDF receipt" / "HEIC photos aren't supported - share the photo as JPEG" / "We couldn't read this image - try saving it as JPEG or PNG" |

**Settings and toggles here:** None.

**Results:** One receipt per expense; replacing deletes the old file. Activity records "attached a receipt" / "removed the receipt".

**Errors and troubleshooting:** "Couldn't upload the receipt", "Couldn't load the receipt", "Receipt no longer available".

**Limitations:** One receipt per expense.

**How it works:** `PUT /api/split/expenses/:id/receipt` (multipart `file`, rate-limited 10/min per user), `GET` (served inline, no caching), `DELETE`. Image metadata is stripped before storing; the file type is checked from its bytes.

**Related features:** F-SPLIT-006.

**Sources:** `apps/web/src/pages/split/ExpenseExtras.tsx:16`, `apps/web/src/pages/split/ExpenseExtras.tsx:96`, `packages/api/src/routes/split.routes.ts:60`, `packages/api/src/routes/split.routes.ts:68`, `packages/api/src/services/split/receipts.service.ts:40`, `packages/api/src/services/split/receipts.service.ts:42`, `packages/api/src/middleware/rateLimit.ts:207`

### Labels <!-- F-SPLIT-008 -->
**What it does:** Group-level labels (name + one of 7 colours) you can tick on an expense; **New label** creates one. Labels filter the group's expense list.

**Why it exists:** Inferred from behavior: categorise shared spending (for example "Food", "Travel").

**Where to find it:** Expense page → **Labels**; also in the add/edit dialog.

**Who can use it:** Active group members.

**Steps**
1. On an expense click **New label**, type a **Label name**, pick a colour, **Create**.
2. Tick or untick labels on the expense.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Label chips | Toggles | Set labels on the expense | Read-only on a deleted expense |
| **New label** | Button | Opens the create form | — |
| **Label name**, colour | Text / radio | New label | — |
| **Create** / **Cancel** | Buttons | Save or close | Create disabled with an empty name |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Label name | Text | Yes | 1–30 characters, unique in the group | — | "Label name must be 1–30 characters" / "That label already exists" |
| Colour | Choice | Yes | One of 7 hex colours | Red | "Pick a colour like #3D5A80" |
| Labels per expense | — | — | At most 10, from the same group | — | "At most 10 labels" |

**Settings and toggles here:** None.

**Results:** Labels show on the expense and in the group list.

**Errors and troubleshooting:** "Couldn't create the label", "Couldn't update labels".

**Limitations:** Labels can't be renamed or deleted in the page (delete exists in the API).

**How it works:** `GET/POST /api/split/groups/:id/labels`, `PUT /api/split/expenses/:id/labels`, `DELETE /api/split/labels/:id`.

**Related features:** F-SPLIT-004, F-SPLIT-005.

**Sources:** `apps/web/src/pages/split/ExpenseExtras.tsx:173`, `apps/web/src/pages/split/ExpenseExtras.tsx:187`, `packages/api/src/services/split/labels.service.ts:13`, `packages/api/src/services/split/labels.service.ts:33`, `packages/api/src/services/split/labels.service.ts:50`

### Comments <!-- F-SPLIT-009 -->
**What it does:** A comment thread on each expense: author, time, text; **Post** adds one; your own comments have a delete button ("Delete this comment?").

**Why it exists:** Inferred from behavior: discuss an expense with the group.

**Where to find it:** Expense page → **Comments**.

**Who can use it:** Active group members; delete only your own.

**Steps**
1. Type in **Add a comment** and click **Post**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add a comment** | Text area | Comment text | Hidden on a deleted expense |
| **Post** | Button | Posts | Empty text; while posting |
| Delete comment (bin) | Icon | Deletes after confirmation | Only on your comments; not on a deleted expense |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Comment | Text | Yes | 1–1,000 characters | — | "Write a comment first" / "Comments can be at most 1000 characters" |

**Settings and toggles here:** None.

**Results:** The comment appears to all members; activity records "commented on".

**Errors and troubleshooting:** "Couldn't post the comment", "Couldn't delete the comment", "Only the author can delete a comment".

**Limitations:** Comments can't be edited.

**How it works:** `GET/POST /api/split/expenses/:id/comments`, `DELETE /api/split/comments/:id`.

**Related features:** F-SPLIT-006.

**Sources:** `apps/web/src/pages/split/ExpenseExtras.tsx:237`, `packages/api/src/controllers/split.controller.ts:147`, `packages/api/src/services/split/comments.service.ts:54`

### Add my share to Cash Activity <!-- F-SPLIT-010 -->
**What it does:** A switch "Add my share (₹…) to Cash Activity" on each expense you are part of. On, it creates an outflow in your Cash Activity for your share ("Split: <description> (<group>)") and keeps it in step when anyone edits, deletes or restores the expense. If you have no default portfolio it first asks "Pick a portfolio for this entry".

**Why it exists:** Code comment: "'Add my share to Cash Activity'… the CashFlow it points at is derived from the expense and rewritten on every sync."

**Where to find it:** Expense page → **Cash Activity**.

**Who can use it:** Members with a share in the expense.

**Steps**
1. Turn the switch on. If asked, choose a portfolio.
2. Turn it off to remove the entry.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "Add my share (…) to Cash Activity" | Switch | S-SPLIT-012 | Disabled on a deleted expense; replaced by "Not part of this split" when your share is 0 |
| Portfolio picker ("Choose a portfolio") | Select | Portfolio for the entry | Shown when no default portfolio is set |

**Fields and rules:** Portfolio must be one of yours ("Pick one of your portfolios for Cash Activity").

**Settings and toggles here:** S-SPLIT-012 **Add my share to Cash Activity**; S-SPLIT-009 **Default portfolio** (used automatically).

**Results:** An outflow in **Cash Activity** (D-SPLIT-001) for your share, in the group currency, with an INR equivalent at the latest rate for foreign groups ("(rate unavailable)" added to the description when no rate exists).

**Errors and troubleshooting:** "you're not part of this expense", "Couldn't update Cash Activity", "Couldn't load Cash Activity."

**Limitations:** Payments (settlements) are not added to Cash Activity.

**How it works:** `GET/PUT /api/split/expenses/:id/share-link`. Each link's cash flow is re-synced after expense create/edit/delete/restore (run as system so another member's edit updates your entry) and by a nightly reconcile at 02:30 IST.

**Related features:** F-SPLIT-017, D-SPLIT-001, D-SPLIT-002.

**Sources:** `apps/web/src/pages/split/ExpenseExtras.tsx:284`, `apps/web/src/pages/split/ExpenseExtras.tsx:302`, `apps/web/src/pages/split/ExpenseExtras.tsx:310`, `packages/api/src/services/split/shareLink.service.ts:155`, `packages/api/src/services/split/shareLink.service.ts:176`, `packages/api/src/services/split/expenses.service.ts:175`, `packages/api/src/jobs/splitShareLinkReconcileJob.ts:22`

### Balances and suggested payments <!-- F-SPLIT-011 -->
**What it does:** The **Balances** tab lists each member's net ("you are owed / you owe" for you, "is owed / owes" for others) and then **Suggested payments** (when Simplify debts is on) or **Who owes whom** (when off), each as "<A> pays <B> ₹…" with action buttons. "Everyone is settled up." when there is nothing.

**Why it exists:** Settings text: "Simplify debts (fewest payments to settle)".

**Where to find it:** Group page → **Balances**.

**Who can use it:** Active group members.

**Steps**
1. Read the list. Use **Settle**, **Pay**, **Remind** or **Share pay link** on a row (F-SPLIT-012 to F-SPLIT-014).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Settle** | Button | Opens Settle up pre-filled | — |
| **Pay** | Button | F-SPLIT-013 | Only on rows where you pay, INR groups only |
| **Remind** | Button | F-SPLIT-014 | Only on rows where you are paid |
| **Share pay link** | Button | F-SPLIT-014 | Rows where you are paid, INR groups only |

**Fields and rules:** None.

**Settings and toggles here:** S-SPLIT-003 **Simplify debts**.

**Results:** None.

**Errors and troubleshooting:** "Couldn't load balances." → **Retry**.

**Limitations:** Members who left are shown only while their balance is non-zero.

**How it works:** `GET /api/split/groups/:id/balances`. Net per member = paid − share + payments made − payments received (group currency). Simplified: repeatedly match the largest creditor with the largest debtor. Pairwise: for each expense, each sharer owes each payer in proportion to what they paid, netted per pair, rounded half-even to 2 places.

**Related features:** F-SPLIT-012, F-SPLIT-013, F-SPLIT-014.

**Sources:** `apps/web/src/pages/split/GroupPage.tsx:340`, `apps/web/src/pages/split/GroupPage.tsx:349`, `apps/web/src/pages/split/GroupPage.tsx:356`, `packages/api/src/services/split/balances.ts:16`, `packages/api/src/services/split/balances.ts:30`, `packages/api/src/services/split/balances.ts:63`, `packages/api/src/services/split/ledger.service.ts:20`

### Settle up (record a payment) <!-- F-SPLIT-012 -->
**What it does:** The **Settle up** dialog records money paid between two members: **Paid by**, **Paid to**, **Amount (<currency>)**, **Method** (Cash, UPI, Other) and **Date**. Opened from a balance row it is pre-filled with that row.

**Why it exists:** Inferred from behavior: records repayments made outside the app so balances update.

**Where to find it:** Group page → **Settle up**, or **Settle** on a balance row.

**Who can use it:** Active group members (any member can record any pair).

**Steps**
1. Check **Paid by**, **Paid to**, **Amount**, **Method**, **Date**.
2. Click **Record payment** ("Payment recorded").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Paid by**, **Paid to** | Selects | The two members | — |
| **Method** | Select | S-SPLIT-013 | — |
| **Record payment** / **Cancel** | Buttons | Save or close | Record disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Paid by / Paid to | Selects | Yes | Different active members | You / first other | "Pick two different people" |
| Amount | Number | Yes | > 0, at most 2 decimals | Row amount | "Enter an amount above 0 with at most 2 decimals" |
| Date | Date | Yes | Not in the future | Today | "Invalid date" |

**Settings and toggles here:** S-SPLIT-013 **Payment method**.

**Results:** Balances update; activity records the payment.

**Errors and troubleshooting:** "Could not record the payment" + reason; "Payer and receiver must differ".

**Limitations:** Payments are always in the group currency from this dialog. A payment can be deleted from the expense list but not edited.

**How it works:** `POST /api/split/settlements` (amount 2 dp, method CASH/UPI/OTHER, date). `DELETE /api/split/settlements/:id` soft-deletes.

**Related features:** F-SPLIT-011, F-SPLIT-013.

**Sources:** `apps/web/src/pages/split/SettleUpDialog.tsx:62`, `apps/web/src/pages/split/SettleUpDialog.tsx:96`, `apps/web/src/pages/split/SettleUpDialog.tsx:109`, `packages/api/src/controllers/split.controller.ts:58`, `packages/api/src/services/split/settlements.service.ts:34`

### Pay via UPI <!-- F-SPLIT-013 -->
**What it does:** **Pay** on a balance row opens **Pay <name>**: the amount, the payee's name and UPI ID, **Open UPI app** (a `upi://pay` link), **Copy pay link** and a QR code ("Scan with any UPI app"). A second after the QR shows (or when you tap **Open UPI app**) it asks "Did the payment go through?" — **Yes, record it** records a UPI payment for today; **Not yet** closes.

**Why it exists:** Code comment: "a co-member's UPI ID is revealed only to someone who actually owes them."

**Where to find it:** Group page → **Balances** → **Pay** (INR groups only).

**Who can use it:** A member who owes the payee in that group.

**Steps**
1. Click **Pay**. Pay in your UPI app (button, copy link or scan).
2. Click **Yes, record it** ("Payment recorded").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Open UPI app** | Link button | Opens the UPI intent | — |
| **Copy pay link** | Button | Copies the link | — |
| **Yes, record it** / **Not yet** | Buttons | Record or close | Record disabled while saving |

**Fields and rules:** None (amount is what you owe; the API allows a smaller amount but not more).

**Settings and toggles here:** The payee's S-SPLIT-007 **UPI ID**.

**Results:** A UPI payment is recorded and balances update.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "<name> hasn't shared a UPI ID in this group yet" + "Ask them to add a UPI ID in Split settings" | Payee has no UPI ID (or, for a linked account, hasn't added or paid anything in the group yet) | Ask them |
| "UPI works only for INR groups" | Foreign-currency group | Settle up manually |
| "you don't owe <name> anything here" | Nothing owed | — |

**Limitations:** UPI only for INR groups. The payee's UPI ID comes from their own Split settings (if they have an account and have taken part in the group) or from the saved person's UPI ID, which the page cannot set.

**How it works:** `GET /api/split/groups/:id/upi-link?to=&amount=` builds `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=<group> settle-up` (note max 40 characters); not cached in the browser.

**Related features:** F-SPLIT-011, F-SPLIT-017.

**Sources:** `apps/web/src/pages/split/PayNowDialog.tsx:30`, `apps/web/src/pages/split/PayNowDialog.tsx:48`, `apps/web/src/pages/split/PayNowDialog.tsx:86`, `apps/web/src/pages/split/PayNowDialog.tsx:99`, `packages/api/src/services/split/settings.service.ts:63`

### Remind and share a pay link <!-- F-SPLIT-014 -->
**What it does:** On a balance row where someone owes you: **Remind** emails them "Reminder: you owe <you> <amount>"; **Share pay link** opens your phone's share sheet (or copies the link) with "<name>, pay ₹… for <group>: <upi link>" that pays your own UPI ID.

**Why it exists:** Code comment: "requestLink only reveals the caller's own UPI ID."

**Where to find it:** Group page → **Balances** (rows where you are paid).

**Who can use it:** The member who is owed.

**Steps**
1. Click **Remind** ("Reminder sent") or **Share pay link**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Remind** | Button | Emails a reminder | While sending |
| **Share pay link** | Button | Shares/copies your UPI link | INR groups only; disabled while the link loads |
| **Open Split settings** | Link | Shown with a missing-UPI error | — |

**Fields and rules:** None.

**Settings and toggles here:** Your S-SPLIT-007 **UPI ID** (required for **Share pay link**).

**Results:** An email (Remind) or a shared message.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Already reminded today" | Already reminded this person in this group today | Wait |
| "Daily reminder limit reached - try again tomorrow" | 30 reminders in 24 hours | Wait |
| "<name> has no email on file" | No email for them | Add their email (not possible in the page for an existing person) |
| "Reminder saved but email couldn't be sent right now" | Mail failure | Try later |
| "add your UPI ID in Split settings first" | No UPI ID | **Open Split settings** |

**Limitations:** UPI links only for INR groups.

**How it works:** `POST /api/split/reminders` (once per day per person per group, 30/day per user); `GET /api/split/groups/:id/request-link?from=` uses only your own UPI ID.

**Related features:** F-SPLIT-011, F-SPLIT-017.

**Sources:** `apps/web/src/pages/split/GroupPage.tsx:237`, `apps/web/src/pages/split/GroupPage.tsx:286`, `packages/api/src/services/split/notify.service.ts:19`, `packages/api/src/services/split/notify.service.ts:29`, `packages/api/src/services/split/settings.service.ts:111`

### Group settings and members <!-- F-SPLIT-015 -->
**What it does:** The group's **Settings** tab: **Group name** with **Rename**, **Simplify debts (fewest payments to settle)**, "Currency: <ccy> (fixed once a group is created)", the member list (badge "On EveryPaisa" for linked accounts; **Invite** for saved people with an email who have no account; **Remove**, or for yourself, leave), **Add someone…** select, **+ New person**, and **Archive group** / **Unarchive group**. 1:1 groups show only the member list.

**Why it exists:** Inferred from behavior: manage who shares the ledger and keep finished groups out of the way.

**Where to find it:** Group page → **Settings**.

**Who can use it:** Any active member.

**Steps**
1. Change the name and click **Rename** ("Saved").
2. Pick a person in **Add someone…** to add them.
3. Click **Remove** (or on yourself, **Remove** → **Leave**) and confirm.
4. Click **Invite** to email someone an invitation to join ("Invite sent").
5. Click **Archive group**; if balances are unsettled confirm "This group still has unsettled balances. Archive anyway?".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Rename** | Button | Saves the name | Name empty or unchanged; hidden on 1:1 |
| **Simplify debts (fewest payments to settle)** | Checkbox | S-SPLIT-003 | Hidden on 1:1 |
| **Invite** | Button | Emails an invite | Only for saved people with an email and no account |
| **Remove** / **Leave** | Button + confirm | Removes a member / you | Hidden on 1:1 |
| **Add someone…** | Select | Adds a saved person | Hidden on 1:1 |
| **+ New person** | Link | F-SPLIT-002, then adds them | Hidden on 1:1 |
| **Archive group** / **Unarchive group** | Button | S-SPLIT-004 | Hidden on 1:1; disabled until balances load |

**Fields and rules:** Group name 1–120 characters ("Group name is required").

**Settings and toggles here:** S-SPLIT-003 **Simplify debts**, S-SPLIT-004 **Archive group**.

**Results:** Membership and settings change; activity records it. Leaving removes the group from your lists.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Settle this member to zero first" | Member has a balance | Settle up first |
| "A group needs at least one active linked member" | Would leave no account-holder in the group | Keep one |
| "That person is already in the group" | Duplicate | — |
| "A 1:1 ledger always has exactly two people" | 1:1 group | — |
| "They're already on EveryPaisa" / "Already invited today" / "Daily invite limit reached - try again tomorrow" / "Add their email address first" | Invite limits | — |

**Limitations:** The group type can't be changed in the page. A removed member who took part in anything is kept as "left" so history still names them; they can be re-added.

**How it works:** `PATCH /api/split/groups/:id` (name, simplifyDebts, archived), `POST /api/split/groups/:id/members`, `DELETE /api/split/groups/:id/members/:memberId`, `POST /api/split/contacts/:id/invite` (one per person per 24 h, 20 per day).

**Related features:** F-SPLIT-002, F-SPLIT-011, F-SPLIT-019.

**Sources:** `apps/web/src/pages/split/GroupPage.tsx:170`, `apps/web/src/pages/split/GroupPage.tsx:174`, `apps/web/src/pages/split/GroupPage.tsx:188`, `apps/web/src/pages/split/GroupPage.tsx:206`, `apps/web/src/pages/split/GroupPage.tsx:223`, `packages/api/src/services/split/groups.service.ts:185`, `packages/api/src/services/split/groups.service.ts:210`, `packages/api/src/services/split/groups.service.ts:214`, `packages/api/src/services/split/linking.service.ts:22`, `packages/api/src/services/split/linking.service.ts:89`

### Friend balances and 1:1 expenses <!-- F-SPLIT-016 -->
**What it does:** A friend's page shows **Overall** (owes you / you owe, "≈" if converted), "Includes groups in other currencies, converted at the latest rate." when relevant, and **By group** (each group's balance; the 1:1 ledger shows as "Just you two"). **Add expense** opens a 1:1 ledger with that person (created on first use).

**Why it exists:** Inferred from behavior: track money between two people without making a group.

**Where to find it:** **Tools → Split Expenses →** a name under **Friends** (route `/split/friends/:key`).

**Who can use it:** R-FREE and above, R-MANAGER.

**Steps**
1. Click **Add expense** to add a 1:1 expense (F-SPLIT-005).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add expense** | Button | Opens/creates the 1:1 ledger and the expense dialog | Hidden for people who are not your saved contacts ("Add expenses with <name> inside your shared groups.") |
| Group rows | Links | Open the group | — |

**Fields and rules:** As F-SPLIT-005.

**Settings and toggles here:** S-SPLIT-008 **Home currency**.

**Results:** A 1:1 group (type "DIRECT") the first time.

**Errors and troubleshooting:** "No balances with this person." / "Could not open your 1:1 expenses".

**Limitations:** 1:1 ledgers always have exactly two people.

**How it works:** `POST /api/split/groups/direct` (finds or creates under a lock so two tabs can't create two); balances from `GET /api/split/friends`.

**Related features:** F-SPLIT-001, F-SPLIT-005.

**Sources:** `apps/web/src/pages/split/FriendPage.tsx:48`, `apps/web/src/pages/split/FriendPage.tsx:55`, `apps/web/src/pages/split/FriendPage.tsx:62`, `packages/api/src/services/split/groups.service.ts:231`

### Split settings <!-- F-SPLIT-017 -->
**What it does:** **Split settings** has three cards: **Payments** (**UPI ID**, "Friends see this when they pay you"), **Defaults** (**Home currency**, **Default portfolio**), **Emails** ("Email me about activity in my groups (at most hourly)", "Weekly balance summary (Mondays)"), and **Save**.

**Why it exists:** Inferred from behavior: personal preferences for paying, converting and notifications.

**Where to find it:** **Tools → Split Expenses → Settings** (route `/split/settings`).

**Who can use it:** R-FREE and above, R-MANAGER.

**Steps**
1. Change values and click **Save** ("Settings saved").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **UPI ID** | Text | S-SPLIT-007 | — |
| **Home currency** | Select | S-SPLIT-008 | — |
| **Default portfolio** | Select ("None") | S-SPLIT-009 | — |
| Email about activity | Checkbox | S-SPLIT-010 | — |
| Weekly balance summary | Checkbox | S-SPLIT-011 | — |
| **Save** | Button | Saves all | Invalid UPI ID; while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| UPI ID | Text | No | name@bank: 2–256 of letters, digits, `.`, `_`, `-`, then `@`, then 2–64 letters | Empty | "Enter a UPI ID like name@bank" / "Invalid UPI ID" |
| Default portfolio | Select | No | One of your portfolios | None | "Pick one of your own portfolios" |

**Settings and toggles here:** S-SPLIT-007 to S-SPLIT-011.

**Results:** Saved per user.

**Errors and troubleshooting:** "Couldn't load your settings." / "Couldn't save your settings".

**Limitations:** Home currency choices are the same 10 currencies.

**How it works:** `GET/PUT /api/split/settings`; defaults when never saved: UPI none, INR, no portfolio, activity emails on, weekly off.

**Related features:** F-SPLIT-010, F-SPLIT-013, F-SPLIT-014, F-SPLIT-018.

**Sources:** `apps/web/src/pages/split/SplitSettingsPage.tsx:65`, `apps/web/src/pages/split/SplitSettingsPage.tsx:85`, `apps/web/src/pages/split/SplitSettingsPage.tsx:89`, `apps/web/src/pages/split/SplitSettingsPage.tsx:92`, `packages/api/src/controllers/split.controller.ts:118`, `packages/api/src/services/split/settings.service.ts:22`, `packages/api/prisma/schema.prisma:5441`

### Activity and weekly email digests <!-- F-SPLIT-018 -->
**What it does:** Sends two kinds of email: an activity digest "<N> updates in your shared expenses" about changes other people made in your groups, and a Monday "Your weekly balances" summary (top 10 people, plus "In total you are owed / you owe").

**Why it exists:** Inferred from behavior: keeps members informed without opening the app.

**Where to find it:** Your email inbox; switch on/off in **Split settings → Emails**.

**Who can use it:** Members with an account (R-FREE and above).

**Steps:** Not applicable — automatic.

**Controls:** None here (see F-SPLIT-017).

**Fields and rules:** None.

**Settings and toggles here:** S-SPLIT-010 **Email about activity** (on by default), S-SPLIT-011 **Weekly balance summary** (off by default).

**Results:** Emails.

**Errors and troubleshooting:** None user-facing; failures are logged.

**Limitations:** Activity digests cover at most the last 7 days and never include your own actions. The weekly summary skips you when all balances are zero or the account is inactive/scheduled for deletion.

**How it works:** Cron in Asia/Kolkata: activity digest every hour at :05; weekly digest Mondays 09:00. Both run as system and loop per user.

**Related features:** F-SPLIT-017.

**Sources:** `packages/api/src/jobs/splitDigestJobs.ts:33`, `packages/api/src/jobs/splitDigestJobs.ts:34`, `packages/api/src/services/split/notify.service.ts:116`, `packages/api/src/services/split/notify.service.ts:168`

### Linking people who join <!-- F-SPLIT-019 -->
**What it does:** When someone signs up or signs in with an email that you saved on a person, that person is linked to their account: they see your shared groups and the activity says "<name> joined EveryPaisa".

**Why it exists:** Inferred from behavior: people you split with can take part themselves once they have an account.

**Where to find it:** Automatic; the member shows "On EveryPaisa" in group settings.

**Who can use it:** Automatic.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Matching uses the email saved on the person (normalised to lowercase).

**Settings and toggles here:** None.

**Results:** The member row is attached to the account.

**Errors and troubleshooting:** None user-facing.

**Limitations:** If the account is already a member of that group, the placeholder is left unlinked.

**How it works:** Called from the auth service after registration/sign-in (`linkContactsForUser`), run as system, matched by email hash.

**Related features:** F-SPLIT-002, F-SPLIT-015, D-SPLIT-003.

**Sources:** `packages/api/src/services/split/linking.service.ts:44`, `packages/api/src/services/auth/auth.service.ts:330`

**What this area doesn't do**
- No plan limits: Split Expenses is free for everyone.
- You can't edit or delete saved people, store their UPI ID, edit a payment, rename/delete labels or change a group's type or currency in the page.
- UPI pay and request links work only for INR groups; nothing is debited automatically.
- Payments are not added to Cash Activity; only your expense shares can be.
- It does not read SMS, email or receipts to create expenses.

<!-- END MODULES -->

## Roles and profiles

Role definitions are global; this fragment repeats only what differs in these modules. Full definitions are in the roles chapter of the merged manual.

### Signed-out visitor <!-- R-VISITOR -->
Can open a professional invitation link (`/professional-invitations/:token`) and read who invited them before signing in. Everything else here needs sign-in.

### Free user <!-- R-FREE -->
Split Expenses in full. Advisor shows a locked card. Can act for clients who invited them (professional workspace, with two-factor), but catalogue report downloads for a client are refused on this plan (see F-CA-015).

### Plus subscriber <!-- R-PLUS -->
Adds the Investment Advisor. Client report downloads from the catalogue work; accounting report downloads do not.

### Family subscriber <!-- R-FAMILY -->
Same as Plus in these modules.

### Pro/Advisor subscriber <!-- R-PRO -->
Adds **Invite a client** (a practice of your own) and accounting report downloads for clients.

### Administrator <!-- R-ADMIN -->
No admin-only powers in these modules; access follows the admin's plan.

### Family owner <!-- R-FAMOWNER -->
Family view does not change these modules: advice, client books and split groups are always your own.

### Family contributor <!-- R-FAMCONTRIB -->
Same as base plan.

### Family viewer <!-- R-FAMVIEWER -->
Same as base plan.

### Managing a family member's account <!-- R-MANAGER -->
Advisor and Split Expenses work on the managed person's data (Advisor under the manager's plan; split groups use the managed person's name). The professional workspace and professional invitations are refused ("Switch back to your own account to do this.").

### Professional acting for a client <!-- R-PROF -->
Uses **Client books**: read within the client's scope; change only what the client allowed; never delete a client transaction; two-factor sign-in required every session.

### AI chatbot connection <!-- R-AICONN -->
Can read your split balances through the `list_split_balances` tool when the Split expenses area is approved. No access to advice or client books.

### Succession nominee <!-- R-NOMINEE -->
No access to these modules.

## Glossary
| Term | Meaning |
|---|---|
<!-- BEGIN GLOSSARY -->
| Risk profile | Your category (Conservative, Balanced, Growth, Aggressive), score 0–100 and tax slab, set by the 7-question risk assessment on the Advisor page. |
| Model portfolio | A set of target weights per asset bucket. Four are created for you (one per risk category) on your first assessment. |
| Bucket | One of seven advisor asset groups: Equity — Domestic, Equity — International, Debt, Gold, Real assets, Cash equivalent, Other / alternatives. |
| Drift | Current weight minus target weight of a bucket, in percentage points (pp). 5 pp or more is treated as material. |
| Recommendation | One suggested move from the Advisor engine, with reasoning, figures and a status: Open, Accepted, Snoozed, Done or Dismissed. |
| Override list | Your approved products for a bucket; when non-empty, the Advisor names these instead of the house methodology's pick. |
| House methodology | The firm's signed fund-ranking method, scored nightly, used to name funds in recommendations when enabled. |
| Client books | The professional workspace (`/ca`) where an accountant or adviser works in the books of people who gave them access. |
| Account Access | The account holder's page listing professionals who can see their books, where access is granted, narrowed, extended or withdrawn. |
| Engagement | A professional's active relationship with one client; **Close engagement** ends it from the professional's side. |
| View only / Make some changes / Keep the books | What a professional may change in a client's books: nothing, some of the four areas (books, transactions, imports, fair market values), or all four. |
| Voucher | A double-entry accounting record (Journal, Payment, Receipt, Contra, Purchase, Sales) in a client's books. |
| FMV (31 Jan 2018) | Fair market value on 31 January 2018, used to grandfather long-term equity gains under Section 55(2)(ac). |
| Split group | A shared ledger of expenses and payments among people, in one currency (types Trip, Home, Couple, Other; 1:1 ledgers with a friend show as "Just you two"). |
| Simplify debts | Group setting that suggests the fewest payments needed to settle everyone, instead of person-to-person debts. |
| Settle up | Recording a payment from one member to another (Cash, UPI or Other) that reduces what they owe. |
| Add my share to Cash Activity | Switch on a split expense that adds your share as an outflow in your Cash Activity and keeps it updated. |
<!-- END GLOSSARY -->
