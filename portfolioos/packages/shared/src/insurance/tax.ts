/**
 * What the premiums recorded in a financial year (April–March) are worth at
 * tax time: life premiums under section 123, health premiums under section
 * 126, and whether a life policy's payout will be tax-free under Schedule II.
 *
 * Law: the Income-tax Act, 2025, in force from 1 April 2026 — tax year
 * 2026-27 onwards. Earlier years fell under the Income-tax Act, 1961 and are
 * not worked out here. Every rule quoted has its section and the page it was
 * read from (checked on TAX_RULES_CHECKED_ON against the Income Tax
 * Department's text of the Act, which carries the Finance Act, 2026). These
 * deductions exist only in the old regime; the new regime (section 202) is
 * the default and allows none of them.
 *
 * Money is Decimal throughout, returned as 2-decimal strings.
 */
import { Decimal } from '../decimal.js';
import type { OfficialSource } from './claimsGuide.js';
import { addDaysIso, premiumToAnnual } from './premiumSchedule.js';

export const TAX_RULES_CHECKED_ON = '2026-09-11';

/** The first financial year the Income-tax Act, 2025 applies to. */
export const FIRST_FY_UNDER_2025_ACT = '2026-27';

export const TAX_BUCKETS = ['SELF_FAMILY', 'PARENTS'] as const;
export type TaxBucket = (typeof TAX_BUCKETS)[number];

const itd = (page: string, label: string, where: string): OfficialSource => ({
  label: `Income-tax Act, 2025 — ${label}`,
  url: `https://www.incometaxindia.gov.in/w/${page}`,
  where,
});

const GAZETTE = (where: string): OfficialSource => ({
  label: 'The Income-tax Act, 2025 (No. 30 of 2025), Gazette of India, 22 August 2025',
  url: 'https://egazette.gov.in/WriteReadData/2025/265620.pdf',
  where,
});

const S123 = (where: string) => itd('section-123-96', 'section 123', where);
const SCH_XV = (where: string) => itd('schedule-xv-2', 'Schedule XV', where);
const S126 = (where: string) => itd('section-126-92', 'section 126', where);
const S202 = (where: string) => itd('section-202-76', 'section 202', where);
const SCH_II = (where: string) => itd('schedule-ii-9', 'Schedule II', where);

export interface TaxRule {
  text: string;
  source: OfficialSource;
}

export const LIFE_DEDUCTION_LIMIT = '150000';
export const HEALTH_LIMIT = '25000';
export const HEALTH_SENIOR_LIMIT = '50000';
export const HEALTH_CHECKUP_LIMIT = '5000';
export const ULIP_AGGREGATE_LIMIT = '250000';
export const NON_ULIP_AGGREGATE_LIMIT = '500000';

export const TAX_RULES: {
  regime: TaxRule[];
  life: TaxRule[];
  health: TaxRule[];
  maturity: TaxRule[];
} = {
  regime: [
    {
      text: 'The Income-tax Act, 2025 applies from 1 April 2026, so from the 2026-27 tax year.',
      source: GAZETTE('section 1(3), page 1'),
    },
    {
      text:
        'These deductions are for the old regime only. The new regime is the default, and it allows none of them — ' +
        'to claim them you opt out of it when you file your return.',
      source: S202('sub-sections (1), (2)(a)(xii) and (4)'),
    },
  ],
  life: [
    {
      text: 'Life insurance premiums count towards a deduction of up to ₹1,50,000 a year, shared with provident fund, PPF, ELSS and the rest of Schedule XV.',
      source: S123('section 123'),
    },
    {
      text: 'The policy must be on your own life, your spouse’s or a child’s.',
      source: SCH_XV('paragraph 1(a)'),
    },
    {
      text:
        'Only premium up to 10% of the sum assured counts on a policy issued from 1 April 2012 — 20% on one issued earlier, ' +
        'and 15% from 1 April 2013 if it covers a person with a disability or a specified illness.',
      source: SCH_XV('paragraph 2(1)'),
    },
    {
      text: 'The sum assured here is the least the policy pays on the insured event, leaving out bonuses and returned premiums.',
      source: SCH_XV('paragraph 2(2)'),
    },
  ],
  health: [
    {
      text: 'Health insurance for you, your spouse and dependent children: up to ₹25,000 a year.',
      source: S126('sub-sections (2)(a) and (10)(b)'),
    },
    {
      text: 'Health insurance for your parents: up to a further ₹25,000.',
      source: S126('sub-section (2)(b)'),
    },
    {
      text: 'Each limit rises to ₹50,000 when the insured person is a senior citizen.',
      source: S126('sub-section (8)(a)'),
    },
    {
      text: 'A senior citizen is a resident aged 60 or more at any time during the tax year.',
      source: GAZETTE('section 2(100), page 20'),
    },
    {
      text: 'Preventive health check-ups count within these limits, up to ₹5,000 in all.',
      source: S126('sub-section (3)'),
    },
    {
      text: 'Premiums paid in cash don’t count — only a preventive health check-up may be paid in cash.',
      source: S126('sub-section (9)'),
    },
    {
      text: 'A premium paid in one go for more than a year is split equally over the tax years the cover runs in.',
      source: S126('sub-sections (8)(b) and (10)'),
    },
  ],
  maturity: [
    {
      text: 'A payout on the insured person’s death is tax-free.',
      source: SCH_II('Table, Sl. No. 2(a)'),
    },
    {
      text:
        'Any other payout, bonus included, is tax-free only if the yearly premium stays within a share of the sum assured: ' +
        '20% for a policy issued 1 April 2003 to 31 March 2012, 10% from 1 April 2012 (15% from 1 April 2013 for a person with a disability or a specified illness).',
      source: SCH_II('Table, Sl. No. 2(a)'),
    },
    {
      text: 'For ULIPs issued from 1 February 2021, the yearly premiums on all of them together must also stay within ₹2,50,000.',
      source: SCH_II('Table, Sl. No. 2(a), rows 4 and 5'),
    },
    {
      text: 'For other life policies issued from 1 April 2023, the yearly premiums on all of them together must stay within ₹5,00,000.',
      source: SCH_II('Table, Sl. No. 2(a), row 5'),
    },
    {
      text: 'Keyman policies never qualify.',
      source: SCH_II('Table, Sl. No. 2(c)'),
    },
  ],
};

// ── Financial years ─────────────────────────────────────────────────

const int = (s: string) => Number.parseInt(s, 10);
const fyLabel = (start: number) => `${start}-${String((start + 1) % 100).padStart(2, '0')}`;

/** "2026-06-01" → "2026-27". */
export function taxYearOf(iso: string): string {
  const y = int(iso.slice(0, 4));
  const m = int(iso.slice(5, 7));
  return fyLabel(m >= 4 ? y : y - 1);
}

export interface FinancialYear {
  fy: string;
  from: string;
  to: string;
}

/** "2026-27" → its first and last day; null for anything else. */
export function parseFinancialYear(fy: string): FinancialYear | null {
  const m = /^(\d{4})-(\d{2})$/.exec(fy);
  if (!m) return null;
  const start = int(m[1]!);
  if (fyLabel(start) !== fy) return null;
  return { fy, from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

// ── Inputs and outputs ──────────────────────────────────────────────

export interface TaxPolicyInput {
  id: string;
  insurer: string;
  planName: string | null;
  type: string;
  status: string;
  sumAssured: string;
  premiumAmount: string;
  premiumFrequency: string;
  /** Taken as the date the policy was issued. */
  startDate: string;
  taxBucket: string | null;
  seniorCitizen: boolean | null;
}

export interface TaxPaymentInput {
  policyId: string;
  paidOn: string;
  amount: string;
  periodFrom: string;
  periodTo: string;
}

interface PolicyRef {
  policyId: string;
  insurer: string;
  planName: string | null;
  type: string;
}

export interface LifeLine extends PolicyRef {
  paid: string;
  /** Share of the sum assured that counts (Schedule XV paragraph 2). */
  capPercent: number;
  cap: string;
  eligible: string;
  capped: boolean;
}

export interface HealthLine extends PolicyRef {
  taxBucket: TaxBucket | null;
  seniorCitizen: boolean | null;
  /** Premium counted in this year (a multi-year premium's share). */
  paid: string;
  /** Part of a premium paid for more than a year, spread over the years. */
  spread: boolean;
}

export interface HealthBucketSummary {
  bucket: TaxBucket;
  limit: string;
  senior: boolean;
  paid: string;
  claimable: string;
  lines: HealthLine[];
}

export type MaturityVerdict = 'LIKELY_EXEMPT' | 'MAY_BE_TAXABLE';

export interface MaturityCheck extends PolicyRef {
  /** Yearly premium as a share of the sum assured. */
  ratioPercent: string;
  /** null — no premium condition (issued before 1 April 2003). */
  limitPercent: number | null;
  withinRatio: boolean;
  /** Total-premium condition that applies, if any. */
  aggregateLimit: string | null;
  /** Yearly premiums on the policies recorded here that share that condition. */
  aggregatePremium: string | null;
  verdict: MaturityVerdict;
}

export interface TaxSummary {
  fy: string;
  from: string;
  to: string;
  /** False for years before the Income-tax Act, 2025. */
  covered: boolean;
  notCoveredReason: string | null;
  life: { lines: LifeLine[]; total: string; limit: string; claimable: string };
  health: {
    selfFamily: HealthBucketSummary;
    parents: HealthBucketSummary;
    /** Health policies not yet marked as for you and family, or for parents. */
    unassigned: HealthLine[];
    claimable: string;
  };
  maturity: MaturityCheck[];
}

// ── Calculation ─────────────────────────────────────────────────────

const LIFE_TYPES = new Set(['TERM', 'WHOLE_LIFE', 'ULIP', 'ENDOWMENT']);
/** Life policies that pay out other than on death. */
const MATURITY_TYPES = new Set(['WHOLE_LIFE', 'ULIP', 'ENDOWMENT']);

const ZERO = new Decimal(0);
const money = (d: Decimal) => d.toFixed(2);
const sum = (xs: Decimal[]) => xs.reduce((a, b) => a.plus(b), ZERO);
const d10 = (s: string) => s.slice(0, 10);
const ref = (p: TaxPolicyInput): PolicyRef => ({ policyId: p.id, insurer: p.insurer, planName: p.planName, type: p.type });

function lifeCapPercent(issuedOn: string): number {
  return issuedOn <= '2012-03-31' ? 20 : 10;
}

/** Yearly premium; a single premium is all paid in one year. */
function yearlyPremium(p: TaxPolicyInput): Decimal {
  const amount = new Decimal(p.premiumAmount);
  return p.premiumFrequency === 'SINGLE' ? amount : premiumToAnnual(amount, p.premiumFrequency);
}

/** The Schedule II premium-to-sum-assured limit for a policy issued on `issuedOn`. */
function maturityLimitPercent(issuedOn: string): number | null {
  if (issuedOn < '2003-04-01') return null;
  if (issuedOn <= '2012-03-31') return 20;
  return 10;
}

function aggregateGroup(p: TaxPolicyInput): 'ULIP' | 'OTHER' | null {
  const issued = d10(p.startDate);
  if (p.type === 'ULIP') return issued >= '2021-02-01' ? 'ULIP' : null;
  return issued >= '2023-04-01' ? 'OTHER' : null;
}

/** How much of a health premium falls in `fy` (section 126(8)(b)). */
function healthShare(pay: TaxPaymentInput, fy: FinancialYear): { amount: Decimal; spread: boolean } | null {
  const paidFy = taxYearOf(d10(pay.paidOn));
  const coverEndsFy = taxYearOf(addDaysIso(d10(pay.periodTo), -1));
  const years = int(coverEndsFy.slice(0, 4)) - int(paidFy.slice(0, 4)) + 1;
  const amount = new Decimal(pay.amount);
  // More than a year's cover, paid in one go: an equal share for each tax year it runs in.
  const oneYearOn = `${int(d10(pay.periodFrom).slice(0, 4)) + 1}${d10(pay.periodFrom).slice(4)}`;
  if (d10(pay.periodTo) > oneYearOn && years > 1) {
    const offset = int(fy.fy.slice(0, 4)) - int(paidFy.slice(0, 4));
    if (offset < 0 || offset >= years) return null;
    return { amount: amount.div(years), spread: true };
  }
  return paidFy === fy.fy ? { amount, spread: false } : null;
}

function bucketSummary(bucket: TaxBucket, lines: HealthLine[]): HealthBucketSummary {
  const senior = lines.some((l) => l.seniorCitizen === true);
  const limit = new Decimal(senior ? HEALTH_SENIOR_LIMIT : HEALTH_LIMIT);
  const paid = sum(lines.map((l) => new Decimal(l.paid)));
  return { bucket, limit: money(limit), senior, paid: money(paid), claimable: money(Decimal.min(paid, limit)), lines };
}

function emptySummary(fy: FinancialYear, reason: string): TaxSummary {
  return {
    ...fy,
    covered: false,
    notCoveredReason: reason,
    life: { lines: [], total: '0.00', limit: money(new Decimal(LIFE_DEDUCTION_LIMIT)), claimable: '0.00' },
    health: {
      selfFamily: bucketSummary('SELF_FAMILY', []),
      parents: bucketSummary('PARENTS', []),
      unassigned: [],
      claimable: '0.00',
    },
    maturity: [],
  };
}

export function buildTaxSummary(
  fyLabelIn: string,
  policies: readonly TaxPolicyInput[],
  payments: readonly TaxPaymentInput[],
): TaxSummary {
  const fy = parseFinancialYear(fyLabelIn);
  if (!fy) throw new Error(`Not a financial year: ${fyLabelIn}`);
  if (fy.fy < FIRST_FY_UNDER_2025_ACT) {
    return emptySummary(
      fy,
      'Premiums paid before 1 April 2026 fall under the Income-tax Act, 1961, which this summary doesn’t work out.',
    );
  }

  const inYear = (p: TaxPaymentInput) => d10(p.paidOn) >= fy.from && d10(p.paidOn) <= fy.to;
  const byPolicy = new Map<string, TaxPaymentInput[]>();
  for (const pay of payments) byPolicy.set(pay.policyId, [...(byPolicy.get(pay.policyId) ?? []), pay]);

  // Life — section 123, capped per policy by Schedule XV paragraph 2.
  const lifeLines: LifeLine[] = [];
  for (const p of policies) {
    if (!LIFE_TYPES.has(p.type)) continue;
    const paid = sum((byPolicy.get(p.id) ?? []).filter(inYear).map((x) => new Decimal(x.amount)));
    if (paid.isZero()) continue;
    const capPercent = lifeCapPercent(d10(p.startDate));
    const cap = new Decimal(p.sumAssured).times(capPercent).div(100);
    const eligible = Decimal.min(paid, cap);
    lifeLines.push({
      ...ref(p),
      paid: money(paid),
      capPercent,
      cap: money(cap),
      eligible: money(eligible),
      capped: eligible.lessThan(paid),
    });
  }
  const lifeTotal = sum(lifeLines.map((l) => new Decimal(l.eligible)));
  const lifeLimit = new Decimal(LIFE_DEDUCTION_LIMIT);

  // Health — section 126, by who the cover is for.
  const healthLines: HealthLine[] = [];
  for (const p of policies) {
    if (p.type !== 'HEALTH') continue;
    const shares = (byPolicy.get(p.id) ?? []).map((x) => healthShare(x, fy)).filter((s) => s !== null);
    if (shares.length === 0) continue;
    healthLines.push({
      ...ref(p),
      taxBucket: (TAX_BUCKETS as readonly string[]).includes(p.taxBucket ?? '') ? (p.taxBucket as TaxBucket) : null,
      seniorCitizen: p.seniorCitizen,
      paid: money(sum(shares.map((s) => s.amount))),
      spread: shares.some((s) => s.spread),
    });
  }
  const selfFamily = bucketSummary('SELF_FAMILY', healthLines.filter((l) => l.taxBucket === 'SELF_FAMILY'));
  const parents = bucketSummary('PARENTS', healthLines.filter((l) => l.taxBucket === 'PARENTS'));

  // Tax-free payout — Schedule II, Sl. No. 2.
  const active = policies.filter((p) => p.status === 'ACTIVE' && LIFE_TYPES.has(p.type));
  const aggregate = (group: 'ULIP' | 'OTHER') =>
    sum(active.filter((p) => aggregateGroup(p) === group).map(yearlyPremium));
  const maturity: MaturityCheck[] = active
    .filter((p) => MATURITY_TYPES.has(p.type))
    .map((p) => {
      const sumAssured = new Decimal(p.sumAssured);
      const ratio = sumAssured.isZero() ? new Decimal(100) : yearlyPremium(p).div(sumAssured).times(100);
      const limitPercent = maturityLimitPercent(d10(p.startDate));
      const withinRatio = limitPercent === null || ratio.lessThanOrEqualTo(limitPercent);
      const group = aggregateGroup(p);
      const aggregateLimit = group ? new Decimal(group === 'ULIP' ? ULIP_AGGREGATE_LIMIT : NON_ULIP_AGGREGATE_LIMIT) : null;
      const aggregatePremium = group ? aggregate(group) : null;
      const aggregateOk = !aggregateLimit || !aggregatePremium || aggregatePremium.lessThanOrEqualTo(aggregateLimit);
      return {
        ...ref(p),
        ratioPercent: ratio.toFixed(2),
        limitPercent,
        withinRatio,
        aggregateLimit: aggregateLimit ? money(aggregateLimit) : null,
        aggregatePremium: aggregatePremium ? money(aggregatePremium) : null,
        verdict: withinRatio && aggregateOk ? 'LIKELY_EXEMPT' : 'MAY_BE_TAXABLE',
      };
    });

  return {
    ...fy,
    covered: true,
    notCoveredReason: null,
    life: {
      lines: lifeLines,
      total: money(lifeTotal),
      limit: money(lifeLimit),
      claimable: money(Decimal.min(lifeTotal, lifeLimit)),
    },
    health: {
      selfFamily,
      parents,
      unassigned: healthLines.filter((l) => l.taxBucket === null),
      claimable: money(new Decimal(selfFamily.claimable).plus(parents.claimable)),
    },
    maturity,
  };
}
