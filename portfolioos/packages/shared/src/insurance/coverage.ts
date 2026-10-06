/**
 * Coverage check: "Am I covered enough, and where are the gaps?" — for life,
 * health, vehicles and home.
 *
 * Pure: the API gathers the user's figures (CoverageFacts) and seeds the
 * assumptions from them; the web recomputes on every edit with the same
 * function, so what the page shows and what a test checks cannot drift.
 *
 * Two kinds of statement live here, and they are kept apart on purpose:
 *  - Rules of thumb (10× income, a health-cover benchmark) — labelled as such
 *    wherever they are shown, and always editable.
 *  - The law — only what we verified on an official source, with the page and
 *    the date we checked it (VerifiedRule).
 */
import { Decimal, serializeMoney } from '../decimal.js';
import { formatINR } from '../format/index.js';
import type { OfficialSource } from './claimsGuide.js';

export const COVERAGE_SOURCES_CHECKED_ON = '2026-09-11';

/** A legal rule we quote, where it comes from, and when we last checked it. */
export interface VerifiedRule {
  text: string;
  source: OfficialSource;
  checkedOn: string;
}

export const MOTOR_THIRD_PARTY_RULE: VerifiedRule = {
  text:
    'No one may use a motor vehicle in a public place, or let anyone else use it, unless a third-party ' +
    'insurance policy is in force for it.',
  source: {
    label: 'Motor Vehicles Act, 1988 — section 146, Necessity for insurance against third party risk (India Code)',
    url: 'https://www.indiacode.nic.in/bitstream/123456789/9460/1/a1988-59.pdf',
    where: 'section 146(1), page 75',
  },
  checkedOn: COVERAGE_SOURCES_CHECKED_ON,
};

// ── Rules of thumb ──────────────────────────────────────────────────

/**
 * The rule-of-thumb life cover an earner should carry: ten times annual
 * income. The health score, the family protection view and this page all
 * size cover from this one multiple.
 */
export const LIFE_COVER_INCOME_MULTIPLE = 10;

export function requiredLifeCover(annualIncome: Decimal): Decimal {
  return annualIncome.times(LIFE_COVER_INCOME_MULTIPLE);
}

/** Years the family would need support, before the user says otherwise. */
export const DEFAULT_SUPPORT_YEARS = 20;

/** Health cover to compare against, before the user says otherwise (₹10 lakh). */
export const DEFAULT_HEALTH_BENCHMARK = '1000000';

/** Goals counted towards life cover unless the user unticks them. */
const DEFAULT_GOAL_CATEGORIES: ReadonlySet<string> = new Set(['CHILD_EDUCATION']);

export const RULES_OF_THUMB = {
  lifeMultiple:
    'Ten times your yearly income is a common rule of thumb, not a rule. It ignores your loans, your savings and how long your family would need support.',
  needsBased:
    'An estimate from your own figures: what your family would spend while they need support, plus loans and goals, less the savings you choose to count.',
  supportYears:
    'Roughly how long your family would need your income — for example, until the youngest child finishes studying.',
  healthBenchmark:
    'A rule of thumb, not a regulation. Hospital costs vary a lot by city and hospital, so set a figure that fits yours.',
} as const;

/** What a super top-up is, in general terms — no products, no prices. */
export const SUPER_TOP_UP_EXPLAINER =
  'A super top-up is a separate health policy that pays only once your medical bills in a policy year cross a set amount, called the deductible. ' +
  'Your base policy can pay up to that amount. Because the super top-up only pays above it, it can be a cheaper way to add a lot of cover — compare quotes to see. ' +
  'Check whether the deductible counts all your bills in the year together, or each hospital stay on its own.';

// ── Facts (from the API) and assumptions (editable) ─────────────────

export interface CoverageFigures {
  /** Active income entries, per month. */
  monthlyIncome: string;
  /** Estimated monthly spending; null when we have no spending signal. */
  monthlyExpenses: string | null;
  loansOutstanding: string;
  /** Savings, deposits and other liquid holdings. */
  liquidAssets: string;
  /** Everything else in the portfolio. */
  otherInvestments: string;
  /** Sum assured of active life-type policies. */
  lifeCover: string;
  /** Sum insured of active health policies. */
  healthCover: string;
}

export interface CoverageGoal {
  id: string;
  name: string;
  category: string;
  /** Still to fund. */
  remaining: string;
}

export interface HealthPolicyFact {
  id: string;
  insurer: string;
  planName: string | null;
  sumAssured: string;
  members: string[];
  roomRent: string | null;
  coPay: number | null;
}

export interface VehicleFact {
  id: string;
  label: string;
  registrationNo: string;
  /** From the registration record (Vahan). */
  insuranceExpiry: string | null;
  /** The active motor policy linked to it, if any. */
  motorPolicy: { id: string; insurer: string; endsOn: string | null } | null;
}

export interface PropertyFact {
  id: string;
  name: string;
  kind: 'OWNED' | 'RENTAL';
}

export interface PolicyRef {
  id: string;
  insurer: string;
  planName: string | null;
}

export interface CoverageFacts {
  asOf: string;
  figures: CoverageFigures;
  lifePolicyCount: number;
  goals: CoverageGoal[];
  healthPolicies: HealthPolicyFact[];
  vehicles: VehicleFact[];
  properties: PropertyFact[];
  homePolicies: PolicyRef[];
  lapsed: Array<PolicyRef & { type: string }>;
}

export type ParentsAnswer = 'YES' | 'NO' | 'UNSURE';

export interface CoverageAssumptions {
  annualIncome: string;
  /** Null: use income instead. */
  annualExpenses: string | null;
  supportYears: number;
  loans: string;
  /** Goals to fund from life cover. */
  goalIds: string[];
  countLiquidAssets: boolean;
  countInvestments: boolean;
  healthBenchmark: string;
  parentsDependent: ParentsAnswer;
}

/** GET /api/insurance/coverage */
export type CoverageResponse = CoverageFacts & { defaults: CoverageAssumptions };

// ── Result ──────────────────────────────────────────────────────────

export type CoverageArea = 'LIFE' | 'HEALTH' | 'VEHICLE' | 'HOME';
export type CoverageVerdict = 'COVERED' | 'SHORT' | 'MISSING' | 'NOT_APPLICABLE' | 'UNKNOWN';

export interface NextStep {
  /** ADD_POLICY opens the add-policy form; LINK goes to `to`. */
  kind: 'ADD_POLICY' | 'LINK';
  label: string;
  to: string;
  policyType?: string;
}

export interface CoverageFlag {
  id: string;
  tone: 'neutral' | 'warn' | 'danger';
  text: string;
  next: NextStep | null;
}

export interface AreaCheck {
  area: CoverageArea;
  verdict: CoverageVerdict;
  /** What you have, what you need and the difference (null where it doesn't apply). */
  cover: string | null;
  need: string | null;
  gap: string | null;
  reason: string;
  next: NextStep | null;
  /** Nice to have rather than a gap to close (home). */
  optional?: boolean;
}

export interface LifeCheck extends AreaCheck {
  area: 'LIFE';
  ruleOfThumb: { multiple: number; need: string | null; gap: string | null };
  needsBased: {
    basis: 'EXPENSES' | 'INCOME' | null;
    support: string;
    loans: string;
    goals: string;
    liquidAssets: string;
    investments: string;
    need: string;
    existingCover: string;
    gap: string;
  };
}

export interface HealthCheck extends AreaCheck {
  area: 'HEALTH';
  flags: CoverageFlag[];
}

export type VehicleState = 'COVERED' | 'UNTRACKED' | 'EXPIRED' | 'NONE';

export interface VehicleCheck extends AreaCheck {
  area: 'VEHICLE';
  vehicles: Array<{ id: string; label: string; registrationNo: string; state: VehicleState; text: string; next: NextStep | null }>;
  rule: VerifiedRule;
}

export interface HomeCheck extends AreaCheck {
  area: 'HOME';
}

export interface CoverageReport {
  life: LifeCheck;
  health: HealthCheck;
  vehicle: VehicleCheck;
  home: HomeCheck;
  alsoWorthALook: CoverageFlag[];
}

// ── Helpers ─────────────────────────────────────────────────────────

const ZERO = new Decimal(0);

/** A money string as typed or stored; anything half-typed or negative counts as nothing. */
function amount(v: string | null | undefined): Decimal {
  if (v == null) return ZERO;
  const s = v.replace(/,/g, '').trim();
  return /^\d+(\.\d+)?$/.test(s) ? new Decimal(s) : ZERO;
}

const out = (d: Decimal): string => serializeMoney(d);
const inr = (d: Decimal) => formatINR(d.toString(), { compact: true });

function fmtDay(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const count = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

const TYPE_LABELS: Record<string, string> = {
  TERM: 'Term life',
  WHOLE_LIFE: 'Whole life',
  ULIP: 'ULIP',
  ENDOWMENT: 'Endowment',
  HEALTH: 'Health',
  MOTOR: 'Motor',
  HOME: 'Home',
  TRAVEL: 'Travel',
  PERSONAL_ACCIDENT: 'Personal accident',
};

const policyName = (p: PolicyRef & { type?: string }) =>
  `${p.insurer} — ${p.planName?.trim() || `${TYPE_LABELS[p.type ?? ''] ?? 'Insurance'} policy`}`;

const addPolicy = (label: string, policyType?: string): NextStep => ({
  kind: 'ADD_POLICY',
  label,
  to: '/insurance',
  ...(policyType ? { policyType } : {}),
});

const openPolicy = (id: string, label = 'Open the policy'): NextStep => ({ kind: 'LINK', label, to: `/insurance/${id}` });

// ── Defaults ────────────────────────────────────────────────────────

export function defaultAssumptions(f: CoverageFacts): CoverageAssumptions {
  const expenses = f.figures.monthlyExpenses == null ? null : amount(f.figures.monthlyExpenses).times(12);
  return {
    annualIncome: out(amount(f.figures.monthlyIncome).times(12)),
    annualExpenses: expenses && expenses.greaterThan(0) ? out(expenses) : null,
    supportYears: DEFAULT_SUPPORT_YEARS,
    loans: out(amount(f.figures.loansOutstanding)),
    goalIds: f.goals.filter((g) => DEFAULT_GOAL_CATEGORIES.has(g.category)).map((g) => g.id),
    countLiquidAssets: true,
    countInvestments: true,
    healthBenchmark: DEFAULT_HEALTH_BENCHMARK,
    parentsDependent: 'UNSURE',
  };
}

// ── Life ────────────────────────────────────────────────────────────

function checkLife(f: CoverageFacts, a: CoverageAssumptions): LifeCheck {
  const income = amount(a.annualIncome);
  const expenses = a.annualExpenses == null ? null : amount(a.annualExpenses);
  const useExpenses = expenses !== null && expenses.greaterThan(0);
  const base = useExpenses ? expenses : income;
  const basis = useExpenses ? 'EXPENSES' : income.greaterThan(0) ? 'INCOME' : null;
  const years = Number.isFinite(a.supportYears) ? Math.max(0, Math.floor(a.supportYears)) : 0;

  const support = base.times(years);
  const loans = amount(a.loans);
  const goals = f.goals.filter((g) => a.goalIds.includes(g.id)).reduce((s, g) => s.plus(amount(g.remaining)), ZERO);
  const liquid = a.countLiquidAssets ? amount(f.figures.liquidAssets) : ZERO;
  const investments = a.countInvestments ? amount(f.figures.otherInvestments) : ZERO;
  const need = Decimal.max(ZERO, support.plus(loans).plus(goals).minus(liquid).minus(investments));
  const existing = amount(f.figures.lifeCover);
  const gap = Decimal.max(ZERO, need.minus(existing));

  const rotNeed = income.greaterThan(0) ? requiredLifeCover(income) : null;
  const ruleOfThumb = {
    multiple: LIFE_COVER_INCOME_MULTIPLE,
    need: rotNeed ? out(rotNeed) : null,
    gap: rotNeed ? out(Decimal.max(ZERO, rotNeed.minus(existing))) : null,
  };
  const needsBased = {
    basis: basis as LifeCheck['needsBased']['basis'],
    support: out(support),
    loans: out(loans),
    goals: out(goals),
    liquidAssets: out(liquid),
    investments: out(investments),
    need: out(need),
    existingCover: out(existing),
    gap: out(gap),
  };
  const common = { area: 'LIFE' as const, ruleOfThumb, needsBased, cover: out(existing) };

  if (base.isZero() && loans.isZero() && goals.isZero()) {
    return {
      ...common,
      verdict: 'UNKNOWN',
      need: null,
      gap: null,
      reason: 'Add your income, or your yearly expenses below, to size the life cover your family would need.',
      next: { kind: 'LINK', label: 'Add your income', to: '/income' },
    };
  }
  if (gap.isZero()) {
    return {
      ...common,
      verdict: 'COVERED',
      need: out(need),
      gap: out(gap),
      reason: existing.isZero()
        ? 'On these figures your savings would already cover what your family needs.'
        : `Your life cover of ${inr(existing)} meets the ${inr(need)} your family would need.`,
      next: null,
    };
  }
  if (existing.isZero()) {
    return {
      ...common,
      verdict: 'MISSING',
      need: out(need),
      gap: out(gap),
      reason: `You have no active life cover. On these figures your family would need about ${inr(need)}.`,
      next: addPolicy('Add a term policy', 'TERM'),
    };
  }
  return {
    ...common,
    verdict: 'SHORT',
    need: out(need),
    gap: out(gap),
    reason: `Your family would need about ${inr(need)}. Your cover of ${inr(existing)} leaves you ${inr(gap)} short.`,
    next: addPolicy('Add a term policy', 'TERM'),
  };
}

// ── Health ──────────────────────────────────────────────────────────

const PARENT = /\b(mother|father|parents?|mom|mum|dad|amma|papa|maa|in[- ]laws?)\b/i;

function checkHealth(f: CoverageFacts, a: CoverageAssumptions): HealthCheck {
  const cover = amount(f.figures.healthCover);
  const benchmark = amount(a.healthBenchmark);
  const none = f.healthPolicies.length === 0 || cover.isZero();
  const flags: CoverageFlag[] = [];

  if (none) {
    flags.push({
      id: 'no-health-cover',
      tone: 'danger',
      text: 'You have no health cover on record. A single hospital stay can eat into years of savings.',
      next: addPolicy('Add a health policy', 'HEALTH'),
    });
  }
  for (const p of f.healthPolicies) {
    const name = policyName(p);
    if (p.roomRent) {
      flags.push({
        id: `room-rent:${p.id}`,
        tone: 'warn',
        text:
          `${name} limits room rent (${p.roomRent}). Before picking a costlier room, check the policy wording — ` +
          'some policies then pay less of the whole bill, not just the room.',
        next: openPolicy(p.id),
      });
    }
    if (p.coPay != null && p.coPay > 0) {
      flags.push({
        id: `co-pay:${p.id}`,
        tone: 'warn',
        text: `${name} has a ${p.coPay}% co-pay: you pay ${p.coPay}% of every claim yourself.`,
        next: openPolicy(p.id),
      });
    }
  }
  const parentListed = f.healthPolicies.some((p) => p.members.some((m) => PARENT.test(m)));
  if (a.parentsDependent === 'UNSURE') {
    flags.push({
      id: 'parents',
      tone: 'neutral',
      text: 'Do your parents rely on you for their medical bills? If so, check they have cover of their own or are on one of your policies.',
      next: null,
    });
  } else if (a.parentsDependent === 'YES' && !parentListed) {
    flags.push({
      id: 'parents',
      tone: 'warn',
      text: 'You said your parents rely on you, but none of your health policies list a parent. Check whether they have cover of their own.',
      next: addPolicy('Add their policy', 'HEALTH'),
    });
  }

  const base = { area: 'HEALTH' as const, flags, cover: out(cover), need: out(benchmark) };
  if (none) {
    return {
      ...base,
      verdict: 'MISSING',
      gap: out(benchmark),
      reason: 'You have no active health policy on record.',
      next: addPolicy('Add a health policy', 'HEALTH'),
    };
  }
  if (cover.lessThan(benchmark)) {
    const gap = benchmark.minus(cover);
    return {
      ...base,
      verdict: 'SHORT',
      gap: out(gap),
      reason: `Your health cover of ${inr(cover)} is ${inr(gap)} below the ${inr(benchmark)} you’re comparing it with.`,
      next: addPolicy('Add more health cover', 'HEALTH'),
    };
  }
  return {
    ...base,
    verdict: 'COVERED',
    gap: out(ZERO),
    reason: `Your health cover of ${inr(cover)} meets the ${inr(benchmark)} you’re comparing it with.`,
    next: null,
  };
}

// ── Vehicles ────────────────────────────────────────────────────────

function vehicleRow(v: VehicleFact, today: string): VehicleCheck['vehicles'][number] {
  const row = { id: v.id, label: v.label, registrationNo: v.registrationNo };
  if (v.motorPolicy) {
    const p = v.motorPolicy;
    const dates = [p.endsOn, v.insuranceExpiry].filter((x): x is string => !!x).sort();
    const latest = dates[dates.length - 1] ?? null;
    if (latest && latest < today) {
      return {
        ...row,
        state: 'EXPIRED',
        text: `Insurance ran out on ${fmtDay(latest)}. If you’ve renewed, update the policy; if not, renew it before you drive.`,
        next: openPolicy(p.id, 'Update the policy'),
      };
    }
    return {
      ...row,
      state: 'COVERED',
      text: `Insured with ${p.insurer}${latest ? ` until ${fmtDay(latest)}` : ''}.`,
      next: null,
    };
  }
  if (!v.insuranceExpiry) {
    return { ...row, state: 'NONE', text: 'No motor policy in your locker for this vehicle.', next: addPolicy('Add its motor policy', 'MOTOR') };
  }
  if (v.insuranceExpiry < today) {
    return {
      ...row,
      state: 'EXPIRED',
      text: `Registration records show its insurance ran out on ${fmtDay(v.insuranceExpiry)}.`,
      next: addPolicy('Add the renewed policy', 'MOTOR'),
    };
  }
  return {
    ...row,
    state: 'UNTRACKED',
    text: `Registration records show it’s insured until ${fmtDay(v.insuranceExpiry)}, but the policy isn’t in your locker.`,
    next: addPolicy('Add the policy', 'MOTOR'),
  };
}

function checkVehicles(f: CoverageFacts): VehicleCheck {
  const vehicles = f.vehicles.map((v) => vehicleRow(v, f.asOf));
  const base = { area: 'VEHICLE' as const, vehicles, rule: MOTOR_THIRD_PARTY_RULE, cover: null, need: null, gap: null };
  if (vehicles.length === 0) {
    return { ...base, verdict: 'NOT_APPLICABLE', reason: 'You have no vehicles recorded here.', next: null };
  }
  const flagged = vehicles.filter((v) => v.state === 'NONE' || v.state === 'EXPIRED');
  if (flagged.length > 0) {
    return {
      ...base,
      verdict: 'MISSING',
      reason:
        `${flagged.length} of your ${count(vehicles.length, 'vehicle')} ${flagged.length === 1 ? 'has' : 'have'} no valid insurance on record. ` +
        'Third-party cover is required by law to use a vehicle on public roads.',
      next: flagged[0]!.next,
    };
  }
  return {
    ...base,
    verdict: 'COVERED',
    reason: vehicles.length === 1 ? 'Your vehicle is insured.' : `All ${vehicles.length} of your vehicles are insured.`,
    next: vehicles.find((v) => v.next)?.next ?? null,
  };
}

// ── Home ────────────────────────────────────────────────────────────

function checkHome(f: CoverageFacts): HomeCheck {
  const base = { area: 'HOME' as const, cover: null, need: null, gap: null, optional: true };
  const n = f.properties.length;
  if (n === 0) {
    return { ...base, verdict: 'NOT_APPLICABLE', reason: 'You have no property recorded here.', next: null };
  }
  if (f.homePolicies.length > 0) {
    return {
      ...base,
      verdict: 'COVERED',
      reason: `${count(f.homePolicies.length, 'home policy', 'home policies')} on record for your ${count(n, 'property', 'properties')}.`,
      next: null,
    };
  }
  return {
    ...base,
    verdict: 'MISSING',
    reason:
      `Worth considering: you have ${count(n, 'property', 'properties')} here and no home policy on record. ` +
      'A home policy can cover the building and your belongings against events like fire, flood or burglary.',
    next: addPolicy('Add a home policy', 'HOME'),
  };
}

// ── Everything ──────────────────────────────────────────────────────

export function computeCoverage(f: CoverageFacts, a: CoverageAssumptions): CoverageReport {
  const life = checkLife(f, a);
  const alsoWorthALook: CoverageFlag[] = f.lapsed.map((p) => ({
    id: `lapsed:${p.id}`,
    tone: 'danger',
    text: `${policyName(p)} has lapsed. Ask the insurer whether it can be revived — until then, don’t count on its cover.`,
    next: openPolicy(p.id),
  }));

  const loans = amount(a.loans);
  const existing = amount(f.figures.lifeCover);
  if (loans.greaterThan(0) && existing.lessThan(loans)) {
    alsoWorthALook.push({
      id: 'loans-uncovered',
      tone: 'warn',
      text:
        `Your life cover (${inr(existing)}) doesn’t cover your loans (${inr(loans)}). If something happened to you, ` +
        `your family would have to repay the ${inr(loans.minus(existing))} difference.`,
      next: addPolicy('Add term cover', 'TERM'),
    });
  }

  return {
    life,
    health: checkHealth(f, a),
    vehicle: checkVehicles(f),
    home: checkHome(f),
    alsoWorthALook,
  };
}
