# PortfolioOS — Full Context Document

> Single-file orientation for an LLM or a new engineer. Read this before touching
> anything. It describes what the system is, how it is put together, which
> invariants must never be broken, and where the sharp edges are.
>
> Older files reference a `CLAUDE.md` with section numbers (`§3.2`, `§6.9`, …).
> That file no longer exists in the repo. Those markers survive in code comments
> as historical pointers — the rules they refer to are restated here.

---

## 1. What this is

**PortfolioOS** (product name *mProfit*) is a full-stack, multi-asset portfolio
management and accounting platform for Indian investors — retail, HNI, family
offices, advisors, CAs and traders. It is positioned as a modern replacement for
the legacy mProfit desktop product, with additions the desktop app never had
(automatic ingestion, an advice engine, a household view, a robo-advisor).

Everything is India-specific: rupees, financial years (Apr–Mar), Indian capital
gains law (STCG/LTCG, §112A grandfathering, §55(2)(ac) FMV, indexation via CII),
EPFO/PPF, post office small savings, NSE/BSE, AMFI NAVs, Tally export, Razorpay.

**Single-tenant-per-user with an optional household layer.** One logged-in user
owns their data; a `Family` can span several users with per-member visibility
caps.

---

## 2. Tech stack

**Frontend** — React 18, TypeScript, Vite, Tailwind + shadcn/ui, Zustand (client
state), TanStack React Query v5 (server state), React Router v6, TanStack Table,
Recharts, React Hook Form + Zod, axios, date-fns.

**Backend** — Node 20, TypeScript (ESM, NodeNext resolution), Express, Prisma 5.22
over PostgreSQL 15 (Neon in production), Redis 7 + Bull (queues), JWT + bcrypt,
Zod, pino, decimal.js, Playwright (portal automation), Sentry.

**Shared** — `@portfolioos/shared`: types, money primitives, formatters, finance
math, entitlements. Imported by both sides. **This is the contract layer.**

**Infra** — pnpm workspaces monorepo, Docker Compose locally, Railway in
production (`railway-api.toml`, `railway-web.toml`).

### Repo layout

```
portfolioos/
├── apps/web/                    React SPA (Vite)
├── packages/api/                Express + Prisma backend
│   ├── prisma/schema.prisma     101 models, ~3,500 lines
│   ├── prisma/migrations/       69 migrations
│   ├── src/adapters/            External-source parsers/scrapers (57 files)
│   ├── src/ai/                  Claude client, prompts, chat sessions
│   ├── src/config/env.ts        Zod-validated environment
│   ├── src/connectors/          Gmail OAuth, Zerodha OAuth
│   ├── src/controllers/         HTTP handlers (49 files)
│   ├── src/ingestion/           Email → CanonicalEvent pipeline
│   ├── src/integrations/        Finfactor (Finvu AA)
│   ├── src/jobs/                Bull workers + cron (15 files)
│   ├── src/lib/                 Prisma, RLS, queue, SSE, storage, crypto
│   ├── src/middleware/          auth, plan gating, validation, errors
│   ├── src/priceFeeds/          NSE, BSE, AMFI, Yahoo, crypto, FX, fuel
│   ├── src/routes/              48 route modules + index
│   ├── src/services/            Business logic (162 files)
│   └── test/                    85 test files
├── packages/shared/             Types, money, entitlements, finance math
├── eslint-plugin-portfolioos/   Two custom lint rules (see §12)
└── pnpm-workspace.yaml
```

### Commands

```bash
pnpm dev            # api + web in parallel
pnpm build          # all packages
pnpm typecheck      # tsc --noEmit everywhere
pnpm lint
pnpm test           # vitest; API suite is sequential, ~26 min
pnpm db:migrate     # prisma migrate dev
pnpm db:generate    # regenerate Prisma client
```

**Gotcha that has broken the build twice:** `packages/shared/dist` is gitignored.
After editing `packages/shared/src`, rebuild shared or the API compiles against a
stale `dist` and fails in confusing, unrelated ways.

---

## 3. The five invariants

These are non-negotiable. Most of the architecture exists to enforce them, and
most historical bugs were violations of one of them.

### 3.1 Money is never a JavaScript number

`Decimal` (decimal.js) internally; **decimal strings** at the API boundary.

`packages/shared/src/decimal.ts` defines branded types:

```ts
export type Money    = string & { readonly __brand: 'Money' };
export type Quantity = string & { readonly __brand: 'Quantity' };
```

- Producers emit via `serializeMoney(...)`.
- Consumers call `toDecimal(...)` before *any* arithmetic.
- Schema precision: money `Decimal(18,4)`, quantity `Decimal(18,6)`.
- `parseFloat` and `Number(x)` on money are **lint errors** (§12).

### 3.2 Holdings are a projection, never a source of truth

`Transaction` rows are the source of truth. `HoldingProjection` is derived by
replaying transactions (FIFO) through `services/holdingsProjection.ts`.

- Any transaction write triggers `recomputeForAsset(portfolioId, assetKey)`.
- `assetKey` (`services/assetKey.ts`) is the identity of an instrument — the
  uniqueness key that replaced a broken multi-column key.
- The legacy `Holding` table is **frozen**. `services/holdings.service.ts` is a
  deprecated shim over the projection; new code imports `holdingsProjection.js`
  directly.
- F&O is excluded: `FUTURES`/`OPTIONS` live in `DerivativePosition` because
  weighted-average cost across strikes is meaningless.

### 3.3 Every ingestion path is idempotent

`sourceHash` (`services/sourceHash.ts`, `ingestion/hash.ts`) is computed per
source artefact. Re-polling a mailbox, restarting a worker or re-uploading a file
must never double-count. Enforced by unique constraints and asserted in
`test/invariants/idempotency.test.ts`, `pf-idempotency`, `fo-idempotency`.

### 3.4 Tenant isolation is enforced by Postgres, not by application `where`

See §5. The application's `where: { userId }` is a convenience; RLS is the
guarantee. It **fails closed** — no ambient context means zero rows, not all rows.

### 3.5 Failures are recorded, never swallowed

Every parse/fetch failure writes an `IngestionFailure` row (the DLQ), visible to
the user at `/import/failures` and `/ops/ingestion-failures`. Empty `catch`
blocks and `catch { console.log(e) }` are **lint errors** (§12).

---

## 4. Request lifecycle

```
HTTP request
  → helmet, CORS allow-list (+ *.railway.app regex)
  → express.json (10mb)
  → pino-http structured logging
  → standardLimiter (rate limit, /api/*)
  → route module
      → authenticate            (JWT → req.user, enterUserContext(userId))
      → requireFeature(FLAG)    (plan-tier gate, optional)
      → validate(zodSchema)     (optional)
      → asyncHandler(controller)
          → service layer
              → prisma  ──$allOperations hook──▶  set_config('app.current_user_id')
                                                  inside a short transaction
  → errorHandler (typed AppError → status + code)
```

**`asyncHandler` (`middleware/validate.ts`) is mandatory on every async Express handler.** A route without
it turns a rejected promise into an unhandled rejection that kills the Node
process. In production this surfaced as a phantom CORS error in the browser —
the server died before it could write CORS headers, so the browser reported the
wrong cause. All 17 PF routes once lacked it; that was the bug.

### Auth

- Access token (short) + refresh token (`RefreshToken` table).
- `authenticate` uses `enterUserContext` (`ALS.enterWith`), **not** `run(cb)`.
  `run` unwinds when its synchronous callback returns, and some callback-based
  middleware (multer disk storage) does not propagate the store. `enterWith`
  binds the store to the request's async resource and all descendants.
- `services/auth.service.ts` exports `issueSession(user)`; register, login,
  refresh and Google OAuth all reuse it.
- Frontend `api/client.ts` refreshes on 401 with a shared in-flight promise so
  concurrent 401s trigger one refresh, not N.

---

## 5. Row-Level Security (the most important subsystem)

### The mechanism

Migration `20260421140000_phase_4_5_rls` installs on every user-scoped table:

```sql
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT current_setting('app.current_user_id', true) $$;

CREATE OR REPLACE FUNCTION app_is_system() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT current_setting('app.bypass_rls', true) = 'on' $$;

ALTER TABLE "Portfolio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Portfolio" FORCE ROW LEVEL SECURITY;
CREATE POLICY portfolio_owner ON "Portfolio"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
```

`FORCE` matters: Postgres exempts the table owner from RLS by default, which
would defeat the whole thing since Prisma typically connects as the owner.

Child tables (no `userId` of their own) join back through their parent —
`EpfMemberId` through `ProvidentFundAccount`, `VoucherEntry` through `Voucher`,
and so on.

### The application half

`lib/requestContext.ts` — AsyncLocalStorage stashed on `globalThis` (vitest's
per-file module isolation would otherwise give each test file a fresh ALS while
the cached Prisma hook still reads the first one's):

```ts
runAsUser(userId, fn)   // job/worker entry points
runAsSystem(fn)         // break-glass: price refresh, schedulers
enterUserContext(id)    // request middleware, test hooks
isInTransaction()       // set inside runInTransaction
```

`runAsUser`/`runAsSystem` internally `await fn()` inside the `.run` callback. With
a non-async `fn`, Prisma returns a deferred promise synchronously and the store
would exit before the hook runs.

`lib/prisma.ts` — a `$extends` `$allOperations` hook:

1. Model not in `USER_SCOPED_MODELS` → pass through (reference tables like
   `StockMaster`, `MFNav`, `FXRate` are shared market data).
2. `isInTransaction()` → run inline; `set_config` was already issued on the
   caller's transaction.
3. No ambient context → pass through, and the policy returns zero rows.
   **This is the fail-closed guarantee, not an oversight.**
4. Otherwise open a short interactive transaction, `set_config(..., is_local=true)`,
   re-dispatch the operation onto the transaction client.

### `runInTransaction` — read this before writing multi-row logic

`prisma.$transaction` **is not atomic for user-scoped models.** The hook
re-dispatches each operation onto its own transaction on a different connection,
so writes survive a rollback of the outer block. This was silent: code that read
as atomic was not.

Use `runInTransaction(fn)` from `lib/prisma.ts` instead. It issues `set_config`
once on the transaction the callback actually uses, sets the `inTransaction`
flag, and the hook then runs every query inline on that same connection. One
connection, one transaction, real atomicity, RLS still enforced.

Proven by `test/invariants/transaction-atomicity.test.ts` (a rollback probe that
used to leave the row behind).

### Registration is a paired obligation

A table with an RLS policy but no entry in `USER_SCOPED_MODELS` gets **no session
variable**, so under the `NOBYPASSRLS` runtime role every read returns zero rows
and every write fails with `42501`. This has happened repeatedly (PF tables,
`Goal`, `BankAccount`, then 19 more, then 12 more).

**Adding an RLS policy and adding the model to `USER_SCOPED_MODELS` are two
halves of one change. Never do one without the other.**
`test/invariants/user-scoped-coverage.test.ts` enforces this.

Deliberate exemptions: `RefreshToken` and `PasswordResetToken` are read *before*
the caller has an identity, so a userId policy cannot apply. Their security model
is the single-use secret token itself.

### Database roles

- `portfolioos_app` — `NOSUPERUSER NOBYPASSRLS`, created by migration
  `20260421150000_phase_4_5_rls_app_role`. Runtime connects as this via
  `DATABASE_URL`.
- Migrations run as superuser via `DIRECT_URL`.

⚠ **Production caveat:** if `DATABASE_URL` still points at the Neon owner role
(`neondb_owner`), it has `BYPASSRLS` and **none of the above is enforced**. The
`.env` change is local-only because `.env` is gitignored. The dev password
`portfolioos_app_dev` lives in migration SQL and must be overridden before
production use.

---

## 6. Family / household layer

### Model

`Family` → `FamilyMember` (role: `OWNER` | `CONTRIBUTOR` | `VIEWER`, status:
`ACTIVE` | `PENDING` | `REVOKED`) → `FamilyInvitation` / `PendingFamilyInvite`.

Per-member caps: `visibleAssetClasses: AssetClass[]` and `visibleCategories:
string[]` (non-asset-class tokens — `VEHICLE`, `LOAN`, `GOAL`, `INSURANCE`, …).

### `EffectiveScope` — the single authority

`services/familyScope.service.ts` is the only module in the codebase that knows
about `FamilyMember` rows. Everything else consumes an `EffectiveScope`:

```ts
interface EffectiveScope {
  callerId: string;
  familyId: string | null;          // null = personal view
  role: FamilyRole | null;
  readableUserIds: string[];        // always includes callerId
  writableUserIds: string[];        // v1: [callerId] only
  readableFamilyIds: string[];
  writableFamilyIds: string[];
  allowedAssetClasses: AssetClass[] | null;  // null = unrestricted
  allowedCategories: NonAcCategory[] | null; // [] = deny-all
}
```

Semantics (revised after user testing — an earlier design firewalled peers from
each other and was wrong):

- **Personal view** (no family header) → own data only.
- **Family view** → the union of every ACTIVE member's personal data plus every
  family-shared entity, **filtered by the caller's caps**.
  - `OWNER` — whole union, no filter.
  - `CONTRIBUTOR` — filtered; may write own transactions and family portfolios.
  - `VIEWER` — same filter, read-only.

**`null` means unrestricted; `[]` means deny-all.** Conflating the two is a
fail-*open* bug and it shipped once — an empty array was treated as "no
restriction" and showed restricted members everything.

`readableUserIds` **is not on its own an authorisation decision.** Callers must
also apply the caps. Two places deciding who may be seen is how the two drift
apart.

Sibling enumeration runs inside `runAsSystem` as a documented, bounded
*authorisation* lookup (selects only `userId`, only after membership is proven) —
necessary because the RLS policy hides sibling `FamilyMember` rows from the very
query that needs to establish who the siblings are.

Client selects the family view via the `X-Viewing-As-Family` header
(`stores/familyScope.store.ts` → `api/client.ts` interceptor). The server
re-verifies membership; a forged header raises `ForbiddenError`.

### Household aggregates

`services/family/familyAggregate.service.ts`:

- `getFamilyWealth` — net worth per member and household total
- `getFamilyGoals` — shared goals with progress
- `getFamilyProtection` — insurance cover vs requirement per member
- `getFamilyAttention` — a when/what/how-much ledger of open items
- `getFamilyMemberDetail(callerId, familyId, memberUserId)` — one member's page,
  **derived by filtering the household aggregates** rather than by three new
  loaders, so a member page can never disagree with the dashboard it was opened
  from. Throws `ForbiddenError` if the member is outside `readableUserIds`.

### UI rule for partial data

A restricted view must announce itself. This is a product invariant, not polish:

- restricted net worth is labelled a **floor**, never a total
- hidden categories are named in prose, so a blank section reads *"not shared
  with you"* rather than *"they have none"*
- `protection === null` → *"we can't tell you either way"*, never *"no cover"*
- `hasNoCover === null` is a **third state**, distinct from covered/uncovered
- hidden liabilities render **"Not shared"**, never ₹0, and flag that net worth
  above is therefore un-reduced by debt
- `requiredLifeCover === null` → *"Income not on file"*, never ₹0

Vocabulary lives in `apps/web/src/pages/family/widgets/RestrictedNotice.tsx`
(`PartialDataNotice`, `RestrictedChip`, `PartialSuffix`, `ScopeRestrictedNotice`,
`NotSharedPanel`). Reuse it; do not invent a second dialect.

---

## 7. Entitlements & billing

`packages/shared/src/entitlements.ts` is the **single source of truth**, imported
by backend (`requireFeature`) and frontend (`useEntitlement`, `<LockedFeature>`).
Never duplicate a feature→tier mapping anywhere else.

Strict linear ladder: `FREE < PLUS < FAMILY < PRO_ADVISOR`.

| Flag | Min tier |
|---|---|
| `MULTIPLE_PORTFOLIOS`, `TAX_REPORT_CATALOG`, `AA_FINVU_AUTOIMPORT`, `AI_INSIGHTS`, `GOAL_PROJECTIONS`, `ADVICE_ENGINE` | `PLUS` |
| `FAMILY_SHARING` | `FAMILY` |
| `ACCOUNTING_MODULE`, `UNLIMITED_CLIENTS`, `FNO_SCHEDULE_43`, `PRIORITY_AA_REFRESH` | `PRO_ADVISOR` |

`PLAN_LIMITS` holds numeric caps (`maxPortfolios`; `null` = unlimited).

`requireFeature` gates purely on `plan`. **ADMIN does not bypass** — it used to,
which made tier gating impossible to QA from an admin account (the dev
plan-switcher appeared to do nothing because every check short-circuited on role
first). An admin who wants everything sets their own plan to `PRO_ADVISOR`.

Payments: Razorpay (`services/billing/razorpay.service.ts`). Identity binding
lives in order `notes`, re-fetched and verified server-side at verify time — the
`receipt` field is a 40-char display label only.

---

## 8. Data model map (101 models)

Grouped by purpose. Full definitions in `packages/api/prisma/schema.prisma`.

**Identity & access** — `User`, `RefreshToken`, `PasswordResetToken`, `Client`,
`Family`, `FamilyMember`, `FamilyInvitation`, `PendingFamilyInvite`,
`UserNotificationConfig`, `AuditLog`, `AppSetting`.

**Portfolio core** — `Portfolio`, `PortfolioGroup`, `PortfolioGroupMember`,
`PortfolioSetting`, `Transaction`, `TransactionPhoto`, `Holding` (frozen),
`HoldingProjection`, `CapitalGain`, `CashFlow`, `SipPlan`.

**Market reference data** (not user-scoped) — `StockMaster`, `StockPrice`,
`MutualFundMaster`, `MFNav`, `CommodityPrice`, `CryptoMaster`, `CryptoPrice`,
`FXRate`, `CorporateAction`, `VehicleCatalog`, `SystemFmvSeed`, `TemplateSeed`.

**F&O** — `FoInstrument`, `FoContractPrice`, `DerivativePosition`,
`BrokerCredential`, `MarginSnapshot`, `ExpiryCloseJob`.

**Accounting (PRO_ADVISOR)** — `Account`, `Voucher`, `VoucherEntry`.

**Ingestion** — `ImportJob`, `GmailScanJob`, `GmailDiscoveredDoc`,
`GmailAutoApproveRule`, `CanonicalEvent`, `MonitoredSender`, `LearnedTemplate`,
`IngestionFailure`, `MailboxAccount`, `BrokerAccount`, `MFCentralSyncJob`,
`MFCasMailbackJob`, `AaConsent`.

**Non-market assets** — `Vehicle`, `VehiclePhotoSeed`, `Challan`,
`VehicleValuation`, `VehicleValuationLog`, `RentalProperty`, `Tenancy`,
`RentReceipt`, `RentReminder`, `PropertyExpense`, `OwnedProperty`,
`InsurancePolicy`, `PremiumPayment`, `InsuranceClaim`.

**Banking & credit** — `BankAccount`, `BankBalanceSnapshot`, `CreditCard`,
`CreditCardStatement`, `Loan`, `LoanPayment`, `ForexBalance`, `LrsRemittance`,
`TcsCredit`.

**Provident fund** — `ProvidentFundAccount`, `EpfMemberId`, `PfFetchSession`,
`ExtensionPairing`.

**Planning & intelligence** — `Goal`, `Income`, `HealthScoreSnapshot`,
`NetWorthSnapshot`, `PortfolioInsight`, `Alert`, `FmvOverride`, `Document`.

**AI** — `AiChatSession`, `AiConversation`, `AiUsage`, `LlmSpend`.

**Advisor engine** — `RiskProfileAssessment`, `ModelPortfolio`,
`ModelPortfolioVersion`, `AdvisorApprovedProduct`, `AdvisorRun`,
`AdvisorRecommendation`.

`AssetClass` enum (39 values) spans equity, F&O, funds, bonds, deposits, NPS/PPF/EPF,
PMS/AIF, REIT/InvIT, gold/silver, ULIP/insurance, real estate, PE, crypto, art,
cash, all eight post-office schemes, foreign equity and FX pairs.

---

## 9. Feature domains

### 9.1 Transactions, holdings, capital gains

Transaction CRUD → `recomputeForTransaction` → FIFO replay → `HoldingProjection`
+ `CapitalGain` rows. Editing or deleting a transaction cascades a recompute
(`test/invariants/cg-recompute.test.ts`).

`services/capitalGains.service.ts` implements Indian CG law: STCG/LTCG
classification by asset class and holding period, indexation via CII, §112A
grandfathering. **CII is derived from the single shared table `CII_BY_FY` in
`@portfolioos/shared`** — there used to be a second hand-maintained copy here
that silently drifted. Two ingestion paths can produce indexation-eligible rows
(`OwnedProperty` sales via `propertyCapitalGain.ts`, and plain `Transaction` rows
with `assetClass: REAL_ESTATE` via the FIFO engine) and they must share one CII
source or the same property gets two different indexed costs.

Missing CII returns `status: 'cii_unavailable'` rather than `null`, so callers
flag the row instead of silently reporting a higher non-indexed gain as final.

### 9.2 Ingestion — email to domain rows

The most intricate subsystem. `ingestion/gmail/pipeline.ts`, four escape hatches:

1. **Idempotency short-circuit** — existing `sourceHash` → return immediately.
2. **LLM-gate refusal** — `ENABLE_LLM_PARSER` or `ANTHROPIC_API_KEY` missing →
   one `IngestionFailure` with reason `llm_gate_closed`. Data is not lost; the
   user sees it in the DLQ and can flip the flag.
3. **Budget-capped archive** — over the monthly LLM cap → still create the
   `CanonicalEvent`, `status: ARCHIVED`, redacted body in `metadata.archivedBody`.
4. **Parse failure** — anything downstream of a live LLM call → DLQ with reason.

**Flow:**

```
MailboxAccount (Gmail OAuth)
  → poller / GmailScanJob
  → discovery (headers, keywords, body extract)
  → LearnedTemplate recipe hit?  ── yes ──▶ deterministic regex extraction
                                  └─ no  ──▶ Claude Haiku via tool_use
  → CanonicalEvent (PARSED | PENDING_REVIEW | ARCHIVED)
  → user review (/ingestion/review) or sender auto-commit
  → CONFIRMED
  → ingestion/projection.ts → Transaction | CashFlow → PROJECTED
  → recomputeForAsset ripple
```

**LLM contract** (`ingestion/llm/schema.ts`): two representations of one shape —
a Zod validator for responses and `ANTHROPIC_TOOL_JSON_SCHEMA` for the SDK's
`tools[].input_schema`. A test asserts they cannot drift.

**Template promotion** (`ingestion/templates.ts`): after N agreeing LLM samples
for a `(sender, bodyStructureHash)` pair, synthesise a deterministic recipe
("`amount` is AMT slot 2, `event_date` is DATE slot 0"). Subsequent emails skip
the LLM entirely — zero cost, zero latency, zero variance.
`LearnedTemplate.extractionRecipe` is a discriminated union:
`{state: 'sampling', samples}` → `{state: 'promoted', fields}`. Multi-event emails
are never promoted (slot indices are unstable across variable row counts).

**Auto-commit**: a `MonitoredSender` earns it after `autoCommitAfter` confirmed
events (default 5). The flip is an explicit user click, never automatic.

Projection writes run inside one transaction so domain row + status flip + FK
back-reference all land or none do. The recompute fires *after* commit; if it
throws, the projection is durable and retryable.

### 9.3 File imports

`adapters/fileImport/` — `runner.ts`, `adapters.ts`, `projection.ts`. Broker
contract notes, CAS PDFs, CSVs. Password-protected PDFs handled via
`lib/userDocPasswords.ts` + `useUploadWithPasswordRetry`. Runs on the Bull
`importWorker`.

### 9.4 Mutual funds — three independent paths

- **MF Central** (`adapters/mfcentral/mfCentralPlaywright.ts`) — OTP-driven
  Playwright session, `MFCentralSyncJob`.
- **CAS mailback** (`adapters/mfMailback/camsMailback.ts`, `kfintechMailback.ts`) —
  request the statement by email, then parse it.
- **CASParser API** (`lib/casparserClient.ts`) — third-party parsing of
  NSDL/CDSL/CAMS/KFintech CAS PDFs.

Plus `services/mfOverlap.service.ts` for portfolio overlap analysis.

### 9.5 Provident fund (EPF / PPF)

EPFO is **not** an Account Aggregator FIP and no consent API exists, so this is
portal automation by necessity, not by preference.

- `adapters/pf/epf/` — `epfo.v1.ts` (passbook), `uanLookup.v1.ts` (Know-your-UAN),
  `passwordReset.v1.ts`.
- `adapters/pf/ppf/` — seven bank adapters: SBI, HDFC, ICICI, Axis, PNB, BoB,
  India Post.
- Each adapter is split into a **pure `.parse.ts`** (fully unit-tested against
  fixtures) and a **`.v1.ts`** holding DOM selectors and Playwright driving.

**⚠ The selectors in `uanLookup.v1.ts` and `passwordReset.v1.ts` are marked
UNVERIFIED** — written from the documented flow, not a live session. Walk the
real portal and correct `SELECTORS` before enabling either.

**Session machinery**: `PfFetchSession` with `kind`
(`PASSBOOK` | `UAN_LOOKUP` | `PASSWORD_RESET`) and status
`INITIATED → AWAITING_CAPTCHA → AWAITING_OTP → SCRAPING → COMPLETED | FAILED`.
Prompts are relayed to the browser over SSE (`lib/sseHub.ts`, which supports an
`ask()` request/response pattern), the member answers in the app, and the answer
is posted back into the running Playwright session.

**Security posture, deliberately chosen:**
- Captchas are relayed to the member, never sent to a solving service.
- The new password in a reset is sent to the portal and **never stored** — the
  member types it into the refresh dialog themselves.
- Name, DOB, PAN and mobile used for a UAN lookup are **never written to the
  session row**. They are inputs to one submission. The row keeps only status,
  attempt counts and error.
- Rate limits: 5 UAN lookups/day, 3 password resets/day. A lookup answers "do
  these details belong to a real EPFO member?", which makes an unlimited endpoint
  an identity-confirmation oracle for anyone holding a list of PANs.

**`PORTAL_CHANGED` after a write is ambiguous, not negative.** If the portal
accepted a new password and the confirmation could not be read, the password
*has* changed and neither side knows. The UI says *"we do not know whether that
worked — check by signing in"*, never *"failed"*, because "failed" would have the
member keep using a password that is now wrong. Logged at `error` level.

`ExtensionPairing` supports a browser-extension execution mode
(`source: EXTENSION | SERVER_HEADLESS`).

### 9.6 F&O

`FoInstrument` + `DerivativePosition`, separate from the equity projection.
`adapters/fno/broker-registry.ts`, `symbol-parser.ts`, broker connectors.
`services/foExpiry.service.ts` + `jobs/foExpiryClose.job.ts` auto-close expired
contracts. `services/reports/schedule43.report.ts` produces the Schedule 43
speculative/non-speculative split (`FNO_SCHEDULE_43`, PRO_ADVISOR).

### 9.7 Real estate, rentals, vehicles

- `OwnedProperty` + `propertyCapitalGain.ts` (its own 20%-with-indexation vs
  12.5%-without choice model), `FmvOverride`/`SystemFmvSeed` for §55(2)(ac).
- Rentals: `RentalProperty` → `Tenancy` → `RentReceipt`, `RentReminder`,
  `PropertyExpense`; SMS/email reminders via `rental.reminders.service.ts`.
- Vehicles: `adapters/vehicle/` — mParivahan, CarInfo, Rahastas, challan lookup,
  photo fetch, all behind `chain.ts` (ordered fallback). Valuation via
  `adapters/valuation/` — CarDekho, Cars24, CarWale, then a depreciation model as
  final fallback. `VehicleValuationLog` records which adapter answered.

### 9.8 Advisor engine (`/advisor`, `ADVICE_ENGINE`, PLUS)

Full RIA mode: names securities and actions. **Deterministic rules; the LLM only
writes prose.**

`services/advisor/`:
- `types.ts` — shared contract. Rules receive immutable `AdvisorFacts`; they
  never query. *A rule that can query is a rule that cannot be unit-tested
  without a database, and an advice engine whose rules cannot be tested is one
  whose output cannot be defended.*
- `advisorFacts.builder.ts` — assembles facts once per run.
- `rules/` — six categories: `REBALANCE`, `CONCENTRATION_TRIM`, `TAX_HARVEST`,
  `GOAL_SHORTFALL_SIP`, `CASH_DEPLOYMENT`, `RISK_PROFILE_REVIEW`.
- `advisorEngine.service.ts` — the orchestrator, guaranteeing three properties:
  1. **A broken rule is a broken rule, not a broken run** — each `evaluate` is
     individually try/caught; the failure is recorded and the other rules still
     produce advice.
  2. **"Why was X *not* flagged?" is answerable** — `ruleVersionsSnapshot`
     records every rule that ran including those that emitted nothing, so
     silence is evidence rather than absence of evidence.
  3. **A re-run never rewrites history** — an unchanged recommendation gets its
     inputs refreshed; a materially changed one gets a **new row** with the old
     row's `supersededById` pointed at it. Figures a user was shown are never
     edited.
- Buy-side universe: a curated `AdvisorApprovedProduct` list, with NAV-based
  ranking (`fallbackRankingMath.ts`) as fallback.
- `proseConsistency.ts` — verifies the generated prose agrees with the numbers.
- Risk profile → `ModelPortfolio` / `ModelPortfolioVersion` target allocation.
- Constraints in `constants.ts`: `MAX_SINGLE_TRADE_PCT = 25`,
  `MIN_SIP_TOPUP_INR = 500`, `MATERIALITY_TOLERANCE`.

Tax savings use the **statutory capital-gains rate**, never the income slab —
getting this wrong overstates the benefit of every harvest recommendation.

### 9.9 Intelligence, health score, goals

- `deterministicInsightsRules.ts` — rule-based insights (no LLM).
- `analytics.insights.ts` + `ai/` — LLM narrative on top, budget-capped via
  `LlmSpend` / `AiUsage`.
- `healthScore.service.ts` + `healthScoreMath.ts` — emergency fund, investment
  rate, debt burden, diversification, insurance, goal progress → weighted
  overall. `requiredLifeCover` returns **null when income is unknown**, never 0.
- Goals: `goals.service.ts` + `goalMath.ts`, projections gated by
  `GOAL_PROJECTIONS`.
- `netWorthHistory.service.ts` + nightly `netWorthSnapshotJob` → `NetWorthSnapshot`.

### 9.10 Reports

`services/reportBuilder/`:
- `statement/` — capital gains, CG tax report, holdings, income, ledger
- `special/` — grandfathering LTCG, demat-wise holdings, mark-to-market, shaped
  to match the legacy mProfit desktop layouts exactly
- `tally/` — Tally XML export with account-group mapping
- `mprofitStyle.ts` — shared visual language

Catalog beyond the free basics is gated by `TAX_REPORT_CATALOG` (PLUS).

### 9.11 Account Aggregator (Finvu / Finfactor)

`src/integrations/finfactor/` — `client.ts`, `consent.service.ts`, `mf.service.ts`,
`insurance.service.ts`, `sync.service.ts`, `webhooks.service.ts`, `demo.ts`.
Gated by `AA_FINVU_AUTOIMPORT` (PLUS); `AaConsent` stores the consent artefact.

Coverage reality (researched Sept 2026, worth knowing before promising features):
AA delivers deposits, equities, MF, NPS and insurance. It does **not** deliver
EPF, PPF, bonds, G-Sec, credit cards, F&O, post office or property — those are
"Proposed" or absent from the framework entirely. Hence the scrapers.

### 9.12 AI assistant

`src/ai/` — `claudeClient.ts`, `contextBuilder.ts`, `queryClassifier.ts`,
`systemPrompt.ts`, `chatSessions.ts`, `conversationStore.ts`, `rateLimit.ts`,
`suggestedQuestions.ts`. `AiChatSession` / `AiConversation`, per-user daily
`AiUsage` cap. `ANTHROPIC_ZERO_RETENTION_CONFIRMED` is an explicit env
acknowledgement.

---

## 10. Price feeds & jobs

`src/priceFeeds/` — `router.service.ts` routes a lookup to the right source:

| Source | Covers |
|---|---|
| `nseLive`, `nseBhavcopy`, `nseUniverse`, `nseSeed` | Equity, ETF |
| `nseFoBhavcopy`, `nseFoMaster`, `nseLiveFo`, `nseOptionChain` | F&O |
| `bseUniverse` | BSE listings |
| `amfi` | Mutual fund NAVs |
| `yahoo`, `yahooClient` | Foreign equity, profiles/sectors |
| `crypto` | Crypto |
| `fx` | FX rates |
| `commodity` | Gold, silver |
| `fuel`, `fuelStates` | Fuel prices (vehicle running cost) |
| `corporateActions` | Splits, bonuses, dividends |

`services/priceStaleness.ts` decides when a quote is too old to display as live.

**Jobs** (`src/jobs/`, started in `index.ts` after `listen`): `priceJobs`,
`importWorker`, `gmailScanWorker`, `mailboxPoller`, `vehicleJobs`, `catalogJobs`,
`rentalJobs`, `insuranceJobs`, `alertJobs`, `netWorthSnapshotJob`,
`foExpiryClose.job`, `pfFetchWorker`, `pfNudgeJob`, `corporateActionApplyJob`,
`startupSync` (fire-and-forget so boot stays responsive).

Bull config (`lib/queue.ts`): `JOB_TIMEOUT_MS` and `LOCK_DURATION_MS` both 5 min.
The lock must exceed realistic wall-clock or Bull treats the job as stalled and
re-enqueues it — which would double-commit rows if the `sourceHash` guard were
ever weakened.

---

## 11. Frontend architecture

**77 routes** in `App.tsx`, all authenticated ones inside a protected `AppShell`.

**State split:**
- Server state → React Query v5. Query keys are shared constants
  (e.g. `familyDashboardKeys`, `['families','mine']`) so invalidations reach
  every consumer, including the sidebar tree.
- Client state → Zustand: `auth.store`, `familyScope.store` (the
  `X-Viewing-As-Family` selector), `theme.store`, `privacy.store` (blur amounts),
  `assetSections.store`.

**Layout** — `components/layout/`: `Sidebar` (collapsible, persisted in
`localStorage`), `SidebarNav`, `FamilyNavTree` (household → members → member
detail), `navItems.tsx`. Collapsed rail uses monogram tiles.

**API layer** — one `*.api.ts` module per domain, all over the shared axios
instance in `api/client.ts`. Types are imported from `@portfolioos/shared`, never
redeclared locally.

**Money on the frontend** — `<Money>` component and `formatINR`; `moneyToNumber`
only for chart geometry, never for arithmetic that will be displayed.

**Entitlements** — `useEntitlement(flag)` + `<LockedFeature>` read the same
`FEATURE_MIN_TIER` map as the server.

> **Contract-drift lesson.** The `/advisor` page crashed on first load because the
> UI assumed a bare profile object while the API returned `{profile, history}`,
> plus wholesale field-name drift. **After generating or heavily editing a page,
> reconcile every field it reads against the actual type in
> `@portfolioos/shared`.** Typecheck alone did not catch it because the client
> had locally-declared shapes.

---

## 12. Quality gates

**Custom ESLint rules** (`eslint-plugin-portfolioos/index.cjs`):

- `portfolioos/no-silent-catch` — bans `catch (e) {}` and console-only catches.
  Every catch must rethrow, return a typed failure, call `logger.*`, write to the
  DLQ, or forward to `next(err)`.
- `portfolioos/no-money-coercion` — bans `parseFloat` (always wrong for money)
  and `Number(x)` (usually wrong). Use `toDecimal()`. Explicit
  `Number.parseInt`/`Number.parseFloat` are allowed for genuinely non-monetary
  values.

**Tests** — 85 files under `packages/api/test/`:

| Dir | Files | Purpose |
|---|---|---|
| `services/` | 36 | Business logic |
| `invariants/` | 12 | The §3 guarantees |
| `adapters/` | 11 | Golden fixtures, ≥5 per parser |
| `ingestion/` | 11 | Pipeline, hashing, templates, LLM schema |
| `vehicles/` | 4 | Vehicle chain |
| `security/` | 3 | `family-visibility`, `pf-rls`, `redaction` |
| `lib/`, `middleware/`, `scripts/`, `smoke/`, `fixtures/` | 8 | |

Notable invariants: `rls-isolation`, `user-scoped-coverage`,
`transaction-atomicity`, `decimal-precision`, `holding-uniqueness`,
`idempotency` (+ `pf-`, `fo-`, `net-worth-snapshot-`), `cg-recompute`,
`fo-assetkey`, `net-worth-snapshot-rls`.

`vitest.config.ts` uses `pool: 'forks'`, `singleFork: true`,
`fileParallelism: false` so the AsyncLocalStorage model is deterministic across
files. **The suite is sequential and takes ~26 minutes.** Run it in the
background.

Tests must wrap service calls in `scope.runAs(...)` (`test/helpers/db.ts`
`createTestScope` / `runAs`). Without it RLS fails closed and everything returns
zero rows — which looks like a logic bug and is not.

---

## 13. Configuration & deployment

`src/config/env.ts` — Zod-validated. Key variables:

**Core** — `NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`,
`JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY`, `FRONTEND_URL`, `CORS_ORIGIN`,
`UPLOAD_DIR`, `MAX_UPLOAD_SIZE_MB`.

**Crypto** — `SECRETS_KEY`, `APP_ENCRYPTION_KEY` (base64 of 32 bytes; validated
at boot with a ✅/⚠️ log line).

**Integrations** — `GOOGLE_OAUTH_*`, `KITE_API_*`, `ANTHROPIC_API_KEY`,
`CASPARSER_*`, `RAZORPAY_*`, `SMTP_*`, `TWILIO_*`, `ONLYOFFICE_*`,
`AMFI_NAV_URL`, `NSE_API_KEY`.

**Feature switches** — `ENABLE_LLM_PARSER`, `ENABLE_LLM_INSIGHTS`,
`ENABLE_LLM_ADVISOR_PROSE`, `ENABLE_FAMILY`, `ENABLE_MAILBOX_POLLER`,
`ANTHROPIC_ZERO_RETENTION_CONFIRMED`, `LLM_MODEL`, `LLM_INSIGHTS_MODEL`,
`LLM_ADVISOR_MODEL`.

**Deployment** — Railway. `start.sh` runs `prisma migrate deploy` then
`exec node`. `railway-api.toml` / `railway-web.toml`. Sentry via `SENTRY_DSN`
(no-ops when unset).

### Security notes that must not be lost

1. **`SECRETS_KEY` has a hardcoded dev fallback** in `lib/secrets.ts`
   (`'dev-insecure-key-please-override-in-production-32b!'`). It is silently used
   when the variable is unset. Set it explicitly in every deployed environment.
2. **`APP_ENCRYPTION_KEY` must be distinct per environment** and belongs in a
   secret store. A key that has ever been pasted into a chat, a ticket or a log
   is compromised and must be rotated.
3. **`portfolioos_app_dev`** is a development password living in migration SQL.
   Override before production.
4. **`DATABASE_URL` in production must be the `portfolioos_app` role.** With the
   Neon owner role, RLS is not enforced at all (see §5).
5. A `portfolio` git remote once carried an embedded **plaintext PAT** in
   `.git/config`. Do not push there; the token should be revoked. `origin` is the
   intended remote.

---

## 14. Conventions

- **ESM everywhere**, NodeNext resolution → **relative imports need the `.js`
  extension** even from `.ts` sources.
- `import type { Decimal } from 'decimal.js'` — the default import is not
  constructable under NodeNext.
- Errors: typed classes in `lib/errors.ts` (`BadRequestError`, `UnauthorizedError`,
  `ForbiddenError`, `NotFoundError`, `TooManyRequestsError`), mapped to status
  codes by `errorHandler`.
- Responses: `ok()` / `created()` / `noContent()` / `error()` from `lib/response.ts`.
  Envelope is always `{ success, data, meta? }` or `{ success: false, error, code? }`.
- Adapters: pure `.parse.ts` (tested) separated from side-effecting `.v1.ts`
  (network/DOM). Versioned filenames so a portal change is a new version, not an
  edit to a tested file.
- Comments explain **why**, not what. The comment density in this codebase is
  deliberately high on decisions that look wrong without context — match it.

---

## 15. Known gaps

- EPFO `uanLookup.v1.ts` and `passwordReset.v1.ts` selectors are **UNVERIFIED**
  against the live portal.
- No extension-side job type or portal-drift canary for UAN lookup / password
  reset.
- Advisor approved-list reorder buttons are not wired to
  `PUT /approved-products/order` (endpoint and client method both exist).
- Legacy `Holding` table still present, pending a drop migration.
- `PORTAL_CHANGED` after a password-reset write leaves genuinely unknown state —
  by design, but it needs a human-facing follow-up path.
- Credit cards, bonds/G-Sec, post office and property have no consent-based data
  source in India; all are manual entry or statement parsing.

---

## 16. If you are an LLM working in this repo

Highest-value rules, in order:

1. **Never coerce money to a number.** `toDecimal` in, `serializeMoney` out.
2. **Adding an RLS policy and registering the model in `USER_SCOPED_MODELS` are
   one change, not two.**
3. **Use `runInTransaction`, not `prisma.$transaction`,** whenever the body
   touches a user-scoped model.
4. **`asyncHandler` on every async Express handler.** No exceptions.
5. **`null` ≠ `[]` in visibility caps.** `null` is unrestricted; `[]` is deny-all.
6. **Reconcile generated frontend code against the real shared types** before
   declaring it done. Local shape declarations hide drift from `tsc`.
7. **Rebuild `packages/shared`** after editing it — `dist` is gitignored and
   goes stale.
8. **A partial view must say so.** Never render ₹0 or an empty section where the
   truth is "not shared with you".
9. **Never silently swallow an error.** DLQ, log, rethrow, or typed failure.
10. **Run the suite in the background** — it takes ~26 minutes and is sequential
    by design.
