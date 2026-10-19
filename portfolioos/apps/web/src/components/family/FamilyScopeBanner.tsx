import { useQuery } from '@tanstack/react-query';
import { Users, X } from 'lucide-react';
import { familiesApi } from '@/api/family/families.api';
import { useFamilyScopeStore } from '@/stores/familyScope.store';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Small strip shown at the top of scope-aware pages (Dashboard,
 * Portfolios) when the "Viewing as" family switcher is active. Gives
 * users a visible confirmation that the family scope is applied — the
 * dashboard's aggregate numbers only differ from personal when members
 * have data, so without this banner an OWNER inviting an empty new
 * member sees no dashboard change and thinks the switch is broken.
 *
 * Also shows the family role + member count, and offers a one-click
 * exit back to Personal view (matches Header switcher semantics).
 */
export function FamilyScopeBanner() {
  const queryClient = useQueryClient();
  const { viewingAsFamilyId, viewingAsFamilyName, clear } = useFamilyScopeStore();

  const membersQuery = useQuery({
    queryKey: ['families', viewingAsFamilyId, 'members'],
    queryFn: () => familiesApi.members(viewingAsFamilyId!),
    enabled: !!viewingAsFamilyId,
    staleTime: 30_000,
  });
  const familiesQuery = useQuery({
    queryKey: ['families', 'mine'],
    queryFn: () => familiesApi.list(),
    staleTime: 30_000,
    enabled: !!viewingAsFamilyId,
  });

  if (!viewingAsFamilyId) return null;

  const members = membersQuery.data ?? [];
  const active = members.filter((m) => m.status === 'ACTIVE');
  const currentFamily = familiesQuery.data?.find((f) => f.id === viewingAsFamilyId);

  const exitScope = () => {
    clear();
    queryClient.removeQueries();
    void queryClient.invalidateQueries();
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-sm">
      <Users className="h-4 w-4 text-accent" strokeWidth={1.9} />
      <div className="flex-1 min-w-0">
        <span className="font-medium">{viewingAsFamilyName ?? currentFamily?.name ?? 'Family view'}</span>
        <span className="text-muted-foreground">
          {currentFamily && (
            <>
              {' · '}
              <span className="uppercase tracking-kerned text-[11px]">
                {currentFamily.role.toLowerCase()}
              </span>
            </>
          )}
          {active.length > 0 && (
            <>
              {' · '}
              {active.length} member{active.length === 1 ? '' : 's'}
            </>
          )}
        </span>
      </div>
      <button
        type="button"
        onClick={exitScope}
        className="text-[11px] uppercase tracking-kerned text-muted-foreground hover:text-foreground flex items-center gap-1"
        title="Exit family view"
      >
        Personal view <X className="h-3 w-3" strokeWidth={2} />
      </button>
    </div>
  );
}
