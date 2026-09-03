import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ListChecks, Loader2, Plus, Trash2 } from 'lucide-react';
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
  ADVISOR_ASSET_BUCKETS,
  advisorApi,
  advisorKeys,
  bucketLabel,
  type AdvisorAssetBucket,
  type ApprovedProduct,
  type ApprovedProductInput,
} from '@/api/advisor.api';

/**
 * The seven buckets the API accepts. This is the whole closed set — the zod
 * schema on POST /approved-products rejects anything else — so there is no
 * "merge in whatever the rows use" step: an unknown bucket could never have
 * been persisted in the first place.
 */
const BUCKET_OPTIONS: readonly AdvisorAssetBucket[] = ADVISOR_ASSET_BUCKETS;

export function ApprovedProductsPanel() {
  const qc = useQueryClient();
  const [bucket, setBucket] = useState<AdvisorAssetBucket>(BUCKET_OPTIONS[0]!);
  const [pending, setPending] = useState<AssetSearchHit | null>(null);
  const [searchKey, setSearchKey] = useState(0);

  // POST /approved-products requires a modelPortfolioId, so the list of model
  // portfolios has to be in hand before anything can be added. The risk
  // profile names the one that is actually in force; the list is what confirms
  // it still exists and supplies the fallback.
  const { data: riskProfileData } = useQuery({
    queryKey: advisorKeys.riskProfile,
    queryFn: () => advisorApi.riskProfile(),
  });

  const { data: portfolios } = useQuery({
    queryKey: advisorKeys.modelPortfolios,
    queryFn: () => advisorApi.modelPortfolios(),
  });

  const modelPortfolioId = useMemo(() => {
    const list = portfolios ?? [];
    const profile = riskProfileData?.profile ?? null;
    const preferred = profile?.modelPortfolio?.id;
    if (preferred && list.some((p) => p.id === preferred)) return preferred;
    const byCategory = profile?.category
      ? list.find((p) => p.riskCategory === profile.category)
      : undefined;
    return byCategory?.id ?? list.find((p) => p.isActive)?.id ?? list[0]?.id ?? null;
  }, [portfolios, riskProfileData]);

  // Scoped to the model portfolio being edited: the API returns every row the
  // user owns across all four risk-category portfolios, and mixing them would
  // show a Conservative shortlist under an Aggressive heading.
  const { data, isLoading, isError } = useQuery({
    queryKey: advisorKeys.approvedProducts(modelPortfolioId ?? undefined),
    queryFn: () => advisorApi.approvedProducts({ modelPortfolioId: modelPortfolioId ?? undefined }),
    enabled: !!modelPortfolioId,
  });

  const products = useMemo(() => data ?? [], [data]);

  const grouped = useMemo(() => {
    const map = new Map<string, ApprovedProduct[]>();
    for (const p of products) {
      if (!p) continue;
      const list = map.get(p.bucket);
      if (list) list.push(p);
      else map.set(p.bucket, [p]);
    }
    for (const list of map.values()) {
      // `label` is the display name the backend actually sends; rank is the
      // adviser's ordering and wins, with label breaking ties.
      list.sort(
        (a, b) => (a.rank ?? 0) - (b.rank ?? 0) || (a.label ?? '').localeCompare(b.label ?? ''),
      );
    }
    return [...map.entries()].sort((a, b) => bucketLabel(a[0]).localeCompare(bucketLabel(b[0])));
  }, [products]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['advisor', 'approved-products'] });
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

  // Only a LOCAL search hit carries the MutualFundMaster / StockMaster id the
  // API resolves against; a Yahoo-sourced hit has `id: null` and would 404.
  const pendingId = pending?.id ?? null;
  const canAdd = !!modelPortfolioId && !!pending && !!pendingId && !addMut.isPending;

  const addPending = () => {
    if (!pending || !pendingId || !modelPortfolioId) return;
    addMut.mutate({
      modelPortfolioId,
      bucket,
      // The API caps label at 200 chars; long scheme names would otherwise 400.
      label: (pending.name ?? '').slice(0, 200),
      // Exactly one of these, never both — the API refines on it.
      ...(pending.kind === 'STOCK' ? { stockId: pendingId } : { fundId: pendingId }),
      notes: null,
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
          <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
            <div>
              <Label htmlFor="approved-bucket" className="text-[11px] uppercase tracking-kerned text-muted-foreground">
                Bucket
              </Label>
              <Select
                id="approved-bucket"
                value={bucket}
                onChange={(e) => setBucket(e.target.value as AdvisorAssetBucket)}
                className="mt-1.5 h-10"
              >
                {BUCKET_OPTIONS.map((b) => (
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
            <Button size="sm" onClick={addPending} disabled={!canAdd}>
              {addMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add to {bucketLabel(bucket)}
            </Button>
            {pending && (
              <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">
                Selected: <span className="text-foreground">{pending.name}</span>
              </span>
            )}
          </div>

          {pending && !pendingId && (
            <p className="mt-2 text-[12px] text-muted-foreground">
              That result came from a live price lookup rather than our instrument master, so it
              can't be shortlisted yet. Pick a fund or stock we already track.
            </p>
          )}
          {!modelPortfolioId && (
            <p className="mt-2 text-[12px] text-muted-foreground">
              Complete the risk assessment first — an approved product is attached to a model
              portfolio, and you don't have one yet.
            </p>
          )}
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
                    <th className="w-32 px-1 py-2 text-left text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
                      Type
                    </th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((p, i) => (
                    <tr key={p.id} className="border-b border-border/40 last:border-0">
                      <td className="numeric px-1 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-1 py-2">
                        <span className="text-foreground">{p.label}</span>
                        {p.notes && (
                          <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{p.notes}</span>
                        )}
                      </td>
                      {/* The row references a master by id — there is no symbol
                          or ISIN on it to show. */}
                      <td className="px-1 py-2 text-[12px] text-muted-foreground">
                        {p.fundId ? 'Mutual fund' : p.stockId ? 'Stock' : '—'}
                      </td>
                      <td className="px-1 py-2 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-negative"
                          aria-label={`Remove ${p.label}`}
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
