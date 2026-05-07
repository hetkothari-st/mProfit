import { PiggyBank } from 'lucide-react';
import { SimpleAssetPage } from './SimpleAssetPage';
import { FDFormDialog } from './FDFormDialog';

export function FixedDepositsPage() {
  return (
    <SimpleAssetPage
      title="Fixed & Recurring Deposits"
      description="Track FDs and RDs across banks — one-time deposits or monthly installments."
      icon={PiggyBank}
      assetClasses={['FIXED_DEPOSIT', 'RECURRING_DEPOSIT']}
      defaultAssetClass="FIXED_DEPOSIT"
      FormComponent={FDFormDialog}
      formOptions={[
        { label: 'Fixed Deposit',     assetClass: 'FIXED_DEPOSIT',     FormComponent: FDFormDialog },
        { label: 'Recurring Deposit', assetClass: 'RECURRING_DEPOSIT', FormComponent: FDFormDialog },
      ]}
    />
  );
}
