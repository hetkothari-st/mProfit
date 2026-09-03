import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, ListChecks, Loader2, Plus, Trash2 } from 'lucide-react';
import type { AssetSearchHit } from '@portfolioos/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AssetSearch } from '@/components/common/AssetSearch';
import { EmptyState } from '@/components/common/EmptyState';
import { apiErrorMessage } from '@/api/client';
import {
  advisorApi,
  advisorKeys,
  bucketLabel,
  type ApprovedProduct,
  type ApprovedProductInput,
} from '@/api/advisor.api';

/** Buckets offered in the picker. Any bucket already in use is merged in on top of this. */
const BUCKET_OPTIONS = [
  'EQUITY_LARGE_CAP',
  'EQUITY_MID_CAP',
  'EQUITY_SMALL_CAP',
  'EQUITY_INTERNATIONAL',
  'DEBT_SHORT',
  'DEBT_LONG',
  'GOLD',
  'CASH',
  'OTHER',
];

export function ApprovedProductsPanel() {
  const qc = useQueryClient();
  const [bucket, setBucket] = useState<string>(BUCKET_OPTIONS[0]!);
  const [pending, setPending] = useState<AssetSearchHit | null>(null);
  const [searchKey, setSearchKey] = useState(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: advisorKeys.approvedProducts,
    queryFn: () => advisorApi.approvedProducts(),
  });

  const products = useMemo(() => data ?? [], [data]);

  const grouped = useMemo(() => {
    const map = new Map<string, ApprovedProduct[]>();
    for (const p of products) {
      const list = map.get(p.bucket);
      if (list) list.push(p);
      else map.set(p.bucket, [p]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.rank - b.rank || a.instrumentName.localeCompare(b.instrumentName));
    }
    return [...map.entries()].sort((a, b) => bucketLabel(a[0]).localeCompare(bucketLabel(b[0])));
  }, [products]);

  const bucketChoices = useMemo(() => {
    const set = new Set<string>(BUCKET_OPTIONS);
    for (const p of products) set.add(p.bucket);
    return [...set];
  }, [products]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: advisorKeys.approvedProducts });
    qc.invalidateQueries({ queryKey: ['advisor', 'recommendations'] });
  };

  const addMut = useMutation({
    mutationFn: (input: ApprovedProductInput) => advisorApi.addApprovedProduct(input),
    onSuccess: () => {
      toast.success('Added to the approved list');
      setPending(null);
      setSearchKey((k) => k + 1);
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not add that product')),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => advisorApi.removeApprovedProduct(id),
    onSuccess: () => {
      toast.success('Removed from the approved list');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not remove that product')),
  });

  // The API exposes no rank-update route, so a reorder is expressed as a re-POST
  // of the same product carrying its new rank (the backend upserts on identity).
  const reorderMut = useMutation({
    mutationFn: async (moves: Array<{ product: ApprovedProduct; rank: number }>) => {
      for (const m of moves) {
        await advisorApi.addApprovedProduct({
          bucket: m.product.bucket,
          instrumentName: m.product.instrumentName,
          symbol: m.product.symbol,
          isin: m.product.isin,
          schemeCode: m.product.schemeCode,
          kind: m.product.kind,
          rank: m.rank,
          note: m.product.note,
        });
      }
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not reorder the list')),
  });

  const move = (list: ApprovedProduct[], index: number, delta: number) => {
    const target = index + delta;
    const a = list[index];
    const b = list[target];
    if (!a || !b) return;
    reorderMut.mutate([
      { product: a, rank: b.rank },
      { product: b, rank: a.rank },
    ]);
  };

  const addPending = () => {
    if (!pending) return;
    addMut.mutate({
      bucket,
      instrumentName: pending.name,
      symbol: pending.symbol,
      isin: pending.isin ?? null,
      schemeCode: pending.schemeCode ?? null,
      kind: pending.kind === 'STOCK' ? 'STOCK' : 'MUTUAL_FUND',
      note: null,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent-ink">
            <ListChecks className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
              Your shortlist
            </p>
            <CardTitle className="mt-1">Approved products</CardTitle>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              Instruments the advisor is allowed to recommend, grouped by bucket. Order matters —
              the top-ranked product in each bucket is picked first. Leave a bucket empty and the
              engine falls back to its own ranking.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5">
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <div>
              <Label htmlFor="approved-bucket" className="text-[11px] uppercase tracking-kerned text-muted-foreground">
                Bucket
              </Label>
              <Select
                id="approved-bucket"
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                className="mt-1.5 h-10"
              >
                {bucketChoices.map((b) => (
                  <option key={b} value={b}>
                    {bucketLabel(b)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-kerned text-muted-foreground">
                Instrument
              </Label>
              <div className="mt-1.5">
                <AssetSearch key={searchKey} onSelect={setPending} placeholder="Search a fund, stock, or ISIN…" />
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={addPending} disabled={!pending || addMut.isPending}>
              {addMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add to {bucketLabel(bucket)}
            </Button>
            {pending && (
              <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">
                Selected: <span className="text-foreground">{pending.name}</span>
              </span>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="py-8 text-center text-muted-foreground">
            <Loader2 className="inline h-5 w-5 animate-spin" /> Loading your list…
          </div>
        )}

        {isError && !isLoading && (
          <p className="py-4 text-sm text-negative">Couldn't load your approved products.</p>
        )}

        {!isLoading && !isError && grouped.length === 0 && (
          <EmptyState
            icon={ListChecks}
            title="No approved products yet"
            description="Add the funds and stocks you're happy to be recommended. Until then, every pick is algorithmically ranked."
          />
        )}

        {grouped.map(([bucketKey, list]) => (
          <div key={bucketKey}>
            <div className="mb-1.5 flex items-center gap-2">
              <p className="text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
                {bucketLabel(bucketKey)}
              </p>
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                {list.length}
              </Badge>
              <span className="h-px flex-1 bg-border/60" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border/70">
                    <th className="w-10 px-1 py-2 text-left text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
                      #
                    </th>
                    <th className="px-1 py-2 text-left text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
                      Instrument
                    </th>
                    <th className="px-1 py-2 text-left text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
                      Identifier
                    </th>
                    <th className="w-28 px-1 py-2 text-right text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
                      Order
                    </th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((p, i) => (
                    <tr key={p.id} className="border-b border-border/40 last:border-0">
                      <td className="numeric px-1 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-1 py-2">
                        <span className="text-foreground">{p.instrumentName}</span>
                        {p.note && (
                          <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{p.note}</span>
                        )}
                      </td>
                      <td className="numeric px-1 py-2 text-[12px] text-muted-foreground">
                        {p.symbol ?? p.schemeCode ?? p.isin ?? '—'}
                      </td>
                      <td className="px-1 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            aria-label={`Move ${p.instrumentName} up`}
                            disabled={i === 0 || reorderMut.isPending}
                            onClick={() => move(list, i, -1)}
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            aria-label={`Move ${p.instrumentName} down`}
                            disabled={i === list.length - 1 || reorderMut.isPending}
                            onClick={() => move(list, i, 1)}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-1 py-2 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-negative"
                          aria-label={`Remove ${p.instrumentName}`}
                          disabled={removeMut.isPending}
                          onClick={() => removeMut.mutate(p.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
