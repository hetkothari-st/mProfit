# User Roles and Permissions — B10 core shell

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): App layout and navigation, AI Assistant, Dashboard, Portfolios, Transactions, Bank Accounts, Alerts & Reminders (batch B10)

## Roles

Role definitions are global (`_work/global/roles.md`); headings are copied here for cross-reference.

### Signed-out visitor <!-- R-VISITOR -->
Redirected to `/login` from every page in scope (`apps/web/src/components/layout/ProtectedRoute.tsx:13`).

### Free user <!-- R-FREE -->
1 portfolio; AI Assistant locked preview only (`packages/api/src/ai/rateLimit.ts:44`).

### Plus subscriber <!-- R-PLUS -->
5 portfolios; AI Assistant 100 questions a day.

### Family subscriber <!-- R-FAMILY -->
5 portfolios; AI Assistant 200 questions a day.

### Pro/Advisor subscriber <!-- R-PRO -->
Unlimited portfolios; AI Assistant 500 a day; no upgrade prompts.

### Administrator <!-- R-ADMIN -->
No admin-only powers in this scope; access follows the admin's own plan.

### Family owner <!-- R-FAMOWNER -->
Family view: full family aggregate on Dashboard, Portfolios, Transactions; may edit/delete family-shared portfolios.

### Family contributor <!-- R-FAMCONTRIB -->
Family view: other members' figures filtered by permitted asset classes/categories.

### Family viewer <!-- R-FAMVIEWER -->
Same as contributor in this scope.

### Managing a family member's account <!-- R-MANAGER -->
Data pages act on the managed person's data with the manager's plan; AI Assistant chat fails.

### Professional acting for a client <!-- R-PROF -->
Not applicable in this scope.

### AI chatbot connection <!-- R-AICONN -->
Not applicable in this scope (MCP only).

### Succession nominee <!-- R-NOMINEE -->
Not applicable in this scope.

## Permission matrix

| Page / feature / action | R-VISITOR | R-FREE | R-PLUS | R-FAMILY | R-PRO | R-ADMIN | R-FAMOWNER | R-FAMCONTRIB | R-FAMVIEWER | R-MANAGER | R-PROF | R-AICONN | R-NOMINEE | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
<!-- BEGIN MATRIX -->
| App frame: sidebar, header, theme, Hide values, bell (F-SHELL-001 to F-SHELL-008, F-SHELL-010) | Denied (to /login) | Allowed | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Same as base plan | Allowed (bell counts the managed person's alerts) | n/a | Denied | Denied | `apps/web/src/App.tsx:157`, `apps/web/src/components/layout/ProtectedRoute.tsx:13` |
| Asset-class sidebar order and visibility (F-SHELL-002) | Denied | Allowed | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Same as base plan | Changes the managed person's preferences | n/a | Denied | Denied | `packages/api/src/routes/userPreferences.routes.ts:7` |
| Upgrade button, upgrade card, Dashboard banner (F-SHELL-009, F-DASH-016) | n/a | Shown (banner too) | Shown | Shown | Hidden | By own plan | Same as base plan | Same as base plan | Same as base plan | By session plan | n/a | n/a | n/a | `apps/web/src/components/layout/Header.tsx:114`, `apps/web/src/components/layout/UpgradeSidebarCard.tsx:21`, `apps/web/src/components/dashboard/UpgradeBanner.tsx:23` |
| AI Assistant: ask questions (F-AI-003, F-AI-004) | Denied | One locked preview | 100/day | 200/day | 500/day | By own plan | Same as base plan (answers use family data) | Same as base plan (family data within caps) | Same as base plan (family data within caps) | Fails ("Chat session not found") | n/a | n/a | Denied | `packages/api/src/ai/rateLimit.ts:34`, `packages/api/src/routes/aiAssistant.routes.ts:223`, `apps/web/src/api/aiAssistant.api.ts:118` |
| AI Assistant: notice, chat list, rename, delete (F-AI-002, F-AI-005) | Denied | Allowed (New chat disabled after preview) | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Same as base plan | Acts on the managed person's chats | n/a | n/a | Denied | `packages/api/src/routes/aiAssistant.routes.ts:66`, `packages/api/src/ai/chatSessions.ts:49` |
| AI Assistant when operator has it switched off | n/a | Button shown, panel errors | Button shown, panel errors | Button shown, panel errors | Button shown, panel errors | Same | Same | Same | Same | Same | n/a | n/a | n/a | `packages/api/src/routes/aiAssistant.routes.ts:58` |
| Dashboard view (F-DASH-001 to F-DASH-015) | Denied | Allowed | Allowed | Allowed | Allowed | Same as base plan | Family aggregate, all members in full | Family aggregate; others filtered by caps | Family aggregate; others filtered by caps | Managed person's data | n/a | Denied | Denied | `packages/api/src/services/analytics/dashboard.service.ts:543`, `packages/api/src/services/analytics/dashboard.service.ts:568` |
| Net worth over time (F-DASH-005) | Denied | Own | Own | Own | Own | Own | Own only (not family) | Own only | Own only | Managed person's | n/a | Denied | Denied | `packages/api/src/services/analytics/netWorthHistory.service.ts:51` |
| Dashboard export (F-DASH-015) | Denied | Own | Own | Own | Own | Own | Self or one member (no "whole family") | Self or permitted member | Self or permitted member | Managed person's | n/a | Denied | Denied | `packages/api/src/controllers/reports.controller.ts:520` |
| View portfolios, portfolio detail (F-PORT-001, F-PORT-004) | Denied | Own | Own | Own | Own | Own | + family-shared and members' personal | + family-shared and members' personal | + family-shared and members' personal | Managed person's | n/a | Denied | Denied | `packages/api/src/services/holdings/portfolio.service.ts:77`, `packages/api/src/services/holdings/portfolio.service.ts:251` |
| Create portfolio (F-PORT-002) | Denied | Up to 1 | Up to 5 | Up to 5 | Unlimited | By own plan | Same as base plan | Same as base plan | Same as base plan | Manager's plan limit, counted on the managed person's portfolios | n/a | Denied | Denied | `packages/api/src/controllers/portfolio.controller.ts:55`, `packages/api/src/lib/planLimits.ts:11` |
| Edit / delete portfolio (F-PORT-002, F-PORT-003) | Denied | Own | Own | Own | Own | Own | Own + family-shared | Own only | Own only | Managed person's | n/a | Denied | Denied | `packages/api/src/services/holdings/portfolio.service.ts:219` |
| Refresh portfolio prices (F-PORT-005) | Denied | Own | Own | Own | Own | Own | Own only | Own only | Own only | Managed person's | n/a | Denied | Denied | `packages/api/src/controllers/assets.controller.ts:80` |
| Portfolio groups (F-PORT-006, F-PORT-007) | Denied | Own portfolios | Own portfolios | Own portfolios | Own portfolios | Own | Own only | Own only | Own only | Managed person's | n/a | Denied | Denied | `packages/api/src/services/holdings/portfolioGroup.service.ts:37`, `packages/api/src/services/holdings/portfolioGroup.service.ts:44` |
| View transactions (F-TXN-001) | Denied | Own | Own | Own | Own | Own | + family rows | + family rows within caps | + family rows within caps | Managed person's | n/a | Denied | Denied | `packages/api/src/services/holdings/transaction.service.ts:600` |
| Add / edit / delete transactions (F-TXN-002 to F-TXN-005, F-TXN-007) | Denied | Own portfolios | Own portfolios | Own portfolios | Own portfolios | Own | Only portfolios they created (not other members' shared portfolios) | Only portfolios they created | Only portfolios they created | Managed person's portfolios | n/a | Denied | Denied | `packages/api/src/services/holdings/transaction.service.ts:104` |
| Find and remove duplicates (F-TXN-006) | Denied | Own | Own | Own | Own | Own | Own only | Own only | Own only | Managed person's | n/a | Denied | Denied | `packages/api/src/services/imports/duplicates.service.ts:24` |
| Bank accounts: view, add, edit, delete, balances (F-BANK-001 to F-BANK-004, F-BANK-007, F-BANK-008) | Denied | Own | Own | Own | Own | Own | Own only (not family) | Own only | Own only | Managed person's | n/a | Denied | Denied | `packages/api/src/services/banking/bankAccounts.service.ts:144` |
| Reveal / share full account number (F-BANK-005, F-BANK-006) | Denied | Own, 5 per minute | Own, 5 per minute | Own, 5 per minute | Own, 5 per minute | Own, 5 per minute | Own only | Own only | Own only | Managed person's | n/a | Denied | Denied | `packages/api/src/routes/bankAccounts.routes.ts:38`, `packages/api/src/middleware/rateLimit.ts:196` |
| Alerts: view, mark read, dismiss, new reminder, Scan now (F-ALERT-001 to F-ALERT-004) | Denied | Own | Own | Own | Own | Own | Own only (not family) | Own only | Own only | Managed person's | n/a | Denied | Denied | `packages/api/src/services/notifications/alerts.service.ts:25` |
| Corporate-actions API and market-data sync endpoints (F-PORT-010, F-PORT-011) | Denied | Allowed (no UI) | Allowed (no UI) | Allowed (no UI) | Allowed (no UI) | Allowed (no UI) | Same as base plan | Same as base plan | Same as base plan | Allowed | n/a | Denied | Denied | `packages/api/src/routes/corporateActions.routes.ts:12`, `packages/api/src/routes/assets.routes.ts:29` |
| Background jobs (F-PORT-008, F-PORT-009, F-DASH-018, F-ALERT-005) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `packages/api/src/jobs/priceJobs.ts:64`, `packages/api/src/jobs/alertJobs.ts:25` |
<!-- END MATRIX -->

Legend: Allowed · Denied · Own = only the person's own records · "Same as base plan" = the overlay changes nothing here · n/a = the role cannot reach this.

## Notes and mismatches
<!-- BEGIN ROLE-NOTES -->
- **Family writes to shared portfolios (mismatch with global roles).** roles.md says contributors and owners may write family-shared portfolios, and portfolio edit/delete allows family OWNERs (`packages/api/src/services/holdings/portfolio.service.ts:226`), but transaction create/edit/delete require the caller to be the portfolio's creator (`packages/api/src/services/holdings/transaction.service.ts:107`). In family view the Transactions page opens other members' rows for editing, and saving returns "Forbidden".
- **R-MANAGER and the AI Assistant.** Chat requests use `fetch` with the Authorization and family headers but not `X-Act-As` (`apps/web/src/api/aiAssistant.api.ts:118`), while chat sessions are created through the axios client that adds `X-Act-As` (`apps/web/src/api/client.ts:47`). The chat is then checked against the manager's id and fails with "Chat session not found" (`packages/api/src/ai/chatSessions.ts:51`).
- **Plan shown vs plan enforced.** Upgrade prompts, lock cards and the "N of M portfolios used" badge read the plan in the session token (refreshed at sign-in/refresh), which is the effective plan (`packages/api/src/services/auth/auth.service.ts:65`); the AI quota re-reads the effective plan from the database on every request (`packages/api/src/ai/rateLimit.ts:60`). After an upgrade or expiry the UI can lag the server until the token refreshes.
- **Family view coverage differs by page.** Dashboard, Portfolios and Transactions honour family view; Bank Accounts, Alerts, the net-worth trend and Find duplicates are always personal.
- **Ungated server operations.** Any signed-in caller can trigger global market-data syncs and the corporate-actions sync (`packages/api/src/routes/assets.routes.ts:50`, `packages/api/src/routes/corporateActions.routes.ts:17`); no role check applies.
- **Stale admin comment.** `apps/web/src/components/layout/UpgradeSidebarCard.tsx:15` says admins bypass feature gates; the gates do not bypass admins (`apps/web/src/components/common/LockedFeature.tsx:38`).
<!-- END ROLE-NOTES -->
