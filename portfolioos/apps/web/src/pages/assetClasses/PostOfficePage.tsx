import { Landmark } from 'lucide-react';
import { SimpleAssetPage } from './SimpleAssetPage';
import { PostOfficeFormDialog } from './PostOfficeFormDialog';
import type { AssetClass } from '@portfolioos/shared';

const PO_ASSET_CLASSES: AssetClass[] = [
  'NSC', 'KVP', 'SCSS', 'SSY',
  'POST_OFFICE_MIS', 'POST_OFFICE_RD', 'POST_OFFICE_TD', 'POST_OFFICE_SAVINGS',
];

export function PostOfficePage() {
  return (
    <SimpleAssetPage
      title="Post Office Schemes"
      description="NSC, KVP, SCSS, SSY, MIS, RD, TD and Savings — all India Post investments in one place."
      icon={Landmark}
      assetClasses={PO_ASSET_CLASSES}
      defaultAssetClass="NSC"
      FormComponent={PostOfficeFormDialog}
    />
  );
}
