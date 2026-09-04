import { EyeOff, Lock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NON_AC_CATEGORY_LABEL } from '@/lib/assetClasses';
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

/**
 * ─── One member, seen through a partial grant ───────────────────────────
 *
 * The three markers above answer "which PEOPLE are missing from this total".
 * On a single member's page that question is already settled — the person is
 * right there — and the honest question becomes "which parts OF THEM am I not
 * being shown". `FamilyMemberDetail` answers it with two fields:
 * `assetClassesRestricted` (the holdings and allocation are a filtered slice)
 * and `hiddenCategories` (whole categories the grant withholds).
 *
 * These live here, beside `PartialDataNotice`, and wear the same amber so the
 * two read as one idea at two scales. What must never happen is the third
 * option: rendering the filtered figures bare, or an empty section, and
 * letting a smaller number pass for the whole of someone's finances.
 */

/**
 * "Loans", "Loans and insurance policies", "Loans, credit cards and goals".
 *
 * Sentence case: the first label keeps its capital because it opens the
 * sentence, the rest are lowercased so the list doesn't read as a row of
 * proper nouns.
 */
function categoryList(categories: string[]): string {
  const labels = categories.map((c) => NON_AC_CATEGORY_LABEL[c] ?? c);
  if (labels.length === 0) return '';
  const [first, ...rest] = labels as [string, ...string[]];
  if (rest.length === 0) return first;
  const tail = rest.map((l) => l.toLowerCase());
  const last = tail.pop()!;
  return tail.length > 0 ? `${first}, ${tail.join(', ')} and ${last}` : `${first} and ${last}`;
}

/**
 * The banner for a member page: says, in plain words, which parts of this
 * person's finances the caller's grant is withholding.
 *
 * Renders nothing when the grant withholds nothing — an unrestricted view
 * should not carry a permissions disclaimer.
 */
export function ScopeRestrictedNotice({
  assetClassesRestricted,
  hiddenCategories,
  what = 'The figures below',
  className,
}: {
  /** `FamilyMemberDetail.assetClassesRestricted`. */
  assetClassesRestricted: boolean;
  /** `FamilyMemberDetail.hiddenCategories` — raw category tokens. */
  hiddenCategories: string[];
  /** What the asset-class cap applies to, e.g. "The net worth above". */
  what?: string;
  className?: string;
}) {
  const hidden = hiddenCategories.filter(Boolean);
  if (!assetClassesRestricted && hidden.length === 0) return null;
  const many = hidden.length > 1;

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200',
        className,
      )}
    >
      <EyeOff className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
      <div className="space-y-1.5">
        <p>
          <strong className="font-medium">
            You are seeing part of this member&apos;s finances, not all of them.
          </strong>
        </p>
        {assetClassesRestricted && (
          <p>
            {what} cover only the asset classes shared with you. Their net worth here is
            therefore partial — a floor, not their total.
          </p>
        )}
        {hidden.length > 0 && (
          <p>
            {categoryList(hidden)} {many ? 'are' : 'is'} not shared with you.{' '}
            {many ? 'Those sections are' : 'That section is'} blank because you may not see{' '}
            {many ? 'them' : 'it'} — not because {many ? 'they hold' : 'it holds'} nothing.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The stand-in for a section the caller may not see at all.
 *
 * Deliberately NOT the neutral "nothing here yet" empty state: a member whose
 * INSURANCE category is withheld has an unknown amount of cover, and a card
 * reading "No policies" would be a factual claim we have no basis for. Same
 * shape as the empty states it replaces, different words and a lock.
 */
export function NotSharedPanel({
  title,
  detail,
  className,
}: {
  title: string;
  detail: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid place-items-center rounded-md border border-dashed border-amber-400/50 bg-amber-50/40 px-4 py-8 text-center dark:bg-amber-950/20',
        className,
      )}
    >
      <span className="max-w-sm">
        <Lock
          className="mx-auto mb-2 h-5 w-5 text-amber-600 dark:text-amber-400"
          strokeWidth={1.6}
        />
        <span className="block text-[13.5px] font-medium text-amber-800 dark:text-amber-200">
          {title}
        </span>
        <span className="mt-1 block text-[12.5px] leading-relaxed text-muted-foreground">
          {detail}
        </span>
      </span>
    </div>
  );
}
