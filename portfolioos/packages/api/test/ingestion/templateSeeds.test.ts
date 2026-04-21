import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import {
  findSeedForAddress,
  findSeedsForAddresses,
  listActiveSeeds,
} from '../../src/services/templateSeeds.service.js';
import { createMonitoredSender } from '../../src/services/monitoredSenders.service.js';

/**
 * §6.10 template seed directory. The 25 seed rows are installed by
 * migration 20260421180000_phase_5_a_template_seeds and must be
 * present in any dev DB these tests run against.
 */

describe('TemplateSeed directory', () => {
  it('ships all 25 seed rows from the migration', async () => {
    const rows = await runAsSystem(() => listActiveSeeds());
    expect(rows.length).toBe(25);
    const byKind = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.institutionKind] = (acc[r.institutionKind] ?? 0) + 1;
      return acc;
    }, {});
    expect(byKind).toEqual({
      BANK: 10,
      BROKER: 8,
      INSURER: 5,
      REGISTRAR: 2,
    });
  });

  it('findSeedForAddress lowercases the input and returns the row', async () => {
    const seed = await runAsSystem(() =>
      findSeedForAddress('Alerts@HDFCBank.Net'),
    );
    expect(seed).not.toBeNull();
    expect(seed?.institutionName).toBe('HDFC Bank');
    expect(seed?.institutionKind).toBe('BANK');
  });

  it('findSeedForAddress returns null for unknown addresses', async () => {
    const seed = await runAsSystem(() =>
      findSeedForAddress('random-guy@example.test'),
    );
    expect(seed).toBeNull();
  });

  it('findSeedsForAddresses batches lookups and returns a Map keyed by lowercased address', async () => {
    const map = await runAsSystem(() =>
      findSeedsForAddresses([
        'alerts@hdfcbank.net',
        'noreply@zerodha.net',
        'random@example.test',
      ]),
    );
    expect(map.size).toBe(2);
    expect(map.get('alerts@hdfcbank.net')?.institutionName).toBe('HDFC Bank');
    expect(map.get('noreply@zerodha.net')?.institutionKind).toBe('BROKER');
    expect(map.has('random@example.test')).toBe(false);
  });
});

describe('MonitoredSender auto-fill from seed', () => {
  let scope: TestScope;

  beforeEach(async () => {
    scope = await createTestScope('seedfill');
  });

  afterEach(async () => {
    await runAsSystem(async () => {
      await prisma.monitoredSender.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it('lifts suggestedDisplayLabel when the user omits displayLabel', async () => {
    const row = await scope.runAs(() =>
      createMonitoredSender(scope.userId, { address: 'alerts@hdfcbank.net' }),
    );
    expect(row.displayLabel).toBe('HDFC Bank alerts');
  });

  it('keeps the user-supplied label even when a seed matches', async () => {
    const row = await scope.runAs(() =>
      createMonitoredSender(scope.userId, {
        address: 'alerts@hdfcbank.net',
        displayLabel: 'My HDFC',
      }),
    );
    expect(row.displayLabel).toBe('My HDFC');
  });

  it('leaves displayLabel null when no seed matches and no label supplied', async () => {
    const row = await scope.runAs(() =>
      createMonitoredSender(scope.userId, {
        address: 'credit-cards@someindiebank.test',
      }),
    );
    expect(row.displayLabel).toBeNull();
  });
});
