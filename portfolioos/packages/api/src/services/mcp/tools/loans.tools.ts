import { getLoanSummary, listLoans } from '../../loans.service.js';
import { listLoansGiven } from '../../loansGiven.service.js';
import { last4 } from '../mask.js';
import type { ConnectorTool } from './types.js';
import { dmy, money } from './common.js';

const listLoansTool: ConnectorTool<Record<string, never>> = {
  name: 'list_loans', area: 'loans', title: 'Loans',
  description: 'Loans you have taken: outstanding, EMI, rate, next EMI and recent payments.', input: {},
  async run(ctx) {
    const rows = await listLoans(ctx.userId);
    const loans = [];
    for (const r of rows) {
      const s = await getLoanSummary(ctx.userId, r.id);
      const acct = typeof r.accountNumber === 'string' ? r.accountNumber.replace(/\D/g, '') : '';
      loans.push({
        lender: r.lenderName, type: r.loanType, account: last4(acct), status: r.status,
        principal: money(r.principalAmount), interestRatePct: money(r.interestRate), emi: money(r.emiAmount), emiDueDay: r.emiDueDay,
        outstanding: s.outstandingBalance, nextEmiDate: dmy(s.nextEmiDate), nextEmiAmount: s.nextEmiAmount,
        remainingEmis: s.remainingEmiCount, totalInterestPaid: s.totalInterestPaid,
        vehicle: r.vehicle?.registrationNo ? last4(r.vehicle.registrationNo) : null,
        recentPayments: (r.payments ?? []).map((p) => ({ date: dmy(p.paidOn), amount: money(p.amount), principal: money(p.principalPart), interest: money(p.interestPart) })),
      });
    }
    return { rows: loans.length, data: { asOf: dmy(ctx.now), currency: 'INR', loans } };
  },
};

const listLoansGivenTool: ConnectorTool<Record<string, never>> = {
  name: 'list_loans_given', area: 'loans', familyGate: null, title: 'Money lent',
  description: 'Money you have lent to others: outstanding, received, interest due and next due date.', input: {},
  async run(ctx) {
    const rows = await listLoansGiven(ctx.userId);
    return {
      rows: rows.length,
      data: {
        asOf: dmy(ctx.now), currency: 'INR',
        loans: rows.map((r) => ({
          borrower: r.borrowerName, relationship: r.relationship ?? null, principal: r.principalAmount, lentOn: dmy(r.lentOn),
          interestRatePct: r.interestRate ?? null, dueDate: dmy(r.dueDate), status: r.status,
          outstanding: r.summary.outstandingPrincipal, received: r.summary.totalReceived, interestDue: r.summary.interestDue,
          nextDue: r.summary.nextDue ? { date: dmy(r.summary.nextDue.date), amount: r.summary.nextDue.amount } : null,
          overdueDays: r.summary.overdueDays, userText: r.notes ?? null,
        })),
      },
    };
  },
};

export const LOAN_TOOLS = [listLoansTool, listLoansGivenTool];
