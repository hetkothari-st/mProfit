/**
 * Critical illness cover — a lump sum paid when the insured is diagnosed with
 * one of the illnesses the policy lists. It comes as a rider on life and
 * accident policies or as part of (or alongside) health cover; motor, home and
 * travel policies don't carry it.
 */
export const CRITICAL_ILLNESS_POLICY_TYPES: ReadonlySet<string> = new Set([
  'TERM',
  'WHOLE_LIFE',
  'ULIP',
  'ENDOWMENT',
  'HEALTH',
  'PERSONAL_ACCIDENT',
]);

export function canHaveCriticalIllness(type: string): boolean {
  return CRITICAL_ILLNESS_POLICY_TYPES.has(type);
}
