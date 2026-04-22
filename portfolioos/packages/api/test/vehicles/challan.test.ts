import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseChallanPayload,
  parseChallanRow,
} from '../../src/adapters/vehicle/challan.js';

/**
 * §7.5 challan parse — echallan returns label/value-ish rows with a
 * mix of date formats and occasional missing fields. The parse must
 * drop unusable rows rather than fail the whole batch.
 */
describe('parseChallanRow', () => {
  it('returns null when required fields are missing', () => {
    expect(
      parseChallanRow({ challanno: 'X', offencedate: '2025-01-01' }),
    ).toBeNull();
    expect(parseChallanRow({})).toBeNull();
  });

  it('normalises dates, amounts, and status', () => {
    const row = parseChallanRow({
      challanno: 'DL1 CHL 0099',
      offencedate: '05/08/2025',
      offence: 'Over-speeding',
      location: 'Dhaula Kuan',
      amount: '₹1,500',
      status: 'pending',
    });
    expect(row).not.toBeNull();
    expect(row!.challanNo).toBe('DL1CHL0099');
    expect(row!.offenceDate).toBe('2025-08-05');
    expect(row!.amount).toBe('1500');
    expect(row!.status).toBe('PENDING');
    expect(row!.location).toBe('Dhaula Kuan');
  });

  it('maps "disposed" onto PAID', () => {
    const row = parseChallanRow({
      challanno: 'X1',
      offencedate: '2025-01-01',
      amount: '500',
      status: 'disposed',
    });
    expect(row!.status).toBe('PAID');
  });
});

describe('parseChallanPayload', () => {
  it('parses an array of rows, dropping malformed entries', () => {
    const rows = parseChallanPayload([
      {
        challanNo: 'A1',
        offenceDate: '2025-03-10',
        amount: '1000',
        status: 'pending',
      },
      { offenceDate: '2025-03-10', amount: '1000' }, // missing challanNo
      {
        challanno: 'B2',
        offencedate: '10-MAR-2025',
        amount: '750',
        status: 'paid',
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.challanNo).toBe('A1');
    expect(rows[1]!.offenceDate).toBe('2025-03-10');
    expect(rows[1]!.status).toBe('PAID');
  });

  it('accepts non-array input gracefully', () => {
    expect(parseChallanPayload(null)).toEqual([]);
    expect(parseChallanPayload({})).toEqual([]);
    expect(parseChallanPayload('not rows')).toEqual([]);
  });
});

/**
 * §7.5 adapter entry: gating via env flags. The fixture path is
 * exercised further by the parse tests above; this suite just
 * confirms the refusal/enablement behaviour.
 */
describe('fetchChallansForRegNo', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'production'; // gate requires explicit flag in production
    delete process.env.ENABLE_CHALLAN_ADAPTER;
    delete process.env.USE_CHALLAN_BROWSER;
    delete process.env.CHALLAN_FIXTURE_PATH;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('refuses to run when Gate G6 flag is off', async () => {
    const { fetchChallansForRegNo } = await import(
      '../../src/adapters/vehicle/challan.js'
    );
    const result = await fetchChallansForRegNo('MH47BT5950', '1234');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Gate G6/);
  });

  it('fails clearly when chassis is missing', async () => {
    process.env.ENABLE_CHALLAN_ADAPTER = 'true';
    const { fetchChallansForRegNo } = await import(
      '../../src/adapters/vehicle/challan.js'
    );
    const result = await fetchChallansForRegNo('MH47BT5950', null);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Chassis/);
  });
});
