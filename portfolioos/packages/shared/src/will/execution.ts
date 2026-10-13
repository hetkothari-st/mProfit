/**
 * Will Maker part 2: the signing (execution) record, signed-copy limits and
 * the review cycle. Pure, no I/O. Witness names are personal data: the API
 * seals them (slot "willexec:<willId>") and never logs them.
 */
import { z } from 'zod';
import type { WillPayload } from './schema.js';
import type { WillStatusWire } from './wire.js';
import { willBeneficiaryIds } from './estateMath.js';

export const WILL_REVIEW_INTERVAL_YEARS = 2;
export const WILL_WITNESS_NAME_MAX = 120;
export const WILL_SIGNED_COPY_MAX_MB = 20;
export const WILL_SIGNED_COPY_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export type WillSignedCopyMime = (typeof WILL_SIGNED_COPY_MIME_TYPES)[number];

/** A real calendar day written YYYY-MM-DD. */
export function isIsoDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const isoDaySchema = z.string().refine(isIsoDay, { message: 'invalid_date' });
const witnessName = z.string().trim().min(2).max(WILL_WITNESS_NAME_MAX);

/** What the user submits. Checks that need the will itself are in willWitnessIssues. */
export const willExecutionInputSchema = z.object({
  executedOn: isoDaySchema,
  witnesses: z.tuple([witnessName, witnessName]),
});
export type WillExecutionInput = z.infer<typeof willExecutionInputSchema>;

/** The sealed record kept on the Will row. */
export const willExecutionRecordSchema = willExecutionInputSchema.extend({ recordedAt: z.string() });
export type WillExecutionRecord = z.infer<typeof willExecutionRecordSchema>;

/** Compare people's names: NFKC, trimmed, single spaces, lower case. */
export function normaliseWillName(s: string): string {
  return s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Calendar years later; 29 February becomes 28 February in a non-leap year. */
export function addYearsIso(iso: string, years: number): string {
  const y = Number.parseInt(iso.slice(0, 4), 10) + years;
  const m = Number.parseInt(iso.slice(5, 7), 10);
  const d = Number.parseInt(iso.slice(8, 10), 10);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

export function willNextReviewDate(fromIso: string): string {
  return addYearsIso(fromIso, WILL_REVIEW_INTERVAL_YEARS);
}

export type WillExecutionWarning = 'WITNESS_IS_BENEFICIARY';

/**
 * A witness who (or whose spouse) takes under the will can lose that gift
 * (s.67 Indian Succession Act); the will itself stays valid. Spouses cannot be
 * detected from names, so this only catches beneficiaries and their back-ups.
 */
export function willWitnessWarnings(p: WillPayload, witnesses: readonly string[]): WillExecutionWarning[] {
  const ids = new Set(willBeneficiaryIds(p));
  const backups = p.people.filter((x) => ids.has(x.id) && x.contingentId).map((x) => x.contingentId as string);
  for (const id of backups) ids.add(id);
  const names = new Set(p.people.filter((x) => ids.has(x.id)).map((x) => normaliseWillName(x.name)));
  return witnesses.some((w) => names.has(normaliseWillName(w))) ? ['WITNESS_IS_BENEFICIARY'] : [];
}

/** Hard errors: the testator cannot witness their own will, and two witnesses means two people. */
export function willWitnessIssues(
  p: WillPayload,
  witnesses: readonly [string, string],
): Array<{ path: string; code: string }> {
  const issues: Array<{ path: string; code: string }> = [];
  const testator = normaliseWillName(p.details.legalName);
  witnesses.forEach((w, i) => {
    if (testator !== '' && normaliseWillName(w) === testator) issues.push({ path: `witnesses.${i}`, code: 'witness_is_testator' });
  });
  if (normaliseWillName(witnesses[0]) === normaliseWillName(witnesses[1])) {
    issues.push({ path: 'witnesses.1', code: 'duplicate_witness' });
  }
  return issues;
}

export interface WillSignedCopyWire {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface WillExecutionWire {
  willId: string;
  version: number;
  status: WillStatusWire;
  versionId: string;
  generatedOn: string;
  executedOn: string | null;
  witnesses: string[];
  /** Only while the will is EXECUTED (a replaced will has no review). */
  nextReviewAt: string | null;
  signedCopy: WillSignedCopyWire | null;
  warnings: WillExecutionWarning[];
}

export interface WillReviewedWire {
  nextReviewAt: string;
}
