# B10 discovery notes — core shell

Source commit 9d9025c4 · code-only · worktree `C:\Users\ST269\Desktop\mProfit-loans-fix-wt\portfolioos`.

## Routes owned (modules.md #15, 16, 18–20, 29, 84, 85, 106)
- `/` → redirect `/dashboard` (apps/web/src/App.tsx:164)
- `/dashboard` DashboardPage (apps/web/src/pages/dashboard/DashboardPage.tsx)
- `/portfolios`, `/portfolios/:id`, `/portfolio-groups/:id` (pages/portfolios)
- `/transactions` (pages/transactions)
- `/bank-accounts`, `/bank-accounts/:id` (pages/bankAccounts)
- `/alerts` (pages/alerts)

## Extra scope (brief)
Shell: AppShell, Header, Sidebar/SidebarNav/navItems/AssetClassSectionList/SortableAssetClassItem/PlanningNavGroup, MobileTabBar/MobileNavDrawer, UpgradeSidebarCard, LockedFeature, ErrorBoundary, theme/privacy stores, swipe hook. AI assistant (components/ai, hooks/useAIAssistant, routes/aiAssistant.routes.ts, packages/api/src/ai/*). Jobs: priceJobs, corporateActionApplyJob, netWorthSnapshotJob, alertJobs. Backend-only `/api/corporate-actions`. Dead `pages/PlaceholderPage.tsx`.

## Backend traced
- dashboard.routes → services/analytics/dashboard.service.ts (net worth, alerts, liabilities, allocation; family merge)
- intelligence.routes `/net-worth/history` → netWorthHistory.service.ts (snapshots)
- portfolios.routes / portfolio.controller / services/holdings/portfolio.service.ts; portfolioGroups.routes / portfolioGroup.service.ts; lib/planLimits.ts
- transactions.routes / transaction.controller / services/holdings/transaction.service.ts; services/imports/duplicates.service.ts + duplicateMatch.ts
- bankAccounts.routes / controller / services/banking/bankAccounts.service.ts + ifscLookup.service.ts (Razorpay IFSC API, in-process cache, 5 s timeout)
- alerts.routes / controller / services/notifications/alerts.service.ts; jobs/alertJobs.ts 20:45 IST
- assets.routes refresh-prices endpoints; priceJobs schedule
- userPreferences.routes (sidebar asset sections) / services/account/userPreferences.service.ts
- aiAssistant.routes, ai/rateLimit.ts (UTC-midnight reset), ai/chatSessions.ts (title 60 chars), ai/aiDisclosure.ts (AuditLog), claudeClient (3 tool rounds, 2048 tokens)

## Progress
- [x] Shell  - [x] AI  - [x] Dashboard  - [x] Portfolios  - [x] Transactions  - [x] Bank  - [x] Alerts  - [x] Jobs
- Exhaustiveness: controls grepped per component; each mapped to a feature Controls table.

## Confirmed defects (see DOCUMENTATION_GAPS AMBIGUITIES)
/holdings link 404; pie/trio visibility mapping; family merge numericValue; trend chart & balance chart ignore Hide values; Scan now count; AI ActionCard dead button; AI chat ignores X-Act-As; dashboard XIRR average; trade-date error not shown; stale cache keys after txn save; createTransaction skips CG persist; owned property/bank balances not in net worth; AI button visible when disabled; global sync endpoints ungated; tax strip red state unreachable; Customer ID required only in UI; edit resets balance source; group today's change stocks only; transaction writes creator-only.
