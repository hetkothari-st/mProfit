import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 1,
  chapterTitle: 'Basics of Insurance',
};

export const XB_01: readonly KnowledgeEntry[] = [
  {
    id: 'xb-01-pooling-insurable-risk',
    title: 'How insurance pools risk, and what makes a risk insurable',
    principle:
      'Insurance transfers the financial consequence of an uncertain event from the insured to an insurer for a premium; the alternative is retaining the risk yourself. It works by pooling: if 100 merchants each lose a 10 lakh ship with an expected two losses a month, 20,000 each covers everyone; if only 40 join, each pays 50,000. Premium reflects expected loss and its probability (family history of illness raises health premiums). An insurable risk needs many similar exposures, an insurable interest, a loss that is accidental and uncertain (for life cover, the timing of death), a definite and measurable loss, no possibility of gain (pure, not speculative, risk, so stock-market losses are not insurable), calculable frequency and severity, and an affordable premium far below the cover.',
    source: SRC,
    topics: ['insurance'],
    keywords: ['how insurance works', 'risk pooling', 'law of large numbers', 'insurable risk', 'risk transfer', 'risk retention', 'pure risk', 'speculative risk'],
  },
  {
    id: 'xb-01-utmost-good-faith-insurable-interest',
    title: 'Utmost good faith and insurable interest',
    principle:
      'The insured knows more about their own risk than the insurer, so insurance rests on utmost good faith: the proposer must truthfully disclose everything material (health and family history, smoking and drinking, occupation), anything that could change the insurer’s view; when unsure, disclose. Hidden facts found at claim time let the insurer reject the claim, wasting every premium paid; paying more for honest disclosure is the better bargain. Insurable interest means you lose money if the event happens: an owner in their own stock, spouses, children and dependants in each other, more distant relatives only with proof of financial dependence, a lender up to the loan outstanding, an employer in key staff.',
    source: SRC,
    topics: ['insurance'],
    keywords: ['utmost good faith', 'uberrimae fidei', 'disclosure', 'non disclosure', 'claim rejected for non disclosure', 'insurable interest', 'key man insurance'],
  },
  {
    id: 'xb-01-indemnity-vs-benefit',
    title: 'Indemnity versus defined-benefit policies',
    principle:
      'An indemnity policy repays the actual loss and needs it proved: hospital reimbursement (mediclaim), property against fire or flood, motor. A defined-benefit policy pays a fixed sum when the event happens, used where the true loss is hard to measure or too small to be worth measuring: life cover, critical-illness lump sums, daily hospital cash. One policy can mix both, such as mediclaim with a hospital-cash add-on. Indemnity is meant to restore you to where you were, never to profit.',
    source: SRC,
    topics: ['insurance'],
    keywords: ['indemnity', 'principle of indemnity', 'defined benefit insurance', 'mediclaim', 'critical illness lump sum', 'hospital cash'],
  },
  {
    id: 'xb-01-subrogation-contribution',
    title: 'Subrogation and contribution',
    principle:
      'Subrogation: after paying a claim, the insurer steps into the insured’s shoes to recover from whoever caused the loss (for example the at-fault driver’s insurer), so the insured is paid quickly and premiums stay lower. Contribution applies to indemnity cover when several policies cover the same risk: insurers share the loss in proportion to sum insured (two 5 lakh flood policies and a 30,000 loss: 15,000 each). In health insurance the insured chooses which policy to claim on; contribution applies only when the claim exceeds that policy’s sum insured.',
    source: SRC,
    topics: ['insurance'],
    keywords: ['subrogation', 'contribution', 'multiple health policies', 'claim under two policies', 'sum insured'],
  },
  {
    id: 'xb-01-copay-deductible',
    title: 'Co-pay versus deductible',
    principle:
      'Co-pay is a percentage of every claim the insured bears (15% co-pay on a 2,00,000 claim: insured pays 30,000, insurer 1,70,000); higher co-pay lowers premium but is unpopular because hospitals and garages set the bill. A deductible is a fixed first slice the insured bears before cover starts (motor policies on cars up to 1,600 cc carry a compulsory 1,000). Health deductibles are compulsory (set by the insurer, as in top-up and super top-up plans, which is why they are cheap) or voluntary (chosen by the insured for a lower premium). On a 40,000 claim, a 1,000 deductible plus 10% co-pay pays 35,100; a 5,000 deductible alone pays 35,000.',
    source: SRC,
    asOf: '2025-12',
    topics: ['insurance', 'costs'],
    keywords: ['co-pay', 'copayment', 'deductible', 'voluntary deductible', 'compulsory deductible', 'top up', 'super top up', 'health insurance premium'],
  },
  {
    id: 'xb-01-cashless-claims',
    title: 'Cashless claims: useful but not a reason to pick an insurer',
    principle:
      'Cashless settlement has the insurer pay the hospital or garage directly instead of reimbursing later; it changes cash flow, not the premium. Do not choose an insurer mainly for it: network lists change, emergencies happen wherever they happen, approvals can delay discharge, some providers still demand deposits, and pre- and post-hospitalisation costs are reimbursed anyway. IRDAI now pushes cashless across the industry. Employer group policies run more smoothly because they usually cover pre-existing illness from day one, removing the main source of disputes.',
    source: SRC,
    topics: ['insurance'],
    keywords: ['cashless claim', 'network hospital', 'reimbursement claim', 'group health insurance', 'corporate health policy'],
  },
  {
    id: 'xb-01-nominee-section-45-moratorium',
    title: 'Beneficial nominees, Section 45 and the health moratorium',
    principle:
      'Normally a nominee only holds the money in trust for the legal heirs. Since 2015, Section 39(7) of the Insurance Act makes a life-policy nominee who is the policyholder’s parent, spouse or child a beneficial nominee who keeps the claim outright. Section 45: three years after the policy is issued, risk begins or it is revived (whichever is later), a life policy cannot be questioned on any ground; within those three years claims can be refused for fraud, and large early claims are always investigated. In health insurance, after five continuous years of premiums (the moratorium) no claim can be contested except for proven fraud or permanent exclusions; increased cover starts its own five years.',
    source: SRC,
    asOf: '2025-12',
    topics: ['insurance', 'estate'],
    keywords: ['beneficial nominee', 'section 39', 'section 45', 'three year rule', 'life insurance nominee', 'health moratorium five years', 'claim cannot be contested'],
  },
  {
    id: 'xb-01-insurance-in-planning',
    title: 'Insurance comes before investment',
    principle:
      'Every financial plan rests on income; death, critical illness, disability, accidents, theft or big medical bills can wipe out goals. Life cover replaces a breadwinner’s income, critical-illness and accident-disability cover replace lost earning power, and health, motor and home policies shield income from large unplanned bills. Like a batsman who never bats without pads, cover the downside before investing for goals.',
    source: SRC,
    topics: ['insurance', 'planning'],
    keywords: ['insurance before investment', 'protect income', 'life cover', 'critical illness', 'disability insurance', 'financial plan protection'],
  },
  {
    id: 'xb-01-insurance-plus-investment',
    title: 'Mixing insurance with investment',
    principle:
      'Policies with a savings element charge much more, split between cover and investment. Getting premiums back is expensive: for the merchant to receive a 20,000 premium back at 1% a month, he would need to pay 20,20,000, more than the ship. People who insist on returns usually end up cutting cover, defeating the purpose. Evaluate any combined product by separating the two parts: if the cover is inadequate, reject it; only then judge the investment part against comparable pure investments. Insurers specialise in risk cover; others specialise in investments.',
    source: SRC,
    asOf: '2025-12',
    topics: ['insurance', 'products', 'costs'],
    keywords: ['endowment', 'money back policy', 'ULIP', 'insurance cum investment', 'return of premium', 'buy term invest the rest', 'decouple insurance and investment'],
  },
  {
    id: 'xb-01-insurance-planning-steps',
    title: 'Steps in insurance planning',
    principle:
      'Identify needs: income replacement (life, critical illness, disability, annuities), income protection from big unplanned costs (health, motor) and asset protection (home, contents). Needs depend on life stage: a single person with no dependants needs disability and critical-illness cover more than life cover; a breadwinner with dependants needs life cover first. Size the cover from the future cost of what must be replaced and the period needed; under-insurance leaves you carrying risk, over-insurance wastes premium. Cover income replacement through the earning years; a slightly longer term can be a cheap option (for one 30-year-old, 13,800 a year to 60 versus 16,200 to 70). Then pick the product, cut premiums through extra disclosure, deductibles, no-claim bonus and e-policies, and review after marriage, children, a home or a big raise; life cover can shrink as goals are met.',
    source: SRC,
    asOf: '2025-12',
    topics: ['insurance', 'planning'],
    keywords: ['insurance planning', 'how much life cover', 'insurance needs', 'term insurance tenure', 'under insurance', 'over insurance', 'review insurance', 'no claim bonus'],
  },
  {
    id: 'xb-01-health-ulip-rules',
    title: 'IRDAI rules for health policies and ULIPs',
    principle:
      'Health: standard definitions and a capped exclusion list (mental illness, genetic and congenital conditions no longer excluded); individual policies (not group, top-up or super top-up) can be ported between insurers; group cover can convert to individual cover with the same insurer in the first year after leaving, or another insurer later; rejections must be reasoned in writing; telemedicine is covered; delayed claims earn interest; every insurer offers a standard plan with uniform wording; individual health premiums are GST-exempt from 22 September 2025. ULIPs: five-year lock-in, charges disclosed yearly and spread evenly, illustrations at 4% and 8% signed by the buyer, level premiums, life or health cover in all but pension products, charge caps from year five, no surrender charge after five years, partial withdrawals after lock-in, revival within three years.',
    source: SRC,
    asOf: '2025-12',
    topics: ['insurance', 'regulation'],
    keywords: ['health insurance portability', 'standard health policy', 'Arogya Sanjeevani', 'GST exemption health insurance', 'ULIP lock in', 'ULIP charges', 'benefit illustration 4% 8%', 'ULIP rules'],
  },
  {
    id: 'xb-01-intermediaries',
    title: 'Agents, brokers and advisers in insurance',
    principle:
      'An insurance agent (individual or corporate) represents the insurer and earns commission; a composite agent may act for one life, one general, one health and one each of specialist insurers; a corporate agent for up to three of each (banks doing this is bancassurance). A direct broker represents the client, compares multiple insurers and may charge the client a fee or take commission; reinsurance and composite brokers also exist; web aggregators compare prices online. Agents must do suitability analysis (age, income, family, goals, existing cover) before selling investment-linked policies unless the buyer signs a written override, sign benefit illustrations, and separate guaranteed from non-guaranteed benefits.',
    inPractice:
      'An IRDAI agent advising only on insurance is exempt from SEBI IA rules, but one who also advises on securities is covered and must apply risk profiling, suitability and fiduciary duty to insurance advice too.',
    source: SRC,
    topics: ['insurance', 'regulation', 'ethics'],
    keywords: ['insurance agent', 'insurance broker', 'bancassurance', 'corporate agent', 'web aggregator', 'suitability analysis insurance', 'mis-selling insurance'],
  },
];
