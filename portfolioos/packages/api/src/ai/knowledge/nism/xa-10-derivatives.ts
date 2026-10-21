import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 10,
  chapterTitle: 'Understanding Derivatives',
};

export const XA_10: readonly KnowledgeEntry[] = [
  {
    id: 'xa-10-what-derivatives-are',
    title: 'What a derivative is, legally and economically',
    principle:
      'A derivative is a contract whose value comes from an underlying asset: metals, energy, farm produce, shares, bonds, rates or currencies. SCRA treats derivatives (instruments derived from securities or loans, and contracts valued from prices or indices of securities) as securities, so they fall under its regulation; Section 45U(a) of the RBI Act defines rate, currency and credit derivatives such as swaps, FRAs and currency options for RBI’s purposes. Before taxes and costs, a derivative is a zero-sum game: one side’s gain is the other’s loss.',
    source: SRC,
    topics: ['derivatives'],
    keywords: ['derivative', 'underlying', 'zero sum game', 'SCRA derivative definition', 'RBI Act 45U'],
  },
  {
    id: 'xa-10-settlement-margins-oi',
    title: 'Settlement, margins and open interest',
    principle:
      'Cash settlement pays only the price difference; SEBI has moved all stock derivatives to physical settlement (delivery of shares). Initial margin, set by SPAN plus an extreme-loss margin, must be paid before trading and should cover losses in about 99% of cases, rising with volatility; option buyers also pay a premium margin equal to the premium. Open interest is the number of outstanding contracts not yet closed; it changes only when new positions are created or existing ones closed, and rising open interest signals new money entering. It is not the same as volume.',
    source: SRC,
    asOf: '2025-06',
    topics: ['derivatives', 'operations'],
    keywords: ['cash settlement', 'physical settlement', 'SPAN margin', 'extreme loss margin', 'initial margin', 'premium margin', 'open interest', 'volume'],
  },
  {
    id: 'xa-10-forwards-vs-futures',
    title: 'Forwards versus futures',
    principle:
      'A forward is a private, over-the-counter agreement to buy or sell an asset later at a price fixed today, with every term negotiable; it locks the price but is illiquid, opaque, hard to settle and carries counterparty (default) risk, since the losing side may walk away. Futures are standardised forwards traded on an exchange: quantity, quality and dates are fixed by the exchange, price is discovered by open bidding, both sides post margins, and the clearing corporation is counterparty to both, guaranteeing settlement. The buyer is long, the seller short.',
    source: SRC,
    topics: ['derivatives'],
    keywords: ['forward contract', 'futures contract', 'OTC', 'exchange traded', 'counterparty risk', 'standardised', 'long position', 'short position'],
  },
  {
    id: 'xa-10-options-basics',
    title: 'Options: calls, puts, moneyness, intrinsic and time value',
    principle:
      'An option gives its buyer (holder) the right but not the obligation to buy (call) or sell (put) the underlying at the strike price on or before expiry, for a premium; the seller (writer) must perform if exercised. A call is in the money when the market price is above the strike, at the money when equal, out of the money when below; a put is the reverse. Intrinsic value is the amount by which it is in the money (zero otherwise); time value is the premium above intrinsic value, paid for the chance of gaining before expiry, and shrinks as expiry nears. Indian stock and index options are mostly European (exercisable at expiry).',
    inPractice:
      'Worked figure: a call with strike 500 when the stock is 530 has intrinsic value 30; if it trades at 42, time value is 12.',
    source: SRC,
    asOf: '2025-06',
    topics: ['derivatives'],
    keywords: ['options', 'call option', 'put option', 'strike price', 'premium', 'in the money', 'at the money', 'out of the money', 'intrinsic value', 'time value', 'European option', 'option writer'],
  },
  {
    id: 'xa-10-option-payoffs',
    title: 'Option payoffs are asymmetric',
    principle:
      'An option buyer’s loss is limited to the premium paid while the gain depends on how far the underlying moves in the money. An option seller’s maximum gain is the premium received while the potential loss is theoretically unlimited for a written call (and large for a written put); writers of American options can be assigned at any time. Futures, by contrast, have symmetric payoffs for both sides. Both futures and options can hedge an existing position.',
    source: SRC,
    topics: ['derivatives', 'risk'],
    keywords: ['option payoff', 'limited loss', 'unlimited loss', 'option seller risk', 'asymmetric payoff', 'hedging with options'],
  },
  {
    id: 'xa-10-swaps-fimmda',
    title: 'Swaps and FIMMDA',
    principle:
      'A swap exchanges cash flows on future dates; interest-rate and currency swaps are most common. In a plain interest-rate swap one party pays fixed and receives floating on an agreed notional principal that is never exchanged; a floating-rate borrower can thereby convert the loan into a fixed-rate obligation. Swaps are OTC but follow dealer-association rules. FIMMDA (Fixed Income Money Market and Derivatives Association of India), a voluntary body of banks, FIs and primary dealers, represents these markets to regulators, develops benchmarks and products, trains dealers, sets codes, standard documents and best practices, and arbitrates member disputes.',
    source: SRC,
    topics: ['derivatives', 'bonds'],
    keywords: ['swap', 'interest rate swap', 'currency swap', 'notional principal', 'fixed for floating', 'FIMMDA'],
  },
  {
    id: 'xa-10-otc-vs-exchange-uses',
    title: 'OTC versus exchange-traded, and why derivatives are used',
    principle:
      'OTC derivatives are bespoke and rely on counterparties trusting each other, so they stay among institutions; exchange-traded derivatives are standardised and cleared through a clearing house with margins, so strangers can trade. India trades index, stock, interest-rate and commodity derivatives on exchanges, with commodity forwards and rate swaps OTC. Uses: hedging (protecting an existing holding’s value), speculation (a leveraged view without owning the underlying, bearing margin costs) and arbitrage (exploiting price gaps for the same asset across markets until the law of one price restores them, net of costs).',
    source: SRC,
    topics: ['derivatives'],
    keywords: ['hedging', 'speculation', 'arbitrage', 'law of one price', 'OTC derivatives', 'exchange traded derivatives'],
  },
  {
    id: 'xa-10-benefits-risks-rdd',
    title: 'Benefits and risks of derivatives; the risk disclosure document',
    principle:
      'Benefits: better risk management with symmetric or asymmetric payoffs, deeper liquidity and lower trading costs in the underlying market, and wider participation and price discovery. Because derivatives are leveraged they carry counterparty, price, liquidity, legal or regulatory and operational risks, and may not suit people with limited resources, little experience or low risk tolerance. Clients must read the Model Risk Disclosure Document their broker provides before trading in cash or F&O segments.',
    source: SRC,
    topics: ['derivatives', 'risk', 'regulation'],
    keywords: ['derivatives risks', 'leverage', 'risk disclosure document', 'suitability F&O', 'retail F&O losses'],
  },
  {
    id: 'xa-10-commodity-currency-derivatives',
    title: 'Commodity and currency derivatives',
    principle:
      'Commodity futures specify quantity, quality, delivery place and time and daily price limits, letting farmers, traders and processors hedge (a biscuit maker can lock today’s price for future wheat). They trade on SEBI-registered exchanges: MCX, NCDEX, ICEX, NSE and BSE, across bullion, metals, energy and agriculture. Currency derivatives (forwards, futures, swaps, options) have an exchange rate as the underlying; Indian exchanges list USD, EUR, GBP and JPY against INR plus cross pairs EUR-USD, GBP-USD and USD-JPY. Currency futures fix a future exchange rate; currency options give the right to exchange at a set rate for a premium.',
    source: SRC,
    topics: ['derivatives', 'markets'],
    keywords: ['commodity derivatives', 'commodity futures', 'MCX', 'NCDEX', 'currency derivatives', 'currency futures', 'USD INR futures', 'cross currency'],
  },
  {
    id: 'xa-10-futures-pricing-basis-arbitrage',
    title: 'Futures pricing, basis, convergence and cash-futures arbitrage',
    principle:
      'Futures price = spot price + cost of carry (the market financing cost until expiry), otherwise arbitrage would be possible. Basis = futures - spot (positive when futures trade above spot). On expiry spot and futures converge to the same price. If futures trade above spot by more than the carry cost, buying spot and selling futures locks in the gap: annualised return = (futures - spot) / spot x 365 / days to expiry. Worked figure: spot 2,000, one-month futures 2,016, 30 days to expiry gives about 9.7% a year. Arbitrage funds run this trade.',
    source: SRC,
    asOf: '2025-06',
    topics: ['derivatives', 'mutual-funds'],
    keywords: ['futures pricing', 'cost of carry', 'basis', 'convergence', 'cash futures arbitrage', 'arbitrage fund', 'spot futures'],
  },
];
