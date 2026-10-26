## Goals

The **Goals** page (sidebar **Planning → Goals**, route `/goals`, page title **Financial goals**) tracks targets such as retirement, a child's education or a FIRE corpus. Each goal has a target amount and date; its progress is a starting amount plus the current value of the portfolios you link to it, and it shows the yearly return you would need to get there. Goals are a **Plus** feature.

### Goals list and progress <!-- F-GOAL-001 -->
**What it does:** Lists your goals as cards in three sections — **Active**, **Achieved** and **Paused / abandoned** — each with category and priority badges, a progress bar and percentage, **Current**, **Target**, **Remaining**, **Target date**, years left ("N.Ny left"), the yearly return needed ("Need N.N% CAGR"), an **Off-track** flag when the needed return exceeds your expected return, and the linked portfolios.

**Why it exists:** Page description: "Track progress against retirement, child education, FIRE corpus, and custom targets."

**Where to find it:** **Planning → Goals** (route `/goals`).

**Who can use it:** R-PLUS, R-FAMILY, R-PRO (server-enforced: GOAL_PROJECTIONS needs Plus). R-FREE sees the page blurred behind "Goal Planning is locked — Upgrade to Plus to unlock Goal Planning." with **View plans**. R-MANAGER: the manager's plan decides; goals shown are the managed person's.

**Steps**
1. Open **Planning → Goals**. With no goals: "No goals yet" and **Create first goal**.
2. Read each card. Click **Edit** to change a goal (F-GOAL-002) or the bin to delete it (F-GOAL-003).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **New goal** / **Create first goal** | Button | Opens **Create goal** | — |
| **Edit** | Button | Opens **Edit goal** | — |
| Bin (title "Delete") | Button | Deletes after confirmation | — |
| **View plans** | Link | Opens Pricing | Shown only when locked |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-GOAL-001 to S-GOAL-006 are set in the goal form.

**Results:** Nothing changes by viewing.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Locked card | Your plan is Free | Upgrade on Pricing |
| "Need …% CAGR" missing | Current value is 0, or the target date has passed | Link a portfolio or add an initial amount |

**Limitations:** **Inflation rate** has no visible effect: the needed return is computed against the target as entered, not the inflation-adjusted target, which is computed but not shown (see DOCUMENTATION_GAPS.md). When current value already exceeds the target, the needed return shows as a negative percentage. Progress is capped at 100%.

**How it works:** `GET /api/goals` (Plus-gated) returns each goal with computed fields. Current value = initial amount + the value of holdings in linked portfolios you own (current value, or cost when no price); an **Emergency fund** goal counts only cash, fixed and recurring deposits and post-office savings, RD and TD. Remaining = max(0, target − current). Years left = days to target date ÷ 365.25. Needed return = (target ÷ current)^(1 ÷ years) − 1, only when current > 0 and the date is in the future. **Off-track** when needed return > expected return. Sorted by status, then nearest target date.

**Related features:** F-GOAL-002, F-GOAL-003, D-GOAL-001, D-GOAL-002.

**Sources:** @@W/pages/goals/GoalsPage.tsx#export function GoalsPage@@, @@W/pages/goals/GoalsPage.tsx#<LockedFeature requiredTier="PLUS" featureName="Goal Planning">@@, @@W/pages/goals/GoalsPage.tsx#function GoalCard@@, @@W/pages/goals/GoalsPage.tsx#Off-track@@, @@W/components/common/LockedFeature.tsx#is locked</h3>@@, @@A/routes/goals.routes.ts#goalsRouter.use(requireFeature('GOAL_PROJECTIONS'));@@, @@A/services/goals/goals.service.ts#async function withProgress@@, @@A/services/goals/goals.service.ts#const requiredCagr = calcRequiredCagr@@, @@A/services/goals/goalMath.ts#export function requiredCagr@@, @@A/services/goals/goalMath.ts#const LIQUID_EMERGENCY_CLASSES@@

### Create or edit a goal <!-- F-GOAL-002 -->
**What it does:** **Create goal** (or **Edit goal**) sets name, category, priority, target and initial amounts, target date, status (edit only), inflation rate, expected return, linked portfolios and notes. **Quick start** buttons fill four templates: **Retirement at 60** (₹5 crore, 6% / 12%), **Child's higher education** (₹50 lakh, 8% / 11%), **Emergency fund (6 months)** (₹6 lakh, 6% / 7%), **FIRE corpus (25× expenses)** (₹3 crore, 6% / 12%).

**Why it exists:** Empty-state text: "Set a target amount and date, link contributing portfolios, and watch progress accrue."

**Where to find it:** **Planning → Goals → New goal**, or **Edit** on a card.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Click **New goal**. **Create goal** opens with category **Custom**, priority **Medium**, initial amount 0, inflation 0.06, expected return 0.12 and a target date 5 years from today.
2. Optionally click a **Quick start** template.
3. Fill **Name**, **Target amount (₹)**, **Target date**; adjust the rest; tick **Linked portfolios**.
4. Click **Create** (or **Save**). The toast "Goal created" / "Goal updated" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Quick start** template buttons | Buttons | Fill name, category, priority, target, rates | Create only |
| **Linked portfolios** checkboxes | Checkboxes | Choose portfolios counted | "No portfolios yet — create one first." when none |
| **Cancel** / **Create** / **Save** | Buttons | Close / save | Save disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Name** | Text | Yes | 1–200 | Empty | "Name required" |
| **Category** | Select (9) | No | — | Custom | — |
| **Priority** | Select: High, Medium, Low | No | — | Medium | — |
| **Target amount (₹)** | Number | Yes | > 0 | Empty | "Target amount required" |
| **Initial amount (₹)** | Number | No | ≥ 0 | 0 | — |
| **Target date** | Date | Yes | YYYY-MM-DD | Today + 5 years | "Target date required" |
| **Status** | Select: Active, Achieved, Paused, Abandoned | No | Edit only | Current | — |
| **Inflation rate (decimal)** | Number | No | Fraction (0.06 = 6%), below 10 | 0.06 | "Validation failed" (server) |
| **Expected return (decimal)** | Number | No | Fraction, below 10 | 0.12 | "Validation failed" (server) |
| **Notes** | Text area | No | Up to 4000 | Empty | — |

**Settings and toggles here:** S-GOAL-001 **Category** (Emergency fund changes what counts); S-GOAL-002 **Priority**; S-GOAL-003 **Status**; S-GOAL-004 **Inflation rate**; S-GOAL-005 **Expected return** (drives **Off-track**); S-GOAL-006 **Linked portfolios**.

**Results:** The goal is saved and the list recomputes. Setting **Achieved** stamps the achieved date.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This feature requires the PLUS plan or higher" | Free plan | Upgrade |
| "Validation failed" | A rate of 10 or more, or a bad amount | Enter rates as fractions |

**Limitations:** On the Free plan the **New goal** button still opens the form, and saving fails with "This feature requires the PLUS plan or higher". Rates are entered as fractions, not percentages. Every save of an **Achieved** goal re-stamps the achieved date. Linked portfolios you no longer own are silently ignored.

**How it works:** `POST /api/goals` / `PATCH /api/goals/:id`. The start date is set to today on creation.

**Related features:** F-GOAL-001.

**Sources:** @@W/pages/goals/GoalDialog.tsx#const TEMPLATES@@, @@W/pages/goals/GoalDialog.tsx#const submit = () => {@@, @@W/pages/goals/GoalDialog.tsx#Inflation rate (decimal)@@, @@W/pages/goals/GoalDialog.tsx#No portfolios yet — create one first.@@, @@A/controllers/goals.controller.ts#const baseSchema = z.object({@@, @@A/services/goals/goals.service.ts#export async function createGoal@@, @@A/services/goals/goals.service.ts#achievedAt: input.status === 'ACHIEVED' ? new Date() : null,@@

### Delete a goal <!-- F-GOAL-003 -->
**What it does:** Deletes a goal after the browser confirmation "Delete this goal?".

**Why it exists:** Removes a goal you no longer track. Inferred from behavior.

**Where to find it:** Bin on a goal card (route `/goals`).

**Who can use it:** R-PLUS, R-FAMILY, R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Click the bin and confirm. The toast "Goal removed" appears.

**Controls:** Bin (title "Delete").

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** The goal is removed; linked portfolios are not affected.

**Errors and troubleshooting:** The server message, for example "Goal not found".

**Limitations:** No undo.

**How it works:** `DELETE /api/goals/:id`.

**Related features:** F-GOAL-001.

**Sources:** @@W/pages/goals/GoalsPage.tsx#if (confirm('Delete this goal?'))@@, @@A/services/goals/goals.service.ts#export async function deleteGoal@@

### What this area doesn't do

- No SIP planning or monthly-investment suggestion on this page.
- No goal reminders or alerts.
- Goals don't use family view.

## Income

The **Income** page (sidebar **Overview → Income**, route `/income`) records recurring income — salary, business, trading, freelance, rental, interest/dividend, capital gains or other — as a monthly amount. Health Score, the insurance coverage check and other features use this figure instead of guessing from bank emails. Not plan-gated.

### Income list and total <!-- F-INC-001 -->
**What it does:** Shows **Total active monthly income** and cards in **Active** and **Inactive** sections, each with source name, type, **Inactive** badge, monthly amount ("/mo"), "Credited on day N" and notes.

**Why it exists:** Page description: "Salary, business, trading, freelance, rental, or any other recurring income. Used to score your financial health (investment rate, debt burden, insurance) and wherever your income matters."

**Where to find it:** **Overview → Income** (route `/income`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Open **Income**. With none: "No income entries yet" and **Add your first income**.
2. Use the pencil (title "Edit") or bin (title "Delete") on a card.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add income** / **Add your first income** | Button | Opens **Add income** | — |
| Pencil (title "Edit") | Button | Opens **Edit income** | — |
| Bin (title "Delete") | Button | Deletes immediately (F-INC-003) | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-INC-002 **Currently active** decides the section and the total.

**Results:** None.

**Errors and troubleshooting:** None specific.

**Limitations:** Amounts are monthly; there is no yearly or history view.

**How it works:** `GET /api/income` returns entries active first, then oldest first. The total adds active entries' monthly amounts.

**Related features:** F-INC-002, F-INC-003, D-INC-001, F-INS-019.

**Sources:** @@W/pages/income/IncomePage.tsx#export function IncomePage@@, @@W/pages/income/IncomePage.tsx#Total active monthly income@@, @@W/pages/income/IncomePage.tsx#Credited on day@@, @@A/services/income/income.service.ts#export async function listIncomes@@, @@A/services/income/income.service.ts#export async function activeMonthlyIncomeTotal@@

### Add or edit income <!-- F-INC-002 -->
**What it does:** **Add income** (or **Edit income**) records type, source, monthly amount, typical credit day, active flag and notes. For **Rental**, **Interest / Dividend** and **Trading**, a **Fetch from your data** box offers suggestions you can click to fill the form.

**Why it exists:** Empty-state text: "Add your salary, business, trading, or any other income stream so Health Score and other features can use a real number instead of guessing from bank emails."

**Where to find it:** **Overview → Income → Add income**, or the pencil on a card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Add income**. The dialog opens with type **Salary**, credit day 1 and **Currently active** ticked.
2. Pick **Income type**; the source label changes (**Employer**, **Business name**, **Broker / platform**, **Client / platform**, **Property**, **Bank / fund**, **Asset / broker**, **Source**).
3. For Rental, Interest / Dividend or Trading, click a suggestion to fill source, amount (and day), or "Nothing found yet — enter it manually below."
4. Fill **Monthly amount (₹)** ("For irregular income (trading, freelance), use your recent average.") and **Typical credit day**.
5. Click **Add** (or **Save**). The toast "Income added" / "Income updated" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Suggestion rows | Buttons | Fill the form | Only for Rental, Interest / Dividend, Trading |
| **Currently active** | Checkbox | Active flag | — |
| **Cancel** / **Add** / **Save** | Buttons | Close / save | Save disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Income type** | Select (8) | No | — | Salary | — |
| Source (label per type) | Text | Yes | 1–200 | Empty | "<label> required" (for example "Employer required") |
| **Monthly amount (₹)** | Number | Yes | > 0 | Empty | "Monthly amount required" |
| **Typical credit day** | Number | No | 1–31 | 1 | "Pay day must be between 1 and 31" |
| **Notes** | Text area | No | Up to 2000 | Empty | — |

**Settings and toggles here:** S-INC-001 **Income type**; S-INC-002 **Currently active**.

**Results:** The entry is saved; Health Score refreshes.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Pay day must be between 1 and 31" | The credit-day box is empty or outside 1–31 | Type a day from 1 to 31 |
| "Monthly amount must be positive" (server) | Zero amount sent through the API | Enter a positive amount |

**Limitations:** Suggestions: Rental — one per active tenancy at its rent and due day; Interest / Dividend — 12-month average of dividend and interest transactions; Trading — 12-month average of realised F&O P&L (only when positive). The trading suggestion note says it varies.

**How it works:** `POST /api/income` / `PATCH /api/income/:id`; suggestions `GET /api/income/suggestions?type=`.

**Related features:** F-INC-001, D-INC-001, D-INC-002.

**Sources:** @@W/pages/income/IncomeDialog.tsx#const SUGGESTABLE_TYPES@@, @@W/pages/income/IncomeDialog.tsx#const submit = () => {@@, @@W/pages/income/IncomeDialog.tsx#Fetch from your data@@, @@W/pages/income/incomeTypeMeta.ts#export const INCOME_TYPE_SOURCE_LABEL@@, @@A/controllers/income.controller.ts#const baseSchema = z.object({@@, @@A/services/income/income.service.ts#async function rentalSuggestions@@, @@A/services/income/income.service.ts#async function interestDividendSuggestion@@, @@A/services/income/income.service.ts#async function tradingSuggestion@@

### Delete income <!-- F-INC-003 -->
**What it does:** Deletes an income entry immediately, with no confirmation.

**Why it exists:** Removes an income that no longer applies. Inferred from behavior.

**Where to find it:** Bin (title "Delete") on an income card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click the bin. The toast "Income entry removed" appears.

**Controls:** Bin (title "Delete").

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** The entry is removed and the total updates.

**Errors and troubleshooting:** The server message, for example "Income entry not found".

**Limitations:** No confirmation and no undo; to pause an income instead, untick **Currently active**.

**How it works:** `DELETE /api/income/:id`.

**Related features:** F-INC-001.

**Sources:** @@W/pages/income/IncomePage.tsx#onDelete={(id) => removeMut.mutate(id)}@@, @@A/services/income/income.service.ts#export async function deleteIncome@@

### What this area doesn't do

- Income isn't detected automatically from bank credits here; it is what you enter.
- No yearly totals, tax treatment or history.

## Cash Activity

The **Cash Activity** page (sidebar **Overview → Cash Activity**, route `/cashflows`) shows a 12-month forecast of scheduled money in and out, and the list of cash-flow entries — money-in and money-out records created from approved bank alerts, rent, and split-expense settlements. Not plan-gated.

### Scheduled cashflow forecast <!-- F-CASH-001 -->
**What it does:** The **Scheduled cashflow** card ("Forecast · next 12 months") shows **Expected inflows**, **Expected outflows** and **Net**, a monthly bar chart of inflows and outflows, "Negative cashflow month ahead" when any month nets below zero, and the next 6 **Upcoming events** (Loan EMI, Rent due, Premium, FD matures, RD matures).

**Why it exists:** Code comment: aggregates the next N months of scheduled inflows and outflows.

**Where to find it:** **Overview → Cash Activity**, top card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps:** Not applicable — view only.

**Controls:** Chart tooltip on hover.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None shown; the card is hidden if loading fails.

**Limitations:** Each insurance policy contributes only its next premium, so a monthly or quarterly premium appears once in 12 months. FD and RD maturities show the amount invested, not the maturity value. Rent shows the full expected amount even for a partly paid month. The chart can show a 13th month for an event exactly 12 months away.

**How it works:** `GET /api/cashflows/forecast?horizonMonths=12` (1–36 accepted). Events from today to today + 12 months: unpaid EMIs from each active loan's schedule; rent receipts expected, overdue or partial; the stored next premium due of active policies; FD/RD buy transactions maturing in range. Totals use decimal arithmetic.

**Related features:** F-CASH-002, D-CASH-002.

**Sources:** @@W/pages/cashflows/CashflowForecastSection.tsx#export function CashflowForecastSection@@, @@W/pages/cashflows/CashflowForecastSection.tsx#Negative cashflow month ahead@@, @@A/services/analytics/cashflowForecast.service.ts#export async function getCashflowForecast@@, @@A/services/analytics/cashflowForecast.service.ts#nextPremiumDue: { gte: today, lte: horizonEnd },@@, @@A/services/analytics/cashflowForecast.service.ts#const amt = d(tx.netAmount);@@, @@A/controllers/cashflows.controller.ts#horizonMonths: z.coerce.number().int().min(1).max(36).default(12),@@

### Cash flow entries <!-- F-CASH-002 -->
**What it does:** Lists cash-flow entries newest first, 50 per page, with **All** / **Inflows** / **Outflows** tabs, **Inflows (this page)** and **Outflows (this page)** totals, and columns **Date**, **Description**, **Portfolio**, **Amount** (+ green / − red).

**Why it exists:** Page description: "Bank credits and debits parsed from your connected accounts".

**Where to find it:** **Overview → Cash Activity**, below the forecast.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Choose a tab. Use **Previous** / **Next** when there is more than one page ("N total · page X of Y").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **All** / **Inflows** / **Outflows** | Tabs | Filter by direction; back to page 1 | — |
| **Previous** / **Next** | Buttons | Page | Disabled at the ends; hidden with one page |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-CASH-001 direction tab (not saved).

**Results:** None.

**Errors and troubleshooting:** "No cash flows found — Connect a Gmail account and configure senders to start ingesting bank alerts."

**Limitations:** Totals cover only the visible page. Entries can't be added, edited or deleted here. Amounts are always shown in rupees, including split-expense entries recorded in a foreign currency (see DOCUMENTATION_GAPS.md). A missing description shows "Credit" or "Debit".

**How it works:** `GET /api/cashflows?type=&page=&pageSize=50` (server also accepts portfolio and date filters, max 200 per page). Entries are created by approved inbox events, rent receipts and rent-ledger entries, and split-expense share links.

**Related features:** F-CASH-001, D-CASH-001, D-CASH-003, D-CASH-004.

**Sources:** @@W/pages/cashflows/CashFlowsPage.tsx#const PAGE_SIZE = 50;@@, @@W/pages/cashflows/CashFlowsPage.tsx#Inflows (this page)@@, @@W/pages/cashflows/CashFlowsPage.tsx#No cash flows found@@, @@A/controllers/cashflows.controller.ts#export async function listCashFlows@@, @@A/controllers/cashflows.controller.ts#amount: cf.amount.toString(),@@, @@A/ingestion/projection.ts#const cf = await tx.cashFlow.create({@@, @@A/services/split/shareLink.service.ts#currency: want.currency@@

### What this area doesn't do

- You can't add, edit, delete or categorise cash-flow entries.
- No search or date filter on the page (the API has them).
- The forecast isn't adjustable (fixed at 12 months).
