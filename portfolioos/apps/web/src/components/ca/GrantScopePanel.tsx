import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  professionalAccessApi,
  CA_ASSET_CLASSES,
  CA_SCOPE_CATEGORIES,
  CA_SCOPE_CATEGORY_LABEL,
  type CaScopeCategory,
  type GrantScopePatch,
} from '@/api/ca.api';
import { apiErrorMessage } from '@/api/client';

/**
 * What one professional may see, and until when.
 *
 * Three narrowings and a clock, each with the same two states: everything, or
 * a list. The distinction is kept explicit in the UI because it is explicit in
 * the data — "all portfolios" is not the same as "every portfolio I have
 * today", and a client who adds a portfolio next month should not have to
 * remember which of the two they picked.
 *
 * Nothing here is the enforcement. The policies decide; this only says what
 * was decided and lets the client change it.
 */

interface Props {
  clientId: string;
  onClose: () => void;
}

const dateOnly = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');

export function GrantScopePanel({ clientId, onClose }: Props) {
  const qc = useQueryClient();
  const { data: grant, isLoading } = useQuery({
    queryKey: ['professional-access', clientId],
    queryFn: () => professionalAccessApi.grant(clientId),
  });

  // Local edits start unset and fall back to the server's answer, so the panel
  // shows the truth until the client actually changes something.
  const [portfolioIds, setPortfolioIds] = useState<string[] | null | undefined>();
  const [categories, setCategories] = useState<CaScopeCategory[] | null | undefined>();
  const [assetClasses, setAssetClasses] = useState<string[] | null | undefined>();
  const [from, setFrom] = useState<string | undefined>();
  const [until, setUntil] = useState<string | undefined>();

  const save = useMutation({
    mutationFn: (patch: GrantScopePatch) => professionalAccessApi.updateScope(clientId, patch),
    onSuccess: () => {
      toast.success('Access updated');
      qc.invalidateQueries({ queryKey: ['professional-access'] });
      setPortfolioIds(undefined);
      setCategories(undefined);
      setAssetClasses(undefined);
      setFrom(undefined);
      setUntil(undefined);
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not update access')),
  });

  if (isLoading || !grant) {
    return (
      <div className="flex items-center gap-2 px-4 py-6 text-[13px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading access…
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
  const currentFrom = from !== undefined ? from : dateOnly(grant.accessFrom);
  const currentUntil = until !== undefined ? until : dateOnly(grant.accessUntil);

  const dirty =
    portfolioIds !== undefined ||
    categories !== undefined ||
    assetClasses !== undefined ||
    from !== undefined ||
    until !== undefined;

  const submit = () => {
    const patch: GrantScopePatch = {};
    if (portfolioIds !== undefined) patch.portfolioIds = portfolioIds;
    if (categories !== undefined) patch.categories = categories;
    if (assetClasses !== undefined) patch.assetClasses = assetClasses;
    if (from !== undefined) patch.accessFrom = from || null;
    if (until !== undefined) patch.accessUntil = until || null;
    save.mutate(patch);
  };

  return (
    <div className="space-y-5 border-t border-border/50 bg-muted/20 px-4 py-4">
      <Section
        title="Portfolios"
        all={currentPortfolios === null}
        allLabel="Every portfolio, including ones I add later"
        someLabel="Only the ones I tick"
        onAll={() => setPortfolioIds(null)}
        onSome={() => setPortfolioIds(currentPortfolios ?? [])}
      >
        <div className="grid gap-1.5 sm:grid-cols-2">
          {grant.availablePortfolios.map((p) => (
            <Toggle
              key={p.id}
              label={p.name}
              hint={p.familyId ? 'family' : undefined}
              on={(currentPortfolios ?? []).includes(p.id)}
              onClick={() => {
                const next = new Set(currentPortfolios ?? []);
                next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                setPortfolioIds([...next]);
              }}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Categories"
        all={currentCategories === null}
        allLabel="Loans, cards, property, insurance — everything"
        someLabel="Only the ones I tick"
        onAll={() => setCategories(null)}
        onSome={() => setCategories(currentCategories ?? [])}
      >
        <div className="flex flex-wrap gap-1.5">
          {CA_SCOPE_CATEGORIES.map((c) => (
            <Toggle
              key={c}
              label={CA_SCOPE_CATEGORY_LABEL[c]}
              on={(currentCategories ?? []).includes(c)}
              onClick={() => {
                const next = new Set(currentCategories ?? []);
                next.has(c) ? next.delete(c) : next.add(c);
                setCategories([...next]);
              }}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Asset classes"
        all={currentAssetClasses === null}
        allLabel="Every asset class"
        someLabel="Only the ones I tick"
        onAll={() => setAssetClasses(null)}
        onSome={() => setAssetClasses(currentAssetClasses ?? [])}
      >
        <div className="flex flex-wrap gap-1.5">
          {CA_ASSET_CLASSES.map((ac) => (
            <Toggle
              key={ac}
              label={ac.replace(/_/g, ' ').toLowerCase()}
              on={(currentAssetClasses ?? []).includes(ac)}
              onClick={() => {
                const next = new Set(currentAssetClasses ?? []);
                next.has(ac) ? next.delete(ac) : next.add(ac);
                setAssetClasses([...next]);
              }}
            />
          ))}
        </div>
      </Section>

      <div>
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
          When
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground/85">
          Leave either blank for no limit. Access stops by itself on the end date — nobody has to
          remember to withdraw it.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-[12px] text-muted-foreground">
            From
            <Input
              type="date"
              value={currentFrom}
              onChange={(e) => setFrom(e.target.value)}
              className="ml-2 inline-block w-[150px]"
            />
          </label>
          <label className="text-[12px] text-muted-foreground">
            Until
            <Input
              type="date"
              value={currentUntil}
              onChange={(e) => setUntil(e.target.value)}
              className="ml-2 inline-block w-[150px]"
            />
          </label>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!dirty || save.isPending} onClick={submit}>
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save access
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  all,
  allLabel,
  someLabel,
  onAll,
  onSome,
  children,
}: {
  title: string;
  all: boolean;
  allLabel: string;
  someLabel: string;
  onAll: () => void;
  onSome: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Choice label={allLabel} on={all} onClick={onAll} />
        <Choice label={someLabel} on={!all} onClick={onSome} />
      </div>
      {!all && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

function Choice({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
        on
          ? 'border-primary/50 bg-primary/10 text-foreground'
          : 'border-border/60 text-muted-foreground hover:border-border'
      }`}
    >
      {label}
    </button>
  );
}

function Toggle({
  label,
  hint,
  on,
  onClick,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-[12px] capitalize transition-colors ${
        on
          ? 'border-primary/50 bg-primary/10 text-foreground'
          : 'border-border/60 text-muted-foreground hover:border-border'
      }`}
    >
      <span className={`h-3 w-3 shrink-0 rounded-[3px] border ${on ? 'border-primary bg-primary' : 'border-border'}`}>
        {on && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
      </span>
      <span className="truncate">{label}</span>
      {hint && <span className="text-[10px] uppercase text-muted-foreground/70">{hint}</span>}
    </button>
  );
}
