/**
 * EPFO portal password reset — browser automation.
 *
 * ⚠ THE SELECTORS BELOW ARE UNVERIFIED, exactly as in uanLookup.v1. They were
 * written from the documented shape of the flow, not a live session. Walk the
 * real page and correct SELECTORS before enabling this.
 *
 * One behaviour here is more delicate than in the lookup: this WRITES. If the
 * portal accepts the new password and we then fail to read the confirmation,
 * the member's password has changed and we do not know it. That is why an
 * unrecognised response reports PORTAL_CHANGED with copy telling them to check
 * by signing in, rather than "reset failed" — the two are not the same, and
 * telling them it failed would have them try again with a password that is now
 * wrong.
 */

import { playwrightSessionManager } from '../../../lib/playwrightSessions.js';
import { logger } from '../../../lib/logger.js';
import type { SessionPrompt } from '../../../services/pf/sessionPrompt.js';
import {
  parseResetResponse,
  type PasswordResetInput,
  type PasswordResetOutcome,
} from './passwordReset.parse.js';

export const RESET_URL =
  'https://unifiedportal-mem.epfindia.gov.in/memberinterface/#/forgotPassword';

/** Every DOM assumption in one place, so a portal change is one edit. */
const SELECTORS = {
  uan: '#uan',
  captchaImage: '#captchaImg',
  captchaInput: '#captcha',
  submitUan: 'button:has-text("Submit")',
  mobile: '#mobileNumber',
  requestOtp: 'button:has-text("Get OTP")',
  otpInput: '#otp',
  verifyOtp: 'button:has-text("Verify")',
  newPassword: '#newPassword',
  confirmPassword: '#confirmPassword',
  submitPassword: 'button:has-text("Submit")',
  result: '#result, .alert, .message',
} as const;

const STEP_TIMEOUT_MS = 30_000;

export interface PasswordResetArgs {
  sessionId: string;
  input: PasswordResetInput;
  prompt: SessionPrompt;
}

export async function runPasswordReset(args: PasswordResetArgs): Promise<PasswordResetOutcome> {
  const { sessionId, input, prompt } = args;
  const session = await playwrightSessionManager.createSession(`pwreset-${sessionId}`);
  const { page } = session;

  try {
    await page.goto(RESET_URL, { waitUntil: 'domcontentloaded', timeout: STEP_TIMEOUT_MS });

    await page.fill(SELECTORS.uan, input.uan);

    // Relayed to the member, never sent to a solving service.
    const captchaShot = await page.locator(SELECTORS.captchaImage).screenshot();
    await page.fill(SELECTORS.captchaInput, await prompt.askCaptcha(captchaShot));
    await page.click(SELECTORS.submitUan, { timeout: STEP_TIMEOUT_MS });

    // An unknown UAN or a bad captcha is rejected here, before any OTP is sent.
    const afterUan = await readResult(page);
    if (afterUan) {
      const early = parseResetResponse(afterUan);
      if (!early.ok && early.reason !== 'PORTAL_CHANGED') return early;
    }

    await page.fill(SELECTORS.mobile, input.mobile);
    await page.click(SELECTORS.requestOtp, { timeout: STEP_TIMEOUT_MS });

    const afterOtpRequest = await readResult(page);
    if (afterOtpRequest) {
      const early = parseResetResponse(afterOtpRequest);
      if (!early.ok && early.reason !== 'PORTAL_CHANGED') return early;
    }

    await page.fill(SELECTORS.otpInput, await prompt.askOtp('sms'));
    await page.click(SELECTORS.verifyOtp, { timeout: STEP_TIMEOUT_MS });

    // Past this point the write may land, so a failure to read the answer is
    // ambiguous rather than negative. See the note at the top of the file.
    await page.fill(SELECTORS.newPassword, input.newPassword);
    await page.fill(SELECTORS.confirmPassword, input.newPassword);
    await page.click(SELECTORS.submitPassword, { timeout: STEP_TIMEOUT_MS });

    const finalText = (await readResult(page)) ?? (await page.textContent('body')) ?? '';
    return parseResetResponse(finalText);
  } catch (err) {
    logger.error({ sessionId, err }, '[pf.pwreset] automation failed');
    return {
      ok: false,
      reason: 'PORTAL_CHANGED',
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await playwrightSessionManager.closeSession(session.id);
  }
}

async function readResult(page: {
  textContent(sel: string): Promise<string | null>;
}): Promise<string | null> {
  try {
    return await page.textContent(SELECTORS.result);
  } catch {
    return null;
  }
}
