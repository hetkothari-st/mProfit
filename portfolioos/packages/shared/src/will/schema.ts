/**
 * Will Maker payload (spec: docs/superpowers/specs/2026-10-12-will-maker-design.md).
 *
 * The whole draft is ONE JSON document sealed with the owner's data key on the
 * server. Every field has a default so a half-finished draft always parses;
 * completeness is judged by the validation rules, not by this schema.
 */
import { z } from 'zod';
import { Decimal } from '../decimal.js';
import { isRealIsoDate } from './dates.js';

export const WILL_PAYLOAD_SCHEMA_VER = 1;
export const WILL_MANUAL_ITEM_PREFIX = 'manual:';

export const PERSONAL_LAWS = ['HINDU', 'SIKH', 'JAIN', 'BUDDHIST', 'CHRISTIAN', 'PARSI', 'MUSLIM', 'OTHER'] as const;
export type PersonalLaw = (typeof PERSONAL_LAWS)[number];
export const MARITAL_STATUSES = ['SINGLE', 'MARRIED', 'WIDOWED', 'DIVORCED', 'SEPARATED'] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];
export const WILL_JURISDICTIONS = ['IN', 'OTHER'] as const;
export const WILL_RELATIONSHIPS = [
  'SPOUSE', 'SON', 'DAUGHTER', 'FATHER', 'MOTHER', 'BROTHER', 'SISTER', 'GRANDSON', 'GRANDDAUGHTER',
  'SON_IN_LAW', 'DAUGHTER_IN_LAW', 'NEPHEW', 'NIECE', 'OTHER_RELATIVE', 'FRIEND', 'CHARITY', 'OTHER',
] as const;
export type WillRelationship = (typeof WILL_RELATIONSHIPS)[number];
export const WILL_PARTY_TYPES = ['INDIVIDUAL', 'ORGANISATION'] as const;
export type WillPartyType = (typeof WILL_PARTY_TYPES)[number];
export const WILL_ESTATE_SIDES = ['ASSET', 'LIABILITY'] as const;
export type WillEstateSide = (typeof WILL_ESTATE_SIDES)[number];
export const WILL_ESTATE_KINDS = [
  'BANK_ACCOUNT', 'HOLDING', 'PROVIDENT_FUND', 'OWNED_PROPERTY', 'RENTAL_PROPERTY', 'VEHICLE', 'INSURANCE',
  'LOAN_GIVEN', 'LOAN', 'CREDIT_CARD', 'OTHER_ASSET', 'OTHER_LIABILITY',
] as const;
export type WillEstateKind = (typeof WILL_ESTATE_KINDS)[number];
export const WILL_OWNERSHIP_TYPES = ['SOLE', 'JOINT', 'NOMINEE_ONLY', 'HUF'] as const;
export type WillOwnershipType = (typeof WILL_OWNERSHIP_TYPES)[number];
export const WILL_REVIEW_STATES = ['NEEDS_REVIEW', 'CONFIRMED', 'EXCLUDED', 'STALE'] as const;
export type WillReviewState = (typeof WILL_REVIEW_STATES)[number];
/** How the testator is described after their name ("son of ..."). The user picks the words; nothing is inferred. */
export const WILL_PARENTAGE_RELATIONS = ['SON_OF', 'DAUGHTER_OF', 'WIFE_OF', 'HUSBAND_OF', 'CHILD_OF', 'SPOUSE_OF'] as const;
export type WillParentageRelation = (typeof WILL_PARENTAGE_RELATIONS)[number];
/** Days a beneficiary must outlive the testator to take a gift (0 = only survive). */
export const WILL_SURVIVAL_DAYS = [0, 7, 15, 30, 60, 90] as const;
export const WILL_DEFAULT_SURVIVAL_DAYS = 30;
export const WILL_SECTIONS = ['details', 'people', 'estate', 'allocation', 'instructions'] as const;
export type WillSection = (typeof WILL_SECTIONS)[number];

// zod 3.25 still runs refine() after a failed regex(); isRealIsoDate re-checks the shape and never throws.
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => isRealIsoDate(v), { message: 'not a real date' });
const amount = z.string().regex(/^\d{1,13}(\.\d{1,2})?$/);
const PERCENT_RE = /^\d{1,3}(\.\d{1,2})?$/;
// zod 3.25 still runs refine() after a failed regex(), so the refine re-checks the shape before parsing.
const percent = z
  .string()
  .regex(PERCENT_RE)
  .refine((v) => PERCENT_RE.test(v) && new Decimal(v).lte(100), { message: 'at most 100' });
const ref = z.string().min(1).max(64);
const text = (max: number) => z.string().trim().max(max);

export const willDetailsSchema = z.object({
  legalName: text(120).default(''),
  dob: isoDate.nullable().default(null),
  jurisdiction: z.enum(WILL_JURISDICTIONS).default('IN'),
  personalLaw: z.enum(PERSONAL_LAWS).nullable().default(null),
  address: text(400).default(''),
  maritalStatus: z.enum(MARITAL_STATUSES).nullable().default(null),
  hasChildren: z.boolean().nullable().default(null),
  hasDependents: z.boolean().nullable().default(null),
  /** Optional "son of / wife of NAME" after the testator's name. Printed only when both are set. */
  parentage: z
    .object({ relation: z.enum(WILL_PARENTAGE_RELATIONS).nullable().default(null), name: text(120).default('') })
    .prefault({}),
});

export const willPersonSchema = z.object({
  id: ref,
  partyType: z.enum(WILL_PARTY_TYPES),
  name: z.string().trim().min(1).max(120),
  relationship: z.enum(WILL_RELATIONSHIPS),
  dob: isoDate.nullable().default(null),
  contact: text(120).nullable().default(null),
  sourceFamilyMemberId: ref.nullable().default(null),
  /** Back-up beneficiary: receives this person's gifts if they do not survive the testator. */
  contingentId: ref.nullable().default(null),
});

export const willRolesSchema = z.object({
  executorId: ref.nullable().default(null),
  altExecutorId: ref.nullable().default(null),
  guardianId: ref.nullable().default(null),
  altGuardianId: ref.nullable().default(null),
});

export const willAssetItemSchema = z.object({
  /** Stable id: "<source>:<row id>" for fetched items, "manual:<id>" for items the user added. */
  sourceKey: z.string().min(1).max(120),
  side: z.enum(WILL_ESTATE_SIDES),
  kind: z.enum(WILL_ESTATE_KINDS),
  label: z.string().trim().min(1).max(160),
  /** Identifier printed in the will (masked account number, vehicle plate). */
  ref: text(40).nullable().default(null),
  value: amount,
  valueAsOf: isoDate.nullable().default(null),
  ownership: z.object({ type: z.enum(WILL_OWNERSHIP_TYPES), sharePct: percent }),
  review: z.enum(WILL_REVIEW_STATES),
  userEdited: z.boolean().default(false),
  note: text(300).nullable().default(null),
});

export const willEstateSchema = z.object({
  asOf: isoDate.nullable().default(null),
  items: z.array(willAssetItemSchema).max(500).default([]),
  /** Adapter ids that failed on the last refresh. */
  failedSources: z.array(z.string().min(1).max(40)).max(20).default([]),
});

export const willAllocationSchema = z.object({
  residuary: z.array(z.object({ personId: ref, sharePct: percent })).max(60).default([]),
  specificGifts: z
    .array(z.object({ itemId: z.string().min(1).max(120), personId: ref, sharePct: percent.default('100') }))
    .max(200)
    .default([]),
  fixedGifts: z.array(z.object({ personId: ref, amount })).max(60).default([]),
  /** Survivorship period in days. 30 matches every will drafted before this field existed. */
  survivalDays: z
    .number()
    .int()
    .refine((v) => (WILL_SURVIVAL_DAYS as readonly number[]).includes(v), { message: 'not an offered period' })
    .default(WILL_DEFAULT_SURVIVAL_DAYS),
});

export const willInstructionsSchema = z.object({ text: z.string().max(1000).default('') });

export const willPeopleSectionSchema = z.object({
  people: z.array(willPersonSchema).max(60).default([]),
  roles: willRolesSchema.prefault({}),
});

export const willPayloadSchema = z.object({
  schemaVer: z.literal(WILL_PAYLOAD_SCHEMA_VER).default(WILL_PAYLOAD_SCHEMA_VER),
  details: willDetailsSchema.prefault({}),
  people: z.array(willPersonSchema).max(60).default([]),
  roles: willRolesSchema.prefault({}),
  estate: willEstateSchema.prefault({}),
  allocation: willAllocationSchema.prefault({}),
  instructions: willInstructionsSchema.prefault({}),
});

export type WillPayload = z.output<typeof willPayloadSchema>;
export type WillDetails = WillPayload['details'];
export type WillPerson = WillPayload['people'][number];
export type WillRoles = WillPayload['roles'];
export type WillEstate = WillPayload['estate'];
export type WillAssetItem = WillEstate['items'][number];
export type WillAllocation = WillPayload['allocation'];

export interface WillSectionData {
  details: WillDetails;
  people: { people: WillPerson[]; roles: WillRoles };
  estate: WillEstate;
  allocation: WillAllocation;
  instructions: WillPayload['instructions'];
}

export const WILL_SECTION_SCHEMAS = {
  details: willDetailsSchema,
  people: willPeopleSectionSchema,
  estate: willEstateSchema,
  allocation: willAllocationSchema,
  instructions: willInstructionsSchema,
} as const;

export function emptyWillPayload(): WillPayload {
  return willPayloadSchema.parse({});
}

export function isWillSection(s: string): s is WillSection {
  return (WILL_SECTIONS as readonly string[]).includes(s);
}

export function willSectionData<S extends WillSection>(p: WillPayload, s: S): WillSectionData[S] {
  const all: WillSectionData = {
    details: p.details,
    people: { people: p.people, roles: p.roles },
    estate: p.estate,
    allocation: p.allocation,
    instructions: p.instructions,
  };
  return all[s];
}

export function applyWillSection<S extends WillSection>(p: WillPayload, s: S, data: WillSectionData[S]): WillPayload {
  if (s === 'people') {
    const d = data as WillSectionData['people'];
    return { ...p, people: d.people, roles: d.roles };
  }
  return { ...p, [s]: data } as WillPayload;
}
