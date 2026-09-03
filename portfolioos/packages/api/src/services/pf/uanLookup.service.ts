/**
 * UAN lookup — finding a member's Universal Account Number so a PF account can
 * be created from it.
 *
 * Runs on the same session machinery as a passbook fetch (INITIATED →
 * AWAITING_CAPTCHA → AWAITING_OTP → COMPLETED, streamed over SSE), which is why
 * this file is short: the state transitions, the captcha relay, the OTP relay
 * and the failure capture already exist. The only thing that differs is that
 * there is no account yet — the lookup is what produces the identifier — so the
 * session carries `kind: UAN_LOOKUP` and a null account.
 *
 * What is deliberately NOT here: the member's name, date of birth, PAN and
 * mobile are never written to the session row. They are the inputs to one
 * portal submission and have no reason to outlive it. The row keeps only what
 * is needed to explain what happened — status, attempt counts, error.
 */

import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { BadRequestError, TooManyRequestsError } from '../../lib/errors.js';
import {
  validateLookupInput,
  maskUan,
  type UanLookupInput,
  type UanLookupOutcome,
} from '../../adapters/pf/epf/uanLookup.parse.js';

/**
 * A lookup answers "do these details belong to a real EPFO member?", which
 * makes an unlimited endpoint an identity-confirmation oracle for anyone with
 * a list of PANs. It is also not a thing a genuine user does repeatedly: you
 * find your UAN once. The limit is therefore tight on purpose.
 */
export const MAX_LOOKUPS_PER_DAY = 5;
const DAY_MS = 86_400_000;

export interface StartUanLookupResult {
  sessionId: string;
}

export async function startUanLookup(
  userId: string,
  raw: UanLookupInput,
  source: 'EXTENSION' | 'SERVER_HEADLESS',
): Promise<StartUanLookupResult> {
  const validation = validateLookupInput(raw);
  if (!validation.ok || !validation.value) {
    // Reject here rather than at the portal: every rejected submission burns a
    // captcha and sends a real OTP to the member's phone.
    throw new BadRequestError(validation.errors.join(' '));
  }

  const since = new Date(Date.now() - DAY_MS);
  const recent = await prisma.pfFetchSession.count({
    where: { userId, kind: 'UAN_LOOKUP', startedAt: { gte: since } },
  });
  if (recent >= MAX_LOOKUPS_PER_DAY) {
    throw new TooManyRequestsError(
      `Too many UAN lookups today. Try again tomorrow, or enter your UAN directly if you have it.`,
    );
  }

  const session = await prisma.pfFetchSession.create({
    data: {
      userId,
      kind: 'UAN_LOOKUP',
      providentFundAccountId: null,
      source,
      status: 'INITIATED',
    },
  });

  // The validated inputs go to the worker in the job payload and nowhere else.
  logger.info(
    { userId, sessionId: session.id, source },
    '[pf.uan] lookup started',
  );

  return { sessionId: session.id };
}

/**
 * Record the outcome. On success the UAN is returned to the caller ONCE, for
 * them to confirm and turn into an account; it is not stored on the session,
 * because a session row is an audit of what happened, not a place to keep an
 * identifier we have nowhere to attach yet.
 */
export async function finishUanLookup(
  sessionId: string,
  outcome: UanLookupOutcome,
): Promise<void> {
  if (outcome.ok) {
    await prisma.pfFetchSession.update({
      where: { id: sessionId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    logger.info({ sessionId, uan: maskUan(outcome.uan) }, '[pf.uan] lookup succeeded');
    return;
  }

  await prisma.pfFetchSession.update({
    where: { id: sessionId },
    data: {
      status: 'FAILED',
      completedAt: new Date(),
      errorMessage: outcome.reason,
    },
  });

  if (outcome.reason === 'PORTAL_CHANGED') {
    // Not a user error. Somebody needs to look at the adapter, and until they
    // do, every lookup will fail the same way.
    logger.error(
      { sessionId, detail: outcome.detail },
      '[pf.uan] portal response not recognised — adapter needs updating',
    );
  } else {
    logger.info({ sessionId, reason: outcome.reason }, '[pf.uan] lookup failed');
  }
}

/** User-facing copy per failure. Each dead end needs its own next step. */
export const LOOKUP_FAILURE_MESSAGE: Record<string, string> = {
  NO_RECORD:
    'EPFO has no UAN for those details. Check the spelling of your name and your date of birth against your PAN, or ask a previous employer for your UAN.',
  MOBILE_NOT_REGISTERED:
    'That mobile number is not the one EPFO holds for you, so it cannot receive the OTP. Your employer registered a number when your UAN was created — you will need EPFO or a previous employer to update it.',
  CAPTCHA_REJECTED: 'The captcha did not match. Try again.',
  OTP_REJECTED: 'That OTP was wrong or has expired. Request a new one.',
  PORTAL_CHANGED:
    'We could not read the EPFO response. This is our problem, not yours — enter your UAN directly if you have it, and we will look into it.',
};
