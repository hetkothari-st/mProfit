import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../lib/response.js';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, ForbiddenError } from '../lib/errors.js';
import {
  cancelInvoice,
  createInvoice,
  getInvoice,
  getPracticeProfile,
  lastBuyerFor,
  listInvoices,
  markInvoicePaid,
  renderInvoicePdf,
  savePracticeProfile,
} from '../services/ca/caInvoice.service.js';

const fy = z.string().regex(/^\d{4}-\d{2}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function getPracticeProfileHandler(req: Request, res: Response): Promise<void> {
  ok(res, await getPracticeProfile(req.user!.id));
}

const profileBody = z.object({
  firmName: z.string(),
  address: z.string(),
  stateCode: z.string(),
  gstin: z.string().nullable().optional(),
  invoicePrefix: z.string().nullable().optional(),
  paymentNote: z.string().nullable().optional(),
});
export async function savePracticeProfileHandler(req: Request, res: Response): Promise<void> {
  ok(res, await savePracticeProfile(req.user!.id, profileBody.parse(req.body)));
}

const listQuery = z.object({
  financialYear: fy.optional(),
  status: z.enum(['ISSUED', 'PAID', 'CANCELLED']).optional(),
  clientId: z.string().optional(),
});
export async function listInvoicesHandler(req: Request, res: Response): Promise<void> {
  ok(res, await listInvoices(req.user!.id, listQuery.parse(req.query)));
}

const invoiceBody = z.object({
  clientId: z.string(),
  invoiceDate: day,
  buyerName: z.string(),
  buyerAddress: z.string().nullable().optional(),
  buyerGstin: z.string().nullable().optional(),
  placeOfSupply: z.string().nullable().optional(),
  lines: z
    .array(
      z.object({
        description: z.string(),
        sac: z.string().nullable().optional(),
        amount: z.string(),
        gstRatePct: z.string().optional(),
      }),
    )
    .min(1)
    .max(20),
});
export async function createInvoiceHandler(req: Request, res: Response): Promise<void> {
  created(res, await createInvoice(req.user!.id, invoiceBody.parse(req.body)));
}

export async function getInvoiceHandler(req: Request, res: Response): Promise<void> {
  ok(res, await getInvoice(req.user!.id, String(req.params.id)));
}

export async function invoicePdfHandler(req: Request, res: Response): Promise<void> {
  const inv = await getInvoice(req.user!.id, String(req.params.id));
  const pdf = await renderInvoicePdf(inv);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${inv.number.replace(/\//g, '-')}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Length', String(pdf.length));
  res.end(pdf);
}

const paidBody = z.object({
  paid: z.boolean().optional(),
  paidOn: day.optional(),
  paymentNote: z.string().max(300).nullable().optional(),
});
export async function markInvoicePaidHandler(req: Request, res: Response): Promise<void> {
  ok(res, await markInvoicePaid(req.user!.id, String(req.params.id), paidBody.parse(req.body)));
}

export async function cancelInvoiceHandler(req: Request, res: Response): Promise<void> {
  ok(res, await cancelInvoice(req.user!.id, String(req.params.id)));
}

/** What to prefill a new invoice for this client with. */
export async function billingDefaultsHandler(req: Request, res: Response): Promise<void> {
  const clientId = String(req.params.clientId);
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { advisorId: true, name: true, initiatedBy: true, clientUser: { select: { name: true, email: true } } },
  });
  if (!client) throw new NotFoundError('Client not found.');
  if (client.advisorId !== req.user!.id) throw new ForbiddenError('That client is not yours.');
  const last = await lastBuyerFor(req.user!.id, clientId);
  const name =
    client.initiatedBy === 'CLIENT' && client.clientUser ? client.clientUser.name || client.clientUser.email : client.name;
  ok(res, last ?? { buyerName: name, buyerAddress: null, buyerGstin: null, placeOfSupply: null });
}
