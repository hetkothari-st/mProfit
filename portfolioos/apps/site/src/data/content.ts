/* Site copy that is rendered as lists. Claims here were checked against the
   app's code; keep them in step with what the product actually does. */

export interface AssetFolio {
  name: string;
  summary: string;
  points: string[];
}

export const assetFolios: AssetFolio[] = [
  { name: 'Bank accounts', summary: 'Balances, statements and every credit and debit, matched to the rest of your money.', points: ['Savings, current and salary accounts', 'Statement and alert imports', 'Bank reconciliation report'] },
  { name: 'Stocks', summary: 'Equity holdings from every broker and demat, priced daily and taxed correctly.', points: ['Contract notes and tradebooks', 'Splits, bonuses, dividends, mergers', 'FIFO gains with grandfathering'] },
  { name: 'F & O', summary: 'Futures and options positions with realised and unrealised P&L by expiry.', points: ['Broker P&L and tradebook imports', 'Speculative vs non-speculative split', 'Turnover for tax purposes'] },
  { name: 'Mutual funds', summary: 'Every folio from your CAS, with research-grade analysis of each fund.', points: ['CAS from CAMS & KFintech, MF Central', 'Fund score, rolling returns, overlap', 'Debt vs equity tax treatment'] },
  { name: 'Bonds', summary: 'Corporate bonds, G-secs and SGBs with coupons and maturities.', points: ['Coupons and maturity dates', 'Sovereign gold bonds', 'Maturity reminders'] },
  { name: 'FDs & RDs', summary: 'Fixed and recurring deposits across banks, with interest worked out for you.', points: ['Interest accrued to date', 'Maturity value worked out', 'Maturity alerts'] },
  { name: 'Gold & Silver', summary: "Jewellery, coins, digital gold and SGBs at today's price.", points: ['Live gold and silver rates', 'Weight and purity for physical gold', 'Gains on sale'] },
  { name: 'Crypto', summary: 'Coins across exchanges and wallets in rupee terms.', points: ['Holdings across exchanges and wallets', 'Cost basis and gains', 'Value in rupees'] },
  { name: 'Forex', summary: 'Foreign stocks, foreign currency cash and your LRS limit.', points: ['US stocks and ETFs', 'Forex cash in any currency', 'LRS usage for the year'] },
  { name: 'PPF & EPF', summary: 'Provident funds with contributions, interest and passbook sync.', points: ['EPF passbook import', 'PPF contributions and maturity', 'Interest credited each year'] },
  { name: 'NPS', summary: 'Tier I and II with scheme allocation and current NAV.', points: ['Tier I and Tier II', 'Equity, corporate, government allocation', 'Current value from NAV'] },
  { name: 'Post Office', summary: 'NSC, KVP, SCSS, MIS, Sukanya and the rest of the small-savings family.', points: ['Scheme-specific interest rules', 'Payout schedules', 'Maturity reminders'] },
  { name: 'Real estate', summary: 'Homes, plots and commercial property at cost and current value.', points: ['Purchase cost and improvements', 'Indexed capital gains on sale', 'Linked loans and rental income'] },
  { name: 'Rental', summary: 'Tenancies, rent due dates and receipts, for each property you let out.', points: ['Monthly receipts generated for you', 'Overdue reminders', 'Rent matched to bank credits'] },
  { name: 'Vehicles', summary: 'Cars and bikes from the registration number: RC, expiries and value.', points: ['RC details from the registration number', 'PUC, insurance and fitness alerts', 'Challans and a value estimate'] },
  { name: 'Insurance', summary: 'Life, health, motor and home policies with coverage and renewals.', points: ['Coverage gap check', 'Premium history and reminders', 'Printable emergency sheet'] },
  { name: 'Loans', summary: 'Loans you have taken and money you have lent.', points: ['Amortisation and prepayment', 'Tax benefits on home loans', 'Money lent to friends and family'] },
  { name: 'Credit cards', summary: 'Cards, statement dates, dues and limits.', points: ['Due-date reminders', 'Utilisation across cards', 'Statement imports'] },
  { name: 'Others', summary: "Art, collectables, unlisted shares, a stake in a friend's business.", points: ['Any asset with a value', 'Manual valuation history', 'Counts toward net worth'] },
];

export interface Faq {
  q: string;
  a: string;
}

export const generalFaq: Faq[] = [
  { q: 'Can EveryPaisa move my money or place trades?', a: 'No. EveryPaisa only reads. It has no way to move money, place orders or change anything at your bank or broker.' },
  { q: 'Do you read my whole inbox?', a: "No. You choose the senders, like your bank's alert address or your broker. We search only mail from those addresses, with read-only access you can revoke from your Google account at any time." },
  { q: 'Which brokers and fund houses are supported?', a: 'Mutual funds come in through your CAS from CAMS and KFintech or MF Central, which covers every AMC. Stocks come from contract notes and tradebooks from major brokers including Zerodha, Upstox, Angel One and Kotak, from your demat CAS, or from the Account Aggregator network. Anything else can be added from Excel or by hand.' },
  { q: 'How accurate are the capital gains?', a: 'Gains are computed from your transactions lot by lot, using FIFO, with the 31 January 2018 grandfathering rule and current holding-period rules for equity, debt and hybrid funds. Each figure links back to the buys and sells it came from, so your CA can check it.' },
  { q: 'What happens to my data if I leave?', a: 'Every report can be downloaded as PDF or Excel at any time. Deleting your account removes your records from our systems.' },
  { q: 'Is this investment advice?', a: "EveryPaisa is a tracking and reporting tool. Scores, insights and suggestions help you understand your money; they aren't a recommendation to buy or sell anything." },
];

export const pricingFaq: Faq[] = [
  { q: 'Is the Free plan really free?', a: 'Yes. Track every asset class by hand, see your net worth and download the basic reports without paying.' },
  { q: 'Can my CA use it for several clients?', a: 'Yes. The Pro / Adviser plan gives a professional workspace with unlimited client books, double-entry accounting and Tally export.' },
  { q: 'Can I change plans later?', a: 'Yes. Plans are managed from the app, and your data stays where it is when you switch.' },
  { q: 'Is there a mobile app?', a: "EveryPaisa works fully in your phone's browser and can be added to your home screen. Native apps are in progress. A Windows desktop app is available." },
];

export interface Plan {
  name: string;
  blurb: string;
  price: string;
  priceNote: string;
  featured?: boolean;
}

export const plans: Plan[] = [
  { name: 'Free', blurb: 'Your net worth in one place.', price: '₹0', priceNote: 'forever' },
  { name: 'Plus', blurb: 'Automatic imports and the full report catalogue.', price: 'Coming soon', priceNote: 'monthly or yearly', featured: true },
  { name: 'Family', blurb: 'One consolidated view for the household.', price: 'Coming soon', priceNote: '3 members included' },
  { name: 'Pro / Adviser', blurb: 'For CAs and advisers running client books.', price: 'Coming soon', priceNote: 'per practice' },
];

/** Row label, then one cell per plan: true = included, false = not included, string = detail. */
export const planRows: [string, ...(boolean | string)[]][] = [
  ['All 19 asset classes', true, true, true, true],
  ['Net worth dashboard', true, true, true, true],
  ['Portfolios', '1', 'Multiple', 'Multiple', 'Unlimited clients'],
  ['Reports', 'Holdings, XIRR, cash flow', '30+ tax & CA reports', '30+, family-wise', '30+, incl. F&O reports'],
  ['Inbox & Account Aggregator imports', false, true, true, 'Priority refresh'],
  ['Ask-in-plain-English assistant', false, true, true, true],
  ['Goal projections', false, true, true, true],
  ['Family net worth & sharing', false, false, true, true],
  ['Double-entry accounting, Tally export', false, false, false, true],
];

export const reports: string[] = [
  'Holdings summary', 'Portfolio snapshot', 'Top holdings', 'Sector allocation', 'Demat holdings', 'Family-wise holdings',
  'Performance (XIRR)', 'Holding-period return', 'Combined realised & unrealised', 'Capital gains (FIFO)', 'Brokerwise capital gains',
  'Mutual fund capital gains', 'Grandfathered LTCG', 'ITR Schedule 112A', 'Short-term, long-term & speculation', 'Tax P&L',
  'Tax summary', 'Advance tax summary', 'STT (section 10DB)', 'Dividend report', 'Income report', 'Mutual fund mark-to-market',
  'Cash flow', 'Fund flow', 'Contract notes summary', 'Contract note charges', 'Broker bill register', 'Broker bill register, member-wise',
  'Script ledger', 'Scriptwise quantity', 'Opening stock', 'Closing balance', 'Account ledger', 'Financial ledger', 'Day book',
  'Chart of accounts', 'Trial balance', 'Profit & loss', 'Balance sheet', 'Bank reconciliation', 'Tally export',
];

export interface FeatureGroup {
  id: string;
  title: string;
  intro: string;
  items: [string, string][];
}

export const featureGroups: FeatureGroup[] = [
  {
    id: 'imports', title: 'Getting your data in', intro: 'Bring in years of history in an afternoon, then let new transactions arrive on their own.',
    items: [
      ['Gmail, read-only', 'Choose the senders to watch. Alerts and statements from them become ledger entries; nothing else in your inbox is touched.'],
      ['Sender discovery', "A one-time scan suggests which senders in your inbox look financial, so you don't have to remember every bank and broker."],
      ['Review queue', 'Approve, edit or reject each parsed entry. Trust a sender after five clean entries and its alerts file automatically.'],
      ['CAS statements', 'Upload the consolidated statement from CAMS and KFintech, or the demat CAS from NSDL and CDSL, to load every holding at once.'],
      ['MF Central & Account Aggregator', "Pull mutual fund, bank and demat data directly, with your consent, through MF Central and the RBI's Account Aggregator network."],
      ['Broker files', 'Contract notes, tradebooks and F&O P&L statements from major brokers, plus EPF passbooks, Excel and CSV.'],
      ['No duplicates', 'Import the same statement twice and nothing is added twice. Every entry remembers the file or email it came from.'],
      ['Failed rows kept, not lost', "If one line of a statement can't be read, the rest still import and that line waits for you to fix or enter by hand."],
      ['Corporate actions', 'Splits, bonuses, mergers and dividends are applied to your holdings so quantities and costs stay right.'],
    ],
  },
  {
    id: 'overview', title: 'Net worth & analytics', intro: 'One page that adds everything up, and the tools to ask better questions of it.',
    items: [
      ['Dashboard', "Net worth, allocation, invested amount, today's change and the alerts that need you this week."],
      ['Returns that mean something', 'XIRR for each holding, portfolio and the whole family, plus holding-period returns over 1, 3 and 5 years.'],
      ['Analytics', 'Best and worst performers, risk, correlation between your holdings, liabilities and cash flow in one place.'],
      ['What-if simulator', 'Move money between asset classes and see how your allocation and expected return would change.'],
      ['Portfolio score', 'A health score for your money with specific, plain-language fixes: concentration, idle cash, cover, costs.'],
      ['Cash activity & forecast', 'Every inflow and outflow across accounts, and a forecast of the months ahead from your EMIs, SIPs, rent and premiums.'],
      ['Income', 'Salary, rent, interest and dividends in one register, ready for your tax return.'],
      ['Goals', "Retirement, a child's education, a home. Link investments to each goal and see if you're on track."],
      ['Ask in plain English', '"What\'s my XIRR this year?" or "Am I overweight in IT?" The assistant answers from your own ledger.'],
      ['Alerts', 'Maturities, renewals, expiries, rent due, premiums, overdue items. One list, by date.'],
      ['Multiple portfolios', "Keep a trading account, a retirement pot and your parents' money apart, then group them however you like."],
    ],
  },
  {
    id: 'mf', title: 'Mutual fund research', intro: 'The analysis a good adviser would do, shown in full so you can judge it yourself.',
    items: [
      ['Fund score', 'A score out of 100 built from returns, risk, cost and consistency against peers, with the method published.'],
      ['Rolling returns', 'The spread of returns across every 1, 3 and 5-year window, not just a lucky start date.'],
      ['Drawdowns', 'How far the fund has fallen and how long it took to recover.'],
      ['Overlap', 'How much of your funds hold the same stocks, shown as a matrix.'],
      ['Look-through', 'The stocks and sectors you actually own once every fund is opened up.'],
      ['Costs & tax lots', 'Expense ratio drag in rupees, riskometer, and each purchase lot with its tax status.'],
    ],
  },
  {
    id: 'tax', title: 'Tax', intro: 'Worked out from your transactions, lot by lot, and traceable back to each buy and sell.',
    items: [
      ['FIFO capital gains', 'Short-term, long-term and intraday, split by asset class and by broker.'],
      ['Grandfathering', "Equity bought before 31 January 2018 uses the higher of cost and that day's fair value."],
      ['Schedule 112A', 'Line-by-line, in the format the income tax return asks for.'],
      ['Debt and equity funds', 'Each fund taxed by the rules for its type and purchase date.'],
      ['Advance tax', "What you're likely to owe by each instalment date."],
      ['Tax-loss harvesting', "Holdings with losses you could book to offset this year's gains."],
    ],
  },
  {
    id: 'protect', title: 'Insurance & succession', intro: 'Making sure the people who depend on you are covered, and can find everything if they need to.',
    items: [
      ['Every policy', 'Life, health, motor, home and travel, with premiums, nominees and claim history.'],
      ['Coverage check', 'Where your cover is thin, explained in plain words.'],
      ['Emergency sheet', 'One printable page with policies, nominees, claim numbers and who to call.'],
      ['Claims help', 'Step-by-step guides for filing common health, life and motor claims.'],
      ['Succession', 'Name nominees. If your account goes quiet for a period you set, they are verified and given access to the information they will need.'],
      ['Renewal reminders', 'Ahead of every premium and renewal date, so nothing lapses.'],
    ],
  },
  {
    id: 'things', title: 'Property & vehicles', intro: 'The big things you own, and the paperwork that comes with them.',
    items: [
      ['Vehicle from a number plate', 'Enter the registration number and the RC details fill in: make, model, fuel, owner, registration date.'],
      ['Expiry alerts', 'PUC, insurance, fitness and road tax, reminded before they lapse.'],
      ['Challans & fuel prices', "Pending traffic challans for your vehicles and today's fuel prices in your city."],
      ['Properties', 'Purchase cost, improvements, linked loans and current value, with capital gains when you sell.'],
      ['Tenancies & rent', 'Monthly receipts generated for each tenancy, with due dates, overdue reminders and history.'],
      ['Rent matched to your bank', "When a rent credit arrives in your bank alerts, it's matched to the month it pays for."],
    ],
  },
  {
    id: 'everyday', title: 'Everyday money', intro: 'The borrowing, spending and sharing that sits alongside your investments.',
    items: [
      ['EMI calculator', 'EMI, amortisation schedule and the effect of prepaying, with current lender rates for home loans.'],
      ['Compare loans', 'Put offers side by side and see the total interest each one costs.'],
      ['Home-loan tax benefits', 'Interest under section 24(b) and principal under 80C, year by year.'],
      ['Loans & money lent', "Track what you owe and what friends and family owe you, with interest."],
      ['Credit cards', 'Dues, statement dates and utilisation across all your cards.'],
      ['Split expenses', 'Groups and friends, shared bills, running balances, and settle up with a UPI link.'],
    ],
  },
  {
    id: 'family', title: 'Family', intro: "One household, many people, with each person's privacy respected.",
    items: [
      ['Family net worth', "Everyone's money added up, with a breakdown by member."],
      ['Invite or manage', "Invite members to their own logins, or manage accounts for parents who won't use the app."],
      ['Shared goals & protection', 'Goals and insurance cover for the whole household on one page.'],
    ],
  },
  {
    id: 'ca', title: 'For CAs and advisers', intro: "A workspace for professionals, with the books their clients' returns are built on.",
    items: [
      ['Client workspace', 'Clients invite you with your own login. Two-factor sign-in is required for every professional account.'],
      ['Double-entry accounting', "Vouchers, ledgers, day book and chart of accounts generated from the client's transactions."],
      ['Financial statements', 'Trial balance, profit and loss and balance sheet for each client.'],
      ['Tally export', 'One click produces files ready to import into Tally.'],
      ['F&O and broker reports', 'Broker bill registers, contract note charges and speculative income splits.'],
      ['Unlimited clients', 'Run as many client books as your practice needs.'],
    ],
  },
];

export const securityPoints: [string, string][] = [
  ['Read-only, and only what you choose', 'Gmail access is read-only and limited to the senders you pick. You can revoke it from your Google account at any time.'],
  ['Identifiers encrypted at rest', 'PAN, account, folio and policy numbers are encrypted with a key unique to you.'],
  ['Stripped before parsing', 'Names, PAN and account numbers are removed before any alert is read by AI.'],
  ['Walled off per user', "Row-level security in the database refuses to return another person's rows, even if our own code makes a mistake."],
  ['Two-factor sign-in', 'Authenticator app codes and backup codes, required for CA and adviser workspaces.'],
  ['Audit log', 'Sign-ins, exports and views of sensitive details are recorded.'],
  ['No way to move money', 'EveryPaisa reads. It cannot place trades, move funds or change anything at your bank or broker.'],
  ['Leave whenever you like', 'Download your reports any time, or delete your account and every record with it.'],
];
