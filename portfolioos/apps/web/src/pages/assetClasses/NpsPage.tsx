import { ShieldCheck } from 'lucide-react';
import { SimpleAssetPage } from './SimpleAssetPage';
import { NpsFormDialog } from './PPFNpsFormDialog';

export function NpsPage() {
  return (
    <SimpleAssetPage
      title="NPS"
      description="Track your National Pension System PRAN and scheme allocations"
      icon={ShieldCheck}
      assetClasses={['NPS']}
      defaultAssetClass="NPS"
      FormComponent={NpsFormDialog}
    />
  );
}
