import type { Request, Response } from 'express';
import {
  createProperty,
  deleteProperty,
  getCapitalGain,
  getProperty,
  listProperties,
  markSold,
  refreshValue,
  computeSummary,
  updateProperty,
} from '../services/realEstate.service.js';
import {
  createOwnedPropertySchema,
  markSoldSchema,
  refreshValueSchema,
  updateOwnedPropertySchema,
} from '../schemas/realEstate.schema.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

export async function listPropertiesHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const rows = await listProperties(req.user.id);
  ok(res, rows);
}

export async function getPropertyHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const row = await getProperty(req.user.id, req.params['id']!);
  ok(res, row);
}

export async function createPropertyHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = createOwnedPropertySchema.parse(req.body);
  const row = await createProperty(req.user.id, body);
  res.status(201);
  ok(res, row);
}

export async function updatePropertyHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = updateOwnedPropertySchema.parse(req.body);
  const row = await updateProperty(req.user.id, req.params['id']!, body);
  ok(res, row);
}

export async function deletePropertyHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteProperty(req.user.id, req.params['id']!);
  ok(res, null);
}

export async function markSoldHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = markSoldSchema.parse(req.body);
  const row = await markSold(req.user.id, req.params['id']!, body);
  ok(res, row);
}

export async function refreshValueHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = refreshValueSchema.parse(req.body);
  const row = await refreshValue(req.user.id, req.params['id']!, body);
  ok(res, row);
}

export async function getCapitalGainHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const cg = await getCapitalGain(req.user.id, req.params['id']!);
  ok(res, cg);
}

export async function getSummaryHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const summary = await computeSummary(req.user.id);
  ok(res, summary);
}
