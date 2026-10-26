# User Roles and Permissions — Insurance, PPF & EPF, Forex, Goals, Income, Cash Activity, Accounting (B11)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Insurance, PPF & EPF, Forex, Goals, Income, Cash Activity, Accounting

Role definitions are global (`_work/global/roles.md`); headings are repeated here for traceability. All routes in these modules run `authenticate` and scope every query to the caller's user id (the managed person's id while managing). Only Goals (Plus) and Accounting (Pro/Advisor) are plan-gated. None of these services apply family view.

## Roles
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
<!-- BEGIN MATRIX -->
| Page / feature / action | R-VISITOR | R-FREE | R-PLUS | R-FAMILY | R-PRO | R-ADMIN | R-FAMOWNER | R-FAMCONTRIB | R-FAMVIEWER | R-MANAGER | R-PROF | R-AICONN | R-NOMINEE | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| View and manage insurance policies, premiums, nominees, contacts, claims (F-INS-001 to F-INS-016) | Denied (to /login) | Allowed | Allowed | Allowed | Allowed | Per own plan | Own policies only | Own policies only | Own policies only | Managed person's policies | n/a | Read-only via `list_insurance` | Denied | @@W/components/layout/ProtectedRoute.tsx#<Navigate to="/login"@@, @@A/routes/insurance.routes.ts#insuranceRouter.use(authenticate);@@ |
| Reveal policy number (F-INS-005, 5/min, audited) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Own only | Own only | Own only | Managed person's | n/a | Denied | Denied | @@A/routes/insurance.routes.ts#piiLimiter, asyncHandler(revealPolicyNumberHandler)@@ |
| Insurance Gmail search and documents (F-INS-017, F-INS-018) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Own mailboxes | Own mailboxes | Own mailboxes | Managed person's mailboxes (normally none) | n/a | Denied | Denied | @@A/services/insurance/insuranceGmailFetch.service.ts#where: { id: mailboxId, userId, provider: 'GMAIL_OAUTH', isActive: true },@@ |
| Coverage check, family sheet, help (F-INS-019 to F-INS-021) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Own data | Own data | Own data | Managed person's data | n/a | Denied | Denied | @@A/routes/insurance.routes.ts#insuranceRouter.get('/coverage'@@ |
| PPF & EPF entries and auto-fetch accounts (F-PF-001 to F-PF-008) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Own only | Own only | Own only | Managed person's | n/a | Read-only via `list_retirement_accounts` | Denied | @@A/routes/pf.routes.ts#pfRouter.use(authenticate);@@ |
| Browser extension pairing (F-PF-009) | Denied (pair-complete needs a valid code) | Allowed | Allowed | Allowed | Allowed | Per own plan | Own | Own | Own | Pairs to the managed person | n/a | Denied | Denied | @@A/routes/pf.routes.ts#pfRouter.post('/extension/pair-init'@@ |
| Forex: rates, balances, pairs, LRS (F-FX-001 to F-FX-008) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Own only | Own only | Own only | Managed person's | n/a | Read-only via `list_forex` | Denied | @@A/routes/forex.routes.ts#forexRouter.use(authenticate);@@, @@A/controllers/forex.controller.ts#if (portfolio.userId !== req.user.id) throw new ForbiddenError();@@ |
| Refresh FX rates (app-wide sync) | Denied | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed | n/a | Denied | Denied | @@A/controllers/forex.controller.ts#export async function refreshTicker@@ |
| Goals (F-GOAL-001 to F-GOAL-003) | Denied | Denied (locked card; **New goal** opens but save fails) | Allowed | Allowed | Allowed | Per own plan | Own goals (needs own Plus) | Own goals (needs own Plus) | Own goals (needs own Plus) | Managed person's goals, manager's plan | n/a | Read-only via `list_goals` | Denied | @@A/routes/goals.routes.ts#goalsRouter.use(requireFeature('GOAL_PROJECTIONS'));@@ |
| Income (F-INC-001 to F-INC-003) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Own only | Own only | Own only | Managed person's | n/a | Read-only via `list_income` | Denied | @@A/routes/income.routes.ts#incomeRouter.use(authenticate);@@ |
| Cash Activity (F-CASH-001, F-CASH-002) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Own only | Own only | Own only | Managed person's | n/a | Denied | Denied | @@A/routes/cashflows.routes.ts#cashFlowsRouter.use(authenticate);@@ |
| Accounting and receipts (F-ACCT-001 to F-ACCT-012) | Denied | Denied (locked card) | Denied (locked card) | Denied (locked card) | Allowed | Per own plan | Own books, needs own Pro | Own books, needs own Pro | Own books, needs own Pro | Managed person's books, manager's plan | Client books only through the CA workspace | Denied | Denied | @@A/routes/accounting.routes.ts#accountingRouter.use(requireFeature('ACCOUNTING_MODULE'));@@ |
| Export to Tally (F-ACCT-013) | Denied | Denied (button hidden) | Denied (button hidden) | Denied (button hidden) | Allowed | Per own plan | Needs own Pro | Needs own Pro | Needs own Pro | Manager's plan | Via CA workspace | Denied | Denied | @@A/routes/reports.routes.ts#reportsRouter.get('/download/tally-export', gateAccounting@@ |
<!-- END MATRIX -->

Legend: Allowed · Denied · Conditional (see note). "Per own plan" = an administrator has their plan's access; no admin-only powers exist here.

## Notes and mismatches
<!-- BEGIN ROLE-NOTES -->
- Goals: the **New goal** button sits outside the lock, so a Free user can open **Create goal** and only learns on save ("This feature requires the PLUS plan or higher"). @@W/pages/goals/GoalsPage.tsx#<Plus className="h-4 w-4" /> New goal@@
- Accounting and Goals pages render their content blurred behind the lock for lower plans and still fire their API calls, which return 403.
- **Refresh** on the Forex rates panel lets any signed-in user trigger the app-wide FX sync (no rate limit). @@A/routes/forex.routes.ts#forexRouter.post('/ticker/refresh'@@
- `POST /api/insurance/alerts/trigger` lets any signed-in user create today's premium reminders for themselves; no UI calls it.
- The forex account-number reveal endpoint is not rate-limited or audited, unlike the insurance policy-number reveal.
- `GET /api/epfppf/accounts` returns the encrypted identifier and stored-credential blob to the browser (see DOCUMENTATION_GAPS.md).
- AI connector tools read insurance, retirement accounts, forex, goals, income and tax summary for R-AICONN; `list_goals` reads goals without the Plus gate (the connector itself needs Plus to approve). @@A/services/mcp/tools/planning.tools.ts#name: 'list_goals'@@
<!-- END ROLE-NOTES -->
