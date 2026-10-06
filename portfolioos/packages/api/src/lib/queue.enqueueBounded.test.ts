import { describe, it, expect } from 'vitest';
import { enqueueBounded } from './queue.js';

describe('enqueueBounded', () => {
  it('reports success when the add is accepted', async () => {
    expect(await enqueueBounded(Promise.resolve({ id: 1 }), 't')).toBe(true);
  });

  it('stops waiting when Redis never answers, instead of hanging the request', async () => {
    const started = Date.now();
    const never = new Promise(() => {});
    expect(await enqueueBounded(never, 't', 50)).toBe(false);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('reports failure on a rejected add, and a late rejection is handled', async () => {
    expect(await enqueueBounded(Promise.reject(new Error('down')), 't')).toBe(false);
    let reject!: (e: Error) => void;
    const late = new Promise((_r, j) => (reject = j));
    expect(await enqueueBounded(late, 't', 20)).toBe(false);
    reject(new Error('late')); // must not surface as an unhandled rejection
    await new Promise((r) => setTimeout(r, 20));
  });
});
