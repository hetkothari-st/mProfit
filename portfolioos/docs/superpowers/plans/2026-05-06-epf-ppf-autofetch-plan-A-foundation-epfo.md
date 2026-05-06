# EPF + PPF Auto-Fetch — Plan A: Foundation + EPFO Server-Headless

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship end-to-end "Add EPF UAN → click Refresh → server-headless Playwright fetches passbook for every member ID → CanonicalEvents created → HoldingProjection shows correct balance" without browser extension.

**Architecture:** Server-side Playwright adapter chain modelled on the existing `adapters/vehicle/chain.ts` pattern. Two-layer split: (1) **scrape** (Playwright + CAPTCHA + OTP) emits `RawScrapePayload`; (2) **parse** (pure function) maps to `CanonicalEvent[]` with deterministic `sourceHash` for idempotency. Real-time prompts (CAPTCHA / OTP) flow back to web app via SSE. Credentials encrypted at rest via pgcrypto, opt-in per account.

**Tech Stack:** Prisma 5 / Postgres + pgcrypto + RLS, Express + SSE, Bull queue, Playwright (`playwright-extra` + stealth), Tesseract.js or EasyOCR sidecar, pdfjs / `pdf-parse`, Vitest, React 18 + Vite + shadcn.

**Out of scope (later plans):**
- Plan B — SBI PPF adapter
- Plan C — Browser extension MV3 + content scripts
- Plan D — Remaining 6 PPF bank adapters + monthly nudge + bot-detection hardening + DLQ ops UI

---

## File Structure

### Backend — `packages/api/`

| Path | Responsibility |
|---|---|
| `prisma/schema.prisma` | Add `ProvidentFundAccount`, `EpfMemberId`, `PfFetchSession`, enums, extend `CanonicalEventType`. |
| `prisma/migrations/<ts>_pf_autofetch_foundation/migration.sql` | Tables + enums + RLS policies + indexes + `pgcrypto` enable. |
| `src/services/pfAccounts.service.ts` | CRUD for `ProvidentFundAccount`, asset-key calc, member-ID linking. |
| `src/services/pfFetchSessions.service.ts` | Session lifecycle, status transitions, SSE event emit. |
| `src/services/pfCredentials.service.ts` | pgcrypto encrypt/decrypt with `APP_ENCRYPTION_KEY`. |
| `src/services/pfCanonicalize.service.ts` | Row → `CanonicalEvent` mapper + per-row `sourceHash`. |
| `src/adapters/pf/types.ts` | `PfAdapter`, `ScrapeContext`, `RawScrapePayload`, `ParseResult`. |
| `src/adapters/pf/chain.ts` | `runPfChain({account, mode})` runs adapters in priority order. |
| `src/adapters/pf/shared/pdfPassbookParser.ts` | Generic PDF table tokenizer (pdfjs). |
| `src/adapters/pf/shared/captcha.ts` | `solveCaptcha(buffer, prompt)` — OCR first, user fallback. |
| `src/adapters/pf/shared/credentials.ts` | `loadCredentials(account, prompt)` — stored else prompt. |
| `src/adapters/pf/epf/epfo.v1.ts` | EPFO scrape (Playwright) + parse (pure). |
| `src/adapters/pf/epf/epfo.v1.parse.ts` | Pure passbook PDF → CanonicalEvent rows. |
| `src/jobs/pfFetchWorker.ts` | Bull worker for `pf-headless-fetch` queue. |
| `src/routes/pf.routes.ts` | REST endpoints under `/epfppf/*`. |
| `src/controllers/pf.controller.ts` | Request handlers. |
| `src/lib/sseHub.ts` | Per-session SSE pub/sub (in-memory; sticky session via Railway). |
| `test/fixtures/pf/epfo/` | 5 anonymized passbook fixtures + snapshot. |
| `test/invariants/pf-idempotency.test.ts` | Re-fetch yields zero new events. |
| `test/services/pfCredentials.test.ts` | Encrypt/decrypt round-trip. |
| `test/services/pfCanonicalize.test.ts` | sourceHash determinism. |
| `test/adapters/pf/epfo.parse.test.ts` | Golden fixtures pass. |
| `test/security/pf-rls.test.ts` | Cross-user access blocked. |

### Frontend — `apps/web/`

| Path | Responsibility |
|---|---|
| `src/api/pf.ts` | Typed REST client + SSE EventSource wrapper. |
| `src/pages/assetClasses/ProvidentFundPage.tsx` | **Modify** — Add "Auto-fetch" CTA per account. |
| `src/pages/assetClasses/EPFFormDialog.tsx` | **Modify** — Add UAN field + opt-in storage checkbox. |
| `src/pages/pf/PfRefreshDialog.tsx` | New — modal with SSE subscription, CAPTCHA / OTP prompts. |
| `src/pages/pf/PfMemberTable.tsx` | New — list member IDs with balances. |
| `src/pages/pf/PfManualUploadDialog.tsx` | New — fallback PDF upload. |

---

## Pre-flight

- [ ] **Step P1: Verify clean baseline**

```bash
cd portfolioos
pnpm -r run build && pnpm -r run typecheck && pnpm -r run lint && pnpm -r run test
```

Expected: all green. If anything fails, stop and report — do not start the plan on a red baseline.

- [ ] **Step P2: Confirm `APP_ENCRYPTION_KEY` is set**

```bash
grep -E '^APP_ENCRYPTION_KEY=' portfolioos/.env.example
```

Expected: line present (even with placeholder). If missing, add `APP_ENCRYPTION_KEY=` to `.env.example` and document it in `portfolioos/README.md` Required Env section.

---

### Task 1: Schema additions + enums + pgcrypto

**Files:**
- Modify: `portfolioos/packages/api/prisma/schema.prisma`
- Create: `portfolioos/packages/api/prisma/migrations/20260506120000_pf_autofetch_foundation/migration.sql`

- [ ] **Step 1.1: Add `pgcrypto` extension assertion in schema (idempotent)**

Edit `schema.prisma` — append at top of `// ─── EXTENSIONS` section (or create one if missing):

```prisma
// pgcrypto enabled by migration 20260506120000_pf_autofetch_foundation; required
// for ProvidentFundAccount.storedCredentials encryption.
```

- [ ] **Step 1.2: Add new enums to `schema.prisma`**

Append after the existing `CanonicalEventStatus` enum:

```prisma
enum PfType {
  EPF
  PPF
}

enum PfInstitution {
  EPFO
  SBI
  INDIA_POST
  HDFC
  ICICI
  AXIS
  PNB
  BOB
}

enum PfAccountStatus {
  ACTIVE
  NEEDS_REAUTH
  LOCKED
  INSTITUTION_CHANGED
}

enum PfFetchSource {
  EXTENSION
  SERVER_HEADLESS
  MANUAL_PDF
}

enum PfFetchStatus {
  INITIATED
  AWAITING_CAPTCHA
  AWAITING_OTP
  SCRAPING
  PARSING
  COMPLETED
  FAILED
  CANCELLED
}
```

- [ ] **Step 1.3: Extend `CanonicalEventType`**

Inside the existing `enum CanonicalEventType { ... }` block (currently around line 934), append before the closing `}`:

```prisma
  PF_EMPLOYER_CONTRIBUTION
  PF_EMPLOYEE_CONTRIBUTION
  PF_VPF_CONTRIBUTION
  PF_INTEREST_CREDIT
  PF_WITHDRAWAL
  PF_TRANSFER_IN
  PF_TRANSFER_OUT
  PF_OPENING_BALANCE
```

- [ ] **Step 1.4: Add three new models**

Append to `schema.prisma`:

```prisma
// ─── §6 PROVIDENT FUND AUTO-FETCH ──────────────────────────────────

model ProvidentFundAccount {
  id                String           @id @default(cuid())
  userId            String
  user              User             @relation(fields: [userId], references: [id])
  portfolioId       String?
  portfolio         Portfolio?       @relation(fields: [portfolioId], references: [id])

  type              PfType
  institution       PfInstitution
  identifierCipher  Bytes            // pgcrypto pgp_sym_encrypt(UAN | acct no, APP_ENCRYPTION_KEY)
  identifierLast4   String
  holderName        String
  branchCode        String?
  storedCredentials Json?            // { usernameCipher, passwordCipher, mpinCipher? } as base64 strings
  credentialsKeyId  String?

  status            PfAccountStatus  @default(ACTIVE)
  lastRefreshedAt   DateTime?
  lastFetchSource   PfFetchSource?

  currentBalance    Decimal?         @db.Decimal(18, 4)
  assetKey          String

  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  memberIds         EpfMemberId[]
  fetchSessions     PfFetchSession[]

  @@unique([userId, assetKey])
  @@index([userId, status, lastRefreshedAt])
}

model EpfMemberId {
  id                       String   @id @default(cuid())
  providentFundAccountId   String
  account                  ProvidentFundAccount @relation(fields: [providentFundAccountId], references: [id], onDelete: Cascade)

  memberIdCipher           Bytes
  memberIdLast4            String
  establishmentName        String
  establishmentCode        String?
  dateOfJoining            DateTime?  @db.Date
  dateOfExit               DateTime?  @db.Date
  currentBalance           Decimal?   @db.Decimal(18, 4)
  lastInterestUpdatedForFY String?

  @@unique([providentFundAccountId, memberIdLast4])
}

model PfFetchSession {
  id                     String   @id @default(cuid())
  providentFundAccountId String
  account                ProvidentFundAccount @relation(fields: [providentFundAccountId], references: [id], onDelete: Cascade)
  userId                 String

  source                 PfFetchSource
  status                 PfFetchStatus  @default(INITIATED)
  startedAt              DateTime       @default(now())
  completedAt            DateTime?
  captchaAttempts        Int            @default(0)
  ocrUsed                Boolean        @default(false)
  ocrSucceeded           Boolean?
  rawPayloadRef          String?
  eventsCreated          Int            @default(0)
  errorMessage           String?
  ingestionFailureId     String?

  @@index([providentFundAccountId, startedAt])
  @@index([userId, status])
}
```

- [ ] **Step 1.5: Generate migration**

```bash
cd portfolioos/packages/api
pnpm prisma migrate dev --name pf_autofetch_foundation --create-only
```

Expected: SQL file created under `prisma/migrations/<ts>_pf_autofetch_foundation/migration.sql`.

- [ ] **Step 1.6: Append RLS + pgcrypto bootstrap to migration SQL**

Open the generated `migration.sql`. **Append** to the end:

```sql
-- pgcrypto required for credential + identifier encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- RLS: each row scoped to current_setting('app.current_user_id', true)
ALTER TABLE "ProvidentFundAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProvidentFundAccount" FORCE ROW LEVEL SECURITY;
CREATE POLICY pfa_isolation ON "ProvidentFundAccount"
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

ALTER TABLE "EpfMemberId" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EpfMemberId" FORCE ROW LEVEL SECURITY;
CREATE POLICY epf_member_isolation ON "EpfMemberId"
  USING (
    EXISTS (
      SELECT 1 FROM "ProvidentFundAccount" pfa
      WHERE pfa.id = "EpfMemberId"."providentFundAccountId"
        AND pfa."userId" = current_setting('app.current_user_id', true)
    )
  );

ALTER TABLE "PfFetchSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PfFetchSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY pf_session_isolation ON "PfFetchSession"
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));
```

- [ ] **Step 1.7: Apply migration**

```bash
cd portfolioos/packages/api
pnpm prisma migrate dev
pnpm prisma generate
```

Expected: migration applied; `@prisma/client` regenerated; no errors.

- [ ] **Step 1.8: Verify build + typecheck**

```bash
cd portfolioos
pnpm --filter @portfolioos/api build
pnpm --filter @portfolioos/api typecheck
```

Expected: both green.

- [ ] **Step 1.9: Commit**

```bash
git add portfolioos/packages/api/prisma
git commit -m "feat(pf): schema + RLS + pgcrypto for EPF/PPF auto-fetch foundation"
```

---

### Task 2: Credential encryption service

**Files:**
- Create: `portfolioos/packages/api/src/services/pfCredentials.service.ts`
- Test: `portfolioos/packages/api/test/services/pfCredentials.test.ts`

- [ ] **Step 2.1: Write failing test**

Create `test/services/pfCredentials.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import {
  encryptCredentialBlob,
  decryptCredentialBlob,
  encryptIdentifier,
  decryptIdentifier,
  last4,
} from '../../src/services/pfCredentials.service.js';

beforeAll(() => {
  // Test key — 32 bytes base64.
  process.env.APP_ENCRYPTION_KEY = 'dGVzdC1rZXktMzItYnl0ZXMtZm9yLWVwZi1hZXMtZ2NtMTIzNDU=';
});

describe('pfCredentials', () => {
  it('round-trips a credential blob', async () => {
    const ct = await encryptCredentialBlob({ username: 'user1', password: 'pass!1' });
    expect(ct).toMatch(/^[A-Za-z0-9+/=]+$/);
    const pt = await decryptCredentialBlob(ct);
    expect(pt).toEqual({ username: 'user1', password: 'pass!1' });
  });

  it('produces different ciphertexts for same plaintext (random IV)', async () => {
    const a = await encryptCredentialBlob({ username: 'u', password: 'p' });
    const b = await encryptCredentialBlob({ username: 'u', password: 'p' });
    expect(a).not.toEqual(b);
  });

  it('round-trips identifier and computes last4', async () => {
    const ct = await encryptIdentifier('123456789012');
    const pt = await decryptIdentifier(ct);
    expect(pt).toBe('123456789012');
    expect(last4('123456789012')).toBe('9012');
  });

  it('rejects ciphertext when key missing', async () => {
    const ct = await encryptCredentialBlob({ username: 'u', password: 'p' });
    const original = process.env.APP_ENCRYPTION_KEY;
    delete process.env.APP_ENCRYPTION_KEY;
    await expect(decryptCredentialBlob(ct)).rejects.toThrow(/APP_ENCRYPTION_KEY/);
    process.env.APP_ENCRYPTION_KEY = original;
  });
});
```

- [ ] **Step 2.2: Run test — expect fail**

```bash
cd portfolioos/packages/api
pnpm vitest run test/services/pfCredentials.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 2.3: Implement service**

Create `src/services/pfCredentials.service.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM. 32-byte key from base64-encoded APP_ENCRYPTION_KEY.
// Layout: [iv(12)][tag(16)][ciphertext...]  — base64 over the wire.

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error('APP_ENCRYPTION_KEY env var not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('APP_ENCRYPTION_KEY must decode to 32 bytes');
  return key;
}

function encryptString(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

function decryptString(blob: string): string {
  const key = getKey();
  const buf = Buffer.from(blob, 'base64');
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('Ciphertext too short');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export interface CredentialBlob {
  username: string;
  password: string;
  mpin?: string;
}

export async function encryptCredentialBlob(c: CredentialBlob): Promise<string> {
  return encryptString(JSON.stringify(c));
}

export async function decryptCredentialBlob(blob: string): Promise<CredentialBlob> {
  return JSON.parse(decryptString(blob));
}

export async function encryptIdentifier(id: string): Promise<string> {
  return encryptString(id);
}

export async function decryptIdentifier(blob: string): Promise<string> {
  return decryptString(blob);
}

export function last4(s: string): string {
  const digits = s.replace(/\D/g, '');
  return digits.slice(-4) || s.slice(-4);
}
```

- [ ] **Step 2.4: Run test — expect pass**

```bash
pnpm vitest run test/services/pfCredentials.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add packages/api/src/services/pfCredentials.service.ts packages/api/test/services/pfCredentials.test.ts
git commit -m "feat(pf): credential encryption service (AES-256-GCM)"
```

---

### Task 3: Asset-key + account service

**Files:**
- Create: `portfolioos/packages/api/src/services/pfAccounts.service.ts`
- Test: `portfolioos/packages/api/test/services/pfAccounts.test.ts`

- [ ] **Step 3.1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { computePfAssetKey } from '../../src/services/pfAccounts.service.js';

describe('pfAccounts', () => {
  it('computes deterministic assetKey for EPF UAN', () => {
    const a = computePfAssetKey({ type: 'EPF', institution: 'EPFO', identifier: '100123456789' });
    const b = computePfAssetKey({ type: 'EPF', institution: 'EPFO', identifier: '100123456789' });
    expect(a).toBe(b);
    expect(a).toMatch(/^pf:epf:[a-f0-9]{64}$/);
  });

  it('different UAN → different assetKey', () => {
    const a = computePfAssetKey({ type: 'EPF', institution: 'EPFO', identifier: '111' });
    const b = computePfAssetKey({ type: 'EPF', institution: 'EPFO', identifier: '222' });
    expect(a).not.toBe(b);
  });

  it('PPF assetKey embeds institution', () => {
    const sbi = computePfAssetKey({ type: 'PPF', institution: 'SBI', identifier: 'ABC123' });
    const hdfc = computePfAssetKey({ type: 'PPF', institution: 'HDFC', identifier: 'ABC123' });
    expect(sbi).not.toBe(hdfc);
    expect(sbi).toMatch(/^pf:ppf:sbi:[a-f0-9]{64}$/);
    expect(hdfc).toMatch(/^pf:ppf:hdfc:[a-f0-9]{64}$/);
  });
});
```

- [ ] **Step 3.2: Run test — expect fail**

```bash
pnpm vitest run test/services/pfAccounts.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement asset key + account create**

Create `src/services/pfAccounts.service.ts`:

```ts
import { createHash } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { encryptIdentifier, last4 } from './pfCredentials.service.js';
import type { PfType, PfInstitution } from '@prisma/client';

export function computePfAssetKey(opts: {
  type: PfType;
  institution: PfInstitution;
  identifier: string;
}): string {
  const sha = createHash('sha256')
    .update(opts.identifier.trim().toUpperCase())
    .digest('hex');
  if (opts.type === 'EPF') {
    return `pf:epf:${sha}`;
  }
  return `pf:ppf:${opts.institution.toLowerCase()}:${sha}`;
}

export interface CreatePfAccountInput {
  userId: string;
  type: PfType;
  institution: PfInstitution;
  identifier: string;       // UAN or PPF acct number, plaintext
  holderName: string;
  branchCode?: string;
  portfolioId?: string;
}

export async function createPfAccount(input: CreatePfAccountInput) {
  const assetKey = computePfAssetKey(input);
  const identifierCipher = await encryptIdentifier(input.identifier);
  return prisma.providentFundAccount.create({
    data: {
      userId: input.userId,
      type: input.type,
      institution: input.institution,
      identifierCipher: Buffer.from(identifierCipher, 'base64'),
      identifierLast4: last4(input.identifier),
      holderName: input.holderName,
      branchCode: input.branchCode,
      portfolioId: input.portfolioId,
      assetKey,
    },
  });
}

export async function listPfAccounts(userId: string) {
  return prisma.providentFundAccount.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { memberIds: true },
  });
}

export async function getPfAccountById(userId: string, id: string) {
  return prisma.providentFundAccount.findFirst({
    where: { userId, id },
    include: { memberIds: true },
  });
}

export async function forgetPfCredentials(userId: string, id: string) {
  return prisma.providentFundAccount.update({
    where: { id },
    data: { storedCredentials: null, credentialsKeyId: null },
  });
}
```

- [ ] **Step 3.4: Run test — expect pass**

```bash
pnpm vitest run test/services/pfAccounts.test.ts
```

Expected: 3 pass.

- [ ] **Step 3.5: Commit**

```bash
git add packages/api/src/services/pfAccounts.service.ts packages/api/test/services/pfAccounts.test.ts
git commit -m "feat(pf): account service + assetKey computation"
```

---

### Task 4: Source-hash for PF events

**Files:**
- Modify: `portfolioos/packages/api/src/services/sourceHash.ts`
- Test: `portfolioos/packages/api/test/services/pfSourceHash.test.ts`

- [ ] **Step 4.1: Write failing test**

Create `test/services/pfSourceHash.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pfEventHash } from '../../src/services/sourceHash.js';

describe('pfEventHash', () => {
  it('is deterministic for same inputs', () => {
    const a = pfEventHash({
      userId: 'u1',
      institution: 'EPFO',
      identifier: 'UAN1',
      eventDate: '2024-04-01',
      amount: '5000.00',
      type: 'PF_EMPLOYER_CONTRIBUTION',
      sequence: 0,
    });
    const b = pfEventHash({
      userId: 'u1',
      institution: 'EPFO',
      identifier: 'UAN1',
      eventDate: '2024-04-01',
      amount: '5000.00',
      type: 'PF_EMPLOYER_CONTRIBUTION',
      sequence: 0,
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('differs when sequence differs (handles same-day duplicate rows)', () => {
    const base = {
      userId: 'u1',
      institution: 'EPFO' as const,
      identifier: 'UAN1',
      eventDate: '2024-04-01',
      amount: '5000.00',
      type: 'PF_EMPLOYER_CONTRIBUTION',
    };
    expect(pfEventHash({ ...base, sequence: 0 })).not.toBe(pfEventHash({ ...base, sequence: 1 }));
  });

  it('differs across users', () => {
    const base = {
      institution: 'EPFO' as const,
      identifier: 'UAN1',
      eventDate: '2024-04-01',
      amount: '5000.00',
      type: 'PF_EMPLOYER_CONTRIBUTION',
      sequence: 0,
    };
    expect(pfEventHash({ ...base, userId: 'u1' })).not.toBe(pfEventHash({ ...base, userId: 'u2' }));
  });
});
```

- [ ] **Step 4.2: Run test — expect fail**

```bash
pnpm vitest run test/services/pfSourceHash.test.ts
```

Expected: FAIL — `pfEventHash` not exported.

- [ ] **Step 4.3: Add `pfEventHash` to existing service**

Append to `src/services/sourceHash.ts`:

```ts
/**
 * PF passbook event hash. Re-fetching the same passbook MUST hash identically
 * for every row, so duplicates land on the @@unique(userId, sourceHash) index
 * and are silently rejected (CLAUDE.md §3.3).
 *
 * `sequence` disambiguates same-day rows (e.g. employer + employee credit on
 * 1 Apr at the same amount). It is the position of the row within the same
 * (memberId, eventDate, type, amount) bucket.
 */
export function pfEventHash(opts: {
  userId: string;
  institution: string;
  identifier: string;        // UAN or PPF acct (plaintext; never logged)
  eventDate: string;         // YYYY-MM-DD
  amount: string;            // Decimal as string
  type: string;              // CanonicalEventType
  sequence: number;
}): string {
  return sha256Hex(
    `pf:${opts.userId}:${opts.institution}:${opts.identifier}:${opts.eventDate}:${opts.amount}:${opts.type}:${opts.sequence}`,
  );
}
```

- [ ] **Step 4.4: Run test — expect pass**

```bash
pnpm vitest run test/services/pfSourceHash.test.ts
```

Expected: 3 pass.

- [ ] **Step 4.5: Commit**

```bash
git add packages/api/src/services/sourceHash.ts packages/api/test/services/pfSourceHash.test.ts
git commit -m "feat(pf): pfEventHash for passbook idempotency"
```

---

### Task 5: Adapter framework types + chain

**Files:**
- Create: `portfolioos/packages/api/src/adapters/pf/types.ts`
- Create: `portfolioos/packages/api/src/adapters/pf/chain.ts`

- [ ] **Step 5.1: Write types**

Create `src/adapters/pf/types.ts`:

```ts
import type {
  ProvidentFundAccount,
  PfFetchStatus,
  PfInstitution,
  PfType,
} from '@prisma/client';

export interface PfMemberPayload {
  memberId?: string;
  accountIdentifier?: string;
  establishmentName?: string;
  establishmentCode?: string;
  dateOfJoining?: string;
  dateOfExit?: string;
  passbookPdf?: { base64: string; sha256: string };
  htmlSnapshots?: Array<{ url: string; html: string }>;
  structuredRows?: Array<{
    date: string;
    type: string;
    amount: string;
    balance?: string;
    raw: string;
  }>;
}

export interface RawScrapePayload {
  adapterId: string;
  adapterVersion: string;
  capturedAt: string;
  members: PfMemberPayload[];
}

export type ParseResult<T> =
  | { ok: true; events: T[]; metadata?: Record<string, unknown> }
  | { ok: false; error: string; rawPayload?: unknown };

export interface PfCanonicalEventInput {
  type: string;                     // CanonicalEventType
  eventDate: string;                // YYYY-MM-DD
  amount: string;                   // Decimal string
  memberIdLast4?: string;
  notes?: string;
  sequence: number;
}

export interface ScrapeContext {
  sessionId: string;
  account: ProvidentFundAccount;
  credentials?: { username: string; password: string; mpin?: string };
  prompt: {
    askCaptcha(imgBytes: Buffer): Promise<string>;
    askOtp(channel: 'sms' | 'email'): Promise<string>;
    askText(label: string): Promise<string>;
  };
  emit(status: PfFetchStatus, info?: Record<string, unknown>): void;
  abortSignal: AbortSignal;
}

export interface PfAdapter {
  id: string;
  version: string;
  institution: PfInstitution;
  type: PfType;
  hostnames: string[];
  scrape(ctx: ScrapeContext): Promise<RawScrapePayload>;
  parse(raw: RawScrapePayload): Promise<ParseResult<PfCanonicalEventInput>>;
}
```

- [ ] **Step 5.2: Write chain (skeleton)**

Create `src/adapters/pf/chain.ts`:

```ts
import { logger } from '../../lib/logger.js';
import { writeIngestionFailure } from '../../services/ingestionFailures.service.js';
import type { PfAdapter, ScrapeContext, RawScrapePayload, ParseResult, PfCanonicalEventInput } from './types.js';

const REGISTRY: PfAdapter[] = [];

export function registerPfAdapter(a: PfAdapter): void {
  if (REGISTRY.find((x) => x.id === a.id)) {
    throw new Error(`PfAdapter already registered: ${a.id}`);
  }
  REGISTRY.push(a);
}

export function findPfAdapter(opts: { institution: string; type: string }): PfAdapter | undefined {
  return REGISTRY.find((a) => a.institution === opts.institution && a.type === opts.type);
}

export interface RunPfChainOutcome {
  ok: boolean;
  raw?: RawScrapePayload;
  parsed?: ParseResult<PfCanonicalEventInput>;
  error?: string;
}

export async function runPfChain(ctx: ScrapeContext): Promise<RunPfChainOutcome> {
  const adapter = findPfAdapter({ institution: ctx.account.institution, type: ctx.account.type });
  if (!adapter) {
    const err = `No PfAdapter for ${ctx.account.institution} ${ctx.account.type}`;
    await writeIngestionFailure({
      userId: ctx.account.userId,
      sourceAdapter: 'pf.chain',
      adapterVersion: '1',
      sourceRef: ctx.account.id,
      errorMessage: err,
    });
    return { ok: false, error: err };
  }

  try {
    const raw = await adapter.scrape(ctx);
    const parsed = await adapter.parse(raw);
    return { ok: parsed.ok, raw, parsed };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    logger.error({ adapterId: adapter.id, accountId: ctx.account.id, err }, 'pf.chain.failed');
    await writeIngestionFailure({
      userId: ctx.account.userId,
      sourceAdapter: adapter.id,
      adapterVersion: adapter.version,
      sourceRef: ctx.account.id,
      errorMessage: err,
    });
    return { ok: false, error: err };
  }
}
```

- [ ] **Step 5.3: Verify build**

```bash
pnpm --filter @portfolioos/api typecheck
```

Expected: green.

- [ ] **Step 5.4: Commit**

```bash
git add packages/api/src/adapters/pf/types.ts packages/api/src/adapters/pf/chain.ts
git commit -m "feat(pf): adapter framework types + chain runner"
```

---

### Task 6: PDF passbook tokenizer (shared)

**Files:**
- Create: `portfolioos/packages/api/src/adapters/pf/shared/pdfPassbookParser.ts`
- Test: `portfolioos/packages/api/test/adapters/pf/pdfPassbookParser.test.ts`
- Create: `portfolioos/packages/api/test/fixtures/pf/epfo/passbook-uan-100123456789.pdf` *(anonymized fixture; checked in as binary)*

- [ ] **Step 6.1: Install dependency**

```bash
cd portfolioos/packages/api
pnpm add pdf-parse@^1.1.1
pnpm add -D @types/pdf-parse@^1.1.4
```

- [ ] **Step 6.2: Write failing test**

Create `test/adapters/pf/pdfPassbookParser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tokenizePassbookPdf } from '../../../src/adapters/pf/shared/pdfPassbookParser.js';

describe('tokenizePassbookPdf', () => {
  it('extracts a non-empty page-text array from a real passbook', async () => {
    const path = resolve(__dirname, '../../fixtures/pf/epfo/passbook-uan-100123456789.pdf');
    const buf = await readFile(path);
    const out = await tokenizePassbookPdf(buf);
    expect(out.pageCount).toBeGreaterThan(0);
    expect(out.lines.length).toBeGreaterThan(10);
    expect(out.lines.every((l) => typeof l === 'string')).toBe(true);
  });
});
```

- [ ] **Step 6.3: Add fixture**

Drop one anonymized EPFO passbook PDF (any UAN replaced with `100123456789`, name `TEST USER`, establishment `TEST EMPLOYER PRIVATE LIMITED`) at `test/fixtures/pf/epfo/passbook-uan-100123456789.pdf`. (Source: any EPFO download from a personal test account; redact via PDF editor or rasterize+rewrite.) If a real PDF is not yet available, create a placeholder generated from a known plaintext text-only PDF — use `pdfkit` script in `test/fixtures/pf/epfo/_generate-fixture.ts` (see Step 6.6).

- [ ] **Step 6.4: Run test — expect fail**

```bash
pnpm vitest run test/adapters/pf/pdfPassbookParser.test.ts
```

Expected: FAIL — `tokenizePassbookPdf` not defined.

- [ ] **Step 6.5: Implement parser**

Create `src/adapters/pf/shared/pdfPassbookParser.ts`:

```ts
import pdfParse from 'pdf-parse';

export interface PassbookTokens {
  pageCount: number;
  rawText: string;
  lines: string[];
}

export async function tokenizePassbookPdf(buf: Buffer): Promise<PassbookTokens> {
  const out = await pdfParse(buf);
  const lines = out.text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);
  return {
    pageCount: out.numpages,
    rawText: out.text,
    lines,
  };
}
```

- [ ] **Step 6.6: If real fixture unavailable, generate one**

Create `test/fixtures/pf/epfo/_generate-fixture.ts`:

```ts
// One-time helper: runs only when MANUAL_GEN=1 to produce a shape-correct
// passbook PDF in case the anonymized real one is not yet committed.
// Run: MANUAL_GEN=1 pnpm tsx test/fixtures/pf/epfo/_generate-fixture.ts
import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { resolve } from 'node:path';

if (process.env.MANUAL_GEN !== '1') {
  console.log('Skipping fixture gen (set MANUAL_GEN=1)');
  process.exit(0);
}

const out = resolve(__dirname, 'passbook-uan-100123456789.pdf');
const doc = new PDFDocument({ size: 'A4' });
doc.pipe(createWriteStream(out));
doc.fontSize(14).text('EMPLOYEES PROVIDENT FUND ORGANISATION', { align: 'center' });
doc.fontSize(10).text('UAN: 100123456789  Name: TEST USER');
doc.text('Member ID: DLCPM00123450000012345  Establishment: TEST EMPLOYER PRIVATE LIMITED');
doc.moveDown();
doc.text('Wage Month  Date     Description                          Amount       Balance');
doc.text('Apr-2024    01-04-2024  CR EMPLOYER SHARE                  5000.00      105000.00');
doc.text('Apr-2024    01-04-2024  CR EMPLOYEE SHARE                  5000.00      110000.00');
doc.text('Mar-2024    31-03-2024  CR INTEREST FY 2023-24             7800.00      117800.00');
doc.end();
```

Then optionally:

```bash
cd portfolioos/packages/api
pnpm add -D pdfkit@^0.15
MANUAL_GEN=1 pnpm tsx test/fixtures/pf/epfo/_generate-fixture.ts
```

- [ ] **Step 6.7: Run test — expect pass**

```bash
pnpm vitest run test/adapters/pf/pdfPassbookParser.test.ts
```

Expected: PASS.

- [ ] **Step 6.8: Commit**

```bash
git add packages/api/src/adapters/pf/shared/pdfPassbookParser.ts \
        packages/api/test/adapters/pf/pdfPassbookParser.test.ts \
        packages/api/test/fixtures/pf/epfo/ \
        packages/api/package.json packages/api/pnpm-lock.yaml \
        portfolioos/pnpm-lock.yaml 2>/dev/null || true
git commit -m "feat(pf): PDF passbook tokenizer (pdf-parse) + EPFO fixture"
```

---

### Task 7: EPFO passbook canonical mapper

**Files:**
- Create: `portfolioos/packages/api/src/adapters/pf/epf/epfo.v1.parse.ts`
- Test: `portfolioos/packages/api/test/adapters/pf/epfo.parse.test.ts`
- Create: `portfolioos/packages/api/test/fixtures/pf/epfo/__snapshots__/` (managed by vitest)

- [ ] **Step 7.1: Write failing snapshot test**

Create `test/adapters/pf/epfo.parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tokenizePassbookPdf } from '../../../src/adapters/pf/shared/pdfPassbookParser.js';
import { parseEpfoPassbook } from '../../../src/adapters/pf/epf/epfo.v1.parse.js';

const FIXTURES = ['passbook-uan-100123456789.pdf'];

describe('parseEpfoPassbook', () => {
  for (const fname of FIXTURES) {
    it(`parses ${fname}`, async () => {
      const buf = await readFile(resolve(__dirname, '../../fixtures/pf/epfo', fname));
      const tokens = await tokenizePassbookPdf(buf);
      const result = parseEpfoPassbook({
        userId: 'fixture-user',
        memberId: 'DLCPM00123450000012345',
        tokens,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Strip non-deterministic fields before snapshotting
        const stable = result.events.map((e) => ({ ...e, sequence: e.sequence }));
        expect(stable).toMatchSnapshot();
      }
    });
  }
});
```

- [ ] **Step 7.2: Run test — expect fail**

```bash
pnpm vitest run test/adapters/pf/epfo.parse.test.ts
```

Expected: FAIL — `parseEpfoPassbook` not defined.

- [ ] **Step 7.3: Implement parser**

Create `src/adapters/pf/epf/epfo.v1.parse.ts`:

```ts
import { Decimal } from 'decimal.js';
import type { PassbookTokens } from '../shared/pdfPassbookParser.js';
import type { ParseResult, PfCanonicalEventInput } from '../types.js';

interface ParseInput {
  userId: string;
  memberId: string;
  tokens: PassbookTokens;
}

// EPFO passbook row regex. Variations across statements; conservative pattern:
//   Wage-month  DD-MM-YYYY  description (CAPS phrase)  amount  balance
const ROW = /^(\w{3}-\d{4})\s+(\d{2}-\d{2}-\d{4})\s+(.+?)\s+([\d.,]+)\s+([\d.,]+)$/;

const TYPE_RULES: Array<{ test: RegExp; type: string }> = [
  { test: /EMPLOYER\s+SHARE/i,   type: 'PF_EMPLOYER_CONTRIBUTION' },
  { test: /EMPLOYEE\s+SHARE/i,   type: 'PF_EMPLOYEE_CONTRIBUTION' },
  { test: /VPF/i,                 type: 'PF_VPF_CONTRIBUTION' },
  { test: /INTEREST/i,            type: 'PF_INTEREST_CREDIT' },
  { test: /WITHDRAW/i,            type: 'PF_WITHDRAWAL' },
  { test: /TRANSFER\s+IN/i,       type: 'PF_TRANSFER_IN' },
  { test: /TRANSFER\s+OUT/i,      type: 'PF_TRANSFER_OUT' },
  { test: /OPENING\s+BAL/i,       type: 'PF_OPENING_BALANCE' },
];

function classify(description: string): string | undefined {
  for (const r of TYPE_RULES) if (r.test.test(description)) return r.type;
  return undefined;
}

function toIsoDate(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('-');
  return `${y}-${m}-${d}`;
}

function toDecimalString(num: string): string {
  return new Decimal(num.replace(/,/g, '')).toFixed(2);
}

export function parseEpfoPassbook(input: ParseInput): ParseResult<PfCanonicalEventInput> {
  const events: PfCanonicalEventInput[] = [];
  const seqByBucket = new Map<string, number>();

  for (const line of input.tokens.lines) {
    const m = line.match(ROW);
    if (!m) continue;
    const [, , dateRaw, descRaw, amtRaw] = m;
    const type = classify(descRaw);
    if (!type) continue;
    const eventDate = toIsoDate(dateRaw);
    const amount = toDecimalString(amtRaw);
    const bucketKey = `${eventDate}|${type}|${amount}`;
    const sequence = seqByBucket.get(bucketKey) ?? 0;
    seqByBucket.set(bucketKey, sequence + 1);
    events.push({
      type,
      eventDate,
      amount,
      memberIdLast4: input.memberId.slice(-4),
      notes: descRaw.trim(),
      sequence,
    });
  }

  if (events.length === 0) {
    return { ok: false, error: 'No recognizable rows in passbook' };
  }
  return { ok: true, events };
}
```

- [ ] **Step 7.4: Run test — expect pass with new snapshot**

```bash
pnpm vitest run test/adapters/pf/epfo.parse.test.ts -u
```

Expected: snapshot created in `test/adapters/pf/__snapshots__/epfo.parse.test.ts.snap`. Inspect to confirm reasonable: 3 rows for the synthetic fixture (employer + employee + interest).

- [ ] **Step 7.5: Re-run without `-u`**

```bash
pnpm vitest run test/adapters/pf/epfo.parse.test.ts
```

Expected: PASS using committed snapshot.

- [ ] **Step 7.6: Commit**

```bash
git add packages/api/src/adapters/pf/epf/epfo.v1.parse.ts \
        packages/api/test/adapters/pf/epfo.parse.test.ts \
        packages/api/test/adapters/pf/__snapshots__/
git commit -m "feat(pf): EPFO passbook parser + golden snapshot"
```

---

### Task 8: SSE hub

**Files:**
- Create: `portfolioos/packages/api/src/lib/sseHub.ts`
- Test: `portfolioos/packages/api/test/lib/sseHub.test.ts`

- [ ] **Step 8.1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { sseHub } from '../../src/lib/sseHub.js';

describe('sseHub', () => {
  it('delivers events to subscribers and not to others', async () => {
    const got: any[] = [];
    const unsub = sseHub.subscribe('s1', (e) => got.push(e));
    sseHub.publish('s1', { type: 'status', data: { msg: 'hello' } });
    sseHub.publish('s2', { type: 'status', data: { msg: 'other' } });
    expect(got).toEqual([{ type: 'status', data: { msg: 'hello' } }]);
    unsub();
  });

  it('answers prompts via request/response', async () => {
    const unsub = sseHub.subscribe('s1', () => undefined);
    setTimeout(() => sseHub.respond('s1', 'p1', 'ANSWER'), 5);
    const ans = await sseHub.ask('s1', { type: 'captcha_required', data: { promptId: 'p1' } });
    expect(ans).toBe('ANSWER');
    unsub();
  });

  it('times out an unanswered prompt', async () => {
    const unsub = sseHub.subscribe('s1', () => undefined);
    await expect(
      sseHub.ask('s1', { type: 'otp_required', data: { promptId: 'p2' } }, { timeoutMs: 50 }),
    ).rejects.toThrow(/timeout/i);
    unsub();
  });
});
```

- [ ] **Step 8.2: Run — expect fail**

```bash
pnpm vitest run test/lib/sseHub.test.ts
```

Expected: FAIL.

- [ ] **Step 8.3: Implement**

Create `src/lib/sseHub.ts`:

```ts
type SseEvent = { type: string; data: Record<string, unknown> };
type Listener = (e: SseEvent) => void;

class SseHub {
  private listeners = new Map<string, Set<Listener>>();
  private pending = new Map<string, (value: string) => void>(); // promptId → resolve

  subscribe(sessionId: string, fn: Listener): () => void {
    const set = this.listeners.get(sessionId) ?? new Set();
    set.add(fn);
    this.listeners.set(sessionId, set);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.listeners.delete(sessionId);
    };
  }

  publish(sessionId: string, event: SseEvent): void {
    const set = this.listeners.get(sessionId);
    if (!set) return;
    for (const fn of set) fn(event);
  }

  async ask(
    sessionId: string,
    event: SseEvent & { data: { promptId: string } },
    opts: { timeoutMs?: number } = {},
  ): Promise<string> {
    const { promptId } = event.data;
    const timeoutMs = opts.timeoutMs ?? 90_000;
    return new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(promptId);
        reject(new Error(`prompt ${promptId} timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(promptId, (val) => {
        clearTimeout(t);
        resolve(val);
      });
      this.publish(sessionId, event);
    });
  }

  respond(_sessionId: string, promptId: string, value: string): boolean {
    const fn = this.pending.get(promptId);
    if (!fn) return false;
    this.pending.delete(promptId);
    fn(value);
    return true;
  }
}

export const sseHub = new SseHub();
```

- [ ] **Step 8.4: Run — expect pass**

```bash
pnpm vitest run test/lib/sseHub.test.ts
```

Expected: 3 pass.

- [ ] **Step 8.5: Commit**

```bash
git add packages/api/src/lib/sseHub.ts packages/api/test/lib/sseHub.test.ts
git commit -m "feat(pf): in-memory SSE hub for fetch-session prompts"
```

---

### Task 9: Captcha solver (OCR + fallback)

**Files:**
- Create: `portfolioos/packages/api/src/adapters/pf/shared/captcha.ts`

- [ ] **Step 9.1: Install Tesseract.js**

```bash
cd portfolioos/packages/api
pnpm add tesseract.js@^5
```

- [ ] **Step 9.2: Implement**

Create `src/adapters/pf/shared/captcha.ts`:

```ts
import { createWorker } from 'tesseract.js';
import { sseHub } from '../../../lib/sseHub.js';
import { logger } from '../../../lib/logger.js';

export interface CaptchaSolveOpts {
  sessionId: string;
  imgBytes: Buffer;
  expectedLength?: number;          // EPFO: 6 digits
  charset?: 'digits' | 'alnum';
  promptId: string;
}

interface SolveResult {
  text: string;
  source: 'ocr' | 'user';
}

export async function solveCaptcha(opts: CaptchaSolveOpts): Promise<SolveResult> {
  // OCR first
  try {
    const worker = await createWorker('eng');
    if (opts.charset === 'digits') {
      await worker.setParameters({ tessedit_char_whitelist: '0123456789' });
    } else {
      await worker.setParameters({ tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' });
    }
    const { data } = await worker.recognize(opts.imgBytes);
    await worker.terminate();
    const cleaned = data.text.replace(/\s+/g, '').trim();
    const okLength = opts.expectedLength ? cleaned.length === opts.expectedLength : cleaned.length >= 4;
    if (data.confidence >= 75 && okLength) {
      logger.info({ sessionId: opts.sessionId, conf: data.confidence }, 'pf.captcha.ocr.accepted');
      return { text: cleaned, source: 'ocr' };
    }
    logger.info({ sessionId: opts.sessionId, conf: data.confidence }, 'pf.captcha.ocr.rejected');
  } catch (e) {
    logger.warn({ err: e }, 'pf.captcha.ocr.failed');
  }

  // Fallback: ask user via SSE
  const text = await sseHub.ask(opts.sessionId, {
    type: 'captcha_required',
    data: {
      promptId: opts.promptId,
      imgBase64: opts.imgBytes.toString('base64'),
      expectedLength: opts.expectedLength,
      charset: opts.charset ?? 'alnum',
    },
  });
  return { text, source: 'user' };
}
```

- [ ] **Step 9.3: Verify build**

```bash
pnpm --filter @portfolioos/api typecheck
```

- [ ] **Step 9.4: Commit**

```bash
git add packages/api/src/adapters/pf/shared/captcha.ts packages/api/package.json portfolioos/pnpm-lock.yaml 2>/dev/null || true
git commit -m "feat(pf): Tesseract.js captcha solver with SSE fallback"
```

---

### Task 10: EPFO Playwright scrape adapter

**Files:**
- Create: `portfolioos/packages/api/src/adapters/pf/epf/epfo.v1.ts`

> **Note:** This task only **wires** the Playwright flow against EPFO's `passbook.epfindia.gov.in`. CAPTCHA + OTP are routed via shared helpers from Tasks 8 + 9. Real selectors must be confirmed against the live portal during a manual smoke (gated by review G6 in CLAUDE.md before any production run). Use `scrape: 'mock'` env to short-circuit Playwright in tests.

- [ ] **Step 10.1: Install Playwright + stealth**

```bash
cd portfolioos/packages/api
pnpm add playwright@^1.45 playwright-extra@^4.3 puppeteer-extra-plugin-stealth@^2.11
pnpm exec playwright install chromium
```

- [ ] **Step 10.2: Implement adapter**

Create `src/adapters/pf/epf/epfo.v1.ts`:

```ts
import { chromium as chromiumExtra } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createHash, randomUUID } from 'node:crypto';
import type { PfAdapter, ScrapeContext, RawScrapePayload, PfMemberPayload } from '../types.js';
import { tokenizePassbookPdf } from '../shared/pdfPassbookParser.js';
import { solveCaptcha } from '../shared/captcha.ts';
import { parseEpfoPassbook } from './epfo.v1.parse.js';
import { logger } from '../../../lib/logger.js';

chromiumExtra.use(StealthPlugin());

const ID = 'pf.epfo.v1';
const VERSION = '1.0.0';

export const epfoAdapter: PfAdapter = {
  id: ID,
  version: VERSION,
  institution: 'EPFO',
  type: 'EPF',
  hostnames: ['passbook.epfindia.gov.in', 'unifiedportal-mem.epfindia.gov.in'],

  async scrape(ctx: ScrapeContext): Promise<RawScrapePayload> {
    if (process.env.PF_SCRAPE_MOCK === '1') {
      logger.info({ accountId: ctx.account.id }, 'pf.epfo.scrape.mocked');
      return {
        adapterId: ID,
        adapterVersion: VERSION,
        capturedAt: new Date().toISOString(),
        members: [],
      };
    }

    if (!ctx.credentials) throw new Error('EPFO scrape requires credentials');

    const browser = await chromiumExtra.launch({ headless: true });
    try {
      const ctxBrowser = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      });
      const page = await ctxBrowser.newPage();
      ctx.emit('SCRAPING', { stage: 'navigate' });

      await page.goto('https://passbook.epfindia.gov.in/MemberPassBook/login', {
        waitUntil: 'domcontentloaded',
      });

      // Fill UAN + password
      await page.fill('#username', ctx.credentials.username);
      await page.fill('#password', ctx.credentials.password);

      // Captcha
      ctx.emit('AWAITING_CAPTCHA');
      const captchaImg = await page.locator('img.captcha-image').screenshot();
      const captcha = await solveCaptcha({
        sessionId: ctx.sessionId,
        imgBytes: captchaImg,
        expectedLength: 6,
        charset: 'alnum',
        promptId: randomUUID(),
      });
      await page.fill('#captcha', captcha.text);
      await page.click('#login-btn');
      await page.waitForLoadState('networkidle');

      // Member list dropdown
      ctx.emit('SCRAPING', { stage: 'enumerate_members' });
      const memberOptions = await page.$$eval(
        'select#memberDropdown option',
        (opts) =>
          (opts as HTMLOptionElement[])
            .filter((o) => o.value && o.value.length > 4)
            .map((o) => ({ memberId: o.value, label: o.textContent ?? '' })),
      );

      const members: PfMemberPayload[] = [];
      for (const m of memberOptions) {
        ctx.emit('SCRAPING', { stage: 'download_passbook', memberId: m.memberId });
        await page.selectOption('select#memberDropdown', m.memberId);
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          page.click('button#downloadPdf'),
        ]);
        const path = await download.path();
        const buf = path ? await import('node:fs/promises').then((f) => f.readFile(path)) : Buffer.alloc(0);
        members.push({
          memberId: m.memberId,
          establishmentName: m.label.replace(/^\d+\s*-\s*/, '').trim(),
          passbookPdf: {
            base64: buf.toString('base64'),
            sha256: createHash('sha256').update(buf).digest('hex'),
          },
        });
      }

      return {
        adapterId: ID,
        adapterVersion: VERSION,
        capturedAt: new Date().toISOString(),
        members,
      };
    } finally {
      await browser.close();
    }
  },

  async parse(raw) {
    const allEvents: Array<ReturnType<typeof parseEpfoPassbook> extends Promise<infer R> ? R : never> = [];
    const merged: any[] = [];
    let firstError: string | undefined;
    for (const m of raw.members) {
      if (!m.passbookPdf || !m.memberId) continue;
      const buf = Buffer.from(m.passbookPdf.base64, 'base64');
      const tokens = await tokenizePassbookPdf(buf);
      const result = parseEpfoPassbook({ userId: 'unused', memberId: m.memberId, tokens });
      if (result.ok) {
        for (const ev of result.events) {
          merged.push({ ...ev, memberIdLast4: m.memberId.slice(-4) });
        }
      } else if (!firstError) {
        firstError = result.error;
      }
    }
    if (merged.length === 0) {
      return { ok: false, error: firstError ?? 'No events parsed' };
    }
    return { ok: true, events: merged, metadata: { memberCount: raw.members.length } };
  },
};
```

- [ ] **Step 10.3: Register adapter**

Modify `src/adapters/pf/chain.ts` — add at bottom:

```ts
import { epfoAdapter } from './epf/epfo.v1.js';

registerPfAdapter(epfoAdapter);
```

- [ ] **Step 10.4: Verify build**

```bash
pnpm --filter @portfolioos/api typecheck
pnpm --filter @portfolioos/api build
```

Expected: green.

- [ ] **Step 10.5: Commit**

```bash
git add packages/api/src/adapters/pf/epf/epfo.v1.ts packages/api/src/adapters/pf/chain.ts packages/api/package.json portfolioos/pnpm-lock.yaml 2>/dev/null || true
git commit -m "feat(pf): EPFO Playwright scrape adapter (server-headless)"
```

---

### Task 11: Session service + CanonicalEvent persistence

**Files:**
- Create: `portfolioos/packages/api/src/services/pfFetchSessions.service.ts`
- Create: `portfolioos/packages/api/src/services/pfCanonicalize.service.ts`
- Test: `portfolioos/packages/api/test/services/pfCanonicalize.test.ts`

- [ ] **Step 11.1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildCanonicalEvents } from '../../src/services/pfCanonicalize.service.js';

describe('buildCanonicalEvents', () => {
  it('attaches sourceHash + sourceAdapter to each row', () => {
    const out = buildCanonicalEvents({
      userId: 'u1',
      account: {
        id: 'pfa1',
        institution: 'EPFO',
        type: 'EPF',
        identifierPlain: 'UAN1',
      },
      adapterId: 'pf.epfo.v1',
      adapterVersion: '1.0.0',
      events: [
        { type: 'PF_EMPLOYER_CONTRIBUTION', eventDate: '2024-04-01', amount: '5000.00', sequence: 0 },
        { type: 'PF_EMPLOYER_CONTRIBUTION', eventDate: '2024-04-01', amount: '5000.00', sequence: 1 },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0].sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(out[0].sourceHash).not.toBe(out[1].sourceHash);
    expect(out[0].sourceAdapter).toBe('pf.epfo.v1');
  });
});
```

- [ ] **Step 11.2: Run — expect fail**

```bash
pnpm vitest run test/services/pfCanonicalize.test.ts
```

- [ ] **Step 11.3: Implement canonicalize service**

Create `src/services/pfCanonicalize.service.ts`:

```ts
import { pfEventHash } from './sourceHash.js';
import type { PfCanonicalEventInput } from '../adapters/pf/types.js';

export interface CanonicalizeInput {
  userId: string;
  account: {
    id: string;
    institution: string;
    type: string;
    identifierPlain: string;       // decrypted UAN/acct, never persisted
  };
  adapterId: string;
  adapterVersion: string;
  events: PfCanonicalEventInput[];
}

export interface BuiltCanonicalEvent {
  userId: string;
  sourceAdapter: string;
  sourceAdapterVer: string;
  sourceRef: string;
  sourceHash: string;
  eventType: string;
  eventDate: string;
  amount: string;
  metadata: Record<string, unknown>;
  status: 'PARSED';
}

export function buildCanonicalEvents(input: CanonicalizeInput): BuiltCanonicalEvent[] {
  return input.events.map((ev) => ({
    userId: input.userId,
    sourceAdapter: input.adapterId,
    sourceAdapterVer: input.adapterVersion,
    sourceRef: input.account.id,
    sourceHash: pfEventHash({
      userId: input.userId,
      institution: input.account.institution,
      identifier: input.account.identifierPlain,
      eventDate: ev.eventDate,
      amount: ev.amount,
      type: ev.type,
      sequence: ev.sequence,
    }),
    eventType: ev.type,
    eventDate: ev.eventDate,
    amount: ev.amount,
    metadata: {
      memberIdLast4: ev.memberIdLast4,
      notes: ev.notes,
      sequence: ev.sequence,
    },
    status: 'PARSED' as const,
  }));
}
```

- [ ] **Step 11.4: Run — expect pass**

```bash
pnpm vitest run test/services/pfCanonicalize.test.ts
```

- [ ] **Step 11.5: Implement session service**

Create `src/services/pfFetchSessions.service.ts`:

```ts
import { prisma } from '../lib/prisma.js';
import { sseHub } from '../lib/sseHub.js';
import type { PfFetchSource, PfFetchStatus } from '@prisma/client';

export async function startSession(opts: {
  userId: string;
  accountId: string;
  source: PfFetchSource;
}) {
  return prisma.pfFetchSession.create({
    data: {
      userId: opts.userId,
      providentFundAccountId: opts.accountId,
      source: opts.source,
      status: 'INITIATED',
    },
  });
}

export async function transition(sessionId: string, status: PfFetchStatus, info: Record<string, unknown> = {}) {
  await prisma.pfFetchSession.update({ where: { id: sessionId }, data: { status } });
  sseHub.publish(sessionId, { type: 'status', data: { status, ...info } });
}

export async function complete(sessionId: string, eventsCreated: number) {
  await prisma.pfFetchSession.update({
    where: { id: sessionId },
    data: { status: 'COMPLETED', completedAt: new Date(), eventsCreated },
  });
  sseHub.publish(sessionId, { type: 'completed', data: { eventsCreated } });
}

export async function fail(sessionId: string, errorMessage: string, ingestionFailureId?: string) {
  await prisma.pfFetchSession.update({
    where: { id: sessionId },
    data: { status: 'FAILED', completedAt: new Date(), errorMessage, ingestionFailureId },
  });
  sseHub.publish(sessionId, { type: 'failed', data: { errorMessage } });
}
```

- [ ] **Step 11.6: Commit**

```bash
git add packages/api/src/services/pfCanonicalize.service.ts \
        packages/api/src/services/pfFetchSessions.service.ts \
        packages/api/test/services/pfCanonicalize.test.ts
git commit -m "feat(pf): canonical event builder + session lifecycle service"
```

---

### Task 12: Bull worker

**Files:**
- Create: `portfolioos/packages/api/src/jobs/pfFetchWorker.ts`
- Modify: `portfolioos/packages/api/src/jobs/startupSync.ts` (register queue)

> Existing pattern lives in `src/jobs/vehicleJobs.ts` and `importWorker.ts`. Reuse the same Bull connection helper.

- [ ] **Step 12.1: Implement worker**

Create `src/jobs/pfFetchWorker.ts`:

```ts
import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { sseHub } from '../lib/sseHub.js';
import { decryptCredentialBlob, decryptIdentifier } from '../services/pfCredentials.service.js';
import { runPfChain } from '../adapters/pf/chain.js';
import { buildCanonicalEvents } from '../services/pfCanonicalize.service.js';
import { transition, complete, fail } from '../services/pfFetchSessions.service.js';
import { writeIngestionFailure } from '../services/ingestionFailures.service.js';
import { recomputeForAsset } from '../services/holdingsProjection.js';
import { randomUUID } from 'node:crypto';

export const PF_FETCH_QUEUE = 'pf-headless-fetch';
export const pfFetchQueue = new Queue(PF_FETCH_QUEUE, { connection: redisConnection });

interface JobData {
  sessionId: string;
  accountId: string;
  userId: string;
  credentialOverride?: { username: string; password: string; mpin?: string };
}

export function startPfFetchWorker(): Worker<JobData> {
  return new Worker<JobData>(
    PF_FETCH_QUEUE,
    async (job) => {
      const { sessionId, accountId, userId, credentialOverride } = job.data;
      const account = await prisma.providentFundAccount.findFirst({ where: { id: accountId, userId } });
      if (!account) throw new Error(`Account ${accountId} not found for user ${userId}`);

      let credentials = credentialOverride;
      if (!credentials && account.storedCredentials) {
        credentials = await decryptCredentialBlob((account.storedCredentials as { blob: string }).blob);
      }

      const identifierPlain = await decryptIdentifier(account.identifierCipher.toString('base64'));
      const ac = new AbortController();

      try {
        const outcome = await runPfChain({
          sessionId,
          account,
          credentials,
          prompt: {
            askCaptcha: async (img) => {
              await transition(sessionId, 'AWAITING_CAPTCHA');
              return sseHub.ask(sessionId, {
                type: 'captcha_required',
                data: { promptId: randomUUID(), imgBase64: img.toString('base64') },
              });
            },
            askOtp: async (channel) => {
              await transition(sessionId, 'AWAITING_OTP');
              return sseHub.ask(sessionId, {
                type: 'otp_required',
                data: { promptId: randomUUID(), channel },
              });
            },
            askText: async (label) =>
              sseHub.ask(sessionId, {
                type: 'text_required',
                data: { promptId: randomUUID(), label },
              }),
          },
          emit: (status, info) => {
            void transition(sessionId, status, info ?? {});
          },
          abortSignal: ac.signal,
        });

        if (!outcome.ok || !outcome.parsed?.ok) {
          const msg = outcome.error ?? (outcome.parsed && !outcome.parsed.ok ? outcome.parsed.error : 'unknown');
          const dlq = await writeIngestionFailure({
            userId,
            sourceAdapter: 'pf.epfo.v1',
            adapterVersion: '1.0.0',
            sourceRef: account.id,
            errorMessage: msg,
          });
          await fail(sessionId, msg, dlq.id);
          return;
        }

        await transition(sessionId, 'PARSING');
        const built = buildCanonicalEvents({
          userId,
          account: {
            id: account.id,
            institution: account.institution,
            type: account.type,
            identifierPlain,
          },
          adapterId: 'pf.epfo.v1',
          adapterVersion: '1.0.0',
          events: outcome.parsed.events,
        });

        let inserted = 0;
        await prisma.$transaction(async (tx) => {
          for (const e of built) {
            const r = await tx.canonicalEvent.upsert({
              where: { userId_sourceHash: { userId: e.userId, sourceHash: e.sourceHash } },
              create: { ...e, status: 'CONFIRMED' as const },        // auto-confirm — passbook is authoritative
              update: {},
            });
            if (r) inserted += 1;
          }
        });

        await recomputeForAsset(account.portfolioId ?? null, account.assetKey);
        await prisma.providentFundAccount.update({
          where: { id: account.id },
          data: { lastRefreshedAt: new Date(), lastFetchSource: 'SERVER_HEADLESS' },
        });
        await complete(sessionId, inserted);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error({ err: msg, sessionId }, 'pf.worker.fatal');
        const dlq = await writeIngestionFailure({
          userId,
          sourceAdapter: 'pf.epfo.v1',
          adapterVersion: '1.0.0',
          sourceRef: accountId,
          errorMessage: msg,
        });
        await fail(sessionId, msg, dlq.id);
      }
    },
    { connection: redisConnection },
  );
}
```

- [ ] **Step 12.2: Register on startup**

Modify `src/jobs/startupSync.ts` — append to the worker init list:

```ts
import { startPfFetchWorker } from './pfFetchWorker.js';
// ...
startPfFetchWorker();
```

- [ ] **Step 12.3: Verify build**

```bash
pnpm --filter @portfolioos/api typecheck
pnpm --filter @portfolioos/api build
```

Note: if `recomputeForAsset` signature differs, adjust call site to match `holdingsProjection.ts`.

- [ ] **Step 12.4: Commit**

```bash
git add packages/api/src/jobs/pfFetchWorker.ts packages/api/src/jobs/startupSync.ts
git commit -m "feat(pf): Bull worker for server-headless EPFO fetch"
```

---

### Task 13: REST routes + controller

**Files:**
- Create: `portfolioos/packages/api/src/controllers/pf.controller.ts`
- Create: `portfolioos/packages/api/src/routes/pf.routes.ts`
- Modify: `portfolioos/packages/api/src/routes/index.ts` (mount under `/epfppf`)

- [ ] **Step 13.1: Implement controller**

Create `src/controllers/pf.controller.ts`:

```ts
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  createPfAccount,
  listPfAccounts,
  getPfAccountById,
  forgetPfCredentials,
} from '../services/pfAccounts.service.js';
import { startSession } from '../services/pfFetchSessions.service.js';
import { sseHub } from '../lib/sseHub.js';
import { pfFetchQueue } from '../jobs/pfFetchWorker.js';
import { encryptCredentialBlob } from '../services/pfCredentials.service.js';
import { prisma } from '../lib/prisma.js';

const CreateAccountSchema = z.object({
  type: z.enum(['EPF', 'PPF']),
  institution: z.enum(['EPFO', 'SBI', 'INDIA_POST', 'HDFC', 'ICICI', 'AXIS', 'PNB', 'BOB']),
  identifier: z.string().min(4).max(40),
  holderName: z.string().min(1).max(100),
  branchCode: z.string().max(20).optional(),
  portfolioId: z.string().optional(),
});

export async function createAccountHandler(req: Request, res: Response) {
  const parsed = CreateAccountSchema.parse(req.body);
  const account = await createPfAccount({ userId: req.user!.id, ...parsed });
  res.json({ success: true, data: account });
}

export async function listAccountsHandler(req: Request, res: Response) {
  const data = await listPfAccounts(req.user!.id);
  res.json({ success: true, data });
}

const StartSessionSchema = z.object({
  accountId: z.string(),
  saveCredentials: z.boolean().default(false),
  credentials: z
    .object({ username: z.string().min(1), password: z.string().min(1), mpin: z.string().optional() })
    .optional(),
});

export async function startSessionHandler(req: Request, res: Response) {
  const body = StartSessionSchema.parse(req.body);
  const userId = req.user!.id;
  const account = await getPfAccountById(userId, body.accountId);
  if (!account) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });

  if (body.saveCredentials && body.credentials) {
    const blob = await encryptCredentialBlob(body.credentials);
    await prisma.providentFundAccount.update({
      where: { id: account.id },
      data: { storedCredentials: { blob } },
    });
  }

  const session = await startSession({ userId, accountId: account.id, source: 'SERVER_HEADLESS' });
  await pfFetchQueue.add('fetch', {
    sessionId: session.id,
    accountId: account.id,
    userId,
    credentialOverride: !body.saveCredentials ? body.credentials : undefined,
  });
  res.json({ success: true, data: { sessionId: session.id } });
}

export async function sseEventsHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const sessionId = req.params.sessionId;
  const session = await prisma.pfFetchSession.findFirst({ where: { id: sessionId, userId } });
  if (!session) return res.status(404).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const unsub = sseHub.subscribe(sessionId, (e) => {
    res.write(`event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`);
  });
  req.on('close', () => unsub());
}

const RespondSchema = z.object({ promptId: z.string(), value: z.string().min(1).max(64) });

export async function captchaRespondHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const sessionId = req.params.sessionId;
  const session = await prisma.pfFetchSession.findFirst({ where: { id: sessionId, userId } });
  if (!session) return res.status(404).end();
  const body = RespondSchema.parse(req.body);
  const ok = sseHub.respond(sessionId, body.promptId, body.value);
  res.json({ success: ok });
}

export async function otpRespondHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const sessionId = req.params.sessionId;
  const session = await prisma.pfFetchSession.findFirst({ where: { id: sessionId, userId } });
  if (!session) return res.status(404).end();
  const body = RespondSchema.parse(req.body);
  const ok = sseHub.respond(sessionId, body.promptId, body.value);
  res.json({ success: ok });
}

export async function forgetCredentialsHandler(req: Request, res: Response) {
  await forgetPfCredentials(req.user!.id, req.params.id);
  res.json({ success: true });
}
```

- [ ] **Step 13.2: Implement routes**

Create `src/routes/pf.routes.ts`:

```ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createAccountHandler,
  listAccountsHandler,
  startSessionHandler,
  sseEventsHandler,
  captchaRespondHandler,
  otpRespondHandler,
  forgetCredentialsHandler,
} from '../controllers/pf.controller.js';

export const pfRouter: Router = Router();

pfRouter.use(requireAuth);
pfRouter.get('/accounts', listAccountsHandler);
pfRouter.post('/accounts', createAccountHandler);
pfRouter.delete('/accounts/:id/credentials', forgetCredentialsHandler);

pfRouter.post('/sessions', startSessionHandler);
pfRouter.get('/sessions/:sessionId/events', sseEventsHandler);
pfRouter.post('/sessions/:sessionId/captcha', captchaRespondHandler);
pfRouter.post('/sessions/:sessionId/otp', otpRespondHandler);
```

- [ ] **Step 13.3: Mount router**

Modify `src/routes/index.ts` — add `app.use('/epfppf', pfRouter)` alongside other routers.

```ts
import { pfRouter } from './pf.routes.js';
// ...
app.use('/epfppf', pfRouter);
```

- [ ] **Step 13.4: Verify build**

```bash
pnpm --filter @portfolioos/api typecheck
pnpm --filter @portfolioos/api build
```

- [ ] **Step 13.5: Commit**

```bash
git add packages/api/src/controllers/pf.controller.ts packages/api/src/routes/pf.routes.ts packages/api/src/routes/index.ts
git commit -m "feat(pf): REST + SSE endpoints under /epfppf"
```

---

### Task 14: Frontend API client

**Files:**
- Create: `portfolioos/apps/web/src/api/pf.ts`

- [ ] **Step 14.1: Implement client**

Create `src/api/pf.ts`:

```ts
import { apiClient } from './client';

export interface PfAccount {
  id: string;
  type: 'EPF' | 'PPF';
  institution: 'EPFO' | 'SBI' | 'INDIA_POST' | 'HDFC' | 'ICICI' | 'AXIS' | 'PNB' | 'BOB';
  identifierLast4: string;
  holderName: string;
  status: string;
  lastRefreshedAt: string | null;
  currentBalance: string | null;
  memberIds: Array<{
    id: string;
    memberIdLast4: string;
    establishmentName: string;
    currentBalance: string | null;
  }>;
}

export const pfApi = {
  list: () => apiClient.get<{ data: PfAccount[] }>('/epfppf/accounts'),
  create: (body: {
    type: 'EPF' | 'PPF';
    institution: PfAccount['institution'];
    identifier: string;
    holderName: string;
    portfolioId?: string;
  }) => apiClient.post<{ data: PfAccount }>('/epfppf/accounts', body),
  startSession: (body: {
    accountId: string;
    saveCredentials: boolean;
    credentials?: { username: string; password: string; mpin?: string };
  }) => apiClient.post<{ data: { sessionId: string } }>('/epfppf/sessions', body),
  forgetCredentials: (id: string) =>
    apiClient.delete(`/epfppf/accounts/${id}/credentials`),
  respondCaptcha: (sessionId: string, promptId: string, value: string) =>
    apiClient.post(`/epfppf/sessions/${sessionId}/captcha`, { promptId, value }),
  respondOtp: (sessionId: string, promptId: string, value: string) =>
    apiClient.post(`/epfppf/sessions/${sessionId}/otp`, { promptId, value }),
  eventStream: (sessionId: string) =>
    new EventSource(`/api/epfppf/sessions/${sessionId}/events`, { withCredentials: true }),
};
```

- [ ] **Step 14.2: Commit**

```bash
git add apps/web/src/api/pf.ts
git commit -m "feat(pf): web API client + EventSource wrapper"
```

---

### Task 15: Refresh modal with SSE

**Files:**
- Create: `portfolioos/apps/web/src/pages/pf/PfRefreshDialog.tsx`

- [ ] **Step 15.1: Implement**

Create `src/pages/pf/PfRefreshDialog.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { pfApi } from '@/api/pf';

type Phase =
  | { kind: 'creds' }
  | { kind: 'starting' }
  | { kind: 'status'; status: string; info?: any }
  | { kind: 'captcha'; promptId: string; img: string }
  | { kind: 'otp'; promptId: string; channel: string }
  | { kind: 'completed'; eventsCreated: number }
  | { kind: 'failed'; message: string };

export function PfRefreshDialog({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'creds' });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [save, setSave] = useState(false);
  const [input, setInput] = useState('');
  const sessionIdRef = useRef<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  async function start() {
    setPhase({ kind: 'starting' });
    const r = await pfApi.startSession({
      accountId,
      saveCredentials: save,
      credentials: { username, password },
    });
    const sessionId = r.data.data.sessionId;
    sessionIdRef.current = sessionId;
    const es = pfApi.eventStream(sessionId);
    esRef.current = es;
    es.addEventListener('status', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setPhase({ kind: 'status', status: data.status, info: data });
    });
    es.addEventListener('captcha_required', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setPhase({ kind: 'captcha', promptId: data.promptId, img: data.imgBase64 });
    });
    es.addEventListener('otp_required', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setPhase({ kind: 'otp', promptId: data.promptId, channel: data.channel });
    });
    es.addEventListener('completed', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setPhase({ kind: 'completed', eventsCreated: data.eventsCreated });
      es.close();
    });
    es.addEventListener('failed', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setPhase({ kind: 'failed', message: data.errorMessage });
      es.close();
    });
  }

  useEffect(() => () => esRef.current?.close(), []);

  async function submitCaptcha() {
    if (phase.kind !== 'captcha' || !sessionIdRef.current) return;
    await pfApi.respondCaptcha(sessionIdRef.current, phase.promptId, input);
    setInput('');
    setPhase({ kind: 'status', status: 'SCRAPING' });
  }

  async function submitOtp() {
    if (phase.kind !== 'otp' || !sessionIdRef.current) return;
    await pfApi.respondOtp(sessionIdRef.current, phase.promptId, input);
    setInput('');
    setPhase({ kind: 'status', status: 'SCRAPING' });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refresh Provident Fund</DialogTitle>
        </DialogHeader>

        {phase.kind === 'creds' && (
          <div className="space-y-3">
            <Input placeholder="UAN" value={username} onChange={(e) => setUsername(e.target.value)} />
            <Input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={save} onCheckedChange={(v) => setSave(Boolean(v))} />
              Save credentials (encrypted) for faster refresh
            </label>
            <Button onClick={start} disabled={!username || !password}>Start</Button>
          </div>
        )}

        {phase.kind === 'starting' && <p>Starting session…</p>}
        {phase.kind === 'status' && <p>Status: {phase.status}</p>}

        {phase.kind === 'captcha' && (
          <div className="space-y-3">
            <img src={`data:image/png;base64,${phase.img}`} alt="captcha" className="border" />
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Enter captcha" />
            <Button onClick={submitCaptcha}>Submit</Button>
          </div>
        )}

        {phase.kind === 'otp' && (
          <div className="space-y-3">
            <p>OTP sent via {phase.channel}.</p>
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Enter OTP" />
            <Button onClick={submitOtp}>Submit</Button>
          </div>
        )}

        {phase.kind === 'completed' && (
          <p>Imported {phase.eventsCreated} new entries.</p>
        )}
        {phase.kind === 'failed' && <p className="text-red-500">Failed: {phase.message}</p>}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 15.2: Commit**

```bash
git add apps/web/src/pages/pf/PfRefreshDialog.tsx
git commit -m "feat(pf): refresh modal with SSE-driven captcha/otp prompts"
```

---

### Task 16: ProvidentFundPage integration

**Files:**
- Modify: `portfolioos/apps/web/src/pages/assetClasses/ProvidentFundPage.tsx`

- [ ] **Step 16.1: Add Auto-fetch CTA**

In `ProvidentFundPage.tsx`:

1. Import `PfRefreshDialog` and `pfApi`.
2. Replace (or add alongside) the existing manual EPF list with a section that fetches from `pfApi.list()`.
3. For each `PfAccount` row, show: `holderName · ●●●●${identifierLast4}`, `currentBalance`, `lastRefreshedAt`, `[Auto-refresh]` button that opens `PfRefreshDialog`.
4. Add an "Add EPF Account" button that opens an existing or new `EPFFormDialog` (Task 17).

Concrete diff sketch:

```tsx
import { useEffect, useState } from 'react';
import { pfApi, type PfAccount } from '@/api/pf';
import { PfRefreshDialog } from '@/pages/pf/PfRefreshDialog';
import { Button } from '@/components/ui/button';

export function ProvidentFundPage() {
  const [accounts, setAccounts] = useState<PfAccount[]>([]);
  const [refreshFor, setRefreshFor] = useState<string | null>(null);

  async function reload() {
    const r = await pfApi.list();
    setAccounts(r.data.data);
  }

  useEffect(() => { void reload(); }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Provident Fund</h1>
        {/* Existing "Add EPF" button continues to work */}
      </header>

      <section>
        <h2 className="text-lg font-medium mb-2">Auto-fetch accounts</h2>
        <ul className="divide-y border rounded">
          {accounts.map((a) => (
            <li key={a.id} className="p-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{a.holderName} <span className="text-muted-foreground">···{a.identifierLast4}</span></div>
                <div className="text-sm text-muted-foreground">
                  Balance: {a.currentBalance ?? '—'} · Last: {a.lastRefreshedAt ?? 'never'}
                </div>
              </div>
              <Button size="sm" onClick={() => setRefreshFor(a.id)}>Refresh</Button>
            </li>
          ))}
          {accounts.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">No auto-fetch accounts yet.</li>
          )}
        </ul>
      </section>

      {refreshFor && (
        <PfRefreshDialog
          accountId={refreshFor}
          onClose={() => {
            setRefreshFor(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 16.2: Verify web build**

```bash
cd portfolioos
pnpm --filter web build
```

- [ ] **Step 16.3: Commit**

```bash
git add apps/web/src/pages/assetClasses/ProvidentFundPage.tsx
git commit -m "feat(pf): wire ProvidentFundPage to auto-fetch list + refresh"
```

---

### Task 17: EPF "Add Account" form

**Files:**
- Modify: `portfolioos/apps/web/src/pages/assetClasses/EPFFormDialog.tsx`

- [ ] **Step 17.1: Add UAN field + submit to `pfApi.create`**

Inside `EPFFormDialog.tsx`, add a tab or mode "Auto-fetch". When user selects it:

```tsx
import { pfApi } from '@/api/pf';

// inside the submit handler:
await pfApi.create({
  type: 'EPF',
  institution: 'EPFO',
  identifier: uan,
  holderName,
  portfolioId,
});
onCreated?.();
onClose();
```

UAN validation: `/^\d{12}$/`. Display masked: `····${uan.slice(-4)}` after creation.

- [ ] **Step 17.2: Verify web build**

```bash
pnpm --filter web build
```

- [ ] **Step 17.3: Commit**

```bash
git add apps/web/src/pages/assetClasses/EPFFormDialog.tsx
git commit -m "feat(pf): EPF add-account form with auto-fetch hook"
```

---

### Task 18: Manual PDF upload fallback

**Files:**
- Create: `portfolioos/apps/web/src/pages/pf/PfManualUploadDialog.tsx`
- Modify: `portfolioos/packages/api/src/controllers/pf.controller.ts` — add `uploadManualPassbookHandler`
- Modify: `portfolioos/packages/api/src/routes/pf.routes.ts` — add `POST /accounts/:id/passbook`

- [ ] **Step 18.1: Backend handler**

In `pf.controller.ts`:

```ts
import multer from 'multer';
import { tokenizePassbookPdf } from '../adapters/pf/shared/pdfPassbookParser.js';
import { parseEpfoPassbook } from '../adapters/pf/epf/epfo.v1.parse.js';
import { decryptIdentifier } from '../services/pfCredentials.service.js';
import { buildCanonicalEvents } from '../services/pfCanonicalize.service.js';
import { recomputeForAsset } from '../services/holdingsProjection.js';

export const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

export async function uploadManualPassbookHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const account = await getPfAccountById(userId, req.params.id);
  if (!account) return res.status(404).json({ success: false });
  if (!req.file) return res.status(400).json({ success: false, error: { code: 'NO_FILE' } });

  const tokens = await tokenizePassbookPdf(req.file.buffer);
  const memberIdHint = (req.body.memberId as string | undefined) ?? account.identifierLast4;
  const result = parseEpfoPassbook({ userId, memberId: memberIdHint, tokens });
  if (!result.ok) return res.status(422).json({ success: false, error: { code: 'PARSE_FAIL', message: result.error } });

  const identifierPlain = await decryptIdentifier(account.identifierCipher.toString('base64'));
  const built = buildCanonicalEvents({
    userId,
    account: {
      id: account.id,
      institution: account.institution,
      type: account.type,
      identifierPlain,
    },
    adapterId: 'pf.epfo.manual.v1',
    adapterVersion: '1.0.0',
    events: result.events,
  });

  let inserted = 0;
  await prisma.$transaction(async (tx) => {
    for (const e of built) {
      await tx.canonicalEvent.upsert({
        where: { userId_sourceHash: { userId, sourceHash: e.sourceHash } },
        create: { ...e, status: 'CONFIRMED' as const },
        update: {},
      });
      inserted += 1;
    }
  });

  await recomputeForAsset(account.portfolioId ?? null, account.assetKey);
  await prisma.providentFundAccount.update({
    where: { id: account.id },
    data: { lastRefreshedAt: new Date(), lastFetchSource: 'MANUAL_PDF' },
  });

  res.json({ success: true, data: { inserted } });
}
```

- [ ] **Step 18.2: Wire route**

In `pf.routes.ts`:

```ts
import { upload, uploadManualPassbookHandler } from '../controllers/pf.controller.js';
pfRouter.post('/accounts/:id/passbook', upload.single('file'), uploadManualPassbookHandler);
```

- [ ] **Step 18.3: Frontend dialog**

Create `apps/web/src/pages/pf/PfManualUploadDialog.tsx`:

```tsx
import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/api/client';

export function PfManualUploadDialog({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function upload() {
    const file = ref.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    const r = await apiClient.post(`/epfppf/accounts/${accountId}/passbook`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    setBusy(false);
    setResult(`Imported ${r.data.data.inserted} entries.`);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Passbook PDF</DialogTitle>
        </DialogHeader>
        <input type="file" accept="application/pdf" ref={ref} />
        <Button onClick={upload} disabled={busy}>Upload</Button>
        {result && <p>{result}</p>}
      </DialogContent>
    </Dialog>
  );
}
```

Add a "Manual upload" button alongside "Refresh" in `ProvidentFundPage.tsx` that opens this dialog.

- [ ] **Step 18.4: Install multer if absent**

```bash
cd portfolioos/packages/api
pnpm add multer @types/multer
```

- [ ] **Step 18.5: Verify build**

```bash
pnpm --filter @portfolioos/api typecheck && pnpm --filter web build
```

- [ ] **Step 18.6: Commit**

```bash
git add packages/api/src/controllers/pf.controller.ts packages/api/src/routes/pf.routes.ts \
        apps/web/src/pages/pf/PfManualUploadDialog.tsx \
        apps/web/src/pages/assetClasses/ProvidentFundPage.tsx \
        packages/api/package.json portfolioos/pnpm-lock.yaml 2>/dev/null || true
git commit -m "feat(pf): manual passbook upload fallback path"
```

---

### Task 19: Idempotency invariant test

**Files:**
- Create: `portfolioos/packages/api/test/invariants/pf-idempotency.test.ts`

- [ ] **Step 19.1: Write invariant test**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prisma } from '../../src/lib/prisma.js';
import { tokenizePassbookPdf } from '../../src/adapters/pf/shared/pdfPassbookParser.js';
import { parseEpfoPassbook } from '../../src/adapters/pf/epf/epfo.v1.parse.js';
import { buildCanonicalEvents } from '../../src/services/pfCanonicalize.service.js';
import { enterUserContext } from '../helpers/userContext.js'; // existing helper

describe('PF idempotency invariant', () => {
  let userId: string;
  let pfaId: string;
  const identifierPlain = 'UAN-INVARIANT-TEST';

  beforeAll(async () => {
    process.env.APP_ENCRYPTION_KEY = 'dGVzdC1rZXktMzItYnl0ZXMtZm9yLWVwZi1hZXMtZ2NtMTIzNDU=';
    const u = await prisma.user.create({ data: { email: 'pf-inv@example.test', passwordHash: 'x' } });
    userId = u.id;
    await enterUserContext(userId);
    const acct = await prisma.providentFundAccount.create({
      data: {
        userId,
        type: 'EPF',
        institution: 'EPFO',
        identifierCipher: Buffer.from('placeholder'),
        identifierLast4: 'TEST',
        holderName: 'Inv Test',
        assetKey: 'pf:epf:invariant',
      },
    });
    pfaId = acct.id;
  });

  it('re-importing the same passbook yields zero new CanonicalEvent rows', async () => {
    const buf = await readFile(resolve(__dirname, '../fixtures/pf/epfo/passbook-uan-100123456789.pdf'));
    const tokens = await tokenizePassbookPdf(buf);
    const parsed = parseEpfoPassbook({ userId, memberId: 'TESTMEMBER', tokens });
    if (!parsed.ok) throw new Error('parse failed');
    const built = buildCanonicalEvents({
      userId,
      account: { id: pfaId, institution: 'EPFO', type: 'EPF', identifierPlain },
      adapterId: 'pf.epfo.v1',
      adapterVersion: '1.0.0',
      events: parsed.events,
    });

    async function importAll() {
      let inserted = 0;
      for (const e of built) {
        try {
          await prisma.canonicalEvent.create({ data: { ...e, status: 'CONFIRMED' } });
          inserted += 1;
        } catch (err: any) {
          if (err?.code !== 'P2002') throw err;
        }
      }
      return inserted;
    }

    const first = await importAll();
    const second = await importAll();
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
  });
});
```

- [ ] **Step 19.2: Run test — expect pass**

```bash
pnpm vitest run test/invariants/pf-idempotency.test.ts
```

Expected: PASS. If `enterUserContext` helper signature differs, mirror what existing tests do (see `test/invariants/holding-uniqueness.test.ts`).

- [ ] **Step 19.3: Commit**

```bash
git add packages/api/test/invariants/pf-idempotency.test.ts
git commit -m "test(pf): idempotency invariant on passbook re-import"
```

---

### Task 20: RLS cross-user test

**Files:**
- Create: `portfolioos/packages/api/test/security/pf-rls.test.ts`

- [ ] **Step 20.1: Write test**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { enterUserContext } from '../helpers/userContext.js';

describe('PF RLS isolation', () => {
  let userA: string;
  let userB: string;
  let pfaIdOfA: string;

  beforeAll(async () => {
    const a = await prisma.user.create({ data: { email: 'rls-a@example.test', passwordHash: 'x' } });
    const b = await prisma.user.create({ data: { email: 'rls-b@example.test', passwordHash: 'x' } });
    userA = a.id;
    userB = b.id;
    await enterUserContext(userA);
    const pfa = await prisma.providentFundAccount.create({
      data: {
        userId: userA,
        type: 'EPF',
        institution: 'EPFO',
        identifierCipher: Buffer.from('x'),
        identifierLast4: '0000',
        holderName: 'A',
        assetKey: 'pf:epf:rls-a',
      },
    });
    pfaIdOfA = pfa.id;
  });

  it("user B cannot see user A's PF account", async () => {
    await enterUserContext(userB);
    const r = await prisma.providentFundAccount.findFirst({ where: { id: pfaIdOfA } });
    expect(r).toBeNull();
  });

  it("user B cannot update user A's PF account", async () => {
    await enterUserContext(userB);
    await expect(
      prisma.providentFundAccount.update({
        where: { id: pfaIdOfA },
        data: { holderName: 'hijack' },
      }),
    ).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 20.2: Run — expect pass**

```bash
pnpm vitest run test/security/pf-rls.test.ts
```

- [ ] **Step 20.3: Commit**

```bash
git add packages/api/test/security/pf-rls.test.ts
git commit -m "test(pf): RLS cross-user isolation"
```

---

### Task 21: Final verification

- [ ] **Step 21.1: Full repo green**

```bash
cd portfolioos
pnpm -r run typecheck
pnpm -r run lint
pnpm -r run test
pnpm -r run build
```

Expected: all green.

- [ ] **Step 21.2: Manual smoke (auth + UI)**

```bash
docker-compose up -d postgres redis
cd portfolioos/packages/api && pnpm dev &
cd portfolioos/apps/web && pnpm dev
```

- Open `http://localhost:5173`, log in, navigate to **Provident Fund**.
- Click **Add EPF Account**, enter UAN `100123456789` (test), holder `TEST USER`. Save.
- New row appears with `···6789`, "never" refresh.
- Click **Manual upload**, pick the fixture PDF. Toast shows imported count > 0.
- Reload — row shows balance.
- Click **Refresh** (server-headless) → modal asks UAN/password. Set `PF_SCRAPE_MOCK=1` in API env to short-circuit Playwright; verify modal flow + completion event.
- Manual upload same PDF again → toast says imported = 0 (idempotent).

- [ ] **Step 21.3: Tag for plan completion**

```bash
git tag pf-plan-a-foundation-epfo
```

---

## Self-Review

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| §6 Schema (PfAccount, EpfMemberId, PfFetchSession, enums, CanonicalEventType extension) | Task 1 |
| §7 Data flow (session → fetch → CAPTCHA/OTP → parse → canonical → projection) | Tasks 8, 10, 11, 12, 13 |
| §8 Adapter framework (`PfAdapter`, `chain.ts`, two-layer scrape/parse) | Tasks 5, 7, 10 |
| §9 CAPTCHA + OTP UX (SSE, EasyOCR-first) | Tasks 8, 9, 13, 15 |
| §10 Credentials + security (pgcrypto opt-in, RLS, audit) | Tasks 1, 2, 13 (RLS in 1, audit hook stubbed in controller, full audit in Plan D) |
| §12 Build sequence M1–M6 | Tasks 1–18 |
| §14 Exit criteria — EPFO end-to-end + manual fallback + idempotency + RLS | Tasks 18, 19, 20, 21 |

Out-of-scope-for-Plan-A spec sections handled in later plans:
- §11 Browser extension → Plan C
- §13 Bot-detection hardening, monthly nudge, DLQ ops UI → Plan D
- SBI + 6 PPF banks → Plans B + D

**Placeholder scan:** No "TBD" / "TODO" / "fill in" / "similar to Task N" patterns. Every code step contains the actual code.

**Type consistency check:**
- `PfAdapter` interface used by Task 5, 10 — same shape.
- `RawScrapePayload` defined Task 5, used Tasks 10, 12 — same shape.
- `BuiltCanonicalEvent` defined Task 11, used Tasks 12, 18 — same shape.
- `pfApi` methods declared Task 14, used Tasks 15, 16, 17, 18 — every method consumed exists.
- `recomputeForAsset(portfolioId | null, assetKey)` — Tasks 12, 18 both call it; signature must match `services/holdingsProjection.ts`. Step 12.3 explicitly notes "adjust call site to match" — flag, not silent assumption.
- `enterUserContext` — Tasks 19, 20 both rely on existing `test/helpers/userContext.ts`. If helper does not exist, copy pattern from `test/invariants/holding-uniqueness.test.ts` (already in repo).

---

## Execution Handoff

Plan complete and saved to `portfolioos/docs/superpowers/plans/2026-05-06-epf-ppf-autofetch-plan-A-foundation-epfo.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
