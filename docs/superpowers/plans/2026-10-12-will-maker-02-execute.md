# Will Maker - Part 2 (step 9 execute and store, review reminders, Planning sidebar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user finish their will: an India signing guide with verified "find a lawyer" links, upload of the signed copy into the vault with the signing date and witness names sealed, Draft / Generated / Executed / Superseded tracking with history, a review reminder two years after signing plus a "My circumstances changed" action, and a collapsible "Planning" sidebar group (Goals, Will Maker, Tax Planning).

**Architecture:** Builds directly on Part 1 (`Will`, `WillVersion`, `WillStatus`, sealed payloads, `/api/will`, `pages/will/*`, `DocumentOwnerType.WILL`). Two new nullable columns on `Will` hold the sealed execution record (`executionSealed`, slot `willexec:<willId>`) and the vault id of the signed copy (`executedDocumentId`); `executedAt` and `nextReviewAt` (already in Part 1) become live. Signed copies are `Document` rows (owner type `WILL`, category `executed`) whose type is decided by their bytes. A daily job lists due users under `runAsSystem`, then raises one `WILL_REVIEW_DUE` alert per due will under `runAsUser(userId)`. The web adds `/will/:id/execute`, a history card and review banner on the overview, alert routing, and a `PlanningNavGroup` used by both the desktop rail and the mobile drawer.

**Tech Stack:** TypeScript, zod 3, Prisma 5 + PostgreSQL (RLS), Express + multer, node-cron, vitest, React 18 + @tanstack/react-query + react-router 6 + lucide-react + the repo's shadcn-style ui.

**Spec:** `portfolioos/docs/superpowers/specs/2026-10-12-will-maker-design.md` (Part 2 scope: "Parts" section and step 9 of the requirements). Base plan: `portfolioos/docs/superpowers/plans/2026-10-12-will-maker-01-wizard.md` (Part 1). Every name this plan consumes from Part 1 is listed in each task's **Interfaces** block.

## Global Constraints

- Names: everything stays in Part 1's namespace - `Will*` models, `/api/will`, `/will`, `services/will/`, `pages/will/`, `shared/src/will/`, audit actions `will_*`. New audit actions: `will_execute_upload`, `will_reviewed`. New alert type: `WILL_REVIEW_DUE`. Never reuse any `Legacy*` name, `/legacy` or `/api/legacy*` (parallel branch `feat/legacy-transfer`).
- Migration: `20261014130000_will_execute` (later than Part 1's `20261014120000_will_maker`). Apply ONLY to the isolated local DB, from `portfolioos/packages/api`, with both overrides: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split`. Never use `packages/api/.env` for migrations. No production migration in this plan.
- API tests run with `DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false` (written `$API_TEST_ENV` below; paste it in full). Never `vi.spyOn` the shared Prisma client; use the seams named in each task (`deps.today`, `deps.beforeCommit`, job `sync`, `userIds`). All API suites run once more together in ONE vitest invocation in Task 7.
- The API consumes `@everypaisa/shared` from `dist`: run `pnpm --filter @everypaisa/shared build` after any task that changes `packages/shared` (Task 1) before API tests or typecheck. The web aliases shared to `src`.
- Personal data: witness names, the signing date record and the will payload are sealed at rest and never logged. Logs carry ids, counts and error names only (`errName`), never `err` objects from the will services. Error responses carry `{ path, code }` issue lists and fixed messages - never submitted values. Audit metadata holds versions, flags, mime types and sizes only. Stored file names are fixed (`will-v<N>-signed.<ext>`), never the uploaded name.
- Uploads: PDF, JPEG, PNG, WebP only, decided by magic bytes (`lib/decryptIfNeeded.ts` `sniff`), extension allow-list as a first filter, max 20 MB (`WILL_SIGNED_COPY_MAX_MB`). Rate limit `importLimiter` (10/min/user).
- Jobs: never copy `jobs/alertJobs.ts` (it runs every scanner without any RLS context). List users under `runAsSystem`, then do each user's reads and writes under `runAsUser(userId)`; one user's failure is counted and logged (`userId`, `errName`) and never stops the others. Single-flight per process.
- Dates: ISO `YYYY-MM-DD` on the wire and in sealed records; displayed as dd/mm/yyyy via `formatDateOnly` / `formatDateIST`. "Today" is `istCalendarDate(new Date())` (API: `todayIst()` from `willStore.ts`).
- Code strings use plain `-` (no en/em dash, no Unicode minus).
- Web: tests use `// @vitest-environment jsdom`, `afterEach(cleanup)`, plain assertions (no jest-dom). Colours only through theme tokens (`text-foreground`, `text-muted-foreground`, `bg-card`, `bg-muted`, `border-border`, `text-positive`, `text-negative`, `text-warning`, `bg-warning/10`, `text-primary`, sidebar tokens in the nav). At 375 px no page scrolls sideways (`min-w-0` on grid/flex children, `flex-wrap` on button rows, `break-words` on long text).
- Gating: unchanged from Part 1 - the whole `/api/will` router is `authenticate` + `rejectActAs` + `requireFeature('WILL_MAKER')`; web pages sit inside `WillGate`.
- Commits: Conventional Commits, one logical change each, ending with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push. Check every changed text file with `iconv -f UTF-8 -t UTF-8 <file> >/dev/null`.

## Rulings made while writing this plan

1. **Where witness names live.** Not in `Will.payload` (Part 1 clones it into new drafts and hashes it into `WillVersion.inputHash`; witnesses belong to one signing) and not in `WillVersion` (immutable). New column `Will.executionSealed Bytes?` holds `{ executedOn, witnesses: [name, name], recordedAt }` sealed with `sealForUser(userId, "willexec:<willId>")`. `Will.executedAt` keeps the date as a plain `@db.Date` column for history and the job (a date is not identifying on its own).
2. **Signed copy storage.** `createDocument({ ownerType: 'WILL', ownerId: willId, category: 'executed', fileName: 'will-v<N>-signed.<ext>' })`. The id goes in new column `Will.executedDocumentId`. Part 1 already makes WILL documents read-only in the vault (listed and downloadable there, never renamed/replaced/deleted) and refuses `ownerType: WILL` on the generic upload endpoint - Part 2 relies on both.
3. **Which wills can be executed.** Only the live will (`GENERATED` or `EXECUTED`). `SUPERSEDED` wills are readable on the execute page (their record is history) but cannot be changed (409 `WILL_NOT_EXECUTABLE`); `DRAFT`/`DISCARDED` give 409 on read too. Recording again on an `EXECUTED` will is allowed: with a file it replaces the copy (old document deleted after the commit), without a file it corrects the date/witnesses and keeps the copy. The first record requires a file.
4. **Checks on the record.** Refused (422): signing date in the future, before the will was generated, a witness whose name equals the testator's legal name, the same name twice (names compared after NFKC, trim, whitespace collapse, lower case). Recorded with a warning (`WITNESS_IS_BENEFICIARY`), not refused: a witness whose name matches a beneficiary or a beneficiary's back-up - the signing already happened, so the app records reality and explains the consequence (a gift to an attesting witness or their spouse can fail; s.67 Indian Succession Act). Spouses of beneficiaries cannot be detected and are covered by the guide text.
5. **Review date.** `nextReviewAt = executedOn + 2 years` (29 Feb -> 28 Feb), computed from the signing date even if it is recorded late. "Reviewed - no changes" (`POST /api/will/wills/:id/reviewed`, audit `will_reviewed`) moves it to today + 2 years. Both close any open reminder for that will.
6. **Alert type.** New enum value `WILL_REVIEW_DUE` (not `CUSTOM`), so the alerts page can label it and link it to `/will`, and the job's clean-up can select its own rows without parsing metadata of unrelated `CUSTOM` alerts. It is a deadline type (not informational): an unreviewed will shows as overdue.
7. **Reminder dedup.** One alert per (will, due date): `metadata.key = "will_review:<willId>:<dueOn>"`, looked up regardless of `isActive`, so a reminder the user dismissed is not raised again until the next due date. Active reminders whose will is no longer due (superseded, re-signed, reviewed) are deactivated by the next run. Alerts go to every user with an executed will that is due, whatever their plan (alerts are free; a downgraded user still owns a will that needs review; `/will` shows the locked card and the signed copy stays downloadable from the Documents vault). Cron `15 9 * * *` Asia/Kolkata, off when `ENABLE_ALERT_CRONS=false`.
8. **"My circumstances changed"** reuses Part 1's clone (`POST /api/will/drafts { fromWillId, reason: 'CIRCUMSTANCES_CHANGED' }`); `reason` is only accepted with `fromWillId` and lands in the `will_created` audit metadata. On the overview it replaces "Start a new version" when the live will is `EXECUTED`, and appears in the review banner.
9. **History.** `WillOverviewWire` gains `history: WillHistoryEntryWire[]` (every non-discarded will, newest first, with created / generated / signed dates, "replaced by version N", next review, signed-copy flag) and `review: WillReviewWire | null`. The overview's Part 1 "Versions" card is replaced by a "History" card; status labels are Draft / Generated / Executed / Superseded (Part 1's "Replaced" label goes). `WillVersionWire` is unchanged.
10. **Planning group.** `PLANNING_ITEMS` = Goals (`/goals`), Will Maker (`/will`), Tax Planning (`/tax`). Goals and Part 1's temporary Will Maker item leave `OVERVIEW_ITEMS`; "Tax" leaves the Tools section (one link per page; the same page is now labelled "Tax Planning"). Open by default; state in `localStorage` key `sidebar_planning_open` (`'1'`/`'0'`), every access in try/catch (blocked storage -> open, toggling still works for the session). Collapsed rail: the three icons flat, no header. While closed, the header shows an accent dot when the current route is inside the group. The mobile drawer renders the same `SidebarNav`, so it gets the same group.
11. **Execute page route** `/will/:id/execute` where `:id` is the `Will` id. React Router ranks the static `execute` segment above Part 1's `/will/:id/:step`, so no ordering trick is needed. Part 1's Preview step success card gets a "Next: sign and store" link.
12. **Signing guide wording** lives in `apps/web/src/pages/will/execute/executeCopy.ts` (web-only copy). It says: no stamp paper needed; two adult witnesses who are not beneficiaries or married to one; sign and initial every page while both watch, witnesses sign after with name and address; registration with the Sub-Registrar is optional (Registration Act, 1908); keep the original safe and tell the executor. "Find a lawyer" names Tele-Law (Government of India, Department of Justice, https://www.tele-law.in/, free for eligible people otherwise a small fee, citizens' mobile app), NALSA (National Legal Services Authority, https://nalsa.gov.in/, helpline 15100, online legal aid application) and the State Bar Council enrolment check, exactly as the spec words them.
13. **Upload rate limit** is `importLimiter` (10/min/user), not `costlyOperationLimiter` (5/min, meant for paid third-party calls).
14. **Branch.** Part 2 runs in the same worktree and branch as Part 1 (`C:\Users\ST269\Desktop\mProfit-will-wt`, `feat/will-maker`) and starts only after Part 1's Task 13 is complete. One branch, one future PR.

## Review Focus

1. **Replacing a signed copy, or a save that fails half-way** - the old file is removed only after the new record commits, and a failed commit removes the new file, so the vault never holds an orphan or loses the only copy. Tests: Task 2 (`replaces the copy with a photo and removes the old file`, `cleans up the new file when the save loses a race`).
2. **A file that lies about its type** (HTML or a GIF renamed `.pdf`, an `.exe`, a 21 MB scan) - refused by its bytes or size with a clear 400/413, nothing stored. Tests: Task 2 (`refuses bad bytes and needs a file the first time`, route `HTML bytes named .pdf are refused`, `a file over 20 MB is a 413`).
3. **Signing dates at the edges** - a future date, a date before the will was generated, and a will signed on 29 February must give a sensible refusal or a 28 February review date. Tests: Task 1 (`addYearsIso`), Task 2 (`refuses dates in the future or before the will was generated`).
4. **The daily reminder over many days** - it must not repeat, must not come back after the user dismissed it, and must disappear once the will is replaced, re-signed or reviewed. Tests: Task 3 (`raises one alert when the review is due, and only once`, `a dismissed reminder is not raised again`, `closes the reminder of a replaced will`, `marking it reviewed moves the date two years on and closes the reminder`).
5. **Witness names leaking** - they must not appear in the database in clear, in audit rows, in 422 bodies or in logs. Tests: Task 2 (`stores the signed copy, seals the witnesses and sets the review date`, route `422 lists paths and codes, never the names`, `stores the signed copy and audits it without names`).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/api/prisma/schema.prisma` + `migrations/20261014130000_will_execute` | `AlertType.WILL_REVIEW_DUE`, `Will.executionSealed`, `Will.executedDocumentId`, index for the review job |
| `packages/shared/src/will/execution.ts` | Execution input/record schemas, name normalisation, witness issues/warnings, `addYearsIso`, `willNextReviewDate`, signed-copy limits, execution wire types |
| `packages/shared/src/will/wire.ts` (modify) | `WillHistoryEntryWire`, `WillReviewWire`, overview fields `history`, `review` |
| `packages/api/src/services/will/willStore.ts` (modify) | `isoDay`, `dayOf` date helpers |
| `packages/api/src/services/will/will.service.ts` (modify) | Overview history and review (`toHistoryWire`, `willReviewOf`) |
| `packages/api/src/services/will/willExecute.service.ts` | Record execution, read it back, signed copy bytes, byte-based type check |
| `packages/api/src/middleware/willUpload.ts` | multer for the signed copy: extension filter, 20 MB, mapped errors |
| `packages/api/src/services/will/willReview.service.ts` | Due users, per-user alert sync, "reviewed" |
| `packages/api/src/jobs/willReviewJob.ts` | Single-flight daily run with system/user contexts, cron |
| `packages/api/src/controllers/will.controller.ts`, `routes/will.routes.ts` (modify) | Execution, signed copy, reviewed handlers and routes; clone reason |
| `apps/web/src/api/will.api.ts` (modify) | `execution`, `recordExecution`, `downloadSignedCopy`, `markReviewed`, clone reason, `isWillNotExecutable` |
| `apps/web/src/pages/will/execute/*` | Execute page, signing guide + find a lawyer, signed-copy form, copy constants |
| `apps/web/src/pages/will/WillHistoryCard.tsx`, `WillReviewBanner.tsx`, `willStatusLabels.ts` | Overview history and review banner |
| `apps/web/src/components/layout/PlanningNavGroup.tsx`, `navItems.tsx`, `SidebarNav.tsx` | Collapsible Planning group |
| `apps/web/src/pages/alerts/*`, `api/alerts.api.ts`, `pages/dashboard/DashboardPage.tsx` | `WILL_REVIEW_DUE` label and link |

## Execution waves (tasks in one wave touch disjoint files and may run in parallel)

| Wave | Tasks | Needs |
|---|---|---|
| 1 | Task 1 (schema, shared execution model, overview history API), Task 6 (Planning sidebar group) | Part 1 complete |
| 2 | Task 2 (execution API), Task 4 (web execute page) | Task 1 (Task 4 mocks Task 2's HTTP contract) |
| 3 | Task 3 (review reminders API + job, clone reason), Task 5 (web overview history, review banner, alerts) | Task 3: Tasks 1, 2; Task 5: Tasks 1, 4 (mocks Task 3's HTTP contract) |
| 4 | Task 7 (full verification + browser check) | all |

File ownership in parallel waves: Task 1 edits `apps/web/src/pages/will/willTestData.ts` (overview builder) in wave 1; Task 4 (wave 2) and Task 5 (wave 3) each add one builder to it. Tasks 2 and 3 both edit `will.controller.ts` and `will.routes.ts`, in different waves. Tasks 4 and 5 both edit `will.api.ts`, in different waves. Task 6 is the only task touching `components/layout/*`.

## Execution notes

- Worktree `C:\Users\ST269\Desktop\mProfit-will-wt`, branch `feat/will-maker`, project root `portfolioos/`. Start only when Part 1's Task 13 is complete. Never push.
- Before the first Part 2 commit, mark the base with a local tag (never pushed): `git tag will-part2-base`. Task 7 diffs against it.
- Fresh setup before trusting any type or test error: `cd portfolioos && pnpm install && pnpm --filter @everypaisa/shared build && cd packages/api && npx prisma generate`.
- Docker containers `everypaisa-postgres` and `portfolioos-redis` must be running for API tests. `APP_ENCRYPTION_KEY` must be set (it is in the developer's local env and Part 1's tests need it too).
- After Task 1's migration, run `npx prisma generate` in `packages/api` so later tasks see the new columns and enum value.

---
### Task 1: Execution data model - migration, shared execution model, overview history and review

**Wave 1** (parallel with Task 6).

**Files:**
- Modify: `packages/api/prisma/schema.prisma` (`AlertType` + `WILL_REVIEW_DUE`; `Will` + two columns + one index)
- Create: `packages/api/prisma/migrations/20261014130000_will_execute/migration.sql`
- Create: `packages/shared/src/will/execution.ts`
- Modify: `packages/shared/src/will/wire.ts` (history/review types, two overview fields)
- Modify: `packages/shared/src/will/index.ts` (one export line)
- Modify: `packages/shared/src/types/enums.ts` (`AlertType.WILL_REVIEW_DUE`)
- Modify: `packages/api/src/lib/audit.ts` (`will_execute_upload`, `will_reviewed`)
- Modify: `packages/api/src/services/will/willStore.ts` (`isoDay`, `dayOf`)
- Modify: `packages/api/src/services/will/will.service.ts` (`toHistoryWire`, `willReviewOf`, overview fields)
- Modify: `apps/web/src/pages/will/willTestData.ts` (overview builder defaults)
- Test: `packages/shared/src/will/execution.test.ts`, `packages/api/test/will/willExecuteSchema.db.test.ts`, `packages/api/test/will/willHistory.db.test.ts`

**Interfaces:**
- Consumes (Part 1): `WillPayload`, `willBeneficiaryIds` (`shared/src/will/estateMath.ts`), `WillStatusWire`, `WillOverviewWire` (`wire.ts`), shared test builders `validWillPayload`, `TODAY` (`shared/src/will/__tests__/fixtures.ts`), `getWillOverview(userId, deps?: WillServiceDeps)`, `WillServiceDeps { collect?; today? }`, `todayIst()`, Prisma `Will`, `WillVersion`, the `AuditAction` union ending in `| 'will_discarded'`, web `overview(p)` builder in `willTestData.ts`.
- Produces:
  - Prisma: `Will.executionSealed: Bytes | null`, `Will.executedDocumentId: string | null`, `AlertType.WILL_REVIEW_DUE`, index `Will_status_nextReviewAt_idx`.
  - Shared (`@everypaisa/shared`): `WILL_REVIEW_INTERVAL_YEARS = 2`, `WILL_WITNESS_NAME_MAX = 120`, `WILL_SIGNED_COPY_MAX_MB = 20`, `WILL_SIGNED_COPY_MIME_TYPES`, `WillSignedCopyMime`, `isIsoDay(s): boolean`, `willExecutionInputSchema` (`{ executedOn, witnesses: [string, string] }`, trimmed), `WillExecutionInput`, `willExecutionRecordSchema` (+ `recordedAt`), `WillExecutionRecord`, `normaliseWillName(s): string`, `addYearsIso(iso, years): string`, `willNextReviewDate(iso): string`, `WillExecutionWarning = 'WITNESS_IS_BENEFICIARY'`, `willWitnessWarnings(p, witnesses): WillExecutionWarning[]`, `willWitnessIssues(p, witnesses): Array<{ path: string; code: string }>` (codes `witness_is_testator`, `duplicate_witness`), `WillSignedCopyWire { fileName; mimeType; sizeBytes; uploadedAt }`, `WillExecutionWire { willId; version; status; versionId; generatedOn; executedOn: string | null; witnesses: string[]; nextReviewAt: string | null; signedCopy: WillSignedCopyWire | null; warnings: WillExecutionWarning[] }`, `WillReviewedWire { nextReviewAt }`, `WillHistoryEntryWire { willId; version; status; createdOn; generatedOn: string | null; executedOn: string | null; nextReviewAt: string | null; supersededByVersion: number | null; versionId: string | null; hasSignedCopy: boolean }`, `WillReviewWire { willId; version; nextReviewAt; due: boolean }`, `WillOverviewWire.history`, `WillOverviewWire.review`, `AlertType.WILL_REVIEW_DUE`.
  - API: `isoDay(d: Date): string`, `dayOf(iso: string): Date` (willStore); `toHistoryWire(w, versionOfWill)`, `willReviewOf(wills, today)` (will.service); `AuditAction` values `will_execute_upload`, `will_reviewed`.

- [ ] **Step 1: Write the failing shared test**

Create `packages/shared/src/will/execution.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  addYearsIso, isIsoDay, normaliseWillName, willExecutionInputSchema, willNextReviewDate, willWitnessIssues,
  willWitnessWarnings,
} from './execution.js';
import { validWillPayload } from './__tests__/fixtures.js';

describe('dates', () => {
  it('adds years, clamping 29 February', () => {
    expect(addYearsIso('2026-10-20', 2)).toBe('2028-10-20');
    expect(addYearsIso('2024-02-29', 2)).toBe('2026-02-28');
    expect(addYearsIso('2024-02-29', 4)).toBe('2028-02-29');
    expect(addYearsIso('2026-12-31', 2)).toBe('2028-12-31');
  });

  it('reviews two years after signing', () => {
    expect(willNextReviewDate('2026-10-12')).toBe('2028-10-12');
  });

  it('accepts real calendar days only', () => {
    expect(isIsoDay('2026-10-12')).toBe(true);
    expect(isIsoDay('2026-02-30')).toBe(false);
    expect(isIsoDay('12/10/2026')).toBe(false);
    expect(isIsoDay('')).toBe(false);
  });
});

describe('names', () => {
  it('normalises case, spacing and width', () => {
    expect(normaliseWillName('  Sunita   VERMA ')).toBe('sunita verma');
    expect(normaliseWillName('Ｓｕｎｉｔａ')).toBe('sunita');
    expect(normaliseWillName('सुनीता  वर्मा')).toBe(
      'सुनीता वर्मा',
    );
  });
});

describe('execution input', () => {
  it('accepts a date and two trimmed names', () => {
    const r = willExecutionInputSchema.parse({ executedOn: '2026-10-20', witnesses: [' Asha Rao ', 'Vikram Shah'] });
    expect(r).toEqual({ executedOn: '2026-10-20', witnesses: ['Asha Rao', 'Vikram Shah'] });
  });

  it('refuses bad dates, short or long names and a missing witness', () => {
    const ok = { executedOn: '2026-10-20', witnesses: ['Asha Rao', 'Vikram Shah'] };
    expect(willExecutionInputSchema.safeParse({ ...ok, executedOn: '2026-02-30' }).success).toBe(false);
    expect(willExecutionInputSchema.safeParse({ ...ok, witnesses: ['A', 'Vikram Shah'] }).success).toBe(false);
    expect(willExecutionInputSchema.safeParse({ ...ok, witnesses: ['Asha Rao', 'x'.repeat(121)] }).success).toBe(false);
    expect(willExecutionInputSchema.safeParse({ ...ok, witnesses: ['Asha Rao'] }).success).toBe(false);
  });
});

describe('witness checks', () => {
  it('flags a beneficiary as witness, whatever the spacing or case', () => {
    const p = validWillPayload();
    expect(willWitnessWarnings(p, ['Asha Rao', 'Vikram Shah'])).toEqual([]);
    expect(willWitnessWarnings(p, ['  sunita   VERMA', 'Vikram Shah'])).toEqual(['WITNESS_IS_BENEFICIARY']);
    expect(willWitnessWarnings(p, ['Asha Rao', 'Pune Animal Trust'])).toEqual(['WITNESS_IS_BENEFICIARY']);
  });

  it('flags a back-up beneficiary who is not otherwise named in a gift', () => {
    const p = validWillPayload();
    p.people.push({ ...p.people[1]!, id: 'p-backup', name: 'Meera Iyer', contingentId: null });
    p.people[1] = { ...p.people[1]!, contingentId: 'p-backup' };
    expect(willWitnessWarnings(p, ['Meera Iyer', 'Vikram Shah'])).toEqual(['WITNESS_IS_BENEFICIARY']);
  });

  it('refuses the testator and the same person twice', () => {
    const p = validWillPayload();
    expect(willWitnessIssues(p, ['Ramesh Kumar Verma', 'Asha Rao'])).toEqual([{ path: 'witnesses.0', code: 'witness_is_testator' }]);
    expect(willWitnessIssues(p, ['Asha Rao', 'asha  rao'])).toEqual([{ path: 'witnesses.1', code: 'duplicate_witness' }]);
    expect(willWitnessIssues(p, ['Asha Rao', 'Vikram Shah'])).toEqual([]);
  });
});
```
(The `\u` escapes are the full-width "Sunita" and the Devanagari "सुनीता वर्मा"; escapes keep the test file ASCII so the dash/encoding check stays simple.)

- [ ] **Step 2: Write the failing API tests**

Create `packages/api/test/will/willExecuteSchema.db.test.ts`:
```ts
/**
 * Part 2 adds two columns to "Will" and one AlertType value. No GRANT is written: the table-level
 * grants to the app role cover added columns, and Will's RLS policy is row-based. This pins both facts.
 */
import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import { prisma, USER_SCOPED_MODELS } from '../../src/lib/prisma.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const COLUMNS = [
  ['Will', 'executionSealed'],
  ['Will', 'executedDocumentId'],
] as const;

describe('will execute columns', () => {
  it('the app role can read, insert and update every new column', async () => {
    for (const [table, column] of COLUMNS) {
      const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
        SELECT has_column_privilege('portfolioos_app'::name, ${`"${table}"`}::text, ${column}::text, 'SELECT, INSERT, UPDATE'::text) AS ok`;
      expect(rows[0]?.ok, `${table}.${column}`).toBe(true);
    }
  });

  it('Will stays user-scoped', () => expect(USER_SCOPED_MODELS.has('Will')).toBe(true));

  it('AlertType has WILL_REVIEW_DUE', async () => {
    const rows = await prisma.$queryRaw<{ v: string }[]>`SELECT unnest(enum_range(NULL::"AlertType"))::text AS v`;
    expect(rows.map((r) => r.v)).toContain('WILL_REVIEW_DUE');
  });

  it('the review job has its index', async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'Will' AND indexname = 'Will_status_nextReviewAt_idx'`;
    expect(rows).toHaveLength(1);
  });
});
```

Create `packages/api/test/will/willHistory.db.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Prisma, WillStatus } from '@prisma/client';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { getWillOverview } from '../../src/services/will/will.service.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const deps = { collect: async () => ({ candidates: [], failed: [] }), today: () => '2026-10-12' };
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function insertWill(userId: string, version: number, status: WillStatus, extra: Partial<Prisma.WillUncheckedCreateInput> = {}) {
  return runAsSystem(() =>
    prisma.will.create({ data: { userId, version, status, payload: Buffer.from('sealed-elsewhere'), ...extra } }),
  );
}

function insertVersion(userId: string, willId: string, versionNo: number, generatedOn: string) {
  return runAsSystem(() =>
    prisma.willVersion.create({
      data: {
        willId, userId, versionNo, regime: 'ISA_HINDU', templateId: 'isa-hindu', templateVersion: 1, rulesetVersion: 1,
        inputHash: 'a'.repeat(64), textHash: 'b'.repeat(64), snapshotSealed: Buffer.from('x'), documentId: 'doc-placeholder',
        pdfSha256: 'c'.repeat(64), findingsJson: [], generatedOn: day(generatedOn),
      },
    }),
  );
}

function wipe(userId: string) {
  return runAsSystem(async () => {
    await prisma.willVersion.deleteMany({ where: { userId } });
    await prisma.will.deleteMany({ where: { userId } });
  });
}

let a: TestScope;
let b: TestScope;

beforeAll(async () => {
  a = await createTestScope('will-history-a');
  b = await createTestScope('will-history-b');
});
afterAll(async () => {
  await wipe(a.userId);
  await wipe(b.userId);
  await a.cleanup();
  await b.cleanup();
});

describe('overview history and review', () => {
  let executedId = '';

  it('lists every non-discarded version with its dates, newest first, and the review that is due', async () => {
    const v1 = await insertWill(a.userId, 1, 'SUPERSEDED', {
      executedAt: day('2024-03-01'), nextReviewAt: day('2026-03-01'), executedDocumentId: 'doc-signed-1',
    });
    const v2 = await insertWill(a.userId, 2, 'EXECUTED', {
      executedAt: day('2024-10-01'), nextReviewAt: day('2026-10-01'), executedDocumentId: 'doc-signed-2',
    });
    executedId = v2.id;
    await runAsSystem(() => prisma.will.update({ where: { id: v1.id }, data: { supersededById: v2.id } }));
    await insertWill(a.userId, 3, 'DISCARDED');
    const v4 = await insertWill(a.userId, 4, 'DRAFT');
    const ver1 = await insertVersion(a.userId, v1.id, 1, '2024-02-20');
    const ver2 = await insertVersion(a.userId, v2.id, 2, '2024-09-25');

    const o = await a.runAs(() => getWillOverview(a.userId, deps));
    expect(o.status).toBe('EXECUTED');
    expect(o.history.map((h) => [h.version, h.status])).toEqual([[4, 'DRAFT'], [2, 'EXECUTED'], [1, 'SUPERSEDED']]);
    expect(o.history[0]).toMatchObject({
      willId: v4.id, generatedOn: null, executedOn: null, nextReviewAt: null, versionId: null, hasSignedCopy: false,
      supersededByVersion: null,
    });
    expect(o.history[0]?.createdOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(o.history[1]).toMatchObject({
      willId: v2.id, generatedOn: '2024-09-25', executedOn: '2024-10-01', nextReviewAt: '2026-10-01',
      versionId: ver2.id, hasSignedCopy: true, supersededByVersion: null,
    });
    expect(o.history[2]).toMatchObject({
      willId: v1.id, generatedOn: '2024-02-20', executedOn: '2024-03-01', nextReviewAt: null,
      versionId: ver1.id, hasSignedCopy: true, supersededByVersion: 2,
    });
    expect(o.review).toEqual({ willId: v2.id, version: 2, nextReviewAt: '2026-10-01', due: true });
  });

  it('a review date still ahead is shown but not due', async () => {
    await runAsSystem(() => prisma.will.update({ where: { id: executedId }, data: { nextReviewAt: day('2028-10-01') } }));
    const o = await a.runAs(() => getWillOverview(a.userId, deps));
    expect(o.review).toEqual({ willId: executedId, version: 2, nextReviewAt: '2028-10-01', due: false });
  });

  it('no wills: empty history and no review', async () => {
    const o = await b.runAs(() => getWillOverview(b.userId, deps));
    expect(o.history).toEqual([]);
    expect(o.review).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:
```bash
cd portfolioos/packages/shared && npx vitest run src/will/execution.test.ts
cd ../api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/will/willExecuteSchema.db.test.ts test/will/willHistory.db.test.ts
```
Expected: FAIL - cannot resolve `./execution.js`; `executedDocumentId` is not a `Will` field; `WILL_REVIEW_DUE` missing; `o.history` undefined.

- [ ] **Step 4: Schema and migration**

In `packages/api/prisma/schema.prisma`:

(a) In `enum AlertType`, add a line `  WILL_REVIEW_DUE` directly before `  CUSTOM`.

(b) In `model Will`, after the line `nextReviewAt     DateTime?     @db.Date` add:
```prisma
  /// Part 2: signing date + witness names, sealed under slot "willexec:<id>".
  executionSealed    Bytes?
  /// Part 2: Document (ownerType WILL, category "executed") holding the signed copy.
  executedDocumentId String?
```
and after `@@index([userId, status])` add:
```prisma
  @@index([status, nextReviewAt])
```

Create `packages/api/prisma/migrations/20261014130000_will_execute/migration.sql`:
```sql
-- Will Maker part 2: execute and store, review reminders
-- (docs/superpowers/plans/2026-10-12-will-maker-02-execute.md).
-- No GRANT: the table-level grants on "Will" to portfolioos_app cover added
-- columns (test/will/willExecuteSchema.db.test.ts), and Will's RLS policy is
-- row-based. The new enum value is not used inside this migration.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'WILL_REVIEW_DUE';

ALTER TABLE "Will" ADD COLUMN "executionSealed" BYTEA,
ADD COLUMN "executedDocumentId" TEXT;

-- The daily review job looks up executed wills whose review date has passed.
CREATE INDEX "Will_status_nextReviewAt_idx" ON "Will"("status", "nextReviewAt");
```

Apply to the isolated DB only, cross-check, regenerate:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split npx prisma migrate deploy
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split npx prisma migrate diff --from-url postgresql://postgres:postgres@localhost:5432/portfolioos_split --to-schema-datamodel prisma/schema.prisma --script
npx prisma generate
```
Expected: `migrate deploy` applies `20261014130000_will_execute`. The diff shows nothing about `executionSealed`, `executedDocumentId`, `Will_status_nextReviewAt_idx` or `WILL_REVIEW_DUE` (it may show dropping Part 1's partial index `Will_one_draft_per_user` - expected, Prisma does not model partial indexes; ignore that and any other unrelated local drift; copy nothing from it).

- [ ] **Step 5: Shared execution model**

Create `packages/shared/src/will/execution.ts`:
```ts
/**
 * Will Maker part 2: the signing (execution) record, signed-copy limits and
 * the review cycle. Pure, no I/O. Witness names are personal data: the API
 * seals them (slot "willexec:<willId>") and never logs them.
 */
import { z } from 'zod';
import type { WillPayload } from './schema.js';
import type { WillStatusWire } from './wire.js';
import { willBeneficiaryIds } from './estateMath.js';

export const WILL_REVIEW_INTERVAL_YEARS = 2;
export const WILL_WITNESS_NAME_MAX = 120;
export const WILL_SIGNED_COPY_MAX_MB = 20;
export const WILL_SIGNED_COPY_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export type WillSignedCopyMime = (typeof WILL_SIGNED_COPY_MIME_TYPES)[number];

/** A real calendar day written YYYY-MM-DD. */
export function isIsoDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const isoDaySchema = z.string().refine(isIsoDay, { message: 'invalid_date' });
const witnessName = z.string().trim().min(2).max(WILL_WITNESS_NAME_MAX);

/** What the user submits. Checks that need the will itself are in willWitnessIssues. */
export const willExecutionInputSchema = z.object({
  executedOn: isoDaySchema,
  witnesses: z.tuple([witnessName, witnessName]),
});
export type WillExecutionInput = z.infer<typeof willExecutionInputSchema>;

/** The sealed record kept on the Will row. */
export const willExecutionRecordSchema = willExecutionInputSchema.extend({ recordedAt: z.string() });
export type WillExecutionRecord = z.infer<typeof willExecutionRecordSchema>;

/** Compare people's names: NFKC, trimmed, single spaces, lower case. */
export function normaliseWillName(s: string): string {
  return s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Calendar years later; 29 February becomes 28 February in a non-leap year. */
export function addYearsIso(iso: string, years: number): string {
  const y = Number.parseInt(iso.slice(0, 4), 10) + years;
  const m = Number.parseInt(iso.slice(5, 7), 10);
  const d = Number.parseInt(iso.slice(8, 10), 10);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

export function willNextReviewDate(fromIso: string): string {
  return addYearsIso(fromIso, WILL_REVIEW_INTERVAL_YEARS);
}

export type WillExecutionWarning = 'WITNESS_IS_BENEFICIARY';

/**
 * A witness who (or whose spouse) takes under the will can lose that gift
 * (s.67 Indian Succession Act); the will itself stays valid. Spouses cannot be
 * detected from names, so this only catches beneficiaries and their back-ups.
 */
export function willWitnessWarnings(p: WillPayload, witnesses: readonly string[]): WillExecutionWarning[] {
  const ids = new Set(willBeneficiaryIds(p));
  const backups = p.people.filter((x) => ids.has(x.id) && x.contingentId).map((x) => x.contingentId as string);
  for (const id of backups) ids.add(id);
  const names = new Set(p.people.filter((x) => ids.has(x.id)).map((x) => normaliseWillName(x.name)));
  return witnesses.some((w) => names.has(normaliseWillName(w))) ? ['WITNESS_IS_BENEFICIARY'] : [];
}

/** Hard errors: the testator cannot witness their own will, and two witnesses means two people. */
export function willWitnessIssues(
  p: WillPayload,
  witnesses: readonly [string, string],
): Array<{ path: string; code: string }> {
  const issues: Array<{ path: string; code: string }> = [];
  const testator = normaliseWillName(p.details.legalName);
  witnesses.forEach((w, i) => {
    if (testator !== '' && normaliseWillName(w) === testator) issues.push({ path: `witnesses.${i}`, code: 'witness_is_testator' });
  });
  if (normaliseWillName(witnesses[0]) === normaliseWillName(witnesses[1])) {
    issues.push({ path: 'witnesses.1', code: 'duplicate_witness' });
  }
  return issues;
}

export interface WillSignedCopyWire {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface WillExecutionWire {
  willId: string;
  version: number;
  status: WillStatusWire;
  versionId: string;
  generatedOn: string;
  executedOn: string | null;
  witnesses: string[];
  /** Only while the will is EXECUTED (a replaced will has no review). */
  nextReviewAt: string | null;
  signedCopy: WillSignedCopyWire | null;
  warnings: WillExecutionWarning[];
}

export interface WillReviewedWire {
  nextReviewAt: string;
}
```

In `packages/shared/src/will/wire.ts`, directly above `export interface WillOverviewWire {` add:
```ts
/** One will in the overview's history (every status except DISCARDED). */
export interface WillHistoryEntryWire {
  willId: string;
  version: number;
  status: WillStatusWire;
  createdOn: string;
  generatedOn: string | null;
  executedOn: string | null;
  /** Only for the EXECUTED will. */
  nextReviewAt: string | null;
  supersededByVersion: number | null;
  versionId: string | null;
  hasSignedCopy: boolean;
}

/** The executed will's review date; `due` once it is today or past. */
export interface WillReviewWire {
  willId: string;
  version: number;
  nextReviewAt: string;
  due: boolean;
}
```
and inside `WillOverviewWire`, after `estateFailedSources: string[];` add:
```ts
  history: WillHistoryEntryWire[];
  review: WillReviewWire | null;
```

In `packages/shared/src/will/index.ts` append:
```ts
export * from './execution.js';
```

In `packages/shared/src/types/enums.ts`, inside `AlertType`, add `  WILL_REVIEW_DUE: 'WILL_REVIEW_DUE',` directly before `  CUSTOM: 'CUSTOM',`.

- [ ] **Step 6: Audit actions, date helpers, overview**

In `packages/api/src/lib/audit.ts`, extend the `AuditAction` union after `| 'will_discarded'`:
```ts
  | 'will_execute_upload'
  | 'will_reviewed';
```
(remove the `;` that ended `| 'will_discarded'`).

In `packages/api/src/services/will/willStore.ts`, append:
```ts
/** A @db.Date column as YYYY-MM-DD. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD as the Date Prisma writes to a @db.Date column. */
export function dayOf(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}
```

In `packages/api/src/services/will/will.service.ts`:

(a) Add `istCalendarDate,` and `type WillHistoryEntryWire, type WillReviewWire,` to the `@everypaisa/shared` import, and `isoDay` to the `./willStore.js` import.

(b) After `function toDraftWire(...) {...}` add:
```ts
/** One row of the overview's history. `versionOfWill` maps Will id -> version number. */
export function toHistoryWire(w: Will & { versions: WillVersion[] }, versionOfWill: Map<string, number>): WillHistoryEntryWire {
  const v = w.versions[0] ?? null;
  return {
    willId: w.id,
    version: w.version,
    status: w.status,
    createdOn: istCalendarDate(w.createdAt),
    generatedOn: v ? isoDay(v.generatedOn) : null,
    executedOn: w.executedAt ? isoDay(w.executedAt) : null,
    nextReviewAt: w.status === 'EXECUTED' && w.nextReviewAt ? isoDay(w.nextReviewAt) : null,
    supersededByVersion: w.supersededById ? versionOfWill.get(w.supersededById) ?? null : null,
    versionId: v?.id ?? null,
    hasSignedCopy: w.executedDocumentId !== null,
  };
}

/** The executed will's review date. At most one will is EXECUTED (generate supersedes the rest). */
export function willReviewOf(wills: readonly Will[], today: string): WillReviewWire | null {
  const w = wills.find((x) => x.status === 'EXECUTED' && x.nextReviewAt !== null);
  if (!w || !w.nextReviewAt) return null;
  const nextReviewAt = isoDay(w.nextReviewAt);
  return { willId: w.id, version: w.version, nextReviewAt, due: nextReviewAt <= today };
}
```

(c) In `getWillOverview`, after the line that builds `const versions = ...` add:
```ts
  const versionOfWill = new Map(wills.map((w) => [w.id, w.version]));
```
and replace the end of `getWillOverview`:
```ts
    estateFailedSources: collection.failed,
  };
}
```
with:
```ts
    estateFailedSources: collection.failed,
    history: wills.map((w) => toHistoryWire(w, versionOfWill)),
    review: willReviewOf(wills, today),
  };
}
```

In `apps/web/src/pages/will/willTestData.ts`, inside `overview(...)`, add `history: [],` and `review: null,` directly before `...p,`.

- [ ] **Step 7: Build shared and run the tests**

Run:
```bash
cd portfolioos/packages/shared && npx vitest run src/will && npx tsc --noEmit && pnpm build
cd ../api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/will/willExecuteSchema.db.test.ts test/will/willHistory.db.test.ts test/will/willDraft.db.test.ts
npx tsc --noEmit
cd ../../apps/web && npx tsc --noEmit && npx vitest run src/pages/will/WillOverviewPage.test.tsx
```
Expected: PASS; no type errors (the web compiles because the overview builder now fills `history` and `review`).

- [ ] **Step 8: Commit**

```bash
cd portfolioos
git add packages/api/prisma/schema.prisma packages/api/prisma/migrations/20261014130000_will_execute packages/shared/src/will/execution.ts packages/shared/src/will/execution.test.ts packages/shared/src/will/wire.ts packages/shared/src/will/index.ts packages/shared/src/types/enums.ts packages/api/src/lib/audit.ts packages/api/src/services/will/willStore.ts packages/api/src/services/will/will.service.ts packages/api/test/will/willExecuteSchema.db.test.ts packages/api/test/will/willHistory.db.test.ts apps/web/src/pages/will/willTestData.ts
git commit -m "feat(will): execution record columns, review alert type and will history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Execution API - record signing, store the signed copy, read it back

**Wave 2** (parallel with Task 4; needs Task 1).

**Files:**
- Create: `packages/api/src/services/will/willExecute.service.ts`
- Create: `packages/api/src/middleware/willUpload.ts`
- Modify: `packages/api/src/controllers/will.controller.ts` (handlers `getExecution`, `recordExecution`, `downloadSignedCopy`)
- Modify: `packages/api/src/routes/will.routes.ts` (three routes)
- Create: `packages/api/test/will/willExecuteFixtures.ts` (test helpers, not a test file)
- Test: `packages/api/test/will/willExecute.db.test.ts`, `packages/api/test/routes/willExecute.routes.test.ts`

**Interfaces:**
- Consumes: Task 1 (`willExecutionInputSchema`, `willExecutionRecordSchema`, `willNextReviewDate`, `willWitnessIssues`, `willWitnessWarnings`, `WILL_SIGNED_COPY_MIME_TYPES`, `WILL_SIGNED_COPY_MAX_MB`, `WillExecutionWire`, `WillExecutionRecord`, `WillSignedCopyMime`, `isoDay`, `dayOf`, audit `will_execute_upload`, Prisma `Will.executionSealed`, `Will.executedDocumentId`, `AlertType.WILL_REVIEW_DUE`). Part 1: `loadOwnedWill`, `openWillPayload`, `requireWillKeys`, `todayIst`, `zodIssues`, `newWillId`, `sealWillPayload` (willStore); `generateWill(userId, willId, { revision, acknowledge }, deps: { renderPdf; today })` (willGenerate.service); `createWillDraft`; `createDocument`, `deleteDocument(userId, id, { allowWill: true })` (document.service); controller helpers `uid`, `idOf`; `willRouter`; test fixtures `TODAY`, `validWillPayload` (`test/will/willFixtures.ts`). Repo: `sniff` (`lib/decryptIfNeeded.ts`), `readBuffer` (`lib/documentStorage.ts`), `downloadHeaders` (`lib/documentMime.ts`), `sealForUser`/`openForUser` (`lib/userKeys.ts`), `runInTransaction`, `importLimiter`.
- Produces:
  - `willExecute.service.ts`: `interface WillExecuteDeps { today?: () => string; beforeCommit?: () => Promise<void> }`, `interface RecordExecutionResult { execution: WillExecutionWire; newCopy: boolean; replacedCopy: boolean }`, `signedCopyMime(buffer: Buffer): WillSignedCopyMime | null`, `getWillExecution(userId, willId): Promise<WillExecutionWire>`, `recordWillExecution(userId, willId, input: { fields: unknown; file: { buffer: Buffer } | null }, deps?): Promise<RecordExecutionResult>`, `getSignedCopy(userId, willId): Promise<{ buffer: Buffer; mimeType: string; fileName: string; versionNo: number }>`.
  - `willUpload.ts`: `uploadWillSignedCopy` Express middleware (multipart field `file`; 400 `WILL_UPLOAD_TYPE` for a disallowed extension, 413 `WILL_UPLOAD_TOO_LARGE` over 20 MB).
  - HTTP: `GET /api/will/wills/:id/execution` -> `WillExecutionWire` (409 `WILL_NOT_EXECUTABLE` for DRAFT/DISCARDED); `POST /api/will/wills/:id/execution` multipart `{ executedOn, witness1, witness2, file? }` -> `WillExecutionWire` (422 `{ issues: [{ path, code }] }`, 400 `{ field: 'file' }` / `{ reason: 'WILL_UPLOAD_TYPE' }`, 409 `WILL_NOT_EXECUTABLE` / `WILL_EXECUTION_CONFLICT`, 413; audit `will_execute_upload`); `GET /api/will/wills/:id/signed-copy` -> the stored bytes with `downloadHeaders` + `Cache-Control: no-store` (audit `will_downloaded` with `kind: 'signed_copy'`).
  - Test helpers: `FAKE_PDF`, `PNG_BYTES`, `JPEG_BYTES`, `WEBP_BYTES`, `GIF_BYTES`, `HTML_BYTES`, `makeGeneratedWill(scope): Promise<{ willId; versionId; version }>`, `markExecuted(willId, executedOn, nextReviewAt)`, `wipeWills(userId)`.

- [ ] **Step 1: Test helpers**

Create `packages/api/test/will/willExecuteFixtures.ts`:
```ts
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { newWillId, sealWillPayload } from '../../src/services/will/willStore.js';
import { generateWill } from '../../src/services/will/willGenerate.service.js';
import type { TestScope } from '../helpers/db.js';
import { TODAY, validWillPayload } from './willFixtures.js';

export const FAKE_PDF = Buffer.from('%PDF-1.7\n% will execute test\n%%EOF\n');
export const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
export const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
export const WEBP_BYTES = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(16)]);
export const GIF_BYTES = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(16)]);
export const HTML_BYTES = Buffer.from('<html><body><script>alert(1)</script></body></html>');

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

/**
 * A GENERATED will holding validWillPayload(), generated on TODAY through Part 1's real generate path
 * (the PDF renderer is replaced by FAKE_PDF). Generating supersedes the user's earlier live will.
 */
export async function makeGeneratedWill(scope: TestScope): Promise<{ willId: string; versionId: string; version: number }> {
  const last = await runAsSystem(() =>
    prisma.will.findFirst({ where: { userId: scope.userId }, orderBy: { version: 'desc' }, select: { version: true } }),
  );
  const version = (last?.version ?? 0) + 1;
  const id = newWillId();
  const payload = await scope.runAs(() => sealWillPayload(scope.userId, id, validWillPayload()));
  await scope.runAs(() => prisma.will.create({ data: { id, userId: scope.userId, version, payload } }));
  const r = await scope.runAs(() =>
    generateWill(scope.userId, id, { revision: 0, acknowledge: true }, { renderPdf: async () => FAKE_PDF, today: () => TODAY }),
  );
  return { willId: id, versionId: r.version.id, version };
}

/** Mark a will EXECUTED with the given dates (review tests that do not need a signed copy). */
export function markExecuted(willId: string, executedOn: string, nextReviewAt: string) {
  return runAsSystem(() =>
    prisma.will.update({
      where: { id: willId },
      data: { status: 'EXECUTED', executedAt: day(executedOn), nextReviewAt: day(nextReviewAt) },
    }),
  );
}

export function wipeWills(userId: string) {
  return runAsSystem(async () => {
    await prisma.alert.deleteMany({ where: { userId, type: 'WILL_REVIEW_DUE' } });
    await prisma.willVersion.deleteMany({ where: { userId } });
    await prisma.will.deleteMany({ where: { userId } });
  });
}
```

- [ ] **Step 2: Write the failing service test**

Create `packages/api/test/will/willExecute.db.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createWillDraft } from '../../src/services/will/will.service.js';
import {
  getSignedCopy, getWillExecution, recordWillExecution, signedCopyMime,
} from '../../src/services/will/willExecute.service.js';
import {
  FAKE_PDF, GIF_BYTES, HTML_BYTES, JPEG_BYTES, PNG_BYTES, WEBP_BYTES, makeGeneratedWill, wipeWills,
} from './willExecuteFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

/** Wills are generated on TODAY (2026-10-12); these tests sign them a little later. */
const LATER = '2026-11-02';
const deps = { today: () => LATER };
const fields = (p: Partial<{ executedOn: string; witnesses: string[] }> = {}) => ({
  executedOn: '2026-10-20', witnesses: ['Asha Rao', 'Vikram Shah'], ...p,
});
const signedDocs = (userId: string) =>
  runAsSystem(() => prisma.document.count({ where: { userId, ownerType: 'WILL', category: 'executed' } }));
const willRow = (id: string) => runAsSystem(() => prisma.will.findUniqueOrThrow({ where: { id } }));

let a: TestScope;
let b: TestScope;

beforeAll(async () => {
  a = await createTestScope('will-exec-a');
  b = await createTestScope('will-exec-b');
});
afterAll(async () => {
  await wipeWills(a.userId);
  await wipeWills(b.userId);
  await a.cleanup();
  await b.cleanup();
});

describe('signedCopyMime', () => {
  it('accepts PDF, PNG, JPEG and WebP bytes only', () => {
    expect(signedCopyMime(FAKE_PDF)).toBe('application/pdf');
    expect(signedCopyMime(PNG_BYTES)).toBe('image/png');
    expect(signedCopyMime(JPEG_BYTES)).toBe('image/jpeg');
    expect(signedCopyMime(WEBP_BYTES)).toBe('image/webp');
    expect(signedCopyMime(GIF_BYTES)).toBeNull();
    expect(signedCopyMime(HTML_BYTES)).toBeNull();
    expect(signedCopyMime(Buffer.alloc(0))).toBeNull();
  });
});

describe('recording the signed will', () => {
  let willId = '';
  let firstDocId = '';

  it('stores the signed copy, seals the witnesses and sets the review date', async () => {
    ({ willId } = await makeGeneratedWill(a));
    const r = await a.runAs(() => recordWillExecution(a.userId, willId, { fields: fields(), file: { buffer: FAKE_PDF } }, deps));
    expect(r).toMatchObject({ newCopy: true, replacedCopy: false });
    expect(r.execution).toMatchObject({
      willId, version: 1, status: 'EXECUTED', generatedOn: '2026-10-12', executedOn: '2026-10-20',
      nextReviewAt: '2028-10-20', witnesses: ['Asha Rao', 'Vikram Shah'], warnings: [],
    });
    expect(r.execution.signedCopy).toMatchObject({ fileName: 'will-v1-signed.pdf', mimeType: 'application/pdf', sizeBytes: FAKE_PDF.length });

    const row = await willRow(willId);
    expect(row.status).toBe('EXECUTED');
    expect(row.executedAt?.toISOString().slice(0, 10)).toBe('2026-10-20');
    expect(row.executionSealed).not.toBeNull();
    const sealed = Buffer.from(row.executionSealed ?? new Uint8Array());
    expect(sealed.includes(Buffer.from('Asha'))).toBe(false);
    expect(sealed.includes(Buffer.from('Vikram'))).toBe(false);
    firstDocId = row.executedDocumentId ?? '';
    const doc = await runAsSystem(() => prisma.document.findUniqueOrThrow({ where: { id: firstDocId } }));
    expect(doc).toMatchObject({ ownerType: 'WILL', ownerId: willId, category: 'executed', mimeType: 'application/pdf' });

    const back = await a.runAs(() => getWillExecution(a.userId, willId));
    expect(back.witnesses).toEqual(['Asha Rao', 'Vikram Shah']);
    const file = await a.runAs(() => getSignedCopy(a.userId, willId));
    expect(file.buffer.equals(FAKE_PDF)).toBe(true);
    expect(file).toMatchObject({ mimeType: 'application/pdf', fileName: 'will-v1-signed.pdf', versionNo: 1 });
  });

  it('corrects the details without a new file and keeps the copy', async () => {
    const r = await a.runAs(() =>
      recordWillExecution(a.userId, willId, { fields: fields({ witnesses: ['Asha Rao', 'Vikram K Shah'] }), file: null }, deps),
    );
    expect(r).toMatchObject({ newCopy: false, replacedCopy: false });
    expect(r.execution.witnesses).toEqual(['Asha Rao', 'Vikram K Shah']);
    expect((await willRow(willId)).executedDocumentId).toBe(firstDocId);
  });

  it('replaces the copy with a photo and removes the old file', async () => {
    const r = await a.runAs(() => recordWillExecution(a.userId, willId, { fields: fields(), file: { buffer: PNG_BYTES } }, deps));
    expect(r).toMatchObject({ newCopy: true, replacedCopy: true });
    expect(r.execution.signedCopy).toMatchObject({ fileName: 'will-v1-signed.png', mimeType: 'image/png' });
    expect(await runAsSystem(() => prisma.document.count({ where: { id: firstDocId } }))).toBe(0);
    expect(await signedDocs(a.userId)).toBe(1);
  });

  it('warns when a witness is a beneficiary, and keeps the warning on read', async () => {
    const r = await a.runAs(() =>
      recordWillExecution(a.userId, willId, { fields: fields({ witnesses: ['  sunita   VERMA', 'Vikram Shah'] }), file: null }, deps),
    );
    expect(r.execution.warnings).toEqual(['WITNESS_IS_BENEFICIARY']);
    expect((await a.runAs(() => getWillExecution(a.userId, willId))).warnings).toEqual(['WITNESS_IS_BENEFICIARY']);
  });

  it('refuses the testator as a witness and the same person twice, without echoing names', async () => {
    const err = await a
      .runAs(() => recordWillExecution(a.userId, willId, { fields: fields({ witnesses: ['Ramesh Kumar Verma', 'Asha Rao'] }), file: null }, deps))
      .catch((e: unknown) => e as { statusCode: number; details: unknown });
    expect(err.statusCode).toBe(422);
    expect(err.details).toEqual({ issues: [{ path: 'witnesses.0', code: 'witness_is_testator' }] });
    await expect(
      a.runAs(() => recordWillExecution(a.userId, willId, { fields: fields({ witnesses: ['Asha Rao', 'ASHA rao'] }), file: null }, deps)),
    ).rejects.toMatchObject({ statusCode: 422, details: { issues: [{ path: 'witnesses.1', code: 'duplicate_witness' }] } });
  });

  it('refuses dates in the future or before the will was generated', async () => {
    await expect(
      a.runAs(() => recordWillExecution(a.userId, willId, { fields: fields({ executedOn: '2026-11-03' }), file: null }, deps)),
    ).rejects.toMatchObject({ statusCode: 422, details: { issues: [{ path: 'executedOn', code: 'in_future' }] } });
    await expect(
      a.runAs(() => recordWillExecution(a.userId, willId, { fields: fields({ executedOn: '2026-10-11' }), file: null }, deps)),
    ).rejects.toMatchObject({ statusCode: 422, details: { issues: [{ path: 'executedOn', code: 'before_generated' }] } });
    await expect(
      a.runAs(() => recordWillExecution(a.userId, willId, { fields: { executedOn: '20/10/2026', witnesses: ['Asha Rao'] }, file: null }, deps)),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('another user cannot read or record it', async () => {
    await expect(b.runAs(() => getWillExecution(b.userId, willId))).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      b.runAs(() => recordWillExecution(b.userId, willId, { fields: fields(), file: { buffer: FAKE_PDF } }, deps)),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(b.runAs(() => getSignedCopy(b.userId, willId))).rejects.toMatchObject({ statusCode: 404 });
  });

  it('a replaced will is read-only but keeps its record', async () => {
    await makeGeneratedWill(a);
    const old = await a.runAs(() => getWillExecution(a.userId, willId));
    expect(old).toMatchObject({ status: 'SUPERSEDED', executedOn: '2026-10-20', nextReviewAt: null });
    await expect(
      a.runAs(() => recordWillExecution(a.userId, willId, { fields: fields(), file: null }, deps)),
    ).rejects.toMatchObject({ statusCode: 409, details: { reason: 'WILL_NOT_EXECUTABLE' } });
  });

  it('a draft cannot be signed', async () => {
    const draft = await a.runAs(() => createWillDraft(a.userId, null));
    await expect(a.runAs(() => getWillExecution(a.userId, draft.id))).rejects.toMatchObject({
      statusCode: 409, details: { reason: 'WILL_NOT_EXECUTABLE' },
    });
  });
});

describe('refusals that store nothing', () => {
  let willId = '';

  it('refuses bad bytes and needs a file the first time', async () => {
    ({ willId } = await makeGeneratedWill(b));
    await expect(
      b.runAs(() => recordWillExecution(b.userId, willId, { fields: fields(), file: null }, deps)),
    ).rejects.toMatchObject({ statusCode: 400, details: { field: 'file' } });
    for (const buffer of [HTML_BYTES, GIF_BYTES]) {
      await expect(
        b.runAs(() => recordWillExecution(b.userId, willId, { fields: fields(), file: { buffer } }, deps)),
      ).rejects.toMatchObject({ statusCode: 400, details: { reason: 'WILL_UPLOAD_TYPE' } });
    }
    expect(await signedDocs(b.userId)).toBe(0);
    expect((await willRow(willId)).status).toBe('GENERATED');
  });

  it('cleans up the new file when the save loses a race', async () => {
    const racing = {
      today: () => LATER,
      beforeCommit: () => runAsSystem(async () => {
        await prisma.will.update({ where: { id: willId }, data: { executedDocumentId: 'saved-by-another-tab' } });
      }),
    };
    await expect(
      b.runAs(() => recordWillExecution(b.userId, willId, { fields: fields(), file: { buffer: FAKE_PDF } }, racing)),
    ).rejects.toMatchObject({ statusCode: 409, details: { reason: 'WILL_EXECUTION_CONFLICT' } });
    expect(await signedDocs(b.userId)).toBe(0);
    const row = await willRow(willId);
    expect(row).toMatchObject({ status: 'GENERATED', executionSealed: null });
  });
});
```

- [ ] **Step 3: Write the failing route test**

Create `packages/api/test/routes/willExecute.routes.test.ts`:
```ts
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { istCalendarDate } from '@everypaisa/shared';
import { willRouter } from '../../src/routes/will.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { FAKE_PDF, HTML_BYTES, makeGeneratedWill, wipeWills } from '../will/willExecuteFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let user: TestScope;
let willId = '';
/** The will is generated on 2026-10-12 (fixture TODAY); the route checks against the real date. */
const signedOn = '2026-10-12';

const auth = () => ({
  authorization: `Bearer ${signAccessToken({ sub: user.userId, email: `${user.userId}@test.local`, role: 'INVESTOR', plan: 'PLUS' }).token}`,
});

function upload(fieldsIn: Record<string, string>, file?: { bytes: Buffer; name: string; type: string }) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fieldsIn)) fd.append(k, v);
  if (file) fd.append('file', new Blob([file.bytes], { type: file.type }), file.name);
  return fetch(`${base}/api/will/wills/${willId}/execution`, { method: 'POST', headers: auth(), body: fd });
}

const okFields = { executedOn: signedOn, witness1: 'Asha Rao', witness2: 'Vikram Shah' };
const pdfFile = { bytes: FAKE_PDF, name: 'scan.pdf', type: 'application/pdf' };

beforeAll(async () => {
  user = await createTestScope('will-exec-http');
  ({ willId } = await makeGeneratedWill(user));
  const app = express();
  app.use(express.json());
  app.use('/api/will', willRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  await wipeWills(user.userId);
  await user.cleanup();
});

describe('POST /api/will/wills/:id/execution', () => {
  it('runs on or after the fixture generation date', () => {
    expect(istCalendarDate(new Date()) >= signedOn).toBe(true);
  });

  it('422 lists paths and codes, never the names', async () => {
    const res = await upload({ executedOn: signedOn, witness1: 'Zzyzx Secretwitness', witness2: 'Q' }, pdfFile);
    expect(res.status).toBe(422);
    const text = await res.text();
    expect(text).not.toContain('Zzyzx');
    expect(JSON.parse(text).details.issues).toEqual([{ path: 'witnesses.1', code: 'too_small' }]);
  });

  it('refuses a disallowed extension', async () => {
    const res = await upload(okFields, { bytes: FAKE_PDF, name: 'scan.exe', type: 'application/octet-stream' });
    expect(res.status).toBe(400);
    expect((await res.json()).details.reason).toBe('WILL_UPLOAD_TYPE');
  });

  it('HTML bytes named .pdf are refused', async () => {
    const res = await upload(okFields, { bytes: HTML_BYTES, name: 'scan.pdf', type: 'application/pdf' });
    expect(res.status).toBe(400);
    expect((await res.json()).details.reason).toBe('WILL_UPLOAD_TYPE');
  });

  it('a file over 20 MB is a 413', async () => {
    const big = Buffer.concat([FAKE_PDF, Buffer.alloc(21 * 1024 * 1024)]);
    const res = await upload(okFields, { bytes: big, name: 'scan.pdf', type: 'application/pdf' });
    expect(res.status).toBe(413);
  });

  it('stores the signed copy and audits it without names', async () => {
    const res = await upload(okFields, pdfFile);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { status: string; witnesses: string[]; signedCopy: { mimeType: string } } };
    expect(json.data).toMatchObject({ status: 'EXECUTED', witnesses: ['Asha Rao', 'Vikram Shah'] });
    expect(json.data.signedCopy.mimeType).toBe('application/pdf');
    const audit = await runAsSystem(() =>
      prisma.auditLog.findFirst({ where: { userId: user.userId, action: 'will_execute_upload' }, orderBy: { createdAt: 'desc' } }),
    );
    expect(audit?.resource).toBe(`Will:${willId}`);
    expect(audit?.metadata).toMatchObject({ versionNo: 1, newCopy: true, replacedCopy: false, mimeType: 'application/pdf' });
    expect(JSON.stringify(audit)).not.toMatch(/Asha|Vikram/);
  });
});

describe('reading it back', () => {
  it('returns the execution record', async () => {
    const res = await fetch(`${base}/api/will/wills/${willId}/execution`, { headers: auth() });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { executedOn: string } }).data.executedOn).toBe(signedOn);
  });

  it('downloads the signed copy, uncached, and audits it', async () => {
    const res = await fetch(`${base}/api/will/wills/${willId}/signed-copy`, { headers: auth() });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await res.arrayBuffer()).equals(FAKE_PDF)).toBe(true);
    const audit = await runAsSystem(() =>
      prisma.auditLog.findFirst({ where: { userId: user.userId, action: 'will_downloaded', resource: `Will:${willId}` } }),
    );
    expect(audit?.metadata).toMatchObject({ kind: 'signed_copy', versionNo: 1 });
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/will/willExecute.db.test.ts test/routes/willExecute.routes.test.ts
```
Expected: FAIL - cannot resolve `willExecute.service.js`; the routes answer 404.

- [ ] **Step 5: The service**

Create `packages/api/src/services/will/willExecute.service.ts`:
```ts
/**
 * Step 9: record that a generated will was signed, keep the signed copy in the
 * vault, and read both back. The signing date and witness names are sealed with
 * the owner's key (slot "willexec:<willId>") and never logged; the stored file
 * name is fixed, never the uploaded one.
 */
import type { Will } from '@prisma/client';
import {
  willExecutionInputSchema, willExecutionRecordSchema, willNextReviewDate, willWitnessIssues, willWitnessWarnings,
  WILL_SIGNED_COPY_MIME_TYPES,
  type WillExecutionRecord, type WillExecutionWire, type WillSignedCopyMime,
} from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { openForUser, sealForUser } from '../../lib/userKeys.js';
import { sniff } from '../../lib/decryptIfNeeded.js';
import { readBuffer } from '../../lib/documentStorage.js';
import { createDocument, deleteDocument } from '../document.service.js';
import { dayOf, isoDay, loadOwnedWill, openWillPayload, requireWillKeys, todayIst, zodIssues } from './willStore.js';

export interface WillExecuteDeps {
  today?: () => string;
  /** Test seam: runs after the new copy is stored and before the commit. */
  beforeCommit?: () => Promise<void>;
}

export interface RecordExecutionResult {
  execution: WillExecutionWire;
  newCopy: boolean;
  replacedCopy: boolean;
}

const execSlot = (willId: string) => `willexec:${willId}`;

const EXT: Record<WillSignedCopyMime, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const NOT_EXECUTABLE =
  'Only your current will can be signed and stored. This one is a draft, was discarded or has been replaced.';
const BAD_TYPE = 'Upload the signed will as a PDF or a photo (JPEG, PNG or WebP).';

/** The bytes decide the type. Anything but a PDF or a JPEG/PNG/WebP photo is refused. */
export function signedCopyMime(buffer: Buffer): WillSignedCopyMime | null {
  const s = sniff(buffer);
  if (s.kind === 'pdf') return 'application/pdf';
  if (s.kind === 'image' && s.mime !== null && (WILL_SIGNED_COPY_MIME_TYPES as readonly string[]).includes(s.mime)) {
    return s.mime as WillSignedCopyMime;
  }
  return null;
}

function notExecutable(status: string): ConflictError {
  return new ConflictError(NOT_EXECUTABLE, { reason: 'WILL_NOT_EXECUTABLE', status });
}

async function latestVersion(userId: string, willId: string) {
  const v = await prisma.willVersion.findFirst({ where: { willId, userId }, orderBy: { versionNo: 'desc' } });
  if (!v) throw new NotFoundError('Will version not found');
  return v;
}

async function openExecution(userId: string, will: Will): Promise<WillExecutionRecord | null> {
  if (!will.executionSealed) return null;
  const plain = await openForUser(userId, execSlot(will.id), Buffer.from(will.executionSealed));
  return willExecutionRecordSchema.parse(JSON.parse(plain.toString('utf8')));
}

export async function getWillExecution(userId: string, willId: string): Promise<WillExecutionWire> {
  requireWillKeys();
  const will = await loadOwnedWill(userId, willId);
  if (will.status !== 'GENERATED' && will.status !== 'EXECUTED' && will.status !== 'SUPERSEDED') {
    throw notExecutable(will.status);
  }
  const version = await latestVersion(userId, will.id);
  const record = await openExecution(userId, will);
  const doc = will.executedDocumentId
    ? await prisma.document.findFirst({
        where: { id: will.executedDocumentId, userId, ownerType: 'WILL' },
        select: { fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
      })
    : null;
  const warnings = record ? willWitnessWarnings(await openWillPayload(userId, will.id, will.payload), record.witnesses) : [];
  return {
    willId: will.id,
    version: will.version,
    status: will.status,
    versionId: version.id,
    generatedOn: isoDay(version.generatedOn),
    executedOn: record?.executedOn ?? (will.executedAt ? isoDay(will.executedAt) : null),
    witnesses: record ? [...record.witnesses] : [],
    nextReviewAt: will.status === 'EXECUTED' && will.nextReviewAt ? isoDay(will.nextReviewAt) : null,
    signedCopy: doc
      ? { fileName: doc.fileName, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes, uploadedAt: doc.createdAt.toISOString() }
      : null,
    warnings,
  };
}

/** Deleting a file must never change the response: the save already succeeded or already failed. */
async function removeDocument(userId: string, documentId: string, event: string): Promise<void> {
  try {
    await deleteDocument(userId, documentId, { allowWill: true });
  } catch (err) {
    logger.error({ documentId, errName: err instanceof Error ? err.name : 'unknown' }, event);
  }
}

export async function recordWillExecution(
  userId: string,
  willId: string,
  input: { fields: unknown; file: { buffer: Buffer } | null },
  deps: WillExecuteDeps = {},
): Promise<RecordExecutionResult> {
  requireWillKeys();
  const today = (deps.today ?? todayIst)();
  const parsed = willExecutionInputSchema.safeParse(input.fields);
  if (!parsed.success) {
    throw new ValidationError('Some signing details are not valid', { issues: zodIssues(parsed.error) });
  }
  const { executedOn, witnesses } = parsed.data;

  const will = await loadOwnedWill(userId, willId);
  if (will.status !== 'GENERATED' && will.status !== 'EXECUTED') throw notExecutable(will.status);
  const version = await latestVersion(userId, will.id);
  const generatedOn = isoDay(version.generatedOn);
  const payload = await openWillPayload(userId, will.id, will.payload);
  const issues = [
    ...(executedOn > today ? [{ path: 'executedOn', code: 'in_future' }] : []),
    ...(executedOn < generatedOn ? [{ path: 'executedOn', code: 'before_generated' }] : []),
    ...willWitnessIssues(payload, witnesses),
  ];
  if (issues.length > 0) throw new ValidationError('Some signing details are not valid', { issues });

  if (!input.file && !will.executedDocumentId) {
    throw new BadRequestError('Attach the signed copy of your will', { field: 'file' });
  }
  const mime = input.file ? signedCopyMime(input.file.buffer) : null;
  if (input.file && !mime) throw new BadRequestError(BAD_TYPE, { field: 'file', reason: 'WILL_UPLOAD_TYPE' });

  const record: WillExecutionRecord = { executedOn, witnesses, recordedAt: new Date().toISOString() };
  const sealed = await sealForUser(userId, execSlot(will.id), Buffer.from(JSON.stringify(record), 'utf8'));
  const previousDocId = will.executedDocumentId;
  const newDoc =
    input.file && mime
      ? await createDocument({
          userId, ownerType: 'WILL', ownerId: will.id, category: 'executed',
          fileName: `will-v${will.version}-signed.${EXT[mime]}`, mimeType: mime, buffer: input.file.buffer,
        })
      : null;

  try {
    if (deps.beforeCommit) await deps.beforeCommit();
    await runInTransaction(async (tx) => {
      const res = await tx.will.updateMany({
        where: { id: will.id, userId, status: { in: ['GENERATED', 'EXECUTED'] }, executedDocumentId: previousDocId },
        data: {
          status: 'EXECUTED',
          executedAt: dayOf(executedOn),
          nextReviewAt: dayOf(willNextReviewDate(executedOn)),
          executionSealed: sealed,
          executedDocumentId: newDoc?.id ?? previousDocId,
        },
      });
      if (res.count === 0) {
        throw new ConflictError('This will changed while you were saving. Reload and try again.', {
          reason: 'WILL_EXECUTION_CONFLICT',
        });
      }
      // A new signing date means a new review date: close any reminder for the old one.
      await tx.alert.updateMany({
        where: { userId, type: 'WILL_REVIEW_DUE', isActive: true, metadata: { path: ['willId'], equals: will.id } },
        data: { isActive: false },
      });
    });
  } catch (err) {
    if (newDoc) await removeDocument(userId, newDoc.id, 'will.execute.new_copy_cleanup_failed');
    throw err;
  }
  if (newDoc && previousDocId) await removeDocument(userId, previousDocId, 'will.execute.old_copy_cleanup_failed');

  return {
    execution: await getWillExecution(userId, will.id),
    newCopy: newDoc !== null,
    replacedCopy: newDoc !== null && previousDocId !== null,
  };
}

export async function getSignedCopy(
  userId: string,
  willId: string,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string; versionNo: number }> {
  const will = await loadOwnedWill(userId, willId);
  const doc = will.executedDocumentId
    ? await prisma.document.findFirst({ where: { id: will.executedDocumentId, userId, ownerType: 'WILL' } })
    : null;
  if (!doc) throw new NotFoundError('No signed copy is stored for this will');
  return { buffer: await readBuffer(userId, doc.storageKey), mimeType: doc.mimeType, fileName: doc.fileName, versionNo: will.version };
}
```

- [ ] **Step 6: Upload middleware**

Create `packages/api/src/middleware/willUpload.ts`:
```ts
import multer from 'multer';
import { extname } from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { WILL_SIGNED_COPY_MAX_MB } from '@everypaisa/shared';
import { AppError, BadRequestError } from '../lib/errors.js';

/**
 * The signed copy of a will: one file, PDF or photo, at most 20 MB, kept in
 * memory (the service stores it sealed in the vault). The extension list is
 * only a first filter; the service decides the type from the bytes.
 */
const ALLOWED_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);

const single = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: WILL_SIGNED_COPY_MAX_MB * 1024 * 1024, files: 1, fields: 10, fieldSize: 2048 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_EXT.has(extname(file.originalname).toLowerCase())) {
      cb(new BadRequestError('Upload the signed will as a PDF or a photo (JPEG, PNG or WebP).', {
        field: 'file', reason: 'WILL_UPLOAD_TYPE',
      }));
      return;
    }
    cb(null, true);
  },
}).single('file');

/** multer's own errors would surface as 500s; map them to what the user did wrong. */
export function uploadWillSignedCopy(req: Request, res: Response, next: NextFunction): void {
  single(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      next(
        err.code === 'LIMIT_FILE_SIZE'
          ? new AppError(`The file is larger than ${WILL_SIGNED_COPY_MAX_MB} MB`, 413, 'WILL_UPLOAD_TOO_LARGE')
          : new BadRequestError('The upload could not be read', { field: err.field ?? 'file', reason: err.code }),
      );
      return;
    }
    next(err);
  });
}
```

- [ ] **Step 7: Controller and routes**

In `packages/api/src/controllers/will.controller.ts`, add the imports:
```ts
import { downloadHeaders } from '../lib/documentMime.js';
import { getSignedCopy, getWillExecution, recordWillExecution } from '../services/will/willExecute.service.js';
```
and append:
```ts
function formField(body: unknown, name: string): unknown {
  return body !== null && typeof body === 'object' ? (body as Record<string, unknown>)[name] : undefined;
}

export async function getExecution(req: Request, res: Response): Promise<void> {
  ok(res, await getWillExecution(uid(req), idOf(req, 'id')));
}

export async function recordExecution(req: Request, res: Response): Promise<void> {
  const userId = uid(req);
  const willId = idOf(req, 'id');
  const fields = {
    executedOn: formField(req.body, 'executedOn'),
    witnesses: [formField(req.body, 'witness1'), formField(req.body, 'witness2')],
  };
  const result = await recordWillExecution(userId, willId, { fields, file: req.file ? { buffer: req.file.buffer } : null });
  await writeAuditLog({
    userId, action: 'will_execute_upload', resource: `Will:${willId}`, req,
    metadata: {
      versionNo: result.execution.version,
      newCopy: result.newCopy,
      replacedCopy: result.replacedCopy,
      mimeType: result.execution.signedCopy?.mimeType ?? null,
      sizeBytes: result.execution.signedCopy?.sizeBytes ?? null,
      warnings: result.execution.warnings,
    },
  });
  ok(res, result.execution);
}

export async function downloadSignedCopy(req: Request, res: Response): Promise<void> {
  const userId = uid(req);
  const willId = idOf(req, 'id');
  const file = await getSignedCopy(userId, willId);
  await writeAuditLog({
    userId, action: 'will_downloaded', resource: `Will:${willId}`, metadata: { kind: 'signed_copy', versionNo: file.versionNo }, req,
  });
  res.set(downloadHeaders(file.mimeType, file.fileName));
  res.setHeader('Cache-Control', 'no-store');
  res.send(file.buffer);
}
```

In `packages/api/src/routes/will.routes.ts`: change the rate-limit import to `import { costlyOperationLimiter, importLimiter } from '../middleware/rateLimit.js';`, add `import { uploadWillSignedCopy } from '../middleware/willUpload.js';`, and append after the `/versions/:vid/pdf` route:
```ts
// Step 9 (Part 2): signing record and signed copy of a generated will.
willRouter.get('/wills/:id/execution', asyncHandler(will.getExecution));
willRouter.post('/wills/:id/execution', importLimiter, uploadWillSignedCopy, asyncHandler(will.recordExecution));
willRouter.get('/wills/:id/signed-copy', asyncHandler(will.downloadSignedCopy));
```

- [ ] **Step 8: Run the tests to verify they pass**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/will/willExecute.db.test.ts test/routes/willExecute.routes.test.ts test/routes/will.routes.test.ts
npx tsc --noEmit
npx eslint src/services/will/willExecute.service.ts src/middleware/willUpload.ts src/controllers/will.controller.ts src/routes/will.routes.ts
```
Expected: PASS; no type or lint errors.

- [ ] **Step 9: Commit**

```bash
cd portfolioos
git add packages/api/src/services/will/willExecute.service.ts packages/api/src/middleware/willUpload.ts packages/api/src/controllers/will.controller.ts packages/api/src/routes/will.routes.ts packages/api/test/will/willExecuteFixtures.ts packages/api/test/will/willExecute.db.test.ts packages/api/test/routes/willExecute.routes.test.ts
git commit -m "feat(will): record signing and store the signed copy in the vault

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Review reminders - per-user alert sync, daily job, "reviewed", "circumstances changed"

**Wave 3** (parallel with Task 5; needs Tasks 1 and 2).

**Files:**
- Create: `packages/api/src/services/will/willReview.service.ts`
- Create: `packages/api/src/jobs/willReviewJob.ts`
- Modify: `packages/api/src/index.ts` (start the job)
- Modify: `packages/api/src/controllers/will.controller.ts` (handler `reviewed`; `createBody` + `reason`; `will_created` metadata)
- Modify: `packages/api/src/routes/will.routes.ts` (one route)
- Test: `packages/api/test/will/willReview.db.test.ts`, `packages/api/test/routes/willReview.routes.test.ts`

**Interfaces:**
- Consumes: Task 1 (`willNextReviewDate`, `WillReviewedWire`, `isoDay`, `dayOf`, `AlertType.WILL_REVIEW_DUE`, audit `will_reviewed`), Task 2 test helpers (`makeGeneratedWill`, `markExecuted`, `wipeWills`). Part 1: `loadOwnedWill`, `todayIst` (willStore), controller `createDraft`, `createBody`, `uid`, `idOf`, `parseOr422`. Repo: `runAsSystem`, `runAsUser`, `getCurrentUserId` (`lib/requestContext.ts`), `runInTransaction`, `deleteAlert(userId, alertId)` (`services/alerts.service.ts`), `formatDateOnly`, `node-cron`, `logger`.
- Produces:
  - `willReview.service.ts`: `WILL_REVIEW_ALERT_TYPE = 'WILL_REVIEW_DUE'`, `willReviewKey(willId, dueOn): string`, `dueWillReviewUserIds(today, only?: string[]): Promise<string[]>` (system context), `interface WillReviewSyncResult { created: number; resolved: number }`, `syncWillReviewAlerts(userId, today): Promise<WillReviewSyncResult>` (user context), `markWillReviewed(userId, willId, deps?: { today?: () => string }): Promise<WillReviewedWire>`.
  - `willReviewJob.ts`: `interface WillReviewRunOptions { today?: string; userIds?: string[]; sync?: (userId: string, today: string) => Promise<WillReviewSyncResult> }`, `interface WillReviewRunResult { users; created; resolved; failedUsers }`, `runWillReviewChecks(options?): Promise<WillReviewRunResult | null>` (null when a run is already in progress), `runWillReviewJob(): Promise<void>`, `startWillReviewJob(): void`.
  - HTTP: `POST /api/will/wills/:id/reviewed` -> `WillReviewedWire` (409 `WILL_NOT_EXECUTED`; audit `will_reviewed`); `POST /api/will/drafts` accepts `{ fromWillId, reason: 'CIRCUMSTANCES_CHANGED' }` (422 when `reason` comes without `fromWillId`), audited as `will_created` with `metadata.reason`.

- [ ] **Step 1: Write the failing service and job test**

Create `packages/api/test/will/willReview.db.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { getCurrentUserId, runAsSystem } from '../../src/lib/requestContext.js';
import { deleteAlert } from '../../src/services/alerts.service.js';
import {
  dueWillReviewUserIds, markWillReviewed, syncWillReviewAlerts, willReviewKey,
} from '../../src/services/will/willReview.service.js';
import { runWillReviewChecks } from '../../src/jobs/willReviewJob.js';
import { makeGeneratedWill, markExecuted, wipeWills } from './willExecuteFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const TODAY = '2026-10-12';
const reviewAlerts = (userId: string) =>
  runAsSystem(() => prisma.alert.findMany({ where: { userId, type: 'WILL_REVIEW_DUE' }, orderBy: { createdAt: 'asc' } }));
const willRow = (id: string) => runAsSystem(() => prisma.will.findUniqueOrThrow({ where: { id } }));

let a: TestScope;
let b: TestScope;
let c: TestScope;
let d: TestScope;

beforeAll(async () => {
  a = await createTestScope('will-review-a');
  b = await createTestScope('will-review-b');
  c = await createTestScope('will-review-c');
  d = await createTestScope('will-review-d');
});
afterAll(async () => {
  for (const s of [a, b, c, d]) {
    await wipeWills(s.userId);
    await s.cleanup();
  }
});

describe('review alerts for one user', () => {
  let willId = '';

  it('raises one alert when the review is due, and only once', async () => {
    ({ willId } = await makeGeneratedWill(a));
    await markExecuted(willId, '2024-10-01', '2026-10-01');
    expect(await a.runAs(() => syncWillReviewAlerts(a.userId, TODAY))).toEqual({ created: 1, resolved: 0 });
    const [alert] = await reviewAlerts(a.userId);
    expect(alert).toMatchObject({ title: 'Time to review your will', isActive: true });
    expect(alert?.triggerDate.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(alert?.metadata).toEqual({ key: willReviewKey(willId, '2026-10-01'), willId, version: 1, dueOn: '2026-10-01' });
    expect(alert?.description).toContain('01/10/2024');
    expect(alert?.description).not.toContain('Ramesh');
    expect(await a.runAs(() => syncWillReviewAlerts(a.userId, TODAY))).toEqual({ created: 0, resolved: 0 });
    expect(await reviewAlerts(a.userId)).toHaveLength(1);
  });

  it('marking it reviewed moves the date two years on and closes the reminder', async () => {
    const r = await a.runAs(() => markWillReviewed(a.userId, willId, { today: () => TODAY }));
    expect(r).toEqual({ nextReviewAt: '2028-10-12' });
    expect((await willRow(willId)).nextReviewAt?.toISOString().slice(0, 10)).toBe('2028-10-12');
    expect((await reviewAlerts(a.userId)).every((x) => !x.isActive)).toBe(true);
    expect(await a.runAs(() => syncWillReviewAlerts(a.userId, TODAY))).toEqual({ created: 0, resolved: 0 });
  });

  it('a dismissed reminder is not raised again', async () => {
    await markExecuted(willId, '2024-10-05', '2026-10-05');
    expect(await a.runAs(() => syncWillReviewAlerts(a.userId, TODAY))).toEqual({ created: 1, resolved: 0 });
    const open = (await reviewAlerts(a.userId)).find((x) => x.isActive);
    await a.runAs(() => deleteAlert(a.userId, open?.id ?? ''));
    expect(await a.runAs(() => syncWillReviewAlerts(a.userId, TODAY))).toEqual({ created: 0, resolved: 0 });
    expect((await reviewAlerts(a.userId)).filter((x) => x.isActive)).toHaveLength(0);
  });

  it('nothing while the review date is ahead', async () => {
    const { willId: id } = await makeGeneratedWill(b);
    await markExecuted(id, '2026-10-12', '2028-10-12');
    expect(await b.runAs(() => syncWillReviewAlerts(b.userId, TODAY))).toEqual({ created: 0, resolved: 0 });
  });

  it('closes the reminder of a replaced will', async () => {
    const { willId: id } = await makeGeneratedWill(b);
    await markExecuted(id, '2024-09-01', '2026-09-01');
    expect(await b.runAs(() => syncWillReviewAlerts(b.userId, TODAY))).toEqual({ created: 1, resolved: 0 });
    await makeGeneratedWill(b);
    expect(await b.runAs(() => syncWillReviewAlerts(b.userId, TODAY))).toEqual({ created: 0, resolved: 1 });
    expect((await reviewAlerts(b.userId)).every((x) => !x.isActive)).toBe(true);
  });

  it('only a signed will can be marked reviewed', async () => {
    const { willId: id } = await makeGeneratedWill(b);
    await expect(b.runAs(() => markWillReviewed(b.userId, id, { today: () => TODAY }))).rejects.toMatchObject({
      statusCode: 409, details: { reason: 'WILL_NOT_EXECUTED' },
    });
    await expect(a.runAs(() => markWillReviewed(a.userId, id, { today: () => TODAY }))).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('the daily job', () => {
  it('finds users with a due will or an open reminder', async () => {
    const { willId } = await makeGeneratedWill(c);
    await markExecuted(willId, '2024-01-01', '2026-01-01');
    const { willId: dId } = await makeGeneratedWill(d);
    await markExecuted(dId, '2024-02-01', '2026-02-01');
    // b's live will is only GENERATED and its old reminder is closed, so b is not listed.
    const ids = await runAsSystem(() => dueWillReviewUserIds(TODAY, [b.userId, c.userId, d.userId]));
    expect(ids).toEqual([c.userId, d.userId].sort());
  });

  it('runs each user in their own context; one failure does not stop the rest', async () => {
    const seen: Array<[string, string | null]> = [];
    const result = await runWillReviewChecks({
      today: TODAY,
      userIds: [c.userId, d.userId],
      sync: async (userId, today) => {
        seen.push([userId, getCurrentUserId()]);
        if (userId === c.userId) throw new Error('boom');
        return syncWillReviewAlerts(userId, today);
      },
    });
    expect(result).toEqual({ users: 2, created: 1, resolved: 0, failedUsers: 1 });
    expect(seen.every(([u, ctx]) => u === ctx)).toBe(true);
    expect(await reviewAlerts(d.userId)).toHaveLength(1);
    expect(await reviewAlerts(c.userId)).toHaveLength(0);
  });

  it('does not run twice at once', async () => {
    const opts = { today: TODAY, userIds: [c.userId] };
    const [x, y] = await Promise.all([runWillReviewChecks(opts), runWillReviewChecks(opts)]);
    expect([x, y].filter((r) => r === null)).toHaveLength(1);
    expect(await reviewAlerts(c.userId)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Write the failing route test**

Create `packages/api/test/routes/willReview.routes.test.ts`:
```ts
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { istCalendarDate, willNextReviewDate } from '@everypaisa/shared';
import { willRouter } from '../../src/routes/will.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { makeGeneratedWill, markExecuted, wipeWills } from '../will/willExecuteFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let user: TestScope;
let willId = '';

function call(method: string, path: string, body?: unknown) {
  const token = signAccessToken({ sub: user.userId, email: `${user.userId}@test.local`, role: 'INVESTOR', plan: 'PLUS' }).token;
  return fetch(`${base}/api/will${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeAll(async () => {
  user = await createTestScope('will-review-http');
  ({ willId } = await makeGeneratedWill(user));
  await markExecuted(willId, '2024-10-01', '2026-10-01');
  const app = express();
  app.use(express.json());
  app.use('/api/will', willRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  await wipeWills(user.userId);
  await user.cleanup();
});

describe('review and circumstances', () => {
  it('marks a signed will reviewed and audits it', async () => {
    const res = await call('POST', `/wills/${willId}/reviewed`, {});
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { nextReviewAt: string } };
    expect(json.data.nextReviewAt).toBe(willNextReviewDate(istCalendarDate(new Date())));
    const audit = await runAsSystem(() => prisma.auditLog.findFirst({ where: { userId: user.userId, action: 'will_reviewed' } }));
    expect(audit?.resource).toBe(`Will:${willId}`);
  });

  it('refuses a reason without a will to start from', async () => {
    expect((await call('POST', '/drafts', { reason: 'CIRCUMSTANCES_CHANGED' })).status).toBe(422);
  });

  it('"my circumstances changed" starts a new version and says why in the audit', async () => {
    const res = await call('POST', '/drafts', { fromWillId: willId, reason: 'CIRCUMSTANCES_CHANGED' });
    expect(res.status).toBe(201);
    const draft = (await res.json()) as { data: { id: string; version: number } };
    expect(draft.data.version).toBe(2);
    const audit = await runAsSystem(() =>
      prisma.auditLog.findFirst({ where: { userId: user.userId, action: 'will_created', resource: `Will:${draft.data.id}` } }),
    );
    expect(audit?.metadata).toMatchObject({ cloned: true, reason: 'CIRCUMSTANCES_CHANGED' });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/will/willReview.db.test.ts test/routes/willReview.routes.test.ts
```
Expected: FAIL - cannot resolve `willReview.service.js` / `willReviewJob.js`; `/wills/:id/reviewed` answers 404; `reason` is stripped so no 422.

- [ ] **Step 4: The review service**

Create `packages/api/src/services/will/willReview.service.ts`:
```ts
/**
 * Review reminders for signed wills (spec: every 2 years + manual). One alert
 * per will per due date. `dueWillReviewUserIds` reads across users and runs
 * under runAsSystem; everything else runs under runAsUser(userId), so RLS
 * confines it to that user's wills and alerts. Alert text holds a version
 * number and a date, never a name.
 */
import { formatDateOnly, willNextReviewDate, type WillReviewedWire } from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { ConflictError } from '../../lib/errors.js';
import { dayOf, isoDay, loadOwnedWill, todayIst } from './willStore.js';

export const WILL_REVIEW_ALERT_TYPE = 'WILL_REVIEW_DUE' as const;

export function willReviewKey(willId: string, dueOn: string): string {
  return `will_review:${willId}:${dueOn}`;
}

/** Users with a signed will due for review, plus users holding an open reminder that may need closing. */
export async function dueWillReviewUserIds(today: string, only?: string[]): Promise<string[]> {
  const scope = only ? { userId: { in: only } } : {};
  const [due, open] = await Promise.all([
    prisma.will.findMany({
      where: {
        ...scope,
        status: 'EXECUTED',
        nextReviewAt: { lte: dayOf(today) },
        user: { isActive: true, deletionScheduledFor: null },
      },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.alert.findMany({
      where: { ...scope, type: WILL_REVIEW_ALERT_TYPE, isActive: true },
      select: { userId: true },
      distinct: ['userId'],
    }),
  ]);
  return [...new Set([...due, ...open].map((r) => r.userId))].sort();
}

export interface WillReviewSyncResult {
  created: number;
  resolved: number;
}

/**
 * Raise the reminder for every due signed will that never had one for this due
 * date (a reminder the user dismissed counts: it is not raised again), and
 * close open reminders whose will is no longer due.
 */
export async function syncWillReviewAlerts(userId: string, today: string): Promise<WillReviewSyncResult> {
  const due = await prisma.will.findMany({
    where: { userId, status: 'EXECUTED', nextReviewAt: { lte: dayOf(today) } },
    select: { id: true, version: true, executedAt: true, nextReviewAt: true },
  });
  const keep = new Set<string>();
  let created = 0;
  for (const w of due) {
    if (!w.nextReviewAt) continue;
    const dueOn = isoDay(w.nextReviewAt);
    const key = willReviewKey(w.id, dueOn);
    keep.add(key);
    const existing = await prisma.alert.findFirst({
      where: { userId, type: WILL_REVIEW_ALERT_TYPE, metadata: { path: ['key'], equals: key } },
      select: { id: true },
    });
    if (existing) continue;
    const signed = w.executedAt ? ` was signed on ${formatDateOnly(isoDay(w.executedAt))}` : ' was signed';
    await prisma.alert.create({
      data: {
        userId,
        type: WILL_REVIEW_ALERT_TYPE,
        title: 'Time to review your will',
        description: `Version ${w.version}${signed}. Check it still fits your family and your assets.`,
        triggerDate: dayOf(dueOn),
        metadata: { key, willId: w.id, version: w.version, dueOn },
      },
    });
    created++;
  }
  const open = await prisma.alert.findMany({
    where: { userId, type: WILL_REVIEW_ALERT_TYPE, isActive: true },
    select: { id: true, metadata: true },
  });
  const stale = open
    .filter((x) => {
      const key = (x.metadata as { key?: unknown } | null)?.key;
      return typeof key !== 'string' || !keep.has(key);
    })
    .map((x) => x.id);
  if (stale.length > 0) {
    await prisma.alert.updateMany({ where: { id: { in: stale }, userId }, data: { isActive: false } });
  }
  return { created, resolved: stale.length };
}

/** "Reviewed - no changes": the next review is two years from today; any open reminder closes. */
export async function markWillReviewed(
  userId: string,
  willId: string,
  deps: { today?: () => string } = {},
): Promise<WillReviewedWire> {
  const today = (deps.today ?? todayIst)();
  const will = await loadOwnedWill(userId, willId);
  if (will.status !== 'EXECUTED') {
    throw new ConflictError('Only a signed will has review reminders.', { reason: 'WILL_NOT_EXECUTED' });
  }
  const nextReviewAt = willNextReviewDate(today);
  await runInTransaction(async (tx) => {
    const res = await tx.will.updateMany({
      where: { id: will.id, userId, status: 'EXECUTED' },
      data: { nextReviewAt: dayOf(nextReviewAt) },
    });
    if (res.count === 0) {
      throw new ConflictError('Only a signed will has review reminders.', { reason: 'WILL_NOT_EXECUTED' });
    }
    await tx.alert.updateMany({
      where: { userId, type: WILL_REVIEW_ALERT_TYPE, isActive: true, metadata: { path: ['willId'], equals: will.id } },
      data: { isActive: false },
    });
  });
  return { nextReviewAt };
}
```

- [ ] **Step 5: The daily job**

Create `packages/api/src/jobs/willReviewJob.ts`:
```ts
/**
 * Daily will review reminders (Will Maker part 2).
 *
 * Context: the user list is read once under runAsSystem (it spans users); each
 * user's wills and alerts are then handled under runAsUser(userId), so RLS
 * confines every step to that user. Deliberately NOT the alertJobs.ts pattern,
 * which runs its scanners with no RLS context at all. Single-flight: an
 * overlapping call returns null. Logs carry ids and error names only.
 */
import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { runAsSystem, runAsUser } from '../lib/requestContext.js';
import {
  dueWillReviewUserIds, syncWillReviewAlerts, type WillReviewSyncResult,
} from '../services/will/willReview.service.js';
import { todayIst } from '../services/will/willStore.js';

export interface WillReviewRunOptions {
  today?: string;
  /** Limit the run to these users (tests, manual re-runs). Default: every due user. */
  userIds?: string[];
  /** Per-user step; seam for tests. Default: syncWillReviewAlerts. */
  sync?: (userId: string, today: string) => Promise<WillReviewSyncResult>;
}

export interface WillReviewRunResult {
  users: number;
  created: number;
  resolved: number;
  failedUsers: number;
}

let running = false;

export async function runWillReviewChecks(options: WillReviewRunOptions = {}): Promise<WillReviewRunResult | null> {
  if (running) {
    logger.warn('[willReview] run already in progress - skipping');
    return null;
  }
  running = true;
  try {
    const today = options.today ?? todayIst();
    const userIds = await runAsSystem(() => dueWillReviewUserIds(today, options.userIds));
    const sync = options.sync ?? syncWillReviewAlerts;
    const result: WillReviewRunResult = { users: userIds.length, created: 0, resolved: 0, failedUsers: 0 };
    for (const userId of userIds) {
      try {
        const r = await runAsUser(userId, () => sync(userId, today));
        result.created += r.created;
        result.resolved += r.resolved;
      } catch (err) {
        // One user's failure must not cost everyone else their reminder; counted and logged.
        result.failedUsers++;
        logger.error({ userId, errName: err instanceof Error ? err.name : 'unknown' }, '[willReview] user skipped');
      }
    }
    return result;
  } finally {
    running = false;
  }
}

export async function runWillReviewJob(): Promise<void> {
  try {
    const result = await runWillReviewChecks();
    if (result) logger.info(result, '[willReview] daily run done');
  } catch (err) {
    logger.error({ errName: err instanceof Error ? err.name : 'unknown' }, '[willReview] daily run failed');
  }
}

export function startWillReviewJob(): void {
  if (process.env.ENABLE_ALERT_CRONS === 'false') return;
  cron.schedule('15 9 * * *', () => void runWillReviewJob(), { timezone: 'Asia/Kolkata' });
  logger.info('[willReview] scheduled daily at 09:15 IST');
}
```

In `packages/api/src/index.ts`: add `import { startWillReviewJob } from './jobs/willReviewJob.js';` directly after `import { startAlertJobs } from './jobs/alertJobs.js';`, and `startWillReviewJob();` directly after the `startAlertJobs();` call.

- [ ] **Step 6: Controller and route**

In `packages/api/src/controllers/will.controller.ts`:

(a) Add `import { markWillReviewed } from '../services/will/willReview.service.js';`.

(b) Replace
```ts
const createBody = z.object({ fromWillId: z.string().min(1).max(64).optional() });
```
with:
```ts
const createBody = z
  .object({
    fromWillId: z.string().min(1).max(64).optional(),
    /** Part 2: "My circumstances changed" - recorded in the audit trail. */
    reason: z.literal('CIRCUMSTANCES_CHANGED').optional(),
  })
  .refine((b) => b.reason === undefined || b.fromWillId !== undefined, { path: ['reason'], message: 'needs_fromWillId' });
```

(c) In `createDraft`, replace `metadata: { version: draft.version, cloned: Boolean(body.fromWillId) }, req,` with:
```ts
    metadata: { version: draft.version, cloned: Boolean(body.fromWillId), reason: body.reason ?? null }, req,
```

(d) Append:
```ts
export async function reviewed(req: Request, res: Response): Promise<void> {
  const userId = uid(req);
  const willId = idOf(req, 'id');
  const result = await markWillReviewed(userId, willId);
  await writeAuditLog({ userId, action: 'will_reviewed', resource: `Will:${willId}`, metadata: { nextReviewAt: result.nextReviewAt }, req });
  ok(res, result);
}
```

In `packages/api/src/routes/will.routes.ts`, after the `/wills/:id/signed-copy` route add:
```ts
willRouter.post('/wills/:id/reviewed', asyncHandler(will.reviewed));
```

- [ ] **Step 7: Run the tests to verify they pass**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/will/willReview.db.test.ts test/routes/willReview.routes.test.ts test/routes/will.routes.test.ts test/invariants/rls-context-coverage.test.ts
npx tsc --noEmit
npx eslint src/services/will/willReview.service.ts src/jobs/willReviewJob.ts src/controllers/will.controller.ts src/routes/will.routes.ts src/index.ts
```
Expected: PASS; no type or lint errors (`rls-context-coverage` is schema-based and stays green: no new model).

- [ ] **Step 8: Commit**

```bash
cd portfolioos
git add packages/api/src/services/will/willReview.service.ts packages/api/src/jobs/willReviewJob.ts packages/api/src/index.ts packages/api/src/controllers/will.controller.ts packages/api/src/routes/will.routes.ts packages/api/test/will/willReview.db.test.ts packages/api/test/routes/willReview.routes.test.ts
git commit -m "feat(will): two-year review reminders, reviewed action and circumstances-changed reason

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Web - step 9 page: signing guide, find a lawyer, signed-copy upload

**Wave 2** (parallel with Task 2; needs Task 1; uses Task 2's HTTP contract, mocked in tests).

**Files:**
- Modify: `apps/web/src/api/will.api.ts` (`execution`, `recordExecution`, `downloadSignedCopy`, `isWillNotExecutable`, `WillSignedCopyInput`)
- Create: `apps/web/src/pages/will/willStatusLabels.ts`
- Create: `apps/web/src/pages/will/execute/executeCopy.ts`
- Create: `apps/web/src/pages/will/execute/ExecutionGuide.tsx`
- Create: `apps/web/src/pages/will/execute/SignedCopyForm.tsx`
- Create: `apps/web/src/pages/will/execute/WillExecutePage.tsx`
- Modify: `apps/web/src/pages/will/willTestData.ts` (`executionWire` builder)
- Modify: `apps/web/src/App.tsx` (route `/will/:id/execute`)
- Modify: `apps/web/src/pages/will/steps/PreviewStep.tsx` ("Next: sign and store" link)
- Test: `apps/web/src/pages/will/execute/ExecutionGuide.test.tsx`, `apps/web/src/pages/will/execute/SignedCopyForm.test.tsx`, `apps/web/src/pages/will/execute/WillExecutePage.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`WillExecutionWire`, `WillStatusWire`, `WILL_SIGNED_COPY_MAX_MB`, `WILL_SIGNED_COPY_MIME_TYPES`, `normaliseWillName`). Part 1: `willApi` object and helpers in `will.api.ts` (`api`, `unwrap`, `decodeBlobError`, `errorDetails`, `BASE`, `draftPath`), `WillGate` (`pages/will/WillGuards.tsx`), `PageHeader`, ui `Card`/`Button`/`Badge`/`Input`/`Label`, `renderWithProviders` (`pages/split/testUtils.tsx`), `signIn`, `resetStores`, `TODAY` (`willTestData.ts`), `WILL_DISCLAIMER`, `formatDateOnly`, `istCalendarDate`, `apiErrorMessage`. Part 1's `PreviewStep.tsx` success card (`done: WillVersionWire`).
- Produces:
  - `will.api.ts`: `interface WillSignedCopyInput { executedOn: string; witnesses: [string, string]; file: File | null }`, `willApi.execution(willId): Promise<WillExecutionWire>`, `willApi.recordExecution(willId, input): Promise<WillExecutionWire>` (multipart fields `executedOn`, `witness1`, `witness2`, `file`), `willApi.downloadSignedCopy(willId, fileName): Promise<void>`, `isWillNotExecutable(err): boolean`, `willPath(id)` (module-local).
  - `WILL_STATUS_LABEL: Record<WillStatusWire, string>` (`willStatusLabels.ts`).
  - `WILL_SIGNING_STEPS`, `WILL_LAWYER_LINKS`, `NALSA_HELPLINE`, `WILL_BAR_COUNCIL_NOTE`, `WILL_WITNESS_BENEFICIARY_WARNING` (`executeCopy.ts`).
  - `ExecutionGuide`, `FindALawyer` components; `SignedCopyForm` component and `signedCopyProblems(input, ctx: { today; generatedOn; requireFile }): string[]`; `WillExecutePage` at `/will/:id/execute`.
  - Test builder `executionWire(p)` in `willTestData.ts`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/src/pages/will/willTestData.ts` (extend the `@everypaisa/shared` type import with `type WillExecutionWire`):
```ts
export function executionWire(p: Partial<WillExecutionWire> = {}): WillExecutionWire {
  return {
    willId: 'w1', version: 1, status: 'GENERATED', versionId: 'v1', generatedOn: TODAY, executedOn: null,
    witnesses: [], nextReviewAt: null, signedCopy: null, warnings: [], ...p,
  };
}
```

Create `apps/web/src/pages/will/execute/ExecutionGuide.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ExecutionGuide, FindALawyer } from './ExecutionGuide';

afterEach(cleanup);

describe('ExecutionGuide', () => {
  it('walks through printing, witnesses, signing, optional registration and storage', () => {
    render(<ExecutionGuide />);
    const text = document.body.textContent ?? '';
    expect(screen.getByText('How to sign your will in India')).toBeTruthy();
    expect(text).toMatch(/does not need stamp paper/i);
    expect(text).toMatch(/two adults/i);
    expect(text).toMatch(/not beneficiaries/i);
    expect(text).toMatch(/husband or wife/i);
    expect(text).toMatch(/Sub-Registrar/);
    expect(text).toMatch(/optional/i);
    expect(text).toMatch(/tell your executor/i);
  });
});

describe('FindALawyer', () => {
  it('links the verified free legal help and the Bar Council check', () => {
    render(<FindALawyer />);
    const tele = screen.getByRole('link', { name: /tele-law/i });
    expect(tele.getAttribute('href')).toBe('https://www.tele-law.in/');
    expect(tele.getAttribute('target')).toBe('_blank');
    expect(tele.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByRole('link', { name: /nalsa/i }).getAttribute('href')).toBe('https://nalsa.gov.in/');
    expect(screen.getByRole('link', { name: '15100' }).getAttribute('href')).toBe('tel:15100');
    const text = document.body.textContent ?? '';
    expect(text).toContain('Government of India, Department of Justice');
    expect(text).toContain('National Legal Services Authority');
    expect(text).toMatch(/free for eligible people/i);
    expect(text).toMatch(/citizens' mobile app/i);
    expect(text).toMatch(/apply online/i);
    expect(text).toMatch(/State Bar Council/);
  });
});
```

Create `apps/web/src/pages/will/execute/SignedCopyForm.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SignedCopyForm, signedCopyProblems } from './SignedCopyForm';

afterEach(cleanup);

const ctx = { today: '2026-10-20', generatedOn: '2026-10-12', requireFile: true };
const pdf = () => new File(['%PDF-1.7'], 'scan.pdf', { type: 'application/pdf' });

describe('signedCopyProblems', () => {
  it('passes a complete record', () => {
    expect(signedCopyProblems({ executedOn: '2026-10-15', witnesses: ['Asha Rao', 'Vikram Shah'], file: pdf() }, ctx)).toEqual([]);
  });

  it('names every problem', () => {
    expect(signedCopyProblems({ executedOn: '', witnesses: ['A', ''], file: null }, ctx)).toEqual([
      'Enter the date you signed.',
      'Enter the full name of both witnesses.',
      'Attach the signed copy.',
    ]);
    expect(signedCopyProblems({ executedOn: '2026-10-21', witnesses: ['Asha Rao', 'asha  RAO'], file: pdf() }, ctx)).toEqual([
      'The signing date cannot be in the future.',
      'Your two witnesses must be two different people.',
    ]);
    expect(signedCopyProblems({ executedOn: '2026-10-11', witnesses: ['Asha Rao', 'Vikram Shah'], file: pdf() }, ctx)).toEqual([
      'The signing date cannot be before the will was generated (12/10/2026).',
    ]);
  });

  it('accepts PDF and photos only, up to 20 MB, and no file when one is stored', () => {
    const gif = new File(['GIF89a'], 'scan.gif', { type: 'image/gif' });
    const heic = new File(['x'], 'scan.heic', { type: '' });
    const ok = { executedOn: '2026-10-15', witnesses: ['Asha Rao', 'Vikram Shah'] as [string, string] };
    expect(signedCopyProblems({ ...ok, file: gif }, ctx)).toEqual(['Upload the signed will as a PDF or a photo (JPEG, PNG or WebP).']);
    expect(signedCopyProblems({ ...ok, file: heic }, ctx)).toEqual(['Upload the signed will as a PDF or a photo (JPEG, PNG or WebP).']);
    const big = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'scan.pdf', { type: 'application/pdf' });
    expect(signedCopyProblems({ ...ok, file: big }, ctx)).toEqual(['The file is larger than 20 MB.']);
    expect(signedCopyProblems({ ...ok, file: null }, { ...ctx, requireFile: false })).toEqual([]);
  });
});

describe('SignedCopyForm', () => {
  it('submits trimmed values and the chosen file', () => {
    const onSubmit = vi.fn();
    render(<SignedCopyForm ctx={ctx} pending={false} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Date you signed'), { target: { value: '2026-10-15' } });
    fireEvent.change(screen.getByLabelText('Witness 1 - full name'), { target: { value: ' Asha Rao ' } });
    fireEvent.change(screen.getByLabelText('Witness 2 - full name'), { target: { value: 'Vikram Shah' } });
    const file = pdf();
    fireEvent.change(screen.getByLabelText(/^Signed copy/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Store signed copy' }));
    expect(onSubmit).toHaveBeenCalledWith({ executedOn: '2026-10-15', witnesses: ['Asha Rao', 'Vikram Shah'], file });
  });

  it('shows the problems and does not submit', () => {
    const onSubmit = vi.fn();
    render(<SignedCopyForm ctx={ctx} pending={false} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Store signed copy' }));
    expect(screen.getByRole('alert').textContent).toContain('Enter the date you signed.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('starts from the stored record when correcting it', () => {
    render(
      <SignedCopyForm
        ctx={{ ...ctx, requireFile: false }}
        initial={{ executedOn: '2026-10-15', witnesses: ['Asha Rao', 'Vikram Shah'] }}
        pending={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect((screen.getByLabelText('Witness 1 - full name') as HTMLInputElement).value).toBe('Asha Rao');
    expect(screen.getByText(/leave empty to keep the copy you stored/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });
});
```

Create `apps/web/src/pages/will/execute/WillExecutePage.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { renderWithProviders } from '@/pages/split/testUtils';
import { isWillNotExecutable, willApi } from '@/api/will.api';
import { WillExecutePage } from './WillExecutePage';
import { executionWire, resetStores, signIn } from '../willTestData';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/will.api', () => ({
  willApi: { execution: vi.fn(), recordExecution: vi.fn(), downloadPdf: vi.fn(), downloadSignedCopy: vi.fn() },
  isWillNotExecutable: vi.fn(() => false),
}));

const api = vi.mocked(willApi);
const render = () => renderWithProviders(<WillExecutePage />, { route: '/will/w1/execute', path: '/will/:id/execute' });

const executed = executionWire({
  status: 'EXECUTED', executedOn: '2026-10-12', witnesses: ['Asha Rao', 'Vikram Shah'], nextReviewAt: '2028-10-12',
  signedCopy: { fileName: 'will-v1-signed.pdf', mimeType: 'application/pdf', sizeBytes: 204800, uploadedAt: '2026-10-12T06:00:00.000Z' },
});

beforeEach(() => {
  vi.clearAllMocks();
  signIn('PLUS');
});
afterEach(() => {
  cleanup();
  resetStores();
});

describe('WillExecutePage', () => {
  it('shows the guide, the lawyer links and the PDF for a generated will', async () => {
    api.execution.mockResolvedValue(executionWire());
    api.downloadPdf.mockResolvedValue(undefined);
    render();
    expect(await screen.findByText('How to sign your will in India')).toBeTruthy();
    expect(screen.getByText('Generated')).toBeTruthy();
    expect(screen.getByRole('link', { name: /tele-law/i }).getAttribute('href')).toBe('https://www.tele-law.in/');
    expect(screen.getByRole('link', { name: /nalsa/i }).getAttribute('href')).toBe('https://nalsa.gov.in/');
    expect(api.execution).toHaveBeenCalledWith('w1');
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    await waitFor(() => expect(api.downloadPdf).toHaveBeenCalledWith('v1', 1));
  });

  it('stores the signed copy and then shows the record', async () => {
    api.execution.mockResolvedValue(executionWire());
    api.recordExecution.mockResolvedValue(executed);
    render();
    fireEvent.change(await screen.findByLabelText('Date you signed'), { target: { value: '2026-10-12' } });
    fireEvent.change(screen.getByLabelText('Witness 1 - full name'), { target: { value: 'Asha Rao' } });
    fireEvent.change(screen.getByLabelText('Witness 2 - full name'), { target: { value: 'Vikram Shah' } });
    const file = new File(['%PDF-1.7'], 'scan.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/^Signed copy/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Store signed copy' }));
    await waitFor(() =>
      expect(api.recordExecution).toHaveBeenCalledWith('w1', { executedOn: '2026-10-12', witnesses: ['Asha Rao', 'Vikram Shah'], file }),
    );
    expect(await screen.findByText(/signed on 12\/10\/2026/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Store signed copy' })).toBeNull();
  });

  it('shows a signed will with witnesses, review date and the stored copy', async () => {
    api.execution.mockResolvedValue(executed);
    api.downloadSignedCopy.mockResolvedValue(undefined);
    render();
    expect(await screen.findByText(/signed on 12\/10\/2026/i)).toBeTruthy();
    expect(document.body.textContent).toContain('Asha Rao and Vikram Shah');
    expect(document.body.textContent).toMatch(/next review 12\/10\/2028/i);
    expect(document.body.textContent).toContain('will-v1-signed.pdf');
    fireEvent.click(screen.getByRole('button', { name: /download signed copy/i }));
    await waitFor(() => expect(api.downloadSignedCopy).toHaveBeenCalledWith('w1', 'will-v1-signed.pdf'));
    fireEvent.click(screen.getByRole('button', { name: /replace the copy or fix details/i }));
    expect((screen.getByLabelText('Witness 2 - full name') as HTMLInputElement).value).toBe('Vikram Shah');
  });

  it('explains a witness who is also a beneficiary', async () => {
    api.execution.mockResolvedValue({ ...executed, warnings: ['WITNESS_IS_BENEFICIARY'] });
    render();
    expect(await screen.findByText(/a gift to a witness/i)).toBeTruthy();
  });

  it('a replaced will is read-only', async () => {
    api.execution.mockResolvedValue({ ...executed, status: 'SUPERSEDED', nextReviewAt: null });
    render();
    expect(await screen.findByText(/replaced by a newer version/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Store signed copy' })).toBeNull();
    expect(screen.queryByRole('button', { name: /replace the copy or fix details/i })).toBeNull();
    expect(screen.queryByText('How to sign your will in India')).toBeNull();
  });

  it('a draft or discarded will cannot be signed here', async () => {
    api.execution.mockRejectedValue(new Error('409'));
    vi.mocked(isWillNotExecutable).mockReturnValue(true);
    render();
    expect(await screen.findByText(/can't be signed and stored here/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /back to will maker/i }).getAttribute('href')).toBe('/will');
  });

  it('is locked on the Free plan and does not call the API', () => {
    signIn('FREE');
    render();
    expect(screen.getByText(/will maker is locked/i)).toBeTruthy();
    expect(api.execution).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/will/execute`
Expected: FAIL - cannot resolve `./ExecutionGuide`, `./SignedCopyForm`, `./WillExecutePage`.

- [ ] **Step 3: API client**

In `apps/web/src/api/will.api.ts`:

(a) Add `WillExecutionWire` to the `@everypaisa/shared` type import.

(b) After `const draftPath = ...` add:
```ts
const willPath = (id: string) => `${BASE}/wills/${encodeURIComponent(id)}`;

/** Step 9 form values. `file` may be null only when correcting a record that already has a copy. */
export interface WillSignedCopyInput {
  executedOn: string;
  witnesses: [string, string];
  file: File | null;
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
```

(c) Inside `willApi`, after `downloadPdf`, add:
```ts
  async execution(willId: string): Promise<WillExecutionWire> {
    const { data } = await api.get<ApiResponse<WillExecutionWire>>(`${willPath(willId)}/execution`);
    return unwrap(data);
  },
  async recordExecution(willId: string, input: WillSignedCopyInput): Promise<WillExecutionWire> {
    const fd = new FormData();
    fd.append('executedOn', input.executedOn);
    fd.append('witness1', input.witnesses[0]);
    fd.append('witness2', input.witnesses[1]);
    if (input.file) fd.append('file', input.file);
    const { data } = await api.post<ApiResponse<WillExecutionWire>>(`${willPath(willId)}/execution`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap(data);
  },
  async downloadSignedCopy(willId: string, fileName: string): Promise<void> {
    let res;
    try {
      res = await api.get(`${willPath(willId)}/signed-copy`, { responseType: 'blob' });
    } catch (err) {
      throw await decodeBlobError(err);
    }
    saveBlob(res.data as Blob, fileName);
  },
```

(d) After `isWillBlocked` add:
```ts
export function isWillNotExecutable(err: unknown): boolean {
  return errorDetails(err, 409)?.['reason'] === 'WILL_NOT_EXECUTABLE';
}
```

- [ ] **Step 4: Copy, labels, guide**

Create `apps/web/src/pages/will/willStatusLabels.ts`:
```ts
import type { WillStatusWire } from '@everypaisa/shared';

export const WILL_STATUS_LABEL: Record<WillStatusWire, string> = {
  DRAFT: 'Draft',
  GENERATED: 'Generated',
  EXECUTED: 'Executed',
  SUPERSEDED: 'Superseded',
  DISCARDED: 'Discarded',
};
```

Create `apps/web/src/pages/will/execute/executeCopy.ts`:
```ts
/**
 * Step 9 wording (Will Maker spec, "Parts" and step 9). The two links are the
 * verified official sites named in the spec; keep their wording in step with it.
 */
export const WILL_SIGNING_STEPS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: 'Print the will',
    body: 'Download the PDF and print every page on plain paper. A will does not need stamp paper.',
  },
  {
    title: 'Read it once more',
    body: 'Check the names, the shares and the executor. If anything is wrong, start a new version instead of writing on the printout.',
  },
  {
    title: 'Choose two witnesses',
    body: 'Two adults of sound mind who are not beneficiaries and are not the husband or wife of a beneficiary. A gift to a witness, or to a witness\'s husband or wife, can fail.',
  },
  {
    title: 'Sign in front of both witnesses',
    body: 'Sign at the end and initial every page while both witnesses watch. Then each witness signs in front of you and writes their name and address. Write the date and the place.',
  },
  {
    title: 'Register it with the Sub-Registrar (optional)',
    body: 'Registration under the Registration Act, 1908 is optional, but a registered will is harder to dispute. Take the original, your ID and both witnesses with their IDs to the Sub-Registrar for your area; the fee is small and varies by state.',
  },
  {
    title: 'Store it safely',
    body: 'Keep the original somewhere safe, tell your executor where it is, and store a scan below so you always have a copy.',
  },
];

export const WILL_LAWYER_LINKS: ReadonlyArray<{ name: string; by: string; url: string; body: string }> = [
  {
    name: 'Tele-Law',
    by: 'Government of India, Department of Justice',
    url: 'https://www.tele-law.in/',
    body: 'Legal advice from a panel lawyer by phone or video, including through the Tele-Law citizens\' mobile app. Free for eligible people; otherwise a small fee.',
  },
  {
    name: 'NALSA',
    by: 'National Legal Services Authority',
    url: 'https://nalsa.gov.in/',
    body: 'Free legal aid for people who qualify. Call the helpline or apply online for legal aid.',
  },
];

export const NALSA_HELPLINE = '15100';

export const WILL_BAR_COUNCIL_NOTE =
  'Choosing a private advocate? Ask for their enrolment number and check it with the State Bar Council of your state.';

export const WILL_WITNESS_BENEFICIARY_WARNING =
  'One of your witnesses has the same name as a beneficiary. Under Indian law a gift to a witness, or to a witness\'s husband or wife, can fail, although the rest of the will stands. Speak to a lawyer; you may want to sign again with two other witnesses.';
```

Create `apps/web/src/pages/will/execute/ExecutionGuide.tsx`:
```tsx
import { ExternalLink, Scale } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { NALSA_HELPLINE, WILL_BAR_COUNCIL_NOTE, WILL_LAWYER_LINKS, WILL_SIGNING_STEPS } from './executeCopy';

export function ExecutionGuide() {
  return (
    <Card className="space-y-3 p-4 sm:p-5">
      <h2 className="text-base font-semibold text-foreground">How to sign your will in India</h2>
      <ol className="space-y-3">
        {WILL_SIGNING_STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-foreground">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{s.title}</p>
              <p className="break-words text-sm text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function FindALawyer() {
  return (
    <Card tone="muted" className="space-y-3 p-4 text-sm">
      <h2 className="flex items-center gap-2 font-semibold text-foreground">
        <Scale className="h-4 w-4 text-primary" aria-hidden="true" />Find a lawyer
      </h2>
      <p className="text-muted-foreground">Have your will checked before you sign it. Free and low-cost help:</p>
      <ul className="space-y-3">
        {WILL_LAWYER_LINKS.map((l) => (
          <li key={l.url} className="min-w-0 space-y-0.5">
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
            >
              {l.name}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <p className="text-xs text-muted-foreground">{l.by}</p>
            <p className="break-words text-foreground">{l.body}</p>
          </li>
        ))}
      </ul>
      <p className="text-foreground">
        NALSA legal aid helpline:{' '}
        <a href={`tel:${NALSA_HELPLINE}`} className="font-medium text-primary">{NALSA_HELPLINE}</a>
      </p>
      <p className="break-words text-muted-foreground">{WILL_BAR_COUNCIL_NOTE}</p>
    </Card>
  );
}
```

- [ ] **Step 5: Form and page**

Create `apps/web/src/pages/will/execute/SignedCopyForm.tsx`:
```tsx
import { useId, useState, type FormEvent } from 'react';
import {
  formatDateOnly, normaliseWillName, WILL_SIGNED_COPY_MAX_MB, WILL_SIGNED_COPY_MIME_TYPES,
} from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { WillSignedCopyInput } from '@/api/will.api';

export interface SignedCopyContext {
  /** Today (IST), YYYY-MM-DD. */
  today: string;
  generatedOn: string;
  /** False once a copy is stored: the record can then be corrected without a new file. */
  requireFile: boolean;
}

/** The same rules the API enforces, said in words before anything is sent. */
export function signedCopyProblems(input: WillSignedCopyInput, ctx: SignedCopyContext): string[] {
  const out: string[] = [];
  if (!input.executedOn) out.push('Enter the date you signed.');
  else if (input.executedOn > ctx.today) out.push('The signing date cannot be in the future.');
  else if (input.executedOn < ctx.generatedOn) {
    out.push(`The signing date cannot be before the will was generated (${formatDateOnly(ctx.generatedOn)}).`);
  }
  const w1 = input.witnesses[0].trim();
  const w2 = input.witnesses[1].trim();
  if (w1.length < 2 || w2.length < 2) out.push('Enter the full name of both witnesses.');
  else if (normaliseWillName(w1) === normaliseWillName(w2)) out.push('Your two witnesses must be two different people.');
  if (!input.file) {
    if (ctx.requireFile) out.push('Attach the signed copy.');
  } else if (!(WILL_SIGNED_COPY_MIME_TYPES as readonly string[]).includes(input.file.type)) {
    out.push('Upload the signed will as a PDF or a photo (JPEG, PNG or WebP).');
  } else if (input.file.size > WILL_SIGNED_COPY_MAX_MB * 1024 * 1024) {
    out.push(`The file is larger than ${WILL_SIGNED_COPY_MAX_MB} MB.`);
  }
  return out;
}

export function SignedCopyForm({
  initial,
  ctx,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: { executedOn: string; witnesses: [string, string] };
  ctx: SignedCopyContext;
  pending: boolean;
  onSubmit: (input: WillSignedCopyInput) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const [executedOn, setExecutedOn] = useState(initial?.executedOn ?? '');
  const [w1, setW1] = useState(initial?.witnesses[0] ?? '');
  const [w2, setW2] = useState(initial?.witnesses[1] ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const input: WillSignedCopyInput = { executedOn, witnesses: [w1.trim(), w2.trim()], file };
    const found = signedCopyProblems(input, ctx);
    setProblems(found);
    if (found.length === 0) onSubmit(input);
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1 sm:col-span-2 sm:max-w-[240px]">
          <Label htmlFor={`${id}-date`}>Date you signed</Label>
          <Input id={`${id}-date`} type="date" max={ctx.today} value={executedOn} onChange={(e) => setExecutedOn(e.target.value)} />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`${id}-w1`}>Witness 1 - full name</Label>
          <Input id={`${id}-w1`} autoComplete="off" maxLength={120} value={w1} onChange={(e) => setW1(e.target.value)} />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`${id}-w2`}>Witness 2 - full name</Label>
          <Input id={`${id}-w2`} autoComplete="off" maxLength={120} value={w2} onChange={(e) => setW2(e.target.value)} />
        </div>
      </div>
      <div className="min-w-0 space-y-1">
        <Label htmlFor={`${id}-file`}>Signed copy (PDF or photo, up to {WILL_SIGNED_COPY_MAX_MB} MB)</Label>
        <Input
          id={`${id}-file`}
          type="file"
          accept={WILL_SIGNED_COPY_MIME_TYPES.join(',')}
          className="min-w-0"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {!ctx.requireFile && <p className="text-xs text-muted-foreground">Leave empty to keep the copy you stored.</p>}
      </div>
      {problems.length > 0 && (
        <ul role="alert" className="list-disc space-y-1 rounded-md bg-warning/10 p-3 pl-6 text-sm text-foreground">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Witness names are stored encrypted and shown only to you.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>Store signed copy</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}
```

Create `apps/web/src/pages/will/execute/WillExecutePage.tsx`:
```tsx
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Download, FileCheck2, Info } from 'lucide-react';
import { formatDateOnly, istCalendarDate, WILL_DISCLAIMER, type WillExecutionWire } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiErrorMessage } from '@/api/client';
import { isWillNotExecutable, willApi, type WillSignedCopyInput } from '@/api/will.api';
import { WillGate } from '../WillGuards';
import { WILL_STATUS_LABEL } from '../willStatusLabels';
import { ExecutionGuide, FindALawyer } from './ExecutionGuide';
import { SignedCopyForm } from './SignedCopyForm';
import { WILL_WITNESS_BENEFICIARY_WARNING } from './executeCopy';

export function WillExecutePage() {
  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        eyebrow="Will Maker"
        title="Sign and store your will"
        description="Step 9: sign your will the right way, then keep a copy of the signed will here."
      />
      <WillGate>
        <ExecuteBody />
      </WillGate>
    </div>
  );
}

function ExecuteBody() {
  const { id = '' } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const key = ['will', 'execution', id];
  const q = useQuery({ queryKey: key, queryFn: () => willApi.execution(id), retry: false });

  const record = useMutation({
    mutationFn: (input: WillSignedCopyInput) => willApi.recordExecution(id, input),
    onSuccess: (e) => {
      qc.setQueryData(key, e);
      void qc.invalidateQueries({ queryKey: ['will', 'overview'] });
      setEditing(false);
      toast.success('Your signed will is stored');
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't store the signed copy")),
  });
  const pdf = useMutation({
    mutationFn: (e: WillExecutionWire) => willApi.downloadPdf(e.versionId, e.version),
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't download the PDF")),
  });
  const signed = useMutation({
    mutationFn: (e: WillExecutionWire) => willApi.downloadSignedCopy(e.willId, e.signedCopy?.fileName ?? `will-v${e.version}-signed`),
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't download the signed copy")),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (q.isError || !q.data) {
    const blocked = isWillNotExecutable(q.error);
    return (
      <Card className="space-y-3 p-5 text-sm">
        <p className={blocked ? 'text-foreground' : 'text-negative'}>
          {blocked
            ? "This will can't be signed and stored here: it is still a draft or was discarded."
            : apiErrorMessage(q.error, "Couldn't load your will")}
        </p>
        <Button size="sm" variant="outline" asChild><Link to="/will">Back to Will Maker</Link></Button>
      </Card>
    );
  }

  const e = q.data;
  const live = e.status === 'GENERATED' || e.status === 'EXECUTED';
  const showForm = live && (e.executedOn === null || editing);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <Card className="space-y-2 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-foreground">Version {e.version}</h2>
            <Badge variant={e.status === 'EXECUTED' ? 'default' : 'secondary'}>{WILL_STATUS_LABEL[e.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Generated on {formatDateOnly(e.generatedOn)}</p>
          {e.status === 'SUPERSEDED' && (
            <p className="text-sm text-foreground">This version was replaced by a newer version. Its record is kept here as history.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={pdf.isPending} onClick={() => pdf.mutate(e)}>
              <Download className="mr-1 h-4 w-4" />Download PDF
            </Button>
            <Button size="sm" variant="ghost" asChild><Link to="/will">Back to Will Maker</Link></Button>
          </div>
        </Card>

        {live && <ExecutionGuide />}

        {e.warnings.includes('WITNESS_IS_BENEFICIARY') && (
          <Card className="flex gap-2 border-warning/40 bg-warning/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="break-words text-foreground">{WILL_WITNESS_BENEFICIARY_WARNING}</p>
          </Card>
        )}

        {e.executedOn && !editing && (
          <Card className="space-y-2 p-4 sm:p-5">
            <p className="flex items-center gap-2 text-base font-semibold text-foreground">
              <CheckCircle2 className="h-5 w-5 text-positive" aria-hidden="true" />Signed on {formatDateOnly(e.executedOn)}
            </p>
            <p className="break-words text-sm text-foreground">Witnesses: {e.witnesses.join(' and ')}</p>
            {e.nextReviewAt && (
              <p className="text-sm text-muted-foreground">Next review {formatDateOnly(e.nextReviewAt)}</p>
            )}
            {e.signedCopy && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 p-3 text-sm">
                <FileCheck2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 break-all text-foreground">{e.signedCopy.fileName}</span>
                <span className="text-muted-foreground">{Math.max(1, Math.round(e.signedCopy.sizeBytes / 1024))} KB</span>
                <Button size="sm" variant="outline" disabled={signed.isPending} onClick={() => signed.mutate(e)}>
                  <Download className="mr-1 h-4 w-4" />Download signed copy
                </Button>
              </div>
            )}
            {live && (
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Replace the copy or fix details</Button>
            )}
          </Card>
        )}

        {showForm && (
          <Card className="space-y-3 p-4 sm:p-5">
            <h2 className="text-base font-semibold text-foreground">
              {e.executedOn ? 'Update your signed will' : 'Store your signed will'}
            </h2>
            <p className="text-sm text-muted-foreground">
              After signing, scan or photograph every page into one PDF (or one clear photo) and add the date and both witnesses.
            </p>
            <SignedCopyForm
              initial={e.executedOn ? { executedOn: e.executedOn, witnesses: [e.witnesses[0] ?? '', e.witnesses[1] ?? ''] } : undefined}
              ctx={{ today: istCalendarDate(new Date()), generatedOn: e.generatedOn, requireFile: e.signedCopy === null }}
              pending={record.isPending}
              onSubmit={(input) => record.mutate(input)}
              onCancel={e.executedOn ? () => setEditing(false) : undefined}
            />
          </Card>
        )}
      </div>

      <div className="min-w-0 space-y-4">
        <FindALawyer />
        <Card tone="muted" className="flex gap-2 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-foreground">{WILL_DISCLAIMER}</p>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Route and the Preview step link**

In `apps/web/src/App.tsx`: add `import { WillExecutePage } from './pages/will/execute/WillExecutePage';` after the `WillOverviewPage` import, and `<Route path="/will/:id/execute" element={<WillExecutePage />} />` directly after `<Route path="/will" element={<WillOverviewPage />} />`.

In `apps/web/src/pages/will/steps/PreviewStep.tsx`, inside the `if (done) { ... }` card, replace
```tsx
          <Button variant="outline" asChild><Link to="/will">Back to Will Maker</Link></Button>
```
with:
```tsx
          <Button variant="outline" asChild>
            <Link to={`/will/${encodeURIComponent(done.willId)}/execute`}>Next: sign and store</Link>
          </Button>
          <Button variant="ghost" asChild><Link to="/will">Back to Will Maker</Link></Button>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run:
```bash
cd portfolioos/apps/web
npx vitest run src/pages/will
npx tsc --noEmit
npx eslint src/pages/will src/api/will.api.ts src/App.tsx
```
Expected: PASS (including Part 1's will tests); no type or lint errors.

- [ ] **Step 8: Commit**

```bash
cd portfolioos
git add apps/web/src/api/will.api.ts apps/web/src/pages/will/willStatusLabels.ts apps/web/src/pages/will/execute apps/web/src/pages/will/willTestData.ts apps/web/src/App.tsx apps/web/src/pages/will/steps/PreviewStep.tsx
git commit -m "feat(will): sign-and-store page with India signing guide and lawyer links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Web - overview status history, review banner, "My circumstances changed", review alerts

**Wave 3** (parallel with Task 3; needs Tasks 1 and 4; uses Task 3's HTTP contract, mocked in tests).

**Files:**
- Modify: `apps/web/src/api/will.api.ts` (`createDraft(fromWillId?, reason?)`, `markReviewed`)
- Create: `apps/web/src/pages/will/WillHistoryCard.tsx`
- Create: `apps/web/src/pages/will/WillReviewBanner.tsx`
- Modify: `apps/web/src/pages/will/WillOverviewPage.tsx`
- Modify: `apps/web/src/pages/will/willTestData.ts` (`historyEntry` builder)
- Modify: `apps/web/src/api/alerts.api.ts`, `apps/web/src/pages/alerts/AlertsPage.tsx`, `apps/web/src/pages/alerts/alertLinks.ts`, `apps/web/src/pages/dashboard/DashboardPage.tsx`
- Test: `apps/web/src/pages/will/WillOverviewPage.history.test.tsx`, `apps/web/src/pages/alerts/alertLinks.test.ts` (one case added)

**Interfaces:**
- Consumes: Task 1 (`WillHistoryEntryWire`, `WillReviewWire`, `WillReviewedWire`, `WillOverviewWire.history`, `.review`), Task 4 (`willPath`, `WILL_STATUS_LABEL`), Part 1 (`WillOverviewPage` internals: `OverviewBody`, mutations `create`, `discard`, `download`, `latest`, the "Versions" card, `VERSION_STATUS`; `willStepPath`, `willDraftExistsId`; builders `overview`, `draftWire`, `signIn`, `resetStores`, `TODAY`).
- Produces:
  - `willApi.createDraft(fromWillId?: string, reason?: 'CIRCUMSTANCES_CHANGED')` (sends `reason` only when given), `willApi.markReviewed(willId): Promise<WillReviewedWire>`.
  - `WillHistoryCard({ history, downloading, onDownload })`, `historyLine(h): string`; `WillReviewBanner({ review, busy, onReviewed, onChanged })`.
  - Overview: review banner when `review.due`; live-will block with "Sign and store" / "Signed copy" link, signed and next-review line (`data-testid="will-executed-line"`), "My circumstances changed" for an executed will; History card (`data-testid="will-history"`) replacing Part 1's Versions card.
  - Alerts: `AlertType` (web) + `'WILL_REVIEW_DUE'`, label "Will review", `alertLink('WILL_REVIEW_DUE', ...) === '/will'`, dashboard alert link `/will`.
  - Test builder `historyEntry(p)` in `willTestData.ts`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/src/pages/will/willTestData.ts` (extend the shared type import with `type WillHistoryEntryWire`):
```ts
export function historyEntry(p: Partial<WillHistoryEntryWire> & { willId: string; version: number }): WillHistoryEntryWire {
  return {
    status: 'GENERATED', createdOn: TODAY, generatedOn: TODAY, executedOn: null, nextReviewAt: null,
    supersededByVersion: null, versionId: null, hasSignedCopy: false, ...p,
  };
}
```

Create `apps/web/src/pages/will/WillOverviewPage.history.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import type { WillVersionWire } from '@everypaisa/shared';
import { renderWithProviders } from '@/pages/split/testUtils';
import { willApi } from '@/api/will.api';
import { WillOverviewPage } from './WillOverviewPage';
import { draftWire, historyEntry, overview, resetStores, signIn } from './willTestData';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/will.api', () => ({
  willApi: { overview: vi.fn(), createDraft: vi.fn(), discard: vi.fn(), downloadPdf: vi.fn(), markReviewed: vi.fn() },
  willDraftExistsId: vi.fn(() => null),
}));

const api = vi.mocked(willApi);
const render = () => renderWithProviders(<WillOverviewPage />, { route: '/will', path: '/will' });
const version = (p: Partial<WillVersionWire> & { id: string; willId: string; versionNo: number }): WillVersionWire => ({
  status: 'GENERATED', generatedOn: '2026-10-12', templateId: 'isa-hindu', templateVersion: 1, ...p,
});
const executedEntry = historyEntry({
  willId: 'w2', version: 2, status: 'EXECUTED', generatedOn: '2026-10-12', executedOn: '2026-10-20',
  nextReviewAt: '2028-10-20', versionId: 'v2', hasSignedCopy: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  signIn('PLUS');
});
afterEach(() => {
  cleanup();
  resetStores();
});

describe('WillOverviewPage - status and history', () => {
  it('lists every version with its status and dates', async () => {
    api.overview.mockResolvedValue(overview({
      status: 'EXECUTED',
      draft: { id: 'w3', version: 3, currentStep: 2, updatedAt: '2026-10-25T05:00:00.000Z' },
      versions: [version({ id: 'v2', willId: 'w2', versionNo: 2, status: 'EXECUTED' }), version({ id: 'v1', willId: 'w1', versionNo: 1, status: 'SUPERSEDED' })],
      history: [
        historyEntry({ willId: 'w3', version: 3, status: 'DRAFT', generatedOn: null }),
        executedEntry,
        historyEntry({
          willId: 'w1', version: 1, status: 'SUPERSEDED', generatedOn: '2025-01-05', executedOn: '2025-01-10',
          supersededByVersion: 2, versionId: 'v1', hasSignedCopy: true,
        }),
      ],
    }));
    api.downloadPdf.mockResolvedValue(undefined);
    render();
    const card = await screen.findByTestId('will-history');
    const text = card.textContent ?? '';
    expect(text).toContain('Version 3');
    expect(within(card).getByText('Draft')).toBeTruthy();
    expect(within(card).getByText('Executed')).toBeTruthy();
    expect(within(card).getByText('Superseded')).toBeTruthy();
    expect(text).toMatch(/signed 20\/10\/2026/);
    expect(text).toMatch(/next review 20\/10\/2028/);
    expect(text).toMatch(/replaced by version 2/);
    fireEvent.click(within(card).getByRole('button', { name: 'Download version 1 PDF' }));
    await waitFor(() => expect(api.downloadPdf).toHaveBeenCalledWith('v1', 1));
    expect(within(card).getAllByRole('link', { name: /signed copy/i }).map((a) => a.getAttribute('href'))).toEqual([
      '/will/w2/execute', '/will/w1/execute',
    ]);
  });

  it('a due review offers "reviewed" and "my circumstances changed"', async () => {
    api.overview.mockResolvedValue(overview({
      status: 'EXECUTED',
      versions: [version({ id: 'v2', willId: 'w2', versionNo: 2, status: 'EXECUTED' })],
      history: [{ ...executedEntry, nextReviewAt: '2026-10-01' }],
      review: { willId: 'w2', version: 2, nextReviewAt: '2026-10-01', due: true },
    }));
    api.markReviewed.mockResolvedValue({ nextReviewAt: '2028-10-12' });
    api.createDraft.mockResolvedValue(draftWire({ id: 'w3', version: 3 }));
    render();
    const banner = await screen.findByTestId('will-review-banner');
    expect(banner.textContent).toMatch(/time to review your will/i);
    expect(banner.textContent).toContain('01/10/2026');
    fireEvent.click(within(banner).getByRole('button', { name: 'Reviewed - no changes' }));
    await waitFor(() => expect(api.markReviewed).toHaveBeenCalledWith('w2'));
    // Both buttons are disabled while "reviewed" is in flight; wait until it settles (the banner may re-render).
    const changedButton = () =>
      within(screen.getByTestId('will-review-banner')).getByRole('button', { name: 'My circumstances changed' }) as HTMLButtonElement;
    await waitFor(() => expect(changedButton().disabled).toBe(false));
    fireEvent.click(changedButton());
    await waitFor(() => expect(api.createDraft).toHaveBeenCalledWith('w2', 'CIRCUMSTANCES_CHANGED'));
    expect(await screen.findByTestId('navigated')).toBeTruthy();
  });

  it('a generated will offers "Sign and store" and a new version', async () => {
    api.overview.mockResolvedValue(overview({
      status: 'GENERATED',
      versions: [version({ id: 'v1', willId: 'w1', versionNo: 1 })],
      history: [historyEntry({ willId: 'w1', version: 1, versionId: 'v1' })],
    }));
    render();
    expect((await screen.findByRole('link', { name: /sign and store/i })).getAttribute('href')).toBe('/will/w1/execute');
    expect(screen.getByRole('button', { name: /start a new version/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /my circumstances changed/i })).toBeNull();
    expect(screen.queryByTestId('will-review-banner')).toBeNull();
  });

  it('an executed will shows when it was signed and the next review', async () => {
    api.overview.mockResolvedValue(overview({
      status: 'EXECUTED',
      versions: [version({ id: 'v2', willId: 'w2', versionNo: 2, status: 'EXECUTED' })],
      history: [executedEntry],
      review: { willId: 'w2', version: 2, nextReviewAt: '2028-10-20', due: false },
    }));
    api.createDraft.mockResolvedValue(draftWire({ id: 'w3', version: 3 }));
    render();
    const line = await screen.findByTestId('will-executed-line');
    expect(line.textContent).toContain('Signed on 20/10/2026');
    expect(line.textContent).toContain('next review 20/10/2028');
    expect(screen.queryByTestId('will-review-banner')).toBeNull();
    expect(screen.queryByRole('button', { name: /start a new version/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'My circumstances changed' }));
    await waitFor(() => expect(api.createDraft).toHaveBeenCalledWith('w2', 'CIRCUMSTANCES_CHANGED'));
  });
});
```

In `apps/web/src/pages/alerts/alertLinks.test.ts`, add inside `describe('alertLink', ...)`:
```ts
  it('a will review reminder opens Will Maker and is a deadline, not news', () => {
    expect(alertLink('WILL_REVIEW_DUE', { key: 'k', willId: 'w1' })).toBe('/will');
    expect(isInformationalAlert('WILL_REVIEW_DUE')).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/will/WillOverviewPage.history.test.tsx src/pages/alerts/alertLinks.test.ts`
Expected: FAIL - no `will-history` test id; `alertLink('WILL_REVIEW_DUE')` returns null.

- [ ] **Step 3: API client**

In `apps/web/src/api/will.api.ts`: add `WillReviewedWire` to the shared type import; replace `createDraft` with:
```ts
  async createDraft(fromWillId?: string, reason?: 'CIRCUMSTANCES_CHANGED'): Promise<WillDraftWire> {
    const body = fromWillId ? { fromWillId, ...(reason ? { reason } : {}) } : {};
    const { data } = await api.post<ApiResponse<WillDraftWire>>(`${BASE}/drafts`, body);
    return unwrap(data);
  },
```
and after `downloadSignedCopy` add:
```ts
  async markReviewed(willId: string): Promise<WillReviewedWire> {
    const { data } = await api.post<ApiResponse<WillReviewedWire>>(`${willPath(willId)}/reviewed`, {});
    return unwrap(data);
  },
```

- [ ] **Step 4: History card and review banner**

Create `apps/web/src/pages/will/WillHistoryCard.tsx`:
```tsx
import { Link } from 'react-router-dom';
import { Download, FileCheck2 } from 'lucide-react';
import { formatDateOnly, type WillHistoryEntryWire } from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WILL_STATUS_LABEL } from './willStatusLabels';

/** "Started 12/10/2026 - generated 12/10/2026 - signed 20/10/2026 - next review 20/10/2028". */
export function historyLine(h: WillHistoryEntryWire): string {
  const parts = [`Started ${formatDateOnly(h.createdOn)}`];
  if (h.generatedOn) parts.push(`generated ${formatDateOnly(h.generatedOn)}`);
  if (h.executedOn) parts.push(`signed ${formatDateOnly(h.executedOn)}`);
  if (h.supersededByVersion !== null) parts.push(`replaced by version ${h.supersededByVersion}`);
  if (h.nextReviewAt) parts.push(`next review ${formatDateOnly(h.nextReviewAt)}`);
  return parts.join(' - ');
}

export function WillHistoryCard({
  history,
  downloading,
  onDownload,
}: {
  history: WillHistoryEntryWire[];
  downloading: boolean;
  onDownload: (h: WillHistoryEntryWire) => void;
}) {
  if (history.length === 0) return null;
  return (
    <Card className="space-y-2 p-4 sm:p-5" data-testid="will-history">
      <h2 className="text-base font-semibold text-foreground">History</h2>
      <ul className="divide-y divide-border/60">
        {history.map((h) => (
          <li key={h.willId} className="min-w-0 space-y-1.5 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">Version {h.version}</span>
              <Badge variant={h.status === 'EXECUTED' ? 'default' : 'secondary'}>{WILL_STATUS_LABEL[h.status]}</Badge>
            </div>
            <p className="break-words text-xs text-muted-foreground">{historyLine(h)}</p>
            {(h.versionId || h.hasSignedCopy) && (
              <div className="flex flex-wrap gap-2">
                {h.versionId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Download version ${h.version} PDF`}
                    disabled={downloading}
                    onClick={() => onDownload(h)}
                  >
                    <Download className="mr-1 h-4 w-4" />PDF
                  </Button>
                )}
                {h.hasSignedCopy && (
                  <Button size="sm" variant="ghost" asChild>
                    <Link to={`/will/${encodeURIComponent(h.willId)}/execute`}>
                      <FileCheck2 className="mr-1 h-4 w-4" />Signed copy
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

Create `apps/web/src/pages/will/WillReviewBanner.tsx`:
```tsx
import { CalendarClock } from 'lucide-react';
import { formatDateOnly, type WillReviewWire } from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function WillReviewBanner({
  review,
  busy,
  onReviewed,
  onChanged,
}: {
  review: WillReviewWire;
  busy: boolean;
  onReviewed: () => void;
  onChanged: () => void;
}) {
  return (
    <Card className="space-y-2 border-warning/40 bg-warning/10 p-4 sm:p-5" data-testid="will-review-banner">
      <p className="flex items-center gap-2 text-base font-semibold text-foreground">
        <CalendarClock className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />Time to review your will
      </p>
      <p className="text-sm text-foreground">
        Version {review.version} was due for a review on {formatDateOnly(review.nextReviewAt)}. Check your will every two
        years, and whenever your family or finances change - a marriage, a birth, a death, or buying or selling property.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={onReviewed}>Reviewed - no changes</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onChanged}>My circumstances changed</Button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 5: Overview page**

In `apps/web/src/pages/will/WillOverviewPage.tsx`:

(a) Imports: change `import { useNavigate } from 'react-router-dom';` to `import { Link, useNavigate } from 'react-router-dom';`; add `PenLine` to the `lucide-react` import; add `type WillHistoryEntryWire` to the `@everypaisa/shared` import; add
```tsx
import { WillHistoryCard } from './WillHistoryCard';
import { WillReviewBanner } from './WillReviewBanner';
```

(b) Delete the `VERSION_STATUS` constant (the History card uses `WILL_STATUS_LABEL`).

(c) In `OverviewBody`, after the `download` mutation add:
```tsx
  const changed = useMutation({
    mutationFn: (willId: string) => willApi.createDraft(willId, 'CIRCUMSTANCES_CHANGED'),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['will'] });
      navigate(willStepPath(d.id, d.currentStep));
    },
    onError: (err) => {
      const existing = willDraftExistsId(err);
      if (existing) {
        navigate(willStepPath(existing, 2));
        return;
      }
      toast.error(apiErrorMessage(err, "Couldn't start a new version"));
    },
  });
  const reviewed = useMutation({
    mutationFn: (willId: string) => willApi.markReviewed(willId),
    onSuccess: (r) => {
      toast.success(`Thanks. We'll remind you again on ${formatDateOnly(r.nextReviewAt)}.`);
      void qc.invalidateQueries({ queryKey: ['will'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't save your review")),
  });
  const downloadEntry = useMutation({
    mutationFn: (h: WillHistoryEntryWire) => willApi.downloadPdf(h.versionId ?? '', h.version),
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't download the PDF")),
  });
```

(d) After `const nominee = formatINR(o.estate.nomineeOnly);` add:
```tsx
  const liveEntry = latest ? o.history.find((h) => h.willId === latest.willId) ?? null : null;
  const executed = liveEntry?.status === 'EXECUTED';
```

(e) In the left column, directly before the first `<Card className="space-y-3 p-4 sm:p-5">` (the "Your will" card) add:
```tsx
        {o.review?.due && (
          <WillReviewBanner
            review={o.review}
            busy={reviewed.isPending || changed.isPending}
            onReviewed={() => reviewed.mutate(o.review!.willId)}
            onChanged={() => changed.mutate(o.review!.willId)}
          />
        )}
```

(f) Replace the whole `{latest && ( ... )}` block inside the "Your will" card with:
```tsx
          {latest && (
            <div className="space-y-2 rounded-md border border-border/60 p-3 text-sm">
              <p className="text-foreground">Version {latest.versionNo} generated on {formatDateOnly(latest.generatedOn)}</p>
              {executed && liveEntry?.executedOn && (
                <p className="text-muted-foreground" data-testid="will-executed-line">
                  Signed on {formatDateOnly(liveEntry.executedOn)}
                  {liveEntry.nextReviewAt ? ` - next review ${formatDateOnly(liveEntry.nextReviewAt)}` : ''}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={download.isPending} onClick={() => download.mutate(latest)}>
                  <Download className="mr-1 h-4 w-4" />Download PDF
                </Button>
                <Button size="sm" variant={executed ? 'outline' : 'default'} asChild>
                  <Link to={`/will/${encodeURIComponent(latest.willId)}/execute`}>
                    <PenLine className="mr-1 h-4 w-4" />{executed ? 'Signed copy' : 'Sign and store'}
                  </Link>
                </Button>
                {!o.draft && !executed && (
                  <Button size="sm" variant="outline" disabled={create.isPending} onClick={() => create.mutate(latest.willId)}>
                    Start a new version
                  </Button>
                )}
                {!o.draft && executed && (
                  <Button size="sm" variant="outline" disabled={changed.isPending} onClick={() => changed.mutate(latest.willId)}>
                    My circumstances changed
                  </Button>
                )}
              </div>
            </div>
          )}
```

(g) Replace the whole Part 1 "Versions" card block `{o.versions.length > 0 && ( <Card ...> ... Versions ... </Card> )}` with:
```tsx
        <WillHistoryCard history={o.history} downloading={downloadEntry.isPending} onDownload={(h) => downloadEntry.mutate(h)} />
```

- [ ] **Step 6: Alerts**

In `apps/web/src/api/alerts.api.ts`, change the end of the `AlertType` union from `| 'PRICE_TARGET' | 'LOAN_REFINANCE' | 'LOAN_BENCHMARK_CHANGE' | 'CUSTOM';` to `| 'PRICE_TARGET' | 'LOAN_REFINANCE' | 'LOAN_BENCHMARK_CHANGE' | 'WILL_REVIEW_DUE' | 'CUSTOM';`.

In `apps/web/src/pages/alerts/AlertsPage.tsx`: add `  WILL_REVIEW_DUE: 'Will review',` before `  CUSTOM: 'Custom',` in `TYPE_LABELS`, and `'WILL_REVIEW_DUE', ` before `'CUSTOM',` in `ALL_TYPES`.

In `apps/web/src/pages/alerts/alertLinks.ts`, replace the `alertLink` doc comment and function with:
```ts
/**
 * Where an alert opens: `/loans/<loanId>` for a loan-check alert (`/loans` when the id is missing), `/will`
 * for a will review reminder; null for every other type.
 */
export function alertLink(type: string, metadata: unknown): string | null {
  if (type === 'WILL_REVIEW_DUE') return '/will';
  if (!isInformationalAlert(type)) return null;
  const loanId = typeof metadata === 'object' && metadata !== null ? (metadata as { loanId?: unknown }).loanId : undefined;
  return typeof loanId === 'string' && loanId !== '' ? `/loans/${encodeURIComponent(loanId)}` : '/loans';
}
```

In `apps/web/src/pages/dashboard/DashboardPage.tsx`, in `alertHref`, add before `default:`:
```ts
    case 'WILL_REVIEW_DUE':
      return '/will';
```

- [ ] **Step 7: Run the tests to verify they pass**

Run:
```bash
cd portfolioos/apps/web
npx vitest run src/pages/will src/pages/alerts src/pages/dashboard
npx tsc --noEmit
npx eslint src/pages/will src/api/will.api.ts src/api/alerts.api.ts src/pages/alerts src/pages/dashboard/DashboardPage.tsx
```
Expected: PASS, including Part 1's `WillOverviewPage.test.tsx` (its generated-will case still finds "Download PDF" first and "Start a new version"); no type or lint errors.

- [ ] **Step 8: Commit**

```bash
cd portfolioos
git add apps/web/src/api/will.api.ts apps/web/src/pages/will/WillHistoryCard.tsx apps/web/src/pages/will/WillReviewBanner.tsx apps/web/src/pages/will/WillOverviewPage.tsx apps/web/src/pages/will/WillOverviewPage.history.test.tsx apps/web/src/pages/will/willTestData.ts apps/web/src/api/alerts.api.ts apps/web/src/pages/alerts/AlertsPage.tsx apps/web/src/pages/alerts/alertLinks.ts apps/web/src/pages/alerts/alertLinks.test.ts apps/web/src/pages/dashboard/DashboardPage.tsx
git commit -m "feat(will): will history, review banner and circumstances-changed on the overview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Sidebar - collapsible "Planning" group (Goals, Will Maker, Tax Planning)

**Wave 1** (parallel with Task 1; touches only `components/layout/*`).

**Files:**
- Modify: `apps/web/src/components/layout/navItems.tsx` (`PLANNING_ITEMS`; Goals and Will Maker out of `OVERVIEW_ITEMS`; Tax out of Tools)
- Create: `apps/web/src/components/layout/PlanningNavGroup.tsx`
- Modify: `apps/web/src/components/layout/SidebarNav.tsx` (render the group after Overview)
- Test: `apps/web/src/components/layout/navItems.test.ts`, `apps/web/src/components/layout/PlanningNavGroup.test.tsx`

**Interfaces:**
- Consumes: `NavItem`, `NavSection({ section, collapsed })`, `OVERVIEW_ITEMS`, `NAV_SECTIONS` (navItems.tsx; Part 1 added the `ScrollText` import and a temporary `{ label: 'Will Maker', to: '/will', icon: ScrollText }` after Goals in `OVERVIEW_ITEMS`), `SidebarNav({ collapsed, renderToggle?, scrollKey? })` (used by `Sidebar.tsx` and, with `collapsed={false}`, by `MobileNavDrawer.tsx`).
- Produces: `PLANNING_ITEMS: NavItem[]` (Goals `/goals`, Will Maker `/will`, Tax Planning `/tax`), `PLANNING_OPEN_KEY = 'sidebar_planning_open'`, `readPlanningOpen(): boolean`, `PlanningNavGroup({ collapsed }: { collapsed: boolean })`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/layout/navItems.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { NAV_SECTIONS, OVERVIEW_ITEMS, PLANNING_ITEMS } from './navItems';

describe('nav items', () => {
  it('Planning holds Goals, Will Maker and Tax Planning, in that order', () => {
    expect(PLANNING_ITEMS.map((i) => [i.label, i.to])).toEqual([
      ['Goals', '/goals'],
      ['Will Maker', '/will'],
      ['Tax Planning', '/tax'],
    ]);
  });

  it('each Planning page is linked once in the whole sidebar', () => {
    const elsewhere = [...OVERVIEW_ITEMS, ...NAV_SECTIONS.flatMap((s) => s.items)].map((i) => i.to);
    for (const item of PLANNING_ITEMS) expect(elsewhere).not.toContain(item.to);
  });
});
```

Create `apps/web/src/components/layout/PlanningNavGroup.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PLANNING_OPEN_KEY, PlanningNavGroup } from './PlanningNavGroup';

function renderGroup(collapsed = false, route = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <PlanningNavGroup collapsed={collapsed} />
    </MemoryRouter>,
  );
}

const hrefs = (root: ParentNode) => [...root.querySelectorAll('a')].map((a) => a.getAttribute('href'));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('PlanningNavGroup', () => {
  it('is open by default with Goals, Will Maker and Tax Planning', () => {
    const { container } = renderGroup();
    const header = screen.getByRole('button', { name: 'Planning' });
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(hrefs(container)).toEqual(['/goals', '/will', '/tax']);
    expect(screen.getByText('Tax Planning')).toBeTruthy();
  });

  it('collapses, remembers it, and opens again', () => {
    const first = renderGroup();
    fireEvent.click(screen.getByRole('button', { name: 'Planning' }));
    expect(hrefs(first.container)).toEqual([]);
    expect(localStorage.getItem(PLANNING_OPEN_KEY)).toBe('0');
    first.unmount();

    const second = renderGroup();
    expect(screen.getByRole('button', { name: 'Planning' }).getAttribute('aria-expanded')).toBe('false');
    expect(hrefs(second.container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Planning' }));
    expect(hrefs(second.container)).toEqual(['/goals', '/will', '/tax']);
    expect(localStorage.getItem(PLANNING_OPEN_KEY)).toBe('1');
  });

  it('while closed, marks the header when the current page is inside the group', () => {
    localStorage.setItem(PLANNING_OPEN_KEY, '0');
    renderGroup(false, '/will/w1/execute');
    expect(screen.queryByTestId('planning-active-dot')).toBeTruthy();
    cleanup();
    renderGroup(false, '/dashboard');
    expect(screen.queryByTestId('planning-active-dot')).toBeNull();
  });

  it('the icon rail shows the three items flat, with no header', () => {
    localStorage.setItem(PLANNING_OPEN_KEY, '0');
    const { container } = renderGroup(true);
    expect(screen.queryByRole('button', { name: 'Planning' })).toBeNull();
    expect(hrefs(container)).toEqual(['/goals', '/will', '/tax']);
    expect([...container.querySelectorAll('a')].map((a) => a.getAttribute('title'))).toEqual(['Goals', 'Will Maker', 'Tax Planning']);
  });

  it('works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { container } = renderGroup();
    expect(hrefs(container)).toEqual(['/goals', '/will', '/tax']);
    fireEvent.click(screen.getByRole('button', { name: 'Planning' }));
    expect(hrefs(container)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd portfolioos/apps/web && npx vitest run src/components/layout/navItems.test.ts src/components/layout/PlanningNavGroup.test.tsx`
Expected: FAIL - `PLANNING_ITEMS` is undefined; cannot resolve `./PlanningNavGroup`.

- [ ] **Step 3: Nav items**

In `apps/web/src/components/layout/navItems.tsx`:

(a) In `OVERVIEW_ITEMS`, delete the two lines
```tsx
  { label: 'Goals', to: '/goals', icon: Target },
  { label: 'Will Maker', to: '/will', icon: ScrollText },
```

(b) In the `Tools` section of `NAV_SECTIONS`, delete the line
```tsx
      { label: 'Tax', to: '/tax', icon: Calculator },
```

(c) After the closing `];` of `OVERVIEW_ITEMS` add:
```tsx
/**
 * Planning (Will Maker spec): forward-looking pages, grouped and collapsible in
 * the sidebar (PlanningNavGroup). Each page is linked here only.
 */
export const PLANNING_ITEMS: NavItem[] = [
  { label: 'Goals', to: '/goals', icon: Target },
  { label: 'Will Maker', to: '/will', icon: ScrollText },
  { label: 'Tax Planning', to: '/tax', icon: Calculator },
];
```
(`Target`, `ScrollText` and `Calculator` stay imported.)

- [ ] **Step 4: The group**

Create `apps/web/src/components/layout/PlanningNavGroup.tsx`:
```tsx
import { useState } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NavSection, PLANNING_ITEMS } from './navItems';

/**
 * The Planning group: Goals, Will Maker, Tax Planning. Open by default; the
 * open/closed choice is a per-browser convenience in localStorage, the same
 * way Sidebar.tsx keeps its collapsed state. Storage can be blocked (private
 * mode, policy), so every access is guarded and the group then simply starts
 * open and toggles for the session. On the icon rail there is no room for a
 * header, so the three icons are shown flat.
 */
export const PLANNING_OPEN_KEY = 'sidebar_planning_open';

export function readPlanningOpen(): boolean {
  try {
    return localStorage.getItem(PLANNING_OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

function writePlanningOpen(open: boolean): void {
  try {
    localStorage.setItem(PLANNING_OPEN_KEY, open ? '1' : '0');
  } catch {
    // Storage blocked: the choice lasts for this page view only, which is fine for a view preference.
  }
}

export function PlanningNavGroup({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(readPlanningOpen);
  const { pathname } = useLocation();

  if (collapsed) return <NavSection section={{ items: PLANNING_ITEMS }} collapsed />;

  const activeInside = PLANNING_ITEMS.some((i) => matchPath({ path: i.to, end: false }, pathname) !== null);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    writePlanningOpen(next);
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="nav-planning-items"
        className="group/plan mb-2 flex w-full items-center gap-2 rounded-md px-2 py-0.5 text-left focus-ring"
      >
        <span className="text-[10.5px] font-medium uppercase tracking-kerned text-sidebar-foreground/50 group-hover/plan:text-sidebar-foreground/80">
          Planning
        </span>
        {!open && activeInside && (
          <span aria-hidden="true" data-testid="planning-active-dot" className="h-1.5 w-1.5 rounded-full bg-accent" />
        )}
        <span aria-hidden="true" className="h-px flex-1 bg-sidebar-border/60" />
        <ChevronRight
          aria-hidden="true"
          className={cn('h-3.5 w-3.5 text-sidebar-foreground/50 transition-transform', open && 'rotate-90')}
        />
      </button>
      {open && (
        <div id="nav-planning-items">
          <NavSection section={{ items: PLANNING_ITEMS }} collapsed={false} />
        </div>
      )}
    </div>
  );
}
```

In `apps/web/src/components/layout/SidebarNav.tsx`: add `import { PlanningNavGroup } from './PlanningNavGroup';` after the `./navItems` import, and directly after
```tsx
        <NavSection section={{ heading: 'Overview', items: OVERVIEW_ITEMS }} collapsed={collapsed} />
```
add:
```tsx

        {/* Planning: Goals, Will Maker, Tax Planning. Collapsible here; flat icons on the rail. The mobile
            drawer renders this same component, so it gets the same group. */}
        {collapsed && <div className="mx-3 h-px bg-sidebar-border/50" />}
        <PlanningNavGroup collapsed={collapsed} />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
cd portfolioos/apps/web
npx vitest run src/components/layout
npx tsc --noEmit
npx eslint src/components/layout
```
Expected: PASS (including `AssetClassSectionList.test.tsx` and `ProtectedRoute.test.tsx`); no type or lint errors.

- [ ] **Step 6: Commit**

```bash
cd portfolioos
git add apps/web/src/components/layout/navItems.tsx apps/web/src/components/layout/navItems.test.ts apps/web/src/components/layout/PlanningNavGroup.tsx apps/web/src/components/layout/PlanningNavGroup.test.tsx apps/web/src/components/layout/SidebarNav.tsx
git commit -m "feat(nav): collapsible Planning group with Goals, Will Maker and Tax Planning

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Full verification and browser check

**Wave 4** (after everything).

**Files:**
- No new source files. A defect found here is fixed in the file that owns it, with a test that fails first, in its own commit.

- [ ] **Step 1: Every will and touched API suite in ONE vitest run**

Run:
```bash
cd portfolioos && pnpm --filter @everypaisa/shared build
cd packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/will test/routes/will.routes.test.ts test/routes/willGenerate.routes.test.ts test/routes/willExecute.routes.test.ts test/routes/willReview.routes.test.ts test/invariants/user-scoped-coverage.test.ts test/invariants/rls-context-coverage.test.ts test/invariants/rls-isolation.test.ts test/invariants/rls-delete-audit.test.ts test/invariants/loan-rate-check-columns.test.ts test/services/accountDeletion.test.ts src/controllers/document.onlyofficeCallback.test.ts
npx tsc --noEmit && npx tsc -p tsconfig.scripts.json --noEmit
npx eslint src/services/will src/jobs/willReviewJob.ts src/middleware/willUpload.ts src/controllers/will.controller.ts src/routes/will.routes.ts src/lib/audit.ts src/index.ts
```
Expected: all PASS in the single run (no cross-file leaks; Part 1's suites under `test/will` included); no type errors; no lint errors in the listed files (pre-existing warnings on untouched lines are not this plan's).

- [ ] **Step 2: Shared and web**

Run:
```bash
cd portfolioos/packages/shared && npx vitest run && npx tsc --noEmit
cd ../../apps/web
npx vitest run
npx tsc --noEmit
npx eslint src/pages/will src/api/will.api.ts src/api/alerts.api.ts src/pages/alerts src/components/layout src/pages/dashboard/DashboardPage.tsx src/App.tsx
```
Expected: all PASS (the whole web suite once); no type or lint errors.

- [ ] **Step 3: Encoding and dash check on every file Part 2 changed**

Run (the local tag `will-part2-base` was set before Task 1, see Execution notes):
```bash
cd portfolioos
for f in $(git diff --name-only --diff-filter=d will-part2-base...HEAD -- .); do iconv -f UTF-8 -t UTF-8 "$f" >/dev/null || echo "BAD $f"; done
git diff will-part2-base...HEAD -- '*.ts' '*.tsx' '*.sql' | grep -nP '^\+.*[\x{2013}\x{2014}\x{2212}]' || echo "no en/em dashes or minus signs added"
```
Expected: no `BAD` lines; the second command prints `no en/em dashes or minus signs added`.

- [ ] **Step 4: Start the servers (note every PID you start)**

The account `loancheck-final@example.com` is on PLUS from Part 1's Task 13 (if not, re-run that task's Step 4 script against `portfolioos_split` only). Then:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split PORT=3020 RIA_VERDICTS_ENABLED=false ENABLE_LOAN_RATES_CRON=false ENABLE_STARTUP_SYNC=false ENABLE_ALERT_CRONS=false ENABLE_MAILBOX_POLLER=false ENABLE_PRICE_CRONS=false ENABLE_MF_BOOTSTRAP=false npx tsx src/index.ts
```
(run in the background), and in `portfolioos/apps/web`: `npx vite --port 3030` (background; it proxies `/api` to `:3020`). Open `http://localhost:3030`, sign in as `loancheck-final@example.com` / `LoanCheck#2026`.

- [ ] **Step 5: Walk step 9 (1280 px, light theme)**

1. Sidebar: Overview no longer lists Goals or Will Maker; Tools no longer lists Tax; a "Planning" header sits under Overview with Goals, Will Maker, Tax Planning. Click the header: the group closes; reload: still closed; open `/will` while closed: the header shows the accent dot; open it again. Collapse the whole sidebar to the icon rail: the three Planning icons show flat with tooltips.
2. `/will`: if there is no generated will, generate one through the wizard (Part 1 flow). The preview's success card shows "Next: sign and store"; follow it.
3. `/will/<id>/execute`: status "Generated", "Download PDF" works, the six signing steps, "Find a lawyer" with Tele-Law and NALSA opening `https://www.tele-law.in/` and `https://nalsa.gov.in/` in a new tab, the 15100 helpline, the State Bar Council note, and the disclaimer.
4. Form: click "Store signed copy" empty: the problems list shows. Enter a future date: refused. Enter the same witness twice: refused. Pick a `.gif`: refused. Then today's date, two different names, and any real PDF: stored; the record shows "Signed on dd/mm/yyyy", both witnesses, "Next review" two years on, the file name `will-v<N>-signed.pdf` and its size; "Download signed copy" returns the same file.
5. "Replace the copy or fix details": change a witness name only (no file): saved, the copy is kept. Then replace with a JPEG photo: the record shows `.jpg`. In the Documents vault the old PDF copy is gone, the new photo and the will PDF are listed, and renaming or deleting either there is refused.
6. Enter a beneficiary's name as a witness (as written in the will): the warning about gifts to witnesses appears; set it back.
7. `/will`: status "Executed", "Signed on ... - next review ...", "Signed copy" link, "My circumstances changed"; the History card lists the version with status Executed, its dates and PDF/Signed copy actions.
8. Review reminder: make the review due on the isolated DB and run the job once:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split npx tsx -e "import('@prisma/client').then(async ({ PrismaClient }) => { const p = new PrismaClient(); const u = await p.user.findUniqueOrThrow({ where: { email: 'loancheck-final@example.com' } }); const r = await p.will.updateMany({ where: { userId: u.id, status: 'EXECUTED' }, data: { nextReviewAt: new Date(Date.now() - 86400000) } }); console.log('updated', r.count); await p.\$disconnect(); })"
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx tsx -e "import('./src/jobs/willReviewJob.ts').then(async (m) => { console.log(await m.runWillReviewChecks()); process.exit(0); })"
```
Expected: `updated 1`, then a result with `created: 1`. Run the job command again: `created: 0`. `/alerts` shows "Time to review your will" labelled "Will review", in the Overdue band, and opens `/will`. `/will` shows the review banner. "Reviewed - no changes": toast with a date two years from today; the banner goes; run the job again: the alert is gone from the active list.
9. Make it due again (first command above), reload `/will`, and use "My circumstances changed" in the banner: a new draft (next version) opens at step 2 with the old content. Go back to `/will` and discard that draft.
10. Free plan: set the account to FREE (Part 1 Task 13 Step 4 script with `plan: 'FREE'`), sign out and in: `/will/<id>/execute` shows "Will Maker is locked" and makes no will request; the Planning group is still in the sidebar. Set it back to PLUS and sign in again.

- [ ] **Step 6: 375 px, both themes, and the mobile drawer**

At 375 px in light and dark: `/will` (with the review banner and History card) and `/will/<id>/execute` (guide, lawyer card, form, record card) have no sideways page scroll - check `document.documentElement.scrollWidth <= window.innerWidth` on each - and long file names and links wrap. Open the mobile "More" drawer: the Planning header is there, collapses and expands, its links navigate and close the drawer like the others. Screenshot every section of both pages, scrolling the full page, at 375 px (light and dark) and at 1280 px, plus the sidebar open/closed/rail; save them under `.superpowers/sdd/will-maker-part2/screens/`.

- [ ] **Step 7: Audit trail and logs hold no witness names**

```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split npx tsx -e "import('@prisma/client').then(async ({ PrismaClient }) => { const p = new PrismaClient(); const u = await p.user.findUniqueOrThrow({ where: { email: 'loancheck-final@example.com' } }); const rows = await p.auditLog.findMany({ where: { userId: u.id, action: { in: ['will_execute_upload', 'will_reviewed', 'will_downloaded', 'will_created'] } }, orderBy: { createdAt: 'asc' } }); console.log(JSON.stringify(rows.map((r) => [r.action, r.resource, r.metadata]))); await p.\$disconnect(); })"
```
Expected: `will_execute_upload` rows (versions, flags, mime types, sizes, warnings), `will_downloaded` with `kind: 'signed_copy'`, `will_reviewed`, `will_created` with `reason: 'CIRCUMSTANCES_CHANGED'`; no witness name, testator name or file name anywhere. Search the API server's console output from this session for the witness names you typed: none.

- [ ] **Step 8: Stop the servers and commit any fixes**

Stop only the PIDs you started in Step 4. Commit each fix found during this task separately (with its test, trailer as usual). If nothing needed fixing, there is nothing to commit.

---

## Spec conflicts and notes for the reviewer

- **Witness names are not in the will payload or the version** (Ruling 1). The design says "seal them in the payload or the version"; the payload is cloned into every new draft and hashed into `WillVersion.inputHash`, and `WillVersion` is immutable, so a separate sealed column on `Will` is the only place that is both sealed and per-signing.
- **Beneficiary-witness is a warning, not a block** (Ruling 4). The spec's guide says witnesses must not be beneficiaries; the upload records a signing that already happened, so the app records it and explains the consequence instead of refusing reality. Testator-as-witness and duplicate witnesses are refused.
- **"Tax" moves out of Tools** and becomes "Tax Planning" in the Planning group (Ruling 10), so the same page is not linked twice.
- **Part 1's "Versions" card is replaced** by the History card, and its "Replaced" label becomes "Superseded" to match the spec's status names (Ruling 9).
- **Reminders ignore the plan** (Ruling 7): a downgraded user still gets the review alert; the signed copy stays downloadable from the Documents vault.
- **Concurrency of the job** is single-flight per process; with several API instances two runs could race on the same day and create a duplicate reminder (no unique index on alert metadata, as with every other alert scanner in the repo). Acceptable for one instance; note for scaling.
- **Legacy branch overlap.** `feat/legacy-transfer` may also touch `AuditAction` (`lib/audit.ts`), `AlertType` (schema + `shared/types/enums.ts` + web alert labels), `navItems.tsx`, `SidebarNav.tsx`, `App.tsx` and `index.ts`. Expect small textual conflicts there; keep both sides. Migration order is safe (`20261013120000` < `20261014110000` < `20261014120000` < `20261014130000`).
- **Production migration** is a separate, owner-approved step after merge (with `DIRECT_URL` overridden too). It adds an enum value, two nullable columns and an index: no data change.
