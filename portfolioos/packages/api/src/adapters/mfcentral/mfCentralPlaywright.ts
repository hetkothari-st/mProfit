import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { mfCentralSessionManager } from '../../lib/mfCentralSessions.js';
import { logger } from '../../lib/logger.js';

// MFCentral new flow (2025+):
// 1. Navigate to https://www.mfcentral.com → click Login
// 2. Enter PAN → request OTP to registered mobile/email
// 3. Enter OTP → land on dashboard
// 4. Click "CAS" tab → request CAS → download PDF
//
// Old URL (https://www.mfcentral.com/investors/cas) is dead — returns AccessDenied.
//
// DOM selectors are named constants — a portal redesign breaks here with a clear name.

const MFCENTRAL_HOME = 'https://www.mfcentral.com';
const MFCENTRAL_LOGIN = 'https://app.mfcentral.com/investor/signin';

const FIXTURE_PDF = process.env.MFCENTRAL_FIXTURE_PDF;

export class MFCentralError extends Error {
  code:
    | 'OTP_FORM_NOT_FOUND'
    | 'OTP_REQUEST_FAILED'
    | 'OTP_INVALID'
    | 'DOWNLOAD_TIMEOUT'
    | 'SESSION_EXPIRED'
    | 'LOGIN_FAILED'
    | 'CAS_PAGE_NOT_FOUND'
    | 'UNKNOWN';
  constructor(code: MFCentralError['code'], message: string) {
    super(message);
    this.name = 'MFCentralError';
    this.code = code;
  }
}

export interface InitiateInput {
  jobId: string;
  pan: string;
  otpMethod: 'PHONE' | 'EMAIL';
  contactValue: string;
}

export interface InitiateResult {
  maskedContact: string;
}

function maskPhone(s: string): string {
  const digits = s.replace(/\D/g, '');
  if (digits.length < 4) return digits;
  return 'X'.repeat(Math.max(0, digits.length - 4)) + digits.slice(-4);
}

function maskEmail(s: string): string {
  const [local, domain] = s.split('@');
  if (!local || !domain) return s;
  const visible = local.slice(0, 2);
  return `${visible}${'X'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

export async function initiateMFCentralSync(input: InitiateInput): Promise<InitiateResult> {
  if (FIXTURE_PDF) {
    await mfCentralSessionManager.createSession(input.jobId, input.pan);
    return {
      maskedContact:
        input.otpMethod === 'EMAIL' ? maskEmail(input.contactValue) : maskPhone(input.contactValue),
    };
  }

  const session = await mfCentralSessionManager.createSession(input.jobId, input.pan);
  const { page } = session;

  try {
    logger.info({ jobId: input.jobId, otpMethod: input.otpMethod }, '[mfcentral] initiating login');

    // Step 1: navigate directly to signin page (app subdomain, not www)
    await page.goto(MFCENTRAL_LOGIN, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Step 2: wait for Angular to finish rendering — at least one input must appear
    await page.waitForSelector('input', { state: 'visible', timeout: 15000 }).catch(() => {
      logger.warn({ jobId: input.jobId }, '[mfcentral] no inputs rendered after 15s');
    });
    await page.waitForTimeout(1000);

    // Dump ALL inputs for diagnostics on every attempt
    const allInputs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).map((el) => ({
        type: el.type, name: el.name, id: el.id,
        placeholder: el.placeholder,
        formcontrolname: el.getAttribute('formcontrolname'),
        ngReflectName: el.getAttribute('ng-reflect-name'),
        ariaLabel: el.getAttribute('aria-label'),
        className: el.className.slice(0, 80),
        outerHTML: el.outerHTML.slice(0, 200),
      }))
    );
    logger.info({ jobId: input.jobId, url: page.url(), inputs: allInputs }, '[mfcentral] page inputs dump');

    // Step 3: fill PAN field — exact selectors from DOM inspection
    const panSelectors = [
      'input[name="userId"]',       // confirmed: app.mfcentral.com/investor/signin
      'input#textinput',            // confirmed id
      'input[placeholder*="PAN" i]',
      'input[placeholder*="PEKRN" i]',
      'input[formcontrolname="pan" i]',
      'input[formcontrolname="panNumber" i]',
      'input[aria-label*="PAN" i]',
      'input[type="text"]:visible',
    ];

    let panFilled = false;
    for (const sel of panSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
        await el.fill(input.pan.toUpperCase());
        panFilled = true;
        logger.info({ jobId: input.jobId, sel }, '[mfcentral] PAN field found + filled');
        break;
      }
    }

    if (!panFilled) {
      const html = await page.content();
      logger.error({ jobId: input.jobId, url: page.url(), htmlSnippet: html.slice(0, 3000) }, '[mfcentral] PAN field not found — full page dump');
      throw new MFCentralError('OTP_FORM_NOT_FOUND', `PAN field not found. Page URL: ${page.url()}. Check server logs for full inputs list.`);
    }

    // Step 3: select OTP method if radio buttons exist
    const otpRadio = page.locator(
      input.otpMethod === 'EMAIL'
        ? 'input[type="radio"][value*="email" i], label:has-text("Email") input[type="radio"]'
        : 'input[type="radio"][value*="mobile" i], input[type="radio"][value*="phone" i], label:has-text("Mobile") input[type="radio"]',
    );
    if (await otpRadio.count().then(c => c > 0)) {
      await otpRadio.first().check().catch(() => undefined);
    }

    // Step 3b: toggle to OTP mode (switch from Password to OTP)
    // confirmed selector: input[name="signInToggle"] (MUI Switch)
    const otpToggle = page.locator('input[name="signInToggle"]').first();
    if (await otpToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      const isChecked = await otpToggle.isChecked();
      // Toggle is on left (Password) by default; click to switch to OTP
      if (!isChecked) {
        await otpToggle.click({ force: true });
        await page.waitForTimeout(1000);
        logger.info({ jobId: input.jobId }, '[mfcentral] toggled to OTP mode');
      }
    }

    // Step 4: click Sign In / Send OTP button
    const otpBtnSelectors = [
      'button#submit-id',           // confirmed id
      'button:has-text("Get OTP")',
      'button:has-text("Send OTP")',
      'button:has-text("Sign In")',
      'button[type="submit"]',
    ];

    let otpBtnClicked = false;
    for (const sel of otpBtnSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        otpBtnClicked = true;
        logger.info({ jobId: input.jobId, sel }, '[mfcentral] OTP button clicked');
        break;
      }
    }

    if (!otpBtnClicked) {
      throw new MFCentralError('OTP_FORM_NOT_FOUND', 'OTP submit button not found on MFCentral login page');
    }

    // Step 5: wait for OTP input to appear
    const otpField = page.locator(
      'input[formcontrolname*="otp" i], input[placeholder*="OTP" i], input[aria-label*="OTP" i], input[id*="otp" i]',
    );
    await otpField.first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {
      logger.warn({ jobId: input.jobId }, '[mfcentral] OTP field not visible after button click');
    });

    return {
      maskedContact:
        input.otpMethod === 'EMAIL' ? maskEmail(input.contactValue) : maskPhone(input.contactValue),
    };
  } catch (err) {
    await mfCentralSessionManager.closeSession(input.jobId);
    if (err instanceof MFCentralError) throw err;
    logger.error({ err, jobId: input.jobId }, '[mfcentral] initiate failed');
    throw new MFCentralError(
      'OTP_REQUEST_FAILED',
      err instanceof Error ? err.message : 'OTP request failed',
    );
  }
}

export interface SubmitInput {
  jobId: string;
  otp: string;
}

export interface SubmitResult {
  pdfPath: string;
}

export async function submitMFCentralOtp(input: SubmitInput): Promise<SubmitResult> {
  if (FIXTURE_PDF) {
    const dst = path.join(os.tmpdir(), `mfcentral-${input.jobId}.pdf`);
    await fs.copyFile(FIXTURE_PDF, dst);
    await mfCentralSessionManager.closeSession(input.jobId);
    return { pdfPath: dst };
  }

  const session = mfCentralSessionManager.getSession(input.jobId);
  if (!session) {
    throw new MFCentralError('SESSION_EXPIRED', 'MFCentral session expired or not found');
  }
  const { page } = session;

  try {
    // Fill OTP — handle split-digit and single-input forms
    const splitInputs = page.locator('input[type="text"][maxlength="1"], .otp-input input, input[type="number"][maxlength="1"]');
    const splitCount = await splitInputs.count();
    if (splitCount >= input.otp.length) {
      for (let i = 0; i < input.otp.length; i++) {
        await splitInputs.nth(i).fill(input.otp[i] ?? '');
      }
    } else {
      const otpInput = page.locator(
        'input[formcontrolname*="otp" i], input[placeholder*="OTP" i], input[aria-label*="OTP" i], input[id*="otp" i]',
      );
      await otpInput.first().waitFor({ state: 'visible', timeout: 10000 });
      await otpInput.first().fill(input.otp);
    }

    // Click verify/submit
    const verifySelectors = [
      'button:has-text("Verify OTP")',
      'button:has-text("Verify")',
      'button:has-text("Submit")',
      'button:has-text("Login")',
      'button:has-text("Continue")',
      'button[type="submit"]',
    ];

    for (const sel of verifySelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Watch for download before clicking
        const downloadPromise = page.waitForEvent('download', { timeout: 90000 }).catch(() => null);
        await btn.click();

        // Check for OTP error
        await page.waitForTimeout(1500);
        const errMsg = page.locator('[class*="error"]:visible, text=/(invalid|incorrect|wrong|expired).*otp/i');
        if (await errMsg.count().then(c => c > 0)) {
          throw new MFCentralError('OTP_INVALID', 'MFCentral rejected the OTP');
        }

        // After login: navigate to CAS section
        await page.waitForTimeout(3000);
        logger.info({ jobId: input.jobId, url: page.url() }, '[mfcentral] post-OTP state');

        // Try navigating to CAS tab/page
        const casNav = page.locator(
          'a:has-text("CAS"), a:has-text("Statement"), button:has-text("CAS"), [href*="cas" i]',
        );
        if (await casNav.count().then(c => c > 0)) {
          await casNav.first().click();
          await page.waitForTimeout(2000);
        }

        // Look for download button on CAS page
        const downloadBtn = page.locator(
          'button:has-text("Download"), button:has-text("Generate"), a:has-text("Download CAS"), button:has-text("Get CAS")',
        );
        if (await downloadBtn.count().then(c => c > 0)) {
          const dl = await page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
          await downloadBtn.first().click();
          const download = dl ?? await downloadPromise;
          if (download) {
            const dst = path.join(os.tmpdir(), `mfcentral-${input.jobId}.pdf`);
            await download.saveAs(dst);
            await mfCentralSessionManager.closeSession(input.jobId);
            return { pdfPath: dst };
          }
        }

        // Fallback: maybe download started automatically on OTP verify
        const download = await downloadPromise;
        if (download) {
          const dst = path.join(os.tmpdir(), `mfcentral-${input.jobId}.pdf`);
          await download.saveAs(dst);
          await mfCentralSessionManager.closeSession(input.jobId);
          return { pdfPath: dst };
        }

        throw new MFCentralError('DOWNLOAD_TIMEOUT', 'CAS PDF download did not start after login. MFCentral portal may have changed.');
      }
    }

    throw new MFCentralError('OTP_FORM_NOT_FOUND', 'Verify OTP button not found');
  } catch (err) {
    await mfCentralSessionManager.closeSession(input.jobId);
    if (err instanceof MFCentralError) throw err;
    logger.error({ err, jobId: input.jobId }, '[mfcentral] submit failed');
    throw new MFCentralError('UNKNOWN', err instanceof Error ? err.message : 'submit failed');
  }
}
