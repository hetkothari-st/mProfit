import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import {
  backfillPiiAtRest,
  plateOf,
  revealTenancy,
  revealVehicle,
  sealText,
} from '../../src/services/piiAtRest.service.js';
import { createVehicle, getVehicle, listVehicles } from '../../src/services/vehicles.service.js';
import { createAccount, getAccount } from '../../src/services/bankAccounts.service.js';
import { createProperty, createTenancy, getProperty, updateTenancy } from '../../src/services/rental.service.js';

/**
 * The identifiers still stored as plain text after the PAN / plate / loan
 * work: the vehicle plate (dual-written), engine number, bank CIF and the
 * tenant's phone, email and free-text contact. Each is now ciphertext at
 * rest, and every API read decrypts it.
 */

describe('row shaping (no database)', () => {
  it('revealVehicle decrypts and drops ciphertext and fingerprint', async () => {
    const plate = await sealText('MH47BT5950');
    const engine = await sealText('ENG998877');
    const out = revealVehicle({
      id: 'v1',
      registrationNo: null,
      registrationNoEnc: plate.enc,
      registrationNoHash: 'abc',
      engineNo: null,
      engineNoEnc: engine.enc,
    });
    expect(out).toEqual({ id: 'v1', registrationNo: 'MH47BT5950', engineNo: 'ENG998877' });
  });

  it('revealVehicle leaves engineNo absent when the select did not ask for it', async () => {
    const plate = await sealText('MH47BT5950');
    const out = revealVehicle({ id: 'v1', registrationNo: null, registrationNoEnc: plate.enc });
    expect(out).toEqual({ id: 'v1', registrationNo: 'MH47BT5950' });
  });

  it('reads a legacy plaintext row the backfill has not reached', () => {
    expect(plateOf({ registrationNo: 'KA01AB1234', registrationNoEnc: null })).toBe('KA01AB1234');
    expect(
      revealTenancy({ tenantPhone: '9876543210', tenantPhoneEnc: null, tenantEmail: null, tenantEmailEnc: null }),
    ).toEqual({ tenantPhone: '9876543210', tenantEmail: null });
  });

  it('sealText stores blank input as nothing', async () => {
    expect(await sealText('   ')).toEqual({ plain: null, enc: null });
    expect(await sealText(null)).toEqual({ plain: null, enc: null });
  });
});

describe('services write ciphertext and read it back (database)', () => {
  let scope: TestScope;

  beforeEach(async () => {
    scope = await createTestScope('pii-remaining');
  });

  afterEach(async () => {
    await runAsSystem(async () => {
      await prisma.tenancy.deleteMany({ where: { property: { userId: scope.userId } } });
      await prisma.rentalProperty.deleteMany({ where: { userId: scope.userId } });
      await prisma.bankAccount.deleteMany({ where: { userId: scope.userId } });
      await prisma.vehicle.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it('vehicle: no plaintext plate at rest, plate served, duplicates caught by fingerprint', async () => {
    const created = await scope.runAs(() => createVehicle(scope.userId, { registrationNo: 'mh 47 bt 5950' }));
    expect(created.registrationNo).toBe('MH47BT5950');
    expect(created).not.toHaveProperty('registrationNoEnc');
    expect(created).not.toHaveProperty('registrationNoHash');

    const raw = await runAsSystem(() => prisma.vehicle.findUniqueOrThrow({ where: { id: created.id } }));
    expect(raw.registrationNo).toBeNull();
    expect(raw.registrationNoEnc).toBeTruthy();
    expect(raw.registrationNoLast4).toBe('5950');

    expect((await scope.runAs(() => getVehicle(scope.userId, created.id))).registrationNo).toBe('MH47BT5950');
    await expect(scope.runAs(() => createVehicle(scope.userId, { registrationNo: 'MH47 BT5950' }))).rejects.toThrow(
      /already exists/,
    );
  });

  it('vehicle list is sorted by the decrypted plate', async () => {
    await scope.runAs(() => createVehicle(scope.userId, { registrationNo: 'MH12ZZ0001' }));
    await scope.runAs(() => createVehicle(scope.userId, { registrationNo: 'DL01AA0001' }));
    const plates = (await scope.runAs(() => listVehicles(scope.userId))).map((v) => v.registrationNo);
    expect(plates).toEqual(['DL01AA0001', 'MH12ZZ0001']);
  });

  it('bank: customer ID stored encrypted, served in full, ciphertext never serialized', async () => {
    const dto = await scope.runAs(() =>
      createAccount(scope.userId, {
        bankName: 'HDFC Bank',
        accountType: 'SAVINGS',
        accountHolder: 'TEST USER',
        last4: '6789',
        customerId: 'CIF12345678',
      }),
    );
    expect(dto.customerId).toBe('CIF12345678');
    expect(dto).not.toHaveProperty('customerIdEnc');
    const raw = await runAsSystem(() => prisma.bankAccount.findUniqueOrThrow({ where: { id: dto.id } }));
    expect(raw.customerId).toBeNull();
    expect(raw.customerIdEnc).toBeTruthy();
    expect((await scope.runAs(() => getAccount(scope.userId, dto.id))).customerId).toBe('CIF12345678');
  });

  it('tenancy: phone, email and contact stored encrypted, served on the property and after edit', async () => {
    const property = await scope.runAs(() =>
      createProperty(scope.userId, { name: 'Test flat', propertyType: 'RESIDENTIAL' }),
    );
    const tenancy = await scope.runAs(() =>
      createTenancy(scope.userId, {
        propertyId: property.id,
        tenantName: 'TEST TENANT',
        tenantPhone: '9876543210',
        tenantEmail: 'tenant@example.com',
        tenantContact: 'call after 6',
        startDate: '2026-01-01',
        monthlyRent: '25000',
      }),
    );
    expect(tenancy.tenantPhone).toBe('9876543210');
    expect(tenancy).not.toHaveProperty('tenantPhoneEnc');

    const raw = await runAsSystem(() => prisma.tenancy.findUniqueOrThrow({ where: { id: tenancy.id } }));
    expect([raw.tenantPhone, raw.tenantEmail, raw.tenantContact]).toEqual([null, null, null]);
    expect(raw.tenantPhoneEnc && raw.tenantEmailEnc && raw.tenantContactEnc).toBeTruthy();

    const onProperty = (await scope.runAs(() => getProperty(scope.userId, property.id))).tenancies[0]!;
    expect(onProperty.tenantEmail).toBe('tenant@example.com');
    expect(onProperty.tenantContact).toBe('call after 6');

    const edited = await scope.runAs(() => updateTenancy(scope.userId, tenancy.id, { tenantPhone: '9123456789' }));
    expect(edited.tenantPhone).toBe('9123456789');
    // Untouched fields keep their value.
    expect(edited.tenantEmail).toBe('tenant@example.com');
  });

  it('backfill encrypts legacy plaintext, and clears it only when told to', async () => {
    const { vehicleId, bankId } = await runAsSystem(async () => {
      const v = await prisma.vehicle.create({
        data: { userId: scope.userId, registrationNo: 'GJ05CD6789', engineNo: 'ENG111' },
      });
      const b = await prisma.bankAccount.create({
        data: {
          userId: scope.userId,
          bankName: 'SBI',
          accountType: 'SAVINGS',
          accountHolder: 'TEST USER',
          last4: '1111',
          customerId: 'CIF999',
        },
      });
      return { vehicleId: v.id, bankId: b.id };
    });

    const prev = process.env.PII_BACKFILL_CLEAR_PLAINTEXT;
    try {
      delete process.env.PII_BACKFILL_CLEAR_PLAINTEXT;
      await runAsSystem(() => backfillPiiAtRest());
      let v = await runAsSystem(() => prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } }));
      expect(v.registrationNoEnc && v.engineNoEnc).toBeTruthy();
      expect(v.registrationNo).toBe('GJ05CD6789');

      process.env.PII_BACKFILL_CLEAR_PLAINTEXT = 'true';
      await runAsSystem(() => backfillPiiAtRest());
      v = await runAsSystem(() => prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } }));
      const b = await runAsSystem(() => prisma.bankAccount.findUniqueOrThrow({ where: { id: bankId } }));
      expect([v.registrationNo, v.engineNo, b.customerId]).toEqual([null, null, null]);
      expect(revealVehicle(v)).toMatchObject({ registrationNo: 'GJ05CD6789', engineNo: 'ENG111' });
    } finally {
      if (prev === undefined) delete process.env.PII_BACKFILL_CLEAR_PLAINTEXT;
      else process.env.PII_BACKFILL_CLEAR_PLAINTEXT = prev;
    }
  });
});
