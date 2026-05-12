import { useNavigate } from 'react-router-dom';
import { Coins, Loader2 } from 'lucide-react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Decimal, type HoldingRow } from '@portfolioos/shared';
import { SimpleAssetPage } from './SimpleAssetPage';
import { GoldFormDialog } from './GoldFormDialog';
import { GoldSilverTopBar } from './GoldSilverTopBar';
import { assetsApi } from '@/api/assets.api';

function detectCarat(assetName: string | null | undefined): number {
  if (!assetName) return 24;
  const m = assetName.match(/\b(\d+)\s*[kK]\b/);
  if (m) { const k = parseInt(m[1]!, 10); if (k >= 6 && k <= 24) return k; }
  return 24;
}

function detectSilverPurity(assetName: string | null | undefined): string {
  if (!assetName) return '1';
  const m = assetName.match(/^(999|925|800)\b/);
  if (m) return ({ '999': '1', '925': '0.925', '800': '0.8' } as Record<string, string>)[m[1]!] ?? '1';
  return '1';
}

const KNOWN_GOLD_ETFS = /\b(GOLDBEES|GOLDIETF|AXISGOLD|HDFCGOLD|KOTAKGOLD|SETFGOLD|LICMFGOLD|QGOLDHALF)\b/;
const KNOWN_SILVER_ETFS = /\b(SILVERBEES|SILVERIETF)\b/;

function detectEtfTicker(assetName: string | null | undefined, pattern: RegExp): string | null {
  if (!assetName) return null;
  const m = assetName.toUpperCase().match(pattern);
  return m ? m[1] ?? null : null;
}

export function GoldPage() {
  const navigate = useNavigate();

  const { data: live, isFetching } = useQuery({
    queryKey: ['commodities-live'],
    queryFn: () => assetsApi.commoditiesLive(),
    refetchInterval: 10_000,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
    retry: 2,
  });

  function computeLiveValue(h: HoldingRow & { portfolioName: string }): string | null {
    try {
      if (h.assetClass === 'PHYSICAL_GOLD') {
        if (!live?.GOLD) return null;
        return new Decimal(live.GOLD).times(detectCarat(h.assetName)).div(24).times(new Decimal(h.quantity)).toFixed(4);
      }
      if (h.assetClass === 'GOLD_BOND') {
        // SGB: 1 unit = 1 g of 24K-equivalent gold; no carat scaling.
        if (!live?.GOLD) return null;
        return new Decimal(live.GOLD).times(new Decimal(h.quantity)).toFixed(4);
      }
      if (h.assetClass === 'GOLD_ETF') {
        // ETF NAV per unit (not per gram). Match the holding's name to a
        // known NSE gold ETF ticker; fall back to whatever the DB has.
        const ticker = detectEtfTicker(h.assetName, KNOWN_GOLD_ETFS)
          ?? detectEtfTicker(h.symbol, KNOWN_GOLD_ETFS);
        const nav = ticker ? live?.etfNavs?.[ticker] : null;
        if (!nav) return null;
        return new Decimal(nav).times(new Decimal(h.quantity)).toFixed(4);
      }
      if (h.assetClass === 'PHYSICAL_SILVER') {
        if (!live?.SILVER) return null;
        return new Decimal(live.SILVER).times(detectSilverPurity(h.assetName)).times(new Decimal(h.quantity)).toFixed(4);
      }
    } catch { return null; }
    return null;
  }

  function handleHoldingClick(h: HoldingRow & { portfolioName: string }) {
    const liveVal = computeLiveValue(h);
    navigate(`/gold/${h.id}`, {
      state: { holding: { ...h, currentValue: liveVal ?? h.currentValue } },
    });
  }

  const liveIndicator = (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
      {isFetching
        ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
        : <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
      }
      live
    </span>
  );

  return (
    <SimpleAssetPage
      title="Gold & Silver"
      description="Track physical gold, sovereign gold bonds, gold ETFs, and silver"
      icon={Coins}
      assetClasses={['PHYSICAL_GOLD', 'GOLD_BOND', 'GOLD_ETF', 'PHYSICAL_SILVER']}
      defaultAssetClass="PHYSICAL_GOLD"
      FormComponent={GoldFormDialog}
      computeLiveValue={computeLiveValue}
      liveIndicator={liveIndicator}
      onHoldingClick={handleHoldingClick}
      topSlot={<GoldSilverTopBar />}
    />
  );
}
