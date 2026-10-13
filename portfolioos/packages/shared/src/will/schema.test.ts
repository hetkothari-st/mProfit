import { describe, it, expect } from 'vitest';
import {
  applyWillSection, emptyWillPayload, isWillSection, willAllocationSchema, willAssetItemSchema,
  willPayloadSchema, willSectionData, WILL_SECTION_SCHEMAS,
} from './schema.js';
import { item, validWillPayload } from './__tests__/fixtures.js';

describe('will payload schema', () => {
  it('parses an empty object into a complete empty draft', () => {
    const p = emptyWillPayload();
    expect(p.schemaVer).toBe(1);
    expect(p.details).toEqual({
      legalName: '', dob: null, jurisdiction: 'IN', personalLaw: null, address: '',
      maritalStatus: null, hasChildren: null, hasDependents: null,
    });
    expect(p.people).toEqual([]);
    expect(p.roles).toEqual({ executorId: null, altExecutorId: null, guardianId: null, altGuardianId: null });
    expect(p.estate).toEqual({ asOf: null, items: [], failedSources: [] });
    expect(p.allocation).toEqual({ residuary: [], specificGifts: [], fixedGifts: [] });
    expect(p.instructions).toEqual({ text: '' });
  });

  it('round-trips a full payload unchanged', () => {
    const p = validWillPayload();
    expect(willPayloadSchema.parse(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('percent schema: two decimals at most, never above 100', () => {
    const ok = (sharePct: string) => willAllocationSchema.safeParse({ residuary: [{ personId: 'a', sharePct }] }).success;
    expect(ok('33.33')).toBe(true);
    expect(ok('100')).toBe(true);
    expect(ok('100.00')).toBe(true);
    expect(ok('33.333')).toBe(false);
    expect(ok('100.01')).toBe(false);
    expect(ok('-5')).toBe(false);
    expect(ok('abc')).toBe(false);
  });

  it('amounts are plain decimal strings with at most two decimals', () => {
    const ok = (value: string) => willAssetItemSchema.safeParse(item({ sourceKey: 'x', label: 'X', value })).success;
    expect(ok('250000')).toBe(true);
    expect(ok('250000.5')).toBe(true);
    expect(ok('1,00,000')).toBe(false);
    expect(ok('12.345')).toBe(false);
    expect(ok('-1')).toBe(false);
  });

  it('instructions are capped at 1000 characters', () => {
    expect(WILL_SECTION_SCHEMAS.instructions.safeParse({ text: 'a'.repeat(1000) }).success).toBe(true);
    expect(WILL_SECTION_SCHEMAS.instructions.safeParse({ text: 'a'.repeat(1001) }).success).toBe(false);
  });

  it('people section carries people and roles together', () => {
    const p = validWillPayload();
    const data = willSectionData(p, 'people');
    expect(data.people).toHaveLength(3);
    expect(data.roles.executorId).toBe('p-spouse');
    const next = applyWillSection(p, 'people', { people: [], roles: { ...data.roles, executorId: null } });
    expect(next.people).toEqual([]);
    expect(next.roles.executorId).toBeNull();
    expect(next.details).toBe(p.details);
  });

  it('applyWillSection replaces only the named section', () => {
    const p = validWillPayload();
    const next = applyWillSection(p, 'instructions', { text: 'New' });
    expect(next.instructions.text).toBe('New');
    expect(next.allocation).toBe(p.allocation);
  });

  it('knows its section names', () => {
    expect(isWillSection('estate')).toBe(true);
    expect(isWillSection('roles')).toBe(false);
  });
});
