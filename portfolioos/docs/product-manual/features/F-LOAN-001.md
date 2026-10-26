---
id: F-LOAN-001
title: "Loans page overview and section switcher"
module: "Loans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-LOAN-002, F-LOAN-008, F-LOAN-016]
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# Loans page overview and section switcher

`F-LOAN-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows two summary panels at the top of the Loans page — **You owe · loans taken** and **Owed to you · loans given** — and a sticky **Taken / Given** switcher that scrolls between the two sections. The loans-taken panel shows the total outstanding of your active loans as its headline, plus **EMIs / month**, **Active loans** and **Closed**. The loans-given panel shows the principal still owed to you, plus **EMIs in / month**, **Active loans** and **Overdue** (shown in red when above 0).

**Why it exists:** The page header states its purpose: "Money you owe and money owed to you, in one place". The panels give the net picture before you scroll into individual loans.

**Where to find it:** **Asset Classes → Loans** (route `/loans`). Opening `/loans?view=given` (used by the dashboard's money-lent reminders and by **Back to loans** on a loan-given page) lands directly on the **Loans given** section.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (no plan gate). [R-MANAGER](../roles.md#r-manager) sees the managed person's loans. In family view ([R-FAMOWNER](../roles.md#r-famowner), [R-FAMCONTRIB](../roles.md#r-famcontrib), [R-FAMVIEWER](../roles.md#r-famviewer)) the page still shows only your own loans.

**Steps**
1. Open **Asset Classes → Loans**. While data loads, figures show "…".
2. Read the two panels. Click either panel (it shows **View** with a down arrow) to scroll to that section.
3. Use the **Taken** / **Given** switcher (it stays at the top while you scroll) to jump between sections. Each button shows the number of loans in that section. The button for the section you are reading is highlighted.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **You owe · loans taken** panel | Button (whole panel) | Scrolls to **Loans taken** and clears `?view` from the address | Never |
| **Owed to you · loans given** panel | Button (whole panel) | Scrolls to **Loans given** and sets `?view=given` | Never |
| **Taken** / **Given** | Segmented switcher | Same as the panels; shows a count badge per section | Count hidden while loading |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing is changed. The address bar keeps `?view=given` while you are on the given section so the link can be shared or bookmarked.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Headline differs from the dashboard's loan liability | The page and the dashboard compute outstanding differently for EMIs that were never marked paid (see Limitations) | Mark past EMIs paid on the loan's schedule ([F-LOAN-008](F-LOAN-008.md)) |

**Limitations:** **EMIs / month** adds up each active loan's stored EMI amount; it does not follow an EMI reduced by a prepayment recorded with **Reduce EMI**. **Closed** counts every loan whose status is not Active, including loans marked **Default**. The headline uses each loan's outstanding as of its next unpaid EMI on or after today; the dashboard and sidebar values use the opening balance of the earliest unpaid EMI, so a loan added mid-tenure whose earlier EMIs were never marked paid shows a larger figure there (see DOCUMENTATION_GAPS.md).

**How it works:** The page calls `GET /api/loans` and `GET /api/loans-given`, then `GET /api/loans/:id/summary` once per active loan taken (shared with each loan card). "You owe" = sum of each active loan's `outstandingBalance` (its principal while the summary is still loading). "Owed to you" = sum of `outstandingPrincipal` of active loans given; **EMIs in / month** sums the EMI of active loans given that use monthly EMIs; **Overdue** counts active loans given whose `overdueDays` is above 0. All sums use decimal arithmetic. The highlighted switcher button follows scroll position: the given section counts as current once its top is within 45% of the visible height or you reach the bottom of the page.

**Related features:** [F-LOAN-002](F-LOAN-002.md) (loans taken), [F-LOAN-016](F-LOAN-016.md) (loans given), [D-LOAN-004](../dependencies.md#d-loan-004) (dashboard liabilities).

**Sources:** `apps/web/src/pages/loans/LoanListPage.tsx:619`, `apps/web/src/pages/loans/LoanListPage.tsx:662`, `apps/web/src/pages/loans/LoanListPage.tsx:677`, `apps/web/src/pages/loans/LoanListPage.tsx:714`, `apps/web/src/pages/loans/LoanSections.tsx:108`, `apps/web/src/pages/loans/LoanSections.tsx:125`, `apps/web/src/pages/dashboard/DashboardPage.tsx:70`
