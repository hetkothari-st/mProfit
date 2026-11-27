import { describe, it, expect } from 'vitest';
import { formatIsoAsDmy, maskDateTyping, normalizeIso, parseDateText } from './dateInput';

describe('parseDateText', () => {
  it('reads dd/mm/yyyy and the other separators people type', () => {
    expect(parseDateText('05/06/2026')).toBe('2026-06-05');
    expect(parseDateText('5/6/2026')).toBe('2026-06-05');
    expect(parseDateText('05-06-2026')).toBe('2026-06-05');
    expect(parseDateText('05.06.2026')).toBe('2026-06-05');
    expect(parseDateText('05062026')).toBe('2026-06-05');
  });

  it('day comes first: 03/04/2026 is 3 April, never 4 March', () => {
    expect(parseDateText('03/04/2026')).toBe('2026-04-03');
  });

  it('also reads an ISO date or timestamp, which is what the API and the forms hold', () => {
    expect(parseDateText('2026-06-05')).toBe('2026-06-05');
    expect(parseDateText('2026-06-05T00:00:00.000Z')).toBe('2026-06-05');
  });

  it('refuses dates that do not exist and text that is not a date', () => {
    for (const bad of ['31/02/2026', '29/02/2025', '32/01/2026', '00/01/2026', '01/13/2026', '05/06', '05/06/26', 'abc', '', '  ']) {
      expect(parseDateText(bad)).toBeNull();
    }
  });

  it('accepts 29 February in a leap year', () => {
    expect(parseDateText('29/02/2028')).toBe('2028-02-29');
  });

  it('refuses a year outside 1900-2100, where a mistyped digit lands', () => {
    expect(parseDateText('05/06/0026')).toBeNull();
    expect(parseDateText('05/06/2206')).toBeNull();
  });
});

describe('formatIsoAsDmy / normalizeIso', () => {
  it('shows an ISO date as dd/mm/yyyy', () => {
    expect(formatIsoAsDmy('2026-06-05')).toBe('05/06/2026');
    expect(formatIsoAsDmy('2026-06-05T10:00:00Z')).toBe('05/06/2026');
  });
  it('shows nothing for empty, null or unreadable values', () => {
    expect(formatIsoAsDmy('')).toBe('');
    expect(formatIsoAsDmy(null)).toBe('');
    expect(formatIsoAsDmy('garbage')).toBe('');
  });
  it('normalizes to YYYY-MM-DD or empty', () => {
    expect(normalizeIso('2026-06-05T10:00:00Z')).toBe('2026-06-05');
    expect(normalizeIso('nope')).toBe('');
    expect(normalizeIso(undefined)).toBe('');
  });
});

describe('maskDateTyping', () => {
  it('adds the slashes as digits are typed', () => {
    expect(maskDateTyping('0', '')).toBe('0');
    expect(maskDateTyping('05', '0')).toBe('05/');
    expect(maskDateTyping('050', '05/')).toBe('05/0');
    expect(maskDateTyping('0506', '05/0')).toBe('05/06/');
    expect(maskDateTyping('05062026', '05/06/')).toBe('05/06/2026');
  });

  it('lets backspace delete a slash instead of putting it straight back', () => {
    expect(maskDateTyping('05/', '05/0')).toBe('05');
    expect(maskDateTyping('05', '05/')).toBe('05');
  });

  it('leaves text with its own separators alone, so 5/6/2026 can be typed', () => {
    expect(maskDateTyping('5/', '5')).toBe('5/');
    expect(maskDateTyping('5/6/2026', '5/6/202')).toBe('5/6/2026');
  });

  it('caps pasted digits at eight', () => {
    expect(maskDateTyping('050620261234', '')).toBe('05/06/2026');
  });
});
