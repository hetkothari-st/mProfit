/**
 * Settings -> Notifications -> "Loan rate alerts" (EMI calculator plan 3, spec s6.3). A real column, not a
 * key in User.preferences: the sidebar preferences endpoint replaces that JSON wholesale (plan ruling 2).
 * Per user; a manager acting for a managed profile reads and sets the profile's own flag.
 */
import type { LoanAlertPrefsWire } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';

export async function getLoanAlertPrefs(userId: string): Promise<LoanAlertPrefsWire> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { loanRateAlerts: true } });
  return { loanRateAlerts: user.loanRateAlerts };
}

export async function setLoanAlertPrefs(userId: string, prefs: LoanAlertPrefsWire): Promise<LoanAlertPrefsWire> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { loanRateAlerts: prefs.loanRateAlerts },
    select: { loanRateAlerts: true },
  });
  return { loanRateAlerts: user.loanRateAlerts };
}
