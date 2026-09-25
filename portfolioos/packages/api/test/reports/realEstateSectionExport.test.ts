import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as reports from '../../src/controllers/reports.controller.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { fakeRequest, fakeResponse } from '../helpers/fakeResponse.js';

/**
 * The Real Estate page's Download button asked the holdings export for
 * REAL_ESTATE holdings, but owned properties are not holdings: they live in
 * OwnedProperty. The file came back with null / 0 in every column. The
 * section export reads the properties themselves.
 */
describe('real-estate section export', () => {
  let scope: TestScope;

  beforeAll(async () => {
    scope = await createTestScope('re-export');
    await runAsSystem(() =>
      prisma.ownedProperty.create({
        data: {
          userId: scope.userId,
          name: 'Andheri West Flat',
          city: 'Mumbai',
          propertyType: 'APARTMENT',
          status: 'RENTED_OUT',
          purchaseDate: new Date('2020-01-01'),
          purchasePrice: '6500000',
          stampDuty: '100000',
          registrationFee: '30000',
          brokerage: '50000',
          currentValue: '8500000',
          ownershipPercent: '50',
        },
      }),
    );
  }, 60_000);

  afterAll(async () => {
    await runAsSystem(() => prisma.ownedProperty.deleteMany({ where: { userId: scope.userId } }));
    await scope.cleanup();
  });

  it('lists each property with its real figures', async () => {
    const captured = fakeResponse();
    const req = fakeRequest(scope.userId, { section: 'real-estate', format: 'json' });
    await scope.runAs(() => reports.getSectionExport(req, captured.res));
    await captured.finished;

    const body = captured.json() as { data: { title: string; rows: Array<Record<string, unknown>> } };
    const { title, rows } = body.data;
    expect(title).toBe('Real Estate');
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.name).toBe('Andheri West Flat');
    expect(row.city).toBe('Mumbai');
    expect(row.purchasePrice).toBe('6500000');
    expect(row.costBasis).toBe('6680000'); // price + stamp + registration + brokerage
    expect(row.currentValue).toBe('8500000');
    expect(row.gain).toBe('1820000');
    expect(row.ownershipPercent).toBe('50');
  });
});
