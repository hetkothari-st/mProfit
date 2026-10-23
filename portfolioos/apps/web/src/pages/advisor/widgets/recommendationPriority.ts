/**
 * Lower is more urgent. The thresholds follow the engine's priority bands
 * (CATEGORY_BASE_PRIORITY in the API's advisor constants):
 *   1-10  deadline-driven — a window closes and the chance is gone → Do first
 *   11-30 material — real money mis-positioned right now          → Soon
 *   31+   optimisation — worth doing, no clock on it               → When convenient
 */
export function priorityTone(priority: number): { label: string; className: string } {
  if (priority <= 10) return { label: 'Do first', className: 'border-negative/40 text-negative' };
  if (priority <= 30) return { label: 'Soon', className: 'border-orange-500/40 text-orange-600' };
  return { label: 'When convenient', className: 'border-border text-muted-foreground' };
}
