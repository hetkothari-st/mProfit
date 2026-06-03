import { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SidebarNav } from './SidebarNav';

export { ASSET_CLASS_ITEMS } from './navItems';

const SIDEBAR_KEY = 'sidebar_collapsed';

export function Sidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(SIDEBAR_KEY) === 'true',
  );

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      return next;
    });
  }

  const toggle = (
    <button
      type="button"
      onClick={toggleCollapsed}
      className={cn(
        'p-1.5 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors focus-ring',
        collapsed && 'absolute top-4 right-2',
      )}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
    </button>
  );

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-200 relative',
        collapsed ? 'w-[72px]' : 'w-64',
      )}
    >
      <SidebarNav collapsed={collapsed} renderToggle={toggle} />
    </aside>
  );
}
