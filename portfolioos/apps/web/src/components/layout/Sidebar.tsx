import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  TrendingUp,
  LineChart,
  BarChart3,
  Landmark,
  PiggyBank,
  ShieldCheck,
  Boxes,
  FileText,
  Upload,
  BookOpenCheck,
  BellRing,
  Settings,
  Receipt,
  Plug,
  Mail,
  FileDown,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';

interface NavItem {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
}

const NAV_SECTIONS: Array<{ heading?: string; items: NavItem[] }> = [
  {
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
      { label: 'Portfolios', to: '/portfolios', icon: Briefcase },
      { label: 'Transactions', to: '/transactions', icon: Receipt },
    ],
  },
  {
    heading: 'Asset Classes',
    items: [
      { label: 'Stocks', to: '/stocks', icon: TrendingUp },
      { label: 'Mutual Funds', to: '/mutual-funds', icon: LineChart },
      { label: 'F & O', to: '/fo', icon: BarChart3 },
      { label: 'Bonds', to: '/bonds', icon: Landmark },
      { label: 'Fixed Deposits', to: '/fds', icon: PiggyBank },
      { label: 'NPS', to: '/nps', icon: ShieldCheck },
      { label: 'Others', to: '/others', icon: Boxes },
    ],
  },
  {
    heading: 'Tools',
    items: [
      { label: 'Reports', to: '/reports', icon: FileText },
      { label: 'Import', to: '/import', icon: Upload },
      { label: 'Connectors', to: '/connectors', icon: Plug },
      { label: 'Mailbox', to: '/mailboxes', icon: Mail },
      { label: 'CAS', to: '/cas', icon: FileDown },
      { label: 'Accounting', to: '/accounting', icon: BookOpenCheck },
      { label: 'Alerts', to: '/alerts', icon: BellRing },
      { label: 'Settings', to: '/settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-200',
        collapsed ? 'w-[72px]' : 'w-64',
      )}
    >
      <div className="flex items-center justify-between px-4 h-16 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-accent grid place-items-center text-accent-foreground font-bold">
              P
            </div>
            <span className="font-semibold tracking-tight">PortfolioOS</span>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto h-8 w-8 rounded-md bg-accent grid place-items-center text-accent-foreground font-bold">
            P
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className={cn(
            'p-1.5 rounded-md hover:bg-sidebar-accent transition-colors',
            collapsed && 'absolute top-4 right-2',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-4">
        {NAV_SECTIONS.map((section, sectionIdx) => (
          <div key={sectionIdx}>
            {!collapsed && section.heading && (
              <div className="px-3 mb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
                {section.heading}
              </div>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        isActive &&
                          'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
                        collapsed && 'justify-center px-2',
                      )
                    }
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="px-4 py-3 border-t border-sidebar-border text-xs text-sidebar-foreground/60">
          v0.3.0 · Phase 3
        </div>
      )}
    </aside>
  );
}
