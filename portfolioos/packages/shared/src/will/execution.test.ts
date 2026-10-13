import { describe, it, expect } from 'vitest';
import {
  addYearsIso, isIsoDay, normaliseWillName, willDocumentTag, willExecutionInputSchema, willExecutionRecordSchema, willNextReviewDate,
  willWitnessIssues,
  willWitnessWarnings,
} from './execution.js';
import { validWillPayload } from './__tests__/fixtures.js';

describe('dates', () => {
  it('adds years, clamping 29 February', () => {
    expect(addYearsIso('2026-10-20', 2)).toBe('2028-10-20');
    expect(addYearsIso('2024-02-29', 2)).toBe('2026-02-28');
    expect(addYearsIso('2024-02-29', 4)).toBe('2028-02-29');
    expect(addYearsIso('2026-12-31', 2)).toBe('2028-12-31');
  });

  it('reviews two years after signing', () => {
    expect(willNextReviewDate('2026-10-12')).toBe('2028-10-12');
  });

  it('accepts real calendar days only', () => {
    expect(isIsoDay('2026-10-12')).toBe(true);
    expect(isIsoDay('2026-02-30')).toBe(false);
    expect(isIsoDay('12/10/2026')).toBe(false);
    expect(isIsoDay('')).toBe(false);
  });
});

describe('names', () => {
  it('normalises case, spacing and width', () => {
    expect(normaliseWillName('  Sunita   VERMA ')).toBe('sunita verma');
    expect(normaliseWillName('Ｓｕｎｉｔａ')).toBe('sunita');
    expect(normaliseWillName('सुनीता  वर्मा')).toBe(
      'सुनीता वर्मा',
    );
  });
});

describe('execution input', () => {
  it('accepts a date and two trimmed names', () => {
    const r = willExecutionInputSchema.parse({ executedOn: '2026-10-20', witnesses: [' Asha Rao ', 'Vikram Shah'] });
    expect(r).toEqual({ executedOn: '2026-10-20', witnesses: ['Asha Rao', 'Vikram Shah'] });
  });

  it('refuses bad dates, short or long names and a missing witness', () => {
    const ok = { executedOn: '2026-10-20', witnesses: ['Asha Rao', 'Vikram Shah'] };
    expect(willExecutionInputSchema.safeParse({ ...ok, executedOn: '2026-02-30' }).success).toBe(false);
    expect(willExecutionInputSchema.safeParse({ ...ok, witnesses: ['A', 'Vikram Shah'] }).success).toBe(false);
    expect(willExecutionInputSchema.safeParse({ ...ok, witnesses: ['Asha Rao', 'x'.repeat(121)] }).success).toBe(false);
    expect(willExecutionInputSchema.safeParse({ ...ok, witnesses: ['Asha Rao'] }).success).toBe(false);
  });
});

describe('witness checks', () => {
  it('flags a beneficiary as witness, whatever the spacing or case', () => {
    const p = validWillPayload();
    expect(willWitnessWarnings(p, ['Asha Rao', 'Vikram Shah'])).toEqual([]);
    expect(willWitnessWarnings(p, ['  sunita   VERMA', 'Vikram Shah'])).toEqual(['WITNESS_IS_BENEFICIARY']);
    expect(willWitnessWarnings(p, ['Asha Rao', 'Pune Animal Trust'])).toEqual(['WITNESS_IS_BENEFICIARY']);
  });

  it('flags a back-up beneficiary who is not otherwise named in a gift', () => {
    const p = validWillPayload();
    p.people.push({ ...p.people[1]!, id: 'p-backup', name: 'Meera Iyer', contingentId: null });
    p.people[1] = { ...p.people[1]!, contingentId: 'p-backup' };
    expect(willWitnessWarnings(p, ['Meera Iyer', 'Vikram Shah'])).toEqual(['WITNESS_IS_BENEFICIARY']);
  });

  it('refuses the testator and the same person twice', () => {
    const p = validWillPayload();
    expect(willWitnessIssues(p, ['Ramesh Kumar Verma', 'Asha Rao'])).toEqual([{ path: 'witnesses.0', code: 'witness_is_testator' }]);
    expect(willWitnessIssues(p, ['Asha Rao', 'asha  rao'])).toEqual([{ path: 'witnesses.1', code: 'duplicate_witness' }]);
    expect(willWitnessIssues(p, ['Asha Rao', 'Vikram Shah'])).toEqual([]);
  });
});

describe('willDocumentTag', () => {
  it('labels a live will and its signed copy with the version', () => {
    expect(willDocumentTag('GENERATED', 'will', 3)).toEqual({ current: true, label: 'Your will (version 3)' });
    expect(willDocumentTag('EXECUTED', 'executed', 3)).toEqual({ current: true, label: 'Signed copy (version 3)' });
  });

  it('marks every file of a replaced will as replaced', () => {
    expect(willDocumentTag('SUPERSEDED', 'will', 2)).toEqual({ current: false, label: 'Replaced by a later will' });
    expect(willDocumentTag('SUPERSEDED', 'executed', 2)).toEqual({ current: false, label: 'Replaced by a later will' });
  });
});

describe('willExecutionRecordSchema', () => {
  const base = { executedOn: '2026-10-12', witnesses: ['Asha Rao', 'Vikram Shah'] };
  it('needs recordedAt as an ISO date-time', () => {
    expect(willExecutionRecordSchema.safeParse({ ...base, recordedAt: '2026-10-12T06:00:00.000Z' }).success).toBe(true);
    expect(willExecutionRecordSchema.safeParse({ ...base, recordedAt: 'yesterday' }).success).toBe(false);
  });
});
