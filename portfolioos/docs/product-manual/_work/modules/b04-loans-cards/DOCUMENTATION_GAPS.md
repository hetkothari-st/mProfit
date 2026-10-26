# Documentation Gaps — Loans, EMI Calculator, Credit Cards (B04)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Loans, EMI Calculator, Credit Cards

## Verification limitations
- UI not visually verified: this run was code-only. Labels, messages and layout come from source; chart rendering, card art and responsive layouts were not seen.
- Lender-rate scraping (F-EMI-010) and the loan checks (F-LOAN-013) depend on live third-party web pages and production data; their actual output was not observed.

## Unverified claims
| ID | Item | What is unknown | Why it couldn't be verified | Suggested owner action |
|---|---|---|---|---|
<!-- BEGIN UNVERIFIED -->
| F-EMI-010 | Which lender/loan-type pairs actually produce readings in production | Page readers may fail or be stale; MANUAL sources depend on administrator entries | Runtime and third-party pages only | Check `/settings/loan-rates` and IngestionFailure rows |
| F-EMI-007 | Live rates content | Which lenders appear for each loan type today | Depends on F-EMI-010 output | Same as above |
| F-LOAN-013 | Refinance / benchmark alerts actually fire | Depends on benchmark rows (repo, MCLR) being recorded and on market rates existing | Runtime only | Check job logs `[cron] loan checks done` |
| D-LOAN-006 | Proof & documents vault behaviour on loans given | Upload limits and storage | Owned by the documents component, not traced here | Documents batch to confirm |
<!-- END UNVERIFIED -->

## Implementation ambiguities and possible defects
| ID | Observation | Evidence (path:line) | Question |
|---|---|---|---|
<!-- BEGIN AMBIGUITIES -->
| F-CARD-006 | Defect: a card's `outstandingBalance` is only ever overwritten with the amount of the latest non-paid statement added; marking a statement paid or deleting it never reduces it, and the web form has no outstanding field. Utilisation, the summary strip, dashboard card liability and the AI connector therefore stay high after payment | `packages/api/src/services/banking/creditCards.service.ts:308`, `packages/api/src/services/banking/creditCards.service.ts:346`, `packages/api/src/services/banking/creditCards.service.ts:364` | Should outstanding be derived from unpaid statements (statement − paid)? |
| F-LOAN-001 | Inconsistency: the dashboard/sidebar/will estate use `loanPosition` (opening balance of the earliest unpaid row, past rows included) while the Loans page uses `computeLoanSummary` (first unpaid row dated today or later). A loan added mid-tenure with earlier EMIs unmarked shows near-full principal on the dashboard but the scheduled balance on the Loans page | `packages/api/src/services/loans/loans.service.ts:427`, `packages/api/src/services/loans/loans.service.ts:493`, `packages/api/src/services/analytics/dashboard.service.ts:272` | Which definition is intended? |
| F-LOAN-009 | The loan tax panel always uses 30% with no 4% cess and ignores regime and the 80E 8-year limit; the EMI Calculator for the same loan uses slab × 1.04, regime and 8 years — two different "tax saved" figures for one loan | `packages/api/src/services/loans/loans.service.ts:607`, `packages/shared/src/loans/emiTax.ts:21` | Align the panel with the calculator's tax engine? |
| F-LOAN-002 | Loans with status **Default** are listed under "Closed / Foreclosed", counted as "Closed" in the overview, shown with their original amount, and excluded from dashboard liabilities (ACTIVE-only filter) — a defaulted debt disappears from net worth | `apps/web/src/pages/loans/LoanListPage.tsx:650`, `apps/web/src/pages/loans/LoanListPage.tsx:827`, `packages/api/src/services/analytics/dashboard.service.ts:240` | Should a defaulted loan stay a liability? |
| F-LOAN-012 | EMI and card reminder descriptions format money with Western 3-digit grouping and ISO dates ("₹1,234,567.00 due on 2026-11-05"), unlike the rest of the app (Indian grouping, dd/mm/yyyy); loan-given reminders use dd/mm/yyyy but the same Western grouping | `packages/api/src/services/loans/loans.service.ts:994`, `packages/api/src/services/banking/creditCards.service.ts:486`, `packages/api/src/services/loans/loansGiven.service.ts:717` | Use the shared Indian formatter? |
| F-LOAN-011 | `vehicleId` / `rentalPropertyId` are accepted by the loans API and rendered as linked cards, but no web form sets them | `packages/api/src/controllers/loans.controller.ts:44`, `apps/web/src/pages/loans/LoanDetailPage.tsx:1221` | Add a link picker or drop the cards? |
| F-LOAN-003 | Loan forms show the server's rejection only as the axios text ("Request failed with status code 422") because they read `error.message` instead of `apiErrorMessage`; the Zod message (for example "Expected positive decimal string") never reaches the user | `apps/web/src/pages/loans/LoanListPage.tsx:587`, `apps/web/src/pages/loans/LoanDetailPage.tsx:231`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:172` | Switch to `apiErrorMessage`? |
| F-LOAN-019 | **Remove entry** on a loan given deletes immediately with no confirmation, unlike every other delete in the module | `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:622` | Add a confirm step? |
| F-LOAN-021 | **Mark settled** neither checks nor zeroes the balance, so a settled flexible loan keeps showing "Still owed" on its card | `packages/api/src/services/loans/loansGiven.service.ts:630` | Intended? |
| F-CARD-006 | Statement changes on the card page invalidate only the card-page caches, not `credit-cards`, so the list shows old figures for up to the 30 s stale time | `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:117`, `apps/web/src/main.tsx:44` | Also invalidate the list key? |
| F-CARD-002 | A saved full card number cannot be removed from the UI (an empty field means "keep"); the API supports clearing with null/blank | `apps/web/src/pages/creditCards/CreditCardListPage.tsx:405`, `packages/api/src/services/banking/creditCards.service.ts:198` | Add a "remove saved number" control? |
| F-CARD-005 | **Next due** on the card page ignores Overdue statements (Pending/Partial only, due ≥ today) while the list's **Payment due** includes them | `packages/api/src/services/banking/creditCards.service.ts:400`, `apps/web/src/lib/creditCardDue.ts:28` | Should overdue bills show as next due? |
| F-LOAN-006 | The detail-page Edit dialog omits borrower, account number, dates and prepayment option, so those can only be changed from the list page | `apps/web/src/pages/loans/LoanDetailPage.tsx:263` | Intended? |
| — | Role/access: R-MANAGER reveals are audited under the managed person's id, not the acting manager | `packages/api/src/services/banking/creditCards.service.ts:270`, `packages/api/src/controllers/loans.controller.ts:166` | Should audit rows carry the actor? |
| — | Module distinction not covered by global roles: none found (no plan or role gate in these modules) | `packages/api/src/routes/loans.routes.ts:21` | — |
<!-- END AMBIGUITIES -->

## Hidden, partial, backend-only, deprecated features
| ID | Feature | Status | Evidence |
|---|---|---|---|
<!-- BEGIN HIDDEN -->
| F-LOAN-011 | Linked vehicle / property cards | Partial — rendering exists, no UI sets the link | `apps/web/src/pages/loans/LoanDetailPage.tsx:1221` |
| F-LOAN-014 | Loan account number reveal (`POST /api/loans/:id/reveal-account`) | Backend-only — no web caller | `packages/api/src/routes/loans.routes.ts:44` |
| F-LOAN-015 | Compute EMI (`GET /api/loans/compute-emi`) | Backend-only — the web computes EMI locally | `packages/api/src/routes/loans.routes.ts:24` |
| — | Card `outstandingBalance` field on create/update | Backend-only input — accepted by the API, never sent by the web | `packages/api/src/controllers/creditCards.controller.ts:33` |
| — | Statement `paidAmount` / `paidOn` / `status` / `canonicalEventId` on create, loan payment `canonicalEventId`, loan `closedDate` / `lenderMatchKey` | Backend-only inputs — no web form sends them | `packages/api/src/controllers/creditCards.controller.ts:48`, `packages/api/src/controllers/loans.controller.ts:49` |
<!-- END HIDDEN -->

## UI / API permission mismatches
| ID | UI behavior | API behavior | Evidence |
|---|---|---|---|
<!-- BEGIN MISMATCHES -->
| F-CARD-002 | Status offers Active / Blocked / Closed | API also accepts `INACTIVE`, which the list treats as not active | `apps/web/src/pages/creditCards/CreditCardListPage.tsx:546`, `packages/api/src/services/banking/creditCards.service.ts:26` |
<!-- END MISMATCHES -->

## Choices made without asking
| Choice | Alternatives | Why |
|---|---|---|
<!-- BEGIN CHOICES -->
| Three modules: Loans (taken + given share one page and the LOAN prefix), EMI Calculator, Credit Cards | Separate "Loans given" module | Loans given render inside the `/loans` route and the brief assigns LOAN/EMI/CARD |
| Documented the daily rate refresh (F-EMI-010) and loan checks (F-LOAN-013) here; the admin rate page is D-EMI-001 (B06) | Leave jobs to B06 | Their only user-visible effect is in these modules |
| Documented **Loan rate alerts** as a dependency (D-LOAN-002), not an S- setting | Own S- ID | The control lives on B06's Settings page |
| Gave the per-visit switching-cost fields an S- ID (S-LOAN-009) | Treat as plain fields | They change computed results and defaults matter |
| Marked F-LOAN-013, F-EMI-007, F-EMI-010 doc status Gaps | Verified | Behaviour depends on live third-party pages and production data |
| Documented the Loans page as reflecting PR #296 (commit fce9d649): Default stamp, overdue EMI alerts, foreclosure close/reopen, edit/undo fixes | — | Brief instruction |
<!-- END CHOICES -->

## Audit allow-list
| Literal | Where it appears in source | Why it's not real data |
|---|---|---|
<!-- BEGIN ALLOWLIST -->
<!-- END ALLOWLIST -->
