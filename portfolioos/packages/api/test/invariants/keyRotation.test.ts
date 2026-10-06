import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { env } from '../../src/config/env.js';
import { rotateAppEncryptionKey } from '../../src/services/appKeyRotation.service.js';
import { createVehicle, getVehicle } from '../../src/services/vehicles.service.js';
import { createAccount, getAccount } from '../../src/services/bankAccounts.service.js';
import { findVehicleByPlate } from '../../src/services/piiAtRest.service.js';
import { forgetUserDek } from '../../src/lib/userKeys.js';
import { readBuffer, saveBuffer } from '../../src/lib/documentStorage.js';
import { decryptSecret, encryptSecret } from '../../src/lib/secrets.js';
import { rotateLegacySecrets } from '../../src/services/secretRotation.service.js';

/**
 * A full APP_ENCRYPTION_KEY rotation against a real database: data written
 * under K1 stays readable while K1 is "previous", the boot job moves every
 * ciphertext, fingerprint and wrapped user key to K2, and afterwards K1 can be
 * dropped entirely. The test rotates back to K1 at the end, so the shared test
 * database is left as it found it.
 */
// The key the test database's rows are written under (test/helpers/env.setup).
// Not read from process.env: other test files in this process set their own
// key and don't all restore it.
const K1 = Buffer.alloc(32, 7).toString('base64');
const K2 = Buffer.alloc(32, 42).toString('base64');
const ORIGINAL = process.env.APP_ENCRYPTION_KEY;

function useKeys(current: string, previous?: string) {
  process.env.APP_ENCRYPTION_KEY = current;
  if (previous) process.env.APP_ENCRYPTION_KEY_PREVIOUS = previous;
  else delete process.env.APP_ENCRYPTION_KEY_PREVIOUS;
}

describe('APP_ENCRYPTION_KEY rotation', () => {
  let scope: TestScope;
  let vehicleId: string;
  let bankId: string;
  const PDF = Buffer.from('%PDF-1.7 vault file for TEST USER');

  beforeAll(async () => {
    useKeys(K1);
    scope = await createTestScope('key-rotation');
    vehicleId = (await scope.runAs(() => createVehicle(scope.userId, { registrationNo: 'KA05MN4321' }))).id;
    bankId = (
      await scope.runAs(() =>
        createAccount(scope.userId, {
          bankName: 'HDFC Bank',
          accountType: 'SAVINGS',
          accountHolder: 'TEST USER',
          last4: '6789',
          accountNumber: '50100123456789',
          customerId: 'CIF7777',
        }),
      )
    ).id;
    await saveBuffer(scope.userId, 'rot-test.pdf', PDF);
  });

  afterAll(async () => {
    // Move everything back under K1 for the rest of the suite.
    useKeys(K1, K2);
    await runAsSystem(() => rotateAppEncryptionKey());
    useKeys(K1);
    forgetUserDek(scope.userId);
    process.env.APP_ENCRYPTION_KEY = ORIGINAL;
    await runAsSystem(async () => {
      await prisma.documentBlob.deleteMany({ where: { userId: scope.userId } });
      await prisma.userDataKey.deleteMany({ where: { userId: scope.userId } });
      await prisma.bankAccount.deleteMany({ where: { userId: scope.userId } });
      await prisma.vehicle.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it('keeps everything readable mid-rotation, moves it, and works with K1 gone', async () => {
    const before = await runAsSystem(() => prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } }));

    // Deploy 1: new key, old one as previous. Nothing moved yet, all readable.
    useKeys(K2, K1);
    forgetUserDek(scope.userId);
    expect((await scope.runAs(() => getVehicle(scope.userId, vehicleId))).registrationNo).toBe('KA05MN4321');
    expect((await scope.runAs(() => getAccount(scope.userId, bankId))).customerId).toBe('CIF7777');
    expect((await readBuffer(scope.userId, 'rot-test.pdf')).equals(PDF)).toBe(true);

    const pass = await runAsSystem(() => rotateAppEncryptionKey());
    // Other test files leave rows under keys of their own; none of ours fail.
    const ours = new Set([vehicleId, bankId, scope.userId]);
    expect(pass.failures.filter((f) => ours.has(f.id))).toEqual([]);
    expect(pass.reencrypted).toBeGreaterThan(0);
    expect(pass.rehashed).toBeGreaterThan(0);
    expect(pass.rewrappedKeys).toBeGreaterThan(0);

    const after = await runAsSystem(() => prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } }));
    expect(after.registrationNoEnc).not.toBe(before.registrationNoEnc);
    expect(after.registrationNoHash).not.toBe(before.registrationNoHash);

    // A second pass moves nothing.
    const again = await runAsSystem(() => rotateAppEncryptionKey());
    expect([again.reencrypted, again.rehashed, again.rewrappedKeys]).toEqual([0, 0, 0]);
    expect(again.failed).toBe(pass.failed);

    // Deploy 2: K1 removed. Values, fingerprint lookups and vault files work.
    useKeys(K2);
    forgetUserDek(scope.userId);
    expect((await scope.runAs(() => getVehicle(scope.userId, vehicleId))).registrationNo).toBe('KA05MN4321');
    expect((await scope.runAs(() => getAccount(scope.userId, bankId))).customerId).toBe('CIF7777');
    expect((await scope.runAs(() => findVehicleByPlate(scope.userId, 'ka 05 mn 4321')))?.id).toBe(vehicleId);
    expect((await readBuffer(scope.userId, 'rot-test.pdf')).equals(PDF)).toBe(true);
  });
});

describe('SECRETS_KEY rotation', () => {
  it('reads a secret under the previous key and re-encrypts it under the new one', async () => {
    const original = env.SECRETS_KEY;
    const OLD = 'old-secrets-key-that-is-at-least-32-chars!!';
    const NEW = 'new-secrets-key-that-is-at-least-32-chars!!';
    try {
      env.SECRETS_KEY = OLD;
      const stored = encryptSecret('broker-api-secret');

      env.SECRETS_KEY = NEW;
      process.env.SECRETS_KEY_PREVIOUS = OLD;
      expect(decryptSecret(stored)).toBe('broker-api-secret');

      delete process.env.SECRETS_KEY_PREVIOUS;
      expect(() => decryptSecret(stored)).toThrow();
    } finally {
      env.SECRETS_KEY = original;
      delete process.env.SECRETS_KEY_PREVIOUS;
    }
  });

  it('the rotation job is a no-op when no rotation is in progress', async () => {
    const r = await runAsSystem(() => rotateLegacySecrets());
    expect(r.undecryptable).toBe(0);
  });
});
