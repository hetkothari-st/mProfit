import { describe, it, expect } from 'vitest';
import { todayLocal } from './localDate';

describe('todayLocal', () => {
  it('uses the local calendar date', () => {
    expect(todayLocal(new Date(2026, 0, 5, 1, 0))).toBe('2026-01-05');
  });
});
