import { PiggyBank } from 'lucide-react';
import { SimpleAssetPage } from './SimpleAssetPage';

export function FixedDepositsPage() {
  return (
    <SimpleAssetPage
      title="Fixed Deposits"
      description="Track FDs and recurring deposits across banks"
      icon={PiggyBank}
      assetClasses={['FIXED_DEPOSIT']}
      defaultAssetClass="FIXED_DEPOSIT"
    />
  );
}
