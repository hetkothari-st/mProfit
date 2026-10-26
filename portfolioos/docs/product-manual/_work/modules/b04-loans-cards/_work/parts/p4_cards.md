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
