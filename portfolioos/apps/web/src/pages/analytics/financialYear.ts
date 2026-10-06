/**
 * The Indian financial year runs April to March, and every tax figure on this
 * page is scoped to one. Kept out of the widget file so the components file
 * exports only components (fast refresh) and so tests can use it directly.
 */

/** April–March year containing `d`, as "2026-27". */
export function currentFy(d = new Date()): string {
  const y = d.getUTCFullYear();
  const start = d.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
