[Index](../INDEX.md)

# EMI Calculator

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **EMI Calculator** (sidebar **Tools → EMI Calculator**, route `/emi`) plans a loan before or while you take it: "Plan a loan: EMI, prepayments, rate changes, fees, tax benefit and offers side by side." It has three tabs — **Calculate**, **Compare**, **Live rates** — and header buttons **Share**, **PDF** and **Excel**. Nothing you type is saved to your account: the whole calculator state lives in the page address so it can be bookmarked or shared. All maths runs in your browser with exact decimal arithmetic; the PDF and Excel files are rebuilt on the server from the same inputs.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-EMI-001](../features/F-EMI-001.md) | Calculate: EMI, maximum loan or tenure | Live | Computes a loan from the inputs you give, in one of three modes: EMI (loan amount + rate + tenure → monthly EMI), Max loan (EMI you can pay … |
| [F-EMI-002](../features/F-EMI-002.md) | Prepayments and rate changes | Live | Under Advanced, adds one-off or yearly Prepayments (month number, amount, Repeat Once / Every year, Effect Cut tenure / Cut EMI) and Rate … |
| [F-EMI-003](../features/F-EMI-003.md) | Processing fee and charges (APR) | Live | With Processing fee and charges switched on, adds a processing fee (% of loan or Fixed Rs.), GST on fee (%) and Other charges (Rs.). |
| [F-EMI-004](../features/F-EMI-004.md) | Tax benefit in the calculator | Live | With Tax benefit switched on, estimates the income-tax saved each financial year for a home or education loan and shows Tax saved, Cost … |
| [F-EMI-005](../features/F-EMI-005.md) | Repayment schedule by financial year | Live | Below the result, Repayment schedule groups every EMI by financial year ("FY 2026-27") with totals for EMI paid, Interest, Principal, … |
| [F-EMI-006](../features/F-EMI-006.md) | Compare loan offers | Live | The Compare tab puts two or three loan offers side by side. |
| [F-EMI-007](../features/F-EMI-007.md) | Live rates | Live | The Live rates tab lists indicative published rates by lender for one Loan type (Home, Car, Two-wheeler, Personal, Education, Gold, Loan … |
| [F-EMI-008](../features/F-EMI-008.md) | Share a calculator link | Live | Share copies a link to the calculator with every input of the Calculate and Compare tabs and the current tab. |
| [F-EMI-009](../features/F-EMI-009.md) | Export the schedule to PDF or Excel | Live | PDF and Excel download the current calculation as emi-schedule.pdf or emi-schedule.xlsx: a summary (loan amount, rate, tenure, EMI, total … |
| [F-EMI-010](../features/F-EMI-010.md) | Daily lender-rate refresh | Live | Every day at 07:30 IST the server reads the published loan rates and MCLR of tracked lenders (SBI, HDFC Bank, ICICI Bank, Axis Bank, Kotak, … |

Settings for this module: [settings/emi-calculator.md](../settings/emi-calculator.md)
