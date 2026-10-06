import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { lookupIfsc, clearIfscCache } from '../../src/services/ifscLookup.service.js';

// Real responses captured from https://ifsc.razorpay.com on 2026-09-10.
// Note the upstream ADDRESS quality: words run together, stray spaces
// before commas, state sometimes missing.
const SANDOZ_HOUSE = {
  MICR: '400240002',
  BRANCH: 'MUMBAI - SANDOZ HOUSE',
  ADDRESS: 'SANDOZ HOUSE, DR. A.B.ROADWORLIMUMBAIMAHARASHTRA400 018',
  STATE: 'MAHARASHTRA',
  CONTACT: '+919890603333',
  UPI: true,
  RTGS: true,
  CITY: 'GREATER MUMBAI',
  CENTRE: 'MUMBAI',
  DISTRICT: 'MUMBAI',
  NEFT: true,
  IMPS: true,
  SWIFT: 'HDFCINBB',
  ISO3166: 'IN-MH',
  BANK: 'HDFC Bank',
  BANKCODE: 'HDFC',
  IFSC: 'HDFC0000240',
};

const IMPS_BRANCH = {
  CITY: 'MUMBAI',
  STATE: 'MAHARASHTRA',
  CENTRE: 'MUMBAI',
  NEFT: true,
  SWIFT: 'HDFCINBB',
  RTGS: true,
  UPI: true,
  ISO3166: 'IN-MH',
  MICR: null,
  ADDRESS: '4TH FLOOR ,HDFC BANK HOUSE, SENAPATI BAPAT MARG, PAREL , MUMBAI -13',
  CONTACT: '+919831073333',
  DISTRICT: 'MUMBAI',
  IMPS: true,
  BRANCH: 'HDFC Bank IMPS',
  BANK: 'HDFC Bank',
  BANKCODE: 'HDFC',
  IFSC: 'HDFC0999999',
};

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  clearIfscCache();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lookupIfsc', () => {
  it('maps a real response and upper-cases the code', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SANDOZ_HOUSE));

    const info = await lookupIfsc(' hdfc0000240 ');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://ifsc.razorpay.com/HDFC0000240',
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(info).toEqual({
      ifsc: 'HDFC0000240',
      bank: 'HDFC Bank',
      branch: 'MUMBAI - SANDOZ HOUSE',
      address: 'SANDOZ HOUSE, DR. A.B.ROADWORLIMUMBAIMAHARASHTRA400 018',
      city: 'GREATER MUMBAI',
      state: 'MAHARASHTRA',
    });
  });

  it('tidies comma spacing and appends the state when the address lacks it', async () => {
    fetchMock.mockResolvedValue(jsonResponse(IMPS_BRANCH));
    const info = await lookupIfsc('HDFC0999999');
    expect(info?.address).toBe(
      '4TH FLOOR, HDFC BANK HOUSE, SENAPATI BAPAT MARG, PAREL, MUMBAI -13, MAHARASHTRA',
    );
  });

  it('returns null for an unknown IFSC and caches the miss', async () => {
    fetchMock.mockResolvedValue(new Response('"Not Found"', { status: 404 }));
    expect(await lookupIfsc('HDFC0123456')).toBeNull();
    expect(await lookupIfsc('HDFC0123456')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null for a malformed code without calling the API', async () => {
    expect(await lookupIfsc('HDFC00241')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caches successful lookups', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SANDOZ_HOUSE));
    await lookupIfsc('HDFC0000240');
    await lookupIfsc('HDFC0000240');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws on an upstream failure and does not cache it', async () => {
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 503 }));
    await expect(lookupIfsc('HDFC0000240')).rejects.toThrow(/503/);

    fetchMock.mockResolvedValueOnce(jsonResponse(SANDOZ_HOUSE));
    expect((await lookupIfsc('HDFC0000240'))?.branch).toBe('MUMBAI - SANDOZ HOUSE');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
