import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, ChevronDown, User, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { familiesApi } from '@/api/family/families.api';
import { useFamilyScopeStore } from '@/stores/familyScope.store';

/**
 * "Viewing as" family switcher in the Header. Personal view + one row
 * per family the caller is an ACTIVE/PENDING member of. Changing the
 * selection updates the persisted store AND calls queryClient.clear()
 * so cached data from the previous scope doesn't bleed across.
 *
 * Hidden when the user is a member of zero families (solo user); no
 * point in a switcher with a single "Personal" option.
 */
export function FamilyScopeSwitcher() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { viewingAsFamilyId, viewingAsFamilyName, setFamily } = useFamilyScopeStore();

  const familiesQuery = useQuery({
    queryKey: ['families', 'mine'],
    queryFn: () => familiesApi.list(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const families = familiesQuery.data ?? [];
  // Solo user — no switcher. Once they've been invited or created a
  // family, the query refetches on staleTime and this becomes visible.
  if (families.length === 0) return null;

  const activeFamilies = families.filter((f) => f.status === 'ACTIVE');
  if (activeFamilies.length === 0) return null;

  const switchTo = (id: string | null, name: string | null) => {
    setFamily(id, name);
    setOpen(false);
    // Query keys don't include the family scope dimension, so we have
    // to force every cached query to refetch under the new
    // X-Viewing-As-Family header. `clear()` alone empties the cache
    // but leaves mounted observers stuck on their last data — user
    // sees no change until manual reload. Two-step is more reliable:
    //   1. remove non-active queries (frees memory, drops stale keys),
    //   2. invalidate everything → every active useQuery refetches now.
    queryClient.removeQueries();
    void queryClient.invalidateQueries();
  };

  const currentLabel = viewingAsFamilyId
    ? viewingAsFamilyName ??
      activeFamilies.find((f) => f.id === viewingAsFamilyId)?.name ??
      'Family'
    : 'Personal';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-1.5 h-9 w-9 sm:h-8 sm:w-auto justify-center sm:px-2.5 rounded-md text-[12px] font-medium shrink-0',
          'text-foreground/80 hover:text-foreground sm:border sm:border-border/70 sm:bg-card/60',
          'hover:bg-muted/70 sm:hover:bg-card/60 sm:hover:border-accent/50 transition-colors focus-ring',
        )}
        title="Switch view"
      >
        {viewingAsFamilyId ? (
          <Users className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-accent-ink shrink-0" strokeWidth={1.9} />
        ) : (
          <User className="h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0" strokeWidth={1.7} />
        )}
        <span className="hidden sm:inline max-w-[140px] truncate">{currentLabel}</span>
        <ChevronDown className="hidden sm:block h-3 w-3 opacity-60 shrink-0" strokeWidth={2} />
      </button>

      {open && (
        <div
          className="fixed left-3 right-3 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-64 rounded-md border border-border bg-popover shadow-lg z-50 py-1"
          role="menu"
        >
          <button
            role="menuitem"
            onClick={() => switchTo(null, null)}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-muted/60',
              !viewingAsFamilyId && 'text-accent-ink',
            )}
          >
            <User className="h-3.5 w-3.5" strokeWidth={1.7} />
            <span className="flex-1">Personal view</span>
            {!viewingAsFamilyId && <Check className="h-3.5 w-3.5" strokeWidth={2} />}
          </button>
          {activeFamilies.length > 0 && (
            <div className="my-1 border-t border-border/60" />
          )}
          {activeFamilies.map((f) => (
            <button
              key={f.id}
              role="menuitem"
              onClick={() => switchTo(f.id, f.name)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-muted/60',
                viewingAsFamilyId === f.id && 'text-accent-ink',
              )}
            >
              <Users className="h-3.5 w-3.5" strokeWidth={1.7} />
              <div className="flex-1 min-w-0">
                <div className="truncate">{f.name}</div>
                <div className="text-[10px] uppercase tracking-kerned text-muted-foreground">
                  {f.role.toLowerCase()}
                </div>
              </div>
              {viewingAsFamilyId === f.id && (
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
