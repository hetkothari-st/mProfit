/**
 * The investor rules the Finance Act 2026 (Act 4 of 2026, assent 30 March
 * 2026) changed from 1 April 2026, in our own words. Each replaces or
 * corrects what the Dec 2025 NISM X-B workbook teaches.
 */
import type { KnowledgeEntry } from '../library.js';

const ITA = 'Income-tax Act 2025';
const FA = 'Finance Act 2026';

export const FA2026_CHANGES: KnowledgeEntry[] = [
  {
    id: 'fa26-buyback',
    title: 'Share buybacks are taxed as capital gains again (from April 2026)',
    principle:
      'From 1 April 2026 money a shareholder receives when a company buys back its shares is a capital gain, not a dividend: the Finance Act 2026 deleted buyback proceeds from the definition of dividend (s.2(40)(f)) and rewrote s.69 of the Income-tax Act 2025 (formerly s.46A). The gain is proceeds minus the cost of the shares, short-term or long-term by holding period, taxed like any other sale of those shares. Promoters pay an additional tax on top: on short-term gains 2% if the promoter is a domestic company, 10% otherwise; on long-term gains 9.5% and 17.5%. This replaces the October 2024 rule, under which the whole amount was a dividend at slab rates and the cost became a separate capital loss.',
    inPractice:
      'For an ordinary investor, tendering in a buyback is now taxed like selling on the exchange: only the gain is taxed, at capital-gains rates. A buyback before 1 April 2026 still follows the 2024 dividend rule for that year.',
    source: { kind: 'LAW', instrument: FA, ref: 's.35, s.42 (ITA 2025 s.2(40), s.69)', date: '2026-04-01' },
    asOf: '2026-04',
    topics: ['tax', 'equity'],
    keywords: ['buyback tax', 'share buyback', 'buyback capital gains', 'buyback 2026', 'tender offer tax', 'promoter buyback tax', 'buyback dividend'],
  },
  {
    id: 'fa26-dividend-no-deduction',
    title: 'Dividend and mutual fund income: no deductions allowed (from April 2026)',
    principle:
      'Dividends from companies and income from mutual fund units are taxed in the investor’s hands as income from other sources at slab rates; non-residents pay 20% or the lower treaty rate. From 1 April 2026 no deduction at all is allowed against this income: the Finance Act 2026 replaced s.93(2) of the Income-tax Act 2025 (formerly s.57), removing the earlier allowance for interest on money borrowed to invest, which had been capped at 20% of the dividend. Only a commission paid to a banker to collect interest on securities remains deductible, and that is against interest, not dividends.',
    inPractice:
      'A client who borrowed to buy dividend shares or IDCW units can no longer set any of the loan interest against the dividend. Companies and funds still deduct TDS on dividends above the threshold.',
    source: { kind: 'LAW', instrument: FA, ref: 's.44 (ITA 2025 s.93)', date: '2026-04-01' },
    asOf: '2026-04',
    topics: ['tax', 'equity', 'mutual-funds'],
    keywords: ['dividend tax', 'dividend deduction', 'interest on loan dividend', 'borrowed to invest deduction', 'IDCW tax', 'dividend income slab', 'section 57 interest'],
  },
  {
    id: 'fa26-sgb',
    title: 'Sovereign Gold Bonds: tax-free only for the original holder to maturity',
    principle:
      'SGBs are RBI-issued government securities denominated in grams of gold, paying 2.5% a year on the issue price (taxable as interest) with an 8-year term and early redemption allowed from the fifth year. From 1 April 2026 redemption is free of capital gains tax only if an individual held the bond from its original issue until maturity (Income-tax Act 2025 s.70(1)(x), as substituted by the Finance Act 2026; formerly s.47(viic)). A bond bought on the stock exchange, or redeemed early, produces a taxable capital gain on redemption, as does a sale on the exchange: long-term after 12 months at 12.5%.',
    inPractice:
      'Buying old SGBs on the exchange no longer gives a tax-free exit at maturity; compare it with a gold ETF on cost and liquidity instead. No new SGB tranches have been issued since February 2024.',
    source: { kind: 'LAW', instrument: FA, ref: 's.43 (ITA 2025 s.70(1)(x))', date: '2026-04-01' },
    asOf: '2026-04',
    topics: ['tax', 'bonds', 'products'],
    keywords: ['SGB', 'sovereign gold bond', 'SGB tax free redemption', 'SGB bought on exchange', 'SGB secondary market tax', 'SGB maturity tax', 'gold bond tax'],
  },
  {
    id: 'fa26-stt',
    title: 'STT on futures and options went up (2026)',
    principle:
      'The Finance Act 2026 raised securities transaction tax on derivatives (Finance (No. 2) Act 2004, s.98, as amended): on selling an option, from 0.1% to 0.15% of the premium; on an option that is exercised, from 0.125% to 0.15% of the settlement price; on selling a future, from 0.02% to 0.05% of the price. STT on delivery and intraday trades in shares and on equity fund units is unchanged by this amendment. STT is not deductible when computing capital gains, but for an F&O trader it is a business expense.',
    inPractice:
      'For frequent option and futures traders this raises the break-even on every trade; include it when comparing a strategy’s expected edge with its costs.',
    source: { kind: 'LAW', instrument: FA, ref: 's.159 (Finance (No. 2) Act 2004 s.98)', date: '2026-03-30' },
    asOf: '2026-04',
    topics: ['tax', 'derivatives', 'costs'],
    keywords: ['STT', 'securities transaction tax', 'STT options', 'STT futures', 'STT F&O 2026', 'STT increase', 'option premium STT'],
  },
];
