import { toAmount2 } from '@everypaisa/shared';
import { prisma } from '../../../../lib/prisma.js';
import { clip, type EstateAdapter, type EstateCandidate } from '../types.js';

/** Policies that pay out on death. Health, motor, home and travel cover do not. */
const LIFE_TYPES = ['TERM', 'WHOLE_LIFE', 'ULIP', 'ENDOWMENT', 'PERSONAL_ACCIDENT'];

export const insuranceAdapter: EstateAdapter = {
  id: 'insurance',
  version: '1',
  async collect({ userId }) {
    const rows = await prisma.insurancePolicy.findMany({
      where: { userId, status: 'ACTIVE', type: { in: LIFE_TYPES } },
      orderBy: { startDate: 'asc' },
      select: { id: true, insurer: true, planName: true, type: true, sumAssured: true, policyNumberLast4: true },
    });
    return rows.map((p): EstateCandidate => ({
      sourceKey: `insurance:${p.id}`, side: 'ASSET', kind: 'INSURANCE',
      label: clip(p.planName ? `${p.insurer} ${p.planName}` : `${p.insurer} ${p.type.toLowerCase().replace(/_/g, ' ')} policy`, 160),
      ref: p.policyNumberLast4 ? `XXXX${p.policyNumberLast4}` : null,
      value: toAmount2(p.sumAssured.toString()), valueAsOf: null,
      ownership: { type: 'NOMINEE_ONLY', sharePct: '100' }, review: 'CONFIRMED',
      note: 'Paid to the nominee; not counted in your estate totals.',
    }));
  },
};
