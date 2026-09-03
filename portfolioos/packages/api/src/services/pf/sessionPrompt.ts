/**
 * The captcha / OTP / free-text prompts a PF session can put to the member.
 *
 * Extracted from pfFetchWorker so the UAN lookup and the passbook fetch ask in
 * exactly the same way — same SSE event shapes, same timeouts — rather than
 * growing two subtly different conversations with the client. The frontend
 * already knows how to answer `captcha_required` and `otp_required`; a lookup
 * that invented its own event names would need a second implementation on the
 * client for no reason.
 */

import { randomUUID } from 'node:crypto';
import { sseHub } from '../../lib/sseHub.js';

export interface SessionPrompt {
  askCaptcha(imgBytes: Buffer): Promise<string>;
  askOtp(channel: 'sms' | 'email'): Promise<string>;
  askText(label: string): Promise<string>;
}

/** Long enough for someone to read a captcha off the screen and type it. */
const CAPTCHA_TIMEOUT_MS = 90_000;
/** Longer: an SMS has to arrive first, and carriers are not always prompt. */
const OTP_TIMEOUT_MS = 120_000;
const TEXT_TIMEOUT_MS = 120_000;

export function makeSessionPrompt(sessionId: string): SessionPrompt {
  return {
    async askCaptcha(imgBytes: Buffer): Promise<string> {
      return sseHub.ask(
        sessionId,
        {
          type: 'captcha_required',
          data: { promptId: randomUUID(), imgBase64: imgBytes.toString('base64'), expectedLength: 6 },
        },
        { timeoutMs: CAPTCHA_TIMEOUT_MS },
      );
    },
    async askOtp(channel: 'sms' | 'email'): Promise<string> {
      return sseHub.ask(
        sessionId,
        { type: 'otp_required', data: { promptId: randomUUID(), channel } },
        { timeoutMs: OTP_TIMEOUT_MS },
      );
    },
    async askText(label: string): Promise<string> {
      return sseHub.ask(
        sessionId,
        { type: 'text_required', data: { promptId: randomUUID(), label } },
        { timeoutMs: TEXT_TIMEOUT_MS },
      );
    },
  };
}
