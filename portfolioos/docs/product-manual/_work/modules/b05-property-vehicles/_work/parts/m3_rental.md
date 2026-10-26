## Rental

Rental tracks property you let out: tenancies, a monthly rent schedule, payments received, skipped months, a per-tenant running ledger ("khata"), property expenses, this financial year's rental profit and loss, and tenant reminders by WhatsApp link, email or SMS. It is reached from **Asset Classes → Rental** (`/rental`). No plan is required. Rental records can also be created from a Real Estate property (F-REST-009).

### Rental properties list <!-- F-RENT-001 -->
**What it does:** The **Properties** tab lists rental properties as ticket-style cards: type band (Residential, Commercial, Land, Parking) with a short reference "№ <last 8 of id>" and "Next · <date>" of the next expected rent, name and address, active tenant and **Monthly rent**, an occupancy stamp (**OCCUPIED**, **VACANT**, **OVERDUE**), and a "Last 12 months" strip of coloured cells. Above the cards: tiles **Active tenancies**, **Monthly income**, **Overdue receipts**, and the pending reminders panel (F-RENT-016).

**Why it exists:** Page subtitle: "Track properties, tenancies, rent receipts, and expenses".

**Where to find it:** **Asset Classes → Rental** (route `/rental`), tab **Properties**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. R-MANAGER sees the managed person's rentals. Family view does not add other members' rentals.

**Steps**
1. Open the page. With none: "No rental properties yet" — "Add a property, set up a tenancy, and let EveryPaisa track rent receipts automatically." and **Add your first property**.
2. Click a card to open it (F-RENT-005). Hover to reveal **Edit** (pencil) and **Delete** (trash).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Properties** / **Collections** | Tabs | Switch tab (F-RENT-004) | — |
| **Download** (report button) | Button | Rental report (D-RENT-001) | — |
| **Add property** / **Add your first property** | Button | F-RENT-002 | — |
| **Grid** / **Map** | Toggle | F-REST-002 | Hidden with no properties |
| Pencil (title "Edit") / Trash (title "Delete") | Icon buttons | F-RENT-002 / F-RENT-003 | Shown on hover |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-RENT-001 **Grid / Map** view (remembered on this device).

**Results:** None — view only.

**Errors and troubleshooting:** None specific.

**Limitations:** **Monthly income** sums the rent of every active tenancy, not money received. The 12-month strip shows the last 12 calendar months by browser time: green Received, amber Partial, red Overdue, outlined Expected, grey Skipped, faint = no record.

**How it works:** `GET /api/rental/properties` returns properties (active first, then by name) with tenancies (active first, newest start first) and all their rent receipts. OVERDUE stamp = any receipt overdue; OCCUPIED = an active tenancy; else VACANT.

**Related features:** F-RENT-002 to F-RENT-005, F-RENT-016, F-REST-002, F-REST-010.

**Sources:** `apps/web/src/pages/rental/RentalListPage.tsx:670`, `apps/web/src/pages/rental/RentalListPage.tsx:110`, `apps/web/src/pages/rental/RentalListPage.tsx:128`, `apps/web/src/pages/rental/RentalListPage.tsx:329`, `apps/web/src/pages/rental/RentalListPage.tsx:517`, `packages/api/src/services/rental/rental.service.ts:213`

### Add or edit a rental property <!-- F-RENT-002 -->
**What it does:** A short dialog ("Add property" / "Edit property") for name, type, address, purchase date, purchase price and current value.

**Why it exists:** Inferred from behavior: the container for tenancies and expenses.

**Where to find it:** **Asset Classes → Rental → Add property**; pencil on a card.

**Who can use it:** All plans.

**Steps**
1. Click **Add property**. Enter **Name *** (placeholder "Andheri East flat") and choose **Type**.
2. Optionally fill **Address**, **Purchase date**, **Purchase price (₹)**, **Current value (₹)**.
3. Click **Save** (or **Save changes**). The dialog closes; the list refreshes.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cancel** | Button | Close | — |
| **Save** / **Save changes** | Button | Save ("Saving…") | While saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Name * | Text | Yes | 1–200 | Empty | "Required" |
| Type | Select: Residential, Commercial, Land, Parking | Yes | — | Residential | — |
| Address | Text | No | ≤1000 | Empty | — |
| Purchase date | Date | No | YYYY-MM-DD | Empty | — |
| Purchase price (₹), Current value (₹) | Text | No | Decimal string | Empty | Raw request error text (see Limitations) |

**Settings and toggles here:** None.

**Results:** The property is created/updated. No success toast is shown.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Request failed with status code 422" (red text in the dialog) | A value failed validation (e.g. commas in a number) | Enter plain digits |
| "portfolioId does not belong to user" | — | Not reachable from this dialog |

**Limitations:** Errors show the raw request message rather than the server's explanation. Landlord name and payment instructions (used in reminders) and portfolio cannot be set here (F-RENT-021). Rent tracking is per tenancy, not per property.

**How it works:** `POST /api/rental/properties` / `PATCH /api/rental/properties/:id`; the server trims the name and stores money as decimals.

**Related features:** F-RENT-001, F-RENT-006, F-RENT-021.

**Sources:** `apps/web/src/pages/rental/RentalListPage.tsx:172`, `apps/web/src/pages/rental/RentalListPage.tsx:225`, `apps/web/src/pages/rental/RentalListPage.tsx:309`, `packages/api/src/controllers/rental.controller.ts:31`, `packages/api/src/services/rental/rental.service.ts:249`, `packages/api/src/services/rental/rental.service.ts:286`

### Delete a rental property <!-- F-RENT-003 -->
**What it does:** Deletes a rental property and everything under it.

**Why it exists:** Inferred from behavior: remove properties no longer held.

**Where to find it:** Trash icon on a card at **Asset Classes → Rental**.

**Who can use it:** All plans.

**Steps**
1. Click the trash icon. The card shows "Delete "<name>"?".
2. Click **Yes, delete** (or **Cancel**). "Property deleted" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Yes, delete** / **Cancel** | Buttons | Confirm / abort | While deleting |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** The property, its tenancies, rent schedule, khata entries, expenses, reminders and photos are deleted. A linked Real Estate property loses its rental link but keeps the status Rented out.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to delete property" | Server error | Retry |

**Limitations:** No undo. Cash-flow entries created when rent was recorded are not deleted with the property (see DOCUMENTATION_GAPS F-RENT-003) and remain in Cash Activity.

**How it works:** `DELETE /api/rental/properties/:id`; the database cascades through tenancies → receipts, ledger entries, reminders, and expenses.

**Related features:** F-RENT-001, F-REST-009.

**Sources:** `apps/web/src/pages/rental/RentalListPage.tsx:686`, `apps/web/src/pages/rental/RentalListPage.tsx:776`, `packages/api/src/services/rental/rental.service.ts:324`, `packages/api/prisma/schema.prisma:2157`, `packages/api/prisma/schema.prisma:2239`

### Collections <!-- F-RENT-004 -->
**What it does:** Lists every active tenant who owes money, highest balance first, with property name, "Oldest pending: YYYY-MM" and a **Remind** button.

**Why it exists:** Inferred from behavior: one list of who to chase.

**Where to find it:** **Asset Classes → Rental → Collections** tab.

**Who can use it:** All plans.

**Steps**
1. Open **Collections**. With nobody owing: "All rent collected" — "No tenant has an outstanding balance right now."
2. Click a tenant name to open the khata (F-RENT-012), or **Remind** (F-RENT-015).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Tenant name | Link | `/rental/tenancies/:id` | — |
| **Remind** | Button | Opens WhatsApp with a reminder | Disabled when the tenant has no phone |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None — view only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add a phone number for this tenant first" | Phone not usable for WhatsApp | Add the tenant phone (F-RENT-016 **Edit contact**) |
| "Failed to prepare reminder link" | Server error | Retry |

**Limitations:** Only active tenancies with a balance above zero appear.

**How it works:** `GET /api/rental/collections`: active tenancies with balance due > 0, ordered by balance; oldest unpaid = earliest-due receipt that is Expected, Overdue or Partial and not skipped.

**Related features:** F-RENT-012, F-RENT-015.

**Sources:** `apps/web/src/pages/rental/RentalListPage.tsx:570`, `apps/web/src/pages/rental/RentalListPage.tsx:629`, `packages/api/src/services/rental/rentalLedger.service.ts:593`

### Rental property detail and this financial year <!-- F-RENT-005 -->
**What it does:** Shows a rental property: name, type · address, **Add expense** and **Add tenancy**, the **Photos** gallery, "This financial year" tiles (rent received with payment count, expenses total with item count, **Net P&L** "Rent − expenses"), **Tenancies**, **Expenses**, **Location** and **Documents** ("Agreements & receipts").

**Why it exists:** Inferred from behavior: one page per let property with its income view.

**Where to find it:** **Asset Classes → Rental** → click a card (route `/rental/:id`).

**Who can use it:** All plans.

**Steps**
1. Open a property; with no tenancies you see "No tenancies yet. Add one to start tracking rent receipts."
2. Use the back arrow to return.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add expense** | Button | F-RENT-011 | — |
| **Add tenancy** / **Add one** | Button | F-RENT-006 | — |
| Back arrow | Link | `/rental` | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None — view only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Property not found. Go back" | Missing or not yours | Return to the list |

**Limitations:** The financial year shown is always the current one (April–March by browser date); there is no year picker. Rent received counts only khata payments (not discounts or deposits).

**How it works:** `GET /api/rental/properties/:id` and `GET /api/rental/properties/:id/pnl?from=YYYY-04-01&to=YYYY+1-03-31`: rent received = sum of PAYMENT entries dated in the window; expenses = sum of expenses paid in the window; net = rent − expenses (2 decimals); the counts are numbers of payments and expenses.

**Related features:** F-RENT-006, F-RENT-007, F-RENT-011, F-REST-010, F-REST-011, D-REST-003.

**Sources:** `apps/web/src/pages/rental/RentalDetailPage.tsx:915`, `apps/web/src/pages/rental/RentalDetailPage.tsx:981`, `apps/web/src/pages/rental/RentalDetailPage.tsx:1007`, `packages/api/src/services/rental/rental.service.ts:231`, `packages/api/src/services/rental/rental.service.ts:920`

### Add a tenancy <!-- F-RENT-006 -->
**What it does:** Records a tenant and lease terms and generates the monthly rent schedule; a security deposit is entered into the tenant's khata.

**Why it exists:** Inferred from behavior: a rent schedule to compare payments against.

**Where to find it:** Rental property page → **Add tenancy** (dialog "Add tenancy").

**Who can use it:** All plans.

**Steps**
1. Click **Add tenancy**.
2. Fill **Tenant name ***, **Start date ***, **Monthly rent (₹) *** and optionally **Tenant email** ("Used for rent reminders"), **Tenant phone** ("10-digit, used for SMS reminders"), **Other contact (optional)**, **End date**, **Due day of month**, **Security deposit (₹)**, **Rent credited to**.
3. Click **Add tenancy**. The tenancy appears with its rent receipts.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cancel** | Button | Close | — |
| **Add tenancy** | Button | Save ("Saving…") | While saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Tenant name * | Text | Yes | 1–200 | — | "Required" |
| Tenant email | Email | No | ≤200 (format not checked by server) | — | — |
| Tenant phone | Phone | No | ≤50 | — | — |
| Other contact (optional) | Text | No | ≤200 | — | — |
| Start date * | Date | Yes | YYYY-MM-DD | — | red outline |
| End date | Date | No | Not before start | — | "endDate cannot be before startDate" (shown as raw request error) |
| Monthly rent (₹) * | Text | Yes | Decimal > 0 | — | "Required"; server "monthlyRent must be positive" |
| Due day of month | Number | No | 1–31 | 1 | server "rentDueDay must be between 1 and 31" |
| Security deposit (₹) | Text | No | Decimal | — | — |
| Rent credited to | Select (your open bank accounts) or "Not tracked" | No | Must be your account | Not tracked | "That bank account does not belong to you" |

**Settings and toggles here:** S-RENT-004 **Due day of month**; S-RENT-002 **Rent credited to**.

**Results:** One rent receipt per month from the start month to the end month (or 12 months when there is no end date). Receipts due 7 or more days ago are created as Overdue at once; others as Expected. A deposit creates a "Security deposit" entry in the khata (it does not reduce rent owed). Tenant email, phone and other contact are stored encrypted.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Request failed with status code 400/422" | Validation failed (rent ≤ 0, end before start, bad number) | Correct the field |
| "Cannot create tenancy on inactive property" | Property set inactive via API | — |

**Limitations:** Errors show raw request text. Once created, the rent, end date, due day and active flag cannot be changed in the web app, and a tenancy cannot be ended or deleted there (F-RENT-020); only the tenant's email/phone (F-RENT-016) and rent account (F-RENT-013) can be edited. Without an end date only 12 months are generated; no later months are added automatically.

**How it works:** `POST /api/rental/properties/:id/tenancies` in one transaction: tenancy, receipts (unique per tenancy and month; due day clamped to the month's last day, e.g. 31 → 28/29 February), optional DEPOSIT entry, then ledger recompute.

**Related features:** F-RENT-007, F-RENT-012, F-RENT-013, F-RENT-020.

**Sources:** `apps/web/src/pages/rental/RentalDetailPage.tsx:625`, `apps/web/src/pages/rental/RentalDetailPage.tsx:657`, `packages/api/src/controllers/rental.controller.ts:58`, `packages/api/src/services/rental/rental.service.ts:178`, `packages/api/src/services/rental/rental.service.ts:188`, `packages/api/src/services/rental/rental.service.ts:339`, `packages/api/src/services/rental/rental.service.ts:392`

### Tenancy cards and rent receipts <!-- F-RENT-007 -->
**What it does:** Each tenancy shows initials, name, **Active**/**Ended**, "N overdue", monthly rent, start → end month, "received/total collected" and **Total received**. Expanded, it shows tiles **Collection** (percentage and progress bar), **Received**, **Expected**, **Overdue** (or **Skipped**) and a table: Month, Expected, Received ("short by ₹…", "auto-matched"), Due (date and weekday), Status, Actions.

**Why it exists:** Inferred from behavior: month-by-month view of what was expected and what came in.

**Where to find it:** Rental property page → **Tenancies**.

**Who can use it:** All plans.

**Steps**
1. Click the chevron to expand/collapse (active tenancies start expanded).
2. Click the tenant name to open the khata (F-RENT-012).
3. Use row actions (F-RENT-008, F-RENT-009, F-RENT-010).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Tenant name | Link | Khata | — |
| Chevron | Toggle | Expand/collapse | — |
| **Received**, **Skip** | Row buttons | F-RENT-008 / F-RENT-009 | Only for Expected or Overdue rows |
| **Undo** | Row button | Undo auto-match / mark-received / skip | Depends on row state |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None — view only.

**Errors and troubleshooting:** None specific.

**Limitations:** Collection % = total received ÷ total expected of all receipts including future months, so it is low early in a lease. Tone: ≥90% green, ≥60% neutral, else amber.

**How it works:** Status is derived from the khata, not typed: Skipped if skipped; Received if money allocated ≥ expected; Partial if some; otherwise Overdue when the due date is 7 or more days ago (at or before today − 7 days, UTC), else Expected. Money is allocated by the rules in F-RENT-012.

**Related features:** F-RENT-008 to F-RENT-012.

**Sources:** `apps/web/src/pages/rental/RentalDetailPage.tsx:399`, `apps/web/src/pages/rental/RentalDetailPage.tsx:223`, `apps/web/src/pages/rental/RentalDetailPage.tsx:56`, `packages/api/src/services/rental/rentalLedgerMath.ts:159`, `packages/api/src/services/rental/rentalLedger.service.ts:54`

### Mark rent received <!-- F-RENT-008 -->
**What it does:** Records a rent payment against a month: adds a payment to the khata, creates a cash inflow, and updates the month's status (Received or Partial).

**Why it exists:** Inferred from behavior: record money the tenant paid.

**Where to find it:** Rental property page → tenancy table → **Received** on an Expected or Overdue month (dialog "Mark as received — YYYY-MM").

**Who can use it:** All plans.

**Steps**
1. Click **Received**. **Amount received (₹)** is pre-filled with the expected rent; **Date received** with today.
2. Adjust and optionally add **Notes (optional)**. Click **Mark received**.
3. If the same amount for the same month on the same day already exists, the dialog shows "This rent is already on the khata" with the server message; click **Record it anyway** only for a genuine second payment.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cancel** | Button | Close | — |
| **Mark received** | Button | Save | While saving |
| **Record it anyway** | Button | Save despite duplicate | Shown only after the duplicate warning |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Amount received (₹) | Text | Yes | Decimal > 0 | Expected rent | "receivedAmount must be positive" / "Could not record the payment" |
| Date received | Date | Yes | YYYY-MM-DD | Today | — |
| Notes (optional) | Text | No | ≤2000 | — | — |

**Settings and toggles here:** S-RENT-002 — when the tenancy has **Rent credited to** set, the inflow carries that bank account.

**Results:** A PAYMENT khata entry pinned to that month; a cash inflow "Rent received — <property> / <tenant> (<month>)" in the property's portfolio (or your default/first portfolio; none if you have no portfolio). Overpayment spills to the oldest unpaid month, then becomes an advance. Pending reminders for a now-settled month are superseded and its overdue alert removed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "A rent payment of N for YYYY-MM is already recorded on YYYY-MM-DD. Record it again only if a second payment really came in that day." | Duplicate guard | **Record it anyway** or **Cancel** |

**Limitations:** Partial payments are recorded by entering a smaller amount; each call adds a new payment.

**How it works:** `POST /api/rental/receipts/:id/mark-received` (duplicate check → 409 DUPLICATE_RENT_PAYMENT unless allowDuplicate) then, in one transaction: cash flow, ledger entry, optional receipt note, ledger recompute (locks the tenancy row to serialise concurrent recomputes).

**Related features:** F-RENT-009, F-RENT-012, F-RENT-013, D-RENT-002.

**Sources:** `apps/web/src/pages/rental/RentalDetailPage.tsx:102`, `apps/web/src/pages/rental/RentalDetailPage.tsx:169`, `packages/api/src/services/rental/rental.service.ts:702`, `packages/api/src/services/rental/rental.service.ts:729`, `packages/api/src/services/rental/rentalLedger.service.ts:325`, `packages/api/src/services/rental/rentalLedger.service.ts:65`

### Skip a month and undo actions <!-- F-RENT-009 -->
**What it does:** **Skip** marks a month as not owed (e.g. rent-free month). **Undo** reverses a skip, or removes the payments recorded for a month via **Received**.

**Why it exists:** Inferred from behavior: correct the schedule and fix mistaken entries.

**Where to find it:** Rental property page → tenancy table row actions.

**Who can use it:** All plans.

**Steps**
1. On an Expected or Overdue month click **Skip**. The row becomes Skipped.
2. On a Skipped month click **Undo** (title "Undo skip").
3. On a Received or Partial month that was not auto-matched click **Undo** (title "Undo mark-received (also deletes cashflow)").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Skip** | Button | Skip month | Only Expected/Overdue |
| **Undo** (skip) | Button | Unskip | Only Skipped |
| **Undo** (received) | Button | Remove payments pinned to this month | Only Received/Partial without auto-match |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** Skip removes the month's rent from the amount owed and supersedes its pending reminders. Undo-received deletes every payment pinned to that month and their cash inflows, then re-derives statuses.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| (no message shown) Skip does nothing | "Cannot skip a receipt with payments against it — remove the payment from the khata first" | Remove the payment first |
| (no message shown) Undo does nothing | "No payment is pinned to this month — remove the payment from the khata instead" | Delete the entry in the khata (F-RENT-012) |

**Limitations:** These buttons show no success or error toast; a refused action simply leaves the row unchanged. A payment that reached a month only by spill-over from another payment cannot be undone here.

**How it works:** `POST /api/rental/receipts/:id/skip`, `/unskip`, `/unmark-received`; each recomputes the tenancy ledger.

**Related features:** F-RENT-008, F-RENT-012.

**Sources:** `apps/web/src/pages/rental/RentalDetailPage.tsx:231`, `apps/web/src/pages/rental/RentalDetailPage.tsx:310`, `packages/api/src/services/rental/rental.service.ts:781`, `packages/api/src/services/rental/rental.service.ts:803`, `packages/api/src/services/rental/rental.service.ts:822`

### Bank-credit auto-match <!-- F-RENT-010 -->
**What it does:** When an imported UPI or NEFT credit (from bank alerts) is turned into a cash inflow, the app looks for a matching rent month and, if exactly one fits, records it as a payment marked "auto-matched". **Undo** removes the match.

**Why it exists:** Code comment §8.2: mark rent received automatically from bank credits.

**Where to find it:** Automatic; matched months show "auto-matched" and **Undo** on the rental property page.

**Who can use it:** Users whose bank alerts are imported (D-RENT-003).

**Steps**
1. Nothing to do; matched months turn Received/Partial.
2. If the match is wrong, click **Undo** (title "Undo auto-match") on that month.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Undo** | Button | Undo auto-match | Only on auto-matched rows |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** A PAYMENT entry "Auto-matched from bank credit" linked to the bank credit; the receipt shows "auto-matched".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A rent credit was not matched | No single month fits (amount, date or name) | Use **Received** manually |

**Limitations:** Match rules: amount within ±₹10 of the expected rent, due date within ±5 days of the credit date, and (when the credit names a sender) name similarity ≥ 0.5 with the tenant name; month must be Expected or Overdue; two or more candidates → no match. Undo also deletes the bank credit's own cash-flow entry (see DOCUMENTATION_GAPS F-RENT-010). An undone credit is not matched again automatically.

**How it works:** Called from the import projection after an inbound UPI_CREDIT/NEFT_CREDIT cash flow is created; failures are logged and never block the import. `POST /api/rental/receipts/:id/undo-auto-match` deletes ledger entries for that month carrying an event id and their cash flows, then recomputes.

**Related features:** F-RENT-008, F-RENT-007, D-RENT-003.

**Sources:** `packages/api/src/ingestion/projection.ts:312`, `packages/api/src/services/rental/rental.service.ts:975`, `packages/api/src/services/rental/rental.service.ts:1033`, `packages/api/src/services/rental/rental.service.ts:1093`, `packages/api/src/services/rental/rental.service.ts:1186`, `apps/web/src/pages/rental/RentalDetailPage.tsx:335`

### Property expenses <!-- F-RENT-011 -->
**What it does:** Records costs of a rental property (Property Tax, Maintenance, Repairs, Utilities, Agent Fee, Legal, Other) and lists them (Date, Type, Description, Amount) for the P&L.

**Why it exists:** Inferred from behavior: net rental income = rent − expenses.

**Where to find it:** Rental property page → **Add expense**; **Expenses** section.

**Who can use it:** All plans.

**Steps**
1. Click **Add expense** (dialog "Add expense"). Choose **Type**, enter **Amount (₹)**, **Date** (default today), **Description**.
2. Click **Add expense**. It appears in the list and the P&L.
3. To remove, hover the row and click the trash icon (no confirmation).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add expense** | Button | Save ("Saving…") | While saving |
| **Cancel** | Button | Close | — |
| Trash icon | Button | Deletes immediately | Visible on hover |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Type | Select | Yes | One of the seven types | Maintenance | — |
| Amount (₹) | Text | Yes | Decimal > 0 | Empty | raw request error ("amount must be positive" on server) |
| Date | Date | Yes | YYYY-MM-DD | Today | — |
| Description | Text | No | ≤2000 | — | — |

**Settings and toggles here:** None.

**Results:** Expense saved; FY P&L updates. Expenses do not create cash-flow entries.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Request failed with status code 422" | Empty or invalid amount | Enter a positive number |

**Limitations:** Expenses cannot be edited, only deleted and re-added; delete has no confirmation and no undo.

**How it works:** `POST /api/rental/properties/:id/expenses`, `DELETE /api/rental/expenses/:id` (ownership checked through the property).

**Related features:** F-RENT-005.

**Sources:** `apps/web/src/pages/rental/RentalDetailPage.tsx:802`, `apps/web/src/pages/rental/RentalDetailPage.tsx:821`, `apps/web/src/pages/rental/RentalDetailPage.tsx:1137`, `packages/api/src/services/rental/rental.service.ts:871`, `packages/api/src/services/rental/rental.service.ts:897`

### Tenant khata (ledger) <!-- F-RENT-012 -->
**What it does:** A running account per tenancy: a big balance ("To collect", "In advance" or "Settled up"), "Deposit held", the **Rent credited to** picker, and a table of every rent charge and entry with columns Date, **You gave**, **You got**, **Balance** (on phones one "Gave / got" column). Buttons **You gave** and **You got** add entries.

**Why it exists:** Code comments: "You gave" = a charge against the tenant, "You got" = money in — a familiar khata (ledger) model.

**Where to find it:** Tenant name on the rental property page or in **Collections** (route `/rental/tenancies/:tenancyId`, page title "Tenant khata" while loading).

**Who can use it:** All plans.

**Steps**
1. Click **You got** (payment, discount, deposit) or **You gave** (late fee, other charge, deposit refund).
2. Enter **Amount (₹) ***, **Date**, **Type**, optionally **Apply to month — leave blank to settle oldest first** and **Note**. Click **Save**. "Entry added".
3. To delete an entry, click its trash icon → "Delete this <type> of ₹… on <date>?" → **Yes, delete**. Rent rows cannot be deleted.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **You gave** / **You got** | Buttons | Open the entry dialog | — |
| **Save** / **Cancel** | Buttons | Save / close | Save disabled while saving |
| Trash (title "Delete entry"), **Yes, delete**, **Cancel** | Buttons | Delete with confirm | Not on rent rows |
| **Remind** | Button | F-RENT-015 | While running |
| **Share statement** | Button | F-RENT-014 | While running |
| Back arrow | Link | Rental property page | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Amount (₹) * | Decimal text | Yes | > 0 | Empty | "Enter a valid amount" |
| Date | Date | Yes | YYYY-MM-DD | Today | — |
| Type | Select | Yes | You got: Payment, Discount, Deposit · You gave: Late fee, Other charge, Deposit refund | Payment / Late fee | — |
| Apply to month | Select (rent months) | No | YYYY-MM or "Settle oldest first" | Settle oldest first | — |
| Note | Text | No | ≤2000 | — | — |

**Settings and toggles here:** S-RENT-005 **Apply to month** — blank settles the oldest open charge first; a month pins the credit to that month first. S-RENT-002 **Rent credited to**.

**Results:** Payment, Deposit and Deposit refund create a cash-flow entry (inflow, inflow, outflow) in the property's portfolio (or default/first portfolio); Discount, Late fee and Other charge do not. Balance and all month statuses are recomputed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Enter a valid amount" | Empty, zero or non-numeric | Enter a positive amount |
| "Request failed with status code …" | Server refused | Check the values |
| "Tenancy not found" — "This tenancy may have been removed." | Bad link | Go back |

**Limitations:** Entries cannot be edited in the app (delete and re-add). Deleting a payment also deletes its cash-flow entry, irreversibly.

**How it works:** Charges = rent receipts (not skipped) + late fees + other charges; credits = payments + discounts. Each credit first fills its pinned month (if any room), then the oldest charge by due date (rent before fees on the same date); leftovers are an advance. Balance = total charges − total credits. Deposit held = deposits − deposit refunds, kept outside the balance. Running balance in the table goes oldest to newest and skips deposit rows; rows are shown newest first. Endpoints: `GET /api/rental/tenancies/:id/ledger`, `POST /api/rental/tenancies/:id/entries`, `DELETE /api/rental/entries/:id`.

**Related features:** F-RENT-008, F-RENT-013, F-RENT-014, F-RENT-015, D-RENT-002.

**Sources:** `apps/web/src/pages/rental/TenantKhataPage.tsx:35`, `apps/web/src/pages/rental/TenantKhataPage.tsx:72`, `apps/web/src/pages/rental/TenantKhataPage.tsx:309`, `apps/web/src/pages/rental/TenantKhataPage.tsx:407`, `packages/api/src/services/rental/rentalLedger.service.ts:37`, `packages/api/src/services/rental/rentalLedger.service.ts:258`, `packages/api/src/services/rental/rentalLedger.service.ts:342`, `packages/api/src/services/rental/rentalLedger.service.ts:481`, `packages/api/src/services/rental/rentalLedgerMath.ts:1`

### Rent credited to <!-- F-RENT-013 -->
**What it does:** Chooses which of your bank accounts a tenant's rent lands in.

**Why it exists:** Component comment: it turns a rent receipt into money moving through a named bank, in the app's cash flow and in the Tally export.

**Where to find it:** **Add tenancy** dialog, and the khata page under the balance.

**Who can use it:** All plans.

**Steps**
1. Pick an account (shown as nickname or "<bank> <type> ••<last4>") or **Not tracked**. On the khata page it saves immediately: "Rent account updated".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Rent credited to** | Select | Sets the account | Disabled while accounts load |

**Fields and rules:** Only your own non-closed accounts are listed; others are refused with "That bank account does not belong to you".

**Settings and toggles here:** S-RENT-002 (this control).

**Results:** Later rent cash-flow entries carry the account. Help text: "Rent then shows as a credit to this account, here and in the Tally export." or, with no accounts, "Add a bank account first to track where this rent lands."

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not update the rent account" / raw request error | Server refused | Pick another account |

**Limitations:** Changing the account does not re-tag earlier entries. Auto-matched credits keep the bank credit's own account.

**How it works:** `PATCH /api/rental/tenancies/:id` with the account id; closing the bank account later sets the link to empty.

**Related features:** F-RENT-006, F-RENT-008, F-RENT-012, D-RENT-004.

**Sources:** `apps/web/src/components/rental/RentAccountPicker.tsx:12`, `apps/web/src/pages/rental/TenantKhataPage.tsx:337`, `packages/api/src/services/rental/rental.service.ts:379`, `packages/api/prisma/schema.prisma:2181`

### Share statement <!-- F-RENT-014 -->
**What it does:** Downloads a PDF "Rent statement — <tenant>" with the period, a table (Date, Details, Charged, Paid, Balance) oldest first, totals, Balance Due, Deposit Held and Monthly Rent.

**Why it exists:** Code comment: a statement a landlord can hand to the tenant.

**Where to find it:** Khata page → **Share statement**.

**Who can use it:** All plans.

**Steps**
1. Click **Share statement**. A file "rent-statement-<tenant>.pdf" downloads.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Share statement** | Button | Downloads the PDF | While running |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None (the PDF follows the app's light/dark report theme).

**Results:** A PDF download; nothing is sent to the tenant.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to download statement" / raw request error | Server error | Retry |

**Limitations:** The button downloads; sharing is done by you outside the app. When deposits moved, a note explains that deposits are included in the Paid/Charged totals but not in the balance.

**How it works:** `GET /api/rental/tenancies/:id/statement?theme=light|dark`; rent rows read "Rent — YYYY-MM", others "<Type> — <note>".

**Related features:** F-RENT-012.

**Sources:** `apps/web/src/pages/rental/TenantKhataPage.tsx:361`, `apps/web/src/api/rental/rental.api.ts:442`, `packages/api/src/controllers/rental.controller.ts:329`

### WhatsApp rent reminder <!-- F-RENT-015 -->
**What it does:** Builds a reminder message from the tenant's balance and opens WhatsApp (wa.me) in a new tab with it pre-typed.

**Why it exists:** Inferred from behavior: the quickest way to nudge a tenant.

**Where to find it:** **Remind** in **Collections** and on the khata page.

**Who can use it:** All plans.

**Steps**
1. Click **Remind**. WhatsApp opens with the message; you send it yourself.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Remind** | Button | Opens wa.me link | Collections: disabled without a phone |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** Message text: "Hi <tenant>," then either "This is a reminder that ₹… is outstanding on <property> (oldest pending: YYYY-MM)." (plus payment instructions if set), "Your rent account for <property> is fully settled — nothing is outstanding. Thank you!" or "…is settled, and you are ₹… in advance. Nothing is outstanding.", signed "— <landlord name or your name or "Your landlord">".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add a phone number for this tenant first" | No usable phone | Add the tenant phone |
| "Failed to prepare reminder link" / "Failed to build reminder" | Server error | Retry |

**Limitations:** Some browsers block the new tab because it opens after a network call. Phone rules: 8–15 digits after removing spaces, dashes, brackets and +; a leading 0 is dropped; a 10-digit number starting 6–9 gets the 91 prefix.

**How it works:** `GET /api/rental/tenancies/:id/reminder-link` returns the text and the wa.me URL.

**Related features:** F-RENT-004, F-RENT-012, F-RENT-016, F-RENT-021.

**Sources:** `apps/web/src/pages/rental/RentalListPage.tsx:573`, `apps/web/src/pages/rental/TenantKhataPage.tsx:323`, `packages/api/src/services/rental/rentalLedger.service.ts:638`, `packages/api/src/services/rental/rentalLedger.service.ts:651`

### Pending tenant reminders (email and SMS) <!-- F-RENT-016 -->
**What it does:** A collapsible panel "Pending tenant reminders" (with "N awaiting approval") that queues reminder messages for upcoming and overdue rent and lets you choose channels, approve and send, or reject. Nothing is sent without your approval.

**Why it exists:** Code comment: "No auto-send: every outbound message is a deliberate human action so the system can't spam tenants".

**Where to find it:** **Asset Classes → Rental → Properties** tab, above the cards (shown once you have at least one property).

**Who can use it:** All plans. Email sending needs a connected Gmail with send permission (D-RENT-005); SMS needs the operator's SMS provider.

**Steps**
1. Reminders are queued daily at 09:00 IST, or click **Run scan** ("Queued N reminders" or "No new reminders to queue — …").
2. Reminders are grouped per tenant. If the tenant has no email or phone, the contact editor opens: fill **Tenant email**/**Tenant phone** and click **Save contact** ("Tenant contact saved — channels enabled"); otherwise **Edit contact** opens it.
3. Under **Send via**, toggle **Email** and **SMS** (a channel without a recipient is disabled: "Add a tenant email above" / "Add a tenant phone above").
4. Tick reminders (or **Select all**). Click **Approve & send** — result "N reminders sent", "N failed — <reasons>" or "N sent · M failed (…)" — or **Reject** ("Reminders rejected").
5. If Gmail lacks send permission, a "Reconnect Gmail" dialog offers **Reconnect Gmail** ("Gmail reconnected — try Approve & send again").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Panel header | Toggle | Expand/collapse | — |
| **Run scan** | Button | Queue reminders now | While running |
| **Edit contact** / **Save contact** / **Cancel** | Buttons | Edit tenant email/phone | Save disabled when unchanged or saving |
| **Email** / **SMS** | Channel chips | Channels for this send only | Disabled without a recipient |
| **Select all** / **Clear selection** | Link button | Select reminders | Shown with 2+ reminders |
| Row checkbox | Checkbox | Select | — |
| **Preview** | Button | F-RENT-017 | — |
| **Reject** | Button | Reject selected | Shown when ≥1 selected |
| **Approve & send** | Button | Send selected | No contact, or no channel ("Pick at least one channel"); while sending |

**Fields and rules:** Tenant email ≤200 characters, tenant phone ≤50 characters (server).

**Settings and toggles here:** S-RENT-003 **Email** / **SMS** channel chips — default both on where a recipient exists; one-shot for this send, not saved.

**Results:** Each approved reminder becomes Sent (if any channel succeeded) or Failed and leaves the panel; per-channel errors are recorded. Rejected reminders leave the panel.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Connect Gmail in Settings → Email notifications first" | Gmail not connected | Connect Gmail (D-RENT-005) |
| "Reconnect Gmail in Settings (existing connection is missing the send permission)" | Missing send scope | **Reconnect Gmail** |
| "SMS provider disabled (DLT-registered SMS provider not yet wired)" | Operator SMS provider is "none" | Use email or WhatsApp |
| "Twilio credentials missing in env" | Operator config | Contact support |
| "Tenant email not set" / "Tenant phone not set" / "Tenant phone is not a valid number" | Contact missing/invalid | Fix the contact |
| "No channels enabled — toggle email or SMS first" | No channel | Turn one on |

**Limitations:** Sent and failed reminders are not listed anywhere in the app. A rejected, failed or superseded reminder is put back in the queue whenever a later scan selects the same month and lead day again; for overdue months that is every daily scan, so rejecting an overdue reminder does not stop it — see DOCUMENTATION_GAPS F-RENT-016. Partly paid months get no reminder. Upcoming reminders are queued only when the scan runs exactly 5, 3, 1 or 0 days before the due date; overdue months get one reminder each. The panel refreshes every 60 seconds.

**How it works:** The scan first copies a legacy "contact" value into email or phone when it clearly is one, flips past-due months to Overdue, then: (1) for each lead day 5/3/1/0, every Expected month of an active tenancy due exactly that many days from today gets a reminder; (2) every Overdue month gets one reminder (lead −1, "overdue by N days"). Text comes from a template (subject "Rent reminder — <property> (<date>)" or "Overdue rent — …"; SMS "Hi <tenant>, your rent of ₹… for <property> is due …"). Landlord name: property's landlord name → your account name → operator default "Your landlord"; payment instructions: property → your account setting → operator default. Email goes through your Gmail; SMS through Twilio when the operator enabled it. Endpoints: `GET /api/rental/reminders?status=PENDING_APPROVAL`, `POST /api/rental/reminders/scan`, `POST /api/rental/reminders/:id/approve` (with one-shot channels), `POST /api/rental/reminders/:id/reject`.

**Related features:** F-RENT-017, F-RENT-019, F-RENT-015, F-RENT-021, D-RENT-005.

**Sources:** `apps/web/src/pages/rental/RentalRemindersPanel.tsx:24`, `apps/web/src/pages/rental/RentalRemindersPanel.tsx:487`, `apps/web/src/pages/rental/RentalRemindersPanel.tsx:703`, `apps/web/src/pages/rental/RentalRemindersPanel.tsx:770`, `apps/web/src/pages/rental/RentalRemindersPanel.tsx:856`, `apps/web/src/pages/rental/RentalRemindersPanel.tsx:927`, `packages/api/src/services/rental/rental.reminders.service.ts:37`, `packages/api/src/services/rental/rental.reminders.service.ts:79`, `packages/api/src/services/rental/rental.reminders.service.ts:324`, `packages/api/src/services/rental/rental.reminders.service.ts:541`, `packages/api/src/services/notifications/sms.service.ts:74`

### Reminder preview and edit <!-- F-RENT-017 -->
**What it does:** Shows a queued reminder ("Preview reminder — <Month Year>") and lets you edit the email subject, greeting, opening line, payment instructions, closing line, signature and SMS text, with a live email preview.

**Why it exists:** Code comment: the landlord edits plain text; the HTML layout is kept intact.

**Where to find it:** Pending reminders panel → **Preview** on a reminder.

**Who can use it:** All plans.

**Steps**
1. Click **Preview**. Edit fields; the preview updates as you type.
2. Click **Save changes** ("Reminder updated"), then **Close**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Save changes** | Button | Saves the edits | While saving |
| **Close** | Button | Close | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Email subject | Text | — | — | Template | "Update failed" |
| Greeting, Opening line, Payment instructions, Closing line, Signature | Text | — | Plain text (HTML characters are escaped) | Template | — |
| SMS body | Text | — | Up to 300 characters (counter shows "/160") | Template | — |

**Settings and toggles here:** None.

**Results:** The edited message is stored on that reminder only. Notes show "(email channel disabled — tenant email missing)" or "(SMS channel disabled — tenant phone missing)" when relevant.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Only PENDING_APPROVAL reminders can be edited" (raw request error) | Reminder already sent/rejected | Run a new scan |

**Limitations:** Edits apply to one reminder; a revived reminder (after rejection or failure) gets fresh template text, losing earlier edits.

**How it works:** `PATCH /api/rental/reminders/:id` with subject, HTML body (edited regions spliced between markers) and SMS body.

**Related features:** F-RENT-016.

**Sources:** `apps/web/src/pages/rental/RentalRemindersPanel.tsx:116`, `apps/web/src/pages/rental/RentalRemindersPanel.tsx:171`, `packages/api/src/services/rental/rental.reminders.service.ts:492`

### Overdue rent status and alerts <!-- F-RENT-018 -->
**What it does:** Daily at 01:00 IST the server re-derives rent statuses so months 7+ days past due become Overdue. The daily alert scan then creates "Rent overdue — <property>" alerts ("<YYYY-MM> rent of ₹… is overdue") and removes alerts for months that were since settled.

**Why it exists:** Code comment §8.1: surface delinquent receipts without user action.

**Where to find it:** Automatic; shown as Overdue on rental pages and in Alerts (D-REST-002).

**Who can use it:** All users with tenancies.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** Status changes and one alert per overdue month (de-duplicated). Recording payment, skipping or auto-matching deletes that month's alert.

**Errors and troubleshooting:** None.

**Limitations:** Partly paid months are never marked Overdue. Operator switch `ENABLE_RENTAL_CRONS=false` stops the status job (statuses still re-derive whenever the tenancy changes or **Run scan** is used).

**How it works:** node-cron "0 1 * * *" Asia/Kolkata runs `markOverdueReceipts` in the system context: for each tenancy with an Expected month due on or before today − 7 days, recompute the ledger. The alert scan (20:45 IST per user) picks Overdue months due on or before today − 7 days.

**Related features:** F-RENT-007, F-RENT-016, D-REST-002.

**Sources:** `packages/api/src/jobs/rentalJobs.ts:21`, `packages/api/src/jobs/rentalJobs.ts:70`, `packages/api/src/services/rental/rental.service.ts:985`, `packages/api/src/services/notifications/alerts.service.ts:181`, `packages/api/src/services/notifications/alerts.service.ts:207`

### Daily reminder scan <!-- F-RENT-019 -->
**What it does:** Daily at 09:00 IST the server queues rent reminders for all users exactly as **Run scan** does (F-RENT-016).

**Why it exists:** Code comment: reminders are ready when landlords open the app in the morning.

**Where to find it:** Automatic; results in the pending reminders panel.

**Who can use it:** All users with tenancies.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** New or revived Pending reminders.

**Errors and troubleshooting:** None shown.

**Limitations:** Same as F-RENT-016; nothing is sent automatically.

**How it works:** node-cron "0 9 * * *" Asia/Kolkata runs `enqueuePendingReminders` in the system context; an overlapping run is skipped.

**Related features:** F-RENT-016.

**Sources:** `packages/api/src/jobs/rentalJobs.ts:43`, `packages/api/src/jobs/rentalJobs.ts:77`, `packages/api/src/services/rental/rental.reminders.service.ts:324`

### What this area doesn't do
- You can't change a tenancy's rent, end date or due day, end a tenancy, or delete a tenancy in the app.
- You can't set a landlord name or payment instructions for reminders (other than editing each reminder's text).
- Reminders are never sent automatically; there is no history of sent reminders.
- You can't edit an expense or a khata entry — delete and re-add.
- There is no rent agreement generator, TDS calculation or rental income tax computation here.
- Rent increases (escalation) are not modelled.
