---
id: F-LOAN-002
title: "Loans taken list"
module: "Loans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-LOAN-003, F-LOAN-004, F-LOAN-005, F-LOAN-007, F-LOAN-008, F-LOAN-014]
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# Loans taken list

`F-LOAN-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Lists every loan you have taken as an "EMI coupon" card. The coloured stub shows the lender's logo and name, the loan type, the interest rate ("interest a year") and pencil / bin buttons. The body shows **Outstanding** (or **Loan amount** for a loan that is not active), the percentage **repaid**, a block tracker of instalments, **First EMI** and **Last EMI** dates, and six figures: **Principal**, **Tenure**, **EMI**, **Next EMI**, **EMIs left**, **Paid so far**, followed by an "x/y instalments done" bar and the borrower name with "a/c ending" and the last four digits of the account number. Active loans come first; others are listed under **Closed / Foreclosed**, faded, with a stamp **Closed** or **Default**.

**Why it exists:** Inferred from behavior: one glance shows how far each loan is paid off and when the next EMI falls due. The empty state describes the purpose: "Track your home, car, personal, and education loans — payments, amortization, and tax benefits."

**Where to find it:** **Asset Classes → Loans → Loans taken** section (route `/loans`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). [R-MANAGER](../roles.md#r-manager) sees and edits the managed person's loans.

**Steps**
1. Open **Asset Classes → Loans**. The **Loans taken** section header shows the number of active loans.
2. Read a card. Under **Next EMI**, a hint shows "Due today", "Due in N days" (when 7 days or fewer) or "Overdue — record the payment once made".
3. Click anywhere on a card to open the loan's detail page ([F-LOAN-005](F-LOAN-005.md)).
4. Click **Download** in the section header to download the loans report ([D-LOAN-003](../dependencies.md#d-loan-003)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Loan card | Link | Opens `/loans/:id` | Never |
| Pencil (aria "Edit loan") | Icon button | Opens **Edit loan** ([F-LOAN-003](F-LOAN-003.md)) | Never |
| Bin (aria "Delete loan") | Icon button | Asks for delete confirmation ([F-LOAN-004](F-LOAN-004.md)) | Shows a spinner while that loan is being deleted |
| **Add loan** | Button | Opens **Add loan** ([F-LOAN-003](F-LOAN-003.md)) | Never |
| **Add first loan** | Button (empty state) | Opens **Add loan** | Shown only when you have no loans taken |
| **Download** (report button) | Button | Loans report ([D-LOAN-003](../dependencies.md#d-loan-003)) | Never |
| **Try again** | Button | Reloads the list | Shown only when loading failed |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing is changed by viewing.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load your loans. Check your connection and try again." | `GET /api/loans` failed | Click **Try again** |
| **Outstanding** shows "—" | The loan's summary has not loaded yet | Wait; it loads per card |
| **Next EMI** shows "Overdue — record the payment once made" | The next unpaid EMI date has passed | Record or mark the EMI paid ([F-LOAN-007](F-LOAN-007.md), [F-LOAN-008](F-LOAN-008.md)) |

**Limitations:** Loans are listed newest-added first; there is no sort, search or filter. A non-active loan shows its original **Loan amount**, 100% repaid, **EMIs left** 0 and **Next EMI** "None" whatever its real balance — including a loan marked **Default**. Only the last four digits of the account number are shown here; the full number cannot be revealed in the web app (the reveal endpoint has no button — [F-LOAN-014](F-LOAN-014.md)).

**How it works:** `GET /api/loans` returns your loans ordered by creation time (newest first), each with its 5 most recent payments, the account number masked as "••••" plus the last four digits, and any linked vehicle or rental property. For each active loan the card fetches `GET /api/loans/:id/summary`, which recomputes the amortization schedule; **Outstanding**, **Next EMI**, **EMIs left**, **Last EMI**, **Paid so far** (principal + interest paid) and the instalment count come from that summary, not from the 5 listed payments. **% repaid** = EMIs marked paid ÷ EMIs in the current plan (shorter than the tenure after a tenure-reducing prepayment), capped at 100. The block tracker shows one block per EMI up to 36 EMIs; above that, one block per year ("Each block = 1 year"). The lender colour and logo come from the bank list; unknown lenders get a slate colour.

**Related features:** [F-LOAN-003](F-LOAN-003.md), [F-LOAN-004](F-LOAN-004.md), [F-LOAN-005](F-LOAN-005.md), [D-LOAN-003](../dependencies.md#d-loan-003).

**Sources:** `apps/web/src/pages/loans/LoanListPage.tsx:107`, `apps/web/src/pages/loans/LoanListPage.tsx:124`, `apps/web/src/pages/loans/LoanListPage.tsx:155`, `apps/web/src/pages/loans/LoanListPage.tsx:272`, `apps/web/src/pages/loans/LoanListPage.tsx:749`, `apps/web/src/pages/loans/LoanListPage.tsx:772`, `apps/web/src/pages/loans/LoanListPage.tsx:779`, `apps/web/src/pages/loans/LoanListPage.tsx:827`, `apps/web/src/pages/loans/InstallmentTracker.tsx:8`, `packages/api/src/services/loans/loans.service.ts:699`, `packages/api/src/services/loans/loans.service.ts:703`
