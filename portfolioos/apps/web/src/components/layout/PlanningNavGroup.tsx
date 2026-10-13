import { useState } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NavSection, PLANNING_ITEMS } from './navItems';

/**
 * The Planning group: Goals, Will Maker, Tax Planning. Open by default; the
 * open/closed choice is a per-browser convenience in localStorage, the same
 * way Sidebar.tsx keeps its collapsed state. Storage can be blocked (private
 * mode, policy), so every access is guarded and the group then simply starts
 * open and toggles for the session. On the icon rail there is no room for a
 * header, so the three icons are shown flat.
 */
export const PLANNING_OPEN_KEY = 'sidebar_planning_open';

export function readPlanningOpen(): boolean {
  try {
    return localStorage.getItem(PLANNING_OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

function writePlanningOpen(open: boolean): void {
  // eslint-disable-next-line everypaisa/no-silent-catch -- view preference only; blocked storage is fine
  try {
    localStorage.setItem(PLANNING_OPEN_KEY, open ? '1' : '0');
  } catch {
    // Storage blocked: the choice lasts for this page view only, which is fine for a view preference.
  }
}

export function PlanningNavGroup({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(readPlanningOpen);
  const { pathname } = useLocation();

  if (collapsed) return <NavSection section={{ items: PLANNING_ITEMS }} collapsed />;

  const activeInside = PLANNING_ITEMS.some((i) => matchPath({ path: i.to, end: false }, pathname) !== null);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    writePlanningOpen(next);
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="nav-planning-items"
        className="group/plan mb-2 flex w-full items-center gap-2 rounded-md px-2 py-0.5 text-left focus-ring"
      >
        <span className="text-[10.5px] font-medium uppercase tracking-kerned text-sidebar-foreground/50 group-hover/plan:text-sidebar-foreground/80">
          Planning
        </span>
        {!open && activeInside && (
          <span aria-hidden="true" data-testid="planning-active-dot" className="h-1.5 w-1.5 rounded-full bg-accent" />
        )}
        <span aria-hidden="true" className="h-px flex-1 bg-sidebar-border/60" />
        <ChevronRight
          aria-hidden="true"
          className={cn('h-3.5 w-3.5 text-sidebar-foreground/50 transition-transform', open && 'rotate-90')}
        />
      </button>
      {open && (
        <div id="nav-planning-items">
          <NavSection section={{ items: PLANNING_ITEMS }} collapsed={false} />
        </div>
      )}
    </div>
  );
}
