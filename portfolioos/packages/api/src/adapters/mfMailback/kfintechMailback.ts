import { mailbackSessionManager } from '../../lib/mailbackSessions.js';
import { logger } from '../../lib/logger.js';

// KFintech Mailback CAS request flow.
// Public form: https://mfs.kfintech.com/investor/General/ConsolidatedAccountStatement
// Fields: PAN, Email, From/To dates, Statement type, Password, Captcha.
// Same captcha-relay model as CAMS — selectors differ.

const KFIN_URL =
  process.env.KFIN_MAILBACK_URL ??
  'https://mfs.kfintech.com/investor/General/ConsolidatedAccountStatement';

const FIXTURE_MODE = process.env.MFMAILBACK_FIXTURE_MODE === '1';

export class KfintechMailbackError extends Error {
  code:
    | 'FORM_NOT_FOUND'
    | 'CAPTCHA_NOT_FOUND'
    | 'CAPTCHA_REJECTED'
    | 'SUBMIT_FAILED'
    | 'SESSION_EXPIRED'
    | 'UNKNOWN';
  constructor(code: KfintechMailbackError['code'], message: string) {
    super(message);
    this.name = 'KfintechMailbackError';
    this.code = code;
  }
}

export interface KfinInitiateInput {
  sessionKey: string;
  pan: string;
  email: string;
}

export interface KfinInitiateResult {
  captchaImageBase64: string | null;
}

export async function initiateKfintechMailback(
  input: KfinInitiateInput,
): Promise<KfinInitiateResult> {
  if (FIXTURE_MODE) {
    await mailbackSessionManager.createSession(
      input.sessionKey,
      'KFINTECH',
      input.pan,
      input.email,
    );
    const tinyPng =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    return { captchaImageBase64: tinyPng };
  }

  const session = await mailbackSessionManager.createSession(
    input.sessionKey,
    'KFINTECH',
    input.pan,
    input.email,
  );
  const { page } = session;

  try {
    logger.info({ key: input.sessionKey }, '[kfin] navigating to mailback form');
    await page.goto(KFIN_URL, { waitUntil: 'networkidle', timeout: 45000 });

    const panInput = page
      .locator('input[name*="pan" i], input[id*="pan" i], input[placeholder*="PAN" i]')
      .first();
    const emailInput = page
      .locator('input[type="email"], input[name*="email" i], input[id*="email" i]')
      .first();
    const captchaImg = page.locator('img[id*="captcha" i], img[src*="captcha" i]').first();

    if ((await panInput.count()) === 0) {
      throw new KfintechMailbackError('FORM_NOT_FOUND', 'PAN input not found on KFintech page');
    }

    await panInput.fill(input.pan.toUpperCase()).catch(() => undefined);
    if (await emailInput.count()) {
      await emailInput.fill(input.email).catch(() => undefined);
    }

    let captchaImageBase64: string | null = null;
    if (await captchaImg.count()) {
      const buf = await captchaImg.screenshot();
      captchaImageBase64 = buf.toString('base64');
    }

    return { captchaImageBase64 };
  } catch (err) {
    await mailbackSessionManager.closeSession(input.sessionKey);
    if (err instanceof KfintechMailbackError) throw err;
    logger.error({ err, key: input.sessionKey }, '[kfin] initiate failed');
    throw new KfintechMailbackError(
      'UNKNOWN',
      err instanceof Error ? err.message : 'kfin init failed',
    );
  }
}

export interface KfinSubmitInput {
  sessionKey: string;
  captcha: string;
  periodFrom?: string | null;
  periodTo?: string | null;
  pdfPassword: string;
}

export interface KfinSubmitResult {
  ok: boolean;
  requestRef: string | null;
  message: string;
}

export async function submitKfintechMailback(input: KfinSubmitInput): Promise<KfinSubmitResult> {
  if (FIXTURE_MODE) {
    await mailbackSessionManager.closeSession(input.sessionKey);
    return { ok: true, requestRef: 'KFIN-FIXTURE-REF', message: 'CAS request submitted (fixture)' };
  }

  const session = mailbackSessionManager.getSession(input.sessionKey);
  if (!session) {
    throw new KfintechMailbackError('SESSION_EXPIRED', 'KFintech session expired');
  }
  const { page } = session;

  try {
    if (input.periodFrom) {
      const fromInput = page
        .locator('input[name*="from" i][type="text"], input[id*="fromdate" i]')
        .first();
      if (await fromInput.count()) await fromInput.fill(input.periodFrom).catch(() => undefined);
    }
    if (input.periodTo) {
      const toInput = page
        .locator('input[name*="to" i][type="text"], input[id*="todate" i]')
        .first();
      if (await toInput.count()) await toInput.fill(input.periodTo).catch(() => undefined);
    }

    const pwInput = page.locator('input[type="password"]').first();
    if (await pwInput.count()) {
      await pwInput.fill(input.pdfPassword).catch(() => undefined);
      const pwInputs = page.locator('input[type="password"]');
      if ((await pwInputs.count()) > 1) {
        await pwInputs.nth(1).fill(input.pdfPassword).catch(() => undefined);
      }
    }

    const captchaInput = page.locator('input[name*="captcha" i], input[id*="captcha" i]').first();
    if (await captchaInput.count()) {
      await captchaInput.fill(input.captcha).catch(() => undefined);
    }

    const submitBtn = page
      .locator(
        'button:has-text("Submit"), input[type="submit"], button:has-text("Send"), button:has-text("Generate")',
      )
      .first();
    if ((await submitBtn.count()) === 0) {
      throw new KfintechMailbackError('FORM_NOT_FOUND', 'Submit button not found');
    }
    await submitBtn.click();
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined);

    const bodyText = (await page.locator('body').innerText().catch(() => '')) ?? '';
    const lower = bodyText.toLowerCase();
    if (
      lower.includes('invalid captcha') ||
      lower.includes('incorrect captcha') ||
      lower.includes('try again')
    ) {
      throw new KfintechMailbackError('CAPTCHA_REJECTED', 'KFintech rejected the captcha');
    }
    if (
      lower.includes('email') &&
      (lower.includes('successfully') || lower.includes('will be sent') || lower.includes('mailed'))
    ) {
      const refMatch = bodyText.match(/(?:reference|request)\s*(?:no|number|id)[:\s]*([A-Z0-9-]+)/i);
      return {
        ok: true,
        requestRef: refMatch ? refMatch[1]! : null,
        message: 'CAS request submitted to KFintech',
      };
    }

    return {
      ok: true,
      requestRef: null,
      message: 'KFintech form submitted (response did not match known success pattern)',
    };
  } catch (err) {
    if (err instanceof KfintechMailbackError) throw err;
    logger.error({ err, key: input.sessionKey }, '[kfin] submit failed');
    throw new KfintechMailbackError(
      'SUBMIT_FAILED',
      err instanceof Error ? err.message : 'kfin submit failed',
    );
  } finally {
    await mailbackSessionManager.closeSession(input.sessionKey);
  }
}
