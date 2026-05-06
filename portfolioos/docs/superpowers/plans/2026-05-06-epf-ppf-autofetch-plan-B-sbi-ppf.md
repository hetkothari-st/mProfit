# EPF + PPF Auto-Fetch — Plan B: SBI PPF Adapter

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add SBI PPF auto-fetch via the existing server-headless Playwright path. User adds PPF account at SBI → Refresh → fetches statement → events appear.

**Architecture:** Reuses Plan A foundation entirely. New work = (1) SBI PPF Playwright adapter, (2) SBI PPF statement parser + fixture, (3) PPF add-account UI flow.

**Tech Stack:** Same as Plan A.

**Out of scope (later plans):**
- Plan C — Browser extension MV3
- Plan D — India Post + HDFC + ICICI + Axis + PNB + BoB + monthly nudge + hardening

---

## File Structure

| Path | Responsibility |
|---|---|
| `packages/api/src/adapters/pf/ppf/sbi.v1.ts` | SBI Playwright scrape (PPF) |
| `packages/api/src/adapters/pf/ppf/sbi.v1.parse.ts` | SBI passbook parser (pure) |
| `packages/api/test/fixtures/pf/sbi/passbook-acct-12345678901.pdf` | Synthetic SBI PPF passbook |
| `packages/api/test/fixtures/pf/sbi/_generate-fixture.ts` | Fixture generator |
| `packages/api/test/adapters/pf/sbi.parse.test.ts` | Parser snapshot test |
| `apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx` (modify) | PPF auto-fetch flow |

---

## Task 1: SBI passbook parser + fixture

- [ ] **Step 1.1: Generate synthetic SBI fixture**

Create `test/fixtures/pf/sbi/_generate-fixture.ts` modeled on the EPFO generator. SBI PPF statement format (from public sample):

```
SBI Public Provident Fund (PPF) Statement
Account No: 12345678901
Customer Name: TEST USER
Branch: ANDHERI EAST (BR-12345)
Period: 01-04-2023 to 31-03-2024

Date         Particulars                    Withdrawal   Deposit      Balance
01-04-2023   Opening Balance                                          150000.00
15-05-2023   PPF Deposit                                  10000.00    160000.00
20-08-2023   PPF Deposit                                  15000.00    175000.00
31-03-2024   Interest Credited                            12150.00    187150.00
```

Use pdfkit. Date format `dd-mm-yyyy`, amounts with thousands as `12,345.67` style optional.

- [ ] **Step 1.2: Generate the PDF**

```bash
cd "C:/Users/ST269/Desktop/mProfit - Copy/portfolioos/packages/api"
MANUAL_GEN=1 pnpm exec tsx test/fixtures/pf/sbi/_generate-fixture.ts
```

- [ ] **Step 1.3: Write parser test (fail first)**

`test/adapters/pf/sbi.parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenizePassbookPdf } from '../../../src/adapters/pf/shared/pdfPassbookParser.js';
import { parseSbiPpfPassbook } from '../../../src/adapters/pf/ppf/sbi.v1.parse.js';

const here = fileURLToPath(new URL('.', import.meta.url));

describe('parseSbiPpfPassbook', () => {
  it('parses synthetic SBI PPF statement', async () => {
    const buf = await readFile(resolve(here, '../../fixtures/pf/sbi/passbook-acct-12345678901.pdf'));
    const tokens = await tokenizePassbookPdf(buf);
    const result = parseSbiPpfPassbook({ userId: 'u', accountIdentifier: '12345678901', tokens });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.eventDate))).toBe(true);
    expect(result.events).toMatchSnapshot();
  });

  it('returns ok:false on empty tokens', () => {
    const result = parseSbiPpfPassbook({
      userId: 'u',
      accountIdentifier: '0',
      tokens: { pageCount: 0, rawText: '', lines: [] },
    });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 1.4: Implement parser**

`src/adapters/pf/ppf/sbi.v1.parse.ts`:

```ts
import Decimal from 'decimal.js';
import type { PassbookTokens } from '../shared/pdfPassbookParser.js';
import type { ParseResult, PfCanonicalEventInput } from '../types.js';

interface ParseInput {
  userId: string;
  accountIdentifier: string;
  tokens: PassbookTokens;
}

// Row format: dd-mm-yyyy   description   [withdrawal]   [deposit]   balance
// Either withdrawal OR deposit is filled, plus the running balance.
const ROW_RE = /^(\d{2}-\d{2}-\d{4})\s+(.+?)\s+([\d,]*\.?\d*)\s+([\d,]*\.?\d*)\s+([\d,]+\.\d{2})$/;

const TYPE_RULES: Array<{ test: RegExp; type: string }> = [
  { test: /OPENING\s+BAL/i, type: 'PF_OPENING_BALANCE' },
  { test: /INTEREST/i, type: 'PF_INTEREST_CREDIT' },
  { test: /WITHDRAW/i, type: 'PF_WITHDRAWAL' },
  { test: /TRANSFER\s+IN/i, type: 'PF_TRANSFER_IN' },
  { test: /TRANSFER\s+OUT/i, type: 'PF_TRANSFER_OUT' },
  { test: /DEPOSIT|CONTRIBUT/i, type: 'PF_EMPLOYEE_CONTRIBUTION' },
];

function classify(desc: string): string | undefined {
  for (const r of TYPE_RULES) if (r.test.test(desc)) return r.type;
  return undefined;
}

function toIsoDate(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('-');
  return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
}

function toDecimalStr(raw: string): string {
  const cleaned = raw.replace(/,/g, '').trim();
  if (!cleaned || cleaned === '.') return '0.00';
  return new Decimal(cleaned).toFixed(2);
}

export function parseSbiPpfPassbook(input: ParseInput): ParseResult<PfCanonicalEventInput> {
  const events: PfCanonicalEventInput[] = [];
  const seq = new Map<string, number>();

  for (const line of input.tokens.lines) {
    const m = line.match(ROW_RE);
    if (!m) continue;
    const [, dateRaw, descRaw, wdRaw, depRaw] = m;
    const type = classify(descRaw ?? '');
    if (!type) continue;
    const eventDate = toIsoDate(dateRaw ?? '');
    const wd = toDecimalStr(wdRaw ?? '0');
    const dep = toDecimalStr(depRaw ?? '0');
    const amount = type === 'PF_WITHDRAWAL' ? wd : dep === '0.00' ? wd : dep;
    if (amount === '0.00') continue;
    const bucket = `${eventDate}|${type}|${amount}`;
    const seqIdx = seq.get(bucket) ?? 0;
    seq.set(bucket, seqIdx + 1);
    events.push({
      type,
      eventDate,
      amount,
      memberIdLast4: input.accountIdentifier.slice(-4),
      notes: (descRaw ?? '').trim(),
      sequence: seqIdx,
    });
  }

  if (events.length === 0) return { ok: false, error: 'No recognizable rows' };
  return { ok: true, events };
}
```

- [ ] **Step 1.5: Run test, generate snapshot, re-run**

```bash
cd "C:/Users/ST269/Desktop/mProfit - Copy/portfolioos"
pnpm --filter @portfolioos/api exec vitest run test/adapters/pf/sbi.parse.test.ts -u
pnpm --filter @portfolioos/api exec vitest run test/adapters/pf/sbi.parse.test.ts
```

- [ ] **Step 1.6: Commit**

```bash
cd "C:/Users/ST269/Desktop/mProfit - Copy"
git add portfolioos/packages/api/src/adapters/pf/ppf/sbi.v1.parse.ts \
        portfolioos/packages/api/test/adapters/pf/sbi.parse.test.ts \
        portfolioos/packages/api/test/adapters/pf/__snapshots__/ \
        portfolioos/packages/api/test/fixtures/pf/sbi/
git commit -m "feat(pf): SBI PPF passbook parser + golden snapshot"
```

---

## Task 2: SBI PPF Playwright adapter

- [ ] **Step 2.1: Implement adapter**

`src/adapters/pf/ppf/sbi.v1.ts`:

```ts
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tokenizePassbookPdf } from '../shared/pdfPassbookParser.js';
import { solveCaptcha } from '../shared/captcha.js';
import { parseSbiPpfPassbook } from './sbi.v1.parse.js';
import { registerPfAdapter } from '../chain.js';
import { logger } from '../../../lib/logger.js';
import type { PfAdapter, ScrapeContext, RawScrapePayload, PfCanonicalEventInput } from '../types.js';

chromium.use(StealthPlugin());

const ID = 'pf.ppf.sbi.v1';
const VERSION = '1.0.0';

const sbiPpfAdapter: PfAdapter = {
  id: ID,
  version: VERSION,
  institution: 'SBI',
  type: 'PPF',
  hostnames: ['onlinesbi.sbi', 'retail.onlinesbi.sbi'],

  async scrape(ctx: ScrapeContext): Promise<RawScrapePayload> {
    if (process.env.PF_SCRAPE_MOCK === '1') {
      logger.info({ accountId: ctx.account.id }, 'pf.sbi.scrape.mocked');
      return { adapterId: ID, adapterVersion: VERSION, capturedAt: new Date().toISOString(), members: [] };
    }
    if (!ctx.credentials) throw new Error('SBI PPF scrape requires credentials');

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      ctx.emit('SCRAPING', { stage: 'navigate' });
      await page.goto('https://retail.onlinesbi.sbi/personal/login.htm', {
        waitUntil: 'domcontentloaded',
      });

      // SBI Personal Banking login
      await page.click('a:has-text("Continue to Login")').catch(() => undefined);
      await page.fill('input[name="username"]', ctx.credentials.username);
      await page.fill('input[name="password"]', ctx.credentials.password);

      // CAPTCHA (image)
      ctx.emit('AWAITING_CAPTCHA');
      const captchaImg = await page.locator('img#captcha').screenshot();
      const { text: captchaText } = await solveCaptcha({
        sessionId: ctx.sessionId,
        imgBytes: captchaImg,
        charset: 'alnum',
      });
      await page.fill('input[name="captcha"]', captchaText);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      // OTP step (SBI sends to mobile)
      const otpInput = page.locator('input[name="otp"]');
      if (await otpInput.isVisible().catch(() => false)) {
        ctx.emit('AWAITING_OTP');
        const otp = await ctx.prompt.askOtp('sms');
        await otpInput.fill(otp);
        await page.click('button[type="submit"]');
        await page.waitForLoadState('networkidle');
      }

      // Navigate to PPF accounts → download statement
      ctx.emit('SCRAPING', { stage: 'navigate_ppf' });
      await page.click('a:has-text("PPF Account")');
      await page.waitForLoadState('networkidle');

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30_000 }),
        page.click('a:has-text("View Statement"), button:has-text("Download Statement")'),
      ]);

      const tmpPath = join(tmpdir(), `sbi_ppf_${randomUUID()}.pdf`);
      await download.saveAs(tmpPath);
      const buf = await readFile(tmpPath);

      return {
        adapterId: ID,
        adapterVersion: VERSION,
        capturedAt: new Date().toISOString(),
        members: [
          {
            accountIdentifier: ctx.account.identifierLast4,
            passbookPdf: {
              base64: buf.toString('base64'),
              sha256: createHash('sha256').update(buf).digest('hex'),
            },
          },
        ],
      };
    } finally {
      await browser.close();
    }
  },

  async parse(raw) {
    const merged: PfCanonicalEventInput[] = [];
    let firstError: string | undefined;
    for (const m of raw.members) {
      if (!m.passbookPdf || !m.accountIdentifier) continue;
      const buf = Buffer.from(m.passbookPdf.base64, 'base64');
      const tokens = await tokenizePassbookPdf(buf);
      const result = parseSbiPpfPassbook({
        userId: '',
        accountIdentifier: m.accountIdentifier,
        tokens,
      });
      if (result.ok) {
        merged.push(...result.events);
      } else if (!firstError) {
        firstError = result.error;
      }
    }
    if (merged.length === 0 && raw.members.length === 0) {
      return { ok: true, events: [] };
    }
    if (merged.length === 0) {
      return { ok: false, error: firstError ?? 'No events parsed' };
    }
    return { ok: true, events: merged };
  },
};

registerPfAdapter(sbiPpfAdapter);
export { sbiPpfAdapter };
```

- [ ] **Step 2.2: Wire adapter import**

In `src/adapters/pf/chain.ts` (or wherever the EPFO adapter is auto-imported), ensure `sbiPpfAdapter` is also imported on startup. If chain.ts uses an explicit imports list, add it. If adapters self-register on import (preferred), import the file once at app bootstrap (e.g. `src/index.ts` or `src/jobs/startupSync.ts`).

- [ ] **Step 2.3: Verify build**

```bash
cd "C:/Users/ST269/Desktop/mProfit - Copy/portfolioos"
pnpm --filter @portfolioos/api typecheck
```

- [ ] **Step 2.4: Commit**

```bash
git add portfolioos/packages/api/src/adapters/pf/ppf/sbi.v1.ts \
        portfolioos/packages/api/src/adapters/pf/chain.ts
git commit -m "feat(pf): SBI PPF Playwright scrape adapter"
```

---

## Task 3: PPF add-account form integration

- [ ] **Step 3.1: Modify `apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx`**

Read existing file. Add an "Auto-fetch (SBI)" mode that collects PPF account number + holder name, then calls:

```ts
await pfApi.create({
  type: 'PPF',
  institution: 'SBI',
  identifier: pfAcct,
  holderName,
});
```

Validate account number: `/^\d{8,16}$/` (SBI PPF account numbers vary in length).

- [ ] **Step 3.2: Update ProvidentFundPage**

Already lists PF accounts. Refresh button works for any account regardless of institution. No code change required — list/refresh flow is institution-agnostic.

- [ ] **Step 3.3: Verify web typecheck**

```bash
pnpm --filter web typecheck
```

- [ ] **Step 3.4: Commit**

```bash
git add portfolioos/apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx
git commit -m "feat(pf): PPF add-account form with SBI auto-fetch hook"
```

---

## Task 4: Final verification

- [ ] **Step 4.1: Build + typecheck**

```bash
cd "C:/Users/ST269/Desktop/mProfit - Copy/portfolioos"
pnpm --filter @portfolioos/shared build
pnpm --filter @portfolioos/api typecheck
pnpm --filter @portfolioos/api build
pnpm --filter web typecheck
pnpm --filter web build
```

All green.

- [ ] **Step 4.2: Tag**

```bash
git tag pf-plan-b-sbi-ppf
```

---

## Self-Review

| Spec section | Plan task |
|---|---|
| Two-layer adapter (scrape + parse) | Tasks 1, 2 |
| Golden fixture | Task 1 |
| Self-registration via `registerPfAdapter` | Task 2 |
| PPF add-account UI | Task 3 |
| Build green | Task 4 |

No placeholders. Type names match Plan A: `PfAdapter`, `RawScrapePayload`, `PfCanonicalEventInput`, `ScrapeContext`. Adapter id `pf.ppf.sbi.v1` per Plan A versioning convention.
