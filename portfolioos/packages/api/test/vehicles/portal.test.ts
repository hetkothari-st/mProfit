import { describe, expect, it } from 'vitest';
import { parseParivahanPortalPayload } from '../../src/adapters/vehicle/portal.js';

/**
 * §7.3 portal parse — the browser flow is gated by §16 G6, but the
 * parse layer is pure and cheap to exercise. Real portal dumps stamp
 * values in DD-MMM-YYYY, DD/MM/YYYY, and occasionally "NA". We
 * normalise everything to ISO (or drop if unparseable).
 */
describe('parseParivahanPortalPayload', () => {
  it('extracts core fields from a well-formed payload', () => {
    const record = parseParivahanPortalPayload(
      {
        'owner name': 'RAJESH KUMAR',
        'makers name': 'HYUNDAI MOTOR INDIA LTD',
        'model name': 'creta 1.5 SX',
        'fuel type': 'PETROL',
        'colour': 'POLAR WHITE',
        'mfg month/yr': '09/2021',
        'chassis no': 'MALBB51HLMM123456',
        'registering authority': 'NORTH DELHI (DL1C)',
        'insurance upto': '12/08/2026',
        'puc upto': '10-JUL-2025',
        'fitness upto': '2030-09-15',
        'tax upto': 'NA',
      },
      'DL1CAB1234',
    );

    expect(record.registrationNo).toBe('DL1CAB1234');
    expect(record.ownerName).toBe('RAJESH KUMAR');
    expect(record.make).toBe('HYUNDAI MOTOR INDIA LTD');
    expect(record.model).toBe('CRETA 1.5 SX');
    expect(record.fuelType).toBe('PETROL');
    expect(record.color).toBe('POLAR WHITE');
    expect(record.chassisLast4).toBe('3456');
    expect(record.manufacturingYear).toBe(2021);
    expect(record.rtoCode).toBe('DL1C');
    expect(record.insuranceExpiry).toBe('2026-08-12');
    expect(record.pucExpiry).toBe('2025-07-10');
    expect(record.fitnessExpiry).toBe('2030-09-15');
    // NA should drop, not fail.
    expect(record.roadTaxExpiry).toBeUndefined();
  });

  it('ignores blank values and unknown labels', () => {
    const record = parseParivahanPortalPayload(
      {
        'owner name': '',
        'something weird': 'value',
        'fuel type': 'DIESEL',
      },
      'MH47BT5950',
    );
    expect(record.ownerName).toBeUndefined();
    expect(record.fuelType).toBe('DIESEL');
    expect(record.registrationNo).toBe('MH47BT5950');
  });

  it('leaves fields undefined when dates cannot be parsed', () => {
    const record = parseParivahanPortalPayload(
      {
        'insurance upto': 'sometime next year',
      },
      'MH47BT5950',
    );
    expect(record.insuranceExpiry).toBeUndefined();
  });

  it('accepts unparenthesised rto codes verbatim', () => {
    const record = parseParivahanPortalPayload(
      { 'registering authority': 'MH47' },
      'MH47BT5950',
    );
    expect(record.rtoCode).toBe('MH47');
  });
});
