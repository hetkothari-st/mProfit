/**
 * Live loan rates are shared market data (spec s5.3): no userId, no RLS policy, not in USER_SCOPED_MODELS.
 * Adding them to the Set would make the Prisma hook issue app.current_user_id for public rates, and the
 * natural follow-up ("add the policy too") would show every user an empty rate table.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { USER_SCOPED_MODELS } from '../../src/lib/prisma.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const prismaDir = join(here, '..', '..', 'prisma');
const MODELS = ['LoanRateSource', 'LoanRate', 'BenchmarkRate'] as const;

function modelBlock(schema: string, model: string): string {
  const m = new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (!m) throw new Error(`model ${model} not found in schema.prisma`);
  return m[1]!;
}

describe('loan-rate tables are global reference data', () => {
  it('are not in USER_SCOPED_MODELS', () => {
    expect(MODELS.filter((m) => USER_SCOPED_MODELS.has(m))).toEqual([]);
  });

  it('have no userId column', () => {
    const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
    for (const model of MODELS) expect(modelBlock(schema, model)).not.toMatch(/\buserId\b/);
  });

  it('no migration enables RLS or writes a policy on them', () => {
    const dir = join(prismaDir, 'migrations');
    const offenders: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name, 'migration.sql');
      if (!entry.isDirectory() || !existsSync(file)) continue;
      const sql = readFileSync(file, 'utf8').replace(/--.*$/gm, '');
      for (const model of MODELS) {
        if (new RegExp(`ALTER\\s+TABLE\\s+"?${model}"?[\\s\\S]{0,40}?ROW\\s+LEVEL\\s+SECURITY`, 'i').test(sql)) offenders.push(`${entry.name}: RLS on ${model}`);
        if (new RegExp(`CREATE\\s+POLICY[\\s\\S]{0,120}?ON\\s+"?${model}"?\\b`, 'i').test(sql)) offenders.push(`${entry.name}: policy on ${model}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
