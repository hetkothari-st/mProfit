import { z } from 'zod';
import { getAccount, listAccounts } from '../../banking/bankAccounts.service.js';
import { getCardSummary, listCards } from '../../banking/creditCards.service.js';
import { listIncomes } from '../../income/income.service.js';
import { MAX_ROWS, type ConnectorTool } from './types.js';
import { dmy, money } from './common.js';

const bankInput = { history: z.boolean().optional().describe('Include balance history (up to 200 points per account).') };
const listBankAccounts: ConnectorTool<typeof bankInput> = {
  name: 'list_bank_accounts', area: 'banking', familyGate: 'BANK_ACCOUNT', title: 'Bank accounts',
  description: 'Bank accounts with current balance, and optionally balance history.', input: bankInput,
  async run(ctx, args) {
    const rows = await listAccounts(ctx.userId);
    const accounts = [];
    for (const r of rows) {
      const history = args.history
        ? ((await getAccount(ctx.userId, r.id)).snapshots ?? []).slice(0, MAX_ROWS).map((s) => ({ date: dmy(s.asOfDate), balance: money(s.balance) }))
        : undefined;
      accounts.push({
        bank: r.bankName, type: r.accountType, account: r.last4 ? `XXXX${r.last4}` : null, status: r.status,
        balance: money(r.currentBalance), balanceAsOf: dmy(r.balanceAsOf), jointHolders: (r.jointHolders ?? []).length,
        nominee: r.nomineeName ?? null, userText: r.nickname ?? null, ...(history ? { history } : {}),
      });
    }
    return { rows: accounts.length, data: { asOf: dmy(ctx.now), currency: 'INR', accounts } };
  },
};

const listCreditCards: ConnectorTool<Record<string, never>> = {
  name: 'list_credit_cards', area: 'banking', familyGate: 'CREDIT_CARD', title: 'Credit cards',
  description: 'Credit cards with limit, outstanding, utilisation and the next bill due.', input: {},
  async run(ctx) {
    const rows = await listCards(ctx.userId);
    const cards = [];
    for (const r of rows) {
      const s = await getCardSummary(ctx.userId, r.id);
      const st = (r.statements ?? [])[0];
      cards.push({
        issuer: r.issuerBank, name: r.cardName, card: r.last4 ? `XXXX${r.last4}` : null, network: r.network, status: r.status,
        creditLimit: money(r.creditLimit), outstanding: s.outstanding, utilisationPct: s.utilizationPct,
        nextDueDate: dmy(s.nextDueDate), nextDueAmount: s.nextDueAmount,
        latestStatement: st ? { month: st.forMonth, amount: money(st.statementAmount), minimumDue: money(st.minimumDue), dueDate: dmy(st.dueDate), status: st.status } : null,
      });
    }
    return { rows: cards.length, data: { asOf: dmy(ctx.now), currency: 'INR', cards } };
  },
};

const listIncome: ConnectorTool<Record<string, never>> = {
  name: 'list_income', area: 'banking', familyGate: null, title: 'Income',
  description: 'Regular income sources (salary, rent, pension...) with monthly amount.', input: {},
  async run(ctx) {
    const rows = await listIncomes(ctx.userId);
    return {
      rows: rows.length,
      data: {
        asOf: dmy(ctx.now), currency: 'INR',
        incomes: rows.map((r) => ({ type: r.type, source: r.sourceName, monthlyAmount: r.monthlyAmount, payDay: r.payDay, active: r.isActive, userText: r.notes ?? null })),
      },
    };
  },
};

export const BANKING_TOOLS = [listBankAccounts, listCreditCards, listIncome];
