import { describe, it, expect } from 'vitest';
import { evaluateDbRole, readDbRoleFacts } from '../../src/lib/dbRoleGuard.js';

describe('evaluateDbRole', () => {
  it('accepts a role that honours row-level security', () => {
    expect(evaluateDbRole({ role: 'portfolioos_app', superuser: false, bypassRls: false }, 'production'))
      .toEqual({ ok: true });
  });

  it('refuses a superuser in production', () => {
    const v = evaluateDbRole({ role: 'postgres', superuser: true, bypassRls: true }, 'production');
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.fatal).toBe(true);
      expect(v.message).toContain('superuser');
    }
  });

  it('refuses a BYPASSRLS owner role in production', () => {
    const v = evaluateDbRole({ role: 'neondb_owner', superuser: false, bypassRls: true }, 'production');
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.fatal).toBe(true);
      expect(v.message).toContain('BYPASSRLS');
    }
  });

  it('only warns outside production', () => {
    const v = evaluateDbRole({ role: 'postgres', superuser: true, bypassRls: true }, 'development');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.fatal).toBe(false);
  });
});

describe('readDbRoleFacts', () => {
  // The RLS suites are only meaningful against a NOBYPASSRLS connection, so the
  // test database must pass the same check production does.
  it('reports the suite connection as RLS-enforcing', async () => {
    const facts = await readDbRoleFacts();
    expect(evaluateDbRole(facts, 'production')).toEqual({ ok: true });
  });
});
