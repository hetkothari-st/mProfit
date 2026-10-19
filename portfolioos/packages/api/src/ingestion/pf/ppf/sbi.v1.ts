import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tokenizePassbookPdf } from '../shared/pdfPassbookParser.js';
import { solveCaptcha } from '../shared/captcha.js';
import { newStealthContext, clickDelay, typeDelay } from '../shared/stealth.js';
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
      return {
        adapterId: ID,
        adapterVersion: VERSION,
        capturedAt: new Date().toISOString(),
        members: [],
      };
    }

    if (!ctx.credentials) throw new Error('SBI PPF scrape requires credentials');

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await newStealthContext(browser);
      const page = await context.newPage();
      ctx.emit('SCRAPING', { stage: 'navigate' });
      await page.goto('https://retail.onlinesbi.sbi/personal/login.htm', {
        waitUntil: 'domcontentloaded',
      });

      // SBI Personal Banking login — dismiss the "Continue to Login" interstitial if present
      await page.click('a:has-text("Continue to Login")', clickDelay()).catch(() => undefined);
      await page.type('input[name="username"]', ctx.credentials.username, typeDelay());
      await page.type('input[name="password"]', ctx.credentials.password, typeDelay());

      // CAPTCHA (image-based)
      ctx.emit('AWAITING_CAPTCHA');
      const captchaImg = await page.locator('img#captcha').screenshot();
      const { text: captchaText } = await solveCaptcha({
        sessionId: ctx.sessionId,
        imgBytes: captchaImg,
        charset: 'alnum',
      });
      await page.type('input[name="captcha"]', captchaText, typeDelay());
      await page.click('button[type="submit"]', clickDelay());
      await page.waitForLoadState('networkidle');

      // OTP step (SBI sends to registered mobile)
      const otpInput = page.locator('input[name="otp"]');
      if (await otpInput.isVisible().catch(() => false)) {
        ctx.emit('AWAITING_OTP');
        const otp = await ctx.prompt.askOtp('sms');
        await otpInput.type(otp, typeDelay());
        await page.click('button[type="submit"]', clickDelay());
        await page.waitForLoadState('networkidle');
      }

      // Navigate to PPF accounts section then download statement
      ctx.emit('SCRAPING', { stage: 'navigate_ppf' });
      await page.click('a:has-text("PPF Account")', clickDelay());
      await page.waitForLoadState('networkidle');

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30_000 }),
        page.click('a:has-text("View Statement"), button:has-text("Download Statement")', clickDelay()),
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

  async parse(raw: RawScrapePayload) {
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
      // Mock path: no members, return empty ok
      return { ok: true as const, events: [] };
    }
    if (merged.length === 0) {
      return { ok: false as const, error: firstError ?? 'No events parsed' };
    }
    return { ok: true as const, events: merged };
  },
};

registerPfAdapter(sbiPpfAdapter);

export { sbiPpfAdapter };
