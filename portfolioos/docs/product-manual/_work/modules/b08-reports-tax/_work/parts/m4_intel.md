
## Portfolio Score

The **Portfolio Score** page (sidebar **Overview → Portfolio Score**, route `/health-score`; page title "Financial Health Score", eyebrow "Intelligence") gives one 0–100 score and a letter grade summarising six areas of your finances, each with what the app found and what to do about it.

### Financial Health Score overview <!-- F-INTEL-001 -->
**What it does:** Shows a gauge with your overall score and grade, "Updated <date and time>", a **Grade scale** (A Excellent 85–100, B Good 70–84, C Fair 55–69, D Needs work 40–54, F At risk 0–39, your grade highlighted) and a **Recalculate** button. When less than half of the weighted areas can be scored, the grade is "—".

**Why it exists:** "One number summarizing six areas of your financial life — emergency readiness, investing discipline, debt load, diversification, insurance, and goal progress — each weighted by importance." (page description).

**Where to find it:** **Overview → Portfolio Score** (route `/health-score`); the dashboard health card's **View breakdown** link (D-INTEL-001).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (ungated); R-MANAGER (the managed person's score).

**Steps**
1. Open **Portfolio Score**. "Loading…" shows, then the gauge.
2. Click **Recalculate** to compute a fresh score now; the page reloads the result.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Recalculate** | Button | Forces a fresh computation | Disabled while the page query is refreshing |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** A recalculation replaces your stored score snapshot.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load your health score. Try again shortly." | Request failed | Reload |
| Grade "—" | Less than 50% of the weight could be scored | Add income, expenses, holdings, policies or goals as each card suggests |

**Limitations:** The description says "Recalculated automatically every 24 hours", but no scheduled job does it: the stored score is reused for 24 hours and recomputed the next time the page (or dashboard card) is opened after that (see DOCUMENTATION_GAPS.md). A failed **Recalculate** shows no message.

**How it works:** `GET /api/intelligence/health-score[?force=true]`. A stored snapshot younger than 24 hours (and of the current format version) is returned unless forced. Overall = weighted average of the parts that could be scored (weights: emergency fund 20%, investment rate 20%, debt burden 20%, diversification 20%, insurance 10%, goal progress 10%), rounded; unscored parts are left out rather than counted as 50; below 0.5 of total weight scored → grade "—". Grade A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, else F.

**Related features:** F-INTEL-002, D-INTEL-001.

**Sources:** `apps/web/src/pages/intelligence/HealthScorePage.tsx:95`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:118`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:128`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:144`, `packages/api/src/controllers/intelligence.controller.ts:11`, `packages/api/src/services/analytics/healthScore.service.ts:15`, `packages/api/src/services/analytics/healthScore.service.ts:254`, `packages/api/src/services/analytics/healthScoreMath.ts:151`, `packages/api/src/services/analytics/healthScoreMath.ts:157`, `packages/api/src/services/analytics/healthScoreMath.ts:184`, `apps/web/src/App.tsx:250`

### Score dimensions <!-- F-INTEL-002 -->
**What it does:** Six cards — **Emergency Fund**, **Investment Rate**, **Debt Burden**, **Diversification**, **Insurance Coverage**, **Goal Progress** — each with "Weight N%", its score (or "Not scored"), a bar, an explanation, **Where you stand** (what was found), **Fix this** or **To score this** (what to do) and **Go to …** links to the pages that hold the data.

**Why it exists:** Tells you which area pulls the score down and where to fix it. Inferred from behavior.

**Where to find it:** **Overview → Portfolio Score**, below the gauge.

**Who can use it:** As F-INTEL-001.

**Steps**
1. Read the lowest-scoring card.
2. Click a **Go to …** link (for example **Go to Bank Accounts**) to add the missing data.
3. Come back and click **Recalculate**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Go to Bank Accounts**, **Go to FDs & RDs** | Links | `/bank-accounts`, `/fds` | Emergency Fund |
| **Go to Transactions**, **Go to Income** | Links | `/transactions`, `/income` | Investment Rate |
| **Go to Loans**, **Go to Credit Cards**, **Go to Income** | Links | `/loans`, `/credit-cards`, `/income` | Debt Burden |
| **Go to Analytics**, **Go to Portfolios** | Links | `/analytics`, `/portfolios` | Diversification |
| **Go to Insurance**, **Go to Income** | Links | `/insurance`, `/income` | Insurance Coverage |
| **Go to Goals** | Link | `/goals` | Goal Progress |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Not scored" with **To score this** | The data for that area is missing (for example "We don't know your income yet, so we can't work out your investment rate.") | Do what the card says (for example "Add your salary under Income, or connect Gmail, so we can see your income.") |

**Limitations:** Income is your active salary entries, else an estimate from confirmed bank-credit events in the last 3 months. Age (for the equity guideline) is used only when known.

**How it works:** Scores (each clamped 0–100): **Emergency Fund** = liquid assets ÷ (6 × monthly expenses) × 100 (not scored without holdings or expenses). **Investment Rate** = monthly investment ÷ monthly income, 100 at 20% (not scored without income). **Debt Burden** = (EMIs + card minimum dues) ÷ income: 100 at ≤ 20%, 0 at ≥ 60%, linear between; 100 when you have no EMIs or card dues; not scored with debt but no income. **Diversification** = average of: largest asset class ≤ 60% (minus 2.5 points per % above), largest single holding ≤ 50% (minus 2 per % above), and — when your age is known — equity % within the age guideline (minus 5 per % gap). **Insurance Coverage** = life-type sum assured (term, whole life, ULIP, endowment) ÷ (10 × annual income); not scored without life policies or income. **Goal Progress** = average progress of active goals (each capped at 100); not scored without goals.

**Related features:** F-INTEL-001, D-INTEL-002.

**Sources:** `apps/web/src/pages/intelligence/HealthScorePage.tsx:39`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:209`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:214`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:234`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:247`, `packages/api/src/services/analytics/healthScoreMath.ts:26`, `packages/api/src/services/analytics/healthScoreMath.ts:39`, `packages/api/src/services/analytics/healthScoreMath.ts:50`, `packages/api/src/services/analytics/healthScoreMath.ts:77`, `packages/api/src/services/analytics/healthScoreMath.ts:122`, `packages/api/src/services/analytics/healthScoreMath.ts:135`, `packages/api/src/services/analytics/healthScore.service.ts:327`, `packages/api/src/services/analytics/healthScore.service.ts:350`, `packages/api/src/services/analytics/healthScore.service.ts:363`, `packages/api/src/services/analytics/healthScore.service.ts:410`, `packages/api/src/services/analytics/healthScore.service.ts:434`

**What this area doesn't do**
- It doesn't track your score over time — only the latest score is kept.
- It doesn't let you change the weights or targets.
- It doesn't score a family as a whole.
<!-- END MODULES -->

## Roles and profiles

### Signed-out visitor <!-- R-VISITOR -->
Cannot open Reports, Tax Planning, Analytics or Portfolio Score (sent to sign in).

### Free user <!-- R-FREE -->
All four pages. Reports: every tab, statements, on-screen and tab downloads, and the two free catalog reports; the other 40 catalog reports are locked. Tax Planning: every tab except F&O (blank). Analytics: everything except AI Insights (locked card). Portfolio Score: full.

### Plus subscriber <!-- R-PLUS -->
Everything Free has, plus the 34-report Tax & CA Report Catalog and AI Insights.

### Family subscriber <!-- R-FAMILY -->
Same as Plus in this area.

### Pro/Advisor subscriber <!-- R-PRO -->
Everything Plus has, plus the 6 accounting reports (including Export to Tally) and the F&O (Sec. 43(5)) tab.

### Administrator <!-- R-ADMIN -->
Access follows their plan; additionally receives the nightly "Data integrity: stored figures drifted" alert (oldest active admin only).

### Family owner <!-- R-FAMOWNER -->
In family view, can download any report for any active member or for the whole family (Tax Planning downloads: one member at a time). On-screen figures stay their own.

### Family contributor <!-- R-FAMCONTRIB -->
Same as owner when their view covers every asset class and category; a capped contributor can download only their own reports.

### Family viewer <!-- R-FAMVIEWER -->
Same as contributor.

### Managing a family member's account <!-- R-MANAGER -->
Every page shows the managed person's data under the manager's plan. The Inbox imports tab does not work (Gmail is an account route).

### Professional acting for a client <!-- R-PROF -->
Not applicable on these pages; client reports are downloaded from the CA workspace (D-REPORT-006).

### AI chatbot connection <!-- R-AICONN -->
No access to these pages.

### Succession nominee <!-- R-NOMINEE -->
No access.

## Glossary
| Term | Meaning |
|---|---|
<!-- BEGIN GLOSSARY -->
| FY (financial year) | The Indian April–March tax year, written "2026-27". |
| STCG / LTCG | Short-term / long-term capital gain, decided by how long the units were held before sale. |
| Intraday (speculative) | A buy and sell of the same security on the same day; taxed as speculative business income under Sec. 43(5). |
| Schedule 112A | The ITR schedule for long-term gains on listed equity and equity-oriented funds, with an annual exemption (₹1,25,000 from FY 2024-25). |
| Schedule 112 | The ITR schedule for long-term gains on other assets, with or without indexation. |
| Sec. 111A | Short-term gains on listed equity with STT paid, taxed at a flat rate. |
| Grandfathering / FMV | For equity bought on or before 31-Jan-2018, the cost can be raised to its fair market value (closing price) on that date. |
| Indexation / CII | Raising the cost of an asset by the Cost Inflation Index of the sale year over the purchase year. |
| Set-off / carry forward | Using losses to reduce gains in the same year; unused losses are carried to later years. |
| Tax-loss harvesting | Selling holdings that are at a loss before 31 March to offset gains booked in the same year. |
| Advance tax | Tax paid in four instalments during the year (15 June, 15 September, 15 December, 15 March). |
| Slab rate | Your personal income-tax rate, used for non-equity short-term gains, intraday and F&O. |
| Unrealised P&L | Gain or loss on holdings you still own, at today's price. |
| Realised gain | Gain or loss locked in by a sale. |
| XIRR | Annualised return that accounts for the date of every cash flow. |
| Data checks | The checks above the Reports tabs that say whether figures are complete and current. |
| Report for | The picker that chooses whose figures a download covers: you, one family member, or the whole family. |
| Tax & MIS downloads | The catalog of 42 print-style reports on the Reports page. |
| Financial Health Score | The 0–100 score and A–F grade on the Portfolio Score page. |
<!-- END GLOSSARY -->
