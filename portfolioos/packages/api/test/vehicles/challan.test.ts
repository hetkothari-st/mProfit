import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHALLAN_ADAPTER_ID,
  parseChallanPayload,
  parseChallanRow,
} from '../../src/adapters/vehicle/challan.js';

// The adapter's first two sources are live HTTP (carinfo.app scrape and the
// echallan REST endpoint). Stub both so this file never touches the network —
// otherwise the gating assertions below depend on whether two third-party
// sites happen to be up, and the suite pays a 10s timeout per source.
vi.mock('../../src/adapters/vehicle/carinfo.js', () => ({
  fetchCarInfoChallans: vi.fn(async () => {
    throw new Error('carinfo stubbed out in tests');
  }),
}));

// Playwright is the one source Gate G6 guards: it launches a *headed* browser
// and needs a human for the CAPTCHA/OTP. Mock the module so we can assert
// whether the gate let it launch, without ever launching anything.
const launchMock = vi.hoisted(() => vi.fn());
vi.mock('playwright', () => ({
  chromium: {
    launch: launchMock,
  },
}));

function fakeBrowser(rows: unknown[]) {
  const page = {
    goto: vi.fn(async () => undefined),
    fill: vi.fn(async () => undefined),
    waitForSelector: vi.fn(async () => undefined),
    $$eval: vi.fn(async () => rows),
  };
  return {
    newContext: async () => ({ newPage: async () => page }),
    close: vi.fn(async () => undefined),
  };
}

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
 * §7.5 adapter entry: gating via env flags.
 *
 * The adapter is a *chain* of four sources (see the header comment in
 * challan.ts): carinfo scrape → echallan REST → headed Playwright session →
 * fixture. Gate G6 (`ENABLE_CHALLAN_ADAPTER`) and the chassis argument gate
 * only source 3 — the one that drives a visible browser and needs a human to
 * clear the CAPTCHA/OTP. Sources 1, 2 and 4 are unattended and deliberately
 * ungated, so a closed gate must *not* make the whole call fail; it must just
 * fall through to the fixture source.
 *
 * (These tests used to assert `ok === false` with a "Gate G6"/"Chassis" error.
 * That matched the original single-source adapter; the source chain replaced
 * it in `feat(vehicle): APIMall RC + challan adapters; wire into chain` and
 * `feat(vehicle): CarInfo.app scraper + echallan HTTP`, and the refusal is no
 * longer reachable.)
 */
describe('fetchChallansForRegNo', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'production'; // gate requires explicit flag in production
    delete process.env.ENABLE_CHALLAN_ADAPTER;
    delete process.env.CHALLAN_FIXTURE_PATH;
    // Source 3 only reaches Playwright when this is set; leave it on so the
    // gate/chassis decision is observable via `launchMock`.
    process.env.USE_CHALLAN_BROWSER = 'true';
    launchMock.mockReset();
    launchMock.mockResolvedValue(fakeBrowser([]));
    // Source 2 is a bare `fetch` to echallan.parivahan.gov.in.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network stubbed out in tests');
      }),
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not open a browser session when the Gate G6 flag is off', async () => {
    const { fetchChallansForRegNo } = await import(
      '../../src/adapters/vehicle/challan.js'
    );
    const result = await fetchChallansForRegNo('MH47BT5950', '1234');
    expect(launchMock).not.toHaveBeenCalled();
    // Chain still resolves — it falls through to the fixture source.
    expect(result.ok).toBe(true);
    expect(result.source).toBe('fixture');
    expect(result.challans).toEqual([]);
  });

  it('opens the browser session once Gate G6 is open', async () => {
    process.env.ENABLE_CHALLAN_ADAPTER = 'true';
    launchMock.mockResolvedValue(
      fakeBrowser([
        {
          challanno: 'MH 47 CHL 1',
          offencedate: '05/08/2025',
          offence: 'Over-speeding',
          location: 'Pune',
          amount: '1,500',
          status: 'pending',
        },
      ]),
    );
    const { fetchChallansForRegNo } = await import(
      '../../src/adapters/vehicle/challan.js'
    );
    const result = await fetchChallansForRegNo('MH47BT5950', '1234');
    expect(launchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.source).toBe(CHALLAN_ADAPTER_ID);
    expect(result.challans).toHaveLength(1);
    expect(result.challans[0]!.challanNo).toBe('MH47CHL1');
    expect(result.challans[0]!.amount).toBe('1500');
  });

  it('skips the browser session when chassis is missing', async () => {
    process.env.ENABLE_CHALLAN_ADAPTER = 'true';
    const { fetchChallansForRegNo } = await import(
      '../../src/adapters/vehicle/challan.js'
    );
    const result = await fetchChallansForRegNo('MH47BT5950', null);
    // The echallan form requires the chassis last-4; without it there is
    // nothing to type into the browser, so the source must be skipped.
    expect(launchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.source).toBe('fixture');
  });
});
