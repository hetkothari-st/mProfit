## Portfolios

A portfolio is a named container for holdings and transactions (for example "Long Term Equity" or "Trading"). Portfolio groups bundle several of your portfolios into one combined read-only view. This chapter also covers the background price feeds and corporate-action processing that value every holding.

### Portfolios list <!-- F-PORT-001 -->

**What it does:** The Portfolios page ("Allocation — Portfolios: Group holdings by goal, strategy, or account. Bundle multiple portfolios into a family group for a consolidated view.") shows your groups under **Family groups** (when any exist) and your portfolios under **Individual portfolios**. Each portfolio card shows its type, name (a star marks the default), description, currency, number of holdings and **Current value**, with **Edit** and **Inspect**. On plans with a limit, a badge reads "N of M portfolios used".

**Why it exists:** Inferred from the page text: separate long-term investments, trading and goal-based money, and see them together when needed.

**Where to find it:** **Overview → Portfolios** (route `/portfolios`); phone tab **Portfolios**.

**Who can use it:** R-FREE (1 portfolio), R-PLUS and R-FAMILY (5), R-PRO (unlimited). In family view the list also includes family-shared portfolios and other members' personal portfolios.

**Steps**
1. Open Portfolios. Cards load (grey placeholders first).
2. Click **Inspect** on a card to open it (F-PORT-004), or **Edit** to change it (F-PORT-002).
3. Click **New portfolio** or **New group** to create one.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "N of M portfolios used" | Badge | Shows usage against your plan | Hidden on Pro/Advisor |
| **New group** | Button | Opens the group dialog (F-PORT-006) | Disabled when you have no portfolios |
| **New portfolio** | Button | Opens the portfolio dialog | Disabled at your plan's limit (tooltip "Upgrade to add more portfolios") |
| "upgrade to add more" | Link | Opens `/pricing` | Shown only at the limit |
| **Create your first portfolio** | Button | Opens the portfolio dialog | Empty list only |
| **Edit** (portfolio card) | Button | Opens the portfolio dialog | — |
| **Inspect** (portfolio card) | Link | Opens `/portfolios/:id` | — |
| **Edit** / **Inspect** (group card) | Button / link | Edit group / open `/portfolio-groups/:id` | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| **New portfolio** is greyed out | You reached your plan's portfolio limit | Upgrade, or delete a portfolio |
| "No portfolios yet" | None created | **Create your first portfolio** |

**Limitations:** Current value shows "—" for a portfolio with no holdings. In family view the "N of M portfolios used" badge counts every portfolio in the list, including other members', while the server counts only portfolios you created — see DOCUMENTATION_GAPS.md. Groups are always yours only.

**How it works:** `GET /api/portfolios` returns portfolios with holding and transaction counts and current value (sum of holdings' current value, cost when unpriced), default first then oldest first. `GET /api/portfolio-groups` returns your groups.

**Related features:** F-PORT-002, F-PORT-004, F-PORT-006, F-PORT-007, F-SHELL-009.

**Sources:** `apps/web/src/pages/portfolios/PortfolioListPage.tsx:25`, `apps/web/src/pages/portfolios/PortfolioListPage.tsx:46`, `apps/web/src/pages/portfolios/PortfolioListPage.tsx:59`, `apps/web/src/pages/portfolios/PortfolioListPage.tsx:67`, `apps/web/src/pages/portfolios/PortfolioListPage.tsx:73`, `apps/web/src/pages/portfolios/PortfolioListPage.tsx:192`, `packages/api/src/services/holdings/portfolio.service.ts:85`, `packages/api/src/services/holdings/portfolio.service.ts:182`, `packages/shared/src/entitlements.ts:82`

### Create or edit a portfolio <!-- F-PORT-002 -->

**What it does:** The dialog "Create a new portfolio" / "Edit portfolio" ("A portfolio groups holdings by strategy, goal, or account.") sets a portfolio's **Name**, **Description (optional)**, **Type**, **Currency** and **Set as default portfolio**.

**Why it exists:** Inferred from behavior: organise holdings your way.

**Where to find it:** **Portfolios → New portfolio**, or **Edit** on a card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO within their portfolio limit. Editing: the portfolio's creator, or any active OWNER of the family a portfolio is shared into (R-FAMOWNER). While managing an account (R-MANAGER) the limit is the manager's plan.

**Steps**
1. Click **New portfolio** (or **Edit**).
2. Fill **Name** and the optional fields.
3. Click **Create** (or **Save changes**). "Portfolio created" / "Portfolio updated" appears and the dialog closes.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Name** | Text | Portfolio name (placeholder "Long Term Equity") | — |
| **Description (optional)** | Text area | Notes | — |
| **Type** | Select | Investment, Trading, Goal-based, Strategy | — |
| **Currency** | Select | INR, USD, EUR, GBP | — |
| **Set as default portfolio** | Checkbox | Makes it the default | — |
| **Delete** | Button | F-PORT-003 | Edit only |
| **Cancel** / **Create** / **Save changes** | Buttons | Close / save | Save disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Name | Text | Yes | 1–100 characters | Empty | "Name is required" |
| Description | Text | No | Up to 500 characters | Empty | Server validation message |
| Type | Select | Yes | INVESTMENT, TRADING, GOAL, STRATEGY | Investment | — |
| Currency | Select | Yes | 3 letters | INR | — |
| Set as default | Checkbox | No | — | Off | — |

**Settings and toggles here:** S-PORT-001 **Type** — a label shown on the card (no calculation uses it). S-PORT-002 **Currency** — the portfolio's currency code; groups only combine portfolios with the same currency. S-PORT-003 **Set as default portfolio** — on: this portfolio is listed first with a star and the previous default is cleared.

**Results:** The portfolio is saved and the lists refresh.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Your FREE plan allows 1 portfolio. Upgrade to PLUS for multiple." (similar for PLUS/FAMILY with their limit) | Plan limit reached | Upgrade or delete a portfolio |
| "Forbidden" or "Save failed" | You are not allowed to edit this portfolio | Ask its creator or a family owner |

**Limitations:** Amounts are still shown in rupees regardless of the portfolio currency. The setup wizard's portfolio creation never adds a second portfolio (it reuses your oldest).

**How it works:** `POST /api/portfolios` checks the count of portfolios you created against your plan (Free 1, Plus 5, Family 5, Pro/Advisor unlimited — placeholders in code) and creates the row; `PATCH /api/portfolios/:id` requires ownership. Setting a default clears the default flag on your other portfolios in the same transaction.

**Related features:** F-PORT-001, F-PORT-003, F-SHELL-009.

**Sources:** `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:25`, `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:76`, `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:134`, `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:143`, `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:156`, `packages/api/src/controllers/portfolio.controller.ts:23`, `packages/api/src/controllers/portfolio.controller.ts:55`, `packages/api/src/lib/planLimits.ts:11`, `packages/api/src/services/holdings/portfolio.service.ts:219`, `packages/api/src/services/holdings/portfolio.service.ts:310`, `packages/api/src/services/holdings/portfolio.service.ts:339`

### Delete a portfolio <!-- F-PORT-003 -->

**What it does:** Permanently deletes a portfolio and everything recorded in it.

**Why it exists:** Inferred from behavior: remove portfolios you no longer need (and free a slot on your plan).

**Where to find it:** **Portfolios → Edit → Delete**.

**Who can use it:** The portfolio's creator; any active OWNER of the family a portfolio is shared into (R-FAMOWNER).

**Steps**
1. Click **Edit** on the portfolio, then **Delete**.
2. Confirm "Delete portfolio "<name>"? This cannot be undone." "Portfolio deleted" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Delete** | Button | Asks for confirmation, then deletes | Disabled while deleting |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The portfolio, its transactions, holdings, cash flows, capital-gain records and group memberships are deleted. Bank accounts or other records that pointed at it lose the link but are kept.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Delete failed" or the server's message | Not allowed, or server error | Check you own it |

**Limitations:** No undo and no archive.

**How it works:** `DELETE /api/portfolios/:id` after an ownership check; related rows are removed by database cascade.

**Related features:** F-PORT-002.

**Sources:** `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:95`, `packages/api/src/services/holdings/portfolio.service.ts:360`, `packages/api/prisma/schema.prisma:1053`

### Portfolio detail <!-- F-PORT-004 -->

**What it does:** Shows one portfolio: name and description, four cards (**Current value**, **Invested**, **Unrealised P&L**, **Today's change**) and a **Holdings** table with Asset, Class, Qty, Avg cost, Invested, CMP, Value, P&L and **XIRR**.

**Why it exists:** Inferred from behavior: the full picture of one portfolio's positions and returns.

**Where to find it:** **Portfolios → Inspect** (route `/portfolios/:id`).

**Who can use it:** Anyone who can read the portfolio: its creator; in a family, any active member (peers' personal portfolios included). Adding a transaction needs you to be the portfolio's creator (see F-TXN-002).

**Steps**
1. Read the cards and table.
2. Click **XIRR** in the header to sort: highest first, then lowest first, then unsorted.
3. Click **Add transaction** (or **Add transaction** in the empty state) to record one in this portfolio.
4. Click **Back to portfolios** to return.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Back to portfolios** | Link | Opens `/portfolios` | — |
| **Refresh prices** | Button | F-PORT-005 | — |
| **Add transaction** | Button | Opens the transaction dialog with this portfolio chosen | — |
| **XIRR** | Sort button | Cycles descending → ascending → off | — |

**Fields and rules:** None.

**Settings and toggles here:** S-PORT-004 **XIRR sort** — off (default), descending, ascending; not remembered.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No holdings yet — Import a contract note or add a manual transaction to see holdings here." | Empty portfolio | Add a transaction |
| "Portfolio not found" / forbidden | The portfolio was deleted or is not yours to see | Go back to Portfolios |

**Limitations:** Holdings are listed in the order they were last recalculated, not by value. A holding's XIRR is shown only when it has a current price and enough history; holdings without XIRR sort last. XIRR colours: red below 0, green at 7% a year or more, amber in between (7% is a fixed-deposit benchmark used only for colour). The cards do not refresh immediately after you add a transaction from this page — reload or revisit (see DOCUMENTATION_GAPS.md).

**How it works:** Summary as in F-DASH-008. Holdings come from the recalculated holdings table with stock symbol or fund scheme code added; per-holding XIRR is solved from all the portfolio's transactions with today's value as the final cash flow.

**Related features:** F-PORT-005, F-TXN-002, F-DASH-008.

**Sources:** `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:38`, `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:59`, `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:108`, `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:144`, `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:185`, `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:268`, `packages/api/src/services/holdings/portfolio.service.ts:251`, `packages/api/src/services/holdings/portfolio.service.ts:547`, `packages/api/src/services/holdings/portfolio.service.ts:631`

### Refresh prices (one portfolio) <!-- F-PORT-005 -->

**What it does:** **Refresh prices** re-values this portfolio's holdings from the latest prices and shows "N holdings refreshed".

**Why it exists:** Inferred from behavior: update one portfolio without waiting for the schedule.

**Where to find it:** Portfolio detail → **Refresh prices**.

**Who can use it:** The portfolio's creator only (others get "Portfolio not found").

**Steps**
1. Click **Refresh prices**. A spinner shows; then "N holdings refreshed".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh prices** | Button | Refreshes this portfolio | Disabled while running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Holdings' current price, value and P&L are updated.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Refresh failed" / "Portfolio not found" | Error, or the portfolio is not yours | Use your own portfolio |

**Limitations:** Uses prices already stored (and live quotes where the price router supports them); it does not first download new stock closes the way the Dashboard's **Refresh** does.

**How it works:** `POST /api/assets/portfolios/:id/refresh-prices` checks `portfolio.userId` equals you, then re-prices that portfolio's holdings.

**Related features:** F-DASH-014, F-PORT-008.

**Sources:** `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:91`, `packages/api/src/controllers/assets.controller.ts:76`, `packages/api/src/services/holdings/holdingsProjection.ts:712`

### Portfolio groups: create, edit, delete <!-- F-PORT-006 -->

**What it does:** "Create a portfolio group" ("Bundle multiple portfolios (e.g. each family member's investments) into a single consolidated view. Member portfolios stay independent for transactions.") lets you name a group, describe it and tick member portfolios. Edit changes them; **Delete group** removes the group only.

**Why it exists:** Code comment: "a user-owned bucket that bundles N of that same user's Portfolios into a single read view".

**Where to find it:** **Portfolios → New group**, or **Edit** on a group card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO — only with portfolios you created.

**Steps**
1. Click **New group** (enabled once you have a portfolio).
2. Enter **Name** (placeholder "e.g. Kotharis") and optional **Description (optional)**.
3. Tick portfolios under **Member portfolios**. After the first tick, portfolios in other currencies are greyed out ("Group currency locked to <code>. Other-currency portfolios disabled.").
4. Click **Create group** (or **Save changes**). "Group created" / "Group updated" appears.
5. To delete, open **Edit**, click **Delete group** and confirm "Delete group "<name>"? Member portfolios are unaffected."

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Name** | Text | Group name | — |
| **Description (optional)** | Text area | Notes | — |
| **Member portfolios** checkboxes | Checkbox list | Choose members | Other-currency portfolios disabled once one is ticked |
| **Delete group** | Button | Deletes the group | Edit only |
| **Cancel** / **Create group** / **Save changes** | Buttons | Close / save | Save disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Name | Text | Yes | 1–100 characters | Empty | "Name is required"; server "Group name is required" |
| Description | Text | No | Up to 500 characters | Empty | — |
| Members | List | No | Your own portfolios, one currency | None | "One or more portfolios not owned by user"; "Group members must share a currency; got …" |

**Settings and toggles here:** None.

**Results:** The group card appears under **Family groups**. Deleting a group leaves its portfolios untouched.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Save failed" with a server message | Not your portfolio, or mixed currencies | Pick your own portfolios in one currency |
| "No portfolios available. Create individual portfolios first." | No portfolios | Create one first |

**Limitations:** Groups cannot include family members' portfolios or another person's; they are a personal view only, despite the "Family groups" heading. A group can be empty. Saving an edit sends name/description and members as two requests.

**How it works:** `POST /api/portfolio-groups` with `memberIds`; `PATCH /api/portfolio-groups/:id` then `PUT /api/portfolio-groups/:id/members`; every write checks the group and each portfolio belong to you and that member currencies match.

**Related features:** F-PORT-007.

**Sources:** `apps/web/src/pages/portfolios/PortfolioGroupFormDialog.tsx:25`, `apps/web/src/pages/portfolios/PortfolioGroupFormDialog.tsx:65`, `apps/web/src/pages/portfolios/PortfolioGroupFormDialog.tsx:81`, `apps/web/src/pages/portfolios/PortfolioGroupFormDialog.tsx:114`, `apps/web/src/pages/portfolios/PortfolioGroupFormDialog.tsx:166`, `apps/web/src/pages/portfolios/PortfolioGroupFormDialog.tsx:194`, `packages/api/src/controllers/portfolioGroup.controller.ts:19`, `packages/api/src/services/holdings/portfolioGroup.service.ts:37`, `packages/api/src/services/holdings/portfolioGroup.service.ts:44`, `packages/api/src/services/holdings/portfolioGroup.service.ts:57`

### Portfolio group detail <!-- F-PORT-007 -->

**What it does:** Shows a group: "Members:" chips (each opens that portfolio), cards **Combined value**, **Invested**, **Unrealised P&L**, **Today's change**, and **Combined holdings** where the same asset in several member portfolios is merged into one row.

**Why it exists:** Inferred from behavior: see several portfolios as one.

**Where to find it:** **Portfolios → group card → Inspect** (route `/portfolio-groups/:id`).

**Who can use it:** The group's owner only.

**Steps**
1. Read the cards and table; click a member chip to open that portfolio.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Back to portfolios** | Link | Opens `/portfolios` | — |
| Member chips | Links | Open `/portfolios/:id` | Hidden when the group has no members |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No holdings in this group — Add member portfolios with holdings to see combined positions here." | Empty group or members without holdings | Edit the group |
| "Portfolio group not found" | Deleted or not yours | — |

**Limitations:** **Today's change** counts stocks only (unlike a single portfolio, which also counts funds, crypto and gold). There is no XIRR for groups. When a merged asset's members are priced differently, CMP shows the last member's price. P&L is blank if any member's holding lacks a price.

**How it works:** Summary and holdings are computed over all member portfolios' holdings; merged rows sum quantity, cost and value, with average cost = cost ÷ quantity.

**Related features:** F-PORT-006, F-PORT-004.

**Sources:** `apps/web/src/pages/portfolios/PortfolioGroupDetailPage.tsx:28`, `apps/web/src/pages/portfolios/PortfolioGroupDetailPage.tsx:71`, `apps/web/src/pages/portfolios/PortfolioGroupDetailPage.tsx:87`, `packages/api/src/services/holdings/portfolioGroup.service.ts:239`, `packages/api/src/services/holdings/portfolioGroup.service.ts:283`, `packages/api/src/services/holdings/portfolioGroup.service.ts:327`

### Scheduled market price feeds <!-- F-PORT-008 -->

**What it does:** EveryPaisa downloads market prices on a fixed India-time schedule and re-values every user's holdings after each price download, so values, P&L and charts stay current without you doing anything.

**Why it exists:** Code comments: prices are "valuation inputs behind every holding"; feeds are checked ("canary") so a broken source does not silently corrupt valuations.

**Where to find it:** Not a page; results appear in every value on the Dashboard, Portfolios and asset-class pages (with "price as of" dates where shown).

**Who can use it:** Runs for everyone automatically.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** None.

**Settings and toggles here:** None for users. Operators: `ENABLE_PRICE_CRONS=false` stops all of these; `ENABLE_COST_SIZE_REFRESH=false` stops the fund cost/size refresh.

**Results:** Schedule (all India time):
| Feed | When | Then |
|---|---|---|
| Mutual fund NAVs (AMFI) | Daily 22:00 | All holdings re-priced |
| Fund expense ratio and size (AMFI) | Daily 22:30 | — |
| Stock end-of-day prices (Yahoo, all stocks) | Mon–Fri 16:30 | All holdings re-priced |
| Stock prices for held stocks | Mon–Fri every 15 minutes, 09:00–15:45 | All holdings re-priced |
| NSE/BSE stock and ETF lists | Sunday 03:00 | — |
| Corporate actions (NSE) | Daily 20:00 | F-PORT-009 |
| Gold/silver and other commodities | Daily 23:30 | All holdings re-priced |
| Crypto | Every 2 minutes | All holdings re-priced |
| Currency rates | Hourly | — |
| Index benchmarks (NIFTY, Sensex) | Mon–Fri 16:40 and at server start | — |
| F&O lot sizes / end-of-day / live | Sun 03:30 / Mon–Fri 16:45 / every minute 09:00–15:59 Mon–Fri | F&O positions re-priced |
| Fuel prices | Daily 06:30 | — |

**Errors and troubleshooting:** None visible to users; a failed feed is logged and reported to monitoring, and prices stay at their last values.

**Limitations:** Market data comes from outside sources (AMFI, Yahoo, NSE, BSE, CoinGecko and others) whose availability cannot be verified from code. A job still running when its next run is due is skipped.

**How it works:** node-cron schedules in `Asia/Kolkata`; each job runs with system access (it updates shared price tables and all users' holdings) and is guarded against overlapping runs.

**Related features:** F-PORT-009, F-DASH-014, F-DASH-018.

**Sources:** `packages/api/src/jobs/priceJobs.ts:49`, `packages/api/src/jobs/priceJobs.ts:64`, `packages/api/src/jobs/priceJobs.ts:320`, `packages/api/src/jobs/priceJobs.ts:327`, `packages/api/src/jobs/priceJobs.ts:335`, `packages/api/src/jobs/priceJobs.ts:338`, `packages/api/src/jobs/priceJobs.ts:344`, `packages/api/src/jobs/priceJobs.ts:351`, `packages/api/src/jobs/priceJobs.ts:372`

### Automatic corporate-action application <!-- F-PORT-009 -->

**What it does:** After the daily 20:00 corporate-action download, EveryPaisa adds stock splits, bonus issues and cash dividends to the affected stock holdings as transactions, so quantities and income stay right.

**Why it exists:** Code comment: "fold newly-fetched splits/bonuses into holdings (idempotent)".

**Where to find it:** Results appear as SPLIT, BONUS and DIVIDEND PAYOUT rows on **Transactions** and in holdings quantities.

**Who can use it:** Automatic for every portfolio with stock holdings.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** None.

**Settings and toggles here:** None (runs inside the corporate-actions price job).

**Results:** For each stock holding and each action whose ex-date has passed, based on the quantity held before the ex-date: SPLIT adds quantity × (ratio − 1) at no cost; BONUS adds quantity × ratio at zero cost; DIVIDEND adds a dividend payout of amount per share × quantity (no change to quantity or cost). Holdings are then recalculated.

**Errors and troubleshooting:** None visible.

**Limitations:** Mergers, demergers, rights issues and buybacks are not applied automatically (they need your choice or data the feed lacks). Only holdings linked to a listed stock are processed. An action is applied once per holding; an identical row already on the books is not added again.

**How it works:** Each created row carries a fixed identity (`ca:<action>:<holding>`) and is also checked against existing identical transactions, so re-runs add nothing.

**Related features:** F-PORT-008, F-PORT-010, F-TXN-001.

**Sources:** `packages/api/src/jobs/priceJobs.ts:209`, `packages/api/src/jobs/corporateActionApplyJob.ts:10`, `packages/api/src/services/corporateActions/corporateActionApply.service.ts:14`, `packages/api/src/services/corporateActions/corporateActionApply.service.ts:48`, `packages/api/src/services/corporateActions/corporateActionApply.service.ts:63`

### What this area doesn't do
- You cannot move a portfolio's holdings to another portfolio in one step (edit each transaction's portfolio instead).
- Portfolio groups cannot mix currencies and cannot include other people's portfolios.
- There is no archive for portfolios — deleting is permanent.
- There is no manual price entry on the portfolio page.
- The corporate-actions report and manual sync endpoints exist on the server but have no screen (see DOCUMENTATION_GAPS.md).

