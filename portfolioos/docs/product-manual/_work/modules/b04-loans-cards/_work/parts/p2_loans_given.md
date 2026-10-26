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

