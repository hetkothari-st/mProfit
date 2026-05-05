import { Wallet } from 'lucide-react';
import { SimpleAssetPage } from './SimpleAssetPage';
import { PPFFormDialog } from './PPFNpsFormDialog';
import { EPFFormDialog } from './EPFFormDialog';

export function ProvidentFundPage() {
  return (
    <SimpleAssetPage
      title="Provident Fund"
      description="Track your PPF and EPF balances, contributions, and interest"
      icon={Wallet}
      assetClasses={['PPF', 'EPF']}
      defaultAssetClass="PPF"
      formOptions={[
        { label: 'PPF entry', assetClass: 'PPF', FormComponent: PPFFormDialog },
        { label: 'EPF entry', assetClass: 'EPF', FormComponent: EPFFormDialog },
      ]}
    />
  );
}
