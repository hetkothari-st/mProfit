import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ok } from '../lib/response.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { encryptSecret } from '../lib/secrets.js';
import { testMailboxConnection, pollMailboxNow } from '../jobs/mailboxPoller.js';
import { syncGmailAccount } from '../connectors/gmail.connector.js';

const CreateSchema = z.object({
  label: z.string().optional(),
  host: z.string().min(1),
  port: z.number().int().positive().default(993),
  secure: z.boolean().default(true),
  username: z.string().min(1),
  password: z.string().min(1),
  folder: z.string().default('INBOX'),
  fromFilter: z.string().optional().nullable(),
  subjectFilter: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

const UpdateSchema = CreateSchema.partial().extend({
  password: z.string().min(1).optional(),
});

const TestSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive().default(993),
  secure: z.boolean().default(true),
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function listMailboxes(req: Request, res: Response) {
  const userId = req.user!.id;
  const rows = await prisma.mailboxAccount.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      provider: true,
      label: true,
      host: true,
      port: true,
      secure: true,
      username: true,
      googleEmail: true,
      folder: true,
      fromFilter: true,
      subjectFilter: true,
      isActive: true,
      lastPolledAt: true,
      lastError: true,
      createdAt: true,
    },
  });
  ok(res, rows);
}

export async function createMailbox(req: Request, res: Response) {
  const userId = req.user!.id;
  const body = CreateSchema.parse(req.body);
  const row = await prisma.mailboxAccount.create({
    data: {
      userId,
      label: body.label ?? null,
      host: body.host,
      port: body.port,
      secure: body.secure,
      username: body.username,
      passwordEnc: encryptSecret(body.password),
      folder: body.folder,
      fromFilter: body.fromFilter ?? null,
      subjectFilter: body.subjectFilter ?? null,
      isActive: body.isActive,
    },
  });
  ok(res, { id: row.id });
}

export async function updateMailbox(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = req.params.id;
  if (!id) throw new BadRequestError('id required');
  const existing = await prisma.mailboxAccount.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError('Mailbox not found');
  const body = UpdateSchema.parse(req.body);
  const data: Record<string, unknown> = {};
  if (body.label !== undefined) data.label = body.label ?? null;
  if (body.host !== undefined) data.host = body.host;
  if (body.port !== undefined) data.port = body.port;
  if (body.secure !== undefined) data.secure = body.secure;
  if (body.username !== undefined) data.username = body.username;
  if (body.password !== undefined) data.passwordEnc = encryptSecret(body.password);
  if (body.folder !== undefined) data.folder = body.folder;
  if (body.fromFilter !== undefined) data.fromFilter = body.fromFilter ?? null;
  if (body.subjectFilter !== undefined) data.subjectFilter = body.subjectFilter ?? null;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  await prisma.mailboxAccount.update({ where: { id }, data });
  ok(res, { ok: true });
}

export async function deleteMailbox(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = req.params.id;
  if (!id) throw new BadRequestError('id required');
  const existing = await prisma.mailboxAccount.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError('Mailbox not found');
  await prisma.mailboxAccount.delete({ where: { id } });
  ok(res, { ok: true });
}

export async function testMailbox(req: Request, res: Response) {
  const body = TestSchema.parse(req.body);
  const r = await testMailboxConnection(body.host, body.port, body.secure, body.username, body.password);
  ok(res, r);
}

export async function pollMailbox(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = req.params.id;
  if (!id) throw new BadRequestError('id required');
  const existing = await prisma.mailboxAccount.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError('Mailbox not found');
  const r =
    existing.provider === 'GMAIL_OAUTH'
      ? await syncGmailAccount(id)
      : await pollMailboxNow(id);
  ok(res, r);
}
