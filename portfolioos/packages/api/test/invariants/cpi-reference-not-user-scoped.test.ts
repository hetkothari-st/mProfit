/**
 * MoSPI CPI observations are shared reference data: no userId, no RLS policy,
 * not in USER_SCOPED_MODELS. Registering the table would make the Prisma hook
 * issue app.current_user_id for public CPI rows, and the natural follow-up
 * ("add the policy too") would show every user an empty CPI table.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { USER_SCOPED_MODELS } from '../../src/lib/prisma.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const prismaDir = join(here, '..', '..', 'prisma');
const REFERENCE = ['CpiObservation'] as const;
const USER_SCOPED = ['InflationProfile', 'InflationBasketItem', 'InflationPricePoint'] as const;

function modelBlock(schema: string, model: string): string {
  const m = new RegExp(String.raw`model ${model} \{([\s\S]*?)\n\}`).exec(schema);
  if (!m) throw new Error(`model ${model} not found in schema.prisma`);
  return m[1]!;
}

describe('CPI reference table vs personal-inflation user tables', () => {
  it('CpiObservation is not in USER_SCOPED_MODELS and has no userId', () => {
    expect(REFERENCE.filter((m) => USER_SCOPED_MODELS.has(m))).toEqual([]);
    const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
    for (const model of REFERENCE) expect(modelBlock(schema, model)).not.toMatch(/\buserId\b/);
  });

  it('the user tables are all registered', () => {
    expect(USER_SCOPED.filter((m) => !USER_SCOPED_MODELS.has(m))).toEqual([]);
  });

  it('no migration enables RLS or writes a policy on CpiObservation', () => {
    const dir = join(prismaDir, 'migrations');
    const offenders: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name, 'migration.sql');
      if (!entry.isDirectory() || !existsSync(file)) continue;
      const sql = readFileSync(file, 'utf8').replace(/--.*$/gm, '');
      for (const model of REFERENCE) {
        if (new RegExp(String.raw`ALTER\s+TABLE\s+"?${model}"?[\s\S]{0,40}?ROW\s+LEVEL\s+SECURITY`, 'i').test(sql)) offenders.push(`${entry.name}: RLS on ${model}`);
        if (new RegExp(String.raw`CREATE\s+POLICY[\s\S]{0,120}?ON\s+"?${model}"?\b`, 'i').test(sql)) offenders.push(`${entry.name}: policy on ${model}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
