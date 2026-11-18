import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const policyFindMany = vi.fn();
const loanFindMany = vi.fn();
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: { insurancePolicy: { findMany: policyFindMany }, loan: { findMany: loanFindMany } },
}));

const { getLinkedCover } = await import('../../src/services/policyCheck/linkedCover.js');

beforeEach(() => {
  policyFindMany.mockReset();
  loanFindMany.mockReset();
});

describe('getLinkedCover', () => {
  it('sums other life policies and excludes this one + non-life types in the query', async () => {
    policyFindMany.mockResolvedValue([
      { id: 'a', insurer: 'LIC', planName: 'Jeevan', type: 'ENDOWMENT', sumAssured: new Prisma.Decimal('500000') },
      { id: 'b', insurer: 'HDFC Life', planName: null, type: 'TERM', sumAssured: new Prisma.Decimal('10000000') },
    ]);
    loanFindMany.mockResolvedValue([]);
    const r = await getLinkedCover('u1', 'this-policy');
    expect(r.otherLifeCoverInr).toBe('10500000.0000');
    expect(r.otherPolicies).toHaveLength(2);
    expect(r.outstandingLoansInr).toBe('0.0000');
    const where = policyFindMany.mock.calls[0]![0].where;
    expect(where.userId).toBe('u1');
    expect(where.id).toEqual({ not: 'this-policy' });
    expect(where.status).toBe('ACTIVE');
    expect(where.type.in).toEqual(['TERM', 'WHOLE_LIFE', 'ENDOWMENT', 'ULIP']);
    expect(where.type.in).not.toContain('HEALTH');
  });

  it('uses the loan principal as outstanding when no payments are recorded and scopes to the user', async () => {
    policyFindMany.mockResolvedValue([]);
    loanFindMany.mockResolvedValue([
      {
        id: 'l1', lenderName: 'HDFC', loanType: 'HOME',
        principalAmount: new Prisma.Decimal('2000000'), interestRate: new Prisma.Decimal('8.5'),
        tenureMonths: 240, emiAmount: new Prisma.Decimal('17356'), emiDueDay: 5,
        firstEmiDate: new Date('2099-01-05'), prepaymentOption: 'REDUCE_TENURE', payments: [],
      },
    ]);
    const r = await getLinkedCover('u1', 'p');
    expect(r.loans).toHaveLength(1);
    expect(r.outstandingLoansInr).toBe('2000000.0000');
    expect(loanFindMany.mock.calls[0]![0].where.userId).toBe('u1');
  });
});
