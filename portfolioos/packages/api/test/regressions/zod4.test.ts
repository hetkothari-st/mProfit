import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { patchOf } from '../../src/lib/zodPatch.js';

// zod 4 migration: `.partial()` now applies a field's `.default()`, so a PATCH
// built from a create schema would reset every defaulted field the client did
// not send. patchOf keeps missing keys missing.
describe('patchOf (zod 4 PATCH schemas)', () => {
  const create = z.object({
    name: z.string().min(1),
    currency: z.string().length(3).default('INR'),
    status: z.enum(['A', 'B']).optional().default('A'),
    note: z.string().optional(),
  });

  it('shows the zod 4 behaviour patchOf exists for', () => {
    expect(create.partial().parse({ name: 'x' })).toEqual({ name: 'x', currency: 'INR', status: 'A' });
  });

  it('leaves unsent defaulted fields out of the patch', () => {
    expect(patchOf(create).parse({ name: 'x' })).toEqual({ name: 'x' });
    expect(patchOf(create).parse({})).toEqual({});
  });

  it('still validates fields that are sent', () => {
    expect(patchOf(create).parse({ currency: 'USD' })).toEqual({ currency: 'USD' });
    expect(patchOf(create).safeParse({ currency: 'RUPEE' }).success).toBe(false);
    expect(patchOf(create).safeParse({ name: '' }).success).toBe(false);
  });
});
