import {
  NON_AC_CATEGORIES,
  type FamilyMemberRow,
  type NonAcCategory,
} from '@/api/family/families.api';
import { ALL_ASSET_CLASSES } from '@/lib/assetClasses';

/**
 * True when this member, as the server enforces it, sees none of the other
 * members' data in the family view.
 *
 * The server's rule (familyScope.service `getEffectiveScope`): OWNERs are
 * unrestricted; for everyone else `visibleAssetClasses` / `visibleCategories`
 * are allow-lists and an EMPTY list allows nothing. Members invited before the
 * invite form preselected everything were saved with both lists empty, so the
 * owner needs to be told rather than left to assume they see it all.
 *
 * Managed members have no login of their own, so what they "see" is moot.
 */
export function seesNoOtherMembersData(
  m: Pick<FamilyMemberRow, 'role' | 'managed' | 'status' | 'visibleAssetClasses' | 'visibleCategories'>,
): boolean {
  return (
    m.role !== 'OWNER' &&
    !m.managed &&
    m.status === 'ACTIVE' &&
    m.visibleAssetClasses.length === 0 &&
    m.visibleCategories.length === 0
  );
}

/** Everything ticked — the invite form's starting point. */
export function allVisibility(): {
  visibleAssetClasses: string[];
  visibleCategories: NonAcCategory[];
} {
  return {
    visibleAssetClasses: [...ALL_ASSET_CLASSES],
    visibleCategories: [...NON_AC_CATEGORIES] as NonAcCategory[],
  };
}
