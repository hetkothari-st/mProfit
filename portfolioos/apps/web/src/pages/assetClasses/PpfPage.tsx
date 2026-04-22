import { BookOpen } from 'lucide-react';
import { SimpleAssetPage } from './SimpleAssetPage';

export function PpfPage() {
  return (
    <SimpleAssetPage
      title="PPF"
      description="Track your Public Provident Fund contributions and interest"
      icon={BookOpen}
      assetClasses={['PPF']}
      defaultAssetClass="PPF"
    />
  );
}
