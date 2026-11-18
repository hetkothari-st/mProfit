/**
 * Savings-plan rules: endowment, money-back, whole life and ULIP (all
 * deterministic, no I/O).
 *
 * Same contract as the health and term rules: a finding cites evidence and says
 * what would change it, an unknown field produces NO finding (unknown is not
 * absent), and nothing is assumed from what other plans usually contain.
 *
 * Reference points (general summaries, not legal or tax advice):
 *  - Section 10(10D), Income-tax Act: maturity proceeds are tax-free only if
 *    the sum assured is high enough against the annual premium (10x for
 *    policies issued on or after 1 April 2012) and premium limits are met.
 *  - IRDAI linked-insurance rules: ULIPs carry a 5-year lock-in and an annual
 *    fund management charge capped at 1.35%.
 *  - Return thresholds and allocation-charge thresholds are display
 *    heuristics, named as such in the finding text, not regulatory limits.
 */

import { Decimal, formatINR } from '@everypaisa/shared';
import type { PolicyEvidence, PolicyFindingDTO } from '@everypaisa/shared';
import { makePolicyFinding, type SavingsAnalysisFacts, type SavingsRule } from '../types.js';
import { documentsConflictsRule } from './documents.conflicts.js';
import { guaranteedReturn, planTerms } from '../savingsReturn.js';

/** Indian-grouped rupees, no paise: 750000 becomes ₹7,50,000. */
const inr = (v: string | number): string => formatINR(String(v), { fractionDigits: 0 });

type F<T> =
  | { value: T | null; confidence: number; sourceDocId: string | null; sourcePage: number | null; clauseHeading: string | null; status: string }
  | undefined;

function known<T>(f: F<T>): f is NonNullable<F<T>> & { value: T } {
  return !!f && f.status !== 'NOT_FOUND' && f.value !== null && f.value !== undefined;
}

function ev(f: NonNullable<F<unknown>>, text: string, heading: string): PolicyEvidence {
  return { docId: f.sourceDocId ?? '', page: f.sourcePage ?? 1, clauseHeading: f.clauseHeading ?? heading, extractedText: text };
}

const conf = (...fs: Array<NonNullable<F<unknown>>>) => String(Math.min(...fs.map((f) => f.confidence)));

function mk(
  facts: SavingsAnalysisFacts,
  ruleId: string,
  version: string,
  p: Pick<PolicyFindingDTO, 'code' | 'category' | 'severity' | 'headline' | 'evidence' | 'whatWouldChangeThis'> & { confidence: string },
): PolicyFindingDTO {
  return makePolicyFinding(facts, { ruleId, ruleVersion: version, ...p });
}

function pctOf(f: F<string | null>): Decimal | null {
  if (!known(f)) return null;
  try {
    const d = new Decimal(String(f.value).replace('%', '').trim());
    return d.isFinite() && d.gte(0) ? d : null;
  } catch {
    return null;
  }
}

function moneyOf(f: F<string | null>): Decimal | null {
  if (!known(f)) return null;
  try {
    const d = new Decimal(String(f.value));
    return d.isFinite() && d.gte(0) ? d : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// What the policy returns
// ---------------------------------------------------------------------------

const returnsRule: SavingsRule = {
  id: 'savings.returns',
  version: '1.0.0',
  category: 'RETURNS',
  evaluate(facts) {
    const x = facts.extraction;
    const k = facts.constants;
    const out: PolicyFindingDTO[] = [];

    const maturity = x.maturityBenefitGuaranteedInr as F<string | null>;
    const premium = x.premiumAmountInr as F<string>;
    const r = guaranteedReturn(x);
    if (r !== null && known(maturity) && known(premium)) {
      const p = r * 100;
      const severity = p < k.lowReturnPct ? 'WARNING' : p < k.okReturnPct ? 'NOTICE' : 'INFO';
      const code = severity === 'WARNING' ? 'LOW_GUARANTEED_RETURN' : severity === 'NOTICE' ? 'MODEST_GUARANTEED_RETURN' : 'GUARANTEED_RETURN_OK';
      out.push(
        mk(facts, this.id, this.version, {
          code, category: 'RETURNS', severity,
          confidence: conf(maturity, premium),
          headline: `Guaranteed return is about ${p.toFixed(1)}% a year`,
          evidence: [
            ev(maturity, `Guaranteed maturity benefit: ${inr(String(maturity.value))}`, 'Maturity benefit'),
            ev(premium, `Annual premium: ${inr(String(premium.value))}`, 'Premium'),
          ],
          whatWouldChangeThis:
            severity === 'INFO'
              ? 'Nothing to change. This counts only the guaranteed amount; bonuses, if any, add to it.'
              : `Counting only guaranteed amounts, the premiums grow at about ${p.toFixed(1)}% a year, ` +
                `below ${severity === 'WARNING' ? k.lowReturnPct : k.okReturnPct}% (a display threshold in this tool, not a regulatory figure). ` +
                'Bonuses could raise it. Ask the insurer for the full benefit illustration and compare it with a fixed deposit and a term plan plus separate investing.',
        }),
      );
    }

    const part = x.participating as F<boolean>;
    if (facts.planKind === 'TRADITIONAL' && known(part) && part.value === true && !known(maturity)) {
      out.push(
        mk(facts, this.id, this.version, {
          code: 'MATURITY_DEPENDS_ON_BONUS', category: 'RETURNS', severity: 'NOTICE', confidence: String(part.confidence),
          headline: 'Maturity amount depends on bonuses, which are not guaranteed',
          evidence: [ev(part, 'Participating (with-profits) plan; no guaranteed maturity amount stated', 'Bonus')],
          whatWouldChangeThis:
            'Bonuses are declared year by year and can be lower than the illustration. Ask the insurer for the bonus history of this plan and compare it against the illustrated figures.',
        }),
      );
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Life cover against premium
// ---------------------------------------------------------------------------

const coverRatioRule: SavingsRule = {
  id: 'savings.cover-ratio',
  version: '1.0.0',
  category: 'COVERAGE',
  evaluate(facts) {
    const x = facts.extraction;
    const sa = moneyOf(x.sumAssured as F<string | null>);
    const prem = moneyOf(x.premiumAmountInr as F<string | null>);
    if (!sa || !prem || prem.isZero()) return [];
    const saF = x.sumAssured as NonNullable<F<unknown>>;
    const premF = x.premiumAmountInr as NonNullable<F<unknown>>;
    const ratio = sa.div(prem);
    const min = facts.constants.minCoverMultiple;
    const low = ratio.lt(min);
    return [
      mk(facts, this.id, this.version, {
        code: low ? 'LOW_COVER_MULTIPLE' : 'COVER_MULTIPLE_OK',
        category: 'COVERAGE', severity: low ? 'WARNING' : 'INFO', confidence: conf(saF, premF),
        headline: `Life cover is ${ratio.toDecimalPlaces(1).toString()}x the annual premium`,
        evidence: [
          ev(saF, `Sum assured: ${inr(sa.toFixed(0))}`, 'Sum assured'),
          ev(premF, `Annual premium: ${inr(prem.toFixed(0))}`, 'Premium'),
        ],
        whatWouldChangeThis: low
          ? `Cover under ${min}x the annual premium is low, and may mean the maturity proceeds are not tax-free under Section 10(10D) ` +
            '(the 10x test applies to policies issued on or after 1 April 2012). Check with a tax adviser. ' +
            'If protection is the goal, a term plan gives far more cover for the same premium.'
          : 'Nothing to change. This is a savings plan, so its cover is still far smaller than a term plan of the same premium would give.',
      }),
    ];
  },
};

// ---------------------------------------------------------------------------
// Getting your money out
// ---------------------------------------------------------------------------

const liquidityRule: SavingsRule = {
  id: 'savings.liquidity',
  version: '1.0.0',
  category: 'LIQUIDITY',
  evaluate(facts) {
    const x = facts.extraction;
    const k = facts.constants;
    const out: PolicyFindingDTO[] = [];

    if (facts.planKind === 'TRADITIONAL') {
      const yr = x.guaranteedSurrenderFromYear as F<number>;
      if (known(yr)) {
        const late = yr.value > k.lateSurrenderYear;
        out.push(
          mk(facts, this.id, this.version, {
            code: late ? 'LATE_SURRENDER_VALUE' : 'SURRENDER_VALUE_EARLY_ENOUGH', category: 'LIQUIDITY',
            severity: late ? 'NOTICE' : 'INFO', confidence: String(yr.confidence),
            headline: `Guaranteed surrender value starts after policy year ${yr.value}`,
            evidence: [ev(yr, `Guaranteed surrender value from policy year ${yr.value}`, 'Surrender value')],
            whatWouldChangeThis: late
              ? 'Leaving before that year may return little or nothing of what you paid. Be sure you can keep paying for at least that long.'
              : 'Nothing to change. The surrender value is usually a fraction of premiums paid in the early years, so ask the insurer for the exact figure before exiting.',
          }),
        );
      }
      const loan = x.loanAvailable as F<boolean>;
      if (known(loan) && loan.value === true) {
        out.push(
          mk(facts, this.id, this.version, {
            code: 'LOAN_AVAILABLE', category: 'LIQUIDITY', severity: 'INFO', confidence: String(loan.confidence),
            headline: 'A loan against the policy is available',
            evidence: [ev(loan, 'Loan against the policy is available', 'Loans')],
            whatWouldChangeThis: 'Nothing to change. A loan is usually a better first step than surrendering if you need cash, but check its interest rate.',
          }),
        );
      }
    } else {
      const lock = x.lockInYears as F<number>;
      if (known(lock)) {
        const short = lock.value < k.ulipLockInYears;
        out.push(
          mk(facts, this.id, this.version, {
            code: short ? 'ULIP_LOCK_IN_SHORT' : 'ULIP_LOCK_IN', category: 'LIQUIDITY',
            severity: short ? 'NOTICE' : 'INFO', confidence: String(lock.confidence),
            headline: `Locked in for ${lock.value} years`,
            evidence: [ev(lock, `Lock-in period: ${lock.value} years`, 'Lock-in')],
            whatWouldChangeThis: short
              ? `IRDAI requires a ${k.ulipLockInYears}-year lock-in on ULIPs. Check the wording or ask the insurer which figure applies.`
              : 'Nothing to change. You cannot surrender or withdraw during the lock-in, and exits soon after it can still carry charges.',
          }),
        );
      }
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// ULIP charges
// ---------------------------------------------------------------------------

const ulipChargesRule: SavingsRule = {
  id: 'savings.ulip-charges',
  version: '1.0.0',
  category: 'CHARGES',
  evaluate(facts) {
    if (facts.planKind !== 'ULIP') return [];
    const x = facts.extraction;
    const k = facts.constants;
    const out: PolicyFindingDTO[] = [];

    const fmcF = x.fundManagementChargePct as F<string | null>;
    const fmc = pctOf(fmcF);
    if (fmc && known(fmcF)) {
      const over = fmc.gt(k.ulipFmcCapPct);
      out.push(
        mk(facts, this.id, this.version, {
          code: over ? 'FMC_ABOVE_CAP' : 'FMC_WITHIN_CAP', category: 'CHARGES',
          severity: over ? 'WARNING' : 'INFO', confidence: String(fmcF.confidence),
          headline: over
            ? `Fund management charge of ${fmc.toString()}% is above the ${k.ulipFmcCapPct}% cap`
            : `Fund management charge of ${fmc.toString()}% a year`,
          evidence: [ev(fmcF, `Fund management charge: ${fmc.toString()}%`, 'Charges')],
          whatWouldChangeThis: over
            ? 'IRDAI caps this charge at 1.35% a year. Check the wording, the figure may be for a different fund or a misread, and ask the insurer to confirm.'
            : 'Nothing to change. This charge is taken from the fund every year, so even 1% compounds to a large amount over 15-20 years. A direct index or mutual fund SIP typically costs far less.',
        }),
      );
    }

    const allocF = x.premiumAllocationChargePct as F<string | null>;
    const alloc = pctOf(allocF);
    if (alloc && known(allocF)) {
      const sev = alloc.gt(k.allocationWarnPct) ? 'WARNING' : alloc.gt(k.allocationNoticePct) ? 'NOTICE' : 'INFO';
      out.push(
        mk(facts, this.id, this.version, {
          code: sev === 'WARNING' ? 'ALLOCATION_CHARGE_HIGH' : sev === 'NOTICE' ? 'ALLOCATION_CHARGE_NOTABLE' : 'ALLOCATION_CHARGE_LOW',
          category: 'CHARGES', severity: sev, confidence: String(allocF.confidence),
          headline: `${alloc.toString()}% of the first-year premium is deducted as allocation charge`,
          evidence: [ev(allocF, `First-year premium allocation charge: ${alloc.toString()}%`, 'Charges')],
          whatWouldChangeThis:
            sev === 'INFO'
              ? 'Nothing to change.'
              : `Only the rest of each early premium is invested. Charges above ${sev === 'WARNING' ? k.allocationWarnPct : k.allocationNoticePct}% in year one ` +
                'are flagged as high by this tool (a display threshold, not a regulatory limit). Ask for the year-by-year charge table.',
        }),
      );
    }

    const basis = x.ulipDeathBenefitBasis as F<string>;
    if (known(basis)) {
      const higher = /HIGHER/i.test(basis.value);
      out.push(
        mk(facts, this.id, this.version, {
          code: higher ? 'ULIP_DEATH_BENEFIT_HIGHER_OF' : 'ULIP_DEATH_BENEFIT_PLUS_FUND', category: 'COVERAGE',
          severity: higher ? 'NOTICE' : 'INFO', confidence: String(basis.confidence),
          headline: higher ? 'Death benefit is the higher of cover or fund value, not both' : 'Death benefit pays cover plus the fund value',
          evidence: [ev(basis, `Death benefit basis: ${basis.value}`, 'Death benefit')],
          whatWouldChangeThis: higher
            ? 'As the fund grows, the extra cover on top of it shrinks. If protection matters, check that the sum assured alone is enough, or add a term plan.'
            : 'Nothing to change.',
        }),
      );
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Claim terms
// ---------------------------------------------------------------------------

const claimTermsRule: SavingsRule = {
  id: 'savings.claim-terms',
  version: '1.0.0',
  category: 'CLAIM_TERMS',
  evaluate(facts) {
    const x = facts.extraction;
    const k = facts.constants;
    const out: PolicyFindingDTO[] = [];

    const sui = x.suicideExclusionMonths as F<number>;
    if (known(sui)) {
      const long = sui.value > k.standardSuicideMonths;
      out.push(
        mk(facts, this.id, this.version, {
          code: long ? 'SUICIDE_EXCLUSION_LONG' : 'SUICIDE_EXCLUSION_STANDARD', category: 'CLAIM_TERMS',
          severity: long ? 'WARNING' : 'INFO', confidence: String(sui.confidence),
          headline: long
            ? `Suicide exclusion runs ${sui.value} months, longer than the usual ${k.standardSuicideMonths}`
            : `Suicide exclusion of ${sui.value} months`,
          evidence: [ev(sui, `Suicide exclusion: ${sui.value} months`, 'Suicide clause')],
          whatWouldChangeThis: long
            ? 'A longer exclusion leaves your family unprotected for longer. Compare with plans that use the standard 12 months.'
            : 'Nothing to change.',
        }),
      );
    }

    const grace = x.gracePeriodDays as F<number>;
    if (known(grace)) {
      const freq = x.premiumFrequency as F<string>;
      const monthly = known(freq) && /month/i.test(freq.value);
      const min = monthly || !known(freq) ? k.minGraceMonthlyDays : k.minGraceDays;
      const short = grace.value < min;
      out.push(
        mk(facts, this.id, this.version, {
          code: short ? 'GRACE_PERIOD_SHORT' : 'GRACE_PERIOD_OK', category: 'CLAIM_TERMS',
          severity: short ? 'WARNING' : 'INFO', confidence: String(grace.confidence),
          headline: short ? `Grace period of ${grace.value} days is shorter than the ${min}-day minimum` : `Grace period of ${grace.value} days`,
          evidence: [ev(grace, `Grace period: ${grace.value} days`, 'Grace period')],
          whatWouldChangeThis: short
            ? 'IRDAI sets a minimum grace period. Check the wording, and pay early or set up auto-debit so the policy cannot lapse.'
            : 'Nothing to change. Set up auto-debit so a missed date cannot lapse the policy.',
        }),
      );
    }

    const nom = x.nomineePresent as F<boolean>;
    if (known(nom)) {
      const has = nom.value === true;
      out.push(
        mk(facts, this.id, this.version, {
          code: has ? 'NOMINEE_RECORDED' : 'NO_NOMINEE', category: 'CLAIM_TERMS',
          severity: has ? 'INFO' : 'WARNING', confidence: String(nom.confidence),
          headline: has ? 'A nominee is recorded' : 'No nominee is recorded in the documents',
          evidence: [ev(nom, `Nominee recorded: ${has ? 'yes' : 'no'}`, 'Nomination')],
          whatWouldChangeThis: has
            ? 'Nothing to change. Keep nominee details current after marriage or birth.'
            : 'Without a nominee, a claim can be delayed while your legal heirs prove their right. Add a nominee through the insurer.',
        }),
      );
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Premium commitment
// ---------------------------------------------------------------------------

const commitmentRule: SavingsRule = {
  id: 'savings.commitment',
  version: '1.0.0',
  category: 'PREMIUM',
  evaluate(facts) {
    const t = planTerms(facts.extraction);
    if (!t) return [];
    const premF = facts.extraction.premiumAmountInr as NonNullable<F<unknown>>;
    const termF = facts.extraction.policyTermYears as NonNullable<F<unknown>>;
    const total = t.premium.mul(t.premiumYears);
    return [
      mk(facts, this.id, this.version, {
        code: 'PREMIUM_COMMITMENT', category: 'PREMIUM', severity: 'INFO', confidence: conf(premF, termF),
        headline: `You commit about ${inr(total.toFixed(0))} in premiums over ${t.premiumYears} years`,
        evidence: [
          ev(premF, `Annual premium: ${inr(t.premium.toFixed(0))}`, 'Premium'),
          ev(termF, `Policy term: ${t.termYears} years; premiums for ${t.premiumYears}`, 'Policy term'),
        ],
        whatWouldChangeThis: 'Nothing to change. Stopping early usually costs you, so plan to keep paying for the full premium term.',
      }),
    ];
  },
};

export const SAVINGS_RULES: SavingsRule[] = [
  returnsRule,
  coverRatioRule,
  liquidityRule,
  ulipChargesRule,
  claimTermsRule,
  commitmentRule,
  documentsConflictsRule as unknown as SavingsRule,
];
