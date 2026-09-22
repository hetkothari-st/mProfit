import { useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Eye, PencilLine, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import {
  professionalAccessApi,
  CA_ASSET_CLASSES,
  CA_SCOPE_CATEGORIES,
  CA_SCOPE_CATEGORY_LABEL,
  type CaScopeCategory,
  type GrantScopePatch,
  type GrantEditRights,
} from '@/api/ca.api';
import { apiErrorMessage } from '@/api/client';

/**
 * What one professional may see and do, and until when.
 *
 * Two columns because there are two different questions: what they can DO
 * (read, or also keep the books) and what they can SEE (which portfolios,
 * categories and asset classes). They are decided independently and read
 * better side by side than stacked into one long form.
 *
 * Each "see" dimension has two states — everything, or a chosen list — and the
 * distinction is explicit because it is explicit in the data: "all portfolios"
 * includes one added next month, "every portfolio I have today" does not.
 *
 * Nothing here is the enforcement. The policies decide; this panel only shows
 * what was decided and lets the account holder change it.
 */

interface Props {
  clientId: string;
  onClose: () => void;
}

const dateOnly = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');

const EDIT_ROWS: Array<{ key: keyof GrantEditRights; label: string; detail: string }> = [
  { key: 'books', label: 'Keep my books', detail: 'Chart of accounts and vouchers' },
  { key: 'transactions', label: 'Add and correct transactions', detail: 'Never delete one' },
  { key: 'imports', label: 'Upload statements', detail: 'Contract notes, CAS, bank files' },
  { key: 'fmv', label: 'Set fair market values', detail: 'For grandfathered gains' },
];

export function GrantScopePanel({ clientId, onClose }: Props) {
  const qc = useQueryClient();
  const { data: grant, isLoading } = useQuery({
    queryKey: ['professional-access', clientId],
    queryFn: () => professionalAccessApi.grant(clientId),
  });

  // Local edits start unset and fall back to the server's answer, so the panel
  // shows the truth until something is actually changed.
  const [portfolioIds, setPortfolioIds] = useState<string[] | null | undefined>();
  const [categories, setCategories] = useState<CaScopeCategory[] | null | undefined>();
  const [assetClasses, setAssetClasses] = useState<string[] | null | undefined>();
  const [from, setFrom] = useState<string | undefined>();
  const [until, setUntil] = useState<string | undefined>();
  const [edit, setEdit] = useState<GrantEditRights | undefined>();
  const [advanced, setAdvanced] = useState(false);

  const reset = () => {
    setPortfolioIds(undefined);
    setCategories(undefined);
    setAssetClasses(undefined);
    setFrom(undefined);
    setUntil(undefined);
    setEdit(undefined);
  };

  const save = useMutation({
    mutationFn: (patch: GrantScopePatch) => professionalAccessApi.updateScope(clientId, patch),
    onSuccess: () => {
      toast.success('Access saved');
      qc.invalidateQueries({ queryKey: ['professional-access'] });
      reset();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not save access')),
  });

  if (isLoading || !grant) {
    return (
      <div className="flex items-center gap-2 px-5 py-8 text-[13px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading access
      </div>
    );
  }

  const currentPortfolios =
    portfolioIds !== undefined ? portfolioIds : grant.scopeAllPortfolios ? null : grant.portfolioIds;
  const currentCategories =
    categories !== undefined
      ? categories
      : grant.scopeAllCategories
        ? null
        : (grant.categories as CaScopeCategory[]);
  const currentAssetClasses =
    assetClasses !== undefined
      ? assetClasses
      : grant.scopeAllAssetClasses
        ? null
        : grant.assetClasses;
  const currentEdit: GrantEditRights = edit ?? grant.edit;
  const anyEdit =
    currentEdit.books || currentEdit.transactions || currentEdit.imports || currentEdit.fmv;
  const allEdit =
    currentEdit.books && currentEdit.transactions && currentEdit.imports && currentEdit.fmv;
  // A partial set is shown open, because the summary cards cannot describe it.
  const partial = anyEdit && !allEdit;
  const showAdvanced = advanced || partial;
  const currentFrom = from !== undefined ? from : dateOnly(grant.accessFrom);
  const currentUntil = until !== undefined ? until : dateOnly(grant.accessUntil);

  const dirty =
    portfolioIds !== undefined ||
    categories !== undefined ||
    assetClasses !== undefined ||
    from !== undefined ||
    until !== undefined ||
    edit !== undefined;

  const submit = () => {
    const patch: GrantScopePatch = {};
    if (portfolioIds !== undefined) patch.portfolioIds = portfolioIds;
    if (categories !== undefined) patch.categories = categories;
    if (assetClasses !== undefined) patch.assetClasses = assetClasses;
    if (from !== undefined) patch.accessFrom = from || null;
    if (until !== undefined) patch.accessUntil = until || null;
    if (edit !== undefined) patch.edit = edit;
    save.mutate(patch);
  };

  const who = grant.advisor?.name?.split(/\s+/)[0] ?? 'They';

  return (
    <div className="border-t border-border/60 bg-muted/[0.18]">
      <div className="grid gap-px bg-border/40 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* ── What they can do ── */}
        <div className="bg-card px-5 py-5">
          <PanelHeading
            title="What they can do"
            hint="Reading is always included. Changing anything is up to you."
          />

          <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="What they can do">
            <ModeCard
              icon={<Eye className="h-4 w-4" />}
              title="View only"
              body="Read everything in scope and download reports."
              selected={!anyEdit}
              onSelect={() =>
                setEdit({ books: false, transactions: false, imports: false, fmv: false })
              }
            />
            <ModeCard
              icon={<PencilLine className="h-4 w-4" />}
              title="Keep my books"
              body="Also post entries, fix trades and upload statements."
              // Only when EVERY permission is on. A partial set is neither of
              // these, and lighting this card up would claim more than was given.
              selected={allEdit}
              onSelect={() =>
                setEdit({ books: true, transactions: true, imports: true, fmv: true })
              }
            />
          </div>

          {partial && (
            <p className="mt-2 text-[12px] text-warning">
              Custom — only the permissions switched on below.
            </p>
          )}

          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="focus-ring mt-4 inline-flex items-center gap-1 rounded text-[12.5px] text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', showAdvanced && 'rotate-180')}
            />
            Choose each permission
          </button>

          {showAdvanced && (
            <ul className="mt-3 divide-y divide-border/60 rounded-lg border border-border/60">
              {EDIT_ROWS.map((row) => (
                <li key={row.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[13px] text-foreground">{row.label}</p>
                    <p className="text-[11.5px] text-muted-foreground">{row.detail}</p>
                  </div>
                  <Switch
                    label={row.label}
                    on={currentEdit[row.key]}
                    onToggle={() => setEdit({ ...currentEdit, [row.key]: !currentEdit[row.key] })}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── What they can see ── */}
        <div className="bg-card px-5 py-5">
          <PanelHeading
            title="What they can see"
            hint={`${who} only ever reaches your own data — never your family’s.`}
          />

          <div className="mt-4 space-y-5">
            <ScopeGroup
              title="Portfolios"
              all={currentPortfolios === null}
              allLabel="All, including ones you add later"
              onAll={() => setPortfolioIds(null)}
              onSome={() => setPortfolioIds(currentPortfolios ?? [])}
              count={currentPortfolios?.length}
            >
              <div className="flex flex-wrap gap-1.5">
                {grant.availablePortfolios.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.name}
                    on={(currentPortfolios ?? []).includes(p.id)}
                    onClick={() => {
                      const next = new Set(currentPortfolios ?? []);
                      if (next.has(p.id)) next.delete(p.id);
                      else next.add(p.id);
                      setPortfolioIds([...next]);
                    }}
                  />
                ))}
              </div>
            </ScopeGroup>

            <ScopeGroup
              title="Categories"
              all={currentCategories === null}
              allLabel="Loans, cards, property, insurance and the rest"
              onAll={() => setCategories(null)}
              onSome={() => setCategories(currentCategories ?? [])}
              count={currentCategories?.length}
            >
              <div className="flex flex-wrap gap-1.5">
                {CA_SCOPE_CATEGORIES.map((c) => (
                  <Chip
                    key={c}
                    label={CA_SCOPE_CATEGORY_LABEL[c]}
                    on={(currentCategories ?? []).includes(c)}
                    onClick={() => {
                      const next = new Set(currentCategories ?? []);
                      if (next.has(c)) next.delete(c);
                      else next.add(c);
                      setCategories([...next]);
                    }}
                  />
                ))}
              </div>
            </ScopeGroup>

            <ScopeGroup
              title="Asset classes"
              all={currentAssetClasses === null}
              allLabel="Every asset class"
              onAll={() => setAssetClasses(null)}
              onSome={() => setAssetClasses(currentAssetClasses ?? [])}
              count={currentAssetClasses?.length}
            >
              <div className="flex flex-wrap gap-1.5">
                {CA_ASSET_CLASSES.map((ac) => (
                  <Chip
                    key={ac}
                    label={humanise(ac)}
                    on={(currentAssetClasses ?? []).includes(ac)}
                    onClick={() => {
                      const next = new Set(currentAssetClasses ?? []);
                      if (next.has(ac)) next.delete(ac);
                      else next.add(ac);
                      setAssetClasses([...next]);
                    }}
                  />
                ))}
              </div>
            </ScopeGroup>
          </div>
        </div>
      </div>

      {/* ── When ── */}
      <div className="border-t border-border/60 bg-card px-5 py-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="min-w-[180px] flex-1">
            <PanelHeading
              title="When"
              hint="Access stops by itself on the end date. Leave blank for no limit."
            />
          </div>
          <DateField label="From" value={currentFrom} onChange={setFrom} />
          <DateField label="Until" value={currentUntil} onChange={setUntil} />
        </div>
      </div>

      {/* ── Save bar ── */}
      <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3">
        <p className={cn('text-[12.5px]', dirty ? 'text-warning' : 'text-muted-foreground')}>
          {dirty ? 'You have unsaved changes' : 'Everything above is saved'}
        </p>
        <div className="flex gap-2">
          {dirty ? (
            <Button size="sm" variant="ghost" onClick={reset} disabled={save.isPending}>
              Discard
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          )}
          <Button size="sm" disabled={!dirty || save.isPending} onClick={submit}>
            {save.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Save access
          </Button>
        </div>
      </div>
    </div>
  );
}

function humanise(token: string): string {
  const words = token.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function PanelHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h3 className="text-[14px] font-medium text-foreground">{title}</h3>
      {hint && <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** A choosable card with an icon, for the view-only / keep-books decision. */
function ModeCard({
  icon,
  title,
  body,
  selected,
  onSelect,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'focus-ring rounded-lg border p-3 text-left transition-colors',
        selected
          ? 'border-accent/60 bg-accent/[0.08]'
          : 'border-border/70 hover:border-border hover:bg-muted/30',
      )}
    >
      <span
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-md',
          selected ? 'bg-accent/20 text-accent-ink' : 'bg-muted/50 text-muted-foreground',
        )}
      >
        {icon}
      </span>
      <p className="mt-2 text-[13px] font-medium text-foreground">{title}</p>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{body}</p>
    </button>
  );
}

/** Everything, or a chosen list — and the list only when chosen. */
function ScopeGroup({
  title,
  all,
  allLabel,
  onAll,
  onSome,
  count,
  children,
}: {
  title: string;
  all: boolean;
  allLabel: string;
  onAll: () => void;
  onSome: () => void;
  count?: number;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-foreground">{title}</p>
        <div
          className="inline-flex rounded-md border border-border/70 p-0.5"
          role="radiogroup"
          aria-label={title}
        >
          <Segment label="All" on={all} onClick={onAll} />
          <Segment label={count !== undefined && !all ? `Chosen (${count})` : 'Chosen'} on={!all} onClick={onSome} />
        </div>
      </div>
      {all ? (
        <p className="mt-1 text-[12px] text-muted-foreground">{allLabel}</p>
      ) : (
        <div className="mt-2">
          {children}
          {count === 0 && (
            <p className="mt-2 text-[12px] text-warning">
              Nothing chosen — they will see none of these.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Segment({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'focus-ring rounded px-2.5 py-1 text-[12px] transition-colors',
        on ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'focus-ring inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors',
        on
          ? 'border-accent/60 bg-accent/[0.12] text-foreground'
          : 'border-border/70 text-muted-foreground hover:border-border hover:text-foreground',
      )}
    >
      {on && <Check className="h-3 w-3" />}
      {label}
    </button>
  );
}

/** An accessible on/off switch — the app has no primitive for one yet. */
function Switch({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        'focus-ring relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        on ? 'bg-accent' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform',
          on ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-muted-foreground">
      {label}
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-[160px]"
      />
    </label>
  );
}
