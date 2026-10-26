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
