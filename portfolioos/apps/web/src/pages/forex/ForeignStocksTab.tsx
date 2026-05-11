import { TrendingUp } from 'lucide-react';
import { SimpleAssetPage } from '@/pages/assetClasses/SimpleAssetPage';

// FOREIGN_EQUITY rides the standard HoldingProjection + Yahoo price feed. The
// price comes back in the listed currency (typically USD); we convert to INR
// via Transaction.fxRateAtTrade frozen at each trade leg for tax basis. The
// dashboard valuation uses the live USD→INR rate via the price-router fallback.
export function ForeignStocksTab() {
  return (
    <SimpleAssetPage
      title="Foreign equities"
      description="US/international shares (AAPL, MSFT, …). Yahoo price feed + INR conversion at trade time."
      icon={TrendingUp}
      assetClasses={['FOREIGN_EQUITY']}
      defaultAssetClass="FOREIGN_EQUITY"
    />
  );
}
