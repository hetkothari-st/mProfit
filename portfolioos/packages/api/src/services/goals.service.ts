/**
 * Phase 2c — Financial Goals service.
 *
 * Computes goal progress by aggregating the current value of linked
 * portfolios + the initial seed amount, then comparing against the
 * inflation-adjusted target. Also reports the *required CAGR* — the
 * annual return needed from today to hit the target by `targetDate`.
 *
 * No SIP attribution yet — that lands when `SipPlan.goalId` is added.
 */

import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { serializeMoney } from '@portfolioos/shared';
import {
  progressPct as calcProgressPct,
  inflationAdjustedTarget as calcInflationTarget,
  requiredCagr as calcRequiredCagr,
  eligibleClassesForGoal,
} from './goalMath.js';
import type { Prisma } from '@prisma/client';

export const GOAL_CATEGORIES = [
  'RETIREMENT',
  'CHILD_EDUCATION',
  'HOME_PURCHASE',
  'EMERGENCY_FUND',
  'FIRE_CORPUS',
  'VEHICLE_PURCHASE',
  'TRAVEL',
  'WEALTH_BUILDING',
  'CUSTOM',
] as const;

export const GOAL_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export const GOAL_STATUSES = ['ACTIVE', 'ACHIEVED', 'PAUSED', 'ABANDONED'] as const;

export type GoalCategory = (typeof GOAL_CATEGORIES)[number];
export type GoalPriority = (typeof GOAL_PRIORITIES)[number];
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export interface GoalInput {
  name: string;
  category?: GoalCategory;
  priority?: GoalPriority;
  status?: GoalStatus;
  targetAmount: string | number;
  initialAmount?: string | number;
  inflationRate?: string | number | null;
  expectedReturn?: string | number | null;
  targetDate: string;
  startDate?: string;
  portfolioIds?: string[];
  notes?: string | null;
}

const ZERO = new Decimal(0);

function d(v: { toString(): string } | null | undefined): Decimal {
  if (v == null) return ZERO;
  return new Decimal(v.toString());
}

export async function listGoals(userId: string) {
  const goals = await prisma.goal.findMany({
    where: { userId },
    orderBy: [{ status: 'asc' }, { targetDate: 'asc' }],
  });
  return Promise.all(goals.map((g) => withProgress(userId, g)));
}

export async function getGoal(userId: string, id: string) {
  const goal = await prisma.goal.findFirst({ where: { id, userId } });
  if (!goal) throw new NotFoundError('Goal not found');
  return withProgress(userId, goal);
}

export async function createGoal(userId: string, input: GoalInput) {
  validateInput(input);
  const goal = await prisma.goal.create({
    data: {
      userId,
      name: input.name.trim(),
      category: input.category ?? 'CUSTOM',
      priority: input.priority ?? 'MEDIUM',
      status: input.status ?? 'ACTIVE',
      targetAmount: new Decimal(input.targetAmount).toString(),
      initialAmount: new Decimal(input.initialAmount ?? 0).toString(),
      inflationRate: input.inflationRate != null ? new Decimal(input.inflationRate).toString() : null,
      expectedReturn: input.expectedReturn != null ? new Decimal(input.expectedReturn).toString() : null,
      targetDate: new Date(input.targetDate),
      startDate: input.startDate ? new Date(input.startDate) : new Date(),
      portfolioIds: input.portfolioIds ?? [],
      notes: input.notes ?? null,
    },
  });
  return withProgress(userId, goal);
}

export async function updateGoal(userId: string, id: string, input: Partial<GoalInput>) {
  const existing = await prisma.goal.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError('Goal not found');
  if (input.targetAmount !== undefined || input.targetDate !== undefined) {
    validateInput({ ...existing, ...input } as GoalInput);
  }
  const goal = await prisma.goal.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.status !== undefined ? {
        status: input.status,
        achievedAt: input.status === 'ACHIEVED' ? new Date() : null,
      } : {}),
      ...(input.targetAmount !== undefined ? { targetAmount: new Decimal(input.targetAmount).toString() } : {}),
      ...(input.initialAmount !== undefined ? { initialAmount: new Decimal(input.initialAmount).toString() } : {}),
      ...(input.inflationRate !== undefined ? {
        inflationRate: input.inflationRate != null ? new Decimal(input.inflationRate).toString() : null,
      } : {}),
      ...(input.expectedReturn !== undefined ? {
        expectedReturn: input.expectedReturn != null ? new Decimal(input.expectedReturn).toString() : null,
      } : {}),
      ...(input.targetDate !== undefined ? { targetDate: new Date(input.targetDate) } : {}),
      ...(input.startDate !== undefined ? { startDate: new Date(input.startDate) } : {}),
      ...(input.portfolioIds !== undefined ? { portfolioIds: input.portfolioIds } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
  return withProgress(userId, goal);
}

export async function deleteGoal(userId: string, id: string) {
  const existing = await prisma.goal.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError('Goal not found');
  await prisma.goal.delete({ where: { id } });
}

function validateInput(input: GoalInput) {
  if (!input.name?.trim()) throw new BadRequestError('Name required');
  const t = new Decimal(input.targetAmount ?? 0);
  if (t.lessThanOrEqualTo(0)) throw new BadRequestError('Target amount must be positive');
  const td = new Date(input.targetDate);
  if (Number.isNaN(td.getTime())) throw new BadRequestError('Invalid target date');
}

interface RawGoal {
  id: string;
  userId: string;
  name: string;
  category: GoalCategory;
  priority: GoalPriority;
  status: GoalStatus;
  targetAmount: { toString(): string };
  initialAmount: { toString(): string };
  inflationRate: { toString(): string } | null;
  expectedReturn: { toString(): string } | null;
  targetDate: Date;
  startDate: Date;
  portfolioIds: string[];
  notes: string | null;
  achievedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Annotates a Goal row with computed progress fields. Pulls the current
 * value of the linked portfolios from `HoldingProjection` and combines
 * with `initialAmount` to produce `currentValue`. All math via Decimal.
 */
async function withProgress(userId: string, goal: RawGoal) {
  const target = d(goal.targetAmount);
  const initial = d(goal.initialAmount);

  let portfolioValue = ZERO;
  if (goal.portfolioIds.length > 0) {
    const owned = await prisma.portfolio.findMany({
      where: { id: { in: goal.portfolioIds }, userId },
      select: { id: true },
    });
    const ownedIds = owned.map((p) => p.id);
    if (ownedIds.length > 0) {
      // Emergency-fund goals only count liquid/near-liquid holdings (cash,
      // deposits, PO savings) — not the whole equity+crypto portfolio, which
      // would overstate readiness. Other goals count the full linked value.
      const eligible = eligibleClassesForGoal(goal.category);
      const where: Prisma.HoldingProjectionWhereInput = { portfolioId: { in: ownedIds } };
      if (eligible) {
        where.assetClass = { in: eligible as unknown as Prisma.EnumAssetClassFilter['in'] };
      }
      const projections = await prisma.holdingProjection.findMany({
        where,
        select: { currentValue: true, totalCost: true },
      });
      for (const p of projections) {
        const v = p.currentValue ? d(p.currentValue) : d(p.totalCost);
        portfolioValue = portfolioValue.plus(v);
      }
    }
  }

  const currentValue = initial.plus(portfolioValue);
  const remaining = target.minus(currentValue);
  const years = yearsUntil(goal.targetDate);

  // All three derived via the unit-tested goalMath helpers (single source of
  // truth — see goalMath.test.ts).
  const inflationAdjustedTarget = calcInflationTarget(
    target,
    goal.inflationRate ? d(goal.inflationRate) : null,
    years,
  );
  const requiredCagr = calcRequiredCagr(target, currentValue, years); // number | null

  return {
    id: goal.id,
    name: goal.name,
    category: goal.category,
    priority: goal.priority,
    status: goal.status,
    targetAmount: serializeMoney(target),
    initialAmount: serializeMoney(initial),
    inflationRate: goal.inflationRate ? d(goal.inflationRate).toString() : null,
    expectedReturn: goal.expectedReturn ? d(goal.expectedReturn).toString() : null,
    targetDate: goal.targetDate.toISOString().slice(0, 10),
    startDate: goal.startDate.toISOString().slice(0, 10),
    portfolioIds: goal.portfolioIds,
    notes: goal.notes,
    achievedAt: goal.achievedAt ? goal.achievedAt.toISOString() : null,
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),

    // Computed fields
    currentValue: serializeMoney(currentValue),
    remaining: serializeMoney(remaining.lessThan(0) ? ZERO : remaining),
    progressPct: calcProgressPct(currentValue, target),
    yearsRemaining: Math.max(0, years),
    inflationAdjustedTarget: inflationAdjustedTarget
      ? serializeMoney(inflationAdjustedTarget)
      : null,
    requiredCagr,
    isOnTrack:
      requiredCagr != null && goal.expectedReturn
        ? requiredCagr <= d(goal.expectedReturn).toNumber()
        : null,
  };
}

function yearsUntil(date: Date): number {
  const now = Date.now();
  const ms = date.getTime() - now;
  return ms / (365.25 * 24 * 60 * 60 * 1000);
}
