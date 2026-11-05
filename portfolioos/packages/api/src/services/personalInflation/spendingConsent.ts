import type { Request } from 'express';
import { SPENDING_CONSENT_VERSION, type SpendingConsentView } from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit.js';
import { env } from '../../config/env.js';
import { CANONICAL_SPEND_TYPES } from '../spending/sources/canonicalEventSource.js';

/**
 * Consent to read the user's bank spending for personal inflation (plan
 * "Consent notice"). Until it is given, the spending sync skips the user and
 * the page keeps the rate from their own entries. Withdrawing stops the
 * reading and deletes everything derived from it; bank alerts themselves and
 * the user's typed expenses are untouched.
 */

export const GRIEVANCE_CONTACT_SETTING = 'privacy.grievance_contact';

export async function getSpendingConsent(userId: string): Promise<SpendingConsentView> {
  const [profile, contact] = await Promise.all([
    prisma.inflationProfile.findUnique({
      where: { userId },
      select: { spendingConsentAt: true, spendingConsentVersion: true },
    }),
    prisma.appSetting.findUnique({ where: { key: GRIEVANCE_CONTACT_SETTING } }),
  ]);
  // A notice whose wording changed since the user agreed is asked again.
  const given = !!profile?.spendingConsentAt && profile.spendingConsentVersion === SPENDING_CONSENT_VERSION;
  const hasAlerts = given
    ? true
    : !!(await prisma.canonicalEvent.findFirst({
        where: { userId, eventType: { in: CANONICAL_SPEND_TYPES }, status: { in: ['CONFIRMED', 'PROJECTED'] } },
        select: { id: true },
      }));
  return {
    given,
    givenAt: given ? profile!.spendingConsentAt!.toISOString() : null,
    askNow: !given && hasAlerts,
    version: SPENDING_CONSENT_VERSION,
    grievanceContact: typeof contact?.value === 'string' && contact.value.trim() ? contact.value.trim() : null,
    aiZeroRetention: env.ANTHROPIC_ZERO_RETENTION_CONFIRMED === 'true',
  };
}

export async function giveSpendingConsent(userId: string, version: string, req?: Request): Promise<void> {
  if (version !== SPENDING_CONSENT_VERSION) {
    throw new BadRequestError('Please agree to the current version of the notice.');
  }
  const at = new Date();
  await prisma.inflationProfile.upsert({
    where: { userId },
    create: { userId, spendingConsentAt: at, spendingConsentVersion: version },
    update: { spendingConsentAt: at, spendingConsentVersion: version },
  });
  await writeAuditLog({ userId, action: 'consent.spending_analysis', resource: `SpendingConsent:${version}`, metadata: { version }, req });
}

/** Turn off and delete what was derived. Returns how many spending rows were removed. */
export async function withdrawSpendingConsent(userId: string, req?: Request): Promise<number> {
  const removed = await runInTransaction(async (tx) => {
    await tx.inflationProfile.updateMany({ where: { userId }, data: { spendingConsentAt: null, spendingConsentVersion: null } });
    await tx.inflationBasketItem.updateMany({ where: { userId, matchedSeriesId: { not: null } }, data: { matchedSeriesId: null } });
    await tx.spendMonthlyCategory.deleteMany({ where: { userId } });
    await tx.spendPayeeTag.deleteMany({ where: { userId } });
    // Rows point at series and at each other (duplicates, refunds): clear the links first.
    await tx.spendTxn.updateMany({ where: { userId }, data: { seriesId: null, duplicateOfId: null, refundOfId: null } });
    const txns = await tx.spendTxn.deleteMany({ where: { userId } });
    await tx.spendRecurringSeries.deleteMany({ where: { userId } });
    return txns.count;
  });
  await writeAuditLog({ userId, action: 'consent.spending_analysis_withdrawn', metadata: { removedTxns: removed }, req });
  return removed;
}

/** The user's answer to a big jump in a fixed payment: a real price rise, or a move / new school. */
export async function answerStepChange(userId: string, seriesId: string, realRise: boolean): Promise<void> {
  const res = await prisma.spendRecurringSeries.updateMany({ where: { id: seriesId, userId }, data: { acceptOwnRate: realRise } });
  if (res.count === 0) throw new NotFoundError('Payment not found');
}
