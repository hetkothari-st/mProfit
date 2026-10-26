---
id: F-LOAN-009
title: "Loan tax benefit panel"
module: "Loans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-LOAN-006]
related: [F-EMI-004, F-LOAN-003]
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# Loan tax benefit panel

`F-LOAN-009` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** For a loan with a **Tax benefit section**, shows **Tax benefit — Section 80C + 24(b)** (home loan) or **Tax benefit — Section 80E** (education loan) with **Principal deduction (80C)** (home only), **Interest deduction (24(b))** or **(80E)**, and **Est. tax saving (30% slab)** for the current financial year.

**Why it exists:** Inferred from behavior: home and education loan repayments reduce income tax; the panel estimates this year's deduction from the loan's own schedule.

**Where to find it:** Loan detail page, below the progress bars (route `/loans/:id`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Set **Tax benefit section** to **80C + 24B (Home loan)** or **80E (Education loan)** in Add/Edit loan.
2. Open the loan. The panel appears with this financial year's figures.

**Controls:** None — display only.

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-LOAN-006](../settings/loans.md#s-loan-006) **Tax benefit section** — **None** hides the panel; **80C + 24B** shows principal (capped ₹1,50,000) and interest (capped ₹2,00,000); **80E** shows all interest, uncapped.

**Results:** Nothing is changed.

**Errors and troubleshooting:** None — the panel is hidden when no section is set.

**Limitations:** The estimate always uses a 30% rate with no cess and ignores the tax regime (the EMI Calculator, [F-EMI-004](F-EMI-004.md), uses your slab, adds 4% cess and gives nothing under the new regime). The figures cover every scheduled EMI dated in the current financial year (1 April – 31 March), paid or not. The ₹1,50,000 80C cap is applied per loan and does not consider your other 80C investments. The panel also appears for closed loans. The 80E eight-year limit is not applied here.

**How it works:** Computed in the loan summary: rows of the schedule dated between 1 April and 31 March of the current Indian financial year are summed; home loan (stored `80C+24B`, or the older `80C_24B`): principal = min(sum, 150000), interest = min(sum, 200000), saving = (principal + interest) × 0.30, rounded half-even to paise; education (`80E`): interest = sum, saving = interest × 0.30.

**Related features:** [F-LOAN-003](F-LOAN-003.md), [F-EMI-004](F-EMI-004.md).

**Sources:** `apps/web/src/pages/loans/LoanDetailPage.tsx:1014`, `apps/web/src/pages/loans/LoanDetailPage.tsx:1038`, `packages/api/src/services/loans/loans.service.ts:56`, `packages/api/src/services/loans/loans.service.ts:577`, `packages/api/src/services/loans/loans.service.ts:603`, `packages/api/src/services/loans/loans.service.ts:616`
