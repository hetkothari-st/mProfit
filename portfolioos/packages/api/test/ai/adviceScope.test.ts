import { describe, it, expect } from 'vitest';
import { resolveAdviceScope } from '../../src/ai/adviceScope.js';

// Who gets personal advice. Today everyone ('ALL'); 'AGREEMENT' is reserved for
// the later gate. Anything unreadable falls back to today's behaviour.
describe('resolveAdviceScope', () => {
  it('defaults to ALL when the setting is absent', () => {
    expect(resolveAdviceScope(undefined)).toBe('ALL');
  });

  it('reads AGREEMENT when set', () => {
    expect(resolveAdviceScope('AGREEMENT')).toBe('AGREEMENT');
  });

  it('falls back to ALL for anything it does not recognise', () => {
    expect(resolveAdviceScope('everyone')).toBe('ALL');
    expect(resolveAdviceScope(42)).toBe('ALL');
  });
});
