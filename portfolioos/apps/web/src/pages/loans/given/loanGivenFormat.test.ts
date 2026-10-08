import { describe, expect, it } from 'vitest';
import { formatDay } from './loanGivenFormat';

describe('formatDay', () => {
  it('renders a date-only value as dd/mm/yyyy with no timezone shift', () => {
    expect(formatDay('2026-10-08')).toBe('08/10/2026');
    expect(formatDay('2026-01-01')).toBe('01/01/2026');
  });
  it('shows a dash for empty values', () => {
    expect(formatDay(null)).toBe('—');
  });
});
