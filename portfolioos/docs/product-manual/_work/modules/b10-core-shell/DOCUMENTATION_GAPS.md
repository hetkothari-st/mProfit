# Documentation Gaps — B10 core shell

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): App layout and navigation, AI Assistant, Dashboard, Portfolios, Transactions, Bank Accounts, Alerts & Reminders (batch B10)

## Verification limitations
This batch was documented from code only. No server or browser was started; layouts, exact rendering of text and the behaviour of external services were not observed.

## Unverified claims
| ID | Item | What is unknown | Why it couldn't be verified | Suggested owner action |
|---|---|---|---|---|
<!-- BEGIN UNVERIFIED -->
| B10-UI | All B10 screens | Visual layout, wrapping and exact on-screen rendering | Run was code-only by brief | Spot-check the Dashboard, Portfolios, Transactions, Bank Accounts, Alerts and the assistant panel in a browser |
| F-AI-003 | Content and quality of assistant answers | What the model actually says, which cards it emits, tool use in practice | Depends on a live model, `ANTHROPIC_API_KEY` and data | Review sample answers in a configured environment |
| F-DASH-009 | Portfolio chart in family view for another member's personal portfolio | Whether today's point drops to ₹0: the live-value overlay query is not wrapped in the member's data context (`packages/api/src/services/holdings/portfolio.service.ts:875`), unlike the replay above it (`packages/api/src/services/holdings/portfolio.service.ts:680`) | Depends on row-level-security policies at runtime | Test the family Dashboard with a peer's personal portfolio; wrap the overlay in `readCtx` if confirmed |
| F-PORT-008 | External price sources | Availability, rate limits and data quality of AMFI, Yahoo, NSE/BSE, CoinGecko, commodity, FX and fuel sources | External services | Monitor feed canary alerts |
| F-BANK-002 | IFSC lookup | Coverage and accuracy of Razorpay's public IFSC service | External service | None needed unless users report wrong branches |
<!-- END UNVERIFIED -->

## Implementation ambiguities and possible defects
| ID | Observation | Evidence (path:line) | Question |
|---|---|---|---|
<!-- BEGIN AMBIGUITIES -->
| F-DASH-011 | Confirmed defect: **View all** on Top holdings links to `/holdings`, which has no route, so it shows "This page doesn't exist". | `apps/web/src/pages/dashboard/DashboardPage.tsx:1061`, `apps/web/src/App.tsx:282` | Point it at `/portfolios` or build a holdings page? |
| F-DASH-010 | Confirmed defect: the pie hides slices by passing every slice key through the asset-class→sidebar map, so the Vehicles slice follows **Others** and the rental Real Estate slice follows **Real Estate** (not **Vehicles** / **Rental**); the trio cards also use `/real-estate` for the rental card. | `apps/web/src/pages/dashboard/DashboardPage.tsx:251`, `apps/web/src/pages/dashboard/DashboardPage.tsx:505`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1430`, compare `apps/web/src/lib/sidebarClassValues.ts:91` | Use the same category mapping as the sidebar values. |
| F-DASH-010 | Confirmed defect (family view): merging members' allocation slices updates `value` and `percent` but keeps the first member's `numericValue`, which the ring chart draws and filters on — ring sizes are wrong while the legend is right. | `packages/api/src/services/analytics/dashboard.service.ts:677`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1015` | Recompute `numericValue` in the merge. |
| F-DASH-005 | Confirmed defect: **Hide values** does not mask the Net worth over time axis or tooltip (the portfolio chart does), nor the bank balance-history axis. | `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:177`, `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:196`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:326`, compare `apps/web/src/pages/dashboard/DashboardPage.tsx:974` | Apply the same `hideSensitive` check. |
| F-ALERT-004 | Confirmed defect: the "Scan complete — N new alerts" toast adds only the vehicle and rent counts; eight other checks' counts are ignored. | `apps/web/src/pages/alerts/AlertsPage.tsx:355`, `packages/api/src/services/notifications/alerts.service.ts:363` | Sum all returned counts. |
| F-AI-003 | Confirmed defect: the assistant's action card renders a CTA button with no click handler. | `apps/web/src/components/ai/PortfolioDataCard.tsx:149` | Wire it to a route or remove it. |
| F-AI-003 | Confirmed defect: while managing a family member's account, chat requests omit `X-Act-As` (sessions are created with it), so the session check fails ("Chat session not found", returned with HTTP 500). | `apps/web/src/api/aiAssistant.api.ts:118`, `apps/web/src/api/client.ts:47`, `packages/api/src/ai/chatSessions.ts:51`, `packages/api/src/routes/aiAssistant.routes.ts:406` | Add the acting header to `streamChat`, or make the assistant an account route. |
| F-AI-001 | Confirmed: the floating assistant button is always rendered, but every `/api/assistant` endpoint returns 404 unless `ANTHROPIC_API_KEY` is set and `ENABLE_LLM_INSIGHTS=true` (default `false`); users then see "Request failed with status code 404". | `apps/web/src/components/layout/AppShell.tsx:114`, `packages/api/src/routes/aiAssistant.routes.ts:59`, `packages/api/src/config/env.ts:118` | Hide the button when the assistant is disabled? |
| F-DASH-008 | Confirmed: the XIRR in the Total invested hint is the unweighted mean of per-portfolio XIRRs, not a combined XIRR. | `apps/web/src/pages/dashboard/DashboardPage.tsx:476` | Use a combined XIRR (the user-level XIRR endpoint already returns one)? |
| F-TXN-002 | Confirmed defect: Trade date and Price validation errors are never displayed (only Portfolio and Quantity errors render), so an invalid or blank date — the default when opened from Reports — makes **Add transaction** silently do nothing. | `apps/web/src/pages/transactions/TransactionFormDialog.tsx:74`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:215`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:519` | Render `formState.errors.tradeDate` / `price`. |
| F-TXN-003 | Confirmed defect: **Record it anyway** does not work on edits — `allowDuplicate` is only added to create requests, so the 409 repeats. | `apps/web/src/pages/transactions/TransactionFormDialog.tsx:283`, `packages/api/src/services/holdings/transaction.service.ts:461` | Pass `allowDuplicate` on update too. |
| F-TXN-002 | Confirmed: after saving or deleting a transaction the dialog invalidates `portfolio-summary` (no query uses that key) and not `['portfolio', id]` or `['dashboard']`, so the portfolio page's cards and the Dashboard stay stale until refetched. | `apps/web/src/pages/transactions/TransactionFormDialog.tsx:289`, `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:81`, `apps/web/src/pages/dashboard/DashboardPage.tsx:371` | Invalidate the keys actually used. |
| F-TXN-002 | Confirmed: creating a transaction recalculates holdings but does not rebuild stored capital-gain rows, although the service comment says create/edit/delete all do. Reports compute gains live; only the stored-data integrity check reads stored rows. | `packages/api/src/services/holdings/transaction.service.ts:342`, `packages/api/src/services/tax/capitalGains.service.ts:963`, `packages/api/src/services/integrity/storedDataIntegrity.service.ts:1` | Call `persistCapitalGainsForAsset` on create? |
| F-TXN-002 | Preview vs server: the dialog treats BONUS as an inflow (net = gross − charges) while the server treats BONUS (and RIGHTS ISSUE, OPENING BALANCE, MERGER IN, DEMERGER IN) as buy-type (gross + charges). | `apps/web/src/pages/transactions/TransactionFormDialog.tsx:364`, `packages/api/src/services/holdings/transaction.service.ts:169` | Align the lists. |
| F-DASH-002 | Owned property (Real Estate page) and bank balances are not part of Total Net Worth, though the real-estate service comment says "Net-worth aggregation reads `currentValue` directly". | `packages/api/src/services/analytics/dashboard.service.ts:470`, `packages/api/src/services/realEstate/realEstate.service.ts:11` | Intended? If not, add owned property (and bank balances) to the total. |
| F-PORT-011 | Any signed-in user can trigger global market-data syncs (`/api/assets/sync-*`, `/api/assets/amfi/sync`) and `/api/corporate-actions/sync`; there is no role gate or rate limit. | `packages/api/src/routes/assets.routes.ts:46`, `packages/api/src/routes/assets.routes.ts:50`, `packages/api/src/routes/corporateActions.routes.ts:17` | Restrict to admins or rate-limit? |
| F-DASH-007 | Confirmed: the LTCG-exempt colour checks "≥ 90%" before "≥ 100%", so the red (fully used) state can never show. | `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:138` | Swap the order. |
| F-DASH-007 | The tax PDF download uses `fetch` without family or acting headers, so while managing an account it downloads the manager's report. | `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:66` | Add the headers. |
| F-BANK-002 | Saving the account form always sends `currentBalance`, so every edit resets the balance source to manual and the date to the form's As of — an account updated from e-mail loses its "live" mark. Clearing the balance box clears the balance. | `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:359`, `packages/api/src/services/banking/bankAccounts.service.ts:245` | Send the balance only when changed. |
| F-BANK-007 | Deleting a balance record never recalculates the account's current balance, has no confirmation and no message. | `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:142`, `packages/api/src/services/banking/bankAccounts.service.ts:445` | Recompute from the newest remaining record? |
| F-PORT-007 | Group "Today's change" counts stocks only; a single portfolio also counts funds, crypto and gold. | `packages/api/src/services/holdings/portfolioGroup.service.ts:283`, `packages/api/src/services/holdings/portfolio.service.ts:457` | Reuse the portfolio calculation. |
| F-ALERT-001 | Many alert types cannot be chosen in the type filter (LOAN_EMI_DUE, CREDIT_CARD_DUE, LOAN_GIVEN_DUE, INSURANCE_CLAIM, PROPERTY_*, PF_REFRESH_DUE, FO_*), and vehicle-expiry and rent-overdue alerts are stored as CUSTOM. | `apps/web/src/pages/alerts/AlertsPage.tsx:61`, `packages/api/prisma/schema.prisma:1630`, `packages/api/src/services/notifications/alerts.service.ts:151` | Extend the filter and use specific types. |
| F-ALERT-003 | Alerts page error toasts show axios's generic text ("Request failed with status code …") rather than the server message. | `apps/web/src/pages/alerts/AlertsPage.tsx:284` | Use `apiErrorMessage`. |
| F-SHELL-009 | Stale comments: the sidebar card says admins bypass feature gates; `rateLimit.ts` says the frontend simulates the locked answer — in code, gates never bypass admins and the server writes the locked preview. | `apps/web/src/components/layout/UpgradeSidebarCard.tsx:15`, `packages/api/src/ai/rateLimit.ts:5`, `packages/api/src/routes/aiAssistant.routes.ts:247` | Update comments. |
| F-PORT-001 | In family view the "N of M portfolios used" badge counts every listed portfolio (including other members'), while the server counts only the caller's own; **New portfolio** can be disabled wrongly. | `apps/web/src/pages/portfolios/PortfolioListPage.tsx:47`, `packages/api/src/controllers/portfolio.controller.ts:56` | Count own portfolios only. |
| F-DASH-003 | In family view the merged alert list is concatenated member by member and cut to 10 without re-sorting by urgency. | `packages/api/src/services/analytics/dashboard.service.ts:658` | Re-sort before slicing. |
<!-- END AMBIGUITIES -->

## Hidden, partial, backend-only, deprecated features
| ID | Feature | Status | Evidence |
|---|---|---|---|
<!-- BEGIN HIDDEN -->
| F-SHELL-011 | `PlaceholderPage` ("<title> — coming in a later phase") — imported in the route file but never rendered; dead code | Hidden | `apps/web/src/App.tsx:14`, `apps/web/src/pages/PlaceholderPage.tsx:5` |
| F-PORT-010 | `/api/corporate-actions` — enriched corporate-actions report (GET, filters portfolio/type/status), NSE sync (POST /sync), apply to my holdings (POST /apply); no web caller | Backend-only | `packages/api/src/routes/corporateActions.routes.ts:15`, `packages/api/src/controllers/corporateActions.controller.ts:36` |
| F-PORT-011 | `/api/assets/sync-all`, `/sync-prices`, `/sync-universe`, `/sync-corp-actions`, `/sync-commodities`, `/sync-crypto`, `/sync-fx`, `/amfi/refresh-holdings` — manual market-data syncs with no web caller (only `/amfi/sync` is used, from Mutual Funds) | Backend-only | `packages/api/src/routes/assets.routes.ts:46`, `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:76` |
| F-DASH-018 | `POST /api/intelligence/net-worth/snapshot` — take today's snapshot on demand; no web caller (the nightly job is live) | Backend-only endpoint of a Live feature | `packages/api/src/routes/intelligence.routes.ts:17` |
| F-SHELL-001 | LLM spend gauge ("LLM spend (mo)") in the sidebar footer — commented out | Hidden | `apps/web/src/components/layout/SidebarNav.tsx:190`, `apps/web/src/components/layout/BudgetGauge.tsx:11` |
<!-- END HIDDEN -->

## UI / API permission mismatches
| ID | UI behavior | API behavior | Evidence |
|---|---|---|---|
<!-- BEGIN MISMATCHES -->
| F-BANK-002 | Customer ID is required ("Required") | Optional (`customerId` nullable) | `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:327`, `packages/api/src/controllers/bankAccounts.controller.ts:34` |
| F-TXN-001 | Family view lists other members' transactions and opens them for editing | Edits and deletes are refused unless you created the portfolio ("Forbidden") | `apps/web/src/pages/transactions/TransactionsPage.tsx:163`, `packages/api/src/services/holdings/transaction.service.ts:107` |
| F-TXN-002 | Global roles describe contributors/owners as able to write family-shared portfolios | Transaction writes require the portfolio's creator | `packages/api/src/services/holdings/transaction.service.ts:107`, `packages/api/src/services/holdings/portfolio.service.ts:226` |
| F-PORT-005 | **Refresh prices** is shown on any portfolio you can open, including family members' | Refused with "Portfolio not found" unless you created it | `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:125`, `packages/api/src/controllers/assets.controller.ts:80` |
| F-AI-003 | Panel works for a managing user (sessions created as the managed person) | Chat runs as the manager and rejects the session | `apps/web/src/api/aiAssistant.api.ts:118`, `packages/api/src/ai/chatSessions.ts:51` |
<!-- END MISMATCHES -->

## Choices made without asking
| Choice | Alternatives | Why |
|---|---|---|
<!-- BEGIN CHOICES -->
| Background jobs (price feeds, corporate-action application, net-worth snapshot, alert scan) documented as Live features with "Where to find it" pointing to the screens their results reach | Operator-config only | The brief assigns them to B10 and users see their effects |
| Price-feed and corporate-action features filed under Portfolios (PORT) | A separate module | Only the brief's prefixes may be used; they value portfolio holdings |
| Dashboard widgets rendered from other folders (FX strip, tax strip, Gmail cards, export dialog) documented here; Portfolio Score card, family banner, Switch view, managed accounts, desktop download, Gmail banner listed as dependencies | Leave all to owning batches | Brief rule: a feature belongs to the batch whose route renders it, except items the brief or modules.md assigned elsewhere |
| Sign out documented as a control of the header (F-SHELL-005); session refresh/expiry left to B06 | Separate feature | modules.md assigns session handling to B06 |
| Transaction photo endpoints (`/api/transactions/:id/photos`) not documented as a B10 feature | Separate feature | Only Gold pages (B01) call them |
| AI Assistant listed as usable by Free (preview) to Pro; the floating button's disabled-server behaviour documented as a defect | Treat the assistant as operator-only | It is wired end to end and reachable by every user |
<!-- END CHOICES -->

## Audit allow-list
| Literal | Where it appears in source | Why it's not real data |
|---|---|---|
<!-- BEGIN ALLOWLIST -->
<!-- END ALLOWLIST -->
