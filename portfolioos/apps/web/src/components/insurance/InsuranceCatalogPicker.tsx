import { useMemo, useState } from 'react';
import { Search, ExternalLink, Sparkles, X, ShieldCheck, AlertTriangle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  INSURANCE_CATALOG,
  findCatalogProduct,
  type CatalogProduct,
} from '@/data/insuranceCatalog';

const TYPE_LABEL: Record<string, string> = {
  TERM: 'Term Life',
  WHOLE_LIFE: 'Whole Life',
  ULIP: 'ULIP',
  ENDOWMENT: 'Endowment',
  HEALTH: 'Health',
  MOTOR: 'Motor',
  HOME: 'Home',
  TRAVEL: 'Travel',
  PERSONAL_ACCIDENT: 'Personal Accident',
};

const TYPE_PILL_COLORS: Record<string, string> = {
  TERM: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  WHOLE_LIFE: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  ULIP: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
  ENDOWMENT: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  HEALTH: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  MOTOR: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  HOME: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  TRAVEL: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  PERSONAL_ACCIDENT: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
};

interface PickerProps {
  selectedId: string | null;
  onSelect: (product: CatalogProduct | null) => void;
}

/**
 * Searchable catalog picker. Combobox-style: text query filters the visible
 * list; clicking an entry triggers onSelect. Shows the picked product as a
 * compact pill with a clear button.
 */
export function InsuranceCatalogPicker({ selectedId, onSelect }: PickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = findCatalogProduct(selectedId);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return INSURANCE_CATALOG;
    return INSURANCE_CATALOG.filter(
      (p) =>
        p.insurer.toLowerCase().includes(q) ||
        p.planName.toLowerCase().includes(q) ||
        TYPE_LABEL[p.type]?.toLowerCase().includes(q),
    );
  }, [query]);

  if (selected) {
    return (
      <div className="rounded-lg border bg-accent/40 px-3 py-2 flex items-center gap-3">
        <Sparkles className="h-4 w-4 text-accent-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Picked from catalog</p>
          <p className="text-sm font-medium truncate">
            {selected.insurer} · {selected.planName}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => {
            onSelect(null);
            setQuery('');
          }}
          title="Clear catalog selection"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search 24+ Indian insurance products — LIC, HDFC Life, Star Health, Niva Bupa…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // delay so click on list registers
            setTimeout(() => setOpen(false), 150);
          }}
          className="pl-9"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 max-h-80 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md z-30">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-3 border-b last:border-0"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(p);
                setQuery('');
                setOpen(false);
              }}
            >
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                  TYPE_PILL_COLORS[p.type] ?? 'bg-muted text-muted-foreground'
                }`}
              >
                {TYPE_LABEL[p.type] ?? p.type}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{p.insurer} — {p.planName}</p>
                <p className="text-xs text-muted-foreground truncate">{p.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && query.trim() && (
        <div className="absolute left-0 right-0 top-full mt-1 rounded-md border bg-popover text-popover-foreground shadow-md z-30 px-3 py-3 text-sm text-muted-foreground">
          No catalog match. Fill the form manually below — you can also upload your own brochure.
        </div>
      )}
    </div>
  );
}

interface BriefProps {
  product: CatalogProduct;
  compact?: boolean;
}

/**
 * Aesthetic brief-panel summarising what a catalog product covers, with a
 * "Download brochure" link to the insurer's official product page.
 */
export function CatalogBrief({ product, compact = false }: BriefProps) {
  const pill =
    TYPE_PILL_COLORS[product.type] ?? 'bg-muted text-muted-foreground';

  return (
    <div className="rounded-lg border bg-gradient-to-br from-card to-muted/30 overflow-hidden">
      <div className="px-4 py-3 border-b bg-card flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${pill}`}>
              {TYPE_LABEL[product.type] ?? product.type}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{product.insurer}</span>
          </div>
          <h3 className="font-semibold text-base mt-1 truncate">{product.planName}</h3>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          <a
            href={product.brochureUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="inline-flex items-center gap-1.5 rounded-md border bg-background hover:bg-accent transition-colors px-3 py-1.5 text-xs font-medium"
            title="Download official policy brochure PDF"
          >
            <Download className="h-3.5 w-3.5" />
            Brochure
          </a>
          <a
            href={product.insurerSite}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border bg-background hover:bg-accent transition-colors px-2 py-1.5 text-xs font-medium"
            title="Open insurer's website"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3 text-sm">
        <p className="text-muted-foreground leading-relaxed">{product.description}</p>

        {!compact && (
          <>
            {(product.sumAssuredRange || product.ageBand || product.policyTermYears) && (
              <div className="grid grid-cols-3 gap-2 text-xs">
                {product.sumAssuredRange && (
                  <div className="rounded-md bg-muted/40 px-2 py-1.5">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Sum assured</p>
                    <p className="font-medium tabular-nums truncate">{product.sumAssuredRange}</p>
                  </div>
                )}
                {product.ageBand && (
                  <div className="rounded-md bg-muted/40 px-2 py-1.5">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Eligible age</p>
                    <p className="font-medium truncate">{product.ageBand}</p>
                  </div>
                )}
                {product.policyTermYears && (
                  <div className="rounded-md bg-muted/40 px-2 py-1.5">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Term (yrs)</p>
                    <p className="font-medium truncate">{product.policyTermYears}</p>
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-positive uppercase tracking-wider mb-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                What it covers
              </div>
              <ul className="space-y-1 pl-1">
                {product.keyCoverage.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-positive shrink-0" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>

            {product.exclusions && product.exclusions.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Common exclusions
                </div>
                <ul className="space-y-1 pl-1">
                  {product.exclusions.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <span className="mt-1.5 h-1 w-1 rounded-full bg-amber-500 shrink-0" />
                      <span className="text-muted-foreground">{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground italic pt-1 border-t">
              Summary based on insurer's published brochure. Refer to the policy document for binding terms.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Lookup helper used when reopening edit dialog: try to match an existing
 * policy back to a catalog product by (insurer, planName) so the brief stays
 * visible.
 */
export function inferCatalogId(insurer: string, planName: string | null | undefined): string | null {
  if (!planName) return null;
  const i = insurer.toLowerCase().trim();
  const p = planName.toLowerCase().trim();
  const match = INSURANCE_CATALOG.find(
    (c) => c.insurer.toLowerCase() === i && c.planName.toLowerCase() === p,
  );
  return match?.id ?? null;
}
