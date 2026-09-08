import { Link } from 'react-router-dom';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { BudgetGauge } from './BudgetGauge';
import { UpgradeSidebarCard } from './UpgradeSidebarCard';
import { AssetClassSectionList } from './AssetClassSectionList';
import { FamilyNavTree } from './FamilyNavTree';
import { NavSection, OVERVIEW_ITEMS, ASSET_CLASS_ITEMS, NAV_SECTIONS } from './navItems';
import { Briefcase } from 'lucide-react';
import { useEntitlement } from '@/hooks/useEntitlement';

/**
 * Where each nav list was scrolled to, keyed by `scrollKey`.
 *
 * The mobile drawer lives inside a Radix portal, and Radix UNMOUNTS portal
 * children when the dialog closes. So the scrollable <nav> below is destroyed
 * on close and a fresh element is created on open — a new element starts at
 * scrollTop 0, which is why the drawer always reopened at the top. The desktop
 * sidebar never unmounts, which is why the bug is mobile-only.
 *
 * Module-level rather than localStorage on purpose: this is view state for the
 * current session, and it must be readable synchronously during layout. A full
 * page reload legitimately starts at the top.
 */
const scrollPositions = new Map<string, number>();

export function SidebarNav({
  collapsed,
  renderToggle,
  scrollKey,
}: {
  collapsed: boolean;
  renderToggle?: ReactNode;
  /**
   * Opt in to remembering this list's scroll position across unmounts. Only
   * the mobile drawer needs it; the desktop rail stays mounted and keeps its
   * own scroll for free.
   */
  scrollKey?: string;
}) {
  const navRef = useRef<HTMLElement | null>(null);
  // Practice section. Shown only to a plan that actually has the CA workspace
  // — for everyone else it is a section about a job they don't do, and an
  // upsell in the primary nav is worse than a nav without it. The Pricing
  // page is where the pitch belongs.
  const caWorkspace = useEntitlement('CA_WORKSPACE');

  // Layout effect, not effect: the restore has to land before the browser
  // paints, or the drawer visibly opens at the top and then jumps.
  useLayoutEffect(() => {
    if (!scrollKey) return;
    const el = navRef.current;
    const saved = scrollPositions.get(scrollKey);
    if (el && saved) el.scrollTop = saved;
  }, [scrollKey]);

  return (
    <div className="flex flex-col h-full">
      {/* brand mark + collapse */}
      {!collapsed ? (
        <div className="flex items-center justify-between px-4 h-[72px] border-b border-sidebar-border/70">
          <Link
            to="/dashboard"
            aria-label="Go to dashboard"
            title="Dashboard"
            className="flex items-center gap-3 min-w-0 rounded-md focus-ring transition-opacity hover:opacity-90"
          >
            <div
              aria-hidden="true"
              className="relative h-10 w-10 rounded-md grid place-items-center bg-gradient-to-br from-accent via-accent/95 to-accent/75 text-accent-foreground shadow-sm shrink-0"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 4v16" />
                <path d="M5 4h8a4.5 4.5 0 0 1 0 9H5" />
                <path d="M14 13l4 7" />
              </svg>
              <span className="absolute -inset-px rounded-md ring-1 ring-inset ring-foreground/10" />
            </div>
            <div className="leading-none min-w-0">
              <div className="flex items-baseline gap-[1px] -mt-0.5">
                <span className="font-brand text-[22px] leading-none text-sidebar-foreground">Portfolio</span>
                <span className="font-brand text-[22px] leading-none text-accent">OS</span>
              </div>
              <div className="mt-1.5 text-[9.5px] font-medium uppercase tracking-kerned text-sidebar-foreground/45">
                Wealth · Ledger
              </div>
            </div>
          </Link>
          {renderToggle}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 px-2 py-3 border-b border-sidebar-border/70">
          <Link
            to="/dashboard"
            aria-label="Go to dashboard"
            title="Dashboard"
            className="h-10 w-10 rounded-md grid place-items-center bg-gradient-to-br from-accent via-accent/95 to-accent/75 text-accent-foreground shadow-sm focus-ring transition-opacity hover:opacity-90"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 4v16" />
              <path d="M5 4h8a4.5 4.5 0 0 1 0 9H5" />
              <path d="M14 13l4 7" />
            </svg>
          </Link>
          {renderToggle}
        </div>
      )}

      <nav
        ref={navRef}
        onScroll={
          scrollKey
            ? (e) => scrollPositions.set(scrollKey, e.currentTarget.scrollTop)
            : undefined
        }
        className={cn(
          'flex-1 overflow-y-auto py-4',
          collapsed ? 'px-2 space-y-3' : 'px-3 space-y-5',
        )}
      >
        {/* Household — renders nothing at all when the user has no family. */}
        <FamilyNavTree collapsed={collapsed} />

        {/* Overview */}
        <NavSection section={{ heading: 'Overview', items: OVERVIEW_ITEMS }} collapsed={collapsed} />



        {collapsed && <div className="mx-3 h-px bg-sidebar-border/50" />}

        {/* Asset Classes — drag/hide enabled */}
        <AssetClassSectionList items={ASSET_CLASS_ITEMS} collapsed={collapsed} />

        {/* Sits at the foot of the asset-class block rather than inside it.
            That list renders from server-stored AssetSectionPref rows keyed by
            path, so an entry added to ASSET_CLASS_ITEMS with no matching
            preference simply would not appear — and being reorderable and
            hideable is wrong for a workspace holding other people's books. */}
        {caWorkspace.allowed && (
          <NavSection
            section={{ items: [{ label: 'Account Access', to: '/ca', icon: Briefcase }] }}
            collapsed={collapsed}
          />
        )}

        {/* Inbox + Tools */}
        {NAV_SECTIONS.map((section, i) => (
          <div key={i}>
            {collapsed && <div className="mx-3 h-px bg-sidebar-border/50 mb-3" />}
            <NavSection section={section} collapsed={collapsed} />
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border/70 pt-2">
        <UpgradeSidebarCard collapsed={collapsed} />
        <BudgetGauge collapsed={collapsed} />
        {!collapsed && (
          <div className="px-4 py-3 flex items-center justify-between text-[10px] uppercase tracking-kerned text-sidebar-foreground/45">
            <span>v0.5.0</span>
            <span className="h-1 w-1 rounded-full bg-accent/60" />
            <span>Phase 5-E</span>
          </div>
        )}
      </div>
    </div>
  );
}
