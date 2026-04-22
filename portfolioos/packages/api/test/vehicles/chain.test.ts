import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * §7.1 Vehicle adapter chain — walks in priority order, first `ok:true`
 * wins, writes DLQ when everything failed. The chain module imports the
 * real IngestionFailure writer; we mock it so these tests stay DB-free
 * and deterministic.
 */

const writeFailure = vi.fn();
vi.mock('../../src/services/ingestionFailures.service.js', () => ({
  writeIngestionFailure: writeFailure,
}));

const { runVehicleChain } = await import('../../src/adapters/vehicle/chain.js');
import type { VehicleAdapter } from '../../src/adapters/vehicle/types.js';

function makeAdapter(
  id: string,
  options: {
    ok?: boolean;
    supportsAuto?: boolean;
    error?: string;
    throws?: boolean;
  } = {},
): VehicleAdapter {
  return {
    id,
    version: '1',
    displayName: id,
    supportsAuto: options.supportsAuto ?? true,
    async fetch(regNo) {
      if (options.throws) throw new Error(`${id} threw`);
      if (options.ok) {
        return {
          ok: true,
          record: {
            registrationNo: regNo,
            make: 'TEST',
            metadata: { from: id },
          },
        };
      }
      return {
        ok: false,
        error: options.error ?? `${id} failed`,
      };
    },
  };
}

beforeEach(() => {
  writeFailure.mockReset();
  writeFailure.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runVehicleChain', () => {
  it('returns the first adapter that succeeds', async () => {
    const a = makeAdapter('a', { ok: true });
    const b = makeAdapter('b', { ok: true });
    const result = await runVehicleChain({
      userId: 'u1',
      registrationNo: 'MH47BT5950',
      mode: 'interactive',
      context: {},
      adapters: [a, b],
    });
    expect(result.ok).toBe(true);
    expect(result.source).toBe('a');
    expect(result.attempts).toHaveLength(1);
    expect(writeFailure).not.toHaveBeenCalled();
  });

  it('falls through failed adapters to the next', async () => {
    const a = makeAdapter('a', { ok: false, error: 'first failed' });
    const b = makeAdapter('b', { ok: true });
    const result = await runVehicleChain({
      userId: 'u1',
      registrationNo: 'MH47BT5950',
      mode: 'interactive',
      context: {},
      adapters: [a, b],
    });
    expect(result.ok).toBe(true);
    expect(result.source).toBe('b');
    expect(result.attempts.map((a) => a.ok)).toEqual([false, true]);
    expect(writeFailure).not.toHaveBeenCalled();
  });

  it('survives adapters that throw and continues', async () => {
    const a = makeAdapter('a', { throws: true });
    const b = makeAdapter('b', { ok: true });
    const result = await runVehicleChain({
      userId: 'u1',
      registrationNo: 'MH47BT5950',
      mode: 'interactive',
      context: {},
      adapters: [a, b],
    });
    expect(result.ok).toBe(true);
    expect(result.attempts[0]?.ok).toBe(false);
    expect(result.attempts[0]?.error).toContain('threw');
  });

  it('writes DLQ when every adapter fails', async () => {
    const a = makeAdapter('a', { ok: false, error: 'nope' });
    const b = makeAdapter('b', { ok: false, error: 'also nope' });
    const result = await runVehicleChain({
      userId: 'u1',
      registrationNo: 'MH47BT5950',
      mode: 'interactive',
      context: {},
      adapters: [a, b],
    });
    expect(result.ok).toBe(false);
    expect(writeFailure).toHaveBeenCalledTimes(1);
    const call = writeFailure.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.userId).toBe('u1');
    expect(call.sourceAdapter).toBe('vehicle.chain');
    expect(call.sourceRef).toBe('MH47BT5950');
  });

  it('skips interactive adapters in auto mode and does not DLQ skip-only runs', async () => {
    const interactive = makeAdapter('sms', { ok: true, supportsAuto: false });
    const result = await runVehicleChain({
      userId: 'u1',
      registrationNo: 'MH47BT5950',
      mode: 'auto',
      context: {},
      adapters: [interactive],
    });
    expect(result.ok).toBe(false);
    expect(result.attempts[0]?.error).toContain('skipped');
    // Nothing actually attempted → no DLQ noise.
    expect(writeFailure).not.toHaveBeenCalled();
  });

  it('runs interactive adapters when mode=interactive', async () => {
    const interactive = makeAdapter('sms', { ok: true, supportsAuto: false });
    const result = await runVehicleChain({
      userId: 'u1',
      registrationNo: 'MH47BT5950',
      mode: 'interactive',
      context: {},
      adapters: [interactive],
    });
    expect(result.ok).toBe(true);
    expect(result.source).toBe('sms');
  });
});
