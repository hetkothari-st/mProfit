# CLAUDE.md — PortfolioOS v2 Execution Plan

> **Instructions for Claude Code:** This file supersedes all prior plans. The original CLAUDE.md (greenfield spec) should be preserved as `CLAUDE_v1_archive.md` for reference — do not execute against it.
>
> Phases 1–4 have already been implemented in this repo but contain bugs. Your job is to (a) audit the current state, (b) apply a mandatory hardening sprint that fixes 10 known bug classes, then (c) build the new capabilities in Phase 5 onwards.
>
> **Do not write production code until Step 1 (Audit) is complete and the user has approved the audit report.**

---

## 0. WORKFLOW PROTOCOL

Before any step that changes the codebase or database, follow this protocol:

1. **Read this entire file** before writing a single line of code.
2. **Execute Step 1 (Section 2) first.** Produce `AUDIT_REPORT.md`. Stop and wait for user approval.
3. **One phase at a time.** Do not jump ahead. Each phase has exit criteria — verify them before moving on.
4. **Ask before destructive operations.** Any DB migration that deletes columns/tables, any mass data operation, any change to the auth system — stop and confirm.
5. **Never swallow errors silently.** If you can't implement something, say so explicitly in a `BLOCKED.md` with the reason and what you need.
6. **Commit at logical checkpoints.** Use Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`). One logical change per commit.
7. **Golden-test everything that parses data.** No parser ships without ≥5 real-input fixtures in the repo.

---

## 1. DECISIONS LOCKED

These are not open for reinterpretation. If you think a decision is wrong, raise it in `BLOCKED.md` — don't silently do something different.

| # | Decision | Value |
|---|---|---|
| 1 | Architecture | Web SaaS. Keep v1 stack: React 18 + TS + Vite + shadcn/Tailwind / Node 20 + Express + Prisma / PostgreSQL 15 + Redis 7 / Docker. |
| 2 | User model | Single-user for v2. Multi-user (family sharing) deferred to v3. Schema already supports it; just don't expose family UI yet. |
| 3 | Platform | Web (responsive PWA). Mobile app deferred. |
| 4 | Ingestion parser | LLM-first, source-agnostic. Per-institution adapters are NOT a prerequisite. Pre-seeded templates are an optimization for first-run UX only. |
| 5 | Gmail access | In-app source configuration + `from:(...)` query. Never full-inbox scan. Never user-managed labels in production (though the `mprofit-corpus` label is fine as a dev test fixture). |
| 6 | Vehicle data | Non-paid scraping only. Three-tier fallback: mParivahan app API → parivahan.gov.in Playwright → SMS-paste manual. |
| 7 | Cloud sync | Yes (it's web SaaS) — implies server-side PII encryption is mandatory (Section 15). |
| 8 | LLM model | Claude Haiku (`claude-haiku-4-5-20251001`) for email parsing. Anthropic API with zero-retention header. |
| 9 | LLM budget | Default warning at ₹500/user/month, soft cap at ₹1000/user/month (configurable in `AppSettings`). Over cap → raw-archive emails for later parsing, don't fail. |
| 10 | Vehicle test RC | `MH47BT5950` — use for end-to-end Phase 5-B tests. |
| 11 | AIS/Form 26AS | Deferred. Not in v2 scope. Revisit in v3. |
| 12 | Review mode | Manual review until 5 events approved from a sender, then offer auto-commit toggle per sender. |
| 13 | Hosting | Undecided. Keep deployment configs environment-agnostic (Docker Compose for local dev; `.env.example` lists all required vars). |
| 14 | Advisor features | Deferred to v3. v1 Phase 7 is out of v2 scope. |

---

## 2. STEP 1 — AUDIT & REPORT (FIRST ACTION)

**Before the audit, read Section 2B — it lists known/suspected bugs to verify and fix. Those bugs are your primary targets; the audit confirms their presence and surfaces any new ones.**

Before any code changes, produce `AUDIT_REPORT.md` covering the following:

### 2.1 Structure inventory
Run and capture:
```bash
tree -L 3 -I 'node_modules|dist|.git|.next|.turbo'
```
List every top-level package, every model in `schema.prisma`, every route file, every parser file.

### 2.2 Build & test state
- Does `npm install` succeed?
- Does `npm run build` succeed in both `apps/web` and `packages/api`?
- Does `npm test` pass? How many tests? How many skipped?
- Are there any TS errors?
- Capture output.

### 2.3 Feature completeness check
For each v1 Phase 1–4 deliverable in `CLAUDE_v1_archive.md`, mark as:
- ✅ Implemented and working
- ⚠️ Implemented but buggy/incomplete
- ❌ Not implemented

Specifically verify:
- Auth flow (register → login → refresh → logout → /me)
- Portfolio CRUD
- Manual transaction CRUD for at least Stocks and MFs
- Holdings engine produces numbers
- At least one broker contract-note parser works end-to-end
- At least one CAS PDF parser works end-to-end
- FIFO capital gains calculator returns values
- XIRR calculator returns values
- PDF/Excel report export produces files

### 2.4 Bug-class audit (the 10 root causes)
For each item below, check the codebase and report status:

1. **`Holding` as source of truth vs. projection.** Search for code that writes to `Holding.quantity`, `Holding.avgCostPrice`, etc. directly. List every mutation site.
2. **`Transaction` idempotency.** Is there a `sourceHash` column or any unique constraint on natural keys? Do importers set an idempotency key?
3. **`Holding` uniqueness bug.** Current constraint is `@@unique([portfolioId, assetClass, stockId, fundId])`. Check for rows where `stockId` AND `fundId` are both NULL (FDs, bonds, NPS, etc.). Report count.
4. **FIFO cascade on edit/delete.** What happens to `CapitalGain` rows when a matched `Transaction` is edited or deleted? Trace the code path.
5. **Decimal precision.** Grep for `parseFloat`, `Number(`, `* 1`, `+` on monetary fields. Any JS Number arithmetic on money is a bug.
6. **Import wizard state machine.** Is the multi-step state stored in DB (`ImportJob`) or in client memory? If client, list recovery gaps.
7. **Bull workers holding DB transactions.** Look for `prisma.$transaction` wrapping Bull job bodies. Report.
8. **Parser catch-alls.** Find any parser that tries to handle multiple broker formats with heuristics. List.
9. **Parser versioning.** Do parsed transactions carry `source_adapter` + `source_adapter_version`? Report.
10. **Row-level security.** Is Postgres RLS enabled on user-scoped tables? If not, are all queries filtered by `userId`? Grep for Prisma queries that don't filter.

### 2.5 Deliverable
Output `AUDIT_REPORT.md` in the repo root with:
- Structure inventory
- Build/test state
- Feature completeness table
- Bug-class audit results (each with file:line citations where applicable)
- A prioritized "red flags" list

**STOP after writing this report. Wait for user approval before proceeding to Section 3.**

---

## 2B. KNOWN BUGS AND FAILURE MODES

The user reported: *"stopped on phase 4 and checked the working, and found that it is very buggy."* The bugs below are a mix of (a) **confirmed** issues verified against the v1 schema and (b) **predicted** issues based on pattern-matching against common failure modes in portfolio apps. During the audit (Section 2.4) you must verify each one in code and report its status.

**The user did not paste specific error messages or symptoms, so the "user-visible symptoms" are inferred. If during audit you find error messages, stack traces, or unexpected behaviors not listed here, add them to `AUDIT_REPORT.md` under a "Newly Discovered" section.**

### 2B.1 Bug catalog

Each bug has: **ID** | **severity** (P0 blocker / P1 critical / P2 significant / P3 nuisance) | **where in code** | **symptom** | **root cause** | **fix location in this doc**.

---

**BUG-001 — Holding uniqueness breaks for non-stock/non-MF assets** — P0

- **Where:** `schema.prisma` → `Holding` model → `@@unique([portfolioId, assetClass, stockId, fundId])`.
- **Symptom (expected):** Adding two Fixed Deposits with different names to the same portfolio either (a) silently merges them into one row, (b) throws a unique-constraint violation on the second one, or (c) creates two rows that then behave inconsistently across queries. Same for Bonds, NPS, PPF, EPF, Gold, Insurance — any asset that stores its identity in `assetName`/`isin` rather than `stockId`/`fundId`.
- **Root cause:** PostgreSQL treats `NULL` as "unknown," so `NULL = NULL` is false. The unique index doesn't actually enforce uniqueness when both `stockId` and `fundId` are NULL. Depending on write order and caching, you get ghost rows or constraint errors.
- **Fix:** Section 4.10 — introduce computed `assetKey` column, migrate existing rows, replace constraint with `UNIQUE(portfolioId, assetKey)`.

---

**BUG-002 — `Holding` is source-of-truth, not a projection** — P0

- **Where:** `Holding` model stores `quantity`, `avgCostPrice`, `totalCost`, `currentValue`, `unrealisedPnL` directly. Every mutation path (create transaction, edit, delete, corporate action, import) updates these columns in place.
- **Symptom (expected):** Numbers on the dashboard drift from what the transaction history would produce. Editing a transaction doesn't update the holding correctly, or updates it in a way that loses precision. Importing the same CAS twice yields doubled holdings. Deleting a transaction leaves a "ghost" holding with stale numbers. "Why is my portfolio showing wrong values?" bugs with no clear reproduction — because the bug is in *how the state got here*, not what's visible now.
- **Root cause:** If any single mutation path has a bug, `Holding` becomes permanently corrupt for that asset. No self-healing. The fix in one place doesn't retroactively correct bad data.
- **Fix:** Section 3.1 + Section 4.4 + Section 5.1 task 4. `HoldingProjection` computed from `Transaction` + `CorporateAction` on every read (or on write via trigger). Never manually mutated.

---

**BUG-003 — No idempotency on import** — P0

- **Where:** Any importer (`packages/api/src/parsers/*`). No `sourceHash` column. No unique constraint on natural keys like `(broker, orderNo, tradeNo)` or `(file_hash, row_index)`.
- **Symptom (expected):** Importing the same Zerodha contract note twice creates duplicate transactions. Re-uploading a CAS after editing one line creates duplicates of every other line. Users who retry a failed import get double data. Holdings doubled.
- **Root cause:** Importer appends rows without checking if they've been imported before.
- **Fix:** Section 4.5 adds `sourceHash` + `assetKey` to `Transaction`. Section 5.1 task 5 backfills and enforces.

---

**BUG-004 — Capital gains become orphaned on transaction edit/delete** — P1

- **Where:** `CapitalGain` rows reference `sellTransactionId` and `buyTransactionId`. No cascade behavior documented in v1 spec.
- **Symptom (expected):** User edits the quantity of an old BUY transaction. The `CapitalGain` rows that were FIFO-matched against it are now wrong (wrong cost basis, wrong holding period calculation, wrong STCG/LTCG classification) but nobody told them. Schedule 112A report shows wrong numbers. Users discover this only at tax time.
- **Root cause:** FIFO matching produced `CapitalGain` rows at sell-time, but nothing recomputes them when the underlying transactions change.
- **Fix:** Section 5.1 task 10. Edit/delete of any matched transaction triggers full FIFO recompute for that `(portfolio, assetKey)`.

---

**BUG-005 — JS `Number` arithmetic on money** — P1

- **Where:** Anywhere in the codebase that does `+`, `-`, `*`, `/` on fields that came from the DB as strings/Decimals but got coerced to JavaScript numbers. Prisma returns `Decimal` as objects but many codebases call `.toNumber()` to make them easier to work with.
- **Symptom (expected):** Portfolio value off by ₹0.01, ₹0.03, sometimes ₹10 after many transactions. XIRR gives different answers on re-runs. Capital gain totals don't exactly match the sum of the individual rows. FIFO with fractional quantities produces weird tiny "residual" holdings like 0.0000000001 units.
- **Root cause:** IEEE-754 floats can't represent ₹0.1 exactly. Errors accumulate.
- **Fix:** Section 3.2 + Section 5.1 task 2. `decimal.js` everywhere; banded `Money` types; ESLint ban on `parseFloat` and `Number()` over money.

---

**BUG-006 — Parser failures are silent or crash the whole job** — P1

- **Where:** Import pipeline (Bull queue jobs). No `IngestionFailure` table in v1 schema. No partial-success mechanism.
- **Symptom (expected):** Importing a 200-row statement where row 87 has unexpected formatting → either (a) silent: rows 1-86 inserted, 87-200 dropped with no UI indication, or (b) crash: nothing inserted, user sees generic "Import failed" error with no way to recover partial data.
- **Root cause:** No dead-letter queue; no partial commit strategy; errors bubble up without preserving raw payload.
- **Fix:** Section 3.5 + Section 4.3 + Section 5.1 task 8. Every parse failure writes to `IngestionFailure` with raw payload; successful rows commit; failed rows surface in UI for review.

---

**BUG-007 — No parser versioning** — P2

- **Where:** Transactions from import carry `importJobId` but not `sourceAdapter` or `sourceAdapterVer`.
- **Symptom (expected):** Zerodha changes their contract note format. The parser silently returns garbage. Old transactions that were parsed with the old version are indistinguishable from new (wrong) ones. Can't re-parse historical imports without rewriting the parser generically.
- **Root cause:** No lineage from `Transaction` back to the parser version that produced it.
- **Fix:** Section 4.5. Add `sourceAdapter` + `sourceAdapterVer` columns.

---

**BUG-008 — `userId` filter is manual per-query** — P1

- **Where:** Every Prisma query in every service. v1 spec says "Row-level security via Prisma queries (always filter by `userId`)" — meaning manual WHERE clauses, not Postgres RLS.
- **Symptom (expected):** A missed `where: { userId: ... }` in one endpoint lets any authenticated user read another user's data. Hard to audit; you'd need to grep every query.
- **Root cause:** Defense-in-depth missing. One forgotten clause = data breach.
- **Fix:** Section 3.6 + Section 5.1 task 11. Postgres RLS policies on every user-scoped table. Middleware sets `app.current_user_id` per request. Even if a query forgets the filter, RLS blocks cross-tenant reads.

---

**BUG-009 — Decimal precision in database vs. application** — P2

- **Where:** Schema uses `Decimal(18,4)` for money, `Decimal(18,6)` for quantities. But intermediate calcs in TS code may coerce to `Number`. API responses likely serialize Decimals as JSON numbers, losing precision at the client boundary.
- **Symptom (expected):** Server computes ₹12,345.6789 correctly; JSON-serializes as `12345.6789`; browser's `JSON.parse` converts to IEEE-754; display function formats as `₹12,345.68` or `₹12,345.67` inconsistently. Sums of displayed values don't add up.
- **Root cause:** Money crosses three boundaries (DB ↔ server ↔ client) and each boundary can lose precision.
- **Fix:** Section 3.2. Serialize money as strings in API responses. Parse with `decimal.js` on client before any math.

---

**BUG-010 — Import wizard step state is fragile** — P2

- **Where:** `/import` wizard (steps 1-4 in v1 spec section 6.5).
- **Symptom (expected):** User uploads a CAS, reviews parsed rows, navigates away, comes back — state is gone or partially gone. Or: user clicks "Confirm" twice → transactions get inserted twice (if idempotency isn't there, BUG-003 compounds this).
- **Root cause:** Wizard state stored in client memory (React state/Zustand) instead of server-side on `ImportJob`.
- **Fix:** Store parsed-preview data on `ImportJob` row with `status=PENDING_REVIEW`. Wizard loads from server. Confirm action is idempotent via job status check.

---

**BUG-011 — Bull jobs holding DB transactions open** — P2

- **Where:** `packages/api/src/jobs/*`. Any worker that wraps its entire body in `prisma.$transaction`.
- **Symptom (expected):** Large imports cause Postgres lock contention. Concurrent API requests time out. Job appears "stuck." Error logs show `Transaction API error: Transaction already closed`.
- **Root cause:** Long-held DB transactions serialize unrelated operations.
- **Fix:** Section 5.1 task 12. Job reads input → computes in memory → single atomic `prisma.$transaction` at the end only for the commit phase. Job body is pure.

---

**BUG-012 — No audit trail for sensitive operations** — P2

- **Where:** Auth, data export, PII display endpoints.
- **Symptom (expected):** Can't answer "when did someone last view my PAN?" or "who exported my data?" No forensic trail if something goes wrong.
- **Root cause:** `AuditLog` table not in v1 schema.
- **Fix:** Section 4.9 + Section 15.8.

---

**BUG-013 — Secrets in `.env`** — P2

- **Where:** v1 `.env.example` includes `JWT_SECRET`, `SMTP_PASS` placeholder.
- **Symptom:** A committed `.env` leaks. Developers accidentally check in real secrets. No rotation procedure.
- **Root cause:** No secret-store discipline.
- **Fix:** Section 3.8 + Section 15.10. Secrets via AWS Parameter Store or equivalent in prod. `.env.local` in dev (gitignored).

---

**BUG-014 — Potentially incomplete FIFO edge cases** — P1

- **Where:** `capitalGains.ts` calculator.
- **Symptoms (predicted, require verification):**
  - LTCG grandfathering: for equity/equity-MF bought before 31 Jan 2018, cost basis should be `max(actual_cost, FMV on 31 Jan 2018)`. Verify implementation. Missing → all pre-2018 sells show wrong LTCG.
  - Intraday classification: buy and sell same day in same portfolio → should be `INTRADAY`, not STCG. Verify.
  - Debt MF indexation (pre-April 2023 buys): indexed cost = `cost × (CII_sell_year / CII_buy_year)`. Verify CII table is present and current.
  - Fractional quantities: FIFO matching 10.5 units from a buy lot of 20 units → handling of the remaining 9.5 units. Verify.
  - Corporate actions in the middle of a holding period: a 1:2 split between BUY and SELL → post-split quantity matching.
- **Fix:** Section 5.1 task 1 (add invariant tests that expose each case), task 10 (recompute logic must handle all cases). If any case is wrong in v1, fix during hardening.

---

**BUG-015 — Uploaded files security** — P2

- **Where:** `UPLOAD_DIR` in `.env.example`. v1 uses local filesystem for uploads.
- **Symptoms:** Files stored in predictable paths; accessible by userId enumeration; no virus scan; no size/type enforcement beyond Express-level.
- **Root cause:** No isolated storage, no per-user namespacing, no access control on file serving.
- **Fix:** Store under `${UPLOAD_DIR}/user_${userId}/${random-uuid}.${ext}`. Serve only via authenticated endpoint that verifies ownership. Enforce file type via magic bytes (not just extension). Delete after import processing unless explicitly retained.

---

**BUG-016 — Missing indexes for query performance** — P3

- **Where:** Schema has uniques but no secondary indexes on common query patterns: `Transaction.portfolioId + tradeDate`, `Holding.portfolioId + assetClass`, `CapitalGain.portfolioId + financialYear`.
- **Symptoms:** Dashboard slow on users with >1000 transactions. Report generation times out.
- **Fix:** Phase 8 performance pass adds indexes. For P0-P1 phases, note in `AUDIT_REPORT.md` but don't fix yet unless blocking.

---

### 2B.2 Placeholder — Real bugs you observed

If you have specific error messages, stack traces, or reproduction steps from your testing, add them here before running Claude Code. Template:

```
BUG-REAL-001 — <short description> — <severity>
Steps to reproduce:
  1. ...
  2. ...
Expected: ...
Actual: ...
Error message / stack trace: ...
Suspected cause: ...
```

(Currently empty. User did not provide specific symptoms. Claude Code: during audit, explicitly attempt to reproduce each BUG-xxx above and record findings.)

### 2B.3 Audit instructions for bugs

For each BUG-001 through BUG-016:

1. **Verify.** Look at the code and/or schema to confirm the bug is present. Some may have been fixed already, others may manifest differently than predicted.
2. **Record.** In `AUDIT_REPORT.md` under "Bug Verification," add a row per bug: `{id, status: CONFIRMED | NOT_PRESENT | PARTIAL | INVESTIGATING, evidence: <file:line or query output>, notes: <anything surprising>}`.
3. **Prioritize.** Order the confirmed bugs P0 → P3. P0 and P1 must all be fixed in Phase 4.5. P2 can be addressed during the phase that touches the relevant code. P3 goes to backlog.
4. **Test-first.** For every confirmed P0/P1 bug, write a failing test in `test/invariants/` or `test/regressions/` that exposes it. Only then implement the fix. This becomes permanent regression protection.

### 2B.4 Rule for newly discovered bugs

Any bug found during the audit or hardening sprint that isn't listed above gets added to this file as `BUG-NEW-XXX` with the same format, and gets the same test-first treatment. Do not fix a bug without a failing test that reproduces it first.

---

## 3. ARCHITECTURAL INVARIANTS (NON-NEGOTIABLE)

These apply to all code in the repo from the hardening sprint onwards. Any code review that finds a violation must reject the change.

### 3.1 Holdings are derived, never mutated

`Holding` / `HoldingProjection` is computed from `Transaction` + `CorporateAction` + latest price. All API reads of current portfolio state go through the projection. No code path may `UPDATE holding SET quantity = ...`. Editing a transaction triggers a recomputation, not a patch.

### 3.2 Money is `Decimal`, never `Number`

- Backend: `Prisma.Decimal` or `decimal.js`.
- API boundary: serialize as strings.
- Frontend: receive strings, parse with `decimal.js` before any arithmetic.
- Utility `assertDecimal(x)` throws on `number` input. Use it at every function boundary that handles money.

### 3.3 All ingestion is idempotent

Every `Transaction` and every `CanonicalEvent` carries a deterministic `sourceHash`. Re-running the same import → zero new rows. Tests must verify this.

### 3.4 Parser versioning is mandatory

Every parser declares `{adapter_id, version}`. Every row it produces carries both. Format change = bumped version, never in-place rewrite.

### 3.5 Dead-letter, never crash

Ingestion failures write to `IngestionFailure` with the raw payload. The job continues. UI surfaces failures for manual review or retry.

### 3.6 Row-level security

Postgres RLS enabled on every user-scoped table. Session sets `app.current_user_id`. Prisma middleware sets this on every query. Even a missed `WHERE` clause cannot leak cross-tenant.

### 3.7 Audit log for sensitive operations

Every PII display, data export, login, OAuth grant → one row in `AuditLog`.

### 3.8 No secrets in `.env` or code

Secrets (DB password, JWT secret, Gmail client secret, LLM API key, encryption keys) in a secret store. Local dev uses `.env.local` (git-ignored). Production uses AWS Parameter Store or equivalent.

### 3.9 Tests-first for parsers

A new parser starts with at least 5 anonymized real-input fixtures. CI fails if any fixture's output changes without explicit fixture update.

### 3.10 No silent try/catch

`catch (err) { console.log(err) }` is banned. Either (a) handle it meaningfully, (b) write to DLQ, or (c) rethrow. Linter rule enforces.

---

## 4. SCHEMA ADDITIONS

Add these to `packages/api/prisma/schema.prisma`. All changes are additive except Section 4.10 which migrates existing data.

### 4.1 Canonical ingestion layer

```prisma
model CanonicalEvent {
  id               String   @id @default(cuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id])
  portfolioId      String?
  portfolio        Portfolio? @relation(fields: [portfolioId], references: [id])

  // Source tracking
  sourceAdapter    String   // "gmail.generic.v1" | "cas.cams.v1" | "vahan.mparivahan.v1" | ...
  sourceAdapterVer String
  sourceRef        String   // gmail message id, file hash, RC number, etc.
  sourceHash       String   // SHA-256 idempotency key; see Section 16

  // Canonical content
  eventType        CanonicalEventType
  eventDate        DateTime @db.Date
  amount           Decimal? @db.Decimal(18,4)
  quantity         Decimal? @db.Decimal(18,6)
  price            Decimal? @db.Decimal(18,4)
  counterparty     String?
  instrumentIsin   String?
  instrumentSymbol String?
  instrumentName   String?
  accountLast4     String?
  currency         String   @default("INR")
  metadata         Json?    // adapter-specific extras
  confidence       Decimal  @db.Decimal(3,2) @default(1.00)
  parserNotes      String?  // LLM's explanation when applicable

  // Lifecycle
  status           CanonicalEventStatus @default(PARSED)
  reviewedById     String?
  reviewedAt       DateTime?
  projectedTransactionId String?  // FK once projected
  projectedCashFlowId    String?
  rejectionReason  String?

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([userId, sourceHash])
  @@index([userId, status, eventDate])
  @@index([sourceAdapter, sourceAdapterVer])
}

enum CanonicalEventType {
  BUY
  SELL
  DIVIDEND
  INTEREST_CREDIT
  INTEREST_DEBIT
  EMI_DEBIT
  PREMIUM_PAID
  MATURITY_CREDIT
  RENT_RECEIVED
  RENT_PAID
  SIP_INSTALLMENT
  FD_CREATION
  FD_MATURITY
  CARD_PURCHASE
  CARD_PAYMENT
  UPI_CREDIT
  UPI_DEBIT
  NEFT_CREDIT
  NEFT_DEBIT
  VALUATION_SNAPSHOT  // for non-transactional holdings like NPS, EPF
  VEHICLE_CHALLAN
  OTHER
}

enum CanonicalEventStatus {
  PARSED          // extracted by adapter, awaiting projection
  PENDING_REVIEW  // requires user approval (new sender or low confidence)
  CONFIRMED       // user approved
  PROJECTED       // committed to Transaction/CashFlow
  REJECTED        // user rejected
  FAILED          // parse error (see IngestionFailure for details)
  ARCHIVED        // over budget, parse deferred
}
```

### 4.2 Monitored senders (user-configured ingestion sources)

```prisma
model MonitoredSender {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  address         String   // "alerts@hdfcbank.net" or "@hdfcbank.net"
  displayLabel    String?  // user-provided, e.g. "HDFC Bank savings alerts"
  isActive        Boolean  @default(true)
  autoCommitAfter Int      @default(5)  // events from this sender before auto-commit offer
  autoCommitEnabled Boolean @default(false)
  confirmedEventCount Int  @default(0)
  currentTemplateId String?
  template        LearnedTemplate? @relation(fields: [currentTemplateId], references: [id])
  firstSeenAt     DateTime @default(now())
  lastFetchedAt   DateTime?

  @@unique([userId, address])
  @@index([userId, isActive])
}

model LearnedTemplate {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id])
  senderAddress     String
  bodyStructureHash String   // see Section 16 for algorithm
  extractionRecipe  Json     // regex/xpath selectors derived from LLM samples
  sampleCount       Int      @default(1)
  confidenceScore   Decimal  @db.Decimal(3,2) @default(0.00)
  version           Int      @default(1)
  isActive          Boolean  @default(true)
  createdAt         DateTime @default(now())
  lastUsedAt        DateTime?

  monitoredSenders  MonitoredSender[]

  @@unique([userId, senderAddress, bodyStructureHash, version])
}
```

### 4.3 Ingestion failures (DLQ)

```prisma
model IngestionFailure {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  sourceAdapter   String
  adapterVersion  String
  sourceRef       String
  errorMessage    String
  errorStack      String?  @db.Text
  rawPayload      Json?    // redacted; see Section 15.9
  resolvedAt      DateTime?
  resolvedAction  String?  // "manual_entry" | "retry_succeeded" | "ignored" | ...
  createdAt       DateTime @default(now())

  @@index([userId, resolvedAt])
}
```

### 4.4 Holdings as projection

```prisma
model HoldingProjection {
  id             String      @id @default(cuid())
  portfolioId    String
  portfolio      Portfolio   @relation(fields: [portfolioId], references: [id])
  assetKey       String      // canonical; see 4.10 migration
  assetClass     AssetClass
  stockId        String?
  fundId         String?
  assetName      String?
  isin           String?
  quantity       Decimal     @db.Decimal(18,6)
  avgCostPrice   Decimal     @db.Decimal(18,4)
  totalCost      Decimal     @db.Decimal(18,4)
  currentPrice   Decimal?    @db.Decimal(18,4)
  currentValue   Decimal?    @db.Decimal(18,4)
  unrealisedPnL  Decimal?    @db.Decimal(18,4)
  realisedPnL    Decimal     @db.Decimal(18,4) @default(0)
  computedAt     DateTime    @default(now())
  sourceTxCount  Int                           // how many transactions contributed

  @@unique([portfolioId, assetKey])
  @@index([portfolioId, assetClass])
}
```

### 4.5 Transactions idempotency + versioning (add columns to existing model)

```prisma
// ADD to existing Transaction model:
model Transaction {
  // ...existing fields...
  sourceAdapter    String?
  sourceAdapterVer String?
  sourceHash       String?  @unique
  assetKey         String   // computed; populated by migration (Section 4.10)
  canonicalEventId String?  // back-reference

  // ...
}
```

### 4.6 Vehicles

```prisma
model Vehicle {
  id                String    @id @default(cuid())
  userId            String
  user              User      @relation(fields: [userId], references: [id])
  portfolioId       String?
  registrationNo    String    // unique per user; ENCRYPTED at column level
  make              String?
  model             String?
  variant           String?
  manufacturingYear Int?
  fuelType          String?
  color             String?
  chassisLast4      String?   // needed for parivahan portal fallback
  rtoCode           String?
  ownerName         String?
  purchaseDate      DateTime? @db.Date
  purchasePrice     Decimal?  @db.Decimal(14,2)
  currentValue      Decimal?  @db.Decimal(14,2)
  currentValueSource String?  // "manual" | "carDekho" | ...
  insuranceExpiry   DateTime? @db.Date
  insurancePolicyId String?   // FK to InsurancePolicy if user has linked
  pucExpiry         DateTime? @db.Date
  fitnessExpiry     DateTime? @db.Date
  roadTaxExpiry     DateTime? @db.Date
  permitExpiry      DateTime? @db.Date
  lastRefreshedAt   DateTime?
  refreshSource     String?   // "mparivahan" | "portal" | "sms" | "manual"
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  challans          Challan[]

  @@unique([userId, registrationNo])
  @@index([userId, insuranceExpiry])
  @@index([userId, pucExpiry])
}

model Challan {
  id            String   @id @default(cuid())
  vehicleId     String
  vehicle       Vehicle  @relation(fields: [vehicleId], references: [id])
  challanNo     String
  offenceDate   DateTime @db.Date
  offenceType   String?
  location      String?
  amount        Decimal  @db.Decimal(10,2)
  status        String   // PENDING | PAID | CONTESTED | CANCELLED
  details       Json?
  fetchedAt     DateTime @default(now())

  @@unique([vehicleId, challanNo])
}
```

### 4.7 Rental

```prisma
model RentalProperty {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  portfolioId     String?
  name            String   // "Andheri East flat"
  address         String?
  propertyType    String   // RESIDENTIAL | COMMERCIAL | LAND | PARKING
  purchaseDate    DateTime? @db.Date
  purchasePrice   Decimal?  @db.Decimal(14,2)
  currentValue    Decimal?  @db.Decimal(14,2)
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())

  tenancies       Tenancy[]
  expenses        PropertyExpense[]
}

model Tenancy {
  id              String   @id @default(cuid())
  propertyId      String
  property        RentalProperty @relation(fields: [propertyId], references: [id])
  tenantName      String
  tenantContact   String?
  startDate       DateTime @db.Date
  endDate         DateTime? @db.Date
  monthlyRent     Decimal  @db.Decimal(12,2)
  securityDeposit Decimal? @db.Decimal(12,2)
  rentDueDay      Int      @default(1)  // day of month
  isActive        Boolean  @default(true)
  notes           String?
  createdAt       DateTime @default(now())

  rentReceipts    RentReceipt[]

  @@index([propertyId, isActive])
}

model RentReceipt {
  id              String   @id @default(cuid())
  tenancyId       String
  tenancy         Tenancy  @relation(fields: [tenancyId], references: [id])
  forMonth        String   // "YYYY-MM"
  expectedAmount  Decimal  @db.Decimal(12,2)
  receivedAmount  Decimal? @db.Decimal(12,2)
  dueDate         DateTime @db.Date
  receivedOn      DateTime? @db.Date
  status          String   // EXPECTED | RECEIVED | PARTIAL | OVERDUE | SKIPPED
  cashFlowId      String?
  notes           String?
  autoMatchedFromEventId String?  // CanonicalEvent that auto-marked this as received

  @@unique([tenancyId, forMonth])
  @@index([dueDate, status])
}

model PropertyExpense {
  id              String   @id @default(cuid())
  propertyId      String
  property        RentalProperty @relation(fields: [propertyId], references: [id])
  expenseType     String   // PROPERTY_TAX | MAINTENANCE | REPAIRS | UTILITIES | AGENT_FEE | LEGAL | OTHER
  amount          Decimal  @db.Decimal(12,2)
  paidOn          DateTime @db.Date
  description     String?
  receiptUrl      String?
}
```

### 4.8 Insurance

```prisma
model InsurancePolicy {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id])
  portfolioId       String?
  insurer           String   // "LIC" | "HDFC Life" | any free text
  policyNumber      String   // ENCRYPTED
  type              String   // TERM | WHOLE_LIFE | ULIP | ENDOWMENT | HEALTH | MOTOR | HOME | TRAVEL | PERSONAL_ACCIDENT
  planName          String?
  policyHolder      String
  nominees          Json?
  sumAssured        Decimal  @db.Decimal(14,2)
  premiumAmount     Decimal  @db.Decimal(12,2)
  premiumFrequency  String   // MONTHLY | QUARTERLY | HALF_YEARLY | ANNUAL | SINGLE
  startDate         DateTime @db.Date
  maturityDate      DateTime? @db.Date
  nextPremiumDue    DateTime? @db.Date
  vehicleId         String?  // for MOTOR type
  healthCoverDetails Json?   // {members: [], roomRent, coPay, subLimits, preExistingWait}
  status            String   @default("ACTIVE")  // ACTIVE | LAPSED | SURRENDERED | MATURED | CLAIMED
  createdAt         DateTime @default(now())

  premiumHistory    PremiumPayment[]
  claims            InsuranceClaim[]

  @@unique([userId, insurer, policyNumber])
  @@index([userId, nextPremiumDue])
}

model PremiumPayment {
  id              String   @id @default(cuid())
  policyId        String
  policy          InsurancePolicy @relation(fields: [policyId], references: [id])
  paidOn          DateTime @db.Date
  amount          Decimal  @db.Decimal(12,2)
  periodFrom      DateTime @db.Date
  periodTo        DateTime @db.Date
  canonicalEventId String?
}

model InsuranceClaim {
  id              String   @id @default(cuid())
  policyId        String
  policy          InsurancePolicy @relation(fields: [policyId], references: [id])
  claimNumber     String?
  claimDate       DateTime @db.Date
  claimType       String
  claimedAmount   Decimal  @db.Decimal(14,2)
  settledAmount   Decimal? @db.Decimal(14,2)
  status          String   // SUBMITTED | UNDER_REVIEW | APPROVED | REJECTED | SETTLED
  settledOn       DateTime? @db.Date
  documents       Json?
}
```

### 4.9 Audit log and app settings

```prisma
model AuditLog {
  id          String   @id @default(cuid())
  userId      String?
  action      String   // "login" | "pii_view" | "oauth_grant" | "export_data" | ...
  resource    String?  // e.g. "User:abc123" | "Vehicle:xyz"
  ip          String?
  userAgent   String?
  metadata    Json?
  createdAt   DateTime @default(now())

  @@index([userId, createdAt])
  @@index([action, createdAt])
}

model AppSetting {
  key     String @id
  value   Json
  updatedAt DateTime @updatedAt
}
```

Default `AppSetting` rows seeded by migration:
- `llm.monthly_warn_inr` → `500`
- `llm.monthly_cap_inr` → `1000`
- `llm.model` → `"claude-haiku-4-5-20251001"`
- `ingestion.default_auto_commit_threshold` → `5`
- `ingestion.discovery_scan_lookback_days` → `730`

### 4.10 Data migration (one-time)

Migration name: `20260420_hardening_assetkey_sourcehash`.

1. Add `Transaction.assetKey` as nullable column.
2. Populate from existing rows:
   - If `stockId` present → `"stock:" + stockId`
   - Else if `fundId` present → `"fund:" + fundId`
   - Else if `isin` present → `"isin:" + isin`
   - Else → `"name:" + sha256(lower(trim(assetName)))`
3. Make `assetKey` NOT NULL.
4. Build `HoldingProjection` rows by replaying all existing `Transaction` rows through the new FIFO engine.
5. Verify: `SELECT COUNT(*) FROM Holding` vs `SELECT COUNT(*) FROM HoldingProjection` — report any delta in the migration log.
6. Keep `Holding` table as read-only legacy for 1 release cycle; drop in next migration after parity confirmed.
7. Add `Transaction.sourceHash` as nullable. Backfill where possible (`sha256(source_adapter || order_no || trade_date || net_amount)` for rows with `importJobId` set). For manually-entered rows, leave NULL.
8. Add partial unique index: `CREATE UNIQUE INDEX ON "Transaction"(sourceHash) WHERE sourceHash IS NOT NULL`.

---

## 5. PHASE 4.5 — HARDENING SPRINT (DO FIRST, ~2 WEEKS)

Goal: Fix every bug class in Section 2.4 without breaking existing features. Features freeze during this phase.

### 5.1 Task list (in order)

Each task ends with a commit. Do them in this order to minimize cascading breakage.

0. **Repair build/test/lint infra.** Added 2026-04-21 after the audit surfaced that `pnpm -r run build|typecheck|lint|test` all fail on a fresh checkout. None of the downstream tasks are executable until these are green. In order:
   - Fix `packages/api/tsconfig.build.json` — drop the stray `declarationMap` override (TS5069).
   - Fix `packages/api/tsconfig.json` — stop including `prisma/**/*.ts` from the shared tsconfig (TS6059 on `seed.ts`); keep the `prisma:seed` script working via `tsx`.
   - Install ESLint + `@typescript-eslint/*` in both `packages/api` and `apps/web`. Add a shared `.eslintrc.cjs` per package (strict preset only; the bespoke rules in §5.1 task 13 are added later).
   - Install `vitest` in `packages/shared` and add a `test` script. Add minimal `vitest.config.ts` files where missing.
   - Add one smoke test per testable package (`packages/api`, `packages/shared`, `apps/web`) so `pnpm -r run test` exits 0 and we have a working baseline.
   - Verify: `pnpm -r run build && pnpm -r run typecheck && pnpm -r run lint && pnpm -r run test` all pass.
   - Commit: `chore(infra): repair build/typecheck/lint/test baseline`.

1. **Add invariant tests first.** Before fixing anything, write tests that expose the bugs:
   - `test/invariants/idempotency.test.ts` — re-importing the same CAS twice yields 0 new rows. Currently FAILS.
   - `test/invariants/holding-uniqueness.test.ts` — creating two FD holdings with different `assetName` produces 2 distinct rows. Currently FAILS.
   - `test/invariants/decimal-precision.test.ts` — buying 3 units at ₹33.33 has `totalCost = ₹99.99` exact. Currently may fail.
   - `test/invariants/cg-recompute.test.ts` — edit a BUY → corresponding `CapitalGain` rows recompute. Currently FAILS or is undefined.
   - Commit: `test: add failing invariant tests for known bug classes`.

2. **Decimal hardening.**
   - Install `decimal.js`.
   - Create `packages/shared/src/decimal.ts` with `toDecimal(x)`, `assertDecimal(x)`, `formatINR(d)` utilities.
   - Lint rule: ban `parseFloat` and `Number(` on anything flagged as monetary (use TypeScript branded types: `type Money = string & { __brand: 'Money' }`).
   - Refactor all calculators (`capitalGains.ts`, `xirr.ts`, anywhere money math happens) to use Decimal throughout.
   - API serialization: money fields as strings. Update Zod schemas accordingly.
   - Frontend: parse money strings with Decimal before display/calc.
   - Commit: `refactor: decimal.js everywhere for money math`.

3. **Schema migration (Section 4.10).** Apply in dev first, verify row counts and sample `HoldingProjection` values match what the old `Holding` table shows for at least 10 portfolios. Commit: `feat(db): add assetKey, sourceHash, HoldingProjection; backfill`.

4. **Holdings as projection.**
   - New service `packages/api/src/services/holdingsProjection.ts`:
     - `recomputeForAsset(portfolioId, assetKey)` — FIFO replay of all transactions + corporate actions.
     - `recomputeForPortfolio(portfolioId)` — loops all assetKeys.
   - Every write path that currently mutates `Holding` → replace with call to `recomputeForAsset`.
   - API routes read from `HoldingProjection`.
   - Commit: `refactor: Holdings as projection, remove direct mutations`.

5. **Idempotent importers.**
   - Add `computeSourceHash(input)` to each existing parser.
   - On import, skip rows where `sourceHash` already exists for user.
   - Verify idempotency test passes.
   - Commit: `feat(ingestion): sourceHash-based idempotency`.

6. **Fix Holding uniqueness.** The unique constraint on `(portfolioId, assetClass, stockId, fundId)` has the NULL problem. Replace with unique on `(portfolioId, assetKey)`. Migration (Section 4.10) already handles this. Verify invariant test passes.

7. **Adapter framework retrofit.**
   - Create `packages/api/src/adapters/types.ts`:
     ```ts
     export interface Adapter<TInput, TOutput extends CanonicalEvent> {
       id: string;
       version: string;
       detect(input: TInput): boolean;
       parse(input: TInput): Promise<ParseResult<TOutput>>;
     }
     export type ParseResult<T> =
       | { ok: true; events: T[]; metadata?: Json }
       | { ok: false; error: string; rawPayload?: Json };
     ```
   - Wrap existing parsers (generic CSV, CAS, Zerodha contract note) in this interface.
   - Each keeps its current behavior but now emits `CanonicalEvent[]` that then projects to `Transaction[]`.
   - Commit: `refactor: adapter framework; wrap existing parsers`.

8. **DLQ and IngestionFailure UI.**
   - Failures write to `IngestionFailure`.
   - Frontend page: `/import/failures` — list, detail, retry, mark-resolved, manual-entry-from-failure.
   - Commit: `feat(ingestion): dead-letter queue + UI`.

9. **Golden test fixtures.**
   - Create `packages/api/test/fixtures/{cas,contract_note,email}/` directories.
   - Add 5 anonymized samples per existing parser (anonymize: replace PANs with `XXXXX1234`, account numbers with `XXXX9876`, names with `TEST USER`).
   - Snapshot the parsed output in `__snapshots__`.
   - CI: parser output must match snapshot.
   - Commit: `test: golden fixtures for all parsers`.

10. **CG cascade on edit/delete.**
    - Wrap `PATCH/DELETE /transactions/:id` in a service that:
      1. Invalidates all `CapitalGain` rows touching this transaction's `assetKey`.
      2. Recomputes FIFO for that `(portfolio, assetKey)` from scratch.
      3. Recomputes `HoldingProjection` for that `(portfolio, assetKey)`.
    - Verify invariant test passes.
    - Commit: `fix: cascade capital-gains recompute on transaction edit/delete`.

11. **Postgres RLS.**
    - Enable RLS on: `Portfolio`, `Transaction`, `Holding`, `HoldingProjection`, `CapitalGain`, `CashFlow`, `ImportJob`, `Alert`, `Account`, `Voucher`, `VoucherEntry`, `CanonicalEvent`, `MonitoredSender`, `LearnedTemplate`, `IngestionFailure`, `Vehicle`, `Challan`, `RentalProperty`, `Tenancy`, `RentReceipt`, `PropertyExpense`, `InsurancePolicy`, `PremiumPayment`, `InsuranceClaim`, `AuditLog`.
    - Policy per table: `USING (user_id = current_setting('app.current_user_id', true)::text)` (with owner-join for child tables like `Transaction` → `Portfolio` → `User`).
    - Prisma middleware on every request: `SET app.current_user_id = $1`.
    - Commit: `feat(security): Postgres RLS on all user-scoped tables`.

12. **Bull worker refactor.**
    - Each job: read input → compute events in memory → single `prisma.$transaction` at the end.
    - No DB transaction spans HTTP request boundaries.
    - Timeout: 5 min per job. Longer jobs split into sub-jobs.
    - Commit: `refactor(jobs): atomic commits, bounded runtime`.

13. **Linter rules and CI.**
    - ESLint rule: no `catch (e) { console... }` without at least one of (a) rethrow, (b) `throw new DomainError(...)`, (c) `writeToDLQ(...)`.
    - ESLint rule: no `parseFloat` / `Number(` on branded `Money` types.
    - CI workflow: install → build → lint → test. Block merge on failure.
    - Commit: `ci: enforce invariants via lint + test gate`.

### 5.2 Exit criteria for Phase 4.5

- All invariant tests from 5.1.1 now PASS.
- Full test suite green.
- Manual QA checklist (50 items below) green.
- Repo can be handed to anyone and `docker-compose up` + `npm test` works end-to-end.

### 5.3 Manual QA checklist (must all pass before leaving 4.5)

Checkbox list in `test/manual-qa-phase-4-5.md`. At minimum:
- [ ] Register → login → refresh → logout.
- [ ] Create portfolio → add 10 stock BUY txns → holdings shows correct quantity, avg cost, current value.
- [ ] Edit one BUY → holdings recomputes; all derived numbers update.
- [ ] Delete one BUY → same.
- [ ] Add SELL → capital gain row created; STCG/LTCG classified correctly.
- [ ] Edit the SELL → CG row deleted and recomputed.
- [ ] Import Zerodha contract note → transactions appear.
- [ ] Import the same contract note again → ZERO new transactions.
- [ ] Import CAS PDF → MF transactions appear.
- [ ] Import the same CAS again → ZERO new transactions.
- [ ] Import a broken contract note (truncated PDF) → entry in DLQ, no crash.
- [ ] Corrupt a parser output in code → DLQ surfaces the error.
- [ ] Manually add an FD → appears in holdings (verify the uniqueness bug is fixed — add a second FD with different name, both appear).
- [ ] Two FDs with same name in same portfolio → second one merges into first (same assetKey). This is correct behavior.
- [ ] Dashboard XIRR, current value, P&L all match manually-computed values.
- [ ] Schedule 112A report exports and values match manual computation.
- [ ] Cross-user isolation: with user A's session, try to query user B's portfolio ID directly via API → 404 or 403, never 200.
- [ ] All monetary API responses are strings, not numbers.
- [ ] Decimal test: buy 3 units at 33.33 → total 99.99 exact.
- [ ] Decimal test: buy 1 unit at 100.005 → rounded consistently (banker's rounding or documented).
- [ ] FIFO edge case: buy 10 at ₹100, buy 10 at ₹110, sell 15 → cost basis = 10×100 + 5×110 = 1550. Verify.
- [ ] LTCG grandfathering: buy pre-Jan 2018 → cost basis = max(actual, FMV on 31 Jan 2018).
- [ ] Corporate action: apply a 1:2 split → quantity doubles, avg price halves, totalCost unchanged.
- [ ] Corporate action: apply a bonus → new shares at zero cost, quantity increases, avg price reduces.
- [ ] Delete a portfolio with transactions → cascade behavior is either (a) disallowed with clear error, or (b) soft-delete. Decide and document.

(Full list in the committed `manual-qa-phase-4-5.md` — aim for 50 items.)

---

## 6. PHASE 5-A — SOURCE-AGNOSTIC INGESTION (3 WEEKS)

### 6.1 LLM parser contract

Model: `claude-haiku-4-5-20251001` (as of 2026-04; read `AppSetting.llm.model` at runtime so it's swappable).

System prompt (stored as `packages/api/src/ingestion/llm/system-prompt.txt`):

```
You are a financial email parser for an Indian personal finance app. Extract structured transaction data from the email below.

Rules:
- Return VALID JSON matching the provided schema. No preamble, no markdown, no explanation outside JSON.
- Dates: ISO 8601 (YYYY-MM-DD). Convert any Indian format to this.
- Amounts: positive decimal string, no ₹ symbol, no commas. "1,23,456.78" → "123456.78".
- If the email is promotional/marketing and contains no financial event, return event_type "OTHER" with confidence < 0.3.
- If multiple events are in one email (e.g. a statement listing 10 transactions), return the `events` array with one entry per event.
- Never invent data. If a field is not present in the email, set it null.
- confidence: 0.0 to 1.0. How certain you are this is a real financial event with the claimed type and amount.
```

JSON schema (strict, enforced by Anthropic API `tool_use`):

```json
{
  "type": "object",
  "properties": {
    "events": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["event_type", "event_date", "confidence"],
        "properties": {
          "event_type": { "enum": [/* CanonicalEventType values */] },
          "event_date": { "type": "string", "format": "date" },
          "amount": { "type": ["string", "null"] },
          "quantity": { "type": ["string", "null"] },
          "price": { "type": ["string", "null"] },
          "counterparty": { "type": ["string", "null"] },
          "instrument_isin": { "type": ["string", "null"] },
          "instrument_symbol": { "type": ["string", "null"] },
          "instrument_name": { "type": ["string", "null"] },
          "account_last4": { "type": ["string", "null"] },
          "currency": { "type": "string", "default": "INR" },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
          "notes": { "type": ["string", "null"] }
        }
      }
    },
    "is_marketing": { "type": "boolean" }
  },
  "required": ["events"]
}
```

PII redaction before every LLM call (Section 15.9 covers details):
- Full PANs → `XXXXX[last4]`
- Full Aadhaar → `XXXX XXXX [last4]`
- Account numbers > 6 digits → `XXXX[last4]`
- Leave amounts, dates, ISINs, symbols, institution names as-is.

### 6.2 Source hash algorithm

```ts
// for gmail
sourceHash = sha256(`gmail:${messageId}`);

// for CAS files
sourceHash = sha256(`cas:${sha256(fileBytes)}`);

// for bank statement line item
sourceHash = sha256(`statement:${accountLast4}:${txDate}:${amount}:${description}`);

// for per-event within a multi-event email/statement
eventHash = sha256(`${sourceHash}:event:${index}:${amount}:${eventDate}`);
```

### 6.3 Body structure hash algorithm

```ts
function bodyStructureHash(emailBody: string): string {
  // Normalize:
  // 1. Strip HTML tags, preserve structure with placeholder tokens.
  // 2. Collapse whitespace.
  // 3. Replace all numbers with <NUM>.
  // 4. Replace all ISO dates and common Indian date formats with <DATE>.
  // 5. Replace currency amounts with <AMT>.
  // 6. Replace email addresses with <EMAIL>.
  // 7. Replace URLs with <URL>.
  // 8. Lowercase.
  // 9. sha256 the normalized string. First 16 hex chars.
}
```

Identical template (same boilerplate, different values) → identical hash → cache hit.

### 6.4 Template promotion (LLM → regex)

When an LLM-parsed email has the same `(sender, bodyStructureHash)` as an existing `LearnedTemplate`, increment `sampleCount`. When `sampleCount >= 10` AND all samples agree on extraction positions:

1. Given the stored samples (which include the raw email and the LLM's extraction), compute regex patterns by finding the extracted values' positions in the normalized template slots (`<NUM>`, `<AMT>`, `<DATE>` from 6.3).
2. Store in `LearnedTemplate.extractionRecipe`:
   ```json
   {
     "fields": {
       "amount": {"slot": "AMT", "index": 2},
       "event_date": {"slot": "DATE", "index": 0},
       "counterparty": {"regex": "from (.+?) on", "group": 1},
       "event_type": {"static": "UPI_CREDIT"}
     }
   }
   ```
3. Next email with same template hash → apply recipe deterministically, zero LLM cost.
4. If recipe application fails validation (e.g. extracted amount doesn't parse as Decimal) → fall back to LLM, lower template confidence, increment `version` if pattern changed.

### 6.5 Gmail integration

- OAuth 2.0 installed-app flow (one-time setup per user).
- Scope: `https://www.googleapis.com/auth/gmail.readonly`.
- Tokens encrypted at rest (pgcrypto) in `UserGmailCredential` table (add to schema).
- Refresh token rotation on every use.

### 6.6 Inbox discovery scan

```ts
// packages/api/src/ingestion/gmail/discovery.ts
async function discoverFinancialSenders(userId: string, lookbackDays = 730) {
  const senders = await gmailListAllSenders(userId, lookbackDays);
  const scored = senders.map(s => ({
    ...s,
    score: financialKeywordScore(s.recentSubjects, s.recentSnippets)
  }));
  return scored.filter(s => s.score > THRESHOLD).sort((a,b) => b.score - a.score);
}
```

Keyword list (case-insensitive, English + Hindi transliterated):
`credit`, `debit`, `transaction`, `txn`, `NEFT`, `RTGS`, `UPI`, `IMPS`, `folio`, `scheme`, `NAV`, `dividend`, `interest`, `EMI`, `loan`, `premium`, `policy`, `contract note`, `trade`, `TDS`, `salary`, `statement`, `rent`, `fixed deposit`, `FD`, `maturity`, `nominee`, `KYC`, bank/broker/insurer name keywords (`HDFC`, `ICICI`, `Zerodha`, etc.).

### 6.7 Poller

```ts
// Bull repeatable job: runs every 15 min per user
async function pollGmailForUser(userId: string) {
  const senders = await db.monitoredSender.findMany({ where: { userId, isActive: true }});
  if (senders.length === 0) return;
  const query = senders.map(s => s.address.startsWith('@') ? `from:${s.address}` : `from:${s.address}`).join(' OR ');
  const lastFetch = await getLastFetchTime(userId);
  const fullQuery = `(${query}) after:${dateToGmailQuery(lastFetch)}`;
  const messages = await gmailSearch(userId, fullQuery);
  for (const msg of messages) {
    await processEmail(userId, msg);  // dispatches to parser
  }
  await updateLastFetchTime(userId);
}
```

### 6.8 Review UI

`/ingestion/review` page:
- Tabs: **Pending Review** (new senders / low confidence) | **Recently Auto-Committed** | **Rejected/Failed**
- Each event row shows: date, counterparty, amount, type, source email preview.
- Actions per row: Approve / Edit / Reject / View original email.
- Bulk actions: approve all from sender X.
- When sender reaches 5 confirmed events: banner "HDFC Bank has been reliable. Auto-commit future events?" with Yes/Not yet buttons.

### 6.9 Projection job

When `CanonicalEvent.status` flips to `CONFIRMED`:
- Map to `Transaction` / `CashFlow` / `PremiumPayment` / `RentReceipt` / etc. based on `eventType`.
- Set `CanonicalEvent.status = PROJECTED`, store FK.
- Trigger holding recomputation for affected `(portfolio, assetKey)`.
- If mapping requires creating a new account/holding (e.g. a bank account seen for the first time), create with sane defaults and mark as `needsReview`.

### 6.10 Pre-seeded templates

Ship 25 `LearnedTemplate` rows as dev-data seeds (not committed per-user, but available as `TemplateSeed` table). On Gmail connect, if user's discovered senders match a seed sender, clone the seed into a user-owned `LearnedTemplate`.

Seed list (all pre-built from public-format samples — NO real user data):
- Banks: HDFC, ICICI, SBI, Axis, Kotak, IndusInd, Yes Bank, RBL, IDFC First, Bank of Baroda, PNB, Union Bank.
- Brokers: Zerodha, Groww, Dhan, Upstox, Angel One, ICICI Direct, HDFC Securities, 5Paisa, Paytm Money.
- Insurers: LIC, HDFC Life, ICICI Prudential, Niva Bupa, Star Health.
- Registrars: CAMS, KFintech.

### 6.11 Exit criteria

- [ ] Connect Gmail → discovery scan runs → UI shows top senders with scores.
- [ ] User picks 3 senders, one of which is NOT in pre-seed list → poller fetches emails from those senders only.
- [ ] 50 test emails (from `mprofit-corpus` label, forwarded to the connected Gmail) → ≥40 parse successfully into CanonicalEvents.
- [ ] Parsed events appear in Review UI.
- [ ] User approves 5 from a sender → "auto-commit?" banner appears → user enables.
- [ ] Next email from that sender → auto-committed, notification badge increments.
- [ ] Forward the same email again → zero duplicate events (idempotency).
- [ ] Run poller 100 times on static inbox → LLM call count goes to zero after templates are learned.
- [ ] Budget enforcement: set cap to ₹1 → next LLM call refuses, event goes to `ARCHIVED` with "over budget" reason.

---

## 7. PHASE 5-B — VEHICLES (1.5 WEEKS)

### 7.1 Adapter chain

```ts
// packages/api/src/adapters/vehicle/chain.ts
const adapters = [
  new MParivahanApiAdapter(),    // fastest, most fragile
  new ParivahanPortalAdapter(),  // slower, needs OTP
  new SmsFallbackAdapter(),      // manual paste
];

async function fetchVehicleDetails(userId: string, regNo: string) {
  for (const adapter of adapters) {
    try {
      const result = await adapter.fetch(regNo);
      if (result.ok) return result;
    } catch (e) {
      logger.warn({adapter: adapter.id, regNo, error: e});
    }
  }
  // all failed → DLQ
  await writeIngestionFailure({ userId, sourceAdapter: 'vehicle.chain', ... });
  return { ok: false, reason: 'ALL_ADAPTERS_FAILED' };
}
```

### 7.2 MParivahan API adapter

- Base URL and endpoints: reverse-engineered from the Android app. Claude Code should:
  1. First search GitHub for recent open-source implementations (`"mparivahan" api` or `"getRCDetails"` as keywords).
  2. Use the most-starred recent one as a starting reference.
  3. Implement the adapter, but wrap every API call in try/catch with clear "API_CHANGED" error on unexpected responses.
- Rate limit self-imposed: max 5 requests/min, max 100/day per device token.
- Device token generated on first run (mimics app registration), cached in `AppSetting.vehicle.mparivahan_token`. Rotatable.

### 7.3 Parivahan portal adapter

Playwright in headed mode (so user can solve OTP):
```ts
// packages/api/src/adapters/vehicle/parivahan-portal.ts
async function fetchViaPortal(regNo: string, chassisLast4: string) {
  const browser = await playwright.chromium.launch({ headless: false });
  // navigate to parivahan.gov.in 'Know Your Vehicle Details'
  // fill reg number, chassis last 4
  // CAPTCHA: try EasyOCR; if fails, prompt user via in-app modal "Enter CAPTCHA from browser window"
  // Mobile OTP: browser window visible, user enters OTP manually
  // on success, scrape result table
  // return structured data
}
```

Note: headed Playwright requires a user interaction channel. For v2, gate this adapter to "manual refresh" button in UI (user-triggered, not auto-poller). Automated (headless) version deferred pending more robust CAPTCHA/OTP solution.

### 7.4 SMS fallback

UI-only adapter: shows user instructions "Text VAHAN `<regNo>` to 07738299899 and paste reply below." Regex-parse the standard SMS reply format into `Vehicle` fields.

### 7.5 Challan adapter

`echallan.parivahan.gov.in`:
- Playwright flow similar to 7.3.
- OTP required per session.
- Scheduled per-user monthly, or on-demand via UI "Check challans" button.
- Writes `Challan` rows (unique by `(vehicleId, challanNo)`).
- `CanonicalEvent` with type `VEHICLE_CHALLAN` created for each new challan; projects to nothing (challans aren't transactions, they're alerts).

### 7.6 Scheduler

```ts
// Daily cron: for each Vehicle, if lastRefreshedAt > 7 days → queue refresh job.
// Monthly cron: challan scan for each active vehicle.
```

### 7.7 Frontend

- `/vehicles` — list with expiry badges.
- `/vehicles/:id` — detail: RC, owner, PUC/insurance/fitness/tax expiry, challan history, linked insurance policy, manual current value input.
- Alert bell: 30/15/7/1 day reminders for PUC, insurance, fitness.

### 7.8 Exit criteria

- [ ] Add vehicle `MH47BT5950` → at least one adapter returns data → Vehicle row populated.
- [ ] If mParivahan adapter fails, portal adapter is tried → user sees OTP prompt.
- [ ] Challan scan runs and returns either a list or empty (both valid).
- [ ] PUC/insurance expiry correctly populated.
- [ ] Alert triggers at 30-day mark for insurance expiring soon.

---

## 8. PHASE 5-C — RENTAL (1 WEEK)

### 8.1 Core flows

- Add property → add tenancy (monthly rent, due day, start date) → system auto-generates `RentReceipt` rows with `status=EXPECTED` for each month through tenancy end (or 12 months rolling if no end date).
- Daily cron: for each receipt with `dueDate <= today AND status == EXPECTED`:
  - If past due by >7 days → flip to `OVERDUE`, create alert.
- Manual "Mark received" button → user enters amount + date → `status = RECEIVED` + creates `CashFlow` + `CanonicalEvent` with `eventType = RENT_RECEIVED`.

### 8.2 Bank-alert auto-matching

When a `CanonicalEvent` with `eventType == UPI_CREDIT | NEFT_CREDIT` lands with an amount matching an `EXPECTED` rent receipt (within ±₹10), and within ±5 days of `dueDate`, and the `counterparty` name has ≥50% similarity to `Tenancy.tenantName` (use Levenshtein ratio):
- Auto-mark the `RentReceipt` as `RECEIVED`.
- Link via `autoMatchedFromEventId`.
- Surface notification: "Auto-matched ₹45,000 credit from Rajesh to April rent receipt. Tap to verify."
- User can undo auto-match.

### 8.3 Property expenses

Manual entry form. Categories listed in schema (Section 4.7). Linked to property for reporting.

### 8.4 Reporting

- Per-property P&L: rent received − property expenses.
- Annual rental income for ITR (summary by FY).

### 8.5 Exit criteria

- [ ] Create property + tenancy → 12 receipts auto-generated.
- [ ] Mark one received manually → cashflow appears.
- [ ] Force a matching UPI_CREDIT CanonicalEvent → auto-match proposed → user accepts → receipt flipped.
- [ ] Overdue alert fires at +7 days.

---

## 9. PHASE 5-D — INSURANCE (1 WEEK)

### 9.1 Core

- CRUD on `InsurancePolicy`.
- Gmail/email-parsed `PremiumPayment` entries auto-populate via Phase 5-A adapters — no per-insurer adapter needed.
- Motor policy with `vehicleId` set → shows up on Vehicle page too.

### 9.2 Renewal alerts

Daily cron: for each policy, if `nextPremiumDue` is within 30/15/7/1 days → alert.

### 9.3 Health cover coverage view

If type == HEALTH with `healthCoverDetails` filled, show:
- Members covered
- Sum assured
- Room rent limit
- Co-pay %
- Sub-limits
- Gap analysis: "Coverage may be insufficient if recent hospitalization costs in your city average ₹X lakhs." (static heuristic, not critical.)

### 9.4 Exit criteria

- [ ] Add 3 policies of different types.
- [ ] Premium emails parsed via Phase 5-A land against the right policy (match by policyNumber or insurer+policyHolder+premiumAmount).
- [ ] Renewal alert fires at 30-day mark.

---

## 10. PHASE 5-E — REMAINING ASSETS (2 WEEKS)

For each, build minimum-viable module: manual entry + whatever automation is achievable.

### 10.1 EPF

- Manual entry: UAN, current balance, employer contribution history.
- Playwright adapter: EPFO passbook site, user provides UAN OTP, scrape balance.
- Run: user-triggered, not auto.

### 10.2 NPS

- Manual entry: PRAN, scheme allocation (E/G/C/A %), current NAV.
- Playwright adapter: NSDL CRA, user provides OTP.

### 10.3 PPF

- Manual entry only for v2. Gmail adapter via Phase 5-A catches yearly interest credits and contributions.

### 10.4 FD / RD

- Manual entry.
- Gmail adapter catches creation and maturity advice.

### 10.5 Bonds / G-Secs

- Comes via eCAS parser (existing in v1 or extend).

### 10.6 Gold

- Physical gold: manual. Price via MCX EOD (integrate AMFI-style daily file if available; else manual current value).
- Digital gold / SGB: manual + email parsing.

### 10.7 Real estate

- Manual. Link to Rental (Phase 5-C) via `portfolioId`.

### 10.8 Crypto (optional in v2-E)

- CoinDCX and WazirX APIs (both public).
- User provides API key (read-only) in app → fetch balances.

### 10.9 Exit criteria

- [ ] Every asset class from v1 `AssetClass` enum has a minimum-viable UI (list + add/edit/delete).
- [ ] At least EPF, NPS, FD, Gold are fully present.

---

## 11. PHASE 6 — ACCOUNTING (2 WEEKS)

Spec unchanged from `CLAUDE_v1_archive.md` Section 6.7. Read that section; implement as written. All accounting writes go via the canonical event projection flow from Section 6 of this file (no direct mutations).

---

## 12. PHASE 8 — POLISH (2 WEEKS)

- Alerts notification center (union of all alert sources: FD/bond maturity, PUC/insurance expiry, rent overdue, premium due, price targets).
- Email notifications (daily digest + urgent-now).
- Dark mode.
- Mobile PWA polish (responsive check every page at 375px).
- Performance: add the indexes listed in schema, add Redis caching for report endpoints (10 min TTL).
- Onboarding flow: 5-step wizard for new users (add portfolio → connect Gmail → pick senders → upload CAS → see first dashboard).

---

## 13. PHASE 9 — SELECTIVE ADDITIONAL FEATURES (2 WEEKS)

Pick per priority. Recommended for v2:
- **AI portfolio insights** — Claude API (not Haiku, use full Opus or Sonnet) generates narrative of "what happened this month" based on cashflows + valuations.
- **Goal planning** — retirement / child education / home with progress bar.
- **Tax-loss harvesting** — show stocks/funds with unrealized losses that could offset this year's realized gains.

Defer: multi-currency, public API, collaborative portfolios (belongs with v3 family features).

---

## 14. CODE CONVENTIONS

### 14.1 TypeScript
- `"strict": true` everywhere.
- Branded types for `Money = string & { __brand: 'Money' }`, `ISODate = string & { __brand: 'ISODate' }`, `UserId = string & { __brand: 'UserId' }`.
- No `any`. Use `unknown` + narrow.

### 14.2 Dates
- Store all timestamps in UTC. Use `TIMESTAMPTZ` in Postgres.
- API returns ISO 8601.
- Frontend displays in user's timezone (default: `Asia/Kolkata`).
- `@db.Date` for date-only fields (no timezone drift).

### 14.3 Money
- `Decimal(18,4)` for most. `Decimal(18,6)` for quantities. `Decimal(14,2)` for asset purchase prices.
- Rounding: banker's rounding (half-to-even) for all display. Store full precision.
- Indian formatting: `formatINR(d)` → `"₹1,23,456.78"` for display.

### 14.4 API shape
```ts
type ApiResponse<T> =
  | { success: true; data: T; meta?: { total?: number; page?: number; limit?: number } }
  | { success: false; error: { code: string; message: string; field?: string } };
```

### 14.5 Error codes
Central registry in `packages/shared/src/errors.ts`. Examples: `AUTH_INVALID`, `RATE_LIMIT`, `PARSER_UNSUPPORTED`, `LLM_BUDGET_EXCEEDED`, `DUPLICATE_IDEMPOTENCY`, `PII_ENCRYPTED_DECRYPT_FAIL`.

### 14.6 Logging
Structured JSON logs. `pino` recommended. Every request has a `requestId`. Every job has a `jobId`. Never log full PII (redact before log).

### 14.7 Commits
Conventional Commits. Examples:
- `feat(ingestion): source-agnostic LLM parser`
- `fix(holdings): cascade recompute on txn edit`
- `refactor(decimal): replace JS number with Decimal.js`
- `test(fixtures): add HDFC txn alert golden samples`
- `chore(deps): bump prisma to 5.x`

---

## 15. SECURITY REQUIREMENTS

### 15.1 Column-level encryption
pgcrypto extension. Encrypt at rest: `User.pan`, `User.aadhaar`, `Vehicle.registrationNo` (display as masked), `InsurancePolicy.policyNumber`, OAuth access/refresh tokens, Gmail credentials. Encryption key from AWS Parameter Store or env var `APP_ENCRYPTION_KEY` (32 bytes base64).

### 15.2 Passwords
Argon2id, m=64MB, t=3, p=1. `bcrypt` acceptable only for backward-compat with existing v1 users; migrate on next login.

### 15.3 JWT
- Access token: 15 min.
- Refresh token: 30 days, rotating (each use issues new, old revoked).
- Revocation list in Redis with TTL.

### 15.4 Row-level security
Mandatory (Section 3.6).

### 15.5 TLS
All production traffic HTTPS. HSTS header. Redirect HTTP → HTTPS.

### 15.6 CORS
Whitelist frontend origin only. No `*`.

### 15.7 Rate limiting
- Auth endpoints: 5/min/IP.
- General API: 100/min/user.
- PII-display endpoints: 5/min/user.
- Import endpoints: 10/min/user.

### 15.8 Audit log
Write `AuditLog` row for: login (success + fail), logout, PII display, data export, OAuth grant, OAuth revoke, vehicle/insurance/bank data modification.

### 15.9 PII redaction for LLM calls
Before any email body is sent to the LLM:
- PAN pattern (`[A-Z]{5}[0-9]{4}[A-Z]`) → `XXXXX1234` (preserve last 4).
- Aadhaar pattern (`\d{4}\s?\d{4}\s?\d{4}`) → `XXXX XXXX 1234`.
- Account numbers (runs of 9–16 digits in contexts matching "A/c", "account", "acct") → `XXXX1234`.
- Phone (Indian formats) → `XXXXXXX1234`.
- CVV / PIN / OTP if detected → entirely blanked.
- Unit tests in `test/security/redaction.test.ts` with 20+ patterns.

### 15.10 Secrets
Never in `.env.example` committed to repo (use placeholder values). Never in application code. Always via env vars backed by a secret manager in production.

### 15.11 Backups
Encrypted nightly dumps to S3-compatible storage. Test restore quarterly (manual: document in `SECURITY.md`).

### 15.12 Incident playbook
Create `SECURITY.md` with: contact, disclosure policy, what to do if server compromised, key rotation procedure, Gmail OAuth mass-revocation procedure.

---

## 16. REVIEW GATES (STOP-AND-ASK)

Claude Code must halt and wait for explicit user approval at these checkpoints:

| Gate | When |
|---|---|
| G1 | After `AUDIT_REPORT.md` (before any code changes). |
| G2 | Before running the Section 4.10 data migration in dev. |
| G3 | Before running any DB migration in production. |
| G4 | Before enabling RLS on existing tables (could break queries). |
| G5 | Before the first LLM call in dev (verify Anthropic API key works, budget tracking works). |
| G6 | Before Phase 5-B scraping runs against real parivahan.gov.in. |
| G7 | Before deploying to any hosted environment. |

At each gate: write the current state summary, what's about to happen, and what could go wrong. Wait for user.

---

## 17. DEFAULTS FOR UNSPECIFIED CHOICES

Where the user hasn't explicitly decided something, use these defaults. Change if requested:

- Default portfolio created on signup: "My Portfolio" (type `INVESTMENT`, currency `INR`).
- Default timezone: `Asia/Kolkata`.
- Default currency: `INR`.
- Default review-mode threshold: 5 confirmed events before offering auto-commit.
- Default LLM budget: ₹500 warn / ₹1000 cap per user per month.
- Default Gmail discovery lookback: 2 years.
- Default fetch frequency: Gmail every 15 min; vehicle weekly; challan monthly.
- Default alert lead times: 30/15/7/1 days before expiry.
- Default PDF report footer: "Generated by PortfolioOS on {date}".
- Default CAPTCHA OCR: EasyOCR, fallback to user input.
- Default number format: Indian (lakhs/crores).
- Default test framework: Vitest (per v1 spec).

---

## 18. WHAT "DONE" LOOKS LIKE

v2 is complete when:

1. All Phase 4.5 invariant tests pass and 50-item manual QA is green.
2. Connecting a real Gmail account → discovery → monitored senders → emails parsed into CanonicalEvents → approved → projected to Transactions. All without the user creating a Gmail label.
3. Vehicle `MH47BT5950` added → RC details fetched via scraping → challans listed → expiry alerts configured.
4. Add a rental property + tenancy → monthly receipts auto-generated → one matches a bank-credit event and auto-marks received.
5. Add an insurance policy → premium email from Gmail auto-populates PremiumPayment.
6. All assets from v1 `AssetClass` enum have a working UI.
7. Accounting module fully implemented per v1 spec.
8. Dashboard shows net worth across all asset classes, XIRR, P&L, and expiry alerts in one view.
9. Full test suite green. No `any`, no `parseFloat` on money, no silent catches.
10. Security checklist (Section 15) fully implemented.

---

## 19. IF YOU GET STUCK

Write to `BLOCKED.md` with:
- What you were trying to do.
- What you tried.
- What failed (full error).
- What you need (a decision, a credential, a library version, more information).
- Stop. Wait for user.

Never paper over a blocker by implementing a different thing. Never delete or mutate user data to "reset" state. Never disable tests to make CI green.

---

## 20. PLUGINS, CONNECTORS, AGENTS, SKILLS, AND PACKAGES — WHEN TO ASK

At many points during this project, a Claude Code plugin, MCP connector, subagent, skill, or third-party package may make a task faster or more reliable. Examples of when these are likely useful:

- **Database work.** A Postgres MCP connector lets you inspect the live schema and query real data instead of reading `schema.prisma` and guessing.
- **Playwright / browser automation.** For Phase 5-B (vehicle scraping) and Phase 5-E (EPFO/NPS).
- **PDF parsing.** A PDF-extraction skill may handle CAS and contract notes better than generic `pdf-parse`.
- **Gmail / OAuth.** A Gmail MCP connector may simplify Phase 5-A.
- **Npm/pip packages.** Any standard library dependency (`decimal.js`, `pino`, `argon2`, `playwright`, etc.).

### 20.1 Rule: install freely, ask only when user action is needed

**Default behavior: just do it.** If you can install and use a tool without any help from the user, proceed. No need to ask, no need to write a request. Examples of "just do it" cases:

- Installing an npm package (`npm install decimal.js`).
- Installing a pip/uv package.
- Installing a Playwright browser via `npx playwright install`.
- Adding a dev dependency (`-D eslint-plugin-...`).
- Using a skill that's already available in your environment.
- Spawning a subagent for a focused subtask.
- Running CLI tools (`curl`, `jq`, `psql`, etc.) if present.

**Stop and ask in chat only when the user must take an action.** Specifically:

- A Claude Code plugin or MCP connector that requires the user to enable it in Claude Code settings.
- A connector/integration that requires the user to paste an API key, connection string, OAuth grant, or similar secret.
- A tool that requires the user to install something on their own machine (a Chrome extension, a desktop app, a system-level binary that needs admin rights).
- Anything that costs money or creates an account in the user's name.
- Anything that would access user data (Gmail, bank, etc.) for the first time.

### 20.2 When asking is required, the format is:

```
🔧 Need your help

Task: [one sentence]
Tool: [exact name + source]
What I need from you: [exact action, e.g. "enable the Postgres MCP connector in Claude Code
  settings and paste the DATABASE_URL from .env.local when prompted"]
Why: [one sentence]
Alternative if you'd rather not: [fallback, or "none — this is required to proceed"]
```

Wait for explicit yes/no. Don't ask for the same tool twice in the same session unless context materially changes.

### 20.3 Guardrails

- Don't install packages with known security issues. If `npm audit` or similar flags something, mention it and pick a different package.
- Don't install abandoned packages (>2 years no updates, <100 weekly downloads) without noting why.
- For any package that writes to or reads from the DB, a user's filesystem outside the repo, the network, or process env, briefly document in the relevant file *why* it was chosen over alternatives. One sentence is enough.
- Prefer well-maintained, widely-used packages over clever-but-obscure ones.

### 20.4 Tracking

Keep a short log in `TOOLING.md` at repo root. Only log things worth remembering later — don't log every `npm install`. Worth logging:

- Any MCP connector enabled.
- Any unusual dependency (something non-obvious or non-standard).
- Anything the user declined.
- Anything you tried, didn't like, and replaced.

Format is free-form; a bulleted list with dates is fine.

---

**START NOW: Read this file and `CLAUDE_v1_archive.md`. Then execute Section 2 (Audit). Write `AUDIT_REPORT.md`. Wait.**
