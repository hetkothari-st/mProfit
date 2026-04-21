import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2 } from 'lucide-react';
import { assetsApi } from '@/api/assets.api';
import { Input } from '@/components/ui/input';
import type { AssetSearchHit } from '@portfolioos/shared';

interface Props {
  kind?: 'all' | 'stock' | 'mf';
  onSelect: (hit: AssetSearchHit) => void;
  placeholder?: string;
  initialValue?: string;
}

export function AssetSearch({ kind = 'all', onSelect, placeholder, initialValue = '' }: Props) {
  const [q, setQ] = useState(initialValue);
  const [debounced, setDebounced] = useState(q);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ['asset-search', kind, debounced],
    queryFn: () => assetsApi.search(debounced, kind, 15),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });

  const hits = data ?? [];

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? 'Search by symbol, name, or ISIN…'}
          className="pl-9"
        />
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && debounced.length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-80 overflow-auto">
          {hits.length === 0 && !isFetching && (
            <div className="p-3 text-sm text-muted-foreground">No matches</div>
          )}
          {hits.map((hit, idx) => (
            <button
              type="button"
              key={`${hit.kind}-${hit.id ?? hit.symbol ?? hit.schemeCode}-${idx}`}
              onClick={() => {
                onSelect(hit);
                setQ(hit.symbol ?? hit.schemeCode ?? hit.name);
                setOpen(false);
              }}
              className="w-full px-3 py-2 text-left hover:bg-accent/50 border-b last:border-0"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{hit.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {hit.kind === 'STOCK'
                      ? `${hit.symbol ?? ''} · ${hit.exchange ?? ''}${hit.isin ? ` · ${hit.isin}` : ''}`
                      : `${hit.schemeCode ?? ''} · ${hit.amcName ?? ''}${hit.isin ? ` · ${hit.isin}` : ''}`}
                  </div>
                </div>
                <div className="flex-shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {hit.kind === 'STOCK' ? 'Stock' : 'MF'}
                  {hit.source === 'YAHOO' ? ' · Yahoo' : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
