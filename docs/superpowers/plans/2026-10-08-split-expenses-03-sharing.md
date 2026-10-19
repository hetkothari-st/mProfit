# Split Expenses — Plan 3: Receipts, comments, labels, settings, pay-now, reminders, Cash Activity link, linking & invites

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Splitwise-grade experience on top of Plans 1–2: attach and view receipt photos, comment on and label expenses, a Split settings page (UPI ID, home currency, default portfolio, email prefs), UPI pay-now with QR, email reminders and activity/weekly digests, "add my share to Cash Activity", inviting people and auto-linking placeholders to real accounts — plus the polish items parked from Plan 2.

**Architecture:** Backend additions live in new focused services under `packages/api/src/services/split/` (`settings`, `labels`, `comments`, `receipts`, `shareLink`, `linking`, `notify`) with routes appended to `split.routes.ts`. Receipt bytes reuse the vault blob store (`lib/documentStorage.ts`, per-user sealed, owner-only RLS) — the uploader's id is stored on the expense so any group member can be served the file after a membership check. Cross-user writes (linking placeholders, syncing other users' Cash Activity rows, digest emails) run under `runAsSystem` and are always scoped to rows reached through an authorised parent. Web additions extend existing split pages.

**Tech Stack:** Express, Prisma 5.22, Postgres 15 RLS, multer (memory), nodemailer (`sendEmail`), node-cron, React 18 + TanStack Query, `qrcode` (already a web dep).

**Spec:** `portfolioos/docs/superpowers/specs/2026-10-07-split-expenses-design.md` — §5 (pay now), §6 (share → Cash Activity), §8 (receipt/comments/labels/reminders/settings endpoints), §9 (settings page, receipt viewer, labels, comments, share toggle), §10 (linking & invites), §11 (notifications). Plans 1–2: `portfolioos/docs/superpowers/plans/2026-10-07-split-expenses-01-core.md`, `.../2026-10-08-split-expenses-02-web-ui.md`.

All paths relative to `C:\Users\ST269\Desktop\mProfit-split-wt\portfolioos` (worktree, branch `feat/split-expenses`). API = `packages/api`, web = `apps/web`.

## Global Constraints

- Money: `Decimal` end to end, strings on the wire (`serializeMoney`), never `Number`/`parseFloat` on money.
- RLS stays authoritative: every new user-scoped table gets ENABLE + FORCE RLS, per-command policies and an entry in `USER_SCOPED_MODELS` (`src/lib/prisma.ts`). Cross-user work runs under `runAsSystem` only after the caller's membership/ownership was checked under their own context.
- Receipts: JPEG, PNG, WebP or PDF only, detected by magic bytes; ≤ 10 MB; JPEG/PNG/WebP metadata (EXIF/XMP/text chunks) stripped before storage. (HEIC from spec §7.3 is dropped: browsers cannot display it; the upload is rejected with a clear message.)
- Linking uses **verified** identities only: the email a user verified at signup (code or Google `email_verified`). Phone numbers are never used to link (no phone verification exists).
- Emails: plain-language subject/body via the existing `renderInviteShell` layout; never include another person's email/phone; reminders ≤ 1/day per (sender, debtor) pair; activity emails batched ≤ 1/hour per user; placeholders get invite and reminder emails only.
- UPI pay-now only for INR debts; VPA format `^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$`; deep link `upi://pay?pa=<vpa>&pn=<name>&am=<amount 2dp>&cu=INR&tn=<note>` with each value `encodeURIComponent`-ed.
- Share → Cash Activity: OUTFLOW of **my base share** of the expense, `currency` = group base (null when INR), `inrEquivalent` set when non-INR; edits/deletes/restores keep it in sync; only the share owner can enable/disable their link.
- Tests and the local API run only against the isolated DB `portfolioos_split` (env in `.superpowers/sdd/2026-10-08-split-expenses-03-sharing/env.md`). Override both `DATABASE_URL` and `DIRECT_URL` for prisma commands.
- No silent catch; errors are `AppError` subclasses; web shows server errors via `splitErrorMessage` (`apps/web/src/pages/split/errors.ts`).
- Commits: Conventional Commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. **A non-member requests another group's receipt / comments / labels by id** → 404, never bytes or text → Task 3/4/5 tests "outsider gets 404".
2. **Someone else edits or deletes an expense I linked to Cash Activity** → my CashFlow row follows (amount changes / row removed / comes back on restore) → Task 6 test "co-member edit syncs my cash flow".
3. **A placeholder contact's email matches a person who signs up later** → they see the group after verifying, but an unverified pending registration never links → Task 7 tests.
4. **Pressing "Remind" twice in a day** → second press says "Already reminded today" (409), no second email → Task 8 test.
5. **A receipt JPEG carrying GPS EXIF** → stored bytes no longer contain the EXIF segment; a renamed `.exe` → 400 → Task 5 tests.

---

## File Structure

```
packages/api/prisma/schema.prisma                         + receiptOwnerUserId/receiptMime on SplitExpense,
                                                            lastActivityEmailAt on SplitSettings, SplitReminder model
packages/api/prisma/migrations/20261008120000_split_sharing/migration.sql   (Task 1)
packages/api/src/lib/prisma.ts                            + 'SplitReminder' (Task 1)
packages/shared/src/split.types.ts                        + DTOs (Task 1)
packages/api/src/services/split/settings.service.ts       get/update settings, UPI link (Task 2)
packages/api/src/services/split/labels.service.ts         (Task 3)
packages/api/src/services/split/comments.service.ts       (Task 4)
packages/api/src/services/split/imageMeta.ts              strip JPEG/PNG/WebP metadata (Task 5)
packages/api/src/services/split/receipts.service.ts       (Task 5)
packages/api/src/services/split/shareLink.service.ts      (Task 6)
packages/api/src/jobs/splitShareLinkReconcileJob.ts       (Task 6)
packages/api/src/services/split/linking.service.ts        (Task 7)
packages/api/src/services/split/notify.service.ts         reminders, activity + weekly digests (Task 8)
packages/api/src/services/split/splitEmail.templates.ts   (Task 8)
packages/api/src/jobs/splitDigestJobs.ts                  (Task 8)
packages/api/src/controllers/split.controller.ts          + handlers (Tasks 2–8)
packages/api/src/routes/split.routes.ts                   + routes (Tasks 2–8)
packages/api/src/services/split/expenses.service.ts       + labelIds/hasReceipt in DTO, share-link sync hook (Tasks 3,5,6)
apps/web/src/api/split.api.ts                             + client calls (Task 9)
apps/web/src/pages/split/SplitSettingsPage.tsx            /split/settings (Task 9)
apps/web/src/pages/split/ExpenseExtras.tsx                comments, labels, receipt, share toggle on expense page (Task 10)
apps/web/src/pages/split/PayNowDialog.tsx                 UPI link + QR + "did it go through?" (Task 11)
apps/web/src/pages/split/{GroupPage,AddExpenseDialog,SplitHomePage,ContactDialog,FriendPage}.tsx  integrations + parked polish (Task 11)
```

---

### Task 0: Workspace env

- [ ] **Step 1:** Copy `.superpowers/sdd/2026-10-07-split-expenses-01-core/env.md` to `.superpowers/sdd/2026-10-08-split-expenses-03-sharing/env.md` (done by the controller before Task 1; implementers read it from there).

---

### Task 1: Schema, migration, RLS, shared DTOs

**Files:**
- Modify: `packages/api/prisma/schema.prisma`
- Create: `packages/api/prisma/migrations/20261008120000_split_sharing/migration.sql`
- Modify: `packages/api/src/lib/prisma.ts`
- Modify: `packages/shared/src/split.types.ts`
- Test: `packages/api/test/invariants/split-rls.test.ts` (extend)

**Interfaces — Produces:**

Prisma additions:

```prisma
// in model SplitExpense
  receiptOwnerUserId String?   // uploader; their DocumentBlob row holds the bytes
  receiptMime        String?

// in model SplitSettings
  lastActivityEmailAt DateTime?

model SplitReminder {
  id           String   @id @default(cuid())
  userId       String                     // sender
  user         User     @relation("SplitReminderUser", fields: [userId], references: [id], onDelete: Cascade)
  groupId      String
  memberId     String                     // debtor member
  sentOn       DateTime @db.Date          // IST calendar day of sending
  createdAt    DateTime @default(now())

  @@unique([userId, memberId, sentOn])
  @@index([userId, createdAt])
}
```

and on `model User` add `splitReminders SplitReminder[] @relation("SplitReminderUser")`.

Shared DTO additions (`packages/shared/src/split.types.ts`):

```ts
export interface SplitLabelDto { id: string; groupId: string; name: string; color: string }
export interface SplitCommentDto { id: string; expenseId: string; authorUserId: string; authorName: string; body: string; createdAt: string; mine: boolean }
export interface SplitSettingsDto { upiId: string | null; homeCurrency: string; defaultPortfolioId: string | null; emailOnActivity: boolean; weeklyDigest: boolean }
export interface SplitUpiLinkDto { uri: string; payeeName: string; payeeVpa: string; amount: Money; note: string }
export interface SplitShareLinkDto { expenseId: string; enabled: boolean; portfolioId: string | null; cashFlowId: string | null; myShare: Money; currency: string }
```

and in `SplitExpenseDto` add `labelIds: string[]; hasReceipt: boolean;`.

- [ ] **Step 1: Write failing RLS tests** — append to `packages/api/test/invariants/split-rls.test.ts` (inside the existing describe, reusing its `alice`/`bob`/`eve` scopes and `groupId`):

```ts
  it('SplitReminder rows are sender-only', async () => {
    const r = await alice.runAs(() => prisma.splitReminder.create({
      data: { userId: alice.userId, groupId, memberId: bobMemberId, sentOn: new Date('2026-10-08') },
    }));
    await bob.runAs(async () => {
      expect(await prisma.splitReminder.findUnique({ where: { id: r.id } })).toBeNull();
    });
    await expect(eve.runAs(() => prisma.splitReminder.create({
      data: { userId: alice.userId, groupId, memberId: bobMemberId, sentOn: new Date('2026-10-09') },
    }))).rejects.toThrow();
    await runAsSystem(() => prisma.splitReminder.delete({ where: { id: r.id } }));
  });
```

- [ ] **Step 2:** Run `npx vitest run test/invariants/split-rls.test.ts` (env exports) → FAIL (`prisma.splitReminder` undefined).

- [ ] **Step 3: Schema + migration.** Apply the Prisma additions above. Write the migration by hand (the dev DB has unrelated drift — generate the SQL for the three changes with `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <superuser url to a scratch db> --script` if available, else write it directly) so it contains only:

```sql
ALTER TABLE "SplitExpense" ADD COLUMN "receiptOwnerUserId" TEXT, ADD COLUMN "receiptMime" TEXT;
ALTER TABLE "SplitSettings" ADD COLUMN "lastActivityEmailAt" TIMESTAMP(3);

CREATE TABLE "SplitReminder" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "sentOn" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SplitReminder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SplitReminder_userId_memberId_sentOn_key" ON "SplitReminder"("userId", "memberId", "sentOn");
CREATE INDEX "SplitReminder_userId_createdAt_idx" ON "SplitReminder"("userId", "createdAt");
ALTER TABLE "SplitReminder" ADD CONSTRAINT "SplitReminder_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SplitReminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SplitReminder" FORCE ROW LEVEL SECURITY;
CREATE POLICY splitreminder_select ON "SplitReminder" FOR SELECT USING (app_is_system() OR "userId" = app_current_user_id());
CREATE POLICY splitreminder_insert ON "SplitReminder" FOR INSERT WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
CREATE POLICY splitreminder_delete ON "SplitReminder" FOR DELETE USING (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, DELETE ON "SplitReminder" TO portfolioos_app;
```

Add `'SplitReminder'` to `USER_SCOPED_MODELS` next to the other Split entries. Apply with `DATABASE_URL=$DIRECT_URL npx prisma migrate deploy` after `migrate status` shows `portfolioos_split`. Run `npx prisma generate`.

- [ ] **Step 4: Shared DTOs.** Add the interfaces above; add `labelIds: string[]; hasReceipt: boolean;` to `SplitExpenseDto`. In `expenses.service.ts` toDto add `labelIds: e.labels.map((l) => l.labelId).sort()` and `hasReceipt: !!e.receiptBlobId`, and extend the shared `INCLUDE` to `{ payers: true, shares: true, labels: { select: { labelId: true } } }`. Build shared: `pnpm --filter @everypaisa/shared build`.

- [ ] **Step 5:** Run `npx vitest run test/invariants test/split test/routes/split.routes.test.ts` and `npx tsc --noEmit -p .` → all PASS. Fix any test that deep-equals an expense DTO by adding `labelIds: []`, `hasReceipt: false`.

- [ ] **Step 6: Commit** `feat(split): schema for receipts, reminders and digests`.

---

### Task 2: Settings API and UPI pay-now link

**Files:**
- Create: `packages/api/src/services/split/settings.service.ts`
- Modify: `packages/api/src/controllers/split.controller.ts`, `packages/api/src/routes/split.routes.ts`
- Test: `packages/api/test/split/settings.service.test.ts`

**Interfaces — Produces:**

```ts
export const UPI_VPA = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;
export async function getSettings(userId: string): Promise<SplitSettingsDto>;            // defaults when no row
export async function updateSettings(userId: string, patch: Partial<SplitSettingsDto>): Promise<SplitSettingsDto>;
export async function upiLink(userId: string, groupId: string, toMemberId: string, amount?: string): Promise<SplitUpiLinkDto>;
export function buildUpiUri(p: { vpa: string; name: string; amount: string; note: string }): string;
```

Routes: `GET /settings`, `PUT /settings`, `GET /groups/:id/upi-link?to=<memberId>&amount=<optional 2dp>`.

`upiLink` rules: caller must be a member; group `baseCurrency` must be `INR` (else 400 `SPLIT_UPI_INR_ONLY: UPI works only for INR groups`); target member active; VPA = target's linked user's `SplitSettings.upiId`, else the contact's `upiId` (contact row read under `runAsSystem` by `member.contactId`); none → 404 `SPLIT_NO_UPI: <name> hasn't added a UPI ID`. Amount: given → must be ≤ 2 dp and > 0; absent → the caller's simplified transfer to that member from `transfersFor` (Plan 1 ledger), else 400 `SPLIT_NOTHING_OWED`. Note: `"<group name> settle-up"` truncated to 40 chars. `defaultPortfolioId` must belong to the caller (`prisma.portfolio.findFirst({ where: { id, userId } })`) else 400. `homeCurrency` 3 uppercase letters.

- [ ] **Step 1: Failing tests**

```ts
// packages/api/test/split/settings.service.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import { createExpense } from '../../src/services/split/expenses.service.js';
import { getSettings, updateSettings, upiLink, buildUpiUri } from '../../src/services/split/settings.service.js';

describe('split settings + UPI link', () => {
  let alice: TestScope; let bob: TestScope;
  let groupId: string; let a: string; let b: string; let r: string;
  beforeAll(async () => {
    alice = await createTestScope('split-set2-a'); bob = await createTestScope('split-set2-b');
    const cb = await seedContact(alice.userId, 'Bob', bob.userId);
    const cr = await seedContact(alice.userId, 'Ravi');
    await runAsSystem(() => prisma.splitContact.update({ where: { id: cr.id }, data: { upiId: 'ravi@okicici' } }));
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Goa', myDisplayName: 'Alice', contactIds: [cb.id, cr.id] }));
    groupId = g.id;
    a = g.members.find((m) => m.isMe)!.id; b = g.members.find((m) => m.displayName === 'Bob')!.id; r = g.members.find((m) => m.displayName === 'Ravi')!.id;
    // Ravi paid 300 for everyone → Alice owes Ravi 100, Bob owes Ravi 100
    await runAsSystem(() => prisma.splitExpense.create({ data: {
      groupId, description: 'Cab', date: new Date('2026-10-01'), amount: '300', currency: 'INR', fxRate: '1', baseAmount: '300',
      splitMode: 'EQUAL', createdById: alice.userId,
      payers: { create: [{ memberId: r, amount: '300', baseAmount: '300' }] },
      shares: { create: [a, b, r].map((m) => ({ memberId: m, amount: '100', baseAmount: '100' })) },
    } }));
  });
  afterAll(async () => { await cleanupSplit([alice.userId, bob.userId]); await runAsSystem(() => prisma.splitSettings.deleteMany({ where: { userId: { in: [alice.userId, bob.userId] } } })); await alice.cleanup(); await bob.cleanup(); });

  it('defaults then updates', async () => {
    expect(await alice.runAs(() => getSettings(alice.userId))).toEqual({ upiId: null, homeCurrency: 'INR', defaultPortfolioId: null, emailOnActivity: true, weeklyDigest: false });
    const s = await alice.runAs(() => updateSettings(alice.userId, { upiId: 'alice@oksbi', weeklyDigest: true, defaultPortfolioId: alice.portfolioId }));
    expect(s).toMatchObject({ upiId: 'alice@oksbi', weeklyDigest: true, defaultPortfolioId: alice.portfolioId });
  });

  it('rejects bad VPA, bad currency and someone else\'s portfolio', async () => {
    await expect(alice.runAs(() => updateSettings(alice.userId, { upiId: 'nope' }))).rejects.toThrow(/UPI/);
    await expect(alice.runAs(() => updateSettings(alice.userId, { homeCurrency: 'rupee' }))).rejects.toThrow(/currency/i);
    await expect(alice.runAs(() => updateSettings(alice.userId, { defaultPortfolioId: bob.portfolioId }))).rejects.toThrow(/portfolio/i);
  });

  it('builds a pay link to a placeholder with a contact UPI, amount from balances', async () => {
    const l = await alice.runAs(() => upiLink(alice.userId, groupId, r));
    expect(l.payeeVpa).toBe('ravi@okicici');
    expect(l.amount).toBe('100.0000');
    expect(l.uri).toBe('upi://pay?pa=ravi%40okicici&pn=Ravi&am=100.00&cu=INR&tn=Goa%20settle-up');
  });

  it('no UPI on file → 404 with a plain reason', async () => {
    await expect(alice.runAs(() => upiLink(alice.userId, groupId, b, '10'))).rejects.toThrow(/hasn't added a UPI ID/);
  });

  it('buildUpiUri encodes values', () => {
    expect(buildUpiUri({ vpa: 'a.b@ok', name: 'A & B', amount: '1.50', note: 'x/y' }))
      .toBe('upi://pay?pa=a.b%40ok&pn=A%20%26%20B&am=1.50&cu=INR&tn=x%2Fy');
  });
});
```

- [ ] **Step 2:** Run → FAIL (module missing).

- [ ] **Step 3: Implement `settings.service.ts`**

```ts
// packages/api/src/services/split/settings.service.ts
/** Per-user Split preferences and the UPI pay-now deep link (spec §5, §9). */
import { Decimal } from 'decimal.js';
import type { SplitSettingsDto, SplitUpiLinkDto } from '@everypaisa/shared';
import { serializeMoney } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { requireMember, loadLedger } from './groups.service.js';
import { memberNets, simplify } from './balances.js';

export const UPI_VPA = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;
const DEFAULTS: SplitSettingsDto = { upiId: null, homeCurrency: 'INR', defaultPortfolioId: null, emailOnActivity: true, weeklyDigest: false };

const toDto = (s: { upiId: string | null; homeCurrency: string; defaultPortfolioId: string | null; emailOnActivity: boolean; weeklyDigest: boolean }): SplitSettingsDto =>
  ({ upiId: s.upiId, homeCurrency: s.homeCurrency, defaultPortfolioId: s.defaultPortfolioId, emailOnActivity: s.emailOnActivity, weeklyDigest: s.weeklyDigest });

export async function getSettings(userId: string): Promise<SplitSettingsDto> {
  const s = await prisma.splitSettings.findUnique({ where: { userId } });
  return s ? toDto(s) : { ...DEFAULTS };
}

export async function updateSettings(userId: string, patch: Partial<SplitSettingsDto>): Promise<SplitSettingsDto> {
  const data: Record<string, unknown> = {};
  if (patch.upiId !== undefined) {
    const v = patch.upiId?.trim() || null;
    if (v && !UPI_VPA.test(v)) throw new BadRequestError('Invalid UPI ID');
    data.upiId = v;
  }
  if (patch.homeCurrency !== undefined) {
    const c = patch.homeCurrency.toUpperCase();
    if (!/^[A-Z]{3}$/.test(c)) throw new BadRequestError('Invalid currency code');
    data.homeCurrency = c;
  }
  if (patch.defaultPortfolioId !== undefined) {
    if (patch.defaultPortfolioId) {
      const p = await prisma.portfolio.findFirst({ where: { id: patch.defaultPortfolioId, userId }, select: { id: true } });
      if (!p) throw new BadRequestError('Pick one of your own portfolios');
    }
    data.defaultPortfolioId = patch.defaultPortfolioId;
  }
  if (patch.emailOnActivity !== undefined) data.emailOnActivity = patch.emailOnActivity;
  if (patch.weeklyDigest !== undefined) data.weeklyDigest = patch.weeklyDigest;
  const s = await prisma.splitSettings.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return toDto(s);
}

export function buildUpiUri(p: { vpa: string; name: string; amount: string; note: string }): string {
  const e = encodeURIComponent;
  return `upi://pay?pa=${e(p.vpa)}&pn=${e(p.name)}&am=${e(p.amount)}&cu=INR&tn=${e(p.note)}`;
}

export async function upiLink(userId: string, groupId: string, toMemberId: string, amount?: string): Promise<SplitUpiLinkDto> {
  const { memberId: myId } = await requireMember(userId, groupId);
  const group = await prisma.splitGroup.findUniqueOrThrow({ where: { id: groupId }, select: { name: true, baseCurrency: true } });
  if (group.baseCurrency !== 'INR') throw new BadRequestError('SPLIT_UPI_INR_ONLY: UPI works only for INR groups');
  const target = await prisma.splitMember.findFirst({ where: { id: toMemberId, groupId, leftAt: null } });
  if (!target || target.id === myId) throw new NotFoundError('Member not found');

  const vpa = await runAsSystem(async () => {
    if (target.userId) {
      const s = await prisma.splitSettings.findUnique({ where: { userId: target.userId }, select: { upiId: true } });
      if (s?.upiId) return s.upiId;
    }
    if (target.contactId) {
      const c = await prisma.splitContact.findUnique({ where: { id: target.contactId }, select: { upiId: true } });
      if (c?.upiId) return c.upiId;
    }
    return null;
  });
  if (!vpa) throw new NotFoundError(`SPLIT_NO_UPI: ${target.displayName} hasn't added a UPI ID`);

  let value: Decimal;
  if (amount !== undefined) {
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || new Decimal(amount).lte(0)) throw new BadRequestError('SPLIT_BAD_INPUT: amount must be > 0 with at most 2 decimals');
    value = new Decimal(amount);
  } else {
    const ledger = await loadLedger(groupId);
    const t = simplify(memberNets(ledger.expenses, ledger.settlements, ledger.memberIds))
      .find((x) => x.fromMemberId === myId && x.toMemberId === toMemberId);
    if (!t) throw new BadRequestError(`SPLIT_NOTHING_OWED: you don't owe ${target.displayName} anything here`);
    value = t.amount;
  }
  const note = `${group.name} settle-up`.slice(0, 40);
  const amt = value.toFixed(2);
  return { uri: buildUpiUri({ vpa, name: target.displayName, amount: amt, note }), payeeName: target.displayName, payeeVpa: vpa, amount: serializeMoney(value), note };
}
```

Read `loadLedger` in `groups.service.ts` first — if its return shape differs from `{ expenses, settlements, memberIds }` (Plan 1 final-fix wave refactored it into a `Ledger` type), adapt the two lines that use it.

- [ ] **Step 4: Controller + routes**

In `split.controller.ts` add (reusing the file's `uid`, `parse`, `p` helpers and imports):

```ts
const settingsPatch = z.object({
  upiId: z.string().max(320).nullable().optional(),
  homeCurrency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  defaultPortfolioId: z.string().max(64).nullable().optional(),
  emailOnActivity: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
});
export const getSettingsHandler = async (req: Request, res: Response) => ok(res, await getSettings(uid(req)));
export const updateSettingsHandler = async (req: Request, res: Response) => ok(res, await updateSettings(uid(req), parse(settingsPatch, req.body)));
export const upiLinkHandler = async (req: Request, res: Response) => {
  const to = typeof req.query['to'] === 'string' ? req.query['to'] : '';
  const amount = typeof req.query['amount'] === 'string' ? req.query['amount'] : undefined;
  if (!to) throw new BadRequestError('to is required');
  ok(res, await upiLink(uid(req), p(req, 'id'), to, amount));
};
```

In `split.routes.ts`:

```ts
splitRouter.get('/settings', asyncHandler(c.getSettingsHandler));
splitRouter.put('/settings', asyncHandler(c.updateSettingsHandler));
splitRouter.get('/groups/:id/upi-link', asyncHandler(c.upiLinkHandler));
```

(`/groups/:id/upi-link` must come before nothing that would shadow it — `:id` routes are distinct paths, fine.)

- [ ] **Step 5:** Run settings tests + `test/routes/split.routes.test.ts` + tsc → PASS.
- [ ] **Step 6: Commit** `feat(split): settings and UPI pay-now link`.

---

### Task 3: Labels

**Files:**
- Create: `packages/api/src/services/split/labels.service.ts`
- Modify: controller, routes
- Test: `packages/api/test/split/labels.service.test.ts`

**Interfaces — Produces:**

```ts
export const DEFAULT_LABELS: ReadonlyArray<{ name: string; color: string }>;
export async function listLabels(userId: string, groupId: string): Promise<SplitLabelDto[]>;   // seeds defaults on first call
export async function createLabel(userId: string, groupId: string, input: { name: string; color: string }): Promise<SplitLabelDto>;
export async function deleteLabel(userId: string, labelId: string): Promise<void>;
export async function setExpenseLabels(userId: string, expenseId: string, labelIds: string[]): Promise<string[]>;
```

Routes: `GET /groups/:id/labels`, `POST /groups/:id/labels`, `DELETE /labels/:id`, `PUT /expenses/:id/labels` (body `{ labelIds: string[] }`, max 10).

Rules: names trimmed 1–30 chars, unique per group case-insensitively (409); color `^#[0-9a-fA-F]{6}$`; every labelId in `setExpenseLabels` must belong to the expense's group (400 `SPLIT_BAD_INPUT: label from another group`) — closes the Plan 1 deferred "label cross-group" minor; label changes write activity `EXPENSE_LABELED`. Defaults: Food `#E07A5F`, Travel `#3D5A80`, Rent `#81B29A`, Groceries `#F2CC8F`, Utilities `#6D597A`, Entertainment `#B56576`, Other `#8D99AE`. Seeding happens inside `listLabels` only when the group has zero labels, under the caller's context (member insert allowed by RLS).

- [ ] **Step 1: Failing tests**

```ts
// packages/api/test/split/labels.service.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import { createExpense, getExpense } from '../../src/services/split/expenses.service.js';
import { listLabels, createLabel, deleteLabel, setExpenseLabels } from '../../src/services/split/labels.service.js';

describe('split labels', () => {
  let alice: TestScope; let eve: TestScope; let groupId: string; let otherGroupId: string; let expenseId: string;
  beforeAll(async () => {
    alice = await createTestScope('split-lab-a'); eve = await createTestScope('split-lab-e');
    const c = await seedContact(alice.userId, 'Ravi');
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Flat', myDisplayName: 'Alice', contactIds: [c.id] }));
    const g2 = await alice.runAs(() => createGroup(alice.userId, { name: 'Other', myDisplayName: 'Alice' }));
    groupId = g.id; otherGroupId = g2.id;
    const me = g.members.find((m) => m.isMe)!.id;
    expenseId = (await alice.runAs(() => createExpense(alice.userId, { groupId, description: 'Milk', date: '2026-10-01', amount: '60', currency: 'INR', splitMode: 'EQUAL', payers: [{ memberId: me, amount: '60' }], shares: g.members.map((m) => ({ memberId: m.id })) }))).id;
  });
  afterAll(async () => { await cleanupSplit([alice.userId]); await alice.cleanup(); await eve.cleanup(); });

  it('seeds defaults once', async () => {
    const first = await alice.runAs(() => listLabels(alice.userId, groupId));
    expect(first.map((l) => l.name)).toEqual(['Food', 'Travel', 'Rent', 'Groceries', 'Utilities', 'Entertainment', 'Other']);
    const again = await alice.runAs(() => listLabels(alice.userId, groupId));
    expect(again).toHaveLength(7);
  });

  it('creates, rejects duplicates and bad colours', async () => {
    const l = await alice.runAs(() => createLabel(alice.userId, groupId, { name: 'Wifi', color: '#123456' }));
    expect(l.name).toBe('Wifi');
    await expect(alice.runAs(() => createLabel(alice.userId, groupId, { name: 'wifi', color: '#123456' }))).rejects.toThrow(/already/i);
    await expect(alice.runAs(() => createLabel(alice.userId, groupId, { name: 'X', color: 'red' }))).rejects.toThrow(/colour|color/i);
  });

  it('labels an expense; DTO shows labelIds; cross-group label rejected', async () => {
    const [food] = await alice.runAs(() => listLabels(alice.userId, groupId));
    const ids = await alice.runAs(() => setExpenseLabels(alice.userId, expenseId, [food!.id]));
    expect(ids).toEqual([food!.id]);
    expect((await alice.runAs(() => getExpense(alice.userId, expenseId))).labelIds).toEqual([food!.id]);
    const [foreign] = await alice.runAs(() => listLabels(alice.userId, otherGroupId));
    await expect(alice.runAs(() => setExpenseLabels(alice.userId, expenseId, [foreign!.id]))).rejects.toThrow(/another group/);
  });

  it('outsider gets 404', async () => {
    await expect(eve.runAs(() => listLabels(eve.userId, groupId))).rejects.toThrow(/not found/i);
    await expect(eve.runAs(() => setExpenseLabels(eve.userId, expenseId, []))).rejects.toThrow(/not found/i);
  });

  it('deleting a label removes it from expenses', async () => {
    const l = await alice.runAs(() => createLabel(alice.userId, groupId, { name: 'Temp', color: '#000000' }));
    await alice.runAs(() => setExpenseLabels(alice.userId, expenseId, [l.id]));
    await alice.runAs(() => deleteLabel(alice.userId, l.id));
    expect((await alice.runAs(() => getExpense(alice.userId, expenseId))).labelIds).toEqual([]);
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement**

```ts
// packages/api/src/services/split/labels.service.ts
/** Group expense labels (spec §2 SplitLabel, §9). Group labels only; personal labels are not used. */
import type { SplitLabelDto } from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { requireMember } from './groups.service.js';
import { writeActivity } from './activity.js';

export const DEFAULT_LABELS: ReadonlyArray<{ name: string; color: string }> = [
  { name: 'Food', color: '#E07A5F' }, { name: 'Travel', color: '#3D5A80' }, { name: 'Rent', color: '#81B29A' },
  { name: 'Groceries', color: '#F2CC8F' }, { name: 'Utilities', color: '#6D597A' },
  { name: 'Entertainment', color: '#B56576' }, { name: 'Other', color: '#8D99AE' },
];
const COLOR = /^#[0-9a-fA-F]{6}$/;
const toDto = (l: { id: string; groupId: string | null; name: string; color: string }): SplitLabelDto =>
  ({ id: l.id, groupId: l.groupId!, name: l.name, color: l.color });

export async function listLabels(userId: string, groupId: string): Promise<SplitLabelDto[]> {
  await requireMember(userId, groupId);
  let rows = await prisma.splitLabel.findMany({ where: { groupId }, orderBy: { id: 'asc' } });
  if (rows.length === 0) {
    await runInTransaction(async (tx) => {
      for (const d of DEFAULT_LABELS) await tx.splitLabel.create({ data: { groupId, name: d.name, color: d.color } });
    });
    rows = await prisma.splitLabel.findMany({ where: { groupId } });
    const order = new Map(DEFAULT_LABELS.map((d, i) => [d.name, i]));
    rows.sort((x, y) => (order.get(x.name) ?? 99) - (order.get(y.name) ?? 99));
  }
  return rows.map(toDto);
}

export async function createLabel(userId: string, groupId: string, input: { name: string; color: string }): Promise<SplitLabelDto> {
  await requireMember(userId, groupId);
  const name = input.name.trim();
  if (name.length < 1 || name.length > 30) throw new BadRequestError('Label name must be 1–30 characters');
  if (!COLOR.test(input.color)) throw new BadRequestError('Pick a colour like #3D5A80');
  const dup = await prisma.splitLabel.findFirst({ where: { groupId, name: { equals: name, mode: 'insensitive' } } });
  if (dup) throw new ConflictError('That label already exists');
  return toDto(await prisma.splitLabel.create({ data: { groupId, name, color: input.color } }));
}

export async function deleteLabel(userId: string, labelId: string): Promise<void> {
  const l = await prisma.splitLabel.findUnique({ where: { id: labelId } });
  if (!l || !l.groupId) throw new NotFoundError('Label not found');
  await requireMember(userId, l.groupId);
  await prisma.splitLabel.delete({ where: { id: labelId } }); // SplitExpenseLabel cascades
}

export async function setExpenseLabels(userId: string, expenseId: string, labelIds: string[]): Promise<string[]> {
  const e = await prisma.splitExpense.findUnique({ where: { id: expenseId }, select: { id: true, groupId: true, description: true } });
  if (!e) throw new NotFoundError('Expense not found');
  await requireMember(userId, e.groupId);
  const unique = [...new Set(labelIds)];
  if (unique.length > 10) throw new BadRequestError('At most 10 labels');
  const found = await prisma.splitLabel.findMany({ where: { id: { in: unique } }, select: { id: true, groupId: true } });
  if (found.length !== unique.length || found.some((l) => l.groupId !== e.groupId)) {
    throw new BadRequestError('SPLIT_BAD_INPUT: label from another group');
  }
  await runInTransaction(async (tx) => {
    await tx.splitExpenseLabel.deleteMany({ where: { expenseId } });
    for (const labelId of unique) await tx.splitExpenseLabel.create({ data: { expenseId, labelId } });
    await writeActivity(tx, e.groupId, userId, 'EXPENSE_LABELED', { expenseId, description: e.description, labelIds: unique });
  });
  return unique.sort();
}
```

- [ ] **Step 4: Controller + routes**

```ts
const labelBody = z.object({ name: z.string().max(60), color: z.string().max(7) });
const labelIdsBody = z.object({ labelIds: z.array(z.string().min(1).max(64)).max(10) });
export const listLabelsHandler = async (req: Request, res: Response) => ok(res, await listLabels(uid(req), p(req, 'id')));
export const createLabelHandler = async (req: Request, res: Response) => created(res, await createLabel(uid(req), p(req, 'id'), parse(labelBody, req.body)));
export const deleteLabelHandler = async (req: Request, res: Response) => { await deleteLabel(uid(req), p(req, 'id')); noContent(res); };
export const setExpenseLabelsHandler = async (req: Request, res: Response) => ok(res, await setExpenseLabels(uid(req), p(req, 'id'), parse(labelIdsBody, req.body).labelIds));
```

```ts
splitRouter.get('/groups/:id/labels', asyncHandler(c.listLabelsHandler));
splitRouter.post('/groups/:id/labels', asyncHandler(c.createLabelHandler));
splitRouter.delete('/labels/:id', asyncHandler(c.deleteLabelHandler));
splitRouter.put('/expenses/:id/labels', asyncHandler(c.setExpenseLabelsHandler));
```

Add `EXPENSE_LABELED` to the web `activityText` switch in Task 11 (not here).

- [ ] **Step 5:** Run labels + split tests + tsc → PASS.
- [ ] **Step 6: Commit** `feat(split): expense labels with sensible defaults`.

---

### Task 4: Comments

**Files:**
- Create: `packages/api/src/services/split/comments.service.ts`
- Modify: controller, routes
- Test: `packages/api/test/split/comments.service.test.ts`

**Interfaces — Produces:**

```ts
export async function listComments(userId: string, expenseId: string): Promise<SplitCommentDto[]>;   // oldest first, excludes deleted
export async function addComment(userId: string, expenseId: string, body: string): Promise<SplitCommentDto>;
export async function deleteComment(userId: string, commentId: string): Promise<void>;                // author only, soft
```

Routes: `GET /expenses/:id/comments`, `POST /expenses/:id/comments` (`{ body }`), `DELETE /comments/:id`. Body trimmed 1–1000 chars. `authorName` = the author's member `displayName` in that group (fallback "Former member"). Activity `COMMENTED` with `{ expenseId, description }` (no comment text in activity/emails). Deleting someone else's comment → 403 `Only the author can delete a comment`.

- [ ] **Step 1: Failing tests**

```ts
// packages/api/test/split/comments.service.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import { createExpense } from '../../src/services/split/expenses.service.js';
import { listComments, addComment, deleteComment } from '../../src/services/split/comments.service.js';

describe('split comments', () => {
  let alice: TestScope; let bob: TestScope; let eve: TestScope; let expenseId: string;
  beforeAll(async () => {
    alice = await createTestScope('split-com-a'); bob = await createTestScope('split-com-b'); eve = await createTestScope('split-com-e');
    const cb = await seedContact(alice.userId, 'Bob', bob.userId);
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Trip', myDisplayName: 'Alice', contactIds: [cb.id] }));
    const me = g.members.find((m) => m.isMe)!.id;
    expenseId = (await alice.runAs(() => createExpense(alice.userId, { groupId: g.id, description: 'Hotel', date: '2026-10-01', amount: '100', currency: 'INR', splitMode: 'EQUAL', payers: [{ memberId: me, amount: '100' }], shares: g.members.map((m) => ({ memberId: m.id })) }))).id;
  });
  afterAll(async () => { await cleanupSplit([alice.userId, bob.userId]); await alice.cleanup(); await bob.cleanup(); await eve.cleanup(); });

  it('members comment and read in order with names', async () => {
    await alice.runAs(() => addComment(alice.userId, expenseId, '  Paid by card  '));
    await bob.runAs(() => addComment(bob.userId, expenseId, 'Thanks!'));
    const list = await bob.runAs(() => listComments(bob.userId, expenseId));
    expect(list.map((c) => [c.authorName, c.body, c.mine])).toEqual([['Alice', 'Paid by card', false], ['Bob', 'Thanks!', true]]);
  });

  it('rejects empty and over-long bodies', async () => {
    await expect(alice.runAs(() => addComment(alice.userId, expenseId, '   '))).rejects.toThrow(/comment/i);
    await expect(alice.runAs(() => addComment(alice.userId, expenseId, 'x'.repeat(1001)))).rejects.toThrow(/1000/);
  });

  it('only the author deletes', async () => {
    const c = await alice.runAs(() => addComment(alice.userId, expenseId, 'mine'));
    await expect(bob.runAs(() => deleteComment(bob.userId, c.id))).rejects.toThrow(/author/i);
    await alice.runAs(() => deleteComment(alice.userId, c.id));
    expect((await alice.runAs(() => listComments(alice.userId, expenseId))).find((x) => x.id === c.id)).toBeUndefined();
  });

  it('outsider gets 404', async () => {
    await expect(eve.runAs(() => listComments(eve.userId, expenseId))).rejects.toThrow(/not found/i);
    await expect(eve.runAs(() => addComment(eve.userId, expenseId, 'hi'))).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement**

```ts
// packages/api/src/services/split/comments.service.ts
/** Expense comments (spec §8). Soft delete; author-only delete; RLS pins authorUserId on insert. */
import type { SplitCommentDto } from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { requireMember } from './groups.service.js';
import { writeActivity } from './activity.js';

async function loadExpense(userId: string, expenseId: string) {
  const e = await prisma.splitExpense.findUnique({ where: { id: expenseId }, select: { id: true, groupId: true, description: true } });
  if (!e) throw new NotFoundError('Expense not found');
  await requireMember(userId, e.groupId);
  return e;
}

async function names(groupId: string): Promise<Map<string, string>> {
  const ms = await prisma.splitMember.findMany({ where: { groupId, userId: { not: null } }, select: { userId: true, displayName: true } });
  return new Map(ms.map((m) => [m.userId!, m.displayName]));
}

export async function listComments(userId: string, expenseId: string): Promise<SplitCommentDto[]> {
  const e = await loadExpense(userId, expenseId);
  const [rows, who] = await Promise.all([
    prisma.splitComment.findMany({ where: { expenseId, deletedAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    names(e.groupId),
  ]);
  return rows.map((c) => ({
    id: c.id, expenseId: c.expenseId, authorUserId: c.authorUserId, authorName: who.get(c.authorUserId) ?? 'Former member',
    body: c.body, createdAt: c.createdAt.toISOString(), mine: c.authorUserId === userId,
  }));
}

export async function addComment(userId: string, expenseId: string, body: string): Promise<SplitCommentDto> {
  const e = await loadExpense(userId, expenseId);
  const text = body.trim();
  if (!text) throw new BadRequestError('Write a comment first');
  if (text.length > 1000) throw new BadRequestError('Comments can be at most 1000 characters');
  const c = await runInTransaction(async (tx) => {
    const row = await tx.splitComment.create({ data: { expenseId, authorUserId: userId, body: text } });
    await writeActivity(tx, e.groupId, userId, 'COMMENTED', { expenseId, description: e.description });
    return row;
  });
  const who = await names(e.groupId);
  return { id: c.id, expenseId, authorUserId: userId, authorName: who.get(userId) ?? 'You', body: c.body, createdAt: c.createdAt.toISOString(), mine: true };
}

export async function deleteComment(userId: string, commentId: string): Promise<void> {
  const c = await prisma.splitComment.findUnique({ where: { id: commentId } });
  if (!c || c.deletedAt) throw new NotFoundError('Comment not found');
  await loadExpense(userId, c.expenseId);
  if (c.authorUserId !== userId) throw new ForbiddenError('Only the author can delete a comment');
  await prisma.splitComment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
}
```

- [ ] **Step 4: Controller + routes**

```ts
const commentBody = z.object({ body: z.string().max(2000) });
export const listCommentsHandler = async (req: Request, res: Response) => ok(res, await listComments(uid(req), p(req, 'id')));
export const addCommentHandler = async (req: Request, res: Response) => created(res, await addComment(uid(req), p(req, 'id'), parse(commentBody, req.body).body));
export const deleteCommentHandler = async (req: Request, res: Response) => { await deleteComment(uid(req), p(req, 'id')); noContent(res); };
```

```ts
splitRouter.get('/expenses/:id/comments', asyncHandler(c.listCommentsHandler));
splitRouter.post('/expenses/:id/comments', asyncHandler(c.addCommentHandler));
splitRouter.delete('/comments/:id', asyncHandler(c.deleteCommentHandler));
```

Comment UPDATE stays allowed by RLS for members (Plan 1 deferred minor "members can edit others' comment body"): no edit endpoint exists, so the API never exposes it. Leave a one-line comment in `comments.service.ts` noting that.

- [ ] **Step 5:** Run → PASS. **Step 6: Commit** `feat(split): expense comments`.

---

### Task 5: Receipts (upload, view, delete) with metadata stripping

**Files:**
- Create: `packages/api/src/services/split/imageMeta.ts`, `packages/api/src/services/split/receipts.service.ts`
- Modify: controller, routes (multer memory upload, 10 MB)
- Test: `packages/api/test/split/imageMeta.test.ts`, `packages/api/test/split/receipts.service.test.ts`

**Interfaces — Produces:**

```ts
// imageMeta.ts
export type ReceiptKind = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
export function detectReceiptKind(buf: Buffer): ReceiptKind | null;
export function stripImageMetadata(buf: Buffer, kind: ReceiptKind): Buffer;   // JPEG: drop APP1..APP15 + COM; PNG: drop tEXt/iTXt/zTXt/eXIf/tIME; WebP: drop EXIF/XMP chunks + fix RIFF size; PDF: unchanged

// receipts.service.ts
export async function putReceipt(userId: string, expenseId: string, file: { buffer: Buffer; originalname: string }): Promise<{ hasReceipt: true; mime: ReceiptKind }>;
export async function getReceipt(userId: string, expenseId: string): Promise<{ buffer: Buffer; mime: string }>;
export async function deleteReceipt(userId: string, expenseId: string): Promise<void>;
```

Routes: `PUT /expenses/:id/receipt` (multipart field `file`), `GET /expenses/:id/receipt` (bytes with `Content-Type` = stored mime, `Cache-Control: private, no-store`, `Content-Disposition: inline; filename="receipt.<ext>"`), `DELETE /expenses/:id/receipt`.

Storage: `buildStorageKey('receipt' + ext)` → `saveBuffer(userId, key, stripped)`. On the expense set `receiptBlobId = key, receiptOwnerUserId = userId, receiptMime = kind`. Replacing a receipt deletes the previous blob via `deleteFile(prevOwner, prevKey)` under `runAsSystem` is NOT needed — `documentStorage` functions take the owner's userId and run as that user internally; call them with `prevOwner`. Reading: `readBuffer(e.receiptOwnerUserId, e.receiptBlobId)` after `requireMember(caller, e.groupId)`. If the blob is gone (owner deleted their account) → 404 `Receipt no longer available`. Deleted (soft) expenses: view allowed, upload/delete rejected (400). Activity `RECEIPT_ADDED` / `RECEIPT_REMOVED`.

- [ ] **Step 1: Failing tests (pure)**

```ts
// packages/api/test/split/imageMeta.test.ts
import { describe, it, expect } from 'vitest';
import { detectReceiptKind, stripImageMetadata } from '../../src/services/split/imageMeta.js';

// Minimal JPEG: SOI, APP0 JFIF, APP1 Exif (with GPS marker text), SOS stub, EOI
function jpegWithExif(): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const exifPayload = Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from('GPSLatitude=19.07')]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([0x00, exifPayload.length + 2]), exifPayload]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, app1, sos, Buffer.from([0xff, 0xd9])]);
}

function pngWithText(): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]); // CRC unchecked by stripper
  };
  return Buffer.concat([sig, chunk('IHDR', Buffer.alloc(13)), chunk('tEXt', Buffer.from('Author\0Secret')), chunk('IDAT', Buffer.from([1, 2, 3])), chunk('IEND', Buffer.alloc(0))]);
}

describe('imageMeta', () => {
  it('detects kinds by magic bytes', () => {
    expect(detectReceiptKind(jpegWithExif())).toBe('image/jpeg');
    expect(detectReceiptKind(pngWithText())).toBe('image/png');
    expect(detectReceiptKind(Buffer.from('%PDF-1.7\n'))).toBe('application/pdf');
    expect(detectReceiptKind(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]))).toBe('image/webp');
    expect(detectReceiptKind(Buffer.from('MZ\x90\x00'))).toBeNull();
  });

  it('strips JPEG EXIF but keeps JFIF and image data', () => {
    const out = stripImageMetadata(jpegWithExif(), 'image/jpeg');
    expect(out.includes(Buffer.from('GPSLatitude'))).toBe(false);
    expect(out.includes(Buffer.from('JFIF'))).toBe(true);
    expect(out.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
  });

  it('strips PNG text chunks', () => {
    const out = stripImageMetadata(pngWithText(), 'image/png');
    expect(out.includes(Buffer.from('Secret'))).toBe(false);
    expect(out.includes(Buffer.from('IDAT'))).toBe(true);
  });

  it('leaves PDFs alone', () => {
    const pdf = Buffer.from('%PDF-1.7\nhello');
    expect(stripImageMetadata(pdf, 'application/pdf')).toEqual(pdf);
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement `imageMeta.ts`**

```ts
// packages/api/src/services/split/imageMeta.ts
/**
 * Receipt type detection and metadata stripping without native image
 * libraries. We only remove whole metadata segments/chunks; pixel data is
 * never re-encoded, so a malformed file stays exactly as malformed as it was.
 */
export type ReceiptKind = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export function detectReceiptKind(buf: Buffer): ReceiptKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

function stripJpeg(buf: Buffer): Buffer {
  const out: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return buf; // not a marker where one is expected: leave file untouched
    const marker = buf[i + 1]!;
    if (marker === 0xda) { out.push(buf.subarray(i)); return Buffer.concat(out); } // SOS: rest is image data
    const len = buf.readUInt16BE(i + 2);
    const end = i + 2 + len;
    if (end > buf.length) return buf;
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe; // APP1..APP15, COM
    if (!drop) out.push(buf.subarray(i, end));
    i = end;
  }
  return buf;
}

const PNG_DROP = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME']);
function stripPng(buf: Buffer): Buffer {
  const out: Buffer[] = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const end = i + 12 + len;
    if (end > buf.length) return buf;
    if (!PNG_DROP.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return Buffer.concat(out);
}

function stripWebp(buf: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const type = buf.toString('ascii', i, i + 4);
    const len = buf.readUInt32LE(i + 4);
    const end = i + 8 + len + (len % 2);
    if (end > buf.length) return buf;
    if (type !== 'EXIF' && type !== 'XMP ') chunks.push(buf.subarray(i, end));
    i = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.from(buf.subarray(0, 12));
  header.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([header, body]);
}

export function stripImageMetadata(buf: Buffer, kind: ReceiptKind): Buffer {
  switch (kind) {
    case 'image/jpeg': return stripJpeg(buf);
    case 'image/png': return stripPng(buf);
    case 'image/webp': return stripWebp(buf);
    case 'application/pdf': return buf;
  }
}
```

(The WebP stripper does not clear the VP8X EXIF/XMP flag bits; decoders ignore a set flag with no chunk. Note this in a code comment.)

- [ ] **Step 4: Receipts service tests**

```ts
// packages/api/test/split/receipts.service.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import { createExpense, getExpense } from '../../src/services/split/expenses.service.js';
import { putReceipt, getReceipt, deleteReceipt } from '../../src/services/split/receipts.service.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from([0, 0, 0, 0]), Buffer.from('IEND'), Buffer.alloc(4)]);

describe('split receipts', () => {
  let alice: TestScope; let bob: TestScope; let eve: TestScope; let expenseId: string;
  beforeAll(async () => {
    alice = await createTestScope('split-rcpt-a'); bob = await createTestScope('split-rcpt-b'); eve = await createTestScope('split-rcpt-e');
    const cb = await seedContact(alice.userId, 'Bob', bob.userId);
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Trip', myDisplayName: 'Alice', contactIds: [cb.id] }));
    const me = g.members.find((m) => m.isMe)!.id;
    expenseId = (await alice.runAs(() => createExpense(alice.userId, { groupId: g.id, description: 'Dinner', date: '2026-10-01', amount: '100', currency: 'INR', splitMode: 'EQUAL', payers: [{ memberId: me, amount: '100' }], shares: g.members.map((m) => ({ memberId: m.id })) }))).id;
  });
  afterAll(async () => { await cleanupSplit([alice.userId, bob.userId]); await alice.cleanup(); await bob.cleanup(); await eve.cleanup(); });

  it('uploader stores, another member reads the same bytes', async () => {
    await alice.runAs(() => putReceipt(alice.userId, expenseId, { buffer: PNG, originalname: 'r.png' }));
    expect((await alice.runAs(() => getExpense(alice.userId, expenseId))).hasReceipt).toBe(true);
    const got = await bob.runAs(() => getReceipt(bob.userId, expenseId));
    expect(got.mime).toBe('image/png');
    expect(got.buffer.equals(PNG)).toBe(true);
  });

  it('rejects non-receipt files', async () => {
    await expect(alice.runAs(() => putReceipt(alice.userId, expenseId, { buffer: Buffer.from('MZ\x90\x00junk'), originalname: 'r.jpg' }))).rejects.toThrow(/JPEG, PNG, WebP or PDF/);
  });

  it('outsider gets 404', async () => {
    await expect(eve.runAs(() => getReceipt(eve.userId, expenseId))).rejects.toThrow(/not found/i);
  });

  it('a member can remove it', async () => {
    await bob.runAs(() => deleteReceipt(bob.userId, expenseId));
    expect((await alice.runAs(() => getExpense(alice.userId, expenseId))).hasReceipt).toBe(false);
    await expect(alice.runAs(() => getReceipt(alice.userId, expenseId))).rejects.toThrow(/no receipt/i);
  });
});
```

- [ ] **Step 5: Implement `receipts.service.ts`**

```ts
// packages/api/src/services/split/receipts.service.ts
/**
 * Receipt files. Bytes live in the uploader's sealed DocumentBlob (owner-only
 * RLS, per-user key). Any current group member may read them: membership is
 * checked under the caller's own RLS context, then the blob is opened as its
 * owner via documentStorage, which runs as that user internally.
 */
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { buildStorageKey, saveBuffer, readBuffer, deleteFile } from '../../lib/documentStorage.js';
import { requireMember } from './groups.service.js';
import { writeActivity } from './activity.js';
import { detectReceiptKind, stripImageMetadata, type ReceiptKind } from './imageMeta.js';

const MAX_BYTES = 10 * 1024 * 1024;
const EXT: Record<ReceiptKind, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };

async function load(userId: string, expenseId: string) {
  const e = await prisma.splitExpense.findUnique({
    where: { id: expenseId },
    select: { id: true, groupId: true, description: true, deletedAt: true, receiptBlobId: true, receiptOwnerUserId: true, receiptMime: true },
  });
  if (!e) throw new NotFoundError('Expense not found');
  await requireMember(userId, e.groupId);
  return e;
}

async function dropBlob(ownerId: string | null, key: string | null): Promise<void> {
  if (!ownerId || !key) return;
  try {
    await deleteFile(ownerId, key);
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err; // already gone (owner deleted their account): nothing to drop
  }
}

export async function putReceipt(userId: string, expenseId: string, file: { buffer: Buffer; originalname: string }) {
  const e = await load(userId, expenseId);
  if (e.deletedAt) throw new BadRequestError('Restore the expense before changing its receipt');
  if (file.buffer.length === 0 || file.buffer.length > MAX_BYTES) throw new BadRequestError('Receipts must be under 10 MB');
  const kind = detectReceiptKind(file.buffer);
  if (!kind) throw new BadRequestError('Upload a JPEG, PNG, WebP or PDF receipt');
  const clean = stripImageMetadata(file.buffer, kind);
  const key = buildStorageKey(`receipt${EXT[kind]}`);
  await saveBuffer(userId, key, clean);
  await runInTransaction(async (tx) => {
    await tx.splitExpense.update({ where: { id: expenseId }, data: { receiptBlobId: key, receiptOwnerUserId: userId, receiptMime: kind } });
    await writeActivity(tx, e.groupId, userId, 'RECEIPT_ADDED', { expenseId, description: e.description });
  });
  await dropBlob(e.receiptOwnerUserId, e.receiptBlobId);
  return { hasReceipt: true as const, mime: kind };
}

export async function getReceipt(userId: string, expenseId: string): Promise<{ buffer: Buffer; mime: string }> {
  const e = await load(userId, expenseId);
  if (!e.receiptBlobId || !e.receiptOwnerUserId) throw new NotFoundError('No receipt attached');
  try {
    return { buffer: await readBuffer(e.receiptOwnerUserId, e.receiptBlobId), mime: e.receiptMime ?? 'application/octet-stream' };
  } catch (err) {
    if (err instanceof NotFoundError) throw new NotFoundError('Receipt no longer available');
    throw err;
  }
}

export async function deleteReceipt(userId: string, expenseId: string): Promise<void> {
  const e = await load(userId, expenseId);
  if (e.deletedAt) throw new BadRequestError('Restore the expense before changing its receipt');
  if (!e.receiptBlobId) return;
  await runInTransaction(async (tx) => {
    await tx.splitExpense.update({ where: { id: expenseId }, data: { receiptBlobId: null, receiptOwnerUserId: null, receiptMime: null } });
    await writeActivity(tx, e.groupId, userId, 'RECEIPT_REMOVED', { expenseId, description: e.description });
  });
  await dropBlob(e.receiptOwnerUserId, e.receiptBlobId);
}
```

Check `documentStorage.deleteFile`'s behaviour on a missing key; if it doesn't throw `NotFoundError`, simplify `dropBlob` to a plain call.

- [ ] **Step 6: Upload middleware, controller, routes**

```ts
// in split.routes.ts (top)
import multer from 'multer';
const receiptUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } }).single('file');

splitRouter.put('/expenses/:id/receipt', receiptUpload, asyncHandler(c.putReceiptHandler));
splitRouter.get('/expenses/:id/receipt', asyncHandler(c.getReceiptHandler));
splitRouter.delete('/expenses/:id/receipt', asyncHandler(c.deleteReceiptHandler));
```

```ts
// controller
export const putReceiptHandler = async (req: Request, res: Response) => {
  if (!req.file) throw new BadRequestError('Attach a receipt file');
  ok(res, await putReceipt(uid(req), p(req, 'id'), { buffer: req.file.buffer, originalname: req.file.originalname }));
};
export const getReceiptHandler = async (req: Request, res: Response) => {
  const r = await getReceipt(uid(req), p(req, 'id'));
  const ext = r.mime === 'application/pdf' ? 'pdf' : r.mime.split('/')[1];
  res.setHeader('Content-Type', r.mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `inline; filename="receipt.${ext}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(r.buffer);
};
export const deleteReceiptHandler = async (req: Request, res: Response) => { await deleteReceipt(uid(req), p(req, 'id')); noContent(res); };
```

Multer's `LIMIT_FILE_SIZE` error must surface as 400 "Receipts must be under 10 MB": check how `errorHandler` treats `MulterError` (documents route); if it becomes a 500, wrap the middleware: `(req,res,next) => receiptUpload(req,res,(err) => err ? next(new BadRequestError('Receipts must be under 10 MB')) : next())`.

- [ ] **Step 7:** Run imageMeta + receipts + split tests + tsc → PASS. Add one route test in `test/routes/split.routes.test.ts`: PUT a PNG as Alice via `FormData` (`fetch` with a `Blob`) → 200; GET as Bob → 200 with `content-type: image/png`; GET as Eve → 404.
- [ ] **Step 8: Commit** `feat(split): receipts with metadata stripping`.

---

### Task 6: "Add my share to Cash Activity" with sync

**Files:**
- Create: `packages/api/src/services/split/shareLink.service.ts`, `packages/api/src/jobs/splitShareLinkReconcileJob.ts`
- Modify: `expenses.service.ts` (call sync after update/delete/restore), controller, routes, `src/jobs/startupSync.ts`
- Test: `packages/api/test/split/shareLink.service.test.ts`

**Interfaces — Produces:**

```ts
export async function getShareLink(userId: string, expenseId: string): Promise<SplitShareLinkDto>;
export async function setShareLink(userId: string, expenseId: string, input: { enabled: boolean; portfolioId?: string | null }): Promise<SplitShareLinkDto>;
export async function syncShareLinks(expenseId: string): Promise<void>;   // runs as system; for every link on the expense: upsert/delete the CashFlow
export async function reconcileAllShareLinks(): Promise<{ checked: number; fixed: number }>;
```

Routes: `GET /expenses/:id/share-link`, `PUT /expenses/:id/share-link` (`{ enabled, portfolioId? }`).

Rules:
- Caller's share = sum of `SplitShare.baseAmount` for the caller's member id on that expense. Not a participant → 400 `SPLIT_NOT_IN_SPLIT: you're not part of this expense`.
- Enabling needs a portfolio: `input.portfolioId ?? settings.defaultPortfolioId`; must be the caller's own (`prisma.portfolio.findFirst({ where: { id, userId } })`), else 400 `Pick one of your portfolios`.
- CashFlow fields: `portfolioId`, `date` = expense date, `type: 'OUTFLOW'`, `amount` = share (group base currency), `currency` = base === 'INR' ? null : base, `inrEquivalent` = base === 'INR' ? null : share × `getLatestFxRate(base,'INR')` (2 dp; if no rate, null and description gets " (rate unavailable)"), `description` = `Split: <expense description> (<group name>)`.
- Expense deleted (soft) or caller's share now zero/absent → the CashFlow is deleted but the link row stays (so restore brings it back). Link disabled → CashFlow and link both deleted.
- `syncShareLinks` is called by `updateExpense`, `deleteExpense`, `restoreExpense` **after** their transaction commits, wrapped in `runAsSystem`. A sync failure must not undo the user's committed edit: catch, `logger.error({ err, expenseId }, '[split] share-link sync failed')`, and rethrow nothing — the nightly `reconcileAllShareLinks` (02:30 IST, `ENABLE_SPLIT_SHARELINK_RECONCILE_CRON !== 'false'`) repairs drift. This is the one deliberate catch-and-log in the feature; comment it with that reason.

- [ ] **Step 1: Failing tests**

```ts
// packages/api/test/split/shareLink.service.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import { createExpense, updateExpense, deleteExpense, restoreExpense } from '../../src/services/split/expenses.service.js';
import { getShareLink, setShareLink, reconcileAllShareLinks } from '../../src/services/split/shareLink.service.js';

describe('split share → Cash Activity', () => {
  let alice: TestScope; let bob: TestScope; let groupId: string; let a: string; let b: string; let expenseId: string;
  const cashFlowFor = (id: string | null) => runAsSystem(() => (id ? prisma.cashFlow.findUnique({ where: { id } }) : Promise.resolve(null)));

  beforeAll(async () => {
    alice = await createTestScope('split-sl-a'); bob = await createTestScope('split-sl-b');
    const cb = await seedContact(alice.userId, 'Bob', bob.userId);
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Flat', myDisplayName: 'Alice', contactIds: [cb.id] }));
    groupId = g.id; a = g.members.find((m) => m.isMe)!.id; b = g.members.find((m) => !m.isMe)!.id;
    expenseId = (await alice.runAs(() => createExpense(alice.userId, { groupId, description: 'Rent', date: '2026-10-01', amount: '1000', currency: 'INR', splitMode: 'EQUAL', payers: [{ memberId: b, amount: '1000' }], shares: [{ memberId: a }, { memberId: b }] }))).id;
  });
  afterAll(async () => {
    await runAsSystem(() => prisma.splitShareLink.deleteMany({ where: { userId: { in: [alice.userId, bob.userId] } } }));
    await cleanupSplit([alice.userId, bob.userId]); await alice.cleanup(); await bob.cleanup();
  });

  it('needs a portfolio, then creates an OUTFLOW of my share', async () => {
    await expect(alice.runAs(() => setShareLink(alice.userId, expenseId, { enabled: true }))).rejects.toThrow(/portfolio/i);
    const l = await alice.runAs(() => setShareLink(alice.userId, expenseId, { enabled: true, portfolioId: alice.portfolioId }));
    expect(l).toMatchObject({ enabled: true, myShare: '500.0000', currency: 'INR' });
    const cf = await cashFlowFor(l.cashFlowId);
    expect(cf).toMatchObject({ type: 'OUTFLOW', portfolioId: alice.portfolioId, description: 'Split: Rent (Flat)' });
    expect(cf!.amount.toString()).toBe('500');
  });

  it("rejects someone else's portfolio", async () => {
    await expect(bob.runAs(() => setShareLink(bob.userId, expenseId, { enabled: true, portfolioId: alice.portfolioId }))).rejects.toThrow(/portfolio/i);
  });

  it('co-member edit syncs my cash flow; delete removes it; restore brings it back', async () => {
    await bob.runAs(() => updateExpense(bob.userId, expenseId, { description: 'Rent Oct', date: '2026-10-01', amount: '1200', currency: 'INR', splitMode: 'EQUAL', payers: [{ memberId: b, amount: '1200' }], shares: [{ memberId: a }, { memberId: b }] }));
    let l = await alice.runAs(() => getShareLink(alice.userId, expenseId));
    expect((await cashFlowFor(l.cashFlowId))!.amount.toString()).toBe('600');
    await bob.runAs(() => deleteExpense(bob.userId, expenseId));
    l = await alice.runAs(() => getShareLink(alice.userId, expenseId));
    expect(l.cashFlowId).toBeNull();
    expect(l.enabled).toBe(true);
    await bob.runAs(() => restoreExpense(bob.userId, expenseId));
    l = await alice.runAs(() => getShareLink(alice.userId, expenseId));
    expect((await cashFlowFor(l.cashFlowId))!.amount.toString()).toBe('600');
  });

  it('disable removes the cash flow and the link', async () => {
    const before = await alice.runAs(() => getShareLink(alice.userId, expenseId));
    const l = await alice.runAs(() => setShareLink(alice.userId, expenseId, { enabled: false }));
    expect(l.enabled).toBe(false);
    expect(await cashFlowFor(before.cashFlowId)).toBeNull();
  });

  it('reconcile repairs a drifted cash flow', async () => {
    const l = await alice.runAs(() => setShareLink(alice.userId, expenseId, { enabled: true, portfolioId: alice.portfolioId }));
    await runAsSystem(() => prisma.cashFlow.update({ where: { id: l.cashFlowId! }, data: { amount: '1' } }));
    const r = await runAsSystem(() => reconcileAllShareLinks());
    expect(r.fixed).toBeGreaterThanOrEqual(1);
    expect((await cashFlowFor(l.cashFlowId))!.amount.toString()).toBe('600');
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement `shareLink.service.ts`**

```ts
// packages/api/src/services/split/shareLink.service.ts
/**
 * "Add my share to Cash Activity" (spec §6). One SplitShareLink per (expense,
 * user); the CashFlow it points at is derived from the expense and rewritten on
 * every sync. Sync runs as system because a co-member's edit must update MY
 * cash flow, which my RLS context alone can write.
 */
import { Decimal } from 'decimal.js';
import type { SplitShareLinkDto } from '@everypaisa/shared';
import { serializeMoney } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { getLatestFxRate } from '../../priceFeeds/fx.service.js';
import { requireMember } from './groups.service.js';

type Desired = { portfolioId: string; date: Date; amount: Decimal; currency: string | null; inrEquivalent: Decimal | null; description: string } | null;

async function myShare(expenseId: string, userId: string) {
  const e = await prisma.splitExpense.findUnique({
    where: { id: expenseId },
    include: { shares: true, group: { select: { name: true, baseCurrency: true, members: { select: { id: true, userId: true } } } } },
  });
  if (!e) return null;
  const memberIds = new Set(e.group.members.filter((m) => m.userId === userId).map((m) => m.id));
  const share = e.shares.filter((s) => memberIds.has(s.memberId)).reduce((a, s) => a.plus(s.baseAmount.toString()), new Decimal(0));
  return { e, share };
}

async function desiredFor(link: { expenseId: string; userId: string; portfolioId: string }): Promise<Desired> {
  const r = await myShare(link.expenseId, link.userId);
  if (!r || r.e.deletedAt || r.share.lte(0)) return null;
  const base = r.e.group.baseCurrency;
  let inr: Decimal | null = null;
  let suffix = '';
  if (base !== 'INR') {
    const rate = await getLatestFxRate(base, 'INR');
    if (rate) inr = r.share.mul(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
    else suffix = ' (rate unavailable)';
  }
  return {
    portfolioId: link.portfolioId, date: r.e.date, amount: r.share, currency: base === 'INR' ? null : base, inrEquivalent: inr,
    description: `Split: ${r.e.description} (${r.e.group.name})${suffix}`.slice(0, 250),
  };
}

/** Bring one link's CashFlow in line with the expense. Returns true when something changed. Runs as system. */
async function syncOne(link: { id: string; expenseId: string; userId: string; cashFlowId: string; portfolioId: string }): Promise<boolean> {
  const want = await desiredFor(link);
  const have = link.cashFlowId ? await prisma.cashFlow.findUnique({ where: { id: link.cashFlowId } }) : null;
  if (!want) {
    if (!have) return false;
    await prisma.cashFlow.delete({ where: { id: have.id } });
    await prisma.splitShareLink.update({ where: { id: link.id }, data: { cashFlowId: '' } });
    return true;
  }
  const data = { portfolioId: want.portfolioId, date: want.date, type: 'OUTFLOW' as const, amount: want.amount.toFixed(4), currency: want.currency, inrEquivalent: want.inrEquivalent?.toFixed(4) ?? null, description: want.description };
  if (!have) {
    const cf = await prisma.cashFlow.create({ data, select: { id: true } });
    await prisma.splitShareLink.update({ where: { id: link.id }, data: { cashFlowId: cf.id } });
    return true;
  }
  const eqDec = (a: { toString(): string } | null, b: Decimal | null) =>
    a === null || b === null ? a === b : new Decimal(a.toString()).eq(b);
  const same = have.portfolioId === data.portfolioId && have.date.getTime() === data.date.getTime()
    && eqDec(have.amount, want.amount) && (have.currency ?? null) === data.currency
    && eqDec(have.inrEquivalent, want.inrEquivalent) && have.description === data.description;
  if (same) return false;
  await prisma.cashFlow.update({ where: { id: have.id }, data });
  return true;
}
```

The link row needs to remember its portfolio even while its CashFlow is gone (deleted expense). `SplitShareLink` has no `portfolioId` column — **add `portfolioId String` to `SplitShareLink`** in this task's migration (`20261008130000_split_sharelink_portfolio`: `ALTER TABLE "SplitShareLink" ADD COLUMN "portfolioId" TEXT NOT NULL DEFAULT ''; ALTER TABLE "SplitShareLink" ALTER COLUMN "portfolioId" DROP DEFAULT;` — the table is empty everywhere), and treat `cashFlowId = ''` as "no cash flow right now". Add `portfolioId String` to the Prisma `SplitShareLink` model too. Add `'@@index([portfolioId])'` is not needed (lookups are by expense/user).

Continue the file:

```ts
export async function syncShareLinks(expenseId: string): Promise<void> {
  await runAsSystem(async () => {
    const links = await prisma.splitShareLink.findMany({ where: { expenseId } });
    for (const l of links) await syncOne(l);
  });
}

/** Called after expense writes commit. Never fails the caller's request; the nightly reconcile repairs drift. */
export async function syncShareLinksSafely(expenseId: string): Promise<void> {
  try {
    await syncShareLinks(expenseId);
  } catch (err) {
    logger.error({ err, expenseId }, '[split] share-link sync failed; nightly reconcile will repair');
  }
}

export async function reconcileAllShareLinks(): Promise<{ checked: number; fixed: number }> {
  return runAsSystem(async () => {
    const links = await prisma.splitShareLink.findMany();
    let fixed = 0;
    for (const l of links) if (await syncOne(l)) fixed += 1;
    return { checked: links.length, fixed };
  });
}

async function toDto(userId: string, expenseId: string): Promise<SplitShareLinkDto> {
  const r = await myShare(expenseId, userId);
  if (!r) throw new NotFoundError('Expense not found');
  const link = await prisma.splitShareLink.findUnique({ where: { expenseId_userId: { expenseId, userId } } });
  return {
    expenseId, enabled: !!link, portfolioId: link?.portfolioId ?? null, cashFlowId: link?.cashFlowId || null,
    myShare: serializeMoney(r.share), currency: r.e.group.baseCurrency,
  };
}

export async function getShareLink(userId: string, expenseId: string): Promise<SplitShareLinkDto> {
  const e = await prisma.splitExpense.findUnique({ where: { id: expenseId }, select: { groupId: true } });
  if (!e) throw new NotFoundError('Expense not found');
  await requireMember(userId, e.groupId);
  return toDto(userId, expenseId);
}

export async function setShareLink(userId: string, expenseId: string, input: { enabled: boolean; portfolioId?: string | null }): Promise<SplitShareLinkDto> {
  const e = await prisma.splitExpense.findUnique({ where: { id: expenseId }, select: { groupId: true } });
  if (!e) throw new NotFoundError('Expense not found');
  await requireMember(userId, e.groupId);
  const existing = await prisma.splitShareLink.findUnique({ where: { expenseId_userId: { expenseId, userId } } });

  if (!input.enabled) {
    if (existing) {
      await runAsSystem(async () => {
        if (existing.cashFlowId) await prisma.cashFlow.deleteMany({ where: { id: existing.cashFlowId } });
        await prisma.splitShareLink.delete({ where: { id: existing.id } });
      });
    }
    return toDto(userId, expenseId);
  }

  const r = await myShare(expenseId, userId);
  if (!r || r.share.lte(0)) throw new BadRequestError("SPLIT_NOT_IN_SPLIT: you're not part of this expense");
  const settings = await prisma.splitSettings.findUnique({ where: { userId }, select: { defaultPortfolioId: true } });
  const portfolioId = input.portfolioId ?? existing?.portfolioId ?? settings?.defaultPortfolioId ?? null;
  const owned = portfolioId ? await prisma.portfolio.findFirst({ where: { id: portfolioId, userId }, select: { id: true } }) : null;
  if (!owned) throw new BadRequestError('Pick one of your portfolios for Cash Activity');

  const link = existing
    ? await prisma.splitShareLink.update({ where: { id: existing.id }, data: { portfolioId: owned.id } })
    : await prisma.splitShareLink.create({ data: { expenseId, userId, portfolioId: owned.id, cashFlowId: '' } });
  await runAsSystem(() => syncOne(link));
  return toDto(userId, expenseId);
}
```

In `expenses.service.ts`, after the `runInTransaction` in `updateExpense`, `deleteExpense` and `restoreExpense`, add `await syncShareLinksSafely(id);` (import from `./shareLink.service.js`). Watch for an import cycle (`shareLink.service` imports `groups.service`, not `expenses.service` — fine).

- [ ] **Step 4: Reconcile job** — `packages/api/src/jobs/splitShareLinkReconcileJob.ts` following `pfNudgeJob.ts`:

```ts
import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { reconcileAllShareLinks } from '../services/split/shareLink.service.js';

let running = false;
async function run(): Promise<void> {
  if (running) { logger.warn('[split] share-link reconcile already running'); return; }
  running = true;
  try {
    const r = await reconcileAllShareLinks();
    logger.info(r, '[split] share-link reconcile done');
  } catch (err) {
    logger.error({ err }, '[split] share-link reconcile failed');
  } finally {
    running = false;
  }
}

export function startSplitShareLinkReconcileJob(): void {
  if (process.env.ENABLE_SPLIT_SHARELINK_RECONCILE_CRON === 'false') return;
  cron.schedule('30 2 * * *', () => void run(), { timezone: 'Asia/Kolkata' });
}
```

Register in `src/jobs/startupSync.ts` next to `startPfNudgeJob()`.

- [ ] **Step 5: Controller + routes**

```ts
const shareLinkBody = z.object({ enabled: z.boolean(), portfolioId: z.string().max(64).nullable().optional() });
export const getShareLinkHandler = async (req: Request, res: Response) => ok(res, await getShareLink(uid(req), p(req, 'id')));
export const setShareLinkHandler = async (req: Request, res: Response) => ok(res, await setShareLink(uid(req), p(req, 'id'), parse(shareLinkBody, req.body)));
```

```ts
splitRouter.get('/expenses/:id/share-link', asyncHandler(c.getShareLinkHandler));
splitRouter.put('/expenses/:id/share-link', asyncHandler(c.setShareLinkHandler));
```

- [ ] **Step 6:** Run share-link + all split tests + `test/invariants` + tsc → PASS (CashFlow is RLS-protected; the system-context writes must pass, the user-context reads in tests go through `runAsSystem` as written).
- [ ] **Step 7: Commit** `feat(split): add my share to Cash Activity, kept in sync`.

---

### Task 7: Linking placeholders to real accounts + invites

**Files:**
- Create: `packages/api/src/services/split/linking.service.ts`
- Modify: `packages/api/src/services/auth.service.ts` (call after user creation in `verifyRegistration` and in the Google new-user path), `contacts.service.ts` (link on create/update), controller, routes
- Test: `packages/api/test/split/linking.service.test.ts`

**Interfaces — Produces:**

```ts
export async function linkContactsForUser(user: { id: string; email: string }): Promise<{ contacts: number; members: number }>;   // system
export async function linkContactToExistingUser(contactId: string): Promise<boolean>;                                          // system; on contact create/update
export async function sendInvite(userId: string, contactId: string): Promise<{ sent: boolean }>;
```

Route: `POST /contacts/:id/invite`.

Rules (spec §10):
- `linkContactsForUser`: compute `hashIdentifier(normalizeEmail(email), 'split-contact-email')`; find all `SplitContact` with that `emailHash` and `linkedUserId: null`; skip a contact whose owner IS this user; set `linkedUserId`; for each `SplitMember` with that `contactId` and `userId: null`: if the group already has an active member with this `userId`, leave it (log), else set `userId`. Activity `MEMBER_LINKED` (actor = the new user). All under `runAsSystem`.
- Called (a) right after `tx.user.create` succeeds in `verifyRegistration` (outside the tx, before `issueSession`), (b) in the Google sign-in path only when a NEW user is created and `payload.email_verified === true`. Failure must not block signup: wrap in try/catch → `logger.error`, with a comment (same reason as Task 6; re-run on every contact create/update covers retries).
- `linkContactToExistingUser`: on contact create, or update when the email changes, look up `prisma.user.findUnique({ where: { email: normalizedEmail } })` under `runAsSystem`; if found and ≠ owner → link the contact (and any existing members built from it). Pending registrations never link (they are not Users).
- `sendInvite`: contact must belong to caller and have an email; already linked → 409 `They're already on EveryPaisa`; ≤ 1 invite per contact per 24 h (store `AuditLog` row `action: 'split_invite'`, `resource: 'SplitContact:<id>'`; check the latest such row) → 429-style `TooManyRequestsError('Already invited today')`. Email via `renderInviteShell` with heading "<sender name> invited you to split expenses", button "Join EveryPaisa" → `${env.FRONTEND_URL}/register?email=<encoded>`, no amounts in the body. `sendEmail` result `sent:false` (e.g. SMTP not configured) → return `{ sent: false }` (not an error) so the UI can say "Invite couldn't be sent right now".

- [ ] **Step 1: Failing tests**

```ts
// packages/api/test/split/linking.service.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { cleanupSplit } from '../helpers/splitFixtures.js';
import { createContact } from '../../src/services/split/contacts.service.js';
import { createGroup, getGroup } from '../../src/services/split/groups.service.js';
import { linkContactsForUser, sendInvite } from '../../src/services/split/linking.service.js';

const sent = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/notifications/email.service.js', () => ({ sendEmail: sent }));

describe('split linking + invites', () => {
  let alice: TestScope; let newcomer: { id: string; email: string } | null = null;
  const email = `split-link-${randomUUID().slice(0, 8)}@test.local`;
  beforeAll(async () => { alice = await createTestScope('split-link-a'); sent.mockResolvedValue({ sent: true, messageId: 'm1' }); });
  afterAll(async () => {
    await cleanupSplit([alice.userId]);
    if (newcomer) await runAsSystem(() => prisma.user.delete({ where: { id: newcomer!.id } }));
    await runAsSystem(() => prisma.auditLog.deleteMany({ where: { userId: alice.userId } }));
    await alice.cleanup();
  });

  it('placeholder becomes a real member after the person signs up with a verified email', async () => {
    const c = await alice.runAs(() => createContact(alice.userId, { name: 'Neha', email }));
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Trip', myDisplayName: 'Alice', contactIds: [c.id] }));
    expect(g.members.find((m) => m.displayName === 'Neha')!.userId).toBeNull();
    const u = await runAsSystem(() => prisma.user.create({ data: { email, passwordHash: 'x', name: 'Neha S' } }));
    newcomer = { id: u.id, email };
    const r = await linkContactsForUser(newcomer);
    expect(r).toEqual({ contacts: 1, members: 1 });
    const seen = await runAsSystem(() => prisma.splitMember.findFirst({ where: { groupId: g.id, userId: u.id } }));
    expect(seen).not.toBeNull();
    const asNeha = await (await createTestScopeFor(u.id)).runAs(() => getGroup(u.id, g.id));
    expect(asNeha.name).toBe('Trip');
  });

  it('a contact added for an existing user links immediately', async () => {
    const c = await alice.runAs(() => createContact(alice.userId, { name: 'Neha again', email: email.toUpperCase() }));
    expect(c.linkedUserId).toBe(newcomer!.id);
  });

  it('invites once a day, refuses linked contacts', async () => {
    const c = await alice.runAs(() => createContact(alice.userId, { name: 'Kabir', email: `kabir-${randomUUID().slice(0, 6)}@test.local` }));
    expect(await alice.runAs(() => sendInvite(alice.userId, c.id))).toEqual({ sent: true });
    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0]![0].html).toContain('/register?email=');
    await expect(alice.runAs(() => sendInvite(alice.userId, c.id))).rejects.toThrow(/Already invited today/);
    const linked = await alice.runAs(() => createContact(alice.userId, { name: 'N3', email }));
    await expect(alice.runAs(() => sendInvite(alice.userId, linked.id))).rejects.toThrow(/already on EveryPaisa/);
  });
});

async function createTestScopeFor(userId: string) {
  const { runAsUser } = await import('../../src/lib/requestContext.js');
  return { runAs: <T>(fn: () => Promise<T>) => runAsUser(userId, fn) };
}
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement `linking.service.ts`** (imports `hashIdentifier` from `../pfCredentials.service.js`, `normalizeEmail`/`getContactRow`-style lookups, `openText` from `../piiAtRest.service.js`, `renderInviteShell` from `../notifications/caInviteEmail.template.js`, `sendEmail`, `env`, `writeActivity`, `TooManyRequestsError`, `ConflictError`):

```ts
// packages/api/src/services/split/linking.service.ts
/**
 * Turn placeholder contacts into real members once the person has a verified
 * account (spec §10). Only verified emails link: registration verifies by code
 * before the User row exists, and Google sign-in requires email_verified.
 */
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { runAsSystem } from '../../lib/requestContext.js';
import { ConflictError, NotFoundError, BadRequestError, TooManyRequestsError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { hashIdentifier } from '../pfCredentials.service.js';
import { openText } from '../piiAtRest.service.js';
import { sendEmail } from '../notifications/email.service.js';
import { renderInviteShell } from '../notifications/caInviteEmail.template.js';
import { normalizeEmail } from './contacts.service.js';
import { writeActivity } from './activity.js';

const EMAIL_PURPOSE = 'split-contact-email';
const DAY_MS = 86_400_000;

async function linkContactRows(contactIds: string[], userId: string): Promise<number> {
  let members = 0;
  for (const contactId of contactIds) {
    const rows = await prisma.splitMember.findMany({ where: { contactId, userId: null, leftAt: null } });
    for (const m of rows) {
      const already = await prisma.splitMember.findFirst({ where: { groupId: m.groupId, userId } });
      if (already) { logger.info({ groupId: m.groupId, userId }, '[split] link skipped: user already in group'); continue; }
      await runInTransaction(async (tx) => {
        await tx.splitMember.update({ where: { id: m.id }, data: { userId } });
        await writeActivity(tx, m.groupId, userId, 'MEMBER_LINKED', { memberId: m.id, displayName: m.displayName });
      });
      members += 1;
    }
  }
  return members;
}

export async function linkContactsForUser(user: { id: string; email: string }): Promise<{ contacts: number; members: number }> {
  return runAsSystem(async () => {
    const hash = hashIdentifier(normalizeEmail(user.email), EMAIL_PURPOSE);
    const contacts = await prisma.splitContact.findMany({ where: { emailHash: hash, linkedUserId: null, ownerUserId: { not: user.id } }, select: { id: true } });
    if (contacts.length === 0) return { contacts: 0, members: 0 };
    const ids = contacts.map((c) => c.id);
    await prisma.splitContact.updateMany({ where: { id: { in: ids } }, data: { linkedUserId: user.id } });
    return { contacts: ids.length, members: await linkContactRows(ids, user.id) };
  });
}

export async function linkContactToExistingUser(contactId: string): Promise<boolean> {
  return runAsSystem(async () => {
    const c = await prisma.splitContact.findUnique({ where: { id: contactId } });
    if (!c || c.linkedUserId) return false;
    const email = openText(c.emailEnc, c.email);
    if (!email) return false;
    const u = await prisma.user.findUnique({ where: { email: normalizeEmail(email) }, select: { id: true } });
    if (!u || u.id === c.ownerUserId) return false;
    await prisma.splitContact.update({ where: { id: c.id }, data: { linkedUserId: u.id } });
    await linkContactRows([c.id], u.id);
    return true;
  });
}

export async function sendInvite(userId: string, contactId: string): Promise<{ sent: boolean }> {
  const c = await prisma.splitContact.findFirst({ where: { id: contactId, ownerUserId: userId } });
  if (!c) throw new NotFoundError('Contact not found');
  if (c.linkedUserId) throw new ConflictError("They're already on EveryPaisa");
  const to = openText(c.emailEnc, c.email);
  if (!to) throw new BadRequestError('Add their email address first');
  const last = await prisma.auditLog.findFirst({ where: { userId, action: 'split_invite', resource: `SplitContact:${c.id}` }, orderBy: { createdAt: 'desc' } });
  if (last && Date.now() - last.createdAt.getTime() < DAY_MS) throw new TooManyRequestsError('Already invited today');
  const sender = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const senderName = sender?.name?.trim() || 'A friend';
  const url = `${env.FRONTEND_URL}/register?email=${encodeURIComponent(to)}`;
  const mail = renderInviteShell({
    title: 'Split expenses on EveryPaisa',
    heading: `${senderName} invited you to split expenses`,
    preheader: `${senderName} uses EveryPaisa to share costs and settle up.`,
    message: `${senderName} added you to share expenses on EveryPaisa. Sign up with this email address to see what you share and settle up.`,
    acceptUrl: url,
    buttonLabel: 'Join EveryPaisa',
    closingHtml: '',
    expiresOn: null,
  });
  const result = await sendEmail({ to, subject: `${senderName} invited you to EveryPaisa`, html: mail.html, text: mail.text });
  await prisma.auditLog.create({ data: { userId, action: 'split_invite', resource: `SplitContact:${c.id}`, metadata: { sent: result.sent } } });
  return { sent: result.sent };
}
```

Read `renderInviteShell`'s `InviteShellInput` type and pass exactly its required fields (adjust `expiresOn`/`closingHtml` types to what it accepts). Confirm `AuditLog` RLS lets a user insert/select their own rows (Plan 1 notes: AuditLog is append-only for users — select own rows allowed); if select is denied for users, read it via `runAsSystem` scoped to `userId`.

- [ ] **Step 4: Hooks.**
  - `contacts.service.ts` `createContact`/`updateContact`: after the write, when an email was set, `await linkContactToExistingUser(row.id)` and re-read the row so the returned DTO carries `linkedUserId`. (Import from `./linking.service.js`; `linking.service` imports `normalizeEmail` from `contacts.service` → break the cycle by moving `normalizeEmail`/`normalizePhone` into `split/validate.ts` and re-exporting them from `contacts.service.ts`.)
  - `auth.service.ts` `verifyRegistration`: after `const user = await runInTransaction(...)` add

```ts
  // Split: placeholders created by friends with this (now verified) email become this user.
  // Never block signup on it; contact create/update re-runs linking, so a miss self-heals.
  try {
    await linkContactsForUser({ id: user.id, email: user.email });
  } catch (err) {
    logger.error({ err, userId: user.id }, '[split] linking after signup failed');
  }
```

  - Google path: find where a new `User` is created for a first-time Google sign-in; after creation, when `payload.email_verified === true`, run the same block.

- [ ] **Step 5: Controller + route** — `export const inviteContactHandler = async (req, res) => ok(res, await sendInvite(uid(req), p(req, 'id')));` and `splitRouter.post('/contacts/:id/invite', asyncHandler(c.inviteContactHandler));`.
- [ ] **Step 6:** Run linking + contacts + all split tests + `test/routes` for auth if present (`grep -l verifyRegistration test`) + tsc → PASS. Check `test/invariants/split-rls.test.ts` still passes.
- [ ] **Step 7: Commit** `feat(split): link placeholders to verified accounts and send invites`.

---

### Task 8: Reminders and email digests

**Files:**
- Create: `packages/api/src/services/split/notify.service.ts`, `packages/api/src/services/split/splitEmail.templates.ts`, `packages/api/src/jobs/splitDigestJobs.ts`
- Modify: controller, routes, `startupSync.ts`
- Test: `packages/api/test/split/notify.service.test.ts`

**Interfaces — Produces:**

```ts
export async function remind(userId: string, groupId: string, memberId: string, now?: Date): Promise<{ sent: boolean }>;
export async function sendActivityDigests(now?: Date): Promise<{ users: number; emails: number }>;   // system, hourly
export async function sendWeeklyDigests(now?: Date): Promise<{ emails: number }>;                    // system, Mon 09:00 IST
export function istDay(d: Date): Date;    // UTC-midnight Date of the IST calendar day
```

Route: `POST /reminders` body `{ groupId, memberId }`.

Rules:
- `remind`: caller must be an active member; target active, ≠ caller; target must owe the caller in the group's simplified transfers (else 400 `SPLIT_NOTHING_OWED: <name> doesn't owe you anything here`); email = linked user's `User.email`, else contact email (`openText`) read under `runAsSystem` via `member.contactId`; none → 400 `SPLIT_NO_EMAIL: <name> has no email on file`. Insert `SplitReminder { userId, groupId, memberId, sentOn: istDay(now) }` FIRST — unique violation (P2002) → `ConflictError('Already reminded today')`. Email: subject `Reminder: you owe <sender> <amount>`; body states amount, group name, a line "Pay by UPI to <vpa>" when the sender has a UPI ID in settings and the group is INR, and a button "Open EveryPaisa" → `${FRONTEND_URL}/split/groups/<groupId>`. `sent:false` from SMTP → keep the reminder row (prevents spamming retries) and return `{ sent: false }`.
- `sendActivityDigests` (hourly at :05): for each user with `SplitSettings.emailOnActivity = true` (users with no settings row count as true) who is an active linked member of ≥1 group: collect `SplitActivity` rows in their groups with `createdAt > coalesce(lastActivityEmailAt, now - 1h)` and `actorUserId ≠ user`, kinds in {EXPENSE_ADDED, EXPENSE_EDITED, EXPENSE_DELETED, SETTLED, COMMENTED, MEMBER_ADDED}; if any → one email "N updates in your shared expenses" listing up to 10 lines `<actor> <verb> “<description>” in <group>` (no amounts beyond what activity payload has, no comment text); then set `lastActivityEmailAt = now` (upsert settings). Users with zero new rows are skipped without touching the timestamp. Placeholders never receive these.
- `sendWeeklyDigests` (Mon 09:00 IST): for users with `weeklyDigest = true`: compute `listFriends`-equivalent nets under `runAsUser(user.id)`; if any non-zero → email "Your weekly balances" listing up to 10 friends with "owes you ₹X"/"you owe ₹X" and totals.
- Templates in `splitEmail.templates.ts` use `renderInviteShell` (button label/URL) so styling matches other app emails; plain-text fallback included by `sendEmail`.
- Both jobs follow the `pfNudgeJob` pattern with `ENABLE_SPLIT_DIGEST_CRON !== 'false'`; schedules `'5 * * * *'` and `'0 9 * * 1'`, timezone `Asia/Kolkata`; registered in `startupSync.ts`.

- [ ] **Step 1: Failing tests**

```ts
// packages/api/test/split/notify.service.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { seedContact, cleanupSplit } from '../helpers/splitFixtures.js';
import { createGroup } from '../../src/services/split/groups.service.js';
import { createExpense } from '../../src/services/split/expenses.service.js';
import { updateSettings } from '../../src/services/split/settings.service.js';
import { remind, sendActivityDigests, istDay } from '../../src/services/split/notify.service.js';

const sent = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/notifications/email.service.js', () => ({ sendEmail: sent }));

describe('split reminders + digests', () => {
  let alice: TestScope; let bob: TestScope; let groupId: string; let a: string; let b: string;
  beforeAll(async () => {
    sent.mockResolvedValue({ sent: true, messageId: 'm' });
    alice = await createTestScope('split-ntf-a'); bob = await createTestScope('split-ntf-b');
    const cb = await seedContact(alice.userId, 'Bob', bob.userId);
    const g = await alice.runAs(() => createGroup(alice.userId, { name: 'Goa', myDisplayName: 'Alice', contactIds: [cb.id] }));
    groupId = g.id; a = g.members.find((m) => m.isMe)!.id; b = g.members.find((m) => !m.isMe)!.id;
    await alice.runAs(() => updateSettings(alice.userId, { upiId: 'alice@oksbi' }));
    await alice.runAs(() => createExpense(alice.userId, { groupId, description: 'Hotel', date: '2026-10-01', amount: '1000', currency: 'INR', splitMode: 'EQUAL', payers: [{ memberId: a, amount: '1000' }], shares: [{ memberId: a }, { memberId: b }] }));
  });
  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.splitReminder.deleteMany({ where: { userId: { in: [alice.userId, bob.userId] } } });
      await prisma.splitSettings.deleteMany({ where: { userId: { in: [alice.userId, bob.userId] } } });
    });
    await cleanupSplit([alice.userId, bob.userId]); await alice.cleanup(); await bob.cleanup();
  });

  it('istDay uses the IST calendar day', () => {
    expect(istDay(new Date('2026-10-08T20:00:00Z')).toISOString().slice(0, 10)).toBe('2026-10-09');
  });

  it('reminds the debtor once a day with amount and UPI', async () => {
    const now = new Date('2026-10-08T06:00:00Z');
    expect(await alice.runAs(() => remind(alice.userId, groupId, b, now))).toEqual({ sent: true });
    const mail = sent.mock.calls.at(-1)![0];
    expect(mail.subject).toBe('Reminder: you owe Alice ₹500.00');
    expect(mail.html).toContain('alice@oksbi');
    await expect(alice.runAs(() => remind(alice.userId, groupId, b, now))).rejects.toThrow(/Already reminded today/);
  });

  it("can't remind someone who doesn't owe you", async () => {
    await expect(bob.runAs(() => remind(bob.userId, groupId, a))).rejects.toThrow(/doesn't owe you/);
  });

  it('hourly digest emails Bob about Alice’s activity once, then nothing new', async () => {
    sent.mockClear();
    const r1 = await sendActivityDigests(new Date(Date.now() + 1000));
    const toBob = sent.mock.calls.filter((c) => c[0].to.startsWith('inv-split-ntf-b'));
    expect(toBob).toHaveLength(1);
    expect(toBob[0]![0].html).toContain('Hotel');
    expect(r1.emails).toBeGreaterThanOrEqual(1);
    sent.mockClear();
    await sendActivityDigests(new Date(Date.now() + 2000));
    expect(sent.mock.calls.filter((c) => c[0].to.startsWith('inv-split-ntf-b'))).toHaveLength(0);
  });
});
```

(`createTestScope` emails look like `inv-<label>-<suffix>@test.local` — see `test/helpers/db.ts`.)

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement** `notify.service.ts`, `splitEmail.templates.ts` and `splitDigestJobs.ts` per the rules above. Key pieces:

```ts
// istDay — IST is UTC+05:30 with no DST
export function istDay(d: Date): Date {
  const ist = new Date(d.getTime() + 330 * 60_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}
```

```ts
// remind — duplicate guard by unique index, inserted before sending
try {
  await prisma.splitReminder.create({ data: { userId, groupId, memberId, sentOn: istDay(now) } });
} catch (err) {
  if ((err as { code?: string }).code === 'P2002') throw new ConflictError('Already reminded today');
  throw err;
}
```

```ts
// activity verbs for emails (no amounts/comment text)
const VERB: Record<string, string> = {
  EXPENSE_ADDED: 'added', EXPENSE_EDITED: 'edited', EXPENSE_DELETED: 'deleted',
  SETTLED: 'recorded a payment', COMMENTED: 'commented on', MEMBER_ADDED: 'added a member to',
};
```

The digest loop runs under `runAsSystem`, selects candidate users with one query (`prisma.splitMember.findMany({ where: { userId: { not: null }, leftAt: null }, select: { userId: true, groupId: true } })` grouped in memory), and per user reads only that user's groups' activity. Email address = `User.email`. Format money with `formatINR`/`formatCurrency` from `@everypaisa/shared`.

- [ ] **Step 4: Controller + route** — `const remindBody = z.object({ groupId: z.string().min(1).max(64), memberId: z.string().min(1).max(64) }); export const remindHandler = async (req, res) => { const b = parse(remindBody, req.body); ok(res, await remind(uid(req), b.groupId, b.memberId)); };` and `splitRouter.post('/reminders', asyncHandler(c.remindHandler));`.
- [ ] **Step 5:** Run notify + all split tests + tsc → PASS.
- [ ] **Step 6: Commit** `feat(split): reminders and email digests`.

---

### Task 9: Web — API client additions and Split settings page

**Files:**
- Modify: `apps/web/src/api/split.api.ts`
- Create: `apps/web/src/pages/split/SplitSettingsPage.tsx`, `apps/web/src/pages/split/SplitSettingsPage.test.tsx`
- Modify: `apps/web/src/App.tsx` (route `/split/settings` BEFORE `/split/groups/:id` etc.), `SplitHomePage.tsx` (header "Settings" link button)

**Interfaces — Produces** (added to `splitApi` and `SPLIT_KEYS`):

```ts
SPLIT_KEYS.settings = ['split', 'settings'] as const;
SPLIT_KEYS.labels = (groupId: string) => ['split', 'group', groupId, 'labels'] as const;
SPLIT_KEYS.comments = (expenseId: string) => ['split', 'expense', expenseId, 'comments'] as const;
SPLIT_KEYS.shareLink = (expenseId: string) => ['split', 'expense', expenseId, 'share-link'] as const;

getSettings(): Promise<SplitSettingsDto>;  updateSettings(p: Partial<SplitSettingsDto>): Promise<SplitSettingsDto>;
upiLink(groupId: string, toMemberId: string, amount?: string): Promise<SplitUpiLinkDto>;
listLabels(groupId: string): Promise<SplitLabelDto[]>;  createLabel(groupId: string, i: { name: string; color: string }): Promise<SplitLabelDto>;
deleteLabel(id: string): Promise<void>;  setExpenseLabels(expenseId: string, labelIds: string[]): Promise<string[]>;
listComments(expenseId: string): Promise<SplitCommentDto[]>;  addComment(expenseId: string, body: string): Promise<SplitCommentDto>;  deleteComment(id: string): Promise<void>;
uploadReceipt(expenseId: string, file: File): Promise<{ hasReceipt: true; mime: string }>;   // FormData field 'file', PUT
fetchReceipt(expenseId: string): Promise<Blob>;   // responseType 'blob'
deleteReceipt(expenseId: string): Promise<void>;
getShareLink(expenseId: string): Promise<SplitShareLinkDto>;  setShareLink(expenseId: string, i: { enabled: boolean; portfolioId?: string | null }): Promise<SplitShareLinkDto>;
remind(groupId: string, memberId: string): Promise<{ sent: boolean }>;
inviteContact(contactId: string): Promise<{ sent: boolean }>;
```

Settings page (`/split/settings`): `PageHeader` eyebrow "Split Expenses", title "Split settings". Card "Payments": UPI ID input (helper "Friends see this when they pay you"), validated client-side with the same VPA regex (export `UPI_VPA` from a new `apps/web/src/pages/split/upi.ts`). Card "Defaults": home currency select (CURRENCIES), default portfolio via the existing `PortfolioSelect` component (`apps/web/src/components/common/PortfolioSelect.tsx`) with `emptyLabel="None"`. Card "Emails": checkboxes "Email me about activity in my groups (at most hourly)" and "Weekly balance summary (Mondays)". One Save button; success toast "Settings saved"; errors via `splitErrorMessage`. Loading/error states honest (no form until loaded; LoadError with Retry on failure).

- [ ] **Step 1: Failing test** — `SplitSettingsPage.test.tsx` (mock `@/api/split.api` like other split tests; mock `@/components/common/PortfolioSelect` as a plain `<select aria-label="Default portfolio">` with two options):
  - loads `getSettings` → fields show values;
  - invalid UPI "nope" → inline error "Enter a UPI ID like name@bank", Save disabled;
  - change UPI to `me@okaxis`, tick weekly digest, choose portfolio `p2`, Save → `updateSettings` called with `{ upiId: 'me@okaxis', homeCurrency: 'INR', defaultPortfolioId: 'p2', emailOnActivity: true, weeklyDigest: true }`;
  - `getSettings` rejected → "Couldn't load your settings." + Retry.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement API additions + page + route + home header link (`<Button variant="ghost" asChild>` is not available — use `<Link to="/split/settings" className={buttonClasses}>`; check how other pages render a link styled as a button, e.g. search `buttonVariants` in `apps/web/src/components/ui/button.tsx`). **Step 4:** Run split tests + tsc + eslint → PASS. **Step 5: Commit** `feat(split-web): split settings page and API client additions`.

---

### Task 10: Web — expense page extras: receipt, labels, comments, Cash Activity toggle

**Files:**
- Create: `apps/web/src/pages/split/ExpenseExtras.tsx`, `apps/web/src/pages/split/ExpenseExtras.test.tsx`
- Modify: `apps/web/src/pages/split/ExpenseDetailPage.tsx` (render `<ExpenseExtras expense={e} group={g} />` under the payers/shares cards)

**Interfaces — Produces:**

```tsx
export function ExpenseExtras({ expense, group }: { expense: SplitExpenseDto; group: SplitGroupDto }): JSX.Element;
// sections (each its own small component in the same file):
function ReceiptCard(...)   // "Add receipt" (file input accept="image/jpeg,image/png,image/webp,application/pdf"), preview <img> from object URL (revoked on unmount/change) or "Open PDF" link; Replace / Remove (ConfirmDialog); 10 MB client check; uses splitApi.uploadReceipt/fetchReceipt/deleteReceipt; invalidates SPLIT_KEYS.expense(id)
function LabelsCard(...)    // chips for group labels (SPLIT_KEYS.labels), toggle on click → setExpenseLabels; "+ New label" inline (name + one of 7 preset colours)
function CommentsCard(...)  // list (author, time via formatDateTimeIST, "Delete" on mine with ConfirmDialog), textarea (max 1000, counter) + "Post"
function CashActivityCard(...) // switch "Add my share (₹X) to Cash Activity" + PortfolioSelect when enabling and no default; shows "Not part of this split" when myShare is 0
```

Deleted expenses (`expense.deletedAt`) render all four cards read-only (no upload/label/comment/toggle).

- [ ] **Step 1: Failing tests** (`ExpenseExtras.test.tsx`, mocking split.api; `URL.createObjectURL = vi.fn(() => 'blob:x')`, `URL.revokeObjectURL = vi.fn()`):
  - comments: renders "Alice: Paid by card"; typing + Post → `addComment('e1','Thanks')`; "Delete" only on `mine` and after confirm → `deleteComment`;
  - labels: clicking chip "Food" → `setExpenseLabels('e1', ['l-food'])`; label already on the expense shows pressed (`aria-pressed="true"`);
  - receipt: `hasReceipt: true` → `fetchReceipt` called and an `<img alt="Receipt">` with `src="blob:x"`; choosing a 11 MB file → error "Receipts must be under 10 MB" and no upload call; choosing a PNG → `uploadReceipt('e1', file)`;
  - cash activity: myShare '500.0000' → switch label "Add my share (₹500.00) to Cash Activity"; enabling with no portfolio set and no default → portfolio select appears; choose p1 → `setShareLink('e1', { enabled: true, portfolioId: 'p1' })`;
  - deleted expense → no "Post" button, no file input.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run split tests + tsc + eslint. **Step 5: Commit** `feat(split-web): receipts, labels, comments and Cash Activity on expenses`.

---

### Task 11: Web — pay now, reminders, invites, labels in lists, activity text, parked polish

**Files:**
- Create: `apps/web/src/pages/split/PayNowDialog.tsx`, `apps/web/src/pages/split/PayNowDialog.test.tsx`
- Modify: `GroupPage.tsx`, `SplitHomePage.tsx` (activityText), `ContactDialog.tsx` (invite), `FriendPage.tsx`, `AddExpenseDialog.tsx` (label picker), corresponding tests

**Interfaces — Produces:**

```tsx
export function PayNowDialog({ open, onOpenChange, group, toMemberId, amount }: { open: boolean; onOpenChange(o: boolean): void; group: SplitGroupDto; toMemberId: string; amount: string }): JSX.Element;
```

Behaviour:
- **PayNowDialog**: on open calls `splitApi.upiLink(group.id, toMemberId, amount2dp)`. Shows payee name + VPA, amount, a primary "Open UPI app" anchor (`href={uri}`), and a QR (`QRCode.toDataURL(uri, { margin: 1, width: 220 })`) labelled "Scan with any UPI app". After the user clicks the anchor (or after 1 s with the QR visible), show "Did the payment go through?" with **Yes, record it** → `createSettlement({ groupId, fromMemberId: me, toMemberId, amount, method: 'UPI', date: todayLocal() })` then close + toast "Payment recorded"; **Not yet** → close. Errors: `SPLIT_NO_UPI` → plain message with hint "Ask them to add a UPI ID in Split settings"; `SPLIT_UPI_INR_ONLY` → message.
- **GroupPage Balances**: for each transfer where `from` is me: buttons "Pay" (opens PayNowDialog, only when group is INR) and "Settle" (existing). Where `to` is me: "Remind" → `splitApi.remind(group.id, fromMemberId)`; success toast "Reminder sent" / `{sent:false}` → "Reminder saved but email couldn't be sent right now"; 409 → toast "Already reminded today".
- **Expenses list**: label chips (coloured dots + name, max 2 then "+N") on expense rows (needs `listLabels`); a label filter row above the list ("All" + group labels) filtering client-side by `labelIds`; a paperclip icon on rows with `hasReceipt`.
- **AddExpenseDialog**: optional "Labels" chip picker (group labels) below Split; on create, after `createExpense` resolves call `setExpenseLabels(newId, picked)` when any picked; on edit, prefill from `expense.labelIds` and call `setExpenseLabels` when changed.
- **ContactDialog / GroupPage Settings member rows**: for placeholder members with a contact the caller owns and an email: "Invite" button → `inviteContact(contactId)`; toast results ("Invite sent" / "Invite couldn't be sent right now" / "Already invited today" / "They're already on EveryPaisa"). Show "On EveryPaisa" tag for linked members (`userId` set), now that linking exists.
- **activityText** additions: `EXPENSE_LABELED` → "<actor> labelled “<desc>”"; `COMMENTED` → "<actor> commented on “<desc>”"; `RECEIPT_ADDED` → "<actor> attached a receipt to “<desc>”"; `RECEIPT_REMOVED` → "<actor> removed the receipt from “<desc>”"; `MEMBER_LINKED` → "<displayName> joined EveryPaisa".
- **Parked polish from Plan 2** (each with a test):
  1. Payment rows read "Bob paid you ₹100.00" (lower-case "you" mid-sentence).
  2. Settlements query in GroupPage gets its own error line "Couldn't load payments." + Retry inside the Expenses tab.
  3. "Archive group" is disabled until balances have loaded (so the unsettled-balances confirm can't be skipped).
  4. Home: hide "No groups yet" when archived groups exist; show "All your groups are archived." instead.
  5. FriendPage 1:1 row title "Just you two" for the DIRECT group instead of the friend's name.

- [ ] **Step 1: Failing tests** — `PayNowDialog.test.tsx` (mock `qrcode` default export `toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QR')`; mock split.api):
  - renders VPA `ravi@okicici`, amount "₹100.00", link `href` = the uri, QR `<img alt="UPI QR code">`;
  - clicking "Open UPI app" then "Yes, record it" → `createSettlement` with method 'UPI', amount '100';
  - `upiLink` rejected with `SPLIT_NO_UPI: Ravi hasn't added a UPI ID` string error → text "Ravi hasn't added a UPI ID" and hint.
  Extend `GroupPage.test.tsx`: "Pay" visible on my debt row, "Remind" on a row owed to me calls `remind('g1','b')`; label filter hides non-matching rows; "Bob paid you ₹100.00"; settlements rejected → "Couldn't load payments.". Extend `SplitHomePage.test.tsx` for activity kinds + archived-only message. Extend `AddExpenseDialog.test.tsx`: picking "Food" then save → `setExpenseLabels(newId, ['l-food'])`. Extend `FriendPage.test.tsx`: DIRECT group row titled "Just you two".
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run the whole web suite (`npx vitest run`) + tsc + eslint. **Step 5: Commits** (split logically): `feat(split-web): UPI pay-now with QR`, `feat(split-web): reminders, invites and labels in lists`, `fix(split-web): plan 2 polish`.

---

### Task 12: Browser check + full verification

Same procedure as Plan 2 Task 8 (run API on `portfolioos_split` with test env defaults + `FRONTEND_URL=http://localhost:<web port>`, SMTP unset so emails dry-run; web dev server; Playwright at 1280×800 and 375×812; stop only your PIDs). Flow: settings (UPI ID, default portfolio) → group → expense with label + receipt (upload a real small JPEG with EXIF — e.g. generate one with Node by prepending an APP1 segment to a tiny JPEG — and confirm via the API's GET that EXIF is gone) → comment → Cash Activity toggle (then open the app's Cash Activity page and see the row) → Balances: Pay (QR visible; "Yes, record it") and Remind ("Reminder saved but email couldn't be sent right now" is expected with SMTP unset) → invite a placeholder → create a second account whose email matches a placeholder (script, as in Plan 2) and confirm the group appears for them. Screenshot every page section; check no horizontal scroll at 375 px; fix issues test-first; then:

```bash
pnpm -r run typecheck && pnpm -r run lint && pnpm -r run build
pnpm --filter @everypaisa/web test
pnpm --filter @everypaisa/api test -- test/split test/routes/split.routes.test.ts test/invariants
```

Known pre-existing failures that are not ours: `scripts/backfillRentalLedger.ts` TS2322; 5 lint errors in mf* files. Report everything else.
