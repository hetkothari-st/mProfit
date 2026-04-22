import { Coins } from 'lucide-react';
import { SimpleAssetPage } from './SimpleAssetPage';
import { GoldFormDialog } from './GoldFormDialog';

export function GoldPage() {
  return (
    <SimpleAssetPage
      title="Gold & Silver"
      description="Track physical gold, sovereign gold bonds, gold ETFs, and silver"
      icon={Coins}
      assetClasses={['PHYSICAL_GOLD', 'GOLD_BOND', 'GOLD_ETF', 'PHYSICAL_SILVER']}
      defaultAssetClass="PHYSICAL_GOLD"
      FormComponent={GoldFormDialog}
    />
  );
}
