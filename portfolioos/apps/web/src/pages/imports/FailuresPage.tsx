import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Inbox,
  ChevronRight,
  ArrowLeft,
  RotateCcw,
  Filter,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/common/EmptyState';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ingestionFailuresApi,
} from '@/api/ingestionFailures.api';
import type {
  ListIngestionFailuresParams,
} from '@/api/ingestionFailures.api';
import { apiErrorMessage } from '@/api/client';
import type {
  IngestionFailureDTO,
  IngestionResolveAction,
} from '@portfolioos/shared';
import {
  INGESTION_RESOLVE_ACTIONS,
  INGESTION_RESOLVE_ACTION_LABELS,
} from '@portfolioos/shared';

type Filter = 'unresolved' | 'resolved' | 'all';

export function FailuresPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('unresolved');
  const [adapterFilter, setAdapterFilter] = useState('');
  const [detail, setDetail] = useState<IngestionFailureDTO | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [pages, setPages] = useState<IngestionFailureDTO[][]>([]);

  const params: ListIngestionFailuresParams = {
    resolved: filter === 'all' ? undefined : filter === 'resolved',
    adapter: adapterFilter || undefined,
    cursor,
    limit: 50,
  };

  const listQuery = useQuery({
    queryKey: ['ingestion-failures', filter, adapterFilter, cursor],
    queryFn: () => ingestionFailuresApi.list(params),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: IngestionResolveAction }) =>
      ingestionFailuresApi.resolve(id, action),
    onSuccess: (row) => {
      toast.success('Marked resolved');
      setDetail(null);
      void queryClient.invalidateQueries({ queryKey: ['ingestion-failures'] });
      // Keep the updated row in view if the user stays on the page
      setPages((prev) =>
        prev.map((page) => page.map((r) => (r.id === row.id ? row : r))),
      );
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to resolve')),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => ingestionFailuresApi.retry(id),
    onSuccess: (result, id) => {
      if (result.error) {
        toast.error(`Retry failed: ${result.error}`);
        return;
      }
      toast.success(`Retry succeeded — ${result.eventsInserted} event(s) inserted`);
      setDetail(null);
      void queryClient.invalidateQueries({ queryKey: ['ingestion-failures'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Retry failed')),
  });

  const currentRows = listQuery.data?.data ?? [];
  const nextCursor = listQuery.data?.nextCursor ?? null;
  const unresolvedCount = currentRows.filter((r) => !r.resolvedAt).length;

  function resetPagination() {
    setCursor(undefined);
    setPages([]);
  }

  function handleFilterChange(f: Filter) {
    setFilter(f);
    resetPagination();
  }

  function handleAdapterFilterChange(v: string) {
    setAdapterFilter(v);
    resetPagination();
  }

  function handleLoadMore() {
    if (nextCursor) {
      setPages((prev) => [...prev, currentRows]);
      setCursor(nextCursor);
    }
  }

  // Show all previously loaded pages + current page
  const allRows: IngestionFailureDTO[] = [...pages.flat(), ...currentRows];

  return (
    <div>
      <PageHeader
        title="Ingestion failures"
        description="Rows that couldn't be parsed into a transaction. Review the payload, correct the file, and retry — or enter the transaction manually."
      />

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <Link
          to="/import"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to imports
        </Link>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Adapter search */}
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input
              placeholder="Adapter (e.g. gmail.generic.v1)"
              className="h-8 text-xs w-48"
              value={adapterFilter}
              onChange={(e) => handleAdapterFilterChange(e.target.value)}
            />
          </div>

          {/* Filter chips */}
          {(['unresolved', 'resolved', 'all'] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleFilterChange(f)}
            >
              {f === 'unresolved'
                ? `Unresolved${unresolvedCount ? ` (${unresolvedCount})` : ''}`
                : f[0]!.toUpperCase() + f.slice(1)}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetPagination();
              void queryClient.invalidateQueries({ queryKey: ['ingestion-failures'] });
            }}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dead-letter queue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isLoading && allRows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Loading failures…</div>
          ) : allRows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Inbox}
                title={
                  filter === 'unresolved'
                    ? 'No unresolved failures'
                    : 'Nothing to show'
                }
                description={
                  filter === 'unresolved'
                    ? 'Every ingestion attempt so far has produced clean transactions. When something fails, it will land here with the raw payload.'
                    : 'Try another filter.'
                }
              />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium px-4 py-2">Adapter</th>
                      <th className="text-left font-medium px-4 py-2">Source</th>
                      <th className="text-left font-medium px-4 py-2">Error</th>
                      <th className="text-left font-medium px-4 py-2">When</th>
                      <th className="text-left font-medium px-4 py-2">Status</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {allRows.map((r) => (
                      <tr
                        key={r.id}
                        className="hover:bg-muted/30 cursor-pointer"
                        onClick={() => setDetail(r)}
                      >
                        <td className="px-4 py-2 font-mono text-xs">
                          <div>{r.sourceAdapter}</div>
                          <div className="text-muted-foreground">v{r.adapterVersion}</div>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground max-w-[28ch] truncate">
                          {r.sourceRef}
                        </td>
                        <td className="px-4 py-2 max-w-[40ch]">
                          <div className="flex items-start gap-1.5">
                            <AlertTriangle className="h-3 w-3 mt-0.5 text-negative shrink-0" />
                            <span className="truncate">{r.errorMessage}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2">
                          {r.resolvedAt ? (
                            <span className="inline-flex items-center gap-1 text-xs text-positive">
                              <CheckCircle2 className="h-3 w-3" />
                              {r.resolvedAction
                                ? INGESTION_RESOLVE_ACTION_LABELS[r.resolvedAction]
                                : 'Resolved'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                              Unresolved
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          <ChevronRight className="h-3 w-3" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Load more */}
              {nextCursor && (
                <div className="p-3 flex justify-center border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={listQuery.isFetching}
                    onClick={handleLoadMore}
                  >
                    {listQuery.isFetching ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ingestion failure</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Field label="Adapter" value={`${detail.sourceAdapter} v${detail.adapterVersion}`} mono />
                <Field label="Created" value={new Date(detail.createdAt).toLocaleString()} />
                <Field label="Source" value={detail.sourceRef} mono wrap />
                <Field
                  label="Status"
                  value={
                    detail.resolvedAt
                      ? `${detail.resolvedAction ? INGESTION_RESOLVE_ACTION_LABELS[detail.resolvedAction] : 'Resolved'} · ${new Date(detail.resolvedAt).toLocaleString()}`
                      : 'Unresolved'
                  }
                />
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Error
                </div>
                <div className="rounded-md border border-negative/40 bg-negative/5 p-3 text-sm text-negative font-mono whitespace-pre-wrap break-words">
                  {detail.errorMessage}
                </div>
              </div>

              {detail.errorStack && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    Stack trace
                  </summary>
                  <pre className="mt-2 p-3 rounded-md bg-muted/50 overflow-x-auto text-[11px]">
                    {detail.errorStack}
                  </pre>
                </details>
              )}

              {detail.rawPayload !== null && detail.rawPayload !== undefined && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Raw payload
                  </div>
                  <pre className="p-3 rounded-md bg-muted/50 overflow-x-auto text-[11px] max-h-64">
                    {JSON.stringify(detail.rawPayload, null, 2)}
                  </pre>
                </div>
              )}

              {!detail.resolvedAt && (
                <div className="border-t pt-4 space-y-3">
                  {/* Retry — available for gmail.* adapters */}
                  {(detail.sourceAdapter.startsWith('gmail.') || detail.sourceAdapter.startsWith('email.')) && (
                    <div>
                      <div className="text-sm font-medium mb-2">Retry</div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={retryMutation.isPending}
                        onClick={() => retryMutation.mutate(detail.id)}
                        className="flex items-center gap-1.5"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {retryMutation.isPending ? 'Retrying…' : 'Retry parse'}
                      </Button>
                    </div>
                  )}

                  {/* Resolve actions */}
                  <div>
                    <div className="text-sm font-medium mb-2">Mark as resolved</div>
                    <div className="flex flex-wrap gap-2">
                      {INGESTION_RESOLVE_ACTIONS.map((action) => (
                        <Button
                          key={action}
                          variant="outline"
                          size="sm"
                          disabled={resolveMutation.isPending}
                          onClick={() =>
                            resolveMutation.mutate({ id: detail.id, action })
                          }
                        >
                          {INGESTION_RESOLVE_ACTION_LABELS[action]}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  wrap,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div
        className={[
          'text-sm',
          mono ? 'font-mono' : '',
          wrap ? 'break-all' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </div>
    </div>
  );
}
