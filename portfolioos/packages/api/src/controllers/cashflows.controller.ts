import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

const listQuery = z.object({
  portfolioId: z.string().optional(),
  type: z.enum(['INFLOW', 'OUTFLOW']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export async function listCashFlows(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const q = listQuery.parse(req.query);
  const skip = (q.page - 1) * q.pageSize;

  const where: Record<string, unknown> = {
    portfolio: { userId: req.user.id },
  };
  if (q.portfolioId) where.portfolioId = q.portfolioId;
  if (q.type) where.type = q.type;
  if (q.from || q.to) {
    where.date = {
      ...(q.from ? { gte: new Date(q.from) } : {}),
      ...(q.to ? { lte: new Date(q.to) } : {}),
    };
  }

  const [items, total] = await Promise.all([
    prisma.cashFlow.findMany({
      where,
      orderBy: { date: 'desc' },
      take: q.pageSize,
      skip,
      include: { portfolio: { select: { id: true, name: true } } },
    }),
    prisma.cashFlow.count({ where }),
  ]);

  ok(res, {
    items: items.map((cf) => ({
      id: cf.id,
      portfolioId: cf.portfolioId,
      portfolioName: cf.portfolio.name,
      date: cf.date,
      type: cf.type,
      amount: cf.amount.toString(),
      description: cf.description ?? null,
      createdAt: cf.createdAt,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  });
}
