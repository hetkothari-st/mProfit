# Rental — Khatabook-style tenant khata ledger

Date: 2026-09-08
Status: Approved (design). Implementation plan to follow.
Branch: `feat/rental-khatabook-ledger`

## 1. Goal

Make the rental section behave like Khatabook for the two things Khatabook
is actually good at:

1. **A per-tenant khata** — one running balance per tenant, with every
   charge and payment as a dated row, partial payments and advances
   handled naturally.
2. **A collection loop** — see who owes what, send a WhatsApp reminder in
   one tap, share a statement.

Explicitly *not* copied: party-first navigation (properties stay the entry
point) and a fully entry-driven schedule (the monthly receipt schedule
stays and keeps driving alerts, forecasts, and accounting).

## 2. Current state

`RentalProperty → Tenancy → RentReceipt → RentReminder`, plus
`PropertyExpense`.

`RentReceipt` is a pre-materialised schedule: `createTenancy` writes one
row per month through `endDate`, or 12 rolling months when open-ended.
Statuses: `EXPECTED | RECEIVED | PARTIAL | OVERDUE | SKIPPED`.

The limiting defect: a receipt carries a *single* `receivedAmount`,
`receivedOn` and `cashFlowId`, and `markReceiptReceived`
(`rental.service.ts:587`) early-returns when the row is already
`RECEIVED`. Consequences today:

- A tenant cannot pay a month in two instalments.
- One Rs 20,000 payment cannot be spread across two Rs 45,000 arrears.
- Security deposits, waivers, late fees and discounts have nowhere to live.
- There is no running balance — only a per-month status grid.

`RentReceipt` is read by six services outside the rental module:
`accounting.service.ts:912`, `alerts.service.ts:185,209`,
`cashflowForecast.service.ts:107`, `dashboard.service.ts:177`,
`rental.reminders.service.ts:362,384`. The design keeps the receipt row
shape intact so none of them change.

## 3. Decisions

| # | Decision |
|---|---|
| D1 | Charges and payments become separate rows. New `RentLedgerEntry` table. |
| D2 | `RentReceipt` stays and remains the rent-charge side. No duplicate `RENT_CHARGE` entries. Its `status` / `receivedAmount` / `receivedOn` become **derived**. |
| D3 | No allocation table. Allocation is recomputed deterministically (pinned first, then FIFO). Self-healing, mirrors `holdingsProjection`. |
| D4 | The ledger is the **only** write path for rent money. Every existing mutator becomes a thin wrapper: write/delete an entry, then recompute. |
| D5 | Deposits are excluded from the rent balance and tracked separately as `depositHeld`. |
| D6 | Reminders send via `wa.me` deep link — no WhatsApp Business API, no Meta account, no per-message cost. The landlord taps Send in their own WhatsApp. |
| D7 | The existing approval-gated email/SMS reminder queue (`RentReminder`) is untouched. |
| D8 | Properties stay the navigation entry point. The khata is a new deep-linkable page; a Collections tab lists tenants by dues. |

## 4. Data model

```prisma
model RentLedgerEntry {
  id               String   @id @default(cuid())
  tenancyId        String
  tenancy          Tenancy  @relation(fields: [tenancyId], references: [id], onDelete: Cascade)

  // PAYMENT | DISCOUNT | LATE_FEE | OTHER_CHARGE | DEPOSIT | DEPOSIT_REFUND
  entryType        String
  amount           Decimal  @db.Decimal(12,2)   // always positive
  entryDate        DateTime @db.Date
  forMonth         String?  // "YYYY-MM" pin; null = FIFO allocate
  note             String?
  attachmentUrl    String?

  cashFlowId       String?  // one CashFlow per money-moving entry
  canonicalEventId String?  // auto-match provenance
  sourceHash       String?  @unique  // §3.3 idempotency

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([tenancyId, entryDate])
  @@index([tenancyId, forMonth])
}
```

Added to `Tenancy` (derived, never hand-edited):

```prisma
balanceDue        Decimal   @db.Decimal(12,2) @default(0)  // +ve = tenant owes
depositHeld       Decimal   @db.Decimal(12,2) @default(0)
balanceComputedAt DateTime?
```

Sign convention: `amount` is always positive; `entryType` decides the
direction.

| entryType | balanceDue | depositHeld | Khata column |
|---|---|---|---|
| `PAYMENT` | reduces | — | You Got |
| `DISCOUNT` | reduces | — | You Got |
| `LATE_FEE` | increases | — | You Gave |
| `OTHER_CHARGE` | increases | — | You Gave |
| `DEPOSIT` | — | increases | You Got |
| `DEPOSIT_REFUND` | — | reduces | You Gave |
| a `RentReceipt` charge | increases | — | You Gave |

## 5. Recompute engine

New file: `packages/api/src/services/rentalLedger.service.ts`.

```ts
recomputeTenancyLedger(tx: ExtendedTx, tenancyId: string): Promise<LedgerSummary>
```

Algorithm — pure, deterministic, idempotent:

1. **Charges.** Every `RentReceipt` for the tenancy whose status is not
   `SKIPPED`, as `{ key: receiptId, due: dueDate, amount: expectedAmount }`,
   plus every `LATE_FEE` / `OTHER_CHARGE` entry as
   `{ key: entryId, due: entryDate, amount }`. Sorted by `due` ascending;
   ties broken receipt-before-fee, then by id for stability.
2. **Credits.** Every `PAYMENT` / `DISCOUNT` entry, sorted by `entryDate`
   ascending, then `createdAt`, then id.
3. **Allocate.** For each credit in order:
   - if `forMonth` is set and a charge exists for that receipt month with
     remaining capacity, fill that charge first;
   - spill any remainder to the oldest charge with remaining capacity
     (FIFO), repeating until the credit is exhausted or no charge remains;
   - a credit left over after every charge is satisfied is an **advance**.
4. **Write back**, per receipt:
   - `receivedAmount` = total allocated (null when zero, preserving the
     existing nullable column's meaning)
   - `receivedOn` = `entryDate` of the **first** credit allocated to this
     receipt; null only while nothing has been allocated at all. This
     preserves the column's pre-ledger meaning — "the date money first
     arrived for this month" — which two consumers that predate this work
     depend on: the dashboard's YTD rental income (`dashboard.service.ts`)
     and `propertyPnL` (`rental.service.ts`) both filter
     `status IN ('RECEIVED','PARTIAL') AND receivedOn >= <date>`. Projecting
     the *settling* credit's date here would leave every `PARTIAL` receipt
     null and silently drop partly-paid months from both totals.
     `allocateCredits` still exposes `settledOn` (the date the month closed)
     for callers that specifically need it.
   - `status`:

     | condition | status |
     |---|---|
     | was `SKIPPED` | `SKIPPED` (untouched) |
     | allocated >= expected | `RECEIVED` |
     | 0 < allocated < expected | `PARTIAL` |
     | allocated == 0 and `dueDate <= today - 7d` | `OVERDUE` |
     | otherwise | `EXPECTED` |

   The 7-day grace matches the existing `OVERDUE_GRACE_DAYS`
   (`rental.service.ts:884`). `PARTIAL` deliberately outranks `OVERDUE`,
   preserving today's behaviour where `markOverdueReceipts` only ever
   flips `EXPECTED` to `OVERDUE`.
5. **Summarise** onto `Tenancy`:
   - `balanceDue` = sum of charges minus sum of (`PAYMENT` + `DISCOUNT`) —
     negative means the tenant is in advance
   - `depositHeld` = sum of `DEPOSIT` minus sum of `DEPOSIT_REFUND`
   - `balanceComputedAt` = now

All arithmetic in `Prisma.Decimal` (§3.2). No `Number`, no `parseFloat`.

`recomputeTenancyLedger` is called inside the caller's transaction so a
write plus its recompute commit atomically.

## 6. Write-path rerouting (D4)

| Existing function | Becomes |
|---|---|
| `markReceiptReceived` | Creates a `PAYMENT` entry pinned to the receipt's `forMonth`, then recomputes. The `if (RECEIVED) return` early-exit is **removed** — a second payment is now legal. |
| `unmarkReceived` | Deletes the `PAYMENT` entries pinned to that month (and their `CashFlow` rows), then recomputes. |
| `applyAutoMatch` | Creates a `PAYMENT` entry carrying `canonicalEventId`, then recomputes. |
| `undoAutoMatch` | Deletes that entry, then recomputes. |
| `markOverdueReceipts` | Recompute-driven. The cron recomputes tenancies with open receipts past the cutoff rather than issuing a blind `updateMany`. |
| `skipReceipt` / `unskipReceipt` | Set the flag, then recompute (a skipped month must release any credit it held). |
| `createTenancy` / `updateTenancy` | After generating or regenerating receipts, recompute. |

`CashFlow`: exactly one row per money-moving entry (`PAYMENT`,
`DEPOSIT`, `DEPOSIT_REFUND`), created and deleted with the entry.
`DISCOUNT`, `LATE_FEE` and `OTHER_CHARGE` move no cash and create none.

`tryAutoMatchRentReceipt`'s matching heuristic (plus/minus Rs 10, plus/minus
5 days, name similarity at least 0.5, refuse on ambiguity) is unchanged.

## 7. API

New routes on `rentalRouter` (all behind `authenticate`, money as strings):

```
GET    /rental/tenancies/:id/ledger
POST   /rental/tenancies/:id/entries
PATCH  /rental/entries/:entryId
DELETE /rental/entries/:entryId
GET    /rental/collections
GET    /rental/tenancies/:id/statement          -> PDF
GET    /rental/tenancies/:id/reminder-link      -> { text, waUrl }
```

`GET .../ledger` returns the merged khata feed — receipts as charge rows
and entries as credit/charge rows, newest first, each with a running
balance — plus `balanceDue`, `depositHeld`, and tenancy/property context.

`GET /rental/collections` returns every active tenancy with
`balanceDue > 0`, sorted descending, with the oldest unpaid month and the
tenant phone, for the Collections tab.

`GET .../reminder-link` builds the message server-side (tenant name,
amount due, oldest unpaid month, the property's `paymentInstructions`,
signed with `landlordName`) and returns both the raw text and a
`https://wa.me/<e164>?text=<encoded>` URL. Phone normalisation reuses the
`+91` logic already in `notifications/sms.service.ts`.

`GET .../statement` renders a tenant ledger PDF through the existing
`reportBuilder` / `mprofitStyle` pipeline.

## 8. UI

**`/rental/tenancies/:id` — `TenantKhataPage`** (new file; keeps the
already-1156-line `RentalDetailPage` from growing):

- Header: tenant name, property, big signed balance ("Rs 45,000 to collect"
  / "Rs 5,000 in advance"), `Remind` and `Share Statement` buttons.
- Deposit held shown as its own line, never folded into the balance.
- Body: reverse-chronological rows in two money columns (You Gave | You
  Got) with a running balance per row, each row showing date, note and
  attachment.
- Sticky bottom bar: two buttons, `+ You Gave` and `+ You Got`, opening a
  single entry dialog whose type list is filtered by direction.

**`RentalListPage`** gains a **Collections** tab: active tenants sorted by
dues, oldest overdue month, per-row Remind button.

**`RentalDetailPage`**: each tenancy card links into its khata. No other
change.

## 9. Migration and the G2 gate

Migration `20260908_rental_ledger`:

1. Create `RentLedgerEntry`; add `balanceDue`, `depositHeld`,
   `balanceComputedAt` to `Tenancy`.
2. Backfill one `PAYMENT` entry for every receipt with
   `receivedAmount > 0`, pinned to its `forMonth`, dated `receivedOn`,
   carrying the existing `cashFlowId` and `autoMatchedFromEventId`.
3. Backfill one `DEPOSIT` entry per tenancy with `securityDeposit > 0`,
   dated `startDate`, with no `CashFlow` (none exists today).
4. Recompute every tenancy.
5. **Assert parity**: no receipt's `status` or `receivedAmount` changed.
   Report any delta and abort.

Per CLAUDE.md §16, running this against a dev database is a **G2 gate** —
stop, show the parity output, wait for approval. Production is **G3**.

RLS (§3.6) is enabled on `RentLedgerEntry` with the same
Tenancy to Property to user owner-join used by the sibling rental tables.

## 10. Testing

`test/invariants/`:

- recompute is idempotent — running it twice changes nothing
- two partial payments for one month sum to `RECEIVED`
- an over-payment carries forward as an advance (`balanceDue` negative)
- Rs 20,000 against two Rs 45,000 arrears allocates FIFO to the older month
- a `forMonth`-pinned payment skips older arrears; its excess spills FIFO
- deleting an entry restores the prior receipt statuses exactly
- skipping a month releases credit it held to the next open charge
- deposits never move `balanceDue`
- backfill parity: a fixture with legacy receipts recomputes unchanged

`test/regressions/`: a `RECEIVED` receipt accepts a second payment
(the removed early-return).

Unit: `wa.me` URL building and phone normalisation, including a tenant
with no phone (button disabled, not a broken link).

## 11. Invariant compliance

- §3.1 derived-not-mutated — receipt status/amount become a projection of
  the ledger; no code path hand-edits them.
- §3.2 Decimal — all money is `Prisma.Decimal`, serialised as strings.
- §3.3 idempotency — `sourceHash` unique on auto-matched entries.
- §3.5 no silent failure — recompute throws; callers surface it.
- §3.6 RLS — policy added for the new table.
- §3.10 no silent catch.

## 12. Out of scope

- WhatsApp Business API sends (D6 — deep link only).
- Party-first navigation.
- Removing the pre-materialised receipt schedule.
- Multi-tenant-per-unit splits, rent escalation clauses, e-signed
  agreements, tenant login.
