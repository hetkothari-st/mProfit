import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  TrendingUp,
  LineChart,
  BarChart3,
  Landmark,
  MailOpen,
  PiggyBank,
  // ShieldCheck — unused while NPS nav item is disabled
  Boxes,
  Car,
  Building2,
  Shield,
  FileText,
  Upload,
  BookOpenCheck,
  BellRing,
  Settings,
  Receipt,
  Plug,
  // Mail,
  FileDown,
  Inbox,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowLeftRight,
  Coins,
  Wallet,
  CreditCard,
  HandCoins,
  Home,
  Bug,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { BudgetGauge } from './BudgetGauge';

interface NavItem {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
}

const NAV_SECTIONS: Array<{ heading?: string; items: NavItem[] }> = [
  {
    heading: 'Overview',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
      { label: 'Portfolios', to: '/portfolios', icon: Briefcase },
      { label: 'Transactions', to: '/transactions', icon: Receipt },
      { label: 'Cash Activity', to: '/cashflows', icon: ArrowLeftRight },
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
      { label: 'Gold & Silver', to: '/gold', icon: Coins },
      { label: 'PPF & EPF', to: '/provident-fund', icon: Wallet },
      // NPS — disabled until NSDL CRA adapter lands (§10.2)
      // { label: 'NPS', to: '/nps', icon: ShieldCheck },
      { label: 'Post Office', to: '/post-office', icon: MailOpen },
      { label: 'Real Estate', to: '/real-estate', icon: Home },
      { label: 'Rental', to: '/rental', icon: Building2 },
      { label: 'Vehicles', to: '/vehicles', icon: Car },
      { label: 'Insurance', to: '/insurance', icon: Shield },
      { label: 'Loans', to: '/loans', icon: HandCoins },
      { label: 'Credit Cards', to: '/credit-cards', icon: CreditCard },
      { label: 'Others', to: '/others', icon: Boxes },
    ],
  },
  {
    heading: 'Inbox',
    items: [
      { label: 'Connect your Gmail', to: '/ingestion', icon: Inbox },
    ],
  },
  {
    heading: 'Tools',
    items: [
      { label: 'Reports', to: '/reports', icon: FileText },
      { label: 'Import', to: '/import', icon: Upload },
      { label: 'Connectors', to: '/connectors', icon: Plug },
      { label: 'CAS', to: '/cas', icon: FileDown },
      { label: 'Accounting', to: '/accounting', icon: BookOpenCheck },
      { label: 'Alerts', to: '/alerts', icon: BellRing },
      { label: 'Failures (DLQ)', to: '/import/failures', icon: Bug },
      { label: 'Settings', to: '/settings', icon: Settings },
    ],
  },
];

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

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-200 relative',
        collapsed ? 'w-[72px]' : 'w-64',
      )}
    >
      {/* brand mark + collapse */}
      <div className="flex items-center justify-between px-4 h-[72px] border-b border-sidebar-border/70">
        {!collapsed && (
          <div className="flex items-center gap-3 min-w-0">
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
          </div>
        )}
        {collapsed && (
          <div
            aria-hidden="true"
            className="mx-auto h-10 w-10 rounded-md grid place-items-center bg-gradient-to-br from-accent via-accent/95 to-accent/75 text-accent-foreground shadow-sm"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 4v16" />
              <path d="M5 4h8a4.5 4.5 0 0 1 0 9H5" />
              <path d="M14 13l4 7" />
            </svg>
          </div>
        )}
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
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {NAV_SECTIONS.map((section, sectionIdx) => (
          <div key={sectionIdx}>
            {!collapsed && section.heading && (
              <div className="px-2 mb-2 flex items-center gap-2">
                <span className="text-[10.5px] uppercase tracking-kerned text-sidebar-foreground/50 font-medium">
                  {section.heading}
                </span>
                <span className="flex-1 h-px bg-sidebar-border/60" />
              </div>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'group/nav nav-rail relative flex items-center gap-3 rounded-md px-3 py-2 text-[14px] transition-all',
                        'text-sidebar-foreground/80 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/70',
                        isActive &&
                          'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
                        collapsed && 'justify-center px-2',
                      )
                    }
                    title={collapsed ? item.label : undefined}
                    end={item.to === '/dashboard'}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && !collapsed && (
                          <span
                            aria-hidden="true"
                            className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-accent"
                          />
                        )}
                        <item.icon
                          className={cn(
                            'h-[18px] w-[18px] shrink-0 transition-colors',
                            isActive ? 'text-accent' : 'text-sidebar-foreground/60 group-hover/nav:text-sidebar-accent-foreground',
                          )}
                          strokeWidth={1.7}
                        />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
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
    </aside>
  );
}
