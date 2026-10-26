## Loans

The **Loans** page (sidebar **Asset Classes → Loans**, route `/loans`) keeps both sides of borrowing in one place: **Loans taken** (home, car, personal and other loans you are repaying to a lender) and **Loans given** (money you lent to a friend, relative, colleague or business). For a loan taken, EveryPaisa computes the full amortization schedule from the loan's terms and the payments you record, so the outstanding balance, next EMI, interest paid, tax benefit and a market comparison are always derived, never typed in. For a loan given, it keeps a ledger of repayments, interest, top-ups and amounts forgiven, and derives what is still owed from it. Reminders for upcoming and missed EMIs, repayments due back to you, refinancing opportunities and benchmark-rate changes appear in **Alerts**.

### Loans page overview and section switcher <!-- F-LOAN-001 -->
**What it does:** Shows two summary panels at the top of the Loans page — **You owe · loans taken** and **Owed to you · loans given** — and a sticky **Taken / Given** switcher that scrolls between the two sections. The loans-taken panel shows the total outstanding of your active loans as its headline, plus **EMIs / month**, **Active loans** and **Closed**. The loans-given panel shows the principal still owed to you, plus **EMIs in / month**, **Active loans** and **Overdue** (shown in red when above 0).

**Why it exists:** The page header states its purpose: "Money you owe and money owed to you, in one place". The panels give the net picture before you scroll into individual loans.

**Where to find it:** **Asset Classes → Loans** (route `/loans`). Opening `/loans?view=given` (used by the dashboard's money-lent reminders and by **Back to loans** on a loan-given page) lands directly on the **Loans given** section.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (no plan gate). R-MANAGER sees the managed person's loans. In family view (R-FAMOWNER, R-FAMCONTRIB, R-FAMVIEWER) the page still shows only your own loans.

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
| Headline differs from the dashboard's loan liability | The page and the dashboard compute outstanding differently for EMIs that were never marked paid (see Limitations) | Mark past EMIs paid on the loan's schedule (F-LOAN-008) |

**Limitations:** **EMIs / month** adds up each active loan's stored EMI amount; it does not follow an EMI reduced by a prepayment recorded with **Reduce EMI**. **Closed** counts every loan whose status is not Active, including loans marked **Default**. The headline uses each loan's outstanding as of its next unpaid EMI on or after today; the dashboard and sidebar values use the opening balance of the earliest unpaid EMI, so a loan added mid-tenure whose earlier EMIs were never marked paid shows a larger figure there (see DOCUMENTATION_GAPS.md).

**How it works:** The page calls `GET /api/loans` and `GET /api/loans-given`, then `GET /api/loans/:id/summary` once per active loan taken (shared with each loan card). "You owe" = sum of each active loan's `outstandingBalance` (its principal while the summary is still loading). "Owed to you" = sum of `outstandingPrincipal` of active loans given; **EMIs in / month** sums the EMI of active loans given that use monthly EMIs; **Overdue** counts active loans given whose `overdueDays` is above 0. All sums use decimal arithmetic. The highlighted switcher button follows scroll position: the given section counts as current once its top is within 45% of the visible height or you reach the bottom of the page.

**Related features:** F-LOAN-002 (loans taken), F-LOAN-016 (loans given), D-LOAN-004 (dashboard liabilities).

**Sources:** `apps/web/src/pages/loans/LoanListPage.tsx:619`, `apps/web/src/pages/loans/LoanListPage.tsx:662`, `apps/web/src/pages/loans/LoanListPage.tsx:677`, `apps/web/src/pages/loans/LoanListPage.tsx:714`, `apps/web/src/pages/loans/LoanSections.tsx:108`, `apps/web/src/pages/loans/LoanSections.tsx:125`, `apps/web/src/pages/dashboard/DashboardPage.tsx:70`

### Loans taken list <!-- F-LOAN-002 -->
**What it does:** Lists every loan you have taken as an "EMI coupon" card. The coloured stub shows the lender's logo and name, the loan type, the interest rate ("interest a year") and pencil / bin buttons. The body shows **Outstanding** (or **Loan amount** for a loan that is not active), the percentage **repaid**, a block tracker of instalments, **First EMI** and **Last EMI** dates, and six figures: **Principal**, **Tenure**, **EMI**, **Next EMI**, **EMIs left**, **Paid so far**, followed by an "x/y instalments done" bar and the borrower name with "a/c ending" and the last four digits of the account number. Active loans come first; others are listed under **Closed / Foreclosed**, faded, with a stamp **Closed** or **Default**.

**Why it exists:** Inferred from behavior: one glance shows how far each loan is paid off and when the next EMI falls due. The empty state describes the purpose: "Track your home, car, personal, and education loans — payments, amortization, and tax benefits."

**Where to find it:** **Asset Classes → Loans → Loans taken** section (route `/loans`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. R-MANAGER sees and edits the managed person's loans.

**Steps**
1. Open **Asset Classes → Loans**. The **Loans taken** section header shows the number of active loans.
2. Read a card. Under **Next EMI**, a hint shows "Due today", "Due in N days" (when 7 days or fewer) or "Overdue — record the payment once made".
3. Click anywhere on a card to open the loan's detail page (F-LOAN-005).
4. Click **Download** in the section header to download the loans report (D-LOAN-003).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Loan card | Link | Opens `/loans/:id` | Never |
| Pencil (aria "Edit loan") | Icon button | Opens **Edit loan** (F-LOAN-003) | Never |
| Bin (aria "Delete loan") | Icon button | Asks for delete confirmation (F-LOAN-004) | Shows a spinner while that loan is being deleted |
| **Add loan** | Button | Opens **Add loan** (F-LOAN-003) | Never |
| **Add first loan** | Button (empty state) | Opens **Add loan** | Shown only when you have no loans taken |
| **Download** (report button) | Button | Loans report (D-LOAN-003) | Never |
| **Try again** | Button | Reloads the list | Shown only when loading failed |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing is changed by viewing.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load your loans. Check your connection and try again." | `GET /api/loans` failed | Click **Try again** |
| **Outstanding** shows "—" | The loan's summary has not loaded yet | Wait; it loads per card |
| **Next EMI** shows "Overdue — record the payment once made" | The next unpaid EMI date has passed | Record or mark the EMI paid (F-LOAN-007, F-LOAN-008) |

**Limitations:** Loans are listed newest-added first; there is no sort, search or filter. A non-active loan shows its original **Loan amount**, 100% repaid, **EMIs left** 0 and **Next EMI** "None" whatever its real balance — including a loan marked **Default**. Only the last four digits of the account number are shown here; the full number cannot be revealed in the web app (the reveal endpoint has no button — F-LOAN-014).

**How it works:** `GET /api/loans` returns your loans ordered by creation time (newest first), each with its 5 most recent payments, the account number masked as "••••" plus the last four digits, and any linked vehicle or rental property. For each active loan the card fetches `GET /api/loans/:id/summary`, which recomputes the amortization schedule; **Outstanding**, **Next EMI**, **EMIs left**, **Last EMI**, **Paid so far** (principal + interest paid) and the instalment count come from that summary, not from the 5 listed payments. **% repaid** = EMIs marked paid ÷ EMIs in the current plan (shorter than the tenure after a tenure-reducing prepayment), capped at 100. The block tracker shows one block per EMI up to 36 EMIs; above that, one block per year ("Each block = 1 year"). The lender colour and logo come from the bank list; unknown lenders get a slate colour.

**Related features:** F-LOAN-003, F-LOAN-004, F-LOAN-005, D-LOAN-003.

**Sources:** `apps/web/src/pages/loans/LoanListPage.tsx:107`, `apps/web/src/pages/loans/LoanListPage.tsx:124`, `apps/web/src/pages/loans/LoanListPage.tsx:155`, `apps/web/src/pages/loans/LoanListPage.tsx:272`, `apps/web/src/pages/loans/LoanListPage.tsx:749`, `apps/web/src/pages/loans/LoanListPage.tsx:772`, `apps/web/src/pages/loans/LoanListPage.tsx:779`, `apps/web/src/pages/loans/LoanListPage.tsx:827`, `apps/web/src/pages/loans/InstallmentTracker.tsx:8`, `packages/api/src/services/loans/loans.service.ts:699`, `packages/api/src/services/loans/loans.service.ts:703`

### Add or edit a loan (full form) <!-- F-LOAN-003 -->
**What it does:** Opens the **Add loan** (or **Edit loan**) dialog to record a loan you have taken: lender, loan type, borrower, account number, principal, rate, tenure, EMI (with a calculator button that fills it in), prepayment option, rate type and benchmark, disbursement and first EMI dates, tax benefit section, status and portfolio.

**Why it exists:** Inferred from behavior: every computed figure (schedule, outstanding, tax benefit, market comparison, reminders) is derived from these terms, so they are captured once here.

**Where to find it:** **Asset Classes → Loans → Add loan** (or **Add first loan**), or the pencil on a loan card (route `/loans`). The onboarding wizard's quick-add also creates loans (D-LOAN-007).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

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

**Settings and toggles here:** S-LOAN-001 **Loan type** — selects market comparison and alert wording; S-LOAN-002 **Prepayment option** — **Reduce tenure** keeps the EMI and shortens the schedule, **Reduce EMI** keeps the end date and lowers the EMI after each prepayment; S-LOAN-003 **Rate type**, S-LOAN-004 **Linked to**, S-LOAN-005 **Next rate reset (optional)** — decide whether the loan gets repo/MCLR change alerts and when the next reset is estimated; S-LOAN-006 **Tax benefit section** — turns on the tax benefit panel (F-LOAN-009); S-LOAN-007 **Status** — only **Active** loans get a schedule-based outstanding, reminders and the market comparison; S-LOAN-008 **Portfolio** — stored with the loan; no page in this module groups loans by it. Full detail: Settings reference.

**Results:** A loan row is created (or updated). The list, the loan's summary and schedule, the dashboard liabilities and the next daily reminder scans use the new terms. Changing the first EMI date also changes the stored EMI due day.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Field turns red with "Required" | A required field is empty or not a number | Fill it |
| Toast "Failed to add loan" / "Failed to update loan" and a red line such as "Request failed with status code 422" | The server rejected the data (for example commas in an amount, tenure above 600, or a text that is not a positive number) | Type plain numbers without commas or ₹; keep tenure 1–600 |
| Toast "Failed to update loan" when editing a loan you cannot see any more | The loan was deleted or belongs to someone else (404) | Reload the list |

**Limitations:** Amounts must be typed without commas or the ₹ sign — the client accepts them as numbers only if they parse, and the server accepts only digits with an optional decimal part. The dialog shows the server's reason only as the generic HTTP message. The account number is masked in the edit form; leaving the masked value unchanged keeps the saved number, clearing the box removes it, typing a new number replaces it. The form cannot link a vehicle or rental property to the loan (see F-LOAN-011). Setting **Status** to **Closed** or **Foreclosed** here does not record a closing date (only a recorded foreclosure payment does, F-LOAN-007).

**How it works:** `POST /api/loans` (create) or `PATCH /api/loans/:id` (edit). The server validates with a schema (lender and borrower 1–200 characters, amounts as positive decimal strings, tenure integer 1–600, dates `YYYY-MM-DD`, enumerated loan type, prepayment option, status, rate type and benchmark), sets `emiDueDay` to the day of the first EMI date, and encrypts the account number (keeping its last four digits for display). A masked value (containing "•") is treated as "unchanged". Rate fields: a benchmark or reset date is refused unless the loan is (or is becoming) **Floating**; switching a loan away from Floating clears both. The calculator button uses EMI = P × r × (1+r)^n ÷ ((1+r)^n − 1) with r = annual rate ÷ 12 ÷ 100, rounded to 2 decimals (P ÷ n when the rate is 0). Saving invalidates the cached loans list.

**Related features:** F-LOAN-005, F-LOAN-006 (shorter edit on the detail page), F-LOAN-009, F-LOAN-010, F-LOAN-012, F-LOAN-013, D-LOAN-007.

**Sources:** `apps/web/src/pages/loans/LoanListPage.tsx:308`, `apps/web/src/pages/loans/LoanListPage.tsx:324`, `apps/web/src/pages/loans/LoanListPage.tsx:389`, `apps/web/src/pages/loans/LoanListPage.tsx:401`, `apps/web/src/pages/loans/LoanListPage.tsx:445`, `apps/web/src/pages/loans/LoanListPage.tsx:519`, `apps/web/src/pages/loans/LoanListPage.tsx:548`, `apps/web/src/pages/loans/LoanListPage.tsx:560`, `apps/web/src/pages/loans/LoanListPage.tsx:585`, `apps/web/src/pages/loans/LoanRateFields.tsx:62`, `apps/web/src/pages/loans/LoanRateFields.tsx:34`, `packages/api/src/controllers/loans.controller.ts:32`, `packages/api/src/services/loans/loans.service.ts:176`, `packages/api/src/services/loans/loans.service.ts:664`, `packages/api/src/services/loans/loans.service.ts:725`, `packages/api/src/services/loans/loans.service.ts:754`

### Delete a loan <!-- F-LOAN-004 -->
**What it does:** Permanently deletes a loan taken and all its recorded payments.

**Why it exists:** Inferred from behavior: to remove a loan added by mistake or no longer worth tracking.

**Where to find it:** **Asset Classes → Loans**, bin icon on the loan card's stub (route `/loans`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click the bin icon on the loan's card. The card is replaced by "Delete "<lender>" loan?" (for a closed loan, "Delete "<lender>"?") with **Yes** and **No**.
2. Click **Yes**. The toast "Loan deleted" appears and the card disappears. Click **No** to keep it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Bin (aria "Delete loan") | Icon button | Shows the confirmation | Never |
| **Yes** | Button | Deletes | Disabled (spinner) while deleting |
| **No** | Button | Cancels | Never |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The loan and all its payments are removed (payments are deleted with the loan). A real-estate property that pointed at this loan keeps no link. Alerts already created for the loan stay in **Alerts**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Toast "Failed to delete loan" | Network error or the loan no longer exists | Reload the list |

**Limitations:** There is no undo. Deletion is only available from the list page, not from the loan's detail page.

**How it works:** `DELETE /api/loans/:id`; the server checks the loan belongs to you, then deletes it. `LoanPayment` rows cascade. Linking columns elsewhere that point at the loan are optional and are cleared by the database's default for optional relations.

**Related features:** F-LOAN-002.

**Sources:** `apps/web/src/pages/loans/LoanListPage.tsx:638`, `apps/web/src/pages/loans/LoanListPage.tsx:795`, `packages/api/src/services/loans/loans.service.ts:802`, `packages/api/prisma/schema.prisma:3103`

### Loan detail: summary, progress and charts <!-- F-LOAN-005 -->
**What it does:** Shows one loan in depth. The header shows the lender, "<type> loan · <borrower>" and "●●●● <last 4>" of the account number, with **Edit** and **Record payment** buttons. Four metric cards follow — **Outstanding balance** ("of ₹… principal"), **Interest paid** ("Principal paid: ₹…"), **Remaining months** ("N EMIs left"), **Next EMI** (amount and date) — then two progress bars (**Principal repaid**, **Tenure elapsed**) and **Total interest payable**. Below are the tax benefit panel, the **Compare with market** card, linked vehicle/property cards, three charts (**Outstanding balance over time**, **EMI split — principal vs interest**, **Total cost** donut with "Interest as % of cost"), **Payment history** and the **Amortization schedule**.

**Why it exists:** Inferred from behavior: it answers "how much do I still owe, how much interest am I paying, and when does this end" for one loan.

**Where to find it:** **Asset Classes → Loans**, click a loan card (route `/loans/:id`). Loan-check alerts also open this page (D-LOAN-001).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click a loan card on the Loans page. The page loads with placeholder cards, then the figures.
2. Read the metrics and progress bars. Hover a chart to see the value for a month.
3. Click **Back to loans** (top left) to return.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Back to loans** | Link | Opens `/loans` | Never |
| **Edit** | Button | Opens the short **Edit loan** dialog (F-LOAN-006) | Never |
| **Record payment** | Button | Opens **Record payment** (F-LOAN-007) | Never |
| Charts | Hover tooltips | Show balance / principal / interest for a point | Hidden when the schedule is empty |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-LOAN-006 **Tax benefit section** decides whether the tax panel appears; S-LOAN-007 **Status** decides whether **Compare with market** appears (Active only).

**Results:** Nothing is changed by viewing.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Loan not found." | The id is wrong, the loan was deleted, or it is not yours | Click **Back to loans** |
| "No amortization data available" | The schedule has no rows (for example a 0 balance) | Check principal, rate and EMI in Edit |
| Metrics show "…" | The summary is still loading | Wait |

**Limitations:** **Tenure elapsed** counts EMI payment records against the original tenure, not the shortened plan after a prepayment. The charts downsample long schedules to about 60 points and use display-only numbers. **Total cost** uses the remaining interest payable (from the summary) plus the principal in the schedule, not the interest already paid.

**How it works:** The page calls `GET /api/loans/:id` (all payments, oldest first), `GET /api/loans/:id/summary` and `GET /api/loans/:id/amortization`. The schedule is rebuilt on every request from the loan's terms and payments (nothing is stored): month by month, interest = opening balance × annual rate ÷ 12 ÷ 100 rounded half-even to paise, principal = EMI − interest (the last row takes the remaining balance), and prepayments or foreclosures dated on or before an EMI date are taken off the balance first, after which **Reduce tenure** recomputes the remaining months at the same EMI and **Reduce EMI** recomputes the EMI over the remaining months. The schedule stops at a balance ≤ ₹0.005, at 3 × tenure rows or at 600 rows. A row is "paid" when an EMI payment exists for its month (its "for month", or the month it was paid in). The summary's **Outstanding balance** is the opening balance of the first unpaid EMI dated today or later; **Interest paid** / **Principal paid** add up the split of every EMI, prepayment and foreclosure payment (a payment saved without a split takes that month's scheduled interest first; prepayments and foreclosures count as all principal); **Total interest payable** is the interest in the unpaid rows from today. **Principal repaid** = principal paid ÷ principal amount.

**Related features:** F-LOAN-006, F-LOAN-007, F-LOAN-008, F-LOAN-009, F-LOAN-010, F-LOAN-011.

**Sources:** `apps/web/src/pages/loans/LoanDetailPage.tsx:1048`, `apps/web/src/pages/loans/LoanDetailPage.tsx:1102`, `apps/web/src/pages/loans/LoanDetailPage.tsx:1108`, `apps/web/src/pages/loans/LoanDetailPage.tsx:1126`, `apps/web/src/pages/loans/LoanDetailPage.tsx:1154`, `apps/web/src/pages/loans/LoanDetailPage.tsx:810`, `apps/web/src/pages/loans/LoanDetailPage.tsx:1273`, `packages/api/src/services/loans/loans.service.ts:275`, `packages/api/src/services/loans/loans.service.ts:311`, `packages/api/src/services/loans/loans.service.ts:441`, `packages/api/src/services/loans/loans.service.ts:464`, `packages/api/src/services/loans/loans.service.ts:493`

### Edit a loan from its detail page <!-- F-LOAN-006 -->
**What it does:** A shorter **Edit loan** dialog on the loan's page for the figures that change most: lender, loan type, principal, interest rate, tenure, EMI (with the calculator button), status, tax benefit section, rate type fields and portfolio.

**Why it exists:** Inferred from behavior: rate resets, status changes and tax section are edited while looking at the loan's figures, which refresh immediately after saving.

**Where to find it:** Loan detail page → **Edit** (route `/loans/:id`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Edit**. The dialog opens filled with the loan's values.
2. Change any field; click the calculator button to recompute the EMI.
3. Click **Save**. The toast "Loan updated" appears and the summary, schedule, market comparison and dashboard refresh.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Calculator button (title "Auto-calculate") | Button | Fills **EMI amount** | — |
| **Cancel** / **Save** | Buttons | Close / save ("Saving…") | **Save** disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Lender name \*** | Search / pick | Yes | 1–200 characters | Current | "Required" |
| **Loan type** | Select | No | As in F-LOAN-003 | Current | — |
| **Principal (₹) \*** | Text | Yes | Positive number | Current | "Required" |
| **Interest rate (%) \*** | Text | Yes | Positive number | Current | "Required" |
| **Tenure (months) \*** | Number | Yes | 1–600 | Current | "Required" |
| **EMI amount (₹) \*** | Text | Yes | Positive number | Current | "Required" |
| **Status** | Select | No | Active / Closed / Foreclosed / Default | Current | — |
| **Tax benefit section** | Select | No | None / 80C + 24B (Home loan) / 80E (Education loan) | Current | — |
| **Rate type**, **Linked to**, **Next rate reset (optional)** | Selects / date | No | As in F-LOAN-003 | Current | As in F-LOAN-003 |
| **Portfolio** | Picker | No | "Optional — re-assign this loan to a different portfolio." | Current | — |

**Settings and toggles here:** S-LOAN-001, S-LOAN-003, S-LOAN-004, S-LOAN-005, S-LOAN-006, S-LOAN-007, S-LOAN-008 (same meaning as in F-LOAN-003).

**Results:** The loan is updated; derived figures recompute on the next request.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Required" under a field | Empty or non-numeric | Fill it |
| Toast "Failed to update loan" with a "Request failed with status code …" line | Server validation failed | Use plain numbers; tenure 1–600 |

**Limitations:** This dialog has no **Borrower name**, **Account number**, **Disbursement date**, **First EMI date** or **Prepayment option** fields; it sends their current values back unchanged. Use the pencil on the Loans list (F-LOAN-003) to change them.

**How it works:** `PATCH /api/loans/:id` with the full form (masked account number included, which the server treats as unchanged). On success it invalidates the loan, its summary, schedule, market check, the loans list and the dashboard caches.

**Related features:** F-LOAN-003, F-LOAN-005.

**Sources:** `apps/web/src/pages/loans/LoanDetailPage.tsx:263`, `apps/web/src/pages/loans/LoanDetailPage.tsx:319`, `apps/web/src/pages/loans/LoanDetailPage.tsx:339`, `apps/web/src/pages/loans/LoanDetailPage.tsx:463`, `apps/web/src/pages/loans/LoanDetailPage.tsx:475`, `packages/api/src/services/loans/loans.service.ts:766`

### Record a loan payment and manage payment history <!-- F-LOAN-007 -->
**What it does:** Records a payment against a loan taken — **EMI**, **Prepayment**, **Foreclosure** or **Processing fee** — and lists every payment in **Payment history** (Date, Type, Amount, Principal, Interest, Note) with a delete action per row. A foreclosure recorded on an active loan closes it as **Foreclosed** on that date; deleting that foreclosure reopens it.

**Why it exists:** Inferred from behavior: the schedule, outstanding balance, interest paid and prepayment savings are all derived from these records, so recording real payments keeps every figure accurate.

**Where to find it:** Loan detail page → **Record payment**; **Payment history** card below the charts (route `/loans/:id`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Record payment**. The **Record payment** dialog opens with type **EMI**.
2. Choose **Payment type**, set **Paid on** and **Amount (₹)**.
3. For an EMI, optionally type **For month (YYYY-MM)** (the schedule month it pays). Optionally fill **Principal part (₹)**, **Interest part (₹)** and **Notes**. For a prepayment the dialog shows "Prepayment savings will be shown after recording".
4. Click **Save**. The toast "Payment recorded" appears. After a prepayment, a green banner may read "This prepayment saves you ₹… in interest!" with **Dismiss**.
5. To remove a payment, hover its row in **Payment history**, click the bin, then **Del** (or **No**). The toast "Payment removed" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Record payment** | Button | Opens the dialog | Never |
| **Cancel** / **Save** | Buttons | Close / save ("Saving…") | **Save** disabled while saving |
| Bin (per payment row) | Icon button | Shows **Del** / **No** | Visible on hover |
| **Del** | Button | Deletes the payment | Disabled while deleting |
| **No** | Button | Cancels the delete | — |
| **Dismiss** | Button | Hides the savings banner | Shown only after a prepayment that produced savings |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Payment type** | Select: EMI, Prepayment, Foreclosure, Processing fee | Yes | — | EMI | — |
| **Paid on \*** | Date | Yes | YYYY-MM-DD | Empty | "Required" |
| **Amount (₹) \*** | Text | Yes | Positive number, no commas | Empty | "Required" |
| **For month (YYYY-MM)** | Text (EMI only) | No | `YYYY-MM` (server) | Empty (the paid-on month is used) | Server: "Expected YYYY-MM" (shown as a generic failure) |
| **Principal part (₹)** / **Interest part (₹)** | Text | No | Positive numbers | Empty (computed by the server) | — |
| **Notes** | Text | No | Up to 500 characters (server) | Empty | — |

**Settings and toggles here:** S-LOAN-002 **Prepayment option** decides what a prepayment does to the schedule (shorter tenure or smaller EMI).

**Results:** A payment row is stored. For an EMI the matching schedule month shows **Paid**; a prepayment or foreclosure reduces the balance from the next EMI date; a foreclosure on an active loan sets status **Foreclosed** and the closing date to the payment date. A processing fee is listed but never changes the balance. The loans list, summary, schedule, market comparison and dashboard refresh.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Required" | **Paid on** or **Amount** missing | Fill them |
| Toast "Failed to record payment" and a "Request failed with status code 422" line | **For month** not `YYYY-MM`, or an amount with commas | Correct the format |
| Toast "Failed to remove payment" | The payment no longer exists or is not yours | Reload the page |

**Limitations:** Recording two EMI payments for the same month marks that month once; both still count towards interest and principal paid. The savings banner only appears when the whole-loan saving versus the original plan is above 0. Payments cannot be edited — delete and record again.

**How it works:** `POST /api/loans/:id/payments`. When neither part is given (and the type is not a processing fee), the server stores a split: an EMI pays that month's scheduled interest first (capped at the amount) and the rest is principal; a prepayment or foreclosure is all principal. A foreclosure on an `ACTIVE` loan updates the loan to `FORECLOSED` with `closedDate` = paid-on date. `DELETE /api/loans/payments/:paymentId` checks ownership through the loan; if the deleted payment is the foreclosure that closed the loan (same date, status Foreclosed) the loan returns to `ACTIVE` with no closing date. Prepayment savings = interest of the original plan without payments − (interest paid + interest still payable).

**Related features:** F-LOAN-005, F-LOAN-008, F-LOAN-012.

**Sources:** `apps/web/src/pages/loans/LoanDetailPage.tsx:106`, `apps/web/src/pages/loans/LoanDetailPage.tsx:146`, `apps/web/src/pages/loans/LoanDetailPage.tsx:196`, `apps/web/src/pages/loans/LoanDetailPage.tsx:221`, `apps/web/src/pages/loans/LoanDetailPage.tsx:486`, `apps/web/src/pages/loans/LoanDetailPage.tsx:563`, `apps/web/src/pages/loans/LoanDetailPage.tsx:1073`, `packages/api/src/controllers/loans.controller.ts:58`, `packages/api/src/services/loans/loans.service.ts:519`, `packages/api/src/services/loans/loans.service.ts:810`, `packages/api/src/services/loans/loans.service.ts:856`, `packages/api/src/services/loans/loans.service.ts:865`, `packages/api/src/services/loans/loans.service.ts:880`

### Amortization schedule with Mark paid and Undo <!-- F-LOAN-008 -->
**What it does:** The **Amortization schedule** table lists every EMI: **#**, **Date**, **Opening**, **EMI**, **Principal**, **Interest**, **Closing**, **Status** (**Paid** with date, **Overdue**, **Upcoming**) and **Action**. **Mark paid** records that month's EMI in one click; **Undo** removes it. The first 12 months show by default.

**Why it exists:** Inferred from behavior: the quickest way to keep a loan current is to tick off EMIs as they are debited, without typing amounts.

**Where to find it:** Loan detail page → **Amortization schedule** (route `/loans/:id`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Scroll to **Amortization schedule**. The table scrolls to the first unpaid month.
2. Click **Mark paid** on a row. The toast "Marked paid" appears and the row turns green with "Paid <date>".
3. To reverse, click **Undo** on a paid row. The toast "Payment undone" appears.
4. Click **Show all N months** to see the full schedule, **Show less** to fold it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Mark paid** | Button | Records an EMI for that row | On unpaid rows; spinner while saving |
| **Undo** | Button | Deletes the EMI payment for that month | On paid rows; spinner while saving |
| **Show all N months** / **Show less** | Toggle button | Expands / folds the table | Shown only when the schedule has more than 12 rows |

**Fields and rules:** None — the row's values are used.

**Settings and toggles here:** None.

**Results:** **Mark paid** stores an EMI payment dated on the row's due date, for that row's month, with the row's EMI, principal and interest. **Undo** deletes the EMI payment for that month. All loan figures and the dashboard refresh.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Toast "Failed to mark paid" | Network or server error | Try again |
| Toast "Payment not found" on **Undo** | No EMI payment matches the row's month (for example the payment was deleted elsewhere) | Reload the page |
| Toast "Failed to undo" | Server error | Try again |

**Limitations:** **Mark paid** always uses the scheduled due date as the paid-on date, not today. Rows show **Overdue** in red when their date is before today and they are unpaid — including EMIs from before you added the loan. "Showing 12 of N months" is shown while folded.

**How it works:** **Mark paid** calls `POST /api/loans/:id/payments` with type EMI, `paidOn` = row date, `forMonth` = row month and the row's split. **Undo** finds the EMI payment whose "for month" (or paid-on month) equals the row's month and calls `DELETE /api/loans/payments/:id`. The schedule is recomputed by the server after each change.

**Related features:** F-LOAN-005, F-LOAN-007, F-LOAN-012.

**Sources:** `apps/web/src/pages/loans/LoanDetailPage.tsx:591`, `apps/web/src/pages/loans/LoanDetailPage.tsx:595`, `apps/web/src/pages/loans/LoanDetailPage.tsx:694`, `apps/web/src/pages/loans/LoanDetailPage.tsx:731`, `apps/web/src/pages/loans/LoanDetailPage.tsx:748`, `apps/web/src/pages/loans/loanPayments.ts:8`

### Loan tax benefit panel <!-- F-LOAN-009 -->
**What it does:** For a loan with a **Tax benefit section**, shows **Tax benefit — Section 80C + 24(b)** (home loan) or **Tax benefit — Section 80E** (education loan) with **Principal deduction (80C)** (home only), **Interest deduction (24(b))** or **(80E)**, and **Est. tax saving (30% slab)** for the current financial year.

**Why it exists:** Inferred from behavior: home and education loan repayments reduce income tax; the panel estimates this year's deduction from the loan's own schedule.

**Where to find it:** Loan detail page, below the progress bars (route `/loans/:id`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Set **Tax benefit section** to **80C + 24B (Home loan)** or **80E (Education loan)** in Add/Edit loan.
2. Open the loan. The panel appears with this financial year's figures.

**Controls:** None — display only.

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-LOAN-006 **Tax benefit section** — **None** hides the panel; **80C + 24B** shows principal (capped ₹1,50,000) and interest (capped ₹2,00,000); **80E** shows all interest, uncapped.

**Results:** Nothing is changed.

**Errors and troubleshooting:** None — the panel is hidden when no section is set.

**Limitations:** The estimate always uses a 30% rate with no cess and ignores the tax regime (the EMI Calculator, F-EMI-004, uses your slab, adds 4% cess and gives nothing under the new regime). The figures cover every scheduled EMI dated in the current financial year (1 April – 31 March), paid or not. The ₹1,50,000 80C cap is applied per loan and does not consider your other 80C investments. The panel also appears for closed loans. The 80E eight-year limit is not applied here.

**How it works:** Computed in the loan summary: rows of the schedule dated between 1 April and 31 March of the current Indian financial year are summed; home loan (stored `80C+24B`, or the older `80C_24B`): principal = min(sum, 150000), interest = min(sum, 200000), saving = (principal + interest) × 0.30, rounded half-even to paise; education (`80E`): interest = sum, saving = interest × 0.30.

**Related features:** F-LOAN-003, F-EMI-004.

**Sources:** `apps/web/src/pages/loans/LoanDetailPage.tsx:1014`, `apps/web/src/pages/loans/LoanDetailPage.tsx:1038`, `packages/api/src/services/loans/loans.service.ts:56`, `packages/api/src/services/loans/loans.service.ts:577`, `packages/api/src/services/loans/loans.service.ts:603`, `packages/api/src/services/loans/loans.service.ts:616`

### Compare with market (refinance check) <!-- F-LOAN-010 -->
**What it does:** On an active loan, the **Compare with market** card shows your rate against the lowest current market rate for your loan type ("Market from X% (<lender>, as of <date>)"), lets you set switching costs (**Processing fee (%)**, **Other charges (₹)**), and shows the result of moving the outstanding balance to that rate: **New EMI** (with your current EMI and remaining months), **Interest saved**, **Switching costs**, **Net saving** and **Break-even**. For floating loans it also shows the latest benchmark (RBI repo rate or your lender's 1-year MCLR) and its last change. **Open in calculator** opens the EMI Calculator pre-filled with the switch.

**Why it exists:** The card's own text explains it: it estimates whether refinancing pays off after costs; "Floating loans get an alert when the repo rate or your lender's MCLR changes."

**Where to find it:** Loan detail page → **Compare with market** (route `/loans/:id`), shown only for loans with status **Active**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Open an active loan. The card loads market rates.
2. If the card asks "Fixed or floating?", click **Fixed** or **Floating** to save the loan's rate type.
3. Adjust **Processing fee (%)** (default 0.5) and **Other charges (₹)** (default 10,000) if your new lender quotes different costs.
4. Read **Net saving** (green when above 0) and **Break-even** ("Break-even in month N" or "Switching would not pay off at these costs").
5. Click **Open in calculator** to see the full schedule of the switch (F-EMI-001).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Fixed** / **Floating** | Buttons | Save the loan's rate type | Shown only when rate type is "Not sure"; disabled while saving |
| **Processing fee (%)** | Text | Switching cost as % of outstanding | Shown only when the market rate is below yours |
| **Other charges (₹)** | Text | Fixed switching cost | As above |
| **Open in calculator** | Link button | Opens `/emi` pre-filled | Hidden when there is no market rate, the remaining term is 0 or above 480 months, or the costs are invalid |
| **Try again** | Button | Reloads the card | Shown only after a load error |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Processing fee (%)** | Text | Yes | 0–10 | 0.5 | "Enter a processing fee between 0 and 10%" |
| **Other charges (₹)** | Text | Yes | 0 to ₹100 crore; commas allowed | 10,000 | "Enter other charges in rupees" |

**Settings and toggles here:** S-LOAN-003 **Rate type** (set here by **Fixed** / **Floating**, or in Edit) and S-LOAN-004 **Linked to** decide which benchmark line shows; S-LOAN-009 **Switching costs** (the two fields above) change the result for this visit only. Loan type (S-LOAN-001) **Other** has no market data. The account setting **Loan rate alerts** (D-LOAN-002) controls whether the daily job also alerts you (F-LOAN-013).

**Results:** Only **Fixed** / **Floating** changes stored data (the loan's rate type). The switching costs are not saved.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load market rates." | `GET /api/loans/:id/market-check` failed | Click **Try again** |
| "No market data for this loan type." | Loan type **Other** | None — no market rates exist for it |
| "Market rates are not available yet." | No fresh, believable market rate for this loan type | Wait for the daily rate refresh (F-EMI-010) |
| "Nothing left to refinance on this loan." | No unpaid EMIs from today, or nothing outstanding | None |
| "Your rate is already at or below the lowest market rate." | Market minimum ≥ your rate | None |
| "Fixed rate - no benchmark alerts." | Rate type Fixed | — |
| "Set what the rate is linked to (repo or MCLR) in Edit to get change alerts." | Floating with **Linked to** not set or **Other / not sure** | Set **Linked to** in Edit |
| "No benchmark data yet." | Floating repo/MCLR loan but no benchmark rows yet (for example an MCLR loan with LIC Housing Finance) | — |
| "Your lender isn't on our MCLR list, so this shows the repo rate." | MCLR loan whose lender name does not match a tracked lender | Use the lender's standard name |
| Toast "Couldn't save the rate type" | Saving the rate type failed | Try again |

**Limitations:** "Indicative. Lenders price by credit score, amount and tenure; switching costs are estimates." The comparison re-amortises the outstanding balance over the same remaining months at both rates; it ignores prepayment penalties and your credit profile. Only these lender names are matched for MCLR: SBI, HDFC Bank, ICICI Bank, Axis Bank, Kotak, PNB, Bank of Baroda, Canara Bank, Union Bank, LIC Housing Finance (with common short forms); look-alikes such as "PNB Housing Finance" do not match.

**How it works:** `GET /api/loans/:id/market-check` returns the loan's outstanding, remaining EMIs and next EMI date (from the same summary as F-LOAN-005), the best market rate for the loan's type (lowest effective minimum rate that is not stale and lies within 4–30%), and for Floating loans the benchmark series (repo, or the matched lender's 1-year MCLR; MCLR with an unmatched lender falls back to repo). The browser computes: switching cost = outstanding × fee% ÷ 100 + other charges (rounded half-up to paise); both plans are built with the shared EMI engine over the remaining months; gross saving = current interest − new interest; net saving = gross − switching cost; break-even = first month whose cumulative EMI difference covers the costs (only when net saving > 0). **Open in calculator** encodes the outstanding (rounded to rupees), the market rate, the remaining months, the next EMI date, the fee as a % with GST 0 and the other charges into an `/emi` share link.

**Related features:** F-LOAN-013, F-EMI-001, F-EMI-007, F-EMI-010, D-LOAN-002.

**Sources:** `apps/web/src/pages/loans/MarketCheckCard.tsx:17`, `apps/web/src/pages/loans/MarketCheckCard.tsx:50`, `apps/web/src/pages/loans/MarketCheckCard.tsx:81`, `apps/web/src/pages/loans/MarketCheckCard.tsx:100`, `apps/web/src/pages/loans/MarketCheckCard.tsx:129`, `apps/web/src/pages/loans/MarketCheckCard.tsx:135`, `apps/web/src/pages/loans/MarketCheckCard.tsx:150`, `apps/web/src/pages/loans/MarketCheckCard.tsx:162`, `apps/web/src/pages/loans/marketCheck.ts:27`, `apps/web/src/pages/loans/marketCheck.ts:44`, `apps/web/src/pages/loans/marketCheck.ts:69`, `packages/api/src/services/loans/loanChecks/marketCheck.service.ts:45`, `packages/api/src/services/loans/loanChecks/marketCheck.service.ts:61`, `packages/api/src/services/loans/loanChecks/marketCheck.service.ts:92`, `packages/api/src/services/loans/loanChecks/lenderAlias.ts:8`, `packages/shared/src/loans/loanChecks.ts:55`, `packages/shared/src/loans/loanChecks.ts:88`

### Linked vehicle and property on a loan <!-- F-LOAN-011 -->
**What it does:** When a loan carries a link to a vehicle or a rental property, the loan page shows a **Linked vehicle** card ("View vehicle details →") or a **Linked property** card ("View property details →") that opens that record.

**Why it exists:** Inferred from behavior: a car loan or home loan belongs to an asset tracked elsewhere in the app.

**Where to find it:** Loan detail page (route `/loans/:id`), below the market card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Open a loan that has a link. Click **View vehicle details →** or **View property details →**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **View vehicle details →** | Link | Opens `/vehicles/:id` (D-LOAN-005) | Hidden when no vehicle is linked |
| **View property details →** | Link | Opens `/rental/:id` (D-LOAN-005) | Hidden when no rental property is linked |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Navigation only.

**Errors and troubleshooting:** None found.

**Limitations:** No screen in the Loans module sets these links — the add and edit forms have no vehicle or property field; the link exists only if it was saved through the API. Treat this card as rarely visible.

**How it works:** The loan record has optional `vehicleId` and `rentalPropertyId` columns accepted by `POST/PATCH /api/loans`; the web forms never send them.

**Related features:** D-LOAN-005.

**Sources:** `apps/web/src/pages/loans/LoanDetailPage.tsx:1221`, `packages/api/src/controllers/loans.controller.ts:44`, `packages/api/prisma/schema.prisma:3049`

### EMI due and overdue reminders <!-- F-LOAN-012 -->
**What it does:** Creates reminders in **Alerts** for each active loan taken: "<lender> EMI due in N days" 30, 15, 7 and 1 days before the next unpaid EMI, "<lender> EMI due today" on the day, and "<lender> EMI overdue by N days" for a missed EMI. The description reads "EMI of ₹<amount> due on <date>" (or "was due on").

**Why it exists:** Inferred from behavior: to warn before an EMI debit and to flag an EMI you have not marked paid.

**Where to find it:** **Alerts** page and the dashboard's alert list (D-LOAN-001); dashboard links for these alerts open `/loans`.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (alerts are created for the loan's owner, including managed profiles).

**Steps:** Not applicable — automatic. Keep EMIs marked paid (F-LOAN-008) so reminders stop once paid.

**Controls:** None in this module.

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-LOAN-007 **Status** — only **Active** loans are scanned. There is no per-user switch for these reminders.

**Results:** One alert per EMI date and stage (each threshold, and once for overdue); repeats are suppressed by a stored key.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| No overdue alert for an old missed EMI | Overdue alerts only cover EMIs due after the loan was added to the app and at most 30 days late | Expected |
| Reminder for an EMI already paid | The EMI was not recorded as paid | Mark it paid on the schedule |

**Limitations:** The scan runs once a day at 20:45 IST (and when the Alerts page triggers a scan), so a reminder can appear up to a day after the threshold is reached if the scan is missed. The amount in the description uses Western digit grouping (for example "₹12,345.00" but "₹1,234,567.00") and an ISO date ("2026-11-05"). A loan whose schedule cannot be built is skipped silently.

**How it works:** The daily alert job lists users and, for each, runs the scanners under that user's database context. For each active loan it rebuilds the schedule and picks one EMI: the latest unpaid EMI dated before today, on or after the date the loan was added and at most 30 days late (overdue); otherwise the next unpaid EMI from today when it is exactly 30, 15, 7, 1 or 0 days away. It creates an alert of type `LOAN_EMI_DUE` unless one with the same key (`loan_emi:<loan>:<emi date>:<stage>`) exists.

**Related features:** F-LOAN-008, D-LOAN-001.

**Sources:** `packages/api/src/services/loans/loans.service.ts:46`, `packages/api/src/services/loans/loans.service.ts:53`, `packages/api/src/services/loans/loans.service.ts:910`, `packages/api/src/services/loans/loans.service.ts:944`, `packages/api/src/services/loans/loans.service.ts:988`, `packages/api/src/services/loans/loans.service.ts:995`, `packages/api/src/jobs/alertJobs.ts:25`, `packages/api/src/jobs/alertJobs.ts:48`, `packages/api/src/services/notifications/alerts.service.ts:339`

### Refinance and benchmark-change alerts <!-- F-LOAN-013 -->
**What it does:** Every morning, checks each active loan taken against live lender rates and benchmark rates and creates two kinds of alert. **Refinance**: "<Loan type> with <lender> at X%; market from Y%" — "Switching could save ≈ ₹… after switching costs (lowest: <lender>). Open the loan to compare." **Benchmark change** (floating loans): "RBI cut the repo rate by 0.25% on <date>" or "<lender> raised its 1-year MCLR by …" — "Your <lender> loan rate should drop at the next reset (≈ <date>). Estimated: EMI ≈ ₹… or tenure −N months, assuming the full change is passed on."

**Why it exists:** The Settings description says: "Tell me when I could save by refinancing a loan, and when the repo rate or my lender's MCLR changes" — checked every morning against live lender rates and RBI / MCLR changes.

**Where to find it:** **Alerts** (D-LOAN-001), labelled **Loan refinance** and **Loan rate change**; clicking opens the loan (`/loans/:id`). Turned on or off in **Settings → Notifications → Loan rate alerts** (D-LOAN-002).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO with **Loan rate alerts** on (default on); managed family profiles are included.

**Steps:** Not applicable — automatic. Set your loan's **Rate type** and **Linked to** (F-LOAN-003) to receive benchmark alerts.

**Controls:** None in this module.

**Fields and rules:** Not applicable.

**Settings and toggles here:** **Loan rate alerts** (Settings, D-LOAN-002) — on: included in the daily check; off: no refinance or benchmark alerts. S-LOAN-003 **Rate type** / S-LOAN-004 **Linked to** — only **Floating** loans linked to **Repo rate (EBLR)** or **MCLR** get benchmark alerts; MCLR alerts need a lender name that matches a tracked lender. S-LOAN-005 **Next rate reset** — used to estimate the reset date in the alert. S-LOAN-001 **Loan type** **Other** gets no refinance alert.

**Results:** At most one refinance alert per loan per calendar month, and one benchmark alert per loan per benchmark change.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| No refinance alert though the market looks cheaper | Your rate is less than 0.50 percentage points above the market minimum, or the net saving after default costs (0.5% + ₹10,000) is 0 or less | Use **Compare with market** (F-LOAN-010) with your own costs |
| No benchmark alert after an RBI change | Loan not Floating/linked, loan added after the change was seen, change older than 30 days or larger than 1.00 point, or **Loan rate alerts** off | Set the rate fields; check the setting |

**Limitations:** Runs once a day at 07:30 IST right after the rate refresh; admin "Run now" refreshes rates without running these checks. Market rates come from lender web pages and can be missing or stale (F-EMI-010). Estimates assume the full benchmark change is passed on.

**How it works:** At 07:30 IST the job refreshes rates, then (even if the refresh failed) runs the checks. Under a system context it reads benchmark changes — for repo and each lender's 1-year MCLR, the net move from the last row fetched before a 7-day window to the latest row in it, skipped when zero, larger than 1.00 point, dated in the future or more than 30 days ago — and the eligible users (owners of active loans who are active, not scheduled for deletion, opted in, and not a CA-owned shadow client unless managed). Each user's loans are then checked under that user's context. Refinance: loan type maps to a market type; skip if current rate − market minimum < 0.50; compute net saving with the default costs over the loan's remaining EMIs; alert if > 0, key `loan:refi:<loan>:<YYYY-MM>`. Benchmark: for each applicable change fetched after the loan was created, estimate the new EMI over the remaining months and the tenure change at the current EMI, roll the stored reset date forward by 3 months (repo) or 12 months (MCLR) to on/after today, key `loan:bench:<loan>:<kind>:<date>`. One market lookup per loan type is shared across users; a failure on one loan or user is logged and the rest continue.

**Related features:** F-LOAN-010, F-EMI-010, D-LOAN-001, D-LOAN-002.

**Sources:** `packages/api/src/jobs/loanRatesJob.ts:120`, `packages/api/src/jobs/loanRatesJob.ts:141`, `packages/api/src/jobs/loanChecksJob.ts:34`, `packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:22`, `packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:44`, `packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:93`, `packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:159`, `packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:178`, `packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:202`, `packages/api/src/services/loans/loanChecks/loanAlertText.ts:29`, `packages/api/src/services/loans/loanChecks/loanAlertText.ts:63`, `packages/shared/src/loans/loanChecks.ts:34`, `packages/shared/src/loans/loanChecks.ts:53`, `apps/web/src/pages/settings/LoanRateAlertsCard.tsx:53`, `apps/web/src/pages/alerts/alertLinks.ts:15`

