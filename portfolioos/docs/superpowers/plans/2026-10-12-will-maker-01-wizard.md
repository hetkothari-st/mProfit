# Will Maker - Part 1 (wizard steps 1-8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A paid (PLUS) Will Maker that takes the user from an overview through details, people and roles, an auto-fetched estate list, inheritance allocation, instructions, live validation and a preview, to a generated, sealed, downloadable "LAST WILL AND TESTAMENT" PDF under Indian law.

**Architecture:** One `Will` row per draft or generated will, with every personal detail inside a single JSON payload sealed with the user's data key (`lib/userKeys`, slot `will:<id>`); plain columns hold only status, numbering, revision and dates. The payload schema, validation rules and the legal template live in `packages/shared/src/will/` so the web wizard and the API judge and render the same model. The API adds `/api/will` (draft CRUD with optimistic revisions, an estate itemiser built from per-source adapters, preview, generate) and stores each generated PDF as a `Document` of owner type `WILL` plus an immutable `WillVersion` row. The web adds `/will` (overview) and `/will/:id/:step` (wizard) with server-side autosave.

**Tech Stack:** TypeScript, zod 3, decimal.js, Prisma 5 + PostgreSQL (RLS, FORCE, owner policies), Express, pdfkit with bundled Noto Sans / Noto Sans Devanagari, vitest, React 18 + @tanstack/react-query + react-router 6 + recharts + the repo's shadcn-style ui.

**Spec:** `portfolioos/docs/superpowers/specs/2026-10-12-will-maker-design.md` (requirements + the approved hybrid design, merged). This plan is Part 1 = wizard steps 1-8. Part 2 (step 9 execute and store, reminders, Planning sidebar group) is a separate plan.

## Global Constraints

- Names: models `Will`, `WillVersion`, enum `WillStatus`; routes `/api/will`; web routes `/will`, `/will/:id/:step`; folders `packages/api/src/services/will/`, `apps/web/src/pages/will/`, `packages/shared/src/will/`; audit actions `will_created`, `will_viewed`, `will_generated`, `will_downloaded`, `will_discarded`; entitlement `WILL_MAKER: 'PLUS'`. Never reuse any `Legacy*` name, `/legacy`, `/api/legacy*` (parallel branch `feat/legacy-transfer`).
- Migrations: `20261014110000_will_document_owner` (enum value only) and `20261014120000_will_maker`. Both later than `20261013120000` (Legacy). SQL is hand-written; `prisma migrate diff` output is a cross-check only and is hand-trimmed if it shows unrelated drift.
- Apply migrations ONLY to the isolated local DB, from `portfolioos/packages/api`, with both overrides: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split`. Never use `packages/api/.env` for migrations. No production migration in this plan.
- API tests run with `DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false`. Never `vi.spyOn` the shared Prisma client; use the injectable seams named in each task (`collect`, `today`, `renderPdf`, adapter lists, hook `api`).
- The API consumes `@everypaisa/shared` from `dist`: run `pnpm --filter @everypaisa/shared build` after any task that changes `packages/shared` (Tasks 1, 3, 4, 5) before running API tests or typecheck. The web aliases shared to `src` and needs no build.
- Personal data: the payload (names, DOBs, addresses, relationships, asset labels) is sealed at rest and never logged. Logs carry ids, counts and error names only. Error responses carry `{ path, code }` issue lists, rule ids and fixed messages - never submitted values.
- Money is `Decimal` (import `Decimal` from `@everypaisa/shared` in new code) and decimal strings on the wire: item values and gift amounts with at most 2 decimals (`"250000.00"`), estate totals via `serializeMoney`. Percentages are decimal strings with at most 2 decimals, compared exactly (`sum.equals(100)`). Never `Number`/`parseFloat` on money or shares (a chart may convert a percentage with `Decimal#toNumber()` for drawing only).
- Dates: ISO `YYYY-MM-DD` in payloads and on the wire; displayed as dd/mm/yyyy via `formatDateOnly` (date-only) or `formatDateIST` (timestamps). "Today" is the Indian calendar date `istCalendarDate(new Date())`.
- Code strings use plain `-` (no en/em dash, no Unicode minus). `₹` is allowed (Noto Sans has the glyph).
- Web: tests use `// @vitest-environment jsdom`, `afterEach(cleanup)`, plain assertions (no jest-dom). Colours only through theme tokens (`text-foreground`, `text-muted-foreground`, `bg-card`, `bg-muted`, `border-border`, `text-positive`, `text-negative`, `text-warning`, `bg-warning/10`, `text-primary`). At 375 px no page scrolls sideways; layouts switch by container width via `useElementWidth` from `apps/web/src/pages/emi/useElementWidth.ts` (imported, not copied).
- Gating: API `requireFeature('WILL_MAKER')` and refuse `X-Act-As` (403); web wraps pages in `LockedFeature` (compact) and shows an "own account only" card while managing a family profile. Own profile only in v1.
- Disclaimer ("not legal advice; passing checks does not guarantee validity; get it reviewed by a qualified advocate") appears on the overview, the review step, every PDF page footer, and the generate confirmation (explicit acknowledgement checkbox; the acknowledgement is audited).
- Commits: Conventional Commits, one logical change each, ending with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push. Check every changed text file with `iconv -f UTF-8 -t UTF-8 <file> >/dev/null`.

## Rulings made while writing this plan

1. **Steps.** Step 1 is the Overview page (`/will`); the wizard covers steps 2-8 (`details`, `people`, `estate`, `allocation`, `instructions`, `review`, `preview`). `Will.currentStep` defaults to `2` (the design said 1; step 1 is not a draft step).
2. **One `WillVersion` per `Will`.** A generated will is frozen. Changing it means "Start a new version" (`POST /drafts { fromWillId }` clones the payload into a new draft with `version = max + 1`). `WillVersion.versionNo` equals `Will.version`, so "Version 3" means the same thing everywhere. Generating supersedes every earlier GENERATED/EXECUTED will (`SUPERSEDED`, `supersededById`).
3. **People section.** The People step saves people and roles together: section key `people` carries `{ people, roles }`. The back-up ("contingent") beneficiary is stored on the person (`person.contingentId`) and applies wherever that person benefits; the residuary entry has no separate contingent.
4. **`ref` instead of `maskedRef`.** The identifier printed in the will: bank, card, loan, PF and policy numbers are masked `XXXX1234` (the app never holds more than the last 4 in clear for these); vehicles use the full registration plate (`plateOf`) because a will must identify the vehicle. It is inside the sealed payload.
5. **Holdings granularity.** One estate item per (portfolio, asset class), e.g. "Equity - My Portfolio". Specific gifts can name such a group. Per-security items are out of scope.
6. **Estate scope and parity.** Holdings from portfolios the user owns (`Portfolio.userId`), excluding PF-backed holdings (`assetKey` of a `ProvidentFundAccount`, which the PF adapter reports instead). Bank accounts (not CLOSED) and owned property (not SOLD, active) are included although the dashboard omits them. Rental properties are skipped when a non-SOLD owned property links them. Insurance: life-type policies only (TERM, WHOLE_LIFE, ULIP, ENDOWMENT, PERSONAL_ACCIDENT), `NOMINEE_ONLY`, excluded from totals. Credit cards with no balance are skipped. Parity with `getDashboardNetWorth` is tested on the overlapping classes (holdings, vehicles, rental, loans given, loans, cards) for a fixture with active, unlinked, current-valued rows; differences by design are listed in Task 6.
7. **Default review state.** Candidates arrive CONFIRMED when ownership is clear and a value exists; NEEDS_REVIEW for joint, HUF, missing values and rental (ownership unrecorded); EXCLUDED for company-owned property. `ITEMS_NEED_REVIEW` is a warning, not a blocker.
8. **Reconcile.** Refresh keeps CONFIRMED/EXCLUDED states; keeps value and ownership of items the user edited (`userEdited`); marks vanished auto items STALE (kept so gifts that name them stay valid); a STALE item that reappears takes the candidate's state; manual items (`sourceKey` prefix `manual:`) are never touched. Values of auto items can't be edited in the UI; ownership can (sets `userEdited`).
9. **Extra rules.** Besides the design's list: `DANGLING_REFERENCE` (BLOCKER, a role/gift/contingent naming a removed person) and `ESTATE_SOURCE_FAILED` (WARNING, an adapter failed during refresh; recorded in `estate.failedSources`). `ESTATE_STALE` also fires when the estate was never fetched. `UNALLOCATED_ASSETS` fires only while the residuary split is empty (a residuary clause always catches everything else). `RESIDUARY_SUMS_100` is required even when specific gifts cover everything.
10. **Survivorship.** The template requires beneficiaries to survive the testator by 30 days; a failed gift goes to the named back-up, else into the residue; a failed residuary share is shared among the other residuary beneficiaries pro rata.
11. **Muslim personal law** is blocked with an explanation (one-third rule, consent of heirs); no generation. Jurisdiction other than India is blocked with "consult a lawyer".
12. **Preview** is rendered by the API (`GET /drafts/:id/preview`) from the stored payload with the same shared template the PDF uses, after the wizard flushes its autosave. It returns 422 while any BLOCKER remains. `will_viewed` is audited on preview; `GET /drafts/:id` is not audited (it runs on every wizard load).
13. **Document vault.** WILL documents appear in the vault listing but cannot be renamed, replaced (OnlyOffice) or deleted there (403); only Will Maker removes one (compensation after a failed generate). The generic upload endpoint refuses `ownerType: WILL`. Download (`GET /versions/:vid/pdf`) re-checks the stored bytes against `WillVersion.pdfSha256`.
14. **Encryption keys.** If `APP_ENCRYPTION_KEY` is unset the will endpoints return 503 `WILL_KEYS_UNAVAILABLE`; the payload is never stored in clear.
15. **Template lock.** `packages/shared/src/will/template/LOCK.json` holds a sha256 per `*.v<N>.ts` file (CRLF normalised to LF). The check and the lock writer live in the API package (`packages/api/scripts/willTemplateLock.ts`, `test/will/templateLock.test.ts`) because the shared package has no Node types. Changing words = a new `*.v2.ts` file, a version bump, a new lock line - never an edit to a locked file.
16. **amountInWords** moves from `packages/api/src/services/receipts/` to `packages/shared/src/amountInWords.ts` unchanged (receipts import it from shared).
17. **Fonts.** Noto Sans v2.015 (hinted Regular, Bold) from `notofonts/latin-greek-cyrillic` and Noto Sans Devanagari v2.007 (hinted Regular, Bold) from `notofonts/devanagari`, official GitHub release zips, checksums pinned in Task 2. Licences: `OFL.txt` (Noto Sans) and `OFL-NotoSansDevanagari.txt`.
18. **shared gets zod** (`^3.23.8`, the version api and web already use) for the payload schemas.
19. **Generate rate limit** reuses `costlyOperationLimiter` (5/min/user); no new limiter.
20. **Nav.** Part 1 adds "Will Maker" (`/will`, icon `ScrollText`) right after Goals in `OVERVIEW_ITEMS`; Part 2 builds the Planning group.

## Review Focus

1. **The same draft open in two tabs or devices** - a save with an old revision must get 409 and the wizard must show a reload banner and stop autosaving, never silently overwrite. Tests: Task 7 (`stale revision is refused`), Task 9 (`a 409 stops autosave and raises the conflict banner`).
2. **Refreshing the estate after the user confirmed, excluded or edited items and gave some away** - user choices survive, vanished items become STALE instead of disappearing, so gifts naming them stay valid. Tests: Task 6 (reconcile suite).
3. **A name in Devanagari or an amount in rupees in the PDF** - the right fonts are embedded and the PDF is produced (no tofu, no crash). Test: Task 10 (`embeds the Devanagari font for a Devanagari name and keeps the rupee sign`).
4. **Percentages that only look like 100** - 33.33 + 33.33 + 33.34 passes, 33.33 x 3 is refused with "99.99%", `33.333` is refused by the schema, and "Split equally" always sums to exactly 100. Tests: Task 1 (`percent schema`), Task 4 (`RESIDUARY_SUMS_100`), Task 11 (`equalShares`).
5. **Invalid input echoing personal data** - a 422 for a bad section must not contain the submitted name or address. Test: Task 7 (`422 does not echo submitted values`).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/will/schema.ts` | zod payload/section schemas, vocabularies, `emptyWillPayload`, `willSectionData`, `applyWillSection` |
| `packages/shared/src/will/estateMath.ts` | `willEstateTotals`, `ageOn`, `isMinorOn`, `willMinorChildren`, `sumPercents`, `toAmount2`, `removeWillPerson`, `removeWillItem` |
| `packages/shared/src/will/ast.ts` | `WillBlock` document AST, `renderWillText` |
| `packages/shared/src/will/wire.ts` | API wire types, `WillFinding`, disclaimer/acknowledgement/footer copy |
| `packages/shared/src/will/validation/rules.ts` | `WILL_RULES`, `runWillRules`, `hasWillBlockers`, `WILL_RULESET_VERSION`, `MUSLIM_LAW_MESSAGE` |
| `packages/shared/src/will/template/*` | `common.v1.ts`, `isaHindu.v1.ts`, `isaGeneral.v1.ts`, `summary.v1.ts` (locked), `index.ts` (selection), `LOCK.json` |
| `packages/shared/src/amountInWords.ts` | Moved from api receipts |
| `packages/api/prisma/schema.prisma` + 2 migrations | `WillStatus`, `Will`, `WillVersion`, `DocumentOwnerType.WILL`, RLS, grants, trigger, partial unique index |
| `packages/api/assets/fonts/*` + `Dockerfile` | Bundled fonts + licences, copied into the runtime image |
| `packages/api/src/services/will/estate/*` | Adapter types, 10 adapters in 4 files, `collectEstate`, `reconcileEstate` |
| `packages/api/src/services/will/willStore.ts` | Seal/open payload, load owned will/draft, revision conflict, `todayIst` |
| `packages/api/src/services/will/will.service.ts` | Overview, create/clone, get, save section, refresh estate, discard, people suggestions |
| `packages/api/src/services/will/willGenerate.service.ts` | Preview, generate (hashes, PDF, Document, WillVersion, supersede), PDF download |
| `packages/api/src/services/will/willPdf.ts`, `willFonts.ts` | pdfkit rendering of the AST, font paths, script-run splitting |
| `packages/api/src/controllers/will.controller.ts`, `routes/will.routes.ts` | HTTP layer, `rejectActAs`, audit |
| `apps/web/src/api/will.api.ts` | Client for every endpoint, conflict helpers |
| `apps/web/src/pages/will/*` | Overview, wizard shell, stepper, autosave hook, steps, blocks view |

## Execution waves (tasks in one wave touch disjoint files and may run in parallel)

| Wave | Tasks | Needs |
|---|---|---|
| 1 | Task 1 (shared model), Task 2 (fonts + Dockerfile), Task 3 (DB schema, migrations, plumbing) | - |
| 2 | Task 4 (validation rules), Task 6 (estate itemiser), Task 8 (web API client, overview, nav) | Task 1; Task 6 also Task 3; Task 8 also Task 3 |
| 3 | Task 5 (template + amountInWords + lock), Task 7 (draft API), Task 9 (web wizard shell, details/people/instructions) | Task 5: Tasks 1, 4; Task 7: Tasks 3, 4, 6; Task 9: Tasks 4, 8 |
| 4 | Task 10 (PDF, preview, generate, download API), Task 11 (web estate + allocation steps) | Task 10: Tasks 2, 5, 7; Task 11: Task 9 |
| 5 | Task 12 (web review + preview steps) | Tasks 5, 9, 11 (API contract of Task 10, mocked in tests) |
| 6 | Task 13 (full verification + browser check) | all |

File ownership notes for parallel waves: Task 4 and Task 5 both add one export line to `packages/shared/src/will/index.ts` but run in different waves. Task 8 adds only the `/will` route to `App.tsx`; Task 9 adds `/will/:id/:step`. Task 9 creates `apps/web/src/pages/will/steps/registry.ts`; Tasks 11 and 12 each add entries to it in later waves.

## Execution notes

- Worktree: `C:\Users\ST269\Desktop\mProfit-will-wt`, branch `feat/will-maker` (from `main` 70bc3ee1). Project root `portfolioos/`. Never push.
- Fresh worktree setup before trusting any type or test error: `cd portfolioos && pnpm install && pnpm --filter @everypaisa/shared build && cd packages/api && npx prisma generate`.
- Docker containers `everypaisa-postgres` and `portfolioos-redis` must be running for API tests.
- After Task 3's migration, run `npx prisma generate` in `packages/api` so later tasks see `prisma.will` / `prisma.willVersion`.

---
### Task 1: Shared will model - payload schema, estate maths, document AST, wire types

**Wave 1** (parallel with Tasks 2 and 3).

**Files:**
- Create: `packages/shared/src/will/schema.ts`
- Create: `packages/shared/src/will/estateMath.ts`
- Create: `packages/shared/src/will/ast.ts`
- Create: `packages/shared/src/will/wire.ts`
- Create: `packages/shared/src/will/index.ts`
- Create: `packages/shared/src/will/__tests__/fixtures.ts` (test-only builders; excluded from the build by `tsconfig.build.json`'s `**/__tests__/**`)
- Modify: `packages/shared/src/index.ts` (one export line)
- Modify: `packages/shared/package.json` (+ `zod`), `pnpm-lock.yaml`
- Test: `packages/shared/src/will/schema.test.ts`, `packages/shared/src/will/estateMath.test.ts`, `packages/shared/src/will/ast.test.ts`

**Interfaces:**
- Consumes: `Decimal` from `packages/shared/src/decimal.ts`.
- Produces (all exported from `@everypaisa/shared`):
  - Vocabularies: `PERSONAL_LAWS`, `PersonalLaw`, `MARITAL_STATUSES`, `MaritalStatus`, `WILL_JURISDICTIONS`, `WILL_RELATIONSHIPS`, `WillRelationship`, `WILL_PARTY_TYPES`, `WillPartyType`, `WILL_ESTATE_SIDES`, `WillEstateSide`, `WILL_ESTATE_KINDS`, `WillEstateKind`, `WILL_OWNERSHIP_TYPES`, `WillOwnershipType`, `WILL_REVIEW_STATES`, `WillReviewState`, `WILL_SECTIONS`, `WillSection`, `WILL_MANUAL_ITEM_PREFIX = 'manual:'`, `WILL_PAYLOAD_SCHEMA_VER = 1`.
  - Schemas: `willPayloadSchema`, `willDetailsSchema`, `willPersonSchema`, `willRolesSchema`, `willAssetItemSchema`, `willEstateSchema`, `willAllocationSchema`, `willInstructionsSchema`, `willPeopleSectionSchema`, `WILL_SECTION_SCHEMAS` (one zod schema per `WillSection`).
  - Types: `WillPayload`, `WillDetails`, `WillPerson`, `WillRoles`, `WillAssetItem`, `WillEstate`, `WillAllocation`, `WillSectionData` (`{ details; people: { people; roles }; estate; allocation; instructions }`).
  - `emptyWillPayload(): WillPayload`, `isWillSection(s: string): s is WillSection`, `willSectionData<S>(p, s): WillSectionData[S]`, `applyWillSection<S>(p, s, data: WillSectionData[S]): WillPayload`.
  - `willEstateTotals(items): { assets: Decimal; liabilities: Decimal; net: Decimal; nomineeOnly: Decimal }`, `itemShareValue(item): Decimal`, `toAmount2(x: Decimal | string | number): string`, `sumPercents(values: readonly string[]): Decimal`, `ageOn(dob: string, today: string): number`, `ADULT_AGE = 18`, `isMinorOn(dob: string | null, today: string): boolean | null`, `CHILD_RELATIONSHIPS`, `willMinorChildren(p, today): WillPerson[]`, `willBeneficiaryIds(p): string[]`, `removeWillPerson(p, personId): WillPayload`, `removeWillItem(p, sourceKey): WillPayload`.
  - `WillBlock` union (`title | heading | para | clause | table | signature | witnesses | note`), `renderWillText(blocks): string`.
  - Wire: `WillSeverity`, `WillFinding { ruleId; severity; step; message; refs }`, `WillStatusWire`, `WillOverallStatus`, `WillVersionWire`, `WillEstateTotalsWire`, `WillDraftSummaryWire`, `WillOverviewWire`, `WillDraftWire`, `WillSaveResultWire`, `WillEstateRefreshWire`, `WillSuggestionWire`, `WillPreviewWire`, `WillGenerateResultWire`, `WILL_DISCLAIMER`, `WILL_ACKNOWLEDGEMENT`, `WILL_PDF_FOOTER`.
  - Test builders (shared tests only, not exported from the package): `TODAY = '2026-10-12'`, `person(p)`, `item(p)`, `validWillPayload()` in `src/will/__tests__/fixtures.ts`.

- [ ] **Step 1: Add zod to shared**

Run:
```bash
cd portfolioos && pnpm --filter @everypaisa/shared add zod@^3.23.8
```
Expected: `packages/shared/package.json` lists `"zod": "^3.23.8"` under `dependencies`; `pnpm-lock.yaml` updated.

- [ ] **Step 2: Write the failing tests**

Create `packages/shared/src/will/__tests__/fixtures.ts`:
```ts
import { emptyWillPayload, type WillAssetItem, type WillPayload, type WillPerson } from '../schema.js';

export const TODAY = '2026-10-12';

export function person(p: Partial<WillPerson> & { id: string; name: string }): WillPerson {
  return {
    partyType: 'INDIVIDUAL',
    relationship: 'SON',
    dob: '1990-01-01',
    contact: null,
    sourceFamilyMemberId: null,
    contingentId: null,
    ...p,
  };
}

export function item(p: Partial<WillAssetItem> & { sourceKey: string; label: string }): WillAssetItem {
  return {
    side: 'ASSET',
    kind: 'BANK_ACCOUNT',
    ref: null,
    value: '100000.00',
    valueAsOf: TODAY,
    ownership: { type: 'SOLE', sharePct: '100' },
    review: 'CONFIRMED',
    userEdited: false,
    note: null,
    ...p,
  };
}

/** A complete will that passes every BLOCKER and WARNING rule (only the INFO legal-review note fires). */
export function validWillPayload(): WillPayload {
  return {
    ...emptyWillPayload(),
    details: {
      legalName: 'Ramesh Kumar Verma',
      dob: '1970-05-15',
      jurisdiction: 'IN',
      personalLaw: 'HINDU',
      address: '12 MG Road, Pune 411001',
      maritalStatus: 'MARRIED',
      hasChildren: true,
      hasDependents: false,
    },
    people: [
      person({ id: 'p-spouse', name: 'Sunita Verma', relationship: 'SPOUSE', dob: '1972-08-01' }),
      person({ id: 'p-son', name: 'Arjun Verma', relationship: 'SON', dob: '1998-02-10', contingentId: 'p-spouse' }),
      person({ id: 'p-trust', name: 'Pune Animal Trust', partyType: 'ORGANISATION', relationship: 'CHARITY', dob: null }),
    ],
    roles: { executorId: 'p-spouse', altExecutorId: 'p-son', guardianId: null, altGuardianId: null },
    estate: {
      asOf: TODAY,
      failedSources: [],
      items: [
        item({ sourceKey: 'bank:b1', label: 'HDFC Bank savings account', ref: 'XXXX1234', value: '250000.00' }),
        item({ sourceKey: 'holdings:pf1:EQUITY', kind: 'HOLDING', label: 'Equity - My Portfolio', value: '1500000.00' }),
        item({ sourceKey: 'loan:l1', side: 'LIABILITY', kind: 'LOAN', label: 'Home loan - SBI', value: '400000.00' }),
      ],
    },
    allocation: {
      residuary: [
        { personId: 'p-spouse', sharePct: '60' },
        { personId: 'p-son', sharePct: '40' },
      ],
      specificGifts: [{ itemId: 'holdings:pf1:EQUITY', personId: 'p-son', sharePct: '100' }],
      fixedGifts: [{ personId: 'p-trust', amount: '50000' }],
    },
    instructions: { text: 'I wish my books to go to the Pune public library.' },
  };
}
```

Create `packages/shared/src/will/schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  applyWillSection, emptyWillPayload, isWillSection, willAllocationSchema, willAssetItemSchema,
  willPayloadSchema, willSectionData, WILL_SECTION_SCHEMAS,
} from './schema.js';
import { item, validWillPayload } from './__tests__/fixtures.js';

describe('will payload schema', () => {
  it('parses an empty object into a complete empty draft', () => {
    const p = emptyWillPayload();
    expect(p.schemaVer).toBe(1);
    expect(p.details).toEqual({
      legalName: '', dob: null, jurisdiction: 'IN', personalLaw: null, address: '',
      maritalStatus: null, hasChildren: null, hasDependents: null,
    });
    expect(p.people).toEqual([]);
    expect(p.roles).toEqual({ executorId: null, altExecutorId: null, guardianId: null, altGuardianId: null });
    expect(p.estate).toEqual({ asOf: null, items: [], failedSources: [] });
    expect(p.allocation).toEqual({ residuary: [], specificGifts: [], fixedGifts: [] });
    expect(p.instructions).toEqual({ text: '' });
  });

  it('round-trips a full payload unchanged', () => {
    const p = validWillPayload();
    expect(willPayloadSchema.parse(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('percent schema: two decimals at most, never above 100', () => {
    const ok = (sharePct: string) => willAllocationSchema.safeParse({ residuary: [{ personId: 'a', sharePct }] }).success;
    expect(ok('33.33')).toBe(true);
    expect(ok('100')).toBe(true);
    expect(ok('100.00')).toBe(true);
    expect(ok('33.333')).toBe(false);
    expect(ok('100.01')).toBe(false);
    expect(ok('-5')).toBe(false);
    expect(ok('abc')).toBe(false);
  });

  it('amounts are plain decimal strings with at most two decimals', () => {
    const ok = (value: string) => willAssetItemSchema.safeParse(item({ sourceKey: 'x', label: 'X', value })).success;
    expect(ok('250000')).toBe(true);
    expect(ok('250000.5')).toBe(true);
    expect(ok('1,00,000')).toBe(false);
    expect(ok('12.345')).toBe(false);
    expect(ok('-1')).toBe(false);
  });

  it('instructions are capped at 1000 characters', () => {
    expect(WILL_SECTION_SCHEMAS.instructions.safeParse({ text: 'a'.repeat(1000) }).success).toBe(true);
    expect(WILL_SECTION_SCHEMAS.instructions.safeParse({ text: 'a'.repeat(1001) }).success).toBe(false);
  });

  it('people section carries people and roles together', () => {
    const p = validWillPayload();
    const data = willSectionData(p, 'people');
    expect(data.people).toHaveLength(3);
    expect(data.roles.executorId).toBe('p-spouse');
    const next = applyWillSection(p, 'people', { people: [], roles: { ...data.roles, executorId: null } });
    expect(next.people).toEqual([]);
    expect(next.roles.executorId).toBeNull();
    expect(next.details).toBe(p.details);
  });

  it('applyWillSection replaces only the named section', () => {
    const p = validWillPayload();
    const next = applyWillSection(p, 'instructions', { text: 'New' });
    expect(next.instructions.text).toBe('New');
    expect(next.allocation).toBe(p.allocation);
  });

  it('knows its section names', () => {
    expect(isWillSection('estate')).toBe(true);
    expect(isWillSection('roles')).toBe(false);
  });
});
```

Create `packages/shared/src/will/estateMath.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  ageOn, isMinorOn, removeWillItem, removeWillPerson, sumPercents, toAmount2,
  willBeneficiaryIds, willEstateTotals, willMinorChildren,
} from './estateMath.js';
import { item, person, TODAY, validWillPayload } from './__tests__/fixtures.js';

describe('willEstateTotals', () => {
  it('applies ownership shares, skips excluded, and keeps nominee-only apart', () => {
    const t = willEstateTotals([
      item({ sourceKey: 'a', label: 'A', value: '1000.00' }),
      item({ sourceKey: 'b', label: 'B', value: '200000.00', ownership: { type: 'JOINT', sharePct: '50' } }),
      item({ sourceKey: 'c', label: 'C', value: '999.00', review: 'EXCLUDED' }),
      item({ sourceKey: 'd', label: 'D', value: '5000000.00', kind: 'INSURANCE', ownership: { type: 'NOMINEE_ONLY', sharePct: '100' } }),
      item({ sourceKey: 'e', label: 'E', side: 'LIABILITY', kind: 'LOAN', value: '30000.10' }),
    ]);
    expect(t.assets.toFixed(2)).toBe('101000.00');
    expect(t.liabilities.toFixed(2)).toBe('30000.10');
    expect(t.net.toFixed(2)).toBe('70999.90');
    expect(t.nomineeOnly.toFixed(2)).toBe('5000000.00');
  });

  it('counts STALE and NEEDS_REVIEW items (they are still in the estate)', () => {
    const t = willEstateTotals([
      item({ sourceKey: 'a', label: 'A', value: '10', review: 'STALE' }),
      item({ sourceKey: 'b', label: 'B', value: '5', review: 'NEEDS_REVIEW' }),
    ]);
    expect(t.assets.toFixed(2)).toBe('15.00');
  });
});

describe('small maths', () => {
  it('toAmount2 rounds half to even at two decimals', () => {
    expect(toAmount2('1500.505')).toBe('1500.50');
    expect(toAmount2('1500.515')).toBe('1500.52');
    expect(toAmount2(0)).toBe('0.00');
  });

  it('sumPercents is exact', () => {
    expect(sumPercents(['33.33', '33.33', '33.34']).equals(100)).toBe(true);
    expect(sumPercents(['33.33', '33.33', '33.33']).toFixed(2)).toBe('99.99');
    expect(sumPercents([]).toFixed(2)).toBe('0.00');
  });

  it('ageOn counts the birthday itself as the new age', () => {
    expect(ageOn('2008-10-12', '2026-10-12')).toBe(18);
    expect(ageOn('2008-10-13', '2026-10-12')).toBe(17);
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageOn('2008-02-29', '2026-03-01')).toBe(18);
  });

  it('isMinorOn is null without a date of birth', () => {
    expect(isMinorOn(null, TODAY)).toBeNull();
    expect(isMinorOn('2010-01-01', TODAY)).toBe(true);
    expect(isMinorOn('2000-01-01', TODAY)).toBe(false);
  });
});

describe('people helpers', () => {
  it('finds minor children only among sons and daughters', () => {
    const p = validWillPayload();
    p.people.push(
      person({ id: 'kid', name: 'Kid', relationship: 'DAUGHTER', dob: '2015-01-01' }),
      person({ id: 'nephew', name: 'Nephew', relationship: 'NEPHEW', dob: '2016-01-01' }),
    );
    expect(willMinorChildren(p, TODAY).map((x) => x.id)).toEqual(['kid']);
  });

  it('lists beneficiaries once each', () => {
    expect(willBeneficiaryIds(validWillPayload()).sort()).toEqual(['p-son', 'p-spouse', 'p-trust']);
  });

  it('removing a person clears every reference to them', () => {
    const next = removeWillPerson(validWillPayload(), 'p-spouse');
    expect(next.people.map((x) => x.id)).toEqual(['p-son', 'p-trust']);
    expect(next.people.find((x) => x.id === 'p-son')!.contingentId).toBeNull();
    expect(next.roles.executorId).toBeNull();
    expect(next.roles.altExecutorId).toBe('p-son');
    expect(next.allocation.residuary).toEqual([{ personId: 'p-son', sharePct: '40' }]);
  });

  it('removing an item drops the specific gifts that name it', () => {
    const next = removeWillItem(validWillPayload(), 'holdings:pf1:EQUITY');
    expect(next.estate.items.map((x) => x.sourceKey)).toEqual(['bank:b1', 'loan:l1']);
    expect(next.allocation.specificGifts).toEqual([]);
  });
});
```

Create `packages/shared/src/will/ast.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderWillText, type WillBlock } from './ast.js';

describe('renderWillText', () => {
  it('renders every block kind deterministically', () => {
    const blocks: WillBlock[] = [
      { t: 'title', text: 'Last Will and Testament' },
      { t: 'heading', text: 'of A B' },
      { t: 'clause', n: 1, title: 'Declaration', paras: ['First.', 'Second.  '] },
      { t: 'table', title: 'Gifts', rows: [['Car', 'Son']] },
      { t: 'table', title: null, rows: [['House', 'Wife - 50%']] },
      { t: 'para', text: 'Signed.' },
      { t: 'signature', lines: ['Place: ____', 'Date: ____'] },
      { t: 'witnesses', intro: 'Witnessed by:', count: 2, fields: ['Name'] },
      { t: 'note', text: 'Note.' },
    ];
    expect(renderWillText(blocks)).toBe(
      [
        'LAST WILL AND TESTAMENT',
        'of A B',
        '1. Declaration\nFirst.\nSecond.',
        'Gifts\n- Car: Son',
        '- House: Wife - 50%',
        'Signed.',
        'Place: ____\nDate: ____',
        'Witnessed by:\nWitness 1\nName: ____________________\nWitness 2\nName: ____________________',
        'Note.',
      ].join('\n\n') + '\n',
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd portfolioos/packages/shared && npx vitest run src/will`
Expected: FAIL - cannot resolve `./schema.js`, `./estateMath.js`, `./ast.js`.

- [ ] **Step 4: Write the schema**

Create `packages/shared/src/will/schema.ts`:
```ts
/**
 * Will Maker payload (spec: docs/superpowers/specs/2026-10-12-will-maker-design.md).
 *
 * The whole draft is ONE JSON document sealed with the owner's data key on the
 * server. Every field has a default so a half-finished draft always parses;
 * completeness is judged by the validation rules, not by this schema.
 */
import { z } from 'zod';
import { Decimal } from '../decimal.js';

export const WILL_PAYLOAD_SCHEMA_VER = 1;
export const WILL_MANUAL_ITEM_PREFIX = 'manual:';

export const PERSONAL_LAWS = ['HINDU', 'SIKH', 'JAIN', 'BUDDHIST', 'CHRISTIAN', 'PARSI', 'MUSLIM', 'OTHER'] as const;
export type PersonalLaw = (typeof PERSONAL_LAWS)[number];
export const MARITAL_STATUSES = ['SINGLE', 'MARRIED', 'WIDOWED', 'DIVORCED', 'SEPARATED'] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];
export const WILL_JURISDICTIONS = ['IN', 'OTHER'] as const;
export const WILL_RELATIONSHIPS = [
  'SPOUSE', 'SON', 'DAUGHTER', 'FATHER', 'MOTHER', 'BROTHER', 'SISTER', 'GRANDSON', 'GRANDDAUGHTER',
  'SON_IN_LAW', 'DAUGHTER_IN_LAW', 'NEPHEW', 'NIECE', 'OTHER_RELATIVE', 'FRIEND', 'CHARITY', 'OTHER',
] as const;
export type WillRelationship = (typeof WILL_RELATIONSHIPS)[number];
export const WILL_PARTY_TYPES = ['INDIVIDUAL', 'ORGANISATION'] as const;
export type WillPartyType = (typeof WILL_PARTY_TYPES)[number];
export const WILL_ESTATE_SIDES = ['ASSET', 'LIABILITY'] as const;
export type WillEstateSide = (typeof WILL_ESTATE_SIDES)[number];
export const WILL_ESTATE_KINDS = [
  'BANK_ACCOUNT', 'HOLDING', 'PROVIDENT_FUND', 'OWNED_PROPERTY', 'RENTAL_PROPERTY', 'VEHICLE', 'INSURANCE',
  'LOAN_GIVEN', 'LOAN', 'CREDIT_CARD', 'OTHER_ASSET', 'OTHER_LIABILITY',
] as const;
export type WillEstateKind = (typeof WILL_ESTATE_KINDS)[number];
export const WILL_OWNERSHIP_TYPES = ['SOLE', 'JOINT', 'NOMINEE_ONLY', 'HUF'] as const;
export type WillOwnershipType = (typeof WILL_OWNERSHIP_TYPES)[number];
export const WILL_REVIEW_STATES = ['NEEDS_REVIEW', 'CONFIRMED', 'EXCLUDED', 'STALE'] as const;
export type WillReviewState = (typeof WILL_REVIEW_STATES)[number];
export const WILL_SECTIONS = ['details', 'people', 'estate', 'allocation', 'instructions'] as const;
export type WillSection = (typeof WILL_SECTIONS)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const amount = z.string().regex(/^\d{1,13}(\.\d{1,2})?$/);
const percent = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,2})?$/)
  .refine((v) => new Decimal(v).lte(100), { message: 'at most 100' });
const ref = z.string().min(1).max(64);
const text = (max: number) => z.string().trim().max(max);

export const willDetailsSchema = z.object({
  legalName: text(120).default(''),
  dob: isoDate.nullable().default(null),
  jurisdiction: z.enum(WILL_JURISDICTIONS).default('IN'),
  personalLaw: z.enum(PERSONAL_LAWS).nullable().default(null),
  address: text(400).default(''),
  maritalStatus: z.enum(MARITAL_STATUSES).nullable().default(null),
  hasChildren: z.boolean().nullable().default(null),
  hasDependents: z.boolean().nullable().default(null),
});

export const willPersonSchema = z.object({
  id: ref,
  partyType: z.enum(WILL_PARTY_TYPES),
  name: z.string().trim().min(1).max(120),
  relationship: z.enum(WILL_RELATIONSHIPS),
  dob: isoDate.nullable().default(null),
  contact: text(120).nullable().default(null),
  sourceFamilyMemberId: ref.nullable().default(null),
  /** Back-up beneficiary: receives this person's gifts if they do not survive the testator. */
  contingentId: ref.nullable().default(null),
});

export const willRolesSchema = z.object({
  executorId: ref.nullable().default(null),
  altExecutorId: ref.nullable().default(null),
  guardianId: ref.nullable().default(null),
  altGuardianId: ref.nullable().default(null),
});

export const willAssetItemSchema = z.object({
  /** Stable id: "<source>:<row id>" for fetched items, "manual:<id>" for items the user added. */
  sourceKey: z.string().min(1).max(120),
  side: z.enum(WILL_ESTATE_SIDES),
  kind: z.enum(WILL_ESTATE_KINDS),
  label: z.string().trim().min(1).max(160),
  /** Identifier printed in the will (masked account number, vehicle plate). */
  ref: text(40).nullable().default(null),
  value: amount,
  valueAsOf: isoDate.nullable().default(null),
  ownership: z.object({ type: z.enum(WILL_OWNERSHIP_TYPES), sharePct: percent }),
  review: z.enum(WILL_REVIEW_STATES),
  userEdited: z.boolean().default(false),
  note: text(300).nullable().default(null),
});

export const willEstateSchema = z.object({
  asOf: isoDate.nullable().default(null),
  items: z.array(willAssetItemSchema).max(500).default([]),
  /** Adapter ids that failed on the last refresh. */
  failedSources: z.array(z.string().min(1).max(40)).max(20).default([]),
});

export const willAllocationSchema = z.object({
  residuary: z.array(z.object({ personId: ref, sharePct: percent })).max(60).default([]),
  specificGifts: z
    .array(z.object({ itemId: z.string().min(1).max(120), personId: ref, sharePct: percent.default('100') }))
    .max(200)
    .default([]),
  fixedGifts: z.array(z.object({ personId: ref, amount })).max(60).default([]),
});

export const willInstructionsSchema = z.object({ text: z.string().max(1000).default('') });

export const willPeopleSectionSchema = z.object({
  people: z.array(willPersonSchema).max(60).default([]),
  roles: willRolesSchema.default({}),
});

export const willPayloadSchema = z.object({
  schemaVer: z.literal(WILL_PAYLOAD_SCHEMA_VER).default(WILL_PAYLOAD_SCHEMA_VER),
  details: willDetailsSchema.default({}),
  people: z.array(willPersonSchema).max(60).default([]),
  roles: willRolesSchema.default({}),
  estate: willEstateSchema.default({}),
  allocation: willAllocationSchema.default({}),
  instructions: willInstructionsSchema.default({}),
});

export type WillPayload = z.output<typeof willPayloadSchema>;
export type WillDetails = WillPayload['details'];
export type WillPerson = WillPayload['people'][number];
export type WillRoles = WillPayload['roles'];
export type WillEstate = WillPayload['estate'];
export type WillAssetItem = WillEstate['items'][number];
export type WillAllocation = WillPayload['allocation'];

export interface WillSectionData {
  details: WillDetails;
  people: { people: WillPerson[]; roles: WillRoles };
  estate: WillEstate;
  allocation: WillAllocation;
  instructions: WillPayload['instructions'];
}

export const WILL_SECTION_SCHEMAS = {
  details: willDetailsSchema,
  people: willPeopleSectionSchema,
  estate: willEstateSchema,
  allocation: willAllocationSchema,
  instructions: willInstructionsSchema,
} as const;

export function emptyWillPayload(): WillPayload {
  return willPayloadSchema.parse({});
}

export function isWillSection(s: string): s is WillSection {
  return (WILL_SECTIONS as readonly string[]).includes(s);
}

export function willSectionData<S extends WillSection>(p: WillPayload, s: S): WillSectionData[S] {
  const all: WillSectionData = {
    details: p.details,
    people: { people: p.people, roles: p.roles },
    estate: p.estate,
    allocation: p.allocation,
    instructions: p.instructions,
  };
  return all[s];
}

export function applyWillSection<S extends WillSection>(p: WillPayload, s: S, data: WillSectionData[S]): WillPayload {
  if (s === 'people') {
    const d = data as WillSectionData['people'];
    return { ...p, people: d.people, roles: d.roles };
  }
  return { ...p, [s]: data } as WillPayload;
}
```

- [ ] **Step 5: Write the estate maths**

Create `packages/shared/src/will/estateMath.ts`:
```ts
import { Decimal } from '../decimal.js';
import type { WillAssetItem, WillPayload, WillPerson, WillRelationship } from './schema.js';

const ZERO = new Decimal(0);
export const ADULT_AGE = 18;
export const CHILD_RELATIONSHIPS: readonly WillRelationship[] = ['SON', 'DAUGHTER'];

export interface WillEstateTotals {
  assets: Decimal;
  liabilities: Decimal;
  net: Decimal;
  /** Insurance and similar paid straight to a nominee: shown, never counted. */
  nomineeOnly: Decimal;
}

export function itemShareValue(item: Pick<WillAssetItem, 'value' | 'ownership'>): Decimal {
  return new Decimal(item.value).times(item.ownership.sharePct).dividedBy(100);
}

export function willEstateTotals(items: readonly WillAssetItem[]): WillEstateTotals {
  let assets = ZERO;
  let liabilities = ZERO;
  let nomineeOnly = ZERO;
  for (const it of items) {
    if (it.review === 'EXCLUDED') continue;
    const v = itemShareValue(it);
    if (it.ownership.type === 'NOMINEE_ONLY') {
      nomineeOnly = nomineeOnly.plus(v);
    } else if (it.side === 'ASSET') {
      assets = assets.plus(v);
    } else {
      liabilities = liabilities.plus(v);
    }
  }
  return { assets, liabilities, net: assets.minus(liabilities), nomineeOnly };
}

export function toAmount2(x: Decimal | string | number): string {
  return new Decimal(x).toFixed(2, Decimal.ROUND_HALF_EVEN);
}

export function sumPercents(values: readonly string[]): Decimal {
  return values.reduce((s, v) => s.plus(v), ZERO);
}

function ymd(iso: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new RangeError('Expected a YYYY-MM-DD date');
  return [Number.parseInt(m[1]!, 10), Number.parseInt(m[2]!, 10), Number.parseInt(m[3]!, 10)];
}

/** Completed years on `today` (both YYYY-MM-DD). A 29 Feb birthday counts from 1 Mar in other years. */
export function ageOn(dob: string, today: string): number {
  const [by, bm, bd] = ymd(dob);
  const [ty, tm, td] = ymd(today);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

export function isMinorOn(dob: string | null, today: string): boolean | null {
  return dob ? ageOn(dob, today) < ADULT_AGE : null;
}

export function willMinorChildren(p: WillPayload, today: string): WillPerson[] {
  return p.people.filter(
    (x) => x.partyType === 'INDIVIDUAL' && CHILD_RELATIONSHIPS.includes(x.relationship) && isMinorOn(x.dob, today) === true,
  );
}

export function willBeneficiaryIds(p: WillPayload): string[] {
  const ids = new Set<string>();
  for (const r of p.allocation.residuary) ids.add(r.personId);
  for (const g of p.allocation.specificGifts) ids.add(g.personId);
  for (const g of p.allocation.fixedGifts) ids.add(g.personId);
  return [...ids];
}

export function removeWillPerson(p: WillPayload, personId: string): WillPayload {
  const keep = (id: string | null) => (id === personId ? null : id);
  return {
    ...p,
    people: p.people
      .filter((x) => x.id !== personId)
      .map((x) => (x.contingentId === personId ? { ...x, contingentId: null } : x)),
    roles: {
      executorId: keep(p.roles.executorId),
      altExecutorId: keep(p.roles.altExecutorId),
      guardianId: keep(p.roles.guardianId),
      altGuardianId: keep(p.roles.altGuardianId),
    },
    allocation: {
      residuary: p.allocation.residuary.filter((r) => r.personId !== personId),
      specificGifts: p.allocation.specificGifts.filter((g) => g.personId !== personId),
      fixedGifts: p.allocation.fixedGifts.filter((g) => g.personId !== personId),
    },
  };
}

export function removeWillItem(p: WillPayload, sourceKey: string): WillPayload {
  return {
    ...p,
    estate: { ...p.estate, items: p.estate.items.filter((i) => i.sourceKey !== sourceKey) },
    allocation: { ...p.allocation, specificGifts: p.allocation.specificGifts.filter((g) => g.itemId !== sourceKey) },
  };
}
```

- [ ] **Step 6: Write the AST**

Create `packages/shared/src/will/ast.ts`:
```ts
/**
 * The will as data. Templates build blocks; the web preview, the PDF and the
 * text hash all consume the same blocks, so what the user previews is what is
 * printed and hashed.
 */
export type WillBlock =
  | { t: 'title'; text: string }
  | { t: 'heading'; text: string }
  | { t: 'para'; text: string }
  | { t: 'clause'; n: number; title: string; paras: string[] }
  | { t: 'table'; title: string | null; rows: Array<[string, string]> }
  | { t: 'signature'; lines: string[] }
  | { t: 'witnesses'; intro: string; count: number; fields: string[] }
  | { t: 'note'; text: string };

function blockText(b: WillBlock): string {
  switch (b.t) {
    case 'title':
      return b.text.toUpperCase();
    case 'heading':
    case 'para':
    case 'note':
      return b.text;
    case 'clause':
      return [`${b.n}. ${b.title}`, ...b.paras].join('\n');
    case 'table':
      return [...(b.title ? [b.title] : []), ...b.rows.map(([k, v]) => `- ${k}: ${v}`)].join('\n');
    case 'signature':
      return b.lines.join('\n');
    case 'witnesses': {
      const lines = [b.intro];
      for (let i = 1; i <= b.count; i++) {
        lines.push(`Witness ${i}`);
        for (const f of b.fields) lines.push(`${f}: ____________________`);
      }
      return lines.join('\n');
    }
  }
}

/** Canonical plain text of a will: the input of `WillVersion.textHash`. */
export function renderWillText(blocks: readonly WillBlock[]): string {
  return (
    blocks
      .map((b) => blockText(b).split('\n').map((l) => l.trimEnd()).join('\n'))
      .join('\n\n') + '\n'
  );
}
```

- [ ] **Step 7: Write the wire types, copy and barrel**

Create `packages/shared/src/will/wire.ts`:
```ts
import type { WillEstate, WillPayload, WillRelationship } from './schema.js';
import type { WillBlock } from './ast.js';

export type WillSeverity = 'BLOCKER' | 'WARNING' | 'INFO';

export interface WillFinding {
  ruleId: string;
  severity: WillSeverity;
  /** Wizard step the finding belongs to (2-8). */
  step: number;
  /** Fixed, PII-free sentence. */
  message: string;
  /** Person ids or item sourceKeys to highlight. */
  refs: string[];
}

export type WillStatusWire = 'DRAFT' | 'GENERATED' | 'EXECUTED' | 'SUPERSEDED' | 'DISCARDED';
export type WillOverallStatus = 'NOT_CREATED' | 'DRAFT' | 'GENERATED' | 'EXECUTED';

export interface WillVersionWire {
  id: string;
  willId: string;
  versionNo: number;
  status: WillStatusWire;
  generatedOn: string;
  templateId: string;
  templateVersion: number;
}

export interface WillEstateTotalsWire {
  assets: string;
  liabilities: string;
  net: string;
  nomineeOnly: string;
}

export interface WillDraftSummaryWire {
  id: string;
  version: number;
  currentStep: number;
  updatedAt: string;
}

export interface WillOverviewWire {
  status: WillOverallStatus;
  draft: WillDraftSummaryWire | null;
  versions: WillVersionWire[];
  estate: WillEstateTotalsWire;
  estateFailedSources: string[];
}

export interface WillDraftWire {
  id: string;
  version: number;
  revision: number;
  currentStep: number;
  payload: WillPayload;
  findings: WillFinding[];
  updatedAt: string;
}

export interface WillSaveResultWire {
  revision: number;
  updatedAt: string;
}

export interface WillEstateRefreshWire {
  revision: number;
  estate: WillEstate;
}

export interface WillSuggestionWire {
  userId: string;
  name: string;
  relation: string | null;
  relationship: WillRelationship | null;
  dob: string | null;
}

export interface WillPreviewWire {
  templateId: string;
  templateVersion: number;
  generatedOn: string;
  summary: WillBlock[];
  document: WillBlock[];
}

export interface WillGenerateResultWire {
  version: WillVersionWire;
}

export const WILL_DISCLAIMER =
  'This is not legal advice. Passing these checks does not guarantee that your will is legally valid. Get it reviewed by a qualified advocate before you sign it.';

export const WILL_ACKNOWLEDGEMENT =
  'I understand that EveryPaisa is not a law firm, that this will is produced from a fixed template, and that I should have it reviewed by a qualified advocate before I sign it.';

export const WILL_PDF_FOOTER =
  'Prepared with EveryPaisa Will Maker from a fixed template. Not legal advice - have it reviewed by a qualified advocate.';
```

Create `packages/shared/src/will/index.ts`:
```ts
export * from './schema.js';
export * from './estateMath.js';
export * from './ast.js';
export * from './wire.js';
```

In `packages/shared/src/index.ts`, append after the last line (`export * from './loans/index.js';`):
```ts
// Will Maker (docs/superpowers/specs/2026-10-12-will-maker-design.md).
export * from './will/index.js';
```

- [ ] **Step 8: Run the tests to verify they pass, then build**

Run: `cd portfolioos/packages/shared && npx vitest run src/will && npx tsc --noEmit && pnpm build`
Expected: PASS (3 files); no type errors; `dist/will/index.js` exists.

- [ ] **Step 9: Commit**

```bash
cd portfolioos
git add packages/shared/package.json pnpm-lock.yaml packages/shared/src/index.ts packages/shared/src/will
git commit -m "feat(will): shared will payload schema, estate maths and document AST

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Bundle Noto Sans fonts and ship them in the API image

**Wave 1** (parallel with Tasks 1 and 3).

**Files:**
- Create: `packages/api/assets/fonts/NotoSans-Regular.ttf`, `NotoSans-Bold.ttf`, `NotoSansDevanagari-Regular.ttf`, `NotoSansDevanagari-Bold.ttf`, `OFL.txt`, `OFL-NotoSansDevanagari.txt`, `README.md`
- Modify: `packages/api/Dockerfile` (runtime stage copies `packages/api/assets`)
- Test: `packages/api/test/will/fonts.test.ts`

**Interfaces:**
- Produces: font files at `packages/api/assets/fonts/` (relative to `packages/api`), used by Task 10's `willFonts.ts` via `new URL('../../../assets/fonts/', import.meta.url)` from `src/services/will/` (and the same relative path from `dist/services/will/`).

Pinned sources (official notofonts GitHub releases; `.ttf` is already `binary` in the repo `.gitattributes`):

| Release zip | URL | sha256 of the zip |
|---|---|---|
| Noto Sans v2.015 | `https://github.com/notofonts/latin-greek-cyrillic/releases/download/NotoSans-v2.015/NotoSans-v2.015.zip` | `0c34df072a3fa7efbb7cbf34950e1f971a4447cffe365d3a359e2d4089b958f5` |
| Noto Sans Devanagari v2.007 | `https://github.com/notofonts/devanagari/releases/download/NotoSansDevanagari-v2.007/NotoSansDevanagari-v2.007.zip` | `820c7da45b1e63562cb41c0a8cac5d9a4202312043a3a040ed1325857ef469b1` |

| File in `assets/fonts/` | Path inside the zip | sha256 |
|---|---|---|
| `NotoSans-Regular.ttf` | `NotoSans/hinted/ttf/NotoSans-Regular.ttf` | `478c558ea716033cd60c03438f628dfa75694dcf6b5f6d505a2f05fd2b4f3823` |
| `NotoSans-Bold.ttf` | `NotoSans/hinted/ttf/NotoSans-Bold.ttf` | `1df075a380fc7cb898acf64c1f7b3b4dd780de3caa860178bf929de35817a913` |
| `OFL.txt` | `OFL.txt` (Noto Sans zip) | `cee9892f9f0cc8fe882c9e9537ee6a89621d86ee7ceaf70b02e2b2b1c25c061a` |
| `NotoSansDevanagari-Regular.ttf` | `NotoSansDevanagari/hinted/ttf/NotoSansDevanagari-Regular.ttf` | `4e3c66638958c3e2ab5d37f47a8deb89fffeb7be9985c665a519bbc7ba762313` |
| `NotoSansDevanagari-Bold.ttf` | `NotoSansDevanagari/hinted/ttf/NotoSansDevanagari-Bold.ttf` | `6a09c8d797cfc803d32cdc731e809424d74cbaff59f503de34ade421a08e5bc2` |
| `OFL-NotoSansDevanagari.txt` | `OFL.txt` (Devanagari zip) | `a216f6f8d85c7228093e0ee5e258d9d377e6671f68acb4db1930b29583d0f331` |

- [ ] **Step 1: Write the failing test**

Create `packages/api/test/will/fonts.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const FONT_DIR = fileURLToPath(new URL('../../assets/fonts/', import.meta.url));
const DOCKERFILE = fileURLToPath(new URL('../../Dockerfile', import.meta.url));

const PINNED: Record<string, string> = {
  'NotoSans-Regular.ttf': '478c558ea716033cd60c03438f628dfa75694dcf6b5f6d505a2f05fd2b4f3823',
  'NotoSans-Bold.ttf': '1df075a380fc7cb898acf64c1f7b3b4dd780de3caa860178bf929de35817a913',
  'NotoSansDevanagari-Regular.ttf': '4e3c66638958c3e2ab5d37f47a8deb89fffeb7be9985c665a519bbc7ba762313',
  'NotoSansDevanagari-Bold.ttf': '6a09c8d797cfc803d32cdc731e809424d74cbaff59f503de34ade421a08e5bc2',
  'OFL.txt': 'cee9892f9f0cc8fe882c9e9537ee6a89621d86ee7ceaf70b02e2b2b1c25c061a',
  'OFL-NotoSansDevanagari.txt': 'a216f6f8d85c7228093e0ee5e258d9d377e6671f68acb4db1930b29583d0f331',
};

describe('bundled will fonts', () => {
  for (const [file, sha] of Object.entries(PINNED)) {
    it(`${file} is present and matches the pinned release`, () => {
      const path = join(FONT_DIR, file);
      expect(existsSync(path)).toBe(true);
      expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(sha);
    });
  }

  it('the runtime image copies the assets folder', () => {
    expect(readFileSync(DOCKERFILE, 'utf8')).toContain(
      'COPY --from=build /app/packages/api/assets ./packages/api/assets',
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd portfolioos/packages/api && npx vitest run test/will/fonts.test.ts`
Expected: FAIL - the files do not exist; the Dockerfile line is missing.

- [ ] **Step 3: Download, verify and extract the fonts**

Run (Git Bash, from `portfolioos/packages/api`):
```bash
set -euo pipefail
DL="$(mktemp -d)"
curl -fsSL -o "$DL/NotoSans-v2.015.zip" https://github.com/notofonts/latin-greek-cyrillic/releases/download/NotoSans-v2.015/NotoSans-v2.015.zip
curl -fsSL -o "$DL/NotoSansDevanagari-v2.007.zip" https://github.com/notofonts/devanagari/releases/download/NotoSansDevanagari-v2.007/NotoSansDevanagari-v2.007.zip
printf '%s  %s\n' \
  0c34df072a3fa7efbb7cbf34950e1f971a4447cffe365d3a359e2d4089b958f5 "$DL/NotoSans-v2.015.zip" \
  820c7da45b1e63562cb41c0a8cac5d9a4202312043a3a040ed1325857ef469b1 "$DL/NotoSansDevanagari-v2.007.zip" \
  | sha256sum -c -
mkdir -p assets/fonts
unzip -o -j "$DL/NotoSans-v2.015.zip" NotoSans/hinted/ttf/NotoSans-Regular.ttf NotoSans/hinted/ttf/NotoSans-Bold.ttf -d assets/fonts
unzip -o -j "$DL/NotoSansDevanagari-v2.007.zip" NotoSansDevanagari/hinted/ttf/NotoSansDevanagari-Regular.ttf NotoSansDevanagari/hinted/ttf/NotoSansDevanagari-Bold.ttf -d assets/fonts
unzip -p "$DL/NotoSans-v2.015.zip" OFL.txt > assets/fonts/OFL.txt
unzip -p "$DL/NotoSansDevanagari-v2.007.zip" OFL.txt > assets/fonts/OFL-NotoSansDevanagari.txt
printf '%s  %s\n' \
  478c558ea716033cd60c03438f628dfa75694dcf6b5f6d505a2f05fd2b4f3823 assets/fonts/NotoSans-Regular.ttf \
  1df075a380fc7cb898acf64c1f7b3b4dd780de3caa860178bf929de35817a913 assets/fonts/NotoSans-Bold.ttf \
  4e3c66638958c3e2ab5d37f47a8deb89fffeb7be9985c665a519bbc7ba762313 assets/fonts/NotoSansDevanagari-Regular.ttf \
  6a09c8d797cfc803d32cdc731e809424d74cbaff59f503de34ade421a08e5bc2 assets/fonts/NotoSansDevanagari-Bold.ttf \
  cee9892f9f0cc8fe882c9e9537ee6a89621d86ee7ceaf70b02e2b2b1c25c061a assets/fonts/OFL.txt \
  a216f6f8d85c7228093e0ee5e258d9d377e6671f68acb4db1930b29583d0f331 assets/fonts/OFL-NotoSansDevanagari.txt \
  | sha256sum -c -
rm -rf "$DL"
```
Expected: both `sha256sum -c` runs print `OK` for every line. If any line says `FAILED`, stop: do not commit the files; record the mismatch in `BLOCKED.md`.

Create `packages/api/assets/fonts/README.md`:
```md
# Bundled fonts (Will Maker PDF)

Noto Sans v2.015 (hinted Regular, Bold) - https://github.com/notofonts/latin-greek-cyrillic/releases/tag/NotoSans-v2.015
Noto Sans Devanagari v2.007 (hinted Regular, Bold) - https://github.com/notofonts/devanagari/releases/tag/NotoSansDevanagari-v2.007

Both are licensed under the SIL Open Font License 1.1 (`OFL.txt`, `OFL-NotoSansDevanagari.txt`).
Checksums are pinned in `packages/api/test/will/fonts.test.ts`. To update a font, download the new
release zip, verify it, replace the file and update the pinned hash in the same commit.
```

- [ ] **Step 4: Copy the assets into the runtime image**

In `packages/api/Dockerfile`, runtime stage, after the line `COPY --from=build /app/packages/api/prisma ./packages/api/prisma` add:
```dockerfile
# Fonts for generated PDFs (Will Maker). Read at runtime relative to dist/.
COPY --from=build /app/packages/api/assets ./packages/api/assets
```
(The build stage's `COPY . .` already brings `packages/api/assets` in.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd portfolioos/packages/api && npx vitest run test/will/fonts.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
cd portfolioos
git add packages/api/assets/fonts packages/api/Dockerfile packages/api/test/will/fonts.test.ts
git commit -m "chore(will): bundle Noto Sans and Noto Sans Devanagari for will PDFs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Database - Will tables, RLS, grants, immutability, purge, vault guards, entitlement, audit actions

**Wave 1** (parallel with Tasks 1 and 2).

**Files:**
- Modify: `packages/api/prisma/schema.prisma` (User relations, `DocumentOwnerType.WILL`, new WILL MAKER block at the end)
- Create: `packages/api/prisma/migrations/20261014110000_will_document_owner/migration.sql`
- Create: `packages/api/prisma/migrations/20261014120000_will_maker/migration.sql`
- Modify: `packages/api/src/lib/prisma.ts` (`USER_SCOPED_MODELS` + `Will`, `WillVersion`)
- Modify: `packages/api/src/lib/audit.ts` (`AuditAction` + five `will_*` actions)
- Modify: `packages/shared/src/entitlements.ts` (`WILL_MAKER: 'PLUS'`)
- Modify: `packages/shared/src/types/documents.ts` (`DocumentOwnerType` + `'WILL'`)
- Modify: `packages/api/src/services/document.service.ts` (WILL owner check; WILL documents read-only outside Will Maker)
- Modify: `packages/api/src/controllers/document.controller.ts` (upload refuses `ownerType: WILL`)
- Modify: `packages/api/src/services/accountDeletion.service.ts` (purge `WillVersion`, `Will`)
- Modify: `packages/api/test/invariants/user-scoped-coverage.test.ts` (`MUST_BE_PROTECTED_BY_NAME` + `Will`, `WillVersion`)
- Test: `packages/api/test/will/willSchema.db.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - Prisma models `Will { id, userId, version, status: WillStatus, revision, currentStep, payload: Bytes, payloadSchemaVer, supersededById, generatedAt, executedAt, nextReviewAt, createdAt, updatedAt, versions }` and `WillVersion { id, willId, userId, versionNo, regime, templateId, templateVersion, rulesetVersion, inputHash, textHash, snapshotSealed: Bytes, documentId, pdfSha256, findingsJson: Json, generatedOn: Date, createdAt }`; enum `WillStatus { DRAFT GENERATED EXECUTED SUPERSEDED DISCARDED }`.
  - Postgres: one DRAFT per user (partial unique index `Will_one_draft_per_user`); `WillVersion` UPDATE rejected by trigger and not granted; DELETE only under system context.
  - `DocumentOwnerType.WILL`; `deleteDocument(userId, id, opts?: { allowWill?: boolean })` (new optional third parameter); `updateDocumentMeta` / `replaceDocumentBytes` / `deleteDocument` throw `ForbiddenError` for WILL documents unless `allowWill`.
  - `FEATURE_MIN_TIER.WILL_MAKER = 'PLUS'` (`requireFeature('WILL_MAKER')`, `hasFeature(plan, 'WILL_MAKER')`).
  - `AuditAction` values `will_created | will_viewed | will_generated | will_downloaded | will_discarded`.

- [ ] **Step 1: Write the failing test**

Create `packages/api/test/will/willSchema.db.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { WillStatus } from '@prisma/client';
import { hasFeature } from '@everypaisa/shared';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { ForbiddenError } from '../../src/lib/errors.js';
import { purgeUser } from '../../src/services/accountDeletion.service.js';
import {
  createDocument, deleteDocument, replaceDocumentBytes, updateDocumentMeta,
} from '../../src/services/document.service.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

function insertWill(userId: string, status: WillStatus, version: number) {
  return runAsSystem(() =>
    prisma.will.create({ data: { userId, version, status, payload: Buffer.from('sealed-elsewhere') } }),
  );
}

function insertVersion(userId: string, willId: string) {
  return runAsSystem(() =>
    prisma.willVersion.create({
      data: {
        willId, userId, versionNo: 1, regime: 'ISA_HINDU', templateId: 'isa-hindu', templateVersion: 1,
        rulesetVersion: 1, inputHash: 'a'.repeat(64), textHash: 'b'.repeat(64), snapshotSealed: Buffer.from('x'),
        documentId: 'doc-placeholder', pdfSha256: 'c'.repeat(64), findingsJson: [],
        generatedOn: new Date('2026-10-12T00:00:00Z'),
      },
    }),
  );
}

function wipeWills(userId: string) {
  return runAsSystem(async () => {
    await prisma.willVersion.deleteMany({ where: { userId } });
    await prisma.will.deleteMany({ where: { userId } });
  });
}

const pdf = () => Buffer.from('%PDF-1.7 test');

describe('Will tables', () => {
  let a: TestScope;
  let b: TestScope;

  beforeAll(async () => {
    a = await createTestScope('will-a');
    b = await createTestScope('will-b');
  });
  afterAll(async () => {
    await wipeWills(a.userId);
    await wipeWills(b.userId);
    await a.cleanup();
    await b.cleanup();
  });

  it('WILL_MAKER needs PLUS', () => {
    expect(hasFeature('FREE', 'WILL_MAKER')).toBe(false);
    expect(hasFeature('PLUS', 'WILL_MAKER')).toBe(true);
  });

  it('a user sees only their own wills', async () => {
    const w = await insertWill(a.userId, 'GENERATED', 1);
    expect(await a.runAs(() => prisma.will.count({ where: { id: w.id } }))).toBe(1);
    expect(await b.runAs(() => prisma.will.count({ where: { id: w.id } }))).toBe(0);
    await wipeWills(a.userId);
  });

  it('allows one DRAFT per user, any number of other statuses', async () => {
    await insertWill(a.userId, 'DRAFT', 10);
    await expect(insertWill(a.userId, 'DRAFT', 11)).rejects.toMatchObject({ code: 'P2002' });
    await insertWill(a.userId, 'GENERATED', 12);
    await insertWill(a.userId, 'SUPERSEDED', 13);
    await insertWill(b.userId, 'DRAFT', 10);
    await wipeWills(a.userId);
    await wipeWills(b.userId);
  });

  it('WillVersion rows cannot be updated, and users cannot delete them', async () => {
    const w = await insertWill(a.userId, 'GENERATED', 20);
    const v = await insertVersion(a.userId, w.id);
    await expect(
      runAsSystem(() => prisma.willVersion.update({ where: { id: v.id }, data: { textHash: 'd'.repeat(64) } })),
    ).rejects.toThrow();
    const del = await a.runAs(() => prisma.willVersion.deleteMany({ where: { id: v.id } }));
    expect(del.count).toBe(0);
    expect(await a.runAs(() => prisma.willVersion.count({ where: { id: v.id } }))).toBe(1);
    await wipeWills(a.userId);
  });

  it('WILL documents: owner check, and read-only in the vault', async () => {
    const w = await insertWill(a.userId, 'GENERATED', 30);
    const doc = await a.runAs(() =>
      createDocument({ userId: a.userId, ownerType: 'WILL', ownerId: w.id, fileName: 'will-v30.pdf', mimeType: 'application/pdf', buffer: pdf() }),
    );
    expect(doc.ownerType).toBe('WILL');
    await expect(
      b.runAs(() => createDocument({ userId: b.userId, ownerType: 'WILL', ownerId: w.id, fileName: 'x.pdf', mimeType: 'application/pdf', buffer: pdf() })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(a.runAs(() => updateDocumentMeta(a.userId, doc.id, { fileName: 'x.pdf' }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(a.runAs(() => replaceDocumentBytes(a.userId, doc.id, Buffer.from('y')))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(a.runAs(() => deleteDocument(a.userId, doc.id))).rejects.toBeInstanceOf(ForbiddenError);
    await a.runAs(() => deleteDocument(a.userId, doc.id, { allowWill: true }));
    expect(await a.runAs(() => prisma.document.count({ where: { id: doc.id } }))).toBe(0);
    await wipeWills(a.userId);
  });

  it('account purge removes wills, versions and will PDFs', async () => {
    const victim = await createTestScope('will-purge');
    const w = await insertWill(victim.userId, 'GENERATED', 1);
    await insertVersion(victim.userId, w.id);
    await victim.runAs(() =>
      createDocument({ userId: victim.userId, ownerType: 'WILL', ownerId: w.id, fileName: 'will-v1.pdf', mimeType: 'application/pdf', buffer: pdf() }),
    );
    await runAsSystem(() => purgeUser(victim.userId));
    const left = await runAsSystem(async () => ({
      wills: await prisma.will.count({ where: { userId: victim.userId } }),
      versions: await prisma.willVersion.count({ where: { userId: victim.userId } }),
      docs: await prisma.document.count({ where: { userId: victim.userId } }),
      blobs: await prisma.documentBlob.count({ where: { userId: victim.userId } }),
    }));
    expect(left).toEqual({ wills: 0, versions: 0, docs: 0, blobs: 0 });
    // The user row is gone, so victim.cleanup() would fail; nothing else to remove.
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/will/willSchema.db.test.ts
```
Expected: FAIL - `prisma.will` is undefined / `WILL_MAKER` is not a feature.

- [ ] **Step 3: Schema**

In `packages/api/prisma/schema.prisma`:

(a) In `model User`, directly after the line `dataKey UserDataKey?` add:
```prisma
  // Will Maker. Personal content is sealed inside Will.payload.
  wills        Will[]
  willVersions WillVersion[]
```

(b) In `enum DocumentOwnerType`, after `LOAN_GIVEN` add a line `  WILL`.

(c) Append at the very end of the file:
```prisma
// --- WILL MAKER ---
// Spec: docs/superpowers/specs/2026-10-12-will-maker-design.md.
// Everything personal lives in the sealed `payload` (lib/userKeys, slot
// "will:<id>"); plain columns hold only status, numbering, revision and dates.
// Raw SQL in 20261014120000_will_maker adds what Prisma cannot express:
// one DRAFT per user (partial unique index) and the WillVersion
// immutability trigger.

enum WillStatus {
  DRAFT
  GENERATED
  EXECUTED
  SUPERSEDED
  DISCARDED
}

model Will {
  id               String        @id @default(cuid())
  userId           String
  user             User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// Per-user number shown as "Version N".
  version          Int
  status           WillStatus    @default(DRAFT)
  /// Optimistic lock: every save must name the revision it read.
  revision         Int           @default(0)
  /// Wizard step to resume at (2-8; step 1 is the overview).
  currentStep      Int           @default(2)
  payload          Bytes
  payloadSchemaVer Int           @default(1)
  supersededById   String?
  generatedAt      DateTime?     @db.Timestamptz(3)
  executedAt       DateTime?     @db.Date
  nextReviewAt     DateTime?     @db.Date
  createdAt        DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt        DateTime      @updatedAt @db.Timestamptz(3)
  versions         WillVersion[]

  @@unique([userId, version])
  @@index([userId, status])
}

/// The generated, immutable copy of a will. UPDATE is refused by a trigger;
/// DELETE only under system context (account purge).
model WillVersion {
  id              String   @id @default(cuid())
  willId          String
  will            Will     @relation(fields: [willId], references: [id], onDelete: Cascade)
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  versionNo       Int
  regime          String
  templateId      String
  templateVersion Int
  rulesetVersion  Int
  /// sha256 of the canonical payload JSON.
  inputHash       String
  /// sha256 of renderWillText(blocks).
  textHash        String
  /// Canonical payload sealed under slot "willversion:<id>".
  snapshotSealed  Bytes
  /// Document (ownerType WILL) holding the PDF.
  documentId      String
  pdfSha256       String
  /// Rule ids and severities only - never messages or names.
  findingsJson    Json
  generatedOn     DateTime @db.Date
  createdAt       DateTime @default(now()) @db.Timestamptz(3)

  @@unique([willId, versionNo])
  @@index([userId, createdAt])
}
```

- [ ] **Step 4: Migrations**

Create `packages/api/prisma/migrations/20261014110000_will_document_owner/migration.sql`:
```sql
-- Will Maker stores generated PDFs in the vault. Its own migration because a
-- new enum value cannot be used in the transaction that adds it.
ALTER TYPE "DocumentOwnerType" ADD VALUE IF NOT EXISTS 'WILL';
```

Create `packages/api/prisma/migrations/20261014120000_will_maker/migration.sql`:
```sql
-- Will Maker (docs/superpowers/specs/2026-10-12-will-maker-design.md).
CREATE TYPE "WillStatus" AS ENUM ('DRAFT', 'GENERATED', 'EXECUTED', 'SUPERSEDED', 'DISCARDED');

CREATE TABLE "Will" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "WillStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "currentStep" INTEGER NOT NULL DEFAULT 2,
    "payload" BYTEA NOT NULL,
    "payloadSchemaVer" INTEGER NOT NULL DEFAULT 1,
    "supersededById" TEXT,
    "generatedAt" TIMESTAMPTZ(3),
    "executedAt" DATE,
    "nextReviewAt" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Will_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WillVersion" (
    "id" TEXT NOT NULL,
    "willId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "regime" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "rulesetVersion" INTEGER NOT NULL,
    "inputHash" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "snapshotSealed" BYTEA NOT NULL,
    "documentId" TEXT NOT NULL,
    "pdfSha256" TEXT NOT NULL,
    "findingsJson" JSONB NOT NULL,
    "generatedOn" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WillVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Will_userId_version_key" ON "Will"("userId", "version");
CREATE INDEX "Will_userId_status_idx" ON "Will"("userId", "status");
CREATE UNIQUE INDEX "WillVersion_willId_versionNo_key" ON "WillVersion"("willId", "versionNo");
CREATE INDEX "WillVersion_userId_createdAt_idx" ON "WillVersion"("userId", "createdAt");

ALTER TABLE "Will" ADD CONSTRAINT "Will_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WillVersion" ADD CONSTRAINT "WillVersion_willId_fkey"
  FOREIGN KEY ("willId") REFERENCES "Will"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WillVersion" ADD CONSTRAINT "WillVersion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One draft at a time per user. Not expressible in Prisma.
CREATE UNIQUE INDEX "Will_one_draft_per_user" ON "Will"("userId") WHERE "status" = 'DRAFT';

-- Owner-only, the same shape as "DocumentBlob" (20261006170000_document_blob).
ALTER TABLE "Will" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Will" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS will_owner ON "Will";
CREATE POLICY will_owner ON "Will"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

-- Generated copies: owners read and insert; nobody updates; only system
-- context (account purge) deletes.
ALTER TABLE "WillVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WillVersion" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS willversion_read ON "WillVersion";
CREATE POLICY willversion_read ON "WillVersion"
  FOR SELECT
  USING (app_is_system() OR "userId" = app_current_user_id());
DROP POLICY IF EXISTS willversion_insert ON "WillVersion";
CREATE POLICY willversion_insert ON "WillVersion"
  FOR INSERT
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
DROP POLICY IF EXISTS willversion_system_delete ON "WillVersion";
CREATE POLICY willversion_system_delete ON "WillVersion"
  FOR DELETE
  USING (app_is_system());

CREATE OR REPLACE FUNCTION will_version_reject_update() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'WillVersion rows are immutable' USING ERRCODE = 'insufficient_privilege';
END
$fn$;

DROP TRIGGER IF EXISTS "WillVersion_reject_update" ON "WillVersion";
CREATE TRIGGER "WillVersion_reject_update"
  BEFORE UPDATE ON "WillVersion"
  FOR EACH ROW EXECUTE FUNCTION will_version_reject_update();

-- Explicit grants, guarded for managed databases without the app role (the
-- pattern from 20260922140000_feed_run_log). Default privileges may already
-- have granted UPDATE on WillVersion; take it back.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolioos_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "Will" TO portfolioos_app';
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON "WillVersion" TO portfolioos_app';
    EXECUTE 'REVOKE UPDATE ON "WillVersion" FROM portfolioos_app';
  END IF;
END
$do$;
```

Apply to the isolated DB only, then regenerate the client:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split npx prisma migrate deploy
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split npx prisma migrate diff --from-url postgresql://postgres:postgres@localhost:5432/portfolioos_split --to-schema-datamodel prisma/schema.prisma --script
npx prisma generate
```
Expected: `migrate deploy` applies `20261014110000_will_document_owner` and `20261014120000_will_maker`. The `migrate diff` cross-check shows no statement touching `Will`, `WillVersion`, `WillStatus` or `DocumentOwnerType` other than possibly dropping `Will_one_draft_per_user` (Prisma does not model partial indexes - expected, ignore). Any other drift it lists is unrelated local drift: do not copy it anywhere.

- [ ] **Step 5: Register the models, audit actions, entitlement and owner type**

In `packages/api/src/lib/prisma.ts`, inside `USER_SCOPED_MODELS`, after `'SplitReminder',` add:
```ts
  // Will Maker (20261014120000_will_maker). Owner-only policies; WillVersion
  // is insert/read for owners and delete for system context only.
  'Will',
  'WillVersion',
```

In `packages/api/src/lib/audit.ts`, extend the `AuditAction` union after `| 'loan_rate_run_now'`:
```ts
  | 'will_created'
  | 'will_viewed'
  | 'will_generated'
  | 'will_downloaded'
  | 'will_discarded';
```
(remove the `;` that ended `| 'loan_rate_run_now'`).

In `packages/shared/src/entitlements.ts`, inside `FEATURE_MIN_TIER`, after `MF_ANALYTICS: 'PLUS',` add:
```ts
  // Will Maker: a fixed-template will under Indian law from the user's own
  // data (docs/superpowers/specs/2026-10-12-will-maker-design.md).
  WILL_MAKER: 'PLUS',
```

In `packages/shared/src/types/documents.ts`, add `| 'WILL'` after `| 'LOAN_GIVEN'` in `DocumentOwnerType`.

In `packages/api/test/invariants/user-scoped-coverage.test.ts`, change `MUST_BE_PROTECTED_BY_NAME` to:
```ts
const MUST_BE_PROTECTED_BY_NAME = [
  'MfAnalysisRun',
  'MfFinding',
  'MfFundVerdict',
  // Will Maker: a will's whole content, sealed or not, is one person's.
  'Will',
  'WillVersion',
] as const;
```

- [ ] **Step 6: Vault rules for WILL documents**

In `packages/api/src/services/document.service.ts`:

(a) In `assertOwnerAccessible`, before `case 'OTHER':` add:
```ts
    case 'WILL': {
      const row = await prisma.will.findFirst({
        where: { id: ownerId, userId },
        select: { id: true },
      });
      if (!row) throw new ForbiddenError('Will not owned by user');
      return;
    }
```

(b) After `function toDocumentDTO(...) {...}` add:
```ts
/**
 * A will PDF is the record of what was generated (its sha256 is on the
 * WillVersion row). The vault may list and download it, but renaming,
 * replacing or deleting it there would break that record. Only Will Maker
 * removes one, and only to undo a generate that failed half-way.
 */
function assertNotWillDocument(doc: Document): void {
  if (doc.ownerType === 'WILL') {
    throw new ForbiddenError('Will documents are managed by Will Maker');
  }
}
```

(c) In `updateDocumentMeta`, replace `await loadOwnedDocument(userId, id);` with:
```ts
  const doc = await loadOwnedDocument(userId, id);
  assertNotWillDocument(doc);
```

(d) In `replaceDocumentBytes`, after `const doc = await loadOwnedDocument(userId, id);` add `assertNotWillDocument(doc);`.

(e) Replace `deleteDocument` with:
```ts
export async function deleteDocument(
  userId: string,
  id: string,
  opts: { allowWill?: boolean } = {},
): Promise<void> {
  const doc = await loadOwnedDocument(userId, id);
  if (!opts.allowWill) assertNotWillDocument(doc);
  await prisma.document.delete({ where: { id } });
  await deleteFile(userId, doc.storageKey);
}
```

In `packages/api/src/controllers/document.controller.ts`, in `upload`, right after `const body = uploadBodySchema.parse(req.body);` add:
```ts
  if (body.ownerType === 'WILL') {
    throw new BadRequestError('Will documents are created by Will Maker', { field: 'ownerType' });
  }
```

- [ ] **Step 7: Account purge**

In `packages/api/src/services/accountDeletion.service.ts`, inside `purgeUser`'s `for (const id of userIds)` loop, after the `tx.splitGroup.deleteMany(...)` call add:
```ts
        // Will Maker: versions first (they reference the will). Both would
        // cascade from User, but the purge names every user table it relies
        // on. Will PDFs are Document rows and cascade with the user.
        await tx.willVersion.deleteMany({ where: { userId: id } });
        await tx.will.deleteMany({ where: { userId: id } });
```

- [ ] **Step 8: Rebuild shared and run the tests**

Run:
```bash
cd portfolioos && pnpm --filter @everypaisa/shared build
cd packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/will/willSchema.db.test.ts test/invariants/user-scoped-coverage.test.ts test/invariants/rls-context-coverage.test.ts test/services/accountDeletion.test.ts
```
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd portfolioos
git add packages/api/prisma/schema.prisma packages/api/prisma/migrations/20261014110000_will_document_owner packages/api/prisma/migrations/20261014120000_will_maker packages/api/src/lib/prisma.ts packages/api/src/lib/audit.ts packages/shared/src/entitlements.ts packages/shared/src/types/documents.ts packages/api/src/services/document.service.ts packages/api/src/controllers/document.controller.ts packages/api/src/services/accountDeletion.service.ts packages/api/test/invariants/user-scoped-coverage.test.ts packages/api/test/will/willSchema.db.test.ts
git commit -m "feat(will): Will and WillVersion tables with RLS, immutability and purge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Shared validation rules

**Wave 2** (parallel with Tasks 6 and 8; needs Task 1).

**Files:**
- Create: `packages/shared/src/will/validation/rules.ts`
- Create: `packages/shared/src/will/validation/index.ts`
- Modify: `packages/shared/src/will/index.ts` (one export line)
- Test: `packages/shared/src/will/validation/rules.test.ts`

**Interfaces:**
- Consumes (Task 1): `WillPayload`, `WillPerson`, `WillFinding`, `WillSeverity`, `ageOn`, `isMinorOn`, `ADULT_AGE`, `CHILD_RELATIONSHIPS`, `willMinorChildren`, `willBeneficiaryIds`, `sumPercents`, `willEstateTotals`; test builders `validWillPayload`, `person`, `item`, `TODAY`.
- Produces (exported from `@everypaisa/shared`):
  - `WILL_RULESET_VERSION = 1`
  - `interface WillRule { id: string; severity: WillSeverity; step: number; title: string; check(m: WillPayload, ctx: { today: string }): Array<{ message: string; refs?: string[] }> }`
  - `WILL_RULES: readonly WillRule[]` (23 rules, ids below)
  - `runWillRules(m: WillPayload, ctx: { today: string }): WillFinding[]` (sorted by step, then BLOCKER < WARNING < INFO, then rule order)
  - `hasWillBlockers(findings: readonly WillFinding[]): boolean`
  - `MUSLIM_LAW_MESSAGE: string`, `FOREIGN_LAW_MESSAGE: string`

Rule ids and placement:

| Id | Severity | Step |
|---|---|---|
| JURISDICTION_INDIA_ONLY, MUSLIM_LAW_UNSUPPORTED, REQUIRED_FIELDS, TESTATOR_ADULT | BLOCKER | 2 |
| EXECUTOR_APPOINTED, GUARDIAN_IF_MINOR_CHILDREN, EXECUTOR_GUARDIAN_INDIVIDUAL, CONTINGENT_IS_SELF | BLOCKER | 3 |
| DOB_MISSING_FOR_PERSON | WARNING | 3 |
| ITEMS_NEED_REVIEW, ESTATE_STALE, ESTATE_SOURCE_FAILED, JOINT_OWNERSHIP_ONLY_SHARE, HUF_COPARCENARY_SHARE | WARNING | 4 |
| NOMINEE_IS_TRUSTEE_NOTE | INFO | 4 |
| RESIDUARY_SUMS_100, SPECIFIC_ITEM_OVERALLOCATED, GIFT_ON_EXCLUDED_OR_LIABILITY, DANGLING_REFERENCE | BLOCKER | 5 |
| MINOR_BENEFICIARY, FIXED_GIFTS_EXCEED_NET_ESTATE, UNALLOCATED_ASSETS | WARNING | 5 |
| LEGAL_REVIEW_RECOMMENDED | INFO | 7 |

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/will/validation/rules.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { hasWillBlockers, runWillRules, WILL_RULES } from './rules.js';
import type { WillPayload } from '../schema.js';
import { item, person, TODAY, validWillPayload } from '../__tests__/fixtures.js';

const ctx = { today: TODAY };
const ids = (m: WillPayload) => runWillRules(m, ctx).map((f) => f.ruleId);
function mutate(fn: (m: WillPayload) => void): WillPayload {
  const m = validWillPayload();
  fn(m);
  return m;
}

describe('the valid fixture', () => {
  it('raises only the legal-review note', () => {
    const f = runWillRules(validWillPayload(), ctx);
    expect(f.map((x) => x.ruleId)).toEqual(['LEGAL_REVIEW_RECOMMENDED']);
    expect(hasWillBlockers(f)).toBe(false);
  });
});

describe('rule ids are unique and every rule has a step and title', () => {
  it('has 23 well-formed rules', () => {
    expect(WILL_RULES).toHaveLength(23);
    expect(new Set(WILL_RULES.map((r) => r.id)).size).toBe(23);
    for (const r of WILL_RULES) {
      expect(r.step).toBeGreaterThanOrEqual(2);
      expect(r.step).toBeLessThanOrEqual(7);
      expect(r.title.length).toBeGreaterThan(3);
    }
  });
});

// One golden case per rule: [rule id, expected severity, mutation that must trigger it].
const CASES: Array<[string, 'BLOCKER' | 'WARNING' | 'INFO', (m: WillPayload) => void]> = [
  ['JURISDICTION_INDIA_ONLY', 'BLOCKER', (m) => { m.details.jurisdiction = 'OTHER'; }],
  ['MUSLIM_LAW_UNSUPPORTED', 'BLOCKER', (m) => { m.details.personalLaw = 'MUSLIM'; }],
  ['REQUIRED_FIELDS', 'BLOCKER', (m) => { m.details.address = ''; }],
  ['TESTATOR_ADULT', 'BLOCKER', (m) => { m.details.dob = '2010-01-01'; }],
  ['EXECUTOR_APPOINTED', 'BLOCKER', (m) => { m.roles.executorId = null; }],
  ['GUARDIAN_IF_MINOR_CHILDREN', 'BLOCKER', (m) => { m.people.push(person({ id: 'kid', name: 'Kid', relationship: 'DAUGHTER', dob: '2016-03-03' })); }],
  ['EXECUTOR_GUARDIAN_INDIVIDUAL', 'BLOCKER', (m) => { m.roles.executorId = 'p-trust'; }],
  ['CONTINGENT_IS_SELF', 'BLOCKER', (m) => { m.people[1]!.contingentId = m.people[1]!.id; }],
  ['DOB_MISSING_FOR_PERSON', 'WARNING', (m) => { m.people[1]!.dob = null; }],
  ['ITEMS_NEED_REVIEW', 'WARNING', (m) => { m.estate.items[0]!.review = 'NEEDS_REVIEW'; }],
  ['ESTATE_STALE', 'WARNING', (m) => { m.estate.asOf = '2026-08-01'; }],
  ['ESTATE_SOURCE_FAILED', 'WARNING', (m) => { m.estate.failedSources = ['vehicles']; }],
  ['JOINT_OWNERSHIP_ONLY_SHARE', 'WARNING', (m) => { m.estate.items[0]!.ownership = { type: 'JOINT', sharePct: '50' }; }],
  ['HUF_COPARCENARY_SHARE', 'WARNING', (m) => { m.estate.items[0]!.ownership = { type: 'HUF', sharePct: '25' }; }],
  ['NOMINEE_IS_TRUSTEE_NOTE', 'INFO', (m) => { m.estate.items.push(item({ sourceKey: 'ins:1', kind: 'INSURANCE', label: 'LIC term policy', ownership: { type: 'NOMINEE_ONLY', sharePct: '100' } })); }],
  ['RESIDUARY_SUMS_100', 'BLOCKER', (m) => { m.allocation.residuary[0]!.sharePct = '50'; }],
  ['SPECIFIC_ITEM_OVERALLOCATED', 'BLOCKER', (m) => { m.allocation.specificGifts.push({ itemId: 'holdings:pf1:EQUITY', personId: 'p-spouse', sharePct: '10' }); }],
  ['GIFT_ON_EXCLUDED_OR_LIABILITY', 'BLOCKER', (m) => { m.allocation.specificGifts.push({ itemId: 'loan:l1', personId: 'p-spouse', sharePct: '100' }); }],
  ['DANGLING_REFERENCE', 'BLOCKER', (m) => { m.allocation.fixedGifts.push({ personId: 'gone', amount: '10' }); }],
  ['MINOR_BENEFICIARY', 'WARNING', (m) => {
    m.people.push(person({ id: 'kid', name: 'Kid', relationship: 'NIECE', dob: '2016-03-03' }));
    m.allocation.fixedGifts.push({ personId: 'kid', amount: '1000' });
  }],
  ['FIXED_GIFTS_EXCEED_NET_ESTATE', 'WARNING', (m) => { m.allocation.fixedGifts[0]!.amount = '99999999'; }],
  ['UNALLOCATED_ASSETS', 'WARNING', (m) => { m.allocation.residuary = []; }],
  ['LEGAL_REVIEW_RECOMMENDED', 'INFO', () => undefined],
];

describe.each(CASES)('%s', (id, severity, fn) => {
  it(`fires as ${severity}`, () => {
    const found = runWillRules(mutate(fn), ctx).find((f) => f.ruleId === id);
    expect(found?.severity).toBe(severity);
    expect(found?.message.length).toBeGreaterThan(10);
  });
});

describe('rule details', () => {
  it('RESIDUARY_SUMS_100 is exact: 33.34 + 33.33 + 33.33 passes, 3 x 33.33 does not', () => {
    const three = (shares: string[]) =>
      mutate((m) => {
        m.people.push(person({ id: 'p-d', name: 'D', relationship: 'DAUGHTER', dob: '1995-01-01' }));
        m.allocation.residuary = [
          { personId: 'p-spouse', sharePct: shares[0]! },
          { personId: 'p-son', sharePct: shares[1]! },
          { personId: 'p-d', sharePct: shares[2]! },
        ];
      });
    expect(ids(three(['33.34', '33.33', '33.33']))).not.toContain('RESIDUARY_SUMS_100');
    const bad = runWillRules(three(['33.33', '33.33', '33.33']), ctx).find((f) => f.ruleId === 'RESIDUARY_SUMS_100');
    expect(bad?.message).toContain('99.99%');
  });

  it('RESIDUARY_SUMS_100 refuses a person listed twice and a 0% share', () => {
    expect(ids(mutate((m) => { m.allocation.residuary = [{ personId: 'p-son', sharePct: '50' }, { personId: 'p-son', sharePct: '50' }]; })))
      .toContain('RESIDUARY_SUMS_100');
    expect(ids(mutate((m) => { m.allocation.residuary.push({ personId: 'p-trust', sharePct: '0' }); })))
      .toContain('RESIDUARY_SUMS_100');
  });

  it('a guardian appointed for a minor child clears the blocker', () => {
    const m = mutate((x) => {
      x.people.push(person({ id: 'kid', name: 'Kid', relationship: 'DAUGHTER', dob: '2016-03-03' }));
      x.roles.guardianId = 'p-spouse';
    });
    expect(ids(m)).not.toContain('GUARDIAN_IF_MINOR_CHILDREN');
  });

  it('a minor cannot be executor', () => {
    const m = mutate((x) => {
      x.people.push(person({ id: 'kid', name: 'Kid', relationship: 'NEPHEW', dob: '2016-03-03' }));
      x.roles.executorId = 'kid';
    });
    expect(ids(m)).toContain('EXECUTOR_GUARDIAN_INDIVIDUAL');
  });

  it('ESTATE_STALE fires when the estate was never fetched', () => {
    expect(ids(mutate((m) => { m.estate.asOf = null; }))).toContain('ESTATE_STALE');
    expect(ids(mutate((m) => { m.estate.asOf = '2026-09-12'; }))).not.toContain('ESTATE_STALE');
  });

  it('an excluded item given away is a blocker', () => {
    expect(ids(mutate((m) => { m.estate.items[1]!.review = 'EXCLUDED'; }))).toContain('GIFT_ON_EXCLUDED_OR_LIABILITY');
  });

  it('findings carry no names and point at ids', () => {
    const f = runWillRules(mutate((m) => { m.people[1]!.dob = null; }), ctx).find((x) => x.ruleId === 'DOB_MISSING_FOR_PERSON')!;
    expect(f.refs).toEqual(['p-son']);
    expect(f.message).not.toContain('Arjun');
  });

  it('sorts by step, then severity', () => {
    const f = runWillRules(mutate((m) => { m.details.address = ''; m.estate.items[0]!.review = 'NEEDS_REVIEW'; m.roles.executorId = null; }), ctx);
    expect(f.map((x) => x.ruleId)).toEqual(['REQUIRED_FIELDS', 'EXECUTOR_APPOINTED', 'ITEMS_NEED_REVIEW', 'LEGAL_REVIEW_RECOMMENDED']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd portfolioos/packages/shared && npx vitest run src/will/validation`
Expected: FAIL - cannot resolve `./rules.js`.

- [ ] **Step 3: Write the rules**

Create `packages/shared/src/will/validation/rules.ts`:
```ts
/**
 * Will Maker checks. Pure: the web runs them live on every edit, the API
 * re-runs them before preview and generate. Messages are fixed sentences with
 * counts only - never a name - because the API may return them.
 */
import { Decimal } from '../../decimal.js';
import type { WillPayload, WillPerson } from '../schema.js';
import type { WillFinding, WillSeverity } from '../wire.js';
import {
  ageOn, ADULT_AGE, CHILD_RELATIONSHIPS, isMinorOn, sumPercents, willBeneficiaryIds,
  willEstateTotals, willMinorChildren,
} from '../estateMath.js';

export const WILL_RULESET_VERSION = 1;

export const MUSLIM_LAW_MESSAGE =
  'Under Muslim personal law a will can generally give away only up to one-third of the estate, and gifts to legal heirs need the consent of the other heirs. Will Maker cannot prepare a will under Muslim personal law - please get legal advice.';
export const FOREIGN_LAW_MESSAGE =
  'Will Maker prepares wills under Indian law only. For a will in another country, please consult a lawyer there.';

export interface WillRuleContext {
  today: string;
}
export interface WillRuleHit {
  message: string;
  refs?: string[];
}
export interface WillRule {
  id: string;
  severity: WillSeverity;
  step: number;
  title: string;
  check(m: WillPayload, ctx: WillRuleContext): WillRuleHit[];
}

const NONE: WillRuleHit[] = [];
const hit = (message: string, refs: string[] = []): WillRuleHit[] => [{ message, refs }];
const people = (m: WillPayload) => new Map<string, WillPerson>(m.people.map((p) => [p.id, p]));
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const unique = (xs: string[]) => [...new Set(xs)];

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

function roleIds(m: WillPayload): string[] {
  const r = m.roles;
  return [r.executorId, r.altExecutorId, r.guardianId, r.altGuardianId].filter((x): x is string => !!x);
}

export const WILL_RULES: readonly WillRule[] = [
  {
    id: 'JURISDICTION_INDIA_ONLY', severity: 'BLOCKER', step: 2, title: 'Will made under Indian law',
    check: (m) => (m.details.jurisdiction === 'IN' ? NONE : hit(FOREIGN_LAW_MESSAGE)),
  },
  {
    id: 'MUSLIM_LAW_UNSUPPORTED', severity: 'BLOCKER', step: 2, title: 'Personal law supported',
    check: (m) => (m.details.personalLaw === 'MUSLIM' ? hit(MUSLIM_LAW_MESSAGE) : NONE),
  },
  {
    id: 'REQUIRED_FIELDS', severity: 'BLOCKER', step: 2, title: 'Your details are complete',
    check: (m) => {
      const d = m.details;
      const missing: string[] = [];
      if (!d.legalName) missing.push('full legal name');
      if (!d.dob) missing.push('date of birth');
      if (!d.personalLaw) missing.push('religion or personal law');
      if (!d.address) missing.push('address');
      if (!d.maritalStatus) missing.push('marital status');
      if (d.hasChildren === null) missing.push('whether you have children');
      return missing.length ? hit(`Fill in your ${missing.join(', ')}.`) : NONE;
    },
  },
  {
    id: 'TESTATOR_ADULT', severity: 'BLOCKER', step: 2, title: 'You are 18 or older',
    check: (m, c) =>
      m.details.dob && ageOn(m.details.dob, c.today) < ADULT_AGE ? hit('You must be 18 or older to make a will.') : NONE,
  },
  {
    id: 'EXECUTOR_APPOINTED', severity: 'BLOCKER', step: 3, title: 'Executor appointed',
    check: (m) => {
      const ex = m.roles.executorId;
      if (!ex || !people(m).has(ex)) return hit('Choose an executor - the person who will carry out your will.');
      if (m.roles.altExecutorId === ex) return hit('The back-up executor must be a different person.', [ex]);
      return NONE;
    },
  },
  {
    id: 'GUARDIAN_IF_MINOR_CHILDREN', severity: 'BLOCKER', step: 3, title: 'Guardian for children under 18',
    check: (m, c) => {
      const minors = willMinorChildren(m, c.today);
      if (minors.length === 0) return NONE;
      const g = m.roles.guardianId;
      if (!g || !people(m).has(g)) return hit('You have a child under 18 - choose a guardian.', minors.map((x) => x.id));
      if (m.roles.altGuardianId === g) return hit('The back-up guardian must be a different person.', [g]);
      return NONE;
    },
  },
  {
    id: 'EXECUTOR_GUARDIAN_INDIVIDUAL', severity: 'BLOCKER', step: 3, title: 'Executor and guardian are adults',
    check: (m, c) => {
      const map = people(m);
      const bad = roleIds(m).filter((id) => {
        const p = map.get(id);
        return !!p && (p.partyType !== 'INDIVIDUAL' || isMinorOn(p.dob, c.today) === true);
      });
      return bad.length
        ? hit('An executor or guardian must be an adult individual, not an organisation or a child.', unique(bad))
        : NONE;
    },
  },
  {
    id: 'CONTINGENT_IS_SELF', severity: 'BLOCKER', step: 3, title: 'Back-up beneficiaries are valid',
    check: (m) => {
      const bad = m.people.filter((p) => p.contingentId === p.id).map((p) => p.id);
      return bad.length ? hit('A person cannot be their own back-up beneficiary.', bad) : NONE;
    },
  },
  {
    id: 'DOB_MISSING_FOR_PERSON', severity: 'WARNING', step: 3, title: 'Dates of birth',
    check: (m) => {
      const beneficiaries = new Set(willBeneficiaryIds(m));
      const missing = m.people
        .filter((p) => p.partyType === 'INDIVIDUAL' && !p.dob && (CHILD_RELATIONSHIPS.includes(p.relationship) || beneficiaries.has(p.id)))
        .map((p) => p.id);
      return missing.length
        ? hit(`Add a date of birth for ${missing.length} ${plural(missing.length, 'person', 'people')} so we can tell whether anyone is under 18.`, missing)
        : NONE;
    },
  },
  {
    id: 'ITEMS_NEED_REVIEW', severity: 'WARNING', step: 4, title: 'Assets reviewed',
    check: (m) => {
      const keys = m.estate.items.filter((i) => i.review === 'NEEDS_REVIEW' || i.review === 'STALE').map((i) => i.sourceKey);
      return keys.length
        ? hit(`${keys.length} ${plural(keys.length, 'item still needs', 'items still need')} your review.`, keys)
        : NONE;
    },
  },
  {
    id: 'ESTATE_STALE', severity: 'WARNING', step: 4, title: 'Asset list is recent',
    check: (m, c) => {
      if (!m.estate.asOf) return hit('Your assets have not been fetched yet.');
      return daysBetween(m.estate.asOf, c.today) > 30 ? hit('Your asset list is more than 30 days old - refresh it.') : NONE;
    },
  },
  {
    id: 'ESTATE_SOURCE_FAILED', severity: 'WARNING', step: 4, title: 'All accounts were read',
    check: (m) =>
      m.estate.failedSources.length
        ? hit(`${m.estate.failedSources.length} ${plural(m.estate.failedSources.length, 'source', 'sources')} could not be read. Try refreshing, or add those assets by hand.`)
        : NONE,
  },
  {
    id: 'JOINT_OWNERSHIP_ONLY_SHARE', severity: 'WARNING', step: 4, title: 'Jointly held assets',
    check: (m) => {
      const keys = m.estate.items.filter((i) => i.review !== 'EXCLUDED' && i.ownership.type === 'JOINT').map((i) => i.sourceKey);
      return keys.length ? hit('Only your share of a jointly held asset passes under your will.', keys) : NONE;
    },
  },
  {
    id: 'HUF_COPARCENARY_SHARE', severity: 'WARNING', step: 4, title: 'HUF property',
    check: (m) => {
      const keys = m.estate.items.filter((i) => i.review !== 'EXCLUDED' && i.ownership.type === 'HUF').map((i) => i.sourceKey);
      return keys.length ? hit('For HUF property you can give away only your own share, as the law allows.', keys) : NONE;
    },
  },
  {
    id: 'NOMINEE_IS_TRUSTEE_NOTE', severity: 'INFO', step: 4, title: 'Nominations',
    check: (m) => {
      const keys = m.estate.items.filter((i) => i.review !== 'EXCLUDED' && i.ownership.type === 'NOMINEE_ONLY').map((i) => i.sourceKey);
      return keys.length
        ? hit('Insurance and nominated accounts are paid to the nominee, who generally holds the money for the heirs named in your will.', keys)
        : NONE;
    },
  },
  {
    id: 'RESIDUARY_SUMS_100', severity: 'BLOCKER', step: 5, title: 'Shares add up to 100%',
    check: (m) => {
      const r = m.allocation.residuary;
      if (r.length === 0) return hit('Share the rest of your estate - the percentages must add up to 100%.');
      const ids = r.map((x) => x.personId);
      if (new Set(ids).size !== ids.length) return hit('Each person can appear only once in the percentage split.');
      const zero = r.filter((x) => new Decimal(x.sharePct).isZero()).map((x) => x.personId);
      if (zero.length) return hit('Remove people with a 0% share.', zero);
      const total = sumPercents(r.map((x) => x.sharePct));
      return total.equals(100) ? NONE : hit(`The percentage split adds up to ${total.toFixed(2)}% - it must be exactly 100%.`);
    },
  },
  {
    id: 'SPECIFIC_ITEM_OVERALLOCATED', severity: 'BLOCKER', step: 5, title: 'No asset given away twice',
    check: (m) => {
      const byItem = new Map<string, Decimal>();
      for (const g of m.allocation.specificGifts) {
        byItem.set(g.itemId, (byItem.get(g.itemId) ?? new Decimal(0)).plus(g.sharePct));
      }
      const over = [...byItem.entries()].filter(([, v]) => v.greaterThan(100)).map(([k]) => k);
      return over.length ? hit('An asset is given away more than 100%.', over) : NONE;
    },
  },
  {
    id: 'GIFT_ON_EXCLUDED_OR_LIABILITY', severity: 'BLOCKER', step: 5, title: 'Gifts name real assets',
    check: (m) => {
      const items = new Map(m.estate.items.map((i) => [i.sourceKey, i]));
      const bad = m.allocation.specificGifts
        .filter((g) => {
          const i = items.get(g.itemId);
          return !i || i.review === 'EXCLUDED' || i.side === 'LIABILITY';
        })
        .map((g) => g.itemId);
      return bad.length
        ? hit('A gift names an asset that is excluded, is a liability, or is no longer in your list.', unique(bad))
        : NONE;
    },
  },
  {
    id: 'DANGLING_REFERENCE', severity: 'BLOCKER', step: 5, title: 'Everyone named is in your list',
    check: (m) => {
      const map = people(m);
      const named = [
        ...roleIds(m),
        ...m.people.map((p) => p.contingentId).filter((x): x is string => !!x),
        ...willBeneficiaryIds(m),
      ];
      const missing = unique(named.filter((id) => !map.has(id)));
      return missing.length ? hit('Something refers to a person who is no longer in your list.', missing) : NONE;
    },
  },
  {
    id: 'MINOR_BENEFICIARY', severity: 'WARNING', step: 5, title: 'Beneficiaries under 18',
    check: (m, c) => {
      const map = people(m);
      const minors = willBeneficiaryIds(m).filter((id) => {
        const p = map.get(id);
        return !!p && p.partyType === 'INDIVIDUAL' && isMinorOn(p.dob, c.today) === true;
      });
      return minors.length
        ? hit('A beneficiary is under 18 - their share will be managed by their guardian until they turn 18.', minors)
        : NONE;
    },
  },
  {
    id: 'FIXED_GIFTS_EXCEED_NET_ESTATE', severity: 'WARNING', step: 5, title: 'Money gifts fit your estate',
    check: (m) => {
      const fixed = m.allocation.fixedGifts.reduce((s, g) => s.plus(g.amount), new Decimal(0));
      if (fixed.isZero()) return NONE;
      const { net } = willEstateTotals(m.estate.items);
      return fixed.greaterThan(net) ? hit('Your money gifts add up to more than your estimated net estate.') : NONE;
    },
  },
  {
    id: 'UNALLOCATED_ASSETS', severity: 'WARNING', step: 5, title: 'Every asset has a recipient',
    check: (m) => {
      if (m.allocation.residuary.length > 0) return NONE;
      const gifted = new Set(m.allocation.specificGifts.map((g) => g.itemId));
      const loose = m.estate.items
        .filter((i) => i.side === 'ASSET' && i.review !== 'EXCLUDED' && i.ownership.type !== 'NOMINEE_ONLY' && !gifted.has(i.sourceKey))
        .map((i) => i.sourceKey);
      return loose.length
        ? hit(`${loose.length} ${plural(loose.length, 'asset is', 'assets are')} not given to anyone yet.`, loose)
        : NONE;
    },
  },
  {
    id: 'LEGAL_REVIEW_RECOMMENDED', severity: 'INFO', step: 7, title: 'Legal review',
    check: () => hit('Have a qualified advocate review your will before you sign it.'),
  },
];

const SEVERITY_RANK: Record<WillSeverity, number> = { BLOCKER: 0, WARNING: 1, INFO: 2 };

export function runWillRules(m: WillPayload, ctx: WillRuleContext): WillFinding[] {
  const out: Array<WillFinding & { order: number }> = [];
  WILL_RULES.forEach((rule, order) => {
    for (const h of rule.check(m, ctx)) {
      out.push({ ruleId: rule.id, severity: rule.severity, step: rule.step, message: h.message, refs: h.refs ?? [], order });
    }
  });
  out.sort((a, b) => a.step - b.step || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.order - b.order);
  return out.map(({ order: _order, ...f }) => f);
}

export function hasWillBlockers(findings: readonly WillFinding[]): boolean {
  return findings.some((f) => f.severity === 'BLOCKER');
}
```

Create `packages/shared/src/will/validation/index.ts`:
```ts
export * from './rules.js';
```

In `packages/shared/src/will/index.ts` add the line:
```ts
export * from './validation/index.js';
```

- [ ] **Step 4: Run the test to verify it passes, then build**

Run: `cd portfolioos/packages/shared && npx vitest run src/will && npx tsc --noEmit && pnpm build`
Expected: PASS (all `src/will` suites); no type errors.

- [ ] **Step 5: Commit**

```bash
cd portfolioos
git add packages/shared/src/will/validation packages/shared/src/will/index.ts
git commit -m "feat(will): shared validation rules for will drafts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Legal template (shared), amountInWords move, template lock

**Wave 3** (parallel with Tasks 7 and 9; needs Tasks 1 and 4).

**Files:**
- Move: `packages/api/src/services/receipts/amountInWords.ts` -> `packages/shared/src/amountInWords.ts` (content unchanged)
- Move: `packages/api/test/services/amountInWords.test.ts` -> `packages/shared/src/amountInWords.test.ts` (import path changed)
- Modify: `packages/shared/src/index.ts` (export `amountInWords`)
- Modify: `packages/api/src/services/receipts/receiptData.ts:26` (import from shared)
- Create: `packages/shared/src/will/template/common.v1.ts` (locked)
- Create: `packages/shared/src/will/template/isaHindu.v1.ts` (locked)
- Create: `packages/shared/src/will/template/isaGeneral.v1.ts` (locked)
- Create: `packages/shared/src/will/template/summary.v1.ts` (locked)
- Create: `packages/shared/src/will/template/index.ts`
- Create: `packages/shared/src/will/template/LOCK.json` (generated)
- Modify: `packages/shared/src/will/index.ts` (one export line)
- Create: `packages/api/scripts/willTemplateLock.ts`
- Test: `packages/shared/src/will/template/template.test.ts` (+ its `__snapshots__/` file), `packages/api/test/will/templateLock.test.ts`

**Interfaces:**
- Consumes (Tasks 1, 4): `WillPayload`, `WillPerson`, `WillAssetItem`, `WillBlock`, `renderWillText`, `willMinorChildren`, `PersonalLaw`, `MaritalStatus`, `WillRelationship`, `WILL_ESTATE_KINDS`; `formatINR`, `formatDateOnly`, `Decimal`.
- Produces (exported from `@everypaisa/shared`):
  - `amountInWords(amount: string | number): string` (unchanged behaviour)
  - `interface WillRenderContext { generatedOn: string }`
  - `type WillRegime = 'ISA_HINDU' | 'ISA_GENERAL'`
  - `interface WillTemplate { id: string; version: number; regime: WillRegime; render(m: WillPayload, ctx: WillRenderContext): WillBlock[] }`
  - `WILL_TEMPLATES: readonly WillTemplate[]` (`isa-hindu` v1, `isa-general` v1)
  - `regimeForLaw(law: PersonalLaw | null): WillRegime | null`
  - `selectWillTemplate(m: WillPayload): WillTemplate` (throws `Error('WILL_TEMPLATE_UNAVAILABLE')` for MUSLIM or unset law)
  - `renderWillSummary(m: WillPayload, ctx: WillRenderContext): WillBlock[]`, `WILL_SUMMARY_VERSION = 1`
  - API script exports `WILL_TEMPLATE_DIR: string`, `templateHashes(dir?: string): Record<string, string>`; running it writes `LOCK.json`.

- [ ] **Step 1: Move amountInWords to shared**

Run:
```bash
cd portfolioos
git mv packages/api/src/services/receipts/amountInWords.ts packages/shared/src/amountInWords.ts
git mv packages/api/test/services/amountInWords.test.ts packages/shared/src/amountInWords.test.ts
```
In `packages/shared/src/amountInWords.test.ts` change the import to:
```ts
import { amountInWords } from './amountInWords.js';
```
In `packages/shared/src/index.ts`, before the Will Maker export line add:
```ts
export * from './amountInWords.js';
```
In `packages/api/src/services/receipts/receiptData.ts` replace `import { amountInWords } from './amountInWords.js';` with:
```ts
import { amountInWords } from '@everypaisa/shared';
```

Run: `cd portfolioos/packages/shared && npx vitest run src/amountInWords.test.ts`
Expected: PASS (same cases as before the move).

- [ ] **Step 2: Write the failing template test**

Create `packages/shared/src/will/template/template.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { regimeForLaw, renderWillSummary, selectWillTemplate, WILL_TEMPLATES } from './index.js';
import { renderWillText } from '../ast.js';
import { person, TODAY, validWillPayload } from '../__tests__/fixtures.js';
import type { WillPayload } from '../schema.js';

const ctx = { generatedOn: TODAY };
const docText = (m: WillPayload) => renderWillText(selectWillTemplate(m).render(m, ctx));

describe('template selection', () => {
  it('maps personal law to a regime', () => {
    expect(regimeForLaw('HINDU')).toBe('ISA_HINDU');
    expect(regimeForLaw('SIKH')).toBe('ISA_HINDU');
    expect(regimeForLaw('JAIN')).toBe('ISA_HINDU');
    expect(regimeForLaw('BUDDHIST')).toBe('ISA_HINDU');
    expect(regimeForLaw('CHRISTIAN')).toBe('ISA_GENERAL');
    expect(regimeForLaw('PARSI')).toBe('ISA_GENERAL');
    expect(regimeForLaw('OTHER')).toBe('ISA_GENERAL');
    expect(regimeForLaw('MUSLIM')).toBeNull();
    expect(regimeForLaw(null)).toBeNull();
  });

  it('refuses Muslim personal law and an unset law', () => {
    const m = validWillPayload();
    m.details.personalLaw = 'MUSLIM';
    expect(() => selectWillTemplate(m)).toThrow('WILL_TEMPLATE_UNAVAILABLE');
    m.details.personalLaw = null;
    expect(() => selectWillTemplate(m)).toThrow('WILL_TEMPLATE_UNAVAILABLE');
  });

  it('lists one template per regime', () => {
    expect(WILL_TEMPLATES.map((t) => `${t.id}@${t.version}`)).toEqual(['isa-hindu@1', 'isa-general@1']);
  });
});

describe('isa-hindu v1', () => {
  const text = docText(validWillPayload());

  it('says the key things in plain sentences', () => {
    for (const line of [
      'LAST WILL AND TESTAMENT',
      'of Ramesh Kumar Verma',
      '1. Declaration',
      'I, Ramesh Kumar Verma, born on 15/05/1970, residing at 12 MG Road, Pune 411001, a Hindu by religion, to whom Part VI of the Indian Succession Act, 1925 applies in terms of section 57 of that Act, make this my last Will and Testament on 12/10/2026.',
      'I revoke all Wills, codicils and other testamentary writings made by me before this Will.',
      'I am married.',
      'I appoint my spouse Sunita Verma, born on 01/08/1972, as the Executor of this Will.',
      'If Sunita Verma dies before me, or is unable or unwilling to act, I appoint my son Arjun Verma, born on 10/02/1998, as Executor in their place.',
      '- Equity - My Portfolio: Arjun Verma (son)',
      'I give Pune Animal Trust the sum of ₹50,000 (Fifty thousand rupees only).',
      '- Arjun Verma (son): 40%',
      '- Sunita Verma (spouse): 60%',
      'If Arjun Verma does not survive me, everything given to Arjun Verma under this Will shall go to my spouse Sunita Verma, born on 01/08/1972.',
      'Additional wishes',
      'I wish my books to go to the Pune public library.',
      '- HDFC Bank savings account (XXXX1234): ₹2,50,000',
      '- Home loan - SBI: ₹4,00,000',
      'Signature of the Testator: ____________________',
      'Witness 2',
    ]) {
      expect(text).toContain(line);
    }
  });

  it('has no guardian clause without minor children, and no joint clause without joint assets', () => {
    expect(text).not.toContain('Guardian of my minor children');
    expect(text).not.toContain('Joint assets and nominations');
  });

  it('matches the golden snapshot', () => {
    expect(text).toMatchSnapshot();
  });
});

describe('isa-general v1', () => {
  it('uses the general Indian Succession Act declaration', () => {
    const m = validWillPayload();
    m.details.personalLaw = 'CHRISTIAN';
    const text = docText(m);
    expect(text).toContain('a Christian by religion, making this Will under the Indian Succession Act, 1925, make this my last Will');
    expect(text).not.toContain('section 57');
    expect(text).toMatchSnapshot();
  });
});

describe('optional clauses and determinism', () => {
  it('adds the guardian clause when there is a minor child and a guardian', () => {
    const m = validWillPayload();
    m.people.push(person({ id: 'kid', name: 'Meera Verma', relationship: 'DAUGHTER', dob: '2016-03-03' }));
    m.roles.guardianId = 'p-spouse';
    expect(docText(m)).toContain(
      'If any of my children is under eighteen years of age at my death, I appoint my spouse Sunita Verma, born on 01/08/1972, as the guardian of the person and property of that child.',
    );
  });

  it('adds the joint-assets clause and shows the share in the schedule', () => {
    const m = validWillPayload();
    m.estate.items[0]!.ownership = { type: 'JOINT', sharePct: '50' };
    const text = docText(m);
    expect(text).toContain('Where I hold an asset jointly with another person, only my share of it passes under this Will.');
    expect(text).toContain('- HDFC Bank savings account (XXXX1234): ₹2,50,000 (my share 50%)');
  });

  it('does not depend on the order people or shares were entered', () => {
    const a = validWillPayload();
    const b = validWillPayload();
    b.people.reverse();
    b.allocation.residuary.reverse();
    b.estate.items.reverse();
    expect(docText(b)).toBe(docText(a));
  });

  it('prints paise when a money gift has them', () => {
    const m = validWillPayload();
    m.allocation.fixedGifts[0]!.amount = '1000.50';
    expect(docText(m)).toContain('the sum of ₹1,000.50 (One thousand rupees and fifty paise only).');
  });
});

describe('summary v1', () => {
  it('describes the same choices in plain words', () => {
    const text = renderWillText(renderWillSummary(validWillPayload(), ctx));
    expect(text).toContain('Sunita Verma will carry out your will as executor, with Arjun Verma as back-up.');
    expect(text).toContain('Equity - My Portfolio goes to Arjun Verma.');
    expect(text).toContain('Pune Animal Trust receives ₹50,000.');
    expect(text).toContain('Everything else is shared: Arjun Verma 40%, Sunita Verma 60%.');
    expect(text).toContain('If Arjun Verma dies before you, their gifts go to Sunita Verma.');
    expect(text).toContain('two adult witnesses');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd portfolioos/packages/shared && npx vitest run src/will/template`
Expected: FAIL - cannot resolve `./index.js`.

- [ ] **Step 4: Write the clause builders**

Create `packages/shared/src/will/template/common.v1.ts`:
```ts
/**
 * Will template v1 - clause builders shared by every v1 regime.
 *
 * LOCKED (LOCK.json, checked by packages/api/test/will/templateLock.test.ts):
 * these words are what people sign. To change them, add common.v2.ts, point a
 * new template version at it, and lock the new file. Never edit this file.
 * Release gate: the text is reviewed by a qualified Indian advocate before launch.
 */
import { Decimal } from '../../decimal.js';
import { formatINR } from '../../format/number.js';
import { formatDateOnly } from '../../format/date.js';
import { amountInWords } from '../../amountInWords.js';
import type { WillBlock } from '../ast.js';
import {
  WILL_ESTATE_KINDS,
  type MaritalStatus, type WillAssetItem, type WillPayload, type WillPerson, type WillRelationship,
} from '../schema.js';
import { willMinorChildren } from '../estateMath.js';

export interface WillRenderContext {
  /** YYYY-MM-DD; printed as the date of the will. */
  generatedOn: string;
}

const RELATIONSHIP_WORDS: Record<WillRelationship, string> = {
  SPOUSE: 'spouse', SON: 'son', DAUGHTER: 'daughter', FATHER: 'father', MOTHER: 'mother',
  BROTHER: 'brother', SISTER: 'sister', GRANDSON: 'grandson', GRANDDAUGHTER: 'granddaughter',
  SON_IN_LAW: 'son-in-law', DAUGHTER_IN_LAW: 'daughter-in-law', NEPHEW: 'nephew', NIECE: 'niece',
  OTHER_RELATIVE: 'relative', FRIEND: 'friend', CHARITY: '', OTHER: '',
};

const NOT_FAMILY: ReadonlySet<WillRelationship> = new Set<WillRelationship>(['FRIEND', 'CHARITY', 'OTHER']);

const MARITAL_WORDS: Record<MaritalStatus, string> = {
  SINGLE: 'unmarried',
  MARRIED: 'married',
  WIDOWED: 'widowed',
  DIVORCED: 'divorced',
  SEPARATED: 'separated from my spouse',
};

export function byName(a: WillPerson, b: WillPerson): number {
  return a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id);
}

function byKindThenLabel(a: WillAssetItem, b: WillAssetItem): number {
  return WILL_ESTATE_KINDS.indexOf(a.kind) - WILL_ESTATE_KINDS.indexOf(b.kind)
    || a.label.localeCompare(b.label, 'en')
    || a.sourceKey.localeCompare(b.sourceKey);
}

/** "my son Arjun Verma, born on 10/02/1998" - used where the will names someone formally. */
export function describePerson(p: WillPerson): string {
  if (p.partyType === 'ORGANISATION') return p.name;
  const rel = RELATIONSHIP_WORDS[p.relationship];
  const born = p.dob ? `, born on ${formatDateOnly(p.dob)}` : '';
  return rel ? `my ${rel} ${p.name}${born}` : `${p.name}${born}`;
}

/** "Arjun Verma (son)" - used in tables. */
export function namePerson(p: WillPerson): string {
  const rel = RELATIONSHIP_WORDS[p.relationship];
  return p.partyType === 'INDIVIDUAL' && rel ? `${p.name} (${rel})` : p.name;
}

export function pctText(v: string): string {
  return `${new Decimal(v).toFixed(2).replace(/\.00$/, '')}%`;
}

export function inrFigure(v: string): string {
  return formatINR(v, { fractionDigits: new Decimal(v).isInteger() ? 0 : 2 });
}

export function moneyText(v: string): string {
  return `${inrFigure(v)} (${amountInWords(new Decimal(v).toFixed(2))})`;
}

export function itemText(i: WillAssetItem): string {
  return i.ref ? `${i.label} (${i.ref})` : i.label;
}

function scheduleValue(i: WillAssetItem): string {
  const base = inrFigure(i.value);
  if (i.ownership.type === 'JOINT' || i.ownership.type === 'HUF') return `${base} (my share ${pctText(i.ownership.sharePct)})`;
  if (i.ownership.type === 'NOMINEE_ONLY') return `${base} (paid to the nominee)`;
  return base;
}

interface Resolved {
  people: Map<string, WillPerson>;
  get(id: string | null): WillPerson | null;
}

function resolve(m: WillPayload): Resolved {
  const people = new Map(m.people.map((p) => [p.id, p]));
  return { people, get: (id) => (id ? people.get(id) ?? null : null) };
}

export interface ResolvedGifts {
  specific: Array<{ item: WillAssetItem; who: WillPerson; pct: string }>;
  fixed: Array<{ who: WillPerson; amount: string }>;
  residuary: Array<{ who: WillPerson; pct: string }>;
  backups: Array<{ who: WillPerson; backup: WillPerson }>;
}

/** Gifts joined to their people and items, in a fixed order (input order never matters). */
export function resolveGifts(m: WillPayload): ResolvedGifts {
  const r = resolve(m);
  const items = new Map(m.estate.items.map((i) => [i.sourceKey, i]));
  const specific: ResolvedGifts['specific'] = [];
  for (const g of m.allocation.specificGifts) {
    const item = items.get(g.itemId);
    const who = r.get(g.personId);
    if (item && who) specific.push({ item, who, pct: g.sharePct });
  }
  specific.sort((a, b) => a.item.label.localeCompare(b.item.label, 'en') || byName(a.who, b.who));
  const fixed: ResolvedGifts['fixed'] = [];
  for (const g of m.allocation.fixedGifts) {
    const who = r.get(g.personId);
    if (who) fixed.push({ who, amount: g.amount });
  }
  fixed.sort((a, b) => byName(a.who, b.who) || new Decimal(a.amount).comparedTo(b.amount));
  const residuary: ResolvedGifts['residuary'] = [];
  for (const g of m.allocation.residuary) {
    const who = r.get(g.personId);
    if (who) residuary.push({ who, pct: g.sharePct });
  }
  residuary.sort((a, b) => byName(a.who, b.who));
  const backups: ResolvedGifts['backups'] = [];
  for (const p of m.people) {
    const backup = r.get(p.contingentId);
    if (backup) backups.push({ who: p, backup });
  }
  backups.sort((a, b) => byName(a.who, b.who));
  return { specific, fixed, residuary, backups };
}

/** The full will. `standing` completes "I, NAME, born on ..., residing at ..., <standing>, make this ...". */
export function willDocumentBlocks(m: WillPayload, ctx: WillRenderContext, standing: string): WillBlock[] {
  const r = resolve(m);
  const gifts = resolveGifts(m);
  const d = m.details;
  const live = m.estate.items.filter((i) => i.review !== 'EXCLUDED');
  const assets = live.filter((i) => i.side === 'ASSET').sort(byKindThenLabel);
  const liabilities = live.filter((i) => i.side === 'LIABILITY').sort(byKindThenLabel);
  const blocks: WillBlock[] = [
    { t: 'title', text: 'Last Will and Testament' },
    { t: 'heading', text: `of ${d.legalName}` },
  ];
  let n = 0;
  const clause = (title: string, paras: string[]) => {
    blocks.push({ t: 'clause', n: ++n, title, paras });
  };

  clause('Declaration', [
    `I, ${d.legalName}, born on ${formatDateOnly(d.dob)}, residing at ${d.address}, ${standing}, make this my last Will and Testament on ${formatDateOnly(ctx.generatedOn)}.`,
    'I revoke all Wills, codicils and other testamentary writings made by me before this Will.',
  ]);

  clause('Sound mind and free will', [
    'I make this Will of my own free will, while of sound mind and memory, and without any coercion, fraud or undue influence from anyone.',
  ]);

  const family = m.people
    .filter((p) => p.partyType === 'INDIVIDUAL' && !NOT_FAMILY.has(p.relationship))
    .sort(byName);
  clause('My family', [
    ...(d.maritalStatus ? [`I am ${MARITAL_WORDS[d.maritalStatus]}.`] : []),
    family.length
      ? `The members of my family named in this Will are: ${family.map(describePerson).join('; ')}.`
      : 'I have not named any member of my family in this Will.',
  ]);

  const ex = r.get(m.roles.executorId);
  const altEx = r.get(m.roles.altExecutorId);
  if (ex) {
    clause('Executor', [
      `I appoint ${describePerson(ex)} as the Executor of this Will.`,
      ...(altEx
        ? [`If ${ex.name} dies before me, or is unable or unwilling to act, I appoint ${describePerson(altEx)} as Executor in their place.`]
        : []),
      'My Executor may collect my assets, pay my debts and expenses, sell or transfer any asset where needed, and distribute my estate as this Will directs.',
    ]);
  }

  const guardian = r.get(m.roles.guardianId);
  const altGuardian = r.get(m.roles.altGuardianId);
  if (guardian && willMinorChildren(m, ctx.generatedOn).length > 0) {
    clause('Guardian of my minor children', [
      `If any of my children is under eighteen years of age at my death, I appoint ${describePerson(guardian)} as the guardian of the person and property of that child.`,
      ...(altGuardian
        ? [`If ${guardian.name} is unable or unwilling to act, I appoint ${describePerson(altGuardian)} as guardian in their place.`]
        : []),
    ]);
  }

  if (gifts.specific.length) {
    clause('Specific gifts', [
      'I give each asset listed below to the person named against it. Where a percentage is shown, that person receives that share of the asset.',
    ]);
    blocks.push({
      t: 'table',
      title: null,
      rows: gifts.specific.map((x) => [
        itemText(x.item),
        new Decimal(x.pct).equals(100) ? namePerson(x.who) : `${namePerson(x.who)} - ${pctText(x.pct)}`,
      ]),
    });
  }

  if (gifts.fixed.length) {
    clause('Gifts of money', [
      ...gifts.fixed.map((x) => `I give ${describePerson(x.who)} the sum of ${moneyText(x.amount)}.`),
      'These sums shall be paid out of my estate before the residue is divided.',
    ]);
  }

  clause('Residuary estate', [
    'I give all the rest and residue of my estate - including any asset not given above, any gift that fails, and anything I acquire after signing this Will - to the following persons in the shares shown:',
  ]);
  blocks.push({ t: 'table', title: null, rows: gifts.residuary.map((x) => [namePerson(x.who), pctText(x.pct)]) });

  clause('If a beneficiary dies before me', [
    'A person must survive me by thirty days to receive anything under this Will.',
    ...gifts.backups.map(
      (x) => `If ${x.who.name} does not survive me, everything given to ${x.who.name} under this Will shall go to ${describePerson(x.backup)}.`,
    ),
    'Any other gift that fails shall fall into my residuary estate. If a share of my residuary estate fails, it shall be divided among the other residuary beneficiaries in proportion to their shares.',
  ]);

  clause('Debts and expenses', [
    'My Executor shall pay my debts, funeral and testamentary expenses, and any taxes due from my estate out of my residuary estate before it is divided.',
    ...(liabilities.length ? ['My known liabilities on the date of this Will are listed in the Schedule.'] : []),
  ]);

  const hasJoint = live.some((i) => i.ownership.type === 'JOINT');
  const hasNominee = live.some((i) => i.ownership.type === 'NOMINEE_ONLY');
  const hasHuf = live.some((i) => i.ownership.type === 'HUF');
  if (hasJoint || hasNominee || hasHuf) {
    clause('Joint assets and nominations', [
      ...(hasJoint ? ['Where I hold an asset jointly with another person, only my share of it passes under this Will.'] : []),
      ...(hasNominee
        ? ['A person registered as my nominee for any bank account, deposit, insurance policy, provident fund or investment shall hold what they receive for the persons entitled under this Will, except where the law makes the nominee its owner.']
        : []),
      ...(hasHuf
        ? ['My interest in any Hindu Undivided Family property passes under this Will only to the extent the law allows me to dispose of it.']
        : []),
    ]);
  }

  const wishes = m.instructions.text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (wishes.length) clause('Additional wishes', wishes);

  if (assets.length || liabilities.length) {
    blocks.push({ t: 'heading', text: 'Schedule' });
    blocks.push({
      t: 'para',
      text: `Assets and liabilities known to me on ${formatDateOnly(m.estate.asOf ?? ctx.generatedOn)}. Values are estimates for identification only; this list does not limit my residuary estate.`,
    });
    if (assets.length) blocks.push({ t: 'table', title: 'Assets', rows: assets.map((i) => [itemText(i), scheduleValue(i)]) });
    if (liabilities.length) blocks.push({ t: 'table', title: 'Liabilities', rows: liabilities.map((i) => [itemText(i), inrFigure(i.value)]) });
  }

  blocks.push({ t: 'para', text: 'In witness whereof I have signed this Will on the date and at the place written below.' });
  blocks.push({
    t: 'signature',
    lines: [
      'Place: ____________________',
      'Date: ____________________',
      '',
      'Signature of the Testator: ____________________',
      `(${d.legalName})`,
    ],
  });
  blocks.push({
    t: 'witnesses',
    intro: 'Signed by the Testator as the last Will in our presence, both of us being present at the same time, and signed by us in the presence of the Testator and of each other. Neither of us is a beneficiary under this Will or the spouse of a beneficiary.',
    count: 2,
    fields: ['Signature', 'Full name', 'Address', 'Date'],
  });
  return blocks;
}
```

- [ ] **Step 5: Write the regime templates, the summary and the selector**

Create `packages/shared/src/will/template/isaHindu.v1.ts`:
```ts
/**
 * Hindus, Sikhs, Jains and Buddhists: wills are governed by Part VI of the
 * Indian Succession Act, 1925 through section 57. LOCKED (see common.v1.ts).
 */
import type { WillPayload } from '../schema.js';
import type { WillBlock } from '../ast.js';
import { willDocumentBlocks, type WillRenderContext } from './common.v1.js';

const RELIGION: Record<string, string> = {
  HINDU: 'a Hindu',
  SIKH: 'a Sikh',
  JAIN: 'a Jain',
  BUDDHIST: 'a Buddhist',
};

export const ISA_HINDU_V1 = {
  id: 'isa-hindu',
  version: 1,
  regime: 'ISA_HINDU' as const,
  render(m: WillPayload, ctx: WillRenderContext): WillBlock[] {
    const who = RELIGION[m.details.personalLaw ?? ''] ?? 'a Hindu';
    return willDocumentBlocks(
      m,
      ctx,
      `${who} by religion, to whom Part VI of the Indian Succession Act, 1925 applies in terms of section 57 of that Act`,
    );
  },
};
```

Create `packages/shared/src/will/template/isaGeneral.v1.ts`:
```ts
/** Christians, Parsis and others domiciled in India: Indian Succession Act, 1925. LOCKED (see common.v1.ts). */
import type { WillPayload } from '../schema.js';
import type { WillBlock } from '../ast.js';
import { willDocumentBlocks, type WillRenderContext } from './common.v1.js';

const STANDING: Record<string, string> = {
  CHRISTIAN: 'a Christian by religion',
  PARSI: 'a Parsi by religion',
  OTHER: 'domiciled in India',
};

export const ISA_GENERAL_V1 = {
  id: 'isa-general',
  version: 1,
  regime: 'ISA_GENERAL' as const,
  render(m: WillPayload, ctx: WillRenderContext): WillBlock[] {
    const who = STANDING[m.details.personalLaw ?? ''] ?? 'domiciled in India';
    return willDocumentBlocks(m, ctx, `${who}, making this Will under the Indian Succession Act, 1925`);
  },
};
```

Create `packages/shared/src/will/template/summary.v1.ts`:
```ts
/** Plain-language summary shown above the will in the preview. LOCKED (see common.v1.ts). */
import type { WillPayload } from '../schema.js';
import type { WillBlock } from '../ast.js';
import { willMinorChildren } from '../estateMath.js';
import { Decimal } from '../../decimal.js';
import { inrFigure, itemText, pctText, resolveGifts, type WillRenderContext } from './common.v1.js';

export const SUMMARY_V1 = {
  id: 'summary',
  version: 1,
  render(m: WillPayload, ctx: WillRenderContext): WillBlock[] {
    const people = new Map(m.people.map((p) => [p.id, p]));
    const get = (id: string | null) => (id ? people.get(id) ?? null : null);
    const gifts = resolveGifts(m);
    const out: WillBlock[] = [
      { t: 'heading', text: 'Your will in plain words' },
      { t: 'para', text: 'This summary helps you check your choices. The will below is the legal document.' },
    ];
    const ex = get(m.roles.executorId);
    const altEx = get(m.roles.altExecutorId);
    if (ex) out.push({ t: 'para', text: `${ex.name} will carry out your will as executor${altEx ? `, with ${altEx.name} as back-up` : ''}.` });
    const g = get(m.roles.guardianId);
    const altG = get(m.roles.altGuardianId);
    if (g && willMinorChildren(m, ctx.generatedOn).length > 0) {
      out.push({ t: 'para', text: `${g.name} will look after your children under 18${altG ? `, with ${altG.name} as back-up` : ''}.` });
    }
    for (const x of gifts.specific) {
      const share = new Decimal(x.pct).equals(100) ? '' : ` (${pctText(x.pct)})`;
      out.push({ t: 'para', text: `${itemText(x.item)} goes to ${x.who.name}${share}.` });
    }
    for (const x of gifts.fixed) out.push({ t: 'para', text: `${x.who.name} receives ${inrFigure(x.amount)}.` });
    if (gifts.residuary.length) {
      out.push({ t: 'para', text: `Everything else is shared: ${gifts.residuary.map((x) => `${x.who.name} ${pctText(x.pct)}`).join(', ')}.` });
    }
    for (const x of gifts.backups) out.push({ t: 'para', text: `If ${x.who.name} dies before you, their gifts go to ${x.backup.name}.` });
    const live = m.estate.items.filter((i) => i.review !== 'EXCLUDED');
    if (live.some((i) => i.ownership.type === 'JOINT')) {
      out.push({ t: 'para', text: 'Only your share of jointly held assets passes under the will.' });
    }
    if (live.some((i) => i.ownership.type === 'NOMINEE_ONLY')) {
      out.push({ t: 'para', text: 'Insurance and nominated accounts are paid to the nominee first.' });
    }
    out.push({
      t: 'note',
      text: 'Your will counts only once you sign it in front of two adult witnesses who are not beneficiaries (or the spouse of one), and they sign it too. Registration is optional.',
    });
    return out;
  },
};
```

Create `packages/shared/src/will/template/index.ts`:
```ts
import type { PersonalLaw, WillPayload } from '../schema.js';
import type { WillBlock } from '../ast.js';
import type { WillRenderContext } from './common.v1.js';
import { ISA_HINDU_V1 } from './isaHindu.v1.js';
import { ISA_GENERAL_V1 } from './isaGeneral.v1.js';
import { SUMMARY_V1 } from './summary.v1.js';

export type { WillRenderContext } from './common.v1.js';
export type WillRegime = 'ISA_HINDU' | 'ISA_GENERAL';

export interface WillTemplate {
  id: string;
  version: number;
  regime: WillRegime;
  render(m: WillPayload, ctx: WillRenderContext): WillBlock[];
}

/** The current template per regime. A new version replaces its entry here. */
export const WILL_TEMPLATES: readonly WillTemplate[] = [ISA_HINDU_V1, ISA_GENERAL_V1];
export const WILL_SUMMARY_VERSION = SUMMARY_V1.version;

export function regimeForLaw(law: PersonalLaw | null): WillRegime | null {
  switch (law) {
    case 'HINDU':
    case 'SIKH':
    case 'JAIN':
    case 'BUDDHIST':
      return 'ISA_HINDU';
    case 'CHRISTIAN':
    case 'PARSI':
    case 'OTHER':
      return 'ISA_GENERAL';
    default:
      return null;
  }
}

export function selectWillTemplate(m: WillPayload): WillTemplate {
  const regime = regimeForLaw(m.details.personalLaw);
  const t = regime ? WILL_TEMPLATES.find((x) => x.regime === regime) : undefined;
  if (!t) throw new Error('WILL_TEMPLATE_UNAVAILABLE');
  return t;
}

export function renderWillSummary(m: WillPayload, ctx: WillRenderContext): WillBlock[] {
  return SUMMARY_V1.render(m, ctx);
}
```

In `packages/shared/src/will/index.ts` add:
```ts
export * from './template/index.js';
```

- [ ] **Step 6: Run the template test**

Run: `cd portfolioos/packages/shared && npx vitest run src/will src/amountInWords.test.ts && npx tsc --noEmit && pnpm build`
Expected: PASS; the first run writes `src/will/template/__snapshots__/template.test.ts.snap`. Open the snapshot and read the Hindu and Christian wills end to end: every clause reads as a sentence, dates are dd/mm/yyyy, amounts carry `₹`, and no line contains an en/em dash.

- [ ] **Step 7: Write the lock script and the failing lock test**

Create `packages/api/scripts/willTemplateLock.ts`:
```ts
/**
 * Will template lock. Every locked template file (`*.v<N>.ts` in
 * packages/shared/src/will/template) is listed in LOCK.json with its sha256.
 * test/will/templateLock.test.ts fails if a locked file changes: wording
 * changes need a new versioned file, never an edit.
 *
 * Write the lock (only when adding a NEW versioned file):
 *   cd portfolioos/packages/api && npx tsx scripts/willTemplateLock.ts
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WILL_TEMPLATE_DIR = fileURLToPath(new URL('../../shared/src/will/template/', import.meta.url));

/** sha256 per locked file, CRLF normalised so a Windows checkout hashes the same. */
export function templateHashes(dir: string = WILL_TEMPLATE_DIR): Record<string, string> {
  const files = readdirSync(dir).filter((f) => /\.v\d+\.ts$/.test(f)).sort();
  return Object.fromEntries(
    files.map((f) => [
      f,
      createHash('sha256').update(readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n')).digest('hex'),
    ]),
  );
}

const isMain = !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  writeFileSync(join(WILL_TEMPLATE_DIR, 'LOCK.json'), `${JSON.stringify(templateHashes(), null, 2)}\n`);
  process.stdout.write('LOCK.json written\n');
}
```

Create `packages/api/test/will/templateLock.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WILL_TEMPLATES } from '@everypaisa/shared';
import { templateHashes, WILL_TEMPLATE_DIR } from '../../scripts/willTemplateLock.js';

function lock(): Record<string, string> {
  return JSON.parse(readFileSync(join(WILL_TEMPLATE_DIR, 'LOCK.json'), 'utf8')) as Record<string, string>;
}

describe('will template lock', () => {
  it('no locked template file has changed (change wording with a new vN file, never an edit)', () => {
    expect(templateHashes()).toEqual(lock());
  });

  it('every current template has its own locked file', () => {
    const files = Object.keys(lock());
    for (const t of WILL_TEMPLATES) {
      const base = t.id.replace(/-([a-z])/g, (_m: string, c: string) => c.toUpperCase());
      expect(files).toContain(`${base}.v${t.version}.ts`);
    }
    expect(files).toContain('common.v1.ts');
    expect(files).toContain('summary.v1.ts');
  });
});
```

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/will/templateLock.test.ts
```
Expected: FAIL - `LOCK.json` does not exist (ENOENT).

- [ ] **Step 8: Write the lock and re-run**

Run:
```bash
cd portfolioos/packages/api && npx tsx scripts/willTemplateLock.ts
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/will/templateLock.test.ts test/services/receipts.test.ts
npx tsc -p tsconfig.scripts.json --noEmit
```
Expected: `LOCK.json written`, listing `common.v1.ts`, `isaGeneral.v1.ts`, `isaHindu.v1.ts`, `summary.v1.ts`; lock test PASS; `test/services/receipts.test.ts` still PASS; no type errors.

- [ ] **Step 9: Commit**

```bash
cd portfolioos
git add packages/shared/src/amountInWords.ts packages/shared/src/amountInWords.test.ts packages/shared/src/index.ts packages/api/src/services/receipts/receiptData.ts packages/shared/src/will/template packages/shared/src/will/index.ts packages/api/scripts/willTemplateLock.ts packages/api/test/will/templateLock.test.ts
git commit -m "feat(will): fixed will templates under the Indian Succession Act, locked

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Estate itemiser - adapters, collection, reconcile

**Wave 2** (parallel with Tasks 4 and 8; needs Tasks 1 and 3).

**Files:**
- Create: `packages/api/src/services/will/estate/types.ts`
- Create: `packages/api/src/services/will/estate/adapters/financial.ts` (holdings, bank accounts, PF accounts)
- Create: `packages/api/src/services/will/estate/adapters/property.ts` (owned property, rental property, vehicles)
- Create: `packages/api/src/services/will/estate/adapters/protection.ts` (insurance)
- Create: `packages/api/src/services/will/estate/adapters/credit.ts` (loans given, loans, credit cards)
- Create: `packages/api/src/services/will/estate/registry.ts`
- Create: `packages/api/src/services/will/estate/reconcile.ts`
- Modify: `packages/api/src/services/loans.service.ts` (add `loanPosition`)
- Modify: `packages/api/src/services/loansGiven.service.ts` (add `loanGivenOutstanding`, export `LoanGivenRow`; `outstandingLoansGiven` uses it)
- Modify: `packages/api/src/services/dashboard.service.ts` (export `ASSET_CLASS_LABELS`; loans loop uses `loanPosition`)
- Create: `packages/api/test/will/willFixtures.ts`
- Test: `packages/api/test/will/reconcile.test.ts`, `packages/api/test/will/estateAdapters.db.test.ts`

**Interfaces:**
- Consumes (Task 1): `WillAssetItem`, `WILL_MANUAL_ITEM_PREFIX`, `toAmount2`, `Decimal`, `istCalendarDate`; (Task 3) migrated schema.
- Produces:
  - `interface EstateContext { userId: string; today: string }`
  - `type EstateCandidate = Omit<WillAssetItem, 'userEdited' | 'review'> & { review: 'CONFIRMED' | 'NEEDS_REVIEW' | 'EXCLUDED' }`
  - `interface EstateAdapter { id: string; version: string; collect(ctx: EstateContext): Promise<EstateCandidate[]> }`
  - `interface EstateCollection { candidates: EstateCandidate[]; failed: string[] }`
  - `DEFAULT_ESTATE_ADAPTERS: readonly EstateAdapter[]`, `MAX_ESTATE_CANDIDATES = 400`
  - `collectEstate(ctx: EstateContext, adapters?: readonly EstateAdapter[]): Promise<EstateCollection>` (never throws for an adapter failure)
  - `candidateToItem(c): WillAssetItem`, `candidatesToItems(cs): WillAssetItem[]`, `reconcileEstate(existing: readonly WillAssetItem[], candidates: readonly EstateCandidate[]): WillAssetItem[]`
  - `loanPosition(loan: StoredLoan): { outstanding: Decimal; firstUnpaid: AmortizationRow | null; scheduleFailed: boolean }` (loans.service)
  - `loanGivenOutstanding(loan: LoanGivenRow): Decimal`, `type LoanGivenRow` (loansGiven.service)
  - `ASSET_CLASS_LABELS: Record<string, string>` (dashboard.service, now exported)
  - Test helpers: `TODAY`, `validWillPayload()`, `seedEstateFixture(userId, portfolioId)`, `clearEstateFixture(userId)`

Source keys: `holdings:<portfolioId>:<assetClass>`, `bank:<id>`, `pf:<id>`, `ownedProperty:<id>`, `rentalProperty:<id>`, `vehicle:<id>`, `insurance:<id>`, `loanGiven:<id>`, `loan:<id>`, `card:<id>`.

Intentional differences from `getDashboardNetWorth` (documented in `registry.ts`): bank accounts and owned property are included (the dashboard omits them); PF-backed holdings move from the holdings group to the PF item; rental properties linked from an owned property are skipped; inactive rental properties are skipped; a rental or owned property without a current value falls back to its purchase price; zero-balance cards and fully repaid loans given are skipped; a holdings group whose value is negative is reported at 0 and needs review.

- [ ] **Step 1: Write the test helpers**

Create `packages/api/test/will/willFixtures.ts`:
```ts
import { emptyWillPayload, type WillPayload } from '@everypaisa/shared';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';

export const TODAY = '2026-10-12';

/** Same will as packages/shared/src/will/__tests__/fixtures.ts: passes every BLOCKER and WARNING. */
export function validWillPayload(): WillPayload {
  const base = emptyWillPayload();
  const person = (p: Partial<WillPayload['people'][number]> & { id: string; name: string }) => ({
    partyType: 'INDIVIDUAL' as const, relationship: 'SON' as const, dob: '1990-01-01', contact: null,
    sourceFamilyMemberId: null, contingentId: null, ...p,
  });
  const item = (p: Partial<WillPayload['estate']['items'][number]> & { sourceKey: string; label: string }) => ({
    side: 'ASSET' as const, kind: 'BANK_ACCOUNT' as const, ref: null, value: '100000.00', valueAsOf: TODAY,
    ownership: { type: 'SOLE' as const, sharePct: '100' }, review: 'CONFIRMED' as const, userEdited: false, note: null, ...p,
  });
  return {
    ...base,
    details: {
      legalName: 'Ramesh Kumar Verma', dob: '1970-05-15', jurisdiction: 'IN', personalLaw: 'HINDU',
      address: '12 MG Road, Pune 411001', maritalStatus: 'MARRIED', hasChildren: true, hasDependents: false,
    },
    people: [
      person({ id: 'p-spouse', name: 'Sunita Verma', relationship: 'SPOUSE', dob: '1972-08-01' }),
      person({ id: 'p-son', name: 'Arjun Verma', relationship: 'SON', dob: '1998-02-10', contingentId: 'p-spouse' }),
      person({ id: 'p-trust', name: 'Pune Animal Trust', partyType: 'ORGANISATION', relationship: 'CHARITY', dob: null }),
    ],
    roles: { executorId: 'p-spouse', altExecutorId: 'p-son', guardianId: null, altGuardianId: null },
    estate: {
      asOf: TODAY,
      failedSources: [],
      items: [
        item({ sourceKey: 'bank:b1', label: 'HDFC Bank savings account', ref: 'XXXX1234', value: '250000.00' }),
        item({ sourceKey: 'holdings:pf1:EQUITY', kind: 'HOLDING', label: 'Equity - My Portfolio', value: '1500000.00' }),
        item({ sourceKey: 'loan:l1', side: 'LIABILITY', kind: 'LOAN', label: 'Home loan - SBI', value: '400000.00' }),
      ],
    },
    allocation: {
      residuary: [{ personId: 'p-spouse', sharePct: '60' }, { personId: 'p-son', sharePct: '40' }],
      specificGifts: [{ itemId: 'holdings:pf1:EQUITY', personId: 'p-son', sharePct: '100' }],
      fixedGifts: [{ personId: 'p-trust', amount: '50000' }],
    },
    instructions: { text: 'I wish my books to go to the Pune public library.' },
  };
}

/** One row of every estate source, all active, unlinked and with current values. */
export async function seedEstateFixture(userId: string, portfolioId: string): Promise<void> {
  await runAsSystem(async () => {
    await prisma.holdingProjection.createMany({
      data: [
        { portfolioId, assetKey: 'will-test:eq1', assetClass: 'EQUITY', assetName: 'Eq One', quantity: '10', avgCostPrice: '100', totalCost: '1000', currentValue: '1500.50', sourceTxCount: 1 },
        { portfolioId, assetKey: 'will-test:eq2', assetClass: 'EQUITY', assetName: 'Eq Two', quantity: '5', avgCostPrice: '200', totalCost: '1000', currentValue: '900', sourceTxCount: 1 },
        { portfolioId, assetKey: 'will-test:fd1', assetClass: 'FIXED_DEPOSIT', assetName: 'FD', quantity: '1', avgCostPrice: '50000', totalCost: '50000', currentValue: null, sourceTxCount: 1 },
      ],
    });
    await prisma.bankAccount.create({
      data: { userId, bankName: 'HDFC Bank', accountType: 'SAVINGS', accountHolder: 'Test', last4: '1234', currentBalance: '250000', jointHolders: ['Sunita'], nomineeName: 'Sunita' },
    });
    await prisma.ownedProperty.create({
      data: { userId, name: 'Pune house', city: 'Pune', propertyType: 'INDEPENDENT_HOUSE', ownershipType: 'JOINT', ownershipPercent: '50', currentValue: '12000000' },
    });
    await prisma.rentalProperty.create({ data: { userId, name: 'Andheri flat', propertyType: 'RESIDENTIAL', currentValue: '9000000' } });
    await prisma.vehicle.create({ data: { userId, registrationNo: 'MH47BT5950', make: 'Maruti', model: 'Swift', currentValue: '450000' } });
    await prisma.insurancePolicy.create({
      data: { userId, insurer: 'LIC', type: 'TERM', policyHolder: 'Test', sumAssured: '10000000', premiumAmount: '12000', premiumFrequency: 'ANNUAL', startDate: new Date('2020-01-01'), policyNumberLast4: '9876' },
    });
    await prisma.loanGiven.create({ data: { userId, borrowerName: 'Ravi', principalAmount: '20000', lentOn: new Date('2026-01-10') } });
    await prisma.loan.create({
      data: { userId, lenderName: 'SBI', loanType: 'HOME', borrowerName: 'Test', principalAmount: '1000000', interestRate: '8.5', tenureMonths: 240, emiAmount: '8678.23', disbursementDate: new Date('2026-01-01'), firstEmiDate: new Date('2026-02-05') },
    });
    await prisma.creditCard.create({
      data: { userId, issuerBank: 'HDFC Bank', cardName: 'Regalia', last4: '4321', creditLimit: '300000', outstandingBalance: '12500.75', statementDay: 5, dueDay: 25 },
    });
  });
}

/** Rows that do not cascade from User. Call before scope.cleanup(). */
export async function clearEstateFixture(userId: string): Promise<void> {
  await runAsSystem(() => prisma.providentFundAccount.deleteMany({ where: { userId } }));
}
```

- [ ] **Step 2: Write the failing tests**

Create `packages/api/test/will/reconcile.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { WillAssetItem } from '@everypaisa/shared';
import { reconcileEstate, candidateToItem } from '../../src/services/will/estate/reconcile.js';
import type { EstateCandidate } from '../../src/services/will/estate/types.js';

function cand(p: Partial<EstateCandidate> & { sourceKey: string }): EstateCandidate {
  return {
    side: 'ASSET', kind: 'BANK_ACCOUNT', label: 'Label', ref: null, value: '100.00', valueAsOf: '2026-10-12',
    ownership: { type: 'SOLE', sharePct: '100' }, review: 'CONFIRMED', note: null, ...p,
  };
}
function existing(p: Partial<WillAssetItem> & { sourceKey: string }): WillAssetItem {
  return { ...candidateToItem(cand({ sourceKey: p.sourceKey })), ...p };
}

describe('reconcileEstate', () => {
  it('adds new candidates with their suggested state', () => {
    const out = reconcileEstate([], [cand({ sourceKey: 'bank:1', review: 'NEEDS_REVIEW' })]);
    expect(out).toEqual([{ ...cand({ sourceKey: 'bank:1', review: 'NEEDS_REVIEW' }), userEdited: false }]);
  });

  it('refreshes value and label but keeps a confirmation', () => {
    const out = reconcileEstate(
      [existing({ sourceKey: 'bank:1', value: '100.00', review: 'CONFIRMED' })],
      [cand({ sourceKey: 'bank:1', value: '250.00', label: 'New label', review: 'NEEDS_REVIEW' })],
    );
    expect(out[0]).toMatchObject({ value: '250.00', label: 'New label', review: 'CONFIRMED' });
  });

  it('keeps an exclusion', () => {
    const out = reconcileEstate([existing({ sourceKey: 'bank:1', review: 'EXCLUDED' })], [cand({ sourceKey: 'bank:1' })]);
    expect(out[0]!.review).toBe('EXCLUDED');
  });

  it('keeps the value and ownership the user edited', () => {
    const out = reconcileEstate(
      [existing({ sourceKey: 'prop:1', value: '500.00', ownership: { type: 'JOINT', sharePct: '50' }, userEdited: true })],
      [cand({ sourceKey: 'prop:1', value: '900.00', ownership: { type: 'SOLE', sharePct: '100' } })],
    );
    expect(out[0]).toMatchObject({ value: '500.00', ownership: { type: 'JOINT', sharePct: '50' }, userEdited: true });
  });

  it('marks vanished items STALE instead of dropping them, but leaves exclusions alone', () => {
    const out = reconcileEstate(
      [existing({ sourceKey: 'bank:gone' }), existing({ sourceKey: 'bank:excl', review: 'EXCLUDED' })],
      [],
    );
    expect(out.map((i) => [i.sourceKey, i.review])).toEqual([['bank:gone', 'STALE'], ['bank:excl', 'EXCLUDED']]);
  });

  it('a STALE item that comes back takes the suggested state', () => {
    const out = reconcileEstate([existing({ sourceKey: 'bank:1', review: 'STALE' })], [cand({ sourceKey: 'bank:1', review: 'NEEDS_REVIEW' })]);
    expect(out[0]!.review).toBe('NEEDS_REVIEW');
  });

  it('never touches manual items', () => {
    const manual = existing({ sourceKey: 'manual:abc', label: 'Gold coins', value: '75000.00', kind: 'OTHER_ASSET' });
    const out = reconcileEstate([manual], [cand({ sourceKey: 'bank:1' })]);
    expect(out).toEqual([{ ...cand({ sourceKey: 'bank:1' }), userEdited: false }, manual]);
  });
});
```

Create `packages/api/test/will/estateAdapters.db.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Decimal } from '@everypaisa/shared';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { getDashboardNetWorth } from '../../src/services/dashboard.service.js';
import { collectEstate } from '../../src/services/will/estate/registry.js';
import type { EstateAdapter, EstateCandidate } from '../../src/services/will/estate/types.js';
import { clearEstateFixture, seedEstateFixture, TODAY } from './willFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let scope: TestScope;
const collect = () => scope.runAs(() => collectEstate({ userId: scope.userId, today: TODAY }));
const sum = (cs: EstateCandidate[], kind: EstateCandidate['kind']) =>
  cs.filter((c) => c.kind === kind).reduce((s, c) => s.plus(c.value), new Decimal(0)).toFixed(2);

beforeAll(async () => {
  scope = await createTestScope('will-estate');
  await seedEstateFixture(scope.userId, scope.portfolioId);
});
afterAll(async () => {
  await clearEstateFixture(scope.userId);
  await scope.cleanup();
});

describe('collectEstate', () => {
  it('reads every source without failures', async () => {
    const { candidates, failed } = await collect();
    expect(failed).toEqual([]);
    expect(candidates.map((c) => c.kind).sort()).toEqual([
      'BANK_ACCOUNT', 'CREDIT_CARD', 'HOLDING', 'HOLDING', 'INSURANCE', 'LOAN', 'LOAN_GIVEN',
      'OWNED_PROPERTY', 'RENTAL_PROPERTY', 'VEHICLE',
    ]);
  });

  it('matches the dashboard on the classes both count', async () => {
    const { candidates } = await collect();
    const net = await scope.runAs(() => getDashboardNetWorth(scope.userId));
    const d2 = (v: string) => new Decimal(v).toFixed(2);
    expect(sum(candidates, 'HOLDING')).toBe(d2(net.portfolio.currentValue));
    expect(sum(candidates, 'VEHICLE')).toBe(d2(net.vehicles.totalValue));
    expect(sum(candidates, 'RENTAL_PROPERTY')).toBe(d2(net.realEstate.totalValue));
    expect(sum(candidates, 'LOAN')).toBe(d2(net.liabilities.totalOutstanding));
    expect(sum(candidates, 'CREDIT_CARD')).toBe(d2(net.liabilities.totalCreditCardOutstanding));
    const lent = net.allocationBreakdown.find((x) => x.key === 'LOAN_GIVEN');
    expect(sum(candidates, 'LOAN_GIVEN')).toBe(d2(lent!.value));
  });

  it('maps ownership, identifiers and review states', async () => {
    const { candidates } = await collect();
    const by = (kind: EstateCandidate['kind']) => candidates.filter((c) => c.kind === kind);
    expect(by('BANK_ACCOUNT')[0]).toMatchObject({
      label: 'HDFC Bank savings account', ref: 'XXXX1234', value: '250000.00',
      ownership: { type: 'JOINT', sharePct: '50.00' }, review: 'NEEDS_REVIEW',
    });
    expect(by('BANK_ACCOUNT')[0]!.note).toContain('nominee');
    expect(by('OWNED_PROPERTY')[0]).toMatchObject({ label: 'Pune house, Pune', ownership: { type: 'JOINT', sharePct: '50.00' }, review: 'NEEDS_REVIEW' });
    expect(by('INSURANCE')[0]).toMatchObject({ ref: 'XXXX9876', value: '10000000.00', ownership: { type: 'NOMINEE_ONLY', sharePct: '100' } });
    expect(by('VEHICLE')[0]).toMatchObject({ label: 'Maruti Swift', ref: 'MH47BT5950', value: '450000.00', review: 'CONFIRMED' });
    expect(by('CREDIT_CARD')[0]).toMatchObject({ side: 'LIABILITY', ref: 'XXXX4321', value: '12500.75' });
    expect(by('LOAN')[0]).toMatchObject({ side: 'LIABILITY', label: 'Home loan - SBI' });
    const equity = by('HOLDING').find((c) => c.sourceKey.endsWith(':EQUITY'))!;
    expect(equity.value).toBe('2400.50');
    expect(equity.label).toMatch(/^Equity - Test portfolio /);
  });

  it('reports a PF account once, from the PF account, not again as a holding', async () => {
    const pf = await runAsSystem(async () => {
      await prisma.holdingProjection.create({
        data: { portfolioId: scope.portfolioId, assetKey: 'will-test:pf', assetClass: 'EPF', quantity: '1', avgCostPrice: '70000', totalCost: '70000', currentValue: '70000', sourceTxCount: 1 },
      });
      return prisma.providentFundAccount.create({
        data: { userId: scope.userId, type: 'EPF', institution: 'EPFO', identifierCipher: Buffer.from('x'), identifierLast4: '4455', holderName: 'Test', currentBalance: '80000', assetKey: 'will-test:pf' },
      });
    });
    try {
      const { candidates } = await collect();
      expect(candidates.some((c) => c.sourceKey.endsWith(':EPF'))).toBe(false);
      expect(candidates.find((c) => c.kind === 'PROVIDENT_FUND')).toMatchObject({ sourceKey: `pf:${pf.id}`, value: '80000.00', ref: 'XXXX4455' });
    } finally {
      await runAsSystem(async () => {
        await prisma.providentFundAccount.delete({ where: { id: pf.id } });
        await prisma.holdingProjection.deleteMany({ where: { portfolioId: scope.portfolioId, assetKey: 'will-test:pf' } });
      });
    }
  });

  it('skips a rental property that an owned property already covers', async () => {
    const ids = await runAsSystem(async () => {
      const rental = await prisma.rentalProperty.create({ data: { userId: scope.userId, name: 'Linked flat', propertyType: 'RESIDENTIAL', currentValue: '100' } });
      const owned = await prisma.ownedProperty.create({ data: { userId: scope.userId, name: 'Linked flat', propertyType: 'APARTMENT', rentalPropertyId: rental.id, currentValue: '100' } });
      return { rental: rental.id, owned: owned.id };
    });
    try {
      const { candidates } = await collect();
      expect(candidates.some((c) => c.sourceKey === `rentalProperty:${ids.rental}`)).toBe(false);
      expect(candidates.some((c) => c.sourceKey === `ownedProperty:${ids.owned}`)).toBe(true);
    } finally {
      await runAsSystem(async () => {
        await prisma.ownedProperty.delete({ where: { id: ids.owned } });
        await prisma.rentalProperty.delete({ where: { id: ids.rental } });
      });
    }
  });

  it('reports a failing source instead of swallowing it', async () => {
    const one: EstateCandidate = {
      sourceKey: 'x:1', side: 'ASSET', kind: 'OTHER_ASSET', label: 'X', ref: null, value: '1.00', valueAsOf: null,
      ownership: { type: 'SOLE', sharePct: '100' }, review: 'CONFIRMED', note: null,
    };
    const ok: EstateAdapter = { id: 'ok', version: '1', collect: async () => [one] };
    const boom: EstateAdapter = { id: 'boom', version: '1', collect: async () => { throw new Error('db down'); } };
    const r = await collectEstate({ userId: scope.userId, today: TODAY }, [ok, boom]);
    expect(r.failed).toEqual(['boom']);
    expect(r.candidates).toEqual([one]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/will/reconcile.test.ts test/will/estateAdapters.db.test.ts
```
Expected: FAIL - cannot resolve `../../src/services/will/estate/reconcile.js` / `registry.js`.

- [ ] **Step 4: Extract the per-loan helpers**

In `packages/api/src/services/loans.service.ts`, directly after `buildAmortizationSchedule` (before `export function splitLoanPayment`), add:
```ts
export interface LoanPosition {
  /** Opening balance of the first unpaid EMI; principal if the schedule cannot be built. */
  outstanding: Decimal;
  firstUnpaid: AmortizationRow | null;
  scheduleFailed: boolean;
}

/** Where a loan stands today. Shared by the dashboard and the will estate list. */
export function loanPosition(loan: StoredLoan): LoanPosition {
  let schedule: AmortizationRow[];
  try {
    schedule = buildAmortizationSchedule(loan);
  } catch (err) {
    logger.warn(
      { loanId: loan.id, errName: err instanceof Error ? err.name : 'unknown' },
      '[loans] schedule failed; principal used as outstanding',
    );
    return { outstanding: new Decimal(loan.principalAmount.toString()), firstUnpaid: null, scheduleFailed: true };
  }
  const firstUnpaid = schedule.find((r) => !r.isPaid) ?? null;
  return {
    outstanding: firstUnpaid ? new Decimal(firstUnpaid.openingBalance) : new Decimal(0),
    firstUnpaid,
    scheduleFailed: false,
  };
}
```

In `packages/api/src/services/loansGiven.service.ts`: change `type LoanRow = Prisma.LoanGivenGetPayload<{ include: { entries: true } }>;` to
```ts
export type LoanGivenRow = Prisma.LoanGivenGetPayload<{ include: { entries: true } }>;
type LoanRow = LoanGivenRow;
```
and replace `outstandingLoansGiven` with:
```ts
/** Principal still owed on one loan given - what the dashboard and the will estate count. */
export function loanGivenOutstanding(loan: LoanGivenRow): Decimal {
  return new Decimal(computeLoanGivenSummary(termsOf(loan), entriesOf(loan)).outstandingPrincipal);
}

export async function outstandingLoansGiven(userId: string): Promise<{ count: number; total: Decimal }> {
  const loans = await prisma.loanGiven.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { entries: true },
  });
  const total = loans.reduce((s, l) => s.plus(loanGivenOutstanding(l)), ZERO);
  return { count: loans.length, total };
}
```

In `packages/api/src/services/dashboard.service.ts`:
(a) `const ASSET_CLASS_LABELS` -> `export const ASSET_CLASS_LABELS`.
(b) Change the import `import { buildAmortizationSchedule, type StoredLoan } from './loans.service.js';` to `import { loanPosition, type StoredLoan } from './loans.service.js';`.
(c) Replace the body of `for (const loan of activeLoans) { ... }` (the first loop, the one that computes `totalOutstanding` and EMI alerts) with:
```ts
  for (const loan of activeLoans) {
    monthlyEmiTotal = monthlyEmiTotal.plus(d(loan.emiAmount));

    // Outstanding balance: opening balance of the first unpaid EMI (principal
    // when the schedule cannot be built) - see loanPosition.
    const position = loanPosition(loan as unknown as StoredLoan);
    totalOutstanding = totalOutstanding.plus(position.outstanding);
    const firstUnpaid = position.firstUnpaid;
    if (!firstUnpaid) continue;

    const emiDateMs = new Date(firstUnpaid.date + 'T00:00:00Z').getTime();
    const daysDiff = Math.ceil((emiDateMs - today.getTime()) / 86_400_000);

    if (daysDiff < 0) {
      overdueEmis.push({
        loanId: loan.id,
        lenderName: loan.lenderName,
        daysOverdue: Math.abs(daysDiff),
      });
    } else if (daysDiff <= 30) {
      upcomingEmis.push({
        loanId: loan.id,
        lenderName: loan.lenderName,
        emiDate: firstUnpaid.date,
        emiAmount: firstUnpaid.emiAmount,
        daysUntil: daysDiff,
      });
    }
  }
```

- [ ] **Step 5: Adapter types, reconcile and registry**

Create `packages/api/src/services/will/estate/types.ts`:
```ts
import type { WillAssetItem } from '@everypaisa/shared';

export interface EstateContext {
  userId: string;
  /** Indian calendar date, YYYY-MM-DD. */
  today: string;
}

/** What an adapter proposes. Review states the user owns (STALE, edits) are applied by reconcile. */
export type EstateCandidate = Omit<WillAssetItem, 'userEdited' | 'review'> & {
  review: 'CONFIRMED' | 'NEEDS_REVIEW' | 'EXCLUDED';
};

export interface EstateAdapter {
  id: string;
  version: string;
  collect(ctx: EstateContext): Promise<EstateCandidate[]>;
}

export const SOLE: EstateCandidate['ownership'] = { type: 'SOLE', sharePct: '100' };

/** Labels and refs are capped to the payload schema's limits. */
export function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}
```

Create `packages/api/src/services/will/estate/reconcile.ts`:
```ts
import { WILL_MANUAL_ITEM_PREFIX, type WillAssetItem } from '@everypaisa/shared';
import type { EstateCandidate } from './types.js';

export function candidateToItem(c: EstateCandidate): WillAssetItem {
  return { ...c, userEdited: false };
}

export function candidatesToItems(cs: readonly EstateCandidate[]): WillAssetItem[] {
  return cs.map(candidateToItem);
}

/**
 * Merge a fresh fetch into the draft's list without losing the user's work:
 *  - CONFIRMED / EXCLUDED stay as the user left them;
 *  - value and ownership the user edited (`userEdited`) are kept;
 *  - an item that vanished is kept as STALE, so gifts naming it stay valid;
 *  - a STALE item that reappears takes the adapter's suggestion;
 *  - manual items are never touched.
 */
export function reconcileEstate(
  existing: readonly WillAssetItem[],
  candidates: readonly EstateCandidate[],
): WillAssetItem[] {
  const byKey = new Map(existing.map((i) => [i.sourceKey, i]));
  const seen = new Set<string>();
  const out: WillAssetItem[] = [];
  for (const c of candidates) {
    seen.add(c.sourceKey);
    const prev = byKey.get(c.sourceKey);
    if (!prev) {
      out.push(candidateToItem(c));
      continue;
    }
    out.push({
      ...prev,
      side: c.side,
      kind: c.kind,
      label: c.label,
      ref: c.ref,
      note: c.note,
      value: prev.userEdited ? prev.value : c.value,
      valueAsOf: prev.userEdited ? prev.valueAsOf : c.valueAsOf,
      ownership: prev.userEdited ? prev.ownership : c.ownership,
      review: prev.review === 'STALE' ? c.review : prev.review,
    });
  }
  for (const prev of existing) {
    if (seen.has(prev.sourceKey)) continue;
    if (prev.sourceKey.startsWith(WILL_MANUAL_ITEM_PREFIX) || prev.review === 'EXCLUDED') {
      out.push(prev);
      continue;
    }
    out.push({ ...prev, review: 'STALE' });
  }
  return out;
}
```

Create `packages/api/src/services/will/estate/registry.ts`:
```ts
/**
 * The will's estate list, built from every source the app knows.
 *
 * Differences from getDashboardNetWorth, on purpose: bank accounts and owned
 * property are included (the dashboard leaves them out); PF-backed holdings are
 * reported once, by the PF adapter; rental properties linked from an owned
 * property are skipped (no double count); inactive rentals are skipped; a
 * property without a current value falls back to its purchase price;
 * zero-balance cards and fully repaid loans given are skipped. Holdings,
 * vehicles, rental, loans given, loans and cards otherwise match the dashboard
 * (test/will/estateAdapters.db.test.ts).
 */
import { logger } from '../../../lib/logger.js';
import type { EstateAdapter, EstateCandidate, EstateContext } from './types.js';
import { bankAccountsAdapter, holdingsAdapter, pfAccountsAdapter } from './adapters/financial.js';
import { ownedPropertyAdapter, rentalPropertyAdapter, vehiclesAdapter } from './adapters/property.js';
import { insuranceAdapter } from './adapters/protection.js';
import { creditCardsAdapter, loansAdapter, loansGivenAdapter } from './adapters/credit.js';

export const DEFAULT_ESTATE_ADAPTERS: readonly EstateAdapter[] = [
  bankAccountsAdapter,
  holdingsAdapter,
  pfAccountsAdapter,
  ownedPropertyAdapter,
  rentalPropertyAdapter,
  vehiclesAdapter,
  insuranceAdapter,
  loansGivenAdapter,
  loansAdapter,
  creditCardsAdapter,
];

/** Leaves room under the payload's 500-item cap for manual items. */
export const MAX_ESTATE_CANDIDATES = 400;

export interface EstateCollection {
  candidates: EstateCandidate[];
  /** Ids of adapters that threw. Surfaced to the user, never swallowed. */
  failed: string[];
}

export async function collectEstate(
  ctx: EstateContext,
  adapters: readonly EstateAdapter[] = DEFAULT_ESTATE_ADAPTERS,
): Promise<EstateCollection> {
  const results = await Promise.allSettled(adapters.map((a) => a.collect(ctx)));
  const candidates: EstateCandidate[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => {
    const adapter = adapters[i]!;
    if (r.status === 'fulfilled') {
      candidates.push(...r.value);
    } else {
      failed.push(adapter.id);
      // Error name only: messages can carry row data.
      logger.warn(
        { adapter: adapter.id, adapterVersion: adapter.version, errName: r.reason instanceof Error ? r.reason.name : 'unknown' },
        'will.estate.adapter_failed',
      );
    }
  });
  if (candidates.length > MAX_ESTATE_CANDIDATES) {
    logger.warn({ count: candidates.length }, 'will.estate.truncated');
    candidates.length = MAX_ESTATE_CANDIDATES;
  }
  return { candidates, failed };
}
```

- [ ] **Step 6: The adapters**

Create `packages/api/src/services/will/estate/adapters/financial.ts`:
```ts
import { Decimal, istCalendarDate, toAmount2 } from '@everypaisa/shared';
import { prisma } from '../../../../lib/prisma.js';
import { ASSET_CLASS_LABELS } from '../../../dashboard.service.js';
import { clip, SOLE, type EstateAdapter, type EstateCandidate } from '../types.js';

const ZERO = new Decimal(0);
const dec = (v: { toString(): string } | null | undefined): Decimal | null => (v == null ? null : new Decimal(v.toString()));

/** One item per (portfolio, asset class); PF-backed holdings are left to the PF adapter. */
export const holdingsAdapter: EstateAdapter = {
  id: 'holdings',
  version: '1',
  async collect({ userId, today }) {
    const pf = await prisma.providentFundAccount.findMany({ where: { userId }, select: { assetKey: true } });
    const pfKeys = new Set(pf.map((p) => p.assetKey));
    const rows = await prisma.holdingProjection.findMany({
      where: { portfolio: { userId } },
      select: {
        portfolioId: true, assetKey: true, assetClass: true, currentValue: true, totalCost: true, quantity: true,
        portfolio: { select: { name: true } },
      },
    });
    const groups = new Map<string, { label: string; value: Decimal }>();
    for (const r of rows) {
      if (pfKeys.has(r.assetKey)) continue;
      // Same effective value as the dashboard: live value, else cost.
      const value = dec(r.currentValue) ?? dec(r.totalCost) ?? ZERO;
      if (value.isZero() && new Decimal(r.quantity.toString()).isZero()) continue;
      const key = `holdings:${r.portfolioId}:${r.assetClass}`;
      const g = groups.get(key) ?? { label: `${ASSET_CLASS_LABELS[r.assetClass] ?? r.assetClass} - ${r.portfolio.name}`, value: ZERO };
      g.value = g.value.plus(value);
      groups.set(key, g);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sourceKey, g]): EstateCandidate => {
        const negative = g.value.isNegative();
        return {
          sourceKey, side: 'ASSET', kind: 'HOLDING', label: clip(g.label, 160), ref: null,
          value: toAmount2(negative ? ZERO : g.value), valueAsOf: today, ownership: SOLE,
          review: negative ? 'NEEDS_REVIEW' : 'CONFIRMED',
          note: negative ? 'These positions are worth less than nothing today (for example open derivatives). Check them.' : null,
        };
      });
  },
};

export const bankAccountsAdapter: EstateAdapter = {
  id: 'bankAccounts',
  version: '1',
  async collect({ userId }) {
    const rows = await prisma.bankAccount.findMany({
      where: { userId, status: { not: 'CLOSED' } },
      orderBy: [{ bankName: 'asc' }, { last4: 'asc' }],
      select: { id: true, bankName: true, accountType: true, last4: true, currentBalance: true, balanceAsOf: true, jointHolders: true, nomineeName: true },
    });
    return rows.map((b): EstateCandidate => {
      const balance = dec(b.currentBalance);
      const joint = b.jointHolders.length > 0;
      return {
        sourceKey: `bank:${b.id}`, side: 'ASSET', kind: 'BANK_ACCOUNT',
        label: clip(`${b.bankName} ${b.accountType.toLowerCase()} account`, 160),
        ref: `XXXX${b.last4}`,
        value: toAmount2(balance && balance.greaterThan(0) ? balance : ZERO),
        valueAsOf: b.balanceAsOf ? istCalendarDate(b.balanceAsOf) : null,
        ownership: joint
          ? { type: 'JOINT', sharePct: new Decimal(100).dividedBy(b.jointHolders.length + 1).toFixed(2, Decimal.ROUND_DOWN) }
          : SOLE,
        review: joint || !balance ? 'NEEDS_REVIEW' : 'CONFIRMED',
        note: b.nomineeName ? 'A nominee is registered for this account.' : null,
      };
    });
  },
};

export const pfAccountsAdapter: EstateAdapter = {
  id: 'pfAccounts',
  version: '1',
  async collect({ userId, today }) {
    const rows = await prisma.providentFundAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, type: true, institution: true, identifierLast4: true, currentBalance: true, assetKey: true },
    });
    if (rows.length === 0) return [];
    const holdings = await prisma.holdingProjection.findMany({
      where: { portfolio: { userId }, assetKey: { in: rows.map((r) => r.assetKey) } },
      select: { assetKey: true, currentValue: true, totalCost: true },
    });
    const fromHoldings = new Map<string, Decimal>();
    for (const h of holdings) {
      fromHoldings.set(h.assetKey, (fromHoldings.get(h.assetKey) ?? ZERO).plus(dec(h.currentValue) ?? dec(h.totalCost) ?? ZERO));
    }
    return rows.map((r): EstateCandidate => {
      const value = dec(r.currentBalance) ?? fromHoldings.get(r.assetKey) ?? null;
      return {
        sourceKey: `pf:${r.id}`, side: 'ASSET', kind: 'PROVIDENT_FUND',
        label: `${r.type} account - ${r.institution}`, ref: `XXXX${r.identifierLast4}`,
        value: toAmount2(value ?? ZERO), valueAsOf: today, ownership: SOLE,
        review: value ? 'CONFIRMED' : 'NEEDS_REVIEW',
        note: 'A PF nominee may receive this directly - check your nomination.',
      };
    });
  },
};
```

Create `packages/api/src/services/will/estate/adapters/property.ts`:
```ts
import { Decimal, istCalendarDate, toAmount2 } from '@everypaisa/shared';
import { prisma } from '../../../../lib/prisma.js';
import { PLATE_SELECT, plateOf } from '../../../piiAtRest.service.js';
import { clip, SOLE, type EstateAdapter, type EstateCandidate } from '../types.js';

const ZERO = new Decimal(0);
const dec = (v: { toString(): string } | null | undefined): Decimal | null => (v == null ? null : new Decimal(v.toString()));
const pct2 = (v: { toString(): string }): string => Decimal.min(100, Decimal.max(0, new Decimal(v.toString()))).toFixed(2);

export const ownedPropertyAdapter: EstateAdapter = {
  id: 'ownedProperty',
  version: '1',
  async collect({ userId }) {
    const rows = await prisma.ownedProperty.findMany({
      where: { userId, isActive: true, status: { not: 'SOLD' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, city: true, ownershipType: true, ownershipPercent: true, currentValue: true, purchasePrice: true, currentValueAsOf: true },
    });
    return rows.map((p): EstateCandidate => {
      const value = dec(p.currentValue) ?? dec(p.purchasePrice);
      const base = {
        sourceKey: `ownedProperty:${p.id}`, side: 'ASSET' as const, kind: 'OWNED_PROPERTY' as const,
        label: clip(p.city ? `${p.name}, ${p.city}` : p.name, 160), ref: null,
        value: toAmount2(value ?? ZERO), valueAsOf: p.currentValueAsOf ? istCalendarDate(p.currentValueAsOf) : null,
      };
      switch (p.ownershipType) {
        case 'COMPANY':
          return { ...base, ownership: SOLE, review: 'EXCLUDED', note: 'Owned by a company, so it is not yours to give. Your shares in the company are.' };
        case 'JOINT':
          return { ...base, ownership: { type: 'JOINT', sharePct: pct2(p.ownershipPercent) }, review: 'NEEDS_REVIEW', note: null };
        case 'HUF':
          return { ...base, ownership: { type: 'HUF', sharePct: pct2(p.ownershipPercent) }, review: 'NEEDS_REVIEW', note: null };
        default:
          return { ...base, ownership: SOLE, review: value ? 'CONFIRMED' : 'NEEDS_REVIEW', note: null };
      }
    });
  },
};

export const rentalPropertyAdapter: EstateAdapter = {
  id: 'rentalProperty',
  version: '1',
  async collect({ userId }) {
    const linked = await prisma.ownedProperty.findMany({
      where: { userId, status: { not: 'SOLD' }, rentalPropertyId: { not: null } },
      select: { rentalPropertyId: true },
    });
    const skip = linked.map((l) => l.rentalPropertyId).filter((x): x is string => !!x);
    const rows = await prisma.rentalProperty.findMany({
      where: { userId, isActive: true, ...(skip.length ? { id: { notIn: skip } } : {}) },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, currentValue: true, purchasePrice: true },
    });
    return rows.map((r): EstateCandidate => ({
      sourceKey: `rentalProperty:${r.id}`, side: 'ASSET', kind: 'RENTAL_PROPERTY', label: clip(r.name, 160), ref: null,
      value: toAmount2(dec(r.currentValue) ?? dec(r.purchasePrice) ?? ZERO), valueAsOf: null, ownership: SOLE,
      review: 'NEEDS_REVIEW', note: 'Ownership is not recorded for rental properties - check it.',
    }));
  },
};

export const vehiclesAdapter: EstateAdapter = {
  id: 'vehicles',
  version: '1',
  async collect({ userId }) {
    const rows = await prisma.vehicle.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, make: true, model: true, currentValue: true, ...PLATE_SELECT },
    });
    return rows.map((v): EstateCandidate => {
      const value = dec(v.currentValue);
      const plate = plateOf(v);
      return {
        sourceKey: `vehicle:${v.id}`, side: 'ASSET', kind: 'VEHICLE',
        label: clip([v.make, v.model].filter(Boolean).join(' ') || 'Vehicle', 160),
        ref: plate ? clip(plate, 40) : null,
        value: toAmount2(value ?? ZERO), valueAsOf: null, ownership: SOLE,
        review: value ? 'CONFIRMED' : 'NEEDS_REVIEW', note: null,
      };
    });
  },
};
```

Create `packages/api/src/services/will/estate/adapters/protection.ts`:
```ts
import { toAmount2 } from '@everypaisa/shared';
import { prisma } from '../../../../lib/prisma.js';
import { clip, type EstateAdapter, type EstateCandidate } from '../types.js';

/** Policies that pay out on death. Health, motor, home and travel cover do not. */
const LIFE_TYPES = ['TERM', 'WHOLE_LIFE', 'ULIP', 'ENDOWMENT', 'PERSONAL_ACCIDENT'];

export const insuranceAdapter: EstateAdapter = {
  id: 'insurance',
  version: '1',
  async collect({ userId }) {
    const rows = await prisma.insurancePolicy.findMany({
      where: { userId, status: 'ACTIVE', type: { in: LIFE_TYPES } },
      orderBy: { startDate: 'asc' },
      select: { id: true, insurer: true, planName: true, type: true, sumAssured: true, policyNumberLast4: true },
    });
    return rows.map((p): EstateCandidate => ({
      sourceKey: `insurance:${p.id}`, side: 'ASSET', kind: 'INSURANCE',
      label: clip(p.planName ? `${p.insurer} ${p.planName}` : `${p.insurer} ${p.type.toLowerCase().replace(/_/g, ' ')} policy`, 160),
      ref: p.policyNumberLast4 ? `XXXX${p.policyNumberLast4}` : null,
      value: toAmount2(p.sumAssured.toString()), valueAsOf: null,
      ownership: { type: 'NOMINEE_ONLY', sharePct: '100' }, review: 'CONFIRMED',
      note: 'Paid to the nominee; not counted in your estate totals.',
    }));
  },
};
```

Create `packages/api/src/services/will/estate/adapters/credit.ts`:
```ts
import { Decimal, toAmount2 } from '@everypaisa/shared';
import { prisma } from '../../../../lib/prisma.js';
import { loanGivenOutstanding } from '../../../loansGiven.service.js';
import { loanPosition, type StoredLoan } from '../../../loans.service.js';
import { computeCardSummary } from '../../../creditCards.service.js';
import { clip, SOLE, type EstateAdapter, type EstateCandidate } from '../types.js';

const LOAN_WORDS: Record<string, string> = {
  HOME: 'Home', CAR: 'Car', PERSONAL: 'Personal', EDUCATION: 'Education', BUSINESS: 'Business', GOLD: 'Gold',
  LAS: 'Securities-backed', OTHER: 'Other',
};

export const loansGivenAdapter: EstateAdapter = {
  id: 'loansGiven',
  version: '1',
  async collect({ userId }) {
    const rows = await prisma.loanGiven.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { entries: true },
      orderBy: { lentOn: 'asc' },
    });
    const out: EstateCandidate[] = [];
    for (const l of rows) {
      const owed = loanGivenOutstanding(l);
      if (!owed.greaterThan(0)) continue;
      out.push({
        sourceKey: `loanGiven:${l.id}`, side: 'ASSET', kind: 'LOAN_GIVEN', label: clip(`Money lent to ${l.borrowerName}`, 160),
        ref: null, value: toAmount2(owed), valueAsOf: null, ownership: SOLE, review: 'CONFIRMED', note: null,
      });
    }
    return out;
  },
};

export const loansAdapter: EstateAdapter = {
  id: 'loans',
  version: '1',
  async collect({ userId }) {
    const rows = await prisma.loan.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { payments: { orderBy: { paidOn: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((l): EstateCandidate => {
      const { outstanding } = loanPosition(l as unknown as StoredLoan);
      return {
        sourceKey: `loan:${l.id}`, side: 'LIABILITY', kind: 'LOAN',
        label: clip(`${LOAN_WORDS[l.loanType] ?? 'Other'} loan - ${l.lenderName}`, 160),
        ref: l.accountNumberLast4 ? `XXXX${l.accountNumberLast4}` : null,
        value: toAmount2(Decimal.max(outstanding, 0)), valueAsOf: null, ownership: SOLE, review: 'CONFIRMED', note: null,
      };
    });
  },
};

export const creditCardsAdapter: EstateAdapter = {
  id: 'creditCards',
  version: '1',
  async collect({ userId }) {
    const rows = await prisma.creditCard.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { statements: { orderBy: { dueDate: 'desc' } } },
      orderBy: { createdAt: 'asc' },
    });
    const out: EstateCandidate[] = [];
    for (const card of rows) {
      // Same rule as the dashboard: the stored balance when there is one, else unpaid statements.
      const owed = card.outstandingBalance
        ? new Decimal(card.outstandingBalance.toString())
        : new Decimal(computeCardSummary(card).outstanding);
      if (!owed.greaterThan(0)) continue;
      out.push({
        sourceKey: `card:${card.id}`, side: 'LIABILITY', kind: 'CREDIT_CARD', label: clip(`${card.issuerBank} ${card.cardName}`, 160),
        ref: `XXXX${card.last4}`, value: toAmount2(owed), valueAsOf: null, ownership: SOLE, review: 'CONFIRMED', note: null,
      });
    }
    return out;
  },
};
```

- [ ] **Step 7: Run the tests to verify they pass, plus the suites that read the refactored loan code**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/will/reconcile.test.ts test/will/estateAdapters.db.test.ts test/services/aiNetWorthFamily.test.ts test/security/family-visibility.test.ts test/services/family/crossFamilyBleed.test.ts test/services/loanPaymentSplit.test.ts src/services/loanMath.test.ts
npx tsc --noEmit
```
Expected: PASS; no type errors.

- [ ] **Step 8: Commit**

```bash
cd portfolioos
git add packages/api/src/services/will/estate packages/api/src/services/loans.service.ts packages/api/src/services/loansGiven.service.ts packages/api/src/services/dashboard.service.ts packages/api/test/will/willFixtures.ts packages/api/test/will/reconcile.test.ts packages/api/test/will/estateAdapters.db.test.ts
git commit -m "feat(will): estate itemiser with per-source adapters and reconcile

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Draft API - store, service, controller, routes

**Wave 3** (parallel with Tasks 5 and 9; needs Tasks 3, 4 and 6).

**Files:**
- Create: `packages/api/src/services/will/willStore.ts`
- Create: `packages/api/src/services/will/will.service.ts`
- Create: `packages/api/src/controllers/will.controller.ts`
- Create: `packages/api/src/routes/will.routes.ts`
- Modify: `packages/api/src/routes/index.ts` (mount `/api/will`)
- Test: `packages/api/test/will/willDraft.db.test.ts`, `packages/api/test/routes/will.routes.test.ts`

**Interfaces:**
- Consumes: Task 1 (`willPayloadSchema`, `emptyWillPayload`, `applyWillSection`, `WILL_SECTION_SCHEMAS`, `isWillSection`, `willEstateTotals`, wire types, `istCalendarDate`, `serializeMoney`), Task 4 (`runWillRules`), Task 6 (`collectEstate`, `EstateCollection`, `EstateContext`, `reconcileEstate`, `candidatesToItems`), Task 3 (Prisma `Will`, audit actions, `requireFeature('WILL_MAKER')`), `lib/userKeys` (`sealForUser`, `openForUser`, `userKeysAvailable`).
- Produces:
  - `willStore.ts`: `newWillId(): string`, `requireWillKeys(): void` (throws 503 `WILL_KEYS_UNAVAILABLE`), `sealWillPayload(userId, willId, payload): Promise<Buffer>`, `openWillPayload(userId, willId, sealed: Uint8Array): Promise<WillPayload>`, `loadOwnedWill(userId, willId): Promise<Will>` (404), `loadDraft(userId, willId): Promise<{ will: Will; payload: WillPayload }>` (409 `WILL_NOT_DRAFT`), `revisionConflict(current: number): ConflictError` (details `{ reason: 'WILL_REVISION_CONFLICT', revision }`), `zodIssues(err: ZodError): Array<{ path: string; code: string }>`, `todayIst(): string`.
  - `will.service.ts`: `interface WillServiceDeps { collect?: (ctx: EstateContext) => Promise<EstateCollection>; today?: () => string }`; `getWillOverview(userId, deps?)`, `createWillDraft(userId, fromWillId: string | null)`, `getWillDraft(userId, willId, deps?)`, `saveWillSection(userId, willId, section, input: { revision: number; currentStep: number; data: unknown })`, `refreshWillEstate(userId, willId, revision, deps?)`, `discardWillDraft(userId, willId)`, `listWillPeopleSuggestions(userId)`; `toVersionWire(status, version)`.
  - `will.controller.ts`: handlers `overview`, `createDraft`, `getDraft`, `saveSection`, `refreshEstate`, `discardDraft`, `suggestions`; helpers `uid(req)`, `parseOr422(schema, data)`, `idOf(req, name)`.
  - `will.routes.ts`: `willRouter`, `rejectActAs` middleware.
  - HTTP (all under `authenticate`, `rejectActAs`, `requireFeature('WILL_MAKER')`): `GET /api/will` -> `WillOverviewWire`; `POST /api/will/drafts` `{ fromWillId? }` -> 201 `WillDraftWire` (409 `WILL_DRAFT_EXISTS` with `draftId`); `GET /api/will/drafts/:id` -> `WillDraftWire`; `PUT /api/will/drafts/:id/sections/:section` `{ revision, currentStep, data }` -> `WillSaveResultWire` (409 `WILL_REVISION_CONFLICT`, 422 `{ issues: [{ path, code }] }`); `POST /api/will/drafts/:id/estate/refresh` `{ revision }` -> `WillEstateRefreshWire`; `DELETE /api/will/drafts/:id` -> 204; `GET /api/will/people/suggestions` -> `{ suggestions: WillSuggestionWire[] }`.

- [ ] **Step 1: Write the failing service test**

Create `packages/api/test/will/willDraft.db.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { emptyWillPayload } from '@everypaisa/shared';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import {
  createWillDraft, discardWillDraft, getWillDraft, getWillOverview, listWillPeopleSuggestions,
  refreshWillEstate, saveWillSection,
} from '../../src/services/will/will.service.js';
import type { EstateCandidate } from '../../src/services/will/estate/types.js';
import { TODAY, validWillPayload } from './willFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const bank: EstateCandidate = {
  sourceKey: 'bank:1', side: 'ASSET', kind: 'BANK_ACCOUNT', label: 'Test bank account', ref: 'XXXX0001',
  value: '100.00', valueAsOf: TODAY, ownership: { type: 'SOLE', sharePct: '100' }, review: 'NEEDS_REVIEW', note: null,
};
const deps = { collect: async () => ({ candidates: [bank], failed: [] }), today: () => TODAY };

let a: TestScope;
let b: TestScope;
let draftId = '';

beforeAll(async () => {
  a = await createTestScope('will-draft-a');
  b = await createTestScope('will-draft-b');
});
afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.family.deleteMany({ where: { createdById: a.userId } });
    await prisma.willVersion.deleteMany({ where: { userId: { in: [a.userId, b.userId] } } });
    await prisma.will.deleteMany({ where: { userId: { in: [a.userId, b.userId] } } });
  });
  await a.cleanup();
  await b.cleanup();
});

describe('will drafts', () => {
  it('creates an empty draft at version 1, step 2', async () => {
    const d = await a.runAs(() => createWillDraft(a.userId, null));
    draftId = d.id;
    expect(d).toMatchObject({ version: 1, revision: 0, currentStep: 2 });
    expect(d.payload).toEqual(emptyWillPayload());
    expect(d.findings.some((f) => f.ruleId === 'REQUIRED_FIELDS')).toBe(true);
  });

  it('refuses a second draft and names the first', async () => {
    await expect(a.runAs(() => createWillDraft(a.userId, null))).rejects.toMatchObject({
      statusCode: 409, details: { reason: 'WILL_DRAFT_EXISTS', draftId },
    });
  });

  it('saves a section, bumps the revision and seals the payload at rest', async () => {
    const res = await a.runAs(() =>
      saveWillSection(a.userId, draftId, 'details', { revision: 0, currentStep: 3, data: validWillPayload().details }),
    );
    expect(res.revision).toBe(1);
    const back = await a.runAs(() => getWillDraft(a.userId, draftId, deps));
    expect(back.payload.details.legalName).toBe('Ramesh Kumar Verma');
    expect(back.currentStep).toBe(3);
    const raw = await runAsSystem(() => prisma.will.findUniqueOrThrow({ where: { id: draftId } }));
    expect(Buffer.from(raw.payload).includes(Buffer.from('Ramesh'))).toBe(false);
  });

  it('stale revision is refused', async () => {
    await expect(
      a.runAs(() => saveWillSection(a.userId, draftId, 'instructions', { revision: 0, currentStep: 6, data: { text: 'x' } })),
    ).rejects.toMatchObject({ statusCode: 409, details: { reason: 'WILL_REVISION_CONFLICT', revision: 1 } });
  });

  it('invalid data is a 422 listing paths and codes only', async () => {
    const err = await a
      .runAs(() =>
        saveWillSection(a.userId, draftId, 'details', {
          revision: 1, currentStep: 2, data: { legalName: 'Q'.repeat(200), dob: 'not-a-date' },
        }),
      )
      .catch((e: unknown) => e as { statusCode: number; details: { issues: Array<{ path: string; code: string }> } });
    expect(err.statusCode).toBe(422);
    expect(err.details.issues).toEqual(
      expect.arrayContaining([{ path: 'legalName', code: 'too_big' }, { path: 'dob', code: 'invalid_string' }]),
    );
    expect(JSON.stringify(err.details)).not.toContain('not-a-date');
  });

  it('another user cannot read or write it', async () => {
    await expect(b.runAs(() => getWillDraft(b.userId, draftId, deps))).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      b.runAs(() => saveWillSection(b.userId, draftId, 'instructions', { revision: 1, currentStep: 6, data: { text: 'x' } })),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refreshes the estate through the injected collector', async () => {
    const r = await a.runAs(() =>
      refreshWillEstate(a.userId, draftId, 1, { collect: async () => ({ candidates: [bank], failed: ['vehicles'] }), today: () => TODAY }),
    );
    expect(r.revision).toBe(2);
    expect(r.estate).toMatchObject({ asOf: TODAY, failedSources: ['vehicles'] });
    expect(r.estate.items).toEqual([{ ...bank, userEdited: false }]);
  });

  it('discards a draft; the next draft takes the next version number', async () => {
    await a.runAs(() => discardWillDraft(a.userId, draftId));
    await expect(a.runAs(() => getWillDraft(a.userId, draftId, deps))).rejects.toMatchObject({ statusCode: 409 });
    const next = await a.runAs(() => createWillDraft(a.userId, null));
    expect(next.version).toBe(2);
    draftId = next.id;
  });

  it('starts a new version from a generated will, carrying its content', async () => {
    await a.runAs(() => saveWillSection(a.userId, draftId, 'instructions', { revision: 0, currentStep: 6, data: { text: 'Keep the house' } }));
    await runAsSystem(() => prisma.will.update({ where: { id: draftId }, data: { status: 'GENERATED' } }));
    const clone = await a.runAs(() => createWillDraft(a.userId, draftId));
    expect(clone.version).toBe(3);
    expect(clone.payload.instructions.text).toBe('Keep the house');
    const overview = await a.runAs(() => getWillOverview(a.userId, deps));
    expect(overview.status).toBe('GENERATED');
    expect(overview.draft).toMatchObject({ id: clone.id, version: 3, currentStep: 2 });
    expect(overview.estate).toEqual({ assets: '100.0000', liabilities: '0.0000', net: '100.0000', nomineeOnly: '0.0000' });
  });

  it('suggests members of the user\'s families with their relation to the user', async () => {
    await runAsSystem(async () => {
      await prisma.user.update({ where: { id: b.userId }, data: { dob: new Date('1999-05-05T00:00:00Z') } });
      const family = await prisma.family.create({ data: { name: 'Test family', createdById: a.userId } });
      await prisma.familyMember.create({ data: { familyId: family.id, userId: a.userId, role: 'OWNER' } });
      await prisma.familyMember.create({ data: { familyId: family.id, userId: b.userId, relation: 'Son', relatedToId: a.userId } });
    });
    const s = await a.runAs(() => listWillPeopleSuggestions(a.userId));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ userId: b.userId, relation: 'Son', relationship: 'SON', dob: '1999-05-05' });
  });
});
```

- [ ] **Step 2: Write the failing route test**

Create `packages/api/test/routes/will.routes.test.ts`:
```ts
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Request, type Response } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { willRouter, rejectActAs } from '../../src/routes/will.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';
import { ForbiddenError } from '../../src/lib/errors.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let user: TestScope;
const token = (plan: 'FREE' | 'PLUS' = 'PLUS') =>
  signAccessToken({ sub: user.userId, email: `${user.userId}@test.local`, role: 'INVESTOR', plan }).token;

function call(method: string, path: string, body?: unknown, plan: 'FREE' | 'PLUS' | null = 'PLUS') {
  return fetch(`${base}/api/will${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(plan ? { authorization: `Bearer ${token(plan)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeAll(async () => {
  user = await createTestScope('will-http');
  const app = express();
  app.use(express.json());
  app.use('/api/will', willRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  await runAsSystem(() => prisma.will.deleteMany({ where: { userId: user.userId } }));
  await user.cleanup();
});

describe('/api/will gating', () => {
  it('requires auth', async () => expect((await call('GET', '/', undefined, null)).status).toBe(401));
  it('requires the PLUS plan', async () => expect((await call('GET', '/', undefined, 'FREE')).status).toBe(403));
  it('refuses a manager acting for a family profile', () => {
    const next = vi.fn();
    rejectActAs({ actor: { id: 'manager' } } as unknown as Request, {} as Response, next);
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ForbiddenError);
    const next2 = vi.fn();
    rejectActAs({} as Request, {} as Response, next2);
    expect(next2).toHaveBeenCalledWith();
  });
});

describe('/api/will drafts', () => {
  let id = '';

  it('creates a draft (201) and audits it', async () => {
    const res = await call('POST', '/drafts', {});
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { id: string; version: number } };
    id = json.data.id;
    expect(json.data.version).toBe(1);
    const audit = await runAsSystem(() => prisma.auditLog.findFirst({ where: { userId: user.userId, action: 'will_created' } }));
    expect(audit?.resource).toBe(`Will:${id}`);
  });

  it('shows the draft on the overview', async () => {
    const res = await call('GET', '/');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { status: string; draft: { id: string } } };
    expect(json.data.status).toBe('DRAFT');
    expect(json.data.draft.id).toBe(id);
  });

  it('saves a section, then refuses the old revision with 409', async () => {
    const ok = await call('PUT', `/drafts/${id}/sections/instructions`, { revision: 0, currentStep: 6, data: { text: 'Hello' } });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { data: { revision: number } }).data.revision).toBe(1);
    const stale = await call('PUT', `/drafts/${id}/sections/instructions`, { revision: 0, currentStep: 6, data: { text: 'Again' } });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { details: { reason: string } }).details.reason).toBe('WILL_REVISION_CONFLICT');
  });

  it('422 does not echo submitted values', async () => {
    const res = await call('PUT', `/drafts/${id}/sections/details`, {
      revision: 1, currentStep: 2, data: { legalName: `Zzyzx Secretname ${'x'.repeat(200)}`, address: 'Flat 9, Hidden Lane' },
    });
    expect(res.status).toBe(422);
    const text = await res.text();
    expect(text).not.toContain('Zzyzx');
    expect(text).not.toContain('Hidden Lane');
  });

  it('rejects an unknown section', async () => {
    expect((await call('PUT', `/drafts/${id}/sections/roles`, { revision: 1, currentStep: 3, data: {} })).status).toBe(400);
  });

  it('lists family suggestions (none here)', async () => {
    const res = await call('GET', '/people/suggestions');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { suggestions: unknown[] } }).data.suggestions).toEqual([]);
  });

  it('discards the draft (204) and audits it', async () => {
    expect((await call('DELETE', `/drafts/${id}`)).status).toBe(204);
    const audit = await runAsSystem(() => prisma.auditLog.findFirst({ where: { userId: user.userId, action: 'will_discarded' } }));
    expect(audit).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/will/willDraft.db.test.ts test/routes/will.routes.test.ts
```
Expected: FAIL - cannot resolve `will.service.js` / `will.routes.js`.

- [ ] **Step 4: The store**

Create `packages/api/src/services/will/willStore.ts`:
```ts
/**
 * Sealing and loading of will payloads. The payload holds every personal
 * detail of a will, so it is only ever stored sealed with the owner's data
 * key (slot "will:<id>") and never logged.
 */
import { randomUUID } from 'node:crypto';
import type { Will } from '@prisma/client';
import type { ZodError } from 'zod';
import { istCalendarDate, willPayloadSchema, type WillPayload } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { AppError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { openForUser, sealForUser, userKeysAvailable } from '../../lib/userKeys.js';

export function newWillId(): string {
  return randomUUID();
}

export function requireWillKeys(): void {
  if (!userKeysAvailable()) {
    throw new AppError('Will Maker is not available right now', 503, 'WILL_KEYS_UNAVAILABLE');
  }
}

const slot = (willId: string) => `will:${willId}`;

export async function sealWillPayload(userId: string, willId: string, payload: WillPayload): Promise<Buffer> {
  requireWillKeys();
  return sealForUser(userId, slot(willId), Buffer.from(JSON.stringify(payload), 'utf8'));
}

export async function openWillPayload(userId: string, willId: string, sealed: Uint8Array): Promise<WillPayload> {
  requireWillKeys();
  const plain = await openForUser(userId, slot(willId), Buffer.from(sealed));
  return willPayloadSchema.parse(JSON.parse(plain.toString('utf8')));
}

export async function loadOwnedWill(userId: string, willId: string): Promise<Will> {
  const will = await prisma.will.findFirst({ where: { id: willId, userId } });
  if (!will) throw new NotFoundError('Will not found');
  return will;
}

export async function loadDraft(userId: string, willId: string): Promise<{ will: Will; payload: WillPayload }> {
  const will = await loadOwnedWill(userId, willId);
  if (will.status !== 'DRAFT') {
    throw new ConflictError('This will can no longer be edited. Start a new version instead.', { reason: 'WILL_NOT_DRAFT' });
  }
  return { will, payload: await openWillPayload(userId, will.id, will.payload) };
}

export function revisionConflict(current: number): ConflictError {
  return new ConflictError('This will was changed in another tab or device. Reload to continue.', {
    reason: 'WILL_REVISION_CONFLICT',
    revision: current,
  });
}

/** Issue paths and codes only: zod messages and inputs never leave the server. */
export function zodIssues(err: ZodError): Array<{ path: string; code: string }> {
  return err.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), code: i.code }));
}

export function todayIst(): string {
  return istCalendarDate(new Date());
}
```

- [ ] **Step 5: The service**

Create `packages/api/src/services/will/will.service.ts`:
```ts
import { Prisma, type Will, type WillVersion } from '@prisma/client';
import {
  applyWillSection, emptyWillPayload, runWillRules, serializeMoney, willEstateTotals,
  WILL_PAYLOAD_SCHEMA_VER, WILL_SECTION_SCHEMAS,
  type WillDraftWire, type WillEstateRefreshWire, type WillOverviewWire, type WillPayload, type WillRelationship,
  type WillSaveResultWire, type WillSection, type WillSectionData, type WillStatusWire, type WillSuggestionWire,
  type WillVersionWire,
} from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { collectEstate, type EstateCollection } from './estate/registry.js';
import { candidatesToItems, reconcileEstate } from './estate/reconcile.js';
import type { EstateContext } from './estate/types.js';
import {
  loadDraft, loadOwnedWill, newWillId, openWillPayload, revisionConflict, sealWillPayload, todayIst, zodIssues,
} from './willStore.js';

export interface WillServiceDeps {
  collect?: (ctx: EstateContext) => Promise<EstateCollection>;
  today?: () => string;
}

export function toVersionWire(status: WillStatusWire, v: WillVersion): WillVersionWire {
  return {
    id: v.id,
    willId: v.willId,
    versionNo: v.versionNo,
    status,
    generatedOn: v.generatedOn.toISOString().slice(0, 10),
    templateId: v.templateId,
    templateVersion: v.templateVersion,
  };
}

function toDraftWire(will: Will, payload: WillPayload, today: string): WillDraftWire {
  return {
    id: will.id,
    version: will.version,
    revision: will.revision,
    currentStep: will.currentStep,
    payload,
    findings: runWillRules(payload, { today }),
    updatedAt: will.updatedAt.toISOString(),
  };
}

const DRAFT_EXISTS = 'You already have a draft will. Continue it or discard it first.';

export async function getWillOverview(userId: string, deps: WillServiceDeps = {}): Promise<WillOverviewWire> {
  const today = (deps.today ?? todayIst)();
  const wills = await prisma.will.findMany({
    where: { userId, status: { not: 'DISCARDED' } },
    orderBy: { version: 'desc' },
    include: { versions: { orderBy: { versionNo: 'desc' } } },
  });
  const draft = wills.find((w) => w.status === 'DRAFT') ?? null;
  const live = wills.find((w) => w.status === 'GENERATED' || w.status === 'EXECUTED') ?? null;
  const versions = wills.flatMap((w) => w.versions.map((v) => toVersionWire(w.status, v)));
  const collection = await (deps.collect ?? collectEstate)({ userId, today });
  const totals = willEstateTotals(candidatesToItems(collection.candidates));
  return {
    status: live ? (live.status as 'GENERATED' | 'EXECUTED') : draft ? 'DRAFT' : 'NOT_CREATED',
    draft: draft
      ? { id: draft.id, version: draft.version, currentStep: draft.currentStep, updatedAt: draft.updatedAt.toISOString() }
      : null,
    versions,
    estate: {
      assets: serializeMoney(totals.assets),
      liabilities: serializeMoney(totals.liabilities),
      net: serializeMoney(totals.net),
      nomineeOnly: serializeMoney(totals.nomineeOnly),
    },
    estateFailedSources: collection.failed,
  };
}

export async function createWillDraft(userId: string, fromWillId: string | null): Promise<WillDraftWire> {
  const existing = await prisma.will.findFirst({ where: { userId, status: 'DRAFT' }, select: { id: true } });
  if (existing) throw new ConflictError(DRAFT_EXISTS, { reason: 'WILL_DRAFT_EXISTS', draftId: existing.id });

  let payload = emptyWillPayload();
  if (fromWillId) {
    const source = await loadOwnedWill(userId, fromWillId);
    if (source.status === 'DISCARDED') throw new NotFoundError('Will not found');
    payload = await openWillPayload(userId, source.id, source.payload);
  }
  const last = await prisma.will.findFirst({ where: { userId }, orderBy: { version: 'desc' }, select: { version: true } });
  const id = newWillId();
  const sealed = await sealWillPayload(userId, id, payload);
  try {
    const row = await prisma.will.create({
      data: { id, userId, version: (last?.version ?? 0) + 1, payload: sealed, payloadSchemaVer: WILL_PAYLOAD_SCHEMA_VER },
    });
    return toDraftWire(row, payload, todayIst());
  } catch (err) {
    // Two tabs pressing "Create" at once: the partial unique index lets one win.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError(DRAFT_EXISTS, { reason: 'WILL_DRAFT_EXISTS' });
    }
    throw err;
  }
}

export async function getWillDraft(userId: string, willId: string, deps: WillServiceDeps = {}): Promise<WillDraftWire> {
  const { will, payload } = await loadDraft(userId, willId);
  return toDraftWire(will, payload, (deps.today ?? todayIst)());
}

/** Write a new payload if nobody saved since `will.revision` was read. */
async function writeDraft(userId: string, will: Will, payload: WillPayload, currentStep: number): Promise<WillSaveResultWire> {
  const sealed = await sealWillPayload(userId, will.id, payload);
  const res = await prisma.will.updateMany({
    where: { id: will.id, userId, status: 'DRAFT', revision: will.revision },
    data: { payload: sealed, revision: { increment: 1 }, currentStep },
  });
  if (res.count === 0) {
    const now = await prisma.will.findFirst({ where: { id: will.id, userId }, select: { revision: true } });
    throw revisionConflict(now?.revision ?? will.revision);
  }
  return { revision: will.revision + 1, updatedAt: new Date().toISOString() };
}

export async function saveWillSection(
  userId: string,
  willId: string,
  section: WillSection,
  input: { revision: number; currentStep: number; data: unknown },
): Promise<WillSaveResultWire> {
  const parsed = WILL_SECTION_SCHEMAS[section].safeParse(input.data);
  if (!parsed.success) {
    throw new ValidationError('Some will details are not valid', { issues: zodIssues(parsed.error) });
  }
  const { will, payload } = await loadDraft(userId, willId);
  if (will.revision !== input.revision) throw revisionConflict(will.revision);
  const next = applyWillSection(payload, section, parsed.data as WillSectionData[typeof section]);
  return writeDraft(userId, will, next, input.currentStep);
}

export async function refreshWillEstate(
  userId: string,
  willId: string,
  revision: number,
  deps: WillServiceDeps = {},
): Promise<WillEstateRefreshWire> {
  const today = (deps.today ?? todayIst)();
  const { will, payload } = await loadDraft(userId, willId);
  if (will.revision !== revision) throw revisionConflict(will.revision);
  const collection = await (deps.collect ?? collectEstate)({ userId, today });
  const estate = {
    asOf: today,
    items: reconcileEstate(payload.estate.items, collection.candidates),
    failedSources: collection.failed,
  };
  const saved = await writeDraft(userId, will, { ...payload, estate }, will.currentStep);
  return { revision: saved.revision, estate };
}

export async function discardWillDraft(userId: string, willId: string): Promise<void> {
  const res = await prisma.will.updateMany({ where: { id: willId, userId, status: 'DRAFT' }, data: { status: 'DISCARDED' } });
  if (res.count === 0) throw new NotFoundError('Draft not found');
}

const RELATION_WORDS: Record<string, WillRelationship> = {
  spouse: 'SPOUSE', wife: 'SPOUSE', husband: 'SPOUSE', son: 'SON', daughter: 'DAUGHTER', father: 'FATHER',
  mother: 'MOTHER', brother: 'BROTHER', sister: 'SISTER', grandson: 'GRANDSON', granddaughter: 'GRANDDAUGHTER',
  'son-in-law': 'SON_IN_LAW', 'daughter-in-law': 'DAUGHTER_IN_LAW',
};

/** Active members of the user's own families, for the People step's quick-pick. */
export async function listWillPeopleSuggestions(userId: string): Promise<WillSuggestionWire[]> {
  const members = await prisma.familyMember.findMany({
    where: {
      status: 'ACTIVE',
      userId: { not: userId },
      family: { members: { some: { userId, status: 'ACTIVE' } } },
    },
    select: { userId: true, relation: true, relatedToId: true, user: { select: { name: true, dob: true } } },
  });
  const seen = new Set<string>();
  const out: WillSuggestionWire[] = [];
  for (const m of members) {
    if (seen.has(m.userId)) continue;
    seen.add(m.userId);
    // A relation label is relative to `relatedToId`; only use it when that is this user.
    const relation = m.relatedToId === null || m.relatedToId === userId ? m.relation : null;
    out.push({
      userId: m.userId,
      name: m.user.name,
      relation,
      relationship: relation ? RELATION_WORDS[relation.trim().toLowerCase()] ?? null : null,
      dob: m.user.dob ? m.user.dob.toISOString().slice(0, 10) : null,
    });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name, 'en'));
}
```

- [ ] **Step 6: Controller and routes**

Create `packages/api/src/controllers/will.controller.ts`:
```ts
import type { Request, Response } from 'express';
import { z } from 'zod';
import { isWillSection } from '@everypaisa/shared';
import { BadRequestError, UnauthorizedError, ValidationError } from '../lib/errors.js';
import { created, noContent, ok } from '../lib/response.js';
import { writeAuditLog } from '../lib/audit.js';
import { zodIssues } from '../services/will/willStore.js';
import {
  createWillDraft, discardWillDraft, getWillDraft, getWillOverview, listWillPeopleSuggestions,
  refreshWillEstate, saveWillSection,
} from '../services/will/will.service.js';

export function uid(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

export function parseOr422<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new ValidationError('Some will details are not valid', { issues: zodIssues(r.error) });
  return r.data;
}

const id = z.string().min(1).max(64);
export function idOf(req: Request, name: string): string {
  return parseOr422(id, req.params[name]);
}

const createBody = z.object({ fromWillId: z.string().min(1).max(64).optional() });
const saveBody = z.object({ revision: z.number().int().min(0), currentStep: z.number().int().min(2).max(8), data: z.unknown() });
const revisionBody = z.object({ revision: z.number().int().min(0) });

export async function overview(req: Request, res: Response): Promise<void> {
  ok(res, await getWillOverview(uid(req)));
}

export async function createDraft(req: Request, res: Response): Promise<void> {
  const userId = uid(req);
  const body = parseOr422(createBody, req.body ?? {});
  const draft = await createWillDraft(userId, body.fromWillId ?? null);
  await writeAuditLog({
    userId, action: 'will_created', resource: `Will:${draft.id}`,
    metadata: { version: draft.version, cloned: Boolean(body.fromWillId) }, req,
  });
  created(res, draft);
}

export async function getDraft(req: Request, res: Response): Promise<void> {
  ok(res, await getWillDraft(uid(req), idOf(req, 'id')));
}

export async function saveSection(req: Request, res: Response): Promise<void> {
  const section = String(req.params['section'] ?? '');
  if (!isWillSection(section)) throw new BadRequestError('Unknown will section', { field: 'section' });
  const body = parseOr422(saveBody, req.body);
  ok(res, await saveWillSection(uid(req), idOf(req, 'id'), section, body));
}

export async function refreshEstate(req: Request, res: Response): Promise<void> {
  const body = parseOr422(revisionBody, req.body);
  ok(res, await refreshWillEstate(uid(req), idOf(req, 'id'), body.revision));
}

export async function discardDraft(req: Request, res: Response): Promise<void> {
  const userId = uid(req);
  const willId = idOf(req, 'id');
  await discardWillDraft(userId, willId);
  await writeAuditLog({ userId, action: 'will_discarded', resource: `Will:${willId}`, req });
  noContent(res);
}

export async function suggestions(req: Request, res: Response): Promise<void> {
  ok(res, { suggestions: await listWillPeopleSuggestions(uid(req)) });
}
```

Create `packages/api/src/routes/will.routes.ts`:
```ts
import { Router, type NextFunction, type Request, type Response } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireFeature } from '../middleware/requirePlan.js';
import { asyncHandler } from '../middleware/validate.js';
import { ForbiddenError } from '../lib/errors.js';
import * as will from '../controllers/will.controller.js';

/**
 * Will Maker is for the signed-in person's own will only (v1). A manager
 * acting for a managed family profile (X-Act-As, see authenticate) is refused
 * before any data is read.
 */
export function rejectActAs(req: Request, _res: Response, next: NextFunction): void {
  if (req.actor) {
    next(new ForbiddenError('Will Maker works on your own account only. Switch back to your own account.'));
    return;
  }
  next();
}

export const willRouter = Router();
willRouter.use(authenticate, rejectActAs, requireFeature('WILL_MAKER'));
willRouter.get('/', asyncHandler(will.overview));
willRouter.post('/drafts', asyncHandler(will.createDraft));
willRouter.get('/drafts/:id', asyncHandler(will.getDraft));
willRouter.put('/drafts/:id/sections/:section', asyncHandler(will.saveSection));
willRouter.post('/drafts/:id/estate/refresh', asyncHandler(will.refreshEstate));
willRouter.delete('/drafts/:id', asyncHandler(will.discardDraft));
willRouter.get('/people/suggestions', asyncHandler(will.suggestions));
```

In `packages/api/src/routes/index.ts`: add `import { willRouter } from './will.routes.js';` after `import { emiRouter } from './emi.routes.js';`, and add `app.use('/api/will', willRouter);` after `app.use('/api/emi', emiRouter);`.

- [ ] **Step 7: Run the tests to verify they pass**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/will/willDraft.db.test.ts test/routes/will.routes.test.ts
npx tsc --noEmit
npx eslint src/services/will src/controllers/will.controller.ts src/routes/will.routes.ts
```
Expected: PASS; no type or lint errors.

- [ ] **Step 8: Commit**

```bash
cd portfolioos
git add packages/api/src/services/will/willStore.ts packages/api/src/services/will/will.service.ts packages/api/src/controllers/will.controller.ts packages/api/src/routes/will.routes.ts packages/api/src/routes/index.ts packages/api/test/will/willDraft.db.test.ts packages/api/test/routes/will.routes.test.ts
git commit -m "feat(will): draft API with sealed payloads, revisions and estate refresh

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Web - API client, overview page, nav item, route

**Wave 2** (parallel with Tasks 4 and 6; needs Tasks 1 and 3; uses the API contract of Tasks 7 and 10, which the tests mock).

**Files:**
- Create: `apps/web/src/api/will.api.ts`
- Create: `apps/web/src/pages/will/willSteps.ts`
- Create: `apps/web/src/pages/will/WillGuards.tsx`
- Create: `apps/web/src/pages/will/WillOverviewPage.tsx`
- Create: `apps/web/src/pages/will/willTestData.ts` (test builders shared by every web will test; not a test file)
- Modify: `apps/web/src/components/layout/navItems.tsx` (Will Maker after Goals)
- Modify: `apps/web/src/App.tsx` (route `/will`)
- Test: `apps/web/src/pages/will/WillOverviewPage.test.tsx`, `apps/web/src/pages/will/willSteps.test.ts`

**Interfaces:**
- Consumes: Task 1 wire types and copy (`WillOverviewWire`, `WillDraftWire`, `WillSaveResultWire`, `WillEstateRefreshWire`, `WillSuggestionWire`, `WillPreviewWire`, `WillGenerateResultWire`, `WillSection`, `WillSectionData`, `WILL_DISCLAIMER`, `emptyWillPayload`), Task 3 (`FEATURE_MIN_TIER.WILL_MAKER`).
- Produces:
  - `willApi`: `overview()`, `createDraft(fromWillId?)`, `getDraft(id)`, `saveSection(id, section, { revision, currentStep, data })`, `refreshEstate(id, revision)`, `discard(id)`, `suggestions()`, `preview(id)`, `generate(id, revision)`, `downloadPdf(versionId, versionNo)`.
  - `isWillRevisionConflict(err: unknown): boolean`, `willDraftExistsId(err: unknown): string | null`, `isWillBlocked(err: unknown): boolean` (422 with `details.reason === 'WILL_BLOCKED'`).
  - `WILL_STEPS: ReadonlyArray<{ n: number; slug: WillStepSlug; label: string }>`, `type WillStepSlug = 'overview' | 'details' | 'people' | 'estate' | 'allocation' | 'instructions' | 'review' | 'preview'`, `stepBySlug(slug: string)`, `willStepPath(id: string, n: number): string`.
  - `OwnAccountOnly` component, `WillGate({ children })` (acting-as card, else `LockedFeature` compact with `FEATURE_MIN_TIER.WILL_MAKER`).
  - `WillOverviewPage` at `/will`.
  - Test builders in `willTestData.ts`: `TODAY`, `person(p)`, `item(p)`, `fullPayload()`, `signIn(plan)`, `resetStores()`, `overview(p)`, `draftWire(p)`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/pages/will/willTestData.ts`:
```ts
import {
  emptyWillPayload, type AuthUser, type WillAssetItem, type WillDraftWire, type WillOverviewWire, type WillPayload, type WillPerson,
} from '@everypaisa/shared';
import { useAuthStore } from '@/stores/auth.store';
import { useActingAsStore } from '@/stores/actingAs.store';

export const TODAY = '2026-10-12';

export function person(p: Partial<WillPerson> & { id: string; name: string }): WillPerson {
  return { partyType: 'INDIVIDUAL', relationship: 'SON', dob: '1990-01-01', contact: null, sourceFamilyMemberId: null, contingentId: null, ...p };
}

export function item(p: Partial<WillAssetItem> & { sourceKey: string; label: string }): WillAssetItem {
  return {
    side: 'ASSET', kind: 'BANK_ACCOUNT', ref: null, value: '100000.00', valueAsOf: TODAY,
    ownership: { type: 'SOLE', sharePct: '100' }, review: 'CONFIRMED', userEdited: false, note: null, ...p,
  };
}

export function fullPayload(): WillPayload {
  return {
    ...emptyWillPayload(),
    details: {
      legalName: 'Ramesh Kumar Verma', dob: '1970-05-15', jurisdiction: 'IN', personalLaw: 'HINDU',
      address: '12 MG Road, Pune 411001', maritalStatus: 'MARRIED', hasChildren: true, hasDependents: false,
    },
    people: [
      person({ id: 'p-spouse', name: 'Sunita Verma', relationship: 'SPOUSE', dob: '1972-08-01' }),
      person({ id: 'p-son', name: 'Arjun Verma', relationship: 'SON', dob: '1998-02-10', contingentId: 'p-spouse' }),
      person({ id: 'p-trust', name: 'Pune Animal Trust', partyType: 'ORGANISATION', relationship: 'CHARITY', dob: null }),
    ],
    roles: { executorId: 'p-spouse', altExecutorId: 'p-son', guardianId: null, altGuardianId: null },
    estate: {
      asOf: TODAY,
      failedSources: [],
      items: [
        item({ sourceKey: 'bank:b1', label: 'HDFC Bank savings account', ref: 'XXXX1234', value: '250000.00' }),
        item({ sourceKey: 'holdings:pf1:EQUITY', kind: 'HOLDING', label: 'Equity - My Portfolio', value: '1500000.00' }),
        item({ sourceKey: 'loan:l1', side: 'LIABILITY', kind: 'LOAN', label: 'Home loan - SBI', value: '400000.00' }),
      ],
    },
    allocation: {
      residuary: [{ personId: 'p-spouse', sharePct: '60' }, { personId: 'p-son', sharePct: '40' }],
      specificGifts: [{ itemId: 'holdings:pf1:EQUITY', personId: 'p-son', sharePct: '100' }],
      fixedGifts: [{ personId: 'p-trust', amount: '50000' }],
    },
    instructions: { text: 'I wish my books to go to the Pune public library.' },
  };
}

export function signIn(plan: AuthUser['plan'] = 'PLUS'): void {
  useAuthStore.setState({
    user: { id: 'u1', email: 'a@b.com', name: 'Test User', role: 'INVESTOR', plan, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  });
}

export function resetStores(): void {
  useAuthStore.setState({ user: null });
  useActingAsStore.setState({ profile: null });
}

export function overview(p: Partial<WillOverviewWire> = {}): WillOverviewWire {
  return {
    status: 'NOT_CREATED',
    draft: null,
    versions: [],
    estate: { assets: '1750000.0000', liabilities: '400000.0000', net: '1350000.0000', nomineeOnly: '0.0000' },
    estateFailedSources: [],
    ...p,
  };
}

export function draftWire(p: Partial<WillDraftWire> = {}): WillDraftWire {
  return {
    id: 'w1', version: 1, revision: 0, currentStep: 2, payload: fullPayload(), findings: [],
    updatedAt: '2026-10-12T05:00:00.000Z', ...p,
  };
}
```

Create `apps/web/src/pages/will/willSteps.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { stepBySlug, willStepPath, WILL_STEPS } from './willSteps';

describe('will steps', () => {
  it('has eight steps, overview first', () => {
    expect(WILL_STEPS.map((s) => s.slug)).toEqual(['overview', 'details', 'people', 'estate', 'allocation', 'instructions', 'review', 'preview']);
    expect(WILL_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('builds paths', () => {
    expect(willStepPath('w1', 1)).toBe('/will');
    expect(willStepPath('w1', 4)).toBe('/will/w1/estate');
    expect(willStepPath('w1', 99)).toBe('/will/w1/details');
    expect(stepBySlug('review')?.n).toBe(7);
    expect(stepBySlug('nope')).toBeUndefined();
  });
});
```

Create `apps/web/src/pages/will/WillOverviewPage.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { renderWithProviders } from '@/pages/split/testUtils';
import { useActingAsStore } from '@/stores/actingAs.store';
import { willApi } from '@/api/will.api';
import { WillOverviewPage } from './WillOverviewPage';
import { draftWire, overview, resetStores, signIn } from './willTestData';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/will.api', () => ({
  willApi: { overview: vi.fn(), createDraft: vi.fn(), discard: vi.fn(), downloadPdf: vi.fn() },
  willDraftExistsId: vi.fn(() => null),
}));

const api = vi.mocked(willApi);

beforeEach(() => {
  vi.clearAllMocks();
  signIn('PLUS');
});
afterEach(() => {
  cleanup();
  resetStores();
});

describe('WillOverviewPage', () => {
  it('shows status, estate totals, what to prepare and the disclaimer; creates a draft', async () => {
    api.overview.mockResolvedValue(overview());
    api.createDraft.mockResolvedValue(draftWire({ id: 'w9' }));
    renderWithProviders(<WillOverviewPage />, { route: '/will', path: '/will' });
    expect(await screen.findByText('Not created')).toBeTruthy();
    expect(screen.getByTestId('will-estate-assets').textContent).toContain('17,50,000');
    expect(screen.getByTestId('will-estate-net').textContent).toContain('13,50,000');
    expect(screen.getByText(/two adult witnesses/i)).toBeTruthy();
    expect(screen.getByText(/not legal advice/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /create my will/i }));
    await waitFor(() => expect(api.createDraft).toHaveBeenCalledWith(undefined));
    expect(await screen.findByTestId('navigated')).toBeTruthy();
  });

  it('offers to continue or discard a draft', async () => {
    api.overview.mockResolvedValue(overview({ status: 'DRAFT', draft: { id: 'w1', version: 1, currentStep: 4, updatedAt: '2026-10-12T05:00:00.000Z' } }));
    api.discard.mockResolvedValue(undefined);
    renderWithProviders(<WillOverviewPage />, { route: '/will', path: '/will' });
    expect(await screen.findByRole('button', { name: /continue/i })).toBeTruthy();
    expect(screen.getByText(/12\/10\/2026/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /discard draft/i }));
    await waitFor(() => expect(api.discard).toHaveBeenCalledWith('w1'));
  });

  it('downloads a generated version and starts a new one from it', async () => {
    api.overview.mockResolvedValue(overview({
      status: 'GENERATED',
      versions: [{ id: 'v1', willId: 'w1', versionNo: 1, status: 'GENERATED', generatedOn: '2026-10-12', templateId: 'isa-hindu', templateVersion: 1 }],
    }));
    api.downloadPdf.mockResolvedValue(undefined);
    api.createDraft.mockResolvedValue(draftWire({ id: 'w2', version: 2 }));
    renderWithProviders(<WillOverviewPage />, { route: '/will', path: '/will' });
    expect(await screen.findByText('Generated')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /download pdf/i })[0]!);
    await waitFor(() => expect(api.downloadPdf).toHaveBeenCalledWith('v1', 1));
    fireEvent.click(screen.getByRole('button', { name: /start a new version/i }));
    await waitFor(() => expect(api.createDraft).toHaveBeenCalledWith('w1'));
  });

  it('is locked on the Free plan and does not call the API', async () => {
    signIn('FREE');
    renderWithProviders(<WillOverviewPage />, { route: '/will', path: '/will' });
    expect(screen.getByText(/will maker is locked/i)).toBeTruthy();
    expect(api.overview).not.toHaveBeenCalled();
  });

  it('refuses while managing a family member', () => {
    useActingAsStore.setState({ profile: { id: 'p1', name: 'Dadaji', managerId: 'u1' } });
    renderWithProviders(<WillOverviewPage />, { route: '/will', path: '/will' });
    expect(screen.getByText(/your own account only/i)).toBeTruthy();
    expect(api.overview).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/will`
Expected: FAIL - cannot resolve `./willSteps`, `./WillOverviewPage`, `@/api/will.api`.

- [ ] **Step 3: API client**

Create `apps/web/src/api/will.api.ts`:
```ts
import axios from 'axios';
import type {
  ApiResponse, WillDraftWire, WillEstateRefreshWire, WillGenerateResultWire, WillOverviewWire, WillPreviewWire,
  WillSaveResultWire, WillSection, WillSectionData, WillSuggestionWire,
} from '@everypaisa/shared';
import { api, decodeBlobError, unwrap } from './client';

const BASE = '/api/will';
const draftPath = (id: string) => `${BASE}/drafts/${encodeURIComponent(id)}`;

/** Will Maker. Money and percentages stay decimal strings end to end. */
export const willApi = {
  async overview(): Promise<WillOverviewWire> {
    const { data } = await api.get<ApiResponse<WillOverviewWire>>(BASE);
    return unwrap(data);
  },
  async createDraft(fromWillId?: string): Promise<WillDraftWire> {
    const { data } = await api.post<ApiResponse<WillDraftWire>>(`${BASE}/drafts`, fromWillId ? { fromWillId } : {});
    return unwrap(data);
  },
  async getDraft(id: string): Promise<WillDraftWire> {
    const { data } = await api.get<ApiResponse<WillDraftWire>>(draftPath(id));
    return unwrap(data);
  },
  async saveSection<S extends WillSection>(
    id: string,
    section: S,
    body: { revision: number; currentStep: number; data: WillSectionData[S] },
  ): Promise<WillSaveResultWire> {
    const { data } = await api.put<ApiResponse<WillSaveResultWire>>(`${draftPath(id)}/sections/${section}`, body);
    return unwrap(data);
  },
  async refreshEstate(id: string, revision: number): Promise<WillEstateRefreshWire> {
    const { data } = await api.post<ApiResponse<WillEstateRefreshWire>>(`${draftPath(id)}/estate/refresh`, { revision });
    return unwrap(data);
  },
  async discard(id: string): Promise<void> {
    await api.delete(draftPath(id));
  },
  async suggestions(): Promise<WillSuggestionWire[]> {
    const { data } = await api.get<ApiResponse<{ suggestions: WillSuggestionWire[] }>>(`${BASE}/people/suggestions`);
    return unwrap(data).suggestions;
  },
  async preview(id: string): Promise<WillPreviewWire> {
    const { data } = await api.get<ApiResponse<WillPreviewWire>>(`${draftPath(id)}/preview`);
    return unwrap(data);
  },
  async generate(id: string, revision: number): Promise<WillGenerateResultWire> {
    const { data } = await api.post<ApiResponse<WillGenerateResultWire>>(`${draftPath(id)}/generate`, { revision, acknowledge: true });
    return unwrap(data);
  },
  async downloadPdf(versionId: string, versionNo: number): Promise<void> {
    let res;
    try {
      res = await api.get(`${BASE}/versions/${encodeURIComponent(versionId)}/pdf`, { responseType: 'blob' });
    } catch (err) {
      throw await decodeBlobError(err);
    }
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `will-v${versionNo}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};

function errorDetails(err: unknown, status: number): Record<string, unknown> | null {
  if (!axios.isAxiosError(err) || err.response?.status !== status) return null;
  const details = (err.response.data as { details?: unknown } | undefined)?.details;
  return details && typeof details === 'object' ? (details as Record<string, unknown>) : null;
}

export function isWillRevisionConflict(err: unknown): boolean {
  return errorDetails(err, 409)?.['reason'] === 'WILL_REVISION_CONFLICT';
}

export function willDraftExistsId(err: unknown): string | null {
  const d = errorDetails(err, 409);
  return d?.['reason'] === 'WILL_DRAFT_EXISTS' && typeof d['draftId'] === 'string' ? d['draftId'] : null;
}

export function isWillBlocked(err: unknown): boolean {
  return errorDetails(err, 422)?.['reason'] === 'WILL_BLOCKED';
}
```

- [ ] **Step 4: Steps, guards, overview page**

Create `apps/web/src/pages/will/willSteps.ts`:
```ts
export type WillStepSlug = 'overview' | 'details' | 'people' | 'estate' | 'allocation' | 'instructions' | 'review' | 'preview';

export const WILL_STEPS: ReadonlyArray<{ n: number; slug: WillStepSlug; label: string }> = [
  { n: 1, slug: 'overview', label: 'Overview' },
  { n: 2, slug: 'details', label: 'Your details' },
  { n: 3, slug: 'people', label: 'People & roles' },
  { n: 4, slug: 'estate', label: 'Assets & liabilities' },
  { n: 5, slug: 'allocation', label: 'Allocate' },
  { n: 6, slug: 'instructions', label: 'Instructions' },
  { n: 7, slug: 'review', label: 'Review' },
  { n: 8, slug: 'preview', label: 'Preview' },
];

export function stepBySlug(slug: string) {
  return WILL_STEPS.find((s) => s.slug === slug);
}

/** Step 1 is the overview page; an unknown step resumes at Your details. */
export function willStepPath(id: string, n: number): string {
  if (n <= 1) return '/will';
  const step = WILL_STEPS.find((s) => s.n === n) ?? WILL_STEPS[1]!;
  return `/will/${encodeURIComponent(id)}/${step.slug}`;
}
```

Create `apps/web/src/pages/will/WillGuards.tsx`:
```tsx
import type { ReactNode } from 'react';
import { FEATURE_MIN_TIER } from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { LockedFeature } from '@/components/common/LockedFeature';
import { useActingAsStore } from '@/stores/actingAs.store';

export function OwnAccountOnly() {
  return (
    <Card className="p-5 text-sm text-foreground">
      Will Maker works on your own account only. Switch back to your own account to make or view your will.
    </Card>
  );
}

/** Plan gate + own-account rule. Children never mount (so never call the API) while either applies. */
export function WillGate({ children }: { children: ReactNode }) {
  const acting = useActingAsStore((s) => s.profile);
  if (acting) return <OwnAccountOnly />;
  return (
    <LockedFeature requiredTier={FEATURE_MIN_TIER.WILL_MAKER} featureName="Will Maker" compact>
      {children}
    </LockedFeature>
  );
}
```

Create `apps/web/src/pages/will/WillOverviewPage.tsx`:
```tsx
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Clock, Download, Info, ScrollText } from 'lucide-react';
import { formatDateIST, formatDateOnly, formatINR, WILL_DISCLAIMER, type WillOverviewWire, type WillVersionWire } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiErrorMessage } from '@/api/client';
import { willApi, willDraftExistsId } from '@/api/will.api';
import { WillGate } from './WillGuards';
import { willStepPath } from './willSteps';

const STATUS_LABEL: Record<WillOverviewWire['status'], string> = {
  NOT_CREATED: 'Not created',
  DRAFT: 'Draft',
  GENERATED: 'Generated',
  EXECUTED: 'Executed',
};

const VERSION_STATUS: Record<WillVersionWire['status'], string> = {
  DRAFT: 'Draft', GENERATED: 'Generated', EXECUTED: 'Executed', SUPERSEDED: 'Replaced', DISCARDED: 'Discarded',
};

const PREPARE = [
  'Full legal names and dates of birth of the people you want to include',
  'Who should carry out your will (an executor) and a back-up',
  'A guardian for any children under 18',
  'How you want your assets shared',
  'Later, for signing: two adult witnesses who are not beneficiaries',
];

export function WillOverviewPage() {
  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        eyebrow="Planning"
        title="Will Maker"
        description="Write a simple will under Indian law from your EveryPaisa data, check it, and download it to sign."
      />
      <WillGate>
        <OverviewBody />
      </WillGate>
    </div>
  );
}

function money(v: string): string {
  return formatINR(v, { fractionDigits: 0 });
}

function OverviewBody() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['will', 'overview'], queryFn: () => willApi.overview() });

  const create = useMutation({
    mutationFn: (fromWillId?: string) => willApi.createDraft(fromWillId),
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
      toast.error(apiErrorMessage(err, "Couldn't start your will"));
    },
  });
  const discard = useMutation({
    mutationFn: (id: string) => willApi.discard(id),
    onSuccess: () => {
      toast.success('Draft discarded');
      void qc.invalidateQueries({ queryKey: ['will'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't discard the draft")),
  });
  const download = useMutation({
    mutationFn: (v: WillVersionWire) => willApi.downloadPdf(v.id, v.versionNo),
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't download the PDF")),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (q.isError || !q.data) {
    return <Card className="p-5 text-sm text-negative">{apiErrorMessage(q.error, "Couldn't load Will Maker")}</Card>;
  }
  const o = q.data;
  const latest = o.versions.find((v) => v.status === 'GENERATED' || v.status === 'EXECUTED') ?? null;
  const nominee = formatINR(o.estate.nomineeOnly);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <Card className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Your will</h2>
            </div>
            <Badge variant="secondary">{STATUS_LABEL[o.status]}</Badge>
          </div>
          {o.draft && (
            <div className="space-y-2 rounded-md border border-border/60 p-3 text-sm">
              <p className="text-foreground">
                Draft, version {o.draft.version} - last saved {formatDateIST(o.draft.updatedAt)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => navigate(willStepPath(o.draft!.id, o.draft!.currentStep))}>Continue</Button>
                <Button size="sm" variant="outline" disabled={discard.isPending} onClick={() => discard.mutate(o.draft!.id)}>
                  Discard draft
                </Button>
              </div>
            </div>
          )}
          {latest && (
            <div className="space-y-2 rounded-md border border-border/60 p-3 text-sm">
              <p className="text-foreground">Version {latest.versionNo} generated on {formatDateOnly(latest.generatedOn)}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={download.isPending} onClick={() => download.mutate(latest)}>
                  <Download className="mr-1 h-4 w-4" />Download PDF
                </Button>
                {!o.draft && (
                  <Button size="sm" disabled={create.isPending} onClick={() => create.mutate(latest.willId)}>
                    Start a new version
                  </Button>
                )}
              </div>
            </div>
          )}
          {!o.draft && !latest && (
            <Button disabled={create.isPending} onClick={() => create.mutate(undefined)}>Create my will</Button>
          )}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />About 15-20 minutes. Your progress is saved as you go.
          </p>
        </Card>

        <Card className="space-y-3 p-4 sm:p-5">
          <h2 className="text-base font-semibold text-foreground">Your estate (indicative)</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile label="Assets" value={money(o.estate.assets)} testId="will-estate-assets" />
            <Tile label="Liabilities" value={money(o.estate.liabilities)} testId="will-estate-liabilities" />
            <Tile label="Net worth" value={money(o.estate.net)} testId="will-estate-net" />
          </div>
          <p className="text-xs text-muted-foreground">
            From your EveryPaisa accounts today. Insurance paid to nominees ({nominee}) is not counted.
            {o.estateFailedSources.length > 0 && ` ${o.estateFailedSources.length} source(s) could not be read right now.`}
          </p>
        </Card>

        {o.versions.length > 0 && (
          <Card className="space-y-2 p-4 sm:p-5">
            <h2 className="text-base font-semibold text-foreground">Versions</h2>
            <ul className="divide-y divide-border/60">
              {o.versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-foreground">
                    Version {v.versionNo} - {VERSION_STATUS[v.status]} - {formatDateOnly(v.generatedOn)}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => download.mutate(v)}>
                    <Download className="mr-1 h-4 w-4" />Download PDF
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <div className="min-w-0 space-y-4">
        <Card tone="muted" className="space-y-2 p-4 text-sm">
          <h2 className="font-semibold text-foreground">Key things to prepare</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {PREPARE.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </Card>
        <Card tone="muted" className="flex gap-2 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-foreground">{WILL_DISCLAIMER}</p>
        </Card>
      </div>
    </div>
  );
}

function Tile({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border/60 bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums text-foreground" data-testid={testId}>{value}</p>
    </div>
  );
}
```

- [ ] **Step 5: Nav and route**

In `apps/web/src/components/layout/navItems.tsx`: add `ScrollText,` to the lucide import list (after `Percent,`), and in `OVERVIEW_ITEMS` add after the Goals line:
```tsx
  { label: 'Will Maker', to: '/will', icon: ScrollText },
```

In `apps/web/src/App.tsx`: add `import { WillOverviewPage } from './pages/will/WillOverviewPage';` after the `GoalsPage` import, and `<Route path="/will" element={<WillOverviewPage />} />` after `<Route path="/goals" element={<GoalsPage />} />`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/will src/components/layout && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 7: Commit**

```bash
cd portfolioos
git add apps/web/src/api/will.api.ts apps/web/src/pages/will apps/web/src/components/layout/navItems.tsx apps/web/src/App.tsx
git commit -m "feat(will): Will Maker overview page, API client and nav item

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Web - wizard shell, autosave, stepper; Details, People and Instructions steps

**Wave 3** (parallel with Tasks 5 and 7; needs Tasks 4 and 8; uses the API contract of Task 7, which the tests mock).

**Files:**
- Create: `apps/web/src/pages/will/useWillDraft.ts`
- Create: `apps/web/src/pages/will/WillStepper.tsx`
- Create: `apps/web/src/pages/will/WillWizardPage.tsx`
- Create: `apps/web/src/pages/will/parts.tsx` (`Field`, `Notice`, `FindingList`, `newLocalId`, label maps)
- Create: `apps/web/src/pages/will/steps/types.ts`
- Create: `apps/web/src/pages/will/steps/registry.ts`
- Create: `apps/web/src/pages/will/steps/DetailsStep.tsx`
- Create: `apps/web/src/pages/will/steps/PersonForm.tsx`
- Create: `apps/web/src/pages/will/steps/PeopleStep.tsx`
- Create: `apps/web/src/pages/will/steps/InstructionsStep.tsx`
- Modify: `apps/web/src/App.tsx` (route `/will/:id/:step`)
- Test: `apps/web/src/pages/will/useWillDraft.test.tsx`, `apps/web/src/pages/will/WillWizardPage.test.tsx`, `apps/web/src/pages/will/steps/DetailsStep.test.tsx`, `apps/web/src/pages/will/steps/PeopleStep.test.tsx`, `apps/web/src/pages/will/steps/InstructionsStep.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`applyWillSection`, `willSectionData`, `removeWillPerson`, `willMinorChildren`, `isMinorOn`, `PERSONAL_LAWS`, `MARITAL_STATUSES`, `WILL_RELATIONSHIPS`, types), Task 4 (`runWillRules`, `MUSLIM_LAW_MESSAGE`, `FOREIGN_LAW_MESSAGE`), Task 8 (`willApi`, `isWillRevisionConflict`, `WILL_STEPS`, `stepBySlug`, `willStepPath`, `WillGate`, test builders), `useElementWidth` from `@/pages/emi/useElementWidth`, `istCalendarDate`.
- Produces:
  - `useWillDraft(id: string, opts?: { debounceMs?: number; api?: WillDraftApi }): UseWillDraft` with `{ status, draft, payload, saving, conflict, error, update(section, data), flush(currentStep?): Promise<boolean>, refreshEstate(): Promise<void>, reload(): Promise<void>, getRevision(): number }`.
  - `interface WillStepProps { willId: string; payload: WillPayload; findings: WillFinding[]; today: string; wide: boolean; update: <S extends WillSection>(section: S, data: WillSectionData[S]) => void; refreshEstate: () => Promise<void>; flush: () => Promise<boolean>; getRevision: () => number; goTo: (n: number) => void }`
  - `WILL_STEP_COMPONENTS: Partial<Record<WillStepSlug, (p: WillStepProps) => JSX.Element>>` in `steps/registry.ts` (this task registers `details`, `people`, `instructions`; Tasks 11 and 12 add the rest).
  - `RELATIONSHIP_LABEL: Record<WillRelationship, string>`, `LAW_LABEL: Record<PersonalLaw, string>`, `MARITAL_LABEL`, `Field`, `Notice`, `FindingList`, `newLocalId(prefix)` in `parts.tsx`.
  - `WillWizardPage` at `/will/:id/:step`.

Autosave contract: `update` changes the local payload at once and schedules a save of the touched sections after `debounceMs` (default 800). Saves are serialised; each sends the latest revision and the current step. `flush(step)` cancels the timer and waits for every pending save (the wizard calls it on Next, Back and stepper clicks, and only navigates when it returns `true`). A 409 `WILL_REVISION_CONFLICT` sets `conflict`, drops pending changes and stops all further saves until `reload()`. Any other failure keeps the section dirty, sets `error`, and the next flush retries.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/pages/will/useWillDraft.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { useWillDraft, type WillDraftApi } from './useWillDraft';
import { draftWire, fullPayload } from './willTestData';

afterEach(cleanup);

function conflict(): AxiosError {
  return new AxiosError('conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 409,
    data: { details: { reason: 'WILL_REVISION_CONFLICT', revision: 5 } },
  } as unknown as AxiosResponse);
}

function fakeApi(): WillDraftApi & { saves: Array<{ section: string; revision: number; currentStep: number }> } {
  let revision = 0;
  const saves: Array<{ section: string; revision: number; currentStep: number }> = [];
  return {
    saves,
    getDraft: vi.fn(async () => draftWire({ revision: 0, currentStep: 2 })),
    saveSection: vi.fn(async (_id: string, section: string, body: { revision: number; currentStep: number }) => {
      saves.push({ section, revision: body.revision, currentStep: body.currentStep });
      revision = body.revision + 1;
      return { revision, updatedAt: '2026-10-12T05:00:00.000Z' };
    }) as WillDraftApi['saveSection'],
    refreshEstate: vi.fn(async (_id: string, rev: number) => ({ revision: rev + 1, estate: { ...fullPayload().estate, asOf: '2026-10-13' } })),
  };
}

describe('useWillDraft', () => {
  it('debounces edits into one save with the latest data, then uses the new revision', async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useWillDraft('w1', { api, debounceMs: 20 }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.update('instructions', { text: 'a' }));
    act(() => result.current.update('instructions', { text: 'ab' }));
    expect(result.current.payload?.instructions.text).toBe('ab');
    await waitFor(() => expect(api.saves).toHaveLength(1));
    expect(api.saveSection).toHaveBeenCalledWith('w1', 'instructions', { revision: 0, currentStep: 2, data: { text: 'ab' } });
    act(() => result.current.update('instructions', { text: 'abc' }));
    await act(async () => { expect(await result.current.flush(6)).toBe(true); });
    expect(api.saves[1]).toEqual({ section: 'instructions', revision: 1, currentStep: 6 });
    expect(result.current.getRevision()).toBe(2);
  });

  it('a 409 stops autosave and raises the conflict banner', async () => {
    const api = fakeApi();
    vi.mocked(api.saveSection).mockRejectedValueOnce(conflict());
    const { result } = renderHook(() => useWillDraft('w1', { api, debounceMs: 20 }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.update('instructions', { text: 'x' }));
    await act(async () => { expect(await result.current.flush()).toBe(false); });
    expect(result.current.conflict).toBe(true);
    act(() => result.current.update('instructions', { text: 'y' }));
    await act(async () => { await result.current.flush(); });
    expect(api.saveSection).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.reload(); });
    expect(result.current.conflict).toBe(false);
  });

  it('keeps a failed section dirty and retries on the next flush', async () => {
    const api = fakeApi();
    vi.mocked(api.saveSection).mockRejectedValueOnce(new Error('Network Error'));
    const { result } = renderHook(() => useWillDraft('w1', { api, debounceMs: 20 }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.update('details', { ...fullPayload().details, legalName: 'New Name' }));
    await act(async () => { expect(await result.current.flush()).toBe(false); });
    expect(result.current.error).toContain('Network Error');
    await act(async () => { expect(await result.current.flush()).toBe(true); });
    expect(api.saveSection).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });

  it('refreshEstate saves pending edits first, then applies the server estate', async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useWillDraft('w1', { api, debounceMs: 1000 }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.update('instructions', { text: 'before refresh' }));
    await act(async () => { await result.current.refreshEstate(); });
    expect(api.saves).toHaveLength(1);
    expect(api.refreshEstate).toHaveBeenCalledWith('w1', 1);
    expect(result.current.payload?.estate.asOf).toBe('2026-10-13');
    expect(result.current.getRevision()).toBe(2);
  });
});
```

Create `apps/web/src/pages/will/steps/DetailsStep.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { emptyWillPayload, runWillRules } from '@everypaisa/shared';
import { DetailsStep } from './DetailsStep';
import type { WillStepProps } from './types';
import { TODAY } from '../willTestData';

afterEach(cleanup);

function props(over: Partial<WillStepProps> = {}): WillStepProps {
  const payload = over.payload ?? emptyWillPayload();
  return {
    willId: 'w1', payload, findings: runWillRules(payload, { today: TODAY }), today: TODAY, wide: true,
    update: vi.fn(), refreshEstate: vi.fn(), flush: vi.fn(async () => true), getRevision: () => 0, goTo: vi.fn(), ...over,
  };
}

describe('DetailsStep', () => {
  it('updates the details section as the user types', () => {
    const p = props();
    render(<DetailsStep {...p} />);
    fireEvent.change(screen.getByLabelText(/full legal name/i), { target: { value: 'Asha Rao' } });
    expect(p.update).toHaveBeenCalledWith('details', expect.objectContaining({ legalName: 'Asha Rao' }));
    fireEvent.change(screen.getByLabelText(/children/i), { target: { value: 'yes' } });
    expect(p.update).toHaveBeenLastCalledWith('details', expect.objectContaining({ hasChildren: true }));
  });

  it('explains Muslim personal law and other countries', () => {
    const payload = emptyWillPayload();
    payload.details.personalLaw = 'MUSLIM';
    payload.details.jurisdiction = 'OTHER';
    render(<DetailsStep {...props({ payload })} />);
    expect(screen.getAllByText(/one-third of the estate/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/under Indian law only/i).length).toBeGreaterThan(0);
  });

  it('lists what is still missing', () => {
    render(<DetailsStep {...props()} />);
    expect(screen.getByText(/fill in your full legal name/i)).toBeTruthy();
  });
});
```

Create `apps/web/src/pages/will/steps/PeopleStep.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { runWillRules, type WillPayload } from '@everypaisa/shared';
import { renderWithProviders } from '@/pages/split/testUtils';
import { willApi } from '@/api/will.api';
import { PeopleStep } from './PeopleStep';
import type { WillStepProps } from './types';
import { fullPayload, person, TODAY } from '../willTestData';

vi.mock('@/api/will.api', () => ({ willApi: { suggestions: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(willApi.suggestions).mockResolvedValue([
    { userId: 'fam-1', name: 'Meera Rao', relation: 'Daughter', relationship: 'DAUGHTER', dob: '2015-04-01' },
  ]);
});
afterEach(cleanup);

function setup(payload: WillPayload = fullPayload()) {
  const update = vi.fn();
  const p: WillStepProps = {
    willId: 'w1', payload, findings: runWillRules(payload, { today: TODAY }), today: TODAY, wide: true, update,
    refreshEstate: vi.fn(), flush: vi.fn(async () => true), getRevision: () => 0, goTo: vi.fn(),
  };
  renderWithProviders(<PeopleStep {...p} />);
  return update;
}

describe('PeopleStep', () => {
  it('adds a person from the family quick-pick', async () => {
    const update = setup();
    fireEvent.click(await screen.findByRole('button', { name: /add meera rao/i }));
    const [section, data] = update.mock.calls[0]!;
    expect(section).toBe('people');
    expect(data.people.at(-1)).toMatchObject({ name: 'Meera Rao', relationship: 'DAUGHTER', dob: '2015-04-01', sourceFamilyMemberId: 'fam-1' });
  });

  it('adds a person with the form, and refuses an empty name', () => {
    const update = setup();
    fireEvent.click(screen.getByRole('button', { name: /add a person/i }));
    fireEvent.click(screen.getByRole('button', { name: /save person/i }));
    expect(screen.getByText(/enter a name/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Kavya Iyer' } });
    fireEvent.change(screen.getByLabelText(/relationship/i), { target: { value: 'NIECE' } });
    fireEvent.click(screen.getByRole('button', { name: /save person/i }));
    expect(update.mock.calls[0]![1].people.at(-1)).toMatchObject({ name: 'Kavya Iyer', relationship: 'NIECE', partyType: 'INDIVIDUAL' });
  });

  it('removing a person also clears their roles and shares', () => {
    const update = setup();
    const card = screen.getByTestId('person-p-spouse');
    fireEvent.click(within(card).getByRole('button', { name: /remove/i }));
    const people = update.mock.calls.find((c) => c[0] === 'people')![1];
    expect(people.roles.executorId).toBeNull();
    const allocation = update.mock.calls.find((c) => c[0] === 'allocation')![1];
    expect(allocation.residuary).toEqual([{ personId: 'p-son', sharePct: '40' }]);
  });

  it('picks an executor among adult individuals only', () => {
    const update = setup();
    fireEvent.click(screen.getByRole('tab', { name: /executor/i }));
    const select = screen.getByLabelText(/^executor$/i) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.textContent);
    expect(options).not.toContain('Pune Animal Trust');
    fireEvent.change(select, { target: { value: 'p-son' } });
    expect(update.mock.calls[0]![1].roles.executorId).toBe('p-son');
  });

  it('says a guardian is not needed without minor children, and asks for one with them', async () => {
    setup();
    fireEvent.click(screen.getByRole('tab', { name: /guardian/i }));
    expect(screen.getByText(/no children under 18/i)).toBeTruthy();
    cleanup();
    const p = fullPayload();
    p.people.push(person({ id: 'kid', name: 'Meera', relationship: 'DAUGHTER', dob: '2016-01-01' }));
    setup(p);
    fireEvent.click(screen.getByRole('tab', { name: /guardian/i }));
    await waitFor(() => expect(screen.getByLabelText(/^guardian$/i)).toBeTruthy());
  });
});
```

Create `apps/web/src/pages/will/steps/InstructionsStep.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { InstructionsStep } from './InstructionsStep';
import { fullPayload, TODAY } from '../willTestData';

afterEach(cleanup);

describe('InstructionsStep', () => {
  it('saves the text and counts towards 1000 characters', () => {
    const update = vi.fn();
    render(
      <InstructionsStep willId="w1" payload={fullPayload()} findings={[]} today={TODAY} wide update={update}
        refreshEstate={vi.fn()} flush={vi.fn(async () => true)} getRevision={() => 0} goTo={vi.fn()} />,
    );
    const box = screen.getByLabelText(/additional instructions/i) as HTMLTextAreaElement;
    expect(box.maxLength).toBe(1000);
    expect(screen.getByText(/49 \/ 1000/)).toBeTruthy();
    fireEvent.change(box, { target: { value: 'Donate my eyes.' } });
    expect(update).toHaveBeenCalledWith('instructions', { text: 'Donate my eyes.' });
  });
});
```

Create `apps/web/src/pages/will/WillWizardPage.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { renderWithProviders } from '@/pages/split/testUtils';
import { willApi } from '@/api/will.api';
import { WillWizardPage } from './WillWizardPage';
import { draftWire, resetStores, signIn } from './willTestData';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/will.api', () => ({
  willApi: { getDraft: vi.fn(), saveSection: vi.fn(), refreshEstate: vi.fn(), suggestions: vi.fn(async () => []) },
  isWillRevisionConflict: vi.fn(() => false),
}));

beforeEach(() => {
  vi.clearAllMocks();
  signIn('PLUS');
  vi.mocked(willApi.getDraft).mockResolvedValue(draftWire());
  vi.mocked(willApi.saveSection).mockResolvedValue({ revision: 1, updatedAt: '2026-10-12T05:00:00.000Z' });
});
afterEach(() => {
  cleanup();
  resetStores();
});

describe('WillWizardPage', () => {
  it('loads the draft into the step named in the URL, with a compact stepper on narrow screens', async () => {
    renderWithProviders(<WillWizardPage />, { route: '/will/w1/details', path: '/will/:id/:step' });
    expect(((await screen.findByLabelText(/full legal name/i)) as HTMLInputElement).value).toBe('Ramesh Kumar Verma');
    expect(screen.getByText('Step 2 of 8')).toBeTruthy();
    expect(willApi.getDraft).toHaveBeenCalledWith('w1');
  });

  it('saves before moving on and then navigates', async () => {
    renderWithProviders(<WillWizardPage />, { route: '/will/w1/details', path: '/will/:id/:step' });
    const name = (await screen.findByLabelText(/full legal name/i)) as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Ramesh K Verma' } });
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    await waitFor(() => expect(willApi.saveSection).toHaveBeenCalledWith('w1', 'details', expect.objectContaining({ revision: 0, currentStep: 3 })));
    // /will/w1/people matches the same route: the wizard now shows the People step.
    expect(await screen.findByRole('tab', { name: /beneficiaries/i })).toBeTruthy();
    expect(screen.getByText('Step 3 of 8')).toBeTruthy();
  });

  it('is locked on the Free plan', () => {
    signIn('FREE');
    renderWithProviders(<WillWizardPage />, { route: '/will/w1/details', path: '/will/:id/:step' });
    expect(screen.getByText(/will maker is locked/i)).toBeTruthy();
    expect(willApi.getDraft).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/will`
Expected: FAIL - cannot resolve `./useWillDraft`, `./WillWizardPage`, `./DetailsStep`, `./PeopleStep`, `./InstructionsStep`.

- [ ] **Step 3: The autosave hook**

Create `apps/web/src/pages/will/useWillDraft.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyWillSection, willSectionData,
  type WillDraftWire, type WillPayload, type WillSection, type WillSectionData,
} from '@everypaisa/shared';
import { apiErrorMessage } from '@/api/client';
import { isWillRevisionConflict, willApi } from '@/api/will.api';

export type WillDraftApi = Pick<typeof willApi, 'getDraft' | 'saveSection' | 'refreshEstate'>;

export interface UseWillDraft {
  status: 'loading' | 'ready' | 'error';
  draft: WillDraftWire | null;
  payload: WillPayload | null;
  saving: boolean;
  conflict: boolean;
  error: string | null;
  update: <S extends WillSection>(section: S, data: WillSectionData[S]) => void;
  flush: (currentStep?: number) => Promise<boolean>;
  refreshEstate: () => Promise<void>;
  reload: () => Promise<void>;
  getRevision: () => number;
}

/**
 * Server-side draft with autosave. Edits apply locally at once; touched
 * sections are saved after `debounceMs`, one request at a time, each naming
 * the revision it builds on. A revision conflict freezes saving until reload,
 * so a second tab can never be overwritten silently.
 */
export function useWillDraft(id: string, opts: { debounceMs?: number; api?: WillDraftApi } = {}): UseWillDraft {
  const client = opts.api ?? willApi;
  const debounceMs = opts.debounceMs ?? 800;
  const [status, setStatus] = useState<UseWillDraft['status']>('loading');
  const [draft, setDraft] = useState<WillDraftWire | null>(null);
  const [payload, setPayload] = useState<WillPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payloadRef = useRef<WillPayload | null>(null);
  const revisionRef = useRef(0);
  const stepRef = useRef(2);
  const dirty = useRef(new Set<WillSection>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const frozen = useRef(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const d = await client.getDraft(id);
      payloadRef.current = d.payload;
      revisionRef.current = d.revision;
      stepRef.current = d.currentStep;
      dirty.current.clear();
      frozen.current = false;
      setDraft(d);
      setPayload(d.payload);
      setConflict(false);
      setError(null);
      setStatus('ready');
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load your will"));
      setStatus('error');
    }
  }, [client, id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const saveDirty = useCallback(async (): Promise<boolean> => {
    while (dirty.current.size > 0 && !frozen.current) {
      const section = dirty.current.values().next().value as WillSection;
      dirty.current.delete(section);
      const current = payloadRef.current;
      if (!current) return false;
      setSaving(true);
      try {
        const res = await client.saveSection(id, section, {
          revision: revisionRef.current,
          currentStep: stepRef.current,
          data: willSectionData(current, section),
        });
        revisionRef.current = res.revision;
        setError(null);
      } catch (err) {
        if (isWillRevisionConflict(err)) {
          frozen.current = true;
          dirty.current.clear();
          setConflict(true);
        } else {
          dirty.current.add(section);
          setError(apiErrorMessage(err, "Couldn't save your changes"));
        }
        setSaving(false);
        return false;
      }
      setSaving(false);
    }
    return !frozen.current;
  }, [client, id]);

  const enqueue = useCallback((): Promise<boolean> => {
    chain.current = chain.current.then(saveDirty, saveDirty);
    return chain.current;
  }, [saveDirty]);

  const update = useCallback(
    <S extends WillSection>(section: S, data: WillSectionData[S]) => {
      const current = payloadRef.current;
      if (!current || frozen.current) return;
      const next = applyWillSection(current, section, data);
      payloadRef.current = next;
      setPayload(next);
      dirty.current.add(section);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void enqueue();
      }, debounceMs);
    },
    [debounceMs, enqueue],
  );

  const flush = useCallback(
    async (currentStep?: number) => {
      if (currentStep) stepRef.current = currentStep;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      return enqueue();
    },
    [enqueue],
  );

  const refreshEstate = useCallback(async () => {
    if (!(await flush())) return;
    setSaving(true);
    try {
      const res = await client.refreshEstate(id, revisionRef.current);
      revisionRef.current = res.revision;
      const next = applyWillSection(payloadRef.current!, 'estate', res.estate);
      payloadRef.current = next;
      setPayload(next);
      setError(null);
    } catch (err) {
      if (isWillRevisionConflict(err)) {
        frozen.current = true;
        setConflict(true);
      } else {
        setError(apiErrorMessage(err, "Couldn't refresh your assets"));
      }
    } finally {
      setSaving(false);
    }
  }, [client, flush, id]);

  const getRevision = useCallback(() => revisionRef.current, []);

  return { status, draft, payload, saving, conflict, error, update, flush, refreshEstate, reload: load, getRevision };
}
```

- [ ] **Step 4: Shared parts, step props, registry**

Create `apps/web/src/pages/will/parts.tsx`:
```tsx
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { MaritalStatus, PersonalLaw, WillFinding, WillRelationship } from '@everypaisa/shared';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/cn';

export const RELATIONSHIP_LABEL: Record<WillRelationship, string> = {
  SPOUSE: 'Spouse', SON: 'Son', DAUGHTER: 'Daughter', FATHER: 'Father', MOTHER: 'Mother', BROTHER: 'Brother',
  SISTER: 'Sister', GRANDSON: 'Grandson', GRANDDAUGHTER: 'Granddaughter', SON_IN_LAW: 'Son-in-law',
  DAUGHTER_IN_LAW: 'Daughter-in-law', NEPHEW: 'Nephew', NIECE: 'Niece', OTHER_RELATIVE: 'Other relative',
  FRIEND: 'Friend', CHARITY: 'Charity', OTHER: 'Other',
};

export const LAW_LABEL: Record<PersonalLaw, string> = {
  HINDU: 'Hindu', SIKH: 'Sikh', JAIN: 'Jain', BUDDHIST: 'Buddhist', CHRISTIAN: 'Christian', PARSI: 'Parsi',
  MUSLIM: 'Muslim', OTHER: 'Other / none',
};

export const MARITAL_LABEL: Record<MaritalStatus, string> = {
  SINGLE: 'Single', MARRIED: 'Married', WIDOWED: 'Widowed', DIVORCED: 'Divorced', SEPARATED: 'Separated',
};

export function newLocalId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function Field({ id, label, required, children, hint }: { id: string; label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-negative"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'warning' | 'info'; children: ReactNode }) {
  return (
    <div
      role={tone === 'warning' ? 'alert' : undefined}
      className={cn(
        'rounded-md border p-3 text-sm text-foreground',
        tone === 'warning' ? 'border-warning/40 bg-warning/10' : 'border-border/60 bg-muted/40',
      )}
    >
      {children}
    </div>
  );
}

const ICON = { BLOCKER: XCircle, WARNING: AlertTriangle, INFO: Info } as const;
const TONE = { BLOCKER: 'text-negative', WARNING: 'text-warning', INFO: 'text-muted-foreground' } as const;

/** Findings for one step; `passLabel` shows a tick when there are none. */
export function FindingList({ findings, passLabel }: { findings: readonly WillFinding[]; passLabel?: string }) {
  if (findings.length === 0) {
    return passLabel ? (
      <p className="flex items-center gap-1.5 text-sm text-positive"><CheckCircle2 className="h-4 w-4" />{passLabel}</p>
    ) : null;
  }
  return (
    <ul className="space-y-1.5">
      {findings.map((f, i) => {
        const Icon = ICON[f.severity];
        return (
          <li key={`${f.ruleId}-${i}`} className="flex items-start gap-1.5 text-sm text-foreground">
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TONE[f.severity])} />
            <span className="min-w-0 break-words">{f.message}</span>
          </li>
        );
      })}
    </ul>
  );
}
```

Create `apps/web/src/pages/will/steps/types.ts`:
```ts
import type { WillFinding, WillPayload, WillSection, WillSectionData } from '@everypaisa/shared';

export interface WillStepProps {
  willId: string;
  payload: WillPayload;
  /** Live findings for the whole will (filter by `step`). */
  findings: WillFinding[];
  /** Indian calendar date, YYYY-MM-DD. */
  today: string;
  /** True when the content area is at least 640 px wide. */
  wide: boolean;
  update: <S extends WillSection>(section: S, data: WillSectionData[S]) => void;
  refreshEstate: () => Promise<void>;
  /** Save pending edits now; resolves false if they could not be saved. */
  flush: () => Promise<boolean>;
  getRevision: () => number;
  goTo: (n: number) => void;
}
```

Create `apps/web/src/pages/will/steps/registry.ts`:
```ts
import type { WillStepSlug } from '../willSteps';
import type { WillStepProps } from './types';
import { DetailsStep } from './DetailsStep';
import { PeopleStep } from './PeopleStep';
import { InstructionsStep } from './InstructionsStep';

/** Step components by URL slug. A slug with no entry sends the user back to the overview. */
export const WILL_STEP_COMPONENTS: Partial<Record<WillStepSlug, (p: WillStepProps) => JSX.Element>> = {
  details: DetailsStep,
  people: PeopleStep,
  instructions: InstructionsStep,
};
```

- [ ] **Step 5: Details and Instructions steps**

Create `apps/web/src/pages/will/steps/DetailsStep.tsx`:
```tsx
import {
  FOREIGN_LAW_MESSAGE, MARITAL_STATUSES, MUSLIM_LAW_MESSAGE, PERSONAL_LAWS,
  type MaritalStatus, type PersonalLaw, type WillDetails,
} from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field, FindingList, LAW_LABEL, MARITAL_LABEL, Notice } from '../parts';
import type { WillStepProps } from './types';

const yesNo = (v: boolean | null) => (v === null ? '' : v ? 'yes' : 'no');
const fromYesNo = (v: string) => (v === '' ? null : v === 'yes');

export function DetailsStep({ payload, update, findings }: WillStepProps) {
  const d = payload.details;
  const set = (patch: Partial<WillDetails>) => update('details', { ...d, ...patch });
  const blockers = findings.filter((f) => f.step === 2 && f.severity === 'BLOCKER' && f.ruleId === 'REQUIRED_FIELDS');

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <Card className="min-w-0 space-y-4 p-4 sm:p-5">
        <Field id="will-name" label="Full legal name" required hint="As on your PAN or passport.">
          <Input id="will-name" value={d.legalName} maxLength={120} autoComplete="name" onChange={(e) => set({ legalName: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="will-dob" label="Date of birth" required>
            <Input id="will-dob" type="date" value={d.dob ?? ''} onChange={(e) => set({ dob: e.target.value || null })} />
          </Field>
          <Field id="will-country" label="Country whose law applies" required>
            <Select id="will-country" value={d.jurisdiction} onChange={(e) => set({ jurisdiction: e.target.value === 'IN' ? 'IN' : 'OTHER' })}>
              <option value="IN">India</option>
              <option value="OTHER">Another country</option>
            </Select>
          </Field>
        </div>
        {d.jurisdiction === 'OTHER' && <Notice tone="warning">{FOREIGN_LAW_MESSAGE}</Notice>}
        <Field id="will-law" label="Religion / personal law" required hint="This decides which succession law applies to your will.">
          <Select id="will-law" value={d.personalLaw ?? ''} onChange={(e) => set({ personalLaw: (e.target.value || null) as PersonalLaw | null })}>
            <option value="">Choose...</option>
            {PERSONAL_LAWS.map((l) => <option key={l} value={l}>{LAW_LABEL[l]}</option>)}
          </Select>
        </Field>
        {d.personalLaw === 'MUSLIM' && <Notice tone="warning">{MUSLIM_LAW_MESSAGE}</Notice>}
        <Field id="will-address" label="Address" required>
          <Textarea id="will-address" rows={3} maxLength={400} value={d.address} onChange={(e) => set({ address: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="will-marital" label="Marital status" required>
            <Select id="will-marital" value={d.maritalStatus ?? ''} onChange={(e) => set({ maritalStatus: (e.target.value || null) as MaritalStatus | null })}>
              <option value="">Choose...</option>
              {MARITAL_STATUSES.map((s) => <option key={s} value={s}>{MARITAL_LABEL[s]}</option>)}
            </Select>
          </Field>
          <Field id="will-children" label="Do you have children?" required>
            <Select id="will-children" value={yesNo(d.hasChildren)} onChange={(e) => set({ hasChildren: fromYesNo(e.target.value) })}>
              <option value="">Choose...</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field id="will-dependents" label="Anyone else depends on you?">
            <Select id="will-dependents" value={yesNo(d.hasDependents)} onChange={(e) => set({ hasDependents: fromYesNo(e.target.value) })}>
              <option value="">Choose...</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
        </div>
        <FindingList findings={blockers} />
      </Card>
      <Card tone="muted" className="h-fit min-w-0 space-y-2 p-4 text-sm">
        <p className="font-medium text-foreground">Why we ask</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Your name, date of birth and address identify you in the will.</li>
          <li>Your religion decides which succession law applies.</li>
          <li>Marriage and children decide who your family is in law, and whether a guardian is needed.</li>
        </ul>
      </Card>
    </div>
  );
}
```

Create `apps/web/src/pages/will/steps/InstructionsStep.tsx`:
```tsx
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '../parts';
import type { WillStepProps } from './types';

export function InstructionsStep({ payload, update }: WillStepProps) {
  const text = payload.instructions.text;
  return (
    <Card className="min-w-0 space-y-3 p-4 sm:p-5">
      <Field
        id="will-instructions"
        label="Additional instructions (optional)"
        hint="Wishes such as funeral arrangements or organ donation. They are printed word for word in your will."
      >
        <Textarea id="will-instructions" rows={8} maxLength={1000} value={text} onChange={(e) => update('instructions', { text: e.target.value })} />
      </Field>
      <p className="text-right text-xs text-muted-foreground tabular-nums">{text.length} / 1000</p>
    </Card>
  );
}
```

- [ ] **Step 6: People step**

Create `apps/web/src/pages/will/steps/PersonForm.tsx`:
```tsx
import { useState } from 'react';
import { WILL_RELATIONSHIPS, type WillPerson, type WillRelationship } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field, RELATIONSHIP_LABEL } from '../parts';

const ORG_RELATIONSHIPS: WillRelationship[] = ['CHARITY', 'OTHER'];

export function PersonForm({ initial, others, onSave, onCancel }: {
  initial: WillPerson;
  /** Everyone else, for the back-up choice. */
  others: WillPerson[];
  onSave: (p: WillPerson) => void;
  onCancel: () => void;
}) {
  const [p, setP] = useState<WillPerson>(initial);
  const [error, setError] = useState<string | null>(null);
  const org = p.partyType === 'ORGANISATION';
  const relationships = org ? ORG_RELATIONSHIPS : WILL_RELATIONSHIPS.filter((r) => r !== 'CHARITY');
  const pid = (x: string) => `person-${x}`;

  function save() {
    if (!p.name.trim()) {
      setError('Enter a name.');
      return;
    }
    onSave({ ...p, name: p.name.trim(), contact: p.contact?.trim() || null, dob: org ? null : p.dob });
  }

  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-card p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={pid('name')} label={org ? 'Name of the organisation' : 'Name'} required>
          <Input id={pid('name')} value={p.name} maxLength={120} onChange={(e) => setP({ ...p, name: e.target.value })} />
        </Field>
        <Field id={pid('rel')} label="Relationship">
          <Select id={pid('rel')} value={p.relationship} onChange={(e) => setP({ ...p, relationship: e.target.value as WillRelationship })}>
            {relationships.map((r) => <option key={r} value={r}>{RELATIONSHIP_LABEL[r]}</option>)}
          </Select>
        </Field>
        {!org && (
          <Field id={pid('dob')} label="Date of birth" hint="Tells us whether they are under 18.">
            <Input id={pid('dob')} type="date" value={p.dob ?? ''} onChange={(e) => setP({ ...p, dob: e.target.value || null })} />
          </Field>
        )}
        <Field id={pid('contact')} label="Phone or email (optional)">
          <Input id={pid('contact')} value={p.contact ?? ''} maxLength={120} onChange={(e) => setP({ ...p, contact: e.target.value })} />
        </Field>
        <Field id={pid('backup')} label="If they die before you, their gifts go to">
          <Select id={pid('backup')} value={p.contingentId ?? ''} onChange={(e) => setP({ ...p, contingentId: e.target.value || null })}>
            <option value="">Shared among the others (default)</option>
            {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </Field>
      </div>
      {error && <p className="text-sm text-negative" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={save}>Save person</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
```

Create `apps/web/src/pages/will/steps/PeopleStep.tsx`:
```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import {
  formatDateOnly, isMinorOn, removeWillPerson, willMinorChildren,
  type WillPerson, type WillRoles, type WillSuggestionWire,
} from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { willApi } from '@/api/will.api';
import { Field, FindingList, newLocalId, RELATIONSHIP_LABEL } from '../parts';
import { PersonForm } from './PersonForm';
import type { WillStepProps } from './types';

function blank(partyType: WillPerson['partyType']): WillPerson {
  return {
    id: newLocalId('p'), partyType, name: '', relationship: partyType === 'ORGANISATION' ? 'CHARITY' : 'SON',
    dob: null, contact: null, sourceFamilyMemberId: null, contingentId: null,
  };
}

export function PeopleStep({ payload, update, findings, today }: WillStepProps) {
  const [tab, setTab] = useState('beneficiaries');
  const [editing, setEditing] = useState<WillPerson | null>(null);
  const { people, roles } = payload;
  const suggestions = useQuery({ queryKey: ['will', 'suggestions'], queryFn: () => willApi.suggestions() });

  const save = (next: WillPerson[], nextRoles: WillRoles = roles) => update('people', { people: next, roles: nextRoles });
  function upsert(p: WillPerson) {
    save(people.some((x) => x.id === p.id) ? people.map((x) => (x.id === p.id ? p : x)) : [...people, p]);
    setEditing(null);
  }
  function remove(id: string) {
    const next = removeWillPerson(payload, id);
    update('people', { people: next.people, roles: next.roles });
    update('allocation', next.allocation);
  }
  function addSuggestion(s: WillSuggestionWire) {
    upsert({
      id: newLocalId('p'), partyType: 'INDIVIDUAL', name: s.name, relationship: s.relationship ?? 'OTHER_RELATIVE',
      dob: s.dob, contact: null, sourceFamilyMemberId: s.userId, contingentId: null,
    });
  }

  const individuals = people.filter((p) => p.partyType === 'INDIVIDUAL');
  const organisations = people.filter((p) => p.partyType === 'ORGANISATION');
  const adults = individuals.filter((p) => isMinorOn(p.dob, today) !== true);
  const minors = willMinorChildren(payload, today);
  const added = new Set(people.map((p) => p.sourceFamilyMemberId).filter(Boolean));
  const quickPick = (suggestions.data ?? []).filter((s) => !added.has(s.userId));
  const stepFindings = findings.filter((f) => f.step === 3);

  const card = (p: WillPerson) => (
    <li key={p.id} data-testid={`person-${p.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3">
      <div className="min-w-0">
        <p className="break-words font-medium text-foreground">{p.name}</p>
        <p className="text-xs text-muted-foreground">
          {RELATIONSHIP_LABEL[p.relationship]}
          {p.partyType === 'INDIVIDUAL' && (p.dob ? ` - born ${formatDateOnly(p.dob)}` : ' - date of birth not added')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {isMinorOn(p.dob, today) === true && <Badge variant="outline">Under 18</Badge>}
        <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
        <Button size="sm" variant="ghost" onClick={() => remove(p.id)}>Remove</Button>
      </div>
    </li>
  );

  const roleSelect = (id: string, label: string, value: string | null, key: keyof WillRoles, options: WillPerson[]) => (
    <Field id={id} label={label}>
      <Select id={id} value={value ?? ''} onChange={(e) => save(people, { ...roles, [key]: e.target.value || null })}>
        <option value="">Not chosen</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </Select>
    </Field>
  );

  return (
    <div className="space-y-4">
      {editing && (
        <PersonForm key={editing.id} initial={editing} others={people.filter((x) => x.id !== editing.id)} onSave={upsert} onCancel={() => setEditing(null)} />
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="beneficiaries">Beneficiaries</TabsTrigger>
          <TabsTrigger value="executor">Executor</TabsTrigger>
          <TabsTrigger value="guardian">Guardian</TabsTrigger>
          <TabsTrigger value="others">Others</TabsTrigger>
        </TabsList>

        <TabsContent value="beneficiaries" className="space-y-3 pt-3">
          {quickPick.length > 0 && (
            <Card tone="muted" className="space-y-2 p-3">
              <p className="text-sm text-foreground">From your family on EveryPaisa</p>
              <div className="flex flex-wrap gap-2">
                {quickPick.map((s) => (
                  <Button key={s.userId} size="sm" variant="outline" aria-label={`Add ${s.name}`} onClick={() => addSuggestion(s)}>
                    <UserPlus className="mr-1 h-4 w-4" />{s.name}{s.relation ? ` (${s.relation})` : ''}
                  </Button>
                ))}
              </div>
            </Card>
          )}
          <ul className="space-y-2">{individuals.map(card)}</ul>
          <Button size="sm" variant="outline" onClick={() => setEditing(blank('INDIVIDUAL'))}>Add a person</Button>
        </TabsContent>

        <TabsContent value="executor" className="space-y-3 pt-3">
          <p className="text-sm text-muted-foreground">The executor collects your assets, pays your debts and shares out the rest as your will says.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {roleSelect('will-executor', 'Executor', roles.executorId, 'executorId', adults)}
            {roleSelect('will-alt-executor', 'Back-up executor', roles.altExecutorId, 'altExecutorId', adults)}
          </div>
        </TabsContent>

        <TabsContent value="guardian" className="space-y-3 pt-3">
          {minors.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have no children under 18 in your list, so a guardian is not needed.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {roleSelect('will-guardian', 'Guardian', roles.guardianId, 'guardianId', adults)}
              {roleSelect('will-alt-guardian', 'Back-up guardian', roles.altGuardianId, 'altGuardianId', adults)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="others" className="space-y-3 pt-3">
          <p className="text-sm text-muted-foreground">Charities and other organisations you want to leave something to.</p>
          <ul className="space-y-2">{organisations.map(card)}</ul>
          <Button size="sm" variant="outline" onClick={() => setEditing(blank('ORGANISATION'))}>Add an organisation</Button>
        </TabsContent>
      </Tabs>
      <FindingList findings={stepFindings} />
    </div>
  );
}
```

- [ ] **Step 7: Stepper and wizard page**

Create `apps/web/src/pages/will/WillStepper.tsx`:
```tsx
import { cn } from '@/lib/cn';
import { WILL_STEPS } from './willSteps';

export function WillStepper({ current, wide, onSelect }: { current: number; wide: boolean; onSelect: (n: number) => void }) {
  const meta = WILL_STEPS.find((s) => s.n === current) ?? WILL_STEPS[1]!;
  if (!wide) {
    return (
      <div className="space-y-2" data-testid="will-stepper-compact">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Step {current} of {WILL_STEPS.length}</span>
          <span className="truncate font-medium text-foreground">{meta.label}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${(current / WILL_STEPS.length) * 100}%` }} />
        </div>
      </div>
    );
  }
  return (
    <ol className="flex items-center gap-1" data-testid="will-stepper">
      {WILL_STEPS.map((s) => (
        <li key={s.n} className="flex min-w-0 flex-1 items-center gap-1">
          <button
            type="button"
            onClick={() => onSelect(s.n)}
            aria-current={s.n === current ? 'step' : undefined}
            className={cn(
              'flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs',
              s.n === current ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span
              className={cn(
                'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px]',
                s.n === current ? 'bg-primary text-primary-foreground' : s.n < current ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
              )}
            >
              {s.n}
            </span>
            <span className="truncate">{s.label}</span>
          </button>
          {s.n < WILL_STEPS.length && <span className="h-px min-w-2 flex-1 bg-border" />}
        </li>
      ))}
    </ol>
  );
}
```

Create `apps/web/src/pages/will/WillWizardPage.tsx`:
```tsx
import { useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { istCalendarDate, runWillRules } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useElementWidth } from '@/pages/emi/useElementWidth';
import { WillGate } from './WillGuards';
import { WillStepper } from './WillStepper';
import { stepBySlug, willStepPath } from './willSteps';
import { useWillDraft } from './useWillDraft';
import { WILL_STEP_COMPONENTS } from './steps/registry';

export function WillWizardPage() {
  return (
    <div className="space-y-4 pb-24">
      <WillGate>
        <WizardBody />
      </WillGate>
    </div>
  );
}

function WizardBody() {
  const { id = '', step = 'details' } = useParams();
  const navigate = useNavigate();
  const meta = stepBySlug(step);
  const draft = useWillDraft(id);
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const today = useMemo(() => istCalendarDate(new Date()), []);
  const findings = useMemo(() => (draft.payload ? runWillRules(draft.payload, { today }) : []), [draft.payload, today]);

  if (!meta || meta.n === 1) return <Navigate to="/will" replace />;
  const Step = WILL_STEP_COMPONENTS[meta.slug];
  if (!Step) return <Navigate to="/will" replace />;
  const blockers = findings.filter((f) => f.severity === 'BLOCKER');

  async function go(n: number) {
    const ok = await draft.flush(n > 1 ? n : undefined);
    if (!ok) return;
    navigate(willStepPath(id, n));
  }

  return (
    <div ref={ref} className="min-w-0 space-y-4">
      <PageHeader eyebrow="Will Maker" title={meta.label} />
      <WillStepper current={meta.n} wide={width >= 900} onSelect={(n) => void go(n)} />
      {draft.conflict && (
        <Card role="alert" className="flex flex-wrap items-center justify-between gap-2 border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          <span>This will was changed in another tab or device. Reload to see the latest version - your last change here was not saved.</span>
          <Button size="sm" variant="outline" onClick={() => void draft.reload()}>Reload</Button>
        </Card>
      )}
      {draft.error && !draft.conflict && <p role="alert" className="text-sm text-negative">{draft.error}</p>}
      {draft.status === 'loading' && <p className="text-sm text-muted-foreground">Loading your will...</p>}
      {draft.status === 'error' && (
        <Card className="p-4 text-sm text-foreground">
          This draft could not be opened. <Link to="/will" className="text-accent-ink underline">Back to Will Maker</Link>
        </Card>
      )}
      {draft.status === 'ready' && draft.payload && (
        <Step
          willId={id}
          payload={draft.payload}
          findings={findings}
          today={today}
          wide={width >= 640}
          update={draft.update}
          refreshEstate={draft.refreshEstate}
          flush={() => draft.flush(meta.n)}
          getRevision={draft.getRevision}
          goTo={(n) => void go(n)}
        />
      )}
      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <Button variant="outline" onClick={() => void go(meta.n - 1)}>Back</Button>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {draft.saving ? 'Saving...' : draft.error || draft.conflict ? 'Not saved' : 'All changes saved'}
        </span>
        {meta.n < 8 ? (
          <Button onClick={() => void go(meta.n + 1)} disabled={draft.status !== 'ready' || (meta.n === 7 && blockers.length > 0)}>
            Next
          </Button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
```

In `apps/web/src/App.tsx`: add `import { WillWizardPage } from './pages/will/WillWizardPage';` after the `WillOverviewPage` import, and `<Route path="/will/:id/:step" element={<WillWizardPage />} />` after the `/will` route.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/will && npx tsc --noEmit && npx eslint src/pages/will src/api/will.api.ts`
Expected: PASS; no type errors; no lint errors.

- [ ] **Step 9: Commit**

```bash
cd portfolioos
git add apps/web/src/pages/will apps/web/src/App.tsx
git commit -m "feat(will): wizard shell with autosave; details, people and instructions steps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: PDF, preview, generate and download API

**Wave 4** (parallel with Task 11; needs Tasks 2, 5 and 7).

**Files:**
- Create: `packages/api/src/services/will/willFonts.ts`
- Create: `packages/api/src/services/will/willPdf.ts`
- Create: `packages/api/src/services/will/willGenerate.service.ts`
- Modify: `packages/api/src/controllers/will.controller.ts` (handlers `preview`, `generate`, `downloadPdf`)
- Modify: `packages/api/src/routes/will.routes.ts` (three routes)
- Test: `packages/api/test/will/willPdf.test.ts`, `packages/api/test/will/willGenerate.db.test.ts`, `packages/api/test/routes/willGenerate.routes.test.ts`

**Interfaces:**
- Consumes: Task 2 fonts; Task 5 (`selectWillTemplate`, `renderWillSummary`, `WillTemplate`), Task 1 (`renderWillText`, `WillBlock`, `WILL_PDF_FOOTER`, wire types), Task 4 (`runWillRules`, `hasWillBlockers`, `WILL_RULESET_VERSION`), Task 7 (`loadDraft`, `revisionConflict`, `requireWillKeys`, `todayIst`, `toVersionWire`, controller helpers `uid`, `parseOr422`, `idOf`), Task 3 (`createDocument`, `deleteDocument(..., { allowWill: true })`), `lib/documentStorage` (`readBuffer`), `lib/userKeys` (`sealForUser`).
- Produces:
  - `willFonts.ts`: `WILL_FONTS: { regular; bold; deva; devaBold }` (absolute paths), `interface ScriptRun { text: string; deva: boolean }`, `scriptRuns(text: string): ScriptRun[]`.
  - `willPdf.ts`: `interface WillPdfInput { blocks: WillBlock[]; generatedOn: string; footer: string }`, `renderWillPdf(input): Promise<Buffer>`.
  - `willGenerate.service.ts`: `interface WillGenerateDeps { renderPdf: (i: WillPdfInput) => Promise<Buffer>; today: () => string }`, `canonicalJson(v: unknown): string`, `sha256Hex(v: string | Buffer): string`, `previewWill(userId, willId, deps?): Promise<WillPreviewWire>`, `generateWill(userId, willId, input: { revision: number; acknowledge: boolean }, deps?): Promise<WillGenerateResultWire>`, `getWillVersionPdf(userId, versionId): Promise<{ fileName: string; buffer: Buffer; versionNo: number }>`.
  - HTTP: `GET /api/will/drafts/:id/preview` -> `WillPreviewWire` (422 `{ reason: 'WILL_BLOCKED', ruleIds }`; audits `will_viewed`); `POST /api/will/drafts/:id/generate` `{ revision, acknowledge: true }` -> 201 `WillGenerateResultWire` (400 without acknowledgement, 409 stale revision, 422 blockers; `costlyOperationLimiter`; audits `will_generated` with `acknowledged: true`); `GET /api/will/versions/:vid/pdf` -> `application/pdf` attachment `will-v<N>.pdf` (`no-store`; audits `will_downloaded`).

Generate order (so a failure never leaves a half-made will): load the draft and check the revision -> re-run the rules (422 on any BLOCKER) -> render blocks -> hash -> render the PDF -> seal the canonical snapshot -> `createDocument(WILL)` -> ONE `runInTransaction`: claim the draft (`DRAFT` + revision -> `GENERATED`, revision + 1), supersede earlier GENERATED/EXECUTED wills, insert `WillVersion`. If the transaction throws, the PDF document is deleted (`allowWill`) and the error is rethrown.

- [ ] **Step 1: Write the failing tests**

Create `packages/api/test/will/willPdf.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { selectWillTemplate, WILL_PDF_FOOTER, type WillPayload } from '@everypaisa/shared';
import { renderWillPdf } from '../../src/services/will/willPdf.js';
import { scriptRuns } from '../../src/services/will/willFonts.js';
import { TODAY, validWillPayload } from './willFixtures.js';

const render = (m: WillPayload) =>
  renderWillPdf({ blocks: selectWillTemplate(m).render(m, { generatedOn: TODAY }), generatedOn: TODAY, footer: WILL_PDF_FOOTER });

describe('scriptRuns', () => {
  it('splits Latin and Devanagari, keeping spaces with the run before them', () => {
    expect(scriptRuns('Asha आशा Verma')).toEqual([
      { text: 'Asha ', deva: false },
      { text: 'आशा ', deva: true },
      { text: 'Verma', deva: false },
    ]);
  });

  it('keeps vowel signs and the danda inside the Devanagari run', () => {
    expect(scriptRuns('रमेश।')).toEqual([{ text: 'रमेश।', deva: true }]);
  });

  it('attaches leading punctuation to the first run; handles empty and blank text', () => {
    expect(scriptRuns('(आशा)')).toEqual([{ text: '(आशा)', deva: true }]);
    expect(scriptRuns('')).toEqual([]);
    expect(scriptRuns('  ')).toEqual([{ text: '  ', deva: false }]);
  });

  it('treats the rupee sign as Latin text', () => {
    expect(scriptRuns('₹50,000')).toEqual([{ text: '₹50,000', deva: false }]);
  });
});

describe('renderWillPdf', () => {
  it('produces a readable PDF with the will text, the rupee sign and a numbered footer', async () => {
    const buf = await render(validWillPayload());
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const { text, numpages } = await pdfParse(buf);
    expect(text).toContain('LAST WILL AND TESTAMENT');
    expect(text).toContain('Ramesh Kumar Verma');
    expect(text).toContain('₹50,000');
    expect(text).toContain('Not legal advice');
    expect(text).toContain(`Page 1 of ${numpages}`);
    expect(text).toContain(`Page ${numpages} of ${numpages}`);
  });

  it('embeds the Devanagari font for a Devanagari name and keeps the rupee sign', async () => {
    const m = validWillPayload();
    m.people[0]!.name = 'सुनीता वर्मा';
    const buf = await render(m);
    const raw = buf.toString('latin1');
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSansDevanagari-Regular/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSans-Regular/);
    const { text } = await pdfParse(buf);
    expect(text).toContain('₹50,000');
  });

  it('pins the creation date to the date of the will', async () => {
    const raw = (await render(validWillPayload())).toString('latin1');
    expect(raw).toContain('D:20261012000000Z');
  });
});
```

Create `packages/api/test/will/willGenerate.db.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { renderWillText, selectWillTemplate, WILL_SECTIONS, willSectionData } from '@everypaisa/shared';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { saveBuffer } from '../../src/lib/documentStorage.js';
import { createWillDraft, saveWillSection } from '../../src/services/will/will.service.js';
import {
  canonicalJson, generateWill, getWillVersionPdf, previewWill, sha256Hex,
} from '../../src/services/will/willGenerate.service.js';
import { renderWillPdf } from '../../src/services/will/willPdf.js';
import { TODAY, validWillPayload } from './willFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const deps = { renderPdf: renderWillPdf, today: () => TODAY };
let a: TestScope;
let b: TestScope;

/** A draft holding validWillPayload(), saved section by section the way the wizard does. */
async function validDraft(scope: TestScope, fromWillId: string | null = null): Promise<{ id: string; revision: number }> {
  const d = await scope.runAs(() => createWillDraft(scope.userId, fromWillId));
  const p = validWillPayload();
  let revision = 0;
  for (const section of WILL_SECTIONS) {
    const res = await scope.runAs(() =>
      saveWillSection(scope.userId, d.id, section, { revision, currentStep: 7, data: willSectionData(p, section) }),
    );
    revision = res.revision;
  }
  return { id: d.id, revision };
}

const willDocs = (userId: string) =>
  runAsSystem(() => prisma.document.count({ where: { userId, ownerType: 'WILL' } }));

beforeAll(async () => {
  a = await createTestScope('will-gen-a');
  b = await createTestScope('will-gen-b');
});
afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.willVersion.deleteMany({ where: { userId: { in: [a.userId, b.userId] } } });
    await prisma.will.deleteMany({ where: { userId: { in: [a.userId, b.userId] } } });
  });
  await a.cleanup();
  await b.cleanup();
});

describe('preview', () => {
  it('renders the summary and the will from the stored draft', async () => {
    const d = await validDraft(b);
    const pv = await b.runAs(() => previewWill(b.userId, d.id, deps));
    expect(pv).toMatchObject({ templateId: 'isa-hindu', templateVersion: 1, generatedOn: TODAY });
    expect(renderWillText(pv.document)).toContain('LAST WILL AND TESTAMENT');
    expect(renderWillText(pv.summary)).toContain('will carry out your will as executor');
    await runAsSystem(() => prisma.will.deleteMany({ where: { userId: b.userId } }));
  });

  it('refuses while a blocker remains, naming rule ids only', async () => {
    const d = await b.runAs(() => createWillDraft(b.userId, null));
    await expect(b.runAs(() => previewWill(b.userId, d.id, deps))).rejects.toMatchObject({
      statusCode: 422, details: { reason: 'WILL_BLOCKED', ruleIds: expect.arrayContaining(['REQUIRED_FIELDS', 'EXECUTOR_APPOINTED']) },
    });
    await runAsSystem(() => prisma.will.deleteMany({ where: { userId: b.userId } }));
  });
});

describe('generate', () => {
  let firstWillId = '';
  let firstVersionId = '';

  it('needs the acknowledgement', async () => {
    const d = await validDraft(a);
    firstWillId = d.id;
    await expect(a.runAs(() => generateWill(a.userId, d.id, { revision: d.revision, acknowledge: false }, deps)))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses a stale revision and leaves no PDF behind', async () => {
    await expect(a.runAs(() => generateWill(a.userId, firstWillId, { revision: 0, acknowledge: true }, deps)))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(await willDocs(a.userId)).toBe(0);
  });

  it('a failing PDF render changes nothing', async () => {
    const draft = await a.runAs(() => prisma.will.findUniqueOrThrow({ where: { id: firstWillId } }));
    const failing = { ...deps, renderPdf: async () => { throw new Error('render failed'); } };
    await expect(a.runAs(() => generateWill(a.userId, firstWillId, { revision: draft.revision, acknowledge: true }, failing)))
      .rejects.toThrow('render failed');
    const after = await a.runAs(() => prisma.will.findUniqueOrThrow({ where: { id: firstWillId } }));
    expect(after.status).toBe('DRAFT');
    expect(await willDocs(a.userId)).toBe(0);
  });

  it('a save that lands mid-generate wins: the PDF is removed and the draft stays a draft', async () => {
    const draft = await a.runAs(() => prisma.will.findUniqueOrThrow({ where: { id: firstWillId } }));
    const racing = {
      ...deps,
      renderPdf: async (input: Parameters<typeof renderWillPdf>[0]) => {
        await saveWillSection(a.userId, firstWillId, 'instructions', { revision: draft.revision, currentStep: 8, data: { text: 'Changed in another tab' } });
        return renderWillPdf(input);
      },
    };
    await expect(a.runAs(() => generateWill(a.userId, firstWillId, { revision: draft.revision, acknowledge: true }, racing)))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(await willDocs(a.userId)).toBe(0);
    expect((await a.runAs(() => prisma.will.findUniqueOrThrow({ where: { id: firstWillId } }))).status).toBe('DRAFT');
    // Put the original wording back for the next test.
    const now = await a.runAs(() => prisma.will.findUniqueOrThrow({ where: { id: firstWillId } }));
    await a.runAs(() => saveWillSection(a.userId, firstWillId, 'instructions', { revision: now.revision, currentStep: 8, data: validWillPayload().instructions }));
  });

  it('creates the version, the sealed snapshot and the PDF document', async () => {
    const draft = await a.runAs(() => prisma.will.findUniqueOrThrow({ where: { id: firstWillId } }));
    const res = await a.runAs(() => generateWill(a.userId, firstWillId, { revision: draft.revision, acknowledge: true }, deps));
    firstVersionId = res.version.id;
    expect(res.version).toMatchObject({ willId: firstWillId, versionNo: 1, status: 'GENERATED', generatedOn: TODAY, templateId: 'isa-hindu' });

    const p = validWillPayload();
    const v = await a.runAs(() => prisma.willVersion.findUniqueOrThrow({ where: { id: firstVersionId } }));
    expect(v.textHash).toBe(sha256Hex(renderWillText(selectWillTemplate(p).render(p, { generatedOn: TODAY }))));
    expect(v.inputHash).toBe(sha256Hex(canonicalJson(p)));
    expect(v.findingsJson).toEqual([{ ruleId: 'LEGAL_REVIEW_RECOMMENDED', severity: 'INFO' }]);
    expect(Buffer.from(v.snapshotSealed).includes(Buffer.from('Ramesh'))).toBe(false);

    const will = await a.runAs(() => prisma.will.findUniqueOrThrow({ where: { id: firstWillId } }));
    expect(will.status).toBe('GENERATED');
    expect(will.generatedAt).not.toBeNull();

    const pdf = await a.runAs(() => getWillVersionPdf(a.userId, firstVersionId));
    expect(pdf.fileName).toBe('will-v1.pdf');
    expect(sha256Hex(pdf.buffer)).toBe(v.pdfSha256);
    const doc = await a.runAs(() => prisma.document.findUniqueOrThrow({ where: { id: v.documentId } }));
    expect(doc).toMatchObject({ ownerType: 'WILL', ownerId: firstWillId, mimeType: 'application/pdf' });
  });

  it('another user cannot download it', async () => {
    await expect(b.runAs(() => getWillVersionPdf(b.userId, firstVersionId))).rejects.toMatchObject({ statusCode: 404 });
  });

  it('a newer generated will supersedes the older one', async () => {
    const d = await validDraft(a, firstWillId);
    const res = await a.runAs(() => generateWill(a.userId, d.id, { revision: d.revision, acknowledge: true }, deps));
    expect(res.version.versionNo).toBe(2);
    const first = await a.runAs(() => prisma.will.findUniqueOrThrow({ where: { id: firstWillId } }));
    expect(first).toMatchObject({ status: 'SUPERSEDED', supersededById: d.id });
  });

  it('a tampered PDF fails its integrity check', async () => {
    const v = await a.runAs(() => prisma.willVersion.findUniqueOrThrow({ where: { id: firstVersionId } }));
    const doc = await a.runAs(() => prisma.document.findUniqueOrThrow({ where: { id: v.documentId } }));
    await saveBuffer(a.userId, doc.storageKey, Buffer.from('%PDF-1.7 tampered'));
    await expect(a.runAs(() => getWillVersionPdf(a.userId, firstVersionId))).rejects.toMatchObject({ statusCode: 500, code: 'WILL_PDF_INTEGRITY' });
  });
});
```

Create `packages/api/test/routes/willGenerate.routes.test.ts`:
```ts
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { WILL_SECTIONS, willSectionData } from '@everypaisa/shared';
import { willRouter } from '../../src/routes/will.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createWillDraft, saveWillSection } from '../../src/services/will/will.service.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { validWillPayload } from '../will/willFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let user: TestScope;
let other: TestScope;
const auth = (s: TestScope) => ({
  authorization: `Bearer ${signAccessToken({ sub: s.userId, email: `${s.userId}@test.local`, role: 'INVESTOR', plan: 'PLUS' }).token}`,
});
const audit = (action: string) =>
  runAsSystem(() => prisma.auditLog.findFirst({ where: { userId: user.userId, action }, orderBy: { createdAt: 'desc' } }));

beforeAll(async () => {
  user = await createTestScope('will-gen-http');
  other = await createTestScope('will-gen-http-b');
  const app = express();
  app.use(express.json());
  app.use('/api/will', willRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  await runAsSystem(async () => {
    await prisma.willVersion.deleteMany({ where: { userId: user.userId } });
    await prisma.will.deleteMany({ where: { userId: { in: [user.userId, other.userId] } } });
  });
  await user.cleanup();
  await other.cleanup();
});

describe('preview, generate, download over HTTP', () => {
  let willId = '';
  let revision = 0;
  let versionId = '';

  it('preview is refused with rule ids while blockers remain, without echoing the draft', async () => {
    const d = await user.runAs(() => createWillDraft(user.userId, null));
    willId = d.id;
    await user.runAs(() => saveWillSection(user.userId, willId, 'details', { revision: 0, currentStep: 2, data: { ...validWillPayload().details, address: '' } }));
    revision = 1;
    const res = await fetch(`${base}/api/will/drafts/${willId}/preview`, { headers: auth(user) });
    expect(res.status).toBe(422);
    const text = await res.text();
    expect(JSON.parse(text).details.reason).toBe('WILL_BLOCKED');
    expect(text).not.toContain('Ramesh');
  });

  it('preview works once the will is complete, and is audited', async () => {
    const p = validWillPayload();
    for (const section of WILL_SECTIONS) {
      revision = (await user.runAs(() => saveWillSection(user.userId, willId, section, { revision, currentStep: 8, data: willSectionData(p, section) }))).revision;
    }
    const res = await fetch(`${base}/api/will/drafts/${willId}/preview`, { headers: auth(user) });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { templateId: string; document: unknown[] } };
    expect(json.data.templateId).toBe('isa-hindu');
    expect(json.data.document.length).toBeGreaterThan(5);
    expect((await audit('will_viewed'))?.resource).toBe(`Will:${willId}`);
  });

  it('generate needs the acknowledgement, then returns 201 and audits it', async () => {
    const post = (body: unknown) =>
      fetch(`${base}/api/will/drafts/${willId}/generate`, { method: 'POST', headers: { ...auth(user), 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post({ revision, acknowledge: false })).status).toBe(400);
    const res = await post({ revision, acknowledge: true });
    expect(res.status).toBe(201);
    versionId = ((await res.json()) as { data: { version: { id: string } } }).data.version.id;
    const row = await audit('will_generated');
    expect(row?.metadata).toMatchObject({ versionId, versionNo: 1, acknowledged: true });
  });

  it('downloads the PDF, audited; another user gets 404', async () => {
    const res = await fetch(`${base}/api/will/versions/${versionId}/pdf`, { headers: auth(user) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('will-v1.pdf');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await audit('will_downloaded'))?.resource).toBe(`WillVersion:${versionId}`);
    expect((await fetch(`${base}/api/will/versions/${versionId}/pdf`, { headers: auth(other) })).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/will/willPdf.test.ts test/will/willGenerate.db.test.ts test/routes/willGenerate.routes.test.ts
```
Expected: FAIL - cannot resolve `willPdf.js`, `willFonts.js`, `willGenerate.service.js`.

- [ ] **Step 3: Fonts and script runs**

Create `packages/api/src/services/will/willFonts.ts`:
```ts
/**
 * Fonts for will PDFs (packages/api/assets/fonts, see its README).
 * The same relative path works from src/services/will (tsx, vitest) and from
 * dist/services/will (production); the Dockerfile copies packages/api/assets.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FONT_DIR = fileURLToPath(new URL('../../../assets/fonts/', import.meta.url));

export const WILL_FONTS = {
  regular: join(FONT_DIR, 'NotoSans-Regular.ttf'),
  bold: join(FONT_DIR, 'NotoSans-Bold.ttf'),
  deva: join(FONT_DIR, 'NotoSansDevanagari-Regular.ttf'),
  devaBold: join(FONT_DIR, 'NotoSansDevanagari-Bold.ttf'),
} as const;

export interface ScriptRun {
  text: string;
  deva: boolean;
}

// Devanagari, Devanagari Extended, Vedic Extensions.
const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ᳐-᳿]/;
// Characters both fonts have; they stay with the run they follow so a run is never split by a space.
const NEUTRAL = /[\s\d.,;:!?()'"/&%+*-]/;

/**
 * Split text into runs that one font can draw. Noto Sans has Latin and the
 * rupee sign; Noto Sans Devanagari has Devanagari. pdfkit draws each run with
 * `continued: true` so the line reads as one.
 */
export function scriptRuns(text: string): ScriptRun[] {
  const runs: ScriptRun[] = [];
  let pending = '';
  for (const ch of text) {
    if (NEUTRAL.test(ch)) {
      const last = runs[runs.length - 1];
      if (last) last.text += ch;
      else pending += ch;
      continue;
    }
    const deva = DEVANAGARI.test(ch);
    const last = runs[runs.length - 1];
    if (last && last.deva === deva) {
      last.text += ch;
      continue;
    }
    runs.push({ text: pending + ch, deva });
    pending = '';
  }
  if (runs.length === 0 && pending) runs.push({ text: pending, deva: false });
  return runs;
}
```

- [ ] **Step 4: The PDF**

Create `packages/api/src/services/will/willPdf.ts`:
```ts
/**
 * The will as a printed document: plain white A4, black text, numbered
 * clauses, a signature line and page number on every page, the disclaimer in
 * the footer. Draws the same WillBlock[] the preview shows and the text hash
 * covers. CreationDate is pinned to the will's date.
 */
import PDFDocument from 'pdfkit';
import type { WillBlock } from '@everypaisa/shared';
import { scriptRuns, WILL_FONTS } from './willFonts.js';

type Doc = InstanceType<typeof PDFDocument>;

export interface WillPdfInput {
  blocks: WillBlock[];
  /** YYYY-MM-DD */
  generatedOn: string;
  footer: string;
}

const INK = '#111111';
const MUTED = '#555555';
const RULE = '#BBBBBB';
const MARGIN = 64;
const BOTTOM = 92; // room for the two-line footer

interface WriteOpts {
  size: number;
  bold?: boolean;
  align?: 'left' | 'center' | 'justify';
  color?: string;
  gapAfter?: number;
  indent?: number;
}

function write(doc: Doc, text: string, o: WriteOpts): void {
  const x = doc.page.margins.left + (o.indent ?? 0);
  const width = doc.page.width - doc.page.margins.right - x;
  doc.fontSize(o.size).fillColor(o.color ?? INK);
  const runs = scriptRuns(text);
  if (runs.length === 0) {
    doc.moveDown(0.6);
    return;
  }
  runs.forEach((r, i) => {
    doc.font(r.deva ? (o.bold ? 'deva-bold' : 'deva') : o.bold ? 'bold' : 'body');
    const opts = { width, align: o.align ?? 'left', continued: i < runs.length - 1, lineGap: 2 };
    if (i === 0) doc.text(r.text, x, doc.y, opts);
    else doc.text(r.text, opts);
  });
  if (o.gapAfter) doc.moveDown(o.gapAfter);
}

/** Start a new page unless `needed` points still fit, so a block is not split. */
function keepTogether(doc: Doc, needed: number): void {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function drawBlock(doc: Doc, b: WillBlock): void {
  switch (b.t) {
    case 'title':
      write(doc, b.text.toUpperCase(), { size: 17, bold: true, align: 'center', gapAfter: 0.2 });
      return;
    case 'heading':
      keepTogether(doc, 40);
      write(doc, b.text, { size: 12, bold: true, align: 'center', gapAfter: 0.8 });
      return;
    case 'para':
      write(doc, b.text, { size: 10.5, align: 'justify', gapAfter: 0.6 });
      return;
    case 'note':
      write(doc, b.text, { size: 9, color: MUTED, gapAfter: 0.6 });
      return;
    case 'clause':
      keepTogether(doc, 60);
      write(doc, `${b.n}. ${b.title}`, { size: 11.5, bold: true, gapAfter: 0.3 });
      for (const p of b.paras) write(doc, p, { size: 10.5, align: 'justify', indent: 14, gapAfter: 0.4 });
      doc.moveDown(0.3);
      return;
    case 'table':
      if (b.title) {
        keepTogether(doc, 50);
        write(doc, b.title, { size: 10.5, bold: true, gapAfter: 0.3 });
      }
      for (const [k, v] of b.rows) {
        keepTogether(doc, 32);
        write(doc, k, { size: 10, bold: true, indent: 14, gapAfter: 0.05 });
        write(doc, v, { size: 10, indent: 28, gapAfter: 0.35 });
      }
      doc.moveDown(0.4);
      return;
    case 'signature':
      keepTogether(doc, 120);
      for (const line of b.lines) write(doc, line, { size: 10.5, gapAfter: 0.3 });
      doc.moveDown(0.8);
      return;
    case 'witnesses':
      keepTogether(doc, 320);
      write(doc, b.intro, { size: 10, align: 'justify', gapAfter: 0.8 });
      for (let i = 1; i <= b.count; i++) {
        write(doc, `Witness ${i}`, { size: 10.5, bold: true, gapAfter: 0.4 });
        for (const f of b.fields) write(doc, `${f}: ______________________________`, { size: 10, gapAfter: 0.7 });
      }
      return;
  }
}

function drawFooters(doc: Doc, footer: string): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const keep = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // writing inside the margin must not add a page
    const x = doc.page.margins.left;
    const width = doc.page.width - x - doc.page.margins.right;
    const y = doc.page.height - BOTTOM + 22;
    doc.moveTo(x, y - 6).lineTo(x + width, y - 6).lineWidth(0.5).strokeColor(RULE).stroke();
    doc.font('body').fontSize(8).fillColor(MUTED);
    doc.text('Signature of the Testator: ____________________', x, y, { width, align: 'left', lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, x, y, { width, align: 'right', lineBreak: false });
    doc.fontSize(7).text(footer, x, y + 14, { width, align: 'center' });
    doc.page.margins.bottom = keep;
  }
}

export function renderWillPdf(input: WillPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const created = new Date(`${input.generatedOn}T00:00:00Z`);
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: BOTTOM },
      bufferPages: true,
      info: { Title: 'Last Will and Testament', Creator: 'EveryPaisa Will Maker', Producer: 'EveryPaisa', CreationDate: created, ModDate: created },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      doc.registerFont('body', WILL_FONTS.regular);
      doc.registerFont('bold', WILL_FONTS.bold);
      doc.registerFont('deva', WILL_FONTS.deva);
      doc.registerFont('deva-bold', WILL_FONTS.devaBold);
      for (const b of input.blocks) drawBlock(doc, b);
      drawFooters(doc, input.footer);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
```

- [ ] **Step 5: Preview, generate, download**

In `packages/api/src/services/will/willStore.ts` nothing changes (Task 7 already exports `requireWillKeys`).

Create `packages/api/src/services/will/willGenerate.service.ts`:
```ts
import { createHash, randomUUID } from 'node:crypto';
import {
  hasWillBlockers, renderWillSummary, renderWillText, runWillRules, selectWillTemplate,
  WILL_PDF_FOOTER, WILL_RULESET_VERSION,
  type WillFinding, type WillGenerateResultWire, type WillPayload, type WillPreviewWire,
} from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { AppError, BadRequestError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { sealForUser } from '../../lib/userKeys.js';
import { readBuffer } from '../../lib/documentStorage.js';
import { createDocument, deleteDocument } from '../document.service.js';
import { renderWillPdf, type WillPdfInput } from './willPdf.js';
import { loadDraft, requireWillKeys, revisionConflict, todayIst } from './willStore.js';
import { toVersionWire } from './will.service.js';

export interface WillGenerateDeps {
  renderPdf: (input: WillPdfInput) => Promise<Buffer>;
  today: () => string;
}

const defaultDeps: WillGenerateDeps = { renderPdf: renderWillPdf, today: todayIst };

/** JSON with sorted keys: the same will always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Hex(v: string | Buffer): string {
  return createHash('sha256').update(v).digest('hex');
}

function assertNoBlockers(payload: WillPayload, today: string): WillFinding[] {
  const findings = runWillRules(payload, { today });
  if (hasWillBlockers(findings)) {
    throw new ValidationError('Fix the checks on the Review step first', {
      reason: 'WILL_BLOCKED',
      ruleIds: findings.filter((f) => f.severity === 'BLOCKER').map((f) => f.ruleId),
    });
  }
  return findings;
}

export async function previewWill(
  userId: string,
  willId: string,
  deps: Pick<WillGenerateDeps, 'today'> = defaultDeps,
): Promise<WillPreviewWire> {
  const today = deps.today();
  const { payload } = await loadDraft(userId, willId);
  assertNoBlockers(payload, today);
  const template = selectWillTemplate(payload);
  const ctx = { generatedOn: today };
  return {
    templateId: template.id,
    templateVersion: template.version,
    generatedOn: today,
    summary: renderWillSummary(payload, ctx),
    document: template.render(payload, ctx),
  };
}

export async function generateWill(
  userId: string,
  willId: string,
  input: { revision: number; acknowledge: boolean },
  deps: WillGenerateDeps = defaultDeps,
): Promise<WillGenerateResultWire> {
  if (input.acknowledge !== true) {
    throw new BadRequestError('Please confirm you have read the note about legal review', { field: 'acknowledge' });
  }
  requireWillKeys();
  const today = deps.today();
  const { will, payload } = await loadDraft(userId, willId);
  if (will.revision !== input.revision) throw revisionConflict(will.revision);
  const findings = assertNoBlockers(payload, today);
  const template = selectWillTemplate(payload);
  const blocks = template.render(payload, { generatedOn: today });
  const canonical = canonicalJson(payload);
  const pdf = await deps.renderPdf({ blocks, generatedOn: today, footer: WILL_PDF_FOOTER });
  const versionId = randomUUID();
  const snapshotSealed = await sealForUser(userId, `willversion:${versionId}`, Buffer.from(canonical, 'utf8'));
  const doc = await createDocument({
    userId, ownerType: 'WILL', ownerId: will.id, fileName: `will-v${will.version}.pdf`,
    mimeType: 'application/pdf', category: 'will', buffer: pdf,
  });

  try {
    const version = await runInTransaction(async (tx) => {
      const claimed = await tx.will.updateMany({
        where: { id: will.id, userId, status: 'DRAFT', revision: will.revision },
        data: { status: 'GENERATED', generatedAt: new Date(), revision: { increment: 1 } },
      });
      if (claimed.count === 0) throw revisionConflict(will.revision + 1);
      await tx.will.updateMany({
        where: { userId, id: { not: will.id }, status: { in: ['GENERATED', 'EXECUTED'] } },
        data: { status: 'SUPERSEDED', supersededById: will.id },
      });
      return tx.willVersion.create({
        data: {
          id: versionId,
          willId: will.id,
          userId,
          versionNo: will.version,
          regime: template.regime,
          templateId: template.id,
          templateVersion: template.version,
          rulesetVersion: WILL_RULESET_VERSION,
          inputHash: sha256Hex(canonical),
          textHash: sha256Hex(renderWillText(blocks)),
          snapshotSealed,
          documentId: doc.id,
          pdfSha256: sha256Hex(pdf),
          findingsJson: findings.map((f) => ({ ruleId: f.ruleId, severity: f.severity })),
          generatedOn: new Date(`${today}T00:00:00Z`),
        },
      });
    });
    return { version: toVersionWire('GENERATED', version) };
  } catch (err) {
    // Leave no orphan PDF behind. The original error still decides the response.
    await deleteDocument(userId, doc.id, { allowWill: true }).catch((cleanupErr: unknown) => {
      logger.error(
        { documentId: doc.id, errName: cleanupErr instanceof Error ? cleanupErr.name : 'unknown' },
        'will.generate.document_cleanup_failed',
      );
    });
    throw err;
  }
}

export async function getWillVersionPdf(
  userId: string,
  versionId: string,
): Promise<{ fileName: string; buffer: Buffer; versionNo: number }> {
  const v = await prisma.willVersion.findFirst({ where: { id: versionId, userId } });
  if (!v) throw new NotFoundError('Will version not found');
  const doc = await prisma.document.findFirst({ where: { id: v.documentId, userId, ownerType: 'WILL' } });
  if (!doc) throw new NotFoundError('The PDF for this version is no longer stored');
  const buffer = await readBuffer(userId, doc.storageKey);
  if (sha256Hex(buffer) !== v.pdfSha256) {
    throw new AppError('The stored will PDF failed its integrity check', 500, 'WILL_PDF_INTEGRITY');
  }
  return { fileName: `will-v${v.versionNo}.pdf`, buffer, versionNo: v.versionNo };
}
```

In `packages/api/src/controllers/will.controller.ts`, extend the imports:
```ts
import { isWillSection, WILL_RULESET_VERSION } from '@everypaisa/shared';
import { generateWill, getWillVersionPdf, previewWill } from '../services/will/willGenerate.service.js';
```
(replace the existing `import { isWillSection } from '@everypaisa/shared';`), and append:
```ts
const generateBody = z.object({ revision: z.number().int().min(0), acknowledge: z.boolean() });

export async function preview(req: Request, res: Response): Promise<void> {
  const userId = uid(req);
  const willId = idOf(req, 'id');
  const result = await previewWill(userId, willId);
  await writeAuditLog({ userId, action: 'will_viewed', resource: `Will:${willId}`, req });
  ok(res, result);
}

export async function generate(req: Request, res: Response): Promise<void> {
  const userId = uid(req);
  const willId = idOf(req, 'id');
  const body = parseOr422(generateBody, req.body);
  const result = await generateWill(userId, willId, body);
  await writeAuditLog({
    userId, action: 'will_generated', resource: `Will:${willId}`, req,
    metadata: {
      versionId: result.version.id, versionNo: result.version.versionNo, templateId: result.version.templateId,
      templateVersion: result.version.templateVersion, rulesetVersion: WILL_RULESET_VERSION, acknowledged: true,
    },
  });
  created(res, result);
}

export async function downloadPdf(req: Request, res: Response): Promise<void> {
  const userId = uid(req);
  const versionId = idOf(req, 'vid');
  const file = await getWillVersionPdf(userId, versionId);
  await writeAuditLog({ userId, action: 'will_downloaded', resource: `WillVersion:${versionId}`, metadata: { versionNo: file.versionNo }, req });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(file.buffer);
}
```

In `packages/api/src/routes/will.routes.ts`: add `import { costlyOperationLimiter } from '../middleware/rateLimit.js';` and, after the `/people/suggestions` route:
```ts
willRouter.get('/drafts/:id/preview', asyncHandler(will.preview));
willRouter.post('/drafts/:id/generate', costlyOperationLimiter, asyncHandler(will.generate));
willRouter.get('/versions/:vid/pdf', asyncHandler(will.downloadPdf));
```

- [ ] **Step 6: Run the tests to verify they pass**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/will test/routes/will.routes.test.ts test/routes/willGenerate.routes.test.ts
npx tsc --noEmit
npx eslint src/services/will src/controllers/will.controller.ts src/routes/will.routes.ts
```
Expected: PASS; no type or lint errors. If `pdf-parse` splits `₹50,000` across text items, print `text` once to see how it extracts and assert on the exact extracted form - do not weaken the Devanagari font check.

Write one sample to look at, and open it:
```bash
cd portfolioos/packages/api
npx tsx -e "import('@everypaisa/shared').then(async (s) => { const { renderWillPdf } = await import('./src/services/will/willPdf.ts'); const { validWillPayload } = await import('./test/will/willFixtures.ts'); const m = validWillPayload(); m.people[0].name = 'सुनीता वर्मा'; const fs = await import('node:fs'); fs.writeFileSync(process.env.TEMP + '/will-sample.pdf', await renderWillPdf({ blocks: s.selectWillTemplate(m).render(m, { generatedOn: '2026-10-12' }), generatedOn: '2026-10-12', footer: s.WILL_PDF_FOOTER })); console.log('ok'); })"
```
Expected: `ok`. Open `%TEMP%/will-sample.pdf`: Devanagari name shaped correctly (no boxes), `₹` visible, footer on every page, signature/witness block not split across pages. Delete the sample afterwards.

- [ ] **Step 7: Commit**

```bash
cd portfolioos
git add packages/api/src/services/will/willFonts.ts packages/api/src/services/will/willPdf.ts packages/api/src/services/will/willGenerate.service.ts packages/api/src/controllers/will.controller.ts packages/api/src/routes/will.routes.ts packages/api/test/will/willPdf.test.ts packages/api/test/will/willGenerate.db.test.ts packages/api/test/routes/willGenerate.routes.test.ts
git commit -m "feat(will): preview, PDF generation and download with sealed snapshots

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Web - Assets & liabilities step and Allocate step

**Wave 4** (parallel with Task 10; needs Task 9).

**Files:**
- Create: `apps/web/src/pages/will/allocationMath.ts`
- Create: `apps/web/src/pages/will/DecimalField.tsx`
- Create: `apps/web/src/pages/will/steps/EstateStep.tsx`
- Create: `apps/web/src/pages/will/steps/AllocationStep.tsx`
- Modify: `apps/web/src/pages/will/steps/registry.ts` (register `estate`, `allocation`)
- Test: `apps/web/src/pages/will/allocationMath.test.ts`, `apps/web/src/pages/will/steps/EstateStep.test.tsx`, `apps/web/src/pages/will/steps/AllocationStep.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`willEstateTotals`, `removeWillItem`, `sumPercents`, `WILL_MANUAL_ITEM_PREFIX`, `WILL_OWNERSHIP_TYPES`, types, `Decimal`, `formatINR`, `formatDateOnly`), Task 9 (`WillStepProps`, `Field`, `Notice`, `FindingList`, `newLocalId`, `RELATIONSHIP_LABEL`, test builders from Task 8).
- Produces:
  - `allocationMath.ts`: `isPercentText(s): boolean`, `normaliseAmountText(s): string`, `isAmountText(s): boolean`, `equalShares(n: number): string[]` (2-decimal strings summing to exactly 100; the first share takes the remainder).
  - `DecimalField({ label, value, kind: 'percent' | 'amount', onValid, id? })`: keeps the typed text locally, calls `onValid(normalised)` only for valid input, shows a hint otherwise.
  - `EstateStep`, `AllocationStep` registered in `WILL_STEP_COMPONENTS`.

Behaviour:
- Estate: on first open with `estate.asOf === null` the step calls `refreshEstate()` once; "Refresh from my accounts" calls it again. Items show label, identifier, value (`formatINR`), ownership (Sole / Joint / Nominee only / HUF with a share for Joint and HUF), and status (Confirmed / Needs review / Excluded / Not found on refresh) with Confirm, Exclude / Include and (manual items) Remove. Changing ownership or share sets `userEdited`. Container `wide` (>= 640 px) shows a table; narrower shows cards. "Add an asset or liability" adds a manual item (`sourceKey` = `manual:<id>`, CONFIRMED, SOLE).
- Allocate: tabs "By percentage" (residuary rows, add person with the remaining share, "Split equally", live total and a donut), "Specific gifts" (asset -> person, share), "Fixed amounts" (person -> amount). Step-5 findings are listed above the tabs.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/pages/will/allocationMath.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Decimal } from '@everypaisa/shared';
import { equalShares, isAmountText, isPercentText, normaliseAmountText } from './allocationMath';

describe('allocation maths', () => {
  it('equalShares always sums to exactly 100', () => {
    expect(equalShares(3)).toEqual(['33.34', '33.33', '33.33']);
    expect(equalShares(1)).toEqual(['100.00']);
    expect(equalShares(0)).toEqual([]);
    for (const n of [2, 3, 6, 7, 9, 11, 60]) {
      expect(equalShares(n).reduce((s, v) => s.plus(v), new Decimal(0)).equals(100)).toBe(true);
    }
  });

  it('accepts percentages with up to two decimals, at most 100', () => {
    expect(isPercentText('33.33')).toBe(true);
    expect(isPercentText('100')).toBe(true);
    expect(isPercentText('33.333')).toBe(false);
    expect(isPercentText('101')).toBe(false);
    expect(isPercentText('')).toBe(false);
    expect(isPercentText('33.')).toBe(false);
  });

  it('accepts amounts written the Indian way', () => {
    expect(normaliseAmountText('₹1,00,000.50')).toBe('100000.50');
    expect(isAmountText('1,00,000')).toBe(true);
    expect(isAmountText('12.345')).toBe(false);
    expect(isAmountText('-5')).toBe(false);
  });
});
```

Create `apps/web/src/pages/will/steps/EstateStep.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { runWillRules, type WillPayload } from '@everypaisa/shared';
import { EstateStep } from './EstateStep';
import type { WillStepProps } from './types';
import { fullPayload, item, TODAY } from '../willTestData';

afterEach(cleanup);

function setup(payload: WillPayload = fullPayload(), wide = true) {
  const p: WillStepProps = {
    willId: 'w1', payload, findings: runWillRules(payload, { today: TODAY }), today: TODAY, wide, update: vi.fn(),
    refreshEstate: vi.fn(async () => undefined), flush: vi.fn(async () => true), getRevision: () => 0, goTo: vi.fn(),
  };
  render(<EstateStep {...p} />);
  return p;
}

const lastEstate = (p: WillStepProps) => vi.mocked(p.update).mock.calls.filter((c) => c[0] === 'estate').at(-1)![1] as WillPayload['estate'];

describe('EstateStep', () => {
  it('fetches the estate on first open, once', () => {
    const payload = fullPayload();
    payload.estate.asOf = null;
    const p = setup(payload);
    expect(p.refreshEstate).toHaveBeenCalledTimes(1);
  });

  it('does not refetch an estate it already has, but refreshes on request', () => {
    const p = setup();
    expect(p.refreshEstate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /refresh from my accounts/i }));
    expect(p.refreshEstate).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/as of 12\/10\/2026/i)).toBeTruthy();
  });

  it('shows totals and the items as a table when wide, as cards when narrow', () => {
    setup();
    expect(screen.getByTestId('estate-net').textContent).toContain('13,50,000');
    expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
    cleanup();
    setup(fullPayload(), false);
    expect(screen.queryAllByRole('table')).toHaveLength(0);
    expect(screen.getByTestId('estate-item-bank:b1')).toBeTruthy();
  });

  it('confirms, excludes and changes ownership', () => {
    const payload = fullPayload();
    payload.estate.items[0]!.review = 'NEEDS_REVIEW';
    const p = setup(payload, false);
    const row = screen.getByTestId('estate-item-bank:b1');
    fireEvent.click(within(row).getByRole('button', { name: /confirm/i }));
    expect(lastEstate(p).items[0]!.review).toBe('CONFIRMED');
    fireEvent.click(within(row).getByRole('button', { name: /exclude/i }));
    expect(lastEstate(p).items[0]!.review).toBe('EXCLUDED');
    fireEvent.change(within(row).getByLabelText(/ownership/i), { target: { value: 'JOINT' } });
    expect(lastEstate(p).items[0]!).toMatchObject({ ownership: { type: 'JOINT', sharePct: '50' }, userEdited: true });
  });

  it('adds a manual asset', () => {
    const p = setup(fullPayload(), false);
    fireEvent.click(screen.getByRole('button', { name: /add an asset or liability/i }));
    fireEvent.change(screen.getByLabelText(/^what is it/i), { target: { value: 'Gold coins' } });
    fireEvent.change(screen.getByLabelText(/^value/i), { target: { value: '75,000' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    const added = lastEstate(p).items.at(-1)!;
    expect(added).toMatchObject({ label: 'Gold coins', value: '75000', kind: 'OTHER_ASSET', side: 'ASSET', review: 'CONFIRMED', userEdited: true });
    expect(added.sourceKey.startsWith('manual:')).toBe(true);
  });

  it('removing a manual item also removes gifts of it', () => {
    const payload = fullPayload();
    payload.estate.items.push(item({ sourceKey: 'manual:x', kind: 'OTHER_ASSET', label: 'Painting', value: '5000' }));
    payload.allocation.specificGifts.push({ itemId: 'manual:x', personId: 'p-son', sharePct: '100' });
    const p = setup(payload, false);
    fireEvent.click(within(screen.getByTestId('estate-item-manual:x')).getByRole('button', { name: /remove/i }));
    expect(lastEstate(p).items.some((i) => i.sourceKey === 'manual:x')).toBe(false);
    const allocation = vi.mocked(p.update).mock.calls.find((c) => c[0] === 'allocation')![1] as WillPayload['allocation'];
    expect(allocation.specificGifts.some((g) => g.itemId === 'manual:x')).toBe(false);
  });
});
```

Create `apps/web/src/pages/will/steps/AllocationStep.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { runWillRules, type WillPayload } from '@everypaisa/shared';
import { AllocationStep } from './AllocationStep';
import type { WillStepProps } from './types';
import { fullPayload, TODAY } from '../willTestData';

vi.mock('recharts', async (orig) => {
  const actual = await orig<typeof import('recharts')>();
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div style={{ width: 200, height: 160 }}>{children}</div> };
});

afterEach(cleanup);

function setup(payload: WillPayload = fullPayload()) {
  const p: WillStepProps = {
    willId: 'w1', payload, findings: runWillRules(payload, { today: TODAY }), today: TODAY, wide: true, update: vi.fn(),
    refreshEstate: vi.fn(), flush: vi.fn(async () => true), getRevision: () => 0, goTo: vi.fn(),
  };
  render(<AllocationStep {...p} />);
  return p;
}
const lastAllocation = (p: WillStepProps) => vi.mocked(p.update).mock.calls.filter((c) => c[0] === 'allocation').at(-1)![1] as WillPayload['allocation'];

describe('AllocationStep', () => {
  it('shows the live total, and the blocker when it is not 100%', () => {
    const payload = fullPayload();
    payload.allocation.residuary[0]!.sharePct = '50';
    setup(payload);
    expect(screen.getByTestId('residuary-total').textContent).toContain('90.00%');
    expect(screen.getByText(/adds up to 90\.00%/)).toBeTruthy();
  });

  it('splits equally to exactly 100', () => {
    const payload = fullPayload();
    payload.allocation.residuary.push({ personId: 'p-trust', sharePct: '10' });
    const p = setup(payload);
    fireEvent.click(screen.getByRole('button', { name: /split equally/i }));
    expect(lastAllocation(p).residuary.map((r) => r.sharePct)).toEqual(['33.34', '33.33', '33.33']);
  });

  it('only saves valid percentages', () => {
    const p = setup();
    const input = screen.getByLabelText('Share for Sunita Verma');
    fireEvent.change(input, { target: { value: '55.555' } });
    expect(p.update).not.toHaveBeenCalled();
    expect(screen.getByText(/like 25 or 33\.33/)).toBeTruthy();
    fireEvent.change(input, { target: { value: '55.5' } });
    expect(lastAllocation(p).residuary[0]).toEqual({ personId: 'p-spouse', sharePct: '55.5' });
  });

  it('adds a person with the share still left', () => {
    const payload = fullPayload();
    payload.allocation.residuary = [{ personId: 'p-spouse', sharePct: '60' }];
    const p = setup(payload);
    fireEvent.change(screen.getByLabelText(/add someone to the split/i), { target: { value: 'p-son' } });
    expect(lastAllocation(p).residuary).toEqual([{ personId: 'p-spouse', sharePct: '60' }, { personId: 'p-son', sharePct: '40.00' }]);
  });

  it('adds a specific gift and a fixed amount', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('tab', { name: /specific gifts/i }));
    fireEvent.change(screen.getByLabelText(/^asset$/i), { target: { value: 'bank:b1' } });
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: 'p-spouse' } });
    fireEvent.click(screen.getByRole('button', { name: /add gift/i }));
    expect(lastAllocation(p).specificGifts.at(-1)).toEqual({ itemId: 'bank:b1', personId: 'p-spouse', sharePct: '100' });

    fireEvent.click(screen.getByRole('tab', { name: /fixed amounts/i }));
    fireEvent.change(screen.getByLabelText(/^person$/i), { target: { value: 'p-son' } });
    fireEvent.change(screen.getByLabelText(/^amount$/i), { target: { value: '1,00,000' } });
    fireEvent.click(screen.getByRole('button', { name: /add amount/i }));
    expect(lastAllocation(p).fixedGifts.at(-1)).toEqual({ personId: 'p-son', amount: '100000' });
  });

  it('does not offer excluded assets or liabilities as gifts', () => {
    const payload = fullPayload();
    payload.estate.items[0]!.review = 'EXCLUDED';
    setup(payload);
    fireEvent.click(screen.getByRole('tab', { name: /specific gifts/i }));
    const options = Array.from((screen.getByLabelText(/^asset$/i) as HTMLSelectElement).options).map((o) => o.textContent ?? '');
    expect(options.some((o) => o.includes('HDFC'))).toBe(false);
    expect(options.some((o) => o.includes('Home loan'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/will`
Expected: FAIL - cannot resolve `./allocationMath`, `./EstateStep`, `./AllocationStep`.

- [ ] **Step 3: Maths and the decimal input**

Create `apps/web/src/pages/will/allocationMath.ts`:
```ts
import { Decimal } from '@everypaisa/shared';

const PERCENT_TEXT = /^\d{1,3}(\.\d{1,2})?$/;
const AMOUNT_TEXT = /^\d{1,13}(\.\d{1,2})?$/;

export function isPercentText(s: string): boolean {
  return PERCENT_TEXT.test(s) && new Decimal(s).lte(100);
}

/** "₹1,00,000.50" -> "100000.50" */
export function normaliseAmountText(s: string): string {
  return s.replace(/[₹,\s]/g, '');
}

export function isAmountText(s: string): boolean {
  return AMOUNT_TEXT.test(normaliseAmountText(s));
}

/** n shares of 100% to two decimals that add up to exactly 100; the first takes the remainder. */
export function equalShares(n: number): string[] {
  if (n <= 0) return [];
  const base = new Decimal(100).dividedBy(n).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const rest = new Decimal(100).minus(base.times(n));
  return Array.from({ length: n }, (_, i) => (i === 0 ? base.plus(rest) : base).toFixed(2));
}
```

Create `apps/web/src/pages/will/DecimalField.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { isAmountText, isPercentText, normaliseAmountText } from './allocationMath';

/**
 * A money or percentage input that never hands the payload an invalid value:
 * the typed text lives here; `onValid` fires only for text the schema accepts.
 */
export function DecimalField({ id, label, value, kind, onValid, className }: {
  id?: string;
  label: string;
  value: string;
  kind: 'percent' | 'amount';
  onValid: (v: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const normalise = (t: string) => (kind === 'amount' ? normaliseAmountText(t) : t.trim());
  const ok = (t: string) => (kind === 'percent' ? isPercentText(normalise(t)) : isAmountText(t));
  const valid = ok(text);
  return (
    <div className={cn('min-w-0', className)}>
      <Input
        id={id}
        aria-label={label}
        aria-invalid={!valid}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (ok(t)) onValid(normalise(t));
        }}
      />
      {!valid && (
        <p className="mt-1 text-xs text-negative">
          {kind === 'percent' ? 'Enter a percentage like 25 or 33.33' : 'Enter an amount like 50000 or 50000.50'}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Estate step**

Create `apps/web/src/pages/will/steps/EstateStep.tsx`:
```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  formatDateOnly, formatINR, removeWillItem, willEstateTotals, WILL_MANUAL_ITEM_PREFIX, WILL_OWNERSHIP_TYPES,
  type WillAssetItem, type WillEstateKind, type WillOwnershipType, type WillReviewState,
} from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { DecimalField } from '../DecimalField';
import { isAmountText, normaliseAmountText } from '../allocationMath';
import { Field, FindingList, newLocalId, Notice } from '../parts';
import type { WillStepProps } from './types';

const KIND_LABEL: Record<WillEstateKind, string> = {
  BANK_ACCOUNT: 'Bank account', HOLDING: 'Investments', PROVIDENT_FUND: 'Provident fund', OWNED_PROPERTY: 'Property',
  RENTAL_PROPERTY: 'Rental property', VEHICLE: 'Vehicle', INSURANCE: 'Insurance', LOAN_GIVEN: 'Money lent',
  LOAN: 'Loan', CREDIT_CARD: 'Credit card', OTHER_ASSET: 'Other asset', OTHER_LIABILITY: 'Other liability',
};
const OWNERSHIP_LABEL: Record<WillOwnershipType, string> = { SOLE: 'Sole', JOINT: 'Joint', NOMINEE_ONLY: 'Nominee only', HUF: 'HUF' };
const REVIEW_LABEL: Record<WillReviewState, string> = {
  CONFIRMED: 'Confirmed', NEEDS_REVIEW: 'Needs review', EXCLUDED: 'Excluded', STALE: 'Not found on refresh',
};
const REVIEW_TONE: Record<WillReviewState, string> = {
  CONFIRMED: 'text-positive', NEEDS_REVIEW: 'text-warning', EXCLUDED: 'text-muted-foreground', STALE: 'text-warning',
};
const SOURCE_LABEL: Record<string, string> = {
  bankAccounts: 'bank accounts', holdings: 'investments', pfAccounts: 'provident fund', ownedProperty: 'property',
  rentalProperty: 'rental property', vehicles: 'vehicles', insurance: 'insurance', loansGiven: 'money lent',
  loans: 'loans', creditCards: 'credit cards',
};

interface RowActions {
  patch: (key: string, p: Partial<WillAssetItem>) => void;
  remove: (key: string) => void;
}

function OwnershipControl({ item, actions }: { item: WillAssetItem; actions: RowActions }) {
  const id = `own-${item.sourceKey}`;
  return (
    <div className="flex min-w-0 flex-wrap items-start gap-2">
      <Select
        id={id}
        aria-label={`Ownership of ${item.label}`}
        className="h-9 w-36"
        value={item.ownership.type}
        onChange={(e) => {
          const type = e.target.value as WillOwnershipType;
          actions.patch(item.sourceKey, { ownership: { type, sharePct: type === 'JOINT' ? '50' : '100' }, userEdited: true });
        }}
      >
        {WILL_OWNERSHIP_TYPES.map((t) => <option key={t} value={t}>{OWNERSHIP_LABEL[t]}</option>)}
      </Select>
      {(item.ownership.type === 'JOINT' || item.ownership.type === 'HUF') && (
        <DecimalField
          className="w-24"
          kind="percent"
          label={`Your share of ${item.label}`}
          value={item.ownership.sharePct}
          onValid={(v) => actions.patch(item.sourceKey, { ownership: { ...item.ownership, sharePct: v }, userEdited: true })}
        />
      )}
    </div>
  );
}

function ReviewControl({ item, actions }: { item: WillAssetItem; actions: RowActions }) {
  const manual = item.sourceKey.startsWith(WILL_MANUAL_ITEM_PREFIX);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={cn('text-xs font-medium', REVIEW_TONE[item.review])}>{REVIEW_LABEL[item.review]}</span>
      {(item.review === 'NEEDS_REVIEW' || item.review === 'STALE') && (
        <Button size="sm" variant="ghost" onClick={() => actions.patch(item.sourceKey, { review: 'CONFIRMED' })}>Confirm</Button>
      )}
      {item.review === 'EXCLUDED' ? (
        <Button size="sm" variant="ghost" onClick={() => actions.patch(item.sourceKey, { review: 'CONFIRMED' })}>Include</Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => actions.patch(item.sourceKey, { review: 'EXCLUDED' })}>Exclude</Button>
      )}
      {manual && <Button size="sm" variant="ghost" onClick={() => actions.remove(item.sourceKey)}>Remove</Button>}
    </div>
  );
}

function Describe({ item }: { item: WillAssetItem }) {
  return (
    <div className="min-w-0">
      <p className="break-words font-medium text-foreground">{item.label}</p>
      <p className="text-xs text-muted-foreground">
        {KIND_LABEL[item.kind]}
        {item.ref ? ` - ${item.ref}` : ''}
      </p>
      {item.note && <p className="mt-0.5 text-xs text-muted-foreground">{item.note}</p>}
    </div>
  );
}

function ItemTable({ items, actions }: { items: WillAssetItem[]; actions: RowActions }) {
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="w-[34%] py-2 font-medium">Item</th>
          <th className="w-[16%] py-2 text-right font-medium">Value</th>
          <th className="w-[26%] py-2 pl-3 font-medium">Ownership</th>
          <th className="w-[24%] py-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/60">
        {items.map((i) => (
          <tr key={i.sourceKey} data-testid={`estate-item-${i.sourceKey}`} className="align-top">
            <td className="py-2 pr-2"><Describe item={i} /></td>
            <td className="py-2 text-right tabular-nums text-foreground">{formatINR(i.value, { fractionDigits: 0 })}</td>
            <td className="py-2 pl-3"><OwnershipControl item={i} actions={actions} /></td>
            <td className="py-2"><ReviewControl item={i} actions={actions} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ItemCards({ items, actions }: { items: WillAssetItem[]; actions: RowActions }) {
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.sourceKey} data-testid={`estate-item-${i.sourceKey}`} className="space-y-2 rounded-md border border-border/60 p-3">
          <div className="flex items-start justify-between gap-2">
            <Describe item={i} />
            <span className="shrink-0 tabular-nums text-sm font-medium text-foreground">{formatINR(i.value, { fractionDigits: 0 })}</span>
          </div>
          <OwnershipControl item={i} actions={actions} />
          <ReviewControl item={i} actions={actions} />
        </li>
      ))}
    </ul>
  );
}

function AddManual({ today, onAdd }: { today: string; onAdd: (i: WillAssetItem) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [side, setSide] = useState<'ASSET' | 'LIABILITY'>('ASSET');
  const [value, setValue] = useState('');
  if (!open) {
    return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Add an asset or liability</Button>;
  }
  const ready = label.trim().length > 0 && isAmountText(value);
  return (
    <Card tone="muted" className="space-y-3 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="will-manual-label" label="What is it">
          <Input id="will-manual-label" value={label} maxLength={160} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field id="will-manual-side" label="Type">
          <Select id="will-manual-side" value={side} onChange={(e) => setSide(e.target.value === 'LIABILITY' ? 'LIABILITY' : 'ASSET')}>
            <option value="ASSET">Asset</option>
            <option value="LIABILITY">Liability (something you owe)</option>
          </Select>
        </Field>
        <Field id="will-manual-value" label="Value">
          <Input id="will-manual-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!ready}
          onClick={() => {
            onAdd({
              sourceKey: `${WILL_MANUAL_ITEM_PREFIX}${newLocalId('m')}`, side, kind: side === 'ASSET' ? 'OTHER_ASSET' : 'OTHER_LIABILITY',
              label: label.trim(), ref: null, value: normaliseAmountText(value), valueAsOf: today,
              ownership: { type: 'SOLE', sharePct: '100' }, review: 'CONFIRMED', userEdited: true, note: null,
            });
            setOpen(false);
            setLabel('');
            setValue('');
          }}
        >
          Add
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </Card>
  );
}

export function EstateStep({ payload, update, refreshEstate, findings, wide, today }: WillStepProps) {
  const estate = payload.estate;
  const [refreshing, setRefreshing] = useState(false);
  const started = useRef(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshEstate();
    } finally {
      setRefreshing(false);
    }
  }, [refreshEstate]);

  useEffect(() => {
    if (estate.asOf === null && !started.current) {
      started.current = true;
      void refresh();
    }
  }, [estate.asOf, refresh]);

  const actions: RowActions = {
    patch: (key, p) => update('estate', { ...estate, items: estate.items.map((i) => (i.sourceKey === key ? { ...i, ...p } : i)) }),
    remove: (key) => {
      const next = removeWillItem(payload, key);
      update('estate', next.estate);
      update('allocation', next.allocation);
    },
  };
  const totals = willEstateTotals(estate.items);
  const assets = estate.items.filter((i) => i.side === 'ASSET');
  const liabilities = estate.items.filter((i) => i.side === 'LIABILITY');
  const List = wide ? ItemTable : ItemCards;
  const money = (d: { toFixed(n: number): string }) => formatINR(d.toFixed(2), { fractionDigits: 0 });

  return (
    <div className="min-w-0 space-y-4">
      <Card className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {estate.asOf ? `As of ${formatDateOnly(estate.asOf)}. Values are estimates.` : 'Fetching your assets...'}
          </p>
          <Button size="sm" variant="outline" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw className={cn('mr-1 h-4 w-4', refreshing && 'animate-spin')} />Refresh from my accounts
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-border/60 p-3"><p className="text-xs text-muted-foreground">Assets</p><p className="text-lg font-semibold tabular-nums text-foreground">{money(totals.assets)}</p></div>
          <div className="rounded-md border border-border/60 p-3"><p className="text-xs text-muted-foreground">Liabilities</p><p className="text-lg font-semibold tabular-nums text-foreground">{money(totals.liabilities)}</p></div>
          <div className="rounded-md border border-border/60 p-3"><p className="text-xs text-muted-foreground">Net</p><p className="text-lg font-semibold tabular-nums text-foreground" data-testid="estate-net">{money(totals.net)}</p></div>
        </div>
        {totals.nomineeOnly.greaterThan(0) && (
          <p className="text-xs text-muted-foreground">Paid to nominees and not counted: {money(totals.nomineeOnly)}.</p>
        )}
        {estate.failedSources.length > 0 && (
          <Notice tone="warning">
            We could not read your {estate.failedSources.map((s) => SOURCE_LABEL[s] ?? s).join(', ')} just now. Try refreshing, or add them by hand.
          </Notice>
        )}
        <FindingList findings={findings.filter((f) => f.step === 4)} />
      </Card>

      <Card className="min-w-0 space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-2"><h2 className="text-base font-semibold text-foreground">Assets</h2><Badge variant="secondary">{assets.length}</Badge></div>
        {assets.length ? <List items={assets} actions={actions} /> : <p className="text-sm text-muted-foreground">No assets yet.</p>}
      </Card>

      <Card className="min-w-0 space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-2"><h2 className="text-base font-semibold text-foreground">Liabilities</h2><Badge variant="secondary">{liabilities.length}</Badge></div>
        {liabilities.length ? <List items={liabilities} actions={actions} /> : <p className="text-sm text-muted-foreground">No liabilities.</p>}
      </Card>

      <AddManual today={today} onAdd={(i) => update('estate', { ...estate, items: [...estate.items, i] })} />
    </div>
  );
}
```

- [ ] **Step 5: Allocate step**

Create `apps/web/src/pages/will/steps/AllocationStep.tsx`:
```tsx
import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { Decimal, formatINR, sumPercents, type WillAllocation } from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/cn';
import { DecimalField } from '../DecimalField';
import { equalShares, isAmountText, normaliseAmountText } from '../allocationMath';
import { Field, FindingList } from '../parts';
import type { WillStepProps } from './types';

const SLICE_COLOURS = [
  'hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--positive))', 'hsl(var(--warning))', 'hsl(var(--muted-foreground))',
];

export function AllocationStep({ payload, update, findings, wide }: WillStepProps) {
  const [tab, setTab] = useState('percent');
  const [giftItem, setGiftItem] = useState('');
  const [giftPerson, setGiftPerson] = useState('');
  const [fixedPerson, setFixedPerson] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const a = payload.allocation;
  const set = (patch: Partial<WillAllocation>) => update('allocation', { ...a, ...patch });
  const people = [...payload.people].sort((x, y) => x.name.localeCompare(y.name, 'en'));
  const nameOf = (id: string) => payload.people.find((p) => p.id === id)?.name ?? 'Removed person';
  const itemOf = (id: string) => payload.estate.items.find((i) => i.sourceKey === id);
  const total = sumPercents(a.residuary.map((r) => r.sharePct));
  const remaining = new Decimal(100).minus(total);
  const notInSplit = people.filter((p) => !a.residuary.some((r) => r.personId === p.id));
  const giftable = payload.estate.items.filter((i) => i.side === 'ASSET' && i.review !== 'EXCLUDED');
  const slices = [
    ...a.residuary.map((r) => ({ name: nameOf(r.personId), value: new Decimal(r.sharePct).toNumber() })),
    ...(remaining.greaterThan(0) ? [{ name: 'Not shared yet', value: remaining.toNumber() }] : []),
  ];

  return (
    <div className="min-w-0 space-y-4">
      <FindingList findings={findings.filter((f) => f.step === 5)} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="percent">By percentage</TabsTrigger>
          <TabsTrigger value="specific">Specific gifts</TabsTrigger>
          <TabsTrigger value="fixed">Fixed amounts</TabsTrigger>
        </TabsList>

        <TabsContent value="percent" className="pt-3">
          <Card className={cn('grid min-w-0 gap-4 p-4 sm:p-5', wide && 'grid-cols-[minmax(0,1fr)_200px]')}>
            <div className="min-w-0 space-y-3">
              <p className="text-sm text-muted-foreground">
                Everything not given away as a specific gift or a fixed amount is shared in these percentages.
              </p>
              <ul className="space-y-2">
                {a.residuary.map((r, i) => (
                  <li key={r.personId} className="flex flex-wrap items-start gap-2">
                    <span className="min-w-0 flex-1 break-words pt-2 text-sm text-foreground">{nameOf(r.personId)}</span>
                    <DecimalField
                      className="w-28"
                      kind="percent"
                      label={`Share for ${nameOf(r.personId)}`}
                      value={r.sharePct}
                      onValid={(v) => set({ residuary: a.residuary.map((x, j) => (j === i ? { ...x, sharePct: v } : x)) })}
                    />
                    <Button size="sm" variant="ghost" onClick={() => set({ residuary: a.residuary.filter((_, j) => j !== i) })}>Remove</Button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-end gap-2">
                {notInSplit.length > 0 && (
                  <Field id="will-add-residuary" label="Add someone to the split">
                    <Select
                      id="will-add-residuary"
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        set({ residuary: [...a.residuary, { personId: e.target.value, sharePct: remaining.greaterThan(0) ? remaining.toFixed(2) : '0' }] });
                      }}
                    >
                      <option value="">Choose a person...</option>
                      {notInSplit.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  </Field>
                )}
                {a.residuary.length > 1 && (
                  <Button size="sm" variant="outline" onClick={() => {
                    const shares = equalShares(a.residuary.length);
                    set({ residuary: a.residuary.map((r, i) => ({ ...r, sharePct: shares[i]! })) });
                  }}>
                    Split equally
                  </Button>
                )}
              </div>
              <p data-testid="residuary-total" className={cn('text-sm font-medium tabular-nums', total.equals(100) ? 'text-positive' : 'text-negative')}>
                Total {total.toFixed(2)}%
                {!total.equals(100) && ` - ${remaining.abs().toFixed(2)}% ${remaining.isNegative() ? 'too much' : 'left to share'}`}
              </p>
            </div>
            <div className="h-40 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={slices} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" stroke="none">
                    {slices.map((s, i) => (
                      <Cell key={s.name} fill={s.name === 'Not shared yet' ? 'hsl(var(--muted))' : SLICE_COLOURS[i % SLICE_COLOURS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="specific" className="pt-3">
          <Card className="min-w-0 space-y-3 p-4 sm:p-5">
            <ul className="space-y-2">
              {a.specificGifts.map((g, i) => (
                <li key={`${g.itemId}-${g.personId}`} className="flex flex-wrap items-start gap-2 rounded-md border border-border/60 p-2">
                  <span className="min-w-0 flex-1 break-words pt-2 text-sm text-foreground">
                    {itemOf(g.itemId)?.label ?? 'Item no longer in your list'} - {nameOf(g.personId)}
                  </span>
                  <DecimalField
                    className="w-24"
                    kind="percent"
                    label={`Share of ${itemOf(g.itemId)?.label ?? 'item'} for ${nameOf(g.personId)}`}
                    value={g.sharePct}
                    onValid={(v) => set({ specificGifts: a.specificGifts.map((x, j) => (j === i ? { ...x, sharePct: v } : x)) })}
                  />
                  <Button size="sm" variant="ghost" onClick={() => set({ specificGifts: a.specificGifts.filter((_, j) => j !== i) })}>Remove</Button>
                </li>
              ))}
            </ul>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <Field id="will-gift-item" label="Asset">
                <Select id="will-gift-item" value={giftItem} onChange={(e) => setGiftItem(e.target.value)}>
                  <option value="">Choose an asset...</option>
                  {giftable.map((i) => <option key={i.sourceKey} value={i.sourceKey}>{i.ref ? `${i.label} (${i.ref})` : i.label}</option>)}
                </Select>
              </Field>
              <Field id="will-gift-person" label="To">
                <Select id="will-gift-person" value={giftPerson} onChange={(e) => setGiftPerson(e.target.value)}>
                  <option value="">Choose a person...</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <Button
                size="sm"
                disabled={!giftItem || !giftPerson}
                onClick={() => {
                  set({ specificGifts: [...a.specificGifts, { itemId: giftItem, personId: giftPerson, sharePct: '100' }] });
                  setGiftItem('');
                  setGiftPerson('');
                }}
              >
                Add gift
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="fixed" className="pt-3">
          <Card className="min-w-0 space-y-3 p-4 sm:p-5">
            <ul className="space-y-2">
              {a.fixedGifts.map((g, i) => (
                <li key={`${g.personId}-${i}`} className="flex flex-wrap items-start gap-2 rounded-md border border-border/60 p-2">
                  <span className="min-w-0 flex-1 break-words pt-2 text-sm text-foreground">{nameOf(g.personId)}</span>
                  <DecimalField
                    className="w-36"
                    kind="amount"
                    label={`Amount for ${nameOf(g.personId)}`}
                    value={g.amount}
                    onValid={(v) => set({ fixedGifts: a.fixedGifts.map((x, j) => (j === i ? { ...x, amount: v } : x)) })}
                  />
                  <span className="pt-2 text-xs text-muted-foreground tabular-nums">{formatINR(g.amount, { fractionDigits: 0 })}</span>
                  <Button size="sm" variant="ghost" onClick={() => set({ fixedGifts: a.fixedGifts.filter((_, j) => j !== i) })}>Remove</Button>
                </li>
              ))}
            </ul>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <Field id="will-fixed-person" label="Person">
                <Select id="will-fixed-person" value={fixedPerson} onChange={(e) => setFixedPerson(e.target.value)}>
                  <option value="">Choose a person...</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <Field id="will-fixed-amount" label="Amount">
                <Input id="will-fixed-amount" inputMode="decimal" value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} />
              </Field>
              <Button
                size="sm"
                disabled={!fixedPerson || !isAmountText(fixedAmount)}
                onClick={() => {
                  set({ fixedGifts: [...a.fixedGifts, { personId: fixedPerson, amount: normaliseAmountText(fixedAmount) }] });
                  setFixedPerson('');
                  setFixedAmount('');
                }}
              >
                Add amount
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

In `apps/web/src/pages/will/steps/registry.ts` add the imports and entries:
```ts
import { EstateStep } from './EstateStep';
import { AllocationStep } from './AllocationStep';
```
```ts
  estate: EstateStep,
  allocation: AllocationStep,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/will && npx tsc --noEmit && npx eslint src/pages/will`
Expected: PASS; no type or lint errors.

- [ ] **Step 7: Commit**

```bash
cd portfolioos
git add apps/web/src/pages/will
git commit -m "feat(will): assets and allocation steps with exact percentage handling

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Web - Review and Preview steps

**Wave 5** (needs Tasks 5, 9 and 11; uses the API contract of Task 10, which the tests mock).

**Files:**
- Create: `apps/web/src/pages/will/BlocksView.tsx`
- Create: `apps/web/src/pages/will/steps/ReviewStep.tsx`
- Create: `apps/web/src/pages/will/steps/PreviewStep.tsx`
- Modify: `apps/web/src/pages/will/steps/registry.ts` (register `review`, `preview`)
- Test: `apps/web/src/pages/will/BlocksView.test.tsx`, `apps/web/src/pages/will/steps/ReviewStep.test.tsx`, `apps/web/src/pages/will/steps/PreviewStep.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`WillBlock`, `willEstateTotals`, `WILL_DISCLAIMER`, `WILL_ACKNOWLEDGEMENT`, `formatINR`, `formatDateOnly`), Task 4 (`WILL_RULES`), Task 5 (`selectWillTemplate`, `renderWillSummary` - test data only), Task 8 (`willApi.preview`, `willApi.generate`, `willApi.downloadPdf`, `isWillBlocked`), Task 9 (`WillStepProps`, `FindingList`, `Notice`).
- Produces: `BlocksView({ blocks, testId? })`; `ReviewStep`, `PreviewStep` registered in `WILL_STEP_COMPONENTS`.

Behaviour:
- Review: every rule from `WILL_RULES` except the INFO legal-review note is listed with its title and a state - "OK" (no finding), or its finding messages with the severity icon - and a "Fix" link to the rule's step for anything not OK. A header says how many things block the preview. An estate summary (assets, liabilities, net, people, gifts) and the "Legal review recommended" box with `WILL_DISCLAIMER` close the page. The wizard's Next is already disabled while blockers remain (Task 9).
- Preview: flushes pending saves, then loads `GET preview`. Shows the plain-language summary, then the full document. Generating needs the acknowledgement checkbox (`WILL_ACKNOWLEDGEMENT`); it flushes again, posts `generate` with the current revision, and on success shows "Version N is ready" with "Download PDF" and a link back to Will Maker. A 422 `WILL_BLOCKED` shows "Fix the items on the Review step first" with a button to step 7.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/pages/will/BlocksView.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { selectWillTemplate } from '@everypaisa/shared';
import { BlocksView } from './BlocksView';
import { fullPayload, TODAY } from './willTestData';

afterEach(cleanup);

describe('BlocksView', () => {
  it('renders every block of a real will', () => {
    const m = fullPayload();
    render(<BlocksView testId="doc" blocks={selectWillTemplate(m).render(m, { generatedOn: TODAY })} />);
    const doc = screen.getByTestId('doc');
    expect(screen.getByRole('heading', { name: 'LAST WILL AND TESTAMENT' })).toBeTruthy();
    expect(doc.textContent).toContain('1. Declaration');
    expect(doc.textContent).toContain('Equity - My Portfolio');
    expect(doc.textContent).toContain('Witness 2');
    expect(doc.textContent).toContain('Signature of the Testator');
  });
});
```

Create `apps/web/src/pages/will/steps/ReviewStep.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { runWillRules, type WillPayload } from '@everypaisa/shared';
import { ReviewStep } from './ReviewStep';
import type { WillStepProps } from './types';
import { fullPayload, TODAY } from '../willTestData';

afterEach(cleanup);

function setup(payload: WillPayload) {
  const goTo = vi.fn();
  const p: WillStepProps = {
    willId: 'w1', payload, findings: runWillRules(payload, { today: TODAY }), today: TODAY, wide: true, update: vi.fn(),
    refreshEstate: vi.fn(), flush: vi.fn(async () => true), getRevision: () => 0, goTo,
  };
  render(<ReviewStep {...p} />);
  return goTo;
}

describe('ReviewStep', () => {
  it('a complete will is ready, with every check OK and the legal-review box', () => {
    setup(fullPayload());
    expect(screen.getByText(/ready to preview/i)).toBeTruthy();
    expect(screen.getByTestId('check-RESIDUARY_SUMS_100').textContent).toContain('OK');
    expect(screen.getByTestId('check-EXECUTOR_APPOINTED').textContent).toContain('OK');
    expect(screen.getByText(/legal review recommended/i)).toBeTruthy();
    expect(screen.getByText(/not legal advice/i)).toBeTruthy();
    expect(screen.getByTestId('review-net').textContent).toContain('13,50,000');
  });

  it('lists blockers with a link to the step that fixes them', () => {
    const payload = fullPayload();
    payload.roles.executorId = null;
    const goTo = setup(payload);
    expect(screen.getByText(/1 thing to fix before you can preview/i)).toBeTruthy();
    const row = screen.getByTestId('check-EXECUTOR_APPOINTED');
    expect(row.textContent).toContain('Choose an executor');
    fireEvent.click(within(row).getByRole('button', { name: /fix/i }));
    expect(goTo).toHaveBeenCalledWith(3);
  });
});
```

Create `apps/web/src/pages/will/steps/PreviewStep.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { renderWillSummary, runWillRules, selectWillTemplate } from '@everypaisa/shared';
import { renderWithProviders } from '@/pages/split/testUtils';
import { isWillBlocked, willApi } from '@/api/will.api';
import { PreviewStep } from './PreviewStep';
import type { WillStepProps } from './types';
import { fullPayload, TODAY } from '../willTestData';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/will.api', () => ({
  willApi: { preview: vi.fn(), generate: vi.fn(), downloadPdf: vi.fn() },
  isWillBlocked: vi.fn(() => false),
}));

const m = fullPayload();
const previewWire = {
  templateId: 'isa-hindu', templateVersion: 1, generatedOn: TODAY,
  summary: renderWillSummary(m, { generatedOn: TODAY }),
  document: selectWillTemplate(m).render(m, { generatedOn: TODAY }),
};

function setup() {
  const p: WillStepProps = {
    willId: 'w1', payload: m, findings: runWillRules(m, { today: TODAY }), today: TODAY, wide: true, update: vi.fn(),
    refreshEstate: vi.fn(), flush: vi.fn(async () => true), getRevision: () => 7, goTo: vi.fn(),
  };
  renderWithProviders(<PreviewStep {...p} />);
  return p;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(willApi.preview).mockResolvedValue(previewWire);
});
afterEach(cleanup);

describe('PreviewStep', () => {
  it('saves first, then shows the summary and the full will', async () => {
    const p = setup();
    expect(await screen.findByTestId('will-document')).toBeTruthy();
    expect(p.flush).toHaveBeenCalled();
    expect(screen.getByTestId('will-summary').textContent).toContain('will carry out your will as executor');
    expect(screen.getByTestId('will-document').textContent).toContain('LAST WILL AND TESTAMENT');
  });

  it('generates only after the acknowledgement, then offers the PDF', async () => {
    vi.mocked(willApi.generate).mockResolvedValue({
      version: { id: 'v1', willId: 'w1', versionNo: 1, status: 'GENERATED', generatedOn: TODAY, templateId: 'isa-hindu', templateVersion: 1 },
    });
    vi.mocked(willApi.downloadPdf).mockResolvedValue(undefined);
    setup();
    const button = (await screen.findByRole('button', { name: /generate pdf/i })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(willApi.generate).toHaveBeenCalledWith('w1', 7));
    expect(await screen.findByText(/version 1 is ready/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    await waitFor(() => expect(willApi.downloadPdf).toHaveBeenCalledWith('v1', 1));
  });

  it('sends the user back to Review when the server finds a blocker', async () => {
    vi.mocked(willApi.preview).mockRejectedValue(
      new AxiosError('blocked', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 422, data: { details: { reason: 'WILL_BLOCKED', ruleIds: ['EXECUTOR_APPOINTED'] } },
      } as unknown as AxiosResponse),
    );
    vi.mocked(isWillBlocked).mockReturnValue(true);
    const p = setup();
    expect(await screen.findByText(/fix the items on the review step first/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /go to review/i }));
    expect(p.goTo).toHaveBeenCalledWith(7);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/will`
Expected: FAIL - cannot resolve `./BlocksView`, `./ReviewStep`, `./PreviewStep`.

- [ ] **Step 3: Blocks view**

Create `apps/web/src/pages/will/BlocksView.tsx`:
```tsx
import type { WillBlock } from '@everypaisa/shared';

function Block({ b }: { b: WillBlock }) {
  switch (b.t) {
    case 'title':
      return <h2 className="text-center text-lg font-semibold tracking-wide text-foreground">{b.text.toUpperCase()}</h2>;
    case 'heading':
      return <p className="text-center font-medium text-foreground">{b.text}</p>;
    case 'para':
      return <p className="text-foreground">{b.text}</p>;
    case 'note':
      return <p className="text-xs text-muted-foreground">{b.text}</p>;
    case 'clause':
      return (
        <section className="space-y-1">
          <h3 className="font-semibold text-foreground">{b.n}. {b.title}</h3>
          {b.paras.map((p, i) => <p key={i} className="pl-3 text-foreground">{p}</p>)}
        </section>
      );
    case 'table':
      return (
        <div className="space-y-1">
          {b.title && <p className="font-medium text-foreground">{b.title}</p>}
          <dl className="divide-y divide-border/60 rounded-md border border-border/60">
            {b.rows.map(([k, v], i) => (
              <div key={i} className="grid gap-1 px-3 py-2 sm:grid-cols-2">
                <dt className="min-w-0 break-words text-foreground">{k}</dt>
                <dd className="min-w-0 break-words text-muted-foreground sm:text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      );
    case 'signature':
      return <div className="whitespace-pre-line text-foreground">{b.lines.join('\n')}</div>;
    case 'witnesses':
      return (
        <div className="space-y-2">
          <p className="text-foreground">{b.intro}</p>
          {Array.from({ length: b.count }, (_, i) => (
            <div key={i} className="space-y-0.5">
              <p className="font-medium text-foreground">Witness {i + 1}</p>
              {b.fields.map((f) => <p key={f} className="text-muted-foreground">{f}: ____________________</p>)}
            </div>
          ))}
        </div>
      );
  }
}

/** The will's blocks as a readable page - the same blocks the PDF draws. */
export function BlocksView({ blocks, testId }: { blocks: WillBlock[]; testId?: string }) {
  return (
    <div className="space-y-3 break-words text-sm leading-relaxed" data-testid={testId}>
      {blocks.map((b, i) => <Block key={i} b={b} />)}
    </div>
  );
}
```

- [ ] **Step 4: Review step**

Create `apps/web/src/pages/will/steps/ReviewStep.tsx`:
```tsx
import { AlertTriangle, CheckCircle2, Scale, XCircle } from 'lucide-react';
import { formatINR, willEstateTotals, WILL_DISCLAIMER, WILL_RULES } from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { WillStepProps } from './types';

export function ReviewStep({ payload, findings, goTo }: WillStepProps) {
  const blockers = findings.filter((f) => f.severity === 'BLOCKER').length;
  const rules = WILL_RULES.filter((r) => r.id !== 'LEGAL_REVIEW_RECOMMENDED');
  const totals = willEstateTotals(payload.estate.items);
  const money = (d: { toFixed(n: number): string }) => formatINR(d.toFixed(2), { fractionDigits: 0 });
  const a = payload.allocation;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="min-w-0 space-y-3 p-4 sm:p-5">
        <h2 className={cn('text-base font-semibold', blockers ? 'text-negative' : 'text-positive')}>
          {blockers ? `${blockers} ${blockers === 1 ? 'thing' : 'things'} to fix before you can preview` : 'Ready to preview'}
        </h2>
        <ul className="divide-y divide-border/60">
          {rules.map((r) => {
            const hits = findings.filter((f) => f.ruleId === r.id);
            const Icon = hits.length === 0 ? CheckCircle2 : r.severity === 'BLOCKER' ? XCircle : AlertTriangle;
            const tone = hits.length === 0 ? 'text-positive' : r.severity === 'BLOCKER' ? 'text-negative' : 'text-warning';
            return (
              <li key={r.id} data-testid={`check-${r.id}`} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone)} />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{r.title}</p>
                    {hits.length === 0
                      ? <p className="text-xs text-muted-foreground">OK</p>
                      : hits.map((h, i) => <p key={i} className="break-words text-xs text-muted-foreground">{h.message}</p>)}
                  </div>
                </div>
                {hits.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => goTo(r.step)}>Fix</Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="min-w-0 space-y-4">
        <Card tone="muted" className="space-y-2 p-4 text-sm">
          <h2 className="font-semibold text-foreground">Your will at a glance</h2>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
            <dt className="text-muted-foreground">Assets</dt><dd className="text-right tabular-nums text-foreground">{money(totals.assets)}</dd>
            <dt className="text-muted-foreground">Liabilities</dt><dd className="text-right tabular-nums text-foreground">{money(totals.liabilities)}</dd>
            <dt className="text-muted-foreground">Net estate</dt><dd className="text-right tabular-nums text-foreground" data-testid="review-net">{money(totals.net)}</dd>
            <dt className="text-muted-foreground">People named</dt><dd className="text-right text-foreground">{payload.people.length}</dd>
            <dt className="text-muted-foreground">Specific gifts</dt><dd className="text-right text-foreground">{a.specificGifts.length}</dd>
            <dt className="text-muted-foreground">Money gifts</dt><dd className="text-right text-foreground">{a.fixedGifts.length}</dd>
          </dl>
        </Card>
        <Card tone="muted" className="space-y-2 border-warning/40 p-4 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-foreground"><Scale className="h-4 w-4 text-warning" />Legal review recommended</p>
          <p className="text-foreground">{WILL_DISCLAIMER}</p>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Preview step**

Create `apps/web/src/pages/will/steps/PreviewStep.tsx`:
```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CheckCircle2, Download } from 'lucide-react';
import { formatDateOnly, WILL_ACKNOWLEDGEMENT, type WillVersionWire } from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/api/client';
import { isWillBlocked, willApi } from '@/api/will.api';
import { BlocksView } from '../BlocksView';
import { Notice } from '../parts';
import type { WillStepProps } from './types';

export function PreviewStep({ willId, flush, getRevision, goTo }: WillStepProps) {
  const qc = useQueryClient();
  const [ack, setAck] = useState(false);
  const [done, setDone] = useState<WillVersionWire | null>(null);

  const preview = useQuery({
    queryKey: ['will', 'preview', willId],
    queryFn: async () => {
      if (!(await flush())) throw new Error("Couldn't save your latest changes");
      return willApi.preview(willId);
    },
    retry: false,
  });
  const generate = useMutation({
    mutationFn: async () => {
      if (!(await flush())) throw new Error("Couldn't save your latest changes");
      return willApi.generate(willId, getRevision());
    },
    onSuccess: (r) => {
      setDone(r.version);
      void qc.invalidateQueries({ queryKey: ['will', 'overview'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't create your will")),
  });
  const download = useMutation({
    mutationFn: (v: WillVersionWire) => willApi.downloadPdf(v.id, v.versionNo),
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't download the PDF")),
  });

  if (done) {
    return (
      <Card className="space-y-3 p-4 sm:p-5">
        <p className="flex items-center gap-2 text-base font-semibold text-foreground">
          <CheckCircle2 className="h-5 w-5 text-positive" />Version {done.versionNo} is ready
        </p>
        <p className="text-sm text-muted-foreground">Generated on {formatDateOnly(done.generatedOn)}.</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
          <li>Have it reviewed by a qualified advocate.</li>
          <li>Print it and sign every page in front of two adult witnesses who are not beneficiaries; they sign too.</li>
          <li>Registration with the sub-registrar is optional.</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button disabled={download.isPending} onClick={() => download.mutate(done)}>
            <Download className="mr-1 h-4 w-4" />Download PDF
          </Button>
          <Button variant="outline" asChild><Link to="/will">Back to Will Maker</Link></Button>
        </div>
      </Card>
    );
  }

  if (preview.isLoading) return <p className="text-sm text-muted-foreground">Preparing your preview...</p>;
  if (preview.isError || !preview.data) {
    return isWillBlocked(preview.error) ? (
      <Notice tone="warning">
        <p>Fix the items on the Review step first.</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => goTo(7)}>Go to Review</Button>
      </Notice>
    ) : (
      <Notice tone="warning">{apiErrorMessage(preview.error, "Couldn't prepare the preview")}</Notice>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <Card tone="muted" className="p-4 sm:p-5">
        <BlocksView testId="will-summary" blocks={preview.data.summary} />
      </Card>
      <Card className="bg-card p-4 sm:p-8">
        <BlocksView testId="will-document" blocks={preview.data.document} />
      </Card>
      <Card className="space-y-3 p-4 sm:p-5">
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>{WILL_ACKNOWLEDGEMENT}</span>
        </label>
        <Button disabled={!ack || generate.isPending} onClick={() => generate.mutate()}>
          {generate.isPending ? 'Generating...' : 'Generate PDF'}
        </Button>
      </Card>
    </div>
  );
}
```

In `apps/web/src/pages/will/steps/registry.ts` add:
```ts
import { ReviewStep } from './ReviewStep';
import { PreviewStep } from './PreviewStep';
```
```ts
  review: ReviewStep,
  preview: PreviewStep,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/will && npx tsc --noEmit && npx eslint src/pages/will src/api/will.api.ts`
Expected: PASS; no type or lint errors.

- [ ] **Step 7: Commit**

```bash
cd portfolioos
git add apps/web/src/pages/will
git commit -m "feat(will): review checks and preview with PDF generation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Full verification and browser check

**Wave 6** (after everything).

**Files:**
- No new source files. A defect found here is fixed in the file that owns it, with a test that fails first, in its own commit.

- [ ] **Step 1: Every new and touched API suite in ONE vitest run**

Run:
```bash
cd portfolioos && pnpm --filter @everypaisa/shared build
cd packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/will test/routes/will.routes.test.ts test/routes/willGenerate.routes.test.ts test/invariants/user-scoped-coverage.test.ts test/invariants/rls-context-coverage.test.ts test/invariants/rls-isolation.test.ts test/invariants/rls-delete-audit.test.ts test/services/accountDeletion.test.ts test/split/accountDeletion.split.test.ts test/services/receipts.test.ts test/services/aiNetWorthFamily.test.ts test/security/family-visibility.test.ts test/services/family/crossFamilyBleed.test.ts test/services/loanPaymentSplit.test.ts src/services/loanMath.test.ts src/controllers/document.onlyofficeCallback.test.ts test/routes/emi.routes.test.ts
npx tsc --noEmit && npx tsc -p tsconfig.scripts.json --noEmit
npx eslint src/services/will src/controllers/will.controller.ts src/routes/will.routes.ts src/services/document.service.ts src/controllers/document.controller.ts src/services/loans.service.ts src/services/loansGiven.service.ts src/services/dashboard.service.ts src/services/accountDeletion.service.ts src/lib/audit.ts src/lib/prisma.ts
```
Expected: all PASS in the single run (no cross-file leaks); no type errors; no lint errors (pre-existing warnings in untouched lines are not this plan's).

- [ ] **Step 2: Shared and web**

Run:
```bash
cd portfolioos/packages/shared && npx vitest run && npx tsc --noEmit
cd ../../apps/web
npx vitest run src/pages/will src/components/layout src/components/common
npx vitest run
npx tsc --noEmit
npx eslint src/pages/will src/api/will.api.ts src/components/layout/navItems.tsx src/App.tsx
```
Expected: all PASS (the whole web suite once); no type or lint errors.

- [ ] **Step 3: Encoding and dash check on every changed file**

Run:
```bash
cd portfolioos
for f in $(git diff --name-only --diff-filter=d 70bc3ee1...HEAD -- . ':!*.ttf'); do iconv -f UTF-8 -t UTF-8 "$f" >/dev/null || echo "BAD $f"; done
git diff 70bc3ee1...HEAD -- '*.ts' '*.tsx' '*.sql' | grep -nP '^\+.*[\x{2013}\x{2014}\x{2212}]' || echo "no en/em dashes or minus signs added"
```
Expected: no `BAD` lines; the second command prints `no en/em dashes or minus signs added`. (Compare against `70bc3ee1`, the branch base; a local `main` ref may be stale.)

- [ ] **Step 4: Local account on PLUS (isolated DB only)**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split npx tsx -e "import('@prisma/client').then(async ({ PrismaClient }) => { const p = new PrismaClient(); const r = await p.user.updateMany({ where: { email: 'loancheck-final@example.com' }, data: { plan: 'PLUS' } }); console.log('updated', r.count); await p.\$disconnect(); })"
```
Expected: `updated 1`. If it prints `updated 0`, the account does not exist in `portfolioos_split`: record that in `BLOCKED.md` and stop the browser check. Never run this against any other database.

- [ ] **Step 5: Start the servers (note every PID you start)**

```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split PORT=3020 RIA_VERDICTS_ENABLED=false ENABLE_LOAN_RATES_CRON=false ENABLE_STARTUP_SYNC=false ENABLE_ALERT_CRONS=false ENABLE_MAILBOX_POLLER=false ENABLE_PRICE_CRONS=false ENABLE_MF_BOOTSTRAP=false npx tsx src/index.ts
```
(run in the background), and in `portfolioos/apps/web`: `npx vite --port 3030` (background; it proxies `/api` to `:3020`). `APP_ENCRYPTION_KEY` must be set for the API (it is in the developer's local env); without it every will endpoint answers 503 `WILL_KEYS_UNAVAILABLE`, which is the intended behaviour, not a bug. Open `http://localhost:3030`, sign out if signed in, then sign in as `loancheck-final@example.com` / `LoanCheck#2026` so the token carries PLUS.

- [ ] **Step 6: Walk the wizard (1280 px, light theme)**

1. Sidebar: "Will Maker" sits right after Goals. `/will` shows "Not created", the three estate tiles (indicative), "Key things to prepare", "About 15-20 minutes" and the disclaimer.
2. Create my will -> Your details. Fill: name `Asha Rao`, DOB `15/05/1975`, India, Hindu, an address, Married, children Yes. Pick "Muslim" once: the one-third explanation appears; pick "Another country" once: the "consult a lawyer" note appears; set both back.
3. People & roles: add a spouse (adult), a daughter born `01/01/2016`, and under Others a charity; use a family quick-pick chip if the account has family members. Executor tab: only adults are offered; choose the spouse and a back-up. Guardian tab: asks for a guardian (minor daughter); choose the spouse.
4. Assets & liabilities: fetched automatically on first open; "As of dd/mm/yyyy" shows today. Confirm one item, exclude one, set one to Joint 50 %, add "Gold coins" 75,000 by hand. Refresh: your confirm/exclude/joint choices survive.
5. Allocate: add the spouse and daughter, Split equally -> 50/50 and "Total 100.00%" in green; add the charity, Split equally -> 33.34/33.33/33.33, still 100.00 %; type `33.333` in a share: the hint shows and nothing saves. Add a specific gift (Gold coins -> daughter) and a fixed amount (25,000 to the charity). Excluded items and liabilities are not offered as gifts.
6. Instructions: type a wish; the counter moves.
7. Two tabs: open the same draft URL in a second tab, change the instructions in tab A, then change them in tab B: tab B shows the "changed in another tab" banner and "Not saved"; Reload brings tab B up to date.
8. Review: every check listed; the minor-beneficiary warning shows; "Legal review recommended" box present; Next is enabled (no blockers). Clear the executor in People once: Review shows "1 thing to fix", its Fix button jumps to People, Next on Review is disabled; set the executor back.
9. Preview: the plain-language summary, then the full will (dd/mm/yyyy dates, ₹ amounts, guardian clause, joint-assets clause, schedule, signature and two witness blocks). Generate PDF is disabled until the acknowledgement is ticked. Generate -> "Version 1 is ready" -> Download PDF: the file opens; every page has the signature line, "Page x of y" and the disclaimer footer; the ₹ sign renders.
10. Back on `/will`: status "Generated", the versions list, Download works. "Start a new version" opens a version 2 draft with the same content; go back and discard it.
11. Documents vault: the will PDF is listed; deleting or renaming it there is refused with "Will documents are managed by Will Maker".
12. Plan gate: set the account to FREE with the Step 4 script (`plan: 'FREE'`), sign out and in: `/will` shows "Will Maker is locked" and no will request is made. Set it back to PLUS and sign in again.

- [ ] **Step 7: 375 px, both themes**

At 375 px wide in light and dark: overview and every wizard step (including the estate cards, the allocation tabs and donut, the review list and the preview document) have no sideways page scroll - check `document.documentElement.scrollWidth <= window.innerWidth` on each - and the stepper reads "Step x of 8". At 1280 px the stepper shows all eight steps and the estate step shows a table. Screenshot every section of every step, scrolling the full page, at 375 px (light and dark) and the overview, estate, allocation and preview at 1280 px; save them under `.superpowers/sdd/will-maker-part1/screens/`.

- [ ] **Step 8: Audit trail holds no personal data**

```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split npx tsx -e "import('@prisma/client').then(async ({ PrismaClient }) => { const p = new PrismaClient(); const u = await p.user.findUniqueOrThrow({ where: { email: 'loancheck-final@example.com' } }); const rows = await p.auditLog.findMany({ where: { userId: u.id, action: { startsWith: 'will_' } }, orderBy: { createdAt: 'asc' } }); console.log(JSON.stringify(rows.map((r) => [r.action, r.resource, r.metadata]))); await p.\$disconnect(); })"
```
Expected: `will_created`, `will_viewed`, `will_generated` (metadata `acknowledged: true`), `will_downloaded`, `will_discarded`; no names, addresses or amounts anywhere in the output.

- [ ] **Step 9: Stop the servers and commit any fixes**

Stop only the PIDs you started in Step 5. Commit each fix found during this task separately (with its test, trailer as usual). If nothing needed fixing, there is nothing to commit.

---

## Spec conflicts and notes for the reviewer

- **Step numbering.** The design's `currentStep @default(1)` would point a resumed draft at the overview. Step 1 is the overview page, so the default is 2 (Ruling 1).
- **`maskedRef` became `ref`.** A will has to identify a vehicle, so the registration plate is printed in full; account-type identifiers stay masked because the app only holds their last four in clear (Ruling 4).
- **Contingent beneficiary placement.** The design had both `people[].contingentForId` and `residuary[].contingentId`. One field on the person (`contingentId`, "if they die before me, their gifts go to") covers residuary shares, specific gifts and money gifts without the two disagreeing (Ruling 3).
- **Preview source.** The design puts the template in shared "so web preview == PDF text". The web shows the API's preview (rendered by that same shared template from the saved draft) rather than rendering locally, so the preview can never show unsaved or unvalidated content (Ruling 12).
- **Extra rules.** `DANGLING_REFERENCE` and `ESTATE_SOURCE_FAILED` were added; the design's "failed adapter -> ESTATE_SOURCE_FAILED warning finding" needed a stored list (`estate.failedSources`) to survive reloads (Ruling 9).
- **shared had no zod.** The design puts zod schemas in shared; shared only depended on decimal.js. zod `^3.23.8` is added, the version api and web already use (Ruling 18).
- **Template lock location.** shared has no Node types, so the lock writer and check live in the API package (Ruling 15).
- **Legacy branch overlap.** `feat/legacy-transfer` is expected to touch the same shared lists: `AuditAction` (`lib/audit.ts`), `USER_SCOPED_MODELS` (`lib/prisma.ts`), `User` relations and the end of `schema.prisma`, `purgeUser`, `FEATURE_MIN_TIER`, `routes/index.ts`, `navItems.tsx`, `App.tsx`. Expect small textual merge conflicts there; keep both sides. Migration order is safe (`20261013120000` < `20261014110000` < `20261014120000`).
- **Release gate (owner action, outside this plan):** the template text (`common.v1.ts`, `isaHindu.v1.ts`, `isaGeneral.v1.ts`, `summary.v1.ts`) must be reviewed by a qualified Indian advocate before launch; any wording change then lands as `*.v2.ts` with a new lock entry.
- **Production migration** is a separate, owner-approved step after merge (with `DIRECT_URL` overridden too).
