import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { familiesApi, NON_AC_CATEGORIES } from '@/api/families.api';
import { ALL_ASSET_CLASSES } from '@/lib/assetClasses';
import { useAuthStore } from '@/stores/auth.store';
import { useFamilyScopeStore } from '@/stores/familyScope.store';

/**
 * Who a downloaded report should be about.
 *
 * Reports used to be about the signed-in user and nothing else — there was no
 * way to pull a spouse's capital gains or a household-wide holdings statement,
 * even from inside a family view. This hook supplies the choice, and the query
 * parameters that carry it to the server.
 *
 * `'self'` stays the default everywhere. A report that silently changed whose
 * money it described the moment you switched family view would be a bad
 * surprise on a document people file with a CA.
 */

/** `'self'`, `'family'`, or a family member's userId. */
export type ReportSubject = string;

export interface SubjectOption {
  value: ReportSubject;
  label: string;
}

export interface UseReportSubject {
  subject: ReportSubject;
  setSubject: (s: ReportSubject) => void;
  options: SubjectOption[];
  /**
   * Whether there is any choice to make. False for a solo user, in which case
   * callers should render no picker at all rather than a one-option select.
   */
  enabled: boolean;
  /**
   * Query parameters to merge into a download URL. Carries `familyId`
   * explicitly because these downloads use raw `fetch`, which does not pass
   * through the axios interceptor that would otherwise attach the
   * `X-Viewing-As-Family` header.
   */
  params: Record<string, string>;
  /** Slug for the saved file, so two members' downloads don't collide. */
  filenameSuffix: string;
}

export function useReportSubject(): UseReportSubject {
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const familyId = useFamilyScopeStore((s) => s.viewingAsFamilyId);
  const [subject, setSubject] = useState<ReportSubject>('self');

  // Same key as the sidebar tree and FamilyPage, so one cache entry serves all
  // three and a membership change is reflected everywhere at once.
  const membersQuery = useQuery({
    queryKey: ['families', familyId, 'members'],
    queryFn: () => familiesApi.members(familyId!),
    enabled: !!familyId,
    staleTime: 60_000,
  });

  const members = useMemo(
    () => (membersQuery.data ?? []).filter((m) => m.status === 'ACTIVE'),
    [membersQuery.data],
  );

  /**
   * A capped member cannot download reports about anyone but themselves — the
   * builders emit a whole position and cannot yet honour
   * `visibleAssetClasses` / `visibleCategories`, so the server refuses rather
   * than hand out rows the dashboard withholds.
   *
   * Mirrored here only so the picker doesn't offer a choice that is going to
   * be refused. The server is the authority; this is courtesy, and it is
   * computed from the same two fields rather than from the role, so a
   * fully-granted CONTRIBUTOR keeps the options an OWNER has.
   */
  const ownRow = useMemo(
    () => members.find((m) => m.userId === currentUserId) ?? null,
    [members, currentUserId],
  );

  const capped = useMemo(() => {
    if (!ownRow || ownRow.role === 'OWNER') return false;
    const everyAssetClass = ALL_ASSET_CLASSES.every((c) =>
      ownRow.visibleAssetClasses.includes(c),
    );
    const everyCategory = (NON_AC_CATEGORIES as readonly string[]).every((c) =>
      (ownRow.visibleCategories as string[]).includes(c),
    );
    return !(everyAssetClass && everyCategory);
  }, [ownRow]);

  const options = useMemo<SubjectOption[]>(() => {
    const base: SubjectOption[] = [{ value: 'self', label: 'Me' }];
    if (!familyId || members.length === 0 || capped) return base;

    return [
      ...base,
      { value: 'family', label: 'Whole family (one section per member)' },
      ...members
        .filter((m) => m.userId !== currentUserId)
        .map((m) => ({ value: m.userId, label: m.name || m.email }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [familyId, members, currentUserId, capped]);

  // One option is not a choice. A solo user should not see a control that can
  // only ever say "Me".
  const enabled = options.length > 1;

  // If the caller leaves a family while a member is selected, the stored
  // subject would still be sent and refused by the server. Fall back to self
  // whenever the selection is no longer on offer.
  const effective: ReportSubject = options.some((o) => o.value === subject) ? subject : 'self';

  const params = useMemo(() => {
    if (effective === 'self') return {};
    return { subject: effective, ...(familyId ? { familyId } : {}) };
  }, [effective, familyId]);

  const filenameSuffix = useMemo(() => {
    if (effective === 'self') return '';
    if (effective === 'family') return '-family';
    const label = options.find((o) => o.value === effective)?.label ?? 'member';
    return `-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  }, [effective, options]);

  return { subject: effective, setSubject, options, enabled, params, filenameSuffix };
}
