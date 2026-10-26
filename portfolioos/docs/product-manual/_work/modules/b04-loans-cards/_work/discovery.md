# B04 discovery — Loans, EMI Calculator, Credit Cards

Source commit 9d9025c4 (includes PR #296 loans fixes). Code-only.

## Routes (apps/web/src/App.tsx:234-253)
- /loans → pages/loans/LoanListPage (taken + LoansGivenSection), ?view=given
- /loans/:id → pages/loans/LoanDetailPage
- /loans/given/:id → pages/loans/given/LoanGivenDetailPage
- /emi → pages/emi/EmiCalculatorPage (tabs calculate/compare/rates via ?tab)
- /credit-cards → pages/creditCards/CreditCardListPage
- /credit-cards/:id → pages/creditCards/CreditCardDetailPage
Nav: navItems.tsx:73-74 (Asset Classes), :118 (Tools → EMI Calculator).

## Backend
- /api/loans (loans.routes.ts), /api/loans-given, /api/emi/export, /api/loan-rates, /api/admin/loan-rates (B06 page), /api/credit-cards
- services/loans/{loans,loansGiven}.service.ts, loanChecks/*, loanRates/*, emi/emiExport.ts; services/banking/creditCards.service.ts
- shared math: packages/shared/src/loans/*
- Jobs: alertJobs 20:45 IST (EMI, loan-given, card reminders, runAsUser); loanRatesJob 07:30 IST → loanChecksJob (refinance/benchmark, runAsSystem + runAsUser)

## Checklist
- [x] Loans taken (F-LOAN-001..015)
- [x] Loans given (F-LOAN-016..022)
- [x] EMI Calculator (F-EMI-001..010)
- [x] Credit Cards (F-CARD-001..007)
- [x] Settings S-LOAN-001..010, S-EMI-001..011, S-CARD-001..004
- [x] Roles matrix, workflows, gaps
