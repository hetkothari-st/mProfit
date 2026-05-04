import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  createGroup,
  deleteGroup,
  getGroup,
  getGroupAllocation,
  getGroupCashFlows,
  getGroupHistoricalValuation,
  getGroupHoldings,
  getGroupSummary,
  listGroups,
  setGroupMembers,
  updateGroup,
} from '../services/portfolioGroup.service.js';
import { created, noContent, ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  memberIds: z.array(z.string().cuid()).optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    memberIds: z.array(z.string().cuid()).optional(),
  })
  .partial();

const membersSchema = z.object({
  memberIds: z.array(z.string().cuid()),
});

function userId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

export async function list(req: Request, res: Response) {
  ok(res, await listGroups(userId(req)));
}

export async function detail(req: Request, res: Response) {
  ok(res, await getGroup(userId(req), req.params.id!));
}

export async function create(req: Request, res: Response) {
  const data = createSchema.parse(req.body);
  created(res, await createGroup(userId(req), data));
}

export async function update(req: Request, res: Response) {
  const data = updateSchema.parse(req.body);
  ok(res, await updateGroup(userId(req), req.params.id!, data));
}

export async function remove(req: Request, res: Response) {
  await deleteGroup(userId(req), req.params.id!);
  noContent(res);
}

export async function setMembers(req: Request, res: Response) {
  const data = membersSchema.parse(req.body);
  await setGroupMembers(userId(req), req.params.id!, data.memberIds);
  noContent(res);
}

export async function summary(req: Request, res: Response) {
  ok(res, await getGroupSummary(userId(req), req.params.id!));
}

export async function holdings(req: Request, res: Response) {
  ok(res, await getGroupHoldings(userId(req), req.params.id!));
}

export async function allocation(req: Request, res: Response) {
  ok(res, await getGroupAllocation(userId(req), req.params.id!));
}

export async function historicalValuation(req: Request, res: Response) {
  const days = req.query.days !== undefined ? Number(req.query.days) : 365;
  ok(
    res,
    await getGroupHistoricalValuation(userId(req), req.params.id!, isNaN(days) ? 365 : days),
  );
}

export async function cashFlows(req: Request, res: Response) {
  ok(res, await getGroupCashFlows(userId(req), req.params.id!));
}
