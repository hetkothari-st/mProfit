# Legacy Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a PLUS+ user name nominees who get a read-only, scope-limited view of the user's finances after a period of inactivity or on a scheduled date, with several warnings first and an owner revoke at any time.

**Architecture:** A per-owner `LegacyPlan` driven by a pure state-machine function (`planSteps`) that a daily cron applies one stage at a time. Every email goes through a DB outbox written in the same transaction as the state change, then flushed. Nominees never get an app account: an emailed link plus an email OTP yields a short-lived header session, which can reach only `/api/legacy-view/*`. That route reads the owner's data under `runAsUser(ownerId)` with server-side scope filtering.

**Tech Stack:** Node 22 + Express + Prisma (Postgres RLS), node-cron, pdfkit, vitest; React 18 + Vite + TanStack Query + shadcn-style `components/ui`.

**Spec:** `portfolioos/docs/legacy-transfer/01-DESIGN.md`

## Global Constraints

- Inactivity default **90** days, minimum **30** (D1). Max sane value 3650.
- Stage cadence: WARNING_1 → +7d WARNING_2 → +7d FINAL_WARNING → +7d GRACE → +7d RELEASED (D8).
- Verifier is optional, max 1 per plan. "They're fine" = **full reset to ARMED with a new cycle** (D9). No answer = release at the end of GRACE.
- Nominee access = emailed link + 6-digit email OTP (10-min expiry, 5 attempts, then 30-min lock); session 30 min via `X-Legacy-Session` header (D3).
- **No SMS anywhere in v1** (D4). Design §11 lists the deferred SMS work.
- Feature flag `LEGACY_TRANSFER`, min tier `PLUS` (D7). **Lapse rule:** an armed plan keeps running and releases after the plan lapses. Without the entitlement, the owner can still view/pause/resume/deactivate/revoke/remove nominees, but cannot add/edit nominees, change settings or activate.
- `showAmounts` per nominee (D6). When false, **no ₹ value leaves the server** for that nominee (not even net worth).
- Identifiers: **last 4 only** in v1, for every category. Full account/policy numbers are never decrypted for nominees.
- Max pause 180 days (D10).
- Nominees can never start a release, edit anything or act as the owner.
- Every mutating owner endpoint requires a step-up grant (`X-Legacy-Grant`): a TOTP/backup code if 2FA is on, otherwise a 6-digit code emailed to the owner. Not the password: Google-only users have none.
- Nominee name/email and the personal letter are encrypted at rest with `encryptSecret` (`src/lib/secrets.ts`).
- Tokens: 32 random bytes base64url; only `sha256` hex stored (`inviteTokenHash` from `src/lib/inviteToken.ts`).
- All new tables have an owner `userId`, are in `USER_SCOPED_MODELS`, and have `ENABLE` + `FORCE ROW LEVEL SECURITY` with the `app_is_system() OR "userId" = app_current_user_id()` policy.
- Crons use timezone `Asia/Kolkata` and are gated by `ENABLE_LEGACY_CRON` (`'false'` in tests).
- No `catch (e) { console.log }`. Cron entry points log with `logger.error` and comment why (pattern: `jobs/splitDigestJobs.ts`).
- Commit messages use Conventional Commits and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do **not** push (repo auto-merges on push).

## Review Focus

1. **Owner returns during GRACE or after RELEASED.** Activity must beat release in the same cron run; revoke must kill live nominee sessions instantly. → Task 4 test "activity wins over GRACE→RELEASED", Task 9 test "revoke invalidates an open session".
2. **Nominee with `showAmounts=false` inspects the JSON.** No `amount` and no `netWorth` key may carry a value. → Task 10 test "showAmounts=false strips every amount".
3. **Leaked access link without the inbox.** Link alone yields nothing; 6th wrong OTP locks for 30 min even with the right code. → Task 9 tests "lockout after 5 wrong codes", "correct code during lock rejected".
4. **Email send fails on release day.** State is RELEASED but the nominee email must still go out on the next run. → Task 7 test "failed send is retried on next flush".
5. **Owner's PLUS subscription lapses after arming.** The cron must still release. → Task 8 test "lapsed owner plan still releases".

---

## File structure

**Backend (`portfolioos/packages/api`)**
| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | 5 new models + 3 enums + `User.lastActiveAt` |
| `prisma/migrations/20261013120000_legacy_transfer/migration.sql` | Tables + RLS |
| `src/lib/prisma.ts` | Register the 5 models in `USER_SCOPED_MODELS` |
| `src/lib/audit.ts` | New `AuditAction` values |
| `src/services/legacy/activity.service.ts` | `touchActivity()`: throttled `lastActiveAt` write |
| `src/services/legacy/stateMachine.ts` | Pure `planSteps()` |
| `src/services/legacy/tokens.service.ts` | Link tokens, nominee OTP, nominee sessions, owner step-up |
| `src/services/legacy/emails.ts` | HTML/text templates per outbox kind |
| `src/services/legacy/outbox.service.ts` | `enqueue()` inside tx, `flushOutbox()` |
| `src/services/legacy/plan.service.ts` | Owner CRUD, activate/pause/resume/deactivate/revoke, overview |
| `src/services/legacy/runner.service.ts` | `runLegacyTick(now)`: applies `planSteps` to every plan |
| `src/services/legacy/publicLinks.service.ts` | I'm-OK, verifier answer, nominee acknowledge |
| `src/services/legacy/view.service.ts` | `buildLegacyView()` scope-filtered DTO |
| `src/services/legacy/viewPdf.ts` | pdfkit render of the view |
| `src/jobs/legacyTransferJob.ts` | Daily cron |
| `src/middleware/legacySession.ts` | `X-Legacy-Session` auth for nominee routes |
| `src/schemas/legacy.schemas.ts` | zod bodies |
| `src/controllers/legacy.controller.ts` | Owner + public + nominee handlers |
| `src/routes/legacy.routes.ts` | `legacyRouter`, `legacyPublicRouter`, `legacyViewRouter` |
| `test/legacy/*.test.ts` | Tests per service |

**Shared (`portfolioos/packages/shared/src`)**: `legacy.ts` (constants + DTO types), `entitlements.ts` (flag).

**Web (`portfolioos/apps/web/src`)**: `api/legacy.api.ts`, `pages/legacy/LegacyPage.tsx`, `pages/legacy/NomineeDialog.tsx`, `pages/legacy/StepUpDialog.tsx`, `pages/legacy/LegacyLinkPage.tsx` (I'm OK / verify / acknowledge), `pages/legacy/LegacyAccessPage.tsx` (OTP + view), `App.tsx`, `components/layout/navItems.tsx`.

---

### Task 1: Shared constants, DTO types, entitlement flag

**Files:**
- Create: `portfolioos/packages/shared/src/legacy.ts`
- Create: `portfolioos/packages/shared/src/legacy.test.ts`
- Modify: `portfolioos/packages/shared/src/entitlements.ts` (inside `FEATURE_MIN_TIER`)
- Modify: `portfolioos/packages/shared/src/index.ts` (append export)

**Interfaces:**
- Produces: `LEGACY_CATEGORIES`, `LegacyCategory`, `LEGACY_MIN_INACTIVITY_DAYS=30`, `LEGACY_DEFAULT_INACTIVITY_DAYS=90`, `LEGACY_STAGE_DAYS=7`, `LEGACY_MAX_PAUSE_DAYS=180`, `LEGACY_SCHEDULE_REMINDER_DAYS=[30,7,1]`, `LegacyStatusValue`, `LegacyTriggerValue`, `LegacyNomineeDTO`, `LegacyOverviewDTO`, `LegacyItemDTO`, `LegacySectionDTO`, `LegacyViewDTO`, `LEGACY_CATEGORY_LABELS`, `LEGACY_CLAIM_CHECKLIST`; feature flag `'LEGACY_TRANSFER'`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/legacy.test.ts
import { describe, it, expect } from 'vitest';
import { hasFeature } from './entitlements.js';
import { LEGACY_CATEGORIES, LEGACY_CATEGORY_LABELS, LEGACY_CLAIM_CHECKLIST, LEGACY_MIN_INACTIVITY_DAYS } from './legacy.js';

describe('legacy shared', () => {
  it('gates LEGACY_TRANSFER at PLUS', () => {
    expect(hasFeature('FREE', 'LEGACY_TRANSFER')).toBe(false);
    expect(hasFeature('PLUS', 'LEGACY_TRANSFER')).toBe(true);
    expect(hasFeature('FAMILY', 'LEGACY_TRANSFER')).toBe(true);
  });
  it('labels and checklists every category', () => {
    for (const c of LEGACY_CATEGORIES) {
      expect(LEGACY_CATEGORY_LABELS[c]).toBeTruthy();
      expect(Array.isArray(LEGACY_CLAIM_CHECKLIST[c])).toBe(true);
    }
    expect(LEGACY_MIN_INACTIVITY_DAYS).toBe(30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd portfolioos/packages/shared && npx vitest run src/legacy.test.ts`
Expected: FAIL, cannot resolve `./legacy.js`.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/legacy.ts
export const LEGACY_CATEGORIES = [
  'INVESTMENTS', 'BANK_ACCOUNTS', 'INSURANCE', 'LIABILITIES',
  'PROPERTY', 'VEHICLES', 'RETIREMENT', 'DOCUMENTS', 'LETTER',
] as const;
export type LegacyCategory = (typeof LEGACY_CATEGORIES)[number];

export const LEGACY_MIN_INACTIVITY_DAYS = 30;
export const LEGACY_DEFAULT_INACTIVITY_DAYS = 90;
export const LEGACY_MAX_INACTIVITY_DAYS = 3650;
export const LEGACY_STAGE_DAYS = 7;
export const LEGACY_MAX_PAUSE_DAYS = 180;
export const LEGACY_SCHEDULE_REMINDER_DAYS = [30, 7, 1] as const;

export type LegacyStatusValue =
  | 'DRAFT' | 'ARMED' | 'WARNING_1' | 'WARNING_2' | 'FINAL_WARNING' | 'GRACE' | 'RELEASED' | 'PAUSED';
export type LegacyTriggerValue = 'INACTIVITY' | 'SCHEDULED' | 'BOTH';

export const LEGACY_CATEGORY_LABELS: Record<LegacyCategory, string> = {
  INVESTMENTS: 'Investments',
  BANK_ACCOUNTS: 'Bank accounts',
  INSURANCE: 'Insurance',
  LIABILITIES: 'Loans & credit cards',
  PROPERTY: 'Property',
  VEHICLES: 'Vehicles',
  RETIREMENT: 'Provident fund & NPS',
  DOCUMENTS: 'Documents',
  LETTER: 'Personal letter',
};

/** Generic Indian claim steps per category, shown to nominees. Information, not legal advice. */
export const LEGACY_CLAIM_CHECKLIST: Record<LegacyCategory, string[]> = {
  INVESTMENTS: [
    'Get several attested copies of the death certificate.',
    'For mutual funds, contact the registrar (CAMS or KFintech) with the transmission form, death certificate and your KYC.',
    'For shares, contact the depository participant (broker) that holds the demat account for transmission.',
  ],
  BANK_ACCOUNTS: [
    'Visit the branch with the death certificate, your ID and the claim form.',
    'If you are the registered nominee, the claim is usually settled without a succession certificate.',
  ],
  INSURANCE: [
    'Inform the insurer quickly; most have a claim intimation helpline.',
    'Submit the claim form, death certificate, policy document (or copy) and your ID and bank details.',
  ],
  LIABILITIES: [
    'Inform each lender in writing; ask whether a loan protection cover exists.',
    'Stop auto-debits only after the lender confirms the closure route.',
    'Ask card issuers to block cards and share the final statement.',
  ],
  PROPERTY: [
    'Collect the title documents and the latest tax receipts.',
    'Apply to the local authority / society for mutation in the legal heir’s name.',
  ],
  VEHICLES: [
    'Apply at the RTO for transfer of ownership on death (Form 31 or the state equivalent).',
    'Transfer or cancel the vehicle insurance.',
  ],
  RETIREMENT: [
    'EPF: file the claim (Form 20 / 10D / 5IF) through the employer or the EPFO portal.',
    'NPS: submit the death withdrawal form to the POP or CRA.',
  ],
  DOCUMENTS: ['Download and keep copies of the shared documents before access expires.'],
  LETTER: [],
};

export interface LegacyNomineeDTO {
  id: string;
  name: string;
  email: string;
  relationship: string;
  priority: number;
  isVerifier: boolean;
  categories: LegacyCategory[];
  documentIds: string[];
  showAmounts: boolean;
  acknowledgedAt: string | null;
}

export interface LegacyOverviewDTO {
  status: LegacyStatusValue;
  triggerMode: LegacyTriggerValue;
  inactivityDays: number;
  scheduledFor: string | null; // YYYY-MM-DD
  pausedUntil: string | null;  // YYYY-MM-DD
  hasLetter: boolean;
  letter: string | null;
  activatedAt: string | null;
  releasedAt: string | null;
  lastActiveAt: string | null;
  /** Human sentence for the status card, e.g. "First warning on 12 Jan 2027 if you stay inactive." */
  nextEvent: string | null;
  nominees: LegacyNomineeDTO[];
  entitled: boolean;
}

export interface LegacyItemDTO {
  label: string;
  sublabel: string | null;
  identifierLast4: string | null;
  nominee: string | null;
  /** Decimal string, present only when the nominee may see amounts. */
  amount: string | null;
  notes: string[];
}

export interface LegacySectionDTO {
  category: LegacyCategory;
  title: string;
  items: LegacyItemDTO[];
  checklist: string[];
}

export interface LegacyViewDTO {
  ownerName: string;
  nomineeName: string;
  releasedAt: string;
  showAmounts: boolean;
  /** Decimal string; null when showAmounts is false. */
  netWorth: string | null;
  sections: LegacySectionDTO[];
  letter: string | null;
  documents: Array<{ id: string; fileName: string; category: string | null }>;
}
```

In `entitlements.ts`, add inside `FEATURE_MIN_TIER` after `MF_ANALYTICS: 'PLUS',`:

```ts
  // Legacy Transfer (docs/legacy-transfer): nominees get read-only access on
  // inactivity or a scheduled date. An armed plan keeps running after a lapse
  // (see plan.service) — only *configuring* it needs this flag.
  LEGACY_TRANSFER: 'PLUS',
```

In `index.ts` append: `export * from './legacy.js';`

- [ ] **Step 4: Run tests + build shared**

Run: `cd portfolioos/packages/shared && npx vitest run src/legacy.test.ts && npm run build`
Expected: PASS; build OK (the api and web import the built package).

- [ ] **Step 5: Commit**

```bash
git add portfolioos/packages/shared/src/legacy.ts portfolioos/packages/shared/src/legacy.test.ts portfolioos/packages/shared/src/entitlements.ts portfolioos/packages/shared/src/index.ts
git commit -m "feat(legacy): shared constants, DTOs and PLUS entitlement"
```

---

### Task 2: Schema, migration, RLS, audit actions

**Files:**
- Modify: `portfolioos/packages/api/prisma/schema.prisma` (User model + append new models)
- Create: `portfolioos/packages/api/prisma/migrations/20261013120000_legacy_transfer/migration.sql`
- Modify: `portfolioos/packages/api/src/lib/prisma.ts` (`USER_SCOPED_MODELS`)
- Modify: `portfolioos/packages/api/src/lib/audit.ts` (`AuditAction` union)
- Test: `portfolioos/packages/api/test/legacy/rls.test.ts`

**Interfaces:**
- Produces: Prisma models `LegacyPlan`, `LegacyNominee`, `LegacyToken`, `LegacyCode`, `LegacyOutbox`; enums `LegacyStatus`, `LegacyTrigger`, `LegacyTokenPurpose`, `LegacyCodePurpose`; `User.lastActiveAt`; audit actions `legacy_activated | legacy_changed | legacy_warning | legacy_reset | legacy_im_ok | legacy_verifier_answer | legacy_released | legacy_revoked | legacy_otp_ok | legacy_otp_failed | legacy_view | legacy_document_download | legacy_pdf`.

- [ ] **Step 1: Write the failing RLS test**

```ts
// test/legacy/rls.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';

describe('legacy RLS', () => {
  let a: TestScope; let b: TestScope;
  beforeAll(async () => {
    a = await createTestScope('legacy-rls-a'); b = await createTestScope('legacy-rls-b');
    await runAsSystem(() => prisma.legacyPlan.create({ data: { userId: a.userId } }));
  });
  afterAll(async () => {
    await runAsSystem(() => prisma.legacyPlan.deleteMany({ where: { userId: { in: [a.userId, b.userId] } } }));
    await a.cleanup(); await b.cleanup();
  });

  it('owner sees own plan, other user sees nothing', async () => {
    expect(await a.runAs(() => prisma.legacyPlan.count({ where: { userId: a.userId } }))).toBe(1);
    expect(await b.runAs(() => prisma.legacyPlan.count({ where: { userId: a.userId } }))).toBe(0);
  });

  it('other user cannot insert a nominee into the plan', async () => {
    const plan = await runAsSystem(() => prisma.legacyPlan.findUniqueOrThrow({ where: { userId: a.userId } }));
    await expect(b.runAs(() => prisma.legacyNominee.create({ data: {
      planId: plan.id, userId: a.userId, nameEnc: 'x', emailEnc: 'y', relationship: 'Spouse', priority: 1, categories: ['INSURANCE'],
    } }))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd portfolioos/packages/api && npx vitest run test/legacy/rls.test.ts`
Expected: FAIL, `prisma.legacyPlan` undefined (type error / runtime).

- [ ] **Step 3: Schema**

In `model User { … }` add the field (next to `isActive`) and the back-relations:

```prisma
  /// Last *real* owner activity (own session request, refresh, Legacy "I'm OK").
  /// Never touched by system jobs or X-Act-As. Drives Legacy Transfer inactivity.
  lastActiveAt          DateTime?
  legacyPlan            LegacyPlan?
```

Append at the end of `schema.prisma`:

```prisma
// --- Legacy Transfer (docs/legacy-transfer/01-DESIGN.md) --------------------

enum LegacyStatus {
  DRAFT
  ARMED
  WARNING_1
  WARNING_2
  FINAL_WARNING
  GRACE
  RELEASED
  PAUSED
}

enum LegacyTrigger {
  INACTIVITY
  SCHEDULED
  BOTH
}

enum LegacyTokenPurpose {
  INVITE  // nominee acknowledges they were named
  ACCESS  // nominee opens the released view (then OTP)
  IM_OK   // owner one-click reset
  VERIFY  // verifier answers during GRACE
}

enum LegacyCodePurpose {
  NOMINEE_OTP
  NOMINEE_SESSION
  OWNER_STEPUP_CODE
  OWNER_STEPUP_GRANT
}

model LegacyPlan {
  id             String        @id @default(cuid())
  userId         String        @unique
  user           User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  status         LegacyStatus  @default(DRAFT)
  triggerMode    LegacyTrigger @default(INACTIVITY)
  inactivityDays Int           @default(90)
  scheduledFor   DateTime?     @db.Date
  pausedUntil    DateTime?     @db.Date
  stageEnteredAt DateTime?
  /// Inactivity is measured from max(User.lastActiveAt, clockResetAt).
  clockResetAt   DateTime?
  cycle          Int           @default(1)
  activatedAt    DateTime?
  releasedAt     DateTime?
  letterEnc      String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  nominees       LegacyNominee[]
  tokens         LegacyToken[]
  outbox         LegacyOutbox[]

  @@index([status])
}

model LegacyNominee {
  id             String     @id @default(cuid())
  planId         String
  plan           LegacyPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  userId         String     // owner (RLS)
  nameEnc        String
  emailEnc       String
  relationship   String
  priority       Int
  isVerifier     Boolean    @default(false)
  categories     String[]
  documentIds    String[]   @default([])
  showAmounts    Boolean    @default(false)
  acknowledgedAt DateTime?
  createdAt      DateTime   @default(now())
  tokens         LegacyToken[]
  codes          LegacyCode[]

  @@index([planId])
  @@index([userId])
}

model LegacyToken {
  id        String             @id @default(cuid())
  planId    String
  plan      LegacyPlan         @relation(fields: [planId], references: [id], onDelete: Cascade)
  userId    String             // owner (RLS)
  nomineeId String?
  nominee   LegacyNominee?     @relation(fields: [nomineeId], references: [id], onDelete: Cascade)
  purpose   LegacyTokenPurpose
  cycle     Int
  tokenHash String             @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime           @default(now())

  @@index([planId, purpose])
}

/// Short-lived secrets: nominee OTP + session, owner step-up code + grant.
/// One live row per (subject, purpose) — subjectId is nomineeId or owner userId.
model LegacyCode {
  id          String            @id @default(cuid())
  userId      String            // owner (RLS)
  nomineeId   String?
  nominee     LegacyNominee?    @relation(fields: [nomineeId], references: [id], onDelete: Cascade)
  subjectId   String
  purpose     LegacyCodePurpose
  codeHash    String
  expiresAt   DateTime
  attempts    Int               @default(0)
  lockedUntil DateTime?
  createdAt   DateTime          @default(now())

  @@unique([subjectId, purpose])
  @@index([codeHash])
}

model LegacyOutbox {
  id           String     @id @default(cuid())
  planId       String
  plan         LegacyPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  userId       String     // owner (RLS)
  kind         String     // see outbox.service OutboxKind
  cycle        Int
  /// 'owner' or a nomineeId — makes (planId, kind, cycle, recipientKey) a send-once key.
  recipientKey String
  tokenEnc     String?    // encrypted raw link token, if the email carries a link
  sentAt       DateTime?
  attempts     Int        @default(0)
  lastError    String?
  createdAt    DateTime   @default(now())

  @@unique([planId, kind, cycle, recipientKey])
  @@index([sentAt])
}
```

- [ ] **Step 4: Migration SQL**

Run `cd portfolioos/packages/api && npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > /tmp/legacy.sql` against the **local Docker Postgres** (per memory: override both `DATABASE_URL` and `DIRECT_URL` so this never touches Neon). Put that DDL in `prisma/migrations/20261013120000_legacy_transfer/migration.sql`, then append:

```sql
-- RLS: owner-only, system bypass. Same shape as SplitSettings (20261007150000).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['LegacyPlan','LegacyNominee','LegacyToken','LegacyCode','LegacyOutbox'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %s ON %I USING (app_is_system() OR "userId" = app_current_user_id()) WITH CHECK (app_is_system() OR "userId" = app_current_user_id())', lower(t) || '_owner', t);
  END LOOP;
END $$;

ALTER TABLE "LegacyPlan" ADD CONSTRAINT "LegacyPlan_inactivityDays_min" CHECK ("inactivityDays" >= 30);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "LegacyPlan","LegacyNominee","LegacyToken","LegacyCode","LegacyOutbox"
TO portfolioos_app;
```

Apply locally: `DATABASE_URL=<docker> DIRECT_URL=<docker> npx prisma migrate deploy && npx prisma generate`.

- [ ] **Step 5: Register models + audit actions**

In `src/lib/prisma.ts`, inside `USER_SCOPED_MODELS` before the closing `]);`:

```ts
  // Legacy Transfer (20261013120000_legacy_transfer). ENABLE+FORCE RLS on all
  // five; without these entries every read returns zero rows (see Goal/BankAccount note).
  'LegacyPlan',
  'LegacyNominee',
  'LegacyToken',
  'LegacyCode',
  'LegacyOutbox',
```

In `src/lib/audit.ts`, extend `AuditAction` (append before the final `;`):

```ts
  | 'legacy_activated'
  | 'legacy_changed'
  | 'legacy_warning'
  | 'legacy_reset'
  | 'legacy_im_ok'
  | 'legacy_verifier_answer'
  | 'legacy_released'
  | 'legacy_revoked'
  | 'legacy_otp_ok'
  | 'legacy_otp_failed'
  | 'legacy_view'
  | 'legacy_document_download'
  | 'legacy_pdf'
```

- [ ] **Step 6: Run test**

Run: `npx vitest run test/legacy/rls.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add portfolioos/packages/api/prisma portfolioos/packages/api/src/lib/prisma.ts portfolioos/packages/api/src/lib/audit.ts portfolioos/packages/api/test/legacy/rls.test.ts
git commit -m "feat(legacy): schema, migration and RLS for Legacy Transfer"
```

---

### Task 3: Real-activity tracking

**Files:**
- Create: `portfolioos/packages/api/src/services/legacy/activity.service.ts`
- Modify: `portfolioos/packages/api/src/middleware/authenticate.ts` (own-session branch only)
- Modify: `portfolioos/packages/api/src/services/auth.service.ts` (`refreshSession`, after the token is validated)
- Test: `portfolioos/packages/api/test/legacy/activity.test.ts`

**Interfaces:**
- Produces: `touchActivity(userId: string, now?: Date): Promise<boolean>` (true when it wrote), `ACTIVITY_THROTTLE_MS = 3_600_000`.

- [ ] **Step 1: Failing test**

```ts
// test/legacy/activity.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { touchActivity } from '../../src/services/legacy/activity.service.js';
import { authenticate } from '../../src/middleware/authenticate.js';
import { signAccessToken } from '../../src/services/jwt.service.js';

const lastActive = (id: string) =>
  runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id }, select: { lastActiveAt: true } })).then((u) => u.lastActiveAt);

describe('touchActivity', () => {
  let s: TestScope;
  beforeAll(async () => { s = await createTestScope('legacy-act'); });
  afterAll(async () => { await s.cleanup(); });

  it('writes once, then throttles for an hour', async () => {
    const t0 = new Date('2027-01-01T10:00:00Z');
    expect(await touchActivity(s.userId, t0)).toBe(true);
    expect(await touchActivity(s.userId, new Date(t0.getTime() + 30 * 60_000))).toBe(false);
    expect((await lastActive(s.userId))?.toISOString()).toBe(t0.toISOString());
    expect(await touchActivity(s.userId, new Date(t0.getTime() + 61 * 60_000))).toBe(true);
  });

  it('authenticate() touches only for the own session, not X-Act-As', async () => {
    await runAsSystem(() => prisma.user.update({ where: { id: s.userId }, data: { lastActiveAt: null } }));
    const token = signAccessToken({ id: s.userId, email: 'x@test.local', role: 'INVESTOR', plan: 'FREE' });
    const req = { header: (h: string) => (h.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined), originalUrl: '/api/dashboard' } as never;
    await new Promise<void>((resolve, reject) => authenticate(req, {} as never, (e?: unknown) => (e ? reject(e) : resolve())));
    await new Promise((r) => setTimeout(r, 50)); // touch is fire-and-forget
    expect(await lastActive(s.userId)).not.toBeNull();
  });
});
```

> If `signAccessToken` has a different name/signature in `src/services/jwt.service.ts`, use whatever `auth.service.ts` calls to mint access tokens. Check with `grep -n "^export" src/services/jwt.service.ts`.

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run test/legacy/activity.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/services/legacy/activity.service.ts
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { runAsSystem } from '../../lib/requestContext.js';

export const ACTIVITY_THROTTLE_MS = 60 * 60 * 1000;

/**
 * Record real owner activity for Legacy Transfer. One conditional UPDATE, so
 * it's cheap enough to call on every authenticated request: the WHERE clause
 * makes it a no-op inside the throttle window. Only the owner's own session
 * may call this — never system jobs, never an X-Act-As manager.
 */
export async function touchActivity(userId: string, now: Date = new Date()): Promise<boolean> {
  const cutoff = new Date(now.getTime() - ACTIVITY_THROTTLE_MS);
  const res = await runAsSystem(() =>
    prisma.user.updateMany({
      where: { id: userId, OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: cutoff } }] },
      data: { lastActiveAt: now },
    }),
  );
  return res.count === 1;
}

/** Fire-and-forget wrapper for request paths: a failed write must not fail the request. */
export function touchActivitySoon(userId: string): void {
  touchActivity(userId).catch((err: unknown) => {
    // Request path: the request itself must succeed; a missed touch is retried on the next request.
    logger.error({ err: err instanceof Error ? err.message : String(err), userId }, '[legacy] touchActivity failed');
  });
}
```

In `authenticate.ts`, import `touchActivitySoon` and change the own-session early return:

```ts
    const actAs = req.header(ACT_AS_HEADER)?.trim();
    if (!actAs || actAs === payload.sub) {
      // Legacy Transfer: only the owner's own session counts as activity.
      touchActivitySoon(payload.sub);
      next();
      return;
    }
```

In `auth.service.ts` `refreshSession`, after the `revokedAt` check passes and before issuing new tokens, add `touchActivitySoon(stored.userId);` (import from `./legacy/activity.service.js`).

- [ ] **Step 4: Run test**

Run: `npx vitest run test/legacy/activity.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add portfolioos/packages/api/src/services/legacy/activity.service.ts portfolioos/packages/api/src/middleware/authenticate.ts portfolioos/packages/api/src/services/auth.service.ts portfolioos/packages/api/test/legacy/activity.test.ts
git commit -m "feat(legacy): track real owner activity (lastActiveAt)"
```

---

### Task 4: Pure state machine

**Files:**
- Create: `portfolioos/packages/api/src/services/legacy/stateMachine.ts`
- Test: `portfolioos/packages/api/test/legacy/stateMachine.test.ts`

**Interfaces:**
- Consumes: constants from `@everypaisa/shared` (Task 1).
- Produces:
```ts
export interface PlanClock {
  status: LegacyStatusValue; triggerMode: LegacyTriggerValue; inactivityDays: number;
  scheduledFor: Date | null; pausedUntil: Date | null; stageEnteredAt: Date | null;
  clockResetAt: Date | null; lastActiveAt: Date | null;
}
export type Step =
  | { kind: 'reset'; from: LegacyStatusValue }
  | { kind: 'resume' }
  | { kind: 'advance'; to: LegacyStatusValue; reason: 'inactivity' | 'scheduled' }
  | { kind: 'scheduleReminder'; daysBefore: 30 | 7 | 1 };
export function planSteps(p: PlanClock, now: Date): Step[];
export function inactiveSince(p: PlanClock): Date | null;
export function nextEventText(p: PlanClock, now: Date): string | null;
```

Rules (evaluated in this order; return early where noted):
1. `DRAFT` / `RELEASED` → `[]`.
2. `PAUSED`: if `pausedUntil <= startOfDay(now)` → `[{resume}]`, else `[]`.
3. In `WARNING_1|WARNING_2|FINAL_WARNING|GRACE` and `inactiveSince > stageEnteredAt` → `[{reset, from}]` (activity always wins; return).
4. If trigger includes SCHEDULED and `scheduledFor <= now` → `[{advance, to:'RELEASED', reason:'scheduled'}]` (return).
5. If trigger includes SCHEDULED and days until `scheduledFor` ≤ 30 → push `{scheduleReminder, daysBefore: smallest of [1,7,30] that is ≥ daysLeft}`.
6. If trigger includes INACTIVITY: ARMED and `daysBetween(inactiveSince, now) ≥ inactivityDays` → advance WARNING_1; WARNING_1→WARNING_2, WARNING_2→FINAL_WARNING, FINAL_WARNING→GRACE, GRACE→RELEASED each when `daysBetween(stageEnteredAt, now) ≥ 7`.

- [ ] **Step 1: Failing table tests**

```ts
// test/legacy/stateMachine.test.ts
import { describe, it, expect } from 'vitest';
import { planSteps, nextEventText, type PlanClock } from '../../src/services/legacy/stateMachine.js';

const D = (s: string) => new Date(`${s}T04:30:00Z`); // 10:00 IST
const base: PlanClock = {
  status: 'ARMED', triggerMode: 'INACTIVITY', inactivityDays: 90, scheduledFor: null, pausedUntil: null,
  stageEnteredAt: null, clockResetAt: D('2027-01-01'), lastActiveAt: D('2027-01-01'),
};

describe('planSteps', () => {
  it('nothing before the inactivity period', () => {
    expect(planSteps(base, D('2027-03-31'))).toEqual([]); // day 89
  });
  it('WARNING_1 on day 90', () => {
    expect(planSteps(base, D('2027-04-01'))).toEqual([{ kind: 'advance', to: 'WARNING_1', reason: 'inactivity' }]);
  });
  it('honours a custom 30-day period', () => {
    expect(planSteps({ ...base, inactivityDays: 30 }, D('2027-01-31'))).toEqual([{ kind: 'advance', to: 'WARNING_1', reason: 'inactivity' }]);
  });
  it('measures from the later of lastActiveAt and clockResetAt', () => {
    expect(planSteps({ ...base, clockResetAt: D('2027-02-01') }, D('2027-04-01'))).toEqual([]);
  });
  it.each([
    ['WARNING_1', 'WARNING_2'], ['WARNING_2', 'FINAL_WARNING'], ['FINAL_WARNING', 'GRACE'], ['GRACE', 'RELEASED'],
  ] as const)('%s → %s after 7 days', (from, to) => {
    const p = { ...base, status: from, stageEnteredAt: D('2027-04-01') };
    expect(planSteps(p, D('2027-04-07'))).toEqual([]);
    expect(planSteps(p, D('2027-04-08'))).toEqual([{ kind: 'advance', to, reason: 'inactivity' }]);
  });
  it('activity wins over GRACE→RELEASED', () => {
    const p = { ...base, status: 'GRACE' as const, stageEnteredAt: D('2027-04-22'), lastActiveAt: D('2027-04-28') };
    expect(planSteps(p, D('2027-04-29'))).toEqual([{ kind: 'reset', from: 'GRACE' }]);
  });
  it('scheduled release on the date, no grace', () => {
    const p = { ...base, triggerMode: 'SCHEDULED' as const, scheduledFor: D('2027-06-01') };
    expect(planSteps(p, D('2027-06-01'))).toEqual([{ kind: 'advance', to: 'RELEASED', reason: 'scheduled' }]);
  });
  it('scheduled reminders at 30/7/1 days', () => {
    const p = { ...base, triggerMode: 'SCHEDULED' as const, scheduledFor: D('2027-06-01') };
    expect(planSteps(p, D('2027-05-02'))).toEqual([{ kind: 'scheduleReminder', daysBefore: 30 }]);
    expect(planSteps(p, D('2027-05-26'))).toEqual([{ kind: 'scheduleReminder', daysBefore: 7 }]);
    expect(planSteps(p, D('2027-05-31'))).toEqual([{ kind: 'scheduleReminder', daysBefore: 1 }]);
    expect(planSteps(p, D('2027-04-01'))).toEqual([]);
  });
  it('BOTH: scheduled date beats a mid-way inactivity warning', () => {
    const p = { ...base, triggerMode: 'BOTH' as const, status: 'WARNING_1' as const, stageEnteredAt: D('2027-04-01'), scheduledFor: D('2027-04-03') };
    expect(planSteps(p, D('2027-04-03'))).toEqual([{ kind: 'advance', to: 'RELEASED', reason: 'scheduled' }]);
  });
  it('PAUSED does nothing until pausedUntil, then resumes', () => {
    const p = { ...base, status: 'PAUSED' as const, pausedUntil: D('2027-05-01') };
    expect(planSteps(p, D('2027-04-30'))).toEqual([]);
    expect(planSteps(p, D('2027-05-01'))).toEqual([{ kind: 'resume' }]);
  });
  it('DRAFT and RELEASED never move', () => {
    expect(planSteps({ ...base, status: 'DRAFT' }, D('2030-01-01'))).toEqual([]);
    expect(planSteps({ ...base, status: 'RELEASED' }, D('2030-01-01'))).toEqual([]);
  });
});

describe('nextEventText', () => {
  it('describes the first warning date for an armed plan', () => {
    expect(nextEventText(base, D('2027-01-10'))).toBe('First warning on 1 Apr 2027 if you stay inactive.');
  });
});
```

- [ ] **Step 2: Run, verify fail.** `npx vitest run test/legacy/stateMachine.test.ts` → module not found.

- [ ] **Step 3: Implement**

```ts
// src/services/legacy/stateMachine.ts
import {
  LEGACY_SCHEDULE_REMINDER_DAYS, LEGACY_STAGE_DAYS,
  type LegacyStatusValue, type LegacyTriggerValue,
} from '@everypaisa/shared';

const DAY_MS = 86_400_000;

export interface PlanClock {
  status: LegacyStatusValue;
  triggerMode: LegacyTriggerValue;
  inactivityDays: number;
  scheduledFor: Date | null;
  pausedUntil: Date | null;
  stageEnteredAt: Date | null;
  clockResetAt: Date | null;
  lastActiveAt: Date | null;
}

export type Step =
  | { kind: 'reset'; from: LegacyStatusValue }
  | { kind: 'resume' }
  | { kind: 'advance'; to: LegacyStatusValue; reason: 'inactivity' | 'scheduled' }
  | { kind: 'scheduleReminder'; daysBefore: 30 | 7 | 1 };

const WARNING_STATES: ReadonlySet<LegacyStatusValue> = new Set(['WARNING_1', 'WARNING_2', 'FINAL_WARNING', 'GRACE']);
const NEXT: Partial<Record<LegacyStatusValue, LegacyStatusValue>> = {
  WARNING_1: 'WARNING_2', WARNING_2: 'FINAL_WARNING', FINAL_WARNING: 'GRACE', GRACE: 'RELEASED',
};

/** IST calendar day start, as a UTC instant. Dates are compared in IST like every other cron here. */
function istDayStart(d: Date): number {
  const IST = 5.5 * 3_600_000;
  return Math.floor((d.getTime() + IST) / DAY_MS) * DAY_MS - IST;
}
function daysBetween(from: Date, to: Date): number {
  return Math.round((istDayStart(to) - istDayStart(from)) / DAY_MS);
}

export function inactiveSince(p: PlanClock): Date | null {
  const c = [p.lastActiveAt, p.clockResetAt].filter((d): d is Date => d !== null);
  if (c.length === 0) return null;
  return new Date(Math.max(...c.map((d) => d.getTime())));
}

const usesSchedule = (t: LegacyTriggerValue) => t === 'SCHEDULED' || t === 'BOTH';
const usesInactivity = (t: LegacyTriggerValue) => t === 'INACTIVITY' || t === 'BOTH';

export function planSteps(p: PlanClock, now: Date): Step[] {
  if (p.status === 'DRAFT' || p.status === 'RELEASED') return [];
  if (p.status === 'PAUSED') {
    return p.pausedUntil && daysBetween(p.pausedUntil, now) >= 0 ? [{ kind: 'resume' }] : [];
  }
  const since = inactiveSince(p);
  if (WARNING_STATES.has(p.status) && since && p.stageEnteredAt && since > p.stageEnteredAt) {
    return [{ kind: 'reset', from: p.status }];
  }
  if (usesSchedule(p.triggerMode) && p.scheduledFor && daysBetween(now, p.scheduledFor) <= 0) {
    return [{ kind: 'advance', to: 'RELEASED', reason: 'scheduled' }];
  }
  const steps: Step[] = [];
  if (usesSchedule(p.triggerMode) && p.scheduledFor) {
    const left = daysBetween(now, p.scheduledFor);
    const t = [...LEGACY_SCHEDULE_REMINDER_DAYS].sort((a, b) => a - b).find((d) => left <= d);
    if (t !== undefined) steps.push({ kind: 'scheduleReminder', daysBefore: t });
  }
  if (usesInactivity(p.triggerMode)) {
    if (p.status === 'ARMED' && since && daysBetween(since, now) >= p.inactivityDays) {
      steps.push({ kind: 'advance', to: 'WARNING_1', reason: 'inactivity' });
    } else if (NEXT[p.status] && p.stageEnteredAt && daysBetween(p.stageEnteredAt, now) >= LEGACY_STAGE_DAYS) {
      steps.push({ kind: 'advance', to: NEXT[p.status]!, reason: 'inactivity' });
    }
  }
  return steps;
}

const fmt = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);

export function nextEventText(p: PlanClock, now: Date): string | null {
  switch (p.status) {
    case 'DRAFT': return null;
    case 'RELEASED': return 'Your nominees have access. Revoke it any time.';
    case 'PAUSED': return p.pausedUntil ? `Paused until ${fmt(p.pausedUntil)}.` : 'Paused.';
    case 'GRACE': return p.stageEnteredAt ? `Nominees get access on ${fmt(addDays(p.stageEnteredAt, LEGACY_STAGE_DAYS))} unless you sign in.` : null;
    case 'WARNING_1': case 'WARNING_2': case 'FINAL_WARNING':
      return 'Warnings are being sent. Sign in or click "I\'m OK" in the email to reset.';
    case 'ARMED': {
      const parts: string[] = [];
      const since = inactiveSince(p);
      if (usesInactivity(p.triggerMode) && since) parts.push(`First warning on ${fmt(addDays(since, p.inactivityDays))} if you stay inactive.`);
      if (usesSchedule(p.triggerMode) && p.scheduledFor) parts.push(`Scheduled release on ${fmt(p.scheduledFor)}.`);
      void now;
      return parts.join(' ') || null;
    }
  }
}
```

- [ ] **Step 4: Run tests.** Expected: PASS (all). If the `nextEventText` date is off by one, check `istDayStart` against the `D()` helper; both use 10:00 IST.

- [ ] **Step 5: Commit**

```bash
git add portfolioos/packages/api/src/services/legacy/stateMachine.ts portfolioos/packages/api/test/legacy/stateMachine.test.ts
git commit -m "feat(legacy): pure plan state machine"
```

---

### Task 5: Tokens, OTP, sessions, owner step-up

**Files:**
- Create: `portfolioos/packages/api/src/services/legacy/tokens.service.ts`
- Modify: `portfolioos/packages/api/src/services/twoFactor.service.ts` (export `acceptCode`)
- Test: `portfolioos/packages/api/test/legacy/tokens.test.ts`

**Interfaces:**
- Consumes: `LegacyToken`, `LegacyCode` (Task 2); `inviteTokenHash` (`src/lib/inviteToken.ts`); `acceptCode`, `isTwoFactorEnabled` (twoFactor.service).
- Produces:
```ts
export const TOKEN_TTL_DAYS: Record<LegacyTokenPurpose, number>; // INVITE 365, ACCESS 90, IM_OK 30, VERIFY 14
export function newRawToken(): { token: string; hash: string };
export async function createLinkToken(tx: Prisma.TransactionClient, a: { planId: string; userId: string; nomineeId: string | null; purpose: LegacyTokenPurpose; cycle: number; now: Date }): Promise<string>; // returns raw token
export async function resolveLinkToken(token: string, purpose: LegacyTokenPurpose, now?: Date): Promise<LegacyToken & { plan: LegacyPlan } | null>; // system ctx; null if unknown/expired
export async function issueNomineeOtp(nomineeId: string, userId: string, now?: Date): Promise<string>; // raw 6-digit
export async function verifyNomineeOtp(nomineeId: string, code: string, now?: Date): Promise<'ok' | 'bad' | 'locked' | 'expired'>;
export async function createNomineeSession(nomineeId: string, userId: string, now?: Date): Promise<string>; // raw session token
export async function resolveNomineeSession(raw: string, now?: Date): Promise<{ nomineeId: string; userId: string } | null>;
export async function startOwnerStepUp(userId: string): Promise<{ method: 'totp' | 'email'; code?: string }>; // code returned only for email (caller emails it)
export async function verifyOwnerStepUp(userId: string, code: string, now?: Date): Promise<string>; // raw grant (15 min); throws BadRequestError
export async function checkOwnerGrant(userId: string, raw: string | undefined, now?: Date): Promise<boolean>;
export async function wipeNomineeAccess(tx: Prisma.TransactionClient, planId: string): Promise<void>; // ACCESS/VERIFY tokens + OTP + sessions for the plan
```
Constants: OTP 10 min, 5 attempts, 30-min lock; session 30 min; grant 15 min; email step-up code 10 min, 5 attempts.

- [ ] **Step 1: Failing tests**

```ts
// test/legacy/tokens.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import {
  createLinkToken, resolveLinkToken, issueNomineeOtp, verifyNomineeOtp,
  createNomineeSession, resolveNomineeSession, startOwnerStepUp, verifyOwnerStepUp, checkOwnerGrant,
} from '../../src/services/legacy/tokens.service.js';

describe('legacy tokens', () => {
  let s: TestScope; let planId: string; let nomineeId: string;
  beforeAll(async () => {
    s = await createTestScope('legacy-tok');
    const plan = await runAsSystem(() => prisma.legacyPlan.create({ data: { userId: s.userId } }));
    planId = plan.id;
    const n = await runAsSystem(() => prisma.legacyNominee.create({ data: {
      planId, userId: s.userId, nameEnc: 'n', emailEnc: 'e', relationship: 'Spouse', priority: 1, categories: ['INSURANCE'],
    } }));
    nomineeId = n.id;
  });
  afterAll(async () => { await runAsSystem(() => prisma.legacyPlan.deleteMany({ where: { userId: s.userId } })); await s.cleanup(); });

  it('link token resolves by purpose, not other purposes, and expires', async () => {
    const now = new Date('2027-01-01T00:00:00Z');
    const raw = await runAsSystem(() => prisma.$transaction((tx) =>
      createLinkToken(tx, { planId, userId: s.userId, nomineeId, purpose: 'ACCESS', cycle: 1, now })));
    expect((await resolveLinkToken(raw, 'ACCESS', now))?.nomineeId).toBe(nomineeId);
    expect(await resolveLinkToken(raw, 'IM_OK', now)).toBeNull();
    expect(await resolveLinkToken(raw, 'ACCESS', new Date('2027-04-02T00:00:00Z'))).toBeNull(); // > 90 days
    expect(await resolveLinkToken('nope', 'ACCESS', now)).toBeNull();
  });

  it('OTP: lockout after 5 wrong codes; correct code during lock rejected', async () => {
    const now = new Date('2027-01-01T00:00:00Z');
    const code = await issueNomineeOtp(nomineeId, s.userId, now);
    for (let i = 0; i < 5; i++) expect(await verifyNomineeOtp(nomineeId, '000000' === code ? '111111' : '000000', now)).toBe('bad');
    expect(await verifyNomineeOtp(nomineeId, code, now)).toBe('locked');
  });

  it('OTP: expires after 10 minutes, single use', async () => {
    const now = new Date('2027-02-01T00:00:00Z');
    const code = await issueNomineeOtp(nomineeId, s.userId, now);
    expect(await verifyNomineeOtp(nomineeId, code, new Date(now.getTime() + 11 * 60_000))).toBe('expired');
    const code2 = await issueNomineeOtp(nomineeId, s.userId, now);
    expect(await verifyNomineeOtp(nomineeId, code2, now)).toBe('ok');
    expect(await verifyNomineeOtp(nomineeId, code2, now)).toBe('expired');
  });

  it('session resolves for 30 minutes', async () => {
    const now = new Date('2027-03-01T00:00:00Z');
    const raw = await createNomineeSession(nomineeId, s.userId, now);
    expect(await resolveNomineeSession(raw, now)).toEqual({ nomineeId, userId: s.userId });
    expect(await resolveNomineeSession(raw, new Date(now.getTime() + 31 * 60_000))).toBeNull();
  });

  it('owner step-up by email code yields a 15-minute grant', async () => {
    const now = new Date();
    const r = await startOwnerStepUp(s.userId);
    expect(r.method).toBe('email');
    await expect(verifyOwnerStepUp(s.userId, '000000' === r.code ? '111111' : '000000', now)).rejects.toThrow();
    const grant = await verifyOwnerStepUp(s.userId, r.code!, now);
    expect(await checkOwnerGrant(s.userId, grant, now)).toBe(true);
    expect(await checkOwnerGrant(s.userId, grant, new Date(now.getTime() + 16 * 60_000))).toBe(false);
    expect(await checkOwnerGrant(s.userId, undefined, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

In `twoFactor.service.ts` change `async function acceptCode(` to `export async function acceptCode(`.

```ts
// src/services/legacy/tokens.service.ts
import crypto from 'node:crypto';
import type { LegacyCodePurpose, LegacyPlan, LegacyToken, LegacyTokenPurpose, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { inviteTokenHash } from '../../lib/inviteToken.js';
import { BadRequestError, TooManyRequestsError } from '../../lib/errors.js';
import { acceptCode, isTwoFactorEnabled } from '../twoFactor.service.js';

const MIN = 60_000;
const DAY = 86_400_000;
export const TOKEN_TTL_DAYS: Record<LegacyTokenPurpose, number> = { INVITE: 365, ACCESS: 90, IM_OK: 30, VERIFY: 14 };
const OTP_TTL = 10 * MIN;
const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCK = 30 * MIN;
const SESSION_TTL = 30 * MIN;
const GRANT_TTL = 15 * MIN;

const sha = inviteTokenHash;

export function newRawToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: sha(token) };
}

function sixDigits(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export async function createLinkToken(
  tx: Prisma.TransactionClient,
  a: { planId: string; userId: string; nomineeId: string | null; purpose: LegacyTokenPurpose; cycle: number; now: Date },
): Promise<string> {
  const { token, hash } = newRawToken();
  await tx.legacyToken.create({
    data: {
      planId: a.planId, userId: a.userId, nomineeId: a.nomineeId, purpose: a.purpose, cycle: a.cycle,
      tokenHash: hash, expiresAt: new Date(a.now.getTime() + TOKEN_TTL_DAYS[a.purpose] * DAY),
    },
  });
  return token;
}

/** Public endpoints have no user context, so lookup is privileged; the hash is the credential. */
export async function resolveLinkToken(
  token: string, purpose: LegacyTokenPurpose, now: Date = new Date(),
): Promise<(LegacyToken & { plan: LegacyPlan }) | null> {
  const row = await runAsSystem(() =>
    prisma.legacyToken.findUnique({ where: { tokenHash: sha(token) }, include: { plan: true } }));
  if (!row || row.purpose !== purpose || row.expiresAt <= now) return null;
  return row;
}

async function putCode(
  a: { userId: string; nomineeId: string | null; subjectId: string; purpose: LegacyCodePurpose; secret: string; ttl: number; now: Date },
): Promise<void> {
  const data = {
    userId: a.userId, nomineeId: a.nomineeId, codeHash: sha(a.secret),
    expiresAt: new Date(a.now.getTime() + a.ttl), attempts: 0,
  };
  await runAsSystem(() => prisma.legacyCode.upsert({
    where: { subjectId_purpose: { subjectId: a.subjectId, purpose: a.purpose } },
    // Re-issuing keeps an active lock: a new code must not reset brute-force protection.
    update: { codeHash: data.codeHash, expiresAt: data.expiresAt, attempts: 0 },
    create: { ...data, subjectId: a.subjectId, purpose: a.purpose },
  }));
}

type CodeCheck = 'ok' | 'bad' | 'locked' | 'expired';
async function checkCode(subjectId: string, purpose: LegacyCodePurpose, secret: string, now: Date): Promise<CodeCheck> {
  return runAsSystem(async () => {
    const row = await prisma.legacyCode.findUnique({ where: { subjectId_purpose: { subjectId, purpose } } });
    if (!row) return 'expired';
    if (row.lockedUntil && row.lockedUntil > now) return 'locked';
    if (row.expiresAt <= now) return 'expired';
    const good = crypto.timingSafeEqual(Buffer.from(row.codeHash, 'hex'), Buffer.from(sha(secret.trim()), 'hex'));
    if (good) {
      await prisma.legacyCode.delete({ where: { id: row.id } });
      return 'ok';
    }
    const attempts = row.attempts + 1;
    await prisma.legacyCode.update({
      where: { id: row.id },
      data: { attempts, lockedUntil: attempts >= OTP_MAX_ATTEMPTS ? new Date(now.getTime() + OTP_LOCK) : null },
    });
    return 'bad';
  });
}

export async function issueNomineeOtp(nomineeId: string, userId: string, now: Date = new Date()): Promise<string> {
  const existing = await runAsSystem(() => prisma.legacyCode.findUnique({
    where: { subjectId_purpose: { subjectId: nomineeId, purpose: 'NOMINEE_OTP' } },
  }));
  if (existing?.lockedUntil && existing.lockedUntil > now) throw new TooManyRequestsError('Too many attempts. Try again in 30 minutes.');
  const code = sixDigits();
  await putCode({ userId, nomineeId, subjectId: nomineeId, purpose: 'NOMINEE_OTP', secret: code, ttl: OTP_TTL, now });
  return code;
}

export function verifyNomineeOtp(nomineeId: string, code: string, now: Date = new Date()): Promise<CodeCheck> {
  return checkCode(nomineeId, 'NOMINEE_OTP', code, now);
}

/** Sessions are stored under subjectId = sha(token) so several devices can hold one each. */
export async function createNomineeSession(nomineeId: string, userId: string, now: Date = new Date()): Promise<string> {
  const { token, hash } = newRawToken();
  await runAsSystem(() => prisma.legacyCode.create({ data: {
    userId, nomineeId, subjectId: hash, purpose: 'NOMINEE_SESSION', codeHash: hash,
    expiresAt: new Date(now.getTime() + SESSION_TTL),
  } }));
  return token;
}

export async function resolveNomineeSession(raw: string, now: Date = new Date()): Promise<{ nomineeId: string; userId: string } | null> {
  const row = await runAsSystem(() => prisma.legacyCode.findUnique({
    where: { subjectId_purpose: { subjectId: sha(raw), purpose: 'NOMINEE_SESSION' } },
  }));
  if (!row || !row.nomineeId || row.expiresAt <= now) return null;
  return { nomineeId: row.nomineeId, userId: row.userId };
}

export async function startOwnerStepUp(userId: string): Promise<{ method: 'totp' | 'email'; code?: string }> {
  const user = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: userId } }));
  if (isTwoFactorEnabled(user)) return { method: 'totp' };
  const code = sixDigits();
  await putCode({ userId, nomineeId: null, subjectId: userId, purpose: 'OWNER_STEPUP_CODE', secret: code, ttl: OTP_TTL, now: new Date() });
  return { method: 'email', code };
}

export async function verifyOwnerStepUp(userId: string, code: string, now: Date = new Date()): Promise<string> {
  const user = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: userId } }));
  if (isTwoFactorEnabled(user)) {
    if (!(await acceptCode(user, code))) throw new BadRequestError("That code didn't match.");
  } else {
    const r = await checkCode(userId, 'OWNER_STEPUP_CODE', code, now);
    if (r === 'locked') throw new TooManyRequestsError('Too many attempts. Try again in 30 minutes.');
    if (r !== 'ok') throw new BadRequestError(r === 'expired' ? 'That code has expired. Request a new one.' : "That code didn't match.");
  }
  const { token, hash } = newRawToken();
  await putCode({ userId, nomineeId: null, subjectId: userId, purpose: 'OWNER_STEPUP_GRANT', secret: token, ttl: GRANT_TTL, now });
  void hash;
  return token;
}

export async function checkOwnerGrant(userId: string, raw: string | undefined, now: Date = new Date()): Promise<boolean> {
  if (!raw) return false;
  const row = await runAsSystem(() => prisma.legacyCode.findUnique({
    where: { subjectId_purpose: { subjectId: userId, purpose: 'OWNER_STEPUP_GRANT' } },
  }));
  if (!row || row.expiresAt <= now) return false;
  return crypto.timingSafeEqual(Buffer.from(row.codeHash, 'hex'), Buffer.from(sha(raw), 'hex'));
}

export async function wipeNomineeAccess(tx: Prisma.TransactionClient, planId: string): Promise<void> {
  const nominees = await tx.legacyNominee.findMany({ where: { planId }, select: { id: true } });
  const ids = nominees.map((n) => n.id);
  await tx.legacyToken.deleteMany({ where: { planId, purpose: { in: ['ACCESS', 'VERIFY'] } } });
  await tx.legacyCode.deleteMany({ where: { nomineeId: { in: ids } } });
}
```

> `TooManyRequestsError`'s constructor signature is in `src/lib/errors.ts:57`; adjust the call if it takes no message.

- [ ] **Step 4: Run tests.** Expected PASS.

- [ ] **Step 5: Commit**

```bash
git add portfolioos/packages/api/src/services/legacy/tokens.service.ts portfolioos/packages/api/src/services/twoFactor.service.ts portfolioos/packages/api/test/legacy/tokens.test.ts
git commit -m "feat(legacy): link tokens, nominee OTP/session, owner step-up"
```

---

### Task 6: Email templates

**Files:**
- Create: `portfolioos/packages/api/src/services/legacy/emails.ts`
- Test: `portfolioos/packages/api/test/legacy/emails.test.ts`

**Interfaces:**
- Produces:
```ts
export type OutboxKind =
  | 'INVITE' | 'WARNING_1' | 'WARNING_2' | 'FINAL_WARNING' | 'GRACE_OWNER' | 'GRACE_NOMINEE' | 'VERIFY'
  | 'RELEASED_NOMINEE' | 'RELEASED_OWNER' | 'RESET_NOMINEE' | 'REVOKED_NOMINEE' | 'VERIFIER_VOUCHED_OWNER'
  | 'SCHEDULE_30' | 'SCHEDULE_7' | 'SCHEDULE_1';
export interface EmailCtx { ownerName: string; recipientName: string; link: string | null; date: string | null; appUrl: string }
export function renderLegacyEmail(kind: OutboxKind, ctx: EmailCtx): { subject: string; html: string; text: string };
export function renderStepUpEmail(name: string, code: string): { subject: string; html: string; text: string };
export function renderNomineeOtpEmail(name: string, ownerName: string, code: string): { subject: string; html: string; text: string };
export function renderPlanChangedEmail(name: string, appUrl: string): { subject: string; html: string; text: string };
```

- [ ] **Step 1: Failing test**

```ts
// test/legacy/emails.test.ts
import { describe, it, expect } from 'vitest';
import { renderLegacyEmail, type OutboxKind } from '../../src/services/legacy/emails.js';

const KINDS: OutboxKind[] = ['INVITE','WARNING_1','WARNING_2','FINAL_WARNING','GRACE_OWNER','GRACE_NOMINEE','VERIFY',
  'RELEASED_NOMINEE','RELEASED_OWNER','RESET_NOMINEE','REVOKED_NOMINEE','VERIFIER_VOUCHED_OWNER','SCHEDULE_30','SCHEDULE_7','SCHEDULE_1'];

describe('legacy emails', () => {
  it.each(KINDS)('%s renders subject, html and text', (k) => {
    const e = renderLegacyEmail(k, { ownerName: 'Asha', recipientName: 'Ravi', link: 'https://x/l/abc', date: '1 Apr 2027', appUrl: 'https://x' });
    expect(e.subject.length).toBeGreaterThan(5);
    expect(e.text).toContain('Ravi');
  });
  it('escapes HTML in names', () => {
    const e = renderLegacyEmail('INVITE', { ownerName: '<b>A</b>', recipientName: 'R', link: 'https://x', date: null, appUrl: 'https://x' });
    expect(e.html).not.toContain('<b>A</b>');
  });
  it('owner warnings carry the I\'m OK link; nominee invite never mentions amounts', () => {
    const w = renderLegacyEmail('WARNING_1', { ownerName: 'A', recipientName: 'A', link: 'https://x/ok', date: null, appUrl: 'https://x' });
    expect(w.html).toContain('https://x/ok');
    const i = renderLegacyEmail('INVITE', { ownerName: 'A', recipientName: 'R', link: 'https://x/ack', date: null, appUrl: 'https://x' });
    expect(i.text).not.toMatch(/₹|balance|net worth/i);
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

```ts
// src/services/legacy/emails.ts
export type OutboxKind =
  | 'INVITE' | 'WARNING_1' | 'WARNING_2' | 'FINAL_WARNING' | 'GRACE_OWNER' | 'GRACE_NOMINEE' | 'VERIFY'
  | 'RELEASED_NOMINEE' | 'RELEASED_OWNER' | 'RESET_NOMINEE' | 'REVOKED_NOMINEE' | 'VERIFIER_VOUCHED_OWNER'
  | 'SCHEDULE_30' | 'SCHEDULE_7' | 'SCHEDULE_1';

export interface EmailCtx { ownerName: string; recipientName: string; link: string | null; date: string | null; appUrl: string }
type Rendered = { subject: string; html: string; text: string };

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function build(subject: string, recipient: string, lines: string[], cta?: { label: string; href: string }): Rendered {
  const html =
    `<p>Hi ${esc(recipient)},</p>` +
    lines.map((l) => `<p>${esc(l)}</p>`).join('') +
    (cta ? `<p><a href="${esc(cta.href)}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none">${esc(cta.label)}</a></p><p style="font-size:12px;color:#666">Or open: ${esc(cta.href)}</p>` : '') +
    `<p style="font-size:12px;color:#666">EveryPaisa Legacy Transfer shares information only. It is not a will and does not transfer any asset.</p>`;
  const text = [`Hi ${recipient},`, '', ...lines, ...(cta ? ['', `${cta.label}: ${cta.href}`] : [])].join('\n');
  return { subject, html, text };
}

export function renderLegacyEmail(kind: OutboxKind, c: EmailCtx): Rendered {
  const link = c.link ?? c.appUrl;
  switch (kind) {
    case 'INVITE':
      return build(`${c.ownerName} named you as a trusted contact`, c.recipientName, [
        `${c.ownerName} has named you as a trusted contact in their EveryPaisa Legacy Transfer plan.`,
        'Nothing is shared with you now. If they become unreachable for a long time, or on a date they chose, you will get read-only access to the information they picked.',
        'Please confirm this email address works.',
      ], { label: 'Confirm', href: link });
    case 'WARNING_1': case 'WARNING_2': case 'FINAL_WARNING': {
      const n = kind === 'WARNING_1' ? 'first' : kind === 'WARNING_2' ? 'second' : 'final';
      return build(`Are you OK? (${n} Legacy Transfer reminder)`, c.recipientName, [
        "We haven't seen you on EveryPaisa for a while, so your Legacy Transfer plan has started its countdown.",
        `This is the ${n} reminder. If we don't hear from you, your nominees will be told and later given read-only access.`,
        'One click below resets everything. Signing in also works.',
      ], { label: "I'm OK — reset the countdown", href: link });
    }
    case 'GRACE_OWNER':
      return build('Your nominees will get access in 7 days', c.recipientName, [
        `Your nominees have been told that access opens on ${c.date ?? 'in 7 days'}.`,
        'If you are fine, click below or sign in and nothing will be shared.',
      ], { label: "I'm OK — cancel", href: link });
    case 'GRACE_NOMINEE':
      return build(`About ${c.ownerName}'s Legacy Transfer plan`, c.recipientName, [
        `${c.ownerName} has not been active on EveryPaisa for a long time and has not answered several reminders.`,
        `If this continues, you will get read-only access to the information they chose on ${c.date ?? 'in 7 days'}.`,
        'You do not need to do anything now.',
      ]);
    case 'VERIFY':
      return build(`Please confirm: is ${c.ownerName} OK?`, c.recipientName, [
        `${c.ownerName} asked you to confirm before their information is shared with their nominees.`,
        'Tell us whether something has happened to them, or that they are fine. If you are not sure, do nothing; access opens automatically at the end of the waiting period.',
      ], { label: 'Answer', href: link });
    case 'RELEASED_NOMINEE':
      return build(`${c.ownerName} has shared their financial information with you`, c.recipientName, [
        `${c.ownerName} set up EveryPaisa Legacy Transfer so that you would not be left in the dark about their finances.`,
        'Open the link below. We will email you a one-time code to confirm it is you. Access is read-only.',
      ], { label: 'View information', href: link });
    case 'RELEASED_OWNER':
      return build('Your Legacy Transfer plan was released', c.recipientName, [
        'Your nominees now have read-only access to the information you picked.',
        'If this is a mistake, sign in and revoke access. It ends immediately.',
      ], { label: 'Open Legacy Transfer', href: `${c.appUrl}/legacy` });
    case 'RESET_NOMINEE':
      return build(`Update about ${c.ownerName}`, c.recipientName, [
        `${c.ownerName} is active again. Nothing will be shared, and no action is needed.`,
      ]);
    case 'REVOKED_NOMINEE':
      return build(`${c.ownerName} withdrew access`, c.recipientName, [
        `${c.ownerName} has withdrawn your access to their Legacy Transfer information.`,
      ]);
    case 'VERIFIER_VOUCHED_OWNER':
      return build('Your verifier said you are OK', c.recipientName, [
        'Your Legacy Transfer verifier said you are fine, so the countdown has been reset.',
        'Please sign in once so we know too.',
      ], { label: 'Open EveryPaisa', href: `${c.appUrl}/legacy` });
    case 'SCHEDULE_30': case 'SCHEDULE_7': case 'SCHEDULE_1':
      return build(`Scheduled Legacy release on ${c.date ?? ''}`, c.recipientName, [
        `Your Legacy Transfer plan is scheduled to share your information with your nominees on ${c.date ?? 'the date you chose'}.`,
        'To postpone or cancel, open Legacy Transfer.',
      ], { label: 'Open Legacy Transfer', href: `${c.appUrl}/legacy` });
  }
}

export function renderStepUpEmail(name: string, code: string): Rendered {
  return build('Your Legacy Transfer confirmation code', name, [
    `Your code is ${code}. It expires in 10 minutes.`,
    "If you didn't try to change your Legacy Transfer plan, change your password now.",
  ]);
}

export function renderNomineeOtpEmail(name: string, ownerName: string, code: string): Rendered {
  return build(`Your code to view ${ownerName}'s information`, name, [`Your code is ${code}. It expires in 10 minutes.`]);
}

export function renderPlanChangedEmail(name: string, appUrl: string): Rendered {
  return build('Your Legacy Transfer plan was changed', name, [
    'Your Legacy Transfer plan (nominees, what they see, or when) was just changed.',
    "If this wasn't you, change your password and review the plan now.",
  ], { label: 'Review plan', href: `${appUrl}/legacy` });
}
```

- [ ] **Step 4: Run tests.** PASS.

- [ ] **Step 5: Commit**

```bash
git add portfolioos/packages/api/src/services/legacy/emails.ts portfolioos/packages/api/test/legacy/emails.test.ts
git commit -m "feat(legacy): email templates"
```

---

### Task 7: Outbox (enqueue in tx, flush with retry)

**Files:**
- Create: `portfolioos/packages/api/src/services/legacy/outbox.service.ts`
- Test: `portfolioos/packages/api/test/legacy/outbox.test.ts`

**Interfaces:**
- Consumes: `OutboxKind`, `renderLegacyEmail` (Task 6); `sendEmail` (`services/notifications/email.service.ts`); `encryptSecret`/`decryptSecret`; `env.FRONTEND_URL`.
- Produces:
```ts
export const LINK_PATH: Partial<Record<OutboxKind, string>>; // INVITE '/legacy/ack/', WARNING_* & GRACE_OWNER '/legacy/ok/', VERIFY '/legacy/verify/', RELEASED_NOMINEE '/legacy/access/'
export async function enqueue(tx: Prisma.TransactionClient, a: { planId: string; userId: string; kind: OutboxKind; cycle: number; recipientKey: string; token?: string }): Promise<void>; // idempotent on unique key
export async function flushOutbox(send?: typeof sendEmail): Promise<{ sent: number; failed: number }>; // system ctx; rows with sentAt null and attempts < 5
```

- [ ] **Step 1: Failing test**

```ts
// test/legacy/outbox.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { encryptSecret } from '../../src/lib/secrets.js';
import { enqueue, flushOutbox } from '../../src/services/legacy/outbox.service.js';

describe('legacy outbox', () => {
  let s: TestScope; let planId: string; let nomineeId: string;
  beforeAll(async () => {
    s = await createTestScope('legacy-ob');
    planId = (await runAsSystem(() => prisma.legacyPlan.create({ data: { userId: s.userId, status: 'ARMED' } }))).id;
    nomineeId = (await runAsSystem(() => prisma.legacyNominee.create({ data: {
      planId, userId: s.userId, nameEnc: encryptSecret('Ravi'), emailEnc: encryptSecret('ravi@test.local'),
      relationship: 'Brother', priority: 1, categories: ['INSURANCE'],
    } }))).id;
  });
  afterAll(async () => { await runAsSystem(() => prisma.legacyPlan.deleteMany({ where: { userId: s.userId } })); await s.cleanup(); });

  it('enqueue is send-once per (plan, kind, cycle, recipient)', async () => {
    await runAsSystem(() => prisma.$transaction(async (tx) => {
      await enqueue(tx, { planId, userId: s.userId, kind: 'INVITE', cycle: 1, recipientKey: nomineeId, token: 'tok' });
      await enqueue(tx, { planId, userId: s.userId, kind: 'INVITE', cycle: 1, recipientKey: nomineeId, token: 'tok2' });
    }));
    expect(await runAsSystem(() => prisma.legacyOutbox.count({ where: { planId } }))).toBe(1);
  });

  it('failed send is retried on next flush, then marked sent', async () => {
    const sent: Array<{ to: string; html: string }> = [];
    const fail = async () => ({ sent: false as const, reason: 'smtp down' });
    expect(await flushOutbox(fail)).toEqual({ sent: 0, failed: 1 });
    const ok = async (i: { to: string; html: string }) => { sent.push(i); return { sent: true as const, messageId: 'm' }; };
    expect(await flushOutbox(ok)).toEqual({ sent: 1, failed: 0 });
    expect(sent[0]!.to).toBe('ravi@test.local');
    expect(sent[0]!.html).toContain('/legacy/ack/tok');
    expect(await flushOutbox(ok)).toEqual({ sent: 0, failed: 0 });
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

```ts
// src/services/legacy/outbox.service.ts
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { encryptSecret, decryptSecret } from '../../lib/secrets.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { sendEmail } from '../notifications/email.service.js';
import { renderLegacyEmail, type OutboxKind } from './emails.js';

const MAX_ATTEMPTS = 5;

export const LINK_PATH: Partial<Record<OutboxKind, string>> = {
  INVITE: '/legacy/ack/',
  WARNING_1: '/legacy/ok/', WARNING_2: '/legacy/ok/', FINAL_WARNING: '/legacy/ok/', GRACE_OWNER: '/legacy/ok/',
  VERIFY: '/legacy/verify/',
  RELEASED_NOMINEE: '/legacy/access/',
};

export async function enqueue(
  tx: Prisma.TransactionClient,
  a: { planId: string; userId: string; kind: OutboxKind; cycle: number; recipientKey: string; token?: string },
): Promise<void> {
  await tx.legacyOutbox.upsert({
    where: { planId_kind_cycle_recipientKey: { planId: a.planId, kind: a.kind, cycle: a.cycle, recipientKey: a.recipientKey } },
    update: {}, // send-once: the first enqueue wins
    create: {
      planId: a.planId, userId: a.userId, kind: a.kind, cycle: a.cycle, recipientKey: a.recipientKey,
      tokenEnc: a.token ? encryptSecret(a.token) : null,
    },
  });
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export async function flushOutbox(send: typeof sendEmail = sendEmail): Promise<{ sent: number; failed: number }> {
  const rows = await runAsSystem(() => prisma.legacyOutbox.findMany({
    where: { sentAt: null, attempts: { lt: MAX_ATTEMPTS } },
    include: { plan: { include: { user: { select: { name: true, email: true } } } } },
    orderBy: { createdAt: 'asc' },
    take: 500,
  }));
  let sent = 0; let failed = 0;
  for (const row of rows) {
    try {
      const kind = row.kind as OutboxKind;
      const owner = row.plan.user;
      let to = owner.email; let recipientName = owner.name;
      if (row.recipientKey !== 'owner') {
        const n = await runAsSystem(() => prisma.legacyNominee.findUnique({ where: { id: row.recipientKey } }));
        if (!n) { // nominee removed after enqueue: nothing to send
          await runAsSystem(() => prisma.legacyOutbox.update({ where: { id: row.id }, data: { sentAt: new Date(), lastError: 'nominee removed' } }));
          continue;
        }
        to = decryptSecret(n.emailEnc); recipientName = decryptSecret(n.nameEnc);
      }
      const path = LINK_PATH[kind];
      const link = path && row.tokenEnc ? `${env.FRONTEND_URL}${path}${decryptSecret(row.tokenEnc)}` : null;
      const date =
        kind.startsWith('SCHEDULE_') && row.plan.scheduledFor ? fmtDate(row.plan.scheduledFor)
        : (kind === 'GRACE_OWNER' || kind === 'GRACE_NOMINEE') && row.plan.stageEnteredAt ? fmtDate(new Date(row.plan.stageEnteredAt.getTime() + 7 * 86_400_000))
        : null;
      const mail = renderLegacyEmail(kind, { ownerName: owner.name, recipientName, link, date, appUrl: env.FRONTEND_URL });
      const res = await send({ to, ...mail });
      if (!res.sent) throw new Error(res.reason);
      await runAsSystem(() => prisma.legacyOutbox.update({ where: { id: row.id }, data: { sentAt: new Date(), tokenEnc: null } }));
      sent++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      await runAsSystem(() => prisma.legacyOutbox.update({ where: { id: row.id }, data: { attempts: { increment: 1 }, lastError: msg.slice(0, 500) } }));
      logger.error({ outboxId: row.id, kind: row.kind, err: msg }, '[legacy] outbox send failed; will retry');
    }
  }
  return { sent, failed };
}
```

> `tokenEnc` is cleared after a successful send, so the DB never keeps a usable link longer than needed.

- [ ] **Step 4: Run tests.** PASS.

- [ ] **Step 5: Commit**

```bash
git add portfolioos/packages/api/src/services/legacy/outbox.service.ts portfolioos/packages/api/test/legacy/outbox.test.ts
git commit -m "feat(legacy): transactional email outbox with retry"
```

---

### Task 8: Runner (apply steps) + daily cron

**Files:**
- Create: `portfolioos/packages/api/src/services/legacy/runner.service.ts`
- Create: `portfolioos/packages/api/src/jobs/legacyTransferJob.ts`
- Modify: `portfolioos/packages/api/src/jobs/startupSync.ts` (call `startLegacyTransferJob()` next to `startSplitDigestJobs()`)
- Modify: `portfolioos/packages/api/test/helpers/env.setup.ts` (add `ENABLE_LEGACY_CRON: 'false'`)
- Test: `portfolioos/packages/api/test/legacy/runner.test.ts`

**Interfaces:**
- Consumes: `planSteps`, `PlanClock` (Task 4); `createLinkToken`, `wipeNomineeAccess` (Task 5); `enqueue`, `flushOutbox` (Task 7); `writeAuditLog`.
- Produces:
```ts
export async function applyStep(planId: string, step: Step, now: Date): Promise<void>;
export async function runLegacyTick(now?: Date, send?: typeof sendEmail): Promise<{ plans: number; steps: number; sent: number; failed: number }>;
export async function resetPlan(tx: Prisma.TransactionClient, plan: LegacyPlan, now: Date, notifyNominees: boolean): Promise<void>; // used by I'm-OK and verifier "fine" too
export async function releasePlan(tx: Prisma.TransactionClient, plan: LegacyPlan, now: Date): Promise<void>; // used by verifier "confirm"
```

Effects per step (all DB writes inside one `runInTransaction`/`prisma.$transaction` under `runAsSystem`; `flushOutbox` after commit):
| Step | Writes | Outbox |
|---|---|---|
| advance WARNING_1/2/FINAL_WARNING | status, stageEnteredAt=now | owner `WARNING_*` + new IM_OK token |
| advance GRACE | status, stageEnteredAt | owner `GRACE_OWNER` (+IM_OK token); every nominee `GRACE_NOMINEE`; verifier `VERIFY` (+VERIFY token) |
| advance RELEASED | status, stageEnteredAt, releasedAt | every nominee `RELEASED_NOMINEE` (+ACCESS token); owner `RELEASED_OWNER` |
| reset | status ARMED, stageEnteredAt null, clockResetAt now, cycle+1; delete IM_OK/VERIFY tokens | if from GRACE: every nominee `RESET_NOMINEE` |
| resume | status ARMED, pausedUntil null, clockResetAt now, cycle+1 | — |
| scheduleReminder | — | owner `SCHEDULE_<n>` (cycle = plan.cycle; send-once) |

- [ ] **Step 1: Failing test**

```ts
// test/legacy/runner.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { encryptSecret } from '../../src/lib/secrets.js';
import { runLegacyTick } from '../../src/services/legacy/runner.service.js';

const D = (s: string) => new Date(`${s}T04:30:00Z`);
const okSend = async () => ({ sent: true as const, messageId: 'm' });

describe('runLegacyTick', () => {
  let s: TestScope; let planId: string;
  beforeEach(async () => {
    s = await createTestScope('legacy-run');
    await runAsSystem(() => prisma.user.update({ where: { id: s.userId }, data: { lastActiveAt: D('2027-01-01'), plan: 'PLUS' } }));
    planId = (await runAsSystem(() => prisma.legacyPlan.create({ data: {
      userId: s.userId, status: 'ARMED', inactivityDays: 30, clockResetAt: D('2027-01-01'), activatedAt: D('2027-01-01'),
    } }))).id;
    await runAsSystem(() => prisma.legacyNominee.create({ data: {
      planId, userId: s.userId, nameEnc: encryptSecret('Ravi'), emailEnc: encryptSecret('ravi@test.local'),
      relationship: 'Brother', priority: 1, categories: ['INSURANCE'], isVerifier: true,
    } }));
  });
  afterEach(async () => { await runAsSystem(() => prisma.legacyPlan.deleteMany({ where: { userId: s.userId } })); await s.cleanup(); });

  const plan = () => runAsSystem(() => prisma.legacyPlan.findUniqueOrThrow({ where: { id: planId } }));
  // Rows from one transaction share createdAt (Postgres now() is per-transaction), so compare sorted.
  const kinds = () => runAsSystem(() => prisma.legacyOutbox.findMany({ where: { planId } })).then((r) => r.map((x) => x.kind).sort());

  it('walks ARMED → … → RELEASED one stage per run, with the right emails', async () => {
    const days = ['2027-01-31', '2027-02-07', '2027-02-14', '2027-02-21', '2027-02-28'];
    const expect_ = ['WARNING_1', 'WARNING_2', 'FINAL_WARNING', 'GRACE', 'RELEASED'];
    for (let i = 0; i < days.length; i++) {
      await runLegacyTick(D(days[i]!), okSend);
      await runLegacyTick(D(days[i]!), okSend); // same-day rerun is a no-op
      expect((await plan()).status).toBe(expect_[i]);
    }
    expect(await kinds()).toEqual(['WARNING_1', 'WARNING_2', 'FINAL_WARNING', 'GRACE_OWNER', 'GRACE_NOMINEE', 'VERIFY', 'RELEASED_NOMINEE', 'RELEASED_OWNER'].sort());
    expect((await plan()).releasedAt).not.toBeNull();
  });

  it('owner activity during GRACE resets and tells nominees', async () => {
    await runAsSystem(() => prisma.legacyPlan.update({ where: { id: planId }, data: { status: 'GRACE', stageEnteredAt: D('2027-02-21') } }));
    await runAsSystem(() => prisma.user.update({ where: { id: s.userId }, data: { lastActiveAt: D('2027-02-25') } }));
    await runLegacyTick(D('2027-02-28'), okSend);
    const p = await plan();
    expect(p.status).toBe('ARMED');
    expect(p.cycle).toBe(2);
    expect(await kinds()).toContain('RESET_NOMINEE');
  });

  it('lapsed owner plan still releases', async () => {
    await runAsSystem(() => prisma.user.update({ where: { id: s.userId }, data: { plan: 'FREE' } }));
    await runAsSystem(() => prisma.legacyPlan.update({ where: { id: planId }, data: { status: 'GRACE', stageEnteredAt: D('2027-02-21') } }));
    await runLegacyTick(D('2027-02-28'), okSend);
    expect((await plan()).status).toBe('RELEASED');
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement runner**

```ts
// src/services/legacy/runner.service.ts
import type { LegacyPlan, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { logger } from '../../lib/logger.js';
import { writeAuditLog } from '../../lib/audit.js';
import type { sendEmail } from '../notifications/email.service.js';
import { planSteps, type PlanClock, type Step } from './stateMachine.js';
import { createLinkToken, wipeNomineeAccess } from './tokens.service.js';
import { enqueue, flushOutbox } from './outbox.service.js';
import type { OutboxKind } from './emails.js';

type Tx = Prisma.TransactionClient;

async function nomineesOf(tx: Tx, planId: string) {
  return tx.legacyNominee.findMany({ where: { planId }, orderBy: { priority: 'asc' } });
}

async function ownerMail(tx: Tx, plan: LegacyPlan, kind: OutboxKind, now: Date, withImOk: boolean): Promise<void> {
  const token = withImOk
    ? await createLinkToken(tx, { planId: plan.id, userId: plan.userId, nomineeId: null, purpose: 'IM_OK', cycle: plan.cycle, now })
    : undefined;
  await enqueue(tx, { planId: plan.id, userId: plan.userId, kind, cycle: plan.cycle, recipientKey: 'owner', token });
}

export async function resetPlan(tx: Tx, plan: LegacyPlan, now: Date, notifyNominees: boolean): Promise<void> {
  const updated = await tx.legacyPlan.update({
    where: { id: plan.id },
    data: { status: 'ARMED', stageEnteredAt: null, clockResetAt: now, cycle: { increment: 1 } },
  });
  await tx.legacyToken.deleteMany({ where: { planId: plan.id, purpose: { in: ['IM_OK', 'VERIFY'] } } });
  if (notifyNominees) {
    for (const n of await nomineesOf(tx, plan.id)) {
      await enqueue(tx, { planId: plan.id, userId: plan.userId, kind: 'RESET_NOMINEE', cycle: updated.cycle, recipientKey: n.id });
    }
  }
}

export async function releasePlan(tx: Tx, plan: LegacyPlan, now: Date): Promise<void> {
  await tx.legacyPlan.update({ where: { id: plan.id }, data: { status: 'RELEASED', stageEnteredAt: now, releasedAt: now } });
  await tx.legacyToken.deleteMany({ where: { planId: plan.id, purpose: { in: ['IM_OK', 'VERIFY'] } } });
  for (const n of await nomineesOf(tx, plan.id)) {
    const token = await createLinkToken(tx, { planId: plan.id, userId: plan.userId, nomineeId: n.id, purpose: 'ACCESS', cycle: plan.cycle, now });
    await enqueue(tx, { planId: plan.id, userId: plan.userId, kind: 'RELEASED_NOMINEE', cycle: plan.cycle, recipientKey: n.id, token });
  }
  await ownerMail(tx, plan, 'RELEASED_OWNER', now, false);
}

async function advance(tx: Tx, plan: LegacyPlan, to: Exclude<PlanClock['status'], 'DRAFT' | 'ARMED' | 'PAUSED'>, now: Date): Promise<void> {
  if (to === 'RELEASED') return releasePlan(tx, plan, now);
  const p = await tx.legacyPlan.update({ where: { id: plan.id }, data: { status: to, stageEnteredAt: now } });
  if (to === 'GRACE') {
    await ownerMail(tx, p, 'GRACE_OWNER', now, true);
    for (const n of await nomineesOf(tx, plan.id)) {
      await enqueue(tx, { planId: p.id, userId: p.userId, kind: 'GRACE_NOMINEE', cycle: p.cycle, recipientKey: n.id });
      if (n.isVerifier) {
        const token = await createLinkToken(tx, { planId: p.id, userId: p.userId, nomineeId: n.id, purpose: 'VERIFY', cycle: p.cycle, now });
        await enqueue(tx, { planId: p.id, userId: p.userId, kind: 'VERIFY', cycle: p.cycle, recipientKey: n.id, token });
      }
    }
    return;
  }
  await ownerMail(tx, p, to, now, true); // WARNING_1 | WARNING_2 | FINAL_WARNING
}

export async function applyStep(planId: string, step: Step, now: Date): Promise<void> {
  await runAsSystem(() => prisma.$transaction(async (tx) => {
    const plan = await tx.legacyPlan.findUniqueOrThrow({ where: { id: planId } });
    switch (step.kind) {
      case 'reset': await resetPlan(tx, plan, now, step.from === 'GRACE'); break;
      case 'resume':
        await tx.legacyPlan.update({ where: { id: plan.id }, data: { status: 'ARMED', pausedUntil: null, clockResetAt: now, cycle: { increment: 1 } } });
        break;
      case 'scheduleReminder': await ownerMail(tx, plan, `SCHEDULE_${step.daysBefore}` as OutboxKind, now, false); break;
      case 'advance': await advance(tx, plan, step.to as never, now); break;
    }
  }));
  const plan = await runAsSystem(() => prisma.legacyPlan.findUniqueOrThrow({ where: { id: planId } }));
  const action = step.kind === 'reset' ? 'legacy_reset' : step.kind === 'advance' && step.to === 'RELEASED' ? 'legacy_released' : 'legacy_warning';
  if (step.kind !== 'scheduleReminder' && step.kind !== 'resume') {
    await writeAuditLog({ userId: plan.userId, action, resource: `LegacyPlan:${planId}`, metadata: { step } });
  }
}

export async function runLegacyTick(now: Date = new Date(), send?: typeof sendEmail) {
  const plans = await runAsSystem(() => prisma.legacyPlan.findMany({
    where: { status: { notIn: ['DRAFT', 'RELEASED'] } },
    include: { user: { select: { lastActiveAt: true } } },
  }));
  let steps = 0;
  for (const p of plans) {
    const clock: PlanClock = {
      status: p.status, triggerMode: p.triggerMode, inactivityDays: p.inactivityDays, scheduledFor: p.scheduledFor,
      pausedUntil: p.pausedUntil, stageEnteredAt: p.stageEnteredAt, clockResetAt: p.clockResetAt, lastActiveAt: p.user.lastActiveAt,
    };
    for (const step of planSteps(clock, now)) {
      try {
        await applyStep(p.id, step, now);
        steps++;
      } catch (err) {
        // One bad plan must not stop the others; it's retried on the next tick.
        logger.error({ planId: p.id, step, err: err instanceof Error ? err.message : String(err) }, '[legacy] step failed');
      }
    }
  }
  const { sent, failed } = await flushOutbox(send);
  return { plans: plans.length, steps, sent, failed };
}

void wipeNomineeAccess; // used by plan.service revoke; re-exported path kept in tokens.service
```

> Remove the trailing `void wipeNomineeAccess` line and its import if the linter flags it; it's only a reminder that revoke lives in plan.service.

- [ ] **Step 4: Cron**

```ts
// src/jobs/legacyTransferJob.ts
import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { runLegacyTick } from '../services/legacy/runner.service.js';
import { flushOutbox } from '../services/legacy/outbox.service.js';

let running = false;

async function tick(): Promise<void> {
  if (running) { logger.warn('[legacy.cron] previous tick still running — skipping'); return; }
  running = true;
  try {
    logger.info({ out: await runLegacyTick() }, '[legacy.cron] tick done');
  } catch (err) {
    // Cron entrypoint: nothing upstream to rethrow to; tomorrow's tick retries.
    logger.error({ err }, '[legacy.cron] tick failed');
  } finally { running = false; }
}

async function retryOutbox(): Promise<void> {
  try { await flushOutbox(); } catch (err) {
    // Cron entrypoint: the next hourly run retries.
    logger.error({ err }, '[legacy.cron] outbox flush failed');
  }
}

/** Daily state tick 10:00 IST; hourly outbox retry at :20. Set ENABLE_LEGACY_CRON=false in test/CI. */
export function startLegacyTransferJob(): void {
  if (process.env.ENABLE_LEGACY_CRON === 'false') return;
  cron.schedule('0 10 * * *', () => void tick(), { timezone: 'Asia/Kolkata' });
  cron.schedule('20 * * * *', () => void retryOutbox(), { timezone: 'Asia/Kolkata' });
  logger.info('[legacy.cron] scheduled (daily 10:00 IST, outbox hourly :20)');
}
```

Wire it in `startupSync.ts` next to `startSplitDigestJobs();`, and add `ENABLE_LEGACY_CRON: 'false',` to `DEFAULTS` in `test/helpers/env.setup.ts`.

- [ ] **Step 5: Run tests.** `npx vitest run test/legacy/runner.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add portfolioos/packages/api/src/services/legacy/runner.service.ts portfolioos/packages/api/src/jobs/legacyTransferJob.ts portfolioos/packages/api/src/jobs/startupSync.ts portfolioos/packages/api/test/helpers/env.setup.ts portfolioos/packages/api/test/legacy/runner.test.ts
git commit -m "feat(legacy): daily runner applies state machine with outbox"
```

---

### Task 9: Owner plan service + public link actions

**Files:**
- Create: `portfolioos/packages/api/src/services/legacy/plan.service.ts`
- Create: `portfolioos/packages/api/src/services/legacy/publicLinks.service.ts`
- Create: `portfolioos/packages/api/src/schemas/legacy.schemas.ts`
- Test: `portfolioos/packages/api/test/legacy/plan.test.ts`

**Interfaces:**
- Consumes: Tasks 4–8.
- Produces (plan.service):
```ts
export async function getOverview(userId: string, entitled: boolean): Promise<LegacyOverviewDTO>;
export async function saveSettings(userId: string, input: LegacySettingsInput): Promise<void>;
export async function addNominee(userId: string, input: LegacyNomineeInput): Promise<LegacyNomineeDTO>;
export async function updateNominee(userId: string, nomineeId: string, input: LegacyNomineeInput): Promise<LegacyNomineeDTO>;
export async function removeNominee(userId: string, nomineeId: string): Promise<void>;
export async function activate(userId: string): Promise<void>;
export async function pause(userId: string, until: string /* YYYY-MM-DD */): Promise<void>;
export async function resume(userId: string): Promise<void>;
export async function deactivate(userId: string): Promise<void>; // → DRAFT, wipe tokens
export async function revoke(userId: string, nomineeId?: string): Promise<void>; // all, or one nominee
export async function notifyPlanChanged(userId: string): Promise<void>; // best-effort direct email
```
- Produces (publicLinks.service):
```ts
export async function imOk(token: string, now?: Date): Promise<{ ok: boolean }>;
export async function acknowledgeInvite(token: string, now?: Date): Promise<{ ownerName: string } | null>;
export async function peekVerify(token: string, now?: Date): Promise<{ ownerName: string } | null>;
export async function answerVerify(token: string, answer: 'CONFIRM' | 'FINE', now?: Date): Promise<{ ok: boolean }>;
```
- Produces (schemas): `legacySettingsSchema`, `legacyNomineeSchema`, `legacyPauseSchema`, `legacyStepUpVerifySchema`, `legacyOtpVerifySchema`, `legacyVerifyAnswerSchema`; types `LegacySettingsInput`, `LegacyNomineeInput`.

Rules:
- `saveSettings`: `inactivityDays` 30..3650; `scheduledFor` required when trigger ≠ INACTIVITY and must be after today; letter ≤ 20 000 chars, stored `encryptSecret`, `null` clears. Allowed in DRAFT/ARMED/PAUSED only (BadRequest otherwise: "Revoke or wait — the plan is in its countdown/released"). Changing inactivityDays on ARMED sets `clockResetAt=now`.
- `addNominee`/`updateNominee`: max 10 nominees; email unique within the plan (compare decrypted lower-case); only one `isVerifier` (setting it clears others); `documentIds` must all be the owner's `Document` ids; `categories` subset of `LEGACY_CATEGORIES`, min 1. Adding to a non-DRAFT plan enqueues `INVITE` (+INVITE token) and flushes. If the plan is RELEASED, a new nominee also gets `RELEASED_NOMINEE` + ACCESS token.
- `removeNominee`: deletes the row (cascades tokens/codes → kills access instantly).
- `activate`: needs ≥1 nominee; DRAFT → ARMED; `activatedAt=clockResetAt=now`; INVITE every unacknowledged nominee; audit `legacy_activated`.
- `pause`: from ARMED/WARNING_*/GRACE only; `until` ≤ today+180; → PAUSED, `stageEnteredAt=null`, IM_OK/VERIFY tokens deleted; if it was GRACE, `RESET_NOMINEE` to nominees.
- `revoke`: from RELEASED. All → `wipeNomineeAccess`, `REVOKED_NOMINEE` to each, then `status ARMED, releasedAt null, stageEnteredAt null, clockResetAt now, cycle+1`; audit `legacy_revoked`. One nominee → delete that nominee's ACCESS tokens + codes, `REVOKED_NOMINEE` to them; plan stays RELEASED.
- `imOk`: valid IM_OK token for the plan's **current cycle** → `touchActivity(owner, now)` with the throttle bypassed (direct update), and if status ∈ WARNING_*/GRACE → `resetPlan(tx, plan, now, status === 'GRACE')`; audit `legacy_im_ok`. Old-cycle tokens → `{ ok: true }` without effect (harmless).
- `answerVerify`: valid VERIFY token, plan in GRACE, same cycle, token not used → mark `usedAt`. CONFIRM → `releasePlan`. FINE → `resetPlan(…, notifyNominees=true)` + owner `VERIFIER_VOUCHED_OWNER` (D9 full reset). Audit `legacy_verifier_answer`. Otherwise `{ ok: false }`.

- [ ] **Step 1: Failing tests**

```ts
// test/legacy/plan.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { getOverview, saveSettings, addNominee, activate, pause, revoke, removeNominee } from '../../src/services/legacy/plan.service.js';
import { imOk, answerVerify } from '../../src/services/legacy/publicLinks.service.js';
import { createLinkToken, createNomineeSession, resolveNomineeSession } from '../../src/services/legacy/tokens.service.js';

const nominee = { name: 'Ravi', email: 'ravi@test.local', relationship: 'Brother', priority: 1, isVerifier: true,
  categories: ['INSURANCE' as const], documentIds: [], showAmounts: false };

describe('legacy plan service', () => {
  let s: TestScope;
  beforeEach(async () => { s = await createTestScope('legacy-plan'); });
  afterEach(async () => { await runAsSystem(() => prisma.legacyPlan.deleteMany({ where: { userId: s.userId } })); await s.cleanup(); });

  it('rejects inactivityDays below 30 and a past scheduled date', async () => {
    await expect(s.runAs(() => saveSettings(s.userId, { triggerMode: 'INACTIVITY', inactivityDays: 29, scheduledFor: null, letter: null }))).rejects.toThrow(/30/);
    await expect(s.runAs(() => saveSettings(s.userId, { triggerMode: 'SCHEDULED', inactivityDays: 90, scheduledFor: '2020-01-01', letter: null }))).rejects.toThrow(/future/);
  });

  it('activate needs a nominee, then arms and invites', async () => {
    await s.runAs(() => saveSettings(s.userId, { triggerMode: 'INACTIVITY', inactivityDays: 90, scheduledFor: null, letter: 'Locker #42' }));
    await expect(s.runAs(() => activate(s.userId))).rejects.toThrow(/nominee/i);
    await s.runAs(() => addNominee(s.userId, nominee));
    await s.runAs(() => activate(s.userId));
    const o = await s.runAs(() => getOverview(s.userId, true));
    expect(o.status).toBe('ARMED');
    expect(o.letter).toBe('Locker #42');
    expect(o.nominees[0]!.email).toBe('ravi@test.local');
    expect(await runAsSystem(() => prisma.legacyOutbox.count({ where: { kind: 'INVITE', userId: s.userId } }))).toBe(1);
  });

  it('only one verifier; duplicate email rejected', async () => {
    await s.runAs(() => addNominee(s.userId, nominee));
    await expect(s.runAs(() => addNominee(s.userId, { ...nominee, name: 'Dup' }))).rejects.toThrow(/already/i);
    await s.runAs(() => addNominee(s.userId, { ...nominee, email: 'b@test.local', name: 'B' }));
    const o = await s.runAs(() => getOverview(s.userId, true));
    expect(o.nominees.filter((n) => n.isVerifier)).toHaveLength(1);
    expect(o.nominees.find((n) => n.isVerifier)!.name).toBe('B');
  });

  it('pause is capped at 180 days', async () => {
    await s.runAs(() => addNominee(s.userId, nominee));
    await s.runAs(() => activate(s.userId));
    const far = new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10);
    await expect(s.runAs(() => pause(s.userId, far))).rejects.toThrow(/180/);
  });

  it("I'm OK in WARNING_1 resets to ARMED with a new cycle", async () => {
    await s.runAs(() => addNominee(s.userId, nominee));
    await s.runAs(() => activate(s.userId));
    const plan = await runAsSystem(() => prisma.legacyPlan.update({ where: { userId: s.userId }, data: { status: 'WARNING_1', stageEnteredAt: new Date() } }));
    const token = await runAsSystem(() => prisma.$transaction((tx) => createLinkToken(tx, { planId: plan.id, userId: s.userId, nomineeId: null, purpose: 'IM_OK', cycle: plan.cycle, now: new Date() })));
    expect(await imOk(token)).toEqual({ ok: true });
    const after = await runAsSystem(() => prisma.legacyPlan.findUniqueOrThrow({ where: { id: plan.id } }));
    expect(after.status).toBe('ARMED');
    expect(after.cycle).toBe(plan.cycle + 1);
  });

  it('verifier FINE fully resets; CONFIRM releases', async () => {
    const n = await s.runAs(() => addNominee(s.userId, nominee));
    await s.runAs(() => activate(s.userId));
    const mk = async () => {
      const p = await runAsSystem(() => prisma.legacyPlan.update({ where: { userId: s.userId }, data: { status: 'GRACE', stageEnteredAt: new Date() } }));
      return runAsSystem(() => prisma.$transaction((tx) => createLinkToken(tx, { planId: p.id, userId: s.userId, nomineeId: n.id, purpose: 'VERIFY', cycle: p.cycle, now: new Date() })));
    };
    expect(await answerVerify(await mk(), 'FINE')).toEqual({ ok: true });
    expect((await s.runAs(() => getOverview(s.userId, true))).status).toBe('ARMED');
    expect(await answerVerify(await mk(), 'CONFIRM')).toEqual({ ok: true });
    expect((await s.runAs(() => getOverview(s.userId, true))).status).toBe('RELEASED');
  });

  it('revoke invalidates an open session; removing a nominee does too', async () => {
    const n = await s.runAs(() => addNominee(s.userId, nominee));
    await s.runAs(() => activate(s.userId));
    await runAsSystem(() => prisma.legacyPlan.update({ where: { userId: s.userId }, data: { status: 'RELEASED', releasedAt: new Date() } }));
    const sess = await createNomineeSession(n.id, s.userId);
    expect(await resolveNomineeSession(sess)).not.toBeNull();
    await s.runAs(() => revoke(s.userId));
    expect(await resolveNomineeSession(sess)).toBeNull();
    expect((await s.runAs(() => getOverview(s.userId, true))).status).toBe('ARMED');
    const sess2 = await createNomineeSession(n.id, s.userId);
    await s.runAs(() => removeNominee(s.userId, n.id));
    expect(await resolveNomineeSession(sess2)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Schemas**

```ts
// src/schemas/legacy.schemas.ts
import { z } from 'zod';
import { LEGACY_CATEGORIES, LEGACY_MAX_INACTIVITY_DAYS, LEGACY_MIN_INACTIVITY_DAYS } from '@everypaisa/shared';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const legacySettingsSchema = z.object({
  triggerMode: z.enum(['INACTIVITY', 'SCHEDULED', 'BOTH']),
  inactivityDays: z.number().int()
    .min(LEGACY_MIN_INACTIVITY_DAYS, `Inactivity period must be at least ${LEGACY_MIN_INACTIVITY_DAYS} days`)
    .max(LEGACY_MAX_INACTIVITY_DAYS),
  scheduledFor: isoDate.nullable(),
  letter: z.string().max(20_000).nullable(),
});
export type LegacySettingsInput = z.infer<typeof legacySettingsSchema>;

export const legacyNomineeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  relationship: z.string().trim().min(1).max(60),
  priority: z.number().int().min(1).max(20),
  isVerifier: z.boolean(),
  categories: z.array(z.enum(LEGACY_CATEGORIES)).min(1, 'Pick at least one category'),
  documentIds: z.array(z.string().min(1)).max(50),
  showAmounts: z.boolean(),
});
export type LegacyNomineeInput = z.infer<typeof legacyNomineeSchema>;

export const legacyPauseSchema = z.object({ until: isoDate });
export const legacyStepUpVerifySchema = z.object({ code: z.string().trim().min(6).max(20) });
export const legacyOtpVerifySchema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });
export const legacyVerifyAnswerSchema = z.object({ answer: z.enum(['CONFIRM', 'FINE']) });
```

- [ ] **Step 4: plan.service**

```ts
// src/services/legacy/plan.service.ts
import type { LegacyNominee, LegacyPlan } from '@prisma/client';
import {
  LEGACY_MAX_PAUSE_DAYS, type LegacyCategory, type LegacyNomineeDTO, type LegacyOverviewDTO,
} from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { encryptSecret, decryptSecret } from '../../lib/secrets.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { sendEmail } from '../notifications/email.service.js';
import { legacySettingsSchema, legacyNomineeSchema, type LegacyNomineeInput, type LegacySettingsInput } from '../../schemas/legacy.schemas.js';
import { nextEventText } from './stateMachine.js';
import { createLinkToken, wipeNomineeAccess } from './tokens.service.js';
import { enqueue, flushOutbox } from './outbox.service.js';
import { renderPlanChangedEmail } from './emails.js';

const MAX_NOMINEES = 10;
const DAY = 86_400_000;
const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const todayIso = () => new Date().toISOString().slice(0, 10);

/** Plan rows are user-scoped; the owner's own context reads them. Creates the DRAFT row on first touch. */
async function ensurePlan(userId: string): Promise<LegacyPlan> {
  return prisma.legacyPlan.upsert({ where: { userId }, update: {}, create: { userId } });
}

function toNomineeDTO(n: LegacyNominee): LegacyNomineeDTO {
  return {
    id: n.id, name: decryptSecret(n.nameEnc), email: decryptSecret(n.emailEnc), relationship: n.relationship,
    priority: n.priority, isVerifier: n.isVerifier, categories: n.categories as LegacyCategory[],
    documentIds: n.documentIds, showAmounts: n.showAmounts, acknowledgedAt: n.acknowledgedAt?.toISOString() ?? null,
  };
}

export async function getOverview(userId: string, entitled: boolean): Promise<LegacyOverviewDTO> {
  const plan = await ensurePlan(userId);
  const nominees = await prisma.legacyNominee.findMany({ where: { planId: plan.id }, orderBy: { priority: 'asc' } });
  const user = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { lastActiveAt: true } }));
  const clock = { ...plan, lastActiveAt: user.lastActiveAt };
  return {
    status: plan.status, triggerMode: plan.triggerMode, inactivityDays: plan.inactivityDays,
    scheduledFor: dateOnly(plan.scheduledFor), pausedUntil: dateOnly(plan.pausedUntil),
    hasLetter: plan.letterEnc !== null, letter: plan.letterEnc ? decryptSecret(plan.letterEnc) : null,
    activatedAt: plan.activatedAt?.toISOString() ?? null, releasedAt: plan.releasedAt?.toISOString() ?? null,
    lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
    nextEvent: nextEventText(clock, new Date()),
    nominees: nominees.map(toNomineeDTO), entitled,
  };
}

const EDITABLE: ReadonlySet<LegacyPlan['status']> = new Set(['DRAFT', 'ARMED', 'PAUSED']);

export async function saveSettings(userId: string, raw: LegacySettingsInput): Promise<void> {
  const input = legacySettingsSchema.parse(raw);
  if (input.triggerMode !== 'INACTIVITY') {
    if (!input.scheduledFor) throw new BadRequestError('Pick a release date.');
    if (input.scheduledFor <= todayIso()) throw new BadRequestError('The release date must be in the future.');
  }
  const plan = await ensurePlan(userId);
  if (!EDITABLE.has(plan.status)) throw new BadRequestError('The plan is counting down or released. Reset or revoke it first.');
  await prisma.legacyPlan.update({
    where: { id: plan.id },
    data: {
      triggerMode: input.triggerMode,
      inactivityDays: input.inactivityDays,
      scheduledFor: input.triggerMode === 'INACTIVITY' ? null : new Date(`${input.scheduledFor}T00:00:00Z`),
      letterEnc: input.letter ? encryptSecret(input.letter) : null,
      ...(plan.status === 'ARMED' && plan.inactivityDays !== input.inactivityDays ? { clockResetAt: new Date() } : {}),
    },
  });
  await writeAuditLog({ userId, action: 'legacy_changed', resource: `LegacyPlan:${plan.id}`, metadata: { what: 'settings' } });
}

async function validateNominee(userId: string, planId: string, input: LegacyNomineeInput, selfId?: string): Promise<void> {
  const others = await prisma.legacyNominee.findMany({ where: { planId, ...(selfId ? { id: { not: selfId } } : {}) } });
  if (!selfId && others.length >= MAX_NOMINEES) throw new BadRequestError(`You can add up to ${MAX_NOMINEES} nominees.`);
  if (others.some((n) => decryptSecret(n.emailEnc).toLowerCase() === input.email)) {
    throw new BadRequestError('This email is already a nominee.');
  }
  if (input.documentIds.length > 0) {
    const owned = await prisma.document.count({ where: { userId, id: { in: input.documentIds } } });
    if (owned !== new Set(input.documentIds).size) throw new BadRequestError('One of the documents was not found.');
  }
}

async function inviteIfLive(planId: string, nomineeId: string): Promise<void> {
  await runAsSystem(() => prisma.$transaction(async (tx) => {
    const plan = await tx.legacyPlan.findUniqueOrThrow({ where: { id: planId } });
    if (plan.status === 'DRAFT') return;
    const now = new Date();
    const inv = await createLinkToken(tx, { planId, userId: plan.userId, nomineeId, purpose: 'INVITE', cycle: plan.cycle, now });
    await enqueue(tx, { planId, userId: plan.userId, kind: 'INVITE', cycle: plan.cycle, recipientKey: nomineeId, token: inv });
    if (plan.status === 'RELEASED') {
      const acc = await createLinkToken(tx, { planId, userId: plan.userId, nomineeId, purpose: 'ACCESS', cycle: plan.cycle, now });
      await enqueue(tx, { planId, userId: plan.userId, kind: 'RELEASED_NOMINEE', cycle: plan.cycle, recipientKey: nomineeId, token: acc });
    }
  }));
  await flushOutbox();
}

export async function addNominee(userId: string, raw: LegacyNomineeInput): Promise<LegacyNomineeDTO> {
  const input = legacyNomineeSchema.parse(raw);
  const plan = await ensurePlan(userId);
  await validateNominee(userId, plan.id, input);
  if (input.isVerifier) await prisma.legacyNominee.updateMany({ where: { planId: plan.id }, data: { isVerifier: false } });
  const n = await prisma.legacyNominee.create({ data: {
    planId: plan.id, userId, nameEnc: encryptSecret(input.name), emailEnc: encryptSecret(input.email),
    relationship: input.relationship, priority: input.priority, isVerifier: input.isVerifier,
    categories: input.categories, documentIds: input.documentIds, showAmounts: input.showAmounts,
  } });
  await inviteIfLive(plan.id, n.id);
  await writeAuditLog({ userId, action: 'legacy_changed', resource: `LegacyNominee:${n.id}`, metadata: { what: 'nominee_added' } });
  return toNomineeDTO(n);
}

export async function updateNominee(userId: string, nomineeId: string, raw: LegacyNomineeInput): Promise<LegacyNomineeDTO> {
  const input = legacyNomineeSchema.parse(raw);
  const plan = await ensurePlan(userId);
  const existing = await prisma.legacyNominee.findFirst({ where: { id: nomineeId, planId: plan.id } });
  if (!existing) throw new NotFoundError('Nominee not found');
  await validateNominee(userId, plan.id, input, nomineeId);
  if (input.isVerifier) await prisma.legacyNominee.updateMany({ where: { planId: plan.id, id: { not: nomineeId } }, data: { isVerifier: false } });
  const emailChanged = decryptSecret(existing.emailEnc).toLowerCase() !== input.email;
  const n = await prisma.legacyNominee.update({ where: { id: nomineeId }, data: {
    nameEnc: encryptSecret(input.name), emailEnc: encryptSecret(input.email), relationship: input.relationship,
    priority: input.priority, isVerifier: input.isVerifier, categories: input.categories,
    documentIds: input.documentIds, showAmounts: input.showAmounts,
    ...(emailChanged ? { acknowledgedAt: null } : {}),
  } });
  if (emailChanged) {
    // A new address must not inherit links sent to the old one.
    await prisma.legacyToken.deleteMany({ where: { nomineeId } });
    await prisma.legacyCode.deleteMany({ where: { nomineeId } });
    await runAsSystem(() => prisma.legacyOutbox.deleteMany({ where: { planId: plan.id, recipientKey: nomineeId } }));
    await inviteIfLive(plan.id, nomineeId);
  }
  await writeAuditLog({ userId, action: 'legacy_changed', resource: `LegacyNominee:${nomineeId}`, metadata: { what: 'nominee_updated' } });
  return toNomineeDTO(n);
}

export async function removeNominee(userId: string, nomineeId: string): Promise<void> {
  const plan = await ensurePlan(userId);
  const res = await prisma.legacyNominee.deleteMany({ where: { id: nomineeId, planId: plan.id } });
  if (res.count === 0) throw new NotFoundError('Nominee not found');
  await writeAuditLog({ userId, action: 'legacy_changed', resource: `LegacyNominee:${nomineeId}`, metadata: { what: 'nominee_removed' } });
}

export async function activate(userId: string): Promise<void> {
  const plan = await ensurePlan(userId);
  if (plan.status !== 'DRAFT') throw new BadRequestError('The plan is already on.');
  const nominees = await prisma.legacyNominee.findMany({ where: { planId: plan.id } });
  if (nominees.length === 0) throw new BadRequestError('Add at least one nominee first.');
  if (plan.triggerMode !== 'INACTIVITY' && (!plan.scheduledFor || dateOnly(plan.scheduledFor)! <= todayIso())) {
    throw new BadRequestError('Pick a future release date first.');
  }
  const now = new Date();
  await prisma.legacyPlan.update({ where: { id: plan.id }, data: { status: 'ARMED', activatedAt: now, clockResetAt: now } });
  for (const n of nominees.filter((x) => !x.acknowledgedAt)) await inviteIfLive(plan.id, n.id);
  await writeAuditLog({ userId, action: 'legacy_activated', resource: `LegacyPlan:${plan.id}` });
}

export async function pause(userId: string, until: string): Promise<void> {
  const plan = await ensurePlan(userId);
  if (!['ARMED', 'WARNING_1', 'WARNING_2', 'FINAL_WARNING', 'GRACE'].includes(plan.status)) {
    throw new BadRequestError('Only an active plan can be paused.');
  }
  const max = new Date(Date.now() + LEGACY_MAX_PAUSE_DAYS * DAY).toISOString().slice(0, 10);
  if (until <= todayIso() || until > max) throw new BadRequestError(`Pause for up to ${LEGACY_MAX_PAUSE_DAYS} days.`);
  const wasGrace = plan.status === 'GRACE';
  await runAsSystem(() => prisma.$transaction(async (tx) => {
    const p = await tx.legacyPlan.update({ where: { id: plan.id }, data: {
      status: 'PAUSED', pausedUntil: new Date(`${until}T00:00:00Z`), stageEnteredAt: null, cycle: { increment: 1 },
    } });
    await tx.legacyToken.deleteMany({ where: { planId: plan.id, purpose: { in: ['IM_OK', 'VERIFY'] } } });
    if (wasGrace) {
      for (const n of await tx.legacyNominee.findMany({ where: { planId: plan.id } })) {
        await enqueue(tx, { planId: plan.id, userId, kind: 'RESET_NOMINEE', cycle: p.cycle, recipientKey: n.id });
      }
    }
  }));
  if (wasGrace) await flushOutbox();
  await writeAuditLog({ userId, action: 'legacy_changed', resource: `LegacyPlan:${plan.id}`, metadata: { what: 'paused', until } });
}

export async function resume(userId: string): Promise<void> {
  const plan = await ensurePlan(userId);
  if (plan.status !== 'PAUSED') throw new BadRequestError('The plan is not paused.');
  await prisma.legacyPlan.update({ where: { id: plan.id }, data: { status: 'ARMED', pausedUntil: null, clockResetAt: new Date(), cycle: { increment: 1 } } });
  await writeAuditLog({ userId, action: 'legacy_changed', resource: `LegacyPlan:${plan.id}`, metadata: { what: 'resumed' } });
}

export async function deactivate(userId: string): Promise<void> {
  const plan = await ensurePlan(userId);
  await runAsSystem(() => prisma.$transaction(async (tx) => {
    await wipeNomineeAccess(tx, plan.id);
    await tx.legacyToken.deleteMany({ where: { planId: plan.id } });
    await tx.legacyPlan.update({ where: { id: plan.id }, data: {
      status: 'DRAFT', stageEnteredAt: null, releasedAt: null, pausedUntil: null, cycle: { increment: 1 },
    } });
  }));
  await writeAuditLog({ userId, action: 'legacy_changed', resource: `LegacyPlan:${plan.id}`, metadata: { what: 'deactivated' } });
}

export async function revoke(userId: string, nomineeId?: string): Promise<void> {
  const plan = await ensurePlan(userId);
  if (plan.status !== 'RELEASED') throw new BadRequestError('Nothing has been shared yet.');
  await runAsSystem(() => prisma.$transaction(async (tx) => {
    const targets = await tx.legacyNominee.findMany({ where: { planId: plan.id, ...(nomineeId ? { id: nomineeId } : {}) } });
    if (nomineeId && targets.length === 0) throw new NotFoundError('Nominee not found');
    let cycle = plan.cycle;
    if (nomineeId) {
      await tx.legacyToken.deleteMany({ where: { nomineeId, purpose: 'ACCESS' } });
      await tx.legacyCode.deleteMany({ where: { nomineeId } });
    } else {
      await wipeNomineeAccess(tx, plan.id);
      const p = await tx.legacyPlan.update({ where: { id: plan.id }, data: {
        status: 'ARMED', releasedAt: null, stageEnteredAt: null, clockResetAt: new Date(), cycle: { increment: 1 },
      } });
      cycle = p.cycle;
    }
    for (const n of targets) await enqueue(tx, { planId: plan.id, userId, kind: 'REVOKED_NOMINEE', cycle, recipientKey: n.id });
  }));
  await flushOutbox();
  await writeAuditLog({ userId, action: 'legacy_revoked', resource: `LegacyPlan:${plan.id}`, metadata: { nomineeId: nomineeId ?? 'all' } });
}

export async function notifyPlanChanged(userId: string): Promise<void> {
  try {
    const u = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } }));
    const res = await sendEmail({ to: u.email, ...renderPlanChangedEmail(u.name, env.FRONTEND_URL) });
    if (!res.sent) logger.warn({ userId, reason: res.reason }, '[legacy] plan-changed email not sent');
  } catch (err) {
    // Best-effort security notice: the change itself already succeeded and is audited.
    logger.error({ userId, err: err instanceof Error ? err.message : String(err) }, '[legacy] plan-changed email failed');
  }
}
```

- [ ] **Step 5: publicLinks.service**

```ts
// src/services/legacy/publicLinks.service.ts
import { prisma } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { writeAuditLog } from '../../lib/audit.js';
import { resolveLinkToken } from './tokens.service.js';
import { resetPlan, releasePlan } from './runner.service.js';
import { enqueue, flushOutbox } from './outbox.service.js';

const COUNTDOWN = new Set(['WARNING_1', 'WARNING_2', 'FINAL_WARNING', 'GRACE']);

export async function imOk(token: string, now: Date = new Date()): Promise<{ ok: boolean }> {
  const t = await resolveLinkToken(token, 'IM_OK', now);
  if (!t) return { ok: false };
  await runAsSystem(() => prisma.user.update({ where: { id: t.userId }, data: { lastActiveAt: now } }));
  if (t.cycle === t.plan.cycle && COUNTDOWN.has(t.plan.status)) {
    const fromGrace = t.plan.status === 'GRACE';
    await runAsSystem(() => prisma.$transaction((tx) => resetPlan(tx, t.plan, now, fromGrace)));
    if (fromGrace) await flushOutbox();
  }
  await writeAuditLog({ userId: t.userId, action: 'legacy_im_ok', resource: `LegacyPlan:${t.planId}` });
  return { ok: true };
}

export async function acknowledgeInvite(token: string, now: Date = new Date()): Promise<{ ownerName: string } | null> {
  const t = await resolveLinkToken(token, 'INVITE', now);
  if (!t || !t.nomineeId) return null;
  await runAsSystem(() => prisma.legacyNominee.update({ where: { id: t.nomineeId! }, data: { acknowledgedAt: now } }));
  const owner = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: t.userId }, select: { name: true } }));
  return { ownerName: owner.name };
}

export async function peekVerify(token: string, now: Date = new Date()): Promise<{ ownerName: string } | null> {
  const t = await resolveLinkToken(token, 'VERIFY', now);
  if (!t || t.usedAt || t.plan.status !== 'GRACE' || t.cycle !== t.plan.cycle) return null;
  const owner = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: t.userId }, select: { name: true } }));
  return { ownerName: owner.name };
}

export async function answerVerify(token: string, answer: 'CONFIRM' | 'FINE', now: Date = new Date()): Promise<{ ok: boolean }> {
  const t = await resolveLinkToken(token, 'VERIFY', now);
  if (!t || t.usedAt || t.plan.status !== 'GRACE' || t.cycle !== t.plan.cycle) return { ok: false };
  await runAsSystem(() => prisma.$transaction(async (tx) => {
    await tx.legacyToken.update({ where: { id: t.id }, data: { usedAt: now } });
    if (answer === 'CONFIRM') {
      await releasePlan(tx, t.plan, now);
    } else {
      await resetPlan(tx, t.plan, now, true);
      await enqueue(tx, { planId: t.planId, userId: t.userId, kind: 'VERIFIER_VOUCHED_OWNER', cycle: t.plan.cycle + 1, recipientKey: 'owner' });
    }
  }));
  await flushOutbox();
  await writeAuditLog({ userId: t.userId, action: 'legacy_verifier_answer', resource: `LegacyPlan:${t.planId}`, metadata: { answer } });
  if (answer === 'CONFIRM') await writeAuditLog({ userId: t.userId, action: 'legacy_released', resource: `LegacyPlan:${t.planId}`, metadata: { by: 'verifier' } });
  return { ok: true };
}
```

- [ ] **Step 6: Run tests.** `npx vitest run test/legacy/plan.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add portfolioos/packages/api/src/services/legacy/plan.service.ts portfolioos/packages/api/src/services/legacy/publicLinks.service.ts portfolioos/packages/api/src/schemas/legacy.schemas.ts portfolioos/packages/api/test/legacy/plan.test.ts
git commit -m "feat(legacy): owner plan service and public link actions"
```

---

### Task 10: Nominee Legacy View + PDF

**Files:**
- Create: `portfolioos/packages/api/src/services/legacy/view.service.ts`
- Create: `portfolioos/packages/api/src/services/legacy/viewPdf.ts`
- Test: `portfolioos/packages/api/test/legacy/view.test.ts`

**Interfaces:**
- Consumes: `LegacyViewDTO` etc. (Task 1); `runAsUser` (`src/lib/requestContext.ts`); `Decimal` from `@everypaisa/shared`.
- Produces:
```ts
export async function buildLegacyView(ownerId: string, nomineeId: string): Promise<LegacyViewDTO>; // throws NotFoundError if plan not RELEASED or nominee gone
export async function loadViewDocument(ownerId: string, nomineeId: string, documentId: string): Promise<{ fileName: string; mimeType: string; bytes: Buffer }>;
export function renderLegacyPdf(view: LegacyViewDTO): Promise<Buffer>;
```

Reads run under `runAsUser(ownerId, …)`. The owner's RLS applies and the code paths are `findMany`/`findUnique` only. Category → source:
| Category | Source (filter) | label / sublabel / last4 / nominee / amount |
|---|---|---|
| INVESTMENTS | `HoldingProjection` where `portfolio.userId = owner`, `quantity > 0` | assetName / assetClass / – / – / currentValue ?? totalCost |
| BANK_ACCOUNTS | `BankAccount` status ≠ `CLOSED` | `bankName` / accountType · branch / last4 / nomineeName / currentBalance |
| INSURANCE | `InsurancePolicy` status `ACTIVE` | `insurer planName` / type / policyNumberLast4 / nominees JSON names / sumAssured |
| LIABILITIES | `Loan` status `ACTIVE` + `CreditCard` status `ACTIVE` | lender loanType / "EMI on day n" / accountNumberLast4 / – / emiAmount; issuer cardName / network / last4 / – / outstandingBalance |
| PROPERTY | `OwnedProperty` status ≠ `SOLD` | name / city · ownershipType / – / – / currentValue |
| VEHICLES | `Vehicle` | make model / fuelType / registrationNoLast4 / – / currentValue |
| RETIREMENT | `ProvidentFundAccount` | `${type} · ${institution}` / holderName / identifierLast4 / – / currentBalance |
| DOCUMENTS | `Document` where `id in nominee.documentIds` | (goes to `documents`, not a section) |
| LETTER | `plan.letterEnc` decrypted | (goes to `letter`) |

`netWorth` = sum of section amounts for assets minus LIABILITIES loan principal outstanding is out of scope; v1 = **sum of asset sections only** (INVESTMENTS, BANK_ACCOUNTS, PROPERTY, VEHICLES, RETIREMENT), labelled "Total of listed assets" in the UI. When `showAmounts` is false, every `amount` is `null` and `netWorth` is `null`.

- [ ] **Step 1: Failing test**

```ts
// test/legacy/view.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { encryptSecret } from '../../src/lib/secrets.js';
import { buildLegacyView, renderLegacyPdf } from '../../src/services/legacy/view.service.js';

describe('buildLegacyView', () => {
  let s: TestScope; let planId: string; let full: string; let blind: string;
  beforeAll(async () => {
    s = await createTestScope('legacy-view');
    planId = (await runAsSystem(() => prisma.legacyPlan.create({ data: {
      userId: s.userId, status: 'RELEASED', releasedAt: new Date(), letterEnc: encryptSecret('Locker #42'),
    } }))).id;
    await runAsSystem(() => prisma.insurancePolicy.create({ data: {
      userId: s.userId, insurer: 'LIC', type: 'TERM', policyHolder: 'Asha', sumAssured: '10000000', premiumAmount: '12000',
      premiumFrequency: 'ANNUAL', startDate: new Date('2020-01-01'), policyNumberLast4: '4321',
    } }));
    await runAsSystem(() => prisma.bankAccount.create({ data: {
      userId: s.userId, bankName: 'HDFC Bank', accountType: 'SAVINGS', accountHolder: 'Asha', last4: '9876', currentBalance: '250000.50',
      nomineeName: 'Ravi',
    } }));
    const mk = (email: string, showAmounts: boolean, categories: string[]) => runAsSystem(() => prisma.legacyNominee.create({ data: {
      planId, userId: s.userId, nameEnc: encryptSecret('N'), emailEnc: encryptSecret(email), relationship: 'Spouse', priority: 1,
      categories, showAmounts,
    } })).then((n) => n.id);
    full = await mk('full@test.local', true, ['INSURANCE', 'BANK_ACCOUNTS', 'LETTER']);
    blind = await mk('blind@test.local', false, ['INSURANCE', 'BANK_ACCOUNTS']);
  });
  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.legacyPlan.deleteMany({ where: { userId: s.userId } });
      await prisma.insurancePolicy.deleteMany({ where: { userId: s.userId } });
      await prisma.bankAccount.deleteMany({ where: { userId: s.userId } });
    });
    await s.cleanup();
  });

  it('full nominee sees amounts, last4 and the letter', async () => {
    const v = await buildLegacyView(s.userId, full);
    const bank = v.sections.find((x) => x.category === 'BANK_ACCOUNTS')!;
    expect(bank.items[0]).toMatchObject({ label: 'HDFC Bank', identifierLast4: '9876', nominee: 'Ravi', amount: '250000.5' });
    expect(v.letter).toBe('Locker #42');
    expect(v.netWorth).toBe('250000.5');
  });

  it('showAmounts=false strips every amount and net worth', async () => {
    const v = await buildLegacyView(s.userId, blind);
    expect(v.netWorth).toBeNull();
    for (const sec of v.sections) for (const it of sec.items) expect(it.amount).toBeNull();
    expect(JSON.stringify(v)).not.toContain('250000');
    expect(JSON.stringify(v)).not.toContain('10000000');
  });

  it('out-of-scope categories are absent', async () => {
    const v = await buildLegacyView(s.userId, blind);
    expect(v.sections.map((x) => x.category).sort()).toEqual(['BANK_ACCOUNTS', 'INSURANCE']);
    expect(v.letter).toBeNull();
  });

  it('refuses when the plan is not released', async () => {
    await runAsSystem(() => prisma.legacyPlan.update({ where: { id: planId }, data: { status: 'ARMED' } }));
    await expect(buildLegacyView(s.userId, full)).rejects.toThrow();
    await runAsSystem(() => prisma.legacyPlan.update({ where: { id: planId }, data: { status: 'RELEASED' } }));
  });

  it('renders a PDF', async () => {
    const pdf = await renderLegacyPdf(await buildLegacyView(s.userId, full));
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
```

> Required fields on `InsurancePolicy`/`BankAccount` may differ slightly; if `create` fails on a missing required column, add it with a dummy value (check `schema.prisma`).

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement view.service**

```ts
// src/services/legacy/view.service.ts
import {
  Decimal, LEGACY_CATEGORY_LABELS, LEGACY_CLAIM_CHECKLIST,
  type LegacyCategory, type LegacyItemDTO, type LegacySectionDTO, type LegacyViewDTO,
} from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { runAsSystem, runAsUser } from '../../lib/requestContext.js';
import { decryptSecret } from '../../lib/secrets.js';
import { NotFoundError } from '../../lib/errors.js';
import { readBuffer } from '../../lib/documentStorage.js';

type Amt = { toString(): string } | null | undefined;
const SUMMED: ReadonlySet<LegacyCategory> = new Set(['INVESTMENTS', 'BANK_ACCOUNTS', 'PROPERTY', 'VEHICLES', 'RETIREMENT']);

function item(label: string, o: Partial<Omit<LegacyItemDTO, 'label' | 'amount'>> & { amount?: Amt }): LegacyItemDTO & { _amt: Amt } {
  return {
    label, sublabel: o.sublabel ?? null, identifierLast4: o.identifierLast4 ?? null, nominee: o.nominee ?? null,
    amount: null, notes: o.notes ?? [], _amt: o.amount ?? null,
  };
}

function nomineeNames(json: unknown): string | null {
  if (!Array.isArray(json)) return null;
  const names = json.map((x) => (x && typeof x === 'object' && 'name' in x ? String((x as { name: unknown }).name) : null)).filter(Boolean);
  return names.length ? names.join(', ') : null;
}

async function loadCategory(ownerId: string, c: LegacyCategory) {
  switch (c) {
    case 'INVESTMENTS': {
      const rows = await prisma.holdingProjection.findMany({ where: { portfolio: { userId: ownerId }, quantity: { gt: 0 } }, orderBy: { assetClass: 'asc' } });
      return rows.map((h) => item(h.assetName ?? h.isin ?? 'Holding', { sublabel: h.assetClass, amount: h.currentValue ?? h.totalCost }));
    }
    case 'BANK_ACCOUNTS': {
      const rows = await prisma.bankAccount.findMany({ where: { userId: ownerId, status: { not: 'CLOSED' } } });
      return rows.map((b) => item(b.bankName, {
        sublabel: [b.accountType, b.branch].filter(Boolean).join(' · ') || null, identifierLast4: b.last4,
        nominee: b.nomineeName, amount: b.currentBalance, notes: b.ifsc ? [`IFSC ${b.ifsc}`] : [],
      }));
    }
    case 'INSURANCE': {
      const rows = await prisma.insurancePolicy.findMany({ where: { userId: ownerId, status: 'ACTIVE' } });
      return rows.map((p) => item([p.insurer, p.planName].filter(Boolean).join(' '), {
        sublabel: p.type, identifierLast4: p.policyNumberLast4, nominee: nomineeNames(p.nominees), amount: p.sumAssured,
      }));
    }
    case 'LIABILITIES': {
      const loans = await prisma.loan.findMany({ where: { userId: ownerId, status: 'ACTIVE' } });
      const cards = await prisma.creditCard.findMany({ where: { userId: ownerId, status: 'ACTIVE' } });
      return [
        ...loans.map((l) => item(`${l.lenderName} ${l.loanType}`, {
          sublabel: `EMI on day ${l.emiDueDay}`, identifierLast4: l.accountNumberLast4, amount: l.emiAmount, notes: ['Action needed: inform the lender'],
        })),
        ...cards.map((k) => item(`${k.issuerBank} ${k.cardName}`, {
          sublabel: k.network, identifierLast4: k.last4, amount: k.outstandingBalance, notes: ['Action needed: block the card'],
        })),
      ];
    }
    case 'PROPERTY': {
      const rows = await prisma.ownedProperty.findMany({ where: { userId: ownerId, status: { not: 'SOLD' } } });
      return rows.map((p) => item(p.name, { sublabel: [p.city, p.ownershipType].filter(Boolean).join(' · ') || null, amount: p.currentValue }));
    }
    case 'VEHICLES': {
      const rows = await prisma.vehicle.findMany({ where: { userId: ownerId } });
      return rows.map((v) => item([v.make, v.model].filter(Boolean).join(' ') || 'Vehicle', {
        sublabel: v.fuelType, identifierLast4: v.registrationNoLast4, amount: v.currentValue,
      }));
    }
    case 'RETIREMENT': {
      const rows = await prisma.providentFundAccount.findMany({ where: { userId: ownerId } });
      return rows.map((r) => item(`${r.type} · ${r.institution}`, { sublabel: r.holderName, identifierLast4: r.identifierLast4, amount: r.currentBalance }));
    }
    case 'DOCUMENTS': case 'LETTER':
      return [];
  }
}

async function loadReleased(ownerId: string, nomineeId: string) {
  const plan = await runAsSystem(() => prisma.legacyPlan.findUnique({ where: { userId: ownerId } }));
  const nominee = await runAsSystem(() => prisma.legacyNominee.findUnique({ where: { id: nomineeId } }));
  if (!plan || plan.status !== 'RELEASED' || !nominee || nominee.planId !== plan.id) throw new NotFoundError('Nothing is shared with you right now.');
  return { plan, nominee };
}

export async function buildLegacyView(ownerId: string, nomineeId: string): Promise<LegacyViewDTO> {
  const { plan, nominee } = await loadReleased(ownerId, nomineeId);
  const cats = nominee.categories as LegacyCategory[];
  const owner = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { name: true } }));
  let total = new Decimal(0);
  const sections: LegacySectionDTO[] = [];
  await runAsUser(ownerId, async () => {
    for (const c of cats) {
      if (c === 'DOCUMENTS' || c === 'LETTER') continue;
      const rows = await loadCategory(ownerId, c);
      const items = rows.map(({ _amt, ...it }) => {
        if (nominee.showAmounts && _amt != null) {
          const d = new Decimal(_amt.toString());
          if (SUMMED.has(c)) total = total.plus(d);
          return { ...it, amount: d.toString() };
        }
        return it;
      });
      sections.push({ category: c, title: LEGACY_CATEGORY_LABELS[c], items, checklist: LEGACY_CLAIM_CHECKLIST[c] });
    }
  });
  const documents = cats.includes('DOCUMENTS') && nominee.documentIds.length
    ? await runAsUser(ownerId, () => prisma.document.findMany({
        where: { userId: ownerId, id: { in: nominee.documentIds } }, select: { id: true, fileName: true, category: true },
      }))
    : [];
  return {
    ownerName: owner.name,
    nomineeName: decryptSecret(nominee.nameEnc),
    releasedAt: plan.releasedAt!.toISOString(),
    showAmounts: nominee.showAmounts,
    netWorth: nominee.showAmounts ? total.toString() : null,
    sections,
    letter: cats.includes('LETTER') && plan.letterEnc ? decryptSecret(plan.letterEnc) : null,
    documents,
  };
}

export async function loadViewDocument(ownerId: string, nomineeId: string, documentId: string) {
  const { nominee } = await loadReleased(ownerId, nomineeId);
  if (!(nominee.categories as string[]).includes('DOCUMENTS') || !nominee.documentIds.includes(documentId)) {
    throw new NotFoundError('Document not found');
  }
  const doc = await runAsUser(ownerId, () => prisma.document.findFirst({ where: { id: documentId, userId: ownerId } }));
  if (!doc) throw new NotFoundError('Document not found');
  const bytes = await runAsUser(ownerId, () => readBuffer(ownerId, doc.storageKey));
  return { fileName: doc.fileName, mimeType: doc.mimeType, bytes };
}

export { renderLegacyPdf } from './viewPdf.js';
```

> `new Decimal('250000.50').toString()` yields `'250000.5'`; the test expects that.

- [ ] **Step 4: viewPdf**

```ts
// src/services/legacy/viewPdf.ts
import PDFDocument from 'pdfkit';
import { formatINR, type LegacyViewDTO } from '@everypaisa/shared';
import { pdfSafe } from '../charts/pdfCharts.js';

export function renderLegacyPdf(v: LegacyViewDTO): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text(pdfSafe(`${v.ownerName} — financial information`));
    doc.moveDown(0.3).fontSize(10).fillColor('#555')
      .text(pdfSafe(`Shared with ${v.nomineeName} on ${v.releasedAt.slice(0, 10)}. Read-only. Not a will.`));
    if (v.netWorth) doc.moveDown(0.5).fillColor('#000').fontSize(12).text(pdfSafe(`Total of listed assets: ${formatINR(v.netWorth)}`));
    for (const s of v.sections) {
      doc.moveDown(1).fillColor('#000').fontSize(14).text(pdfSafe(s.title));
      if (s.items.length === 0) doc.fontSize(10).fillColor('#555').text('Nothing recorded.');
      for (const it of s.items) {
        const right = [it.identifierLast4 ? `••${it.identifierLast4}` : null, it.amount ? formatINR(it.amount) : null].filter(Boolean).join('   ');
        doc.fontSize(11).fillColor('#000').text(pdfSafe(`${it.label}${right ? `   ${right}` : ''}`));
        const sub = [it.sublabel, it.nominee ? `Nominee: ${it.nominee}` : null, ...it.notes].filter(Boolean).join(' · ');
        if (sub) doc.fontSize(9).fillColor('#555').text(pdfSafe(sub));
      }
      if (s.checklist.length) {
        doc.moveDown(0.3).fontSize(9).fillColor('#333').text('How to claim:');
        for (const step of s.checklist) doc.text(pdfSafe(`• ${step}`));
      }
    }
    if (v.letter) { doc.addPage().fontSize(14).fillColor('#000').text('Personal letter'); doc.moveDown(0.5).fontSize(11).text(pdfSafe(v.letter)); }
    doc.end();
  });
}
```

> `pdfSafe` lives in `src/services/charts/pdfCharts.ts` (imported by export.service). If `formatINR` takes a `Decimal`, wrap with `toDecimal(...)` from `@everypaisa/shared`.

- [ ] **Step 5: Run tests.** PASS.

- [ ] **Step 6: Commit**

```bash
git add portfolioos/packages/api/src/services/legacy/view.service.ts portfolioos/packages/api/src/services/legacy/viewPdf.ts portfolioos/packages/api/test/legacy/view.test.ts
git commit -m "feat(legacy): scope-filtered nominee view and PDF"
```

---

### Task 11: HTTP layer: owner, public link, nominee routes

**Files:**
- Create: `portfolioos/packages/api/src/middleware/legacySession.ts`
- Create: `portfolioos/packages/api/src/controllers/legacy.controller.ts`
- Create: `portfolioos/packages/api/src/routes/legacy.routes.ts`
- Modify: `portfolioos/packages/api/src/routes/index.ts` (mount 3 routers)
- Modify: `portfolioos/packages/api/src/middleware/rateLimit.ts` (add `legacyPublicLimiter`)
- Test: `portfolioos/packages/api/test/legacy/routes.test.ts`

**Interfaces:**
- Consumes: Tasks 5, 9, 10; `requireFeature` (`middleware/requirePlan.ts`); `authenticate`; `validate`, `asyncHandler`; `ok`, `noContent`.
- Produces HTTP:

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/legacy` | user | overview (`entitled` from `hasFeature(req.user.plan)`) |
| POST | `/api/legacy/step-up` | user | `{method}`; emails code when `email` |
| POST | `/api/legacy/step-up/verify` | user | `{code}` → `{grant}` |
| PUT | `/api/legacy/settings` | user + feature + grant | |
| POST | `/api/legacy/nominees` | user + feature + grant | |
| PUT | `/api/legacy/nominees/:id` | user + feature + grant | |
| DELETE | `/api/legacy/nominees/:id` | user + grant | allowed after lapse |
| POST | `/api/legacy/activate` | user + feature + grant | |
| POST | `/api/legacy/pause` | user + grant | `{until}` |
| POST | `/api/legacy/resume` | user + grant | |
| POST | `/api/legacy/deactivate` | user + grant | |
| POST | `/api/legacy/revoke` | user + grant | `{nomineeId?}` |
| POST | `/api/legacy-public/ok/:token` | none, limiter | → `{ok}` |
| POST | `/api/legacy-public/ack/:token` | none, limiter | → `{ownerName}` / 404 |
| GET | `/api/legacy-public/verify/:token` | none, limiter | → `{ownerName}` / 404 |
| POST | `/api/legacy-public/verify/:token` | none, limiter | `{answer}` → `{ok}` |
| POST | `/api/legacy-public/access/:token/otp` | none, limiter | emails OTP → `{maskedEmail}` |
| POST | `/api/legacy-public/access/:token/session` | none, limiter | `{code}` → `{session}` |
| GET | `/api/legacy-view` | `X-Legacy-Session` | `LegacyViewDTO` |
| GET | `/api/legacy-view/pdf` | `X-Legacy-Session` | PDF download |
| GET | `/api/legacy-view/documents/:id` | `X-Legacy-Session` | file download |

`X-Legacy-Grant` is checked by an inline `requireLegacyGrant` middleware. Every successful mutating owner call ends with `void notifyPlanChanged(userId)`. The public `ok`/`ack`/`verify` POSTs are POST (not GET) so link-preview bots that GET URLs cannot trigger them; the web pages call them on a button click.

- [ ] **Step 1: Failing route test**

```ts
// test/legacy/routes.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { encryptSecret } from '../../src/lib/secrets.js';
import { registerRoutes } from '../../src/routes/index.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { createNomineeSession } from '../../src/services/legacy/tokens.service.js';
import { signAccessToken } from '../../src/services/jwt.service.js';

describe('legacy routes', () => {
  const app = express(); app.use(express.json()); registerRoutes(app); app.use(errorHandler);
  let s: TestScope; let nomineeId: string;
  beforeAll(async () => {
    s = await createTestScope('legacy-routes');
    const planId = (await runAsSystem(() => prisma.legacyPlan.create({ data: { userId: s.userId, status: 'RELEASED', releasedAt: new Date() } }))).id;
    nomineeId = (await runAsSystem(() => prisma.legacyNominee.create({ data: {
      planId, userId: s.userId, nameEnc: encryptSecret('N'), emailEnc: encryptSecret('n@test.local'), relationship: 'Spouse', priority: 1, categories: ['INSURANCE'],
    } }))).id;
  });
  afterAll(async () => { await runAsSystem(() => prisma.legacyPlan.deleteMany({ where: { userId: s.userId } })); await s.cleanup(); });

  it('nominee session works on /api/legacy-view only', async () => {
    const sess = await createNomineeSession(nomineeId, s.userId);
    const v = await request(app).get('/api/legacy-view').set('X-Legacy-Session', sess);
    expect(v.status).toBe(200);
    expect(v.body.data.sections[0].category).toBe('INSURANCE');
    expect((await request(app).get('/api/dashboard').set('X-Legacy-Session', sess)).status).toBe(401);
    expect((await request(app).get('/api/legacy-view').set('Authorization', `Bearer ${sess}`)).status).toBe(401);
  });

  it('FREE user cannot add a nominee', async () => {
    const tok = signAccessToken({ id: s.userId, email: 'x@test.local', role: 'INVESTOR', plan: 'FREE' });
    const r = await request(app).post('/api/legacy/nominees').set('Authorization', `Bearer ${tok}`).send({});
    expect(r.status).toBe(403);
  });

  it('mutations without a step-up grant are refused', async () => {
    const tok = signAccessToken({ id: s.userId, email: 'x@test.local', role: 'INVESTOR', plan: 'PLUS' });
    const r = await request(app).post('/api/legacy/deactivate').set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(403);
  });
});
```

> Check that `supertest` is already a devDependency (`grep supertest packages/api/package.json`). If not, `pnpm --filter @portfolioos/api add -D supertest @types/supertest`. Use the real access-token minting function name (see the Task 3 note).

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Middleware**

```ts
// src/middleware/legacySession.ts
import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../lib/errors.js';
import { resolveNomineeSession } from '../services/legacy/tokens.service.js';

declare module 'express-serve-static-core' {
  interface Request { legacyNominee?: { nomineeId: string; userId: string } }
}

/** Nominee-only auth. Deliberately separate from `authenticate`: a nominee session is never a user JWT. */
export function legacySession(req: Request, _res: Response, next: NextFunction): void {
  const raw = req.header('x-legacy-session');
  if (!raw) return next(new UnauthorizedError('Session expired. Open your link again.'));
  resolveNomineeSession(raw)
    .then((s) => {
      if (!s) return next(new UnauthorizedError('Session expired. Open your link again.'));
      req.legacyNominee = s;
      next();
    })
    .catch(next);
}
```

In `rateLimit.ts`, after `authLimiter`:

```ts
// Legacy Transfer public links + nominee OTP: keyed per IP, tight.
export const legacyPublicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  store: makeStore('legacy'),
  message: { success: false, error: 'Too many attempts', code: 'RATE_LIMITED' },
});
```

- [ ] **Step 4: Controller**

```ts
// src/controllers/legacy.controller.ts
import type { Request, Response, NextFunction } from 'express';
import { hasFeature, type PlanTierValue } from '@everypaisa/shared';
import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import { decryptSecret } from '../lib/secrets.js';
import { writeAuditLog } from '../lib/audit.js';
import { ForbiddenError, NotFoundError, UnauthorizedError, BadRequestError } from '../lib/errors.js';
import { ok } from '../lib/response.js';
import { sendEmail } from '../services/notifications/email.service.js';
import * as plan from '../services/legacy/plan.service.js';
import * as pub from '../services/legacy/publicLinks.service.js';
import {
  checkOwnerGrant, createNomineeSession, issueNomineeOtp, resolveLinkToken, startOwnerStepUp,
  verifyNomineeOtp, verifyOwnerStepUp,
} from '../services/legacy/tokens.service.js';
import { renderNomineeOtpEmail, renderStepUpEmail } from '../services/legacy/emails.js';
import { buildLegacyView, loadViewDocument, renderLegacyPdf } from '../services/legacy/view.service.js';

const uid = (req: Request) => req.user!.id;
const done = (req: Request) => { void plan.notifyPlanChanged(uid(req)); };

export function requireLegacyGrant(req: Request, _res: Response, next: NextFunction): void {
  checkOwnerGrant(uid(req), req.header('x-legacy-grant'))
    .then((good) => (good ? next() : next(new ForbiddenError('Confirm it is you first.'))))
    .catch(next);
}

export async function overviewHandler(req: Request, res: Response) {
  ok(res, await plan.getOverview(uid(req), hasFeature(req.user!.plan as PlanTierValue, 'LEGACY_TRANSFER')));
}

export async function stepUpHandler(req: Request, res: Response) {
  const r = await startOwnerStepUp(uid(req));
  if (r.method === 'email') {
    const u = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: uid(req) }, select: { name: true, email: true } }));
    const sent = await sendEmail({ to: u.email, ...renderStepUpEmail(u.name, r.code!) });
    if (!sent.sent) throw new BadRequestError("We couldn't send the code. Try again shortly.");
  }
  ok(res, { method: r.method });
}

export async function stepUpVerifyHandler(req: Request, res: Response) {
  ok(res, { grant: await verifyOwnerStepUp(uid(req), req.body.code) });
}

export async function saveSettingsHandler(req: Request, res: Response) { await plan.saveSettings(uid(req), req.body); done(req); ok(res, { ok: true }); }
export async function addNomineeHandler(req: Request, res: Response) { const n = await plan.addNominee(uid(req), req.body); done(req); ok(res, n); }
export async function updateNomineeHandler(req: Request, res: Response) { const n = await plan.updateNominee(uid(req), req.params.id!, req.body); done(req); ok(res, n); }
export async function removeNomineeHandler(req: Request, res: Response) { await plan.removeNominee(uid(req), req.params.id!); done(req); ok(res, { ok: true }); }
export async function activateHandler(req: Request, res: Response) { await plan.activate(uid(req)); done(req); ok(res, { ok: true }); }
export async function pauseHandler(req: Request, res: Response) { await plan.pause(uid(req), req.body.until); done(req); ok(res, { ok: true }); }
export async function resumeHandler(req: Request, res: Response) { await plan.resume(uid(req)); done(req); ok(res, { ok: true }); }
export async function deactivateHandler(req: Request, res: Response) { await plan.deactivate(uid(req)); done(req); ok(res, { ok: true }); }
export async function revokeHandler(req: Request, res: Response) { await plan.revoke(uid(req), req.body?.nomineeId); done(req); ok(res, { ok: true }); }

// ── public link actions ─────────────────────────────────────────────
export async function imOkHandler(req: Request, res: Response) { ok(res, await pub.imOk(req.params.token!)); }
export async function ackHandler(req: Request, res: Response) {
  const r = await pub.acknowledgeInvite(req.params.token!);
  if (!r) throw new NotFoundError('This link is no longer valid.');
  ok(res, r);
}
export async function peekVerifyHandler(req: Request, res: Response) {
  const r = await pub.peekVerify(req.params.token!);
  if (!r) throw new NotFoundError('This link is no longer valid.');
  ok(res, r);
}
export async function answerVerifyHandler(req: Request, res: Response) {
  const r = await pub.answerVerify(req.params.token!, req.body.answer);
  if (!r.ok) throw new NotFoundError('This link is no longer valid.');
  ok(res, r);
}

const mask = (email: string) => email.replace(/^(.)(.*)(@.*)$/, (_m, a: string, b: string, c: string) => `${a}${'•'.repeat(Math.max(1, b.length))}${c}`);

async function accessNominee(token: string) {
  const t = await resolveLinkToken(token, 'ACCESS');
  if (!t || !t.nomineeId || t.plan.status !== 'RELEASED') throw new NotFoundError('This link is no longer valid.');
  const n = await runAsSystem(() => prisma.legacyNominee.findUnique({ where: { id: t.nomineeId! } }));
  if (!n) throw new NotFoundError('This link is no longer valid.');
  const owner = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: t.userId }, select: { name: true } }));
  return { t, n, ownerName: owner.name };
}

export async function accessOtpHandler(req: Request, res: Response) {
  const { t, n, ownerName } = await accessNominee(req.params.token!);
  const code = await issueNomineeOtp(n.id, t.userId);
  const email = decryptSecret(n.emailEnc);
  const sent = await sendEmail({ to: email, ...renderNomineeOtpEmail(decryptSecret(n.nameEnc), ownerName, code) });
  if (!sent.sent) throw new BadRequestError("We couldn't send the code. Try again shortly.");
  ok(res, { maskedEmail: mask(email), ownerName });
}

export async function accessSessionHandler(req: Request, res: Response) {
  const { t, n } = await accessNominee(req.params.token!);
  const r = await verifyNomineeOtp(n.id, req.body.code);
  if (r !== 'ok') {
    await writeAuditLog({ userId: t.userId, action: 'legacy_otp_failed', resource: `LegacyNominee:${n.id}`, req });
    throw new UnauthorizedError(r === 'locked' ? 'Too many attempts. Try again in 30 minutes.' : r === 'expired' ? 'That code has expired. Request a new one.' : "That code didn't match.");
  }
  await writeAuditLog({ userId: t.userId, action: 'legacy_otp_ok', resource: `LegacyNominee:${n.id}`, req });
  ok(res, { session: await createNomineeSession(n.id, t.userId) });
}

// ── nominee view ────────────────────────────────────────────────────
export async function viewHandler(req: Request, res: Response) {
  const { nomineeId, userId } = req.legacyNominee!;
  const v = await buildLegacyView(userId, nomineeId);
  await writeAuditLog({ userId, action: 'legacy_view', resource: `LegacyNominee:${nomineeId}`, req });
  ok(res, v);
}

export async function viewPdfHandler(req: Request, res: Response) {
  const { nomineeId, userId } = req.legacyNominee!;
  const pdf = await renderLegacyPdf(await buildLegacyView(userId, nomineeId));
  await writeAuditLog({ userId, action: 'legacy_pdf', resource: `LegacyNominee:${nomineeId}`, req });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="legacy-information.pdf"');
  res.send(pdf);
}

export async function viewDocumentHandler(req: Request, res: Response) {
  const { nomineeId, userId } = req.legacyNominee!;
  const d = await loadViewDocument(userId, nomineeId, req.params.id!);
  await writeAuditLog({ userId, action: 'legacy_document_download', resource: `Document:${req.params.id}`, req });
  res.setHeader('Content-Type', d.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(d.fileName)}"`);
  res.send(d.bytes);
}
```

- [ ] **Step 5: Routes + mount**

```ts
// src/routes/legacy.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireFeature } from '../middleware/requirePlan.js';
import { asyncHandler, validate } from '../middleware/validate.js';
import { legacyPublicLimiter, piiLimiter } from '../middleware/rateLimit.js';
import { legacySession } from '../middleware/legacySession.js';
import {
  legacyNomineeSchema, legacyOtpVerifySchema, legacyPauseSchema, legacySettingsSchema,
  legacyStepUpVerifySchema, legacyVerifyAnswerSchema,
} from '../schemas/legacy.schemas.js';
import * as c from '../controllers/legacy.controller.js';

export const legacyRouter = Router();
legacyRouter.use(authenticate);
const gated = requireFeature('LEGACY_TRANSFER');
legacyRouter.get('/', asyncHandler(c.overviewHandler));
legacyRouter.post('/step-up', piiLimiter, asyncHandler(c.stepUpHandler));
legacyRouter.post('/step-up/verify', piiLimiter, validate(legacyStepUpVerifySchema), asyncHandler(c.stepUpVerifyHandler));
legacyRouter.put('/settings', gated, c.requireLegacyGrant, validate(legacySettingsSchema), asyncHandler(c.saveSettingsHandler));
legacyRouter.post('/nominees', gated, c.requireLegacyGrant, validate(legacyNomineeSchema), asyncHandler(c.addNomineeHandler));
legacyRouter.put('/nominees/:id', gated, c.requireLegacyGrant, validate(legacyNomineeSchema), asyncHandler(c.updateNomineeHandler));
legacyRouter.delete('/nominees/:id', c.requireLegacyGrant, asyncHandler(c.removeNomineeHandler));
legacyRouter.post('/activate', gated, c.requireLegacyGrant, asyncHandler(c.activateHandler));
legacyRouter.post('/pause', c.requireLegacyGrant, validate(legacyPauseSchema), asyncHandler(c.pauseHandler));
legacyRouter.post('/resume', c.requireLegacyGrant, asyncHandler(c.resumeHandler));
legacyRouter.post('/deactivate', c.requireLegacyGrant, asyncHandler(c.deactivateHandler));
legacyRouter.post('/revoke', c.requireLegacyGrant, asyncHandler(c.revokeHandler));

export const legacyPublicRouter = Router();
legacyPublicRouter.use(legacyPublicLimiter);
legacyPublicRouter.post('/ok/:token', asyncHandler(c.imOkHandler));
legacyPublicRouter.post('/ack/:token', asyncHandler(c.ackHandler));
legacyPublicRouter.get('/verify/:token', asyncHandler(c.peekVerifyHandler));
legacyPublicRouter.post('/verify/:token', validate(legacyVerifyAnswerSchema), asyncHandler(c.answerVerifyHandler));
legacyPublicRouter.post('/access/:token/otp', asyncHandler(c.accessOtpHandler));
legacyPublicRouter.post('/access/:token/session', validate(legacyOtpVerifySchema), asyncHandler(c.accessSessionHandler));

export const legacyViewRouter = Router();
legacyViewRouter.use(legacySession);
legacyViewRouter.get('/', asyncHandler(c.viewHandler));
legacyViewRouter.get('/pdf', asyncHandler(c.viewPdfHandler));
legacyViewRouter.get('/documents/:id', asyncHandler(c.viewDocumentHandler));
```

> **Note:** the `/pause` and `/step-up` routes call `validate` before `requireLegacyGrant` in some orders. Keep grant **before** validate so an attacker without a grant learns nothing about body validity.

In `routes/index.ts`: import the three routers and add after `app.use('/api/emi', emiRouter);`:

```ts
  app.use('/api/legacy', legacyRouter);
  app.use('/api/legacy-public', legacyPublicRouter);
  app.use('/api/legacy-view', legacyViewRouter);
```

Make sure the CORS config allows the request headers `X-Legacy-Session` and `X-Legacy-Grant` (`grep -n allowedHeaders src/` and add them if a whitelist exists).

- [ ] **Step 6: Run tests**

Run: `npx vitest run test/legacy` → all PASS.

- [ ] **Step 7: Commit**

```bash
git add portfolioos/packages/api/src/middleware/legacySession.ts portfolioos/packages/api/src/middleware/rateLimit.ts portfolioos/packages/api/src/controllers/legacy.controller.ts portfolioos/packages/api/src/routes/legacy.routes.ts portfolioos/packages/api/src/routes/index.ts portfolioos/packages/api/test/legacy/routes.test.ts
git commit -m "feat(legacy): owner, public-link and nominee HTTP routes"
```

---

### Task 12: Account deletion purge

**Files:**
- Modify: `portfolioos/packages/api/src/services/accountDeletion.service.ts` (inside the purge transaction near `familyInvitation.deleteMany`)
- Test: `portfolioos/packages/api/test/legacy/accountDeletion.legacy.test.ts`

All legacy tables cascade from `LegacyPlan`, which cascades from `User`. The purge still needs (a) an explicit delete in case the purge runs with RESTRICT pre-clears in a fixed order, and (b) a nominee notice. Per design §9, acknowledged nominees get "X has closed their account". **v1 decision: skip this notice.** Telling nominees an account was closed leaks information about a living person. Record that in the design doc in Task 14. So this task is only the delete plus its test.

- [ ] **Step 1: Failing test**

```ts
// test/legacy/accountDeletion.legacy.test.ts
import { describe, it, expect } from 'vitest';
import { createTestScope, prisma } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { encryptSecret } from '../../src/lib/secrets.js';
import { purgeUser } from '../../src/services/accountDeletion.service.js';

describe('account purge removes Legacy data', () => {
  it('deletes plan, nominees, tokens, codes, outbox', async () => {
    const s = await createTestScope('legacy-purge');
    const planId = (await runAsSystem(() => prisma.legacyPlan.create({ data: { userId: s.userId, status: 'ARMED' } }))).id;
    await runAsSystem(() => prisma.legacyNominee.create({ data: {
      planId, userId: s.userId, nameEnc: encryptSecret('N'), emailEnc: encryptSecret('n@test.local'), relationship: 'x', priority: 1, categories: ['INSURANCE'],
    } }));
    await purgeUser(s.userId);
    expect(await runAsSystem(() => prisma.legacyPlan.count({ where: { userId: s.userId } }))).toBe(0);
    expect(await runAsSystem(() => prisma.legacyNominee.count({ where: { userId: s.userId } }))).toBe(0);
  });
});
```

> Use the actual purge function exported by `accountDeletion.service.ts` (`grep -n "^export async function" src/services/accountDeletion.service.ts`). Run against **Docker Postgres** per the account-deletion memory.

- [ ] **Step 2: Run.** If it already passes thanks to cascades, still add the explicit delete (Step 3) so the order is documented, then re-run.

- [ ] **Step 3: Implement.** Next to `await tx.familyInvitation.deleteMany(...)` add:

```ts
        // Legacy Transfer: plan cascades to nominees/tokens/codes/outbox. Deleted
        // explicitly so the purge order is visible here. No nominee notice — see design §9.
        await tx.legacyPlan.deleteMany({ where: { userId: id } });
```

- [ ] **Step 4: Run test → PASS. Commit**

```bash
git add portfolioos/packages/api/src/services/accountDeletion.service.ts portfolioos/packages/api/test/legacy/accountDeletion.legacy.test.ts
git commit -m "feat(legacy): purge Legacy data on account deletion"
```

---

### Task 13: Web: owner page `/legacy`

**Files:**
- Create: `portfolioos/apps/web/src/api/legacy.api.ts`
- Create: `portfolioos/apps/web/src/pages/legacy/StepUpDialog.tsx`
- Create: `portfolioos/apps/web/src/pages/legacy/NomineeDialog.tsx`
- Create: `portfolioos/apps/web/src/pages/legacy/LegacyPage.tsx`
- Modify: `portfolioos/apps/web/src/App.tsx` (protected route `/legacy`)
- Modify: `portfolioos/apps/web/src/components/layout/navItems.tsx` (nav entry near EMI Calculator, icon `HeartHandshake` from lucide-react)
- Test: `portfolioos/apps/web/src/api/legacy.api.test.ts`

**Interfaces:**
- Consumes: HTTP from Task 11; `LegacyOverviewDTO`, `LegacyNomineeDTO`, `LEGACY_*` from shared; `api`, `unwrap`, `apiErrorMessage` (`api/client.ts`); `useEntitlement`.
- Produces:
```ts
export const LEGACY_KEYS = { overview: ['legacy', 'overview'] as const };
export const legacyApi = {
  overview(): Promise<LegacyOverviewDTO>;
  startStepUp(): Promise<{ method: 'totp' | 'email' }>;
  verifyStepUp(code: string): Promise<string>; // grant; stored in module memory for 15 min
  hasGrant(): boolean;
  saveSettings(b: { triggerMode; inactivityDays; scheduledFor; letter }): Promise<void>;
  addNominee(b: NomineeInput): Promise<LegacyNomineeDTO>;
  updateNominee(id: string, b: NomineeInput): Promise<LegacyNomineeDTO>;
  removeNominee(id: string): Promise<void>;
  activate(): Promise<void>; pause(until: string): Promise<void>; resume(): Promise<void>;
  deactivate(): Promise<void>; revoke(nomineeId?: string): Promise<void>;
};
```

- [ ] **Step 1: Failing API test**

```ts
// apps/web/src/api/legacy.api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from './client';
import { legacyApi } from './legacy.api';

describe('legacyApi grant handling', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('sends X-Legacy-Grant after verifyStepUp', async () => {
    vi.spyOn(api, 'post').mockResolvedValueOnce({ data: { success: true, data: { grant: 'g1' } } } as never)
      .mockResolvedValueOnce({ data: { success: true, data: { ok: true } } } as never);
    await legacyApi.verifyStepUp('123456');
    expect(legacyApi.hasGrant()).toBe(true);
    await legacyApi.activate();
    expect((api.post as unknown as { mock: { calls: unknown[][] } }).mock.calls[1]![2]).toEqual({ headers: { 'X-Legacy-Grant': 'g1' } });
  });
});
```

- [ ] **Step 2: Run, verify fail.** `cd portfolioos/apps/web && npx vitest run src/api/legacy.api.test.ts`

- [ ] **Step 3: API client**

```ts
// apps/web/src/api/legacy.api.ts
import type { LegacyCategory, LegacyNomineeDTO, LegacyOverviewDTO, LegacyTriggerValue } from '@everypaisa/shared';
import { api, unwrap } from './client';

export const LEGACY_KEYS = { overview: ['legacy', 'overview'] as const };

export interface NomineeInput {
  name: string; email: string; relationship: string; priority: number; isVerifier: boolean;
  categories: LegacyCategory[]; documentIds: string[]; showAmounts: boolean;
}
export interface SettingsInput { triggerMode: LegacyTriggerValue; inactivityDays: number; scheduledFor: string | null; letter: string | null }

// Step-up grant lives in memory only (15 min server-side). A reload asks again — intended.
let grant: { value: string; until: number } | null = null;
const GRANT_MS = 14 * 60_000;
const withGrant = () => ({ headers: { 'X-Legacy-Grant': grant?.value ?? '' } });

export const legacyApi = {
  async overview(): Promise<LegacyOverviewDTO> { return unwrap((await api.get('/api/legacy')).data); },
  async startStepUp(): Promise<{ method: 'totp' | 'email' }> { return unwrap((await api.post('/api/legacy/step-up')).data); },
  async verifyStepUp(code: string): Promise<string> {
    const { grant: g } = unwrap<{ grant: string }>((await api.post('/api/legacy/step-up/verify', { code })).data);
    grant = { value: g, until: Date.now() + GRANT_MS };
    return g;
  },
  hasGrant(): boolean { return grant !== null && grant.until > Date.now(); },
  async saveSettings(b: SettingsInput): Promise<void> { await api.put('/api/legacy/settings', b, withGrant()); },
  async addNominee(b: NomineeInput): Promise<LegacyNomineeDTO> { return unwrap((await api.post('/api/legacy/nominees', b, withGrant())).data); },
  async updateNominee(id: string, b: NomineeInput): Promise<LegacyNomineeDTO> { return unwrap((await api.put(`/api/legacy/nominees/${id}`, b, withGrant())).data); },
  async removeNominee(id: string): Promise<void> { await api.delete(`/api/legacy/nominees/${id}`, withGrant()); },
  async activate(): Promise<void> { await api.post('/api/legacy/activate', undefined, withGrant()); },
  async pause(until: string): Promise<void> { await api.post('/api/legacy/pause', { until }, withGrant()); },
  async resume(): Promise<void> { await api.post('/api/legacy/resume', undefined, withGrant()); },
  async deactivate(): Promise<void> { await api.post('/api/legacy/deactivate', undefined, withGrant()); },
  async revoke(nomineeId?: string): Promise<void> { await api.post('/api/legacy/revoke', nomineeId ? { nomineeId } : {}, withGrant()); },
};
```

- [ ] **Step 4: StepUpDialog**

```tsx
// apps/web/src/pages/legacy/StepUpDialog.tsx
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/api/client';
import { legacyApi } from '@/api/legacy.api';

/** Asks for a 2FA code (or an emailed code) and resolves once a grant is held. */
export function StepUpDialog({ open, onDone, onCancel }: { open: boolean; onDone: () => void; onCancel: () => void }) {
  const [method, setMethod] = useState<'totp' | 'email' | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(''); setMethod(null);
    legacyApi.startStepUp().then((r) => setMethod(r.method)).catch((e) => toast.error(apiErrorMessage(e)));
  }, [open]);

  async function submit() {
    setBusy(true);
    try { await legacyApi.verifyStepUp(code); onDone(); } catch (e) { toast.error(apiErrorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Confirm it’s you</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          {method === 'totp' ? 'Enter the code from your authenticator app (or a backup code).'
            : method === 'email' ? 'We emailed you a 6-digit code.' : 'Preparing…'}
        </p>
        <Label htmlFor="legacy-code">Code</Label>
        <Input id="legacy-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button disabled={!method || code.trim().length < 6 || busy} onClick={submit}>Confirm</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

> Match the exported names in `components/ui/dialog.tsx` (`grep -n "^export" apps/web/src/components/ui/dialog.tsx`). Adjust imports if they differ.

- [ ] **Step 5: NomineeDialog**

```tsx
// apps/web/src/pages/legacy/NomineeDialog.tsx
import { useEffect, useState } from 'react';
import { LEGACY_CATEGORIES, LEGACY_CATEGORY_LABELS, type LegacyCategory, type LegacyNomineeDTO } from '@everypaisa/shared';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { documentsApi } from '@/api/documents.api';
import type { NomineeInput } from '@/api/legacy.api';

const EMPTY: NomineeInput = { name: '', email: '', relationship: '', priority: 1, isVerifier: false, categories: ['INSURANCE', 'BANK_ACCOUNTS'], documentIds: [], showAmounts: false };

export function NomineeDialog({ open, initial, onSave, onClose }: {
  open: boolean; initial: LegacyNomineeDTO | null; onSave: (v: NomineeInput) => void; onClose: () => void;
}) {
  const [v, setV] = useState<NomineeInput>(EMPTY);
  useEffect(() => { if (open) setV(initial ? { ...initial } : EMPTY); }, [open, initial]);
  const docs = useQuery({ queryKey: ['documents', 'all'], queryFn: () => documentsApi.listAll(), enabled: open && v.categories.includes('DOCUMENTS') });
  const toggle = (c: LegacyCategory) => setV((s) => ({ ...s, categories: s.categories.includes(c) ? s.categories.filter((x) => x !== c) : [...s.categories, c] }));
  const valid = v.name.trim() && /\S+@\S+\.\S+/.test(v.email) && v.relationship.trim() && v.categories.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initial ? 'Edit nominee' : 'Add nominee'}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Name</Label><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
          <div><Label>Email</Label><Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Relationship</Label><Input value={v.relationship} onChange={(e) => setV({ ...v, relationship: e.target.value })} placeholder="Spouse" /></div>
            <div><Label>Priority</Label><Input type="number" min={1} max={20} value={v.priority} onChange={(e) => setV({ ...v, priority: Number(e.target.value) || 1 })} /></div>
          </div>
          <fieldset>
            <legend className="text-sm font-medium mb-1">What they can see</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {LEGACY_CATEGORIES.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={v.categories.includes(c)} onChange={() => toggle(c)} /> {LEGACY_CATEGORY_LABELS[c]}
                </label>
              ))}
            </div>
          </fieldset>
          {v.categories.includes('DOCUMENTS') && (
            <fieldset>
              <legend className="text-sm font-medium mb-1">Documents to share</legend>
              {(docs.data ?? []).map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={v.documentIds.includes(d.id)}
                    onChange={() => setV((s) => ({ ...s, documentIds: s.documentIds.includes(d.id) ? s.documentIds.filter((x) => x !== d.id) : [...s.documentIds, d.id] }))} />
                  {d.fileName}
                </label>
              ))}
              {docs.data?.length === 0 && <p className="text-sm text-muted-foreground">No documents in your vault yet.</p>}
            </fieldset>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.showAmounts} onChange={(e) => setV({ ...v, showAmounts: e.target.checked })} />
            Show amounts (balances, values). Off = only what exists and where.
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.isVerifier} onChange={(e) => setV({ ...v, isVerifier: e.target.checked })} />
            Verifier: asked to confirm before access opens (only one per plan).
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid} onClick={() => onSave({ ...v, email: v.email.trim().toLowerCase() })}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

> Use the real list function from `api/documents.api.ts` (`grep -n "async " apps/web/src/api/documents.api.ts`) in place of `documentsApi.listAll` if it is named differently.

- [ ] **Step 6: LegacyPage**

```tsx
// apps/web/src/pages/legacy/LegacyPage.tsx
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { LEGACY_CATEGORY_LABELS, LEGACY_DEFAULT_INACTIVITY_DAYS, LEGACY_MIN_INACTIVITY_DAYS, type LegacyNomineeDTO, type LegacyTriggerValue } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { apiErrorMessage } from '@/api/client';
import { LEGACY_KEYS, legacyApi, type NomineeInput } from '@/api/legacy.api';
import { useEntitlement } from '@/hooks/useEntitlement';
import { StepUpDialog } from './StepUpDialog';
import { NomineeDialog } from './NomineeDialog';

const STATUS_TEXT: Record<string, string> = {
  DRAFT: 'Off', ARMED: 'On', WARNING_1: 'Reminder sent', WARNING_2: 'Second reminder sent', FINAL_WARNING: 'Final reminder sent',
  GRACE: 'Nominees notified', RELEASED: 'Shared with nominees', PAUSED: 'Paused',
};

export function LegacyPage() {
  const qc = useQueryClient();
  const ent = useEntitlement('LEGACY_TRANSFER');
  const q = useQuery({ queryKey: LEGACY_KEYS.overview, queryFn: legacyApi.overview });
  const [stepUp, setStepUp] = useState<null | (() => Promise<void>)>(null);
  const [nomDlg, setNomDlg] = useState<{ open: boolean; initial: LegacyNomineeDTO | null }>({ open: false, initial: null });
  const [trigger, setTrigger] = useState<LegacyTriggerValue>('INACTIVITY');
  const [days, setDays] = useState(LEGACY_DEFAULT_INACTIVITY_DAYS);
  const [date, setDate] = useState('');
  const [letter, setLetter] = useState('');
  const [pauseUntil, setPauseUntil] = useState('');
  const seeded = useRef(false);

  useEffect(() => {
    const o = q.data; if (!o || seeded.current) return;
    seeded.current = true;
    setTrigger(o.triggerMode); setDays(o.inactivityDays); setDate(o.scheduledFor ?? ''); setLetter(o.letter ?? '');
  }, [q.data]);

  /** Run fn with a step-up grant, asking for one first if needed. */
  function guarded(fn: () => Promise<void>) {
    const run = async () => {
      try { await fn(); await qc.invalidateQueries({ queryKey: LEGACY_KEYS.overview }); toast.success('Saved'); }
      catch (e) { toast.error(apiErrorMessage(e)); }
    };
    if (legacyApi.hasGrant()) void run(); else setStepUp(() => run);
  }

  const saveSettings = () => guarded(() => legacyApi.saveSettings({
    triggerMode: trigger, inactivityDays: days, scheduledFor: trigger === 'INACTIVITY' ? null : date || null, letter: letter.trim() || null,
  }));
  const saveNominee = useMutation({
    mutationFn: async (v: NomineeInput) => { if (nomDlg.initial) await legacyApi.updateNominee(nomDlg.initial.id, v); else await legacyApi.addNominee(v); },
  });

  if (q.isLoading) return <div className="p-6">Loading…</div>;
  if (q.error || !q.data) return <div className="p-6">{apiErrorMessage(q.error, 'Could not load Legacy Transfer.')}</div>;
  const o = q.data;
  const editable = ['DRAFT', 'ARMED', 'PAUSED'].includes(o.status);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
      <PageHeader title="Legacy Transfer" description="Make sure your loved ones are never left in the dark about your finances." />

      {!ent.allowed && (
        <Card><CardContent className="p-4 text-sm">
          Legacy Transfer is part of the {ent.requiredTier} plan. {o.status !== 'DRAFT' && 'Your existing plan keeps working; you can still pause, revoke or remove nominees.'}
          {' '}<a className="underline" href="/pricing">See plans</a>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2"><span className="font-medium">Status</span><Badge>{STATUS_TEXT[o.status]}</Badge></div>
        {o.nextEvent && <p className="text-sm text-muted-foreground">{o.nextEvent}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {o.status === 'DRAFT' && <Button disabled={!ent.allowed || o.nominees.length === 0} onClick={() => guarded(legacyApi.activate)}>Turn on</Button>}
          {['ARMED', 'WARNING_1', 'WARNING_2', 'FINAL_WARNING', 'GRACE'].includes(o.status) && (
            <>
              <Input type="date" className="w-44" value={pauseUntil} onChange={(e) => setPauseUntil(e.target.value)} aria-label="Pause until" />
              <Button variant="outline" disabled={!pauseUntil} onClick={() => guarded(() => legacyApi.pause(pauseUntil))}>Pause</Button>
            </>
          )}
          {o.status === 'PAUSED' && <Button variant="outline" onClick={() => guarded(legacyApi.resume)}>Resume</Button>}
          {o.status === 'RELEASED' && <Button variant="destructive" onClick={() => guarded(() => legacyApi.revoke())}>Revoke all access</Button>}
          {o.status !== 'DRAFT' && <Button variant="ghost" onClick={() => guarded(legacyApi.deactivate)}>Turn off</Button>}
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <h2 className="font-medium">When to share</h2>
        <div><Label>Trigger</Label>
          <Select value={trigger} disabled={!editable || !ent.allowed} onChange={(e) => setTrigger(e.target.value as LegacyTriggerValue)}>
            <option value="INACTIVITY">If I’m inactive</option>
            <option value="SCHEDULED">On a date</option>
            <option value="BOTH">Whichever comes first</option>
          </Select>
        </div>
        {trigger !== 'SCHEDULED' && (
          <div><Label>Inactive for (days, at least {LEGACY_MIN_INACTIVITY_DAYS})</Label>
            <Input type="number" min={LEGACY_MIN_INACTIVITY_DAYS} value={days} disabled={!editable || !ent.allowed} onChange={(e) => setDays(Number(e.target.value))} />
            <p className="text-xs text-muted-foreground mt-1">Then 3 email reminders a week apart and a 7-day notice to nominees before anything is shared.</p>
          </div>
        )}
        {trigger !== 'INACTIVITY' && (
          <div><Label>Release date</Label><Input type="date" value={date} disabled={!editable || !ent.allowed} onChange={(e) => setDate(e.target.value)} /></div>
        )}
        <div><Label>Personal letter (optional)</Label>
          <Textarea rows={4} value={letter} disabled={!editable || !ent.allowed} onChange={(e) => setLetter(e.target.value)} placeholder="e.g. FD papers are in the SBI locker #42" />
        </div>
        <Button disabled={!editable || !ent.allowed || (trigger === 'INACTIVITY' ? days < LEGACY_MIN_INACTIVITY_DAYS : !date)} onClick={saveSettings}>Save</Button>
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Nominees</h2>
          <Button size="sm" disabled={!ent.allowed} onClick={() => setNomDlg({ open: true, initial: null })}>Add nominee</Button>
        </div>
        {o.nominees.length === 0 && <p className="text-sm text-muted-foreground">No nominees yet.</p>}
        {o.nominees.map((n) => (
          <div key={n.id} className="flex flex-col gap-1 border-t pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="font-medium truncate">{n.name} <span className="text-muted-foreground font-normal">· {n.relationship}</span>{n.isVerifier && <Badge className="ml-2">Verifier</Badge>}</div>
              <div className="text-xs text-muted-foreground truncate">{n.email} {n.acknowledgedAt ? '· confirmed' : o.status !== 'DRAFT' ? '· ⚠ email not confirmed yet' : ''}</div>
              <div className="text-xs text-muted-foreground">{n.categories.map((c) => LEGACY_CATEGORY_LABELS[c]).join(', ')} · {n.showAmounts ? 'with amounts' : 'no amounts'}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={!ent.allowed} onClick={() => setNomDlg({ open: true, initial: n })}>Edit</Button>
              {o.status === 'RELEASED' && <Button size="sm" variant="outline" onClick={() => guarded(() => legacyApi.revoke(n.id))}>Revoke</Button>}
              <Button size="sm" variant="ghost" onClick={() => guarded(() => legacyApi.removeNominee(n.id))}>Remove</Button>
            </div>
          </div>
        ))}
      </CardContent></Card>

      <p className="text-xs text-muted-foreground">Legacy Transfer shares information only. It is not a will and does not transfer any asset. Nominees never get edit access.</p>

      <NomineeDialog open={nomDlg.open} initial={nomDlg.initial} onClose={() => setNomDlg({ open: false, initial: null })}
        onSave={(v) => { setNomDlg((s) => ({ ...s, open: false })); guarded(() => saveNominee.mutateAsync(v)); }} />
      <StepUpDialog open={stepUp !== null}
        onCancel={() => setStepUp(null)}
        onDone={() => { const fn = stepUp; setStepUp(null); void fn?.(); }} />
    </div>
  );
}
```

> `Select` in `components/ui/select.tsx` is used as a native-select wrapper in `SplitSettingsPage`; if its props differ, mirror that page's usage. Same for `PageHeader` props.

In `App.tsx`, import `LegacyPage` and add inside the protected tree beside `/emi`: `<Route path="/legacy" element={<LegacyPage />} />`.
In `navItems.tsx`, next to the EMI item: `{ label: 'Legacy Transfer', to: '/legacy', icon: HeartHandshake },` (import `HeartHandshake` from `lucide-react`).

- [ ] **Step 7: Run tests + typecheck**

Run: `cd portfolioos/apps/web && npx vitest run src/api/legacy.api.test.ts && npx tsc --noEmit`
Expected: PASS, no TS errors.

- [ ] **Step 8: Commit**

```bash
git add portfolioos/apps/web/src/api/legacy.api.ts portfolioos/apps/web/src/api/legacy.api.test.ts portfolioos/apps/web/src/pages/legacy portfolioos/apps/web/src/App.tsx portfolioos/apps/web/src/components/layout/navItems.tsx
git commit -m "feat(legacy): owner Legacy Transfer page"
```

---

### Task 14: Web: public link pages + nominee view

**Files:**
- Create: `portfolioos/apps/web/src/api/legacyPublic.api.ts`
- Create: `portfolioos/apps/web/src/pages/legacy/LegacyLinkPage.tsx`
- Create: `portfolioos/apps/web/src/pages/legacy/LegacyAccessPage.tsx`
- Modify: `portfolioos/apps/web/src/App.tsx` (public routes, outside `ProtectedRoute`)
- Test: `portfolioos/apps/web/src/api/legacyPublic.api.test.ts`

**Interfaces:**
- Consumes: Task 11 public + view routes; `LegacyViewDTO`; `formatINR`, `LEGACY_CATEGORY_LABELS`.
- Produces: routes `/legacy/ok/:token`, `/legacy/ack/:token`, `/legacy/verify/:token`, `/legacy/access/:token`.

The public client uses a **separate axios instance** with no auth interceptor, so the owner's JWT (if the nominee happens to be logged in as themselves) is never attached and a 401 never triggers the app's refresh/logout flow. The nominee session lives in `sessionStorage` under `legacy.session.<token-prefix>`.

- [ ] **Step 1: Failing test**

```ts
// apps/web/src/api/legacyPublic.api.test.ts
import { describe, it, expect, vi } from 'vitest';
import { legacyPublic } from './legacyPublic.api';

describe('legacyPublic', () => {
  it('sends X-Legacy-Session and never Authorization', async () => {
    const spy = vi.spyOn(legacyPublic.http, 'get').mockResolvedValue({ data: { success: true, data: { sections: [] } } } as never);
    await legacyPublic.view('sess1');
    const cfg = spy.mock.calls[0]![1] as { headers: Record<string, string> };
    expect(cfg.headers['X-Legacy-Session']).toBe('sess1');
    expect(cfg.headers.Authorization).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement client**

```ts
// apps/web/src/api/legacyPublic.api.ts
import axios from 'axios';
import type { LegacyViewDTO } from '@everypaisa/shared';
import { getApiBaseUrl } from './baseUrl';
import { unwrap } from './client';

/** No interceptors: nominee pages must never carry or refresh a user JWT. */
const http = axios.create({ baseURL: getApiBaseUrl() });
const sess = (s: string) => ({ headers: { 'X-Legacy-Session': s } });

export const legacyPublic = {
  http,
  async imOk(token: string): Promise<{ ok: boolean }> { return unwrap((await http.post(`/api/legacy-public/ok/${token}`)).data); },
  async ack(token: string): Promise<{ ownerName: string }> { return unwrap((await http.post(`/api/legacy-public/ack/${token}`)).data); },
  async peekVerify(token: string): Promise<{ ownerName: string }> { return unwrap((await http.get(`/api/legacy-public/verify/${token}`)).data); },
  async answerVerify(token: string, answer: 'CONFIRM' | 'FINE'): Promise<{ ok: boolean }> {
    return unwrap((await http.post(`/api/legacy-public/verify/${token}`, { answer })).data);
  },
  async requestOtp(token: string): Promise<{ maskedEmail: string; ownerName: string }> {
    return unwrap((await http.post(`/api/legacy-public/access/${token}/otp`)).data);
  },
  async openSession(token: string, code: string): Promise<string> {
    return unwrap<{ session: string }>((await http.post(`/api/legacy-public/access/${token}/session`, { code })).data).session;
  },
  async view(session: string): Promise<LegacyViewDTO> { return unwrap((await http.get('/api/legacy-view', sess(session))).data); },
  async download(session: string, path: string, filename: string): Promise<void> {
    const res = await http.get(`/api/legacy-view${path}`, { ...sess(session), responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};
```

> Confirm `getApiBaseUrl` is the export name in `api/baseUrl.ts`.

- [ ] **Step 4: LegacyLinkPage** (handles ok / ack / verify by `kind` prop)

```tsx
// apps/web/src/pages/legacy/LegacyLinkPage.tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiErrorMessage } from '@/api/client';
import { legacyPublic } from '@/api/legacyPublic.api';

type Kind = 'ok' | 'ack' | 'verify';

export function LegacyLinkPage({ kind }: { kind: Kind }) {
  const { token = '' } = useParams();
  const [owner, setOwner] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (kind === 'verify') legacyPublic.peekVerify(token).then((r) => setOwner(r.ownerName)).catch((e) => { setState('error'); setMsg(apiErrorMessage(e)); });
  }, [kind, token]);

  async function act(fn: () => Promise<unknown>, doneMsg: string) {
    setState('busy');
    try { await fn(); setState('done'); setMsg(doneMsg); } catch (e) { setState('error'); setMsg(apiErrorMessage(e, 'This link is no longer valid.')); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md"><CardContent className="p-6 space-y-4">
        <h1 className="text-lg font-semibold">EveryPaisa Legacy Transfer</h1>
        {state === 'done' || state === 'error' ? <p className="text-sm">{msg}</p> : (
          <>
            {kind === 'ok' && (<>
              <p className="text-sm">Click below to tell us you’re OK. The countdown resets and nothing is shared.</p>
              <Button disabled={state === 'busy'} onClick={() => act(() => legacyPublic.imOk(token), 'Thanks. Your countdown has been reset.')}>I’m OK</Button>
            </>)}
            {kind === 'ack' && (<>
              <p className="text-sm">Confirm that this email address works. Nothing is shared with you now.</p>
              <Button disabled={state === 'busy'} onClick={() => act(async () => { const r = await legacyPublic.ack(token); setOwner(r.ownerName); }, 'Confirmed. Thank you.')}>Confirm</Button>
            </>)}
            {kind === 'verify' && owner && (<>
              <p className="text-sm">{owner} asked you to confirm before their information is shared with their nominees. Has something happened to them?</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="destructive" disabled={state === 'busy'} onClick={() => act(() => legacyPublic.answerVerify(token, 'CONFIRM'), 'Thank you. Their nominees now have access.')}>Yes, share their information now</Button>
                <Button variant="outline" disabled={state === 'busy'} onClick={() => act(() => legacyPublic.answerVerify(token, 'FINE'), 'Thank you. The countdown has been reset.')}>No, they’re fine</Button>
              </div>
              <p className="text-xs text-muted-foreground">Not sure? Do nothing; access opens automatically at the end of the waiting period.</p>
            </>)}
          </>
        )}
      </CardContent></Card>
    </div>
  );
}
```

- [ ] **Step 5: LegacyAccessPage**

```tsx
// apps/web/src/pages/legacy/LegacyAccessPage.tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { formatINR, type LegacyViewDTO } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiErrorMessage } from '@/api/client';
import { legacyPublic } from '@/api/legacyPublic.api';

const key = (t: string) => `legacy.session.${t.slice(0, 12)}`;
const readSess = (t: string) => { try { return sessionStorage.getItem(key(t)); } catch { return null; } };
const writeSess = (t: string, v: string | null) => { try { if (v) sessionStorage.setItem(key(t), v); else sessionStorage.removeItem(key(t)); } catch { /* private mode: session lives in state only */ } };

export function LegacyAccessPage() {
  const { token = '' } = useParams();
  const [session, setSession] = useState<string | null>(() => readSess(token));
  const [view, setView] = useState<LegacyViewDTO | null>(null);
  const [sent, setSent] = useState<{ maskedEmail: string; ownerName: string } | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!session) return;
    legacyPublic.view(session).then(setView).catch(() => { writeSess(token, null); setSession(null); });
  }, [session, token]);

  async function sendCode() {
    try { setSent(await legacyPublic.requestOtp(token)); setErr(''); } catch (e) { setErr(apiErrorMessage(e, 'This link is no longer valid.')); }
  }
  async function verify() {
    try { const s = await legacyPublic.openSession(token, code); writeSess(token, s); setSession(s); } catch (e) { setErr(apiErrorMessage(e)); }
  }

  if (!view) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md"><CardContent className="p-6 space-y-4">
          <h1 className="text-lg font-semibold">Shared financial information</h1>
          {!sent ? (
            <><p className="text-sm">To protect this information, we’ll email you a one-time code.</p><Button onClick={sendCode}>Send code</Button></>
          ) : (
            <>
              <p className="text-sm">We sent a code to {sent.maskedEmail}. It expires in 10 minutes.</p>
              <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              <div className="flex gap-2"><Button disabled={code.length !== 6} onClick={verify}>Open</Button><Button variant="ghost" onClick={sendCode}>Resend</Button></div>
            </>
          )}
          {err && <p className="text-sm text-destructive">{err}</p>}
        </CardContent></Card>
      </div>
    );
  }

  const dl = (path: string, name: string) => legacyPublic.download(session!, path, name).catch((e) => toast.error(apiErrorMessage(e)));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{view.ownerName}’s financial information</h1>
          <p className="text-sm text-muted-foreground">Shared with {view.nomineeName}. Read-only. This is information, not a will.</p>
          {view.netWorth && <p className="mt-1 font-medium">Total of listed assets: {formatINR(view.netWorth)}</p>}
        </div>
        <Button variant="outline" onClick={() => dl('/pdf', 'legacy-information.pdf')}>Download PDF</Button>
      </div>

      {view.letter && <Card><CardContent className="p-4"><h2 className="font-medium mb-2">A note from {view.ownerName}</h2><p className="whitespace-pre-wrap text-sm">{view.letter}</p></CardContent></Card>}

      {view.sections.map((s) => (
        <Card key={s.category}><CardContent className="p-4 space-y-2">
          <h2 className="font-medium">{s.title}</h2>
          {s.items.length === 0 && <p className="text-sm text-muted-foreground">Nothing recorded.</p>}
          {s.items.map((it, i) => (
            <div key={i} className="border-t pt-2 flex flex-col gap-1 sm:flex-row sm:justify-between">
              <div className="min-w-0">
                <div className="font-medium break-words">{it.label}</div>
                <div className="text-xs text-muted-foreground break-words">
                  {[it.sublabel, it.identifierLast4 ? `ending ${it.identifierLast4}` : null, it.nominee ? `Nominee: ${it.nominee}` : null, ...it.notes].filter(Boolean).join(' · ')}
                </div>
              </div>
              {it.amount && <div className="shrink-0 tabular-nums">{formatINR(it.amount)}</div>}
            </div>
          ))}
          {s.checklist.length > 0 && (
            <details className="text-sm"><summary className="cursor-pointer">How to claim</summary>
              <ul className="list-disc pl-5 mt-1 space-y-1">{s.checklist.map((c) => <li key={c}>{c}</li>)}</ul>
            </details>
          )}
        </CardContent></Card>
      ))}

      {view.documents.length > 0 && (
        <Card><CardContent className="p-4 space-y-2">
          <h2 className="font-medium">Documents</h2>
          {view.documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 border-t pt-2">
              <span className="truncate text-sm">{d.fileName}</span>
              <Button size="sm" variant="outline" onClick={() => dl(`/documents/${d.id}`, d.fileName)}>Download</Button>
            </div>
          ))}
        </CardContent></Card>
      )}
    </div>
  );
}
```

> If `formatINR` in shared requires a `Decimal`, wrap with `toDecimal(it.amount)`.

In `App.tsx`, next to the other public routes (before `/onboarding`):

```tsx
      {/* Legacy Transfer links: outside the protected tree on purpose — the
          owner may be unable to sign in, and nominees have no account. */}
      <Route path="/legacy/ok/:token" element={<LegacyLinkPage kind="ok" />} />
      <Route path="/legacy/ack/:token" element={<LegacyLinkPage kind="ack" />} />
      <Route path="/legacy/verify/:token" element={<LegacyLinkPage kind="verify" />} />
      <Route path="/legacy/access/:token" element={<LegacyAccessPage />} />
```

React Router ranks these static-prefixed paths above `/legacy` correctly. `/legacy` (protected) and `/legacy/ok/:token` (public) do not collide.

- [ ] **Step 6: Tests + typecheck + build**

Run: `cd portfolioos/apps/web && npx vitest run src/api/legacyPublic.api.test.ts && npx tsc --noEmit && npm run build`
Expected: PASS, no errors.

- [ ] **Step 7: Commit**

```bash
git add portfolioos/apps/web/src/api/legacyPublic.api.ts portfolioos/apps/web/src/api/legacyPublic.api.test.ts portfolioos/apps/web/src/pages/legacy/LegacyLinkPage.tsx portfolioos/apps/web/src/pages/legacy/LegacyAccessPage.tsx portfolioos/apps/web/src/App.tsx
git commit -m "feat(legacy): public link pages and nominee view"
```

---

### Task 15: Time-travel script, manual QA, docs

**Files:**
- Create: `portfolioos/packages/api/src/scripts/legacyTimeTravel.ts`
- Create: `portfolioos/packages/api/test/manual-qa-legacy-transfer.md`
- Modify: `portfolioos/docs/legacy-transfer/01-DESIGN.md` (sync decisions made during the plan)

- [ ] **Step 1: Script** (dev-only; refuses in production)

```ts
// src/scripts/legacyTimeTravel.ts
// Usage: tsx src/scripts/legacyTimeTravel.ts <ownerEmail> <YYYY-MM-DD>
// Runs the daily Legacy tick as if today were <date>. Dev/QA only.
import { prisma } from '../lib/prisma.js';
import { runAsSystem } from '../lib/requestContext.js';
import { runLegacyTick } from '../services/legacy/runner.service.js';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('legacyTimeTravel refuses to run in production');
  const [email, day] = process.argv.slice(2);
  if (!email || !/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) throw new Error('usage: legacyTimeTravel <ownerEmail> <YYYY-MM-DD>');
  const now = new Date(`${day}T04:30:00Z`);
  const out = await runLegacyTick(now);
  const plan = await runAsSystem(() => prisma.legacyPlan.findFirst({ where: { user: { email } } }));
  console.log(JSON.stringify({ now, out, status: plan?.status, cycle: plan?.cycle }, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Manual QA checklist** (`test/manual-qa-legacy-transfer.md`), run on Docker Postgres + the local web app:

```markdown
# Manual QA — Legacy Transfer

Setup: local API + web, Docker Postgres, SMTP pointed at a test inbox. User A on PLUS. Two test nominee inboxes.

- [ ] FREE user: /legacy shows upgrade card; Add nominee / Turn on disabled; API returns 403.
- [ ] PLUS user: first save asks for a code (emailed, or TOTP if 2FA on); later saves within 15 min don't ask.
- [ ] Inactivity < 30 rejected in UI and API.
- [ ] Add 2 nominees (one verifier, one with amounts off). Turn on → both get "named you as trusted contact" email, with no amounts in it.
- [ ] Nominee clicks Confirm → owner list shows "confirmed".
- [ ] Owner gets "plan was changed" email after each change.
- [ ] Time-travel to day 90 → WARNING_1 email to owner with "I'm OK".
- [ ] Click "I'm OK" → page says reset; /legacy shows On with a new first-warning date.
- [ ] Time-travel through WARNING_1/2/FINAL/GRACE → nominees get "about A's plan" mail; verifier gets Answer mail.
- [ ] Verifier "No, they're fine" → ARMED; owner gets "verifier said you are OK"; nominees get "A is active again".
- [ ] Walk to GRACE again; owner signs in (any page) → next tick resets and nominees are told.
- [ ] Walk to RELEASED → nominees get "shared with you" mail; owner gets "released" mail.
- [ ] Nominee opens link → code email → view. Amounts-off nominee sees no ₹ anywhere (also check the network tab JSON).
- [ ] PDF download works; document download works only for shared docs.
- [ ] Wrong code 5× → locked message; the right code is refused during the lock.
- [ ] The nominee session header on /api/dashboard → 401.
- [ ] Owner revokes all → nominee's open page fails on refresh; nominees get "withdrew access" mail.
- [ ] Remove a nominee while RELEASED → their access ends at once.
- [ ] Scheduled trigger: date 10 days out → reminder at T-7 and T-1; release on T, no grace.
- [ ] Pause 30 days during WARNING_2 → no mails; resume → ARMED.
- [ ] Downgrade A to FREE while ARMED → plan still walks to RELEASED; A can still revoke/pause/remove but not add.
- [ ] Mobile 375px: /legacy, nominee dialog, access page have no horizontal scroll.
- [ ] Delete account A → all Legacy rows gone.
```

- [ ] **Step 3: Sync the design doc.** In `01-DESIGN.md`:
  - §4 step 7 and the paragraph after it: replace "password re-entry, plus the 2FA code if 2FA is on" with "a step-up code: the TOTP/backup code if 2FA is on, otherwise a 6-digit code emailed to the owner (Google-only users have no password); the grant lasts 15 minutes".
  - §4 step 3: delete the `revealIdentifiers` bullet; add "Identifiers are always last-4 only in v1."
  - §4 step 8 and §7.1: release goes to **every** nominee, acknowledged or not; acknowledgement is only an owner-facing warning.
  - §7.3: "a short-lived legacy session sent as the `X-Legacy-Session` header (sessionStorage on the client), not a cookie".
  - §9 account deletion: "no nominee notice in v1 (would leak information about a living person)".
  - §10: replace the model sketch with a pointer to `schema.prisma` (`LegacyPlan`, `LegacyNominee`, `LegacyToken`, `LegacyCode`, `LegacyOutbox`).
  - §6: "Public link actions are POST from a button page so link-preview bots can't trigger them."

- [ ] **Step 4: Full verification**

Run (from `portfolioos/`): `pnpm -r run build && pnpm -r run typecheck && pnpm -r run lint && pnpm --filter @portfolioos/api exec vitest run test/legacy && pnpm --filter web exec vitest run src/api/legacy`
Expected: all green. Then work through the manual QA checklist.

- [ ] **Step 5: Commit**

```bash
git add portfolioos/packages/api/src/scripts/legacyTimeTravel.ts portfolioos/packages/api/test/manual-qa-legacy-transfer.md portfolioos/docs/legacy-transfer/01-DESIGN.md
git commit -m "docs(legacy): QA checklist, time-travel script, design sync"
```

---

## Out of scope (tracked)

- **SMS channel**: design §11. Needs a paid DLT-registered SMS provider. The outbox gains a `channel` column; no state-machine change.
- Full (unmasked) identifiers for nominees.
- Multiple verifiers / quorum.
- Nominee notice on owner account deletion.
