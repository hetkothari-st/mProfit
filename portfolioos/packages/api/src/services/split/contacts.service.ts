/**
 * The caller's Split address book. Email and phone are sealed at rest
 * (sealText) with a keyed fingerprint beside them, so a later signup can be
 * matched to placeholder contacts without storing the address in clear.
 */
import type { SplitContactDto } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { sealText, openText } from '../piiAtRest.service.js';
import { hashIdentifier } from '../pfCredentials.service.js';
import { env } from '../../config/env.js';

export interface ContactInput { name: string; email?: string | null; phone?: string | null; upiId?: string | null }

const EMAIL_PURPOSE = 'split-contact-email';
const PHONE_PURPOSE = 'split-contact-phone';

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.length === 10 ? `91${digits}` : digits;
}

function checkEmail(v: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new BadRequestError('Invalid email address');
}
function checkUpi(v: string): void {
  if (!/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(v)) throw new BadRequestError('Invalid UPI ID');
}

async function identifierColumns(prefix: 'email' | 'phone', raw: string | null | undefined) {
  if (raw === undefined) return {};
  if (raw === null || raw.trim() === '') return { [prefix]: null, [`${prefix}Enc`]: null, [`${prefix}Hash`]: null };
  const value = prefix === 'email' ? normalizeEmail(raw) : normalizePhone(raw);
  if (prefix === 'email') checkEmail(value);
  else if (value.length < 10 || value.length > 15) throw new BadRequestError('Invalid phone number');
  const { plain, enc } = await sealText(value);
  const hash = env.APP_ENCRYPTION_KEY ? hashIdentifier(value, prefix === 'email' ? EMAIL_PURPOSE : PHONE_PURPOSE) : null;
  return { [prefix]: plain, [`${prefix}Enc`]: enc, [`${prefix}Hash`]: hash };
}

type Row = { id: string; name: string; email: string | null; emailEnc: string | null; phone: string | null; phoneEnc: string | null; upiId: string | null; linkedUserId: string | null };

function toDto(r: Row): SplitContactDto {
  return {
    id: r.id,
    name: r.name,
    email: openText(r.emailEnc, r.email),
    phone: openText(r.phoneEnc, r.phone),
    upiId: r.upiId,
    linkedUserId: r.linkedUserId,
  };
}

export async function listContacts(userId: string): Promise<SplitContactDto[]> {
  const rows = await prisma.splitContact.findMany({ where: { ownerUserId: userId }, orderBy: { name: 'asc' } });
  return rows.map(toDto);
}

export async function createContact(userId: string, input: ContactInput): Promise<SplitContactDto> {
  const name = input.name.trim();
  if (!name) throw new BadRequestError('Name is required');
  if (input.upiId) checkUpi(input.upiId.trim());
  const row = await prisma.splitContact.create({
    data: {
      ownerUserId: userId,
      name,
      upiId: input.upiId?.trim() || null,
      ...(await identifierColumns('email', input.email ?? null)),
      ...(await identifierColumns('phone', input.phone ?? null)),
    },
  });
  return toDto(row);
}

export async function getContactRow(userId: string, id: string) {
  const row = await prisma.splitContact.findFirst({
    where: { id, ownerUserId: userId },
    select: { id: true, name: true, linkedUserId: true, upiId: true },
  });
  if (!row) throw new NotFoundError('Contact not found');
  return row;
}

export async function updateContact(userId: string, id: string, input: Partial<ContactInput>): Promise<SplitContactDto> {
  await getContactRow(userId, id);
  if (input.upiId) checkUpi(input.upiId.trim());
  const row = await prisma.splitContact.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.upiId !== undefined ? { upiId: input.upiId?.trim() || null } : {}),
      ...(await identifierColumns('email', input.email)),
      ...(await identifierColumns('phone', input.phone)),
    },
  });
  return toDto(row);
}

export async function deleteContact(userId: string, id: string): Promise<void> {
  await getContactRow(userId, id);
  await prisma.splitContact.delete({ where: { id } });
}
