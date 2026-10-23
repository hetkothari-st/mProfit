import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChevronRight, Home, Loader2, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/cn';
import { familiesApi, type MyFamily } from '@/api/family/families.api';
import { useAuthStore } from '@/stores/auth.store';
import { FAMILY_QUERY_PARAM, familyHref, pickFamilyId } from '@/lib/familySelection';

/**
 * The household, at the top of the rail.
 *
 * A family is not a feature you visit — it is a set of people whose pages you
 * move between, so it belongs in the navigation as a shape (name → members)
 * rather than as one more flat link. The family row goes to /family?family=<id>
 * (its own family, not whichever is first); each
 * member row goes to that member's page.
 *
 * MOST USERS HAVE NO FAMILY. For them this renders literally nothing — no
 * heading, no empty state, no "invite someone" nudge. A sidebar that grows a
 * permanently-empty section for a feature the user hasn't adopted is worse
 * than one that stays quiet, and the Overview section already carries a
 * "Family" link for anyone who wants to start one.
 *
 * Expansion is per family and persisted the way `Sidebar.tsx` persists its own
 * collapsed state: a plain string in localStorage, written on toggle, read once
 * in a lazy initialiser. No store, because nothing else needs to read it.
 */

const EXPANDED_KEY = 'sidebar_families_expanded';

/**
 * `null` means "the user has never touched a chevron", which is different from
 * "the user collapsed everything" — the first defaults to open (a one-family
 * household should see its members without hunting for a control), the second
 * must stay shut.
 */
function readPref(): string | null {
  return localStorage.getItem(EXPANDED_KEY);
}

/**
 * The family the Family page is showing, or null off that page. NavLink can't
 * answer this: it matches the pathname only, and every family row now shares
 * `/family` with a different `?family=` — so each would light up at once.
 */
function useOpenFamilyId(families: ReadonlyArray<{ id: string }>): string | null {
  const location = useLocation();
  if (location.pathname !== '/family') return null;
  const requested = new URLSearchParams(location.search).get(FAMILY_QUERY_PARAM);
  return pickFamilyId(families, requested);
}

export function FamilyNavTree({ collapsed }: { collapsed: boolean }) {
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const [pref, setPref] = useState<string | null>(readPref);

  // Same key as FamilyPage's own list query, so the two share one cache entry
  // and a family created/left on that page updates the rail immediately.
  const familiesQuery = useQuery({
    queryKey: ['families', 'mine'],
    queryFn: () => familiesApi.list(),
    staleTime: 60_000,
  });

  const families = familiesQuery.data ?? [];
  const openFamilyId = useOpenFamilyId(families);

  // Nothing to show, and nothing to say about it.
  if (families.length === 0) return null;

  const expandedIds = pref === null ? null : pref.split(',').filter(Boolean);
  const isExpanded = (id: string) => (expandedIds === null ? true : expandedIds.includes(id));

  function toggle(id: string) {
    const current = expandedIds ?? families.map((f) => f.id);
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    const raw = next.join(',');
    localStorage.setItem(EXPANDED_KEY, raw);
    setPref(raw);
  }

  // Icon rail: there is no room for a tree, and the member rows have no icon
  // of their own that would mean anything at 19px. Each family collapses to
  // its monogram, which still gets you to /family in one click.
  if (collapsed) {
    return (
      <div className="space-y-3">
        <ul className="flex flex-col items-center gap-1">
          {families.map((family) => (
            <li key={family.id}>
              <Link
                to={familyHref(family.id)}
                title={family.name}
                aria-current={openFamilyId === family.id ? 'page' : undefined}
                className={cn(
                  'grid h-10 w-10 place-items-center rounded-lg font-display text-[15px] transition-all',
                  openFamilyId === family.id
                    ? 'bg-accent/15 text-accent-ink ring-1 ring-accent/40'
                    : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
                )}
              >
                {monogram(family.name)}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mx-3 h-px bg-sidebar-border/50" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-0.5">
        {families.map((family) => (
          <FamilyNode
            key={family.id}
            family={family}
            expanded={isExpanded(family.id)}
            isOpen={openFamilyId === family.id}
            onToggle={() => toggle(family.id)}
            currentUserId={currentUserId}
          />
        ))}
      </ul>
      <div className="mx-3 h-px bg-sidebar-border/50" />
    </div>
  );
}

/**
 * One family: a row that both navigates and expands, plus its members.
 *
 * The two actions are deliberately separate hit targets. Clicking the name
 * goes to the household dashboard — that is what a name in a nav means.
 * Clicking the chevron only opens the branch, because wanting to see who is in
 * a family is not the same as wanting to leave the page you are on.
 */
function FamilyNode({
  family,
  expanded,
  isOpen,
  onToggle,
  currentUserId,
}: {
  family: MyFamily;
  expanded: boolean;
  /** The Family page is showing this family. */
  isOpen: boolean;
  onToggle: () => void;
  currentUserId: string | null;
}) {
  // Only fetched once the branch is open — a collapsed family costs nothing.
  // Shares FamilyPage's members key so the two never disagree.
  const membersQuery = useQuery({
    queryKey: ['families', family.id, 'members'],
    queryFn: () => familiesApi.members(family.id),
    enabled: expanded,
    staleTime: 60_000,
  });

  // PENDING invitees have no data to look at yet and REVOKED members would 403
  // on their own page; neither belongs in a list you can click.
  const members = (membersQuery.data ?? []).filter((m) => m.status === 'ACTIVE');

  const rows = [...members].sort((a, b) => {
    // The caller leads — it is the row they will click most.
    if (a.userId === currentUserId) return -1;
    if (b.userId === currentUserId) return 1;
    return (a.name || a.email || '').localeCompare(b.name || b.email || '');
  });

  return (
    <li>
      <div
        className={cn(
          'group/fam flex items-center rounded-md pr-1 transition-colors',
          'text-sidebar-foreground/85 hover:bg-sidebar-accent/70',
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${family.name}` : `Expand ${family.name}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded text-sidebar-foreground/55 hover:text-sidebar-accent-foreground focus-ring"
        >
          <ChevronRight
            className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')}
            strokeWidth={2}
          />
        </button>
        <Link
          to={familyHref(family.id)}
          title={family.name}
          aria-current={isOpen ? 'page' : undefined}
          className={cn(
            'relative flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-2 pr-2 text-[14px] focus-ring',
            isOpen && 'font-medium text-sidebar-accent-foreground',
          )}
        >
          {isOpen && (
            <span
              aria-hidden="true"
              className="absolute -left-7 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-accent"
            />
          )}
          {/* A house, not the `Users` glyph the Overview "Family" link
              already uses — two identical icons pointing at the same
              route would read as a duplicate rather than a hierarchy. */}
          <Home
            className={cn(
              'h-[17px] w-[17px] shrink-0 transition-colors',
              isOpen
                ? 'text-accent-ink'
                : 'text-sidebar-foreground/60 group-hover/fam:text-sidebar-accent-foreground',
            )}
            strokeWidth={1.7}
          />
          <span className="truncate">{family.name}</span>
        </Link>
      </div>

      {expanded && (
        // Indented under the chevron, with a hairline spine so the rows read as
        // belonging to the family above them rather than as siblings of it.
        <ul className="ml-[13px] mt-0.5 space-y-0.5 border-l border-sidebar-border/60 pl-2.5">
          {membersQuery.isLoading && (
            // Spinner occupies the same box as a member's icon, so the label
            // sits on the text axis the real rows will use and the list does
            // not jump sideways when they arrive.
            <li className="flex items-center gap-2 px-2 py-1.5 text-[12.5px] text-sidebar-foreground/45">
              <Loader2 className="h-[15px] w-[15px] shrink-0 animate-spin" strokeWidth={1.7} />
              Loading members
            </li>
          )}
          {membersQuery.isError && !membersQuery.isLoading && (
            <li className="flex items-center gap-2 px-2 py-1.5 text-[12.5px] text-sidebar-foreground/45">
              <span aria-hidden="true" className="h-[15px] w-[15px] shrink-0" />
              Couldn&apos;t load members
            </li>
          )}
          {!membersQuery.isLoading &&
            !membersQuery.isError &&
            rows.map((m) => (
              <li key={m.userId}>
                <NavLink
                  // The detail endpoint is scoped to a family, and the route
                  // isn't — so the family we came from rides along and saves
                  // the page a search across every family the caller is in.
                  to={`/family/members/${m.userId}?familyId=${family.id}`}
                  title={m.userId === currentUserId ? 'You' : m.name || m.email || undefined}
                  className={({ isActive }) =>
                    cn(
                      'group/mem flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors focus-ring',
                      isActive
                        ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* One glyph for every member, the caller included. The
                          "You" label and the first position already say which
                          row is theirs; a second icon for the same fact is
                          noise, not emphasis. Smaller than the family's, so
                          the nesting is legible even mid-scroll. */}
                      <User
                        className={cn(
                          'h-[15px] w-[15px] shrink-0 transition-colors',
                          isActive
                            ? 'text-accent-ink'
                            : 'text-sidebar-foreground/45 group-hover/mem:text-sidebar-accent-foreground',
                        )}
                        strokeWidth={1.7}
                      />
                      <span className="truncate">
                        {m.userId === currentUserId ? 'You' : m.name || m.email}
                      </span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
        </ul>
      )}
    </li>
  );
}

/** First letter of the family's name, for the icon rail. */
function monogram(name: string): string {
  const first = name.trim().charAt(0);
  return first ? first.toUpperCase() : '·';
}
