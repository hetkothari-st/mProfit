import { Hammer } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <EmptyState
        icon={Hammer}
        title={`${title} — coming in a later phase`}
        description="This module is planned for a subsequent phase per the build spec. Stay tuned!"
      />
    </div>
  );
}
