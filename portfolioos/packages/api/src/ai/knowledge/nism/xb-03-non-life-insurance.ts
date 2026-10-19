import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 3,
  chapterTitle: 'Non-Life Insurance Products',
};

export const XB_03: readonly KnowledgeEntry[] = [
  {
    id: 'xb-03-non-life-elements',
    title: 'How general insurance policies work',
    principle:
      'Non-life cover protects assets and income from large unexpected costs. The sum insured is the insurer’s maximum liability for the period; terms are usually one year (some health and two-wheeler policies run two or three); premium depends on sum insured and assessed risk (age, gender and health for medical cover; engine size, place of registration and age for vehicles) and is paid upfront. Health policies may offer restore (sum insured refilled after partial or full use, depending on the policy) or recharge (refilled only after a claim reduces it). A no-claim bonus lowers later premiums or adds cover for claim-free years.',
    source: SRC,
    topics: ['insurance'],
    keywords: ['general insurance', 'sum insured', 'restore benefit', 'recharge benefit', 'no claim bonus', 'one year policy'],
  },
  {
    id: 'xb-03-health-insurance',
    title: 'Health insurance: what it covers and portability',
    principle:
      'Health policies reimburse hospitalisation for illness or accident up to the sum insured, typically for in-patient stays of at least 24 hours, domiciliary treatment when the patient cannot be moved, and listed day-care procedures; sub-limits may cap room rent, fees or other heads. Pre-existing conditions may be excluded for a waiting period on a first policy or after a lapse. A family floater shares one sum insured across members; cashless settlement is available at network hospitals. Premium depends on sum insured, age and history. Porting to another insurer carries over no-claim bonus and waiting periods already served, provided the policy was kept without a break.',
    source: SRC,
    topics: ['insurance'],
    keywords: ['health insurance', 'mediclaim', 'family floater', 'pre-existing disease waiting period', 'sub limit', 'room rent limit', 'day care', 'domiciliary', 'health portability'],
  },
  {
    id: 'xb-03-motor-insurance',
    title: 'Motor insurance and no-claim bonus',
    principle:
      'Third-party liability cover (death, injury or damage to others’ property from using the vehicle) is compulsory for any vehicle on public roads; own-damage and theft cover is optional. The no-claim bonus on own-damage premium can reach 50% after five claim-free years; it belongs to the owner, not the car, so it moves to the owner’s next car (the buyer of the old car does not get it) and carries over when switching insurers at renewal. Own-damage premiums differ widely between insurers, so compare online through brokers or aggregators.',
    source: SRC,
    asOf: '2025-12',
    topics: ['insurance'],
    keywords: ['motor insurance', 'car insurance', 'third party insurance compulsory', 'own damage', 'no claim bonus 50%', 'NCB transfer'],
  },
  {
    id: 'xb-03-accident-critical-illness',
    title: 'Personal accident and critical-illness cover as income replacement',
    principle:
      'Personal accident policies pay set sums for bodily injury from external, violent, visible accidents: permanent total, permanent partial or temporary total disablement. Critical-illness policies pay a lump sum on diagnosis of listed diseases (cancer, heart attack, stroke, kidney failure, multiple sclerosis) after a survival period of about 15 to 30 days, nothing on death, and the money can be used for anything. Both are usually treated as small top-ups, but their real job is replacing lost income, so size them like life cover; large amounts come as standalone policies or as accelerated riders on life policies, not as health-policy riders. Unlike health insurance, which reimburses bills, these defined-benefit covers pay regardless of other policies.',
    source: SRC,
    topics: ['insurance', 'planning'],
    keywords: ['personal accident insurance', 'disability cover', 'permanent total disability', 'critical illness insurance', 'critical illness vs health insurance', 'income replacement'],
  },
  {
    id: 'xb-03-other-covers',
    title: 'Property, travel, liability, fidelity, D&O and key-person cover',
    principle:
      'Home (property) cover protects structure and contents against fire, theft and natural or man-made disasters, not wear and tear or wilful damage; jewellery and art need add-ons; lenders often require it. Overseas travel cover reimburses medical emergencies, baggage delays and accidents abroad and is compulsory for some countries. Liability cover pays legal defence and damages owed to third parties (professional indemnity for doctors, lawyers or advisers), never for intentional or criminal acts. Fidelity cover protects employers from staff fraud or forgery. Directors and officers cover protects board members and managers against claims of wrongful acts. Key-person insurance is a company-owned life policy on a key executive, with the company as beneficiary.',
    source: SRC,
    topics: ['insurance'],
    keywords: ['home insurance', 'property insurance', 'travel insurance', 'professional indemnity', 'liability insurance', 'fidelity guarantee', 'D&O insurance', 'keyman insurance'],
  },
  {
    id: 'xb-03-top-up-super-top-up',
    title: 'Top-up versus super top-up health plans',
    principle:
      'Both pay hospital bills above a threshold (deductible). A top-up applies the threshold to each claim separately; a super top-up applies it to the year’s claims combined. With a 5 lakh base plan and 10 lakh cover above 5 lakh: a single 8 lakh claim is paid in full either way. But several smaller claims (3, 6, 2 and 4 lakh, totalling 15 lakh) leave a top-up paying almost nothing because few single claims cross 5 lakh (about 6 lakh in all, mostly from the base plan), while the super top-up pays all 15 lakh. Super top-ups are ideal for employees topping up employer cover, setting the deductible at the employer’s sum insured. Keep base and top-up with the same insurer where possible, and tell the super top-up insurer about base claims so it tracks the threshold used.',
    source: SRC,
    asOf: '2025-12',
    topics: ['insurance'],
    keywords: ['top up', 'super top up', 'top up vs super top up', 'health insurance deductible', 'top up employer cover', 'aggregate deductible'],
  },
  {
    id: 'xb-03-multiple-policies',
    title: 'Holding several insurance policies',
    principle:
      'Multiple indemnity (health) policies add little: total claims can never exceed the actual bill and each extra insurer adds paperwork. Health premium per extra lakh falls steeply as cover rises (1 crore may cost only a few thousand more than 50 lakh), so one large policy usually beats several small ones; a base plus super top-up totalling 15 lakh costs only slightly less than a single 15 lakh policy. When an employer policy exists, claim on it first; contribution applies only when a claim exceeds the chosen policy. Multiple defined-benefit policies (life, critical illness, accident) all pay in full.',
    source: SRC,
    topics: ['insurance', 'costs'],
    keywords: ['multiple health policies', 'two health insurance policies', 'employer health cover plus personal', 'how much health cover', 'health insurance 1 crore'],
  },
  {
    id: 'xb-03-global-coverage',
    title: 'Insurance cover outside India and for students abroad',
    principle:
      'Defined-benefit covers (life, critical illness, accidental death) pay wherever the event happens. Indemnity health policies usually pay only for treatment in India, because insurers cannot verify bills abroad; country-specific overseas travel policies are the exception. Residents may buy foreign insurers’ policies under the LRS (USD 250,000 a year), but foreign law governs claims and complaints. For students going abroad, many universities bundle or prescribe compulsory insurance; where they do not, buy cover anyway given foreign treatment costs. Indian insurers usually offer compliant policies, often cheaper.',
    source: SRC,
    asOf: '2025-12',
    topics: ['insurance'],
    keywords: ['health insurance abroad', 'student health insurance', 'overseas travel insurance', 'foreign insurance LRS', 'international coverage'],
  },
];
