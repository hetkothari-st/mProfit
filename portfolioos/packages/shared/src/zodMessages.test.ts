import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';
import { installZodV3Messages } from './zodMessages.js';

const first = (r: { success: boolean; error?: z.ZodError }) => r.error?.issues[0]?.message;

describe('zod 3 wording on zod 4', () => {
  beforeAll(() => installZodV3Messages());

  it('keeps the common default messages', () => {
    const s = z.object({ name: z.string().min(2).max(5), age: z.number().int().min(18), kind: z.enum(['A', 'B']) });
    expect(first(s.safeParse({}))).toBe('Required');
    expect(first(s.safeParse({ name: 1, age: 20, kind: 'A' }))).toBe('Expected string, received number');
    expect(first(s.safeParse({ name: 'x', age: 20, kind: 'A' }))).toBe('String must contain at least 2 character(s)');
    expect(first(s.safeParse({ name: 'xxxxxx', age: 20, kind: 'A' }))).toBe('String must contain at most 5 character(s)');
    expect(first(s.safeParse({ name: 'xx', age: 10, kind: 'A' }))).toBe('Number must be greater than or equal to 18');
    expect(first(s.safeParse({ name: 'xx', age: 20, kind: 'C' }))).toBe("Invalid enum value. Expected 'A' | 'B', received 'C'");
    expect(first(z.string().email().safeParse('nope'))).toBe('Invalid email');
    expect(first(z.coerce.number().safeParse('abc'))).toBe('Expected number, received nan');
    expect(first(z.array(z.string()).max(1).safeParse(['a', 'b']))).toBe('Array must contain at most 1 element(s)');
  });

  it('lets a message written on the schema win', () => {
    expect(first(z.string().min(2, 'Too short').safeParse('x'))).toBe('Too short');
    expect(first(z.number({ error: 'Enter a price' }).safeParse('x'))).toBe('Enter a price');
  });
});

// Advisory fixed in zod 4.6.6: validating an oversized input against a
// constrained collection could exhaust memory (one issue per bad element).
// The size check must reject it without walking every element.
describe('constrained collections reject oversized input', () => {
  it('rejects a 1M-element array of bad items against .max(10) with one issue, quickly', () => {
    const s = z.array(z.string()).max(10);
    const huge: unknown[] = Array.from({ length: 1_000_000 }, () => 1);
    const t0 = performance.now();
    const r = s.safeParse(huge);
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.code)).toEqual(['too_big']);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
