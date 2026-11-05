import { prisma } from '../../lib/prisma.js';

/**
 * The registration line every piece of advice carries. The INA number is
 * the firm's, set in AppSetting `advice.ria_registration` once SEBI grants
 * it; until then the line says the registration is pending.
 */
export const RIA_SETTING = 'advice.ria_registration';

export async function inaNumber(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: RIA_SETTING } });
  return typeof row?.value === 'string' && row.value.trim() ? row.value.trim() : null;
}

export function complianceText(ina: string | null): string {
  return ina
    ? `SEBI-registered investment adviser, INA ${ina}. Advice, not a guarantee of returns.`
    : 'SEBI investment adviser registration in progress. Advice, not a guarantee of returns.';
}

export async function complianceLine(): Promise<string> {
  return complianceText(await inaNumber());
}
