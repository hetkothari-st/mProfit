import { useEffect, useId, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Decimal } from '@everypaisa/shared';
import { assetsApi } from '@/api/assets.api';
import { pricePerGram, puritiesFor, type Metal } from '@/lib/metalPurity';

function formatPrice(val: string | null | undefined): string {
  if (!val) return '—';
  const d = new Decimal(val);
  const [whole, frac] = d.toFixed(2).split('.');
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `₹${grouped}.${frac}`;
}

function useSecondsAgo(fetchedAt: string | undefined) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!fetchedAt) return;
    const tick = () =>
      setSecs(Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [fetchedAt]);
  return secs;
}

function freshnessLabel(secs: number): string {
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const m = Math.floor(secs / 60);
  return m === 1 ? '1 min ago' : `${m} min ago`;
}

// ── Purity choice, remembered per viewer ─────────────────────────────────────

const STORAGE_KEY: Record<Metal, string> = {
  GOLD: 'everypaisa.goldTicker.karat',
  SILVER: 'everypaisa.goldTicker.silverPurity',
};

function readPurity(metal: Metal): string {
  const fallback = puritiesFor(metal)[0]!.value;
  try {
    const saved = localStorage.getItem(STORAGE_KEY[metal]);
    return saved && puritiesFor(metal).some((p) => p.value === saved) ? saved : fallback;
  } catch {
    return fallback; // storage blocked (private mode, sandbox) — default is fine
  }
}

/** False when storage is blocked: the choice still applies, it just isn't remembered. */
function savePurity(metal: Metal, value: string): boolean {
  try {
    localStorage.setItem(STORAGE_KEY[metal], value);
    return true;
  } catch {
    return false;
  }
}

function usePurity(metal: Metal): [string, (v: string) => void] {
  const [value, setValue] = useState(() => readPurity(metal));
  function choose(v: string) {
    setValue(v);
    savePurity(metal, v);
  }
  return [value, choose];
}

// ── Icon ─────────────────────────────────────────────────────────────────────

const INGOT: Record<Metal, { top: [string, string]; face: [string, string, string]; edge: string }> = {
  GOLD: { top: ['#fff4c2', '#f4cf6a'], face: ['#f7d774', '#d9a520', '#9c6d0b'], edge: '#7a5406' },
  SILVER: { top: ['#ffffff', '#dfe4ea'], face: ['#eef1f4', '#b9c1ca', '#7d8792'], edge: '#5f6872' },
};

/** A cast bar of the metal: lit top face, shaded front, one glint. */
function MetalIngot({ metal }: { metal: Metal }) {
  const id = useId().replace(/:/g, '');
  const c = INGOT[metal];
  return (
    <svg
      data-metal={metal.toLowerCase()}
      aria-hidden
      viewBox="0 0 32 24"
      className="h-5 w-7 sm:h-6 sm:w-8 shrink-0 drop-shadow-sm"
    >
      <defs>
        <linearGradient id={`${id}-top`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c.top[0]} />
          <stop offset="1" stopColor={c.top[1]} />
        </linearGradient>
        <linearGradient id={`${id}-face`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.face[0]} />
          <stop offset="0.55" stopColor={c.face[1]} />
          <stop offset="1" stopColor={c.face[2]} />
        </linearGradient>
      </defs>
      {/* front face */}
      <path d="M2 20 L30 20 L25.5 8.5 L6.5 8.5 Z" fill={`url(#${id}-face)`} stroke={c.edge} strokeWidth="0.6" strokeLinejoin="round" />
      {/* top face */}
      <path d="M6.5 8.5 L25.5 8.5 L22 3.5 L10 3.5 Z" fill={`url(#${id}-top)`} stroke={c.edge} strokeWidth="0.6" strokeLinejoin="round" />
      {/* stamped panel and a glint */}
      <path d="M9 17 L23 17 L20.8 11.5 L11.2 11.5 Z" fill="none" stroke={c.edge} strokeOpacity="0.35" strokeWidth="0.6" />
      <path d="M11 5 L17 5" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  );
}

// ── Bar ──────────────────────────────────────────────────────────────────────

function MetalPrice({
  metal,
  base,
  priceClass,
}: {
  metal: Metal;
  base: string | null | undefined;
  priceClass: string;
}) {
  const [purity, setPurity] = usePurity(metal);
  const name = metal === 'GOLD' ? 'Gold' : 'Silver';
  const options = puritiesFor(metal);

  return (
    <div className="flex items-center justify-between sm:justify-start gap-3 py-1.5 sm:py-0">
      <div className="flex items-center gap-2 sm:gap-2.5">
        <MetalIngot metal={metal} />
        <p className="text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">{name}</p>
        <select
          aria-label={`${name} purity`}
          value={purity}
          onChange={(e) => setPurity(e.target.value)}
          className="h-6 cursor-pointer rounded-md border border-border/60 bg-background/60 px-1.5 text-[11px] font-medium text-foreground hover:border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {options.map((p) => (
            <option key={p.value} value={p.value}>
              {metal === 'GOLD' ? `${p.label} · ${p.fineness}` : p.label}
            </option>
          ))}
        </select>
      </div>
      <p
        data-testid={`${metal.toLowerCase()}-price`}
        className={`text-[15px] sm:text-xl font-semibold tabular-nums leading-tight ${priceClass}`}
      >
        {formatPrice(pricePerGram(metal, base, purity))}
        <span className="text-xs font-normal text-muted-foreground ml-1">/g</span>
      </p>
    </div>
  );
}

export function GoldSilverTopBar() {
  const { data, isFetching, error } = useQuery({
    queryKey: ['commodities-live'],
    queryFn: () => assetsApi.commoditiesLive(),
    refetchInterval: 10_000,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
    retry: 2,
  });

  const secs = useSecondsAgo(data?.fetchedAt);

  return (
    <div className="sticky top-0 z-30 mb-5 px-3.5 sm:px-5 py-2.5 sm:py-3 rounded-lg border border-border/60 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center divide-y divide-border/60 sm:divide-y-0 gap-0 sm:gap-8">
          <MetalPrice metal="GOLD" base={data?.GOLD} priceClass="text-amber-600 dark:text-amber-400" />
          <div className="hidden sm:block h-8 w-px bg-border/60" />
          <MetalPrice metal="SILVER" base={data?.SILVER} priceClass="text-slate-600 dark:text-slate-300" />
        </div>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1.5 sm:pt-0 border-t border-border/40 sm:border-t-0">
          {error && !data ? (
            <span className="text-destructive">Live feed unavailable</span>
          ) : (
            <>
              <span
                className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                  isFetching ? 'bg-amber-500 animate-pulse' : 'bg-green-500 animate-pulse'
                }`}
              />
              <span>
                {isFetching && !data
                  ? 'Loading…'
                  : `Live · updated ${freshnessLabel(secs)}`}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
