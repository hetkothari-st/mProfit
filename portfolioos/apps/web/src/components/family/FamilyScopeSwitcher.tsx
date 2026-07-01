import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, ChevronDown, User, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { familiesApi } from '@/api/families.api';
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
    staleTime: 60_000,
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
    // Nuking the entire cache is simpler than retrofitting every query
    // key with a scope dimension. Rationale: query keys don't include
    // userId today (client.ts:257 in the exploration report) — so
    // switching identity while the cache is warm would otherwise serve
    // stale data belonging to the previous scope.
    queryClient.clear();
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
          'flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[12px] font-medium',
          'text-foreground/80 hover:text-foreground border border-border/70 bg-card/60',
          'hover:border-accent/50 transition-colors focus-ring',
        )}
        title="Switch view"
      >
        {viewingAsFamilyId ? (
          <Users className="h-3.5 w-3.5 text-accent-ink" strokeWidth={1.9} />
        ) : (
          <User className="h-3.5 w-3.5" strokeWidth={1.7} />
        )}
        <span className="max-w-[140px] truncate">{currentLabel}</span>
        <ChevronDown className="h-3 w-3 opacity-60" strokeWidth={2} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-64 rounded-md border border-border bg-popover shadow-lg z-50 py-1"
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
