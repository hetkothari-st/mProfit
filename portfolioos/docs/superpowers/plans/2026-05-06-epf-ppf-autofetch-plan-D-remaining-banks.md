# EPF + PPF Auto-Fetch — Plan D: Remaining 6 PPF Banks

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Add PPF auto-fetch adapters for India Post, HDFC, ICICI, Axis, PNB, Bank of Baroda. Reuses Plan A framework + Plan B SBI template.

**Architecture:** Each bank = Playwright scrape adapter + statement parser + fixture, registered into the existing `pf.chain`. Real DOM selectors for each bank are guesses until tested against the live portal — adapters ship with `PF_SCRAPE_MOCK=1` support and incremental hardening done bank-by-bank in production.

**Tech stack:** Same as Plans A + B.

**Out of scope:**
- Plan C — Browser extension MV3 (deferred; substantial separate effort)
- Per-bank monthly nudge UI + DLQ ops UI + bot-detection hardening (move to a separate ops plan)

---

## Adapter inventory

| ID | Institution | Type | Portal hostname | Account format |
|---|---|---|---|---|
| `pf.ppf.indiapost.v1` | INDIA_POST | PPF | `dopagent.indiapost.gov.in` / `ebanking.indiapost.gov.in` | 11–17 digits |
| `pf.ppf.hdfc.v1` | HDFC | PPF | `netbanking.hdfcbank.com` | 14 digits |
| `pf.ppf.icici.v1` | ICICI | PPF | `infinity.icicibank.com` | 12 digits |
| `pf.ppf.axis.v1` | AXIS | PPF | `omni.axisbank.co.in` | 15 digits |
| `pf.ppf.pnb.v1` | PNB | PPF | `netpnb.com` | 16 digits |
| `pf.ppf.bob.v1` | BOB | PPF | `bobnetbanking.bankofbaroda.in` | 14 digits |

---

## Pattern (per bank)

For each bank `<inst>` ∈ {indiapost, hdfc, icici, axis, pnb, bob}:

### Files

- `packages/api/src/adapters/pf/ppf/<inst>.v1.ts` — Playwright adapter (mock + scrape skeleton)
- `packages/api/src/adapters/pf/ppf/<inst>.v1.parse.ts` — pure parser (statement → CanonicalEvents)
- `packages/api/test/fixtures/pf/<inst>/_generate-fixture.ts` — pdfkit generator
- `packages/api/test/fixtures/pf/<inst>/passbook-<sample>.pdf` — generated fixture
- `packages/api/test/adapters/pf/<inst>.parse.test.ts` — snapshot test

### Adapter skeleton (template — adapt per bank)

```ts
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tokenizePassbookPdf } from '../shared/pdfPassbookParser.js';
import { solveCaptcha } from '../shared/captcha.js';
import { parse<Inst>PpfPassbook } from './<inst>.v1.parse.js';
import { registerPfAdapter } from '../chain.js';
import { logger } from '../../../lib/logger.js';
import type { PfAdapter, ScrapeContext, RawScrapePayload, PfCanonicalEventInput } from '../types.js';

chromium.use(StealthPlugin());

const ID = 'pf.ppf.<inst>.v1';
const VERSION = '1.0.0';

const <inst>PpfAdapter: PfAdapter = {
  id: ID,
  version: VERSION,
  institution: '<INSTITUTION_ENUM>',
  type: 'PPF',
  hostnames: ['<portal-hostname>'],

  async scrape(ctx) {
    if (process.env.PF_SCRAPE_MOCK === '1') {
      logger.info({ accountId: ctx.account.id }, 'pf.<inst>.scrape.mocked');
      return { adapterId: ID, adapterVersion: VERSION, capturedAt: new Date().toISOString(), members: [] };
    }
    if (!ctx.credentials) throw new Error('<Inst> PPF scrape requires credentials');

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      ctx.emit('SCRAPING', { stage: 'navigate' });
      // TODO(plan-D): live DOM selectors — placeholder URL + selectors must be
      // verified against real portal. Adapter ships in mock-runnable state.
      await page.goto('<login-url>', { waitUntil: 'domcontentloaded' });
      await page.fill('<username-selector>', ctx.credentials.username);
      await page.fill('<password-selector>', ctx.credentials.password);

      // CAPTCHA
      ctx.emit('AWAITING_CAPTCHA');
      const captchaImg = await page.locator('<captcha-img-selector>').screenshot();
      const { text } = await solveCaptcha({ sessionId: ctx.sessionId, imgBytes: captchaImg, charset: 'alnum' });
      await page.fill('<captcha-input-selector>', text);
      await page.click('<login-btn-selector>');
      await page.waitForLoadState('networkidle');

      // OTP (most banks)
      const otpInput = page.locator('<otp-input-selector>');
      if (await otpInput.isVisible().catch(() => false)) {
        ctx.emit('AWAITING_OTP');
        const otp = await ctx.prompt.askOtp('sms');
        await otpInput.fill(otp);
        await page.click('<otp-submit-selector>');
        await page.waitForLoadState('networkidle');
      }

      // Navigate to PPF + download statement
      ctx.emit('SCRAPING', { stage: 'navigate_ppf' });
      // TODO(plan-D): selectors for PPF account list + statement download
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30_000 }),
        page.click('<download-statement-btn>'),
      ]);

      const tmpPath = join(tmpdir(), `<inst>_ppf_${randomUUID()}.pdf`);
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
      const result = parse<Inst>PpfPassbook({
        userId: '',
        accountIdentifier: m.accountIdentifier,
        tokens,
      });
      if (result.ok) merged.push(...result.events);
      else if (!firstError) firstError = result.error;
    }
    if (merged.length === 0 && raw.members.length === 0) return { ok: true, events: [] };
    if (merged.length === 0) return { ok: false, error: firstError ?? 'No events parsed' };
    return { ok: true, events: merged };
  },
};

registerPfAdapter(<inst>PpfAdapter);
export { <inst>PpfAdapter };
```

### Parser skeleton

Each bank's PPF statement has the same logical content (date, particulars, debit/credit, balance) but the PDF layout varies. Start from the SBI parser (`sbi.v1.parse.ts`) as the template — only the regex needs per-bank tuning. Generate a synthetic fixture that matches each bank's known statement format (use a real PDF sample as reference; the synthetic is shape-correct, not pixel-perfect).

Common statement structure:

```
<Bank Name> Public Provident Fund (PPF) Account Statement
Account No: <number>
Customer Name: <name>
Period: <from> to <to>

Date         Particulars                    [Debit/Withdrawal]   [Credit/Deposit]   Balance
01-04-2023   Opening Balance                                                          150000.00
15-05-2023   Self Deposit                                          10000.00          160000.00
31-03-2024   Annual Interest                                       12150.00          172150.00
```

Reuse the same `TYPE_RULES` (deposit / interest / withdrawal / opening balance) — the keywords are bank-agnostic enough.

### Self-registration

Add an import of each new adapter to `src/jobs/startupSync.ts` (or wherever the SBI adapter is currently imported as a side effect) so `registerPfAdapter` runs at boot.

### Web form

Modify `apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx` (already has SBI auto-fetch tab from Plan B). Either (a) extend the same tab to include an institution dropdown with all 7 PPF banks, or (b) keep one tab per bank if the dropdown UX is awkward. (a) is cleaner and easier — change the SBI-only dropdown to a multi-bank dropdown.

---

## Tasks (commit after each)

### D1. India Post adapter

- [ ] Generate fixture for India Post PPF statement format
- [ ] Implement `indiapost.v1.parse.ts` + snapshot test
- [ ] Implement `indiapost.v1.ts` (mock-runnable)
- [ ] Wire side-effect import in `startupSync.ts`
- [ ] `git commit -m "feat(pf): India Post PPF adapter scaffold + parser"`

### D2. HDFC adapter

- [ ] Same shape as D1
- [ ] `git commit -m "feat(pf): HDFC PPF adapter scaffold + parser"`

### D3. ICICI adapter

- [ ] Same shape
- [ ] `git commit -m "feat(pf): ICICI PPF adapter scaffold + parser"`

### D4. Axis adapter

- [ ] Same shape
- [ ] `git commit -m "feat(pf): Axis PPF adapter scaffold + parser"`

### D5. PNB adapter

- [ ] Same shape
- [ ] `git commit -m "feat(pf): PNB PPF adapter scaffold + parser"`

### D6. BoB adapter

- [ ] Same shape
- [ ] `git commit -m "feat(pf): BoB PPF adapter scaffold + parser"`

### D7. Web form: institution dropdown

- [ ] Modify `PPFNpsFormDialog.tsx` — replace SBI-only auto-fetch with institution dropdown listing all 7 PPF banks. Keep validation regex per-institution (loose `/^\d{8,17}$/` covers all formats).
- [ ] `git commit -m "feat(pf): PPF auto-fetch institution dropdown for all 7 banks"`

### D8. Final verification + tag

- [ ] `pnpm --filter @portfolioos/api typecheck && pnpm --filter @portfolioos/api build && pnpm --filter web typecheck` — all green
- [ ] `git tag pf-plan-d-remaining-banks`

---

## Self-review

- All 6 adapters self-register into `pf.chain` registry.
- Each adapter has a parser + fixture + snapshot test.
- Each adapter ships in `PF_SCRAPE_MOCK=1`-runnable state — real DOM hardening happens per-bank in production behind feature flags / canary user.
- Web form covers all 7 institutions (SBI + 6 new) under one dropdown.

## Known limitations (documented for handoff)

1. Real Playwright selectors for each bank are placeholders (`<login-url>`, `<username-selector>`, etc.). They MUST be replaced via manual portal walkthroughs before any production scrape attempt against that bank.
2. Each bank's actual statement PDF format may differ from the synthetic fixture; the parser regex may need tuning when first real statements arrive (DLQ surfaces parse failures with raw payload).
3. India Post DOPSB and BoB share lowest portal stability — expect highest selector drift. Use the `INSTITUTION_CHANGED` `PfAccountStatus` to flag stale adapters once first real fetches happen.
