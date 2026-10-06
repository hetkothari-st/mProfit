import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { decryptSecretWithKeyInfo, encryptSecret, isCurrentFormat } from '../lib/secrets.js';

/**
 * Re-encrypt every stored third-party secret under the current SECRETS_KEY.
 *
 * Production ran without SECRETS_KEY, so lib/secrets.ts fell back to a key
 * hardcoded in this repository for every Gmail/broker OAuth token, broker API
 * key, secret and TOTP seed, mailbox password, SMTP password, forex account
 * number and saved document password. Setting a real key fixes new writes;
 * this moves the existing rows off the public key.
 *
 * Only rows not already in the current (v2) format are touched, so this is
 * idempotent and cheap after the first run. Each value is decrypted — with the
 * legacy-key fallback — and re-encrypted; a row that decrypts under neither
 * key is logged and left untouched rather than overwritten.
 *
 * Note for operators: database backups taken BEFORE rotation still hold
 * ciphertext under the public key. Anything in them should be treated as
 * exposed — see SECURITY_AUDIT.md §10.
 */

type Fields<T extends string> = readonly T[];

interface Target<T extends string> {
  label: string;
  fields: Fields<T>;
  findMany: (afterId: string | null) => Promise<Array<{ id: string } & Partial<Record<T, string | null>>>>;
  update: (id: string, data: Partial<Record<T, string>>) => Promise<unknown>;
}

function target<T extends string>(t: Target<T>): Target<T> {
  return t;
}

const BATCH = 200;

/** Erased form for iterating targets of different models in one loop. */
interface AnyTarget {
  label: string;
  fields: readonly string[];
  findMany: (afterId: string | null) => Promise<Array<{ id: string } & Record<string, unknown>>>;
  update: (id: string, data: Record<string, string>) => Promise<unknown>;
}

const TARGETS = [
  target({
    label: 'MailboxAccount',
    fields: ['passwordEnc', 'refreshTokenEnc', 'accessTokenEnc'] as const,
    findMany: (afterId) =>
      prisma.mailboxAccount.findMany({
        where: afterId ? { id: { gt: afterId } } : {},
        select: { id: true, passwordEnc: true, refreshTokenEnc: true, accessTokenEnc: true },
        take: BATCH,
        orderBy: { id: 'asc' },
      }),
    update: (id, data) => prisma.mailboxAccount.update({ where: { id }, data }),
  }),
  target({
    label: 'BrokerAccount',
    fields: ['accessTokenEnc'] as const,
    findMany: (afterId) =>
      prisma.brokerAccount.findMany({
        where: afterId ? { id: { gt: afterId } } : {},
        select: { id: true, accessTokenEnc: true },
        take: BATCH,
        orderBy: { id: 'asc' },
      }),
    update: (id, data) => prisma.brokerAccount.update({ where: { id }, data }),
  }),
  target({
    label: 'BrokerCredential',
    fields: ['apiKey', 'apiSecret', 'totpSecret', 'accessToken', 'refreshToken'] as const,
    findMany: (afterId) =>
      prisma.brokerCredential.findMany({
        where: afterId ? { id: { gt: afterId } } : {},
        select: {
          id: true,
          apiKey: true,
          apiSecret: true,
          totpSecret: true,
          accessToken: true,
          refreshToken: true,
        },
        take: BATCH,
        orderBy: { id: 'asc' },
      }),
    update: (id, data) => prisma.brokerCredential.update({ where: { id }, data }),
  }),
  target({
    label: 'ForexBalance',
    fields: ['accountNumberEnc'] as const,
    findMany: (afterId) =>
      prisma.forexBalance.findMany({
        where: afterId ? { id: { gt: afterId } } : {},
        select: { id: true, accountNumberEnc: true },
        take: BATCH,
        orderBy: { id: 'asc' },
      }),
    update: (id, data) => prisma.forexBalance.update({ where: { id }, data }),
  }),
  target({
    label: 'UserNotificationConfig',
    fields: ['smtpPassEnc'] as const,
    findMany: (afterId) =>
      prisma.userNotificationConfig.findMany({
        where: afterId ? { id: { gt: afterId } } : {},
        select: { id: true, smtpPassEnc: true },
        take: BATCH,
        orderBy: { id: 'asc' },
      }),
    update: (id, data) => prisma.userNotificationConfig.update({ where: { id }, data }),
  }),
  target({
    label: 'User',
    fields: ['savedFilePasswordsEnc'] as const,
    findMany: (afterId) =>
      prisma.user.findMany({
        where: afterId ? { id: { gt: afterId } } : {},
        select: { id: true, savedFilePasswordsEnc: true },
        take: BATCH,
        orderBy: { id: 'asc' },
      }),
    update: (id, data) => prisma.user.update({ where: { id }, data }),
  }),
] as unknown as AnyTarget[];

export interface RotationResult {
  rotated: number;
  undecryptable: number;
}

export async function rotateLegacySecrets(): Promise<RotationResult> {
  let rotated = 0;
  let undecryptable = 0;

  for (const t of TARGETS) {
    // Walk every row once with an id cursor. The "not yet v2" test is a prefix
    // check across several nullable columns, so it is done here, not in SQL.
    let afterId: string | null = null;
    for (;;) {
      const rows: Array<{ id: string } & Record<string, unknown>> = await t.findMany(afterId);
      if (rows.length === 0) break;
      afterId = rows[rows.length - 1]!.id;
      for (const row of rows) {
        const data: Record<string, string> = {};
        for (const field of t.fields) {
          const value = row[field];
          if (typeof value !== 'string' || !value || isCurrentFormat(value)) continue;
          try {
            const { plain } = decryptSecretWithKeyInfo(value);
            data[field] = encryptSecret(plain);
          } catch (err) {
            undecryptable += 1;
            logger.warn(
              { model: t.label, id: row.id, field, err: err instanceof Error ? err.message : String(err) },
              '[secrets] stored value decrypts under neither the current nor the legacy key — left as is',
            );
          }
        }
        if (Object.keys(data).length > 0) {
          await t.update(row.id, data);
          rotated += Object.keys(data).length;
        }
      }
    }
  }
  return { rotated, undecryptable };
}
