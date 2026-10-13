/**
 * Part 2 adds two columns to "Will" and one AlertType value. No GRANT is written: the table-level
 * grants to the app role cover added columns, and Will's RLS policy is row-based. This pins both facts.
 */
import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import { prisma, USER_SCOPED_MODELS } from '../../src/lib/prisma.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const COLUMNS = [
  ['Will', 'executionSealed'],
  ['Will', 'executedDocumentId'],
] as const;

describe('will execute columns', () => {
  it('the app role can read, insert and update every new column', async () => {
    for (const [table, column] of COLUMNS) {
      const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
        SELECT has_column_privilege('portfolioos_app'::name, ${`"${table}"`}::text, ${column}::text, 'SELECT, INSERT, UPDATE'::text) AS ok`;
      expect(rows[0]?.ok, `${table}.${column}`).toBe(true);
    }
  });

  it('Will stays user-scoped', () => expect(USER_SCOPED_MODELS.has('Will')).toBe(true));

  it('AlertType has WILL_REVIEW_DUE', async () => {
    const rows = await prisma.$queryRaw<{ v: string }[]>`SELECT unnest(enum_range(NULL::"AlertType"))::text AS v`;
    expect(rows.map((r) => r.v)).toContain('WILL_REVIEW_DUE');
  });

  it('the review job has its index', async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'Will' AND indexname = 'Will_status_nextReviewAt_idx'`;
    expect(rows).toHaveLength(1);
  });
});
