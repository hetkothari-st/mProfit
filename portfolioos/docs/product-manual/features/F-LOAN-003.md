---
id: F-LOAN-003
title: "Add or edit a loan (full form)"
module: "Loans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-LOAN-001, S-LOAN-002, S-LOAN-003, S-LOAN-004, S-LOAN-005, S-LOAN-006, S-LOAN-007, S-LOAN-008]
related: [F-LOAN-005, F-LOAN-006, F-LOAN-007, F-LOAN-009, F-LOAN-010, F-LOAN-011, F-LOAN-012, F-LOAN-013]
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# Add or edit a loan (full form)

`F-LOAN-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Opens the **Add loan** (or **Edit loan**) dialog to record a loan you have taken: lender, loan type, borrower, account number, principal, rate, tenure, EMI (with a calculator button that fills it in), prepayment option, rate type and benchmark, disbursement and first EMI dates, tax benefit section, status and portfolio.

**Why it exists:** Inferred from behavior: every computed figure (schedule, outstanding, tax benefit, market comparison, reminders) is derived from these terms, so they are captured once here.

**Where to find it:** **Asset Classes → Loans → Add loan** (or **Add first loan**), or the pencil on a loan card (route `/loans`). The onboarding wizard's quick-add also creates loans ([D-LOAN-007](../dependencies.md#d-loan-007)).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click **Add loan**. The **Add loan** dialog opens with loan type **Home**, prepayment option **Reduce tenure**, rate type **Not sure**, tax benefit **None** and status **Active**.
2. Search or pick the lender in **Lender name**.
3. Fill **Borrower name**, **Principal amount (₹)**, **Interest rate (% p.a.)** and **Tenure (months)**.
4. Type the **EMI amount (₹)** from your loan papers, or click the calculator button ("Auto-calculate") to fill the standard EMI for the principal, rate and tenure.
5. Pick the **Disbursement date** and **First EMI date**.
6. Optionally set **Rate type** (and for **Floating**, **Linked to** and **Next rate reset (optional)**), **Tax benefit section**, **Status** and **Portfolio**.
7. Click **Save**. The toast "Loan added" (or "Loan updated") appears and the list refreshes.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Calculator button (title "Auto-calculate") | Button | Fills **EMI amount** from principal, rate and tenure | Does nothing if any of the three is not a number |
| **Cancel** | Button | Closes without saving | Never |
| **Save** | Button | Validates and saves; label becomes "Saving…" | Disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Lender name \*** | Search / pick (bank list or free text) | Yes | 1–200 characters (server) | Empty | "Required" |
| **Loan type** | Select: Home, Car, Personal, Education, Business, Gold, LAS, Other | No | — | Home | — |
| **Borrower name \*** | Text | Yes | 1–200 characters | Empty | "Required" |
| **Account number** | Text | No | Up to 100 characters; stored encrypted | Empty (edit shows "••••" + last 4) | — |
| **Principal amount (₹) \*** | Text | Yes | Plain positive number, no commas (server: digits with optional decimals) | Empty | "Required" |
| **Interest rate (% p.a.) \*** | Text | Yes | Plain positive number | Empty | "Required" |
| **Tenure (months) \*** | Number | Yes | Whole number 1–600 (server) | Empty | "Required" |
| **EMI amount (₹) \*** | Text | Yes | Plain positive number | Empty | "Required" |
| **Prepayment option** | Select | No | Reduce tenure / Reduce EMI | Reduce tenure | — |
| **Rate type** | Select | No | Fixed / Floating / Not sure | Not sure | "A benchmark and a reset date apply to floating-rate loans only" (server, only if sent for a non-floating loan) |
| **Linked to** | Select (Floating only) | No | Not set / Repo rate (EBLR) / MCLR / Other / not sure | Not set | — |
| **Next rate reset (optional)** | Date (Floating only) | No | A real calendar date | Empty | "Not a real date" (server) |
| **Disbursement date \*** | Date | Yes | YYYY-MM-DD | Empty | "Required" |
| **First EMI date \*** | Date | Yes | YYYY-MM-DD; its day of month becomes the EMI due day | Empty | "Required" |
| **Tax benefit section** | Select | No | None / 80C + 24B (Home loan) / 80E (Education loan) | None | — |
| **Status** | Select | No | Active / Closed / Foreclosed / Default | Active | — |
| **Portfolio** | Portfolio picker | No | Any of your portfolios | None | — |

**Settings and toggles here:** [S-LOAN-001](../settings/loans.md#s-loan-001) **Loan type** — selects market comparison and alert wording; [S-LOAN-002](../settings/loans.md#s-loan-002) **Prepayment option** — **Reduce tenure** keeps the EMI and shortens the schedule, **Reduce EMI** keeps the end date and lowers the EMI after each prepayment; [S-LOAN-003](../settings/loans.md#s-loan-003) **Rate type**, [S-LOAN-004](../settings/loans.md#s-loan-004) **Linked to**, [S-LOAN-005](../settings/loans.md#s-loan-005) **Next rate reset (optional)** — decide whether the loan gets repo/MCLR change alerts and when the next reset is estimated; [S-LOAN-006](../settings/loans.md#s-loan-006) **Tax benefit section** — turns on the tax benefit panel ([F-LOAN-009](F-LOAN-009.md)); [S-LOAN-007](../settings/loans.md#s-loan-007) **Status** — only **Active** loans get a schedule-based outstanding, reminders and the market comparison; [S-LOAN-008](../settings/loans.md#s-loan-008) **Portfolio** — stored with the loan; no page in this module groups loans by it. Full detail: Settings reference.

**Results:** A loan row is created (or updated). The list, the loan's summary and schedule, the dashboard liabilities and the next daily reminder scans use the new terms. Changing the first EMI date also changes the stored EMI due day.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Field turns red with "Required" | A required field is empty or not a number | Fill it |
| Toast "Failed to add loan" / "Failed to update loan" and a red line such as "Request failed with status code 422" | The server rejected the data (for example commas in an amount, tenure above 600, or a text that is not a positive number) | Type plain numbers without commas or ₹; keep tenure 1–600 |
| Toast "Failed to update loan" when editing a loan you cannot see any more | The loan was deleted or belongs to someone else (404) | Reload the list |

**Limitations:** Amounts must be typed without commas or the ₹ sign — the client accepts them as numbers only if they parse, and the server accepts only digits with an optional decimal part. The dialog shows the server's reason only as the generic HTTP message. The account number is masked in the edit form; leaving the masked value unchanged keeps the saved number, clearing the box removes it, typing a new number replaces it. The form cannot link a vehicle or rental property to the loan (see [F-LOAN-011](F-LOAN-011.md)). Setting **Status** to **Closed** or **Foreclosed** here does not record a closing date (only a recorded foreclosure payment does, [F-LOAN-007](F-LOAN-007.md)).

**How it works:** `POST /api/loans` (create) or `PATCH /api/loans/:id` (edit). The server validates with a schema (lender and borrower 1–200 characters, amounts as positive decimal strings, tenure integer 1–600, dates `YYYY-MM-DD`, enumerated loan type, prepayment option, status, rate type and benchmark), sets `emiDueDay` to the day of the first EMI date, and encrypts the account number (keeping its last four digits for display). A masked value (containing "•") is treated as "unchanged". Rate fields: a benchmark or reset date is refused unless the loan is (or is becoming) **Floating**; switching a loan away from Floating clears both. The calculator button uses EMI = P × r × (1+r)^n ÷ ((1+r)^n − 1) with r = annual rate ÷ 12 ÷ 100, rounded to 2 decimals (P ÷ n when the rate is 0). Saving invalidates the cached loans list.

**Related features:** [F-LOAN-005](F-LOAN-005.md), [F-LOAN-006](F-LOAN-006.md) (shorter edit on the detail page), [F-LOAN-009](F-LOAN-009.md), [F-LOAN-010](F-LOAN-010.md), [F-LOAN-012](F-LOAN-012.md), [F-LOAN-013](F-LOAN-013.md), [D-LOAN-007](../dependencies.md#d-loan-007).

**Sources:** `apps/web/src/pages/loans/LoanListPage.tsx:308`, `apps/web/src/pages/loans/LoanListPage.tsx:324`, `apps/web/src/pages/loans/LoanListPage.tsx:389`, `apps/web/src/pages/loans/LoanListPage.tsx:401`, `apps/web/src/pages/loans/LoanListPage.tsx:445`, `apps/web/src/pages/loans/LoanListPage.tsx:519`, `apps/web/src/pages/loans/LoanListPage.tsx:548`, `apps/web/src/pages/loans/LoanListPage.tsx:560`, `apps/web/src/pages/loans/LoanListPage.tsx:585`, `apps/web/src/pages/loans/LoanRateFields.tsx:62`, `apps/web/src/pages/loans/LoanRateFields.tsx:34`, `packages/api/src/controllers/loans.controller.ts:32`, `packages/api/src/services/loans/loans.service.ts:176`, `packages/api/src/services/loans/loans.service.ts:664`, `packages/api/src/services/loans/loans.service.ts:725`, `packages/api/src/services/loans/loans.service.ts:754`
