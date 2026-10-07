import { describe, it, expect } from 'vitest';
import { flowTone, signOf, signTone } from './signTone';

describe('signTone', () => {
  it('is neutral at zero — ₹0.00 is not a gain', () => {
    for (const zero of ['0', '0.00', '-0', '-0.00', 0, null, undefined, '']) expect(signTone(zero)).toBe('text-muted-foreground');
  });
  it('is green above zero and red below', () => {
    expect(signTone('0.01')).toBe('text-positive');
    expect(signTone(-12.5)).toBe('text-negative');
    expect(signTone({ toString: () => '-1500.0000' })).toBe('text-negative');
  });
  it('treats unparseable input as zero', () => {
    expect(signOf('n/a')).toBe(0);
  });
});

describe('flowTone', () => {
  it('colours money in/out only when there is some', () => {
    expect(flowTone('0', 'in')).toBe('text-muted-foreground');
    expect(flowTone('0.00', 'out')).toBe('text-muted-foreground');
    expect(flowTone('100', 'in')).toBe('text-positive');
    expect(flowTone('100', 'out')).toBe('text-negative');
  });
});
