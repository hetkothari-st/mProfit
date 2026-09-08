import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, FolderOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { cn } from '@/lib/cn';
import { getApiBaseUrl } from '@/api/baseUrl';
import { useAuthStore } from '@/stores/auth.store';
import { caApi, type CaDocumentRow } from '@/api/ca.api';

/**
 * Every document a client holds, in one place.
 *
 * The vault has always been per-record — this rental agreement, that vehicle's
 * RC — which is the wrong shape for anyone assembling a year's paperwork. They
 * want the client's documents, not one property's.
 *
 * Selection is explicit rather than "download everything", because a client's
 * vault can hold years of unrelated files and a CA usually wants the handful
 * that belong to the return they are filing.
 */

const OWNER_LABEL: Record<string, string> = {
  RENTAL_PROPERTY: 'Rental',
  TENANCY: 'Tenancy',
  VEHICLE: 'Vehicle',
  INSURANCE_POLICY: 'Insurance',
  PORTFOLIO: 'Portfolio',
  OWNED_PROPERTY: 'Property',
  OTHER: 'Other',
};

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ClientDocumentsTab({ clientId }: { clientId: string }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const docs = useQuery({
    queryKey: ['ca', clientId, 'documents'],
    queryFn: () => caApi.documents(clientId),
  });

  const rows = docs.data ?? [];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function downloadSelected() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const r = await fetch(
        `${getApiBaseUrl()}/api/documents/bulk-download?clientId=${encodeURIComponent(clientId)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ids: [...selected] }),
        },
      );
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'documents.zip';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert((e as Error).message || 'Download failed');
    } finally {
      setBusy(false);
    }
  }

  if (docs.isLoading) {
    return (
      <Card className="overflow-hidden">
        <div className="divide-y divide-border/50">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[52px] animate-pulse bg-muted/30" />
          ))}
        </div>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="No documents"
        description="Files your client has attached to properties, vehicles, policies and portfolios will appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-muted-foreground">
          {selected.size > 0
            ? `${selected.size} of ${rows.length} selected`
            : `${rows.length} document${rows.length === 1 ? '' : 's'}`}
        </p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setSelected(
                selected.size === rows.length ? new Set() : new Set(rows.map((d) => d.id)),
              )
            }
          >
            {selected.size === rows.length ? 'Clear' : 'Select all'}
          </Button>
          <Button
            size="sm"
            disabled={selected.size === 0 || busy}
            onClick={() => void downloadSelected()}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5" />
            )}
            Download selected
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {rows.map((d: CaDocumentRow) => (
            <label
              key={d.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 border-b border-border/50 px-4 py-2.5 last:border-0 transition-colors hover:bg-muted/25',
                selected.has(d.id) && 'bg-accent/5',
              )}
            >
              <input
                type="checkbox"
                checked={selected.has(d.id)}
                onChange={() => toggle(d.id)}
                className="h-3.5 w-3.5 rounded border-border accent-accent"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] text-foreground">{d.fileName}</p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {OWNER_LABEL[d.ownerType] ?? d.ownerType}
                  {d.category ? ` · ${d.category}` : ''} ·{' '}
                  <span className="numeric tabular-nums">{sizeLabel(d.sizeBytes)}</span>
                </p>
              </div>
              <span className="numeric tabular-nums shrink-0 text-[11.5px] text-muted-foreground">
                {new Date(d.createdAt).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </label>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
