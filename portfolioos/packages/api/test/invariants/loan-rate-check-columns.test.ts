/**
 * EMI plan 3 adds columns to two existing tables. No GRANT is written: the table-level grants to the app role
 * already cover added columns, and Loan's RLS policy is row-based. This pins both facts.
 */
import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import { prisma, USER_SCOPED_MODELS } from '../../src/lib/prisma.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const COLUMNS = [
  ['Loan', 'rateType'],
  ['Loan', 'rateBenchmark'],
  ['Loan', 'nextRateResetDate'],
  ['User', 'loanRateAlerts'],
] as const;

describe('loan-check columns', () => {
  it('the app role can read, insert and update every new column', async () => {
    for (const [table, column] of COLUMNS) {
      const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
        SELECT has_column_privilege('portfolioos_app'::name, ${`"${table}"`}::text, ${column}::text, 'SELECT, INSERT, UPDATE'::text) AS ok`;
      expect(rows[0]?.ok, `${table}.${column}`).toBe(true);
    }
  });

  it('Loan stays user-scoped', () => expect(USER_SCOPED_MODELS.has('Loan')).toBe(true));

  it('AlertType has the two loan-check values', async () => {
    const rows = await prisma.$queryRaw<{ v: string }[]>`SELECT unnest(enum_range(NULL::"AlertType"))::text AS v`;
    expect(rows.map((r) => r.v)).toEqual(expect.arrayContaining(['LOAN_REFINANCE', 'LOAN_BENCHMARK_CHANGE']));
  });
});
