import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-B',
  edition: '2025-12',
  chapter: 7,
  chapterTitle: 'Concepts in Taxation',
};

export const XB_07: readonly KnowledgeEntry[] = [
  {
    id: 'xb-07-framework-years-person',
    title: 'Tax framework: previous year, assessment year, person, income',
    principle:
      'Income tax is levied under the Income-tax Act 1961 (and its Rules), administered by the CBDT; the workbook reflects the law after the Finance Act 2025. Income is computed for a financial year (April to March), called the previous year; it is assessed in the following year, the assessment year (income of FY 2024-25 is assessed in AY 2025-26). "Person" includes individuals, HUFs, companies, firms and LLPs, AOPs and BOIs, local authorities and artificial juridical persons. "Income" is defined inclusively: business profits, dividends, capital gains, taxable gifts, property received below value and some perquisites.',
    inPractice:
      'The Income-tax Act 2025 replaces the 1961 Act from 1 April 2026 and renumbers sections (the workbook’s section numbers are 1961 Act numbers), so cite concepts rather than section numbers when the year matters, and defer to the app’s own tax calculations.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'regulation'],
    keywords: ['income tax act', 'previous year', 'assessment year', 'financial year', 'CBDT', 'assessee', 'definition of income', 'Income-tax Act 2025'],
  },
  {
    id: 'xb-07-residential-status',
    title: 'Residential status of individuals',
    principle:
      'Residence for tax is tested each financial year and differs from citizenship and from FEMA status (which governs what one may invest in or remit). Anyone in India 182 days or more is resident. Otherwise, 60 days in the year plus 365 days over the previous four years makes a person resident, except that for Indian citizens and PIOs visiting India, or citizens leaving for work abroad or as crew of Indian ships, the 60 days becomes 182; if their Indian income exceeds 15 lakh, 120 days applies for visitors. An Indian citizen with Indian income above 15 lakh who is not taxed anywhere else is deemed resident. A resident is "not ordinarily resident" (RNOR) if non-resident in 9 of the previous 10 years, or in India 729 days or less in the previous 7 years, or deemed resident; otherwise resident and ordinarily resident (ROR).',
    inPractice:
      'An HUF is resident unless its control and management is wholly abroad; its RNOR test looks at the Karta’s history.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax'],
    keywords: ['residential status', 'resident', 'non resident', 'RNOR', 'ROR', '182 days', '120 days', 'deemed resident', '15 lakh Indian income', 'NRI tax status', 'returning NRI'],
  },
  {
    id: 'xb-07-scope-of-income',
    title: 'What income is taxed for residents, RNORs and non-residents',
    principle:
      'A resident and ordinarily resident pays Indian tax on worldwide income. A resident but not ordinarily resident pays on income received or arising in India, plus foreign income only if it comes from a business controlled from India or a profession set up in India. A non-resident pays only on income received, or arising, in India. So a returning Indian is often RNOR for the first two years, keeping foreign interest out of Indian tax, then becomes ROR. Foreigners resident for years (182+ days each year) are ROR and taxed on, for example, rent from their home country.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax'],
    keywords: ['scope of total income', 'global income taxable', 'foreign income tax India', 'RNOR foreign income', 'NRI taxable income', 'returning NRI tax'],
  },
  {
    id: 'xb-07-salary-head',
    title: 'Income from salary: regimes, deductions and employer contributions',
    principle:
      'Salary needs an employer-employee relationship and is taxed on due or receipt, whichever comes first (ESOPs excepted). Standard deduction: 50,000 old regime, 75,000 new. HRA and LTA exemptions exist only in the old regime (HRA exempt is the lowest of HRA received, rent minus 10% of salary, and 50% of salary in Mumbai, Kolkata, Delhi or Chennai or 40% elsewhere). Employer NPS contributions are added to salary but deductible under 80CCD(2) up to 14% of salary in the new regime (10% for private employers in the old; 14% for government). Employer PF above 12% of salary is taxable. Employer contributions to EPF, NPS and superannuation together above 7.5 lakh a year are taxed as a perquisite, so high earners can end up taxed on part of their employer NPS. Employee 80C and 80CCD(1B) deductions apply only in the old regime.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax'],
    keywords: ['salary tax', 'standard deduction 75000', 'HRA exemption', 'old vs new regime', 'employer NPS 80CCD(2)', '7.5 lakh perquisite', 'LTA', 'new tax regime deductions'],
  },
  {
    id: 'xb-07-house-property',
    title: 'Income from house property',
    principle:
      'Taxed on the owner (including deemed owners: housing-society members, or someone who gifted the house to a spouse or minor child). Rent from vacant land or an under-construction building is not house-property income. Up to two non-let houses may be treated as self-occupied (from FY 2025-26, for any reason they are not let out); other non-let houses are deemed let out at reasonable rent. Let-out: annual value (higher of expected and actual rent) less municipal taxes paid, less 30% standard deduction, less full loan interest. Self-occupied: annual value nil; interest deductible up to 2 lakh only in the old regime (30,000 if construction took over five years; pre-construction interest in five instalments); nothing in the new regime. A house-property loss offsets other income up to 2 lakh a year only in the old regime; the rest carries forward 8 years against house-property income.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'real-estate'],
    keywords: ['house property income', 'home loan interest deduction', 'section 24', '2 lakh interest', 'self occupied property', 'deemed let out', 'rental income tax', '30% standard deduction', 'house property loss'],
  },
  {
    id: 'xb-07-business-capital-gains-other',
    title: 'Business income, capital gains and other sources',
    principle:
      'Business or profession: revenue receipts less allowed expenses and depreciation, on the accounting method used; some taxpayers may use presumptive schemes (not for commission or brokerage income). Transactions in commodities or shares settled without delivery are speculative (hedging and exchange derivatives are not); speculative losses only offset speculative profits and carry forward 4 years. Capital gains: sale price less transfer costs, cost of acquisition and improvement, less available exemptions; short or long term by holding period. Other sources: dividends, lottery and online-game winnings, interest on securities, rent from machinery or furniture, key-person policy proceeds, taxable gifts and property received below value, and life policy proceeds above premiums where not exempt.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'derivatives'],
    keywords: ['five heads of income', 'business income', 'speculative income', 'intraday tax', 'presumptive taxation', 'income from other sources', 'capital gains head'],
  },
  {
    id: 'xb-07-clubbing',
    title: 'Clubbing of income',
    principle:
      'To stop people shifting income to relatives, income is added to the transferor’s income under the same head: income transferred without the asset itself; income from assets transferred to a spouse or son’s wife without adequate consideration; a minor child’s income (with exceptions); and income from property gifted to an HUF. Gifting 30 lakh to a wife who earns 1.5 lakh of interest on it means the husband pays tax on that 1.5 lakh at his slab rate. Losses are clubbed too.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax', 'planning'],
    keywords: ['clubbing of income', 'gift to wife tax', 'minor income clubbing', 'income of spouse', 'section 64', 'invest in wife name'],
  },
  {
    id: 'xb-07-set-off-carry-forward',
    title: 'Set-off and carry-forward of losses',
    principle:
      'Short-term capital losses offset any capital gain; long-term capital losses only long-term gains; neither offsets other heads. Unused capital losses carry forward 8 years under the same rules, only if the return is filed by the due date. Business losses offset any income except salary in the same year and carry forward 8 years against business income; speculative losses only against speculative profits, for 4 years; unabsorbed depreciation carries forward indefinitely. House-property losses offset other heads up to 2 lakh (old regime only) and carry forward 8 years against house property. Losses under other sources offset other income in the year but cannot be carried forward.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax'],
    keywords: ['set off losses', 'carry forward losses', 'capital loss set off', 'LTCL STCL', 'eight years carry forward', 'tax loss harvesting rules', 'speculative loss'],
  },
  {
    id: 'xb-07-deductions-rebate',
    title: 'Chapter VI-A deductions and the 87A rebate',
    principle:
      'Old regime only: 80C (insurance, PPF, EPF, ELSS, home-loan principal, tax-saver FDs; 1.5 lakh shared with 80CCC and 80CCD(1)); 80CCD(1B) NPS extra 50,000; 80D health insurance (up to 75,000 or 1 lakh including senior-citizen parents); 80DD and 80U disability; 80DDB specified illnesses; 80E education-loan interest without limit; 80EEB EV loan interest; 80G donations; 80GG rent without HRA; 80TTA savings interest 10,000; 80TTB senior citizens’ interest 50,000. Allowed in the new regime too: 80CCD(2) employer NPS and 80CCH Agniveer. Rebate under 87A: in the new regime from FY 2025-26, tax is nil up to 12 lakh of income (rebate up to 60,000), with marginal relief just above (up to about 12.71 lakh tax cannot exceed the excess over 12 lakh); old regime, up to 12,500 for income up to 5 lakh. The rebate does not reduce tax on equity long-term gains under section 112A.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax'],
    keywords: ['80C', '80D', '80CCD(1B)', '80TTA', '80TTB', '80E', 'section 87A rebate', '12 lakh tax free', 'new regime rebate', 'marginal relief', 'deductions old regime'],
  },
  {
    id: 'xb-07-computing-tax',
    title: 'From gross total income to tax payable',
    principle:
      'Compute income under the five heads; add clubbed income; set off current and brought-forward losses: that is gross total income. Subtract Chapter VI-A deductions to get total income. Apply slab rates (or the 115BAC new-regime rates) and special rates for items like capital gains; add surcharge and 4% health and education cess; subtract rebates and reliefs (section 89 arrears relief, foreign tax credit, AMT credit); add interest and late fees; subtract advance tax, TDS, TCS and self-assessment tax to get tax payable or refundable.',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax'],
    keywords: ['gross total income', 'total income', 'how income tax is calculated', 'surcharge', 'cess 4%', 'advance tax', 'TDS credit'],
  },
  {
    id: 'xb-07-dtaa',
    title: 'Double taxation avoidance agreements',
    principle:
      'Countries tax either by residence (worldwide income of residents) or by source (income arising in their territory); India does both, so income can be taxed twice, as with an Indian resident’s US rental income. DTAAs between countries allocate taxing rights or, more often, require the residence country to give credit for tax paid in the source country. An Indian student who is ROR in the year he leaves pays Indian tax on French earnings with credit for French tax; a returning expatriate who becomes ROR pays Indian tax on UK bond interest with credit for UK tax.',
    source: SRC,
    topics: ['tax'],
    keywords: ['DTAA', 'double taxation', 'foreign tax credit', 'tax on foreign income', 'residence based taxation', 'source based taxation'],
  },
  {
    id: 'xb-07-eee-mmr-effective-rate',
    title: 'EEE, EET, ETE; maximum marginal and effective tax rates',
    principle:
      'Investments are labelled by tax at three stages, investing, earning and withdrawing (E exempt, T taxed): PPF is EEE, ELSS EET, five-year tax-saver FDs and SCSS ETE; in the new regime the first E falls away, so many become TEE. The maximum marginal rate is the top slab rate with the highest surcharge and cess: 30% plus a 37% surcharge (11.1%) plus 4% cess = 42.744% under the old regime (the new regime caps surcharge at 25%, about 39%). Effective rate = rate x (1 + surcharge) x (1 + cess), so a firm earning over 1 crore pays 30% x 1.12 x 1.04 = 34.944%; for an individual it is total tax / total income (4,29,000 on 20 lakh = 21.45%).',
    source: SRC,
    asOf: '2025-12',
    topics: ['tax'],
    keywords: ['EEE', 'EET', 'ETE', 'maximum marginal rate', '42.744%', 'effective tax rate', 'surcharge 37%', 'surcharge 25% new regime'],
  },
];
