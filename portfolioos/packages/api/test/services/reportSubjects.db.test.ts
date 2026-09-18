import { describe, it, expect, afterEach } from 'vitest';
import ExcelJS from 'exceljs';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import { fakeRequest, fakeResponse } from '../helpers/fakeResponse.js';
import { getHoldingsExport, getStatementCapitalGains } from '../../src/controllers/reports.controller.js';
import { recomputeForPortfolio } from '../../src/services/holdingsProjection.js';

/**
 * Reports about somebody else in a family, against the database.
 *
 * Both things here were wrong in ways no unit test could see: the member's
 * rows are behind row-level security, so a report built in the caller's
 * context comes back empty rather than failing, and a household statement
 * merged only the first member's sections. Both need real users, a real
 * family and real RLS to show up.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function member(label: string, assetName: string, buy: string, sell?: string): Promise<TestScope> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  await runAsSystem(async () => {
    await prisma.transaction.create({
      data: {
        portfolioId: scope.portfolioId,
        assetClass: 'EQUITY',
        transactionType: 'BUY',
        assetName,
        assetKey: `name:${assetName}`,
        tradeDate: new Date('2023-05-01'),
        quantity: '100',
        price: buy,
        grossAmount: (100 * Number(buy)).toString(),
        netAmount: (100 * Number(buy)).toString(),
      },
    });
    if (sell) {
      await prisma.transaction.create({
        data: {
          portfolioId: scope.portfolioId,
          assetClass: 'EQUITY',
          transactionType: 'SELL',
          assetName,
          assetKey: `name:${assetName}`,
          tradeDate: new Date('2024-06-01'),
          quantity: '100',
          price: sell,
          grossAmount: (100 * Number(sell)).toString(),
          netAmount: (100 * Number(sell)).toString(),
        },
      });
    }
    await recomputeForPortfolio(scope.portfolioId);
  });
  return scope;
}

/** A family the owner can report on, with `other` as a second active member. */
async function family(owner: TestScope, other: TestScope): Promise<string> {
  const id = await runAsSystem(async () => {
    const fam = await prisma.family.create({ data: { name: 'Kothari Household', createdById: owner.userId } });
    await prisma.familyMember.create({ data: { familyId: fam.id, userId: owner.userId, role: 'OWNER', status: 'ACTIVE' } });
    await prisma.familyMember.create({ data: { familyId: fam.id, userId: other.userId, role: 'CONTRIBUTOR', status: 'ACTIVE' } });
    return fam.id;
  });
  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.familyMember.deleteMany({ where: { familyId: id } });
      await prisma.family.deleteMany({ where: { id } });
    });
  });
  return id;
}

async function sheetText(body: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(body);
  const out: string[] = [];
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((cell) => out.push(String(cell.value)))));
  return out.join('|');
}

describe('reports about another family member', () => {
  it('reads the member’s holdings, which row-level security hides from the caller', async () => {
    const owner = await member('subj-owner', 'Owner Stock', '100');
    const other = await member('subj-member', 'Member Stock', '250');
    const familyId = await family(owner, other);

    const captured = fakeResponse();
    await runAsUser(owner.userId, () =>
      getHoldingsExport(
        fakeRequest(owner.userId, { subject: other.userId, familyId, portfolioIds: 'all', format: 'xlsx' }),
        captured.res,
      ),
    );
    await captured.finished;

    const text = await sheetText(captured.body());
    expect(text).toContain('Member Stock');
    expect(text).not.toContain('Owner Stock');
  });

  it('puts every member’s realised gains in the household statement', async () => {
    const owner = await member('hh-owner', 'Owner Stock', '100', '150');
    const other = await member('hh-member', 'Member Stock', '250', '400');
    const familyId = await family(owner, other);

    const captured = fakeResponse();
    await runAsUser(owner.userId, () =>
      getStatementCapitalGains(
        fakeRequest(owner.userId, { subject: 'family', familyId, kind: 'all', format: 'xlsx' }),
        captured.res,
      ),
    );
    await captured.finished;

    const text = await sheetText(captured.body());
    // Both members' sales, each tagged with whose it is.
    expect(text).toContain('Owner Stock');
    expect(text).toContain('Member Stock');
    expect(text).toContain('Member');
  });
});
