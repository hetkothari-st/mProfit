import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Decimal } from '@portfolioos/shared';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import {
  checkBudget,
  DEFAULT_CAP_INR,
  DEFAULT_WARN_INR,
  estimateCostInr,
  FX_USD_INR_DEFAULT,
  getBudgetLimits,
  getMonthToDateSpend,
  HAIKU_USD_PER_MTOK_INPUT,
  HAIKU_USD_PER_MTOK_OUTPUT,
  monthStartUtc,
} from '../../src/ingestion/llm/budget.js';

/**
 * Budget service tests. These hit the real Postgres — the values we
 * compute matter operationally (§17 caps) and mocking Prisma would
 * skip the AppSetting Json-shape handling which is the fiddly part.
 */
describe('LLM budget', () => {
  let scope: TestScope;

  beforeEach(async () => {
    scope = await createTestScope('llm-budget');
  });
  afterEach(async () => {
    await scope.cleanup();
  });

  describe('monthStartUtc', () => {
    it('returns the first day of the month at UTC midnight', () => {
      const d = monthStartUtc(new Date('2026-04-21T15:30:00.000Z'));
      expect(d.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    });
  });

  describe('estimateCostInr', () => {
    it('matches the locked Haiku price × FX default', async () => {
      // 1M input + 1M output at $1/$5 per MTok = $6 → ₹540 at FX 90.
      const cost = await estimateCostInr({
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      });
      const expected = HAIKU_USD_PER_MTOK_INPUT.plus(HAIKU_USD_PER_MTOK_OUTPUT)
        .mul(FX_USD_INR_DEFAULT);
      expect(cost.toFixed(4)).toBe(expected.toFixed(4));
      expect(cost.toFixed(2)).toBe('540.00');
    });

    it('scales linearly on tiny call sizes', async () => {
      // 1k input + 500 output → tiny sub-rupee cost.
      // input:  1000 * 1/1e6 = $0.001
      // output: 500 * 5/1e6  = $0.0025
      // total: $0.0035 × ₹90 = ₹0.315
      const cost = await estimateCostInr({
        inputTokens: 1_000,
        outputTokens: 500,
      });
      expect(cost.toFixed(4)).toBe('0.3150');
    });

    it('respects an AppSetting FX override', async () => {
      await runAsSystem(async () => {
        await prisma.appSetting.upsert({
          where: { key: 'llm.usd_inr_fx' },
          update: { value: 100 },
          create: { key: 'llm.usd_inr_fx', value: 100 },
        });
      });
      try {
        const cost = await estimateCostInr({
          inputTokens: 1_000_000,
          outputTokens: 0,
        });
        // 1M input at $1/MTok = $1 × 100 = ₹100
        expect(cost.toFixed(2)).toBe('100.00');
      } finally {
        await runAsSystem(async () => {
          await prisma.appSetting.delete({ where: { key: 'llm.usd_inr_fx' } });
        });
      }
    });
  });

  describe('getBudgetLimits', () => {
    it('falls back to defaults when nothing is set', async () => {
      // Seed migration already inserts the global warn/cap values. Our
      // test users get no per-user override, so limits should equal the
      // seeded globals (500 / 1000) which happen to equal the
      // DEFAULT_*_INR constants. Verify both equalities.
      const { warnInr, capInr } = await getBudgetLimits(scope.userId);
      expect(warnInr.equals(DEFAULT_WARN_INR)).toBe(true);
      expect(capInr.equals(DEFAULT_CAP_INR)).toBe(true);
    });

    it('per-user override beats the global default', async () => {
      const key = `llm.monthly_cap_inr.user.${scope.userId}`;
      await runAsSystem(async () => {
        await prisma.appSetting.upsert({
          where: { key },
          update: { value: 2500 },
          create: { key, value: 2500 },
        });
      });
      try {
        const { capInr } = await getBudgetLimits(scope.userId);
        expect(capInr.toFixed(0)).toBe('2500');
      } finally {
        await runAsSystem(async () => {
          await prisma.appSetting.delete({ where: { key } });
        });
      }
    });
  });

  describe('checkBudget + getMonthToDateSpend', () => {
    it('is ok with zero spend', async () => {
      const status = await scope.runAs(() => checkBudget(scope.userId));
      expect(status.status).toBe('ok');
      expect(status.spent.toFixed(4)).toBe('0.0000');
    });

    it('flips to warn after spend crosses warn threshold', async () => {
      await runAsSystem(async () => {
        await prisma.llmSpend.create({
          data: {
            userId: scope.userId,
            model: 'test',
            inputTokens: 0,
            outputTokens: 0,
            costInr: '600.0000',
            purpose: 'test',
            success: true,
          },
        });
      });
      const status = await scope.runAs(() => checkBudget(scope.userId));
      expect(status.status).toBe('warn');
      expect(status.spent.equals(new Decimal('600'))).toBe(true);
    });

    it('flips to capped after spend crosses cap', async () => {
      await runAsSystem(async () => {
        await prisma.llmSpend.create({
          data: {
            userId: scope.userId,
            model: 'test',
            inputTokens: 0,
            outputTokens: 0,
            costInr: '1000.0001',
            purpose: 'test',
            success: true,
          },
        });
      });
      const status = await scope.runAs(() => checkBudget(scope.userId));
      expect(status.status).toBe('capped');
    });

    it('sums multiple rows including failed calls', async () => {
      // Two spends in the current month, plus one failed call with cost 0.
      // The §8 rationale: failed calls still count against spend budget
      // when the upstream charges per-attempt — and they're logged with
      // cost=0 when they don't. Either way, the sum is deterministic.
      await runAsSystem(async () => {
        for (const cost of ['100.0000', '200.0000', '0.0000']) {
          await prisma.llmSpend.create({
            data: {
              userId: scope.userId,
              model: 'test',
              inputTokens: 0,
              outputTokens: 0,
              costInr: cost,
              purpose: 'test',
              success: cost !== '0.0000',
            },
          });
        }
      });
      const spent = await scope.runAs(() => getMonthToDateSpend(scope.userId));
      expect(spent.toFixed(4)).toBe('300.0000');
    });
  });
});
