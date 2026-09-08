/**
 * Admin CRUD for `MfSchemeQualitativeFact` (`07-IMPLEMENTATION-PLAN.md` Task 6.2,
 * `01-DATA-FOUNDATION.md §2`, `03-SCORING.md §4`).
 *
 * This is the only hand-entered input in the whole analytics layer. Everything
 * else is derived from a feed. Two consequences shape every decision below.
 *
 * **A row here moves scores for every user.** `amcQualitativeScore`
 * (`mfScoring/mfScoreMath.ts`) deducts 0.5 from a 0–1 raw score per applicable
 * fact, and `amcQualitativeScore` carries weight 30 inside the `PEOPLE_PARENT`
 * pillar of `activeEquity`, `hybrid` and `fof`. `rules/people.amc-action.ts`
 * additionally raises a WARNING finding, which the verdict table in
 * `mfVerdict.ts` reads. A typo'd date or a double-submitted form is not a
 * cosmetic defect — it is a fund publicly marked down on evidence that does not
 * exist.
 *
 * **The table is reference data, not user data.** It has no RLS policy and is
 * absent from `USER_SCOPED_MODELS` on purpose (`mf-reference-not-user-scoped`
 * asserts it). `enteredBy` is a plain `String` and deliberately NOT a `User`
 * relation: an FK to `User` would make the table read as user-scoped to the
 * next person looking at the schema, and that is precisely how a shared table
 * ends up wrongly behind a policy that then returns zero rows to every job.
 * Provenance without ownership is the intent.
 *
 * Four protections follow from the first point, and each is enforced here
 * rather than left to the form:
 *
 *  1. `enteredBy` is taken from the authenticated session, never from the body.
 *     A provenance field a client can set is not provenance.
 *  2. `source` is mandatory and must be substantive. `01 §2` types it as
 *     "URL or note"; an empty string satisfies the column and defeats the
 *     purpose, so the length floor is enforced at the boundary.
 *  3. Creating a fact that duplicates an existing `(schemeCode, factType,
 *     validFrom)` is skipped, not inserted. Penalties are applied **per fact
 *     and not deduplicated by type** — that is a deliberate property of
 *     `amcQualitativeScore` (three separate SEBI orders really are worse than
 *     one) which makes an accidental double-submit double the penalty and, at
 *     two duplicates, zero the input outright.
 *  4. `schemeCode` and `factType` are immutable after creation. Editing either
 *     would silently move a penalty from one fund to another while keeping the
 *     original row's `createdAt` and `enteredBy` — a rewrite of history wearing
 *     the audit trail of the thing it replaced. Delete and re-create instead.
 *
 * Every mutation writes an `AuditLog` row (`CONTEXT.md §3.7`). This is the
 * first use of that table in the repo; it earns its place here because these
 * are the only writes in the layer that a human makes by hand and that change
 * what every other user is shown.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma, runInTransaction } from '../lib/prisma.js';
import { ok, created, noContent } from '../lib/response.js';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../lib/errors.js';

// ---------------------------------------------------------------------------
// The fact-type catalog
// ---------------------------------------------------------------------------

/**
 * What each `factType` actually does, so the form can say it rather than
 * present a free-text box over a scoring input.
 *
 * `factType` is a plain `String` in the schema and `amcQualitativeScore`
 * ignores types it does not recognise ("an unrelated fact type, not an error").
 * That tolerance is deliberate and this endpoint preserves it: an admin must be
 * able to record a fact today that the scorer only starts consuming next
 * quarter. So an unknown type is **accepted**, and every response row carries a
 * `scoringImpact` computed from this table — the UI's job is to make the
 * difference between "this marks the fund down" and "this is a note" impossible
 * to miss, not to prevent the second kind from being recorded.
 *
 * The penalties below are read FROM the doc, not from `mfScoreMath` — that
 * module keeps them private and exporting them to describe a form would make a
 * scoring constant part of an HTTP contract.
 */
const FACT_TYPE_CATALOG: ReadonlyArray<{
  factType: string;
  label: string;
  /** Plain-English consequence of adding this fact. Rendered in the form. */
  effect: string;
  scoringImpact: 'PENALISES_SCORE' | 'RAISES_FINDING_AND_PENALISES_SCORE' | 'RECORDED_ONLY';
}> = Object.freeze([
  Object.freeze({
    factType: 'AMC_REGULATORY_ACTION',
    label: 'Regulatory action against the AMC',
    effect:
      'Deducts 0.5 from amcQualitativeScore (0–1) for 3 years from validFrom, and raises an ' +
      'AMC_REGULATORY_ACTION warning finding on the fund. Two such facts inside the window take ' +
      'the input to 0 and drag the PEOPLE_PARENT pillar to its floor.',
    scoringImpact: 'RAISES_FINDING_AND_PENALISES_SCORE',
  }),
  Object.freeze({
    factType: 'AMC_FRONT_RUNNING',
    label: 'Front-running finding against the AMC',
    effect:
      'Deducts 0.5 from amcQualitativeScore for as long as the fact itself is in force — there is ' +
      'no ageing-out window, so validTo is the only thing that ends it. Set it when the matter closes.',
    scoringImpact: 'PENALISES_SCORE',
  }),
  Object.freeze({
    factType: 'STRATEGY_CAPACITY_CAP',
    label: 'Strategy capacity cap',
    effect: 'Recorded for context and shown on the fund page. No scorer or rule reads it today.',
    scoringImpact: 'RECORDED_ONLY',
  }),
  Object.freeze({
    factType: 'AUM_SHOCK',
    label: 'AUM shock',
    effect: 'Recorded for context and shown on the fund page. No scorer or rule reads it today.',
    scoringImpact: 'RECORDED_ONLY',
  }),
]);

const CATALOG_BY_TYPE = new Map(FACT_TYPE_CATALOG.map((c) => [c.factType, c]));

function scoringImpactOf(factType: string): string {
  return CATALOG_BY_TYPE.get(factType)?.scoringImpact ?? 'UNKNOWN_TYPE_RECORDED_ONLY';
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Screaming snake case. Matches every type the doc names and keeps a typo'd
 *  lowercase variant from becoming a second, silently-inert fact type. */
const FACT_TYPE_RE = /^[A-Z][A-Z0-9_]{2,63}$/;

/**
 * `01 §2` types `source` as "URL or note". Eight characters is not a quality
 * bar, it is a floor under "." and "x" — enough to stop a required field being
 * satisfied by nothing at all, low enough not to reject a bare order number.
 */
const MIN_SOURCE_LENGTH = 8;

/** Date-only. The column is a `DateTime` but every consumer compares it against
 *  a UTC-midnight `asOf`, so a time component would only ever be a source of
 *  off-by-one at the window boundary. Parsed to UTC midnight below. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Not a real date');

function toUtcMidnight(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** `value` is descriptive: nothing in the scorer or the rules reads inside it.
 *  Requiring an object rather than allowing a bare string keeps it extensible
 *  without a migration, and keeps a JSON `null` — which Prisma treats as a
 *  distinct DbNull/JsonNull pair — out of the column entirely. */
const factValue = z.record(z.unknown()).refine((v) => Object.keys(v).length > 0, {
  message: 'value must describe the fact — an empty object records nothing',
});

const createSchema = z
  .object({
    /** One or many. An AMC-level action is a fact about every scheme that AMC
     *  runs, but the table is keyed by scheme, so the fan-out has to happen
     *  somewhere; doing it server-side in one transaction beats N form
     *  submissions that can half-fail. */
    schemeCodes: z.array(z.string().trim().min(1)).min(1).max(500).optional(),
    /** Alternative to `schemeCodes`: apply to every ACTIVE scheme of this AMC.
     *  Resolved here so the set is the one the database actually holds at
     *  submit time rather than whatever the form had cached. */
    amcCode: z.string().trim().min(1).optional(),
    factType: z.string().trim().regex(FACT_TYPE_RE, 'factType must be SCREAMING_SNAKE_CASE'),
    value: factValue,
    validFrom: isoDate,
    validTo: isoDate.nullable().optional(),
    source: z.string().trim().min(MIN_SOURCE_LENGTH, 'source must be a URL or a substantive note'),
  })
  .refine((b) => (b.schemeCodes === undefined) !== (b.amcCode === undefined), {
    message: 'Provide exactly one of schemeCodes or amcCode',
  })
  .refine((b) => b.validTo == null || b.validTo >= b.validFrom, {
    message: 'validTo must not precede validFrom',
    path: ['validTo'],
  });

/** `schemeCode` and `factType` are absent by design — see the header, point 4. */
const updateSchema = z
  .object({
    value: factValue.optional(),
    validFrom: isoDate.optional(),
    validTo: isoDate.nullable().optional(),
    source: z.string().trim().min(MIN_SOURCE_LENGTH).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' });

const listSchema = z.object({
  schemeCode: z.string().trim().min(1).optional(),
  amcCode: z.string().trim().min(1).optional(),
  factType: z.string().trim().optional(),
  /** Default false: an expired fact still explains a score a user was shown
   *  last year, so it is retrievable — just not in the way by default. */
  includeExpired: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

interface QualitativeFactAdminRow {
  id: string;
  schemeCode: string;
  schemeName: string | null;
  amcName: string | null;
  factType: string;
  scoringImpact: string;
  value: unknown;
  validFrom: string;
  validTo: string | null;
  source: string;
  enteredBy: string;
  createdAt: string;
}

type FactRow = {
  id: string;
  schemeCode: string;
  factType: string;
  value: Prisma.JsonValue;
  validFrom: Date;
  validTo: Date | null;
  source: string;
  enteredBy: string;
  createdAt: Date;
};

function serialise(
  row: FactRow,
  meta: Map<string, { schemeName: string; amcName: string }>,
): QualitativeFactAdminRow {
  const m = meta.get(row.schemeCode);
  return {
    id: row.id,
    schemeCode: row.schemeCode,
    // Null rather than the code again when the scheme is unknown: a fact
    // recorded against a code with no `MfSchemeMeta` row is a real and
    // findable data-entry error, and echoing the code back would hide it.
    schemeName: m?.schemeName ?? null,
    amcName: m?.amcName ?? null,
    factType: row.factType,
    scoringImpact: scoringImpactOf(row.factType),
    value: row.value,
    validFrom: row.validFrom.toISOString().slice(0, 10),
    validTo: row.validTo === null ? null : row.validTo.toISOString().slice(0, 10),
    source: row.source,
    enteredBy: row.enteredBy,
    createdAt: row.createdAt.toISOString(),
  };
}

async function metaFor(schemeCodes: string[]): Promise<Map<string, { schemeName: string; amcName: string }>> {
  if (schemeCodes.length === 0) return new Map();
  const rows = await prisma.mfSchemeMeta.findMany({
    where: { schemeCode: { in: [...new Set(schemeCodes)] } },
    select: { schemeCode: true, schemeName: true, amcName: true },
  });
  return new Map(rows.map((r) => [r.schemeCode, { schemeName: r.schemeName, amcName: r.amcName }]));
}

/**
 * `CONTEXT.md §3.7`. Written on the same connection as the mutation when there
 * is one, so a rolled-back write cannot leave an audit row claiming it
 * happened. `AuditLog` is user-scoped and `userId` is the acting admin, so the
 * row is readable under that admin's own RLS context.
 */
async function audit(
  client: Pick<Prisma.TransactionClient, 'auditLog'>,
  req: Request,
  action: string,
  resource: string,
  metadata: Prisma.InputJsonValue,
): Promise<void> {
  await client.auditLog.create({
    data: {
      userId: req.user?.id ?? null,
      action,
      resource,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      metadata,
    },
  });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** GET /api/admin/mf-qualitative-facts/catalog — what each factType does. */
export async function getQualitativeFactCatalog(_req: Request, res: Response): Promise<void> {
  ok(res, { factTypes: FACT_TYPE_CATALOG });
}

/** GET /api/admin/mf-qualitative-facts — filtered list, newest first. */
export async function listQualitativeFacts(req: Request, res: Response): Promise<void> {
  const q = listSchema.parse(req.query);

  const where: Prisma.MfSchemeQualitativeFactWhereInput = {};
  if (q.schemeCode !== undefined) where.schemeCode = q.schemeCode;
  if (q.factType !== undefined) where.factType = q.factType;
  if (q.amcCode !== undefined) {
    // No relation between the two tables (see the header on why this stays a
    // bare `schemeCode` string), so the AMC filter is a two-step by design.
    const schemes = await prisma.mfSchemeMeta.findMany({
      where: { amcCode: q.amcCode },
      select: { schemeCode: true },
    });
    where.schemeCode = { in: schemes.map((s) => s.schemeCode) };
  }
  if (q.includeExpired !== 'true') {
    const today = new Date();
    where.OR = [{ validTo: null }, { validTo: { gte: today } }];
  }

  const rows = await prisma.mfSchemeQualitativeFact.findMany({
    where,
    orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
    take: q.limit ?? 200,
  });
  const meta = await metaFor(rows.map((r) => r.schemeCode));
  ok(res, { facts: rows.map((r) => serialise(r, meta)) });
}

/**
 * POST /api/admin/mf-qualitative-facts — create one fact against one or many
 * schemes.
 *
 * Returns what it actually did per scheme rather than a bare count: `created`,
 * `skippedDuplicate` (header point 3) and `unknownScheme` are three different
 * outcomes and collapsing them into "4 of 6 saved" makes the admin guess which.
 */
export async function createQualitativeFact(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const body = createSchema.parse(req.body);

  const requested =
    body.schemeCodes ??
    (
      await prisma.mfSchemeMeta.findMany({
        where: { amcCode: body.amcCode, status: 'ACTIVE' },
        select: { schemeCode: true },
      })
    ).map((s) => s.schemeCode);

  if (requested.length === 0) {
    throw new BadRequestError(
      body.amcCode === undefined
        ? 'No scheme codes supplied'
        : `No ACTIVE schemes found for amcCode "${body.amcCode}"`,
    );
  }

  const known = await prisma.mfSchemeMeta.findMany({
    where: { schemeCode: { in: [...new Set(requested)] } },
    select: { schemeCode: true },
  });
  const knownCodes = new Set(known.map((s) => s.schemeCode));
  const unknownScheme = [...new Set(requested)].filter((c) => !knownCodes.has(c));
  const targets = [...new Set(requested)].filter((c) => knownCodes.has(c));

  const validFrom = toUtcMidnight(body.validFrom);
  const validTo = body.validTo == null ? null : toUtcMidnight(body.validTo);

  // Existing rows on the same identity triple. Read before the transaction and
  // re-checked inside it is unnecessary here — there is no unique constraint to
  // race against, and two admins entering the same order at the same second is
  // not a failure mode worth a lock. The guard is against a double-submitted
  // form, which is serialised by the same session.
  const existing = await prisma.mfSchemeQualitativeFact.findMany({
    where: { schemeCode: { in: targets }, factType: body.factType, validFrom },
    select: { schemeCode: true },
  });
  const duplicateCodes = new Set(existing.map((e) => e.schemeCode));
  const toCreate = targets.filter((c) => !duplicateCodes.has(c));

  const createdRows = await runInTransaction(async (tx) => {
    const rows: FactRow[] = [];
    for (const schemeCode of toCreate) {
      rows.push(
        await tx.mfSchemeQualitativeFact.create({
          data: {
            schemeCode,
            factType: body.factType,
            value: body.value as Prisma.InputJsonValue,
            validFrom,
            validTo,
            source: body.source,
            // Never from the body. See header point 1.
            enteredBy: req.user!.id,
          },
        }),
      );
    }
    if (rows.length > 0) {
      await audit(tx, req, 'mf_qualitative_fact.create', `MfSchemeQualitativeFact:${body.factType}`, {
        factType: body.factType,
        schemeCodes: toCreate,
        validFrom: body.validFrom,
        validTo: body.validTo ?? null,
        source: body.source,
        scoringImpact: scoringImpactOf(body.factType),
      });
    }
    return rows;
  });

  const meta = await metaFor(createdRows.map((r) => r.schemeCode));
  created(res, {
    created: createdRows.map((r) => serialise(r, meta)),
    skippedDuplicate: [...duplicateCodes],
    unknownScheme,
    scoringImpact: scoringImpactOf(body.factType),
  });
}

/** PATCH /api/admin/mf-qualitative-facts/:id — correct a fact in place. */
export async function updateQualitativeFact(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const id = req.params.id;
  const body = updateSchema.parse(req.body);

  const before = await prisma.mfSchemeQualitativeFact.findUnique({ where: { id } });
  if (before === null) throw new NotFoundError('Qualitative fact not found');

  const validFrom = body.validFrom === undefined ? before.validFrom : toUtcMidnight(body.validFrom);
  const validTo =
    body.validTo === undefined ? before.validTo : body.validTo === null ? null : toUtcMidnight(body.validTo);
  if (validTo !== null && validTo < validFrom) {
    throw new BadRequestError('validTo must not precede validFrom');
  }

  const data: Prisma.MfSchemeQualitativeFactUpdateInput = { validFrom, validTo };
  if (body.value !== undefined) data.value = body.value as Prisma.InputJsonValue;
  if (body.source !== undefined) data.source = body.source;
  // `enteredBy` is deliberately reassigned to the editing admin: the field
  // answers "who is accountable for what this row says now", and the previous
  // holder is preserved in the AuditLog entry below rather than in the column.
  data.enteredBy = req.user.id;

  const updated = await runInTransaction(async (tx) => {
    const row = await tx.mfSchemeQualitativeFact.update({ where: { id }, data });
    await audit(tx, req, 'mf_qualitative_fact.update', `MfSchemeQualitativeFact:${id}`, {
      schemeCode: before.schemeCode,
      factType: before.factType,
      previousEnteredBy: before.enteredBy,
      before: {
        validFrom: before.validFrom.toISOString().slice(0, 10),
        validTo: before.validTo === null ? null : before.validTo.toISOString().slice(0, 10),
        source: before.source,
      },
      after: {
        validFrom: row.validFrom.toISOString().slice(0, 10),
        validTo: row.validTo === null ? null : row.validTo.toISOString().slice(0, 10),
        source: row.source,
      },
    });
    return row;
  });

  ok(res, serialise(updated, await metaFor([updated.schemeCode])));
}

/**
 * DELETE /api/admin/mf-qualitative-facts/:id — remove a fact entirely.
 *
 * A hard delete, not a soft one. `validTo` already expresses "this stopped
 * being true", and it is the right tool when the fact was real; delete is for
 * when the fact was **wrong** — an entry against the wrong scheme, a
 * mis-transcribed order — and a wrong fact left in the table keeps depressing a
 * score no matter what flag it carries. The AuditLog row is the record that it
 * existed.
 */
export async function deleteQualitativeFact(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const id = req.params.id;

  const before = await prisma.mfSchemeQualitativeFact.findUnique({ where: { id } });
  if (before === null) throw new NotFoundError('Qualitative fact not found');

  await runInTransaction(async (tx) => {
    await tx.mfSchemeQualitativeFact.delete({ where: { id } });
    await audit(tx, req, 'mf_qualitative_fact.delete', `MfSchemeQualitativeFact:${id}`, {
      schemeCode: before.schemeCode,
      factType: before.factType,
      validFrom: before.validFrom.toISOString().slice(0, 10),
      validTo: before.validTo === null ? null : before.validTo.toISOString().slice(0, 10),
      source: before.source,
      enteredBy: before.enteredBy,
    });
  });

  noContent(res);
}
