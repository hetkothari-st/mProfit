# EveryPaisa User Manual — Loans, EMI Calculator and Credit Cards (B04 fragment)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Loans (`/loans`, `/loans/:id`, `/loans/given/:id`), EMI Calculator (`/emi`), Credit Cards (`/credit-cards`, `/credit-cards/:id`)

## Contents
- [Loans](#loans)
- [EMI Calculator](#emi-calculator)
- [Credit Cards](#credit-cards)
- [Roles and profiles](#roles-and-profiles)
- [Glossary](#glossary)

<!-- BEGIN MODULES -->
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

### Loans given list <!-- F-LOAN-016 -->
**What it does:** The **Loans given** section lists money you have lent, one card per loan: the borrower's name, relationship and "Lent <date>", a status badge (**Active**, **Settled**, **Written off**), **Still owed** with "of ₹<lent>" and the yearly interest rate (when above 0), a progress bar (EMI loans show instalment blocks and an "x/y instalments done" bar), and for active loans the next payment: "₹… due <date>" or, in red with a warning icon, "₹… overdue by N days". Active loans come first; closed ones are listed under **Settled / Written off**, faded.

**Why it exists:** The section subtitle states it: "Money you have lent — what they owe, repayments and interest". The empty state: "Lent money to a friend, relative or business? Track what they owe, repayments, interest and due dates here."

**Where to find it:** **Asset Classes → Loans → Loans given** section, or **Given** in the switcher (route `/loans?view=given`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Open **Asset Classes → Loans** and click **Given** (or scroll down).
2. Read each card. An overdue loan has a red border.
3. Click a card (or press Enter on it) to open its detail page (F-LOAN-018).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Loan-given card | Link (role link) | Opens `/loans/given/:id` | Never |
| **Lend money** | Button | Opens **Lend money** (F-LOAN-017) | Never |
| **Record a loan you gave** | Button (empty state) | Opens **Lend money** | Shown only with no loans given |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing is changed.

**Errors and troubleshooting:** None specific — while loading, two placeholder cards show.

**Limitations:** Sorted by the date lent, newest first; no search or filter. The section shows no error message if loading fails (it shows nothing).

**How it works:** `GET /api/loans-given` returns each loan with its ledger entries and a server-computed summary (see F-LOAN-018). For flexible loans the progress bar = (repaid + forgiven) ÷ lent, capped at 100%.

**Related features:** F-LOAN-001, F-LOAN-017, F-LOAN-018.

**Sources:** `apps/web/src/pages/loans/given/LoansGivenSection.tsx:16`, `apps/web/src/pages/loans/given/LoansGivenSection.tsx:79`, `apps/web/src/pages/loans/given/LoansGivenSection.tsx:99`, `apps/web/src/pages/loans/given/LoansGivenSection.tsx:136`, `apps/web/src/pages/loans/given/LoansGivenSection.tsx:157`, `packages/api/src/services/loans/loansGiven.service.ts:479`

### Lend money / edit a loan given <!-- F-LOAN-017 -->
**What it does:** The **Lend money** dialog (titled **Edit loan given** when editing) records who you lent to, how much, when, the yearly interest rate and how it will be repaid — **Whenever** (flexible, with an optional date you expect it back by) or **Monthly EMI** (EMI amount, number of months, first EMI date).

**Why it exists:** Inferred from behavior: to track receivables separately from loans you owe; the schema notes that every reader of loans taken treats a row as debt, so money lent is kept apart.

**Where to find it:** **Loans given → Lend money** or **Record a loan you gave** (route `/loans`); **Edit** on a loan-given page (route `/loans/given/:id`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Lend money**. The dialog opens with **Lent on** set to today and **Whenever** selected.
2. Fill **Lent to**, optionally **Relationship (optional)** and **Phone or email (optional)**.
3. Fill **Amount lent (₹)**; optionally **Interest % / yr** (leave empty for interest-free).
4. Under **How will it be repaid?** choose **Whenever** ("Repaid in any amounts, any time") and optionally **Expected back by (optional)** — "You'll get reminders before this date." — or **Monthly EMI** ("Fixed amount every month") and fill **EMI (₹)**, **Months** and **First EMI on**.
5. Optionally add **Notes (optional)**.
6. Click **Add loan** (or **Save changes**). The toast "Loan added" / "Loan updated" appears; a new loan opens on its detail page.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Whenever** / **Monthly EMI** | Toggle buttons | Choose repayment mode; show the matching fields | — |
| **Cancel** | Button | Closes | Disabled while saving |
| **Add loan** / **Save changes** | Submit button | Saves | Disabled (spinner) while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Lent to** | Text | Yes | 1–200 characters (server, trimmed) | Empty | "Enter who you lent to" |
| **Relationship (optional)** | Select: —, Friend, Family, Colleague, Business, Other | No | — | — | — |
| **Phone or email (optional)** | Text | No | Up to 200 characters | Empty | — |
| **Amount lent (₹)** | Text | Yes | Number > 0; commas, spaces and ₹ are stripped | Empty | "Enter the amount lent" |
| **Lent on** | Date | Yes | YYYY-MM-DD | Today | — |
| **Interest % / yr** | Text | No | Plain number; empty = 0 ("0 = interest-free") | Empty | "Enter the interest rate as a number, e.g. 12" |
| **Expected back by (optional)** | Date (Whenever only) | No | Not before **Lent on** (date picker minimum) | Empty | — |
| **EMI (₹)** | Text (Monthly EMI only) | Yes for EMI | Number > 0 | Empty | "Enter the EMI amount" |
| **Months** | Digits (Monthly EMI only) | Yes for EMI | Whole number ≥ 1 (server max 600) | Empty | "Enter the number of monthly instalments" |
| **First EMI on** | Date (Monthly EMI only) | Yes for EMI | Not before **Lent on** | Empty | "Pick the first EMI date" |
| **Notes (optional)** | Text area | No | Up to 5000 characters | Empty | — |

**Settings and toggles here:** S-LOAN-010 **How will it be repaid?** — **Whenever**: balance = lent − repaid − forgiven, simple interest accrues daily, reminders use **Expected back by**; **Monthly EMI**: an instalment schedule is generated and reminders follow the next unpaid instalment. Switching mode on edit clears the other mode's fields.

**Results:** The loan is saved. Summary, schedule and reminders are recomputed from the terms on every read.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Messages listed in the table above | Client checks | Correct the field |
| "EMI loans need the EMI amount, number of months and first EMI date" | Server check when EMI terms are incomplete | Fill all three |
| "Could not save the loan" or the server's message | Other server error | Retry |

**Limitations:** The EMI amount is not computed for you — type the agreed instalment. There is no check that EMI × months covers the amount lent plus interest.

**How it works:** `POST /api/loans-given` / `PATCH /api/loans-given/:id`. The server validates amounts as positive decimal strings, the relationship as one of FRIEND / FAMILY / COLLEAGUE / BUSINESS / OTHER and tenure 1–600, and refuses EMI mode without all three EMI terms. On save, the web invalidates the loans-given caches.

**Related features:** F-LOAN-016, F-LOAN-018, F-LOAN-020, F-LOAN-022.

**Sources:** `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:28`, `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:113`, `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:149`, `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:225`, `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:263`, `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:330`, `packages/api/src/controllers/loansGiven.controller.ts:26`, `packages/api/src/services/loans/loansGiven.service.ts:450`, `packages/api/src/services/loans/loansGiven.service.ts:458`, `packages/api/prisma/schema.prisma:2997`

### Loan given detail page <!-- F-LOAN-018 -->
**What it does:** Shows one loan given: the borrower's initials, name, status badge and a line "<relationship> · <contact> · Monthly EMI / Flexible repayment · X% p.a. / Interest-free"; an overdue banner when a payment is late; a summary panel (**Still owed to you** or **Lent**, "of ₹… lent on <date>", progress bar with "N of M EMIs" or "₹… back") and four figures (**Next payment** or **Closed on**, **Received so far**, then **Left to receive** / **Interest due** / **Expected back by**, then **Forgiven** / **EMI** / **Interest received**); the EMI **Repayment schedule** (EMI loans); **History** ("Every payment, top-up and write-off, newest first", ending with the original **Lent** row); **Terms**; **Notes**; and **Proof & documents**.

**Why it exists:** Inferred from behavior: one page to see what a borrower still owes, what has come back and the agreed terms, with proof attached.

**Where to find it:** Click a card in **Loans given** (route `/loans/given/:id`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Open the loan from **Loans given**.
2. If overdue, the banner reads "₹… overdue by N days" with "EMI N was due <date>" (or "Was due <date>") and "· N EMIs behind" when several are late. For EMI loans click **Mark EMI N paid** to settle the oldest open instalment.
3. Use **Record payment** / **Add entry**, **Edit** and **More actions** (⋯) as described in F-LOAN-019 and F-LOAN-021.
4. Click **Back to loans** to return to the given section.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Back to loans** | Link | Opens `/loans?view=given` | Never |
| **Record payment** (flexible) / **Add entry** (EMI) | Button | Opens the entry dialog (F-LOAN-019) | Hidden when the loan is not Active |
| **Edit** | Button | Opens **Edit loan given** (F-LOAN-017) | Never |
| **More actions** (⋯) | Menu | **Mark settled**, **Write off** (active) or **Reopen** (closed); **Delete loan** | — |
| **Mark EMI N paid** | Button (overdue banner) | Marks the oldest open instalment paid | Shown only for overdue EMI loans; disabled while saving |
| **Remove entry** (bin on a History row) | Icon button | Deletes that entry immediately | Disabled while another action runs |

**Fields and rules:** Not applicable — view only (entry forms are in F-LOAN-019).

**Settings and toggles here:** S-LOAN-010 **How will it be repaid?** decides which figures and the schedule appear.

**Results:** Viewing changes nothing.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This loan could not be found." with **Back to loans given** | Wrong id, deleted, or not yours | Go back |
| Toast "Could not update the EMI" | **Mark EMI N paid** failed | Retry |

**Limitations:** **Remove entry** deletes without asking for confirmation. For EMI loans, **Still owed to you** is the principal left on a standard amortising loan after the number of full instalments' worth of money received, not the sum of unpaid instalments.

**How it works:** `GET /api/loans-given/:id`. Summary (server): lent = principal + extra lent; **Received so far** = repayments + interest received. Flexible loans: still owed = lent − repaid − forgiven (not below 0); with interest > 0, simple interest accrues day by day at rate ÷ 100 ÷ 365 on the balance between ledger events (interest received does not reduce the balance), up to today or the closing date; **Interest due** = accrued − interest received; next payment = still owed + interest due on the expected-back date. EMI loans: expected total = EMI × months + extra lent; k = whole instalments covered by (received + forgiven); still owed = P(1+r)^k − EMI × ((1+r)^k − 1) ÷ r with r = rate ÷ 1200 (P − EMI × k when interest-free), plus extra lent, minus any money beyond k instalments; **Left to receive** = expected total − (received + forgiven); next payment = the first instalment not fully covered. **Overdue by** = days since that date. Dates are UTC calendar days.

**Related features:** F-LOAN-019, F-LOAN-020, F-LOAN-021, F-LOAN-022, D-LOAN-006.

**Sources:** `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:241`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:310`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:355`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:435`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:474`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:567`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:620`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:646`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:693`, `packages/api/src/services/loans/loansGiven.service.ts:244`, `packages/api/src/services/loans/loansGiven.service.ts:290`, `packages/api/src/services/loans/loansGiven.service.ts:330`

### Record a repayment or other entry on a loan given <!-- F-LOAN-019 -->
**What it does:** Adds an entry to a loan given's ledger: **Repayment received** (flexible) or **Lump-sum repayment** (EMI), **Interest received** (only for loans with interest), **Lent more money**, or **Forgave part of it** — each with an amount, date and note. Entries can be removed from **History**.

**Why it exists:** Inferred from behavior: every figure on the loan is derived from this ledger, so one-off events (a partial return, a top-up, a write-down) are recorded as entries.

**Where to find it:** Loan given page → **Record payment** (flexible) or **Add entry** (EMI) (route `/loans/given/:id`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Record payment** (or **Add entry**). For EMI loans the dialog notes: "For a lump sum, extra money lent or interest. Regular EMIs are quicker from the schedule."
2. Choose **What happened?**, enter **Amount (₹)** and **Date** (today by default) and an optional **Note (optional)** (placeholder "e.g. UPI, cash").
3. Click **Add**. The toast "Entry added" appears.
4. To remove an entry, click the bin on its **History** row. The toast "Entry removed" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cancel** / **Add** | Buttons | Close / save | Disabled while saving |
| **Remove entry** (bin) | Icon button | Deletes the entry, no confirmation | On hover (desktop) |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **What happened?** | Select | Yes | Repayment / Interest received (interest loans only) / Lent more money / Forgave part of it | Repayment | — |
| **Amount (₹)** | Text | Yes | Number > 0; commas, spaces, ₹ stripped | Empty | "Enter an amount greater than 0" (server: "Amount must be greater than 0") |
| **Date** | Date | Yes | YYYY-MM-DD | Today | — |
| **Note (optional)** | Text | No | Up to 1000 characters | Empty | — |

**Settings and toggles here:** None.

**Results:** The entry is stored and the summary, schedule and reminders recompute. On EMI loans an untied repayment or forgiveness fills the oldest instalments first; interest received counts toward instalments too.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Enter an amount greater than 0" | Empty, zero or non-numeric amount | Correct it |
| "Could not add the entry" or a server message | Server error | Retry |
| Toast "Something went wrong" on remove | Server error | Retry |

**Limitations:** Entries cannot be edited, only removed and re-added. Removing a write-off's forgiveness entry is the only way to undo its effect on the balance after **Reopen**.

**How it works:** `POST /api/loans-given/:id/entries` (kind REPAYMENT, INTEREST_RECEIVED, ADDITIONAL_LENT or WAIVER); `DELETE /api/loans-given/entries/:entryId` checks ownership through the parent loan. Both return the refreshed loan.

**Related features:** F-LOAN-018, F-LOAN-020.

**Sources:** `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:63`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:102`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:113`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:130`, `packages/api/src/controllers/loansGiven.controller.ts:41`, `packages/api/src/services/loans/loansGiven.service.ts:533`, `packages/api/src/services/loans/loansGiven.service.ts:540`, `packages/api/src/services/loans/loansGiven.service.ts:554`

### EMI repayment schedule for a loan given <!-- F-LOAN-020 -->
**What it does:** For a loan given on **Monthly EMI**, the **Repayment schedule** card ("₹… every month · N EMIs from <date>") lists each instalment: **#**, **Due** (and "paid <date>" when paid on another day), **EMI**, **Interest** and **Principal** (interest-bearing loans only), **Received** (with "₹… forgiven" and "₹… left"), **Status** (**Paid**, **Forgiven**, **Partly paid** — "· late" when overdue — **Overdue**, **Due soon**, **Pending**) and one-click actions. Badges show "N of M done", "N partial" and "N overdue".

**Why it exists:** Inferred from behavior: monthly instalments from a friend or relative are usually ticked off one by one.

**Where to find it:** Loan given page → **Repayment schedule** (route `/loans/given/:id`), shown only for EMI loans.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person. Actions only while the loan is **Active**.

**Steps**
1. On an open instalment click **Paid** — the toast "EMI N marked paid" appears.
2. Or click **Partial**, enter **Received (₹)** and **On** in **Part payment · EMI N** ("₹… was due <date>. Anything above the EMI counts toward the next ones."), then **Save** — the toast "EMI N updated" appears.
3. From **More options for EMI N** (⋯) choose **Forgive this EMI**, **Change amount** (paid rows) or **Mark pending** (rows marked from the schedule).
4. On a paid row, **Undo** clears its marks ("EMI N marked pending"). A row covered by a History repayment shows "From history" instead.
5. Click **Show all N EMIs** to unfold a long schedule; **Show fewer** to fold it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Paid** | Button | Adds a repayment for what the instalment still needs | On rows not fully covered; hidden when loan not Active; desktop shows later rows' actions on hover |
| **Partial** | Button | Opens **Part payment · EMI N** | As above |
| **Undo** | Button | Clears the instalment's marks | On fully covered rows marked from the schedule |
| "From history" | Label | Row covered by an untied ledger repayment | — |
| **Forgive this EMI** | Menu item | Adds a forgiveness for what the instalment still needs | Hidden on forgiven rows |
| **Change amount** | Menu item | Opens **Part payment** on a covered row | Only on fully covered rows |
| **Mark pending** | Menu item | Clears the instalment's marks | Only on rows marked from the schedule |
| **Show all N EMIs** / **Show fewer** | Button | Fold / unfold | Shown when more than 12 EMIs and rows remain below the fold |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Received (₹)** | Text | Yes | Number > 0 | Empty | "Enter the amount received" |
| **On** | Date | Yes | YYYY-MM-DD | Due date if past, otherwise today | — |

**Settings and toggles here:** None.

**Results:** **Paid** / **Forgive** add a repayment / forgiveness entry tied to that instalment for the amount it still needs, dated on the due date (or today if not yet due). **Partial** replaces that instalment's earlier marks with one repayment of the amount typed. **Undo** / **Mark pending** delete the instalment's marked entries (untied History repayments still count).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Reopen the loan to update its instalments" | Loan is settled or written off | **Reopen** first (F-LOAN-021) |
| "Only EMI loans have instalments" / "This loan has N instalments" | Server checks | — |
| Toast "Could not update the EMI" | Other error | Retry |

**Limitations:** **Interest** and **Principal** columns are an indicative amortisation split; what you receive is matched to instalments by amount, not split into principal and interest. "Due soon" means within 7 days.

**How it works:** `PUT /api/loans-given/:id/installments/:no` with action PAID, PARTIAL, WAIVED or PENDING. The schedule is computed from the terms and the ledger: marked entries fill their own instalment first (overflow joins the pool), then untied repayments, interest received and forgiveness fill instalments oldest first, in date order. Status: fully covered → Paid (or Forgiven if nothing was paid); partly covered → Partly paid; uncovered and past due → Overdue; due within 7 days → Due soon; otherwise Pending. The partial update runs in one database transaction.

**Related features:** F-LOAN-018, F-LOAN-019, F-LOAN-022.

**Sources:** `apps/web/src/pages/loans/given/EmiScheduleCard.tsx:33`, `apps/web/src/pages/loans/given/EmiScheduleCard.tsx:57`, `apps/web/src/pages/loans/given/EmiScheduleCard.tsx:67`, `apps/web/src/pages/loans/given/EmiScheduleCard.tsx:118`, `apps/web/src/pages/loans/given/EmiScheduleCard.tsx:162`, `apps/web/src/pages/loans/given/EmiScheduleCard.tsx:212`, `apps/web/src/pages/loans/given/EmiScheduleCard.tsx:310`, `apps/web/src/pages/loans/given/EmiScheduleCard.tsx:450`, `apps/web/src/pages/loans/given/InstallmentStatusChip.tsx:4`, `packages/api/src/services/loans/loansGiven.service.ts:112`, `packages/api/src/services/loans/loansGiven.service.ts:118`, `packages/api/src/services/loans/loansGiven.service.ts:580`, `packages/api/src/services/loans/loansGiven.service.ts:587`

### Settle, write off, reopen or delete a loan given <!-- F-LOAN-021 -->
**What it does:** From **More actions** (⋯) on a loan given: **Mark settled** closes it as fully settled on a date; **Write off** forgives the principal still owed and closes it; **Reopen** returns a closed loan to Active; **Delete loan** removes it and its whole history.

**Why it exists:** The dialogs explain: settling "Closes the loan. Record any final repayment first so the history is complete."; writing off "Forgives the ₹… still owed and closes the loan. You can reopen it later."; deleting "Deletes the loan and its whole history. This cannot be undone."

**Where to find it:** Loan given page → **More actions** (⋯) (route `/loans/given/:id`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **More actions** (⋯), then **Mark settled**, **Write off**, **Reopen** or **Delete loan**.
2. For settle and write-off, confirm or change **Date** (today by default) in **Mark as settled?** / **Write off this loan?**, then click **Mark settled** / **Write off**.
3. For delete, click **Delete** in **Delete this loan?**. You return to the given section with "Loan deleted".
4. **Reopen** acts immediately ("Reopened").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Mark settled** | Menu item → dialog button | Closes as settled | Menu item only for Active loans |
| **Write off** | Menu item → dialog button | Forgives what is owed and closes | Only for Active loans |
| **Reopen** | Menu item | Back to Active | Only for closed loans |
| **Delete loan** / **Delete** | Menu item → dialog button | Deletes everything | Always |
| **Cancel** | Button | Closes the dialog | Disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Date** | Date (settle, write-off) | Yes | YYYY-MM-DD | Today | Toast with the server message, or "Something went wrong" |

**Settings and toggles here:** None.

**Results:** Settled → status **Settled**, closed on the date; the loan stops counting as owed to you and stops accruing interest. Write off → a forgiveness entry for the principal still owed (note "Written off" unless given) plus status **Written off**. Reopen → status Active, closing date cleared; a write-off's forgiveness entry stays until you remove it. Delete → the loan and its entries are removed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Toast "Something went wrong" or the server's message | Server error | Retry |

**Limitations:** **Mark settled** does not check that the balance is 0 and adds no entry; a settled flexible loan may still show money owed on its card. Write-off forgives principal only; interest due on a flexible loan is not separately written off.

**How it works:** `POST /api/loans-given/:id/settle` and `/write-off` take `{ date, notes? }`; write-off computes the outstanding principal and, in one transaction, creates the WAIVER entry and sets status WRITTEN_OFF. `POST /api/loans-given/:id/reopen`; `DELETE /api/loans-given/:id` (entries cascade). Only active loans are counted by the dashboard, the will estate and reminders.

**Related features:** F-LOAN-018, F-LOAN-019.

**Sources:** `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:264`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:394`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:698`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:712`, `packages/api/src/controllers/loansGiven.controller.ts:55`, `packages/api/src/services/loans/loansGiven.service.ts:630`, `packages/api/src/services/loans/loansGiven.service.ts:640`, `packages/api/src/services/loans/loansGiven.service.ts:664`, `packages/api/src/services/loans/loansGiven.service.ts:678`

### Repayment-due reminders for loans given <!-- F-LOAN-022 -->
**What it does:** Creates reminders in **Alerts** for each active loan given with a next payment: "<borrower>'s repayment is due in N days" 30, 15, 7 and 1 days before, and "<borrower>'s repayment is overdue by N days" once it is late, with "₹<amount> due on <dd/mm/yyyy>" (or "was due on").

**Why it exists:** The form promises it under **Expected back by**: "You'll get reminders before this date."

**Where to find it:** **Alerts** and the dashboard alert list (D-LOAN-001); dashboard links for these alerts open `/loans?view=given`.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps:** Not applicable — automatic. Set **Expected back by** (flexible) or EMI terms so the loan has a next payment.

**Controls:** None in this module.

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-LOAN-010 **How will it be repaid?** — flexible loans are reminded only when **Expected back by** is set and something is owed; EMI loans follow the first instalment not fully covered.

**Results:** One alert per due date and stage; the overdue alert is created once per due date.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| No reminder | No **Expected back by** date, nothing owed, or the loan is closed | Set a date or reopen |

**Limitations:** Daily at 20:45 IST (or when the Alerts page triggers a scan). There is no reminder on the due day itself (thresholds are 30, 15, 7 and 1 days). The amount uses Western digit grouping.

**How it works:** Same daily job as F-LOAN-012. For each active loan given, the summary's next due date and amount are used; an alert of type `LOAN_GIVEN_DUE` is created when days left is 30, 15, 7 or 1, or below 0, unless one with key `loan_given:<loan>:<due date>:<stage>` exists.

**Related features:** F-LOAN-017, F-LOAN-020, D-LOAN-001.

**Sources:** `packages/api/src/services/loans/loansGiven.service.ts:35`, `packages/api/src/services/loans/loansGiven.service.ts:689`, `packages/api/src/services/loans/loansGiven.service.ts:725`, `packages/api/src/jobs/alertJobs.ts:48`

**What this area doesn't do**
- You can't import loans from a bank statement, CIBIL report or email here; loans are entered by hand (the onboarding quick-add is also manual).
- You can't link a loan to a vehicle or property from these screens.
- You can't reveal a loan's full account number in the web app.
- You can't edit a recorded loan payment or a ledger entry — delete and re-add it.
- The loans pages don't switch to family view; family totals are on the family dashboard (D-LOAN-009).
- Loans taken have no document vault; loans given do (**Proof & documents**).
- There is no per-loan switch to silence EMI reminders.

## EMI Calculator

The **EMI Calculator** (sidebar **Tools → EMI Calculator**, route `/emi`) plans a loan before or while you take it: "Plan a loan: EMI, prepayments, rate changes, fees, tax benefit and offers side by side." It has three tabs — **Calculate**, **Compare**, **Live rates** — and header buttons **Share**, **PDF** and **Excel**. Nothing you type is saved to your account: the whole calculator state lives in the page address so it can be bookmarked or shared. All maths runs in your browser with exact decimal arithmetic; the PDF and Excel files are rebuilt on the server from the same inputs.

### Calculate: EMI, maximum loan or tenure <!-- F-EMI-001 -->
**What it does:** Computes a loan from the inputs you give, in one of three modes: **EMI** (loan amount + rate + tenure → monthly EMI), **Max loan** (EMI you can pay + rate + tenure → "You can borrow"), **Tenure** (loan amount + EMI + rate → "Loan paid off in"). The **Result** card shows **Monthly EMI**, **Total interest**, **Total paid**, **Tenure**, **Fees + GST** (when fees are on), **APR (true yearly cost)** with "nominal X% p.a.", and when relevant **Interest saved by prepaying**, **Tax saved** and **Cost after tax**, plus a principal/interest donut and a balance chart.

**Why it exists:** The page description states it; inferred from behavior: to see the real cost of a loan, including fees, before signing.

**Where to find it:** **Tools → EMI Calculator → Calculate** (route `/emi`, default tab). **Open in calculator** on a loan's market card (F-LOAN-010) also opens it pre-filled.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN, and R-MANAGER (no plan gate; the calculator reads no account data).

**Steps**
1. Open **Tools → EMI Calculator**. Defaults: mode **EMI**, loan ₹25,00,000, rate 8.5%, 20 years, first EMI on the 5th of next month.
2. Pick the mode in the **Calculate** switch: **EMI**, **Max loan** or **Tenure**.
3. Type or drag the sliders for **Loan amount (Rs.)** (or **EMI you can pay (Rs.)**), **Interest rate (% p.a.)** and **Tenure** (with **Years** / **Months**).
4. Set **First EMI date**.
5. Read the **Result** card; it updates about 0.15 seconds after you stop typing.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **EMI** / **Max loan** / **Tenure** | Radio switch ("Calculate") | Chooses what is computed | — |
| Loan amount slider | Range ₹1,00,000–₹5,00,00,000, step ₹50,000 | Sets **Loan amount** | Hidden in Max loan mode |
| EMI slider | Range ₹1,000–₹5,00,000, step ₹500 | Sets **EMI you can pay** | Hidden in EMI mode |
| Rate slider | Range 5–20%, step 0.05 | Sets the rate | — |
| Tenure slider | 1–30 years or 12–360 months | Sets the tenure | Hidden in Tenure mode |
| **Years** / **Months** | Toggle | Unit of **Tenure** | Hidden in Tenure mode |
| **Advanced - prepayments, rate changes, fees, tax** | Expand button | Shows F-EMI-002, F-EMI-003, F-EMI-004 inputs | Opens automatically when an advanced field has an error |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Loan amount (Rs.)** | Text (commas, spaces, ₹ allowed) | Yes (EMI, Tenure modes) | > 0 and ≤ ₹100 crore | 25,00,000 | "Enter a loan amount above 0" / "Loan amount can be at most Rs. 100 crore" |
| **EMI you can pay (Rs.)** | Text | Yes (Max loan, Tenure modes) | > 0 | 25,000 | "Enter an EMI above 0"; Max loan: "This EMI is too small to give a loan" / "This EMI gives a loan above the Rs. 100 crore limit"; Tenure: "EMI never pays off the loan - it does not cover the monthly interest", "This EMI takes longer than 40 years to repay" |
| **Interest rate (% p.a.)** | Text | Yes | 0–50 | 8.5 | "Rate must be between 0% and 50%" |
| **Tenure** | Whole number | Yes (EMI, Max loan modes) | 1–480 months (40 years) | 20 (years) | "Tenure must be 1-480 months" |
| **First EMI date** | Date | Yes | A real date | 5th of next month (your local calendar) | "Pick a valid first EMI date" |

**Settings and toggles here:** S-EMI-001 **Calculate** mode — EMI / Max loan / Tenure; S-EMI-002 **Tenure unit** — Years / Months (also applies to the slider range).

**Results:** Nothing is stored. The address bar updates (after 0.4 s) with the full state.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Fix the highlighted fields to see your EMI." | One or more inputs invalid | Fix the messages under the fields (messages for hidden fields are listed in the result card) |
| "That EMI gives a tenure outside the allowed range: …" | Tenure mode with an EMI so small the tenure exceeds 480 months | Raise the EMI |
| "This loan would not be repaid within 100 years - check the EMI and rates" | Extreme combination of rate changes | Adjust inputs |
| Amber notes such as "A prepayment was larger than the balance - it was capped and closes the loan." | Warnings from the schedule (see F-EMI-002) | Informational |

**Limitations:** Amounts on screen are rounded to whole rupees on phones and in tables; the PDF and Excel keep paise. The EMI is rounded **up** to the next rupee, so the last instalment is smaller than the others.

**How it works:** EMI = P × r × (1+r)^n ÷ ((1+r)^n − 1) with r = annual rate ÷ 1200, rounded up to the whole rupee (minimum ₹1; P ÷ n at 0%). Max loan = EMI × ((1+r)^n − 1) ÷ (r × (1+r)^n), rounded down to the rupee. Tenure = ln(EMI ÷ (EMI − P × r)) ÷ ln(1 + r), rounded up. The schedule: each month interest = opening × r rounded half-up to paise; principal = EMI − interest; the final month pays the remaining balance plus interest. Totals: total paid = EMIs + prepayments; total cost = total paid + fees. APR: the monthly rate i at which the present value of all payments equals the amount received (loan − fees), found by bisection; shown as (1+i)^12 − 1 and as the nominal i × 12, both to 2 decimals. Calculations use 40 significant digits.

**Related features:** F-EMI-002, F-EMI-003, F-EMI-004, F-EMI-005, F-EMI-008, F-EMI-009, F-LOAN-010.

**Sources:** `apps/web/src/pages/emi/EmiCalculatorPage.tsx:19`, `apps/web/src/pages/emi/EmiCalculatorPage.tsx:36`, `apps/web/src/pages/emi/CalculateTab.tsx:13`, `apps/web/src/pages/emi/CalculateTab.tsx:45`, `apps/web/src/pages/emi/CalculateTab.tsx:68`, `apps/web/src/pages/emi/CalculateTab.tsx:93`, `apps/web/src/pages/emi/CalculateTab.tsx:108`, `apps/web/src/pages/emi/emiState.ts:53`, `apps/web/src/pages/emi/emiState.ts:84`, `apps/web/src/pages/emi/emiState.ts:126`, `apps/web/src/pages/emi/EmiResults.tsx:61`, `packages/shared/src/loans/emi.ts:22`, `packages/shared/src/loans/emi.ts:40`, `packages/shared/src/loans/emi.ts:49`, `packages/shared/src/loans/emi.ts:63`, `packages/shared/src/loans/emiWire.ts:23`, `packages/shared/src/loans/emiWire.ts:61`, `packages/shared/src/loans/apr.ts:33`

### Prepayments and rate changes <!-- F-EMI-002 -->
**What it does:** Under **Advanced**, adds one-off or yearly **Prepayments** (month number, amount, **Repeat** Once / Every year, **Effect** Cut tenure / Cut EMI) and **Rate changes (floating loans)** (from month number, new rate, **Bank adjusts** Tenure (keep EMI) / EMI (keep tenure)). The result then shows **Interest saved by prepaying** and the schedule shows a **Prepaid** column.

**Why it exists:** Inferred from behavior: to see how part-prepayments and floating-rate resets change the cost and end date of a loan.

**Where to find it:** **Tools → EMI Calculator → Calculate → Advanced - prepayments, rate changes, fees, tax** (route `/emi`).

**Who can use it:** All signed-in users (as F-EMI-001).

**Steps**
1. Click **Advanced - prepayments, rate changes, fees, tax**.
2. Click **Add prepayment** (adds month 12, ₹1,00,000, Once, Cut tenure); edit **Month #**, **Amount (Rs.)**, **Repeat**, **Effect**.
3. Click **Add rate change** (adds from month 13 at the current rate, Tenure (keep EMI)); edit **From month #**, **New rate (%)**, **Bank adjusts**.
4. Click **Remove** on a row to delete it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add prepayment** / **Add rate change** | Buttons | Add a row | — |
| **Remove** | Button (per row) | Deletes the row | — |
| **Repeat** | Select: Once / Every year | Yearly repeats every 12 months after the first | — |
| **Effect** | Select: Cut tenure / Cut EMI | What the prepayment changes | — |
| **Bank adjusts** | Select: Tenure (keep EMI) / EMI (keep tenure) | What the rate change changes | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Month #** | Whole number | Yes | 1–480 | 12 | "Month must be 1-480" |
| **Amount (Rs.)** | Text | Yes | > 0 | 1,00,000 | "Enter an amount above 0" |
| **From month #** | Whole number | Yes | 1–480, one change per month | 13 | "Month must be 1-480" / "Only one rate change per month" |
| **New rate (%)** | Text | Yes | 0–50 | Current rate | "Rate must be between 0% and 50%" |

**Settings and toggles here:** S-EMI-003 **Repeat**, S-EMI-004 **Effect**, S-EMI-005 **Bank adjusts**.

**Results:** The schedule, totals, APR and warnings recompute; nothing is stored. Up to 50 prepayments and 50 rate changes survive in a share link.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "A prepayment was larger than the balance - it was capped and closes the loan." | Amount above the balance | Informational |
| "After a rate rise the old EMI would not cover the interest, so the EMI was raised." | Keep-EMI rate rise too large | Informational |
| "Some prepayments fall after the loan is already repaid and were ignored." / "Some rate changes fall after the loan is already repaid and were ignored." | Month beyond the end | Informational |
| "The rate rise would stretch the loan past 40 years, so the EMI was raised to finish by then." | Keep-EMI change past month 480 | Informational |

**Limitations:** A prepayment is applied right after that month's EMI. **Interest saved by prepaying** compares with the same inputs without prepayments (rate changes kept).

**How it works:** In the shared schedule builder: at a rate-change month the rate switches; **EMI (keep tenure)** recomputes the EMI over the months left; **Tenure (keep EMI)** recomputes the end month, unless the EMI no longer covers the interest (EMI raised) or the end passes month 480 (EMI raised to finish by 480). After each EMI, due prepayments reduce the balance; **Cut EMI** recomputes the EMI over the remaining planned months, **Cut tenure** recomputes the end month.

**Related features:** F-EMI-001, F-EMI-005.

**Sources:** `apps/web/src/pages/emi/AdvancedInputs.tsx:7`, `apps/web/src/pages/emi/AdvancedInputs.tsx:28`, `apps/web/src/pages/emi/AdvancedInputs.tsx:40`, `apps/web/src/pages/emi/AdvancedInputs.tsx:46`, `apps/web/src/pages/emi/AdvancedInputs.tsx:57`, `apps/web/src/pages/emi/EmiResults.tsx:16`, `apps/web/src/pages/emi/CalculateTab.tsx:24`, `packages/shared/src/loans/emi.ts:78`, `packages/shared/src/loans/emi.ts:108`, `packages/shared/src/loans/emiWire.ts:89`

### Processing fee and charges (APR) <!-- F-EMI-003 -->
**What it does:** With **Processing fee and charges** switched on, adds a processing fee (**% of loan** or **Fixed Rs.**), **GST on fee (%)** and **Other charges (Rs.)**. The result shows **Fees + GST**, and **APR (true yearly cost)** rises above the nominal rate because you receive the loan minus the fees.

**Why it exists:** Inferred from behavior: two offers with the same rate can cost differently once fees are counted; the APR puts them on one scale.

**Where to find it:** **Tools → EMI Calculator → Calculate → Advanced → Processing fee and charges** (route `/emi`).

**Who can use it:** All signed-in users.

**Steps**
1. Tick **Processing fee and charges**.
2. Choose **Fee type**, then fill **Fee (%)** or **Fee (Rs.)**, **GST on fee (%)** (default 18) and **Other charges (Rs.)** (default 0).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Processing fee and charges** | Checkbox | Turns fees on/off | — |
| **Fee type** | Select: % of loan / Fixed Rs. | How the fee is given | Hidden when fees are off |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Fee (%)** / **Fee (Rs.)** | Text | Yes when on | % up to 10 | 0.5 | "Enter a fee (0 if none)" / "Fee can be at most 10%" |
| **GST on fee (%)** | Text | Yes when on | 0–28 | 18 | "GST must be 0-28%" |
| **Other charges (Rs.)** | Text | Yes when on | ≥ 0 | 0 | "Enter other charges (0 if none)" |
| (all fees together) | — | — | Must be less than the loan | — | "Fees can't be more than the loan" |

**Settings and toggles here:** S-EMI-006 **Processing fee and charges**, S-EMI-007 **Fee type**.

**Results:** Nothing is stored.

**Errors and troubleshooting:** As in the table above.

**Limitations:** Fees are treated as paid at the start (deducted from what you receive). GST applies to the processing fee only.

**How it works:** Fee = loan × % ÷ 100 (or the fixed amount), GST = fee × GST% ÷ 100, other charges as typed, each rounded half-up to paise; total = sum. APR uses (loan − total fees) as the amount received (see F-EMI-001).

**Related features:** F-EMI-001, F-EMI-006.

**Sources:** `apps/web/src/pages/emi/AdvancedInputs.tsx:63`, `apps/web/src/pages/emi/AdvancedInputs.tsx:66`, `packages/shared/src/loans/apr.ts:11`, `packages/shared/src/loans/emiWire.ts:104`, `packages/shared/src/loans/summary.ts:19`

### Tax benefit in the calculator <!-- F-EMI-004 -->
**What it does:** With **Tax benefit** switched on, estimates the income-tax saved each financial year for a home or education loan and shows **Tax saved**, **Cost after tax** and a **Tax benefit by year** table (**FY**, **Interest deduction**, **Principal (80C)**, **Tax saved**, and for a let-out home **Excess interest (carried forward, not valued)**).

**Why it exists:** Inferred from behavior: the after-tax cost is what matters when choosing a home or education loan.

**Where to find it:** **Tools → EMI Calculator → Calculate → Advanced → Tax benefit** (route `/emi`).

**Who can use it:** All signed-in users.

**Steps**
1. Tick **Tax benefit**.
2. Choose **Tax regime** (Old regime / New regime) and **Loan for** (Home - self-occupied, Home - let out, Education, Other (no benefit)).
3. Fill **Your tax slab (%)** and **80C room left (Rs.)**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Tax benefit** | Checkbox | Turns the estimate on/off | — |
| **Tax regime** | Select | Old / New | Hidden when off |
| **Loan for** | Select | Which deduction rules apply | Hidden when off |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Your tax slab (%)** | Text | Yes when on | 0–30 | 30 | "Tax slab must be 0-30%" |
| **80C room left (Rs.)** | Text | Yes when on | 0–1,50,000 | 1,50,000 | "80C room must be Rs. 0 - 1,50,000" |

**Settings and toggles here:** S-EMI-008 **Tax benefit**, S-EMI-009 **Tax regime**, S-EMI-010 **Loan for**. Choosing a lender's rate on **Live rates** sets **Loan for** to match its loan type (home → self-occupied unless already let out; education → Education; others → Other (no benefit)).

**Results:** Nothing is stored. The **Compare** tab uses the same tax settings.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No deduction under the new tax regime for this loan (self-occupied home loan interest and 80C/80E are not allowed)." | **New regime** chosen | Informational — tax saved is 0 |

**Limitations:** A simplified estimate: per financial year, self-occupied home: interest up to ₹2,00,000 plus principal (prepayments included) up to your 80C room; let-out home: interest up to ₹2,00,000 valued, the rest listed as carried forward but not valued, plus principal up to 80C room; education: all interest, for the first 8 financial years of the schedule. The same 80C room is applied in every year.

**How it works:** Schedule rows are grouped by Indian financial year (April–March). Tax saved per year = (interest deduction + principal deduction) × slab ÷ 100 × 1.04 (4% cess), rounded half-up to paise. **Cost after tax** = total cost − total tax saved.

**Related features:** F-EMI-001, F-EMI-006, F-LOAN-009.

**Sources:** `apps/web/src/pages/emi/AdvancedInputs.tsx:75`, `apps/web/src/pages/emi/AdvancedInputs.tsx:79`, `apps/web/src/pages/emi/TaxBenefitTable.tsx:12`, `apps/web/src/pages/emi/liveRates.ts:4`, `packages/shared/src/loans/emiTax.ts:20`, `packages/shared/src/loans/emiTax.ts:21`, `packages/shared/src/loans/emiTax.ts:22`, `packages/shared/src/loans/emiTax.ts:24`, `packages/shared/src/loans/emiTax.ts:57`, `packages/shared/src/loans/emiWire.ts:123`

### Repayment schedule by financial year <!-- F-EMI-005 -->
**What it does:** Below the result, **Repayment schedule** groups every EMI by financial year ("FY 2026-27") with totals for **EMI paid**, **Interest**, **Principal**, **Prepaid** (only when there are prepayments) and the year-end **Balance**. Click a year to expand its months.

**Why it exists:** Inferred from behavior: yearly totals match how interest certificates and tax returns are organised.

**Where to find it:** **Tools → EMI Calculator → Calculate**, below the results (route `/emi`).

**Who can use it:** All signed-in users.

**Steps**
1. Scroll to **Repayment schedule**.
2. Click **FY …** to expand or collapse that year.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **FY yyyy-yy** | Toggle button | Expands / collapses the months | Hidden while inputs are invalid |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing is stored.

**Errors and troubleshooting:** None.

**Limitations:** "Whole rupees on screen; the PDF and Excel files show paise." On narrow screens the table becomes stacked cards.

**How it works:** Rows are grouped by consecutive Indian financial year; the group balance is the last month's closing balance.

**Related features:** F-EMI-001, F-EMI-009.

**Sources:** `apps/web/src/pages/emi/ScheduleTable.tsx:10`, `apps/web/src/pages/emi/ScheduleTable.tsx:26`, `apps/web/src/pages/emi/ScheduleTable.tsx:63`, `packages/shared/src/loans/summary.ts:43`

### Compare loan offers <!-- F-EMI-006 -->
**What it does:** The **Compare** tab puts two or three loan offers side by side. For each offer you enter **Name**, **Loan amount (Rs.)**, **Interest rate (% p.a.)**, **Tenure** (years or months), **Fee type**, **Processing fee** and **Other charges (Rs.)**; result cards show **EMI**, **Total interest**, **Fees + GST**, **Total cost**, **APR** and (with tax on) **Cost after tax**, marking **Cheapest overall** and **Cheapest after tax**.

**Why it exists:** Inferred from behavior: lenders quote different rates and fees; total cost decides which is cheaper.

**Where to find it:** **Tools → EMI Calculator → Compare** (route `/emi?tab=compare`).

**Who can use it:** All signed-in users.

**Steps**
1. Click **Compare**. Two offers are pre-filled: Offer A 8.5% with 0.5% fee, Offer B 8.35% with 1% fee, both ₹25,00,000 for 20 years.
2. Edit each offer. Click **Add offer** for a third (it copies the last offer); **Remove offer** appears when there are three.
3. Read the result cards; the cheapest total cost is outlined.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add offer** | Button | Adds an offer (max 3) | Hidden at 3 offers |
| **Remove offer** | Button | Removes an offer | Shown only when there are 3 offers |
| **Years** / **Months** | Toggle (per offer) | Tenure unit | — |
| **Fee type** | Select: % of loan / Fixed Rs. | Fee kind | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Name** | Text | No | Up to 40 characters in a share link | Offer A / Offer B | — |
| **Loan amount (Rs.)**, **Interest rate (% p.a.)**, **Tenure**, **Processing fee**, **Other charges (Rs.)** | Text | Yes | Same limits as F-EMI-001 / F-EMI-003 | See step 1 | Same messages as F-EMI-001 / F-EMI-003 |

**Settings and toggles here:** S-EMI-002 **Tenure unit** (per offer), S-EMI-007 **Fee type** (per offer). "Uses the first EMI date and tax settings from the Calculate tab."

**Results:** Nothing is stored. The compare state is part of the share link.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Fix these to compare the offers:" followed by messages | Errors that have no field on this tab (for example the first EMI date) | Fix them on the Calculate tab |

**Limitations:** GST on the fee is fixed at 18% for every offer. Prepayments and rate changes are not applied to offers. **Cheapest after tax** appears only when tax is on in the Calculate tab and valid.

**How it works:** Each offer is summarised with the shared engine (F-EMI-001, F-EMI-003); cheapest = lowest total cost (EMIs + fees), ties all marked; cheapest after tax = lowest cost after tax when every offer has a tax estimate.

**Related features:** F-EMI-001, F-EMI-003, F-EMI-004, F-EMI-007.

**Sources:** `apps/web/src/pages/emi/CompareTab.tsx:11`, `apps/web/src/pages/emi/CompareTab.tsx:41`, `apps/web/src/pages/emi/CompareTab.tsx:47`, `apps/web/src/pages/emi/CompareTab.tsx:53`, `apps/web/src/pages/emi/CompareTab.tsx:58`, `apps/web/src/pages/emi/CompareTab.tsx:73`, `apps/web/src/pages/emi/emiState.ts:64`, `apps/web/src/pages/emi/emiState.ts:143`, `packages/shared/src/loans/summary.ts:78`

### Live rates <!-- F-EMI-007 -->
**What it does:** The **Live rates** tab lists indicative published rates by lender for one **Loan type** (Home, Car, Two-wheeler, Personal, Education, Gold, Loan against property, Loan against securities, Business), lowest first: **Lender**, **Rate (% p.a.)** ("from X%" or "X% - Y%"), **Basis** (Repo-linked, MCLR, Fixed, Other), **As of** (with "w.e.f." date and a **Stale** badge) and a link to the lender's rates page. The lowest non-stale row is highlighted **Lowest**. A line above shows the RBI repo rate and its last change. **Use this rate** copies a lender's minimum rate into the Calculate tab.

**Why it exists:** Inferred from behavior: to start a calculation from a realistic market rate. The tab notes: "Indicative. Your rate depends on credit score, loan amount and tenure."

**Where to find it:** **Tools → EMI Calculator → Live rates** (route `/emi?tab=rates`).

**Who can use it:** All signed-in users (any plan).

**Steps**
1. Click **Live rates**. Home loan rates load.
2. Choose another **Loan type** if needed.
3. Click **Use this rate** on a row. The Calculate tab opens with that rate; the toast reads "Using <lender> <rate>% - check it against your own offer".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Loan type** | Select | Chooses the loan type | — |
| Lender page link (aria "<lender> rates page") | External link | Opens the lender's page in a new tab | — |
| **Use this rate** | Button | Applies the rate and switches to Calculate | — |
| **Try again** | Button | Reloads | Shown only after a failed load; disabled while loading |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-EMI-011 **Loan type** (this tab only; not saved).

**Results:** **Use this rate** changes only the calculator's rate and tax **Loan for**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load rates right now. The calculator still works." | Request failed | **Try again** |
| "Rates not available yet" | No effective rate for this loan type | Try another type; rates refresh daily |
| **Stale** badge | The lender page has not been read successfully for more than 7 days | Treat the rate with caution |

**Limitations:** Rates come from lenders' public pages read once a day (F-EMI-010) or entered by an administrator; a lender with no current reading is simply absent. Results are cached in your browser for 10 minutes.

**How it works:** `GET /api/loan-rates?loanType=…` (any signed-in user). The server lists each lender source for the type with its effective rate — suspect readings are never shown; a manual override from the admin page takes precedence — sorted by minimum rate then lender, with `asOf` = the page's last successful read (automatic) or the admin entry time (manual), and **Stale** when an automatic source has had no success for 7 days. The repo line shows the latest RBI repo rate and, if the two latest readings differ, the signed change.

**Related features:** F-EMI-001, F-EMI-010, F-LOAN-010, D-EMI-001.

**Sources:** `apps/web/src/pages/emi/LiveRatesTab.tsx:45`, `apps/web/src/pages/emi/LiveRatesTab.tsx:51`, `apps/web/src/pages/emi/LiveRatesTab.tsx:74`, `apps/web/src/pages/emi/LiveRatesTab.tsx:82`, `apps/web/src/pages/emi/LiveRatesTab.tsx:88`, `apps/web/src/pages/emi/LiveRatesTab.tsx:117`, `apps/web/src/pages/emi/liveRates.ts:11`, `apps/web/src/pages/emi/EmiCalculatorPage.tsx:42`, `packages/api/src/routes/loanRates.routes.ts:9`, `packages/api/src/controllers/loanRates.controller.ts:11`, `packages/api/src/services/loans/loanRates/loanRates.service.ts:14`, `packages/api/src/services/loans/loanRates/loanRates.service.ts:46`, `packages/api/src/services/loans/loanRates/sanity.ts:67`, `packages/shared/src/loans/loanRates.ts:9`

### Share a calculator link <!-- F-EMI-008 -->
**What it does:** **Share** copies a link to the calculator with every input of the Calculate and Compare tabs and the current tab. Opening the link restores the same state.

**Why it exists:** Inferred from behavior: to send a loan scenario to someone or bookmark it, without saving anything to an account.

**Where to find it:** **Tools → EMI Calculator → Share** (header button, route `/emi`).

**Who can use it:** All signed-in users; the person opening the link must also be signed in.

**Steps**
1. Click **Share**. The toast "Link copied" appears.
2. Paste the link. The recipient sees the same inputs after signing in.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Share** | Button | Copies the link | Never |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Your clipboard holds the link. The address bar always holds the same state, so copying it works too.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't copy - copy the address bar instead" | Clipboard blocked by the browser | Copy the address bar |
| "This calculator link couldn't be opened - showing the default loan instead" | Link from another version, edited or truncated | Re-share from the source |

**Limitations:** The link carries all your inputs in readable encoded form; do not share it if the figures are private.

**How it works:** State is JSON, base64url-encoded into `?v=1&tab=…&s=…&c=…`; on open it is validated (string fields up to 40 characters, up to 50 prepayments and rate changes, 2–3 offers). The address bar is updated 0.4 s after each change without adding history entries.

**Related features:** F-EMI-001, F-EMI-006.

**Sources:** `apps/web/src/pages/emi/EmiCalculatorPage.tsx:53`, `apps/web/src/pages/emi/EmiCalculatorPage.tsx:31`, `apps/web/src/pages/emi/emiUrl.ts:5`, `apps/web/src/pages/emi/emiUrl.ts:15`, `apps/web/src/pages/emi/emiUrl.ts:37`, `apps/web/src/pages/emi/emiUrl.ts:47`

### Export the schedule to PDF or Excel <!-- F-EMI-009 -->
**What it does:** **PDF** and **Excel** download the current calculation as `emi-schedule.pdf` or `emi-schedule.xlsx`: a summary (loan amount, rate, tenure, EMI, total interest, total prepaid, fees, total cost, APR, nominal rate, tax saved and cost after tax when on, rate changes) and the full schedule with paise.

**Why it exists:** Inferred from behavior: to keep or share the schedule outside the app; the schedule card notes the files show paise.

**Where to find it:** **Tools → EMI Calculator → PDF** / **Excel** (header buttons, route `/emi`).

**Who can use it:** All signed-in users.

**Steps**
1. On the **Calculate** tab, with valid inputs, click **PDF** or **Excel**.
2. The file downloads.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **PDF** | Button | Downloads PDF | Disabled when inputs are invalid, while an export runs, or when not on the Calculate tab |
| **Excel** | Button | Downloads XLSX | Same as **PDF** |

**Fields and rules:** Not applicable.

**Settings and toggles here:** Tax and fee toggles (S-EMI-006, S-EMI-008) decide what is included.

**Results:** A file is downloaded; nothing is stored on the server.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Too many exports - please wait a minute" | More than 10 exports in a minute | Wait a minute |
| "Couldn't create the file" or the server's validation message | Server error or invalid input | Fix inputs and retry |

**Limitations:** The file title is always "Loan". The PDF writes "Rs." instead of "₹". Compare-tab offers are not exported.

**How it works:** `POST /api/emi/export?format=pdf|xlsx` with the same inputs; the server re-validates them with the shared validator, recomputes the summary and builds the file (Excel money cells use the `#,##,##0.00` format and real date cells). Limited to 10 per minute per user.

**Related features:** F-EMI-001, F-EMI-005.

**Sources:** `apps/web/src/pages/emi/EmiCalculatorPage.tsx:60`, `apps/web/src/pages/emi/EmiCalculatorPage.tsx:81`, `apps/web/src/api/loans/emi.api.ts:5`, `packages/api/src/routes/emi.routes.ts:9`, `packages/api/src/controllers/emi.controller.ts:37`, `packages/api/src/services/loans/emi/emiExport.ts:17`, `packages/api/src/middleware/rateLimit.ts:219`

### Daily lender-rate refresh <!-- F-EMI-010 -->
**What it does:** Every day at 07:30 IST the server reads the published loan rates and MCLR of tracked lenders (SBI, HDFC Bank, ICICI Bank, Axis Bank, Kotak, PNB, Bank of Baroda, Canara Bank, Union Bank, LIC Housing Finance) and the RBI repo rate from their public web pages, and keeps the last good rate for each lender and loan type. These feed **Live rates** (F-EMI-007), **Compare with market** (F-LOAN-010) and the refinance and benchmark alerts (F-LOAN-013).

**Why it exists:** Inferred from behavior: to give market rates without a paid data feed; readings are sanity-checked so a misread page does not reach users.

**Where to find it:** No page of its own; its result appears on **Tools → EMI Calculator → Live rates** and on loan pages.

**Who can use it:** Automatic for everyone. Administrators can review suspect readings, set manual rates and run it on demand at **Settings → Loan rates** (D-EMI-001).

**Steps:** Not applicable — automatic.

**Controls:** None in this module.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None for users. Operators can disable the job with `ENABLE_LOAN_RATES_CRON=false`.

**Results:** New readings are stored; a reading outside 4–30%, a ceiling outside the range, a jump of more than 2 points from the last good reading, or a page date more than 7 days ahead or too old (180 days for MCLR, 400 days for product rates) is kept as suspect and not shown. Failures are logged to the ingestion-failure list owned by the oldest active administrator; sources with no success for 7 days raise one operations alert per day to that administrator.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A lender missing from Live rates | Its page could not be read or the reading was suspect, and there is no earlier good reading | Administrator reviews it on **Settings → Loan rates** |
| **Stale** badge | No successful read in 7 days | Administrator checks the source |

**Limitations:** Many lender/loan-type pairs are not read automatically; they show only when an administrator enters a manual rate. Lender pages can change format at any time.

**How it works:** Runs under a system database context (the rate tables are shared reference data). The source list lives in code and is re-applied on every run; the job fetches each page once (allow-listed, respecting robots.txt), parses it, applies the sanity rules above, then runs the loan checks (F-LOAN-013). Only one run at a time; overlapping calls are skipped.

**Related features:** F-EMI-007, F-LOAN-010, F-LOAN-013, D-EMI-001.

**Sources:** `packages/api/src/jobs/loanRatesJob.ts:88`, `packages/api/src/jobs/loanRatesJob.ts:136`, `packages/api/src/jobs/loanRatesJob.ts:141`, `packages/api/src/jobs/loanRatesJob.ts:45`, `packages/api/src/services/loans/loanRates/sourceList.ts:30`, `packages/api/src/services/loans/loanRates/sourceList.ts:71`, `packages/api/src/services/loans/loanRates/sanity.ts:5`, `packages/api/src/services/loans/loanRates/sanity.ts:9`, `packages/api/src/services/loans/loanRates/sanity.ts:46`, `packages/api/src/services/loans/loanRates/sanity.ts:73`

**What this area doesn't do**
- It doesn't save calculations to your account; use **Share** or the address bar.
- It doesn't create a loan from a calculation — add the loan on the Loans page.
- It doesn't fetch a personalised offer or your credit score; live rates are public, indicative headline rates.
- The Compare tab doesn't model prepayments or rate changes, and doesn't export.

## Credit Cards

The **Credit Cards** page (sidebar **Asset Classes → Credit Cards**, route `/credit-cards`) tracks your cards' limits, billing days, monthly statements and payments: "Track credit cards, statements, and payment history". Each card is drawn as a realistic card face (using the issuer's official art where available). Utilisation and dues come from the statements you enter; the full card number is optional, stored encrypted and shown only on request.

### Credit cards list and summary <!-- F-CARD-001 -->
**What it does:** Shows a summary strip — **Total credit limit** ("across N active cards"), **Total outstanding** ("combined across active cards") and **Avg utilization** ("High — consider paying down" above 80%, otherwise "within healthy range") — and a grid of cards. Under each card face: **Outstanding** with utilisation % and a coloured bar, **Limit**, **Payment due** (amount, date and a badge: **Overdue**, **Today** or "Nd"), **Status**, and a red "High utilization — may impact credit score" note at 80% or more. Active cards come first; others are under **Blocked / Closed**, faded.

**Why it exists:** The empty state states the purpose: "Add your credit cards to track statements, payments, and utilization."

**Where to find it:** **Asset Classes → Credit Cards** (route `/credit-cards`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER sees the managed person's cards. In family view the page still shows only your own cards.

**Steps**
1. Open **Asset Classes → Credit Cards**.
2. Read the summary strip and each card's figures.
3. Click a card face, or the arrow button (title "Open"), to open the card's page (F-CARD-005).
4. Click **Download** for the credit cards report (D-CARD-001).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Card face | Link | Opens `/credit-cards/:id` | — |
| Eye button ("Show card number" / "Hide card number") | Toggle | Reveals the full number (F-CARD-004) | — |
| Pencil (title "Edit") | Icon button | Opens **Edit credit card** (F-CARD-002) | Shows on hover (always visible on touch screens) |
| Bin (title "Delete") | Icon button | Asks to delete (F-CARD-003) | Spinner while deleting |
| Arrow (title "Open") | Link | Opens the card page | — |
| **Add card** / **Add first card** | Button | Opens **Add credit card** | **Add first card** only with no cards |
| **Download** | Button | Credit cards report (D-CARD-001) | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-CARD-001 **Status** — only **Active** cards count in the summary strip, get the high-utilisation note and are scanned for reminders.

**Results:** Nothing is changed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Outstanding stays high after you paid a statement | Outstanding changes only when you add an unpaid statement (see Limitations) | Add the next statement; see DOCUMENTATION_GAPS.md |

**Limitations:** **Outstanding** is not a running balance: it is set to the amount of the most recently added unpaid statement and is not reduced when you mark a statement paid or delete it (a confirmed defect). **Payment due** without an unpaid statement is an estimate — the next occurrence of the card's due day ("Due on day N of the month"), clamped to short months. The list carries only each card's 3 latest statements (by due date), so an older unpaid statement does not drive **Payment due** here. No sort, search or filter.

**How it works:** `GET /api/credit-cards` returns your cards (newest first) with their 3 latest statements and `hasCardNumber`, never the encrypted number. Utilisation = outstanding ÷ limit × 100; bar colours: below 50% green, 50–79% yellow, 80–89% amber, 90% and above red. **Payment due**: the earliest unpaid (Pending, Partial or Overdue) statement's due date and remaining amount (statement − paid); otherwise the next due-day date. Closed or blocked cards show **Payment due** only when an unpaid statement exists. The card face shows the signed-in user's name as the holder.

**Related features:** F-CARD-002, F-CARD-003, F-CARD-004, F-CARD-005, F-CARD-006, D-CARD-001, D-CARD-002.

**Sources:** `apps/web/src/pages/creditCards/CreditCardListPage.tsx:65`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:106`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:123`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:218`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:599`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:622`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:670`, `apps/web/src/lib/creditCardDue.ts:47`, `apps/web/src/components/creditCards/CreditCardVisual.tsx:463`, `packages/api/src/services/banking/creditCards.service.ts:135`, `packages/api/src/services/banking/creditCards.service.ts:141`, `packages/api/src/services/banking/creditCards.service.ts:307`

### Add or edit a credit card <!-- F-CARD-002 -->
**What it does:** The **Add credit card** / **Edit credit card** dialog ("The card's limit and billing days. The full number is optional and stored encrypted.") records issuer, card product, optional full card number, last 4 digits, network, credit limit, statement day, due day, interest rate, annual fee and status, with a live preview of the card face.

**Why it exists:** Inferred from behavior: limits and billing days drive utilisation and due-date estimates; the optional full number lets you look it up later.

**Where to find it:** **Asset Classes → Credit Cards → Add card**, **Add first card**, or the pencil on a card (route `/credit-cards`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Add card**. Defaults: statement day 1, due day 20, status **Active**.
2. Type in **Issuer bank \*** ("Search HDFC, SBI, Amex…") and pick a suggestion or keep your text.
3. Type in **Card \*** ("Regalia Gold, Platinum…"); picking a catalogue card fills its exact name and, if blank, its issuer and usual network. Generic tiers (Classic, Gold, Platinum, Titanium, Signature, World, Infinite, Black, Metal) are offered as "Any bank".
4. Optionally type the **Full card number** ("Optional — lets you reveal it later"); the last 4 digits fill automatically.
5. Fill **Last 4 digits \*** (if no full number), choose **Network**, fill **Credit limit (₹) \***, **Statement day**, **Due day**, and optionally **Interest rate (% p.a.)**, **Annual fee (₹)**, **Status**.
6. Click **Save**. The toast "Card added" / "Card updated" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Card preview | Display | Shows the card face as you type | Shown once issuer or card is filled |
| **Cancel** / **Save** | Buttons | Close / save ("Saving…") | **Save** disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Issuer bank \*** | Suggest input | Yes | 1–200 characters | Empty | "Required" |
| **Card \*** | Suggest input | Yes | 1–200 characters | Empty | "Required" |
| **Full card number** | Text | No | 12–19 digits after removing spaces and dashes; must pass the Luhn check | Empty (edit: "Saved — type a new one to replace it" when one is saved) | "Enter the 12–19 digits on the card" / "That card number doesn't check out — check for a mistyped digit"; server: "Card number must be 12–19 digits" / "That card number doesn't check out — a digit may be mistyped" |
| **Last 4 digits \*** | Text | Yes | Exactly 4 digits | Empty | "Must be 4 digits" |
| **Network** | Select: — select —, Visa, Mastercard, RuPay, American Express, Diners Club | No | — | — select — | — |
| **Credit limit (₹) \*** | Text | Yes | Number; ₹ and commas are stripped | Empty | "Required" / "Enter an amount, e.g. 500000" |
| **Statement day** | Number | Yes | 1–31 | 1 | Server rejects outside 1–31 |
| **Due day** | Number | Yes | 1–31 | 20 | Server rejects outside 1–31 |
| **Interest rate (% p.a.)** | Text | No | Number | Empty | — |
| **Annual fee (₹)** | Text | No | Number | Empty | — |
| **Status** | Select | No | Active / Blocked / Closed | Active | — |

**Settings and toggles here:** S-CARD-001 **Status**; S-CARD-002 **Network** (logo on the card face; also picks the masking pattern); S-CARD-003 **Statement day** (stored and shown; not used in calculations); S-CARD-004 **Due day** (estimated payment due date when no unpaid statement exists).

**Results:** The card is saved. A typed full number is encrypted and its last 4 digits replace **Last 4 digits**. CVV and expiry are never asked for.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Card-number messages in the table | Wrong length or a mistyped digit | Re-type the number |
| Toast with the server's message (for example "Validation failed") | Server-side validation | Correct the field |
| "Failed to add card" / "Failed to update card" | Other error | Retry |

**Limitations:** A saved full number cannot be removed from this dialog (leaving the field empty keeps it); it can only be replaced. The dialog has no field for the outstanding balance (see F-CARD-001). Card status **Inactive** exists on the server but is not offered here.

**How it works:** `POST /api/credit-cards` / `PATCH /api/credit-cards/:id`. The server validates (last 4 exactly 4 digits, amounts as positive decimals, days 1–31, network and status from fixed lists), checks length and Luhn on the full number, encrypts it with AES-256-GCM and stores its last 4. Responses never include the encrypted value, only `hasCardNumber`.

**Related features:** F-CARD-001, F-CARD-004.

**Sources:** `apps/web/src/pages/creditCards/CreditCardListPage.tsx:237`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:245`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:266`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:332`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:364`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:378`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:413`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:463`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:546`, `packages/api/src/controllers/creditCards.controller.ts:25`, `packages/api/src/services/banking/creditCards.service.ts:110`, `packages/api/src/services/banking/creditCards.service.ts:160`, `packages/api/src/services/banking/creditCards.service.ts:186`

### Delete a credit card <!-- F-CARD-003 -->
**What it does:** Permanently deletes a card and all its statements.

**Why it exists:** Inferred from behavior: to remove a card added by mistake or no longer held.

**Where to find it:** **Asset Classes → Credit Cards**, bin on a card (route `/credit-cards`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click the bin. The card is replaced by "Delete "<issuer> ●●●● <last 4>"?" with **Yes** / **No**.
2. Click **Yes**. The toast "Card deleted" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Bin (title "Delete") | Icon button | Shows the confirmation | — |
| **Yes** / **No** | Buttons | Delete / cancel | **Yes** disabled while deleting |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The card, its encrypted number and its statements are removed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Toast "Failed to delete card" | Network error or card not found | Reload |

**Limitations:** No undo. Not available from the card's own page. Closing a card (status **Closed**) keeps its history instead.

**How it works:** `DELETE /api/credit-cards/:id` after an ownership check; statements cascade.

**Related features:** F-CARD-001.

**Sources:** `apps/web/src/pages/creditCards/CreditCardListPage.tsx:583`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:641`, `packages/api/src/services/banking/creditCards.service.ts:236`, `packages/api/prisma/schema.prisma:3146`

### Reveal the full card number <!-- F-CARD-004 -->
**What it does:** The eye button on a card face shows the full saved card number; clicking again hides it. Each reveal is recorded in the audit log.

**Why it exists:** The dialog explains the number is "Optional — lets you reveal it later"; the server comment states plaintext only leaves through this audited, rate-limited action.

**Where to find it:** Eye button on the card face — **Asset Classes → Credit Cards** list and the card's page (routes `/credit-cards`, `/credit-cards/:id`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person. Limited to 5 reveals per minute.

**Steps**
1. Click the eye ("Show card number"). The number appears on the card.
2. Click it again ("Hide card number") to mask it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "Show card number" / "Hide card number" | Toggle button | Reveals / hides | Disabled (spinner) while loading |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** An audit-log entry "pii_view" for the card is written before the number is returned. The number is held only on the page (not cached) and is masked again when the card changes or you leave.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Toast "Only the last 4 digits are saved. Edit the card to add the full number." | No full number saved | Edit the card and type it |
| Toast "Could not reveal the card number. Try again in a minute." | More than 5 reveals in a minute, or a server error (for example "Could not decrypt the card number — the encryption key may have changed") | Wait a minute and retry |

**Limitations:** Reveals are limited to 5 per minute per user (shared with other "reveal" actions in the app).

**How it works:** `POST /api/credit-cards/:id/reveal` (rate-limited, response marked no-store). The server checks ownership, decrypts, writes the audit row (if that write fails, the reveal fails) and returns the number; with no saved number it returns nothing and writes no audit row.

**Related features:** F-CARD-001, F-CARD-002, F-CARD-005.

**Sources:** `apps/web/src/components/creditCards/CreditCardVisual.tsx:330`, `apps/web/src/components/creditCards/CreditCardVisual.tsx:492`, `packages/api/src/routes/creditCards.routes.ts:32`, `packages/api/src/controllers/creditCards.controller.ts:105`, `packages/api/src/services/banking/creditCards.service.ts:248`, `packages/api/src/services/banking/creditCards.service.ts:270`, `packages/api/src/middleware/rateLimit.ts:196`

### Credit card detail page <!-- F-CARD-005 -->
**What it does:** Shows one card: title "<issuer> — <card name>", network and status; the large card face (with reveal); metrics **Credit limit** ("Statement day: N, due day: M"), **Outstanding** ("N overdue" or "all current"), **Utilization** ("High — may impact credit score" above 80%, else "Within healthy range") and **Next due** (amount and "Due <date>" or "No pending dues"); a **Credit utilization** bar with marks at 30% (ideal), 80% and 100%; the annual fee and interest rate when set; and **Statement history** (F-CARD-006).

**Why it exists:** Inferred from behavior: one place for a card's limit, utilisation and bills.

**Where to find it:** **Asset Classes → Credit Cards**, click a card (route `/credit-cards/:id`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Open a card. Read the metrics.
2. Click **Back** to return to the list.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Back** | Link button | Opens `/credit-cards` | — |
| Eye button | Toggle | Reveal (F-CARD-004) | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing is changed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Card not found." | Wrong id, deleted or not yours | Go back to the list |

**Limitations:** **Outstanding** and **Utilization** use the stored outstanding (see F-CARD-001). **Next due** considers only Pending or Partial statements due today or later — an overdue statement is not shown there. The annual fee line (and interest rate) appears only when an annual fee is set.

**How it works:** `GET /api/credit-cards/:id` (all statements) and `GET /api/credit-cards/:id/summary`: utilisation to 2 decimals; overdue = statements with status Overdue; next due = earliest Pending/Partial statement with due date ≥ today, amount = statement − paid (not below 0).

**Related features:** F-CARD-004, F-CARD-006, F-CARD-007.

**Sources:** `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:409`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:437`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:464`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:489`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:509`, `packages/api/src/services/banking/creditCards.service.ts:369`, `packages/api/src/services/banking/creditCards.service.ts:399`

### Credit card statements: add, mark paid, delete <!-- F-CARD-006 -->
**What it does:** **Statement history** lists each month's bill — **Month**, **Statement**, **Min due**, **Due date** (with "in Nd", "today" or "Nd ago" until paid), **Paid**, **Paid on**, **Status** (pending, partial, paid, overdue) — newest month first. **Add statement** records a bill; the tick (title "Mark paid") records a payment; the bin deletes a statement.

**Why it exists:** The dialog describes it: "One month's bill: what was billed, the minimum due and the due date." Statements drive the due dates, reminders and outstanding.

**Where to find it:** Card page → **Statement history** (route `/credit-cards/:id`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Add statement**. Fill **For month \* (YYYY-MM)**, **Statement amount (₹) \***, optional **Minimum due (₹)**, and **Due date \***. Click **Save** — "Statement added".
2. To record payment, click the tick on an unpaid row. In **Mark statement paid** ("Record what you paid against this statement, and when.") check **Paid amount (₹) \*** (pre-filled with the statement amount) and **Paid on \*** (today), then **Confirm** — "Statement marked as paid".
3. To delete, click the bin, then **Del** (or **No**) — "Statement deleted".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add statement** | Button | Opens the dialog | — |
| Tick (title "Mark paid") | Icon button | Opens **Mark statement paid** | Hidden on paid rows |
| Bin (title "Delete") | Icon button | Shows **Del** / **No** | — |
| **Save** / **Confirm** / **Cancel** / **Del** / **No** | Buttons | As labelled | **Save**/**Confirm**/**Del** disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **For month \* (YYYY-MM)** | Text | Yes | `YYYY-MM`; one statement per card per month | Empty | "Format: YYYY-MM" |
| **Statement amount (₹) \*** | Text | Yes | Plain positive number | Empty | "Required" |
| **Minimum due (₹)** | Text | No | Plain positive number | Empty | — |
| **Due date \*** | Date | Yes | YYYY-MM-DD | Empty | "Required" |
| **Paid amount (₹) \*** | Text | Yes | Plain positive number | Statement amount | "Required" |
| **Paid on \*** | Date | Yes | YYYY-MM-DD | Today | "Required" |

**Settings and toggles here:** None.

**Results:** A new statement starts as **Pending**; adding it (unless marked paid) sets the card's outstanding to its amount. Marking paid sets status **Paid** when the amount covers the statement, **Partial** when less, **Pending** when 0. Deleting removes the row only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Toast "Failed to add statement" and "Request failed with status code 409" | A statement for that month already exists on this card | Delete or pay the existing one |
| Toast "Failed to add statement" with status 422 | Amount with commas or a bad format | Use plain numbers |
| Toast "Failed to mark as paid" / "Failed to delete statement" | Server or network error | Retry |

**Limitations:** Paying or deleting a statement does not change the card's **Outstanding** (confirmed defect — see DOCUMENTATION_GAPS.md). Statements cannot be edited; a paid statement cannot be changed back. Overdue status is set only by the nightly reminder scan for **Active** cards; until then the row is tinted red by date. After changing statements here, the Credit Cards list may show old figures for up to 30 seconds.

**How it works:** `POST /api/credit-cards/:id/statements` (status defaults to PENDING; database unique on card + month), `PATCH /api/credit-cards/statements/:statementId` (paidAmount, paidOn; status derived), `DELETE /api/credit-cards/statements/:statementId`, each checking that the card is yours. When a non-paid statement is added the card's `outstandingBalance` is overwritten with that statement's amount.

**Related features:** F-CARD-005, F-CARD-007.

**Sources:** `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:96`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:128`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:188`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:268`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:298`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:365`, `packages/api/src/controllers/creditCards.controller.ts:43`, `packages/api/src/controllers/creditCards.controller.ts:54`, `packages/api/src/services/banking/creditCards.service.ts:285`, `packages/api/src/services/banking/creditCards.service.ts:308`, `packages/api/src/services/banking/creditCards.service.ts:318`, `packages/api/src/services/banking/creditCards.service.ts:356`, `packages/api/prisma/schema.prisma:3160`, `packages/api/src/middleware/errorHandler.ts:73`

### Credit card payment reminders <!-- F-CARD-007 -->
**What it does:** Creates reminders in **Alerts** for unpaid statements of active cards: "<issuer> <card> ••••<last 4> payment due in N days" 30, 15, 7 and 1 days before the due date, and "… payment overdue by N days" once late, with "<YYYY-MM> statement of ₹<amount> due on <date>". The first overdue reminder also changes a Pending statement's status to **Overdue**.

**Why it exists:** Inferred from behavior: to avoid late-payment charges.

**Where to find it:** **Alerts** and the dashboard alert list (D-CARD-003).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps:** Not applicable — automatic. Add statements (F-CARD-006) to receive reminders.

**Controls:** None in this module.

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-CARD-001 **Status** — only **Active** cards are scanned.

**Results:** One alert per statement and stage; the overdue alert is created once per statement.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| No reminder for a bill | No statement added, the card is not Active, or the statement is already Paid / Overdue | Add the statement; mark paid when paid |

**Limitations:** Runs daily at 20:45 IST (or when the Alerts page triggers a scan). No reminder on the due day itself. Reminders are based on statements only, not the card's due day. The amount uses Western digit grouping and the date is shown as YYYY-MM-DD.

**How it works:** Same daily alert job as F-LOAN-012. Pending and Partial statements of Active cards are read; days left = due date − today (UTC days). An alert of type `CREDIT_CARD_DUE` is created at 30, 15, 7 or 1 days, or when overdue, unless one with key `credit_card_due:<statement>:<stage>` exists; an overdue Pending statement is then set to Overdue (a failure there is logged, not shown).

**Related features:** F-CARD-006, D-CARD-003.

**Sources:** `packages/api/src/services/banking/creditCards.service.ts:30`, `packages/api/src/services/banking/creditCards.service.ts:438`, `packages/api/src/services/banking/creditCards.service.ts:488`, `packages/api/src/services/banking/creditCards.service.ts:515`, `packages/api/src/jobs/alertJobs.ts:48`

**What this area doesn't do**
- It doesn't import card statements or transactions from email, PDFs or the bank; statements are entered by hand.
- It doesn't track individual card transactions, rewards points or EMIs on cards.
- It doesn't keep a running outstanding balance from payments.
- It never asks for or stores CVV or expiry.
- The credit cards pages don't switch to family view.

<!-- END MODULES -->

## Roles and profiles

### Signed-out visitor <!-- R-VISITOR -->
Cannot open the Loans, EMI Calculator or Credit Cards pages (sent to sign in), including shared calculator links.

### Free user <!-- R-FREE -->
Full use of Loans (taken and given), the EMI Calculator (including Live rates and exports) and Credit Cards. Nothing in these modules is plan-gated.

### Plus subscriber <!-- R-PLUS -->
Same as Free in these modules.

### Family subscriber <!-- R-FAMILY -->
Same as Free in these modules.

### Pro/Advisor subscriber <!-- R-PRO -->
Same as Free in these modules.

### Administrator <!-- R-ADMIN -->
Same as their plan in these modules. Administrators additionally manage the lender rates behind **Live rates** at **Settings → Loan rates** (outside this module) and receive the operations alert when a rate source has failed for 7 days.

### Family owner <!-- R-FAMOWNER -->
Family view does not change these pages: they always show your own loans and cards. Family-wide loan totals appear on the family dashboard.

### Family contributor <!-- R-FAMCONTRIB -->
As Family owner: these pages show only your own data in family view.

### Family viewer <!-- R-FAMVIEWER -->
As Family owner: these pages show only your own data in family view.

### Managing a family member's account <!-- R-MANAGER -->
While managing someone's account, the Loans and Credit Cards pages show and change that person's loans and cards, and a card-number reveal is recorded against that person's account. The managed person's loans are included in the daily loan checks.

### Professional acting for a client <!-- R-PROF -->
Not applicable to these pages; a client's loans and cards are reached only through the CA workspace, within the grant's scope.

### AI chatbot connection <!-- R-AICONN -->
No access to these pages. A connected chatbot can read loans, money lent and credit cards (read-only) through its own tools when the Loans and Banking-and-cards areas are approved.

### Succession nominee <!-- R-NOMINEE -->
No access.

## Glossary
| Term | Meaning |
|---|---|
<!-- BEGIN GLOSSARY -->
| EMI | Equated monthly instalment — the fixed monthly payment that repays a loan's principal and interest. |
| Loan taken | Money you borrowed from a lender and are repaying; counts as a liability. |
| Loan given | Money you lent to someone; what they still owe counts as an asset. |
| Outstanding (loan) | The balance still owed, taken as the opening balance of the next unpaid EMI on or after today. |
| Amortization schedule | The month-by-month table of EMI, interest, principal and balance, recomputed from the loan's terms and recorded payments. |
| Prepayment | An extra payment towards principal, outside the EMIs. |
| Foreclosure | Paying off the whole balance early; recording one closes the loan as Foreclosed. |
| Reduce tenure / Reduce EMI | What a prepayment does: keep the EMI and finish earlier, or keep the end date and pay a smaller EMI. |
| Rate type | Whether a loan's rate is Fixed, Floating or Not sure. |
| Repo rate (EBLR) | A floating loan linked to the RBI repo rate (external benchmark lending rate); resets at least quarterly. |
| MCLR | Marginal cost of funds based lending rate — a lender's internal benchmark; floating loans here use its 1-year MCLR, reset yearly. |
| Next rate reset | The date your floating loan's rate is next revised to its benchmark. |
| Market rate | The lowest current published minimum rate for your loan type among tracked lenders. |
| Switching costs | Processing fee (% of outstanding) plus other charges paid to move a loan to a new lender. |
| Net saving | Interest saved by refinancing minus switching costs. |
| Break-even | The month in which cumulative EMI savings first cover the switching costs. |
| APR (true yearly cost) | The yearly rate that equates what you actually receive (loan minus fees) with everything you repay. |
| 80C + 24(b) | Income-tax deductions for home loans: principal under 80C (up to ₹1,50,000 overall) and interest under 24(b) (up to ₹2,00,000 for a self-occupied home). |
| 80E | Income-tax deduction for interest on an education loan, uncapped, for up to 8 years. |
| Whenever (flexible) | A loan given repaid in any amounts at any time, with optional daily simple interest. |
| Write off | Forgive what a borrower still owes and close the loan given. |
| Statement | One month's credit card bill: amount, minimum due and due date. |
| Utilization | Card outstanding as a percentage of its credit limit. |
| Statement day / Due day | The day of the month a card's bill is generated / payment is due. |
| Luhn check | The checksum every card number carries; catches a mistyped digit. |
<!-- END GLOSSARY -->
