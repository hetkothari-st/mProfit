# Documentation Gaps — B01 Asset classes fragment

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Stocks, Futures & Options, Bonds, FDs & RDs, Gold & Silver, Crypto, NPS, Post Office, Other Assets (batch B01)

## Verification limitations
- Code-only run: no page was opened in a browser, so layout, exact rendering of dynamic text and responsive behaviour are not visually verified.
- External services (NSE live quotes, Zerodha/Upstox/Angel One APIs, CoinGecko, gold-api, Yahoo) were not called; behaviour is documented from the code paths only.

## Unverified claims
| ID | Item | What is unknown | Why it couldn't be verified | Suggested owner action |
|---|---|---|---|---|
<!-- BEGIN UNVERIFIED -->
| F-FNO-006 | Live F&O prices | Whether NSE quote-derivative responds from the production host; the UI text itself suspects IP blocking ("host may be IP-blocked") | Needs a live NSE call from the deployed server | Check API logs for `missedKeys` / `sampleHits` during market hours |
| F-FNO-008 | Broker connect/login | End-to-end OAuth with Kite and Upstox and Angel inline login | Needs real broker developer credentials | Test with a sandbox/developer account |
| F-FNO-009 | Sync Kite | Shape of real Kite `/trades` responses and lot-size resolution | Needs a live Kite session | Test on a trading day |
<!-- END UNVERIFIED -->

## Implementation ambiguities and possible defects
| ID | Observation | Evidence (path:line) | Question |
|---|---|---|---|
<!-- BEGIN AMBIGUITIES -->
| F-GOLD-001 | Server values Gold ETF units at the 24K per-gram gold price (an ETF unit is roughly 1/100 g), and values physical gold at 24K whatever the carat and silver at 999 whatever the grade. Dashboard, reports and net worth use these server values; the Gold page uses its own live calculation, and falls back to the server value when an ETF name has no recognised ticker. | `packages/api/src/priceFeeds/router.service.ts:65`, `packages/api/src/services/holdings/holdingsProjection.ts:478`, `apps/web/src/pages/assetClasses/GoldPage.tsx:59`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:176` | Should the server apply carat/purity and ETF NAVs? |
| F-BOND-001 | Simple asset pages add Current value only over holdings that have one but Invested over all, so Bonds, NPS and Others (no price source) always show Current ₹0 and P&L = −Invested (−100%). The Stocks page uses the "carry unpriced at cost" rule instead. | `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:192`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:196`, `apps/web/src/lib/holdingsSummary.ts:33`, `packages/api/src/priceFeeds/router.service.ts:94` | Use `summariseHoldings` on these pages too? |
| F-FD-003 | Amount-only forms save quantity 1, and Withdrawal/Maturity/Redemption remove units first-in-first-out, so any withdrawal or maturity entry deletes one whole earlier entry regardless of amount. An RD "Maturity payout" removes one installment and the RD stays on the page; PO Savings and SCSS withdrawals behave the same. | `apps/web/src/pages/assetClasses/FDFormDialog.tsx:178`, `apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx:301`, `apps/web/src/pages/assetClasses/PostOfficeFormDialog.tsx:123`, `packages/api/src/services/holdings/holdingsProjection.ts:198`, `packages/api/src/services/holdings/holdingsProjection.ts:291` | Should amount-based classes reduce by amount? |
| F-FD-001 | The FD page and both detail pages ask for 500 transactions but the server caps every list at 200; all asset pages therefore see only the newest 200 entries per class, which undercounts RD installments and hides older entries. | `packages/api/src/services/holdings/transaction.service.ts:660`, `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:561`, `apps/web/src/pages/assetClasses/FdDetailPage.tsx:392`, `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:327` | Raise the cap or page through? |
| F-FD-001 | Three different maturity formulas: FD card (simple interest for "At maturity" payout, else compounding by payout frequency on exact months), RD card (monthly compounding although it prints "Interest compounded quarterly" and ignores the chosen compounding), detail page and server (compounding by frequency with At maturity = yearly, on 365.25-day years). | `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:89`, `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:109`, `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:457`, `apps/web/src/lib/depositMath.ts:63`, `packages/api/src/services/holdings/holdingsProjection.ts:47` | Which formula is authoritative? |
| F-FD-003 | **Tenure (months)** in the RD form is never sent to the server; only the maturity date it fills is saved. | `apps/web/src/pages/assetClasses/FDFormDialog.tsx:171` | Intended? |
| F-FD-004 | When no entry matches by account number or name, FD and Post Office detail pages show every entry of that class in the portfolio, so another deposit's entries can appear and "Edit" can open the wrong deposit. | `apps/web/src/pages/assetClasses/FdDetailPage.tsx:448`, `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:375` | — |
| F-FNO-009 | Only **Sync Kite** exists; the server accepts Upstox and Angel One, and the UI can connect them, but nothing in the app calls sync for them. | `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:343`, `packages/api/src/controllers/fo.controller.ts:205` | Add per-broker sync buttons? |
| F-FNO-009 | "Synced — N new trades" counts trades already stored: a duplicate returns the existing row and is still counted. | `packages/api/src/services/fo/foBrokerSync.service.ts:56`, `packages/api/src/services/fo/foBrokerSync.service.ts:97` | — |
| F-FNO-005 | Rejecting an expiry close only marks the job REJECTED; the position stays PENDING_EXPIRY_APPROVAL ("EXPIRY ?") and the job never re-scans it (it only scans OPEN positions expiring today). There is no field to enter a missing settlement price. | `packages/api/src/controllers/fo.controller.ts:268`, `packages/api/src/services/fo/foExpiry.service.ts:37`, `packages/api/src/services/fo/foExpiry.service.ts:101` | — |
| F-STOCK-003 | **Refresh prices** fetches prices for stocks held by all users and re-prices/recomputes every holding in the system on one user's click; `/api/assets/sync-*` endpoints likewise need only sign-in. | `packages/api/src/controllers/assets.controller.ts:88`, `packages/api/src/controllers/assets.controller.ts:89`, `packages/api/src/routes/assets.routes.ts:50` | Restrict to admins or to the caller's holdings? |
| F-FNO-008 | The broker callback page posts its result with target origin `*` and the F&O page accepts `broker_oauth_result` messages without checking the sender's origin. | `packages/api/src/controllers/brokerOauth.controller.ts:160`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1786` | Restrict origins? |
| F-STOCK-001 | Stocks **Download** passes only EQUITY, so ETFs shown on the page are left out of the report. Rows are merged by symbol only, across exchanges. | `apps/web/src/pages/assetClasses/StocksPage.tsx:216`, `apps/web/src/pages/assetClasses/StocksPage.tsx:125` | — |
| F-GOLD-003 | Photo upload failures after saving are swallowed (no message); the 5-photo limit is enforced only in the form (server limits 5 files per request, not per entry). Photo size fallback in code (20 MB) differs from the env default (50 MB). | `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:283`, `packages/api/src/controllers/transactionPhotos.controller.ts:57`, `packages/api/src/controllers/transactionPhotos.controller.ts:15`, `packages/api/src/config/env.ts:58` | — |
| F-GOLD-004 | Gold, Crypto and Post Office detail pages need navigation state; a refresh or shared link redirects to the list (the FD page looks the holding up instead). | `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:321`, `apps/web/src/pages/assetClasses/CryptoDetailPage.tsx:47`, `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:322`, `apps/web/src/pages/assetClasses/FdDetailPage.tsx:370` | — |
| F-CRYPTO-003 | Coin detail lists the coin's transactions from all portfolios while its figures are one portfolio's holding. | `apps/web/src/pages/assetClasses/CryptoDetailPage.tsx:70` | — |
| F-BOND-002 | Asset-class dialogs show the server's 409 duplicate message but, unlike the Transactions form, offer no "record anyway" (allowDuplicate) path. | `packages/api/src/services/holdings/transaction.service.ts:289`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:37`, `apps/web/src/pages/assetClasses/BondFormDialog.tsx:143` | — |
| F-OTHER-002 | Other Assets page includes REAL_ESTATE holdings but the form's Asset Type list has no Real Estate option. | `apps/web/src/pages/assetClasses/OtherAssetsPage.tsx:14`, `apps/web/src/pages/assetClasses/OtherAssetFormDialog.tsx:26` | — |
| F-FNO-010 | `defaultEquityTaxTreatment` is written by the settings endpoint but never read. | `packages/api/src/controllers/fo.controller.ts:283` | Remove or wire up? |
| F-PO-006 | Post Office maturity alerts are per entry (one per RD/SSY installment carrying the maturity date) and still fire after a maturity payout is recorded. | `packages/api/src/services/notifications/alerts.service.ts:279` | Group by account like deposit reminders? |
| F-NPS-001 | Page description promises "PRAN and scheme allocations" but there is no allocation or NAV tracking. | `apps/web/src/pages/assetClasses/NpsPage.tsx:9` | — |
<!-- END AMBIGUITIES -->

## Hidden, partial, backend-only, deprecated features
| ID | Feature | Status | Evidence |
|---|---|---|---|
<!-- BEGIN HIDDEN -->
| F-FNO-009 | Broker sync for Upstox / Angel One | Partial (backend only; UI syncs Zerodha only) | `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:343` |
| F-FNO-010 | F&O portfolio settings (auto-approve expiry close, default equity tax treatment) | Backend-only | `packages/api/src/routes/fo.routes.ts:54` |
| F-FNO-011 | Option chain and margin endpoints | Backend-only (foApi.optionChain / foApi.margin have no caller) | `packages/api/src/routes/fo.routes.ts:45`, `apps/web/src/api/fo.api.ts:93` |
| F-FNO-012 | Underlying Activity panel | Hidden (component defined, never rendered) | `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:844` |
| F-ASSET-001 | /api/assets sync and lookup endpoints | Backend-only (no B01 caller; `amfi/sync` is used by B02, `funds/:id/nav` by onboarding, portfolio refresh by B10) | `packages/api/src/routes/assets.routes.ts:46` |
| F-ASSET-002 | GoldAssetDetailSheet | Hidden (exported, never imported) | `apps/web/src/pages/assetClasses/GoldAssetDetailSheet.tsx:92` |
<!-- END HIDDEN -->

## UI / API permission mismatches
| ID | UI behavior | API behavior | Evidence |
|---|---|---|---|
<!-- BEGIN MISMATCHES -->
| F-FD-003 | In family view the portfolio pickers list family portfolios | Saving to a portfolio not owned by the caller returns "Forbidden", including family-shared portfolios a contributor is said to be able to write | `packages/api/src/services/holdings/transaction.service.ts:107` |
| F-FNO-001 | F&O page uses the same family header as other pages | F&O endpoints filter by the caller's own user id; family view shows only your own F&O | `packages/api/src/controllers/fo.controller.ts:30` |
| F-STOCK-003 | Button reads as refreshing your prices | Endpoint refreshes every user's holdings | `packages/api/src/controllers/assets.controller.ts:89` |
<!-- END MISMATCHES -->

## Choices made without asking
| Choice | Alternatives | Why |
|---|---|---|
<!-- BEGIN CHOICES -->
| One chapter per sidebar page (Stocks, F&O, Bonds, FDs & RDs, Gold & Silver, Crypto, NPS, Post Office, Others) plus a short shared "How asset-class pages work" chapter, with sub-prefixes STOCK, FNO, BOND, FD, GOLD, CRYPTO, NPS, PO, OTHER and ASSET for shared items | One ASSET chapter | Mirrors the navigation |
| Mutual Funds (B02), PPF & EPF and Forex (B11) only as dependencies; shared files PPFNpsFormDialog/EPFFormDialog documented here for NPS only | Document them here | Wave-0 ownership overrides |
| Stock add/edit form documented as dependency D-ASSET-002 (B10) | Document fully here | It is the Transactions module's shared form |
| F-FNO-009 marked Partial | Live | Server supports three brokers, UI syncs one |
| Dead components (GoldAssetDetailSheet, UnderlyingActivity) recorded as Hidden inventory rows | Omit | Traceability |
| R-MANAGER behaviour taken from global roles.md (data routes act on the managed person) without re-tracing authenticate | Re-trace | Owned by B03/global |
<!-- END CHOICES -->

## Audit allow-list
| Literal | Where it appears in source | Why it's not real data |
|---|---|---|
<!-- BEGIN ALLOWLIST -->
<!-- END ALLOWLIST -->

No allow-listed literals were needed.
