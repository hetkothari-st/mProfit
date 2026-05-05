// Catalog of widely-sold Indian insurance products. Brochure URLs are real,
// publicly-hosted PDFs verified at curation time (May 2026). If an insurer
// reorganises their CDN we fall back to a Google search via brochureSearchUrl.
// Coverage / exclusions text is summarised from the official brochures and
// IRDAI filings; the actual policy document is contractually authoritative.

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
  /** Short single-/two-word coverage chips for card display. */
  coverageTags: string[];
  /** Common exclusions — non-exhaustive, contract is authoritative. */
  exclusions?: string[];
  /** Sum-assured guidance. Free text — varies by buyer profile. */
  sumAssuredRange?: string;
  /** Eligible age band, if commonly published. */
  ageBand?: string;
  /** Policy term band, if applicable. */
  policyTermYears?: string;
  /** Verified direct PDF link to the official brochure. */
  brochureUrl: string;
  /** Insurer's stable home/products page — used for the "Insurer site" link. */
  insurerSite: string;
}

/**
 * Fallback URL builder for the rare case where the catalog PDF link is dead.
 * Returns a Google search restricted to PDFs targeting the actual brochure.
 */
export function brochureSearchUrl(product: CatalogProduct): string {
  const q = `${product.insurer} ${product.planName} policy brochure filetype:pdf`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
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
    coverageTags: ['Death', 'Accident rider', 'Online', 'Tax saving'],
    exclusions: ['Suicide within first 12 policy months (only premiums paid are returned)'],
    sumAssuredRange: '₹50 lakh – ₹40 crore',
    ageBand: '18–65 years',
    policyTermYears: '10–40',
    brochureUrl:
      'https://licindia.in/documents/20121/290753/LIC_New-Tech-Term_Sales-Brochure.pdf/485808ad-a871-ed8c-f29b-d558b9386b7d?t=1675155744224',
    insurerSite: 'https://licindia.in',
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
      'Waiver of premium on Critical Illness / Disability',
    ],
    coverageTags: ['Death', 'Critical illness', 'Accidental', 'ROP', 'Disability waiver'],
    exclusions: ['Suicide within 12 months from issue / revival'],
    sumAssuredRange: '₹50 lakh – ₹20 crore',
    ageBand: '18–65 years',
    policyTermYears: '5–85 minus age',
    brochureUrl:
      'https://www.hdfclife.com/content/dam/hdfclifeinsurancecompany/products-page/brochure-pdf/HDFC_Life_Click_2_Protect_Super_Retail_Brochure.pdf',
    insurerSite: 'https://www.hdfclife.com',
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
    coverageTags: ['Death', 'Critical illness', 'Accidental', 'Income payout'],
    exclusions: ['Suicide within first 12 policy months'],
    sumAssuredRange: '₹25 lakh and above',
    ageBand: '18–65 years',
    policyTermYears: '5–40',
    brochureUrl:
      'https://www.iciciprulife.com/content/dam/icicipru/brochures/ICICI_IPru_iProtect_Smart.pdf',
    insurerSite: 'https://www.iciciprulife.com',
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
    coverageTags: ['Death', 'ROP', 'Joint life', 'Critical illness', 'Accidental'],
    sumAssuredRange: '₹25 lakh and above',
    ageBand: '18–65 years',
    policyTermYears: '10–67 minus age',
    brochureUrl:
      'https://www.maxlifeinsurance.com/content/dam/corporate/Brochures/Term-plans/English/smart-secure-plus-plan/max-life-smart-secure-plus-plan-prospectus.pdf',
    insurerSite: 'https://www.maxlifeinsurance.com',
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
    coverageTags: ['Death', 'Disability waiver', 'Critical illness', 'Online'],
    sumAssuredRange: '₹50 lakh – ₹20 crore',
    ageBand: '18–65 years',
    policyTermYears: '10–40',
    brochureUrl:
      'https://www.bajajallianzlife.com/content/dam/balic-web/pdf/term-insurance/etouch-plan-sl.pdf',
    insurerSite: 'https://www.bajajallianzlife.com',
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
    coverageTags: ['Hospitalisation', 'ICU', 'Day-care', '4× cover', 'Restore', 'Pre/post-hosp'],
    exclusions: [
      'Pre-existing diseases waiting period (typically 36 months)',
      'Cosmetic / experimental treatments',
      'Self-inflicted injury, war, intoxication',
    ],
    sumAssuredRange: '₹5 lakh – ₹2 crore',
    ageBand: 'Adult 18–65 (lifelong renewal); Child 91 days–25 years',
    brochureUrl:
      'https://www.hdfcergo.com/docs/default-source/downloads/brochures/optima-secure-brochure.pdf',
    insurerSite: 'https://www.hdfcergo.com',
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
    coverageTags: ['Hospitalisation', 'AYUSH', 'Unlimited reset', 'Booster', 'Lock-the-clock'],
    exclusions: [
      'Standard 30-day initial waiting period (except accidents)',
      'Specified disease waiting (24 months)',
      'Pre-existing diseases waiting (typically 36 months)',
    ],
    sumAssuredRange: '₹3 lakh – ₹1 crore',
    ageBand: '18+ (lifelong renewal)',
    brochureUrl: 'https://otc.nivabupa.com/nivabupalogo/ReAssureBrochure2.0.pdf',
    insurerSite: 'https://www.nivabupa.com',
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
    coverageTags: ['Hospitalisation', 'Day-care', 'Dental', 'Maternity', 'Ophthalmic', 'Air ambulance'],
    exclusions: [
      'Pre-existing disease waiting (36 months)',
      'Cosmetic surgery, weight-loss treatments',
      'War, nuclear and self-inflicted injury',
    ],
    sumAssuredRange: '₹5 lakh – ₹1 crore',
    ageBand: '18–65 years (renewal lifelong)',
    brochureUrl:
      'https://web.starhealth.in/sites/default/files/brochure/Star-Comprehensive-brochure-new-1.pdf',
    insurerSite: 'https://www.starhealth.in',
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
    coverageTags: ['Hospitalisation', 'ICU', 'AYUSH', 'Auto recharge', 'NCB up to 150%'],
    exclusions: [
      'Initial 30-day waiting period (accidents excluded)',
      'Pre-existing disease waiting period',
      'Conditions excluded by policy terms (e.g. cosmetic)',
    ],
    sumAssuredRange: '₹3 lakh – ₹6 crore',
    brochureUrl:
      'https://cms.careinsurance.com/cms/public/uploads/download_center/care-(health-insurance-product)---brochure.pdf',
    insurerSite: 'https://www.careinsurance.com',
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
    coverageTags: ['Hospitalisation', 'Day-care', 'AYUSH', 'Maternity', 'Wellness rewards'],
    exclusions: ['Pre-existing waiting period', 'Specified illness waiting period (varies)'],
    sumAssuredRange: '₹3 lakh – ₹50 lakh',
    brochureUrl:
      'https://www.icicilombard.com/docs/default-source/downloads/complete-health-insurance-brochure.pdf',
    insurerSite: 'https://www.icicilombard.com',
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
    coverageTags: ['Own damage', 'Third-party', 'Theft', 'Fire', 'PA cover', 'Cashless'],
    exclusions: [
      'Driving under influence, no valid licence',
      'Consequential losses, mechanical / electrical breakdown',
      'Damage outside India',
    ],
    brochureUrl:
      'https://www.icicilombard.com/docs/default-source/policy-wordings-product-brochure/private-car-package-policy.pdf',
    insurerSite: 'https://www.icicilombard.com',
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
    coverageTags: ['Own damage', 'Third-party', 'PA cover', 'NCB protect', 'Zero-dep'],
    brochureUrl:
      'https://d3h6xrw705p37u.cloudfront.net/policy/brochure/bajaj-allianz-car-insurance-brochure.pdf',
    insurerSite: 'https://www.bajajallianz.com',
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
    coverageTags: ['Own damage', 'Third-party', 'PA cover', 'Zero-dep', 'Engine', 'RTI'],
    brochureUrl:
      'https://www.hdfcergo.com/docs/default-source/downloads/brochures/motor-private-car-brochure.pdf',
    insurerSite: 'https://www.hdfcergo.com',
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
    coverageTags: ['Own damage', 'Third-party', 'Engine secure', 'Hydro lock', 'Daily allowance'],
    brochureUrl:
      'https://www.tataaig.com/s3/Auto_Secure_Private_Car_Package_Policy_Brochure_7299c8a66f.pdf',
    insurerSite: 'https://www.tataaig.com',
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
    coverageTags: ['Medical', 'Dental', 'Baggage', 'Passport', 'Trip cancellation', 'Liability'],
    exclusions: ['Pre-existing conditions (except life-threatening)', 'War / nuclear', 'Self-inflicted injury'],
    brochureUrl:
      'https://www.icicilombard.com/docs/default-source/default-document-library/international_travel_insurance_brochure8c0003ff45fd68ff8a0df0055f279a0b.pdf',
    insurerSite: 'https://www.icicilombard.com',
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
    coverageTags: ['Medical', 'Dental', 'Baggage', 'PA cover', 'Hijack', 'Trip delay'],
    brochureUrl:
      'https://www.hdfcergo.com/docs/default-source/downloads/brochures/travel_insurance_brochure.pdf',
    insurerSite: 'https://www.hdfcergo.com',
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
    coverageTags: ['Structure', 'Contents', 'Burglary', 'Earthquake', 'Fire', 'Jewellery'],
    brochureUrl:
      'https://www.hdfcergo.com/docs/default-source/downloads/brochures/home-shield_brochure_ctc.pdf',
    insurerSite: 'https://www.hdfcergo.com',
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
    coverageTags: ['Structure', 'Contents', 'Appliances', 'Burglary', 'Liability'],
    brochureUrl:
      'https://www.bajajallianz.com/download-documents/home-insurance/my-home-insurance-policy/My-Home-Brochure.pdf',
    insurerSite: 'https://www.bajajallianz.com',
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
    coverageTags: ['Death', 'Maturity', 'Bonuses', 'Whole-life cover', 'Loan facility'],
    sumAssuredRange: '₹1 lakh and above',
    ageBand: '18–50 years',
    policyTermYears: '15–35',
    brochureUrl:
      'https://licindia.in/documents/20121/1243952/Lic+NEW+Jeevan+Anand+2024++4x9+inches+wxh+single+page.pdf+-+Final+(1).pdf/9dcb475e-42e0-1a95-8678-ca7e149cb071?t=1729142876593',
    insurerSite: 'https://licindia.in',
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
    coverageTags: ['Death', 'Maturity', 'Bonuses', 'Limited-pay', 'Loan facility'],
    ageBand: '8–59 years',
    policyTermYears: '16, 21 or 25',
    brochureUrl:
      'https://licindia.in/documents/20121/97277/LIC_Jeevan-Labh_Brochure_9-inch-x-8-inch_Eng-(1)+(1).pdf/e78573c4-cf09-be34-7b3d-5a6279de59d4?t=1681117060144',
    insurerSite: 'https://licindia.in',
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
    coverageTags: ['Guaranteed income', 'Maturity', 'Death', 'Tax saving'],
    ageBand: '5–60 years (depending on option)',
    policyTermYears: 'Up to 25 (or whole life)',
    brochureUrl:
      'https://www.hdfclife.com/content/dam/hdfclifeinsurancecompany/products-page/brochure-pdf/Sanchay-Plus-brochure.pdf',
    insurerSite: 'https://www.hdfclife.com',
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
    coverageTags: ['Market-linked', 'Death', 'Loyalty additions', 'Multi-fund', 'Partial withdrawal'],
    ageBand: '0–60 years',
    policyTermYears: '10–30',
    brochureUrl:
      'https://www.iciciprulife.com/content/dam/icicipru/brochures/ICICI_Pru_Signature_Online_Brochure.pdf',
    insurerSite: 'https://www.iciciprulife.com',
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
    coverageTags: ['Accidental death', 'PTD', 'PPD', 'TTD', 'Education benefit'],
    exclusions: ['Self-inflicted injury, intoxication, war, hazardous sports (unless covered)'],
    brochureUrl:
      'https://www.icicilombard.com/docs/default-source/Policy-Wordings-product-Brochure/personal-protect-brochure.pdf',
    insurerSite: 'https://www.icicilombard.com',
  },
] as const;

export function findCatalogProduct(id: string | null | undefined): CatalogProduct | undefined {
  if (!id) return undefined;
  return INSURANCE_CATALOG.find((p) => p.id === id);
}

export function catalogProductsByType(type: string): CatalogProduct[] {
  return INSURANCE_CATALOG.filter((p) => p.type === type);
}
