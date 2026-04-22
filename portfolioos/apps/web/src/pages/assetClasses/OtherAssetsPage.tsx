import { Boxes } from 'lucide-react';
import { SimpleAssetPage } from './SimpleAssetPage';
import { OtherAssetFormDialog } from './OtherAssetFormDialog';

export function OtherAssetsPage() {
  return (
    <SimpleAssetPage
      title="Other Assets"
      description="Track PMS, AIF, ULIP, REIT, InvIT, crypto, real estate, and more"
      icon={Boxes}
      assetClasses={[
        'PMS', 'AIF', 'ULIP',
        'CRYPTOCURRENCY', 'REIT', 'INVIT',
        'REAL_ESTATE', 'ART_COLLECTIBLES', 'CASH', 'OTHER',
      ]}
      defaultAssetClass="OTHER"
      FormComponent={OtherAssetFormDialog}
    />
  );
}
