import { Prisma, type Will, type WillVersion } from '@prisma/client';
import {
  applyWillSection, emptyWillPayload, runWillRules, serializeMoney, willEstateTotals,
  WILL_PAYLOAD_SCHEMA_VER, WILL_SECTION_SCHEMAS,
  type WillDraftWire, type WillEstateRefreshWire, type WillOverviewWire, type WillPayload, type WillRelationship,
  type WillSaveResultWire, type WillSection, type WillSectionData, type WillStatusWire, type WillSuggestionWire,
  type WillVersionWire,
} from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { collectEstate, type EstateCollection } from './estate/registry.js';
import { candidatesToItems, reconcileEstate } from './estate/reconcile.js';
import type { EstateContext } from './estate/types.js';
import {
  loadDraft, loadOwnedWill, newWillId, openWillPayload, revisionConflict, sealWillPayload, todayIst, zodIssues,
} from './willStore.js';

export interface WillServiceDeps {
  collect?: (ctx: EstateContext) => Promise<EstateCollection>;
  today?: () => string;
}

export function toVersionWire(status: WillStatusWire, v: WillVersion): WillVersionWire {
  return {
    id: v.id,
    willId: v.willId,
    versionNo: v.versionNo,
    status,
    generatedOn: v.generatedOn.toISOString().slice(0, 10),
    templateId: v.templateId,
    templateVersion: v.templateVersion,
  };
}

function toDraftWire(will: Will, payload: WillPayload, today: string): WillDraftWire {
  return {
    id: will.id,
    version: will.version,
    revision: will.revision,
    currentStep: will.currentStep,
    payload,
    findings: runWillRules(payload, { today }),
    updatedAt: will.updatedAt.toISOString(),
  };
}

const DRAFT_EXISTS = 'You already have a draft will. Continue it or discard it first.';

export async function getWillOverview(userId: string, deps: WillServiceDeps = {}): Promise<WillOverviewWire> {
  const today = (deps.today ?? todayIst)();
  const wills = await prisma.will.findMany({
    where: { userId, status: { not: 'DISCARDED' } },
    orderBy: { version: 'desc' },
    include: { versions: { orderBy: { versionNo: 'desc' } } },
  });
  const draft = wills.find((w) => w.status === 'DRAFT') ?? null;
  const live = wills.find((w) => w.status === 'GENERATED' || w.status === 'EXECUTED') ?? null;
  const versions = wills.flatMap((w) => w.versions.map((v) => toVersionWire(w.status, v)));
  const collection = await (deps.collect ?? collectEstate)({ userId, today });
  const totals = willEstateTotals(candidatesToItems(collection.candidates));
  return {
    status: live ? (live.status as 'GENERATED' | 'EXECUTED') : draft ? 'DRAFT' : 'NOT_CREATED',
    draft: draft
      ? { id: draft.id, version: draft.version, currentStep: draft.currentStep, updatedAt: draft.updatedAt.toISOString() }
      : null,
    versions,
    estate: {
      assets: serializeMoney(totals.assets),
      liabilities: serializeMoney(totals.liabilities),
      net: serializeMoney(totals.net),
      nomineeOnly: serializeMoney(totals.nomineeOnly),
    },
    estateFailedSources: collection.failed,
  };
}

export async function createWillDraft(userId: string, fromWillId: string | null): Promise<WillDraftWire> {
  const existing = await prisma.will.findFirst({ where: { userId, status: 'DRAFT' }, select: { id: true } });
  if (existing) throw new ConflictError(DRAFT_EXISTS, { reason: 'WILL_DRAFT_EXISTS', draftId: existing.id });

  let payload = emptyWillPayload();
  if (fromWillId) {
    const source = await loadOwnedWill(userId, fromWillId);
    if (source.status === 'DISCARDED') throw new NotFoundError('Will not found');
    payload = await openWillPayload(userId, source.id, source.payload);
  }
  const last = await prisma.will.findFirst({ where: { userId }, orderBy: { version: 'desc' }, select: { version: true } });
  const id = newWillId();
  const sealed = await sealWillPayload(userId, id, payload);
  try {
    const row = await prisma.will.create({
      data: { id, userId, version: (last?.version ?? 0) + 1, payload: sealed, payloadSchemaVer: WILL_PAYLOAD_SCHEMA_VER },
    });
    return toDraftWire(row, payload, todayIst());
  } catch (err) {
    // Two tabs pressing "Create" at once: the partial unique index lets one win.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError(DRAFT_EXISTS, { reason: 'WILL_DRAFT_EXISTS' });
    }
    throw err;
  }
}

export async function getWillDraft(userId: string, willId: string, deps: WillServiceDeps = {}): Promise<WillDraftWire> {
  const { will, payload } = await loadDraft(userId, willId);
  return toDraftWire(will, payload, (deps.today ?? todayIst)());
}

/** Write a new payload if nobody saved since `will.revision` was read. */
async function writeDraft(userId: string, will: Will, payload: WillPayload, currentStep: number): Promise<WillSaveResultWire> {
  const sealed = await sealWillPayload(userId, will.id, payload);
  const res = await prisma.will.updateMany({
    where: { id: will.id, userId, status: 'DRAFT', revision: will.revision },
    data: { payload: sealed, revision: { increment: 1 }, currentStep },
  });
  if (res.count === 0) {
    const now = await prisma.will.findFirst({ where: { id: will.id, userId }, select: { revision: true } });
    throw revisionConflict(now?.revision ?? will.revision);
  }
  return { revision: will.revision + 1, updatedAt: new Date().toISOString() };
}

export async function saveWillSection(
  userId: string,
  willId: string,
  section: WillSection,
  input: { revision: number; currentStep: number; data: unknown },
): Promise<WillSaveResultWire> {
  const parsed = WILL_SECTION_SCHEMAS[section].safeParse(input.data);
  if (!parsed.success) {
    throw new ValidationError('Some will details are not valid', { issues: zodIssues(parsed.error) });
  }
  const { will, payload } = await loadDraft(userId, willId);
  if (will.revision !== input.revision) throw revisionConflict(will.revision);
  const next = applyWillSection(payload, section, parsed.data as WillSectionData[typeof section]);
  return writeDraft(userId, will, next, input.currentStep);
}

export async function refreshWillEstate(
  userId: string,
  willId: string,
  revision: number,
  deps: WillServiceDeps = {},
): Promise<WillEstateRefreshWire> {
  const today = (deps.today ?? todayIst)();
  const { will, payload } = await loadDraft(userId, willId);
  if (will.revision !== revision) throw revisionConflict(will.revision);
  const collection = await (deps.collect ?? collectEstate)({ userId, today });
  const estate = {
    asOf: today,
    items: reconcileEstate(payload.estate.items, collection.candidates, { failedAdapterIds: collection.failed }),
    failedSources: collection.failed,
  };
  const saved = await writeDraft(userId, will, { ...payload, estate }, will.currentStep);
  return { revision: saved.revision, estate };
}

export async function discardWillDraft(userId: string, willId: string): Promise<void> {
  const res = await prisma.will.updateMany({ where: { id: willId, userId, status: 'DRAFT' }, data: { status: 'DISCARDED' } });
  if (res.count === 0) throw new NotFoundError('Draft not found');
}

const RELATION_WORDS: Record<string, WillRelationship> = {
  spouse: 'SPOUSE', wife: 'SPOUSE', husband: 'SPOUSE', son: 'SON', daughter: 'DAUGHTER', father: 'FATHER',
  mother: 'MOTHER', brother: 'BROTHER', sister: 'SISTER', grandson: 'GRANDSON', granddaughter: 'GRANDDAUGHTER',
  'son-in-law': 'SON_IN_LAW', 'daughter-in-law': 'DAUGHTER_IN_LAW',
};

/** Active members of the user's own families, for the People step's quick-pick. */
export async function listWillPeopleSuggestions(userId: string): Promise<WillSuggestionWire[]> {
  const members = await prisma.familyMember.findMany({
    where: {
      status: 'ACTIVE',
      userId: { not: userId },
      family: { members: { some: { userId, status: 'ACTIVE' } } },
    },
    select: { userId: true, relation: true, relatedToId: true, user: { select: { name: true, dob: true } } },
  });
  const seen = new Set<string>();
  const out: WillSuggestionWire[] = [];
  for (const m of members) {
    if (seen.has(m.userId)) continue;
    seen.add(m.userId);
    // A relation label is relative to `relatedToId`; only use it when that is this user.
    const relation = m.relatedToId === null || m.relatedToId === userId ? m.relation : null;
    out.push({
      userId: m.userId,
      name: m.user.name,
      relation,
      relationship: relation ? RELATION_WORDS[relation.trim().toLowerCase()] ?? null : null,
      dob: m.user.dob ? m.user.dob.toISOString().slice(0, 10) : null,
    });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name, 'en'));
}
