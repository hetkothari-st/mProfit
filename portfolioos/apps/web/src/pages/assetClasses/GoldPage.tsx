import { useNavigate } from 'react-router-dom';
import { Coins, Loader2 } from 'lucide-react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Decimal, priceAtPurity, type HoldingRow } from '@everypaisa/shared';
import { SimpleAssetPage } from './SimpleAssetPage';
import { GoldFormDialog } from './GoldFormDialog';
import { GoldSilverTopBar } from './GoldSilverTopBar';
import { assetsApi } from '@/api/assets.api';

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
      // Physical metal: the same purity rule the server values it with
      // (priceAtPurity), on the live per-gram rate.
      if (h.assetClass === 'PHYSICAL_GOLD' || h.assetClass === 'PHYSICAL_SILVER') {
        const base = h.assetClass === 'PHYSICAL_GOLD' ? live?.GOLD : live?.SILVER;
        if (!base) return null;
        return priceAtPurity(base, h.assetClass, h.assetName).times(new Decimal(h.quantity)).toFixed(4);
      }
      if (h.assetClass === 'GOLD_BOND') {
        // SGB: 1 unit = 1 g of 24K-equivalent gold; no carat scaling.
        if (!live?.GOLD) return null;
        return new Decimal(live.GOLD).times(new Decimal(h.quantity)).toFixed(4);
      }
      if (h.assetClass === 'GOLD_ETF') {
        // ETF NAV per unit (not per gram). Match the holding's name to a
        // known NSE gold ETF ticker for a live price; otherwise the server's
        // value stands — it prices the ETF at its own market close.
        const ticker = detectEtfTicker(h.assetName, KNOWN_GOLD_ETFS)
          ?? detectEtfTicker(h.symbol, KNOWN_GOLD_ETFS);
        const nav = ticker ? live?.etfNavs?.[ticker] : null;
        if (!nav) return null;
        return new Decimal(nav).times(new Decimal(h.quantity)).toFixed(4);
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
