import { Landmark } from 'lucide-react';
import { SimpleAssetPage } from './SimpleAssetPage';
import { BondFormDialog } from './BondFormDialog';

export function BondsPage() {
  return (
    <SimpleAssetPage
      title="Bonds"
      description="Track bonds, government securities, and corporate bonds"
      icon={Landmark}
      assetClasses={['BOND', 'GOVT_BOND', 'CORPORATE_BOND']}
      defaultAssetClass="BOND"
      FormComponent={BondFormDialog}
    />
  );
}
