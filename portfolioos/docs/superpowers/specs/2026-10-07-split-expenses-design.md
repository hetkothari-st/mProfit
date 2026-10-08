# Split Expenses — Design

**Date:** 2026-10-07
**Status:** Approved in brainstorming; awaiting written-spec review
**Branch:** `feat/split-expenses` (worktree off `main`)

## 1. Goal

A Splitwise-style shared-expense tool inside the app, under **Tools → Split Expenses** (`/split`), working end to end: friends, groups, expenses with four split modes, balances, debt simplification, settle-up, and UPI pay-now. Plus SplitKaro-style opt-in auto-detection of payments from bank/UPI alert emails, pasted SMS text, receipt photos, and (on the parked Android app) device SMS.

### Decisions locked

| # | Decision | Value |
|---|---|---|
| D1 | Participants | **Hybrid.** Add anyone by name/email/phone as a placeholder. When they sign up with a verified matching email/phone, they get linked and see the shared ledger. |
| D2 | Auto-detect sources | Gmail bank/UPI alerts + paste/share SMS text + receipt photo OCR (web) **and** a native Android SMS reader on the parked Capacitor branch. |
| D3 | Extras in v1 | Receipt photo attach, receipt auto-detect (OCR), expense comments, expense labels, email reminders, per-expense currency, UPI pay-now deep link. |
| D4 | Currency | **Per-expense currency, converted** to the group's base currency at that day's FX rate. Rate stored on the expense and editable. Balances are single-currency per group. |
| D5 | Architecture | **Shared ledger + membership-based RLS.** One copy of each group/expense. Balances computed on read, never stored. |
| D6 | Cash Activity | Optional per-expense toggle: "add my share to Cash Activity" creates a linked `CashFlow` OUTFLOW. |

### Out of scope (v1)

- Recurring expenses.
- Itemized per-line-item split (OCR line items are shown for reference only).
- In-app payment confirmation from UPI apps (not possible; user confirms).
- Shipping the Android SMS reader to the Play Store (stays on local branch `feat/mobile-app-capacitor` until the user publishes).
- iOS SMS reading (Apple forbids it).

## 2. Data model

All tables in `packages/api/prisma/schema.prisma`. All money is `Decimal(18,4)`; quantities N/A. All IDs `cuid()`.

```prisma
model SplitContact {
  id            String   @id @default(cuid())
  ownerUserId   String           // address-book owner
  name          String
  emailCipher   Bytes?           // encrypted at rest, like other identifiers
  emailHash     String?          // HMAC for lookup/linking
  phoneCipher   Bytes?
  phoneHash     String?
  upiId         String?
  linkedUserId  String?          // set when a verified signup matches
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([ownerUserId])
  @@index([emailHash])
  @@index([phoneHash])
}

enum SplitGroupType { TRIP HOME COUPLE OTHER DIRECT }

model SplitGroup {
  id            String         @id @default(cuid())
  name          String
  type          SplitGroupType @default(OTHER)
  baseCurrency  String         @default("INR")
  simplifyDebts Boolean        @default(true)
  createdById   String
  archivedAt    DateTime?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
}

model SplitMember {
  id          String   @id @default(cuid())
  groupId     String
  contactId   String?          // the creator's contact row for this person
  userId      String?          // linked app user; drives RLS
  displayName String
  leftAt      DateTime?
  @@unique([groupId, userId])
  @@index([userId])
}

enum SplitMode   { EQUAL EXACT PERCENT SHARES }
enum SplitSource { MANUAL RECEIPT_OCR EMAIL SMS PASTE }

model SplitExpense {
  id           String      @id @default(cuid())
  groupId      String
  description  String
  date         DateTime    @db.Date
  amount       Decimal     @db.Decimal(18,4)   // in `currency`
  currency     String
  fxRate       Decimal     @db.Decimal(18,8)   // currency -> group.baseCurrency
  baseAmount   Decimal     @db.Decimal(18,4)
  splitMode    SplitMode
  createdById  String
  receiptBlobId String?                         // DocumentBlob
  sourceType   SplitSource @default(MANUAL)
  detectionId  String?
  deletedAt    DateTime?
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  @@index([groupId, date])
}

model SplitPayer  { id String @id @default(cuid()); expenseId String; memberId String; amount Decimal @db.Decimal(18,4) }
model SplitShare  { id String @id @default(cuid()); expenseId String; memberId String; amount Decimal @db.Decimal(18,4); rawInput Decimal? @db.Decimal(18,6) }

model SplitLabel {
  id      String  @id @default(cuid())
  groupId String?          // group label
  ownerUserId String?      // personal label
  name    String
  color   String
}
model SplitExpenseLabel { expenseId String; labelId String; @@id([expenseId, labelId]) }

model SplitComment {
  id           String   @id @default(cuid())
  expenseId    String
  authorUserId String
  body         String
  createdAt    DateTime @default(now())
  deletedAt    DateTime?
}

enum SplitSettleMethod { CASH UPI OTHER }

model SplitSettlement {
  id           String   @id @default(cuid())
  groupId      String
  fromMemberId String
  toMemberId   String
  amount       Decimal  @db.Decimal(18,4)
  currency     String
  fxRate       Decimal  @db.Decimal(18,8)
  baseAmount   Decimal  @db.Decimal(18,4)
  method       SplitSettleMethod
  date         DateTime @db.Date
  createdById  String
  detectionId  String?
  deletedAt    DateTime?
  createdAt    DateTime @default(now())
}

model SplitActivity {
  id          String   @id @default(cuid())
  groupId     String
  actorUserId String
  kind        String   // EXPENSE_ADDED | EXPENSE_EDITED | EXPENSE_DELETED | EXPENSE_RESTORED | SETTLED | COMMENTED | MEMBER_ADDED | ...
  payload     Json
  createdAt   DateTime @default(now())
  @@index([groupId, createdAt])
}

enum SplitDetectionSource { EMAIL SMS PASTE RECEIPT }
enum SplitDetectionStatus { NEW SPLIT SETTLED DISMISSED }

model SplitDetection {
  id               String   @id @default(cuid())
  userId           String
  source           SplitDetectionSource
  sourceHash       String
  amount           Decimal  @db.Decimal(18,4)
  currency         String   @default("INR")
  direction        String   // DEBIT | CREDIT
  merchant         String?
  payeeVpa         String?
  date             DateTime @db.Date
  rawRedactedCipher Bytes?  // redacted then encrypted
  canonicalEventId String?
  status           SplitDetectionStatus @default(NEW)
  expenseId        String?
  settlementId     String?
  createdAt        DateTime @default(now())
  @@unique([userId, sourceHash])
  @@index([userId, status, date])
}

model SplitShareLink {
  id         String @id @default(cuid())
  expenseId  String
  userId     String
  cashFlowId String
  @@unique([expenseId, userId])
}

model SplitSettings {
  userId                String  @id
  upiId                 String?
  homeCurrency          String  @default("INR")
  defaultPortfolioId    String?         // for share -> Cash Activity
  detectEmail           Boolean @default(false)
  detectPaste           Boolean @default(true)
  detectReceipt         Boolean @default(true)
  detectSms             Boolean @default(false)
  emailOnActivity       Boolean @default(true)
  weeklyDigest          Boolean @default(false)
}
```

Relations, `onDelete` behaviour and FK declarations are written out fully in the migration; the block above shows shape only.

### Invariants

1. **Every expense belongs to a group.** A 1:1 friend expense lives in an auto-created `DIRECT` group with exactly two members; the UI hides `DIRECT` groups from the group list and shows them under the friend.
2. **Balances are never stored.** Computed from payers, shares and settlements on read.
3. **Σ shares = amount** and **Σ payers = amount**, exactly, in the expense currency. Validated server-side.
4. **Rounding:** EQUAL/PERCENT/SHARES compute each share rounded half-even to 2 dp (paise); the leftover paise go to members in a deterministic order (sorted member id) so totals match exactly.
5. **`baseAmount = round(amount × fxRate, 4)`**; per-member base shares are derived by the same remainder rule so base totals also match.
6. **Soft delete** for expenses, settlements, comments. Deleted rows excluded from balances; restorable.
7. Only **linked** members (`userId` set) can act. Placeholders are data only.

## 3. Row-level security

Group-scoped tables (`SplitGroup`, `SplitMember`, `SplitExpense`, `SplitPayer`, `SplitShare`, `SplitExpenseLabel`, group `SplitLabel`, `SplitComment`, `SplitSettlement`, `SplitActivity`) get a policy:

```sql
USING (EXISTS (
  SELECT 1 FROM "SplitMember" m
  WHERE m."groupId" = <row's groupId>
    AND m."userId" = current_setting('app.current_user_id', true)
    AND m."leftAt" IS NULL))
```

Child tables join through their parent to reach `groupId`. `SplitMember` itself uses a `SECURITY DEFINER` helper `split_is_member(groupId)` to avoid recursive policy evaluation. Owner-scoped tables (`SplitContact`, `SplitDetection`, `SplitShareLink`, `SplitSettings`, personal `SplitLabel`) use the standard `userId = current_user` policy. Policies cover SELECT, INSERT (WITH CHECK), UPDATE and DELETE. Group creation inserts the creator's `SplitMember` row in the same transaction so the WITH CHECK passes.

Receipt blobs: served only through `/api/split/expenses/:id/receipt`, which loads the expense under RLS first.

## 4. Balance engine

`packages/api/src/services/split/balances.ts` — pure functions over Decimal, no DB access.

- `memberNets(expenses, settlements) → Map<memberId, Decimal>` in base currency: Σ base paid − Σ base share + Σ settlements paid − Σ settlements received. Σ nets = 0 exactly (asserted).
- `pairwiseDebts(...)` — who owes whom from each expense's payer/share split, netted per pair (used when `simplifyDebts = false`).
- `simplify(nets) → Transfer[]` — greedy: repeatedly match largest creditor with largest debtor, transfer the min. Produces at most n−1 transfers; ties broken by member id for determinism.
- `friendBalance(userId, otherUserOrContact)` — sums your net against that person across every shared group, each converted to your `homeCurrency` at the latest FX rate (display only, labelled "approx." when any group is non-home currency).

## 5. Settle up and pay now

- **Record settlement:** from, to, amount, currency, method, date. Partial allowed. Edit/delete with activity entries.
- **Pay now:** shown when the creditor has a UPI ID (their own `SplitSettings.upiId` if linked, else the contact's `upiId`) and the debt is in INR. Builds `upi://pay?pa=<vpa>&pn=<name>&am=<amount 2dp>&cu=INR&tn=<group> settle-up`. Mobile opens the UPI app; desktop shows a QR of the same URI.
- On return to the page the app asks **"Did the payment go through?"** — Yes records a `UPI` settlement. A later detected UPI debit to that VPA for that amount (±₹1, ±3 days) is offered as confirmation instead of a duplicate.
- Non-INR debts: "Record payment" only.

## 6. Share → Cash Activity

When "add my share to Cash Activity" is on for an expense, for the acting user: create `CashFlow { type: OUTFLOW, amount: myBaseShare converted to INR, currency, inrEquivalent, description: "Split: <desc> (<group>)", portfolioId: SplitSettings.defaultPortfolioId }` and a `SplitShareLink`. Editing the expense updates the CashFlow; deleting it deletes the CashFlow; turning the toggle off deletes it. Each linked member controls only their own link. If no default portfolio is set, the toggle prompts for one.

## 7. Auto-detection

All sources opt-in (`SplitSettings.detect*`). Pipeline:

```
source → PII redact (existing redactor) → parse → sourceHash dedupe → SplitDetection(NEW)
```

1. **Email** — subscriber on CanonicalEvent creation for `UPI_DEBIT`, `CARD_PURCHASE`, `NEFT_DEBIT`, `UPI_CREDIT`. Creates a detection referencing `canonicalEventId`; `sourceHash = sha256("split:ce:" + canonicalEventId)`. No extra LLM call. Does not alter the existing Cash Activity projection.
2. **Paste / share text** — `POST /api/split/detections/parse-text`. Parser `packages/api/src/ingestion/sms/parseBankSms.ts`: regex templates first (HDFC, ICICI, SBI, Axis, Kotak; GPay/PhonePe/Paytm UPI confirmations), each a versioned adapter; on no match, Haiku fallback through the existing LLM client, redaction and budget cap. Multi-message paste splits on blank lines. `sourceHash = sha256("split:sms:" + normalised text)`.
3. **Receipt photo** — upload (≤10 MB, JPEG/PNG/WebP/HEIC by magic bytes, EXIF stripped) → `DocumentBlob` → Haiku vision returns `{merchant, date, total, currency, tax, lineItems[]}` via tool-use schema → prefilled add-expense form. Never auto-saves. Over budget or failure → manual form + `IngestionFailure` row.
4. **Android SMS** (on `feat/mobile-app-capacitor`, local only) — Capacitor plugin with `READ_SMS`/`RECEIVE_SMS`, requested only when the toggle is enabled. On-device filter: DLT sender headers matching `^[A-Z]{2}-[A-Z0-9]{6}$` for known bank/UPI senders plus debit/credit keywords; only matching message bodies are uploaded to the paste endpoint. Broadcast receiver for new SMS + "scan last 30 days" button. Play Store needs the SMS permissions declaration; if refused, fallback is share-sheet into the paste flow.

**Detection inbox** (`/split/detections`): card per detection with **Split** (opens prefilled add-expense), **Dismiss**, and **Record as settle-up** (offered when the payee VPA matches a contact/linked user's UPI ID). Stored raw text is redacted then encrypted; "Delete all detections" button.

**Parser fixtures:** ≥5 real, redacted samples per regex template, supplied by the user. Synthetic fixtures do not count as verification.

## 8. API

Router `packages/api/src/routes/split.routes.ts`, mounted at `/api/split`, auth required, standard `ApiResponse<T>` envelope, money serialised as strings.

- Contacts: `GET/POST/PATCH/DELETE /contacts`, `POST /contacts/:id/invite`
- Groups: `GET/POST /groups`, `GET/PATCH /groups/:id`, `POST /groups/:id/members`, `DELETE /groups/:id/members/:memberId`, `POST /groups/:id/archive`
- Expenses: `GET /groups/:id/expenses`, `POST /expenses`, `GET/PATCH/DELETE /expenses/:id`, `POST /expenses/:id/restore`, `PUT/GET /expenses/:id/receipt`, `POST /expenses/:id/share-link` (toggle)
- Comments: `GET/POST /expenses/:id/comments`, `DELETE /comments/:id`
- Labels: `GET/POST/PATCH/DELETE /labels`
- Balances: `GET /groups/:id/balances` (nets + transfers), `GET /friends` (friend list w/ balances), `GET /friends/:key`
- Settlements: `POST /settlements`, `PATCH/DELETE /settlements/:id`, `GET /groups/:id/upi-link?to=<memberId>`
- Reminders: `POST /reminders` (debtor member id)
- Detections: `GET /detections`, `POST /detections/parse-text`, `POST /detections/receipt`, `PATCH /detections/:id` (dismiss/link), `DELETE /detections`
- Settings: `GET/PUT /settings`
- Activity: `GET /groups/:id/activity`, `GET /activity` (across groups)

Zod schemas in `packages/shared`. Rate limits: reminders 1/day per pair; receipt OCR 20/hour/user; parse-text 60/hour/user.

## 9. Web UI

Nav entry in `apps/web/src/components/layout/navItems.tsx` Tools section: "Split Expenses", `/split`, lucide `Users` icon. Pages in `apps/web/src/pages/split/`:

- `/split` — summary (you owe / you are owed), friends with balances, groups, detections badge, add-expense button.
- `/split/groups/:id` — tabs: Expenses (date-grouped, label chips, receipt icon), Balances (nets + simplified or pairwise transfers, Settle / Pay now / Remind), Activity, Settings (name, type, base currency, simplify toggle, members, labels, archive).
- `/split/friends/:key` — cross-group balance, 1:1 expenses, settle / pay now / remind.
- `/split/expenses/:id` — payers, shares, receipt viewer, labels, comments, edit history.
- `/split/detections` — detection inbox + paste box + receipt upload.
- `/split/settings` — UPI ID, home currency, default portfolio, auto-detect toggles, notification prefs.
- **Add/edit expense sheet** — description, amount, currency (FX auto-filled from `fx.service.getLatestFxRate`, editable; manual entry if fetch fails), date, paid by (one or many), split mode tabs with live "₹X left to assign", labels, receipt attach/scan, "add my share to Cash Activity".

Client parses money strings with decimal.js. Works at 375px width.

## 10. Linking and invites

- Adding a contact with email/phone stores ciphertext + HMAC hash. "Invite" sends an email via the existing mailer with a signup link.
- On **verified** email (or verified phone, when phone verification exists), a job matches `emailHash`/`phoneHash` across all `SplitContact` rows, sets `linkedUserId`, and sets `SplitMember.userId` for members built from those contacts — skipping any group where that user is already a member. Unverified addresses never link.
- A linked user may unlink themselves from a group (`leftAt`), only when their net there is zero.

## 11. Notifications

Emails (existing mailer), batched to at most one per user per hour: added to a group, expense involving you added/edited/deleted, settlement involving you, comment on an expense you're in. Toggle `emailOnActivity`. "Remind" sends the debtor an email with amount and pay-now link (1/day per pair). Optional weekly digest of outstanding balances (cron, Monday 09:00 IST).

Placeholders with an email receive only invite and reminder emails, never activity emails.

## 12. Error handling

- Share/payer sums ≠ amount → 400 `SPLIT_SUM_MISMATCH` with field.
- Acting on a group you're not in → 404 (RLS hides it).
- FX fetch failure → client asks for manual rate.
- OCR/LLM failure or over budget → manual form + `IngestionFailure` row; no silent catches.
- Duplicate detection → deduped by `(userId, sourceHash)`; endpoint reports `{created, duplicates}`.
- Removing a member with non-zero balance → 409 `SPLIT_MEMBER_HAS_BALANCE`.

## 13. Testing

- **Unit:** split-mode rounding (₹100 ÷ 3 sums to exactly ₹100.00), percent/shares, multi-payer, FX base rounding, `memberNets` sums to zero, `simplify` (property test: settles every net to zero, ≤ n−1 transfers, deterministic).
- **Parser goldens:** ≥5 real redacted fixtures per SMS template; receipt OCR schema validation with recorded responses.
- **RLS:** non-member user gets 404 on group, expense, comment, settlement, activity and receipt; placeholder email linking requires verification; member who left loses access.
- **API integration:** expense CRUD → balances; settlement; soft delete/restore; share-link CashFlow create/update/delete; detection dedupe.
- **E2E (Playwright):** two users, shared group, add expense, both see same balances, settle, pay-now link rendered.

## 14. Delivery

Each step is its own PR off `main`:

1. Schema, migration, RLS policies, balance engine, core API (contacts, groups, members, expenses, settlements, balances, activity).
2. Web UI core (nav, dashboard, group, friend, expense, add/edit sheet, settle up).
3. Receipts attach, comments, labels, reminders + notification emails, pay-now, share → Cash Activity, invites/linking.
4. Email + paste detection, detection inbox, SMS regex templates (needs user's real SMS samples).
5. Receipt OCR.
6. Android SMS plugin — on local `feat/mobile-app-capacitor` only; not pushed.

## 15. Risks

- **Membership RLS** is a new policy shape in this codebase; recursive-policy and performance pitfalls. Mitigated by `SECURITY DEFINER` helper, index on `SplitMember(userId)`, and explicit isolation tests.
- **Play Store `READ_SMS` approval** may be refused; web paths do not depend on it.
- **Bank SMS formats** vary and drift; regex adapters are versioned and LLM fallback catches misses.
- **LLM cost** for OCR and SMS fallback counts against the existing per-user budget cap.
