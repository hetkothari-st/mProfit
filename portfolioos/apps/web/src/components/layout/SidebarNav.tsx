import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { BudgetGauge } from './BudgetGauge';
import { AssetClassSectionList } from './AssetClassSectionList';
import { NavSection, OVERVIEW_ITEMS, ASSET_CLASS_ITEMS, NAV_SECTIONS } from './navItems';

export function SidebarNav({
  collapsed,
  renderToggle,
}: {
  collapsed: boolean;
  renderToggle?: ReactNode;
}) {
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
                <span className="font-brand text-[22px] leading-none text-accent-ink">OS</span>
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
        className={cn(
          'flex-1 overflow-y-auto py-4',
          collapsed ? 'px-2 space-y-3' : 'px-3 space-y-5',
        )}
      >
        {/* Overview */}
        <NavSection section={{ heading: 'Overview', items: OVERVIEW_ITEMS }} collapsed={collapsed} />

        {collapsed && <div className="mx-3 h-px bg-sidebar-border/50" />}

        {/* Asset Classes — drag/hide enabled */}
        <AssetClassSectionList items={ASSET_CLASS_ITEMS} collapsed={collapsed} />

        {/* Inbox + Tools */}
        {NAV_SECTIONS.map((section, i) => (
          <div key={i}>
            {collapsed && <div className="mx-3 h-px bg-sidebar-border/50 mb-3" />}
            <NavSection section={section} collapsed={collapsed} />
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border/70">
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
