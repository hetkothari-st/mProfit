import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { USER_SCOPED_MODELS } from '../../src/lib/prisma.js';

/**
 * Row-level security only applies to a query that carries the session context,
 * and the context is only set for models listed in `USER_SCOPED_MODELS`.
 *
 * That creates a trap with no error message. A model outside the list whose
 * query filters through a protected parent — "the payments of my loans" —
 * makes the database evaluate the parent's policy with no context at all. The
 * policy matches nothing, the query returns zero rows, and nothing fails: the
 * feature just silently has no data. It hid a missing loan-EMI voucher until
 * the suite was first run against a role that does not bypass RLS.
 *
 * So: any model related to a protected one must itself be context-scoped.
 */

const schema = readFileSync(
  fileURLToPath(new URL('../../prisma/schema.prisma', import.meta.url)),
  'utf8',
);

function modelsWithRelations(): Array<{ name: string; parents: string[] }> {
  const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)];
  return models.map(([, name, body]) => ({
    name: name!,
    parents: [...new Set([...body!.matchAll(/^\s+\w+\s+(\w+)\??\s+@relation/gm)].map((m) => m[1]!))],
  }));
}

describe('invariant: RLS session context covers related models', () => {
  it('every model linked to a user-scoped model is itself user-scoped', () => {
    const gaps = modelsWithRelations()
      .filter((m) => !USER_SCOPED_MODELS.has(m.name))
      .map((m) => ({ model: m.name, protectedParents: m.parents.filter((p) => USER_SCOPED_MODELS.has(p)) }))
      .filter((m) => m.protectedParents.length > 0);

    expect(gaps).toEqual([]);
  });
});
