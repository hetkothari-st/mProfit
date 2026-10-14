import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { LockedFeature } from '@/components/common/LockedFeature';
import { useEntitlement } from '@/hooks/useEntitlement';
import { documentSorterApi } from '@/api/documentSorter.api';
import { apiErrorMessage } from '@/api/client';
import { SorterDropzone } from './SorterDropzone';
import { PersonFolders } from './PersonFolders';
import { countProcessing } from './treeView';

const TREE_KEY = ['doc-sorter', 'tree'] as const;

function SorterBody() {
  const qc = useQueryClient();
  const tree = useQuery({
    queryKey: TREE_KEY,
    queryFn: () => documentSorterApi.tree(),
    // Poll while anything is still being read, so folders fill in on their own.
    refetchInterval: (q) => (q.state.data && countProcessing(q.state.data) > 0 ? 3000 : false),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: TREE_KEY });

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        eyebrow="Tools"
        title="Documents"
        description="Drop your documents. We work out whose they are and what they are, file them in the right folder, and name them for you."
      />
      <SorterDropzone tree={tree.data} onUploaded={refresh} />
      {tree.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading your folders…
        </div>
      )}
      {tree.isError && <p className="text-sm text-destructive">{apiErrorMessage(tree.error, "Couldn't load your documents")}</p>}
      {tree.data && <PersonFolders tree={tree.data} onChanged={refresh} />}
    </div>
  );
}

export function DocumentSorterPage() {
  const ent = useEntitlement('DOCUMENT_SORTER');
  // Children never mount (so never call the API) while the plan is too low.
  if (ent.allowed) return <SorterBody />;
  return (
    <LockedFeature requiredTier={ent.requiredTier} featureName="Documents" compact>
      <SorterBody />
    </LockedFeature>
  );
}
