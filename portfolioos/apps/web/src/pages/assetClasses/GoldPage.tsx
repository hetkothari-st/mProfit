import { useNavigate } from 'react-router-dom';
import { Coins, Loader2 } from 'lucide-react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { HoldingRow } from '@everypaisa/shared';
import { SimpleAssetPage } from './SimpleAssetPage';
import { GoldFormDialog } from './GoldFormDialog';
import { GoldSilverTopBar } from './GoldSilverTopBar';
import { assetsApi } from '@/api/assets.api';

export function GoldPage() {
  const navigate = useNavigate();

  // Polled for the live indicator; the rates themselves show in GoldSilverTopBar.
  const { isFetching } = useQuery({
    queryKey: ['commodities-live'],
    queryFn: () => assetsApi.commoditiesLive(),
    refetchInterval: 10_000,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
    retry: 2,
  });

  // Holdings are valued at the server's stored price, as on the dashboard,
  // Analytics and the Will Maker. The live rates poll in the top bar as market
  // information; valuing at them here put a different number on this page.
  function handleHoldingClick(h: HoldingRow & { portfolioName: string }) {
    navigate(`/gold/${h.id}`, { state: { holding: h } });
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
      liveIndicator={liveIndicator}
      onHoldingClick={handleHoldingClick}
      topSlot={<GoldSilverTopBar />}
    />
  );
}
