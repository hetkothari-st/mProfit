/**
 * Which family the Family page shows, carried in the URL as `?family=<id>`.
 *
 * Every sidebar row used to link to bare `/family`, and the page always picked
 * the first family — so in a multi-family account every row opened the same
 * one. The id now rides in the query string; bare `/family` (or an id the user
 * is no longer in) still falls back to the first family.
 */
export const FAMILY_QUERY_PARAM = 'family';

export function familyHref(familyId: string): string {
  return `/family?${FAMILY_QUERY_PARAM}=${encodeURIComponent(familyId)}`;
}

export function pickFamilyId(
  families: ReadonlyArray<{ id: string }>,
  requested: string | null,
): string | null {
  if (requested && families.some((f) => f.id === requested)) return requested;
  return families[0]?.id ?? null;
}
