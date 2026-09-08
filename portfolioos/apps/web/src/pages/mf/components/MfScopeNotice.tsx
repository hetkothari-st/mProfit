import type { MfAnalysisScope } from '@portfolioos/shared';
import { ASSET_CLASS_LABEL, NON_AC_CATEGORY_LABEL } from '@/lib/assetClasses';
import { RestrictedChip, ScopeRestrictedNotice } from '@/pages/family/widgets/RestrictedNotice';

/**
 * `MfAnalysisScope` → the household-visibility vocabulary that already exists.
 *
 * CONTEXT.md §6 is explicit that the family layer has ONE dialect for "this
 * number is partial" and that a second one must not be invented, so nothing
 * here draws its own banner: `ScopeRestrictedNotice` and `RestrictedChip` come
 * straight from `pages/family/widgets/RestrictedNotice.tsx` and keep their
 * amber, their wording and their tooltip.
 *
 * Two adaptations were needed, and both are about which question the marker
 * answers rather than about how it looks.
 *
 * **1. `PartialDataNotice` and `PartialSuffix` are deliberately NOT used.**
 * Both are parameterised by `hiddenCount` and their copy is about PEOPLE —
 * "3 members' data is not shared with you". `MfAnalysisScope` does not carry a
 * hidden-member count and cannot: `memberCount` is the number of members that
 * ARE readable, and the service's `buildScopeHonesty` derives `partial` from
 * hidden asset CLASSES, not hidden people. Passing `memberCount` into
 * `hiddenCount` would render a confident sentence about a number that means the
 * opposite of what the sentence claims. `ScopeRestrictedNotice` — which asks
 * "which parts of this view am I not being shown" — is the marker that actually
 * matches, and `RestrictedChip` is the member-agnostic inline form.
 *
 * **2. `NET_WORTH` is pulled out of `hiddenCategories` and given its own
 * sentence.** The service appends that token whenever ANY asset-class cap
 * exists, because a capped view is missing something from the denominator
 * behind `weightInNetWorth` and `effectiveWeightOfNetWorthPct` even when every
 * MF class is visible. It is not a section of this page that has been withheld,
 * so `ScopeRestrictedNotice`'s "that section is blank because you may not see
 * it" copy would be wrong about it. What is true is narrower and worth saying
 * exactly: those two columns are share-of-*what-we-can-see*, so each is an
 * OVER-statement, and every rupee total on the page is a floor.
 */

/** `NET_WORTH`, appended by the service when any asset-class cap is in force. */
const NET_WORTH_TOKEN = 'NET_WORTH';

/**
 * Token → human label. `hiddenCategories` mixes `AssetClass` members
 * (`MUTUAL_FUND`, `ETF`) with the non-asset-class tokens the family layer uses,
 * so both maps are consulted before falling back to the raw token — a token we
 * cannot label is still shown, because dropping it would under-state what is
 * hidden, which is the one direction this page may not err in.
 */
function labelFor(token: string): string {
  return ASSET_CLASS_LABEL[token as keyof typeof ASSET_CLASS_LABEL] ?? NON_AC_CATEGORY_LABEL[token] ?? token;
}

export function MfScopeNotice({ scope }: { scope: MfAnalysisScope }) {
  if (!scope.partial) return null;

  const hidden = scope.hiddenCategories.filter((c) => c !== NET_WORTH_TOKEN);
  const netWorthCapped = scope.hiddenCategories.includes(NET_WORTH_TOKEN);

  return (
    <div data-testid="mf-scope-notice" className="space-y-2">
      <ScopeRestrictedNotice
        // `partial` is true for this component to have rendered at all, and it
        // is true precisely because an asset-class cap is in force.
        assetClassesRestricted
        // Pre-labelled: the notice re-maps through `NON_AC_CATEGORY_LABEL` and
        // falls back to whatever string it was given, so passing labels rather
        // than tokens is what makes "Mutual Fund" appear instead of
        // "MUTUAL_FUND".
        hiddenCategories={hidden.map(labelFor)}
        what="Every total, weight and tax figure below"
      />
      {netWorthCapped && (
        <p className="rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          The <strong className="font-medium">share of net worth</strong> columns are computed
          against the net worth you are permitted to see, not the whole of it. Each is therefore
          an over-statement, and the rupee totals are a floor — treat both as bounds rather than
          as measurements.
        </p>
      )}
      {scope.memberCount !== null && (
        <p className="text-[11.5px] text-muted-foreground">
          Aggregated across {scope.memberCount}{' '}
          {scope.memberCount === 1 ? 'household member' : 'household members'} you may read. Members
          outside your grant contribute nothing to the figures above and are not counted here.
        </p>
      )}
    </div>
  );
}

/**
 * The inline marker for one headline figure that was summed over a partial set.
 * Renders nothing on an unrestricted view — an unrestricted total should not
 * carry a permissions disclaimer.
 */
export function MfPartialChip({ scope }: { scope: MfAnalysisScope }) {
  if (!scope.partial) return null;
  return <RestrictedChip className="ml-2 align-middle" />;
}
