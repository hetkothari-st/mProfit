import { describe, expect, it } from 'vitest';
import { parseVahanSms, smsVehicleAdapter } from '../../src/adapters/vehicle/sms.js';

/**
 * §7.4 SMS adapter — pure regex parsing, no DB. Covers the two SMS
 * formats we've observed and graceful degradation on unrecognised text.
 */

describe('parseVahanSms', () => {
  it('parses a colon/comma-delimited VAHAN SMS', () => {
    const body = `RC: MH47BT5950, Owner: RAJESH KUMAR, Make/Model: HONDA CITY, Fuel: PETROL, MFG: 2019, Chassis: XXXX1234, Insurance: 12/03/2025, PUC: 01/09/2024, Fitness: --, Road Tax: 15/06/2030`;
    const result = parseVahanSms('MH47BT5950', body);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record).toMatchObject({
      registrationNo: 'MH47BT5950',
      ownerName: 'RAJESH KUMAR',
      make: 'HONDA',
      model: 'CITY',
      fuelType: 'PETROL',
      manufacturingYear: 2019,
      chassisLast4: '1234',
      insuranceExpiry: '2025-03-12',
      pucExpiry: '2024-09-01',
      roadTaxExpiry: '2030-06-15',
    });
    expect(result.record.fitnessExpiry).toBeUndefined();
  });

  it('parses a pipe-delimited SMS with DD-MMM-YYYY dates', () => {
    const body = `Vehicle: DL1CAB1234 | HYUNDAI CRETA | Petrol | Owner: XYZ | Ins: 15-Jan-2025 | PUC: 20-Feb-2025`;
    const result = parseVahanSms('DL1CAB1234', body);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.insuranceExpiry).toBe('2025-01-15');
    expect(result.record.pucExpiry).toBe('2025-02-20');
    expect(result.record.fuelType).toBe('PETROL');
    expect(result.record.ownerName).toBe('XYZ');
  });

  it('rejects SMS that does not mention the RC number', () => {
    const body = `RC: KA05MP9999, Owner: FOO BAR, Fuel: DIESEL`;
    const result = parseVahanSms('MH47BT5950', body);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('MH47BT5950');
  });

  it('rejects empty body', () => {
    expect(parseVahanSms('MH47BT5950', '').ok).toBe(false);
    expect(parseVahanSms('MH47BT5950', 'short').ok).toBe(false);
  });

  it('warns when only the RC number was extractable', () => {
    const body = `MH47BT5950 is the only thing we can recognise in this message`;
    const result = parseVahanSms('MH47BT5950', body);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings ?? []).toContain(
      'SMS format not recognised. Only the registration number was saved — fill the rest manually.',
    );
  });

  it('normalises RC to uppercase with no whitespace', () => {
    const body = `RC: mh 47 bt 5950, Owner: TESTER`;
    const result = parseVahanSms('mh47bt5950', body);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.registrationNo).toBe('MH47BT5950');
  });
});

describe('smsVehicleAdapter', () => {
  it('returns ok:false when smsBody missing from context', async () => {
    const result = await smsVehicleAdapter.fetch('MH47BT5950', { userId: 'u1' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/smsBody/);
  });

  it('routes through parseVahanSms when smsBody present', async () => {
    const result = await smsVehicleAdapter.fetch('MH47BT5950', {
      userId: 'u1',
      smsBody: 'RC: MH47BT5950, Owner: A',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.ownerName).toBe('A');
  });

  it('declares interactive adapter metadata', () => {
    expect(smsVehicleAdapter.id).toBe('vahan.sms');
    expect(smsVehicleAdapter.version).toBe('1');
    expect(smsVehicleAdapter.supportsAuto).toBe(false);
  });
});
