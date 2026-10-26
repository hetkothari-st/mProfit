# User Roles and Permissions — Loans, EMI Calculator, Credit Cards (B04)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Loans, EMI Calculator, Credit Cards

Role definitions are global (see `_work/global/roles.md`); headings are repeated here for traceability. Nothing in these modules is plan-gated: every route runs only `authenticate`, and every service query filters by the caller's user id (`packages/api/src/routes/loans.routes.ts:21`, `packages/api/src/routes/loansGiven.routes.ts:19`, `packages/api/src/routes/creditCards.routes.ts:19`, `packages/api/src/routes/emi.routes.ts:8`, `packages/api/src/routes/loanRates.routes.ts:8`).

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
| Page / feature / action | R-VISITOR | R-FREE | R-PLUS | R-FAMILY | R-PRO | R-ADMIN | R-FAMOWNER | R-FAMCONTRIB | R-FAMVIEWER | R-MANAGER | R-PROF | R-AICONN | R-NOMINEE | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
<!-- BEGIN MATRIX -->
| View loans taken, loan pages, schedule, tax panel, market check (F-LOAN-001–F-LOAN-011) | Denied (to /login) | Allowed | Allowed | Allowed | Allowed | Per own plan | Own loans only (family view not applied) | Own loans only | Own loans only | Managed person's loans | n/a (client loans only via /ca within grant) | Read-only via `list_loans` tool | Denied | `apps/web/src/components/layout/ProtectedRoute.tsx:13`, `packages/api/src/controllers/loans.controller.ts:79` |
| Add / edit / delete loans taken, record and delete payments, Mark paid / Undo (F-LOAN-003, F-LOAN-004, F-LOAN-006–F-LOAN-008) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Own loans only | Own loans only | Own loans only | Writes to managed person's loans | n/a | Denied | Denied | `packages/api/src/services/loans/loans.service.ts:759`, `packages/api/src/services/loans/loans.service.ts:870` |
| Reveal loan account number (F-LOAN-014, API only, 5/min) | Denied | Allowed (no UI) | Allowed (no UI) | Allowed (no UI) | Allowed (no UI) | Per own plan | Own only | Own only | Own only | Managed person's | n/a | Denied | Denied | `packages/api/src/routes/loans.routes.ts:44` |
| EMI and money-lent reminders (F-LOAN-012, F-LOAN-022) | n/a | Created for own loans | Created for own loans | Created for own loans | Created for own loans | Per own plan | Same as base plan | Same as base plan | Same as base plan | Created for the managed person | n/a | Alerts readable via overview tools | n/a | `packages/api/src/jobs/alertJobs.ts:36` |
| Refinance and benchmark alerts (F-LOAN-013) | n/a | Allowed when opted in | Allowed when opted in | Allowed when opted in | Allowed when opted in | Per own plan | Same as base plan | Same as base plan | Same as base plan | Managed profiles included | n/a | n/a | n/a | `packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:93` |
| Loans given: view, lend, entries, schedule, settle/write off/reopen/delete (F-LOAN-016–F-LOAN-021) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Own only | Own only | Own only | Managed person's | n/a | Read-only via `list_loans_given` tool | Denied | `packages/api/src/services/loans/loansGiven.service.ts:429` |
| EMI Calculator: Calculate, Compare, Share (F-EMI-001–F-EMI-006, F-EMI-008) | Denied (to /login) | Allowed | Allowed | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Allowed | n/a | Denied | Denied | `apps/web/src/components/layout/ProtectedRoute.tsx:13` |
| EMI export PDF / Excel (F-EMI-009) | Denied | Allowed (10/min) | Allowed (10/min) | Allowed (10/min) | Allowed (10/min) | Allowed (10/min) | Same as base plan | Same as base plan | Same as base plan | Allowed | n/a | Denied | Denied | `packages/api/src/routes/emi.routes.ts:9`, `packages/api/src/middleware/rateLimit.ts:219` |
| Live rates read (F-EMI-007) | Denied | Allowed | Allowed | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Allowed | n/a | Denied | Denied | `packages/api/src/routes/loanRates.routes.ts:8` |
| Manage lender rates (D-EMI-001) | Denied | Denied | Denied | Denied | Denied | Allowed (two-factor session required) | n/a | n/a | n/a | Denied | Denied | Denied | Denied | `packages/api/src/routes/adminLoanRates.routes.ts:17` |
| Credit cards: view, add, edit, delete, statements (F-CARD-001–F-CARD-003, F-CARD-005, F-CARD-006) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Own cards only (family view not applied) | Own cards only | Own cards only | Managed person's cards | n/a (client cards only via /ca within grant) | Read-only via `list_credit_cards` tool | Denied | `packages/api/src/controllers/creditCards.controller.ts:64`, `packages/api/src/services/banking/creditCards.service.ts:327` |
| Reveal card number (F-CARD-004, 5/min, audited) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Own only | Own only | Own only | Managed person's (audit row on that person) | n/a | Denied | Denied | `packages/api/src/routes/creditCards.routes.ts:32`, `packages/api/src/services/banking/creditCards.service.ts:270` |
<!-- END MATRIX -->

Legend: Allowed · Denied · Conditional (see note)

## Notes and mismatches
<!-- BEGIN ROLE-NOTES -->
- No plan, role or two-factor check applies anywhere in Loans, EMI Calculator or Credit Cards; the only server guard is `authenticate` plus per-user filtering in each service (and Postgres row-level security behind it).
- Family view (`X-Viewing-As-Family`) is not read by these controllers, so owners, contributors and viewers all see only their own loans and cards on these pages; household totals are on the family dashboard (B03).
- When managing a family member's account (R-MANAGER), the card-number reveal writes its `pii_view` audit row with the managed person's user id (`req.user.id`), not the manager's (`packages/api/src/services/banking/creditCards.service.ts:270`); the loan account reveal does the same via `writeAuditLog({ userId: req.user.id })` (`packages/api/src/controllers/loans.controller.ts:166`). Whether the audit should name the actor is a question for B06/B03.
- The daily alert scan lists every user without filtering inactive or deletion-scheduled accounts (`packages/api/src/jobs/alertJobs.ts:15`), whereas the loan checks exclude them (`packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:104`).
- Administrators get no extra power on these pages; their only related tool is the lender-rates admin page (B06), which requires a two-factor session.
<!-- END ROLE-NOTES -->
