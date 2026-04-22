import { Wallet } from 'lucide-react';
import { SimpleAssetPage } from './SimpleAssetPage';

export function EpfPage() {
  return (
    <SimpleAssetPage
      title="EPF"
      description="Track your Employee Provident Fund balance and contributions"
      icon={Wallet}
      assetClasses={['EPF']}
      defaultAssetClass="EPF"
    />
  );
}
