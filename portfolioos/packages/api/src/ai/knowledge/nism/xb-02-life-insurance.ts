import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 2,
  chapterTitle: 'Life Insurance Products',
};

export const XB_02: readonly KnowledgeEntry[] = [
  {
    id: 'xb-02-policy-elements',
    title: 'Elements of a life policy: cover, premium, bonuses',
    principle:
      'Life policies pay on death within the term (death benefit), on surviving it (survival benefit), or both; term insurance pays only on death. The proposer must have insurable interest in the life insured. For terms over 10 years, the minimum sum assured is 10 times the annual premium below age 45 and 7 times above; for shorter terms, 5 times. Missed premiums lapse the policy after the grace period; it can be revived within the insurer’s window with arrears and interest. Life premiums are GST-exempt from 22 September 2025. Participating savings policies add bonuses: guaranteed bonuses for the first few years and discretionary reversionary bonuses after that, both as a percentage of sum assured, paid at maturity or claim; participating premiums are higher.',
    source: SRC,
    asOf: '2025-12',
    topics: ['insurance'],
    keywords: ['sum assured', 'minimum sum assured 10 times', 'policy lapse', 'grace period', 'revival', 'reversionary bonus', 'guaranteed bonus', 'participating policy', 'GST on life insurance'],
  },
  {
    id: 'xb-02-surrender-paid-up',
    title: 'Surrender value and paid-up policies',
    principle:
      'A traditional savings policy with full premiums for 3 years (2 if the term is under 10 years) acquires a surrender value: at least 30% of premiums paid, rising to 90% in the last two years; single-premium policies guarantee 70% in the first three years rising to 90%. Insurers may pay more based on asset values. ULIPs can be discontinued within the 5-year lock-in: a charge of at most 6,000 is deducted and the fund moves to a discontinued-policy fund, paid out only after lock-in. Instead of surrendering, a policy can be made paid-up: the sum assured shrinks in proportion to premiums paid versus due. Ten half-yearly premiums out of fifty on a 10 lakh policy leaves 2 lakh.',
    source: SRC,
    asOf: '2025-12',
    topics: ['insurance'],
    keywords: ['surrender value', 'paid up value', 'surrender policy', 'discontinue ULIP', 'discontinuance charge', 'stop paying premium', 'lapsed policy'],
  },
  {
    id: 'xb-02-human-life-value',
    title: 'How much life cover: human life value',
    principle:
      'Human life value (HLV) is the present value of the income the person would earn for their dependants over their remaining working life. It needs two assumptions: income growth and the post-tax return the claim money could earn; discount at (1 + return) / (1 + growth) - 1. When growth equals return, HLV is simply current income x years to retirement (10 lakh for 27 years = 2.7 crore). Younger people have higher HLV (more years, faster growth), and HLV falls as a person ages. HLV is always at least as high as the needs-based figure, because spending cannot exceed income.',
    source: SRC,
    asOf: '2025-12',
    topics: ['insurance', 'planning'],
    keywords: ['human life value', 'HLV', 'how much term insurance', 'life cover calculation', 'income replacement'],
  },
  {
    id: 'xb-02-needs-based-cover',
    title: 'How much life cover: the needs-based method',
    principle:
      'Work out the family’s income need after removing the earner’s own spending, EMIs and premiums; turn it into a corpus as the present value of that income over the dependants’ need, paid at the start of each year, at the inflation-adjusted rate; add debts; subtract existing cover and investable assets (not the home or personal jewellery). Example: 1,50,000 monthly income less 67,000 own use, EMI and premiums leaves 9,96,000 a year for a 49-year-old spouse to age 80; at 8% return and 6% inflation (about 1.89% real) the corpus is about 2.36 crore; plus a 40 lakh loan, less 1 crore cover and 50 lakh investments, needs about 1.26 crore more. More investments means less cover needed.',
    source: SRC,
    asOf: '2025-12',
    topics: ['insurance', 'planning'],
    keywords: ['needs based approach', 'insurance needs analysis', 'how much life insurance do I need', 'life cover for family', 'income replacement corpus'],
  },
  {
    id: 'xb-02-term-insurance',
    title: 'Term insurance and return-of-premium term',
    principle:
      'Term insurance is pure cover: it pays only if the insured dies within the term, so it is the cheapest way to buy enough cover. Choose the sum assured, premium and term (level or rising premiums; payout as lump sum, monthly income, or both; terms now run to 85 or 100 but cost much more than covering only earning years). Return-of-premium term costs far more; the extra is effectively an investment. In one real case for 1 crore over 30 years, pure term cost 9,416 a year and return-of-premium 17,473; returning 5,24,190 at maturity implies only about 4.6% a year on the extra 8,057.',
    source: SRC,
    asOf: '2025-12',
    topics: ['insurance', 'products'],
    keywords: ['term insurance', 'pure protection', 'return of premium term plan', 'TROP', 'term plan till 85', 'cheapest life cover'],
  },
  {
    id: 'xb-02-endowment-whole-life',
    title: 'Endowment and whole-life policies',
    principle:
      'Endowment policies pay the sum assured plus accrued bonuses on death or at maturity; money-back variants pay parts along the way. Their return comes from the insurer’s official benefit illustration, which also shows what is guaranteed; compute it with RATE (lump sum) or XIRR (staggered payouts) on the premium above an equivalent term plan. In one real case, 1 crore cover for 30 years cost 3,16,332 a year as endowment versus 9,416 as term; the best illustrated payout of 2.14 crore gives about 5% a year on the difference, not guaranteed; such policies typically yield 3 to 5%. Whole-life policies cover until death or an age limit; once used to avoid estate duty, which no longer exists, they should be judged like any other savings policy.',
    source: SRC,
    asOf: '2025-12',
    topics: ['insurance', 'products', 'costs'],
    keywords: ['endowment policy', 'money back policy', 'whole life policy', 'traditional plan return', 'benefit illustration', 'IRR of insurance policy', 'LIC policy return'],
  },
  {
    id: 'xb-02-ulip-vs-term-plus-mf',
    title: 'ULIP versus term plan plus mutual fund',
    principle:
      'ULIPs deduct mortality and other charges from premiums and invest the rest in the buyer’s chosen debt or equity funds at a daily NAV; on death they pay the sum assured, the fund value, the higher of the two, or both (type II). Against term plus mutual fund: the separate route lets you pause investing or drop cover independently, has no lock-in, allows switching across fund houses, and offers far more transparency and competition; ULIPs lock in for 5 years, bundle cover you cannot drop, take charges by cancelling units, and allow tax-free switches within the insurer. Maturity is tax-free only if cover is at least 10 times premium, and for policies from 1 February 2021 with premiums above 2.5 lakh a year it is taxed as capital gains. A ULIP makes sense only if the cover itself is needed; for older, wealthier investors it is often extra cost.',
    source: SRC,
    asOf: '2025-12',
    topics: ['insurance', 'products', 'tax', 'mutual-funds'],
    keywords: ['ULIP vs mutual fund', 'term plus mutual fund', 'ULIP charges', 'ULIP tax', 'ULIP 2.5 lakh', 'mortality charge', 'buy term invest rest'],
  },
  {
    id: 'xb-02-mortgage-riders-group',
    title: 'Mortgage cover, riders and group insurance',
    principle:
      'Reducing (mortgage) term cover tracks a home loan’s balance; in theory cheaper, in practice often no cheaper than level term, and since loans are usually prepaid the reduced cover is wasted, so level term for the loan is often better. Riders, for extra premium: double sum assured; critical illness (paid on diagnosis plus 30 days’ survival; an accelerated version that reduces life cover is cheaper and often cheaper than a standalone critical-illness policy); accidental death or disability; waiver of premium on disability or income loss; guaranteed insurability to raise cover later without medicals; income benefit paying the nominee regularly. Employer group cover is cheaper and claims are easier.',
    source: SRC,
    topics: ['insurance', 'products', 'debt'],
    keywords: ['mortgage insurance', 'home loan insurance', 'decreasing term', 'riders', 'critical illness rider', 'waiver of premium', 'accidental death rider', 'group term insurance'],
  },
  {
    id: 'xb-02-loans-assignment',
    title: 'Policy loans, nomination and assignment',
    principle:
      'Pure term policies have no surrender value, so no loans; savings policies can be borrowed against, usually more cheaply from the insurer than from banks or NBFCs (a bank loan pledging several policies can be more convenient, and repaying one can rebuild a damaged credit score). Nominations can be made or changed any time; spouse, parent or child nominees are beneficial owners. Assignment transfers the policy’s rights, usually for a loan; it cancels the nomination unless the assignee is the insurer itself, the nomination revives on reassignment, and the insurer must record the assignment on written notice.',
    source: SRC,
    topics: ['insurance', 'debt', 'estate'],
    keywords: ['loan against LIC policy', 'policy loan', 'assignment', 'nomination', 'reassignment'],
  },
  {
    id: 'xb-02-mwpa',
    title: 'Life cover under the Married Women’s Property Act',
    principle:
      'A married man can buy any life policy, term included, under the MWP Act 1874, declared only at purchase. Beneficiaries must be the wife, children or both (not parents); they acquire all rights at once, cannot be changed (even after divorce), and the proceeds are beyond the reach of the insured and his creditors; any survival benefits go to them too. Since 2015 beneficial nominees reduce its role, but MWPA remains the way to ring-fence a family’s life cover from business or personal creditors.',
    source: SRC,
    topics: ['insurance', 'estate'],
    keywords: ['MWPA', 'Married Women’s Property Act', 'protect insurance from creditors', 'MWP policy', 'term plan for wife and children'],
  },
  {
    id: 'xb-02-choosing-policies',
    title: 'Choosing and structuring life cover',
    principle:
      'Premium rates are telescopic: per-thousand cost falls as cover rises, up to a point (say 2 crore), so 8 crore might be bought as four 2 crore policies from one insurer, letting you drop some as needs fall. Disclose all existing policies and pending proposals; omitting them is non-disclosure. Compare insurers on brand longevity, real availability of the cover and term sought, premium after underwriting (headline rates suit only very healthy people), riders, and IRDAI claim settlement ratio (less important if you disclosed fully). Online plans are often cheaper and quicker. Traditional plan maturity is taxable as other income for policies from April 2023 with premiums above 5 lakh a year. Defined-benefit cover pays worldwide. Residents may buy foreign-currency policies under the LRS (USD 250,000 a year) but foreign law governs claims and grievances.',
    source: SRC,
    asOf: '2025-12',
    topics: ['insurance', 'tax', 'products'],
    keywords: ['telescopic premium', 'multiple term policies', 'claim settlement ratio', 'online term plan', 'traditional policy tax 5 lakh', 'foreign life insurance LRS', 'NRI life cover abroad'],
  },
];
