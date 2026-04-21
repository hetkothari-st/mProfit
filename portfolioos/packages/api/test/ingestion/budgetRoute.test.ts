import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { getBudget } from '../../src/controllers/ingestion.controller.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';

/**
 * Shape test for `GET /api/ingestion/budget`. The underlying
 * `checkBudget` logic is exhaustively covered by budget.test.ts; here
 * we only assert that the controller serialises Decimals as strings
 * per §3.2 and maps the three BudgetStatus variants onto the wire
 * format the UI expects.
 */

function captureOk() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return res as unknown as Response & typeof res;
}

function makeReq(userId: string): Request {
  return { user: { id: userId } } as unknown as Request;
}

describe('GET /api/ingestion/budget', () => {
  let scope: TestScope;

  beforeEach(async () => {
    scope = await createTestScope('budget-route');
  });
  afterEach(async () => {
    await runAsSystem(async () => {
      await prisma.llmSpend.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it("returns status='ok' with money as strings when nothing has been spent", async () => {
    const res = captureOk();
    await runAsUser(scope.userId, () => getBudget(makeReq(scope.userId), res));

    const payload = res.json.mock.calls[0]![0] as {
      success: boolean;
      data: { status: string; spentInr: string; warnInr: string; capInr: string };
    };
    expect(payload.success).toBe(true);
    expect(payload.data.status).toBe('ok');
    expect(payload.data.spentInr).toBe('0');
    expect(typeof payload.data.warnInr).toBe('string');
    expect(typeof payload.data.capInr).toBe('string');
    // Defaults from §17 / §4.9 seed rows.
    expect(payload.data.warnInr).toBe('500');
    expect(payload.data.capInr).toBe('1000');
  });

  it("flips to status='capped' once monthly spend ≥ cap", async () => {
    // Plant a spend row large enough to exceed the ₹1000 default cap.
    await runAsSystem(async () => {
      await prisma.llmSpend.create({
        data: {
          userId: scope.userId,
          model: 'claude-haiku-4-5-20251001',
          inputTokens: 1000,
          outputTokens: 1000,
          costInr: '1500.0000',
          purpose: 'gmail.parse',
        },
      });
    });

    const res = captureOk();
    await runAsUser(scope.userId, () => getBudget(makeReq(scope.userId), res));

    const payload = res.json.mock.calls[0]![0] as {
      data: { status: string; spentInr: string };
    };
    expect(payload.data.status).toBe('capped');
    // Decimal.toString() normalises trailing zeros on toString().
    expect(payload.data.spentInr).toBe('1500');
  });
});
