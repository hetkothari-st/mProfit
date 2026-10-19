import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 6,
  chapterTitle: 'Securities Market Segments',
};

export const XA_06: readonly KnowledgeEntry[] = [
  {
    id: 'xa-06-primary-market-functions',
    title: 'The primary market and why companies go public',
    principle:
      'In the primary (new issue) market investors buy securities directly from the issuer, letting a company raise capital from outside investors beyond its promoters ("going public"). Benefits: wider and cheaper sources of capital, transparent market-based pricing (government securities by RBI auction, equity by book building), diversified ownership with professional management and independent directors, stricter disclosure, scrutiny by many investors and analysts, an exit for early investors, liquidity because public issues must be listed, and regulatory supervision of the whole process. None of this guarantees returns.',
    source: SRC,
    topics: ['markets', 'equity'],
    keywords: ['primary market', 'new issue market', 'going public', 'IPO benefits', 'listing', 'disclosure'],
  },
  {
    id: 'xa-06-types-of-issues',
    title: 'Public issue, private placement, preferential, QIP, rights and bonus',
    principle:
      'Public issue: an IPO (first offer by an unlisted company, including an offer for sale by existing holders) or an FPO (further offer by a listed company). Private placement: wholesale issue to select investors, mainly institutions, by an unlisted company. Preferential issue: a listed company’s private placement to chosen persons under SEBI rules (excluding ESOPs, sweat equity and overseas depository receipts). Qualified institutions placement (QIP): a listed company’s private placement to qualified institutional buyers such as mutual funds, FPIs and insurers. Rights issue: new shares offered to existing holders in a ratio at a set price. Bonus issue: free shares to existing holders.',
    source: SRC,
    topics: ['markets', 'equity'],
    keywords: ['IPO', 'FPO', 'further public offer', 'private placement', 'preferential issue', 'QIP', 'qualified institutions placement', 'QIB', 'rights issue', 'bonus issue'],
  },
  {
    id: 'xa-06-issuers',
    title: 'Who issues securities',
    principle:
      'Under SEBI ICDR Regulations 2018 an issuer is a body authorised to issue securities. Governments issue G-secs: the Centre issues treasury bills (91, 182 and 364 days) and dated securities; states issue only dated State Government Securities; G-secs carry no default risk ("gilt-edged"). PSUs issue shares (government stake sales are disinvestment) and bonds, including 54EC capital-gains bonds (still issued) and tax-free bonds (no fresh issues for years, traded on exchanges). Private companies issue equity, preference shares, convertibles, corporate bonds and commercial paper. Banks, FIs and NBFCs issue equity, bonds, CPs, CDs and securitised paper. Mutual funds raise money through NFOs; REITs and InvITs issue listed units with higher minimum investment; AIFs raise money only by private placement.',
    source: SRC,
    asOf: '2025-06',
    topics: ['markets', 'bonds'],
    keywords: ['issuer', 'G-sec', 'treasury bill', 'state development loan', 'SGS', 'PSU', 'disinvestment', '54EC bonds', 'tax free bonds', 'commercial paper', 'NFO', 'REIT', 'InvIT', 'ICDR'],
  },
  {
    id: 'xa-06-ipo-fresh-vs-ofs',
    title: 'Fresh issue versus offer for sale',
    principle:
      'In a fresh issue the company creates new shares: its share capital rises, the money goes to the company, and existing holders are diluted. In an offer for sale, existing holders (promoters, institutions, the government in a disinvestment) sell their shares: share capital is unchanged and the proceeds go to the sellers, not the company. An IPO or FPO can combine both. An FPO via offer for sale is often used to raise public shareholding to the listing requirement or for promoters to sell after their lock-in.',
    source: SRC,
    topics: ['markets', 'equity'],
    keywords: ['offer for sale', 'OFS', 'fresh issue', 'dilution', 'IPO proceeds', 'promoter selling', 'disinvestment'],
  },
  {
    id: 'xa-06-book-building',
    title: 'Fixed-price and book-built issues',
    principle:
      'In a fixed-price issue the issuer and lead manager set the price in advance and justify it. In book building, investors bid within a price band (cap up to 20% above the floor) or above a floor price; the cut-off is the price at which the full issue is subscribed, and everyone who bid at or above it is allotted at the cut-off. Retail investors may bid "at cut-off" so their bid always qualifies, and may be offered a discount of up to 10% to the price for others. Example of finding cut-off: for 8,000 shares offered, cumulative demand of 3,000 at 210, 6,000 at 205 and 9,000 at 200 sets the cut-off at 200.',
    source: SRC,
    asOf: '2025-06',
    topics: ['markets', 'equity'],
    keywords: ['book building', 'price band', 'cut-off price', 'floor price', 'fixed price issue', 'bid at cut-off', 'retail discount'],
  },
  {
    id: 'xa-06-ipo-regulation-asba',
    title: 'Applying to an IPO: prospectus, ASBA, UPI, lots and allotment',
    principle:
      'Public issues follow SEBI ICDR Regulations 2018 and the Companies Act (and RBI rules for non-residents): eligibility on net worth and profit track record, timelines and use of funds. The issuer files a draft prospectus (offer document) with SEBI, then the final one with the RoC, SEBI and the exchange. Every application must use ASBA, which blocks the money in the investor’s bank account until allotment; retail investors can use UPI to block funds. The minimum bid lot keeps the application value within 10,000 to 15,000. Oversubscribed issues are allotted proportionately with refunds; shares are credited to demat accounts.',
    source: SRC,
    asOf: '2025-06',
    topics: ['markets', 'regulation', 'equity'],
    keywords: ['ASBA', 'UPI IPO', 'prospectus', 'red herring', 'offer document', 'minimum lot', 'oversubscribed', 'allotment', 'refund', 'ICDR'],
  },
  {
    id: 'xa-06-public-debt-issue-rights',
    title: 'Public issues of debentures and rights entitlements',
    principle:
      'A public limited company can issue debentures to the public through a prospectus filed with SEBI and the RoC, via a lead manager; they must be listed, carry a credit rating from at least one agency (all ratings obtained must be disclosed), and have a SEBI-registered debenture trustee to protect holders and, for secured issues, keep the security adequate. In a rights issue, rights entitlements (REs) are credited to demat accounts with their own ISIN and can be traded; holders who do not want the shares can sell the RE, and applications go through ASBA.',
    source: SRC,
    topics: ['bonds', 'regulation', 'markets'],
    keywords: ['public issue of debentures', 'NCD', 'debenture trustee', 'credit rating mandatory', 'rights entitlement', 'RE trading', 'ISIN'],
  },
  {
    id: 'xa-06-secondary-market-functions',
    title: 'What the secondary market does',
    principle:
      'Trading between investors gives the issuer no new money, but it supports the primary market by providing liquidity (entry and exit at low cost, making perpetual equity and long bonds acceptable), price discovery (prices aggregate investors’ views and guide pricing of fresh capital), information signalling (prices continuously monitor issuers; efficient markets reflect all available information), an economic barometer (indices such as Sensex and Nifty 50), and a market for corporate control (undervalued, badly run companies attract takeovers; even the threat improves governance).',
    source: SRC,
    topics: ['markets'],
    keywords: ['secondary market', 'liquidity', 'price discovery', 'information signalling', 'efficient market', 'corporate control', 'takeover'],
  },
  {
    id: 'xa-06-market-cap-turnover-indices',
    title: 'Market capitalisation, turnover and indices',
    principle:
      'Market cap = shares outstanding x share price; stocks are grouped as large cap (blue chips, most liquid), mid cap and small cap (least liquid); market cap to GDP gauges a market’s size. Turnover shows daily trading activity (value or number of trades); turnover ratio = turnover / market cap, higher meaning more liquid. Indices track a representative, liquid, usually free-float-market-cap-weighted basket, reviewed periodically; Sensex and Nifty 50 are the main ones, with sector and size indices too. Indices report market moves, signal economic direction and serve as benchmarks for funds.',
    source: SRC,
    topics: ['markets', 'equity'],
    keywords: ['market capitalisation', 'large cap', 'mid cap', 'small cap', 'blue chip', 'turnover ratio', 'index', 'Sensex', 'Nifty 50', 'benchmark', 'market cap to GDP'],
  },
  {
    id: 'xa-06-risk-management-margins',
    title: 'How exchanges manage risk: capital, margins, novation, SGF',
    principle:
      'Members must meet capital adequacy (base minimum capital with no exposure allowed against it, plus additional capital covering margins). Margins are collected upfront from both buyer and seller to cover the risk of non-payment or non-delivery, from clients by brokers and from brokers by the exchange. The clearing corporation becomes the counterparty to every trade (novation), guaranteeing settlement even if a member defaults, backed by margins and the Core Settlement Guarantee Fund. Exchanges also monitor positions online, impose special margins, tighten circuit filters or move a stock to trade-to-trade (compulsory delivery) when prices behave abnormally, and inspect members’ books at least yearly.',
    source: SRC,
    topics: ['markets', 'operations', 'regulation'],
    keywords: ['margin', 'novation', 'clearing corporation', 'settlement guarantee fund', 'Core SGF', 'base minimum capital', 'trade to trade', 'surveillance'],
  },
  {
    id: 'xa-06-circuit-breakers-price-bands',
    title: 'Market-wide circuit breakers and stock price bands',
    principle:
      'Index-based market-wide circuit breakers halt all equity and equity-derivative trading nationally at moves of 10%, 15% and 20% in either direction, triggered by whichever of Sensex or Nifty 50 breaches first; halt length depends on the level and time of day, and limits are set daily from the previous close. Individual stocks carry daily price bands of 2%, 5% or 10% as specified, 20% for the rest; stocks with derivatives (or in indices with derivatives) have no price band but a 10% operating range against erroneous orders.',
    source: SRC,
    asOf: '2025-06',
    topics: ['markets', 'regulation'],
    keywords: ['circuit breaker', 'market wide circuit breaker', 'price band', 'upper circuit', 'lower circuit', 'trading halt', '10% 15% 20%'],
  },
  {
    id: 'xa-06-corporate-actions-rights-bonus-dividend',
    title: 'Corporate actions: record date, rights, bonus and dividends',
    principle:
      'Corporate actions are governed by the Companies Act, SEBI regulations and listing terms; a record date (or book closure) fixes who is entitled. Rights issues prevent dilution by offering new shares to existing holders first, in a board-approved ratio (1:1, 1:2, 2:5 and so on), via a letter of offer filed with SEBI. Bonus shares are issued free from free reserves built from genuine profits, in a ratio such as 1:3 (one bonus share for every three held); not allowed if the company has defaulted on debt interest, principal or fixed deposits. Dividends (interim or final) come only from current or past profits, never from share premium, revaluation or capital redemption reserve; a loss-making company or one that failed to redeem preference shares cannot pay; listed companies declare dividends per share.',
    source: SRC,
    topics: ['equity', 'markets'],
    keywords: ['corporate action', 'record date', 'book closure', 'rights issue', 'bonus issue', 'bonus ratio', 'dividend', 'interim dividend', 'final dividend', 'free reserves'],
  },
  {
    id: 'xa-06-split-buyback-delisting',
    title: 'Stock split, buyback, delisting, takeovers and OFS',
    principle:
      'A stock split reduces face value and multiplies the share count in the same ratio (a 1:5 split turns one share of face value 10 into five of 2); share capital and the holding’s value are unchanged, while the lower price improves liquidity. A buyback repurchases and extinguishes shares from reserves, cutting share capital and raising EPS; barred if the company has defaulted on debt, deposits, preference redemption or declared dividends. Delisting is compulsory (for non-compliance) or voluntary (via reverse book building). Substantial acquisitions trigger SEBI takeover rules giving public holders an exit. An offer for sale through the exchange lets existing holders sell; proceeds go to them, not the company.',
    source: SRC,
    topics: ['equity', 'markets'],
    keywords: ['stock split', 'face value', 'buyback', 'share buyback', 'EPS', 'delisting', 'reverse book building', 'takeover', 'open offer', 'offer for sale'],
  },
];
