import type { KnowledgeEntry, KnowledgeSource } from '../library.js';

const SRC: KnowledgeSource = {
  kind: 'NISM',
  series: 'X-A',
  edition: '2025-06',
  chapter: 9,
  chapterTitle: 'Investing in Fixed Income Securities',
};

export const XA_09: readonly KnowledgeEntry[] = [
  {
    id: 'xa-09-debt-market-segments',
    title: 'The Indian debt market and its segments',
    principle:
      'The debt market lets governments and companies borrow from investors through primary issues and secondary trading. Debt carries fixed obligations rather than ownership and is usually safer than equity, often secured, though recovery after default can be slow and legal. India’s debt market has three segments: government securities (G-secs, T-bills, state development loans), PSU and bank bonds, and private-sector bonds, debentures and commercial paper. Corporate debt is a small share, mostly institutional, and secondary trading for individuals is thin.',
    source: SRC,
    topics: ['bonds', 'markets'],
    keywords: ['debt market', 'bond market', 'G-sec', 'SDL', 'PSU bonds', 'corporate bonds', 'debentures'],
  },
  {
    id: 'xa-09-bond-features-par-premium-discount',
    title: 'Coupon, face value, maturity, and why bonds trade at a premium or discount',
    principle:
      'A bond promises periodic interest (the coupon, usually semi-annual; none for zero-coupon bonds) and repayment of face (par) value at maturity (none for perpetual bonds). Bonds of a year or less are money-market instruments; longer ones are capital-market instruments, becoming money-market paper as they near maturity. G-secs pay semi-annual coupons, with tenors mostly 5 to 30 years. Par is usually 100 for G-secs and 10,000 for corporate bonds, and prices are quoted as a percentage of par. A bond trades at par when its coupon equals the market yield for its remaining term, at a discount when market yields are above the coupon, and at a premium when they are below; at maturity price is pulled back to par. Terms are set in the bond indenture.',
    source: SRC,
    asOf: '2025-06',
    topics: ['bonds'],
    keywords: ['coupon', 'face value', 'par value', 'maturity', 'premium bond', 'discount bond', 'pull to par', 'indenture', 'zero coupon'],
  },
  {
    id: 'xa-09-embedded-options',
    title: 'Callable, puttable and convertible bonds',
    principle:
      'A callable bond lets the issuer redeem early, which it does when rates fall, leaving the investor to reinvest at lower rates (reinvestment and call risk), so investors demand more yield. A puttable bond lets the holder sell it back to the issuer at a set price on set dates, protecting the investor. A convertible bond is a plain bond plus the holder’s option to exchange it for a fixed number of the issuer’s shares. Yield to call and yield to put measure return assuming the option is exercised at the first call or put date.',
    source: SRC,
    topics: ['bonds'],
    keywords: ['callable bond', 'call option bond', 'puttable bond', 'put option bond', 'convertible bond', 'yield to call', 'yield to put', 'call risk'],
  },
  {
    id: 'xa-09-interest-rate-reinvestment-risk',
    title: 'Interest-rate risk and reinvestment risk',
    principle:
      'Bond prices move opposite to interest rates: rising rates cut the market value of existing bonds (a loss if sold), falling rates raise it. Holding to maturity avoids price risk because the contracted payments are received. Reinvestment risk is the opposite face: coupons must be reinvested at whatever rate prevails when received, so falling rates lower total return; it is highest for investors holding to maturity. Higher rates hurt prices but help reinvestment, and vice versa.',
    source: SRC,
    topics: ['bonds', 'risk'],
    keywords: ['interest rate risk', 'bond price falls when rates rise', 'reinvestment risk', 'hold to maturity', 'market risk bonds'],
  },
  {
    id: 'xa-09-credit-risks',
    title: 'Credit risk: downgrade, spread and default',
    principle:
      'Corporate bonds yield more than G-secs because repayment depends on the issuer’s finances. Downgrade risk: a rating cut after purchase raises the issuer’s cost of funds and lowers existing bond prices (the IL&FS downgrades of 2018 cascaded through the market). Spread risk: the extra yield over G-secs widens when the issuer weakens or when liquidity is tight and risk appetite falls, even without a downgrade; lower-rated paper carries wider spreads. Default risk: interest or principal is not paid when due; ratings estimate it but cannot rule out shocks, and junk bonds pay high yields for it.',
    source: SRC,
    topics: ['bonds', 'risk'],
    keywords: ['credit risk', 'downgrade risk', 'spread risk', 'default risk', 'credit spread', 'IL&FS', 'rating downgrade', 'junk bonds'],
  },
  {
    id: 'xa-09-other-bond-risks',
    title: 'Liquidity, currency, inflation, volatility, political and event risk in bonds',
    principle:
      'Liquidity risk: being unable to sell when needed without a fire-sale discount; worse for long, lower-rated bonds, least for G-secs and AAA paper (lower impact cost). Currency risk: foreign-currency bonds cost more to service if the rupee falls; buyers of rupee-denominated masala bonds bear rupee risk. Inflation risk: fixed coupons lose real value if inflation rises; floating-rate and inflation-indexed bonds protect but are scarce. Volatility risk affects bonds with embedded options. Political or legal risk: changes to tax status, coupon payment or repatriation rules. Event risk: shocks such as the pandemic that stop a sector servicing debt.',
    source: SRC,
    topics: ['bonds', 'risk'],
    keywords: ['liquidity risk', 'currency risk', 'masala bonds', 'inflation risk', 'inflation indexed bond', 'floating rate bond', 'event risk', 'political risk'],
  },
  {
    id: 'xa-09-bond-pricing',
    title: 'Pricing a bond: discount every cash flow at the yield',
    principle:
      'Price = sum of each coupon and the final principal discounted at the yield to maturity. With an annual coupon C, yield r, n years and par F: price = C x [1 - (1 + r)^-n] / r + F / (1 + r)^n. For semi-annual coupons use C/2, r/2 and 2n periods; at the same coupon and yield, more frequent payment gives a slightly higher price. Worked figure: a 7% annual-coupon 4-year bond at a 9% market yield is worth about 93.52 per 100 (a discount, since the coupon is below the yield). Excel PRICE() does this directly.',
    source: SRC,
    asOf: '2025-06',
    topics: ['bonds', 'compounding'],
    keywords: ['bond pricing', 'bond valuation', 'present value of coupons', 'semi-annual coupon', 'PVIF', 'Excel PRICE'],
  },
  {
    id: 'xa-09-coupon-current-ytm',
    title: 'Coupon yield, current yield and yield to maturity',
    principle:
      'Coupon yield = coupon / face value. Current yield = annual coupon / market price. Yield to maturity is the discount rate that makes the present value of all remaining cash flows equal the price: the bond’s internal rate of return if held to maturity, assuming coupons are reinvested at that same rate; found by trial and error or Excel YIELD(). At par, coupon rate = current yield = YTM; at a discount, coupon < current yield < YTM; at a premium, coupon > current yield > YTM. Worked figure: a 9% coupon bond priced at 104 has a current yield of 8.65%.',
    source: SRC,
    asOf: '2025-06',
    topics: ['bonds'],
    keywords: ['coupon yield', 'current yield', 'yield to maturity', 'YTM', 'IRR of bond', 'Excel YIELD', 'premium discount yield relationship'],
  },
  {
    id: 'xa-09-zero-perpetual-clean-dirty',
    title: 'Zero-coupon and perpetual bonds; clean and dirty prices',
    principle:
      'A zero-coupon bond (like a T-bill or CP) is issued at a discount and repaid at par; its return is the gap. For a money-market zero, YTM = (100 - price) / price x 365 / days to maturity. A perpetual bond pays coupons forever and never repays principal: value = annual coupon / required yield (a 9 coupon at a 7.5% required yield is worth 120). Between coupon dates the buyer pays the clean price plus accrued interest owed to the seller: the dirty, full or invoice price. Markets quote and compute yields on clean prices.',
    source: SRC,
    asOf: '2025-06',
    topics: ['bonds'],
    keywords: ['zero coupon bond', 'discount instrument', 'perpetual bond', 'clean price', 'dirty price', 'accrued interest', 'invoice price'],
  },
  {
    id: 'xa-09-price-yield-day-count-effective',
    title: 'Price-yield behaviour, day counts and effective yield',
    principle:
      'The price-yield curve slopes down and is curved (convex). Longer maturity and lower coupons both mean greater price sensitivity to yield changes. Day-count conventions decide accrued interest: Indian bonds use 30/360; the money market and T-bills use actual/365; other countries differ. Effective yield restates a nominal rate paid more often than yearly as its annual-compounded equivalent: a 6% rate paid monthly is about 6.17% effective.',
    source: SRC,
    asOf: '2025-06',
    topics: ['bonds'],
    keywords: ['price yield relationship', 'convexity', 'day count', '30/360', 'actual/365', 'effective yield', 'effective annual rate'],
  },
  {
    id: 'xa-09-yield-curve',
    title: 'The yield curve and its shapes',
    principle:
      'The yield curve plots yields against maturity for similar-credit bonds; its slope is the premium for lending longer. Normal: upward sloping, longer maturities yield more; the healthiest shape. Inverted: short rates above long rates, often when policy rates are kept high to cool demand, and frequently a signal of coming recession. Flat: similar yields across maturities. Humped: medium maturities yield more than short or long. Sovereign curves tend to flatten beyond 5 to 7 years since there is no default risk; corporate curves keep rising with maturity as credit risk compounds. Higher expected inflation steepens it.',
    source: SRC,
    topics: ['bonds', 'markets'],
    keywords: ['yield curve', 'normal yield curve', 'inverted yield curve', 'flat yield curve', 'humped yield curve', 'term premium', 'recession signal'],
  },
  {
    id: 'xa-09-duration',
    title: 'Macaulay duration, modified duration and convexity',
    principle:
      'Macaulay duration is the present-value-weighted average time to receive a bond’s cash flows, in years: multiply each cash flow’s PV by its time, sum, and divide by price. It is less than maturity for coupon bonds and equal to maturity only for a zero-coupon bond; it rises with maturity but levels off. Modified duration = Macaulay duration / (1 + periodic yield) and gives the approximate percentage price change for a 1 percentage point change in yield: a modified duration of 6 means roughly a 6% price fall if yields rise 1 point. Convexity captures the curvature duration misses. Higher duration means a more rate-sensitive portfolio.',
    inPractice:
      'Match a debt fund’s duration to the goal’s horizon: money needed in a year belongs in low-duration funds, not gilt funds with long duration.',
    source: SRC,
    asOf: '2025-06',
    topics: ['bonds', 'risk'],
    keywords: ['duration', 'Macaulay duration', 'modified duration', 'convexity', 'interest rate sensitivity', 'debt fund duration'],
  },
  {
    id: 'xa-09-money-market-instruments',
    title: 'Money-market instruments: call, notice, term, repo, TREPS',
    principle:
      'The money market (overnight to one year) funds short-term needs and transmits RBI policy; its seizing up helped trigger the 2008 crisis. Call money (overnight), notice money (2 to 14 days) and term money (15 days to a year) are unsecured interbank borrowing among scheduled banks and primary dealers on RBI’s NDS-CALL. A repo (ready forward) borrows cash by selling securities with an agreement to buy them back later at a higher price that includes interest; a reverse repo is the lender’s side. G-sec repos run on CROMS and settle through CCIL. Tri-party repo (TREPS, which replaced CBLO in 2018) has CCIL as agent and central counterparty. Corporate bond repo also exists, mostly for AAA bonds and top-rated CPs and CDs.',
    source: SRC,
    topics: ['bonds', 'markets'],
    keywords: ['money market', 'call money', 'notice money', 'term money', 'repo', 'reverse repo', 'TREPS', 'tri-party repo', 'CBLO', 'CCIL', 'corporate bond repo'],
  },
  {
    id: 'xa-09-tbills-cmb-cp-cd',
    title: 'T-bills, cash management bills, commercial paper and certificates of deposit',
    principle:
      'Treasury bills are discounted zero-coupon Government of India securities of 91, 182 and 364 days, auctioned weekly by RBI to a quarterly calendar (14-day bills are only for parking state surpluses). Cash management bills are very short bills, under 91 days, for temporary government cash gaps. Commercial paper is short-term unsecured discounted borrowing by well-rated corporates (typically at least the second-highest rating, with minimum net worth), 7 days to one year, in multiples of 5 lakh. Certificates of deposit are issued by banks for 7 days to one year and by financial institutions for one to three years, in multiples of 1 lakh.',
    source: SRC,
    asOf: '2025-06',
    topics: ['bonds', 'markets'],
    keywords: ['treasury bill', 'T-bill', '91 day', '182 day', '364 day', 'cash management bill', 'commercial paper', 'CP', 'certificate of deposit', 'CD'],
  },
  {
    id: 'xa-09-gsec-market-players',
    title: 'The government securities market and who trades it',
    principle:
      'The G-sec market is the most active debt segment and sets benchmark rates for pricing other products. Banks hold G-secs to meet the statutory liquidity ratio (SLR, gradually reduced) and as safe assets; primary dealers make markets with two-way quotes; insurers, mutual funds, co-operative banks, provident and pension funds, corporates, FPIs and RBI itself also hold them. Each security has an ISIN. RBI acts as issuer’s banker, registrar and depository, issuing dated securities to half-yearly calendars (announced in March and September). Coupons falling on a holiday are paid the next working day; redemptions the previous working day.',
    source: SRC,
    topics: ['bonds', 'markets'],
    keywords: ['government securities market', 'primary dealer', 'SLR', 'statutory liquidity ratio', 'issuance calendar', 'Public Debt Office', 'ISIN'],
  },
  {
    id: 'xa-09-dated-gsec-types',
    title: 'Types of dated G-secs',
    principle:
      'Fixed-rate bonds dominate: a fixed coupon paid half-yearly (a 7.1% bond pays 3.55 per 100 every six months), with the coupon usually set at the auction cut-off. Floating-rate bonds reset coupons periodically (often off 182-day T-bill yields) but are unpopular. Zero-coupon bonds (last issued 1996), capital-indexed bonds (principal indexed, 1997) and inflation-indexed bonds (principal and coupon indexed; WPI-linked 2013, CPI-linked retail issue later in 2013) found little demand. Option bonds (one with both call and put in 2002) are no longer issued. Special securities (oil, fertiliser, food, bank recapitalisation bonds) are non-SLR and yield slightly more. STRIPS split a G-sec’s coupons and principal into separately traded zero-coupon pieces with no reinvestment risk.',
    source: SRC,
    asOf: '2025-06',
    topics: ['bonds'],
    keywords: ['dated securities', 'fixed rate bond', 'floating rate bond', 'FRB', 'inflation indexed bonds', 'IIB', 'capital indexed bond', 'STRIPS', 'oil bonds', 'recapitalisation bonds'],
  },
  {
    id: 'xa-09-sgb-savings-bonds-sdl',
    title: 'Sovereign gold bonds, savings bonds and state government securities',
    principle:
      'Sovereign gold bonds are G-secs denominated in grams of gold, paying a fixed coupon on the issue value half-yearly and redeemed at the simple average IBJA closing price of 999 gold over the previous three business days; fresh issues may have stopped, but older tranches trade on exchanges. Floating Rate Savings (Taxable) Bonds are for residents only (not NRIs), from 1,000 with no upper limit, held in demat or bond ledger accounts, with interest reset half-yearly at the NSC rate plus 0.35 percentage points and fully taxable. State Government Securities (SDLs) are half-yearly-coupon state bonds, SLR-eligible; UDAY bonds for power distribution companies are not SLR-eligible.',
    source: SRC,
    asOf: '2025-06',
    topics: ['bonds', 'products'],
    keywords: ['sovereign gold bond', 'SGB', 'IBJA', 'floating rate savings bond', 'RBI bond', 'state development loan', 'SDL', 'UDAY bonds'],
  },
  {
    id: 'xa-09-corporate-debt-trustees-qib',
    title: 'Corporate bonds: trustees, QIBs and retail investors',
    principle:
      'Corporate bonds may be privately placed (listing optional) or publicly issued (listing compulsory). In India debenture and bond mean the same. A SEBI-registered debenture trustee (bank, insurer, public financial institution or corporate body), paid by the issuer and governed by the SEBI (Debenture Trustees) Regulations 1993, holds security for holders, monitors compliance and can appoint nominee directors or sell the security on default; one is compulsory for debentures with maturity over 18 months. Qualified institutional buyers include banks, IRDAI-registered insurers, mutual funds, development finance institutions, provident and pension funds with a corpus of at least 25 crore, public FIs, and SEBI-registered foreign institutional and venture capital investors. A retail individual investor applies for 2 lakh or less.',
    source: SRC,
    asOf: '2025-06',
    topics: ['bonds', 'regulation'],
    keywords: ['debenture trustee', 'corporate bonds', 'private placement', 'QIB', 'qualified institutional buyer', 'retail individual investor', '2 lakh', 'secured debentures'],
  },
  {
    id: 'xa-09-company-deposits-infra-bonds',
    title: 'Company deposits, debentures, infrastructure and inflation-indexed bonds',
    principle:
      'Company fixed deposits (usually 1 to 3 years) pay more than bank FDs according to the company’s strength; they are not transferable and so are not securities under SCRA, and the company’s finances must be checked. Bonds and debentures run longer and are often secured, but default risk still needs assessing. Infrastructure bonds run 10 to 20 years to fund projects and should be judged on those projects. Inflation-indexed bonds reset their interest with inflation to protect the real return.',
    source: SRC,
    topics: ['bonds', 'products'],
    keywords: ['company fixed deposit', 'corporate FD', 'NCD', 'infrastructure bonds', 'inflation indexed bonds'],
  },
  {
    id: 'xa-09-bank-fd',
    title: 'Bank fixed deposits',
    principle:
      'A bank FD locks money for a fixed term (7 days to 10 years, over 5 years uncommon) at a rate fixed at booking, paying interest periodically or on maturity (cumulative). Rates depend on tenor, amount and the bank’s funding needs; banks run odd tenors at special rates and pay senior citizens (over 60) typically 0.25 to 0.75 percentage points more. Premature withdrawal can attract a penalty; loans or overdrafts against FDs are available. DICGC insures up to 5 lakh per depositor per bank, principal and interest combined across branches. Specified 5-year tax-saver FDs qualify under Section 80C (within its 1.5 lakh limit) with a 5-year lock-in.',
    source: SRC,
    asOf: '2025-06',
    topics: ['products', 'savings', 'tax'],
    keywords: ['fixed deposit', 'bank FD', 'DICGC', 'deposit insurance 5 lakh', 'senior citizen rate', 'tax saver FD', 'section 80C', 'premature withdrawal', 'cumulative deposit'],
  },
  {
    id: 'xa-09-ppf-nsc',
    title: 'Small savings: PPF and NSC',
    principle:
      'Small-savings schemes carry the government’s implicit guarantee and are sold at post offices and select banks. PPF (since 1968): a 15-year account at a bank or post office, one per person (plus accounts as guardian of a minor), open to individuals of any age but not HUFs or NRIs; a resident who becomes an NRI can continue to maturity on a non-repatriable basis; no joint accounts, nomination allowed. NSC (VIII issue): 5 years, interest compounded annually and paid at maturity; individuals and minors via guardians, joint holding by two allowed; not for NRIs, HUFs, companies or trusts; from 100 with no maximum. Investment qualifies under Section 80C; accrued interest is taxable but deemed reinvested so it also counts for 80C; no TDS on maturity.',
    source: SRC,
    asOf: '2025-06',
    topics: ['products', 'tax', 'retirement'],
    keywords: ['PPF', 'public provident fund', '15 year', 'NSC', 'national savings certificate', 'small savings', 'section 80C', 'NRI PPF', 'HUF not allowed'],
  },
  {
    id: 'xa-09-scss-pomis-td-rd',
    title: 'Senior Citizens Savings Scheme and post office deposits',
    principle:
      'SCSS: for those 60 and over at opening, or 55 to 60 if retiring (including VRS) and investing within a month of receiving retirement benefits; retired defence personnel at any age; held singly or jointly with a spouse (age test on the first holder only); not for NRIs, PIOs or HUFs. Post Office Monthly Income Scheme: 5 years, monthly interest, minimum 1,500, maximum 4.5 lakh single or 9 lakh joint across all post offices (as stated in the June 2025 edition); premature closure after one year with a 2% deduction in years one to three and 1% after. Post office time deposits: 1, 2, 3 or 5 years, from 100 with no limit, quarterly compounding, taxable, the 5-year one 80C-eligible. Recurring deposits: monthly from 10, quarterly compounding, taxable, one withdrawal allowed after a year of regular deposits, extendable by five years.',
    source: SRC,
    asOf: '2025-06',
    topics: ['products', 'retirement', 'tax'],
    keywords: ['SCSS', 'senior citizens savings scheme', 'POMIS', 'post office monthly income scheme', 'post office time deposit', 'recurring deposit', 'post office RD', 'section 80C'],
  },
  {
    id: 'xa-09-kvp-sukanya',
    title: 'Kisan Vikas Patra and Sukanya Samriddhi',
    principle:
      'Kisan Vikas Patra: bought by an adult for self or two adults for a minor (not NRIs or HUFs), from 1,000 in multiples of 1,000 with no maximum; matures when the money doubles at the prevailing rate; transferable between persons and post offices; nomination and joint holding allowed; no tax deduction and interest taxed on accrual. Sukanya Samriddhi: opened by a guardian for a girl up to age 10, one account per girl and at most two per guardian; deposits from 250 to 1.5 lakh per financial year; matures 21 years after opening or on her marriage; up to 50% of the previous year-end balance can be withdrawn after she turns 18; deposits qualify under Section 80C.',
    source: SRC,
    asOf: '2025-06',
    topics: ['products', 'tax', 'goals'],
    keywords: ['Kisan Vikas Patra', 'KVP', 'Sukanya Samriddhi', 'SSY', 'girl child scheme', 'money doubles', 'section 80C'],
  },
];
