import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tokenizePassbookPdf } from '../shared/pdfPassbookParser.js';
import { solveCaptcha } from '../shared/captcha.js';
import { newStealthContext, clickDelay, typeDelay } from '../shared/stealth.js';
import { parseEpfoPassbook } from './epfo.v1.parse.js';
import { registerPfAdapter } from '../chain.js';
import { logger } from '../../../lib/logger.js';
import type { PfAdapter, ScrapeContext, RawScrapePayload, PfCanonicalEventInput } from '../types.js';

chromium.use(StealthPlugin());

const ID = 'pf.epfo.v1';
const VERSION = '1.0.0';

const epfoAdapter: PfAdapter = {
  id: ID,
  version: VERSION,
  institution: 'EPFO',
  type: 'EPF',
  hostnames: [
    'passbook.epfindia.gov.in',
    'unifiedportal-mem.epfindia.gov.in',
  ],

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

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await newStealthContext(browser);
      const page = await context.newPage();
      ctx.emit('SCRAPING', { stage: 'navigate' });

      await page.goto(
        'https://passbook.epfindia.gov.in/MemberPassBook/login',
        { waitUntil: 'domcontentloaded' },
      );
      await page.type('#username', ctx.credentials.username, typeDelay());
      await page.type('#password', ctx.credentials.password, typeDelay());

      ctx.emit('AWAITING_CAPTCHA');
      const captchaImg = await page.locator('img.captcha-image').screenshot();
      const { text: captchaText } = await solveCaptcha({
        sessionId: ctx.sessionId,
        imgBytes: captchaImg,
        expectedLength: 6,
        charset: 'alnum',
      });
      await page.type('#captcha', captchaText, typeDelay());
      await page.click('#login-btn', clickDelay());
      await page.waitForLoadState('networkidle');

      ctx.emit('SCRAPING', { stage: 'enumerate_members' });
      const memberOptions = await page.$$eval(
        'select#memberDropdown option',
        (opts) =>
          (opts as HTMLOptionElement[])
            .filter((o) => o.value && o.value.length > 4)
            .map((o) => ({ memberId: o.value, label: o.textContent ?? '' })),
      );

      const members: RawScrapePayload['members'] = [];
      for (const m of memberOptions) {
        ctx.emit('SCRAPING', { stage: 'download_passbook', memberId: m.memberId });
        await page.selectOption('select#memberDropdown', m.memberId);
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          page.click('button#downloadPdf', clickDelay()),
        ]);
        const tmpPath = join(tmpdir(), `epfo_${randomUUID()}.pdf`);
        await download.saveAs(tmpPath);
        const buf = await readFile(tmpPath);
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

  async parse(raw: RawScrapePayload) {
    const merged: PfCanonicalEventInput[] = [];
    let firstError: string | undefined;

    for (const m of raw.members) {
      if (!m.passbookPdf || !m.memberId) continue;
      const buf = Buffer.from(m.passbookPdf.base64, 'base64');
      const tokens = await tokenizePassbookPdf(buf);
      const result = parseEpfoPassbook({ userId: '', memberId: m.memberId, tokens });
      if (result.ok) {
        for (const ev of result.events) {
          merged.push({ ...ev, memberIdLast4: m.memberId.slice(-4) });
        }
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
    return { ok: true as const, events: merged, metadata: { memberCount: raw.members.length } };
  },
};

registerPfAdapter(epfoAdapter);

export { epfoAdapter };
