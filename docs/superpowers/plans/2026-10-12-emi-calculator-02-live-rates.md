# EMI Calculator - Plan 2 (Live rates) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daily-refreshed indicative loan rates (RBI repo, lender MCLR, per-lender product ranges) read from real bank pages, an admin page to correct them, and a **Live rates** tab on `/emi` whose **Use this rate** fills the calculator.

**Architecture:** Fifteen page readers (pure `html -> RateReading[]`, cheerio, golden-tested on the real pages saved during discovery) feed a daily job that fetches only code-listed URLs, applies sanity and as-of rules, and appends to three global tables (`LoanRateSource`, `LoanRate`, `BenchmarkRate`). The effective rate per (source, tenor) is the latest MANUAL row if one is active, else the latest AUTO row. A public authenticated `GET /api/loan-rates` feeds the new tab; `/api/admin/loan-rates` (ADMIN + second factor, every write audited) feeds Settings -> Loan rates.

**Tech Stack:** cheerio 1.2 (already in `packages/api`), decimal.js, Prisma 5 + PostgreSQL, node-cron, Express + zod, vitest, React 18 + @tanstack/react-query + shadcn-style UI.

**Spec:** `portfolioos/docs/superpowers/specs/2026-10-12-emi-calculator-design.md` (§5 Live rates, §2 delivery table, §7-§9 rows for Plan 2). Discovery evidence: `.superpowers/sdd/emi-rates-discovery/report.md` and its `fixtures/`. Plan 1 (`2026-10-12-emi-calculator-01-calculator.md`) is the page shell this plan extends.

## Global Constraints

- Scope is spec §5 only. Plan 1's maths and Calculate/Compare tabs are unchanged except: a third tab **Live rates**, and **Use this rate** setting `CalcState.ratePct` (and `loanKind` for tax defaults) then switching to Calculate.
- `LoanRateSource`, `LoanRate`, `BenchmarkRate` are global reference data: no `userId`, no RLS policy, never in `USER_SCOPED_MODELS`.
- Rates are `Decimal` (decimal.js / `Prisma.Decimal`) in code and decimal **strings** on the wire (`"8.50"`, at least 2 dp). Never `Number`/`parseFloat` on a rate.
- Fetching: URLs only from the code-defined reader list (allow-list, no user-supplied URL), robots.txt `User-agent: *` honoured (4xx robots = allow, 5xx = skip this run), 15 s timeout, 2 MB body cap, redirects at most 3 and only to the same host, `User-Agent: EveryPaisa/1.0 (loan-rate reader; one request per page per day)`. Pages are parsed as markup with cheerio; scripts are removed, never run.
- Sanity (AUTO readings only): min outside 4-30 % -> SUSPECT; max below min or above 40 % -> SUSPECT; |min - last ACTIVE AUTO min| > 2 pp for the same (source, tenor) -> SUSPECT; page as-of date more than 7 days in the future, or older than 180 days (MCLR) / 400 days (products) -> SUSPECT. SUSPECT rows are never shown to users.
- History is append-only. A reading identical to the latest AUTO row (min, max, effectiveDate, basis) inserts nothing. A new ACTIVE AUTO row supersedes earlier ACTIVE AUTO rows for the same (source, tenor); a SUSPECT row supersedes nothing.
- Effective rate per (source, tenor): latest MANUAL ACTIVE, else latest AUTO ACTIVE. Basis is an attribute of the rate, not part of the override key.
- Failures never stop the run: exception, zero readings, or a source missing from its page -> `IngestionFailure` row (owned by the oldest active ADMIN, raw payload = URL + source ids + HTML excerpt truncated to 8192 bytes) and `LoanRateSource.lastErrorAt/lastError`; the last good rate stays displayed.
- Stale: an AUTO source whose `lastSuccessAt ?? createdAt` is more than 7 days old is shown with `stale: true`, and the run raises one `CUSTOM` ops alert per IST day to the ops admin.
- Job: daily 07:30 Asia/Kolkata, registered in `src/index.ts` (moved there from `startupSync.ts` in the Task 8 review so `ENABLE_STARTUP_SYNC` does not gate it), disabled only by `ENABLE_LOAN_RATES_CRON=false` (default on; the test env sets `false`).
- Admin API: `authenticate` + `requireRole('ADMIN')` + `requireSecondFactor('admin tools')` on the router; every write -> `AuditLog` action `loan_rate_manual_set` | `loan_rate_override_cleared` | `loan_rate_suspect_approved` | `loan_rate_suspect_rejected` | `loan_rate_run_now`.
- Migration: only against the isolated local DB with BOTH overrides, exactly `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split npx prisma migrate dev --name emi_loan_rates` (from `portfolioos/packages/api`). Never use `packages/api/.env`. No production migration in this plan.
- API tests run with `DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false`. The loan-rate test suites own the three loan-rate tables in that local DB and clear them.
- Fixtures are real pages only (from discovery), stored with `<script>`/`<style>`/`<noscript>`/`<svg>`/`<iframe>`/comments removed (readers remove the same before parsing; the Next.js `self.__next_f.push` payload LIC needs is kept). No synthetic pages.
- Dates shown dd/mm/yyyy via `formatDateOnly` (calendar dates) / `formatDateIST` / `formatDateTimeIST` (instants) from `@everypaisa/shared`. New code strings use plain `-`, not en/em dashes.
- Commits: Conventional Commits, each ending with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push. Check every changed text file with `iconv -f UTF-8 -t UTF-8 <file> >/dev/null`.

## Rulings made while writing this plan

1. **Readers are per page, not per source.** One fetch of a page can feed several sources (SBI's MCLR page also carries the site-wide headline widget; Kotak's rates table has six products). `LoanRateSource.adapter` names the page reader. 15 readers, 30 AUTO sources, 62 MANUAL sources (92 total incl. `rbi.repo`). Spec s5.2 says "one file per source"; readers are grouped one file per lender (`hdfc.ts` holds the home-page and rates-page readers), which keeps a lender's page quirks together.
2. **AUTO set (narrower than discovery's "~32"):** SBI LAP (rate = 1Y MCLR + spread), BoB product spreads (effective column is a "0.00%" placeholder and BRLLR is self-contradictory), ICICI's unlabelled 10.85-12.50 table (probably LAP, unconfirmed) and ICICI CAR (robots disallows `/cars/*`) are MANUAL. Kotak EDUCATION is AUTO (the loans table has "Educational Loan 11% - 17%"). HDFC HOME comes from the home-loan page (8.00-13.45); the hdfc.bank.in carousel's 7.90 contradicts it and is ignored.
3. **Fixture counts.** Discovery saved one capture per page. Real fixtures per reader: `sbi.rates` 4 (the headline widget is on all four SBI pages), `hdfc.home` 2, `kotak.rates` 2 (the MCLR page repeats the loans table), every other reader 1. Spec §9 asks for >= 5 per AUTO reader; that is not reachable without inventing pages, which the spec also forbids. Each reader is golden-tested on every real capture that contains its content, plus negative tests on other real captures. More captures are added later with the same sanitize script; no synthetic page is ever added.
4. **RBI sector WALR is not built.** Discovery: the sector tables exist only in a PDF behind an F5 bot challenge, and DBIE is an SPA. With no AUTO source, the spec's "monthly RBI sector read" has nothing to read; no WALR source rows are created.
5. **Repo change date.** rbi.org.in shows the repo rate without a date. `BenchmarkRate` gets a row only when the rate changes, dated with the reading's `effectiveDate` or, when the page has none, the IST date the change was first seen. `lastChange` in the API compares the two newest rows; with one row it is `null`.
6. **Columns added to the spec's models:** `LoanRateSource.createdAt` (needed for "no success for 7 days" on a never-successful source) and `LoanRate.sourceAdapter` / `sourceAdapterVer` (CLAUDE.md §3.4: every row carries the adapter and version that produced it).
7. **Sanity on the max.** The spec's 4-30 % range applies to `minRatePct` (the figure users get). `maxRatePct` may go to 40 % because lender ceilings exceed 30 % (Kotak business 30.50 %); max below min is SUSPECT.
8. **As-of guard ages:** 180 days for MCLR (banks reset at least half-yearly), 400 days for product sheets (SBI's education/LAS widgets are dated 15.12.2025 and still current), 7 days of future slack. Readings with no page date skip the age check.
9. **Manual entries are not sanity-checked** (admin is the authority) but are validated: rates 0.01-50, max >= min, MCLR sources require a tenor, other sources forbid one, note 3-500 chars. A manual entry on a REPO or MCLR source also writes `BenchmarkRate`.
10. **Clearing an override** marks the MANUAL rows `SUPERSEDED` (the spec's status list has no CLEARED); the audit row records that it was a clear.
11. **Stale display:** only AUTO-origin effective rows can be stale. A MANUAL row is shown with its entry date as "as of" and is never flagged; the admin owns it.
12. **"Run now":** a single source runs that source's page reader and returns the result; "all" starts the job in the background (single-flight with the cron) and answers 202. Limited to 3 requests a minute per admin.
13. **Settings -> Loan rates** is a route `/settings/loan-rates` with a link card on the Settings page shown only to ADMIN users; the server gate is what matters.
14. **Use this rate** sets `ratePct` to the row's `minRatePct`; `loanKind` becomes `HOME_SELF` for HOME (kept as `HOME_LET_OUT` if already chosen), `EDUCATION` for EDUCATION, `NONE` otherwise. Tax stays off unless the user had it on.

## Review Focus

1. **A lender page loses part of its content** (e.g. SBI's widget drops "Gold Loan", or the SBI page is served without its MCLR table) -> the sources still on the page update, the missing ones get `lastError` and one DLQ row, and their last good rate stays visible; nothing is deleted. Test in Task 8 (`partial page`).
2. **The same page read twice in one day** (cron plus an admin "Run now") -> no second `LoanRate` row and no second `BenchmarkRate` row. Test in Task 7 (`identical reading`) and Task 8 (`second run is a no-op`).
3. **An admin override while the bank page keeps publishing a different number** -> users keep seeing the MANUAL rate; the admin listing shows both with `differs: true`; clearing the override brings the AUTO rate back. Test in Task 10.
4. **The repo rate unchanged for months, then cut** -> exactly one `BenchmarkRate` row per change; `lastChange` is `null` with one row and the signed delta (`"-0.25"`) after a cut. Test in Task 9.
5. **Rates API failing or empty** -> the Live rates tab shows "Rates not available yet", and the Calculate tab keeps working. Test in Task 11.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/loans/loanRates.ts` | Loan types, bases, tenors, labels, wire types shared by API and web |
| `packages/api/scripts/sanitize-loan-rate-fixtures.mjs` | Copy real discovery captures into the repo without scripts/styles |
| `packages/api/test/fixtures/loanRates/*` | 20 real pages + 4 real robots.txt files |
| `packages/api/src/services/loanRates/types.ts` | `RateReading`, `PageReader` |
| `packages/api/src/services/loanRates/sources/parseUtil.ts` | Percent/date/table/MCLR helpers used by every reader |
| `packages/api/src/services/loanRates/sources/rbi.ts`, `sbi.ts`, `psuMclr.ts` | RBI repo; SBI MCLR + headline widget; PNB, BoB, Union MCLR |
| `packages/api/src/services/loanRates/sources/hdfc.ts`, `icici.ts`, `axis.ts` | Private-bank home/personal/car/MCLR readers |
| `packages/api/src/services/loanRates/sources/kotak.ts`, `canara.ts`, `lic.ts` | Kotak loans table, Canara contracted ranges, LIC Next.js payload |
| `packages/api/src/services/loanRates/sources/index.ts` | `PAGE_READERS`, `readerById` |
| `packages/api/src/services/loanRates/robots.ts`, `fetchPage.ts` | robots.txt rules; allow-listed capped fetch |
| `packages/api/src/services/loanRates/sourceList.ts` | The 92 sources (code is the source of truth), `ensureLoanRateSources` |
| `packages/api/src/services/loanRates/sanity.ts` | `checkReading`, `istDate`, `isSourceStale` (pure) |
| `packages/api/src/services/loanRates/store.ts` | Append/supersede, benchmark writes, effective-rate selection |
| `packages/api/src/jobs/loanRatesJob.ts` | Daily run, DLQ, stale alert, cron |
| `packages/api/src/services/loanRates/loanRates.service.ts` | Public listing + repo summary |
| `packages/api/src/services/loanRates/admin.service.ts` | Admin listing, manual set/clear, approve/reject, run now |
| `packages/api/src/controllers/loanRates.controller.ts` | Public + admin handlers, audit writes |
| `packages/api/src/routes/loanRates.routes.ts`, `adminLoanRates.routes.ts` | Routers |
| `apps/web/src/api/loanRates.api.ts` | Web client |
| `apps/web/src/pages/emi/liveRates.ts`, `LiveRatesTab.tsx` | Tab logic and UI |
| `apps/web/src/pages/settings/LoanRatesAdminPage.tsx` | Admin page |

---

### Task 1: Shared vocabulary, real fixtures and parse helpers

**Files:**
- Create: `packages/shared/src/loans/loanRates.ts`
- Modify: `packages/shared/src/loans/index.ts` (add `export * from './loanRates.js';`)
- Create: `packages/api/scripts/sanitize-loan-rate-fixtures.mjs`
- Create (generated by the script): `packages/api/test/fixtures/loanRates/` - 20 `.html` + 4 `robots-*.txt`
- Create: `packages/api/src/services/loanRates/types.ts`, `packages/api/src/services/loanRates/sources/parseUtil.ts`
- Test: `packages/api/test/loanRates/parseUtil.test.ts`

**Interfaces:**
- Produces (shared, exported from `@everypaisa/shared`): `RATE_LOAN_TYPES`, `type RateLoanType`, `RATE_LOAN_TYPE_LABELS`, `RATE_BASES`, `type RateBasis`, `RATE_BASIS_LABELS`, `MCLR_TENORS`, `type MclrTenor`, `MCLR_TENOR_LABELS`, `type RateOrigin`, `type RateStatus`, `type RateSourceMode`, `isRateLoanType(v): v is RateLoanType`, `LoanRateRowWire`, `RepoRateWire`, `LoanRatesWire`, `LoanRateReadingWire`, `AdminRateKeyWire`, `AdminLoanRateSourceWire`, `ManualRateInputWire` (full text below).
- Produces (api `services/loanRates/types.ts`): `type SourceLoanType = RateLoanType | 'MCLR' | 'REPO'`, `interface RateReading { sourceId: string; basis: RateBasis; tenor: MclrTenor | null; minRatePct: string; maxRatePct: string | null; effectiveDate: string | null; note?: string }`, `interface PageReader { id: string; version: string; url: string; read(html: string): RateReading[] }`.
- Produces (api `sources/parseUtil.ts`): `loadPage(html): CheerioAPI`, `clean(s)`, `normPct(raw): string`, `percents(text): string[]`, `percentRange(text): { min: string; max: string } | null`, `minMax(values: string[]): { min: string; max: string } | null`, `datesIn(text): string[]`, `latestDate(text): string | null`, `interface PageTable { rows: string[][]; before: string }`, `pageTables($, contextChars = 300): PageTable[]`, `tableText(t)`, `tenorOf(label): MclrTenor | null`, `cellRate(text): string | null`, `interface MclrRow { tenor: MclrTenor; ratePct: string }`, `findMclr(tables): { rows: MclrRow[]; effectiveDate: string | null } | null`, `mclrReadings(sourceId, tables): RateReading[]`.
- Produces (fixtures): `packages/api/test/fixtures/loanRates/{rbi-home,sbi-mclr,sbi-eblr,sbi-LAP,sbi-rates-index,hdfc-HOME,hdfc-HOME2,hdfc-rates,icici-HOME,icici-PERSONAL,icici-rates,axis-HOME,axis-MCLR,kotak-rates,kotak-MCLR,pnb-MCLR,bob-retail,union-loans,canara-RANGE,lic-HOME}.html`, `robots-{icici.bank.in,sbi.bank.in,hdfc.bank.in,www.rbi.org.in}.txt`.

- [ ] **Step 1: Add the shared vocabulary**

`packages/shared/src/loans/loanRates.ts`:
```ts
/**
 * Live loan rates (EMI calculator plan 2, spec s5): the vocabulary and wire shapes shared by the API and the
 * web page. Rates are decimal strings ("8.50") on the wire, never numbers.
 */

export const RATE_LOAN_TYPES = ['HOME', 'CAR', 'TWO_WHEELER', 'PERSONAL', 'EDUCATION', 'GOLD', 'LAP', 'LAS', 'BUSINESS'] as const;
export type RateLoanType = (typeof RATE_LOAN_TYPES)[number];

export const RATE_LOAN_TYPE_LABELS: Record<RateLoanType, string> = {
  HOME: 'Home',
  CAR: 'Car',
  TWO_WHEELER: 'Two-wheeler',
  PERSONAL: 'Personal',
  EDUCATION: 'Education',
  GOLD: 'Gold',
  LAP: 'Loan against property',
  LAS: 'Loan against securities',
  BUSINESS: 'Business',
};

export const RATE_BASES = ['REPO_LINKED', 'MCLR', 'FIXED', 'OTHER'] as const;
export type RateBasis = (typeof RATE_BASES)[number];

export const RATE_BASIS_LABELS: Record<RateBasis, string> = {
  REPO_LINKED: 'Repo-linked',
  MCLR: 'MCLR',
  FIXED: 'Fixed',
  OTHER: 'Other',
};

export const MCLR_TENORS = ['ON', '1M', '3M', '6M', '1Y'] as const;
export type MclrTenor = (typeof MCLR_TENORS)[number];

export const MCLR_TENOR_LABELS: Record<MclrTenor, string> = {
  ON: 'Overnight',
  '1M': '1 month',
  '3M': '3 months',
  '6M': '6 months',
  '1Y': '1 year',
};

export type RateOrigin = 'AUTO' | 'MANUAL';
export type RateStatus = 'ACTIVE' | 'SUSPECT' | 'REJECTED' | 'SUPERSEDED';
export type RateSourceMode = 'AUTO' | 'MANUAL';

export function isRateLoanType(value: unknown): value is RateLoanType {
  return typeof value === 'string' && (RATE_LOAN_TYPES as readonly string[]).includes(value);
}

/** One lender's effective rate for one loan type (GET /api/loan-rates). */
export interface LoanRateRowWire {
  sourceId: string;
  lender: string;
  loanType: RateLoanType;
  basis: RateBasis;
  minRatePct: string;
  maxRatePct: string | null;
  /** 'YYYY-MM-DD' as stated on the lender page, when it states one. */
  effectiveDate: string | null;
  /** ISO instant: last successful read (AUTO) or when the admin entered it (MANUAL). */
  asOf: string;
  stale: boolean;
  sourceUrl: string;
  origin: RateOrigin;
}

export interface RepoRateWire {
  ratePct: string;
  effectiveDate: string;
  /** Null until a second, different repo rate has been recorded. deltaPct is signed: "-0.25" is a cut. */
  lastChange: { deltaPct: string; date: string } | null;
}

export interface LoanRatesWire {
  loanType: RateLoanType;
  rows: LoanRateRowWire[];
  repo: RepoRateWire | null;
}

export interface LoanRateReadingWire {
  id: string;
  sourceId: string;
  basis: RateBasis;
  tenor: MclrTenor | null;
  minRatePct: string;
  maxRatePct: string | null;
  effectiveDate: string | null;
  fetchedAt: string;
  origin: RateOrigin;
  status: RateStatus;
  note: string | null;
  sourceAdapter: string | null;
  sourceAdapterVer: string | null;
}

/** One (source, tenor) as the admin sees it. Products have a single key with tenor null. */
export interface AdminRateKeyWire {
  tenor: MclrTenor | null;
  effective: LoanRateReadingWire | null;
  latestAuto: LoanRateReadingWire | null;
  manual: LoanRateReadingWire | null;
  /** A MANUAL override is active and the latest AUTO reading says something else. */
  differs: boolean;
}

export interface AdminLoanRateSourceWire {
  id: string;
  lender: string;
  /** A RateLoanType, or 'MCLR' / 'REPO'. */
  loanType: string;
  url: string;
  mode: RateSourceMode;
  adapter: string | null;
  adapterVer: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  stale: boolean;
  keys: AdminRateKeyWire[];
  suspects: LoanRateReadingWire[];
}

export interface ManualRateInputWire {
  basis: RateBasis;
  tenor?: MclrTenor | null;
  minRatePct: string;
  maxRatePct?: string | null;
  effectiveDate?: string | null;
  note: string;
}
```

`packages/shared/src/loans/index.ts`: append

```ts
export * from './loanRates.js';
```

Run: `cd portfolioos && pnpm --filter @everypaisa/shared build`
Expected: build succeeds (no name collisions; if one is reported, the colliding name already exists in another barrel - rename the new export with a `Rate` prefix and update this plan's later tasks accordingly).

- [ ] **Step 2: Copy the real captures into the repo**

`packages/api/scripts/sanitize-loan-rate-fixtures.mjs`:
```js
// Copy real loan-rate page captures into the repo fixture directory.
//
// Drops <script> (except Next.js `self.__next_f.push(...)` payloads, which the LIC reader parses as data),
// <style>, <noscript>, <svg>, <iframe> and HTML comments. The readers remove the same elements before
// parsing, so reader output is identical on the raw and the sanitized page; the files shrink, and no
// third-party keys embedded in page scripts reach git. Nothing else is changed: these stay real pages.
//
// Usage: node scripts/sanitize-loan-rate-fixtures.mjs <captureDir> <fixtureDir> [name.html ...]
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const [src, dest, ...names] = process.argv.slice(2);
if (!src || !dest) {
  console.error('usage: node scripts/sanitize-loan-rate-fixtures.mjs <captureDir> <fixtureDir> [name.html ...]');
  process.exit(2);
}

const DEFAULT_FILES = [
  'rbi-home.html', 'sbi-mclr.html', 'sbi-eblr.html', 'sbi-LAP.html', 'sbi-rates-index.html',
  'hdfc-HOME.html', 'hdfc-HOME2.html', 'hdfc-rates.html', 'icici-HOME.html', 'icici-PERSONAL.html',
  'icici-rates.html', 'axis-HOME.html', 'axis-MCLR.html', 'kotak-rates.html', 'kotak-MCLR.html',
  'pnb-MCLR.html', 'bob-retail.html', 'union-loans.html', 'canara-RANGE.html', 'lic-HOME.html',
  'robots-icici.bank.in.txt', 'robots-sbi.bank.in.txt', 'robots-hdfc.bank.in.txt', 'robots-www.rbi.org.in.txt',
];

export function sanitizePage(raw) {
  return raw
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (whole, body) => (body.trim().startsWith('self.__next_f.push(') ? whole : ''))
    .replace(/<(style|noscript|svg|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

mkdirSync(dest, { recursive: true });
for (const name of names.length > 0 ? names : DEFAULT_FILES) {
  if (!name.endsWith('.html')) {
    copyFileSync(join(src, name), join(dest, name));
    continue;
  }
  const raw = readFileSync(join(src, name), 'utf8');
  const out = sanitizePage(raw);
  writeFileSync(join(dest, name), out);
  console.log(`${name}: ${raw.length} -> ${out.length} chars`);
}
```

Run:
```bash
cd portfolioos/packages/api
node scripts/sanitize-loan-rate-fixtures.mjs ../../../.superpowers/sdd/emi-rates-discovery/fixtures test/fixtures/loanRates
ls test/fixtures/loanRates | wc -l
grep -liE "AIza[0-9A-Za-z_-]{20,}|sk_live_|-----BEGIN" test/fixtures/loanRates/* || echo "no key-like strings"
```
Expected: 20 lines `name: <raw> -> <smaller> chars`, `24` files, `no key-like strings` (the repo's gitleaks CI must stay green; if anything matches, stop and report it rather than editing the page).

- [ ] **Step 3: Write the failing tests**

`packages/api/test/loanRates/parseUtil.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  cellRate, datesIn, findMclr, latestDate, loadPage, minMax, normPct, pageTables, percentRange, percents, tenorOf,
  type PageTable,
} from '../../src/services/loanRates/sources/parseUtil.js';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/loanRates/${name}`, import.meta.url), 'utf8');

describe('numbers', () => {
  it('normalises to at least two decimals without losing a third', () => {
    expect([normPct('8'), normPct('7.9'), normPct('8.125')]).toEqual(['8.00', '7.90', '8.125']);
  });
  it('finds every percent figure', () => {
    expect(percents('7.25%* p.a. onwards, 6.90 % and 2.50% p.a.')).toEqual(['7.25', '6.90', '2.50']);
  });
  it.each([
    [' 8% to 13.45%', '8.00', '13.45'],
    ['For Salaried individuals | 7.70% - 12.00% | -', '7.70', '12.00'],
    ['8.75% \u2013 9.65%', '8.75', '9.65'],
    ['7.40 % to 10.25 %', '7.40', '10.25'],
    ['Between 9.99% and 16.50% per annum', '9.99', '16.50'],
  ])('reads the range in %j', (text, min, max) => {
    expect(percentRange(text)).toEqual({ min, max });
  });
  it('a single figure is not a range', () => expect(percentRange('Repo Rate 5.25%')).toBeNull());
  it('min and max of decimal strings', () => {
    expect(minMax(['8.75', '10.05', '8.85'])).toEqual({ min: '8.75', max: '10.05' });
    expect(minMax([])).toBeNull();
  });
  it('plain rate cells', () => {
    expect(['8.70', '8.45%', '8.00 %', 'n/a', '7.85*'].map(cellRate)).toEqual(['8.70', '8.45', '8.00', null, null]);
  });
});

describe('dates', () => {
  it('reads every form the lender pages use, day first', () => {
    expect(
      datesIn(
        'With Effect From 15th Sept 2026; 18th September 2026; September 22, 2026; Effective Date: October 07, 2026; ' +
          '01.10.2026 01-10-2026 01/07/2026 31.02.2026 w.e.f 12.10.2026',
      ),
    ).toEqual(['2026-09-15', '2026-09-18', '2026-09-22', '2026-10-07', '2026-10-01', '2026-10-01', '2026-07-01', '2026-10-12']);
  });
  it('latest date wins; none is null', () => {
    expect(latestDate('w.e.f 15.06.2025 then w.e.f. 01.04.2026 and 15.12.2025')).toBe('2026-04-01');
    expect(latestDate('no dates')).toBeNull();
  });
});

describe('MCLR tables', () => {
  it('maps tenor labels', () => {
    expect(
      ['Over night', 'Overnight MCLR', 'One Month', '1 Month MCLR', 'Three Months', '3 Months MCLR', 'Six Month', '6 Month', 'One Year', '1 Year MCLR', 'Two Years', 'MCLR TENOR'].map(tenorOf),
    ).toEqual(['ON', 'ON', '1M', '1M', '3M', '3M', '6M', '6M', '1Y', '1Y', null, null]);
  });

  it('skips a deposit table with the same tenor rows and takes the MCLR one', () => {
    const tables: PageTable[] = [
      { before: 'Diplomat/Embassy Deposits Rates', rows: [['Period', 'Rate'], ['1 month', '0.50%'], ['3 months', '2.00%'], ['6 months', '2.50%'], ['1 year', '3.35%']] },
      { before: 'Effective Date: October 07, 2026', rows: [['Tenure', 'MCLR'], ['Overnight', '7.80%'], ['1 Month', '7.75%'], ['3 Month', '7.95%'], ['6 Month', '8.15%'], ['1 Year', '8.30%']] },
    ];
    expect(findMclr(tables)?.rows.map((r) => r.ratePct)).toEqual(['7.80', '7.75', '7.95', '8.15', '8.30']);
  });

  it('on the real HDFC rates page, ignores the FD tables and dates the MCLR from its own heading', () => {
    expect(findMclr(pageTables(loadPage(fixture('hdfc-rates.html'))))).toEqual({
      rows: [
        { tenor: 'ON', ratePct: '7.80' },
        { tenor: '1M', ratePct: '7.75' },
        { tenor: '3M', ratePct: '7.95' },
        { tenor: '6M', ratePct: '8.15' },
        { tenor: '1Y', ratePct: '8.30' },
      ],
      effectiveDate: '2026-10-07',
    });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd portfolioos/packages/api && npx vitest run test/loanRates/parseUtil.test.ts`
Expected: FAIL - cannot find module `parseUtil.js`.

- [ ] **Step 5: Implement**

`packages/api/src/services/loanRates/types.ts`:
```ts
import type { MclrTenor, RateBasis, RateLoanType } from '@everypaisa/shared';

export type { MclrTenor, RateBasis, RateLoanType };

/** What a LoanRateSource carries: a loan product, or a benchmark series. */
export type SourceLoanType = RateLoanType | 'MCLR' | 'REPO';

/** One rate read off one page for one source. Rates are decimal strings ("8.50"), never numbers. */
export interface RateReading {
  sourceId: string;
  basis: RateBasis;
  /** MCLR tenor for MCLR sources; null for products and the repo rate. */
  tenor: MclrTenor | null;
  minRatePct: string;
  maxRatePct: string | null;
  /** 'YYYY-MM-DD' when the page states an as-of / w.e.f. date for this figure. */
  effectiveDate: string | null;
  note?: string;
}

/**
 * Reads one fixed page (spec s5.2). `read` is pure: no I/O, no clock, never executes page scripts. A page can
 * feed several sources (SBI's MCLR page also carries the headline widget; Kotak's loans table has six
 * products), so readings name their sourceId.
 */
export interface PageReader {
  id: string;
  version: string;
  url: string;
  read(html: string): RateReading[];
}
```

`packages/api/src/services/loanRates/sources/parseUtil.ts`:
```ts
import { load, type CheerioAPI } from 'cheerio';
import { Decimal } from 'decimal.js';
import type { MclrTenor, RateReading } from '../types.js';

/** Load a page as inert markup; scripts are dropped, never run. */
export function loadPage(html: string): CheerioAPI {
  const $ = load(html);
  $('script, style, noscript, svg, iframe').remove();
  return $;
}

export function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** '8' -> '8.00', '8.125' -> '8.125'. Throws on anything that is not a plain decimal. */
export function normPct(raw: string): string {
  const d = new Decimal(raw);
  return d.decimalPlaces() < 2 ? d.toFixed(2) : d.toString();
}

const NUM = String.raw`(\d{1,2}(?:\.\d{1,3})?)`;

/** Every "N%" / "N %" figure in the text, in order. */
export function percents(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(new RegExp(`${NUM}\\s*%`, 'g'))) out.push(normPct(m[1]!));
  return out;
}

/** "8% to 13.45%", "7.70% - 12.00%", "8.75% \u2013 9.65%", "7.40 % to 10.25 %", "Between 9.99% and 16.50%". */
export function percentRange(text: string): { min: string; max: string } | null {
  const m = new RegExp(`${NUM}\\s*%?\\s*(?:-|\\u2013|\\u2014|to|and)\\s*${NUM}\\s*%`, 'i').exec(text);
  if (!m) return null;
  return { min: normPct(m[1]!), max: normPct(m[2]!) };
}

/** Lowest and highest of a list of decimal strings. */
export function minMax(values: string[]): { min: string; max: string } | null {
  if (values.length === 0) return null;
  let lo = new Decimal(values[0]!);
  let hi = lo;
  for (const v of values.slice(1)) {
    const d = new Decimal(v);
    if (d.lessThan(lo)) lo = d;
    if (d.greaterThan(hi)) hi = d;
  }
  return { min: normPct(lo.toString()), max: normPct(hi.toString()) };
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Every date in the text as 'YYYY-MM-DD', in order. Understands the forms the lender pages use:
 * 01.10.2026, 01-10-2026, 01/07/2026 (day first), "15th Sept 2026", "18th September 2026",
 * "September 22, 2026".
 */
export function datesIn(text: string): string[] {
  const found: { at: number; iso: string }[] = [];
  for (const m of text.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g)) {
    const v = iso(Number(m[3]), Number(m[2]), Number(m[1]));
    if (v) found.push({ at: m.index!, iso: v });
  }
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/g)) {
    const mon = MONTHS[m[2]!.slice(0, 3).toLowerCase()];
    const v = mon ? iso(Number(m[3]), mon, Number(m[1])) : null;
    if (v) found.push({ at: m.index!, iso: v });
  }
  for (const m of text.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})/g)) {
    const mon = MONTHS[m[1]!.slice(0, 3).toLowerCase()];
    const v = mon ? iso(Number(m[3]), mon, Number(m[2])) : null;
    if (v) found.push({ at: m.index!, iso: v });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.iso);
}

/** The latest date in the text, or null. ISO strings sort chronologically. */
export function latestDate(text: string): string | null {
  const all = datesIn(text);
  return all.length === 0 ? null : all.reduce((a, b) => (b > a ? b : a));
}

/** One <table> as cell text, plus the page text just before it (where pages put "w.e.f." lines). */
export interface PageTable {
  rows: string[][];
  before: string;
}

export function pageTables($: CheerioAPI, contextChars = 300): PageTable[] {
  const body = clean($('body').text());
  return $('table')
    .toArray()
    .map((t) => {
      const rows = $(t)
        .find('tr')
        .toArray()
        .map((tr) => $(tr).find('th, td').toArray().map((c) => clean($(c).text())));
      const own = clean($(t).text());
      const at = own === '' ? -1 : body.indexOf(own);
      return { rows, before: at < 0 ? '' : body.slice(Math.max(0, at - contextChars), at) };
    });
}

export function tableText(t: PageTable): string {
  return t.rows.map((r) => r.join(' ')).join(' ');
}

export function tenorOf(label: string): MclrTenor | null {
  const s = label.toLowerCase().replace(/mclr/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^over ?night/.test(s)) return 'ON';
  if (/^(one|1) months?$/.test(s)) return '1M';
  if (/^(three|3) months?$/.test(s)) return '3M';
  if (/^(six|6) months?$/.test(s)) return '6M';
  if (/^(one|1) years?$/.test(s)) return '1Y';
  return null;
}

/** Plain rate cell: "8.70", "8.45%", "8.00 %". */
export function cellRate(text: string): string | null {
  const m = /^(\d{1,2}(?:\.\d{1,3})?)\s*%?$/.exec(clean(text));
  return m ? normPct(m[1]!) : null;
}

export interface MclrRow {
  tenor: MclrTenor;
  ratePct: string;
}

/**
 * The first MCLR table that lists at least four of overnight..1-year MCLR including 1-year. Each row's tenor
 * is the first cell that names one; its rate is the LAST cell that is a plain rate (pages show
 * "existing | revised"). The as-of date is the latest date in the table or the text just before it.
 */
export function findMclr(tables: PageTable[]): { rows: MclrRow[]; effectiveDate: string | null } | null {
  for (const t of tables) {
    // Deposit tables also have "1 Month" rows; an MCLR table names itself or is introduced as one.
    if (!/mclr/i.test(`${t.before.slice(-150)} ${tableText(t)}`)) continue;
    const rows: MclrRow[] = [];
    for (const cells of t.rows) {
      const tenor = cells.map(tenorOf).find((x) => x !== null) ?? null;
      if (!tenor || rows.some((r) => r.tenor === tenor)) continue;
      const rate = [...cells].reverse().map(cellRate).find((r) => r !== null) ?? null;
      if (rate) rows.push({ tenor, ratePct: rate });
    }
    if (rows.length >= 4 && rows.some((r) => r.tenor === '1Y')) {
      return { rows, effectiveDate: latestDate(`${t.before.slice(-200)} ${tableText(t)}`) };
    }
  }
  return null;
}

/** MCLR readings for one lender's MCLR source from the page's MCLR table; [] when the page has none. */
export function mclrReadings(sourceId: string, tables: PageTable[]): RateReading[] {
  const m = findMclr(tables);
  if (!m) return [];
  return m.rows.map((r) => ({
    sourceId,
    basis: 'MCLR' as const,
    tenor: r.tenor,
    minRatePct: r.ratePct,
    maxRatePct: null,
    effectiveDate: m.effectiveDate,
  }));
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd portfolioos/packages/api && npx vitest run test/loanRates/parseUtil.test.ts && npx tsc --noEmit`
Expected: all PASS; no type errors.

- [ ] **Step 7: Commit**

```bash
cd portfolioos
git add packages/shared/src/loans/loanRates.ts packages/shared/src/loans/index.ts packages/api/scripts/sanitize-loan-rate-fixtures.mjs packages/api/test/fixtures/loanRates packages/api/src/services/loanRates/types.ts packages/api/src/services/loanRates/sources/parseUtil.ts packages/api/test/loanRates/parseUtil.test.ts
git commit -m "feat(loan-rates): shared rate vocabulary, real page fixtures and parse helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Readers - RBI repo, SBI (MCLR + headline widget), PNB / Bank of Baroda / Union MCLR

**Files:**
- Create: `packages/api/src/services/loanRates/sources/rbi.ts`, `sbi.ts`, `psuMclr.ts`
- Test: `packages/api/test/loanRates/readers.benchmark.test.ts`

**Interfaces:**
- Consumes: Task 1 `PageReader`, `RateReading`, parse helpers.
- Produces: `rbiHomeReader` (id `rbi.home`, url `https://www.rbi.org.in/`, emits `rbi.repo`), `sbiRatesReader` (id `sbi.rates`, url `https://sbi.bank.in/web/interest-rates/interest-rates/mclr`, emits `sbi.mclr` x5 tenors and `sbi.home|personal|gold|education|car|las`), `pnbMclrReader` (`pnb.mclr`, url `https://pnb.bank.in/interst-rate-on-advances-linked-to-mclr.html`), `bobRetailReader` (`bob.retail`, emits `bob.mclr`, url `https://bankofbaroda.bank.in/interest-rate-and-service-charges/retail-loans-interest-rates`), `unionRatesReader` (`union.rates`, emits `union.mclr`, url `https://www.unionbankofindia.bank.in/en/common/interest-rates-loans-and-advances`). All version `'1'`.

Golden values below are what the readers return on the real captures of 12/10/2026 (verified while writing this plan). A changed number in these tests means the reader changed, not the page.

- [ ] **Step 1: Write the failing tests**

`packages/api/test/loanRates/readers.benchmark.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { MclrTenor, RateReading } from '../../src/services/loanRates/types.js';
import { rbiHomeReader } from '../../src/services/loanRates/sources/rbi.js';
import { sbiRatesReader } from '../../src/services/loanRates/sources/sbi.js';
import { bobRetailReader, pnbMclrReader, unionRatesReader } from '../../src/services/loanRates/sources/psuMclr.js';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/loanRates/${name}`, import.meta.url), 'utf8');

function mclr(sourceId: string, effectiveDate: string, rates: [string, string, string, string, string]): RateReading[] {
  const tenors: MclrTenor[] = ['ON', '1M', '3M', '6M', '1Y'];
  return tenors.map((tenor, i) => ({ sourceId, basis: 'MCLR', tenor, minRatePct: rates[i]!, maxRatePct: null, effectiveDate }));
}

const product = (sourceId: string, basis: RateReading['basis'], min: string, effectiveDate: string | null = null): RateReading => ({
  sourceId, basis, tenor: null, minRatePct: min, maxRatePct: null, effectiveDate,
});

const SBI_WIDGET: RateReading[] = [
  product('sbi.home', 'REPO_LINKED', '7.25', '2026-04-01'),
  product('sbi.personal', 'OTHER', '10.00'),
  product('sbi.gold', 'OTHER', '9.15'),
  product('sbi.education', 'OTHER', '6.90'),
  product('sbi.car', 'OTHER', '8.30'),
  product('sbi.las', 'OTHER', '9.95', '2025-12-15'),
];

describe('rbi.home', () => {
  it('reads the policy repo rate (the page gives no change date)', () => {
    expect(rbiHomeReader.read(fixture('rbi-home.html'))).toEqual([product('rbi.repo', 'OTHER', '5.50')]);
  });
  it('finds nothing on a bank page', () => {
    expect(rbiHomeReader.read(fixture('sbi-mclr.html'))).toEqual([]);
  });
});

describe('sbi.rates', () => {
  it('reads the MCLR table with its "With Effect From" date, then the headline widget', () => {
    expect(sbiRatesReader.read(fixture('sbi-mclr.html'))).toEqual([
      ...mclr('sbi.mclr', '2026-09-15', ['7.85', '7.85', '8.25', '8.60', '8.70']),
      ...SBI_WIDGET,
    ]);
  });
  it.each(['sbi-eblr.html', 'sbi-rates-index.html', 'sbi-LAP.html'])(
    'reads the same widget on %s (no MCLR table there; the LAP page renders the widget twice)',
    (name) => {
      expect(sbiRatesReader.read(fixture(name))).toEqual(SBI_WIDGET);
    },
  );
  it('finds nothing on another bank page', () => {
    expect(sbiRatesReader.read(fixture('axis-HOME.html'))).toEqual([]);
  });
});

describe('PSU MCLR pages', () => {
  it('pnb.mclr takes the revised column and the latest w.e.f. date', () => {
    expect(pnbMclrReader.read(fixture('pnb-MCLR.html'))).toEqual(mclr('pnb.mclr', '2026-10-01', ['8.00', '8.25', '8.50', '8.65', '8.80']));
  });
  it('bob.retail reads only the MCLR table', () => {
    expect(bobRetailReader.read(fixture('bob-retail.html'))).toEqual(mclr('bob.mclr', '2026-10-12', ['7.85', '7.95', '8.30', '8.50', '8.75']));
  });
  it('union.rates dates MCLR from its heading, not the base-rate row below', () => {
    expect(unionRatesReader.read(fixture('union-loans.html'))).toEqual(mclr('union.mclr', '2026-09-21', ['7.90', '8.10', '8.35', '8.65', '8.80']));
  });
  it('an MCLR reader finds nothing on a page without an MCLR table', () => {
    expect(pnbMclrReader.read(fixture('icici-HOME.html'))).toEqual([]);
    expect(unionRatesReader.read(fixture('canara-RANGE.html'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd portfolioos/packages/api && npx vitest run test/loanRates/readers.benchmark.test.ts`
Expected: FAIL - cannot find module `sources/rbi.js`.

- [ ] **Step 3: Implement**

`packages/api/src/services/loanRates/sources/rbi.ts`:
```ts
import type { PageReader, RateReading } from '../types.js';
import { loadPage, pageTables, percents } from './parseUtil.js';

/**
 * RBI home page, "Current Rates" box: `Policy Repo Rate | : 5.50%`. The page gives no change date for the
 * repo rate, so effectiveDate is null and the job records the first day it sees a new value.
 */
export const rbiHomeReader: PageReader = {
  id: 'rbi.home',
  version: '1',
  url: 'https://www.rbi.org.in/',
  read(html: string): RateReading[] {
    for (const table of pageTables(loadPage(html))) {
      for (const cells of table.rows) {
        if (!/^policy repo rate$/i.test(cells[0] ?? '')) continue;
        const rate = percents(cells.slice(1).join(' '))[0];
        if (rate) return [{ sourceId: 'rbi.repo', basis: 'OTHER', tenor: null, minRatePct: rate, maxRatePct: null, effectiveDate: null }];
      }
    }
    return [];
  },
};
```

`packages/api/src/services/loanRates/sources/sbi.ts`:
```ts
import type { RateLoanType, PageReader, RateBasis, RateReading } from '../types.js';
import { clean, latestDate, loadPage, mclrReadings, pageTables, percents } from './parseUtil.js';

/** The "Interest Rates" widget on every sbi.bank.in page: a <select id="rate-picker"> whose option N shows div#menu-N. */
const WIDGET: Record<string, { loanType: RateLoanType; basis: RateBasis }> = {
  'home loan': { loanType: 'HOME', basis: 'REPO_LINKED' },
  'personal loan': { loanType: 'PERSONAL', basis: 'OTHER' },
  'gold loan': { loanType: 'GOLD', basis: 'OTHER' },
  'education loan': { loanType: 'EDUCATION', basis: 'OTHER' },
  'auto loan': { loanType: 'CAR', basis: 'OTHER' },
  'loan against mf': { loanType: 'LAS', basis: 'OTHER' },
};

/**
 * SBI MCLR page. One fetch gives two things: the MCLR table (with its "With Effect From" date) and the
 * site-wide headline widget ("7.25%* p.a. onwards w.e.f. 01.04.2026"). Headline figures are "starts from"
 * rates, so maxRatePct is null.
 */
export const sbiRatesReader: PageReader = {
  id: 'sbi.rates',
  version: '1',
  url: 'https://sbi.bank.in/web/interest-rates/interest-rates/mclr',
  read(html: string): RateReading[] {
    const $ = loadPage(html);
    const out: RateReading[] = mclrReadings('sbi.mclr', pageTables($));
    const seen = new Set<string>();
    for (const option of $('#rate-picker option').toArray()) {
      const map = WIDGET[clean($(option).text()).toLowerCase()];
      const value = $(option).attr('value');
      // Some pages render the widget twice (desktop + mobile); the first copy wins.
      if (!map || value === undefined || seen.has(map.loanType)) continue;
      const text = clean($(`#menu-${value}`).first().text());
      const rate = percents(text)[0];
      if (!rate) continue;
      seen.add(map.loanType);
      out.push({
        sourceId: `sbi.${map.loanType.toLowerCase()}`,
        basis: map.basis,
        tenor: null,
        minRatePct: rate,
        maxRatePct: null,
        effectiveDate: latestDate(text),
      });
    }
    return out;
  },
};
```

`packages/api/src/services/loanRates/sources/psuMclr.ts`:
```ts
import type { PageReader, RateReading } from '../types.js';
import { loadPage, mclrReadings, pageTables } from './parseUtil.js';

/** PNB: "MCLR W.E.F. 01-10-2026 | MCLR TENOR | Existing w.e.f. 01.09.2026 | Revised w.e.f. 01.10.2026". The URL's "interst" typo is real. */
export const pnbMclrReader: PageReader = {
  id: 'pnb.mclr',
  version: '1',
  url: 'https://pnb.bank.in/interst-rate-on-advances-linked-to-mclr.html',
  read(html: string): RateReading[] {
    return mclrReadings('pnb.mclr', pageTables(loadPage(html)));
  },
};

/**
 * Bank of Baroda retail-loans page: table 0 is MCLR ("MCLR in (%) w.e.f 12.10.2026"). The product tables
 * on the same page show "0.00%" in their effective-rate column and two contradictory BRLLR figures, so
 * BoB loan types stay MANUAL.
 */
export const bobRetailReader: PageReader = {
  id: 'bob.retail',
  version: '1',
  url: 'https://bankofbaroda.bank.in/interest-rate-and-service-charges/retail-loans-interest-rates',
  read(html: string): RateReading[] {
    return mclrReadings('bob.mclr', pageTables(loadPage(html)));
  },
};

/** Union Bank: "MARGINAL COST OF FUNDS BASED LENDING RATE (MCLR) effective from 21.09.2026 | Tenor | MCLR". */
export const unionRatesReader: PageReader = {
  id: 'union.rates',
  version: '1',
  url: 'https://www.unionbankofindia.bank.in/en/common/interest-rates-loans-and-advances',
  read(html: string): RateReading[] {
    return mclrReadings('union.mclr', pageTables(loadPage(html)));
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd portfolioos/packages/api && npx vitest run test/loanRates && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
cd portfolioos
git add packages/api/src/services/loanRates/sources/rbi.ts packages/api/src/services/loanRates/sources/sbi.ts packages/api/src/services/loanRates/sources/psuMclr.ts packages/api/test/loanRates/readers.benchmark.test.ts
git commit -m "feat(loan-rates): RBI repo, SBI and PSU MCLR page readers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Readers - HDFC Bank, ICICI Bank, Axis Bank

**Files:**
- Create: `packages/api/src/services/loanRates/sources/hdfc.ts`, `icici.ts`, `axis.ts`
- Test: `packages/api/test/loanRates/readers.private.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers and types.
- Produces: `hdfcHomeReader` (`hdfc.home`, `https://homeloans.hdfc.bank.in/ps/home-loans-in-india/interest-rates`), `hdfcRatesReader` (`hdfc.rates`, `https://www.hdfc.bank.in/interest-rates`, emits `hdfc.mclr`, `hdfc.personal`, `hdfc.car`), `iciciHomeReader` (`icici.home`, `https://www.icici.bank.in/personal-banking/loans/home-loan/interest-rates`), `iciciPersonalReader` (`icici.personal`, `https://www.icici.bank.in/personal-banking/loans/personal-loan/personal-loan-interest-rates`), `iciciRatesReader` (`icici.rates`, `https://www.icici.bank.in/interest-rate`, emits `icici.mclr`), `axisHomeReader` (`axis.home`, `https://www.axis.bank.in/loans/home-loan/interest-rates-charges`), `axisMclrReader` (`axis.mclr`, `https://www.axis.bank.in/mclr-rates`). All version `'1'`.

- [ ] **Step 1: Write the failing tests**

`packages/api/test/loanRates/readers.private.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { MclrTenor, RateReading } from '../../src/services/loanRates/types.js';
import { hdfcHomeReader, hdfcRatesReader } from '../../src/services/loanRates/sources/hdfc.js';
import { iciciHomeReader, iciciPersonalReader, iciciRatesReader } from '../../src/services/loanRates/sources/icici.js';
import { axisHomeReader, axisMclrReader } from '../../src/services/loanRates/sources/axis.js';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/loanRates/${name}`, import.meta.url), 'utf8');

function mclr(sourceId: string, effectiveDate: string, rates: [string, string, string, string, string]): RateReading[] {
  const tenors: MclrTenor[] = ['ON', '1M', '3M', '6M', '1Y'];
  return tenors.map((tenor, i) => ({ sourceId, basis: 'MCLR', tenor, minRatePct: rates[i]!, maxRatePct: null, effectiveDate }));
}

const range = (sourceId: string, basis: RateReading['basis'], min: string, max: string | null): RateReading => ({
  sourceId, basis, tenor: null, minRatePct: min, maxRatePct: max, effectiveDate: null,
});

describe('hdfc.home', () => {
  it.each(['hdfc-HOME.html', 'hdfc-HOME2.html'])('reads the effective range after "=" on %s', (name) => {
    expect(hdfcHomeReader.read(fixture(name))).toEqual([range('hdfc.home', 'REPO_LINKED', '8.00', '13.45')]);
  });
  it('finds nothing on the ICICI home page', () => {
    expect(hdfcHomeReader.read(fixture('icici-HOME.html'))).toEqual([]);
  });
});

describe('hdfc.rates', () => {
  it('reads MCLR (dated October 07, 2026) and the personal/car carousel, not the carousel home figure', () => {
    expect(hdfcRatesReader.read(fixture('hdfc-rates.html'))).toEqual([
      ...mclr('hdfc.mclr', '2026-10-07', ['7.80', '7.75', '7.95', '8.15', '8.30']),
      range('hdfc.personal', 'OTHER', '9.99', null),
      range('hdfc.car', 'OTHER', '9.32', null),
    ]);
  });
});

describe('icici', () => {
  it('home: lowest..highest of the credit-score and loan-slab tables, not the PSL table', () => {
    expect(iciciHomeReader.read(fixture('icici-HOME.html'))).toEqual([range('icici.home', 'REPO_LINKED', '8.75', '10.05')]);
  });
  it('personal: "Between 9.99% and 16.50%" on MCLR + spread', () => {
    expect(iciciPersonalReader.read(fixture('icici-PERSONAL.html'))).toEqual([range('icici.personal', 'MCLR', '9.99', '16.50')]);
  });
  it('rates page: I-MCLR effective September 22, 2026', () => {
    expect(iciciRatesReader.read(fixture('icici-rates.html'))).toEqual(mclr('icici.mclr', '2026-09-22', ['7.80', '7.85', '8.10', '8.35', '8.40']));
  });
  it('each ICICI reader finds nothing on the other ICICI pages', () => {
    expect(iciciHomeReader.read(fixture('icici-PERSONAL.html'))).toEqual([]);
    expect(iciciPersonalReader.read(fixture('icici-HOME.html'))).toEqual([]);
    expect(iciciRatesReader.read(fixture('icici-HOME.html'))).toEqual([]);
  });
});

describe('axis', () => {
  it('home: the "Effective Rate of Interest" column', () => {
    expect(axisHomeReader.read(fixture('axis-HOME.html'))).toEqual([range('axis.home', 'REPO_LINKED', '8.00', '9.10')]);
  });
  it('mclr: w.e.f 18th Sept 2026, ignoring the base-rate date after the table', () => {
    expect(axisMclrReader.read(fixture('axis-MCLR.html'))).toEqual(mclr('axis.mclr', '2026-09-18', ['8.45', '8.45', '8.55', '8.60', '8.65']));
  });
  it('finds nothing on the other Axis page', () => {
    expect(axisHomeReader.read(fixture('axis-MCLR.html'))).toEqual([]);
    expect(axisMclrReader.read(fixture('axis-HOME.html'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd portfolioos/packages/api && npx vitest run test/loanRates/readers.private.test.ts`
Expected: FAIL - cannot find module `sources/hdfc.js`.

- [ ] **Step 3: Implement**

`packages/api/src/services/loanRates/sources/hdfc.ts`:
```ts
import type { PageReader, RateReading } from '../types.js';
import { clean, loadPage, mclrReadings, pageTables, percentRange, percents } from './parseUtil.js';

/** "For All Loans* | Policy Repo Rate + 2.50% to 7.95%= 8% to 13.45%" - the effective range is after "=". */
export const hdfcHomeReader: PageReader = {
  id: 'hdfc.home',
  version: '1',
  url: 'https://homeloans.hdfc.bank.in/ps/home-loans-in-india/interest-rates',
  read(html: string): RateReading[] {
    for (const table of pageTables(loadPage(html))) {
      for (const cells of table.rows) {
        const cell = cells.find((c) => /policy repo rate/i.test(c) && c.includes('='));
        if (!cell) continue;
        const range = percentRange(cell.slice(cell.lastIndexOf('=') + 1));
        if (range) {
          return [{ sourceId: 'hdfc.home', basis: 'REPO_LINKED', tenor: null, minRatePct: range.min, maxRatePct: range.max, effectiveDate: null }];
        }
      }
    }
    return [];
  },
};

const CAROUSEL: Record<string, string> = { 'personal loan': 'hdfc.personal', 'car loan': 'hdfc.car' };

/**
 * hdfc.bank.in/interest-rates: the "Popular" carousel ("Car Loan 9.32% Onwards") and the MCLR tab
 * ("Effective Date: October 07, 2026"). The carousel's Home Loan figure (7.90%) disagrees with the
 * home-loan page (8%), so HOME comes only from hdfcHomeReader.
 */
export const hdfcRatesReader: PageReader = {
  id: 'hdfc.rates',
  version: '1',
  url: 'https://www.hdfc.bank.in/interest-rates',
  read(html: string): RateReading[] {
    const $ = loadPage(html);
    const out: RateReading[] = mclrReadings('hdfc.mclr', pageTables($));
    const seen = new Set<string>();
    for (const label of $('.ir-service').toArray()) {
      const sourceId = CAROUSEL[clean($(label).text()).toLowerCase()];
      if (!sourceId || seen.has(sourceId)) continue;
      const rate = percents(clean($(label).closest('a').find('.ir-charges').first().text()))[0];
      if (!rate) continue;
      seen.add(sourceId);
      out.push({ sourceId, basis: 'OTHER', tenor: null, minRatePct: rate, maxRatePct: null, effectiveDate: null });
    }
    return out;
  },
};
```

`packages/api/src/services/loanRates/sources/icici.ts`:
```ts
import type { PageReader, RateReading } from '../types.js';
import { loadPage, mclrReadings, minMax, pageTables, percentRange, percents } from './parseUtil.js';

/**
 * Home-loan rate tables by credit score and by loan slab: header row `<Credit Score|Loan Slab> | Salaried |
 * Self - Employed`. The later "Salaried or Self - Employed (PSL)" table is not labelled as a home-loan
 * table (probably LAP) and is deliberately excluded.
 */
export const iciciHomeReader: PageReader = {
  id: 'icici.home',
  version: '1',
  url: 'https://www.icici.bank.in/personal-banking/loans/home-loan/interest-rates',
  read(html: string): RateReading[] {
    const rates: string[] = [];
    for (const table of pageTables(loadPage(html))) {
      const [head, ...body] = table.rows;
      if (!head || !/^(credit score|loan slab)$/i.test(head[0] ?? '') || head[1] !== 'Salaried') continue;
      for (const cells of body) rates.push(...percents(cells.slice(1).join(' ')));
    }
    const range = minMax(rates);
    return range
      ? [{ sourceId: 'icici.home', basis: 'REPO_LINKED', tenor: null, minRatePct: range.min, maxRatePct: range.max, effectiveDate: null }]
      : [];
  },
};

/** "Personal Loan interest rates | Between 9.99% and 16.50% per annum" (1-year MCLR + spread). */
export const iciciPersonalReader: PageReader = {
  id: 'icici.personal',
  version: '1',
  url: 'https://www.icici.bank.in/personal-banking/loans/personal-loan/personal-loan-interest-rates',
  read(html: string): RateReading[] {
    for (const table of pageTables(loadPage(html))) {
      for (const cells of table.rows) {
        if (!/^personal loan interest rates$/i.test(cells[0] ?? '')) continue;
        const range = percentRange(cells.slice(1).join(' '));
        if (range) {
          return [{ sourceId: 'icici.personal', basis: 'MCLR', tenor: null, minRatePct: range.min, maxRatePct: range.max, effectiveDate: null }];
        }
      }
    }
    return [];
  },
};

/** icici.bank.in/interest-rate: "MCLR effective September 22, 2026 | Tenures | I-MCLR". */
export const iciciRatesReader: PageReader = {
  id: 'icici.rates',
  version: '1',
  url: 'https://www.icici.bank.in/interest-rate',
  read(html: string): RateReading[] {
    return mclrReadings('icici.mclr', pageTables(loadPage(html)));
  },
};
```

`packages/api/src/services/loanRates/sources/axis.ts`:
```ts
import type { PageReader, RateReading } from '../types.js';
import { loadPage, mclrReadings, minMax, pageTables, percents } from './parseUtil.js';

/** Home-loan table: `Cibil Score | REPO + Spread | Effective Rate of Interest`; the range is the last column. */
export const axisHomeReader: PageReader = {
  id: 'axis.home',
  version: '1',
  url: 'https://www.axis.bank.in/loans/home-loan/interest-rates-charges',
  read(html: string): RateReading[] {
    for (const table of pageTables(loadPage(html))) {
      const headAt = table.rows.findIndex((r) => r.some((c) => /^effective rate of interest$/i.test(c)));
      if (headAt < 0) continue;
      const col = table.rows[headAt]!.findIndex((c) => /^effective rate of interest$/i.test(c));
      const rates = table.rows.slice(headAt + 1).flatMap((r) => percents(r[col] ?? ''));
      const range = minMax(rates);
      if (range) {
        return [{ sourceId: 'axis.home', basis: 'REPO_LINKED', tenor: null, minRatePct: range.min, maxRatePct: range.max, effectiveDate: null }];
      }
    }
    return [];
  },
};

/** axis.bank.in/mclr-rates: "(MCLR) w.e.f 18th Sept 2026 | Tenor | MCLR %". */
export const axisMclrReader: PageReader = {
  id: 'axis.mclr',
  version: '1',
  url: 'https://www.axis.bank.in/mclr-rates',
  read(html: string): RateReading[] {
    return mclrReadings('axis.mclr', pageTables(loadPage(html)));
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd portfolioos/packages/api && npx vitest run test/loanRates && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
cd portfolioos
git add packages/api/src/services/loanRates/sources/hdfc.ts packages/api/src/services/loanRates/sources/icici.ts packages/api/src/services/loanRates/sources/axis.ts packages/api/test/loanRates/readers.private.test.ts
git commit -m "feat(loan-rates): HDFC, ICICI and Axis page readers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Readers - Kotak, Canara Bank, LIC Housing Finance; reader registry

**Files:**
- Create: `packages/api/src/services/loanRates/sources/kotak.ts`, `canara.ts`, `lic.ts`, `index.ts`
- Test: `packages/api/test/loanRates/readers.other.test.ts`, `packages/api/test/loanRates/readerFixtures.ts` (fixture map shared by later tests)

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: `kotakRatesReader` (`kotak.rates`, `https://www.kotak.bank.in/en/rates.html`, emits `kotak.home|business|personal|lap|las|education`), `canaraRangeReader` (`canara.range`, `https://www.canarabank.bank.in/pages/interest-rate-range-on-loans`, emits `canara.home|car|lap`), `licHomeReader` (`lic.home`, `https://www.lichousing.com/housing-loan/home-loan`), `nextFlightChunks(html): string[]`; registry `PAGE_READERS: readonly PageReader[]` (15 readers), `READER_URLS: ReadonlySet<string>`, `readerById(id): PageReader | undefined`.
- Produces (test helper): `READER_FIXTURES: Record<string, string[]>` (reader id -> real fixture file names containing its content) and `fixture(name): string`.

- [ ] **Step 1: Write the failing tests**

`packages/api/test/loanRates/readerFixtures.ts`:
```ts
import { readFileSync } from 'node:fs';

export const fixture = (name: string) => readFileSync(new URL(`../fixtures/loanRates/${name}`, import.meta.url), 'utf8');

/** Every real capture that carries each reader's content (ruling 3 in the plan header). */
export const READER_FIXTURES: Record<string, string[]> = {
  'rbi.home': ['rbi-home.html'],
  'sbi.rates': ['sbi-mclr.html', 'sbi-eblr.html', 'sbi-rates-index.html', 'sbi-LAP.html'],
  'hdfc.home': ['hdfc-HOME.html', 'hdfc-HOME2.html'],
  'hdfc.rates': ['hdfc-rates.html'],
  'icici.home': ['icici-HOME.html'],
  'icici.personal': ['icici-PERSONAL.html'],
  'icici.rates': ['icici-rates.html'],
  'axis.home': ['axis-HOME.html'],
  'axis.mclr': ['axis-MCLR.html'],
  'kotak.rates': ['kotak-rates.html', 'kotak-MCLR.html'],
  'pnb.mclr': ['pnb-MCLR.html'],
  'bob.retail': ['bob-retail.html'],
  'union.rates': ['union-loans.html'],
  'canara.range': ['canara-RANGE.html'],
  'lic.home': ['lic-HOME.html'],
};
```

`packages/api/test/loanRates/readers.other.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { RateReading } from '../../src/services/loanRates/types.js';
import { kotakRatesReader } from '../../src/services/loanRates/sources/kotak.js';
import { canaraRangeReader } from '../../src/services/loanRates/sources/canara.js';
import { licHomeReader } from '../../src/services/loanRates/sources/lic.js';
import { PAGE_READERS, READER_URLS, readerById } from '../../src/services/loanRates/sources/index.js';
import { READER_FIXTURES, fixture } from './readerFixtures.js';

const range = (sourceId: string, basis: RateReading['basis'], min: string, max: string, extra: Partial<RateReading> = {}): RateReading => ({
  sourceId, basis, tenor: null, minRatePct: min, maxRatePct: max, effectiveDate: null, ...extra,
});

const KOTAK: RateReading[] = [
  range('kotak.home', 'REPO_LINKED', '7.70', '13.05'),
  range('kotak.business', 'FIXED', '9.50', '30.50'),
  range('kotak.personal', 'FIXED', '10.25', '30.00'),
  range('kotak.lap', 'REPO_LINKED', '9.15', '16.00'),
  range('kotak.las', 'REPO_LINKED', '10.50', '12.00'),
  range('kotak.education', 'FIXED', '11.00', '17.00'),
];

describe('kotak.rates', () => {
  it.each(['kotak-rates.html', 'kotak-MCLR.html'])('reads the loans table on %s; housing spans its two "For ..." rows', (name) => {
    expect(kotakRatesReader.read(fixture(name))).toEqual(KOTAK);
  });
  it('finds nothing on another bank page', () => {
    expect(kotakRatesReader.read(fixture('axis-HOME.html'))).toEqual([]);
  });
});

describe('canara.range', () => {
  it('reads contracted-loan ranges dated w.e.f. 12.12.2025', () => {
    const note = { effectiveDate: '2025-12-12', note: 'Range of contracted loans' };
    expect(canaraRangeReader.read(fixture('canara-RANGE.html'))).toEqual([
      range('canara.home', 'OTHER', '7.40', '10.25', note),
      range('canara.car', 'OTHER', '7.70', '15.25', note),
      range('canara.lap', 'OTHER', '9.30', '11.80', note),
    ]);
  });
  it('finds nothing on the Kotak page', () => {
    expect(canaraRangeReader.read(fixture('kotak-rates.html'))).toEqual([]);
  });
});

describe('lic.home', () => {
  it('decodes the Next.js payload and spans both roi tables (one cell has no % sign)', () => {
    expect(licHomeReader.read(fixture('lic-HOME.html'))).toEqual([range('lic.home', 'OTHER', '7.15', '10.30')]);
  });
  it('finds nothing on a page without the payload', () => {
    expect(licHomeReader.read(fixture('kotak-rates.html'))).toEqual([]);
  });
});

describe('registry', () => {
  it('has 15 readers with unique ids and unique https URLs', () => {
    expect(PAGE_READERS).toHaveLength(15);
    expect(new Set(PAGE_READERS.map((r) => r.id)).size).toBe(15);
    expect(READER_URLS.size).toBe(15);
    for (const r of PAGE_READERS) {
      expect(new URL(r.url).protocol).toBe('https:');
      expect(r.version).toMatch(/^\d+$/);
    }
    expect(readerById('kotak.rates')).toBe(kotakRatesReader);
    expect(readerById('nope')).toBeUndefined();
  });

  it('every reader yields readings on every real capture listed for it, all with sane decimal strings', () => {
    expect(Object.keys(READER_FIXTURES).sort()).toEqual(PAGE_READERS.map((r) => r.id).sort());
    for (const reader of PAGE_READERS) {
      for (const name of READER_FIXTURES[reader.id]!) {
        const readings = reader.read(fixture(name));
        expect(readings.length, `${reader.id} on ${name}`).toBeGreaterThan(0);
        for (const r of readings) {
          expect(r.minRatePct).toMatch(/^\d{1,2}\.\d{2,3}$/);
          if (r.maxRatePct !== null) expect(r.maxRatePct).toMatch(/^\d{1,2}\.\d{2,3}$/);
          if (r.effectiveDate !== null) expect(r.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd portfolioos/packages/api && npx vitest run test/loanRates/readers.other.test.ts`
Expected: FAIL - cannot find module `sources/kotak.js`.

- [ ] **Step 3: Implement**

`packages/api/src/services/loanRates/sources/kotak.ts`:
```ts
import type { RateLoanType, PageReader, RateBasis, RateReading } from '../types.js';
import { loadPage, minMax, pageTables, percentRange } from './parseUtil.js';

/** Product rows of the loans table on kotak.bank.in/en/rates.html, matched on the first cell. */
const PRODUCTS: { label: RegExp; loanType: RateLoanType; basis: RateBasis }[] = [
  { label: /^housing finance/i, loanType: 'HOME', basis: 'REPO_LINKED' },
  { label: /^business loan$/i, loanType: 'BUSINESS', basis: 'FIXED' },
  { label: /^personal loan$/i, loanType: 'PERSONAL', basis: 'FIXED' },
  { label: /^loan against property/i, loanType: 'LAP', basis: 'REPO_LINKED' },
  { label: /^loan against securities$/i, loanType: 'LAS', basis: 'REPO_LINKED' },
  { label: /^educational loan$/i, loanType: 'EDUCATION', basis: 'FIXED' },
];

/**
 * A product row carries its range ("Personal Loan | Salaried individuals | 10.25% - 30% | Fixed Rate"), except
 * housing, whose ranges are on the following "For Salaried individuals" / "For Self Employed" rows. The
 * housing row also quotes "Repo Rate 5.25%", which is stale (RBI repo is 5.50%) and is not read.
 */
export const kotakRatesReader: PageReader = {
  id: 'kotak.rates',
  version: '1',
  url: 'https://www.kotak.bank.in/en/rates.html',
  read(html: string): RateReading[] {
    for (const table of pageTables(loadPage(html))) {
      if (!table.rows.some((r) => /^housing finance/i.test(r[0] ?? ''))) continue;
      const found = new Map<RateLoanType, { basis: RateBasis; rates: string[] }>();
      let current: (typeof PRODUCTS)[number] | null = null;
      for (const cells of table.rows) {
        const first = cells[0] ?? '';
        const product = PRODUCTS.find((p) => p.label.test(first));
        if (product) current = product;
        else if (!/^for /i.test(first)) current = null;
        if (!current) continue;
        const range = percentRange(cells.slice(1).join(' | '));
        if (!range) continue;
        const entry = found.get(current.loanType) ?? { basis: current.basis, rates: [] };
        entry.rates.push(range.min, range.max);
        found.set(current.loanType, entry);
      }
      const out: RateReading[] = [];
      for (const [loanType, { basis, rates }] of found) {
        const range = minMax(rates)!;
        out.push({ sourceId: `kotak.${loanType.toLowerCase()}`, basis, tenor: null, minRatePct: range.min, maxRatePct: range.max, effectiveDate: null });
      }
      return out;
    }
    return [];
  },
};
```

`packages/api/src/services/loanRates/sources/canara.ts`:
```ts
import type { PageReader, RateReading } from '../types.js';
import { latestDate, loadPage, pageTables, percentRange } from './parseUtil.js';

const ROWS: { label: RegExp; sourceId: string }[] = [
  { label: /^housing loan$/i, sourceId: 'canara.home' },
  { label: /^canara vehicle$/i, sourceId: 'canara.car' },
  { label: /^canara mortgage$/i, sourceId: 'canara.lap' },
];

/**
 * "Interest Rate Range of Contracted loans w.e.f. 12.12.2025": ranges actually charged on loans sanctioned,
 * not an offer sheet, so the basis is OTHER and the reading says so in its note.
 */
export const canaraRangeReader: PageReader = {
  id: 'canara.range',
  version: '1',
  url: 'https://www.canarabank.bank.in/pages/interest-rate-range-on-loans',
  read(html: string): RateReading[] {
    for (const table of pageTables(loadPage(html))) {
      const head = table.rows.find((r) => r.some((c) => /interest rate range of contracted loans/i.test(c)));
      if (!head) continue;
      const effectiveDate = latestDate(head.join(' '));
      const out: RateReading[] = [];
      for (const cells of table.rows) {
        const row = ROWS.find((r) => cells.some((c) => r.label.test(c)));
        const range = row ? percentRange(cells.join(' | ')) : null;
        if (row && range) {
          out.push({
            sourceId: row.sourceId, basis: 'OTHER', tenor: null, minRatePct: range.min, maxRatePct: range.max,
            effectiveDate, note: 'Range of contracted loans',
          });
        }
      }
      return out;
    }
    return [];
  },
};
```

`packages/api/src/services/loanRates/sources/lic.ts`:
```ts
import { load } from 'cheerio';
import type { PageReader, RateReading } from '../types.js';
import { cellRate, clean, minMax } from './parseUtil.js';

/**
 * The HTML chunks a Next.js page streams in `self.__next_f.push([1, "<html...>"])` script calls. Each call's
 * argument is a JSON array, so JSON.parse does the unescaping; nothing is executed.
 */
export function nextFlightChunks(html: string): string[] {
  const $ = load(html);
  const out: string[] = [];
  for (const script of $('script').toArray()) {
    const text = $(script).text().trim();
    if (!text.startsWith('self.__next_f.push(')) continue;
    try {
      const args: unknown = JSON.parse(text.slice(text.indexOf('(') + 1, text.lastIndexOf(')')));
      if (Array.isArray(args)) out.push(...args.filter((a): a is string => typeof a === 'string'));
    } catch (err) {
      // One malformed chunk must not hide the others; the reader returns [] if the rate table is missing.
      if (!(err instanceof SyntaxError)) throw err;
    }
  }
  return out;
}

/**
 * LIC Housing Finance home loans: two `table.roi_table` (salaried, self-employed) of CIBIL band x loan slab,
 * last column the rate ("7.15%", one cell is "10.30" with no % sign). Range = lowest..highest across both.
 * The rates are linked to LIC HFL's own LHPLR, so the basis is OTHER.
 */
export const licHomeReader: PageReader = {
  id: 'lic.home',
  version: '1',
  url: 'https://www.lichousing.com/housing-loan/home-loan',
  read(html: string): RateReading[] {
    const rates: string[] = [];
    for (const chunk of nextFlightChunks(html)) {
      if (!chunk.includes('roi_table')) continue;
      const $ = load(chunk);
      for (const table of $('table.roi_table').toArray()) {
        for (const tr of $(table).find('tbody tr').toArray()) {
          const cells = $(tr).find('td').toArray();
          const last = cells[cells.length - 1];
          const rate = last ? cellRate(clean($(last).text())) : null;
          if (rate) rates.push(rate);
        }
      }
    }
    const range = minMax(rates);
    return range
      ? [{ sourceId: 'lic.home', basis: 'OTHER', tenor: null, minRatePct: range.min, maxRatePct: range.max, effectiveDate: null }]
      : [];
  },
};
```

`packages/api/src/services/loanRates/sources/index.ts`:
```ts
import type { PageReader } from '../types.js';
import { rbiHomeReader } from './rbi.js';
import { sbiRatesReader } from './sbi.js';
import { hdfcHomeReader, hdfcRatesReader } from './hdfc.js';
import { iciciHomeReader, iciciPersonalReader, iciciRatesReader } from './icici.js';
import { axisHomeReader, axisMclrReader } from './axis.js';
import { kotakRatesReader } from './kotak.js';
import { bobRetailReader, pnbMclrReader, unionRatesReader } from './psuMclr.js';
import { canaraRangeReader } from './canara.js';
import { licHomeReader } from './lic.js';

/**
 * Every page the job may fetch. This list IS the URL allow-list (spec s5.2): fetchPage refuses any URL that
 * is not one of these, and no URL ever comes from a request or the database.
 */
export const PAGE_READERS: readonly PageReader[] = [
  rbiHomeReader,
  sbiRatesReader,
  hdfcHomeReader,
  hdfcRatesReader,
  iciciHomeReader,
  iciciPersonalReader,
  iciciRatesReader,
  axisHomeReader,
  axisMclrReader,
  kotakRatesReader,
  pnbMclrReader,
  bobRetailReader,
  unionRatesReader,
  canaraRangeReader,
  licHomeReader,
];

export const READER_URLS: ReadonlySet<string> = new Set(PAGE_READERS.map((r) => r.url));

export function readerById(id: string): PageReader | undefined {
  return PAGE_READERS.find((r) => r.id === id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd portfolioos/packages/api && npx vitest run test/loanRates && npx tsc --noEmit && npx eslint src/services/loanRates`
Expected: PASS; no type errors; no lint errors.

- [ ] **Step 5: Commit**

```bash
cd portfolioos
git add packages/api/src/services/loanRates/sources packages/api/test/loanRates/readers.other.test.ts packages/api/test/loanRates/readerFixtures.ts
git commit -m "feat(loan-rates): Kotak, Canara and LIC readers and the reader registry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Allow-listed, robots-aware, capped page fetcher

**Files:**
- Create: `packages/api/src/services/loanRates/robots.ts`, `packages/api/src/services/loanRates/fetchPage.ts`
- Test: `packages/api/test/loanRates/fetchPage.test.ts`

**Interfaces:**
- Consumes: `READER_URLS` (Task 4).
- Produces: `robotsAllows(robotsTxt: string, path: string): boolean`; `LOAN_RATES_USER_AGENT`, `MAX_BODY_BYTES = 2 * 1024 * 1024`, `FETCH_TIMEOUT_MS = 15_000`; `class FetchPageError extends Error { code: FetchPageErrorCode }` with codes `NOT_ALLOWED | ROBOTS_DISALLOWED | ROBOTS_UNAVAILABLE | HTTP_STATUS | TOO_LARGE | TIMEOUT | NETWORK`; `type HttpGet = (url: string, init: RequestInit) => Promise<Response>`; `interface FetchPageOptions { allowList?: ReadonlySet<string>; get?: HttpGet; timeoutMs?: number; maxBytes?: number; robotsCache?: Map<string, string> }`; `fetchPage(url: string, opts?: FetchPageOptions): Promise<string>`.

- [ ] **Step 1: Write the failing tests**

`packages/api/test/loanRates/fetchPage.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { robotsAllows } from '../../src/services/loanRates/robots.js';
import {
  FetchPageError, LOAN_RATES_USER_AGENT, fetchPage, type HttpGet,
} from '../../src/services/loanRates/fetchPage.js';
import { fixture } from './readerFixtures.js';

describe('robotsAllows on real robots.txt files', () => {
  const icici = fixture('robots-icici.bank.in.txt');
  it('ICICI: rate pages allowed; /cars/*, *.pdf and /campaigns/ disallowed; a longer Allow wins', () => {
    expect(robotsAllows(icici, '/personal-banking/loans/home-loan/interest-rates')).toBe(true);
    expect(robotsAllows(icici, '/interest-rate')).toBe(true);
    expect(robotsAllows(icici, '/cars/new')).toBe(false);
    expect(robotsAllows(icici, '/x/rates.pdf')).toBe(false);
    expect(robotsAllows(icici, '/campaigns/other')).toBe(false);
    expect(robotsAllows(icici, '/campaigns/TOB/x')).toBe(true);
  });
  it('SBI: an empty Disallow allows everything', () => {
    expect(robotsAllows(fixture('robots-sbi.bank.in.txt'), '/web/interest-rates/interest-rates/mclr')).toBe(true);
  });
  it('HDFC: only the * group applies, and it blocks just /homeloans-cug', () => {
    const hdfc = fixture('robots-hdfc.bank.in.txt');
    expect(robotsAllows(hdfc, '/interest-rates')).toBe(true);
    expect(robotsAllows(hdfc, '/homeloans-cug')).toBe(false);
  });
  it('RBI answers robots.txt with an HTML error page: no rules, so allowed', () => {
    expect(robotsAllows(fixture('robots-www.rbi.org.in.txt'), '/')).toBe(true);
  });
});

const PAGE = 'https://www.icici.bank.in/interest-rate';
const noRobots = () => new Map([['https://www.icici.bank.in', '']]);
const res = (body: string | null, status = 200, headers: Record<string, string> = {}) => new Response(body, { status, headers });
async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (err) {
    return err instanceof FetchPageError ? err.code : `UNEXPECTED ${String(err)}`;
  }
}

describe('fetchPage', () => {
  it('fetches robots.txt then the page, with the plain app User-Agent', async () => {
    const calls: { url: string; ua: string | undefined; redirect: RequestRedirect | undefined }[] = [];
    const get: HttpGet = async (url, init) => {
      calls.push({ url, ua: (init.headers as Record<string, string>)['User-Agent'], redirect: init.redirect });
      return url.endsWith('/robots.txt') ? res('User-agent: *\nDisallow: /cars/*\n') : res('<html>rates</html>');
    };
    expect(await fetchPage(PAGE, { get })).toBe('<html>rates</html>');
    expect(calls.map((c) => c.url)).toEqual(['https://www.icici.bank.in/robots.txt', PAGE]);
    expect(calls.every((c) => c.ua === LOAN_RATES_USER_AGENT && c.redirect === 'manual')).toBe(true);
    expect(LOAN_RATES_USER_AGENT).toMatch(/^EveryPaisa\//);
  });

  it('refuses any URL that is not a reader URL, without a request', async () => {
    let called = false;
    const get: HttpGet = async () => {
      called = true;
      return res('x');
    };
    expect(await codeOf(fetchPage('http://169.254.169.254/latest/meta-data', { get }))).toBe('NOT_ALLOWED');
    expect(await codeOf(fetchPage('https://www.icici.bank.in/interest-rate?x=1', { get }))).toBe('NOT_ALLOWED');
    expect(called).toBe(false);
  });

  it('honours robots: disallowed path, 4xx robots = allowed, 5xx robots = skip', async () => {
    const allow = new Set([PAGE, 'https://www.icici.bank.in/cars/x']);
    const robots = (body: string, status = 200): HttpGet => async (url) => (url.endsWith('/robots.txt') ? res(body, status) : res('page'));
    expect(await codeOf(fetchPage('https://www.icici.bank.in/cars/x', { allowList: allow, get: robots('User-agent: *\nDisallow: /cars/*') }))).toBe('ROBOTS_DISALLOWED');
    expect(await codeOf(fetchPage(PAGE, { get: robots('Unauthorised', 418) }))).toBe('OK');
    expect(await codeOf(fetchPage(PAGE, { get: robots('', 503) }))).toBe('ROBOTS_UNAVAILABLE');
  });

  it('caches robots.txt per origin across one run', async () => {
    const cache = new Map<string, string>();
    let robotsHits = 0;
    const get: HttpGet = async (url) => {
      if (url.endsWith('/robots.txt')) robotsHits++;
      return res('ok');
    };
    await fetchPage(PAGE, { get, robotsCache: cache });
    await fetchPage(PAGE, { get, robotsCache: cache });
    expect(robotsHits).toBe(1);
  });

  it('refuses a body over the cap, by header and by stream', async () => {
    expect(await codeOf(fetchPage(PAGE, { robotsCache: noRobots(), maxBytes: 10, get: async () => res('x'.repeat(11)) }))).toBe('TOO_LARGE');
    expect(await codeOf(fetchPage(PAGE, { robotsCache: noRobots(), maxBytes: 10, get: async () => res('tiny', 200, { 'content-length': '5000000' }) }))).toBe('TOO_LARGE');
    expect(await fetchPage(PAGE, { robotsCache: noRobots(), maxBytes: 10, get: async () => res('x'.repeat(10)) })).toBe('xxxxxxxxxx');
  });

  it('follows a same-host redirect but not one to another host', async () => {
    let n = 0;
    const same: HttpGet = async (url) => (n++ === 0 ? res(null, 302, { location: '/interest-rate/' }) : res(`at ${url}`));
    expect(await fetchPage(PAGE, { robotsCache: noRobots(), get: same })).toBe('at https://www.icici.bank.in/interest-rate/');
    const away: HttpGet = async () => res(null, 301, { location: 'https://evil.example/' });
    expect(await codeOf(fetchPage(PAGE, { robotsCache: noRobots(), get: away }))).toBe('NOT_ALLOWED');
  });

  it('times out, and reports HTTP and network failures by code', async () => {
    const hang: HttpGet = (_url, init) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    expect(await codeOf(fetchPage(PAGE, { robotsCache: noRobots(), timeoutMs: 50, get: hang }))).toBe('TIMEOUT');
    expect(await codeOf(fetchPage(PAGE, { robotsCache: noRobots(), get: async () => res('gone', 404) }))).toBe('HTTP_STATUS');
    expect(await codeOf(fetchPage(PAGE, { robotsCache: noRobots(), get: async () => { throw new Error('ECONNRESET'); } }))).toBe('NETWORK');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd portfolioos/packages/api && npx vitest run test/loanRates/fetchPage.test.ts`
Expected: FAIL - cannot find module `robots.js`.

- [ ] **Step 3: Implement**

`packages/api/src/services/loanRates/robots.ts`:
```ts
/**
 * Minimal robots.txt check for the `User-agent: *` group (our agent name is listed by no site, so `*` is the
 * group that applies). Longest matching rule wins; on a tie Allow wins; `*` is a wildcard and a trailing `$`
 * anchors the end, as in RFC 9309. An empty `Disallow:` allows everything.
 */
export function robotsAllows(robotsTxt: string, path: string): boolean {
  const rules: { allow: boolean; pattern: string }[] = [];
  let agents: string[] = [];
  let inRules = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const field = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (field === 'user-agent') {
      if (inRules) {
        agents = [];
        inRules = false;
      }
      agents.push(value.toLowerCase());
      continue;
    }
    if (field !== 'allow' && field !== 'disallow') continue;
    inRules = true;
    if (!agents.includes('*') || value === '') continue;
    rules.push({ allow: field === 'allow', pattern: value });
  }
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of rules) {
    if (!matches(rule.pattern, path)) continue;
    const length = rule.pattern.length;
    if (!best || length > best.length || (length === best.length && rule.allow)) best = { allow: rule.allow, length };
  }
  return best ? best.allow : true;
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${re}${anchored ? '$' : ''}`).test(path);
}
```

`packages/api/src/services/loanRates/fetchPage.ts`:
```ts
import { robotsAllows } from './robots.js';
import { READER_URLS } from './sources/index.js';

/** Plain, honest agent string naming the app; no browser impersonation. */
export const LOAN_RATES_USER_AGENT = 'EveryPaisa/1.0 (loan-rate reader; one request per page per day)';
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

export type FetchPageErrorCode =
  | 'NOT_ALLOWED'
  | 'ROBOTS_DISALLOWED'
  | 'ROBOTS_UNAVAILABLE'
  | 'HTTP_STATUS'
  | 'TOO_LARGE'
  | 'TIMEOUT'
  | 'NETWORK';

export class FetchPageError extends Error {
  constructor(
    readonly code: FetchPageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FetchPageError';
  }
}

/** The transport. Production uses global fetch; tests pass a function that returns canned Responses. */
export type HttpGet = (url: string, init: RequestInit) => Promise<Response>;

export interface FetchPageOptions {
  /** Exact URLs that may be fetched. Defaults to the reader URLs; nothing user-supplied ever gets here. */
  allowList?: ReadonlySet<string>;
  get?: HttpGet;
  timeoutMs?: number;
  maxBytes?: number;
  /** robots.txt per origin, shared across one run so each host's file is fetched once. */
  robotsCache?: Map<string, string>;
}

/**
 * GET one allow-listed page as text. Refuses anything not on the list, follows at most three redirects and
 * only within the same host, honours robots.txt for `User-agent: *`, stops after `timeoutMs` and refuses
 * bodies over `maxBytes` without buffering them. The body is returned as text; nothing in it is executed.
 */
export async function fetchPage(url: string, opts: FetchPageOptions = {}): Promise<string> {
  if (!(opts.allowList ?? READER_URLS).has(url)) throw new FetchPageError('NOT_ALLOWED', `Not an allow-listed loan-rate page: ${url}`);
  const get = opts.get ?? ((u: string, init: RequestInit) => fetch(u, init));
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? MAX_BODY_BYTES;
  const signal = AbortSignal.timeout(timeoutMs);
  const target = new URL(url);

  await assertRobotsAllow(target, get, signal, opts.robotsCache ?? new Map(), maxBytes);

  let current = target;
  for (let hop = 0; ; hop++) {
    const res = await request(get, current.toString(), signal, 'text/html,application/xhtml+xml');
    if (res.status >= 300 && res.status < 400 && res.headers.has('location')) {
      const next = new URL(res.headers.get('location')!, current);
      if (next.host !== target.host || hop >= MAX_REDIRECTS) {
        throw new FetchPageError('NOT_ALLOWED', `Redirect to ${next.toString()} is outside ${target.host}`);
      }
      current = next;
      continue;
    }
    if (!res.ok) throw new FetchPageError('HTTP_STATUS', `HTTP ${res.status} for ${current.toString()}`);
    return readCapped(res, maxBytes, current.toString());
  }
}

async function assertRobotsAllow(
  target: URL,
  get: HttpGet,
  signal: AbortSignal,
  cache: Map<string, string>,
  maxBytes: number,
): Promise<void> {
  let robots = cache.get(target.origin);
  if (robots === undefined) {
    const res = await request(get, `${target.origin}/robots.txt`, signal, 'text/plain');
    if (res.status >= 500) throw new FetchPageError('ROBOTS_UNAVAILABLE', `robots.txt answered ${res.status} for ${target.host}`);
    // 4xx (RBI answers 418) means "no robots file": everything is allowed (RFC 9309 s2.3.1.3).
    robots = res.ok ? await readCapped(res, maxBytes, `${target.origin}/robots.txt`) : '';
    cache.set(target.origin, robots);
  }
  if (!robotsAllows(robots, target.pathname)) {
    throw new FetchPageError('ROBOTS_DISALLOWED', `robots.txt disallows ${target.pathname} on ${target.host}`);
  }
}

async function request(get: HttpGet, url: string, signal: AbortSignal, accept: string): Promise<Response> {
  try {
    return await get(url, {
      signal,
      redirect: 'manual',
      headers: { 'User-Agent': LOAN_RATES_USER_AGENT, Accept: accept },
    });
  } catch (err) {
    if (signal.aborted) throw new FetchPageError('TIMEOUT', `Timed out fetching ${url}`);
    throw new FetchPageError('NETWORK', `${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function readCapped(res: Response, maxBytes: number, url: string): Promise<string> {
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new FetchPageError('TOO_LARGE', `${url} declares ${declared} bytes (cap ${maxBytes})`);
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FetchPageError('TOO_LARGE', `${url} is over ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd portfolioos/packages/api && npx vitest run test/loanRates && npx tsc --noEmit && npx eslint src/services/loanRates`
Expected: PASS; no type or lint errors.

- [ ] **Step 5: Commit**

```bash
cd portfolioos
git add packages/api/src/services/loanRates/robots.ts packages/api/src/services/loanRates/fetchPage.ts packages/api/test/loanRates/fetchPage.test.ts
git commit -m "feat(loan-rates): allow-listed page fetcher with robots, timeout and size cap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Tables, migration and the seeded source list

**Files:**
- Modify: `packages/api/prisma/schema.prisma` (append three models)
- Create (generated): `packages/api/prisma/migrations/<timestamp>_emi_loan_rates/migration.sql`
- Create: `packages/api/src/services/loanRates/sourceList.ts`
- Modify: `packages/api/test/helpers/env.setup.ts` (add `ENABLE_LOAN_RATES_CRON: 'false'` to `DEFAULTS`)
- Create: `packages/api/test/helpers/loanRates.ts`
- Test: `packages/api/test/invariants/loan-rates-not-user-scoped.test.ts`, `packages/api/test/loanRates/sourceList.test.ts`, `packages/api/test/loanRates/sourceList.db.test.ts`

**Interfaces:**
- Consumes: `readerById`, `PAGE_READERS` (Task 4), `READER_FIXTURES`, `fixture` (Task 4 test helper).
- Produces: Prisma models `LoanRateSource`, `LoanRate`, `BenchmarkRate` (fields below); `interface SourceDef { id; lender; loanType: SourceLoanType; url; mode: RateSourceMode; adapter: string | null; adapterVer: string | null }`, `AUTO_SOURCES: Readonly<Record<string, string>>` (source id -> reader id), `REPO_SOURCE_ID = 'rbi.repo'`, `buildSourceList(): SourceDef[]`, `LOAN_RATE_SOURCES` (92 rows, 30 AUTO), `ensureLoanRateSources(force?: boolean): Promise<void>`; test helper `clearLoanRateTables(): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

`packages/api/test/invariants/loan-rates-not-user-scoped.test.ts`:
```ts
/**
 * Live loan rates are shared market data (spec s5.3): no userId, no RLS policy, not in USER_SCOPED_MODELS.
 * Adding them to the Set would make the Prisma hook issue app.current_user_id for public rates, and the
 * natural follow-up ("add the policy too") would show every user an empty rate table.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { USER_SCOPED_MODELS } from '../../src/lib/prisma.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const prismaDir = join(here, '..', '..', 'prisma');
const MODELS = ['LoanRateSource', 'LoanRate', 'BenchmarkRate'] as const;

function modelBlock(schema: string, model: string): string {
  const m = new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (!m) throw new Error(`model ${model} not found in schema.prisma`);
  return m[1]!;
}

describe('loan-rate tables are global reference data', () => {
  it('are not in USER_SCOPED_MODELS', () => {
    expect(MODELS.filter((m) => USER_SCOPED_MODELS.has(m))).toEqual([]);
  });

  it('have no userId column', () => {
    const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
    for (const model of MODELS) expect(modelBlock(schema, model)).not.toMatch(/\buserId\b/);
  });

  it('no migration enables RLS or writes a policy on them', () => {
    const dir = join(prismaDir, 'migrations');
    const offenders: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name, 'migration.sql');
      if (!entry.isDirectory() || !existsSync(file)) continue;
      const sql = readFileSync(file, 'utf8').replace(/--.*$/gm, '');
      for (const model of MODELS) {
        if (new RegExp(`ALTER\\s+TABLE\\s+"?${model}"?[\\s\\S]{0,40}?ROW\\s+LEVEL\\s+SECURITY`, 'i').test(sql)) offenders.push(`${entry.name}: RLS on ${model}`);
        if (new RegExp(`CREATE\\s+POLICY[\\s\\S]{0,120}?ON\\s+"?${model}"?\\b`, 'i').test(sql)) offenders.push(`${entry.name}: policy on ${model}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

`packages/api/test/loanRates/sourceList.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { AUTO_SOURCES, LOAN_RATE_SOURCES, REPO_SOURCE_ID } from '../../src/services/loanRates/sourceList.js';
import { PAGE_READERS, readerById } from '../../src/services/loanRates/sources/index.js';
import { READER_FIXTURES, fixture } from './readerFixtures.js';

describe('source list', () => {
  it('has 92 unique sources, 30 of them AUTO', () => {
    expect(LOAN_RATE_SOURCES).toHaveLength(92);
    expect(new Set(LOAN_RATE_SOURCES.map((s) => s.id)).size).toBe(92);
    expect(LOAN_RATE_SOURCES.filter((s) => s.mode === 'AUTO')).toHaveLength(30);
  });

  it('every AUTO source points at its reader page; every MANUAL source has an https page and no adapter', () => {
    for (const s of LOAN_RATE_SOURCES) {
      expect(new URL(s.url).protocol).toBe('https:');
      if (s.mode === 'AUTO') {
        const reader = readerById(AUTO_SOURCES[s.id]!)!;
        expect(s).toMatchObject({ url: reader.url, adapter: reader.id, adapterVer: reader.version });
      } else {
        expect(s).toMatchObject({ adapter: null, adapterVer: null });
      }
    }
  });

  it('each reader produces exactly the AUTO sources that name it, on its real captures', () => {
    for (const reader of PAGE_READERS) {
      const produced = new Set<string>();
      for (const name of READER_FIXTURES[reader.id]!) for (const r of reader.read(fixture(name))) produced.add(r.sourceId);
      const expected = LOAN_RATE_SOURCES.filter((s) => s.adapter === reader.id).map((s) => s.id).sort();
      expect([...produced].sort(), reader.id).toEqual(expected);
    }
  });

  it('records the discovery rulings', () => {
    const byId = new Map(LOAN_RATE_SOURCES.map((s) => [s.id, s]));
    expect(byId.get(REPO_SOURCE_ID)).toMatchObject({ lender: 'RBI', loanType: 'REPO', mode: 'AUTO' });
    expect(byId.get('icici.car')?.mode).toBe('MANUAL');
    expect(byId.get('sbi.lap')).toMatchObject({ mode: 'MANUAL', url: 'https://sbi.bank.in/web/interest-rates/interest-rates/loan-schemes-interest-rates/loans-against-property' });
    expect(byId.get('kotak.mclr')?.mode).toBe('MANUAL');
    expect(byId.get('canara.mclr')?.mode).toBe('MANUAL');
    expect(byId.get('bob.home')?.mode).toBe('MANUAL');
    expect(LOAN_RATE_SOURCES.filter((s) => s.lender === 'LIC Housing Finance').map((s) => s.id)).toEqual(['lic.home']);
  });
});
```

`packages/api/test/helpers/loanRates.ts`:
```ts
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';

/**
 * The loan-rate tables are global, so per-user cleanup cannot reach them. Suites that write rates own these
 * tables in the isolated local test DB and reset them before and after.
 */
export async function clearLoanRateTables(): Promise<void> {
  await runAsSystem(async () => {
    await prisma.loanRate.deleteMany({});
    await prisma.benchmarkRate.deleteMany({});
    await prisma.loanRateSource.updateMany({ data: { lastSuccessAt: null, lastErrorAt: null, lastError: null } });
  });
}
```

`packages/api/test/loanRates/sourceList.db.test.ts`:
```ts
import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { ensureLoanRateSources, LOAN_RATE_SOURCES } from '../../src/services/loanRates/sourceList.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

describe('ensureLoanRateSources', () => {
  it('upserts all 92 rows idempotently, readable with no user context (no RLS)', async () => {
    await ensureLoanRateSources(true);
    await ensureLoanRateSources(true);
    const rows = await prisma.loanRateSource.findMany({ where: { id: { in: LOAN_RATE_SOURCES.map((s) => s.id) } } });
    expect(rows).toHaveLength(92);
    expect(rows.find((r) => r.id === 'kotak.lap')).toMatchObject({ mode: 'AUTO', adapter: 'kotak.rates', adapterVer: '1', lender: 'Kotak', loanType: 'LAP' });
    expect(rows.find((r) => r.id === 'pnb.home')).toMatchObject({ mode: 'MANUAL', adapter: null });
    expect(rows.every((r) => r.createdAt instanceof Date)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd portfolioos/packages/api && npx vitest run test/invariants/loan-rates-not-user-scoped.test.ts test/loanRates/sourceList.test.ts`
Expected: FAIL - `model LoanRateSource not found in schema.prisma`; cannot find module `sourceList.js`.

- [ ] **Step 3: Add the models**

Append to `packages/api/prisma/schema.prisma`:
```prisma
// --- EMI calculator plan 2: live loan rates (spec s5.3) ---------------------
//
// Global reference data: no userId, no RLS, not in USER_SCOPED_MODELS
// (asserted by test/invariants/loan-rates-not-user-scoped.test.ts).
// Rows in LoanRate are append-only history: a reading inserts a row, an
// ACTIVE AUTO row supersedes the previous ACTIVE AUTO row for the same
// (source, tenor), and the effective rate is the latest MANUAL ACTIVE row
// if any, else the latest AUTO ACTIVE row.

model LoanRateSource {
  id            String     @id // e.g. "sbi.home"
  lender        String // "SBI"
  loanType      String // HOME | CAR | ... | MCLR | REPO
  url           String
  mode          String // AUTO | MANUAL
  adapter       String? // page reader id for AUTO sources
  adapterVer    String?
  lastSuccessAt DateTime?  @db.Timestamptz(3)
  lastErrorAt   DateTime?  @db.Timestamptz(3)
  lastError     String?
  createdAt     DateTime   @default(now()) @db.Timestamptz(3)
  rates         LoanRate[]

  @@index([loanType])
}

model LoanRate {
  id               String         @id @default(cuid())
  sourceId         String
  source           LoanRateSource @relation(fields: [sourceId], references: [id])
  basis            String // REPO_LINKED | MCLR | FIXED | OTHER
  tenor            String? // MCLR tenor: ON | 1M | 3M | 6M | 1Y
  minRatePct       Decimal        @db.Decimal(6, 3)
  maxRatePct       Decimal?       @db.Decimal(6, 3)
  effectiveDate    DateTime?      @db.Date
  fetchedAt        DateTime       @default(now()) @db.Timestamptz(3)
  origin           String // AUTO | MANUAL
  status           String // ACTIVE | SUSPECT | REJECTED | SUPERSEDED
  note             String?
  createdById      String? // admin for MANUAL
  sourceAdapter    String? // page reader id that produced an AUTO row
  sourceAdapterVer String?

  @@index([sourceId, status, fetchedAt])
}

model BenchmarkRate {
  id            String   @id @default(cuid())
  kind          String // REPO | MCLR
  lender        String? // null for REPO
  tenor         String?
  ratePct       Decimal  @db.Decimal(6, 3)
  effectiveDate DateTime @db.Date
  fetchedAt     DateTime @default(now()) @db.Timestamptz(3)

  @@unique([kind, lender, tenor, effectiveDate])
}
```

- [ ] **Step 4: Create and apply the migration on the isolated local DB only**

Run (from `portfolioos/packages/api`, with BOTH overrides; never source `.env`):
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split npx prisma migrate dev --name emi_loan_rates
```
Expected: `prisma/migrations/<timestamp>_emi_loan_rates/migration.sql` is created and applied, and the client is regenerated. If Prisma reports drift or asks to reset the database, answer no, do not reset, and stop with BLOCKED.

Then check the SQL: it must contain exactly three `CREATE TABLE`, the `LoanRate_sourceId_fkey` foreign key, two plain indexes and one unique index, and no `DROP`, `ROW LEVEL SECURITY` or `POLICY`:
```bash
grep -cE "CREATE TABLE" prisma/migrations/*_emi_loan_rates/migration.sql
grep -nE "DROP|ROW LEVEL|POLICY" prisma/migrations/*_emi_loan_rates/migration.sql || echo "clean"
```
Expected: `3`, then `clean`.

- [ ] **Step 5: Implement the source list and test wiring**

`packages/api/src/services/loanRates/sourceList.ts`:
```ts
import { RATE_LOAN_TYPES, type RateLoanType, type RateSourceMode } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { readerById } from './sources/index.js';
import type { SourceLoanType } from './types.js';

/**
 * The source list (spec s5.1), seeded from the discovery of 12/10/2026. Code is the source of truth: every
 * run upserts these rows, so a URL or mode change ships as a code change, never as a database edit, and no
 * URL ever comes from a request.
 */
export interface SourceDef {
  id: string;
  lender: string;
  loanType: SourceLoanType;
  url: string;
  mode: RateSourceMode;
  adapter: string | null;
  adapterVer: string | null;
}

interface LenderDef {
  key: string;
  name: string;
  /** Where a person checks this lender's rates by hand (MANUAL sources). */
  url: string;
  loanTypes: readonly RateLoanType[];
  mclr: boolean;
}

const LENDERS: readonly LenderDef[] = [
  { key: 'sbi', name: 'SBI', url: 'https://sbi.bank.in/web/interest-rates/interest-rates', loanTypes: RATE_LOAN_TYPES, mclr: true },
  { key: 'hdfc', name: 'HDFC Bank', url: 'https://www.hdfc.bank.in/interest-rates', loanTypes: RATE_LOAN_TYPES, mclr: true },
  { key: 'icici', name: 'ICICI Bank', url: 'https://www.icici.bank.in/interest-rate', loanTypes: RATE_LOAN_TYPES, mclr: true },
  { key: 'axis', name: 'Axis Bank', url: 'https://www.axis.bank.in/interest-rates-and-charges', loanTypes: RATE_LOAN_TYPES, mclr: true },
  { key: 'kotak', name: 'Kotak', url: 'https://www.kotak.bank.in/en/rates.html', loanTypes: RATE_LOAN_TYPES, mclr: true },
  { key: 'pnb', name: 'PNB', url: 'https://pnb.bank.in/interst-rate-on-advances-linked-to-mclr.html', loanTypes: RATE_LOAN_TYPES, mclr: true },
  {
    key: 'bob',
    name: 'Bank of Baroda',
    url: 'https://bankofbaroda.bank.in/interest-rate-and-service-charges/retail-loans-interest-rates',
    loanTypes: RATE_LOAN_TYPES,
    mclr: true,
  },
  {
    key: 'canara',
    name: 'Canara Bank',
    url: 'https://www.canarabank.bank.in/pages/rates-of-interest-for-retail-lending-schemes-linked-to-rllr',
    loanTypes: RATE_LOAN_TYPES,
    mclr: true,
  },
  {
    key: 'union',
    name: 'Union Bank',
    url: 'https://www.unionbankofindia.bank.in/en/common/interest-rates-loans-and-advances',
    loanTypes: RATE_LOAN_TYPES,
    mclr: true,
  },
  // LIC HFL offers home loans only among our loan types and publishes no MCLR (its LHPLR is a PLR, not an offer).
  { key: 'lic', name: 'LIC Housing Finance', url: 'https://www.lichousing.com/housing-loan/home-loan', loanTypes: ['HOME'], mclr: false },
];

/** MANUAL sources for which discovery found a more specific page than the lender's index. */
const MANUAL_URLS: Readonly<Record<string, string>> = {
  'sbi.lap': 'https://sbi.bank.in/web/interest-rates/interest-rates/loan-schemes-interest-rates/loans-against-property',
  'kotak.mclr': 'https://www.kotak.bank.in/en/rates/mclr-rate.html',
  'canara.mclr': 'https://www.canarabank.bank.in/pages/loans-interest-rates',
  'bob.business': 'https://bankofbaroda.bank.in/interest-rate-and-service-charges/msme-loans-interest-rates',
};

/** Every AUTO source and the page reader that feeds it. Everything else is MANUAL (plan ruling 2). */
export const AUTO_SOURCES: Readonly<Record<string, string>> = {
  'rbi.repo': 'rbi.home',
  'sbi.home': 'sbi.rates',
  'sbi.personal': 'sbi.rates',
  'sbi.education': 'sbi.rates',
  'sbi.car': 'sbi.rates',
  'sbi.gold': 'sbi.rates',
  'sbi.las': 'sbi.rates',
  'sbi.mclr': 'sbi.rates',
  'hdfc.home': 'hdfc.home',
  'hdfc.personal': 'hdfc.rates',
  'hdfc.car': 'hdfc.rates',
  'hdfc.mclr': 'hdfc.rates',
  'icici.home': 'icici.home',
  'icici.personal': 'icici.personal',
  'icici.mclr': 'icici.rates',
  'axis.home': 'axis.home',
  'axis.mclr': 'axis.mclr',
  'kotak.home': 'kotak.rates',
  'kotak.personal': 'kotak.rates',
  'kotak.business': 'kotak.rates',
  'kotak.lap': 'kotak.rates',
  'kotak.las': 'kotak.rates',
  'kotak.education': 'kotak.rates',
  'pnb.mclr': 'pnb.mclr',
  'bob.mclr': 'bob.retail',
  'union.mclr': 'union.rates',
  'canara.home': 'canara.range',
  'canara.car': 'canara.range',
  'canara.lap': 'canara.range',
  'lic.home': 'lic.home',
};

export const REPO_SOURCE_ID = 'rbi.repo';

function define(id: string, lender: string, loanType: SourceLoanType, manualUrl: string): SourceDef {
  const readerId = AUTO_SOURCES[id];
  if (readerId === undefined) return { id, lender, loanType, url: manualUrl, mode: 'MANUAL', adapter: null, adapterVer: null };
  const reader = readerById(readerId);
  if (!reader) throw new Error(`AUTO loan-rate source ${id} names unknown reader ${readerId}`);
  return { id, lender, loanType, url: reader.url, mode: 'AUTO', adapter: reader.id, adapterVer: reader.version };
}

export function buildSourceList(): SourceDef[] {
  const out: SourceDef[] = [define(REPO_SOURCE_ID, 'RBI', 'REPO', 'https://www.rbi.org.in/')];
  for (const lender of LENDERS) {
    const types: SourceLoanType[] = [...lender.loanTypes, ...(lender.mclr ? (['MCLR'] as const) : [])];
    for (const loanType of types) {
      const id = `${lender.key}.${loanType.toLowerCase()}`;
      out.push(define(id, lender.name, loanType, MANUAL_URLS[id] ?? lender.url));
    }
  }
  return out;
}

export const LOAN_RATE_SOURCES: readonly SourceDef[] = buildSourceList();

let ensured: Promise<void> | null = null;

/**
 * Upsert every source row from code. Idempotent; memoised per process so request handlers can call it
 * freely. `force` re-runs it (the job does, so a deploy that changes a URL takes effect on the next run).
 */
export function ensureLoanRateSources(force = false): Promise<void> {
  if (ensured === null || force) {
    ensured = (async () => {
      for (const source of LOAN_RATE_SOURCES) {
        const { id, ...fields } = source;
        await prisma.loanRateSource.upsert({ where: { id }, create: source, update: fields });
      }
    })();
    // A failed upsert must not be remembered as done; the next caller retries.
    ensured.catch(() => {
      ensured = null;
    });
  }
  return ensured;
}
```

`packages/api/test/helpers/env.setup.ts`: add one entry to `DEFAULTS` (the job must never schedule itself inside a test process):
```ts
  ENABLE_LOAN_RATES_CRON: 'false',
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/invariants/loan-rates-not-user-scoped.test.ts test/invariants/user-scoped-coverage.test.ts test/loanRates
npx tsc --noEmit
```
Expected: all PASS (including the existing `user-scoped-coverage` invariant: the new tables have neither policy nor `userId`); no type errors.

- [ ] **Step 7: Commit**

```bash
cd portfolioos
git add packages/api/prisma/schema.prisma packages/api/prisma/migrations packages/api/src/services/loanRates/sourceList.ts packages/api/test/helpers/env.setup.ts packages/api/test/helpers/loanRates.ts packages/api/test/invariants/loan-rates-not-user-scoped.test.ts packages/api/test/loanRates/sourceList.test.ts packages/api/test/loanRates/sourceList.db.test.ts
git commit -m "feat(loan-rates): rate tables, migration and seeded source list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Sanity rules and the append-only rate store

**Files:**
- Create: `packages/api/src/services/loanRates/sanity.ts`, `packages/api/src/services/loanRates/store.ts`
- Test: `packages/api/test/loanRates/sanity.test.ts`, `packages/api/test/loanRates/store.db.test.ts`

**Interfaces:**
- Consumes: Task 1 types and `normPct`; Task 6 models, `ensureLoanRateSources`, `clearLoanRateTables`; `prisma`, `runInTransaction` from `lib/prisma.ts`; `runAsSystem` from `lib/requestContext.ts`.
- Produces (sanity): `MIN_BELIEVABLE_PCT`, `MAX_BELIEVABLE_PCT`, `MAX_CEILING_PCT`, `MAX_JUMP_PP`, `MAX_FUTURE_DAYS = 7`, `MAX_ASOF_AGE_DAYS = { MCLR: 180, PRODUCT: 400 }`, `STALE_AFTER_DAYS = 7`, `type SanityReason = 'OUT_OF_RANGE' | 'BAD_MAX' | 'JUMP' | 'ASOF_FUTURE' | 'ASOF_STALE'`, `checkReading(reading, lastActiveMinPct: string | null, today: string): { status: 'ACTIVE' | 'SUSPECT'; reasons: SanityReason[] }`, `istDate(at: Date): string`, `isSourceStale(source: { mode; lastSuccessAt; createdAt }, now): boolean`.
- Produces (store): `interface StoreSource { id; lender; loanType }`, `type RecordOutcome = 'ACTIVE' | 'SUSPECT' | 'UNCHANGED'`, `dateOnly(iso): Date`, `isoDate(d: Date | null): string | null`, `pctString(d: Prisma.Decimal): string`, `rateKey(sourceId, tenor): string`, `toReadingWire(row: LoanRate): LoanRateReadingWire`, `recordReading(source, reading, reader: { id; version }, now): Promise<{ outcome; rowId; reasons }>`, `activateSuspect(id, now): Promise<LoanRate | null>`, `writeBenchmark(source, tenor, ratePct, effectiveDate, now): Promise<BenchmarkRate | null>`, `effectiveRates(sourceIds): Promise<Map<string, LoanRate>>` keyed by `rateKey`.

- [ ] **Step 1: Write the failing tests**

`packages/api/test/loanRates/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { checkReading, istDate, isSourceStale } from '../../src/services/loanRates/sanity.js';
import type { RateReading } from '../../src/services/loanRates/types.js';

const TODAY = '2026-10-12';
const r = (over: Partial<RateReading> = {}): RateReading => ({
  sourceId: 'x.home', basis: 'OTHER', tenor: null, minRatePct: '8.50', maxRatePct: null, effectiveDate: null, ...over,
});
const verdict = (reading: RateReading, last: string | null = null) => checkReading(reading, last, TODAY);

describe('checkReading', () => {
  it('a plain reading is ACTIVE', () => expect(verdict(r())).toEqual({ status: 'ACTIVE', reasons: [] }));
  it.each(['3.99', '30.01'])('min %s is outside 4-30', (min) => expect(verdict(r({ minRatePct: min })).reasons).toEqual(['OUT_OF_RANGE']));
  it('the bounds themselves are fine', () => {
    expect(verdict(r({ minRatePct: '4.00' })).status).toBe('ACTIVE');
    expect(verdict(r({ minRatePct: '30.00' })).status).toBe('ACTIVE');
  });
  it('a ceiling above 30 is fine up to 40 (Kotak business 30.50)', () => {
    expect(verdict(r({ maxRatePct: '30.50' })).status).toBe('ACTIVE');
    expect(verdict(r({ maxRatePct: '40.01' })).reasons).toEqual(['BAD_MAX']);
    expect(verdict(r({ maxRatePct: '8.00' })).reasons).toEqual(['BAD_MAX']);
  });
  it('more than 2 pp from the last ACTIVE min is a jump, either way; exactly 2 is not', () => {
    expect(verdict(r({ minRatePct: '10.51' }), '8.50').reasons).toEqual(['JUMP']);
    expect(verdict(r({ minRatePct: '6.49' }), '8.50').reasons).toEqual(['JUMP']);
    expect(verdict(r({ minRatePct: '10.50' }), '8.50').status).toBe('ACTIVE');
  });
  it('as-of more than 7 days ahead is a misparse', () => {
    expect(verdict(r({ effectiveDate: '2026-10-19' })).status).toBe('ACTIVE');
    expect(verdict(r({ effectiveDate: '2026-10-20' })).reasons).toEqual(['ASOF_FUTURE']);
  });
  it('a product sheet older than 400 days, or MCLR older than 180 days, is stale', () => {
    expect(verdict(r({ effectiveDate: '2025-09-07' })).status).toBe('ACTIVE');
    expect(verdict(r({ effectiveDate: '2025-09-06' })).reasons).toEqual(['ASOF_STALE']);
    expect(verdict(r({ tenor: '1Y', basis: 'MCLR', effectiveDate: '2026-04-15' })).status).toBe('ACTIVE');
    expect(verdict(r({ tenor: '1Y', basis: 'MCLR', effectiveDate: '2026-04-14' })).reasons).toEqual(['ASOF_STALE']);
  });
  it('reasons accumulate', () => {
    expect(verdict(r({ minRatePct: '2.00', effectiveDate: '2027-01-01' }), '8.50').reasons).toEqual(['OUT_OF_RANGE', 'JUMP', 'ASOF_FUTURE']);
  });
});

describe('dates and staleness', () => {
  it('istDate turns over at 18:30 UTC', () => {
    expect(istDate(new Date('2026-10-11T18:29:00Z'))).toBe('2026-10-11');
    expect(istDate(new Date('2026-10-11T18:31:00Z'))).toBe('2026-10-12');
  });
  it('an AUTO source is stale after 7 days without success, counting from creation if it never succeeded', () => {
    const now = new Date('2026-10-12T02:00:00Z');
    const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
    expect(isSourceStale({ mode: 'AUTO', lastSuccessAt: days(7), createdAt: days(30) }, now)).toBe(false);
    expect(isSourceStale({ mode: 'AUTO', lastSuccessAt: days(7.01), createdAt: days(30) }, now)).toBe(true);
    expect(isSourceStale({ mode: 'AUTO', lastSuccessAt: null, createdAt: days(8) }, now)).toBe(true);
    expect(isSourceStale({ mode: 'AUTO', lastSuccessAt: null, createdAt: days(1) }, now)).toBe(false);
    expect(isSourceStale({ mode: 'MANUAL', lastSuccessAt: null, createdAt: days(400) }, now)).toBe(false);
  });
});
```

`packages/api/test/loanRates/store.db.test.ts`:
```ts
import 'dotenv/config';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { ensureLoanRateSources } from '../../src/services/loanRates/sourceList.js';
import {
  activateSuspect, effectiveRates, rateKey, recordReading, type StoreSource,
} from '../../src/services/loanRates/store.js';
import type { RateReading } from '../../src/services/loanRates/types.js';
import { clearLoanRateTables } from '../helpers/loanRates.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const NOW = new Date('2026-10-12T02:00:00Z');
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const READER = { id: 'test.reader', version: '1' };
const HOME: StoreSource = { id: 'hdfc.home', lender: 'HDFC Bank', loanType: 'HOME' };
const MCLR: StoreSource = { id: 'sbi.mclr', lender: 'SBI', loanType: 'MCLR' };
const REPO: StoreSource = { id: 'rbi.repo', lender: 'RBI', loanType: 'REPO' };
const home = (min: string, max: string | null = '13.45'): RateReading => ({
  sourceId: 'hdfc.home', basis: 'REPO_LINKED', tenor: null, minRatePct: min, maxRatePct: max, effectiveDate: null,
});
const sys = <T>(fn: () => Promise<T>) => runAsSystem(fn);

beforeAll(async () => {
  await sys(() => ensureLoanRateSources(true));
});
beforeEach(clearLoanRateTables);
afterAll(clearLoanRateTables);

describe('recordReading', () => {
  it('first reading is ACTIVE and carries the reader id and version', async () => {
    const res = await sys(() => recordReading(HOME, home('8.00'), READER, NOW));
    expect(res.outcome).toBe('ACTIVE');
    const row = await prisma.loanRate.findUniqueOrThrow({ where: { id: res.rowId } });
    expect(row).toMatchObject({ origin: 'AUTO', status: 'ACTIVE', sourceAdapter: 'test.reader', sourceAdapterVer: '1', tenor: null });
    expect(row.minRatePct.toString()).toBe('8');
  });

  it('an identical reading inserts nothing (two runs in one day)', async () => {
    await sys(() => recordReading(HOME, home('8.00'), READER, NOW));
    const again = await sys(() => recordReading(HOME, home('8.00'), READER, later(60)));
    expect(again.outcome).toBe('UNCHANGED');
    expect(await prisma.loanRate.count({ where: { sourceId: 'hdfc.home' } })).toBe(1);
  });

  it('a changed reading supersedes the previous ACTIVE row', async () => {
    const first = await sys(() => recordReading(HOME, home('8.00'), READER, NOW));
    const second = await sys(() => recordReading(HOME, home('8.25'), READER, later(1)));
    expect(second.outcome).toBe('ACTIVE');
    expect((await prisma.loanRate.findUniqueOrThrow({ where: { id: first.rowId } })).status).toBe('SUPERSEDED');
  });

  it('a jump of more than 2 pp is SUSPECT and the old rate stays effective', async () => {
    const first = await sys(() => recordReading(HOME, home('8.00'), READER, NOW));
    const jump = await sys(() => recordReading(HOME, home('11.00'), READER, later(1)));
    expect(jump).toMatchObject({ outcome: 'SUSPECT', reasons: ['JUMP'] });
    const eff = await effectiveRates(['hdfc.home']);
    expect(eff.get(rateKey('hdfc.home', null))?.id).toBe(first.rowId);
    expect((await prisma.loanRate.findUniqueOrThrow({ where: { id: jump.rowId } })).note).toBe('JUMP');
  });

  it('approving a SUSPECT reading makes it the effective one', async () => {
    await sys(() => recordReading(HOME, home('8.00'), READER, NOW));
    const jump = await sys(() => recordReading(HOME, home('11.00'), READER, later(1)));
    const approved = await sys(() => activateSuspect(jump.rowId, later(2)));
    expect(approved?.status).toBe('ACTIVE');
    expect((await effectiveRates(['hdfc.home'])).get(rateKey('hdfc.home', null))?.id).toBe(jump.rowId);
    expect(await sys(() => activateSuspect(jump.rowId, later(3)))).toBeNull();
  });
});

describe('benchmarks', () => {
  const mclr1y = (rate: string, date: string): RateReading => ({
    sourceId: 'sbi.mclr', basis: 'MCLR', tenor: '1Y', minRatePct: rate, maxRatePct: null, effectiveDate: date,
  });

  it('an ACTIVE MCLR reading writes one BenchmarkRate per change, dated from the page', async () => {
    await sys(() => recordReading(MCLR, mclr1y('8.70', '2026-09-15'), READER, NOW));
    await sys(() => recordReading(MCLR, mclr1y('8.70', '2026-09-15'), READER, later(1)));
    await sys(() => recordReading(MCLR, mclr1y('8.60', '2026-10-15'), READER, later(2)));
    const rows = await prisma.benchmarkRate.findMany({ where: { kind: 'MCLR', lender: 'SBI', tenor: '1Y' }, orderBy: { effectiveDate: 'asc' } });
    expect(rows.map((b) => [b.ratePct.toString(), b.effectiveDate.toISOString().slice(0, 10)])).toEqual([
      ['8.7', '2026-09-15'],
      ['8.6', '2026-10-15'],
    ]);
  });

  it('the repo rate has no page date, so a change is dated the IST day it was first seen', async () => {
    const repo = (rate: string): RateReading => ({ sourceId: 'rbi.repo', basis: 'OTHER', tenor: null, minRatePct: rate, maxRatePct: null, effectiveDate: null });
    await sys(() => recordReading(REPO, repo('5.50'), READER, NOW));
    await sys(() => recordReading(REPO, repo('5.50'), READER, later(600)));
    const rows = await prisma.benchmarkRate.findMany({ where: { kind: 'REPO' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lender: null, tenor: null });
    expect(rows[0]!.effectiveDate.toISOString().slice(0, 10)).toBe('2026-10-12');
  });

  it('a product reading never writes a benchmark', async () => {
    await sys(() => recordReading(HOME, home('8.00'), READER, NOW));
    expect(await prisma.benchmarkRate.count()).toBe(0);
  });
});

describe('effectiveRates', () => {
  it('MANUAL wins over a newer AUTO row, per (source, tenor)', async () => {
    await sys(() => prisma.loanRate.create({
      data: { sourceId: 'hdfc.home', basis: 'REPO_LINKED', minRatePct: '7.95', origin: 'MANUAL', status: 'ACTIVE', fetchedAt: NOW, note: 'bank confirmed' },
    }));
    const auto = await sys(() => recordReading(HOME, home('8.00'), READER, later(5)));
    await sys(() => recordReading(MCLR, { sourceId: 'sbi.mclr', basis: 'MCLR', tenor: 'ON', minRatePct: '7.85', maxRatePct: null, effectiveDate: '2026-09-15' }, READER, NOW));
    const eff = await effectiveRates(['hdfc.home', 'sbi.mclr']);
    expect(eff.get(rateKey('hdfc.home', null))?.origin).toBe('MANUAL');
    expect(eff.get(rateKey('hdfc.home', null))?.id).not.toBe(auto.rowId);
    expect(eff.get(rateKey('sbi.mclr', 'ON'))?.minRatePct.toString()).toBe('7.85');
    expect(eff.has(rateKey('sbi.mclr', '1Y'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/loanRates/sanity.test.ts test/loanRates/store.db.test.ts
```
Expected: FAIL - cannot find module `sanity.js` / `store.js`.

- [ ] **Step 3: Implement**

`packages/api/src/services/loanRates/sanity.ts`:
```ts
import { Decimal } from 'decimal.js';
import type { RateReading } from './types.js';

/** spec s5.4: a headline rate outside 4-30 % is not believable for a retail loan. */
export const MIN_BELIEVABLE_PCT = new Decimal(4);
export const MAX_BELIEVABLE_PCT = new Decimal(30);
/** Ceilings are published higher than the headline band (Kotak business loans go to 30.50 %). */
export const MAX_CEILING_PCT = new Decimal(40);
/** spec s5.4: more than 2 percentage points away from the last ACTIVE reading. */
export const MAX_JUMP_PP = new Decimal(2);
/** As-of guard: a page date this far in the future is a misparse. */
export const MAX_FUTURE_DAYS = 7;
/** As-of guard: MCLR is reset at least half-yearly; a product sheet at least yearly. */
export const MAX_ASOF_AGE_DAYS = { MCLR: 180, PRODUCT: 400 } as const;

export type SanityReason = 'OUT_OF_RANGE' | 'BAD_MAX' | 'JUMP' | 'ASOF_FUTURE' | 'ASOF_STALE';

export interface SanityVerdict {
  status: 'ACTIVE' | 'SUSPECT';
  reasons: SanityReason[];
}

const DAY_MS = 86_400_000;

/** Calendar date in India for an instant, as 'YYYY-MM-DD'. */
export function istDate(at: Date): string {
  return new Date(at.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

/**
 * Decide whether an AUTO reading may be shown to users. `lastActiveMinPct` is the min rate of the latest
 * ACTIVE AUTO row for the same (source, tenor), or null for the first reading. The repo rate carries no page
 * date, so the as-of guard only runs when the page gave one.
 */
export function checkReading(reading: RateReading, lastActiveMinPct: string | null, today: string): SanityVerdict {
  const reasons: SanityReason[] = [];
  const min = new Decimal(reading.minRatePct);
  if (min.lessThan(MIN_BELIEVABLE_PCT) || min.greaterThan(MAX_BELIEVABLE_PCT)) reasons.push('OUT_OF_RANGE');
  if (reading.maxRatePct !== null) {
    const max = new Decimal(reading.maxRatePct);
    if (max.lessThan(min) || max.greaterThan(MAX_CEILING_PCT)) reasons.push('BAD_MAX');
  }
  if (lastActiveMinPct !== null && min.minus(lastActiveMinPct).abs().greaterThan(MAX_JUMP_PP)) reasons.push('JUMP');
  if (reading.effectiveDate !== null) {
    const age = daysBetween(reading.effectiveDate, today);
    const maxAge = reading.tenor !== null ? MAX_ASOF_AGE_DAYS.MCLR : MAX_ASOF_AGE_DAYS.PRODUCT;
    if (age < -MAX_FUTURE_DAYS) reasons.push('ASOF_FUTURE');
    else if (age > maxAge) reasons.push('ASOF_STALE');
  }
  return { status: reasons.length === 0 ? 'ACTIVE' : 'SUSPECT', reasons };
}

/** spec s5.4: an AUTO source with no successful reading for this many days is shown as stale. */
export const STALE_AFTER_DAYS = 7;

/**
 * A never-successful source counts from when it was created, so a page that has been failing since the
 * first deploy goes stale after a week instead of never.
 */
export function isSourceStale(source: { mode: string; lastSuccessAt: Date | null; createdAt: Date }, now: Date): boolean {
  if (source.mode !== 'AUTO') return false;
  const since = source.lastSuccessAt ?? source.createdAt;
  return now.getTime() - since.getTime() > STALE_AFTER_DAYS * DAY_MS;
}
```

`packages/api/src/services/loanRates/store.ts`:
```ts
import type { BenchmarkRate, LoanRate, Prisma } from '@prisma/client';
import type { LoanRateReadingWire, MclrTenor, RateBasis, RateOrigin, RateStatus } from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { checkReading, istDate, type SanityReason } from './sanity.js';
import { normPct } from './sources/parseUtil.js';
import type { PageReader, RateReading } from './types.js';

/** What a source looks like to the store: enough to name benchmark rows. */
export interface StoreSource {
  id: string;
  lender: string;
  loanType: string;
}

export type RecordOutcome = 'ACTIVE' | 'SUSPECT' | 'UNCHANGED';

export function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function isoDate(d: Date | null): string | null {
  return d === null ? null : d.toISOString().slice(0, 10);
}

/** Prisma Decimal -> wire string with at least two decimals ("8.50", "8.125", "-0.25"). */
export function pctString(d: Prisma.Decimal): string {
  return normPct(d.toString());
}

/** Override key: basis is an attribute of the rate, not part of the key (plan ruling: effective per source + tenor). */
export function rateKey(sourceId: string, tenor: string | null): string {
  return `${sourceId}|${tenor ?? ''}`;
}

export function toReadingWire(r: LoanRate): LoanRateReadingWire {
  return {
    id: r.id,
    sourceId: r.sourceId,
    basis: r.basis as RateBasis,
    tenor: r.tenor as MclrTenor | null,
    minRatePct: pctString(r.minRatePct),
    maxRatePct: r.maxRatePct === null ? null : pctString(r.maxRatePct),
    effectiveDate: isoDate(r.effectiveDate),
    fetchedAt: r.fetchedAt.toISOString(),
    origin: r.origin as RateOrigin,
    status: r.status as RateStatus,
    note: r.note,
    sourceAdapter: r.sourceAdapter,
    sourceAdapterVer: r.sourceAdapterVer,
  };
}

function sameValues(row: LoanRate, r: RateReading): boolean {
  const sameMax = row.maxRatePct === null ? r.maxRatePct === null : r.maxRatePct !== null && row.maxRatePct.equals(r.maxRatePct);
  return row.basis === r.basis && row.minRatePct.equals(r.minRatePct) && sameMax && isoDate(row.effectiveDate) === r.effectiveDate;
}

/**
 * Append one AUTO reading (spec s5.3/s5.4). A reading identical to the latest AUTO row for the same
 * (source, tenor) inserts nothing, so a second run on the same day is a no-op. Otherwise the sanity rules
 * decide ACTIVE or SUSPECT; an ACTIVE row supersedes earlier ACTIVE AUTO rows and updates the benchmark
 * series, a SUSPECT row changes nothing users see.
 */
export async function recordReading(
  source: StoreSource,
  reading: RateReading,
  reader: Pick<PageReader, 'id' | 'version'>,
  now: Date,
): Promise<{ outcome: RecordOutcome; rowId: string; reasons: SanityReason[] }> {
  const key = { sourceId: source.id, tenor: reading.tenor, origin: 'AUTO' };
  const latest = await prisma.loanRate.findFirst({
    where: { ...key, status: { in: ['ACTIVE', 'SUSPECT'] } },
    orderBy: { fetchedAt: 'desc' },
  });
  if (latest && sameValues(latest, reading)) return { outcome: 'UNCHANGED', rowId: latest.id, reasons: [] };

  const lastActive =
    latest?.status === 'ACTIVE'
      ? latest
      : await prisma.loanRate.findFirst({ where: { ...key, status: 'ACTIVE' }, orderBy: { fetchedAt: 'desc' } });
  const verdict = checkReading(reading, lastActive ? lastActive.minRatePct.toString() : null, istDate(now));
  const note = [reading.note, ...verdict.reasons].filter((x): x is string => Boolean(x)).join('; ') || null;

  const row = await runInTransaction(async (tx) => {
    const created = await tx.loanRate.create({
      data: {
        sourceId: source.id,
        basis: reading.basis,
        tenor: reading.tenor,
        minRatePct: reading.minRatePct,
        maxRatePct: reading.maxRatePct,
        effectiveDate: reading.effectiveDate === null ? null : dateOnly(reading.effectiveDate),
        fetchedAt: now,
        origin: 'AUTO',
        status: verdict.status,
        note,
        sourceAdapter: reader.id,
        sourceAdapterVer: reader.version,
      },
    });
    if (verdict.status === 'ACTIVE') {
      await tx.loanRate.updateMany({
        where: { ...key, status: 'ACTIVE', id: { not: created.id } },
        data: { status: 'SUPERSEDED' },
      });
    }
    return created;
  });

  if (verdict.status === 'ACTIVE') {
    await writeBenchmark(source, reading.tenor, reading.minRatePct, reading.effectiveDate, now);
  }
  return { outcome: verdict.status, rowId: row.id, reasons: verdict.reasons };
}

/**
 * Admin approval of a SUSPECT AUTO reading: it becomes ACTIVE, supersedes the other ACTIVE AUTO rows for its
 * (source, tenor) and updates the benchmark series. Returns null when the row is missing or not SUSPECT.
 */
export async function activateSuspect(id: string, now: Date): Promise<LoanRate | null> {
  const row = await prisma.loanRate.findUnique({ where: { id }, include: { source: true } });
  if (!row || row.status !== 'SUSPECT' || row.origin !== 'AUTO') return null;
  const updated = await runInTransaction(async (tx) => {
    await tx.loanRate.updateMany({
      where: { sourceId: row.sourceId, tenor: row.tenor, origin: 'AUTO', status: 'ACTIVE' },
      data: { status: 'SUPERSEDED' },
    });
    return tx.loanRate.update({ where: { id }, data: { status: 'ACTIVE' } });
  });
  await writeBenchmark(row.source, row.tenor, row.minRatePct.toString(), isoDate(row.effectiveDate), now);
  return updated;
}

/**
 * Keep BenchmarkRate (spec s5.3) in step with REPO and MCLR sources: one row per change. The date is the
 * page's as-of date, or the IST day the change was first seen when the page gives none (RBI).
 */
export async function writeBenchmark(
  source: StoreSource,
  tenor: string | null,
  ratePct: string,
  effectiveDate: string | null,
  now: Date,
): Promise<BenchmarkRate | null> {
  const kind = source.loanType === 'REPO' ? 'REPO' : source.loanType === 'MCLR' ? 'MCLR' : null;
  if (kind === null) return null;
  const lender = kind === 'REPO' ? null : source.lender;
  const benchTenor = kind === 'MCLR' ? tenor : null;
  const latest = await prisma.benchmarkRate.findFirst({
    where: { kind, lender, tenor: benchTenor },
    orderBy: [{ effectiveDate: 'desc' }, { fetchedAt: 'desc' }],
  });
  if (latest && latest.ratePct.equals(ratePct)) return null;
  const date = dateOnly(effectiveDate ?? istDate(now));
  const sameDay = await prisma.benchmarkRate.findFirst({ where: { kind, lender, tenor: benchTenor, effectiveDate: date } });
  if (sameDay) return prisma.benchmarkRate.update({ where: { id: sameDay.id }, data: { ratePct, fetchedAt: now } });
  return prisma.benchmarkRate.create({ data: { kind, lender, tenor: benchTenor, ratePct, effectiveDate: date, fetchedAt: now } });
}

/**
 * Effective rate per (source, tenor) for the given sources: the latest MANUAL ACTIVE row if there is one
 * (manual wins until cleared), else the latest AUTO ACTIVE row. SUSPECT, REJECTED and SUPERSEDED rows are
 * never effective.
 */
export async function effectiveRates(sourceIds: string[]): Promise<Map<string, LoanRate>> {
  const rows = await prisma.loanRate.findMany({
    where: { sourceId: { in: sourceIds }, status: 'ACTIVE' },
    orderBy: { fetchedAt: 'desc' },
  });
  const out = new Map<string, LoanRate>();
  for (const row of rows) {
    const k = rateKey(row.sourceId, row.tenor);
    const current = out.get(k);
    if (!current || (current.origin === 'AUTO' && row.origin === 'MANUAL')) out.set(k, row);
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/loanRates
npx tsc --noEmit && npx eslint src/services/loanRates
```
Expected: all PASS; no type or lint errors.

- [ ] **Step 5: Commit**

```bash
cd portfolioos
git add packages/api/src/services/loanRates/sanity.ts packages/api/src/services/loanRates/store.ts packages/api/test/loanRates/sanity.test.ts packages/api/test/loanRates/store.db.test.ts
git commit -m "feat(loan-rates): sanity rules and append-only rate store

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Daily job - DLQ, stale alert, cron registration

**Files:**
- Create: `packages/api/src/jobs/loanRatesJob.ts`
- Modify: `packages/api/src/index.ts` (import and call `startLoanRatesJob()` beside `startMfScoreJob()`; amended in the Task 8 review - originally `startupSync.ts`), `packages/api/.env.example` (document the flag)
- Test: `packages/api/test/jobs/loanRatesJob.test.ts`

**Interfaces:**
- Consumes: `PAGE_READERS` (Task 4), `fetchPage` (Task 5), `ensureLoanRateSources` (Task 6), `recordReading`, `dateOnly`, `isSourceStale`, `istDate`, `STALE_AFTER_DAYS` (Task 7), `writeIngestionFailure(input)` from `services/ingestionFailures.service.ts` (returns the row or null).
- Produces: `interface LoanRatesRunOptions { readerIds?: string[]; now?: Date; fetchHtml?: (url: string) => Promise<string>; opsUserId?: string | null }`, `interface PageRunResult { readerId; status: 'OK' | 'PARTIAL' | 'FAILED'; active; suspect; unchanged; missing: string[]; error: string | null }`, `interface LoanRatesRunResult { pages: PageRunResult[]; staleSources: string[]; dlqRows: number; alerted: boolean }`, `runLoanRates(options?): Promise<LoanRatesRunResult>`, `runLoanRatesJob(): Promise<LoanRatesRunResult | null>` (single-flight; null when already running), `startLoanRatesJob(): void`, `truncateUtf8(text, maxBytes): string`, `LOAN_RATES_ALERT_SOURCE = 'loan-rates'`, `DLQ_EXCERPT_BYTES = 8192`. IngestionFailure rows use `sourceAdapter = 'loanrates.<readerId>'`.

- [ ] **Step 1: Write the failing test**

`packages/api/test/jobs/loanRatesJob.test.ts`:
```ts
import 'dotenv/config';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { DLQ_EXCERPT_BYTES, runLoanRates, truncateUtf8 } from '../../src/jobs/loanRatesJob.js';
import { FetchPageError } from '../../src/services/loanRates/fetchPage.js';
import { PAGE_READERS, readerById } from '../../src/services/loanRates/sources/index.js';
import { effectiveRates, rateKey } from '../../src/services/loanRates/store.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { clearLoanRateTables } from '../helpers/loanRates.js';
import { READER_FIXTURES, fixture } from '../loanRates/readerFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const NOW = new Date('2026-10-12T02:00:00Z');
const later = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);
/** url -> the first real capture listed for that reader. */
const PAGES = new Map(PAGE_READERS.map((r) => [r.url, fixture(READER_FIXTURES[r.id]![0]!)]));
const fromFixtures = async (url: string) => {
  const page = PAGES.get(url);
  if (page === undefined) throw new Error(`test asked for unexpected URL ${url}`);
  return page;
};

let ops: TestScope;
const sys = <T>(fn: () => Promise<T>) => runAsSystem(fn);
const failuresFor = (adapter: string) =>
  sys(() => prisma.ingestionFailure.findMany({ where: { userId: ops.userId, sourceAdapter: adapter } }));

beforeAll(async () => {
  ops = await createTestScope('loanrates-ops');
  await sys(() => prisma.user.update({ where: { id: ops.userId }, data: { role: 'ADMIN' } }));
});
beforeEach(async () => {
  await clearLoanRateTables();
  await sys(() => prisma.ingestionFailure.deleteMany({ where: { userId: ops.userId } }));
  await sys(() => prisma.alert.deleteMany({ where: { userId: ops.userId } }));
});
afterAll(async () => {
  await clearLoanRateTables();
  await ops.cleanup();
});

describe('runLoanRates', () => {
  it('reads all 15 real pages: 58 ACTIVE rows, 36 benchmark rows, nothing stale, no DLQ', async () => {
    const res = await runLoanRates({ now: NOW, fetchHtml: fromFixtures, opsUserId: ops.userId });
    expect(res.pages).toHaveLength(15);
    expect(res.pages.filter((p) => p.status !== 'OK')).toEqual([]);
    expect(res.pages.reduce((n, p) => n + p.active, 0)).toBe(58);
    expect(res.dlqRows).toBe(0);
    expect(res.staleSources).toEqual([]);
    expect(await prisma.loanRate.count({ where: { status: 'ACTIVE', origin: 'AUTO' } })).toBe(58);
    expect(await prisma.benchmarkRate.count({ where: { kind: 'MCLR' } })).toBe(35);
    expect(await prisma.benchmarkRate.count({ where: { kind: 'REPO' } })).toBe(1);
    const auto = await prisma.loanRateSource.findMany({ where: { mode: 'AUTO' } });
    expect(auto).toHaveLength(30);
    expect(auto.every((s) => s.lastSuccessAt?.getTime() === NOW.getTime())).toBe(true);
  });

  it('a second run on the same pages is a no-op', async () => {
    await runLoanRates({ now: NOW, fetchHtml: fromFixtures, opsUserId: ops.userId });
    const again = await runLoanRates({ now: later(4), fetchHtml: fromFixtures, opsUserId: ops.userId });
    expect(again.pages.reduce((n, p) => n + p.unchanged, 0)).toBe(58);
    expect(again.pages.reduce((n, p) => n + p.active + p.suspect, 0)).toBe(0);
    expect(await prisma.loanRate.count()).toBe(58);
    expect(await prisma.benchmarkRate.count()).toBe(36);
  });

  it('partial page: the sources still on it update, the missing one gets lastError and one DLQ row, its last rate stays', async () => {
    await runLoanRates({ readerIds: ['sbi.rates'], now: NOW, fetchHtml: fromFixtures, opsUserId: ops.userId });
    const eblr = fixture('sbi-eblr.html');
    const res = await runLoanRates({ readerIds: ['sbi.rates'], now: later(24), fetchHtml: async () => eblr, opsUserId: ops.userId });
    expect(res.pages[0]).toMatchObject({ readerId: 'sbi.rates', status: 'PARTIAL', missing: ['sbi.mclr'] });

    const mclr = await prisma.loanRateSource.findUniqueOrThrow({ where: { id: 'sbi.mclr' } });
    expect(mclr.lastError).toContain('No reading for sbi.mclr');
    expect(mclr.lastSuccessAt?.getTime()).toBe(NOW.getTime());
    expect((await prisma.loanRateSource.findUniqueOrThrow({ where: { id: 'sbi.home' } })).lastSuccessAt?.getTime()).toBe(later(24).getTime());
    expect((await effectiveRates(['sbi.mclr'])).get(rateKey('sbi.mclr', '1Y'))?.minRatePct.toString()).toBe('8.7');

    const dlq = await failuresFor('loanrates.sbi.rates');
    expect(dlq).toHaveLength(1);
    const payload = dlq[0]!.rawPayload as unknown as { url: string; sourceIds: string[]; htmlExcerpt: string };
    expect(payload.url).toBe(readerById('sbi.rates')!.url);
    expect(payload.sourceIds).toEqual(['sbi.mclr']);
    expect(Buffer.byteLength(payload.htmlExcerpt, 'utf8')).toBeLessThanOrEqual(DLQ_EXCERPT_BYTES);
  });

  it('a failing page and a page with no readings are DLQ-ed while the other pages still run', async () => {
    const hdfc = readerById('hdfc.home')!.url;
    const icici = readerById('icici.home')!.url;
    const res = await runLoanRates({
      readerIds: ['hdfc.home', 'icici.home', 'axis.home'],
      now: NOW,
      opsUserId: ops.userId,
      fetchHtml: async (url) => {
        if (url === hdfc) throw new FetchPageError('HTTP_STATUS', `HTTP 403 for ${url}`);
        if (url === icici) return fixture('kotak-rates.html');
        return fromFixtures(url);
      },
    });
    expect(res.pages.map((p) => [p.readerId, p.status])).toEqual([
      ['hdfc.home', 'FAILED'],
      ['icici.home', 'FAILED'],
      ['axis.home', 'OK'],
    ]);
    expect(res.dlqRows).toBe(2);
    expect((await prisma.loanRateSource.findUniqueOrThrow({ where: { id: 'hdfc.home' } })).lastError).toContain('HTTP 403');
    expect((await prisma.loanRateSource.findUniqueOrThrow({ where: { id: 'icici.home' } })).lastError).toContain('No readings found');
    expect(await failuresFor('loanrates.hdfc.home')).toHaveLength(1);
    expect(await prisma.loanRate.count({ where: { sourceId: 'axis.home', status: 'ACTIVE' } })).toBe(1);
  });

  it('a source with no success for 7 days is stale and raises one ops alert per IST day', async () => {
    await sys(() => prisma.loanRateSource.update({ where: { id: 'lic.home' }, data: { lastSuccessAt: new Date(NOW.getTime() - 8 * 86_400_000) } }));
    const first = await runLoanRates({ readerIds: [], now: NOW, opsUserId: ops.userId });
    expect(first.staleSources).toContain('lic.home');
    expect(first.alerted).toBe(true);
    await runLoanRates({ readerIds: [], now: later(3), opsUserId: ops.userId });
    const alerts = await sys(() => prisma.alert.findMany({ where: { userId: ops.userId, title: 'Loan rates stale: 2026-10-12' } }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ type: 'CUSTOM' });
    expect((alerts[0]!.metadata as unknown as { source: string }).source).toBe('loan-rates');
  });

  it('with no ADMIN to own them, failures are logged, not written', async () => {
    const res = await runLoanRates({
      readerIds: ['pnb.mclr'],
      now: NOW,
      opsUserId: null,
      fetchHtml: async () => {
        throw new FetchPageError('TIMEOUT', 'Timed out');
      },
    });
    expect(res.pages[0]?.status).toBe('FAILED');
    expect(res.dlqRows).toBe(0);
  });
});

describe('truncateUtf8', () => {
  it('cuts to the byte limit without leaving half a character', () => {
    const out = truncateUtf8('\u00e9'.repeat(5000), DLQ_EXCERPT_BYTES);
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(DLQ_EXCERPT_BYTES);
    expect(out.endsWith('\uFFFD')).toBe(false);
    expect(truncateUtf8('short', DLQ_EXCERPT_BYTES)).toBe('short');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/jobs/loanRatesJob.test.ts
```
Expected: FAIL - cannot find module `loanRatesJob.js`.

- [ ] **Step 3: Implement the job**

`packages/api/src/jobs/loanRatesJob.ts`:
```ts
/**
 * Daily live-loan-rates job (EMI calculator spec s5.4): 07:30 IST, one request per page.
 *
 * For each AUTO page reader: fetch the page (allow-listed, robots-aware, capped - fetchPage.ts), read it
 * (pure readers, sources/*.ts), and append each reading through the store's sanity and supersede rules.
 * Nothing here throws out of a page: a fetch error, a reader that finds nothing, or a source missing from
 * its page writes one IngestionFailure row and the source's lastError*, and the run moves on. The last good
 * rate stays displayed. After the pages, AUTO sources with no success for 7 days raise one ops alert per day.
 *
 * Runs under runAsSystem: the rate tables are global, and IngestionFailure, Alert and User are user-scoped
 * tables this job writes or reads for the ops admin.
 *
 * REGISTRATION: startLoanRatesJob() is called from src/index.ts. ENABLE_LOAN_RATES_CRON=false disables it
 * (the test env sets that).
 */
import cron from 'node-cron';
import type { LoanRateSource } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import { writeIngestionFailure } from '../services/ingestionFailures.service.js';
import { fetchPage } from '../services/loanRates/fetchPage.js';
import { isSourceStale, istDate, STALE_AFTER_DAYS } from '../services/loanRates/sanity.js';
import { ensureLoanRateSources } from '../services/loanRates/sourceList.js';
import { PAGE_READERS } from '../services/loanRates/sources/index.js';
import { dateOnly, recordReading } from '../services/loanRates/store.js';
import type { PageReader } from '../services/loanRates/types.js';

const TZ = 'Asia/Kolkata';
export const LOAN_RATES_ALERT_SOURCE = 'loan-rates';
/** spec s5.4: raw payload kept in the DLQ, truncated to 8 KB. */
export const DLQ_EXCERPT_BYTES = 8 * 1024;

export interface LoanRatesRunOptions {
  /** Limit the run to these page readers (admin "Run now" for one source). Default: every reader. */
  readerIds?: string[];
  now?: Date;
  /** Transport seam for tests: url -> page text. Default: fetchPage with one robots cache for the run. */
  fetchHtml?: (url: string) => Promise<string>;
  /** Owner of IngestionFailure and Alert rows. Default: the oldest active ADMIN; null = log only. */
  opsUserId?: string | null;
}

export interface PageRunResult {
  readerId: string;
  status: 'OK' | 'PARTIAL' | 'FAILED';
  active: number;
  suspect: number;
  unchanged: number;
  /** Sources of this page that got no reading this run. */
  missing: string[];
  error: string | null;
}

export interface LoanRatesRunResult {
  pages: PageRunResult[];
  staleSources: string[];
  dlqRows: number;
  alerted: boolean;
}

let running = false;

export function runLoanRates(options: LoanRatesRunOptions = {}): Promise<LoanRatesRunResult> {
  return runAsSystem(() => runInner(options));
}

/** Cron / "Run now (all)" entry point with a single-flight guard. Returns null when a run is in progress. */
export async function runLoanRatesJob(): Promise<LoanRatesRunResult | null> {
  if (running) {
    logger.warn('[cron] loan rates job already running - skipping');
    return null;
  }
  running = true;
  try {
    const result = await runLoanRates();
    logger.info({ pages: result.pages.map((p) => `${p.readerId}:${p.status}`), stale: result.staleSources.length }, '[cron] loan rates done');
    return result;
  } catch (err) {
    logger.error({ err }, '[cron] loan rates job failed');
    throw err;
  } finally {
    running = false;
  }
}

export function startLoanRatesJob(): void {
  if (process.env.ENABLE_LOAN_RATES_CRON === 'false') {
    logger.info('[cron] loan rates job disabled via ENABLE_LOAN_RATES_CRON=false');
    return;
  }
  cron.schedule(
    '30 7 * * *',
    () => {
      runLoanRatesJob().catch((err: unknown) => logger.error({ err }, '[cron] loan rates run rejected'));
    },
    { timezone: TZ },
  );
  logger.info('[cron] scheduled: loan rates @07:30 IST');
}

/** Keep at most `maxBytes` of UTF-8, never ending in half a character. */
export function truncateUtf8(text: string, maxBytes: number): string {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.byteLength <= maxBytes) return text;
  return bytes.subarray(0, maxBytes).toString('utf8').replace(/\uFFFD+$/, '');
}

async function runInner(options: LoanRatesRunOptions): Promise<LoanRatesRunResult> {
  const now = options.now ?? new Date();
  await ensureLoanRateSources(true);
  const robotsCache = new Map<string, string>();
  const fetchHtml = options.fetchHtml ?? ((url: string) => fetchPage(url, { robotsCache }));
  const opsUserId = options.opsUserId !== undefined ? options.opsUserId : await resolveOpsUserId();

  const sources = await prisma.loanRateSource.findMany({ where: { mode: 'AUTO' } });
  const pages: PageRunResult[] = [];
  let dlqRows = 0;
  for (const reader of PAGE_READERS) {
    if (options.readerIds && !options.readerIds.includes(reader.id)) continue;
    const own = sources.filter((s) => s.adapter === reader.id);
    if (own.length === 0) continue;
    const outcome = await runPage(reader, own, fetchHtml, now, opsUserId);
    pages.push(outcome.result);
    dlqRows += outcome.dlqRows;
  }

  const fresh = await prisma.loanRateSource.findMany({ where: { mode: 'AUTO' }, orderBy: { id: 'asc' } });
  const staleSources = fresh.filter((s) => isSourceStale(s, now)).map((s) => s.id);
  const alerted = staleSources.length > 0 ? await raiseStaleAlert(opsUserId, staleSources, now) : false;
  return { pages, staleSources, dlqRows, alerted };
}

async function runPage(
  reader: PageReader,
  own: LoanRateSource[],
  fetchHtml: (url: string) => Promise<string>,
  now: Date,
  opsUserId: string | null,
): Promise<{ result: PageRunResult; dlqRows: number }> {
  const ownIds = own.map((s) => s.id);
  let html = '';
  try {
    html = await fetchHtml(reader.url);
    const readings = reader.read(html).filter((r) => ownIds.includes(r.sourceId));
    if (readings.length === 0) throw new Error(`No readings found on ${reader.url}`);

    const counts = { active: 0, suspect: 0, unchanged: 0 };
    for (const reading of readings) {
      const source = own.find((s) => s.id === reading.sourceId)!;
      const { outcome } = await recordReading(source, reading, reader, now);
      if (outcome === 'ACTIVE') counts.active++;
      else if (outcome === 'SUSPECT') counts.suspect++;
      else counts.unchanged++;
    }

    const readIds = [...new Set(readings.map((r) => r.sourceId))];
    const missing = ownIds.filter((id) => !readIds.includes(id));
    await prisma.loanRateSource.updateMany({ where: { id: { in: readIds } }, data: { lastSuccessAt: now } });
    let dlqRows = 0;
    if (missing.length > 0) {
      const message = `No reading for ${missing.join(', ')} on ${reader.url}`;
      await prisma.loanRateSource.updateMany({ where: { id: { in: missing } }, data: { lastErrorAt: now, lastError: message } });
      dlqRows = await writeDlq(opsUserId, reader, message, html, missing);
    }
    return {
      result: { readerId: reader.id, status: missing.length > 0 ? 'PARTIAL' : 'OK', ...counts, missing, error: null },
      dlqRows,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, readerId: reader.id }, '[loanRates] page failed - last good rates stay displayed');
    await prisma.loanRateSource.updateMany({
      where: { id: { in: ownIds } },
      data: { lastErrorAt: now, lastError: message.slice(0, 500) },
    });
    const dlqRows = await writeDlq(opsUserId, reader, err instanceof Error ? err : message, html, ownIds);
    return {
      result: { readerId: reader.id, status: 'FAILED', active: 0, suspect: 0, unchanged: 0, missing: ownIds, error: message },
      dlqRows,
    };
  }
}

async function writeDlq(
  opsUserId: string | null,
  reader: PageReader,
  error: Error | string,
  html: string,
  sourceIds: string[],
): Promise<number> {
  if (opsUserId === null) {
    logger.error({ readerId: reader.id, sourceIds }, '[loanRates] no ADMIN user to own the IngestionFailure - DLQ write skipped');
    return 0;
  }
  const row = await writeIngestionFailure({
    userId: opsUserId,
    sourceAdapter: `loanrates.${reader.id}`,
    adapterVersion: reader.version,
    sourceRef: reader.url,
    error,
    // Public bank page, no PII; the excerpt is what an admin needs to see what changed.
    rawPayload: { url: reader.url, sourceIds, htmlExcerpt: truncateUtf8(html, DLQ_EXCERPT_BYTES) },
  });
  return row ? 1 : 0;
}

/**
 * IngestionFailure and Alert need a userId; this is fleet-wide work owned by nobody, so it is attributed to
 * the oldest active ADMIN (same rule as mfOpsAlertsJob and benchmarkPriceJob).
 */
async function resolveOpsUserId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return admin?.id ?? null;
}

/** One alert per IST day: dedupe key (userId, CUSTOM, title, triggerDate), as the other ops alerts use. */
async function raiseStaleAlert(opsUserId: string | null, staleSources: string[], now: Date): Promise<boolean> {
  const day = istDate(now);
  const title = `Loan rates stale: ${day}`;
  const description =
    `${staleSources.length} loan-rate source(s) have had no successful reading for more than ${STALE_AFTER_DAYS} days: ` +
    `${staleSources.join(', ')}. Users still see the last good rate, marked stale. Check Settings - Loan rates and the ` +
    `ingestion failures list.`;
  if (opsUserId === null) {
    logger.error({ staleSources }, `[loanRates] ${description} (no ADMIN user to alert)`);
    return false;
  }
  const triggerDate = dateOnly(day);
  const existing = await prisma.alert.findFirst({
    where: { userId: opsUserId, type: 'CUSTOM', title, triggerDate },
    select: { id: true },
  });
  if (existing === null) {
    await prisma.alert.create({
      data: {
        userId: opsUserId,
        type: 'CUSTOM',
        title,
        description,
        triggerDate,
        metadata: { source: LOAN_RATES_ALERT_SOURCE, staleSources },
      },
    });
  }
  logger.warn({ staleSources }, '[loanRates] stale sources');
  return true;
}
```

- [ ] **Step 4: Register it and document the flag**

> Amended in the Task 8 review: the registration lives in `packages/api/src/index.ts` beside `startMfScoreJob()`, not in `startupSync.ts` (which `ENABLE_STARTUP_SYNC` gates). The original step follows for the record.

`packages/api/src/jobs/startupSync.ts`: add the import beside the other job imports

```ts
import { startLoanRatesJob } from './loanRatesJob.js';
```

and the call directly after `startSplitDigestJobs();`:

```ts
  // Daily 07:30 IST live loan rates (EMI calculator, spec s5.4). ENABLE_LOAN_RATES_CRON=false disables it.
  startLoanRatesJob();
```

`packages/api/.env.example`: append

```
# Daily 07:30 IST live loan-rate reader (EMI calculator Live rates tab). Default on; set false to disable.
ENABLE_LOAN_RATES_CRON=true
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/jobs/loanRatesJob.test.ts test/loanRates
npx tsc --noEmit && npx eslint src/jobs/loanRatesJob.ts src/jobs/startupSync.ts
```
Expected: all PASS; no type or lint errors. If the first test reports a SUSPECT count above 0, print `res.pages` and the SUSPECT rows' `note`: a reason other than the documented rules means the fixture dates or the sanity constants were transcribed wrongly - fix the code, never the expected numbers.

- [ ] **Step 6: Commit**

```bash
cd portfolioos
git add packages/api/src/jobs/loanRatesJob.ts packages/api/src/jobs/startupSync.ts packages/api/.env.example packages/api/test/jobs/loanRatesJob.test.ts
git commit -m "feat(loan-rates): daily 07:30 IST rates job with DLQ and stale alert

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Public API - GET /api/loan-rates

**Files:**
- Create: `packages/api/src/services/loanRates/loanRates.service.ts`, `packages/api/src/controllers/loanRates.controller.ts`, `packages/api/src/routes/loanRates.routes.ts`
- Modify: `packages/api/src/routes/index.ts` (import + `app.use('/api/loan-rates', loanRatesRouter);` beside `app.use('/api/emi', emiRouter);`)
- Test: `packages/api/test/routes/loanRates.routes.test.ts`

**Interfaces:**
- Consumes: Task 7 store helpers and `isSourceStale`; Task 6 `ensureLoanRateSources`; `ok` from `lib/response.ts`; `authenticate` from `middleware/authenticate.ts`; `asyncHandler` from `middleware/validate.ts`.
- Produces: `listLoanRates(loanType: RateLoanType, now?: Date): Promise<LoanRatesWire>`, `repoSummary(): Promise<RepoRateWire | null>`; handler `listLoanRatesHandler`; `loanRatesRouter`; `GET /api/loan-rates?loanType=HOME` (authenticated, default HOME, unknown type -> 422) -> `{ success: true, data: LoanRatesWire }`.

- [ ] **Step 1: Write the failing test**

`packages/api/test/routes/loanRates.routes.test.ts`:
```ts
import 'dotenv/config';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { LoanRatesWire } from '@everypaisa/shared';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { loanRatesRouter } from '../../src/routes/loanRates.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';
import { ensureLoanRateSources } from '../../src/services/loanRates/sourceList.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { clearLoanRateTables } from '../helpers/loanRates.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let user: TestScope;
const token = () => signAccessToken({ sub: user.userId, email: `${user.userId}@test.local`, role: 'INVESTOR', plan: 'FREE' }).token;
const get = (query: string, auth = true) =>
  fetch(`${base}/api/loan-rates${query}`, { headers: auth ? { authorization: `Bearer ${token()}` } : {} });
const sys = <T>(fn: () => Promise<T>) => runAsSystem(fn);
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000);

async function rate(sourceId: string, data: { min: string; max?: string; origin?: 'AUTO' | 'MANUAL'; status?: string; basis?: string; effectiveDate?: string }) {
  await sys(() => prisma.loanRate.create({
    data: {
      sourceId,
      basis: data.basis ?? 'REPO_LINKED',
      minRatePct: data.min,
      maxRatePct: data.max ?? null,
      origin: data.origin ?? 'AUTO',
      status: data.status ?? 'ACTIVE',
      effectiveDate: data.effectiveDate ? new Date(`${data.effectiveDate}T00:00:00Z`) : null,
      fetchedAt: ago(2),
    },
  }));
}

beforeAll(async () => {
  user = await createTestScope('loan-rates-http');
  await sys(() => ensureLoanRateSources(true));
  const app = express();
  app.use(express.json());
  app.use('/api/loan-rates', loanRatesRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(clearLoanRateTables);
afterAll(async () => {
  server.close();
  await clearLoanRateTables();
  await user.cleanup();
});

describe('GET /api/loan-rates', () => {
  it('requires auth', async () => expect((await get('', false)).status).toBe(401));

  it('rejects an unknown loan type', async () => expect((await get('?loanType=BOAT')).status).toBe(422));

  it('is empty, not an error, before any rate exists', async () => {
    const res = await get('');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ loanType: 'HOME', rows: [], repo: null });
  });

  it('returns effective rates lowest first: manual wins, suspect hidden, stale flagged, other types excluded', async () => {
    await sys(() => prisma.loanRateSource.update({ where: { id: 'hdfc.home' }, data: { lastSuccessAt: ago(1) } }));
    await sys(() => prisma.loanRateSource.update({ where: { id: 'kotak.home' }, data: { lastSuccessAt: ago(8 * 24) } }));
    await rate('hdfc.home', { min: '8.00', max: '13.45' });
    await rate('icici.home', { min: '8.75', max: '10.05' });
    await rate('icici.home', { min: '8.60', origin: 'MANUAL', basis: 'REPO_LINKED' });
    await rate('axis.home', { min: '5.00', status: 'SUSPECT' });
    await rate('kotak.home', { min: '7.70', max: '13.05' });
    await rate('sbi.home', { min: '7.25', basis: 'REPO_LINKED', status: 'SUPERSEDED' });
    await rate('canara.car', { min: '7.70', max: '15.25', basis: 'OTHER' });

    const body = (await (await get('?loanType=HOME')).json()).data as LoanRatesWire;
    expect(body.rows.map((r) => [r.sourceId, r.minRatePct, r.maxRatePct, r.origin, r.stale])).toEqual([
      ['kotak.home', '7.70', '13.05', 'AUTO', true],
      ['hdfc.home', '8.00', '13.45', 'AUTO', false],
      ['icici.home', '8.60', null, 'MANUAL', false],
    ]);
    const hdfc = body.rows[1]!;
    expect(hdfc).toMatchObject({ lender: 'HDFC Bank', loanType: 'HOME', basis: 'REPO_LINKED', effectiveDate: null, sourceUrl: 'https://homeloans.hdfc.bank.in/ps/home-loans-in-india/interest-rates' });
    expect(Math.abs(Date.parse(hdfc.asOf) - ago(1).getTime())).toBeLessThan(60_000);
  });

  it('repo: null lastChange with one row, signed delta after a cut', async () => {
    await sys(() => prisma.benchmarkRate.create({ data: { kind: 'REPO', ratePct: '5.75', effectiveDate: new Date('2026-06-06T00:00:00Z') } }));
    let body = (await (await get('')).json()).data as LoanRatesWire;
    expect(body.repo).toEqual({ ratePct: '5.75', effectiveDate: '2026-06-06', lastChange: null });
    await sys(() => prisma.benchmarkRate.create({ data: { kind: 'REPO', ratePct: '5.50', effectiveDate: new Date('2026-10-08T00:00:00Z') } }));
    body = (await (await get('')).json()).data as LoanRatesWire;
    expect(body.repo).toEqual({ ratePct: '5.50', effectiveDate: '2026-10-08', lastChange: { deltaPct: '-0.25', date: '2026-10-08' } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/routes/loanRates.routes.test.ts
```
Expected: FAIL - cannot find module `loanRates.routes.js`.

- [ ] **Step 3: Implement**

`packages/api/src/services/loanRates/loanRates.service.ts`:
```ts
import { Decimal } from 'decimal.js';
import type {
  LoanRateRowWire, LoanRatesWire, RateBasis, RateLoanType, RateOrigin, RepoRateWire,
} from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { isSourceStale } from './sanity.js';
import { ensureLoanRateSources } from './sourceList.js';
import { effectiveRates, isoDate, pctString, rateKey } from './store.js';

/**
 * GET /api/loan-rates (spec s5.6): every lender's effective rate for one loan type, lowest first, plus the
 * RBI repo rate. SUSPECT readings never appear; a source with no effective rate is simply absent.
 */
export async function listLoanRates(loanType: RateLoanType, now: Date = new Date()): Promise<LoanRatesWire> {
  await ensureLoanRateSources();
  const sources = await prisma.loanRateSource.findMany({ where: { loanType } });
  const effective = await effectiveRates(sources.map((s) => s.id));
  const rows: LoanRateRowWire[] = [];
  for (const source of sources) {
    const rate = effective.get(rateKey(source.id, null));
    if (!rate) continue;
    const auto = rate.origin === 'AUTO';
    rows.push({
      sourceId: source.id,
      lender: source.lender,
      loanType,
      basis: rate.basis as RateBasis,
      minRatePct: pctString(rate.minRatePct),
      maxRatePct: rate.maxRatePct === null ? null : pctString(rate.maxRatePct),
      effectiveDate: isoDate(rate.effectiveDate),
      // AUTO: when the page last confirmed it. MANUAL: when the admin entered it (plan ruling 11).
      asOf: (auto ? (source.lastSuccessAt ?? rate.fetchedAt) : rate.fetchedAt).toISOString(),
      stale: auto && isSourceStale(source, now),
      sourceUrl: source.url,
      origin: rate.origin as RateOrigin,
    });
  }
  rows.sort((a, b) => new Decimal(a.minRatePct).comparedTo(b.minRatePct) || a.lender.localeCompare(b.lender));
  return { loanType, rows, repo: await repoSummary() };
}

/** Latest RBI repo rate and, once there are two, the signed size and date of the last change. */
export async function repoSummary(): Promise<RepoRateWire | null> {
  const [current, previous] = await prisma.benchmarkRate.findMany({
    where: { kind: 'REPO', lender: null, tenor: null },
    orderBy: [{ effectiveDate: 'desc' }, { fetchedAt: 'desc' }],
    take: 2,
  });
  if (!current) return null;
  const date = isoDate(current.effectiveDate)!;
  return {
    ratePct: pctString(current.ratePct),
    effectiveDate: date,
    lastChange: previous ? { deltaPct: pctString(current.ratePct.minus(previous.ratePct)), date } : null,
  };
}
```

`packages/api/src/controllers/loanRates.controller.ts`:
```ts
import type { Request, Response } from 'express';
import { z } from 'zod';
import { RATE_LOAN_TYPES } from '@everypaisa/shared';
import { ok } from '../lib/response.js';
import { listLoanRates } from '../services/loanRates/loanRates.service.js';

const listQuery = z.object({ loanType: z.enum(RATE_LOAN_TYPES).default('HOME') });

/** GET /api/loan-rates?loanType=HOME */
export async function listLoanRatesHandler(req: Request, res: Response): Promise<void> {
  const { loanType } = listQuery.parse(req.query);
  ok(res, await listLoanRates(loanType));
}
```

`packages/api/src/routes/loanRates.routes.ts`:
```ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { listLoanRatesHandler } from '../controllers/loanRates.controller.js';

/** Indicative market rates: readable by any signed-in user (spec s8); writes live under /api/admin/loan-rates. */
export const loanRatesRouter = Router();
loanRatesRouter.use(authenticate);
loanRatesRouter.get('/', asyncHandler(listLoanRatesHandler));
```

`packages/api/src/routes/index.ts`: add `import { loanRatesRouter } from './loanRates.routes.js';` beside the `emiRouter` import, and `app.use('/api/loan-rates', loanRatesRouter);` directly after `app.use('/api/emi', emiRouter);`.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/routes/loanRates.routes.test.ts
npx tsc --noEmit && npx eslint src/services/loanRates src/controllers/loanRates.controller.ts src/routes/loanRates.routes.ts src/routes/index.ts
```
Expected: PASS; no type or lint errors.

- [ ] **Step 5: Commit**

```bash
cd portfolioos
git add packages/api/src/services/loanRates/loanRates.service.ts packages/api/src/controllers/loanRates.controller.ts packages/api/src/routes/loanRates.routes.ts packages/api/src/routes/index.ts packages/api/test/routes/loanRates.routes.test.ts
git commit -m "feat(loan-rates): GET /api/loan-rates with repo summary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Admin API - ADMIN + second factor, every write audited

**Files:**
- Create: `packages/api/src/services/loanRates/admin.service.ts`, `packages/api/src/routes/adminLoanRates.routes.ts`
- Modify: `packages/api/src/controllers/loanRates.controller.ts` (admin handlers), `packages/api/src/lib/audit.ts` (5 actions), `packages/api/src/middleware/rateLimit.ts` (`loanRatesRunLimiter`), `packages/api/src/routes/index.ts` (mount)
- Test: `packages/api/test/routes/adminLoanRates.routes.test.ts`

**Interfaces:**
- Consumes: Task 7 `activateSuspect`, `writeBenchmark`, `toReadingWire`, `rateKey`, `dateOnly`; Task 8 `runLoanRates`, `runLoanRatesJob`; Task 9 `listLoanRates`; `requireRole` (`middleware/authenticate.ts`, answers 401 "Insufficient role"), `requireSecondFactor('admin tools')` (`lib/professionalMfa.ts`, answers 403 `TWO_FACTOR_REQUIRED`); `writeAuditLog({ userId, action, resource, metadata, req })` (`lib/audit.ts`, best-effort).
- Produces: `listAdminLoanRates(now?): Promise<AdminLoanRateSourceWire[]>`, `setManualRate(adminId, sourceId, input: ManualRateInputWire, now?): Promise<LoanRateReadingWire>`, `clearManualRate(sourceId, tenor?): Promise<number>`, `approveSuspect(id, now?)`, `rejectSuspect(id)`, `type RunNowResult = { started: 'one'; result: LoanRatesRunResult } | { started: 'all' }`, `runNow(sourceId?): Promise<RunNowResult>`; routes under `/api/admin/loan-rates`:
  - `GET /` -> `{ sources: AdminLoanRateSourceWire[] }`
  - `POST /:sourceId/manual` body `ManualRateInputWire` -> 201 `LoanRateReadingWire`
  - `DELETE /:sourceId/manual?tenor=1Y` -> `{ cleared: number }` (404 when nothing to clear)
  - `POST /readings/:id/approve`, `POST /readings/:id/reject` -> `LoanRateReadingWire` (409 unless SUSPECT)
  - `POST /run` body `{ sourceId?: string }` -> 200 `{ started: 'one', result }` or 202 `{ started: 'all' }`; 3 per minute per admin.

- [ ] **Step 1: Write the failing test**

`packages/api/test/routes/adminLoanRates.routes.test.ts`:
```ts
import 'dotenv/config';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { AdminLoanRateSourceWire } from '@everypaisa/shared';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { encryptSecret } from '../../src/lib/secrets.js';
import { generateTotpSecret } from '../../src/lib/totp.js';
import { adminLoanRatesRouter } from '../../src/routes/adminLoanRates.routes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { signAccessToken } from '../../src/services/jwt.service.js';
import { listLoanRates } from '../../src/services/loanRates/loanRates.service.js';
import { ensureLoanRateSources } from '../../src/services/loanRates/sourceList.js';
import { runLoanRates, runLoanRatesJob } from '../../src/jobs/loanRatesJob.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { clearLoanRateTables } from '../helpers/loanRates.js';

vi.mock('../../src/jobs/loanRatesJob.js', () => ({
  runLoanRates: vi.fn(async () => ({
    pages: [{ readerId: 'axis.home', status: 'OK', active: 1, suspect: 0, unchanged: 0, missing: [], error: null }],
    staleSources: [],
    dlqRows: 0,
    alerted: false,
  })),
  runLoanRatesJob: vi.fn(async () => null),
}));

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let server: Server;
let base: string;
let investor: TestScope;
let adminNo2fa: TestScope;
let admin: TestScope;
const sys = <T>(fn: () => Promise<T>) => runAsSystem(fn);
const tokenFor = (scope: TestScope, role: string, mfa: boolean) =>
  signAccessToken({ sub: scope.userId, email: `${scope.userId}@test.local`, role, plan: 'FREE', ...(mfa ? { mfa: true } : {}) }).token;

function call(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  return fetch(`${base}/api/admin/loan-rates${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${opts.token ?? tokenFor(admin, 'ADMIN', true)}`,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
const audits = (action: string) => sys(() => prisma.auditLog.findMany({ where: { userId: admin.userId, action } }));
const autoRate = (sourceId: string, min: string, status = 'ACTIVE') =>
  sys(() => prisma.loanRate.create({
    data: { sourceId, basis: 'REPO_LINKED', minRatePct: min, maxRatePct: '13.45', origin: 'AUTO', status, sourceAdapter: 'hdfc.home', sourceAdapterVer: '1' },
  }));

beforeAll(async () => {
  investor = await createTestScope('lr-admin-investor');
  adminNo2fa = await createTestScope('lr-admin-no2fa');
  admin = await createTestScope('lr-admin');
  await sys(() => prisma.user.update({ where: { id: adminNo2fa.userId }, data: { role: 'ADMIN' } }));
  await sys(() => prisma.user.update({
    where: { id: admin.userId },
    data: { role: 'ADMIN', twoFactorEnabledAt: new Date(), twoFactorSecretEnc: encryptSecret(generateTotpSecret()) },
  }));
  await sys(() => ensureLoanRateSources(true));
  const app = express();
  app.use(express.json());
  app.use('/api/admin/loan-rates', adminLoanRatesRouter);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(async () => {
  await clearLoanRateTables();
  vi.clearAllMocks();
});
afterAll(async () => {
  server.close();
  await clearLoanRateTables();
  for (const s of [investor, adminNo2fa, admin]) await s.cleanup();
});

describe('gate', () => {
  it('investor -> 401, admin without two-factor -> 403, admin session without a code -> 403, verified admin -> 200', async () => {
    expect((await call('GET', '/', { token: tokenFor(investor, 'INVESTOR', true) })).status).toBe(401);
    const no2fa = await call('GET', '/', { token: tokenFor(adminNo2fa, 'ADMIN', true) });
    expect(no2fa.status).toBe(403);
    expect((await no2fa.json()).code).toBe('TWO_FACTOR_REQUIRED');
    expect((await call('GET', '/', { token: tokenFor(admin, 'ADMIN', false) })).status).toBe(403);
    const ok = await call('GET', '/');
    expect(ok.status).toBe(200);
    expect(((await ok.json()).data.sources as AdminLoanRateSourceWire[]).length).toBeGreaterThanOrEqual(92);
  });
});

describe('manual override', () => {
  it('wins for users, shows differs to the admin, is audited, and clearing brings AUTO back', async () => {
    await autoRate('hdfc.home', '8.00');
    const set = await call('POST', '/hdfc.home/manual', {
      body: { basis: 'REPO_LINKED', minRatePct: '7.95', maxRatePct: '13.00', note: 'Branch confirmed festive offer' },
    });
    expect(set.status).toBe(201);
    expect((await set.json()).data).toMatchObject({ origin: 'MANUAL', status: 'ACTIVE', minRatePct: '7.95', maxRatePct: '13.00' });

    const users = await sys(() => listLoanRates('HOME'));
    expect(users.rows.find((r) => r.sourceId === 'hdfc.home')).toMatchObject({ minRatePct: '7.95', origin: 'MANUAL' });

    const sources = (await (await call('GET', '/')).json()).data.sources as AdminLoanRateSourceWire[];
    const hdfc = sources.find((s) => s.id === 'hdfc.home')!;
    expect(hdfc.keys).toHaveLength(1);
    expect(hdfc.keys[0]).toMatchObject({ tenor: null, differs: true, manual: { minRatePct: '7.95' }, latestAuto: { minRatePct: '8.00' } });

    const setAudit = await audits('loan_rate_manual_set');
    expect(setAudit).toHaveLength(1);
    expect(setAudit[0]).toMatchObject({ resource: 'LoanRateSource:hdfc.home' });

    const cleared = await call('DELETE', '/hdfc.home/manual');
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).data).toEqual({ cleared: 1 });
    expect((await audits('loan_rate_override_cleared'))).toHaveLength(1);
    const after = await sys(() => listLoanRates('HOME'));
    expect(after.rows.find((r) => r.sourceId === 'hdfc.home')).toMatchObject({ minRatePct: '8.00', origin: 'AUTO' });
    expect((await call('DELETE', '/hdfc.home/manual')).status).toBe(404);
  });

  it('a manual repo rate also records the benchmark change', async () => {
    const res = await call('POST', '/rbi.repo/manual', { body: { basis: 'OTHER', minRatePct: '5.50', effectiveDate: '2026-10-08', note: 'RBI MPC statement 08/10/2026' } });
    expect(res.status).toBe(201);
    const bench = await prisma.benchmarkRate.findMany({ where: { kind: 'REPO' } });
    expect(bench.map((b) => [b.ratePct.toString(), b.effectiveDate.toISOString().slice(0, 10)])).toEqual([['5.5', '2026-10-08']]);
  });

  it.each([
    ['/hdfc.home/manual', { basis: 'REPO_LINKED', tenor: '1Y', minRatePct: '8.00', note: 'tenor on a product' }, 400],
    ['/sbi.mclr/manual', { basis: 'MCLR', minRatePct: '8.70', note: 'MCLR without tenor' }, 400],
    ['/hdfc.home/manual', { basis: 'REPO_LINKED', minRatePct: '60', note: 'too high' }, 400],
    ['/hdfc.home/manual', { basis: 'REPO_LINKED', minRatePct: '9.00', maxRatePct: '8.00', note: 'max below min' }, 400],
    ['/hdfc.home/manual', { basis: 'REPO_LINKED', minRatePct: '8,00', note: 'comma' }, 422],
    ['/hdfc.home/manual', { basis: 'REPO_LINKED', minRatePct: '8.00' }, 422],
    ['/nope.home/manual', { basis: 'OTHER', minRatePct: '8.00', note: 'unknown source' }, 404],
  ])('POST %s %j -> %i', async (path, body, status) => {
    expect((await call('POST', path, { body })).status).toBe(status);
  });
});

describe('suspect readings', () => {
  it('approve makes it ACTIVE (once), reject makes it REJECTED; both audited', async () => {
    await autoRate('hdfc.home', '8.00');
    const suspect = await autoRate('hdfc.home', '11.00', 'SUSPECT');
    const approved = await call('POST', `/readings/${suspect.id}/approve`);
    expect(approved.status).toBe(200);
    expect((await approved.json()).data).toMatchObject({ id: suspect.id, status: 'ACTIVE' });
    expect((await call('POST', `/readings/${suspect.id}/approve`)).status).toBe(409);
    expect(await audits('loan_rate_suspect_approved')).toHaveLength(1);

    const another = await autoRate('hdfc.home', '4.00', 'SUSPECT');
    const rejected = await call('POST', `/readings/${another.id}/reject`);
    expect((await rejected.json()).data).toMatchObject({ status: 'REJECTED' });
    expect(await audits('loan_rate_suspect_rejected')).toHaveLength(1);
  });
});

describe('run now', () => {
  it('one AUTO source runs its page reader; a MANUAL source is refused; all starts in the background', async () => {
    const one = await call('POST', '/run', { body: { sourceId: 'axis.home' } });
    expect(one.status).toBe(200);
    expect(vi.mocked(runLoanRates)).toHaveBeenCalledWith({ readerIds: ['axis.home'] });
    expect((await one.json()).data.started).toBe('one');
    expect((await call('POST', '/run', { body: { sourceId: 'pnb.home' } })).status).toBe(400);
    const all = await call('POST', '/run', { body: {} });
    expect(all.status).toBe(202);
    expect(vi.mocked(runLoanRatesJob)).toHaveBeenCalledTimes(1);
    expect((await audits('loan_rate_run_now')).map((a) => a.resource).sort()).toEqual(['LoanRateSource:*', 'LoanRateSource:axis.home']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/routes/adminLoanRates.routes.test.ts
```
Expected: FAIL - cannot find module `adminLoanRates.routes.js`.

- [ ] **Step 3: Implement**

`packages/api/src/lib/audit.ts`: extend the `AuditAction` union (after `'two_factor_codes_regenerated'`):
```ts
  | 'two_factor_codes_regenerated'
  | 'loan_rate_manual_set'
  | 'loan_rate_override_cleared'
  | 'loan_rate_suspect_approved'
  | 'loan_rate_suspect_rejected'
  | 'loan_rate_run_now';
```
(remove the `;` that previously ended the union after `'two_factor_codes_regenerated'`).

`packages/api/src/middleware/rateLimit.ts`: add after `emiExportLimiter`:
```ts
/** Admin "Run now" on live loan rates: every call fetches bank pages. 3 a minute per admin. */
export const loanRatesRunLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
  store: makeStore('loan-rates-run'),
  message: { success: false, error: 'Too many runs - please wait a minute', code: 'RATE_LIMITED' },
});
```

`packages/api/src/services/loanRates/admin.service.ts`:
```ts
import type { LoanRate } from '@prisma/client';
import { Decimal } from 'decimal.js';
import type {
  AdminLoanRateSourceWire, AdminRateKeyWire, LoanRateReadingWire, ManualRateInputWire, MclrTenor, RateSourceMode,
} from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { runLoanRates, runLoanRatesJob, type LoanRatesRunResult } from '../../jobs/loanRatesJob.js';
import { isSourceStale } from './sanity.js';
import { ensureLoanRateSources } from './sourceList.js';
import { activateSuspect, dateOnly, rateKey, toReadingWire, writeBenchmark } from './store.js';

const MANUAL_MIN = new Decimal('0.01');
const MANUAL_MAX = new Decimal(50);

/**
 * Settings - Loan rates (spec s5.5): per source, mode, last success / error, the effective rate, the latest
 * AUTO reading beside any MANUAL override (`differs` when they disagree), and pending SUSPECT readings.
 */
export async function listAdminLoanRates(now: Date = new Date()): Promise<AdminLoanRateSourceWire[]> {
  await ensureLoanRateSources();
  const [sources, rows] = await Promise.all([
    prisma.loanRateSource.findMany({ orderBy: [{ lender: 'asc' }, { loanType: 'asc' }] }),
    prisma.loanRate.findMany({ where: { status: { in: ['ACTIVE', 'SUSPECT'] } }, orderBy: { fetchedAt: 'desc' } }),
  ]);
  const bySource = new Map<string, LoanRate[]>();
  for (const row of rows) bySource.set(row.sourceId, [...(bySource.get(row.sourceId) ?? []), row]);

  return sources.map((source) => {
    const own = bySource.get(source.id) ?? [];
    const active = own.filter((r) => r.status === 'ACTIVE');
    const tenors: (MclrTenor | null)[] = [...new Set(own.map((r) => r.tenor as MclrTenor | null))];
    const keys: AdminRateKeyWire[] = tenors
      .sort((a, b) => (a ?? '').localeCompare(b ?? ''))
      .map((tenor) => {
        const forKey = active.filter((r) => rateKey(r.sourceId, r.tenor) === rateKey(source.id, tenor));
        const manual = forKey.find((r) => r.origin === 'MANUAL') ?? null;
        const latestAuto = forKey.find((r) => r.origin === 'AUTO') ?? null;
        const effective = manual ?? latestAuto;
        const differs =
          manual !== null &&
          latestAuto !== null &&
          (!manual.minRatePct.equals(latestAuto.minRatePct) ||
            (manual.maxRatePct?.toString() ?? null) !== (latestAuto.maxRatePct?.toString() ?? null));
        return {
          tenor,
          effective: effective ? toReadingWire(effective) : null,
          latestAuto: latestAuto ? toReadingWire(latestAuto) : null,
          manual: manual ? toReadingWire(manual) : null,
          differs,
        };
      })
      .filter((k) => k.effective !== null);
    return {
      id: source.id,
      lender: source.lender,
      loanType: source.loanType,
      url: source.url,
      mode: source.mode as RateSourceMode,
      adapter: source.adapter,
      adapterVer: source.adapterVer,
      lastSuccessAt: source.lastSuccessAt?.toISOString() ?? null,
      lastErrorAt: source.lastErrorAt?.toISOString() ?? null,
      lastError: source.lastError,
      stale: isSourceStale(source, now),
      keys,
      suspects: own.filter((r) => r.status === 'SUSPECT').map(toReadingWire),
    };
  });
}

/**
 * Admin sets or corrects a rate: a MANUAL ACTIVE row that wins over AUTO until cleared. Validated, not
 * sanity-checked (plan ruling 9). On a REPO or MCLR source it also updates the benchmark series.
 */
export async function setManualRate(
  adminId: string,
  sourceId: string,
  input: ManualRateInputWire,
  now: Date = new Date(),
): Promise<LoanRateReadingWire> {
  const source = await prisma.loanRateSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new NotFoundError(`Unknown loan-rate source ${sourceId}`);
  const tenor = input.tenor ?? null;
  if (source.loanType === 'MCLR' && tenor === null) throw new BadRequestError('Choose the MCLR tenor', { field: 'tenor' });
  if (source.loanType !== 'MCLR' && tenor !== null) throw new BadRequestError('Only MCLR sources have a tenor', { field: 'tenor' });
  const min = new Decimal(input.minRatePct);
  if (min.lessThan(MANUAL_MIN) || min.greaterThan(MANUAL_MAX)) {
    throw new BadRequestError('Rate must be between 0.01 and 50', { field: 'minRatePct' });
  }
  const maxRaw = input.maxRatePct ?? null;
  if (maxRaw !== null) {
    const max = new Decimal(maxRaw);
    if (max.lessThan(min) || max.greaterThan(MANUAL_MAX)) {
      throw new BadRequestError('Upper rate must be at least the lower rate and at most 50', { field: 'maxRatePct' });
    }
  }
  const effectiveDate = input.effectiveDate ?? null;

  const row = await runInTransaction(async (tx) => {
    await tx.loanRate.updateMany({
      where: { sourceId, tenor, origin: 'MANUAL', status: 'ACTIVE' },
      data: { status: 'SUPERSEDED' },
    });
    return tx.loanRate.create({
      data: {
        sourceId,
        basis: input.basis,
        tenor,
        minRatePct: input.minRatePct,
        maxRatePct: maxRaw,
        effectiveDate: effectiveDate === null ? null : dateOnly(effectiveDate),
        fetchedAt: now,
        origin: 'MANUAL',
        status: 'ACTIVE',
        note: input.note,
        createdById: adminId,
      },
    });
  });
  await writeBenchmark(source, tenor, input.minRatePct, effectiveDate, now);
  return toReadingWire(row);
}

/** Clear the override for a source (optionally one tenor). Returns how many MANUAL rows were retired. */
export async function clearManualRate(sourceId: string, tenor: MclrTenor | null | undefined): Promise<number> {
  const source = await prisma.loanRateSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new NotFoundError(`Unknown loan-rate source ${sourceId}`);
  const { count } = await prisma.loanRate.updateMany({
    where: { sourceId, origin: 'MANUAL', status: 'ACTIVE', ...(tenor === undefined ? {} : { tenor }) },
    data: { status: 'SUPERSEDED' },
  });
  if (count === 0) throw new NotFoundError('No manual rate to clear');
  return count;
}

export async function approveSuspect(id: string, now: Date = new Date()): Promise<LoanRateReadingWire> {
  const row = await activateSuspect(id, now);
  if (!row) throw new ConflictError('Only a SUSPECT reading can be approved');
  return toReadingWire(row);
}

export async function rejectSuspect(id: string): Promise<LoanRateReadingWire> {
  const { count } = await prisma.loanRate.updateMany({ where: { id, status: 'SUSPECT' }, data: { status: 'REJECTED' } });
  if (count === 0) throw new ConflictError('Only a SUSPECT reading can be rejected');
  return toReadingWire(await prisma.loanRate.findUniqueOrThrow({ where: { id } }));
}

export type RunNowResult = { started: 'one'; result: LoanRatesRunResult } | { started: 'all' };

/**
 * "Run now". One source: run its page now and return what happened. All: start the job in the background
 * (single-flight with the cron) - fifteen pages at up to 15 s each is too long for a request.
 */
export async function runNow(sourceId: string | undefined): Promise<RunNowResult> {
  if (sourceId === undefined) {
    runLoanRatesJob().catch((err: unknown) => logger.error({ err }, '[loanRates] run-now (all) failed'));
    return { started: 'all' };
  }
  const source = await prisma.loanRateSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new NotFoundError(`Unknown loan-rate source ${sourceId}`);
  if (source.mode !== 'AUTO' || source.adapter === null) {
    throw new BadRequestError('This source is entered by hand; set its rate instead', { field: 'sourceId' });
  }
  return { started: 'one', result: await runLoanRates({ readerIds: [source.adapter] }) };
}
```

`packages/api/src/controllers/loanRates.controller.ts` - replace the file with:
```ts
import type { Request, Response } from 'express';
import { z } from 'zod';
import { MCLR_TENORS, RATE_BASES, RATE_LOAN_TYPES } from '@everypaisa/shared';
import { created, ok } from '../lib/response.js';
import { writeAuditLog } from '../lib/audit.js';
import { listLoanRates } from '../services/loanRates/loanRates.service.js';
import {
  approveSuspect, clearManualRate, listAdminLoanRates, rejectSuspect, runNow, setManualRate,
} from '../services/loanRates/admin.service.js';

const listQuery = z.object({ loanType: z.enum(RATE_LOAN_TYPES).default('HOME') });

/** GET /api/loan-rates?loanType=HOME */
export async function listLoanRatesHandler(req: Request, res: Response): Promise<void> {
  const { loanType } = listQuery.parse(req.query);
  ok(res, await listLoanRates(loanType));
}

const rateString = z.string().trim().regex(/^\d{1,2}(\.\d{1,3})?$/, 'Use a rate like 8.50');
const manualBody = z.object({
  basis: z.enum(RATE_BASES),
  tenor: z.enum(MCLR_TENORS).nullable().optional(),
  minRatePct: rateString,
  maxRatePct: rateString.nullable().optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().trim().min(3).max(500),
});
const clearQuery = z.object({ tenor: z.enum(MCLR_TENORS).optional() });
const runBody = z.object({ sourceId: z.string().min(1).max(64).optional() });

/** The person at the keyboard: under X-Act-As the manager, otherwise the signed-in admin. */
function actorId(req: Request): string {
  return req.actor?.id ?? req.user!.id;
}

/** GET /api/admin/loan-rates */
export async function adminListHandler(_req: Request, res: Response): Promise<void> {
  ok(res, { sources: await listAdminLoanRates() });
}

/** POST /api/admin/loan-rates/:sourceId/manual */
export async function adminSetManualHandler(req: Request, res: Response): Promise<void> {
  const input = manualBody.parse(req.body);
  const sourceId = String(req.params.sourceId);
  const row = await setManualRate(actorId(req), sourceId, input);
  await writeAuditLog({
    userId: actorId(req),
    action: 'loan_rate_manual_set',
    resource: `LoanRateSource:${sourceId}`,
    metadata: { rateId: row.id, basis: row.basis, tenor: row.tenor, minRatePct: row.minRatePct, maxRatePct: row.maxRatePct, effectiveDate: row.effectiveDate, note: input.note },
    req,
  });
  created(res, row);
}

/** DELETE /api/admin/loan-rates/:sourceId/manual?tenor=1Y */
export async function adminClearManualHandler(req: Request, res: Response): Promise<void> {
  const { tenor } = clearQuery.parse(req.query);
  const sourceId = String(req.params.sourceId);
  const cleared = await clearManualRate(sourceId, tenor);
  await writeAuditLog({
    userId: actorId(req),
    action: 'loan_rate_override_cleared',
    resource: `LoanRateSource:${sourceId}`,
    metadata: { tenor: tenor ?? null, cleared },
    req,
  });
  ok(res, { cleared });
}

/** POST /api/admin/loan-rates/readings/:id/approve */
export async function adminApproveHandler(req: Request, res: Response): Promise<void> {
  const row = await approveSuspect(String(req.params.id));
  await writeAuditLog({
    userId: actorId(req),
    action: 'loan_rate_suspect_approved',
    resource: `LoanRate:${row.id}`,
    metadata: { sourceId: row.sourceId, tenor: row.tenor, minRatePct: row.minRatePct, maxRatePct: row.maxRatePct, note: row.note },
    req,
  });
  ok(res, row);
}

/** POST /api/admin/loan-rates/readings/:id/reject */
export async function adminRejectHandler(req: Request, res: Response): Promise<void> {
  const row = await rejectSuspect(String(req.params.id));
  await writeAuditLog({
    userId: actorId(req),
    action: 'loan_rate_suspect_rejected',
    resource: `LoanRate:${row.id}`,
    metadata: { sourceId: row.sourceId, tenor: row.tenor, minRatePct: row.minRatePct, note: row.note },
    req,
  });
  ok(res, row);
}

/** POST /api/admin/loan-rates/run  body { sourceId? } */
export async function adminRunHandler(req: Request, res: Response): Promise<void> {
  const { sourceId } = runBody.parse(req.body ?? {});
  const result = await runNow(sourceId);
  await writeAuditLog({
    userId: actorId(req),
    action: 'loan_rate_run_now',
    resource: `LoanRateSource:${sourceId ?? '*'}`,
    metadata: result.started === 'one' ? { pages: result.result.pages.map((p) => `${p.readerId}:${p.status}`) } : { scope: 'all' },
    req,
  });
  if (result.started === 'all') {
    res.status(202).json({ success: true, data: result });
    return;
  }
  ok(res, result);
}
```

`packages/api/src/routes/adminLoanRates.routes.ts`:
```ts
import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { requireSecondFactor } from '../lib/professionalMfa.js';
import { loanRatesRunLimiter } from '../middleware/rateLimit.js';
import {
  adminApproveHandler, adminClearManualHandler, adminListHandler, adminRejectHandler, adminRunHandler, adminSetManualHandler,
} from '../controllers/loanRates.controller.js';

/**
 * /api/admin/loan-rates (spec s5.5/s5.6). The gate is structural (router.use), so a route added below is
 * gated too: ADMIN role, then a session signed in with a second factor - the same pair billing's admin
 * escape hatch uses. The rate tables are shared reference data; the AuditLog row each write leaves is what
 * makes an unowned write attributable.
 */
export const adminLoanRatesRouter = Router();
adminLoanRatesRouter.use(authenticate, requireRole('ADMIN'), requireSecondFactor('admin tools'));

adminLoanRatesRouter.get('/', asyncHandler(adminListHandler));
adminLoanRatesRouter.post('/run', loanRatesRunLimiter, asyncHandler(adminRunHandler));
adminLoanRatesRouter.post('/readings/:id/approve', asyncHandler(adminApproveHandler));
adminLoanRatesRouter.post('/readings/:id/reject', asyncHandler(adminRejectHandler));
adminLoanRatesRouter.post('/:sourceId/manual', asyncHandler(adminSetManualHandler));
adminLoanRatesRouter.delete('/:sourceId/manual', asyncHandler(adminClearManualHandler));
```

`packages/api/src/routes/index.ts`: add `import { adminLoanRatesRouter } from './adminLoanRates.routes.js';` and `app.use('/api/admin/loan-rates', adminLoanRatesRouter);` directly after `app.use('/api/admin/mf-qualitative-facts', mfQualitativeFactsRouter);`.

If `req.actor` is not declared on Express's `Request` type in this repo, find its declaration (`grep -rn "actor?:" src/types`) - `middleware/authenticate.ts` assigns it, so it exists; do not add a new declaration.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd portfolioos/packages/api
DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run test/routes/adminLoanRates.routes.test.ts test/routes/loanRates.routes.test.ts test/security/professionalMfa.test.ts
npx tsc --noEmit && npx eslint src/services/loanRates src/controllers/loanRates.controller.ts src/routes/adminLoanRates.routes.ts src/routes/index.ts src/lib/audit.ts src/middleware/rateLimit.ts
```
Expected: PASS; no type or lint errors.

- [ ] **Step 5: Commit**

```bash
cd portfolioos
git add packages/api/src/services/loanRates/admin.service.ts packages/api/src/controllers/loanRates.controller.ts packages/api/src/routes/adminLoanRates.routes.ts packages/api/src/routes/index.ts packages/api/src/lib/audit.ts packages/api/src/middleware/rateLimit.ts packages/api/test/routes/adminLoanRates.routes.test.ts
git commit -m "feat(loan-rates): admin API for overrides, suspect review and run now

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Live rates tab and "Use this rate"

**Files:**
- Create: `apps/web/src/api/loanRates.api.ts`, `apps/web/src/pages/emi/liveRates.ts`, `apps/web/src/pages/emi/LiveRatesTab.tsx`
- Modify: `apps/web/src/pages/emi/emiUrl.ts` (tab `rates`), `apps/web/src/pages/emi/EmiCalculatorPage.tsx` (third tab, `applyRate`)
- Test: `apps/web/src/pages/emi/liveRates.test.ts`, `apps/web/src/pages/emi/LiveRatesTab.test.tsx`, `apps/web/src/pages/emi/emiUrl.test.ts` (one case), `apps/web/src/pages/emi/EmiCalculatorPage.test.tsx` (one case + a mock)

**Interfaces:**
- Consumes: `GET /api/loan-rates` (Task 9); shared `LoanRatesWire`, `LoanRateRowWire`, `RepoRateWire`, `RATE_LOAN_TYPES`, `RATE_LOAN_TYPE_LABELS`, `RATE_BASIS_LABELS`, `Decimal`, `formatDateOnly`, `formatDateIST`, `TaxLoanKind`; `api`, `unwrap` from `apps/web/src/api/client.ts`; Plan 1's `CalcState`, `EmiTab`, `decodeEmiUrl`.
- Produces: `loanRatesApi.list(loanType: RateLoanType): Promise<LoanRatesWire>`; `loanKindForRate(loanType, current: TaxLoanKind): TaxLoanKind`; `bestRowId(rows: LoanRateRowWire[]): string | null`; `rateRange(row): string`; `repoLine(repo: RepoRateWire): string`; `LiveRatesTab({ onUseRate }: { onUseRate: (row: LoanRateRowWire) => void })`; `type EmiTab = 'calculate' | 'compare' | 'rates'`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/pages/emi/liveRates.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { LoanRateRowWire } from '@everypaisa/shared';
import { bestRowId, loanKindForRate, rateRange, repoLine } from './liveRates';

const row = (sourceId: string, min: string, over: Partial<LoanRateRowWire> = {}): LoanRateRowWire => ({
  sourceId, lender: sourceId, loanType: 'HOME', basis: 'REPO_LINKED', minRatePct: min, maxRatePct: null,
  effectiveDate: null, asOf: '2026-10-12T02:00:00.000Z', stale: false, sourceUrl: 'https://example.invalid', origin: 'AUTO', ...over,
});

describe('loanKindForRate', () => {
  it('maps loan types to tax defaults and keeps a let-out home choice', () => {
    expect(loanKindForRate('HOME', 'NONE')).toBe('HOME_SELF');
    expect(loanKindForRate('HOME', 'HOME_LET_OUT')).toBe('HOME_LET_OUT');
    expect(loanKindForRate('EDUCATION', 'HOME_SELF')).toBe('EDUCATION');
    expect(loanKindForRate('CAR', 'HOME_SELF')).toBe('NONE');
  });
});

describe('bestRowId', () => {
  it('lowest min rate by decimal value, ignoring stale rows', () => {
    expect(bestRowId([row('a', '8.10'), row('b', '7.95'), row('c', '7.70', { stale: true }), row('d', '10.00')])).toBe('b');
  });
  it('null when nothing is usable', () => {
    expect(bestRowId([])).toBeNull();
    expect(bestRowId([row('a', '8.10', { stale: true })])).toBeNull();
  });
});

describe('text', () => {
  it('rate range uses a plain hyphen; a headline rate reads "from"', () => {
    expect(rateRange({ minRatePct: '8.00', maxRatePct: '13.45' })).toBe('8.00% - 13.45%');
    expect(rateRange({ minRatePct: '7.25', maxRatePct: null })).toBe('from 7.25%');
  });
  it('repo line in dd/mm/yyyy, with the direction of the last change', () => {
    expect(repoLine({ ratePct: '5.50', effectiveDate: '2026-10-08', lastChange: null })).toBe('RBI repo rate 5.50% (as of 08/10/2026)');
    expect(repoLine({ ratePct: '5.50', effectiveDate: '2026-10-08', lastChange: { deltaPct: '-0.25', date: '2026-10-08' } }))
      .toBe('RBI repo rate 5.50% - cut by 0.25% on 08/10/2026');
    expect(repoLine({ ratePct: '5.75', effectiveDate: '2027-02-06', lastChange: { deltaPct: '0.25', date: '2027-02-06' } }))
      .toBe('RBI repo rate 5.75% - raised by 0.25% on 06/02/2027');
  });
});
```

`apps/web/src/pages/emi/LiveRatesTab.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import type { LoanRatesWire } from '@everypaisa/shared';
import { renderWithProviders } from '@/pages/split/testUtils';
import { loanRatesApi } from '@/api/loanRates.api';
import { LiveRatesTab } from './LiveRatesTab';

vi.mock('@/api/loanRates.api', () => ({ loanRatesApi: { list: vi.fn() } }));

const DATA: LoanRatesWire = {
  loanType: 'HOME',
  repo: { ratePct: '5.50', effectiveDate: '2026-10-08', lastChange: { deltaPct: '-0.25', date: '2026-10-08' } },
  rows: [
    { sourceId: 'kotak.home', lender: 'Kotak', loanType: 'HOME', basis: 'REPO_LINKED', minRatePct: '7.70', maxRatePct: '13.05', effectiveDate: null, asOf: '2026-10-02T02:00:00.000Z', stale: true, sourceUrl: 'https://www.kotak.bank.in/en/rates.html', origin: 'AUTO' },
    { sourceId: 'hdfc.home', lender: 'HDFC Bank', loanType: 'HOME', basis: 'REPO_LINKED', minRatePct: '8.00', maxRatePct: '13.45', effectiveDate: null, asOf: '2026-10-12T02:00:00.000Z', stale: false, sourceUrl: 'https://homeloans.hdfc.bank.in/ps/home-loans-in-india/interest-rates', origin: 'AUTO' },
    { sourceId: 'sbi.home', lender: 'SBI', loanType: 'HOME', basis: 'REPO_LINKED', minRatePct: '8.10', maxRatePct: null, effectiveDate: '2026-04-01', asOf: '2026-10-12T02:00:00.000Z', stale: false, sourceUrl: 'https://sbi.bank.in/web/interest-rates/interest-rates/mclr', origin: 'AUTO' },
  ],
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('LiveRatesTab', () => {
  it('lists lenders with range, basis, dd/mm/yyyy dates, stale badge, link and the lowest usable rate marked', async () => {
    vi.mocked(loanRatesApi.list).mockResolvedValue(DATA);
    renderWithProviders(<LiveRatesTab onUseRate={vi.fn()} />);
    const hdfc = await screen.findByTestId('rate-row-hdfc.home');
    expect(hdfc.textContent).toContain('8.00% - 13.45%');
    expect(hdfc.textContent).toContain('Repo-linked');
    expect(hdfc.textContent).toContain('12/10/2026');
    expect(within(hdfc).getByText('Lowest')).toBeTruthy();
    expect(within(screen.getByTestId('rate-row-kotak.home')).getByText('Stale')).toBeTruthy();
    expect(within(screen.getByTestId('rate-row-kotak.home')).queryByText('Lowest')).toBeNull();
    expect(screen.getByTestId('rate-row-sbi.home').textContent).toContain('w.e.f. 01/04/2026');
    const link = within(hdfc).getByRole('link', { name: /HDFC Bank rates page/i });
    expect(link.getAttribute('href')).toBe('https://homeloans.hdfc.bank.in/ps/home-loans-in-india/interest-rates');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.getByTestId('repo-line').textContent).toBe('RBI repo rate 5.50% - cut by 0.25% on 08/10/2026');
    expect(screen.getByText(/Indicative\. Your rate depends on credit score, loan amount and tenure\./)).toBeTruthy();
  });

  it('"Use this rate" hands the row to the page', async () => {
    vi.mocked(loanRatesApi.list).mockResolvedValue(DATA);
    const onUseRate = vi.fn();
    renderWithProviders(<LiveRatesTab onUseRate={onUseRate} />);
    const hdfc = await screen.findByTestId('rate-row-hdfc.home');
    fireEvent.click(within(hdfc).getByRole('button', { name: /use this rate/i }));
    expect(onUseRate).toHaveBeenCalledWith(DATA.rows[1]);
  });

  it('changing the loan type asks for that type', async () => {
    vi.mocked(loanRatesApi.list).mockResolvedValue({ loanType: 'HOME', rows: [], repo: null });
    renderWithProviders(<LiveRatesTab onUseRate={vi.fn()} />);
    await waitFor(() => expect(loanRatesApi.list).toHaveBeenCalledWith('HOME'));
    fireEvent.change(screen.getByLabelText('Loan type'), { target: { value: 'CAR' } });
    await waitFor(() => expect(loanRatesApi.list).toHaveBeenCalledWith('CAR'));
  });

  it.each([
    ['no rows', () => vi.mocked(loanRatesApi.list).mockResolvedValue({ loanType: 'HOME', rows: [], repo: null })],
    ['an API error', () => vi.mocked(loanRatesApi.list).mockRejectedValue(new Error('502'))],
  ])('shows "Rates not available yet" on %s', async (_label, arrange) => {
    arrange();
    renderWithProviders(<LiveRatesTab onUseRate={vi.fn()} />);
    expect((await screen.findByTestId('rates-empty')).textContent).toContain('Rates not available yet');
  });
});
```

`apps/web/src/pages/emi/emiUrl.test.ts`: add inside `describe('emi share URL', ...)`:
```ts
  it('keeps the Live rates tab', () => {
    expect(decodeEmiUrl('?tab=rates')).toEqual({ tab: 'rates' });
    expect(decodeEmiUrl(`?${encodeEmiUrl('rates', calc, compare)}`).tab).toBe('rates');
  });
```

`apps/web/src/pages/emi/EmiCalculatorPage.test.tsx`: add beside the other `vi.mock` calls

```tsx
vi.mock('@/api/loanRates.api', () => ({
  loanRatesApi: {
    list: vi.fn().mockResolvedValue({
      loanType: 'HOME',
      repo: null,
      rows: [{ sourceId: 'hdfc.home', lender: 'HDFC Bank', loanType: 'HOME', basis: 'REPO_LINKED', minRatePct: '8.00', maxRatePct: '13.45', effectiveDate: null, asOf: '2026-10-12T02:00:00.000Z', stale: false, sourceUrl: 'https://homeloans.hdfc.bank.in/ps/home-loans-in-india/interest-rates', origin: 'AUTO' }],
    }),
  },
}));
```

and this case inside `describe('EmiCalculatorPage', ...)`:
```tsx
  it('"Use this rate" fills the rate and returns to Calculate', async () => {
    renderWithProviders(<EmiCalculatorPage />, { route: '/emi', path: '/emi' });
    fireEvent.mouseDown(screen.getByRole('tab', { name: /live rates/i }));
    fireEvent.click(screen.getByRole('tab', { name: /live rates/i }));
    const row = await screen.findByTestId('rate-row-hdfc.home');
    fireEvent.click(within(row).getByRole('button', { name: /use this rate/i }));
    await waitFor(() => expect((document.getElementById('emi-rate') as HTMLInputElement).value).toBe('8.00'));
    expect(screen.getByRole('tab', { name: /calculate/i }).getAttribute('aria-selected')).toBe('true');
    expect(toast.success).toHaveBeenCalledWith('Using HDFC Bank 8.00% - check it against your own offer');
  });
```
(add `within` to the `@testing-library/react` import of that file).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/emi`
Expected: FAIL - cannot find `./liveRates`, `./LiveRatesTab`, `@/api/loanRates.api`; the page case finds no "Live rates" tab.

- [ ] **Step 3: Implement**

`apps/web/src/api/loanRates.api.ts`:
```ts
import type { ApiResponse, LoanRatesWire, RateLoanType } from '@everypaisa/shared';
import { api, unwrap } from './client';

/** Live loan rates (EMI calculator plan 2). Rates arrive as decimal strings and stay strings. */
export const loanRatesApi = {
  async list(loanType: RateLoanType): Promise<LoanRatesWire> {
    const { data } = await api.get<ApiResponse<LoanRatesWire>>('/api/loan-rates', { params: { loanType } });
    return unwrap(data);
  },
};
```

`apps/web/src/pages/emi/liveRates.ts`:
```ts
import { Decimal, formatDateOnly, type LoanRateRowWire, type RateLoanType, type RepoRateWire, type TaxLoanKind } from '@everypaisa/shared';

/** Tax defaults that follow from the chosen loan type (plan ruling 14). */
export function loanKindForRate(loanType: RateLoanType, current: TaxLoanKind): TaxLoanKind {
  if (loanType === 'HOME') return current === 'HOME_LET_OUT' ? 'HOME_LET_OUT' : 'HOME_SELF';
  if (loanType === 'EDUCATION') return 'EDUCATION';
  return 'NONE';
}

/** The row to highlight: lowest minimum rate among rows that are not stale. */
export function bestRowId(rows: LoanRateRowWire[]): string | null {
  let best: LoanRateRowWire | null = null;
  for (const row of rows) {
    if (row.stale) continue;
    if (best === null || new Decimal(row.minRatePct).lessThan(best.minRatePct)) best = row;
  }
  return best?.sourceId ?? null;
}

export function rateRange(row: Pick<LoanRateRowWire, 'minRatePct' | 'maxRatePct'>): string {
  return row.maxRatePct === null ? `from ${row.minRatePct}%` : `${row.minRatePct}% - ${row.maxRatePct}%`;
}

export function repoLine(repo: RepoRateWire): string {
  const base = `RBI repo rate ${repo.ratePct}%`;
  if (repo.lastChange === null) return `${base} (as of ${formatDateOnly(repo.effectiveDate)})`;
  const delta = new Decimal(repo.lastChange.deltaPct);
  return `${base} - ${delta.isNegative() ? 'cut' : 'raised'} by ${delta.abs().toFixed(2)}% on ${formatDateOnly(repo.lastChange.date)}`;
}
```

`apps/web/src/pages/emi/LiveRatesTab.tsx`:
```tsx
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2 } from 'lucide-react';
import {
  RATE_BASIS_LABELS, RATE_LOAN_TYPES, RATE_LOAN_TYPE_LABELS, formatDateIST, formatDateOnly,
  type LoanRateRowWire, type RateLoanType,
} from '@everypaisa/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { loanRatesApi } from '@/api/loanRates.api';
import { bestRowId, rateRange, repoLine } from './liveRates';

/**
 * Live rates (spec s5.7): indicative market rates by lender for one loan type, refreshed daily on the
 * server. The calculator never depends on this tab: an empty or failed load shows one line and nothing else.
 */
export function LiveRatesTab({ onUseRate }: { onUseRate: (row: LoanRateRowWire) => void }) {
  const [loanType, setLoanType] = useState<RateLoanType>('HOME');
  const query = useQuery({
    queryKey: ['loan-rates', loanType],
    queryFn: () => loanRatesApi.list(loanType),
    staleTime: 10 * 60_000,
  });
  const rows = query.data?.rows ?? [];
  const best = useMemo(() => bestRowId(rows), [rows]);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <CardTitle>Live loan rates</CardTitle>
          <div className="w-full space-y-1 sm:w-64">
            <Label htmlFor="rates-loan-type">Loan type</Label>
            <Select id="rates-loan-type" value={loanType} onChange={(e) => setLoanType(e.target.value as RateLoanType)}>
              {RATE_LOAN_TYPES.map((t) => (
                <option key={t} value={t}>{RATE_LOAN_TYPE_LABELS[t]}</option>
              ))}
            </Select>
          </div>
        </div>
        {query.data?.repo && (
          <p data-testid="repo-line" className="text-sm">{repoLine(query.data.repo)}</p>
        )}
        <p className="text-xs text-muted-foreground">Indicative. Your rate depends on credit score, loan amount and tenure.</p>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading rates" /></div>
        ) : rows.length === 0 ? (
          <p data-testid="rates-empty" className="py-6 text-center text-sm text-muted-foreground">Rates not available yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Lender</th>
                  <th className="py-2 pr-3 font-medium">Rate (% p.a.)</th>
                  <th className="py-2 pr-3 font-medium">Basis</th>
                  <th className="py-2 pr-3 font-medium">As of</th>
                  <th className="py-2 pr-3 font-medium"><span className="sr-only">Lender page</span></th>
                  <th className="py-2 font-medium"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isBest = row.sourceId === best;
                  return (
                    <tr key={row.sourceId} data-testid={`rate-row-${row.sourceId}`} className={`border-b last:border-0 ${isBest ? 'bg-emerald-500/10' : ''}`}>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{row.lender}</span>
                          {isBest && <Badge variant="secondary">Lowest</Badge>}
                        </div>
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{rateRange(row)}</td>
                      <td className="py-2 pr-3">{RATE_BASIS_LABELS[row.basis]}</td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{formatDateIST(row.asOf)}</span>
                          {row.stale && <Badge variant="outline">Stale</Badge>}
                        </div>
                        {row.effectiveDate && <div className="text-xs text-muted-foreground">w.e.f. {formatDateOnly(row.effectiveDate)}</div>}
                      </td>
                      <td className="py-2 pr-3">
                        <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`${row.lender} rates page`} className="inline-flex text-muted-foreground hover:text-foreground">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </td>
                      <td className="py-2 text-right">
                        <Button type="button" size="sm" variant="outline" onClick={() => onUseRate(row)}>Use this rate</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

`apps/web/src/pages/emi/emiUrl.ts`: widen the tab type and parse it.
```ts
export type EmiTab = 'calculate' | 'compare' | 'rates';
```
and in `decodeEmiUrl` replace the `const tab` line with:
```ts
  const rawTab = p.get('tab');
  const tab: EmiTab = rawTab === 'compare' || rawTab === 'rates' ? rawTab : 'calculate';
```

`apps/web/src/pages/emi/EmiCalculatorPage.tsx`:
- imports: add `import type { LoanRateRowWire } from '@everypaisa/shared';` (merge into the existing type import from `@everypaisa/shared`), `import { LiveRatesTab } from './LiveRatesTab';`, `import { loanKindForRate } from './liveRates';`
- after the `onOutcome` callback add:
```tsx
  // Live rates -> Calculate: take the lender's lowest rate and the tax defaults for its loan type.
  const applyRate = useCallback((row: LoanRateRowWire) => {
    setCalc((c) => ({ ...c, ratePct: row.minRatePct, loanKind: loanKindForRate(row.loanType, c.loanKind) }));
    setTab('calculate');
    toast.success(`Using ${row.lender} ${row.minRatePct}% - check it against your own offer`);
  }, []);
```
- in `<TabsList>` after the Compare trigger: `<TabsTrigger value="rates">Live rates</TabsTrigger>`
- after the compare `TabsContent`:
```tsx
        <TabsContent value="rates" className="mt-4">
          <LiveRatesTab onUseRate={applyRate} />
        </TabsContent>
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run:
```bash
cd portfolioos/apps/web
npx vitest run src/pages/emi
npx tsc --noEmit
npx eslint src/pages/emi src/api/loanRates.api.ts
```
Expected: all PASS (Plan 1's page tests included); no type errors; no new lint errors.

- [ ] **Step 5: Commit**

```bash
cd portfolioos
git add apps/web/src/api/loanRates.api.ts apps/web/src/pages/emi/liveRates.ts apps/web/src/pages/emi/liveRates.test.ts apps/web/src/pages/emi/LiveRatesTab.tsx apps/web/src/pages/emi/LiveRatesTab.test.tsx apps/web/src/pages/emi/emiUrl.ts apps/web/src/pages/emi/emiUrl.test.ts apps/web/src/pages/emi/EmiCalculatorPage.tsx apps/web/src/pages/emi/EmiCalculatorPage.test.tsx
git commit -m "feat(emi-web): Live rates tab with Use this rate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Settings -> Loan rates admin page; dev seed script; browser check

**Files:**
- Modify: `apps/web/src/api/loanRates.api.ts` (admin client)
- Create: `apps/web/src/pages/settings/LoanRatesAdminPage.tsx`
- Modify: `apps/web/src/App.tsx` (route `/settings/loan-rates`), `apps/web/src/pages/settings/SettingsPage.tsx` (ADMIN-only link card)
- Create: `packages/api/scripts/seed-loan-rates-from-fixtures.ts` (dev only, isolated local DB)
- Test: `apps/web/src/pages/settings/LoanRatesAdminPage.test.tsx`

**Interfaces:**
- Consumes: Task 10 routes; shared `AdminLoanRateSourceWire`, `AdminRateKeyWire`, `LoanRateReadingWire`, `ManualRateInputWire`, `MclrTenor`, `RATE_BASES`, `RATE_BASIS_LABELS`, `MCLR_TENORS`, `MCLR_TENOR_LABELS`, `RATE_LOAN_TYPE_LABELS`, `isRateLoanType`, `formatDateOnly`, `formatDateTimeIST`; `rateRange` (Task 11); `useAuthStore` (`apps/web/src/stores/auth.store.ts`); `apiErrorMessage`; Task 8 `runLoanRates`.
- Produces: `loanRatesAdminApi.list(): Promise<AdminLoanRateSourceWire[]>`, `.setManual(sourceId, input): Promise<LoanRateReadingWire>`, `.clearManual(sourceId, tenor: MclrTenor | null): Promise<number>`, `.approve(id)`, `.reject(id)`, `.run(sourceId?: string): Promise<void>`; `LoanRatesAdminPage`; route `/settings/loan-rates`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/pages/settings/LoanRatesAdminPage.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import type { AdminLoanRateSourceWire, AuthUser, LoanRateReadingWire } from '@everypaisa/shared';
import { renderWithProviders } from '@/pages/split/testUtils';
import { useAuthStore } from '@/stores/auth.store';
import { loanRatesAdminApi } from '@/api/loanRates.api';
import { LoanRatesAdminPage } from './LoanRatesAdminPage';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/loanRates.api', () => ({
  loanRatesAdminApi: { list: vi.fn(), setManual: vi.fn(), clearManual: vi.fn(), approve: vi.fn(), reject: vi.fn(), run: vi.fn() },
}));

function makeUser(role: AuthUser['role']): AuthUser {
  return { id: 'u1', email: 'a@b.com', name: 'Admin', role, plan: 'FREE', isActive: true, createdAt: new Date().toISOString() };
}

const reading = (over: Partial<LoanRateReadingWire>): LoanRateReadingWire => ({
  id: 'r1', sourceId: 'hdfc.home', basis: 'REPO_LINKED', tenor: null, minRatePct: '8.00', maxRatePct: '13.45', effectiveDate: null,
  fetchedAt: '2026-10-12T02:00:00.000Z', origin: 'AUTO', status: 'ACTIVE', note: null, sourceAdapter: 'hdfc.home', sourceAdapterVer: '1', ...over,
});

const SOURCES: AdminLoanRateSourceWire[] = [
  {
    id: 'hdfc.home', lender: 'HDFC Bank', loanType: 'HOME', url: 'https://homeloans.hdfc.bank.in/ps/home-loans-in-india/interest-rates',
    mode: 'AUTO', adapter: 'hdfc.home', adapterVer: '1', lastSuccessAt: '2026-10-12T02:00:00.000Z', lastErrorAt: null, lastError: null, stale: false,
    keys: [{
      tenor: null,
      effective: reading({ id: 'm1', origin: 'MANUAL', minRatePct: '7.95', maxRatePct: null, note: 'Branch confirmed' }),
      latestAuto: reading({}),
      manual: reading({ id: 'm1', origin: 'MANUAL', minRatePct: '7.95', maxRatePct: null, note: 'Branch confirmed' }),
      differs: true,
    }],
    suspects: [reading({ id: 's1', minRatePct: '11.00', status: 'SUSPECT', note: 'JUMP' })],
  },
  {
    id: 'sbi.mclr', lender: 'SBI', loanType: 'MCLR', url: 'https://sbi.bank.in/web/interest-rates/interest-rates/mclr',
    mode: 'AUTO', adapter: 'sbi.rates', adapterVer: '1', lastSuccessAt: null, lastErrorAt: '2026-10-12T02:00:00.000Z', lastError: 'No reading for sbi.mclr', stale: true,
    keys: [], suspects: [],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loanRatesAdminApi.list).mockResolvedValue(SOURCES);
  useAuthStore.setState({ user: makeUser('ADMIN') });
});
afterEach(() => {
  cleanup();
  useAuthStore.setState({ user: null });
});

describe('LoanRatesAdminPage', () => {
  it('non-admins see a notice and nothing is requested', () => {
    useAuthStore.setState({ user: makeUser('INVESTOR') });
    renderWithProviders(<LoanRatesAdminPage />);
    expect(screen.getByText('Admins only.')).toBeTruthy();
    expect(loanRatesAdminApi.list).not.toHaveBeenCalled();
  });

  it('shows the override beside the bank figure, flags the difference, the stale source and its error', async () => {
    renderWithProviders(<LoanRatesAdminPage />);
    const key = await screen.findByTestId('key-hdfc.home-none');
    expect(key.textContent).toContain('7.95');
    expect(key.textContent).toContain('8.00% - 13.45%');
    expect(key.textContent).toContain('Differs from the bank page');
    const sbi = screen.getByTestId('source-sbi.mclr');
    expect(within(sbi).getByText('Stale')).toBeTruthy();
    expect(sbi.textContent).toContain('No reading for sbi.mclr');
    expect(sbi.textContent).toContain('never');
  });

  it('approves and rejects suspect readings', async () => {
    vi.mocked(loanRatesAdminApi.approve).mockResolvedValue(reading({ id: 's1', status: 'ACTIVE' }));
    renderWithProviders(<LoanRatesAdminPage />);
    const suspect = await screen.findByTestId('suspect-s1');
    fireEvent.click(within(suspect).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(loanRatesAdminApi.approve).toHaveBeenCalledWith('s1'));
    fireEvent.click(within(suspect).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(loanRatesAdminApi.reject).toHaveBeenCalledWith('s1'));
  });

  it('sets an MCLR rate with its tenor, clears an override, and runs one source', async () => {
    vi.mocked(loanRatesAdminApi.setManual).mockResolvedValue(reading({ origin: 'MANUAL' }));
    vi.mocked(loanRatesAdminApi.clearManual).mockResolvedValue(1);
    vi.mocked(loanRatesAdminApi.run).mockResolvedValue(undefined);
    renderWithProviders(<LoanRatesAdminPage />);

    const sbi = await screen.findByTestId('source-sbi.mclr');
    fireEvent.click(within(sbi).getByRole('button', { name: 'Set rate' }));
    const form = screen.getByTestId('manual-form-sbi.mclr');
    fireEvent.change(within(form).getByLabelText('Tenor'), { target: { value: '6M' } });
    fireEvent.change(within(form).getByLabelText('From (% p.a.)'), { target: { value: '8.60' } });
    fireEvent.change(within(form).getByLabelText('With effect from (optional)'), { target: { value: '2026-09-15' } });
    fireEvent.change(within(form).getByLabelText('Note (where this rate comes from)'), { target: { value: 'SBI MCLR notice' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save rate' }));
    await waitFor(() => expect(loanRatesAdminApi.setManual).toHaveBeenCalledWith('sbi.mclr', {
      basis: 'MCLR', tenor: '6M', minRatePct: '8.60', maxRatePct: null, effectiveDate: '2026-09-15', note: 'SBI MCLR notice',
    }));

    fireEvent.click(within(screen.getByTestId('key-hdfc.home-none')).getByRole('button', { name: 'Clear override' }));
    await waitFor(() => expect(loanRatesAdminApi.clearManual).toHaveBeenCalledWith('hdfc.home', null));

    fireEvent.click(within(screen.getByTestId('source-hdfc.home')).getByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(loanRatesAdminApi.run).toHaveBeenCalledWith('hdfc.home'));
  });

  it('shows the server message when the session lacks the second factor', async () => {
    vi.mocked(loanRatesAdminApi.list).mockRejectedValue(
      Object.assign(new Error('Request failed with status code 403'), {
        isAxiosError: true,
        response: { status: 403, data: { success: false, error: 'Sign out and sign in again with your authenticator code to use admin tools.', code: 'TWO_FACTOR_REQUIRED' } },
      }),
    );
    renderWithProviders(<LoanRatesAdminPage />);
    expect((await screen.findByTestId('admin-error')).textContent).toContain('authenticator code');
  });
});
```

The last case works because `apiErrorMessage` (`apps/web/src/api/client.ts`) recognises errors through `axios.isAxiosError`, which only checks `isAxiosError === true`, then reads `response.data.error`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd portfolioos/apps/web && npx vitest run src/pages/settings/LoanRatesAdminPage.test.tsx`
Expected: FAIL - cannot find `./LoanRatesAdminPage`.

- [ ] **Step 3: Implement**

`apps/web/src/api/loanRates.api.ts` - replace with (keeps `loanRatesApi.list` unchanged):
```ts
import type {
  AdminLoanRateSourceWire, ApiResponse, LoanRateReadingWire, LoanRatesWire, ManualRateInputWire, MclrTenor, RateLoanType,
} from '@everypaisa/shared';
import { api, unwrap } from './client';

/** Live loan rates (EMI calculator plan 2). Rates arrive as decimal strings and stay strings. */
export const loanRatesApi = {
  async list(loanType: RateLoanType): Promise<LoanRatesWire> {
    const { data } = await api.get<ApiResponse<LoanRatesWire>>('/api/loan-rates', { params: { loanType } });
    return unwrap(data);
  },
};

const ADMIN = '/api/admin/loan-rates';

/** Settings - Loan rates. Every call needs ADMIN and a session signed in with a second factor. */
export const loanRatesAdminApi = {
  async list(): Promise<AdminLoanRateSourceWire[]> {
    const { data } = await api.get<ApiResponse<{ sources: AdminLoanRateSourceWire[] }>>(ADMIN);
    return unwrap(data).sources;
  },
  async setManual(sourceId: string, input: ManualRateInputWire): Promise<LoanRateReadingWire> {
    const { data } = await api.post<ApiResponse<LoanRateReadingWire>>(`${ADMIN}/${encodeURIComponent(sourceId)}/manual`, input);
    return unwrap(data);
  },
  async clearManual(sourceId: string, tenor: MclrTenor | null): Promise<number> {
    const { data } = await api.delete<ApiResponse<{ cleared: number }>>(`${ADMIN}/${encodeURIComponent(sourceId)}/manual`, {
      params: tenor ? { tenor } : {},
    });
    return unwrap(data).cleared;
  },
  async approve(id: string): Promise<LoanRateReadingWire> {
    const { data } = await api.post<ApiResponse<LoanRateReadingWire>>(`${ADMIN}/readings/${encodeURIComponent(id)}/approve`);
    return unwrap(data);
  },
  async reject(id: string): Promise<LoanRateReadingWire> {
    const { data } = await api.post<ApiResponse<LoanRateReadingWire>>(`${ADMIN}/readings/${encodeURIComponent(id)}/reject`);
    return unwrap(data);
  },
  async run(sourceId?: string): Promise<void> {
    await api.post(`${ADMIN}/run`, sourceId ? { sourceId } : {});
  },
};
```

`apps/web/src/pages/settings/LoanRatesAdminPage.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  MCLR_TENORS, MCLR_TENOR_LABELS, RATE_BASES, RATE_BASIS_LABELS, RATE_LOAN_TYPE_LABELS, formatDateOnly, formatDateTimeIST,
  isRateLoanType,
  type AdminLoanRateSourceWire, type AdminRateKeyWire, type LoanRateReadingWire, type ManualRateInputWire, type MclrTenor, type RateBasis,
} from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/api/client';
import { loanRatesAdminApi } from '@/api/loanRates.api';
import { useAuthStore } from '@/stores/auth.store';
import { rateRange } from '@/pages/emi/liveRates';

const QUERY_KEY = ['admin-loan-rates'];

function typeLabel(loanType: string): string {
  if (isRateLoanType(loanType)) return RATE_LOAN_TYPE_LABELS[loanType];
  return loanType === 'REPO' ? 'Repo rate' : loanType;
}

function readingText(r: LoanRateReadingWire | null): string {
  if (r === null) return '-';
  const wef = r.effectiveDate ? `, w.e.f. ${formatDateOnly(r.effectiveDate)}` : '';
  return `${rateRange(r)} (${RATE_BASIS_LABELS[r.basis]}${wef})`;
}

/**
 * Settings - Loan rates (spec s5.5). The server gate (ADMIN + a session signed in with a second factor) is
 * the control that matters; the role check here only avoids showing a page whose every request would fail.
 */
export function LoanRatesAdminPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';
  const qc = useQueryClient();
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: () => loanRatesAdminApi.list(), enabled: isAdmin });
  const [lender, setLender] = useState('All');
  const [editing, setEditing] = useState<{ sourceId: string; tenor: MclrTenor | null } | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: QUERY_KEY });
  const onError = (err: unknown) => toast.error(apiErrorMessage(err, "That didn't work"));
  const approve = useMutation({ mutationFn: (id: string) => loanRatesAdminApi.approve(id), onSuccess: () => { toast.success('Approved'); void refresh(); }, onError });
  const reject = useMutation({ mutationFn: (id: string) => loanRatesAdminApi.reject(id), onSuccess: () => { toast.success('Rejected'); void refresh(); }, onError });
  const clear = useMutation({
    mutationFn: (k: { sourceId: string; tenor: MclrTenor | null }) => loanRatesAdminApi.clearManual(k.sourceId, k.tenor),
    onSuccess: () => { toast.success('Override cleared'); void refresh(); },
    onError,
  });
  const run = useMutation({
    mutationFn: (sourceId: string | undefined) => loanRatesAdminApi.run(sourceId),
    onSuccess: (_d, sourceId) => { toast.success(sourceId ? 'Page read again' : 'Started - refresh in a minute'); void refresh(); },
    onError,
  });

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <PageHeader title="Loan rates" />
        <Card><CardContent className="pt-6 text-sm">Admins only.</CardContent></Card>
      </div>
    );
  }

  const sources = query.data ?? [];
  const lenders = ['All', ...new Set(sources.map((s) => s.lender))];
  const suspects = sources.flatMap((s) => s.suspects.map((reading) => ({ source: s, reading })));
  const shown = sources.filter((s) => lender === 'All' || s.lender === lender);

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        title="Loan rates"
        description="Daily lender rates behind the EMI calculator's Live rates tab. A rate you set here wins over the bank page until you clear it."
        actions={
          <Button type="button" size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate(undefined)}>
            <RefreshCw className="mr-1 h-4 w-4" />Run all now
          </Button>
        }
      />

      {query.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" /></div>}
      {query.isError && (
        <Card><CardContent data-testid="admin-error" className="pt-6 text-sm text-destructive">{apiErrorMessage(query.error, "Couldn't load loan rates")}</CardContent></Card>
      )}

      {suspects.length > 0 && (
        <Card data-testid="suspects">
          <CardHeader><CardTitle>Needs review ({suspects.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {suspects.map(({ source, reading }) => (
              <div key={reading.id} data-testid={`suspect-${reading.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <div>
                  <div className="font-medium">{source.lender} - {typeLabel(source.loanType)}{reading.tenor ? ` ${MCLR_TENOR_LABELS[reading.tenor]}` : ''}</div>
                  <div className="text-muted-foreground">{readingText(reading)} read {formatDateTimeIST(reading.fetchedAt)}{reading.note ? ` - ${reading.note}` : ''}</div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => approve.mutate(reading.id)}>Approve</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => reject.mutate(reading.id)}>Reject</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="w-full space-y-1 sm:w-64">
        <Label htmlFor="lr-lender">Lender</Label>
        <Select id="lr-lender" value={lender} onChange={(e) => setLender(e.target.value)}>
          {lenders.map((l) => <option key={l} value={l}>{l}</option>)}
        </Select>
      </div>

      {shown.map((source) => (
        <SourceCard
          key={source.id}
          source={source}
          editing={editing?.sourceId === source.id ? editing : null}
          onEdit={(tenor) => setEditing({ sourceId: source.id, tenor })}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); void refresh(); }}
          onClear={(tenor) => clear.mutate({ sourceId: source.id, tenor })}
          onRun={() => run.mutate(source.id)}
          running={run.isPending}
        />
      ))}
    </div>
  );
}

function SourceCard(props: {
  source: AdminLoanRateSourceWire;
  editing: { tenor: MclrTenor | null } | null;
  onEdit: (tenor: MclrTenor | null) => void;
  onCancel: () => void;
  onSaved: () => void;
  onClear: (tenor: MclrTenor | null) => void;
  onRun: () => void;
  running: boolean;
}) {
  const { source } = props;
  const isMclr = source.loanType === 'MCLR';
  return (
    <Card data-testid={`source-${source.id}`}>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{source.lender} - {typeLabel(source.loanType)}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{source.mode}</Badge>
            {source.stale && <Badge variant="destructive">Stale</Badge>}
            {source.mode === 'AUTO' && (
              <Button type="button" size="sm" variant="outline" disabled={props.running} onClick={props.onRun}>Run now</Button>
            )}
            <Button type="button" size="sm" onClick={() => props.onEdit(isMclr ? '1Y' : null)}>Set rate</Button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Last success: {source.lastSuccessAt ? formatDateTimeIST(source.lastSuccessAt) : 'never'}
          {source.lastError && <> - last error {source.lastErrorAt ? formatDateTimeIST(source.lastErrorAt) : ''}: {source.lastError}</>}
        </div>
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="break-all text-xs underline underline-offset-2">{source.url}</a>
      </CardHeader>
      <CardContent className="space-y-3">
        {source.keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rate yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  {isMclr && <th className="py-1 pr-3 font-medium">Tenor</th>}
                  <th className="py-1 pr-3 font-medium">Shown to users</th>
                  <th className="py-1 pr-3 font-medium">Bank page</th>
                  <th className="py-1 pr-3 font-medium">Your override</th>
                  <th className="py-1 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {source.keys.map((k: AdminRateKeyWire) => (
                  <tr key={k.tenor ?? '-'} data-testid={`key-${source.id}-${k.tenor ?? 'none'}`} className="border-b last:border-0">
                    {isMclr && <td className="py-1 pr-3">{k.tenor ? MCLR_TENOR_LABELS[k.tenor] : '-'}</td>}
                    <td className="py-1 pr-3">{readingText(k.effective)}</td>
                    <td className="py-1 pr-3">{readingText(k.latestAuto)}</td>
                    <td className={`py-1 pr-3 ${k.differs ? 'font-medium text-amber-600 dark:text-amber-400' : ''}`}>
                      {readingText(k.manual)}
                      {k.differs && <div className="text-xs">Differs from the bank page</div>}
                    </td>
                    <td className="py-1 text-right">
                      {k.manual && <Button type="button" size="sm" variant="ghost" onClick={() => props.onClear(k.tenor)}>Clear override</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {props.editing && (
          <ManualRateForm
            source={source}
            initialTenor={props.editing.tenor}
            initialBasis={source.keys[0]?.effective?.basis ?? (isMclr ? 'MCLR' : 'OTHER')}
            onCancel={props.onCancel}
            onSaved={props.onSaved}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ManualRateForm(props: {
  source: AdminLoanRateSourceWire;
  initialTenor: MclrTenor | null;
  initialBasis: RateBasis;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isMclr = props.source.loanType === 'MCLR';
  const [basis, setBasis] = useState<RateBasis>(props.initialBasis);
  const [tenor, setTenor] = useState<MclrTenor>(props.initialTenor ?? '1Y');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [wef, setWef] = useState('');
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: (input: ManualRateInputWire) => loanRatesAdminApi.setManual(props.source.id, input),
    onSuccess: () => { toast.success('Rate saved'); props.onSaved(); },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, "Couldn't save the rate")),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({
      basis,
      tenor: isMclr ? tenor : null,
      minRatePct: min.trim(),
      maxRatePct: max.trim() === '' ? null : max.trim(),
      effectiveDate: wef === '' ? null : wef,
      note: note.trim(),
    });
  }

  const id = (name: string) => `lr-${props.source.id}-${name}`;
  return (
    <form onSubmit={submit} data-testid={`manual-form-${props.source.id}`} className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor={id('basis')}>Basis</Label>
        <Select id={id('basis')} value={basis} onChange={(e) => setBasis(e.target.value as RateBasis)}>
          {RATE_BASES.map((b) => <option key={b} value={b}>{RATE_BASIS_LABELS[b]}</option>)}
        </Select>
      </div>
      {isMclr && (
        <div className="space-y-1">
          <Label htmlFor={id('tenor')}>Tenor</Label>
          <Select id={id('tenor')} value={tenor} onChange={(e) => setTenor(e.target.value as MclrTenor)}>
            {MCLR_TENORS.map((t) => <option key={t} value={t}>{MCLR_TENOR_LABELS[t]}</option>)}
          </Select>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor={id('min')}>From (% p.a.)</Label>
        <Input id={id('min')} inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor={id('max')}>To (% p.a., optional)</Label>
        <Input id={id('max')} inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={id('wef')}>With effect from (optional)</Label>
        <Input id={id('wef')} type="date" value={wef} onChange={(e) => setWef(e.target.value)} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={id('note')}>Note (where this rate comes from)</Label>
        <Textarea id={id('note')} value={note} onChange={(e) => setNote(e.target.value)} required minLength={3} maxLength={500} />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={save.isPending}>Save rate</Button>
        <Button type="button" size="sm" variant="ghost" onClick={props.onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
```

`apps/web/src/App.tsx`: add `import { LoanRatesAdminPage } from './pages/settings/LoanRatesAdminPage';` beside the `ProfessionalAccessPage` import and, directly after the `/settings/professional-access` route:
```tsx
        <Route path="/settings/loan-rates" element={<LoanRatesAdminPage />} />
```

`apps/web/src/pages/settings/SettingsPage.tsx`: inside the `<div className="mt-6">` that holds `<TwoFactorSection />`, after `<DesktopAppSection />`, add:
```tsx
        {user?.role === 'ADMIN' && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Loan rates</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Review and correct the lender rates shown on the EMI calculator's Live rates tab.{' '}
              <Link to="/settings/loan-rates" className="underline underline-offset-2 hover:text-foreground">
                Open loan rates
              </Link>
            </CardContent>
          </Card>
        )}
```
(`Link`, `Card`, `CardHeader`, `CardTitle`, `CardContent` and `user` are already in scope there.)

`packages/api/scripts/seed-loan-rates-from-fixtures.ts`:
```ts
/**
 * Dev only: fill the live-loan-rate tables from the saved real pages, without touching the network, so the
 * Live rates tab and Settings - Loan rates can be looked at locally. Refuses any non-local database.
 *
 *   cd portfolioos/packages/api
 *   DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split \
 *   DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split \
 *   npx tsx scripts/seed-loan-rates-from-fixtures.ts
 */
import { readFileSync } from 'node:fs';
import { runLoanRates } from '../src/jobs/loanRatesJob.js';
import { prisma } from '../src/lib/prisma.js';
import { PAGE_READERS } from '../src/services/loanRates/sources/index.js';

const FIRST_CAPTURE: Record<string, string> = {
  'rbi.home': 'rbi-home.html',
  'sbi.rates': 'sbi-mclr.html',
  'hdfc.home': 'hdfc-HOME.html',
  'hdfc.rates': 'hdfc-rates.html',
  'icici.home': 'icici-HOME.html',
  'icici.personal': 'icici-PERSONAL.html',
  'icici.rates': 'icici-rates.html',
  'axis.home': 'axis-HOME.html',
  'axis.mclr': 'axis-MCLR.html',
  'kotak.rates': 'kotak-rates.html',
  'pnb.mclr': 'pnb-MCLR.html',
  'bob.retail': 'bob-retail.html',
  'union.rates': 'union-loans.html',
  'canara.range': 'canara-RANGE.html',
  'lic.home': 'lic-HOME.html',
};

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '')) {
  console.error('Refusing to run: DATABASE_URL must point at a local database');
  process.exit(2);
}

const dir = new URL('../test/fixtures/loanRates/', import.meta.url);
const pages = new Map(PAGE_READERS.map((r) => [r.url, readFileSync(new URL(FIRST_CAPTURE[r.id]!, dir), 'utf8')]));
const result = await runLoanRates({
  opsUserId: null,
  fetchHtml: async (url) => {
    const page = pages.get(url);
    if (page === undefined) throw new Error(`no saved capture for ${url}`);
    return page;
  },
});
for (const p of result.pages) console.log(`${p.readerId}: ${p.status} (+${p.active} active, ${p.suspect} suspect, ${p.unchanged} unchanged)`);
await prisma.$disconnect();
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run:
```bash
cd portfolioos/apps/web
npx vitest run src/pages/settings src/pages/emi
npx tsc --noEmit
npx eslint src/pages/settings src/api/loanRates.api.ts src/App.tsx
cd ../../packages/api
npx tsc -p tsconfig.scripts.json --noEmit
```
Expected: all PASS; no new type or lint errors (the scripts typecheck's only allowed error is the pre-existing `scripts/backfillRentalLedger.ts` TS2322).

- [ ] **Step 5: Browser check at 1280 px and 375 px**

1. Seed the local DB from the saved pages (no network):
   ```bash
   cd portfolioos/packages/api
   DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split npx tsx scripts/seed-loan-rates-from-fixtures.ts
   ```
   Expected: 15 lines, each `OK` with `+N active` (or `unchanged` on a re-run).
2. Start the API (with `ENABLE_LOAN_RATES_CRON=false` and `ENABLE_STARTUP_SYNC=false` so nothing fetches live pages) and the web dev server against the same isolated DB, as in Plan 1's execution notes. Sign in as a local test user.
3. `/emi` -> **Live rates**: screenshot every section at 1280 and 375 px wide for Home, Car and Personal. Check: lowest non-stale row marked "Lowest"; ranges like `8.00% - 13.45%` and `from 7.25%`; "as of" and "w.e.f." in dd/mm/yyyy; RBI repo line present; lender links open in a new tab; at 375 px the table scrolls inside its card and `document.documentElement.scrollWidth <= innerWidth`. Click **Use this rate** on HDFC Bank: the Calculate tab opens with 8.00 in the rate field and the EMI recomputed. Choose a loan type with no rates (Two-wheeler): "Rates not available yet", and switching back to Calculate still works.
4. `/settings` as that user: no Loan rates card. Set the user's role to ADMIN in the isolated DB (`UPDATE "User" SET role='ADMIN' WHERE email='<that email>'` via `psql postgresql://postgres:postgres@localhost:5432/portfolioos_split`), sign out and in: the card appears; `/settings/loan-rates` shows the server's two-factor message (no second factor on this session). If the local account has two-factor sign-in set up, sign in with the code and also check the source cards, the override form (set and clear one rate), and the Needs review list at 1280 and 375 px. Restore the role afterwards.
5. Stop only the dev-server PIDs you started. Save screenshots under `.superpowers/sdd/2026-10-12-emi-calculator-02/screens/`.

- [ ] **Step 6: Commit**

```bash
cd portfolioos
git add apps/web/src/api/loanRates.api.ts apps/web/src/pages/settings/LoanRatesAdminPage.tsx apps/web/src/pages/settings/LoanRatesAdminPage.test.tsx apps/web/src/App.tsx apps/web/src/pages/settings/SettingsPage.tsx packages/api/scripts/seed-loan-rates-from-fixtures.ts
git commit -m "feat(loan-rates): Settings - Loan rates admin page and local seed script

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Execution notes

- Worktree: `C:\Users\ST269\Desktop\mProfit-emi-wt` (branch `feat/emi-calculator`, no upstream; Plan 1 commits are already on it). Project root `portfolioos/`. Never push.
- Fresh worktree setup first: `pnpm install`, `pnpm --filter @everypaisa/shared build`, then `npx prisma generate` in `packages/api`, before trusting any type or test error. Rebuild shared after Task 1 changes it.
- Database: only the isolated local DB `portfolioos_split`. Migration (Task 6) with `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split`; tests with `DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false`. Never use `packages/api/.env`; never touch production or Neon. Production migration is out of scope.
- Docker containers `everypaisa-postgres` and `portfolioos-redis` must be running for API tests (Redis absence only degrades rate limiting).
- Nothing in this plan fetches a live bank page: readers and the job are tested on saved real captures, and the browser check seeds from them. The first live fetch happens when the job runs in an environment with `ENABLE_LOAN_RATES_CRON` on.
- Pre-existing failures not caused by this plan: `scripts/backfillRentalLedger.ts` TS2322; 5 lint errors in `mf*` files.
- After every task: `iconv -f UTF-8 -t UTF-8` on each changed text file.
- Full verification before handing back: `cd portfolioos/packages/api && DATABASE_URL=postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos_split DIRECT_URL=postgresql://postgres:postgres@localhost:5432/portfolioos_split RIA_VERDICTS_ENABLED=false npx vitest run` (whole API suite), `npx tsc --noEmit`, `cd ../../apps/web && npx vitest run && npx tsc --noEmit`.
