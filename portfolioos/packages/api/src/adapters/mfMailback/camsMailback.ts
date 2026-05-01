import { mailbackSessionManager } from '../../lib/mailbackSessions.js';
import { logger } from '../../lib/logger.js';

// CAMS Mailback CAS request flow.
// Public form: https://mycams.camsonline.com/Investors/Statements/Consolidated-Account-Statement
// Typical fields: PAN, Email, From date, To date, Statement type (Detailed/Summary),
// Password (user-chosen for the PDF), Captcha. CAMS sometimes adds a 6-digit
// SMS/email OTP step before submit; the relay model handles either.

const CAMS_URL =
  process.env.CAMS_MAILBACK_URL ??
  'https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement';

const FIXTURE_MODE = process.env.MFMAILBACK_FIXTURE_MODE === '1';

export class CamsMailbackError extends Error {
  code:
    | 'FORM_NOT_FOUND'
    | 'CAPTCHA_NOT_FOUND'
    | 'CAPTCHA_REJECTED'
    | 'SUBMIT_FAILED'
    | 'SESSION_EXPIRED'
    | 'UNKNOWN';
  constructor(code: CamsMailbackError['code'], message: string) {
    super(message);
    this.name = 'CamsMailbackError';
    this.code = code;
  }
}

export interface CamsInitiateInput {
  sessionKey: string;
  pan: string;
  email: string;
}

export interface CamsInitiateResult {
  captchaImageBase64: string | null; // null if no captcha challenge present
}

export async function initiateCamsMailback(input: CamsInitiateInput): Promise<CamsInitiateResult> {
  if (FIXTURE_MODE) {
    await mailbackSessionManager.createSession(input.sessionKey, 'CAMS', input.pan, input.email);
    // 1×1 transparent PNG so UI can render a placeholder.
    const tinyPng =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    return { captchaImageBase64: tinyPng };
  }

  const session = await mailbackSessionManager.createSession(
    input.sessionKey,
    'CAMS',
    input.pan,
    input.email,
  );
  const { page } = session;

  try {
    logger.info({ key: input.sessionKey, url: CAMS_URL }, '[cams] navigating to mailback form');
    await page.goto(CAMS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // SPA hydration wait.
    await page.waitForSelector('input, button', { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(2500);

    // Step A: dismiss any cookie / promo / consent overlays. These are CDK
    // overlay backdrops that intercept all clicks on the page.
    await dismissOverlays(page);

    // Step B: click the landing-page CTA (class `check-now-btn`, label
    // "Submit" or "Check Now") to open the actual CAS form modal. If we don't
    // do this, every input/button selector hits placeholder elements that
    // never become a working form.
    const landingCta = page
      .locator(
        'button.check-now-btn, button:has-text("Check Now"), a:has-text("Check Now")',
      )
      .first();
    if (await landingCta.count()) {
      logger.info({ key: input.sessionKey }, '[cams] clicking landing CTA');
      await landingCta.click({ trial: false }).catch(() => undefined);
      await page.waitForTimeout(1500);
      await dismissOverlays(page);
    }

    // Step C: wait for the actual form's PAN input to render. Excludes the
    // landing-page placeholder inputs by requiring placeholder/label match.
    const panInput = page
      .locator(
        'input[formcontrolname*="pan" i], input[name*="pan" i], input[placeholder*="PAN" i], input[aria-label*="PAN" i]',
      )
      .first();
    await panInput.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);

    if ((await panInput.count()) === 0) {
      const ts = Date.now();
      try {
        await page.screenshot({ path: `cams_debug_${ts}.png`, fullPage: true });
        const html = await page.content();
        await import('node:fs/promises').then((fs) =>
          fs.writeFile(`cams_debug_${ts}.html`, html),
        );
        logger.error(
          { key: input.sessionKey, ts },
          '[cams] PAN input missing — wrote cams_debug_<ts>.{png,html}',
        );
      } catch {
        /* best-effort */
      }
      throw new CamsMailbackError(
        'FORM_NOT_FOUND',
        `CAS form did not open after Check Now. Selectors may need tuning — see cams_debug_${ts}.html in the api workdir.`,
      );
    }

    await panInput.fill(input.pan.toUpperCase()).catch(() => undefined);

    const emailInput = page
      .locator(
        'input[formcontrolname*="email" i], input[type="email"], input[name*="email" i], input[placeholder*="email" i]',
      )
      .first();
    if (await emailInput.count()) {
      await emailInput.fill(input.email).catch(() => undefined);
    }

    // Wait briefly for any captcha image to lazy-load.
    await page.waitForTimeout(1500);

    // Broad captcha selectors — CAMS often uses canvas, img, or background-img
    // styling on a div. Try canvas + img + ng-component variants.
    const captchaCanvas = page.locator('canvas[id*="captcha" i], canvas.captcha').first();
    const captchaImg = page
      .locator(
        'img[id*="captcha" i], img[src*="captcha" i], img[alt*="captcha" i], img[class*="captcha" i], [class*="captcha" i] img',
      )
      .first();

    let captchaImageBase64: string | null = null;
    if (await captchaCanvas.count()) {
      const buf = await captchaCanvas.screenshot();
      captchaImageBase64 = buf.toString('base64');
    } else if (await captchaImg.count()) {
      const buf = await captchaImg.screenshot();
      captchaImageBase64 = buf.toString('base64');
    } else {
      // No captcha found — but CAMS form ALWAYS has captcha. If we didn't find
      // one we're likely on the wrong page or selectors broke. Fall back to
      // screenshotting the area near the captcha input field if present.
      const captchaInput = page
        .locator('input[name*="captcha" i], input[id*="captcha" i], input[placeholder*="captcha" i]')
        .first();
      if (await captchaInput.count()) {
        // Try to find a sibling/parent image
        const buf = await captchaInput
          .locator('xpath=ancestor::*[1]')
          .first()
          .screenshot()
          .catch(() => null);
        if (buf) captchaImageBase64 = buf.toString('base64');
      }
    }

    if (!captchaImageBase64) {
      logger.warn(
        { key: input.sessionKey },
        '[cams] no captcha image found — form will likely be rejected on submit',
      );
    }

    return { captchaImageBase64 };
  } catch (err) {
    await mailbackSessionManager.closeSession(input.sessionKey);
    if (err instanceof CamsMailbackError) throw err;
    logger.error({ err, key: input.sessionKey }, '[cams] initiate failed');
    throw new CamsMailbackError('UNKNOWN', err instanceof Error ? err.message : 'cams init failed');
  }
}

// Common cookie/consent/promo overlay dismissal. CAMS uses Angular CDK overlays
// (.cdk-overlay-backdrop, .cdk-overlay-container, .box_show) which block
// pointer events.
async function dismissOverlays(page: import('playwright').Page): Promise<void> {
  // Try common accept/close button patterns first.
  const candidates = [
    'button:has-text("Accept")',
    'button:has-text("I Agree")',
    'button:has-text("Agree")',
    'button:has-text("Got it")',
    'button:has-text("Allow")',
    'button:has-text("OK")',
    'button:has-text("Close")',
    'button[aria-label*="close" i]',
    '.cdk-overlay-backdrop ~ * button:has-text("Close")',
  ];
  for (const sel of candidates) {
    const btn = page.locator(sel).first();
    if (await btn.count()) {
      await btn.click({ timeout: 2000 }).catch(() => undefined);
      await page.waitForTimeout(300);
    }
  }
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(300);
  const backdrop = page.locator('.cdk-overlay-backdrop').first();
  if (await backdrop.count()) {
    await page.mouse.click(5, 5).catch(() => undefined);
    await page.waitForTimeout(300);
  }
}

// Hard-remove every CDK overlay element from the DOM. Angular keeps re-rendering
// some of these (tooltip backdrops, info popups) which block pointer events
// on a known submit button. Scrubbing them right before the click is the
// only reliable workaround.
async function nukeOverlays(page: import('playwright').Page): Promise<void> {
  await page
    .evaluate(`(() => {
      var sels = ['.cdk-overlay-backdrop', '.cdk-overlay-container', '.box_show'];
      for (var i = 0; i < sels.length; i++) {
        var els = document.querySelectorAll(sels[i]);
        for (var j = 0; j < els.length; j++) {
          try { els[j].parentNode && els[j].parentNode.removeChild(els[j]); } catch (e) {}
        }
      }
    })()`)
    .catch(() => undefined);
}

export interface CamsSubmitInput {
  sessionKey: string;
  captcha: string;
  periodFrom?: string | null; // YYYY-MM-DD
  periodTo?: string | null;
  pdfPassword: string; // user-chosen password for resulting PDF
}

export interface CamsSubmitResult {
  ok: boolean;
  requestRef: string | null;
  message: string;
}

export async function submitCamsMailback(input: CamsSubmitInput): Promise<CamsSubmitResult> {
  if (FIXTURE_MODE) {
    await mailbackSessionManager.closeSession(input.sessionKey);
    return { ok: true, requestRef: 'CAMS-FIXTURE-REF', message: 'CAS request submitted (fixture)' };
  }

  const session = mailbackSessionManager.getSession(input.sessionKey);
  if (!session) throw new CamsMailbackError('SESSION_EXPIRED', 'CAMS session expired');
  const { page } = session;

  try {
    // Period
    if (input.periodFrom) {
      const fromInput = page
        .locator('input[name*="from" i][type="text"], input[id*="from" i][type="text"], input[name*="fromdate" i]')
        .first();
      if (await fromInput.count()) await fromInput.fill(input.periodFrom).catch(() => undefined);
    }
    if (input.periodTo) {
      const toInput = page
        .locator('input[name*="to" i][type="text"], input[id*="todate" i], input[name*="todate" i]')
        .first();
      if (await toInput.count()) await toInput.fill(input.periodTo).catch(() => undefined);
    }

    // PDF password (user-chosen)
    const pwInput = page.locator('input[type="password"]').first();
    if (await pwInput.count()) {
      await pwInput.fill(input.pdfPassword).catch(() => undefined);
      // Confirm-password may exist
      const pwInputs = page.locator('input[type="password"]');
      if ((await pwInputs.count()) > 1) {
        await pwInputs.nth(1).fill(input.pdfPassword).catch(() => undefined);
      }
    }

    // Captcha
    const captchaInput = page
      .locator('input[name*="captcha" i], input[id*="captcha" i]')
      .first();
    if (await captchaInput.count()) {
      await captchaInput.fill(input.captcha).catch(() => undefined);
    }

    // Re-dismiss any overlay that appeared while user was solving captcha.
    await dismissOverlays(page);

    // Log every visible button so we can see what CAMS actually rendered.
    try {
      const btnsRaw = await page.evaluate(`(() => {
        var els = document.querySelectorAll('button, input[type="submit"]');
        var out = [];
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          out.push({
            tag: el.tagName,
            text: (el.innerText || '').trim().slice(0, 60),
            type: el.type || '',
            cls: (el.className || '').toString().slice(0, 100),
            id: el.id || '',
            visible: !!el.offsetParent,
          });
        }
        return out;
      })()`);
      logger.info({ key: input.sessionKey, btns: btnsRaw }, '[cams] visible buttons before submit');
    } catch {
      /* best-effort */
    }

    // CAMS reuses class `check-now-btn` for both the landing CTA and the form
    // submit. By the time we get here we're already inside the form modal —
    // the only `type=submit` button visible is the form submit. Prefer
    // form-scoped selectors first, then fall back to global `type=submit`.
    const submitBtn = page
      .locator(
        [
          'form button[type="submit"]',
          'form input[type="submit"]',
          'button[type="submit"]',
          'input[type="submit"]',
          'button.submit-btn',
          'button.mat-raised-button.mat-primary',
          'button:has-text("Send Statement")',
          'button:has-text("Email Statement")',
          'button:has-text("Get Statement")',
          'button:has-text("Generate Statement")',
          'button:has-text("Request Statement")',
        ].join(', '),
      )
      .first();
    if ((await submitBtn.count()) === 0) {
      // Dump debug info before throwing.
      const ts = Date.now();
      try {
        await page.screenshot({ path: `cams_submit_debug_${ts}.png`, fullPage: true });
        const html = await page.content();
        await import('node:fs/promises').then((fs) =>
          fs.writeFile(`cams_submit_debug_${ts}.html`, html),
        );
        logger.error(
          { key: input.sessionKey, ts },
          '[cams] submit button not found — wrote cams_submit_debug_<ts>.{png,html}',
        );
      } catch {
        /* best-effort */
      }
      throw new CamsMailbackError(
        'FORM_NOT_FOUND',
        `Form submit button not found after captcha. See cams_submit_debug_${ts}.html for actual DOM.`,
      );
    }
    // 3-tier click strategy:
    //  1) Normal click after dismiss + nuke overlays.
    //  2) force: true (bypass actionability checks).
    //  3) Direct JS .click() via evaluateHandle (sidesteps pointer-events
    //     interception entirely).
    await dismissOverlays(page);
    await nukeOverlays(page);
    let clicked = false;
    try {
      await submitBtn.click({ timeout: 8000 });
      clicked = true;
    } catch {
      /* fall through */
    }
    if (!clicked) {
      try {
        await nukeOverlays(page);
        await submitBtn.click({ timeout: 8000, force: true });
        clicked = true;
      } catch {
        /* fall through */
      }
    }
    if (!clicked) {
      try {
        const handle = await submitBtn.elementHandle();
        if (handle) {
          // String-form evaluate to avoid TS DOM-lib dependency for this scope.
          await handle.evaluate(`(el) => el.click()`);
          clicked = true;
        }
      } catch {
        /* fall through */
      }
    }
    if (!clicked) {
      throw new CamsMailbackError(
        'SUBMIT_FAILED',
        'Could not click form submit even after force-click + JS dispatch (CDK overlay persists).',
      );
    }
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined);

    // Heuristic success/failure check.
    const bodyText = (await page.locator('body').innerText().catch(() => '')) ?? '';
    const lower = bodyText.toLowerCase();
    if (
      lower.includes('invalid captcha') ||
      lower.includes('incorrect captcha') ||
      lower.includes('try again')
    ) {
      throw new CamsMailbackError('CAPTCHA_REJECTED', 'CAMS rejected the captcha');
    }
    if (
      lower.includes('email') &&
      (lower.includes('successfully') || lower.includes('will be sent') || lower.includes('mailed'))
    ) {
      const refMatch = bodyText.match(/(?:reference|request)\s*(?:no|number|id)[:\s]*([A-Z0-9-]+)/i);
      return {
        ok: true,
        requestRef: refMatch ? refMatch[1]! : null,
        message: 'CAS request submitted to CAMS',
      };
    }

    // Unknown response → assume success but flag for review.
    return {
      ok: true,
      requestRef: null,
      message: 'CAMS form submitted (response did not match known success pattern)',
    };
  } catch (err) {
    if (err instanceof CamsMailbackError) throw err;
    logger.error({ err, key: input.sessionKey }, '[cams] submit failed');
    throw new CamsMailbackError(
      'SUBMIT_FAILED',
      err instanceof Error ? err.message : 'cams submit failed',
    );
  } finally {
    await mailbackSessionManager.closeSession(input.sessionKey);
  }
}
