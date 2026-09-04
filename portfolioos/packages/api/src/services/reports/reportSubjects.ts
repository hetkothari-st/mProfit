/**
 * Who a report is *about*.
 *
 * Every download handler used to hardcode `req.user!.id`, so a report was
 * always about the signed-in user and never about anyone else — including
 * when the caller was sitting in a family view looking at the household.
 * This module is the one place that answers "whose rows go in this file?".
 *
 * Three answers, chosen by the `subject` query parameter:
 *
 *   absent | 'self'   → the caller alone. The historical behaviour, and still
 *                       the default, so an un-updated caller cannot silently
 *                       start emitting someone else's data.
 *   '<userId>'        → one named member of the family in view.
 *   'family'          → every member the caller may read, one section each.
 *
 * AUTHORISATION IS NOT OPTIONAL HERE. The subject arrives from the query
 * string, so anyone can ask for anyone; the answer is checked against the
 * caller's `EffectiveScope` and refused otherwise. This is the same rule the
 * family member-detail endpoint follows, and for the same reason: one place
 * decides who may be seen, because two places drift.
 */

import type { Request } from 'express';
import { AssetClass } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { runAsUser } from '../../lib/requestContext.js';
import { BadRequestError, ForbiddenError } from '../../lib/errors.js';
import { parseFamilyId } from '../../lib/familyHeader.js';
import {
  getEffectiveScope,
  NON_AC_CATEGORIES,
  type EffectiveScope,
} from '../familyScope.service.js';
import type { MprofitLayout, ReportSection } from '../reportBuilder/mprofitStyle.js';

export interface ReportSubject {
  userId: string;
  /** Display name for the section banner and the layout's `member` field. */
  label: string;
}

export interface ResolvedSubjects {
  subjects: ReportSubject[];
  /** Household name when the report spans a family; undefined for one person. */
  familyLabel?: string;
  /** True when the caller asked for the whole household. */
  isFamily: boolean;
}

/** `?subject=` — 'self' (default), 'family', or a member's userId. */
export async function resolveReportSubjects(req: Request): Promise<ResolvedSubjects> {
  const callerId = req.user!.id;
  const raw = (req.query.subject as string | undefined)?.trim();
  const familyId = parseFamilyId(req);

  // Default and explicit self both mean "just me", and neither needs a family
  // context. Keeping this branch first means a caller with no family at all
  // never pays for a scope resolution.
  if (!raw || raw === 'self') {
    return { subjects: [await selfSubject(callerId)], isFamily: false };
  }

  if (!familyId) {
    throw new BadRequestError(
      'A family must be selected before a report can be run for another member or for the household.',
    );
  }

  // Throws Forbidden if the caller has no ACTIVE membership on this family,
  // so a forged X-Viewing-As-Family gets nothing.
  const scope = await getEffectiveScope(callerId, { familyId });
  const readable = new Set(scope.readableUserIds);

  // Asking for yourself by id is asking for yourself. Caps never apply to a
  // member's own data, so this must not fall through to the check below.
  if (raw === callerId) {
    return { subjects: [await selfSubject(callerId)], isFamily: false };
  }

  assertMayReportOnOthers(scope);

  if (raw === 'family') {
    const subjects = await labelledSubjects(scope.readableUserIds);
    const family = await prisma.family.findUnique({
      where: { id: familyId },
      select: { name: true },
    });
    return {
      subjects,
      familyLabel: family?.name ?? 'Household',
      isFamily: true,
    };
  }

  if (!readable.has(raw)) {
    // Deliberately the same message whether the id is a stranger, a revoked
    // member, or gibberish — a distinct "no such user" would confirm which
    // ids exist.
    throw new ForbiddenError('That member is not part of a family you can see.');
  }

  return { subjects: await labelledSubjects([raw]), isFamily: false };
}

/**
 * Refuse to build a report about someone else when the caller's view of this
 * family is capped.
 *
 * The dashboard applies `allowedAssetClasses` / `allowedCategories` to every
 * figure it renders. The report builders do not — they take a userId and emit
 * that person's whole position, because until now the only userId they could
 * ever be given was the caller's own. Handing a capped member another
 * member's builder output would therefore print, in a downloadable file, the
 * very rows their screen is designed to withhold. A PDF is worse than a screen
 * for this: it leaves the session and cannot be un-shared.
 *
 * So the check fails closed. It is not a heuristic about report contents: a
 * grant that covers every asset class and every category filters nothing, and
 * such a member is let through. Anything narrower is refused outright rather
 * than served in a partially-filtered form nobody has verified.
 *
 * Lifting this properly means threading the caps into the builders and
 * teaching each one which of its columns are subject to them. Until that
 * exists, "you may not download it" is the honest answer, and it costs a
 * capped member nothing they could already see.
 */
function assertMayReportOnOthers(scope: EffectiveScope): void {
  const acCapped =
    scope.allowedAssetClasses !== null &&
    !Object.values(AssetClass).every((c) => scope.allowedAssetClasses!.includes(c));
  const catCapped =
    scope.allowedCategories !== null &&
    !NON_AC_CATEGORIES.every((c) => scope.allowedCategories!.includes(c));

  if (acCapped || catCapped) {
    throw new ForbiddenError(
      'Your view of this family is limited to certain categories, and reports cannot yet be produced in a limited form. ' +
        'You can download your own reports; ask a family owner for anything covering other members.',
    );
  }
}

async function selfSubject(callerId: string): Promise<ReportSubject> {
  const [subject] = await labelledSubjects([callerId]);
  return subject!;
}

/** Names for the section banners. Falls back to email, then to the raw id. */
async function labelledSubjects(userIds: string[]): Promise<ReportSubject[]> {
  if (userIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return userIds
    .map((userId) => {
      const u = byId.get(userId);
      return { userId, label: u?.name || u?.email || userId };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ─── Building one layout across many people ──────────────────────────

/**
 * Run `build` once per subject and fold the results into a single layout.
 *
 * Each member's rows are built under `runAsUser(member)` so RLS sees the
 * owner of the data rather than the caller. The caller's right to that data
 * was already settled by `resolveReportSubjects`; this is how the rows are
 * actually reachable, not a second authorisation decision.
 *
 * Runs sequentially. A household report is a handful of members and each
 * build is a heavy multi-query aggregation — firing them concurrently would
 * multiply peak connection use for no wall-clock that a user downloading a
 * PDF will notice.
 */
export async function buildLayoutForSubjects(
  resolved: ResolvedSubjects,
  build: (userId: string) => Promise<MprofitLayout>,
): Promise<MprofitLayout> {
  const { subjects, familyLabel } = resolved;

  if (subjects.length === 0) {
    throw new BadRequestError('No members to report on.');
  }

  if (subjects.length === 1) {
    const only = subjects[0]!;
    const layout = await runAsUser(only.userId, () => build(only.userId));
    return { ...layout, member: only.label, ...(familyLabel ? { family: familyLabel } : {}) };
  }

  const built: Array<{ subject: ReportSubject; layout: MprofitLayout }> = [];
  for (const subject of subjects) {
    const layout = await runAsUser(subject.userId, () => build(subject.userId));
    built.push({ subject, layout });
  }

  const first = built[0]!.layout;
  const sections: ReportSection[] = [];

  for (const { subject, layout } of built) {
    // A member with nothing to report still gets a banner. Silently dropping
    // them would make an empty household report indistinguishable from one
    // where those members were never included.
    if (layout.sections.length === 0) {
      sections.push({ banner: subject.label, groups: [] });
      continue;
    }
    layout.sections.forEach((section, i) => {
      sections.push({
        ...section,
        // The member's name leads; the builder's own banner is kept after it
        // so "Het · SHARE INVESTMENT (EQUITY) A/C" still says which account
        // block this is.
        banner:
          i === 0 || section.banner
            ? [subject.label, section.banner].filter(Boolean).join(' · ')
            : subject.label,
      });
    });

    // The member's own grand total becomes their closing subtotal, so a
    // per-person figure survives the merge.
    if (layout.grandTotal) {
      sections.push({
        groups: [{ rows: [], subtotal: { ...layout.grandTotal, label: `${subject.label} — total` } }],
      });
    }
  }

  return {
    ...first,
    family: familyLabel ?? first.family,
    member: undefined,
    // Deliberately no combined grand total. Summing the members' totals would
    // be right for money columns and wrong for every percentage, ratio and
    // average in the same row, and `ColumnDef` carries no additivity flag to
    // tell them apart. A per-member total that is correct beats a household
    // total that is quietly not.
    grandTotal: undefined,
    meta: [
      ...(first.meta ?? []),
      { label: 'Members', value: String(subjects.length) },
    ],
    sections,
    filenameStem: `${first.filenameStem}-household`,
  };
}
