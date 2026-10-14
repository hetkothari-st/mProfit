import { describe, it, expect } from 'vitest';
import { pct } from '../../src/services/mcp/tools/common.js';

describe('pct', () => {
  it('formats a fraction as a 2dp percent string', () => {
    expect(pct(0.1234)).toBe('12.34');
    expect(pct(null)).toBeNull();
  });
  it('never returns negative zero for a rate that rounds to 0', () => {
    expect(pct(-0.0000001)).toBe('0.00');
  });
});
