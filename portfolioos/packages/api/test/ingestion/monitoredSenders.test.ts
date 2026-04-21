import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import {
  createMonitoredSender,
  updateMonitoredSender,
  deleteMonitoredSender,
  listMonitoredSenders,
} from '../../src/services/monitoredSenders.service.js';

describe('monitoredSenders CRUD', () => {
  let scope: TestScope;

  beforeEach(async () => {
    scope = await createTestScope('msenders');
  });

  afterEach(async () => {
    await runAsSystem(async () => {
      await prisma.monitoredSender.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it('creates a sender and lowercases the address', async () => {
    const row = await scope.runAs(() =>
      createMonitoredSender(scope.userId, {
        address: 'Alerts@HDFCBank.Net',
        displayLabel: 'HDFC alerts',
      }),
    );
    expect(row.address).toBe('alerts@hdfcbank.net');
    expect(row.displayLabel).toBe('HDFC alerts');
    expect(row.isActive).toBe(true);
    expect(row.autoCommitAfter).toBe(5);
    expect(row.autoCommitEnabled).toBe(false);
  });

  it('accepts a domain-scoped address form', async () => {
    const row = await scope.runAs(() =>
      createMonitoredSender(scope.userId, { address: '@hdfcbank.net' }),
    );
    expect(row.address).toBe('@hdfcbank.net');
  });

  it('rejects nonsense addresses', async () => {
    await expect(
      scope.runAs(() =>
        createMonitoredSender(scope.userId, { address: 'not an email' }),
      ),
    ).rejects.toThrow(/Invalid sender address/);
  });

  it('refuses duplicate addresses per user', async () => {
    await scope.runAs(() =>
      createMonitoredSender(scope.userId, { address: 'alerts@hdfcbank.net' }),
    );
    await expect(
      scope.runAs(() =>
        createMonitoredSender(scope.userId, { address: 'alerts@hdfcbank.net' }),
      ),
    ).rejects.toThrow(/already monitored/);
  });

  it('lists in active-then-address order', async () => {
    await scope.runAs(async () => {
      await createMonitoredSender(scope.userId, { address: 'b@bank.test' });
      const second = await createMonitoredSender(scope.userId, {
        address: 'a@bank.test',
      });
      await updateMonitoredSender(scope.userId, second.id, { isActive: false });
      await createMonitoredSender(scope.userId, { address: 'c@bank.test' });
    });

    const rows = await scope.runAs(() => listMonitoredSenders(scope.userId));
    expect(rows.map((r) => r.address)).toEqual([
      'b@bank.test',
      'c@bank.test',
      'a@bank.test',
    ]);
  });

  it('updates label, threshold, and auto-commit flag independently', async () => {
    const created = await scope.runAs(() =>
      createMonitoredSender(scope.userId, { address: 'alerts@hdfcbank.net' }),
    );
    const patched = await scope.runAs(() =>
      updateMonitoredSender(scope.userId, created.id, {
        displayLabel: 'HDFC Savings',
        autoCommitAfter: 3,
        autoCommitEnabled: true,
      }),
    );
    expect(patched.displayLabel).toBe('HDFC Savings');
    expect(patched.autoCommitAfter).toBe(3);
    expect(patched.autoCommitEnabled).toBe(true);
  });

  it('rejects autoCommitAfter outside [1, 100]', async () => {
    const created = await scope.runAs(() =>
      createMonitoredSender(scope.userId, { address: 'alerts@hdfcbank.net' }),
    );
    await expect(
      scope.runAs(() =>
        updateMonitoredSender(scope.userId, created.id, { autoCommitAfter: 0 }),
      ),
    ).rejects.toThrow(/autoCommitAfter/);
  });

  it('deletes a sender', async () => {
    const created = await scope.runAs(() =>
      createMonitoredSender(scope.userId, { address: 'alerts@hdfcbank.net' }),
    );
    await scope.runAs(() => deleteMonitoredSender(scope.userId, created.id));
    const rows = await scope.runAs(() => listMonitoredSenders(scope.userId));
    expect(rows).toHaveLength(0);
  });
});
