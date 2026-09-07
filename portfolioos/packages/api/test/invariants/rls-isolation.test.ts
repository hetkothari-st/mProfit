import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsUser, runAsSystem } from '../../src/lib/requestContext.js';

/**
 * INVARIANT: Postgres Row-Level Security isolates tenants.
 *
 * §3.6 / §5.1 task 11 — even if a service forgets to filter by userId, the
 * database itself must refuse cross-tenant reads and writes.
 *
 * This test sets up two independent users (A, B), each with their own
 * portfolio + transactions, then verifies:
 *   1. Running as A cannot SEE B's rows (read isolation).
 *   2. Running as A cannot UPDATE B's rows (write isolation).
 *   3. Running as A cannot DELETE B's rows (write isolation).
 *   4. Running as A cannot INSERT a row that claims B's userId (WITH CHECK).
 *   5. Running with no context sees zero rows (fail-closed default).
 *   6. runAsSystem() can see both users (break-glass for scheduler jobs).
 *
 * The MF analytics block at the bottom repeats 1 and 4 for the newest
 * user-scoped tables (docs/mf-analytics/05 §1). It is not redundant with
 * user-scoped-coverage.test.ts: that one asks the catalogue whether a policy
 * exists, this one asks the database whether the policy actually bites for a
 * real second user.
 */
describe('invariant: RLS tenant isolation (§3.6)', () => {
  let scopeA: TestScope;
  let scopeB: TestScope;
  let txnAId: string;
  let txnBId: string;
  let mfRunAId: string;
  let mfFindingAId: string;
  let mfVerdictAId: string;

  beforeAll(async () => {
    scopeA = await createTestScope('rls-a');
    scopeB = await createTestScope('rls-b');

    // Seed one transaction under each user via system context so we know both
    // rows actually exist in the DB regardless of what RLS does afterwards.
    const { a, b } = await runAsSystem(async () => {
      const a = await prisma.transaction.create({
        data: {
          portfolioId: scopeA.portfolioId,
          transactionType: 'BUY',
          assetClass: 'EQUITY',
          assetName: 'RLS-A Stock',
          assetKey: 'name:rls-a-stock',
          exchange: 'NSE',
          tradeDate: new Date('2024-01-15'),
          quantity: '10',
          price: '100',
          grossAmount: '1000',
          netAmount: '1000',
        },
        select: { id: true },
      });
      const b = await prisma.transaction.create({
        data: {
          portfolioId: scopeB.portfolioId,
          transactionType: 'BUY',
          assetClass: 'EQUITY',
          assetName: 'RLS-B Stock',
          assetKey: 'name:rls-b-stock',
          exchange: 'NSE',
          tradeDate: new Date('2024-01-15'),
          quantity: '20',
          price: '200',
          grossAmount: '4000',
          netAmount: '4000',
        },
        select: { id: true },
      });
      return { a, b };
    });
    txnAId = a.id;
    txnBId = b.id;

    // MF analytics fixture, written as user A rather than under runAsSystem.
    // Writing it through the user path is half the point: WITH CHECK has to
    // accept a row this user legitimately owns. If USER_SCOPED_MODELS were
    // missing these models the insert would fail here with 42501, which is
    // the failure this test exists to catch early.
    const mf = await runAsUser(scopeA.userId, async () => {
      const run = await prisma.mfAnalysisRun.create({
        data: {
          userId: scopeA.userId,
          asOf: new Date('2026-08-31'),
          status: 'COMPLETED',
          factsSnapshot: { asOf: '2026-08-31', funds: {} },
          portfolioAnalysis: { totalValueInr: '0' },
          ruleVersionsSnapshot: [{ ruleId: 'mf.cost.high-ter', version: '1', ran: true, emitted: false }],
          triggeredBy: 'USER_REFRESH',
          // Money as a decimal string, never a float (CONTEXT.md §3.1).
          llmSpendInr: '1.2345',
        },
        select: { id: true },
      });
      const finding = await prisma.mfFinding.create({
        data: {
          runId: run.id,
          userId: scopeA.userId,
          schemeCode: 'RLS-A-SCHEME',
          ruleId: 'mf.cost.high-ter',
          ruleVersion: '1',
          code: 'HIGH_TER',
          category: 'COST',
          severity: 'NOTICE',
          confidence: '0.700000',
          headline: 'Costlier than 75% of peers',
          evidence: [{ metric: 'cost.ter', value: '1.85', unit: 'pct' }],
          whatWouldChangeThis: 'Would clear at a TER at or below the category median.',
        },
        select: { id: true },
      });
      const verdict = await prisma.mfFundVerdict.create({
        data: {
          runId: run.id,
          userId: scopeA.userId,
          schemeCode: 'RLS-A-SCHEME',
          verdict: 'MONITOR',
          reasons: ['HIGH_TER'],
        },
        select: { id: true },
      });
      return { run, finding, verdict };
    });
    mfRunAId = mf.run.id;
    mfFindingAId = mf.finding.id;
    mfVerdictAId = mf.verdict.id;
  });

  afterAll(async () => {
    // Verdicts first, then findings, then the run. MfFundVerdict.runId is
    // ON DELETE RESTRICT by design — a verdict is the record of advice given
    // and outlives its run — so the run (and therefore the user, which cascades
    // to runs) cannot be deleted while a verdict points at it. Skipping this
    // would make scope.cleanup()'s user delete fail silently and leave rows.
    await runAsSystem(async () => {
      await prisma.mfFundVerdict.deleteMany({ where: { userId: scopeA.userId } });
      await prisma.mfFinding.deleteMany({ where: { userId: scopeA.userId } });
      await prisma.mfAnalysisRun.deleteMany({ where: { userId: scopeA.userId } });
    });
    await scopeA.cleanup();
    await scopeB.cleanup();
  });

  it("user A cannot read user B's transactions", async () => {
    const rows = await runAsUser(scopeA.userId, () =>
      prisma.transaction.findMany({
        where: { id: { in: [txnAId, txnBId] } },
        select: { id: true },
      }),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(txnAId);
    expect(ids).not.toContain(txnBId);
  });

  it("user A cannot read user B's portfolio by id", async () => {
    const row = await runAsUser(scopeA.userId, () =>
      prisma.portfolio.findUnique({ where: { id: scopeB.portfolioId } }),
    );
    expect(row).toBeNull();
  });

  it("user A cannot update user B's transaction", async () => {
    const result = await runAsUser(scopeA.userId, () =>
      prisma.transaction.updateMany({
        where: { id: txnBId },
        data: { price: '99999' },
      }),
    );
    expect(result.count).toBe(0);

    // Confirm from system view that the row is untouched.
    const check = await runAsSystem(() =>
      prisma.transaction.findUnique({ where: { id: txnBId }, select: { price: true } }),
    );
    expect(check?.price?.toString()).toBe('200');
  });

  it("user A cannot delete user B's transaction", async () => {
    const result = await runAsUser(scopeA.userId, () =>
      prisma.transaction.deleteMany({ where: { id: txnBId } }),
    );
    expect(result.count).toBe(0);

    const stillThere = await runAsSystem(() =>
      prisma.transaction.findUnique({ where: { id: txnBId } }),
    );
    expect(stillThere).not.toBeNull();
  });

  it("user A cannot insert a portfolio owned by user B (WITH CHECK)", async () => {
    await expect(
      runAsUser(scopeA.userId, () =>
        prisma.portfolio.create({
          data: {
            userId: scopeB.userId,
            name: 'Attempted hijack',
            currency: 'INR',
            type: 'INVESTMENT',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('queries with no ambient user context return zero rows (fail-closed)', async () => {
    // Intentionally run outside both runAsUser and runAsSystem. RLS policy
    // evaluates `"userId" = current_setting('app.current_user_id', true)`
    // against NULL → filter drops every row.
    const rows = await prisma.transaction.findMany({
      where: { id: { in: [txnAId, txnBId] } },
    });
    expect(rows).toHaveLength(0);
  });

  it('runAsSystem sees both users (break-glass bypass)', async () => {
    const rows = await runAsSystem(() =>
      prisma.transaction.findMany({
        where: { id: { in: [txnAId, txnBId] } },
        select: { id: true },
      }),
    );
    expect(rows.map((r) => r.id).sort()).toEqual([txnAId, txnBId].sort());
  });

  // ─── MF analytics (docs/mf-analytics/05 §1) ──────────────────────
  //
  // A user's fund analysis is among the most sensitive rows in the product:
  // it names their holdings and says what an engine concluded about them.
  // Every assertion below runs inside scope.runAs / runAsUser — outside an
  // ambient user context RLS fails closed and returns zero rows, which would
  // make these tests pass for entirely the wrong reason.

  it("user A's MF analysis rows exist and are readable by user A", async () => {
    // The control for the three isolation assertions that follow: without it,
    // "user B sees nothing" is satisfied by the rows never having been written.
    const seen = await scopeA.runAs(async () => ({
      run: await prisma.mfAnalysisRun.findUnique({ where: { id: mfRunAId }, select: { id: true } }),
      finding: await prisma.mfFinding.findUnique({
        where: { id: mfFindingAId },
        select: { id: true },
      }),
      verdict: await prisma.mfFundVerdict.findUnique({
        where: { id: mfVerdictAId },
        select: { id: true },
      }),
    }));

    expect(seen.run?.id).toBe(mfRunAId);
    expect(seen.finding?.id).toBe(mfFindingAId);
    expect(seen.verdict?.id).toBe(mfVerdictAId);
  });

  it("user B cannot read user A's MfAnalysisRun, MfFinding or MfFundVerdict", async () => {
    const seen = await scopeB.runAs(async () => ({
      runs: await prisma.mfAnalysisRun.findMany({ where: { id: mfRunAId }, select: { id: true } }),
      findings: await prisma.mfFinding.findMany({
        where: { id: mfFindingAId },
        select: { id: true },
      }),
      verdicts: await prisma.mfFundVerdict.findMany({
        where: { id: mfVerdictAId },
        select: { id: true },
      }),
      // The realistic leak is not an id lookup — it is an unfiltered list, the
      // exact query an endpoint writes when it forgets its where-clause.
      allRuns: await prisma.mfAnalysisRun.findMany({ select: { userId: true } }),
      allFindings: await prisma.mfFinding.findMany({ select: { userId: true } }),
      allVerdicts: await prisma.mfFundVerdict.findMany({ select: { userId: true } }),
    }));

    expect(seen.runs).toHaveLength(0);
    expect(seen.findings).toHaveLength(0);
    expect(seen.verdicts).toHaveLength(0);
    expect(seen.allRuns.map((r) => r.userId)).not.toContain(scopeA.userId);
    expect(seen.allFindings.map((r) => r.userId)).not.toContain(scopeA.userId);
    expect(seen.allVerdicts.map((r) => r.userId)).not.toContain(scopeA.userId);
  });

  it("user B cannot update or delete user A's MF analysis rows", async () => {
    const result = await scopeB.runAs(async () => ({
      updated: await prisma.mfFundVerdict.updateMany({
        where: { id: mfVerdictAId },
        data: { verdict: 'SWITCH_CANDIDATE' },
      }),
      deletedFindings: await prisma.mfFinding.deleteMany({ where: { id: mfFindingAId } }),
      deletedRuns: await prisma.mfAnalysisRun.deleteMany({ where: { id: mfRunAId } }),
    }));

    expect(result.updated.count).toBe(0);
    expect(result.deletedFindings.count).toBe(0);
    expect(result.deletedRuns.count).toBe(0);

    // And confirm from the system view that nothing actually moved. An
    // updateMany reporting 0 is not on its own proof the row is untouched.
    const check = await runAsSystem(() =>
      prisma.mfFundVerdict.findUnique({
        where: { id: mfVerdictAId },
        select: { verdict: true },
      }),
    );
    expect(check?.verdict).toBe('MONITOR');
  });

  it('user B cannot insert an MfFinding claiming user A as owner (WITH CHECK)', async () => {
    // The write half of the policy. Reads being filtered is not enough: an
    // endpoint that takes userId from the request body would otherwise let B
    // plant a finding in A's analysis.
    await expect(
      scopeB.runAs(() =>
        prisma.mfFinding.create({
          data: {
            runId: mfRunAId,
            userId: scopeA.userId,
            schemeCode: 'RLS-B-INJECTED',
            ruleId: 'mf.cost.high-ter',
            ruleVersion: '1',
            code: 'HIGH_TER',
            category: 'COST',
            severity: 'NOTICE',
            confidence: '0.500000',
            headline: 'Planted by another tenant',
            evidence: [],
            whatWouldChangeThis: 'n/a',
          },
        }),
      ),
    ).rejects.toThrow();

    const planted = await runAsSystem(() =>
      prisma.mfFinding.findMany({ where: { schemeCode: 'RLS-B-INJECTED' } }),
    );
    expect(planted).toHaveLength(0);
  });

  it('MF analysis rows are invisible with no ambient user context (fail-closed)', async () => {
    const rows = await prisma.mfAnalysisRun.findMany({ where: { id: mfRunAId } });
    expect(rows).toHaveLength(0);
  });
});
