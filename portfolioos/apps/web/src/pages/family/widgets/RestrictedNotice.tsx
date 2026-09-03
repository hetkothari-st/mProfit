import { EyeOff, Lock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { pluralMembers } from './money';

/**
 * Shared vocabulary for "this number is partial".
 *
 * The family permission model lets an OWNER hide whole members, or slices of
 * a member's holdings, from a CONTRIBUTOR/VIEWER. The server tells us so via
 * the `hiddenMemberCount` every dashboard payload carries, the `visibility`
 * block, and a per-member `restricted` flag. If the UI silently renders the
 * smaller number, a viewer reads a household total as complete when it isn't
 * — which is worse than showing nothing. So every partial figure on the
 * Overview tab carries one of these three markers.
 *
 * What is hidden is always MEMBERS: the caps are a grant about people, and a
 * withheld member contributes an unknown amount of everything. Counting
 * anything else ("3 goals hidden") would be inventing a number the server
 * never sent.
 */

/**
 * The banner that sits directly above any total computed from a partial set.
 * Deliberately amber rather than muted grey — it changes the meaning of every
 * number underneath it, so it is not decoration.
 */
export function PartialDataNotice({
  hiddenCount,
  what,
  className,
}: {
  /** `hiddenMemberCount` from the payload this notice sits above. */
  hiddenCount: number;
  /** What the hidden rows are missing from, e.g. "the household total below". */
  what: string;
  className?: string;
}) {
  if (hiddenCount <= 0) return null;
  const plural = hiddenCount !== 1;
  const label = `${hiddenCount} ${plural ? "members'" : "member's"} data is not shared with you.`;
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200',
        className,
      )}
    >
      <EyeOff className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
      <span>
        <strong className="font-medium">{label}</strong> {what} excludes{' '}
        {plural ? 'them' : 'it'}, so treat it as a floor rather than the whole
        picture.
      </span>
    </div>
  );
}

/**
 * Inline chip for a single row whose own figures are filtered. Distinct from
 * the banner above: the member IS counted, but their number is incomplete.
 */
export function RestrictedChip({ className }: { className?: string }) {
  return (
    <span
      title="Some of this member's asset classes or categories are not shared with you — their figures are a partial view."
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-400/10 px-1.5 py-px text-[9.5px] font-medium uppercase tracking-kerned text-amber-700 dark:text-amber-300',
        className,
      )}
    >
      <Lock className="h-2.5 w-2.5" strokeWidth={2.2} />
      Partial
    </span>
  );
}

/**
 * Suffix appended to a headline number that was summed over a partial set.
 * Small, but it stops "₹4.2 Cr" from ever reading as the household's worth.
 */
export function PartialSuffix({ hiddenCount }: { hiddenCount: number }) {
  if (hiddenCount <= 0) return null;
  return (
    <span className="ml-2 align-middle text-[11px] font-normal uppercase tracking-kerned text-amber-600 dark:text-amber-400">
      Partial · {pluralMembers(hiddenCount)} hidden
    </span>
  );
}
