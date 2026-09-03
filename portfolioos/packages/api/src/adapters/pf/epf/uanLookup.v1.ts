/**
 * EPFO "Know your UAN" — browser automation.
 *
 * ⚠ THE SELECTORS BELOW ARE UNVERIFIED.
 *
 * They were written from the documented shape of the flow, not from a live
 * session against the portal, and EPFO changes its markup without notice. Walk
 * the real page and correct SELECTORS before enabling this in production; the
 * canary described in uanLookup.service will tell you when it drifts again.
 *
 * Everything that can be checked without the portal — input validation, reading
 * the response, deciding what a failure means — lives in uanLookup.parse.ts and
 * is covered by tests. This file is deliberately thin: fetch strings, hand them
 * to the parser, relay prompts. The less judgement here, the less that breaks
 * when the DOM moves.
 *
 * Note on the source: this path drives a browser from OUR infrastructure, so
 * EPFO sees a datacentre IP making repeated automated requests and will
 * eventually rate-limit it. The EXTENSION path performs the same steps in the
 * member's own browser and is the one to prefer; this exists for members who
 * will not install it.
 */

import { playwrightSessionManager } from '../../../lib/playwrightSessions.js';
import { logger } from '../../../lib/logger.js';
import type { SessionPrompt } from '../../../services/pf/sessionPrompt.js';
import {
  parseLookupResponse,
  type UanLookupInput,
  type UanLookupOutcome,
} from './uanLookup.parse.js';

export const UAN_LOOKUP_URL = 'https://unifiedportal-mem.epfindia.gov.in/memberinterface/';

/**
 * Every DOM assumption in one block, so correcting them after a portal change
 * is a single edit rather than a hunt through the flow below.
 */
const SELECTORS = {
  knowYourUanLink: 'a:has-text("Know your UAN")',
  mobile: '#mobileNumber',
  captchaImage: '#captchaImg',
  captchaInput: '#captcha',
  requestOtp: 'button:has-text("Request OTP")',
  otpInput: '#otp',
  validateOtp: 'button:has-text("Validate OTP")',
  name: '#name',
  dob: '#dob',
  pan: '#pan',
  aadhaar: '#aadhaar',
  memberId: '#memberId',
  submit: 'button[type="submit"]',
  /** Whatever region the portal renders its answer into. */
  result: '#result, .alert, .message',
} as const;

const STEP_TIMEOUT_MS = 30_000;

export interface UanLookupArgs {
  sessionId: string;
  input: UanLookupInput;
  prompt: SessionPrompt;
}

export async function runUanLookup(args: UanLookupArgs): Promise<UanLookupOutcome> {
  const { sessionId, input, prompt } = args;
  const session = await playwrightSessionManager.createSession(`uan-${sessionId}`);
  const { page } = session;

  try {
    await page.goto(UAN_LOOKUP_URL, { waitUntil: 'domcontentloaded', timeout: STEP_TIMEOUT_MS });
    await page.click(SELECTORS.knowYourUanLink, { timeout: STEP_TIMEOUT_MS });

    await page.fill(SELECTORS.mobile, input.mobile);

    // Captcha goes to the member, never to a solving service. Relaying it keeps
    // this "automating on the member's behalf" rather than "defeating an access
    // control", and the session already knows how to ask.
    const captchaShot = await page.locator(SELECTORS.captchaImage).screenshot();
    const captchaAnswer = await prompt.askCaptcha(captchaShot);
    await page.fill(SELECTORS.captchaInput, captchaAnswer);

    await page.click(SELECTORS.requestOtp, { timeout: STEP_TIMEOUT_MS });

    // A failure can surface here rather than at the end — an unregistered
    // mobile is rejected before any OTP is sent.
    const afterOtpRequest = await readResult(page);
    if (afterOtpRequest) {
      const early = parseLookupResponse(afterOtpRequest);
      if (!early.ok && early.reason !== 'PORTAL_CHANGED') return early;
    }

    const otp = await prompt.askOtp('sms');
    await page.fill(SELECTORS.otpInput, otp);
    await page.click(SELECTORS.validateOtp, { timeout: STEP_TIMEOUT_MS });

    await page.fill(SELECTORS.name, input.name);
    await page.fill(SELECTORS.dob, input.dob);
    if (input.pan) await page.fill(SELECTORS.pan, input.pan);
    else if (input.aadhaar) await page.fill(SELECTORS.aadhaar, input.aadhaar);
    else if (input.memberId) await page.fill(SELECTORS.memberId, input.memberId);

    await page.click(SELECTORS.submit, { timeout: STEP_TIMEOUT_MS });

    const finalText = (await readResult(page)) ?? (await page.textContent('body')) ?? '';
    return parseLookupResponse(finalText);
  } catch (err) {
    // A timeout or a missing selector means the page is not what we expect —
    // which is PORTAL_CHANGED, not "this member has no UAN". Reporting the
    // latter would send someone to an EPFO office over our broken selector.
    logger.error({ sessionId, err }, '[pf.uan] automation failed');
    return {
      ok: false,
      reason: 'PORTAL_CHANGED',
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await playwrightSessionManager.closeSession(session.id);
  }
}

/** The portal's visible answer, or null if it has not rendered one. */
async function readResult(page: { textContent(sel: string): Promise<string | null> }): Promise<string | null> {
  try {
    return await page.textContent(SELECTORS.result);
  } catch {
    return null;
  }
}
