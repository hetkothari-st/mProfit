import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tokenizePassbookPdf } from '../shared/pdfPassbookParser.js';
import { solveCaptcha } from '../shared/captcha.js';
import { parseIndiaPostPpfPassbook } from './indiapost.v1.parse.js';
import { registerPfAdapter } from '../chain.js';
import { logger } from '../../../lib/logger.js';
import type { PfAdapter, ScrapeContext, RawScrapePayload, PfCanonicalEventInput } from '../types.js';

chromium.use(StealthPlugin());

const ID = 'pf.ppf.indiapost.v1';
const VERSION = '1.0.0';

const indiapostPpfAdapter: PfAdapter = {
  id: ID,
  version: VERSION,
  institution: 'INDIA_POST',
  type: 'PPF',
  hostnames: ['dopagent.indiapost.gov.in', 'ebanking.indiapost.gov.in'],

  async scrape(ctx: ScrapeContext): Promise<RawScrapePayload> {
    if (process.env.PF_SCRAPE_MOCK === '1') {
      logger.info({ accountId: ctx.account.id }, 'pf.indiapost.scrape.mocked');
      return {
        adapterId: ID,
        adapterVersion: VERSION,
        capturedAt: new Date().toISOString(),
        members: [],
      };
    }

    if (!ctx.credentials) throw new Error('India Post PPF scrape requires credentials');

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      ctx.emit('SCRAPING', { stage: 'navigate' });
      // TODO(plan-D): live DOM selectors — placeholder URL + selectors must be
      // verified against real portal. Adapter ships in mock-runnable state.
      await page.goto('https://dopagent.indiapost.gov.in/Login.aspx', {
        waitUntil: 'domcontentloaded',
      });
      await page.fill('<username-selector>', ctx.credentials.username);
      await page.fill('<password-selector>', ctx.credentials.password);

      // CAPTCHA (image-based)
      ctx.emit('AWAITING_CAPTCHA');
      const captchaImg = await page.locator('<captcha-img-selector>').screenshot();
      const { text: captchaText } = await solveCaptcha({
        sessionId: ctx.sessionId,
        imgBytes: captchaImg,
        charset: 'alnum',
      });
      await page.fill('<captcha-input-selector>', captchaText);
      await page.click('<login-btn-selector>');
      await page.waitForLoadState('networkidle');

      // OTP step
      const otpInput = page.locator('<otp-input-selector>');
      if (await otpInput.isVisible().catch(() => false)) {
        ctx.emit('AWAITING_OTP');
        const otp = await ctx.prompt.askOtp('sms');
        await otpInput.fill(otp);
        await page.click('<otp-submit-selector>');
        await page.waitForLoadState('networkidle');
      }

      // Navigate to PPF accounts section then download statement
      ctx.emit('SCRAPING', { stage: 'navigate_ppf' });
      // TODO(plan-D): selectors for PPF account list + statement download
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30_000 }),
        page.click('<download-statement-btn>'),
      ]);

      const tmpPath = join(tmpdir(), `indiapost_ppf_${randomUUID()}.pdf`);
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

  async parse(raw: RawScrapePayload) {
    const merged: PfCanonicalEventInput[] = [];
    let firstError: string | undefined;

    for (const m of raw.members) {
      if (!m.passbookPdf || !m.accountIdentifier) continue;
      const buf = Buffer.from(m.passbookPdf.base64, 'base64');
      const tokens = await tokenizePassbookPdf(buf);
      const result = parseIndiaPostPpfPassbook({
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
      return { ok: true as const, events: [] };
    }
    if (merged.length === 0) {
      return { ok: false as const, error: firstError ?? 'No events parsed' };
    }
    return { ok: true as const, events: merged };
  },
};

registerPfAdapter(indiapostPpfAdapter);

export { indiapostPpfAdapter };
