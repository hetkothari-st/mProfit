import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 4,
  chapterTitle: 'Debt Management and Loans',
};

export const XA_04: readonly KnowledgeEntry[] = [
  {
    id: 'xa-04-why-debt',
    title: 'When debt makes sense',
    principle:
      'Debt funds goals that savings cannot reach in time, a home being the classic case (secured by a mortgage on it). Debt is not inherently bad; what it buys matters. Borrowing can raise returns through leverage, and sometimes a loan beats drawing down investments: an education loan repaid from the child’s future income can be better than breaking a retirement corpus, which keeps compounding. Short-term borrowing can bridge a genuine emergency or timing gap. The test is whether income can bear the interest and repayment.',
    source: SRC,
    topics: ['debt'],
    keywords: ['why borrow', 'good debt', 'bad debt', 'education loan vs retirement', 'leverage', 'mortgage'],
  },
  {
    id: 'xa-04-consumption-vs-investment',
    title: 'Consumption spending versus investment spending; pay yourself first',
    principle:
      'Consumption spending (dining out, clothes, salon) creates no income-producing asset; investment spending (a bond, a property) does. Some spending that looks like consumption, such as children’s education, can be an investment if it lifts future family income. Fund goals before discretionary spending: income minus savings equals expenses, not income minus expenses equals savings. An automatic SIP from the salary account enforces this. Zero-base budgeting (justify every line afresh rather than adjust last year’s) works for households too.',
    source: SRC,
    topics: ['savings', 'sip'],
    keywords: ['consumption expenditure', 'investment expenditure', 'pay yourself first', 'income minus savings', 'zero base budgeting', 'SIP auto debit'],
  },
  {
    id: 'xa-04-budget-holes-windfalls',
    title: 'Finding leaks in the budget; handling windfalls',
    principle:
      'Common leaks: misclassifying discretionary items as essential, padded allocations, not paying yourself first, and untracked card spending. Have the client log every expense above a threshold suited to their income and review the month’s total; the scale of eating out or gadget upgrades is often a surprise. A windfall (bonus, inheritance, lottery) should mostly be saved since the family already lives without it; park it in safe liquid assets until deployed, and consider prepaying expensive loans. Never plan on windfalls recurring.',
    source: SRC,
    topics: ['savings', 'debt'],
    keywords: ['budget leaks', 'expense tracking', 'windfall', 'bonus', 'inheritance', 'prepay loan', 'gadget spending'],
  },
  {
    id: 'xa-04-purpose-cost-tenor',
    title: 'Judging a loan: purpose, cost and tenor',
    principle:
      'Purpose: borrow for appreciating assets or to raise earning power (education); avoid funding volatile investments with debt (margin trading magnifies losses because interest is owed regardless) and never borrow for routine expenses, which signals a debt trap. Cost: secured and education loans are cheaper; personal loans and credit cards are dear. A card is interest-free only if the full bill is paid by the due date; revolving credit at about 3% a month compounds to roughly 42.6% a year, and informal lenders can charge 60 to 80%. Tenor: shorter tenors raise the instalment, longer tenors raise total interest; size the tenor to repayment capacity using the debt-to-income ratio.',
    source: SRC,
    asOf: '2025-06',
    topics: ['debt'],
    keywords: ['loan purpose', 'cost of debt', 'loan tenure', 'revolving credit', 'credit card interest', 'margin funding', 'debt trap', 'moneylender'],
  },
  {
    id: 'xa-04-debt-rescheduling',
    title: 'Getting out of unmanageable debt',
    principle:
      'Act early. Rank debts by cost and clear the dearest first (cards, personal loans), leaving cheap or tax-advantaged debt like home and education loans for later; sell an asset bought with debt if it has realisable value, allowing for prepayment charges; refinance costly debt with a cheaper loan (a card balance transfer, for instance); extend the tenor to cut the monthly outgo, accepting more total interest; or, failing all else, negotiate a revised schedule with the lender, knowing that a restructured loan hurts the credit score and future borrowing cost.',
    source: SRC,
    topics: ['debt'],
    keywords: ['debt restructuring', 'debt rescheduling', 'refinance', 'balance transfer', 'extend tenure', 'clear costly debt first', 'credit score impact'],
  },
  {
    id: 'xa-04-credit-score',
    title: 'Credit scores and credit bureaus',
    principle:
      'Credit information companies, licensed by RBI under the Credit Information Companies (Regulation) Act 2005, compile monthly lender data into a credit report and score (CIBIL’s runs from 300 to 900) used to decide eligibility, rate and limits. The score rises with on-time payment, low utilisation of limits, a sensible mix of secured and unsecured credit, and few enquiries; it is also affected by loans you co-sign or guarantee. Everyone is entitled to one free full credit report a year (calendar year) from each bureau (CIBIL, Experian, CRIF High Mark, Equifax), with a way to correct errors. Check it periodically, and use only the bureau or genuine tie-ups to avoid scams.',
    source: SRC,
    asOf: '2025-06',
    topics: ['debt', 'regulation'],
    keywords: ['credit score', 'CIBIL', 'credit report', 'credit bureau', 'Experian', 'Equifax', 'CRIF', 'free credit report', 'credit utilisation', '300 to 900'],
  },
  {
    id: 'xa-04-secured-unsecured',
    title: 'Secured versus unsecured loans',
    principle:
      'A secured loan is backed by an asset the lender can sell on default (home loan, vehicle loan, gold loan, loan against securities or property), so it is cheaper. An unsecured loan rests only on the borrower’s promise (personal loan, credit-card dues, P2P), so it costs much more. Build long-term assets with secured borrowing and keep unsecured debt minimal, clearing card dues before interest starts.',
    source: SRC,
    topics: ['debt'],
    keywords: ['secured loan', 'unsecured loan', 'collateral', 'personal loan', 'gold loan', 'loan against property', 'credit card'],
  },
  {
    id: 'xa-04-loan-terms-rates',
    title: 'Fixed and floating rates, LAP, hire purchase, lease, amortisation',
    principle:
      'Fixed-rate loans lock the rate for the term; useful when rates are low. Floating-rate loans reset with a benchmark: an external one such as the repo rate, or the bank’s internal MCLR; usually chosen for long loans, especially when rates are expected to fall. A loan against property (home equity loan) uses real estate as collateral for any purpose. Hire purchase transfers ownership after the last instalment; a lease never transfers ownership to the lessee. Amortisation repays principal through equal EMIs whose interest share is high early and shrinks over time.',
    source: SRC,
    topics: ['debt'],
    keywords: ['fixed rate', 'floating rate', 'repo linked', 'MCLR', 'external benchmark', 'loan against property', 'home equity loan', 'hire purchase', 'lease', 'amortisation', 'amortization schedule'],
  },
  {
    id: 'xa-04-refinance-prepay-pre-emi-moratorium',
    title: 'Refinancing, prepayment, pre-EMI interest and moratoriums',
    principle:
      'Refinancing replaces a loan with a cheaper one; worth it for large, long balances when the rate gap is meaningful. Prepayment repays principal early and shortens the remaining tenure; some loans restrict it or charge for it (car loans), but RBI bars prepayment charges on floating-rate home loans to individuals from banks. Pre-EMI is interest-only payment while an under-construction home’s loan is partly disbursed; full EMIs start later. A moratorium pauses repayments in exceptional conditions without counting as default or hurting the score, but interest keeps compounding and must be repaid later (as many discovered after the Covid moratorium).',
    source: SRC,
    asOf: '2025-06',
    topics: ['debt', 'regulation'],
    keywords: ['refinancing', 'prepayment', 'prepayment penalty', 'foreclosure charges', 'pre-EMI', 'moratorium', 'Covid moratorium', 'home loan transfer'],
  },
  {
    id: 'xa-04-mortgage-pledge-hypothecation',
    title: 'Mortgage, pledge and hypothecation',
    principle:
      'A mortgage is a charge on immovable property (a home loan). A pledge is on a movable asset that the lender holds until repayment (gold with a lender, pledged shares). Hypothecation creates a charge on a movable asset that stays with the borrower; on default the lender must first repossess it, the typical case being a car loan.',
    source: SRC,
    topics: ['debt'],
    keywords: ['mortgage', 'pledge', 'hypothecation', 'charge', 'car loan hypothecation', 'repossess', 'collateral types'],
  },
  {
    id: 'xa-04-types-of-borrowing',
    title: 'Asset-linked loans: home, education, vehicle, business',
    principle:
      'Home loans: long (up to 30 to 35 years, within working-age limits), large, secured by the property whose documents the lender holds. Education loans: usually 5 to 8 years, repayment starting after the course or once the student earns, interest accruing meanwhile; repayable by parent or student. Vehicle loans: 3 to 7 years against a depreciating, hypothecated vehicle; a longer tenor lowers the EMI but raises total interest. Business loans: judged on the business’s working capital, turnover ratios and balance sheet, sometimes secured by stock or other assets, often as a limit drawn as needed.',
    source: SRC,
    asOf: '2025-06',
    topics: ['debt'],
    keywords: ['home loan', 'education loan', 'vehicle loan', 'car loan', 'business loan', 'loan tenure', 'working capital'],
  },
  {
    id: 'xa-04-types-of-borrowing-flexible',
    title: 'Flexible credit: personal loans, cards, overdrafts, secured-by-asset loans, P2P',
    principle:
      'Personal loans: unsecured, any purpose, expensive and easy to overuse. Credit cards: free if the full bill is paid by the due date, otherwise the costliest borrowing of all. Overdrafts: draw beyond the balance up to a limit, usually against an FD, paying interest only for the days overdrawn; common for businesses. Loans against securities, mutual funds, gold or property: a percentage of value per RBI norms with margin calls if prices fall, and far cheaper than personal loans or cards. P2P loans: individuals lend directly through registered platforms; unsecured, small, short and high-rate, with real default risk for the lender.',
    source: SRC,
    asOf: '2025-06',
    topics: ['debt'],
    keywords: ['personal loan', 'credit card', 'overdraft', 'loan against securities', 'loan against mutual funds', 'gold loan', 'P2P lending', 'peer to peer'],
  },
  {
    id: 'xa-04-rest-and-dsr',
    title: 'Interest rest periods and the debt-servicing ratio',
    principle:
      '"Rest" is how often the lender recalculates interest on the balance. With annual rest and monthly payments, the balance is reduced only once a year, so the effective cost is higher than the quoted rate; monthly rest is better for the borrower. The debt-servicing ratio (all EMIs / monthly income) can be lowered by a longer tenor, a lower rate, or borrowing less; add every loan’s EMI when computing it.',
    source: SRC,
    topics: ['debt'],
    keywords: ['rest period', 'annual rest', 'monthly rest', 'reducing balance', 'debt servicing ratio', 'effective interest rate'],
  },
  {
    id: 'xa-04-restructuring-pv',
    title: 'Judge a loan restructuring by present value, not the new EMI',
    principle:
      'When income falls, lenders may restructure: lower EMIs, longer tenor, a rate cut, a haircut on the amount, or an extra loan. A lower EMI over more months can leave the present value of payments unchanged; only a reduced principal or rate, or fewer payments without a higher instalment, actually lowers the burden. Compare the present value of the old and new payment streams at the loan rate, as well as monthly affordability. Worked figure: 4 lakh at 8% over 36 months is an EMI of about 12,535; stretched to 60 months it falls to about 8,111 with the same present value.',
    source: SRC,
    asOf: '2025-06',
    topics: ['debt', 'compounding'],
    keywords: ['loan restructuring', 'present value of payments', 'haircut', 'EMI reduction', 'tenure extension', 'NPA'],
  },
  {
    id: 'xa-04-ppmt-ipmt',
    title: 'Splitting an EMI into principal and interest',
    principle:
      'Excel’s PPMT gives the principal part and IPMT the interest part of a given instalment; PMT gives the EMI. Early EMIs are mostly interest. A lower rate shifts more of each EMI to principal from the very first instalment; a higher rate does the reverse. First-month interest on a loan = balance x annual rate / 12. Worked figure: 12 lakh at 8% for 10 years, EMI about 14,559, of which the first month’s interest is 8,000 and principal 6,559.',
    source: SRC,
    asOf: '2025-06',
    topics: ['debt'],
    keywords: ['PPMT', 'IPMT', 'principal component', 'interest component', 'amortisation schedule', 'EMI breakup'],
  },
  {
    id: 'xa-04-evaluating-loans',
    title: 'Criteria for comparing loans',
    principle:
      'Compare: the rate and its basis (reducing balance, not flat on original principal); the reset frequency (long resets delay the benefit of rate cuts but also of rises); processing, legal and other charges, sometimes waived; the tenor on offer; and the benchmark: an external benchmark like the repo rate transmits changes quickly and transparently in both directions, while internal benchmarks lag. Banks now mostly offer floating rather than fixed home loans.',
    source: SRC,
    topics: ['debt'],
    keywords: ['compare loans', 'flat rate vs reducing', 'reset period', 'processing fee', 'external benchmark', 'repo rate linked loan'],
  },
  {
    id: 'xa-04-emi-or-tenure',
    title: 'When rates change: adjust the EMI or the tenure?',
    principle:
      'For floating loans the borrower can absorb a rate change in the EMI or in the tenure. Keeping the EMI fixed and letting tenure move is usually easier to budget and avoids distress when rates rise. After a large fall in rates (tenure already much shorter), or when the EMI is straining the budget, a one-time EMI reduction can make sense. Conversely, when rates rise, letting tenure stretch keeps cash flow stable but raises total interest.',
    source: SRC,
    topics: ['debt'],
    keywords: ['change EMI or tenure', 'rate hike', 'rate cut', 'floating rate home loan', 'tenure extension'],
  },
  {
    id: 'xa-04-invest-or-prepay',
    title: 'Invest a lump sum or prepay the loan?',
    principle:
      'Weigh: the strain of the debt (peace of mind can justify prepaying); the size of the sum relative to the loan (a sum that clears most of it brings debt freedom early; a small one barely moves a large loan); the loan rate versus the realistic long-term return, remembering that investments compound while a loan’s interest falls as it is repaid; and the risk of the investment. Expensive card or personal-loan debt should almost always be repaid; a cheap home loan (say 7 to 8%) versus equity expected near 12% may favour investing, accepting equity risk.',
    source: SRC,
    asOf: '2025-06',
    topics: ['debt', 'goals'],
    keywords: ['prepay or invest', 'pay off home loan', 'lump sum', 'loan vs investment return', 'debt free'],
  },
  {
    id: 'xa-04-avalanche-snowball-blizzard',
    title: 'Avalanche, snowball and blizzard repayment strategies',
    principle:
      'Avalanche: pay extra on the highest-interest debt first; the cheapest strategy mathematically (card, then personal loan, then car loan, then home loan). Snowball: clear the smallest balance first regardless of rate and roll its payment into the next; motivating but can leave costly debt outstanding. Blizzard: start with the smallest balance for a quick win, then switch to avalanche order.',
    inPractice:
      'With a card at 40%, a personal loan at 20%, a car loan at 11% and a home loan at 8.5%, avalanche order is exactly that sequence.',
    source: SRC,
    asOf: '2025-06',
    topics: ['debt'],
    keywords: ['avalanche method', 'snowball method', 'blizzard method', 'debt repayment strategy', 'highest interest first', 'smallest balance first', 'pay off debt faster'],
  },
];
