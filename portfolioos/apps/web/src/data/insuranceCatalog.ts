// Catalog of widely-sold Indian insurance products. Each entry's `brochureUrl`
// points to the insurer's official product page where the latest brochure can
// be downloaded — direct PDF URLs change frequently, the product page is more
// stable. Coverage / exclusions text is summarised from publicly published
// product brochures and IRDAI filings; verify against the live brochure for
// exact contractual terms.

export type CatalogPolicyType =
  | 'TERM'
  | 'WHOLE_LIFE'
  | 'ULIP'
  | 'ENDOWMENT'
  | 'HEALTH'
  | 'MOTOR'
  | 'HOME'
  | 'TRAVEL'
  | 'PERSONAL_ACCIDENT';

export interface CatalogProduct {
  id: string;
  insurer: string;
  planName: string;
  type: CatalogPolicyType;
  /** One- or two-sentence elevator pitch. */
  description: string;
  /** Bulleted highlight features. Concise, factual. */
  keyCoverage: string[];
  /** Common exclusions — non-exhaustive, contract is authoritative. */
  exclusions?: string[];
  /** Short marketing-friendly highlights. */
  highlights?: string[];
  /** Sum-assured guidance. Free text — varies by buyer profile. */
  sumAssuredRange?: string;
  /** Eligible age band, if commonly published. */
  ageBand?: string;
  /** Policy term band, if applicable. */
  policyTermYears?: string;
  /** Insurer's official product page (preferred over direct PDF — survives URL changes). */
  brochureUrl: string;
}

export const INSURANCE_CATALOG: readonly CatalogProduct[] = [
  // ── Term life ────────────────────────────────────────────────────────
  {
    id: 'lic-tech-term',
    insurer: 'LIC',
    planName: 'Tech Term',
    type: 'TERM',
    description:
      'Online-only pure term plan from LIC of India offering large sum assured at low premiums. Pays the full sum assured to nominees on death during the policy term.',
    keyCoverage: [
      'Death benefit equal to chosen sum assured',
      'Two benefit options: Level Sum Assured or Increasing Sum Assured',
      'Optional Accident Benefit Rider',
      'Income tax deduction under Section 80C and tax-free death proceeds under Section 10(10D)',
    ],
    exclusions: [
      'Suicide within first 12 policy months (only premiums paid are returned)',
    ],
    highlights: ['Pure protection', 'Low premium for high cover', 'Direct online purchase'],
    sumAssuredRange: '₹50 lakh – ₹40 crore',
    ageBand: '18–65 years',
    policyTermYears: '10–40',
    brochureUrl: 'https://licindia.in/products/insurance-plan/lic-s-tech-term',
  },
  {
    id: 'hdfc-life-click2protect-super',
    insurer: 'HDFC Life',
    planName: 'Click 2 Protect Super',
    type: 'TERM',
    description:
      'Comprehensive term insurance with three plan options — Life, Life Plus, Life Goal — and optional return of premium on survival.',
    keyCoverage: [
      'Death benefit pays full sum assured to nominee',
      'Critical Illness add-on (Life Plus) covers 60+ illnesses',
      'Accidental death add-on for double benefit',
      'Optional Return of Premium variant',
      'WOP on Critical Illness / Disability waives future premiums',
    ],
    exclusions: ['Suicide within 12 months from issue / revival'],
    highlights: ['Multiple plan variants', 'Top-up sum assured at life events', 'Tax-free payout'],
    sumAssuredRange: '₹50 lakh – ₹20 crore',
    ageBand: '18–65 years',
    policyTermYears: '5–85 minus age',
    brochureUrl:
      'https://www.hdfclife.com/term-insurance-plans/click-2-protect-super-term-plan',
  },
  {
    id: 'icici-pru-iprotect-smart',
    insurer: 'ICICI Prudential Life',
    planName: 'iProtect Smart',
    type: 'TERM',
    description:
      'Pure term plan with multiple benefit options, optional critical-illness cover for 34 illnesses and an accidental death rider.',
    keyCoverage: [
      'Lump-sum death benefit',
      'Critical Illness cover for 34 conditions (optional)',
      'Accidental Death Benefit (optional)',
      'Income payout option in lieu of lump sum',
      'Premium waiver on permanent disability',
    ],
    exclusions: ['Suicide within first 12 policy months'],
    sumAssuredRange: '₹25 lakh – above',
    ageBand: '18–65 years',
    policyTermYears: '5–40',
    brochureUrl: 'https://www.iciciprulife.com/term-insurance-plans/iprotect-smart.html',
  },
  {
    id: 'max-life-smart-secure-plus',
    insurer: 'Max Life Insurance',
    planName: 'Smart Secure Plus',
    type: 'TERM',
    description:
      'Term plan offering pure protection with optional Return of Premium, Accelerated Critical Illness and Accidental Death add-ons.',
    keyCoverage: [
      'Death benefit to nominees',
      'Return of Premium option on survival',
      'Joint life cover for spouse',
      'Special exit value at specified ages',
      'Cover continuation after premium-paying term',
    ],
    sumAssuredRange: '₹25 lakh and above',
    ageBand: '18–65 years',
    policyTermYears: '10–67 minus age',
    brochureUrl: 'https://www.maxlifeinsurance.com/term-insurance-plans/smart-secure-plus-plan',
  },
  {
    id: 'bajaj-allianz-etouch-life',
    insurer: 'Bajaj Allianz Life',
    planName: 'eTouch II',
    type: 'TERM',
    description:
      'Online-purchase term plan with three coverage variants and waiver-of-premium benefits on disability or critical illness.',
    keyCoverage: [
      'Sum assured paid as lump sum on death',
      'Waiver of Premium on Accidental Permanent Total Disability',
      'Critical Illness benefit (optional)',
      'Increase cover on key life-stage events',
    ],
    sumAssuredRange: '₹50 lakh – ₹20 crore',
    ageBand: '18–65 years',
    policyTermYears: '10–40',
    brochureUrl: 'https://www.bajajallianzlife.com/life-insurance-plans/term-insurance/etouch-ii.html',
  },

  // ── Health ───────────────────────────────────────────────────────────
  {
    id: 'hdfc-ergo-optima-secure',
    insurer: 'HDFC ERGO',
    planName: 'Optima Secure',
    type: 'HEALTH',
    description:
      'Indemnity health plan with secure benefit (auto 100% sum insured boost), plus benefit (50% restore) and protect benefit (covers many non-payable items).',
    keyCoverage: [
      'In-patient hospitalisation, ICU, day-care procedures',
      'Pre-hospitalisation 60 days, post-hospitalisation 180 days',
      'Secure Benefit: 100% sum insured added from day one',
      'Plus Benefit: 50% bonus added every two policy years',
      'Protect Benefit: covers items normally non-payable (e.g. consumables)',
      'Restore Benefit: full sum insured restored after a claim',
      'No room-rent capping',
    ],
    exclusions: [
      'Pre-existing diseases waiting period (typically 36 months)',
      'Cosmetic / experimental treatments',
      'Self-inflicted injury, war, intoxication',
    ],
    sumAssuredRange: '₹5 lakh – ₹2 crore',
    ageBand: 'Adult 18–65 (lifelong renewal); Child 91 days–25 years',
    brochureUrl: 'https://www.hdfcergo.com/health-insurance/optima-secure',
  },
  {
    id: 'niva-bupa-reassure-2',
    insurer: 'Niva Bupa',
    planName: 'ReAssure 2.0',
    type: 'HEALTH',
    description:
      'Comprehensive health indemnity with unlimited reset of base sum insured (ReAssure Forever), Lock the Clock and Booster+ benefits.',
    keyCoverage: [
      'Hospitalisation, ICU, day-care, AYUSH treatment',
      'ReAssure Forever: base sum insured reinstated unlimited times for unrelated claims',
      'Booster+: unutilised cover carried forward up to multiple of base SI',
      'Lock the Clock: entry age frozen for premium calculation',
      'No claim-based loading',
      'Direct claim settlement with hospital network',
    ],
    exclusions: [
      'Standard 30-day initial waiting period (except accidents)',
      'Specified disease waiting (24 months)',
      'Pre-existing diseases waiting (typically 36 months)',
    ],
    sumAssuredRange: '₹3 lakh – ₹1 crore',
    ageBand: '18+ (lifelong renewal)',
    brochureUrl: 'https://www.nivabupa.com/health-insurance-plans/reassure-2-0.html',
  },
  {
    id: 'star-health-comprehensive',
    insurer: 'Star Health',
    planName: 'Comprehensive',
    type: 'HEALTH',
    description:
      'Family-floater indemnity covering in-patient and a wide range of outpatient consultation, dental and ophthalmic benefits.',
    keyCoverage: [
      'Hospitalisation expenses including pre-/post-hospitalisation',
      'Out-patient consultation, dental, ophthalmic limits',
      'Air ambulance and second medical opinion',
      'Maternity expenses (after 24-month waiting)',
      'Newborn baby cover from day 16',
      'Bonus increase in sum insured for claim-free years',
    ],
    exclusions: [
      'Pre-existing disease waiting (36 months)',
      'Cosmetic surgery, weight-loss treatments',
      'War, nuclear and self-inflicted injury',
    ],
    sumAssuredRange: '₹5 lakh – ₹1 crore',
    ageBand: '18–65 years (renewal lifelong)',
    brochureUrl: 'https://www.starhealth.in/health-insurance/star-comprehensive-insurance-policy',
  },
  {
    id: 'care-health-care-plus',
    insurer: 'Care Health Insurance',
    planName: 'Care',
    type: 'HEALTH',
    description:
      'Indemnity health plan with no-claim bonus, automatic recharge of sum insured and value-added care management benefits.',
    keyCoverage: [
      'In-patient hospitalisation including ICU, day-care, AYUSH',
      'Pre-hospitalisation 30 / 60 days; post 60 / 180 days',
      'Automatic recharge of sum insured for unrelated claim',
      'No claim bonus increases sum insured up to 150 %',
      'Annual health check-up',
    ],
    exclusions: [
      'Initial 30-day waiting period (accidents excluded)',
      'Pre-existing disease waiting period',
      'Conditions excluded by policy terms (e.g. cosmetic)',
    ],
    sumAssuredRange: '₹3 lakh – ₹6 crore',
    brochureUrl: 'https://www.careinsurance.com/health-insurance-plans/care-health-insurance.html',
  },
  {
    id: 'icici-lombard-complete-health',
    insurer: 'ICICI Lombard',
    planName: 'Complete Health Insurance',
    type: 'HEALTH',
    description:
      'Comprehensive health indemnity offering wellness rewards, no-room-rent sub-limit on certain plans and modular add-ons.',
    keyCoverage: [
      'Hospitalisation, day-care procedures, AYUSH',
      'Pre/post hospitalisation cover',
      'Maternity benefit (after waiting period, on selected plans)',
      'Wellness program with discounts on renewal',
      'Domiciliary hospitalisation',
    ],
    exclusions: ['Pre-existing waiting period', 'Specified illness waiting period (varies)'],
    sumAssuredRange: '₹3 lakh – ₹50 lakh',
    brochureUrl: 'https://www.icicilombard.com/health-insurance/complete-health-insurance',
  },

  // ── Motor ────────────────────────────────────────────────────────────
  {
    id: 'icici-lombard-private-car-package',
    insurer: 'ICICI Lombard',
    planName: 'Private Car Package',
    type: 'MOTOR',
    description:
      'Comprehensive private-car package covering own-damage and unlimited third-party liability, with optional add-ons.',
    keyCoverage: [
      'Own damage from accident, fire, flood, theft',
      'Third-party bodily injury / property damage (statutory)',
      'Personal accident cover for owner-driver',
      'Optional zero-depreciation, engine protect, return-to-invoice',
      'Cashless garage network',
    ],
    exclusions: [
      'Driving under influence, no valid licence',
      'Consequential losses, mechanical / electrical breakdown',
      'Damage outside India',
    ],
    brochureUrl: 'https://www.icicilombard.com/motor-insurance/car-insurance',
  },
  {
    id: 'bajaj-allianz-car-comprehensive',
    insurer: 'Bajaj Allianz',
    planName: 'Car Insurance — Comprehensive',
    type: 'MOTOR',
    description:
      'Comprehensive private-car insurance with own-damage + third-party cover, NCB protection and a 24×7 claim helpline.',
    keyCoverage: [
      'Own damage (accident, theft, fire, natural calamity)',
      'Third-party liability (mandatory under MV Act)',
      'Personal accident cover for owner-driver up to ₹15 lakh',
      'Optional NCB protect, depreciation shield, key replacement',
    ],
    brochureUrl: 'https://www.bajajallianz.com/motor-insurance-online/car-insurance.html',
  },
  {
    id: 'hdfc-ergo-private-car',
    insurer: 'HDFC ERGO',
    planName: 'Private Car Insurance',
    type: 'MOTOR',
    description:
      'Comprehensive car policy covering damage, theft, third-party liability and a wide network of cashless garages.',
    keyCoverage: [
      'Own damage and third-party liability',
      'Personal accident cover for owner-driver',
      'Add-ons: zero-dep, engine, RTI, NCB protect, consumables',
      'Cashless claim at network garages',
    ],
    brochureUrl: 'https://www.hdfcergo.com/motor-insurance/car-insurance',
  },
  {
    id: 'tata-aig-auto-secure',
    insurer: 'TATA AIG',
    planName: 'Auto Secure Private Car Package',
    type: 'MOTOR',
    description:
      'Private car package policy with own-damage and TP cover, multiple add-ons including hydrostatic lock cover.',
    keyCoverage: [
      'Own damage, theft, fire',
      'Third-party liability',
      'Owner-driver personal accident cover',
      'Add-ons including engine secure, depreciation reimbursement, daily allowance',
    ],
    brochureUrl: 'https://www.tataaig.com/car-insurance',
  },

  // ── Travel ───────────────────────────────────────────────────────────
  {
    id: 'icici-lombard-international-travel',
    insurer: 'ICICI Lombard',
    planName: 'International Travel Insurance',
    type: 'TRAVEL',
    description:
      'Single-trip and multi-trip plans covering medical emergencies, baggage loss, trip delay/cancellation and personal liability while abroad.',
    keyCoverage: [
      'Medical and hospitalisation expenses overseas',
      'Emergency dental treatment',
      'Loss of checked baggage / passport',
      'Trip delay / cancellation / interruption',
      'Personal liability cover',
      'Optional adventure-sports cover',
    ],
    exclusions: ['Pre-existing conditions (except life-threatening)', 'War / nuclear', 'Self-inflicted injury'],
    brochureUrl: 'https://www.icicilombard.com/travel-insurance',
  },
  {
    id: 'hdfc-ergo-international-travel',
    insurer: 'HDFC ERGO',
    planName: 'International Travel Insurance',
    type: 'TRAVEL',
    description:
      'Travel insurance with worldwide medical cover, baggage and trip-related contingencies for individual and family travellers.',
    keyCoverage: [
      'Emergency medical and dental cover overseas',
      'Loss of passport / baggage',
      'Personal accident cover',
      'Trip cancellation / delay',
      'Hijack distress allowance',
    ],
    brochureUrl: 'https://www.hdfcergo.com/travel-insurance',
  },

  // ── Home ─────────────────────────────────────────────────────────────
  {
    id: 'hdfc-ergo-home-shield',
    insurer: 'HDFC ERGO',
    planName: 'Home Shield Insurance',
    type: 'HOME',
    description:
      'Home insurance covering structure and contents against fire, flood, earthquake, burglary and other named perils.',
    keyCoverage: [
      'Building structure cover (re-instatement value basis)',
      'Contents cover for general household items',
      'Burglary and theft cover',
      'Earthquake and terrorism cover (with extension)',
      'Optional jewellery and valuables endorsement',
    ],
    brochureUrl: 'https://www.hdfcergo.com/home-insurance',
  },
  {
    id: 'bajaj-allianz-my-home-insurance',
    insurer: 'Bajaj Allianz',
    planName: 'My Home Insurance',
    type: 'HOME',
    description:
      'Comprehensive home insurance covering structure and contents with multiple optional covers for tenants and owners.',
    keyCoverage: [
      'Building structure cover',
      'Contents cover including electronic appliances',
      'Public liability for tenants',
      'Burglary and home loss',
    ],
    brochureUrl:
      'https://www.bajajallianz.com/home-insurance/my-home-all-risk-insurance-policy.html',
  },

  // ── Endowment / ULIP ─────────────────────────────────────────────────
  {
    id: 'lic-jeevan-anand',
    insurer: 'LIC',
    planName: 'New Jeevan Anand',
    type: 'WHOLE_LIFE',
    description:
      'Participating endowment plan combining protection and savings — pays sum assured on maturity and continues life cover thereafter.',
    keyCoverage: [
      'Death benefit during policy term: 125 % of basic sum assured (or as per terms) plus bonuses',
      'Maturity benefit: basic sum assured + simple reversionary bonus + final additional bonus',
      'Whole-life cover continues after maturity (additional sum assured paid on death thereafter)',
      'Optional rider cover (Accident Benefit, Disability)',
      'Loan facility against policy after acquiring surrender value',
    ],
    sumAssuredRange: '₹1 lakh and above',
    ageBand: '18–50 years',
    policyTermYears: '15–35',
    brochureUrl: 'https://licindia.in/products/insurance-plan/lic-s-new-jeevan-anand',
  },
  {
    id: 'lic-jeevan-labh',
    insurer: 'LIC',
    planName: 'Jeevan Labh',
    type: 'ENDOWMENT',
    description:
      'Limited-premium-paying endowment plan with profit participation, providing protection and savings.',
    keyCoverage: [
      'Death benefit including reversionary and final bonuses',
      'Maturity benefit: sum assured plus accumulated bonuses',
      'Premium-paying term shorter than policy term',
      'Loan facility on acquired surrender value',
    ],
    ageBand: '8–59 years',
    policyTermYears: '16, 21 or 25',
    brochureUrl: 'https://licindia.in/products/insurance-plan/lic-s-jeevan-labh',
  },
  {
    id: 'hdfc-life-sanchay-plus',
    insurer: 'HDFC Life',
    planName: 'Sanchay Plus',
    type: 'ENDOWMENT',
    description:
      'Non-participating savings-cum-protection plan offering guaranteed income, lump-sum maturity or whole-life income options.',
    keyCoverage: [
      'Guaranteed income during payout period',
      'Lump-sum or income payout options (Lifelong Income / Long-Term Income / Guaranteed Maturity / Guaranteed Income)',
      'Death benefit during premium-paying term',
      'Tax benefits under Section 80C and 10(10D)',
    ],
    ageBand: '5–60 years (depending on option)',
    policyTermYears: 'Up to 25 (or whole life)',
    brochureUrl:
      'https://www.hdfclife.com/savings-plans/sanchay-plus-non-participating-life-insurance-plan',
  },
  {
    id: 'icici-pru-signature-ulip',
    insurer: 'ICICI Prudential Life',
    planName: 'Signature (ULIP)',
    type: 'ULIP',
    description:
      'Unit-linked plan investing premiums in chosen funds along with a life-insurance cover. Offers loyalty additions and wealth boosters over time.',
    keyCoverage: [
      'Higher of fund value or sum assured paid on death',
      'Maturity benefit equal to fund value',
      'Multiple fund options across equity, debt and balanced',
      'Loyalty additions and wealth boosters added back to fund',
      'Partial withdrawals allowed after lock-in (5 years)',
    ],
    ageBand: '0–60 years',
    policyTermYears: '10–30',
    brochureUrl: 'https://www.iciciprulife.com/savings-plans/signature.html',
  },

  // ── Personal accident ────────────────────────────────────────────────
  {
    id: 'icici-lombard-personal-protect',
    insurer: 'ICICI Lombard',
    planName: 'Personal Protect',
    type: 'PERSONAL_ACCIDENT',
    description:
      'Personal accident cover paying lump sum on accidental death and graded benefits for permanent or partial disablement.',
    keyCoverage: [
      'Accidental death benefit (100 % of sum insured)',
      'Permanent total disability (100 %)',
      'Permanent partial disability (% as per scale)',
      'Temporary total disability (weekly compensation)',
      'Children education benefit on death of insured',
    ],
    exclusions: ['Self-inflicted injury, intoxication, war, hazardous sports (unless covered)'],
    brochureUrl: 'https://www.icicilombard.com/personal-accident-insurance',
  },
] as const;

export function findCatalogProduct(id: string | null | undefined): CatalogProduct | undefined {
  if (!id) return undefined;
  return INSURANCE_CATALOG.find((p) => p.id === id);
}

export function catalogProductsByType(type: string): CatalogProduct[] {
  return INSURANCE_CATALOG.filter((p) => p.type === type);
}
