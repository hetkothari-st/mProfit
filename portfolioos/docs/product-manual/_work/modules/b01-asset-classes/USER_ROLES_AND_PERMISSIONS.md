# User Roles and Permissions — B01 Asset classes fragment

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Stocks, Futures & Options, Bonds, FDs & RDs, Gold & Silver, Crypto, NPS, Post Office, Other Assets (batch B01)

## Roles

Definitions are global (see `_work/global/roles.md`). Headings repeated for reference:

### Signed-out visitor <!-- R-VISITOR -->
### Free user <!-- R-FREE -->
### Plus subscriber <!-- R-PLUS -->
### Family subscriber <!-- R-FAMILY -->
### Pro/Advisor subscriber <!-- R-PRO -->
### Administrator <!-- R-ADMIN -->
### Family owner <!-- R-FAMOWNER -->
### Family contributor <!-- R-FAMCONTRIB -->
### Family viewer <!-- R-FAMVIEWER -->
### Managing a family member's account <!-- R-MANAGER -->
### Professional acting for a client <!-- R-PROF -->
### AI chatbot connection <!-- R-AICONN -->
### Succession nominee <!-- R-NOMINEE -->

## Permission matrix

| Page / feature / action | R-VISITOR | R-FREE | R-PLUS | R-FAMILY | R-PRO | R-ADMIN | R-FAMOWNER | R-FAMCONTRIB | R-FAMVIEWER | R-MANAGER | R-PROF | R-AICONN | R-NOMINEE | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
<!-- BEGIN MATRIX -->
| View asset-class pages: Stocks, Bonds, FDs & RDs, Gold & Silver, Crypto, NPS, Post Office, Others (F-STOCK-001, F-BOND-001, F-FD-001, F-GOLD-001, F-CRYPTO-001, F-NPS-001, F-PO-001, F-OTHER-001) | Denied (to /login) | Allowed | Allowed | Allowed | Allowed | Per own plan | Family view data | Family view data within caps | Family view data within caps | Managed person's data | n/a (uses Client books) | Denied | Denied | apps/web/src/components/layout/ProtectedRoute.tsx:13; packages/api/src/routes/transactions.routes.ts:22 |
| Add / edit / delete entries on those pages (F-STOCK-002, F-BOND-002, F-FD-003, F-GOLD-003, F-CRYPTO-002, F-NPS-002, F-PO-002, F-OTHER-002, F-FD-005, F-PO-004) | Denied | Own portfolios | Own portfolios | Own portfolios | Own portfolios | Own portfolios | Own portfolios only | Own portfolios only | Own portfolios only | Managed person's portfolios | n/a | Denied | Denied | packages/api/src/services/holdings/transaction.service.ts:107 |
| Entry photos upload / view / delete (F-GOLD-003, F-GOLD-004) | Denied | Own transactions | Own transactions | Own transactions | Own transactions | Own transactions | Same as base plan | Same as base plan | Same as base plan | Managed person's | n/a | Denied | Denied | packages/api/src/controllers/transactionPhotos.controller.ts:63 |
| Refresh stock prices (F-STOCK-003) | Denied | Allowed (re-prices all users) | Allowed | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Allowed | n/a | Denied | Denied | packages/api/src/routes/assets.routes.ts:42 |
| Live gold/silver and crypto prices (F-GOLD-002, F-CRYPTO-001) | Denied | Allowed | Allowed | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Allowed | n/a | Denied | Denied | packages/api/src/routes/assets.routes.ts:29 |
| F&O positions, trades, P&L, summary, live refresh (F-FNO-001 … F-FNO-004, F-FNO-006) | Denied | Own positions | Own positions | Own positions | Own positions | Own positions | Own only (no family view) | Own only | Own only | Managed person's | n/a | Denied | Denied | packages/api/src/controllers/fo.controller.ts:30; packages/api/src/controllers/fo.controller.ts:79 |
| F&O recompute, broker sync, expiry approve/reject (F-FNO-005, F-FNO-007, F-FNO-009) | Denied | Own portfolios | Own portfolios | Own portfolios | Own portfolios | Own portfolios | Own only | Own only | Own only | Managed person's | n/a | Denied | Denied | packages/api/src/controllers/fo.controller.ts:20 |
| Broker credentials connect / login / disconnect (F-FNO-008) | Denied (callback is public, bound to a random state) | Own credentials | Own credentials | Own credentials | Own credentials | Own credentials | Same as base plan | Same as base plan | Same as base plan | Managed person's | n/a | Denied | Denied | packages/api/src/routes/fo.routes.ts:36; packages/api/src/routes/fo.routes.ts:39 |
| Deposit / Post Office / F&O expiry alerts (F-FD-007, F-PO-006, F-FNO-005) | n/a | Own alerts | Own alerts | Own alerts | Own alerts | Own alerts | Owner of the portfolio gets them | Owner of the portfolio gets them | Owner of the portfolio gets them | Managed person gets them | n/a | n/a | n/a | packages/api/src/jobs/alertJobs.ts:36 |
| Manual sync endpoints under /api/assets (F-ASSET-001, backend-only) | Denied | Allowed (platform-wide) | Allowed | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Allowed | n/a | Denied | Denied | packages/api/src/routes/assets.routes.ts:29 |
<!-- END MATRIX -->

Legend: Allowed · Denied · Conditional (see note) · "Own portfolios" = the server only accepts portfolios whose owner is the caller.

## Notes and mismatches
<!-- BEGIN ROLE-NOTES -->
- No B01 page or endpoint is plan-gated: every signed-in plan has the same access. The only plan-gated F&O item is the Schedule 43 report (D-ASSET-010).
- Writes check `portfolio.userId === caller`, so in family view an owner or contributor cannot add entries to a family-shared portfolio created by someone else, although the global role notes say contributors can write family-shared portfolios (`packages/api/src/services/holdings/transaction.service.ts:107`). Logged as an ambiguity.
- F&O reads filter by the caller's own user id and ignore family view (`packages/api/src/controllers/fo.controller.ts:30`).
- `POST /api/assets/refresh-prices` and the `/api/assets/sync-*` endpoints need only sign-in, yet act on every user's holdings or on shared price tables (`packages/api/src/routes/assets.routes.ts:42`, `packages/api/src/routes/assets.routes.ts:50`).
- R-ADMIN has no extra power on these pages.
<!-- END ROLE-NOTES -->
