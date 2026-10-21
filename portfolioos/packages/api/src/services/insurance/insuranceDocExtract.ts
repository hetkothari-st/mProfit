/**
 * How an insurance document's reading is stored: encrypted JSON (it holds the
 * policy number and the people named), with the policy number also kept as a
 * keyed fingerprint so documents can be matched without decrypting them.
 */

import { Prisma, type InsuranceDocument } from '@prisma/client';
import { decryptIdentifier, encryptIdentifier } from '../pf/pfCredentials.service.js';
import {
  InsuranceDocExtractSchema,
  type InsuranceDocExtract,
} from '../../ingestion/insurance/insuranceDocReader.js';
import { hashPolicyNumber, normalizePolicyNumber } from './insurance.service.js';

/** The columns a reading is stored as: encrypted, plus the number's fingerprint. */
export async function sealedExtractColumns(extract: InsuranceDocExtract) {
  const number = extract.policy_number ? normalizePolicyNumber(extract.policy_number) : '';
  return {
    extractEnc: await encryptIdentifier(JSON.stringify(extract)),
    policyNumberHash: number.length >= 3 ? hashPolicyNumber(extract.policy_number!) : null,
    extract: Prisma.DbNull,
  };
}

export async function extractOf(doc: Pick<InsuranceDocument, 'extract' | 'extractEnc'>): Promise<InsuranceDocExtract | null> {
  const raw = doc.extractEnc ? JSON.parse(await decryptIdentifier(doc.extractEnc)) : doc.extract;
  if (raw == null) return null;
  const parsed = InsuranceDocExtractSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

