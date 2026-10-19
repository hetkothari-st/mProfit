import { serializeMoney, toDecimal, type AiConnectorArea } from '@everypaisa/shared';
import { prisma } from '../../../lib/prisma.js';
import { getDashboardNetWorth } from '../../analytics/dashboard.service.js';
import type { ConnectorTool } from './types.js';
import { dmy, hasClientBooks, ownPortfolios } from './common.js';
import { areaWholeFor, selfPerson } from '../people.js';

/** Alert type -> the area it belongs to. CUSTOM alerts are free text and never shared. */
const ALERT_AREA: Record<string, AiConnectorArea> = {
  FD_MATURITY: 'investments', BOND_MATURITY: 'investments', MF_LOCK_IN_EXPIRY: 'investments', SIP_DUE: 'investments',
  DIVIDEND_RECEIVED: 'investments', CORPORATE_ACTION: 'investments', PRICE_TARGET: 'investments',
  FO_EXPIRY_TODAY: 'investments', FO_EXPIRY_SOON: 'investments', FO_MARGIN_CALL: 'investments',
  INSURANCE_PREMIUM: 'insurance', INSURANCE_CLAIM: 'insurance',
  LOAN_EMI_DUE: 'loans', LOAN_GIVEN_DUE: 'loans', LOAN_REFINANCE: 'loans', LOAN_BENCHMARK_CHANGE: 'loans',
  CREDIT_CARD_DUE: 'banking', PROPERTY_TAX_DUE: 'property', PROPERTY_POSSESSION_DUE: 'property',
  PF_REFRESH_DUE: 'retirement', WILL_REVIEW_DUE: 'will',
};
const ALERT_LABEL: Record<string, string> = {
  FD_MATURITY: 'Fixed deposit maturing', BOND_MATURITY: 'Bond maturing', MF_LOCK_IN_EXPIRY: 'Mutual fund lock-in ending',
  SIP_DUE: 'SIP due', DIVIDEND_RECEIVED: 'Dividend', CORPORATE_ACTION: 'Corporate action', PRICE_TARGET: 'Price target hit',
  FO_EXPIRY_TODAY: 'F&O expiry today', FO_EXPIRY_SOON: 'F&O expiry soon', FO_MARGIN_CALL: 'Margin call',
  INSURANCE_PREMIUM: 'Insurance premium due', INSURANCE_CLAIM: 'Insurance claim update',
  LOAN_EMI_DUE: 'Loan EMI due', LOAN_GIVEN_DUE: 'Money lent due back', LOAN_REFINANCE: 'Refinancing opportunity',
  LOAN_BENCHMARK_CHANGE: 'Loan benchmark changed', CREDIT_CARD_DUE: 'Credit card bill due', PROPERTY_TAX_DUE: 'Property tax due',
  PROPERTY_POSSESSION_DUE: 'Property possession due', PF_REFRESH_DUE: 'PF balance needs refreshing', WILL_REVIEW_DUE: 'Will review due',
};
/** Areas whose values make up net worth; all must be shared to reveal the total. */
const NET_WORTH_AREAS: AiConnectorArea[] = ['investments', 'property', 'vehicles', 'loans', 'banking'];

const getOverview: ConnectorTool<Record<string, never>> = {
  name: 'get_overview',
  area: 'always',
  title: 'Financial overview',
  description: 'Net worth, totals for each shared area, and what falls due in the next 30 days.',
  input: {},
  async run(ctx) {
    const d = await getDashboardNetWorth(ctx.userId);
    let inv = { currentValue: d.portfolio.currentValue, invested: d.portfolio.totalInvested, unrealisedGain: d.portfolio.unrealisedPnL };
    let netWorth = d.netWorthAfterLiabilities;
    if (await hasClientBooks(ctx.userId)) {
      // The dashboard counts CA client books; rebuild the investments block
      // from the user's own portfolios and take the difference out of net worth.
      let cur = toDecimal('0');
      let cost = toDecimal('0');
      for (const p of await ownPortfolios(ctx.userId)) {
        const one = await getDashboardNetWorth(ctx.userId, p.id);
        cur = cur.plus(toDecimal(one.portfolio.currentValue));
        cost = cost.plus(toDecimal(one.portfolio.totalInvested));
      }
      netWorth = serializeMoney(toDecimal(d.netWorthAfterLiabilities).minus(toDecimal(d.portfolio.currentValue)).plus(cur));
      inv = { currentValue: serializeMoney(cur), invested: serializeMoney(cost), unrealisedGain: serializeMoney(cur.minus(cost)) };
    }
    const person = ctx.person ?? selfPerson(ctx.userId);
    // A capped family member's totals cannot be filtered, so such areas are left out.
    const has = (a: AiConnectorArea) => ctx.areas.includes(a) && areaWholeFor(person, a);
    const all = NET_WORTH_AREAS.every(has);
    const data: Record<string, unknown> = {
      asOf: dmy(ctx.now), owner: 'You', currency: 'INR',
      netWorth: all ? netWorth : null,
      ...(all ? {} : { netWorthNote: 'Net worth is hidden because not all areas are shared with this chatbot.' }),
    };
    if (has('investments')) data.investments = inv;
    if (has('property')) data.property = { count: d.realEstate.count, totalValue: d.realEstate.totalValue, monthlyRent: d.realEstate.monthlyRent, rentOverdueCount: d.realEstate.overdueCount };
    if (has('vehicles')) data.vehicles = { count: d.vehicles.count, totalValue: d.vehicles.totalValue, pendingChallans: d.vehicles.pendingChallans };
    if (has('insurance')) data.insurance = { activePolicies: d.insurance.activePoliciesCount, totalCover: d.insurance.totalSumAssured, annualPremium: d.insurance.annualPremiumTotal };
    if (has('loans')) data.loans = { outstanding: d.liabilities.totalOutstanding, monthlyEmi: d.liabilities.monthlyEmiTotal, loanCount: d.liabilities.loanCount };
    if (has('banking')) data.creditCards = { count: d.liabilities.creditCardCount, outstanding: d.liabilities.totalCreditCardOutstanding };

    // Alert titles are deliberately not sent: scanner titles can carry a
    // registration plate or a policy number. Type label and date only.
    const in30 = new Date(ctx.now.getTime() + 30 * 86_400_000);
    const alerts = await prisma.alert.findMany({
      where: { userId: ctx.userId, isActive: true, triggerDate: { gte: new Date(ctx.now.toISOString().slice(0, 10)), lte: in30 } },
      orderBy: { triggerDate: 'asc' }, take: 50, select: { type: true, triggerDate: true },
    });
    const upcoming = alerts
      .filter((x) => ALERT_AREA[x.type] !== undefined && has(ALERT_AREA[x.type]!))
      .map((x) => ({ what: ALERT_LABEL[x.type] ?? x.type, area: ALERT_AREA[x.type], date: dmy(x.triggerDate) }));
    data.upcoming = upcoming;
    return { rows: upcoming.length + 1, data };
  },
};

const listPeople: ConnectorTool<Record<string, never>> = {
  name: 'list_people',
  area: 'always',
  title: 'People',
  description: 'Whose data this chatbot can see. Pass a person id as member to other tools, or member "all".',
  input: {},
  noMember: true,
  async run(ctx) {
    const people = (ctx.people ?? [selfPerson(ctx.userId)]).map((p) => ({
      id: p.kind === 'self' ? 'me' : p.userId, name: p.label, relation: p.relation, kind: p.kind,
    }));
    return { rows: people.length, data: { asOf: dmy(ctx.now), people } };
  },
};

export const OVERVIEW_TOOLS = [getOverview, listPeople];
