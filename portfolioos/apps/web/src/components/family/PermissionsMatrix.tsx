import { useMemo } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { NON_AC_CATEGORIES, type NonAcCategory } from '@/api/family/families.api';
import {
  ALL_ASSET_CLASSES,
  ASSET_CLASS_LABEL,
  NON_AC_CATEGORY_LABEL,
} from '@/lib/assetClasses';

/**
 * What a contributor or viewer may see of the OTHER members' data in the
 * family view — shared between the invite and edit-member forms.
 *
 * These lists are allow-lists, and the server treats an EMPTY list as
 * "nothing" (familyScope.service `getEffectiveScope`: only an OWNER is
 * unrestricted). The copy here used to say "empty = no restriction", which was
 * the opposite of what the server did. Every line below states the server's
 * rule; the invite form preselects everything so the default gives the full
 * view people expect.
 */

export function PermissionsMatrix({
  visibleAssetClasses,
  setVisibleAssetClasses,
  visibleCategories,
  setVisibleCategories,
  disabled,
}: {
  visibleAssetClasses: string[];
  setVisibleAssetClasses: (v: string[]) => void;
  visibleCategories: NonAcCategory[];
  setVisibleCategories: (v: NonAcCategory[]) => void;
  disabled: boolean;
}) {
  const acAllOff = visibleAssetClasses.length === 0;
  const catAllOff = visibleCategories.length === 0;

  const sortedClasses = useMemo(() => [...ALL_ASSET_CLASSES].sort(), []);

  return (
    <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
      <p className="text-[11px] text-muted-foreground mb-3 flex items-start gap-1.5">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" strokeWidth={2} />
        Owners see everything. Contributors and viewers see the other members&apos; data only
        for what is ticked here — anything left unticked stays hidden from them.
      </p>

      {acAllOff && catAllOff && !disabled && (
        <p
          role="alert"
          className="mb-3 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 text-[11.5px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
        >
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" strokeWidth={2} />
          Nothing is ticked, so they will see none of the other members&apos; data. Use
          &ldquo;All&rdquo; to give them the full family view.
        </p>
      )}

      {/* Asset classes */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <Label>
            Asset classes ({visibleAssetClasses.length}/{ALL_ASSET_CLASSES.length})
          </Label>
          <AllNone
            what="asset classes"
            onAll={() => setVisibleAssetClasses([...ALL_ASSET_CLASSES])}
            onNone={() => setVisibleAssetClasses([])}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 max-h-56 overflow-y-auto border border-border rounded p-2">
          {sortedClasses.map((ac) => (
            <label
              key={ac}
              className="flex items-center gap-1.5 text-xs cursor-pointer hover:text-foreground"
            >
              <input
                type="checkbox"
                checked={visibleAssetClasses.includes(ac)}
                onChange={(e) =>
                  setVisibleAssetClasses(
                    e.target.checked
                      ? [...visibleAssetClasses, ac]
                      : visibleAssetClasses.filter((x) => x !== ac),
                  )
                }
              />
              <span className="truncate">{ASSET_CLASS_LABEL[ac] ?? ac}</span>
            </label>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {acAllOff
            ? 'None ticked: they see none of the other members’ holdings.'
            : 'They see the other members’ holdings in the ticked classes only.'}
        </p>
      </div>

      {/* Categories */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label>
            Non-portfolio categories ({visibleCategories.length}/
            {NON_AC_CATEGORIES.length})
          </Label>
          <AllNone
            what="categories"
            onAll={() => setVisibleCategories([...NON_AC_CATEGORIES] as NonAcCategory[])}
            onNone={() => setVisibleCategories([])}
          />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 border border-border rounded p-2">
          {NON_AC_CATEGORIES.map((c) => (
            <label
              key={c}
              className="flex items-center gap-1.5 text-xs cursor-pointer hover:text-foreground"
            >
              <input
                type="checkbox"
                checked={visibleCategories.includes(c)}
                onChange={(e) =>
                  setVisibleCategories(
                    e.target.checked
                      ? [...visibleCategories, c]
                      : visibleCategories.filter((x) => x !== c),
                  )
                }
              />
              <span className="truncate">{NON_AC_CATEGORY_LABEL[c] ?? c}</span>
            </label>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {catAllOff
            ? 'None ticked: they see none of the other members’ vehicles, insurance, loans, etc.'
            : 'They see the other members’ items in the ticked categories only.'}
        </p>
      </div>
    </div>
  );
}

function AllNone({
  what,
  onAll,
  onNone,
}: {
  what: string;
  onAll: () => void;
  onNone: () => void;
}) {
  return (
    <div className="flex gap-2 text-[11px]">
      <button
        type="button"
        onClick={onAll}
        aria-label={`Tick all ${what}`}
        className="text-accent hover:underline"
      >
        All
      </button>
      <span className="text-muted-foreground" aria-hidden>
        /
      </span>
      <button
        type="button"
        onClick={onNone}
        aria-label={`Untick all ${what}`}
        className="text-accent hover:underline"
      >
        None
      </button>
    </div>
  );
}
