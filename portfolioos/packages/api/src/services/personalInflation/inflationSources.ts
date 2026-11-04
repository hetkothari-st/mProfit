import { Decimal } from 'decimal.js';
import { premiumToAnnual, serializeMoney, type InflationSourceCandidate } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';

/**
 * Expenses the user already tracks elsewhere in the app — loan EMIs,
 * insurance premiums, home maintenance — offered as one-tap basket items.
 *
 * Amounts are copied when added, not kept in sync: the basket is a spending
 * picture, and a later EMI change is the user's to update. Each candidate
 * carries a stable `sourceRef` so the same loan or policy is never added twice
 * (enforced by the unique index on InflationBasketItem(userId, sourceRef)).
 */

const LOAN_LABEL: Record<string, string> = {
  HOME: 'Home loan', CAR: 'Car loan', PERSONAL: 'Personal loan', EDUCATION: 'Education loan',
  BUSINESS: 'Business loan', GOLD: 'Gold loan', LAS: 'Loan against securities',
};
/** An EMI is not a price — it buys the same loan every month — so its category only groups it. */
const LOAN_DIVISION: Record<string, string> = { HOME: '04', CAR: '07', EDUCATION: '10' };

const INSURANCE_LABEL: Record<string, string> = {
  HEALTH: 'Health insurance', MOTOR: 'Motor insurance', HOME: 'Home insurance', TERM: 'Term insurance',
  WHOLE_LIFE: 'Life insurance', ENDOWMENT: 'Endowment policy', ULIP: 'ULIP', TRAVEL: 'Travel insurance',
  PERSONAL_ACCIDENT: 'Accident cover',
};
/** Life policies lock the premium at purchase; it does not rise with prices. */
const FIXED_PREMIUM_TYPES = new Set(['TERM', 'WHOLE_LIFE', 'ENDOWMENT', 'ULIP']);
const INSURANCE_DIVISION: Record<string, string> = { HEALTH: '06', MOTOR: '07', HOME: '04' };

const OWNER_OCCUPIED = ['SELF_OCCUPIED', 'SECOND_HOME'];

const FIXED_EMI_NOTE = 'EMIs stay the same each month, so this counts at 0%.';
const FIXED_PREMIUM_NOTE = 'Life cover premiums are fixed when you buy the policy, so this counts at 0%.';
const HEALTH_NOTE =
  'Uses the official health rate. If your renewals have jumped more than that, switch to your own rate.';

const money = (v: { toString(): string }) => serializeMoney(new Decimal(v.toString()));

export async function listSourceCandidates(userId: string): Promise<InflationSourceCandidate[]> {
  const [loans, policies, homes, added] = await Promise.all([
    prisma.loan.findMany({
      where: { userId, status: { in: ['ACTIVE', 'DEFAULT'] } },
      select: { id: true, lenderName: true, loanType: true, emiAmount: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.insurancePolicy.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { id: true, insurer: true, type: true, planName: true, premiumAmount: true, premiumFrequency: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.ownedProperty.findMany({
      where: { userId, isActive: true, status: { in: OWNER_OCCUPIED }, monthlyMaintenance: { gt: 0 } },
      select: { id: true, name: true, monthlyMaintenance: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.inflationBasketItem.findMany({
      where: { userId, sourceRef: { not: null } },
      select: { sourceRef: true },
    }),
  ]);
  const taken = new Set(added.map((a) => a.sourceRef));

  const out: InflationSourceCandidate[] = [];

  for (const l of loans) {
    if (new Decimal(l.emiAmount.toString()).lessThanOrEqualTo(0)) continue;
    const label = LOAN_LABEL[l.loanType] ?? 'Loan';
    out.push({
      sourceRef: `loan:${l.id}`,
      kind: 'LOAN',
      name: `${label} EMI`,
      detail: `${l.lenderName} · from Loans`,
      divisionCode: LOAN_DIVISION[l.loanType] ?? '13',
      amount: money(l.emiAmount),
      frequency: 'MONTHLY',
      rateMode: 'CUSTOM',
      customRate: '0',
      note: FIXED_EMI_NOTE,
      alreadyAdded: false,
    });
  }

  for (const p of policies) {
    const annual = premiumToAnnual(new Decimal(p.premiumAmount.toString()), p.premiumFrequency);
    if (annual.lessThanOrEqualTo(0)) continue; // single-premium policies cost nothing going forward
    const monthly = p.premiumFrequency === 'MONTHLY';
    const fixed = FIXED_PREMIUM_TYPES.has(p.type);
    const label = INSURANCE_LABEL[p.type] ?? 'Insurance';
    out.push({
      sourceRef: `insurance:${p.id}`,
      kind: 'INSURANCE',
      name: `${label} premium`,
      detail: `${p.insurer}${p.planName ? ` ${p.planName}` : ''} · from Insurance`,
      divisionCode: INSURANCE_DIVISION[p.type] ?? '13',
      amount: monthly ? money(p.premiumAmount) : serializeMoney(annual),
      frequency: monthly ? 'MONTHLY' : 'YEARLY',
      rateMode: fixed ? 'CUSTOM' : 'OFFICIAL',
      customRate: fixed ? '0' : null,
      note: fixed ? FIXED_PREMIUM_NOTE : p.type === 'HEALTH' ? HEALTH_NOTE : null,
      alreadyAdded: false,
    });
  }

  for (const h of homes) {
    out.push({
      sourceRef: `property:${h.id}`,
      kind: 'PROPERTY',
      name: 'Society maintenance',
      detail: `${h.name} · from Real estate`,
      divisionCode: '04',
      amount: money(h.monthlyMaintenance!),
      frequency: 'MONTHLY',
      rateMode: 'OFFICIAL',
      customRate: null,
      note: null,
      alreadyAdded: false,
    });
  }

  return out.map((c) => ({ ...c, alreadyAdded: taken.has(c.sourceRef) }));
}

/**
 * Add the chosen candidates to the basket. The amounts come from the
 * re-read source rows, never the client, and refs the user does not own (or
 * already added) are skipped. Returns how many items were created.
 */
export async function importSourceCandidates(userId: string, sourceRefs: readonly string[]): Promise<number> {
  const wanted = new Set(sourceRefs);
  const picks = (await listSourceCandidates(userId)).filter((c) => wanted.has(c.sourceRef) && !c.alreadyAdded);
  if (picks.length === 0) return 0;
  const res = await prisma.inflationBasketItem.createMany({
    data: picks.map((c) => ({
      userId,
      name: c.name,
      divisionCode: c.divisionCode,
      amount: c.amount,
      frequency: c.frequency,
      rateMode: c.rateMode,
      customRate: c.customRate,
      notes: c.note,
      sourceRef: c.sourceRef,
    })),
    skipDuplicates: true, // a double-click racing itself
  });
  return res.count;
}
