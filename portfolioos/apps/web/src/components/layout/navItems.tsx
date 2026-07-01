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
  FileDown,
  Inbox,
  ArrowLeftRight,
  Coins,
  Bitcoin,
  Wallet,
  Banknote,
  CreditCard,
  HandCoins,
  Users,
  Home,
  Bug,
  Globe,
  Calculator,
  Split,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/cn';

export interface NavItem {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
}

export const ASSET_CLASS_ITEMS: NavItem[] = [
  { label: 'Bank Accounts', to: '/bank-accounts', icon: Banknote },
  { label: 'Stocks', to: '/stocks', icon: TrendingUp },
  { label: 'F & O', to: '/fo', icon: BarChart3 },
  { label: 'Mutual Funds', to: '/mutual-funds', icon: LineChart },
  { label: 'Bonds', to: '/bonds', icon: Landmark },
  { label: 'FDs & RDs', to: '/fds', icon: PiggyBank },
  { label: 'Gold & Silver', to: '/gold', icon: Coins },
  { label: 'Crypto', to: '/crypto', icon: Bitcoin },
  { label: 'Forex', to: '/forex', icon: Globe },
  { label: 'PPF & EPF', to: '/provident-fund', icon: Wallet },
  { label: 'Post Office', to: '/post-office', icon: MailOpen },
  { label: 'Real Estate', to: '/real-estate', icon: Home },
  { label: 'Rental', to: '/rental', icon: Building2 },
  { label: 'Vehicles', to: '/vehicles', icon: Car },
  { label: 'Insurance', to: '/insurance', icon: Shield },
  { label: 'Loans', to: '/loans', icon: HandCoins },
  { label: 'Credit Cards', to: '/credit-cards', icon: CreditCard },
  { label: 'Others', to: '/others', icon: Boxes },
];

export const OVERVIEW_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Analytics', to: '/analytics', icon: BarChart3 },
  { label: 'Portfolios', to: '/portfolios', icon: Briefcase },
  { label: 'Family', to: '/family', icon: Users },
  { label: 'Goals', to: '/goals', icon: Target },
  { label: 'Transactions', to: '/transactions', icon: Receipt },
  { label: 'Cash Activity', to: '/cashflows', icon: ArrowLeftRight },
];

export const NAV_SECTIONS: Array<{ heading?: string; items: NavItem[] }> = [
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
      { label: 'Tax', to: '/tax', icon: Calculator },
      { label: 'Import', to: '/import', icon: Upload },
      { label: 'Connectors', to: '/connectors', icon: Plug },
      { label: 'CAS', to: '/cas', icon: FileDown },
      { label: 'Corporate Actions', to: '/corporate-actions', icon: Split },
      { label: 'Accounting', to: '/accounting', icon: BookOpenCheck },
      { label: 'Alerts', to: '/alerts', icon: BellRing },
      { label: 'Failures (DLQ)', to: '/import/failures', icon: Bug },
      { label: 'Settings', to: '/settings', icon: Settings },
    ],
  },
];

export function NavSection({ section, collapsed }: { section: { heading?: string; items: NavItem[] }; collapsed: boolean }) {
  return (
    <div>
      {!collapsed && section.heading && (
        <div className="px-2 mb-2 flex items-center gap-2">
          <span className="text-[10.5px] uppercase tracking-kerned text-sidebar-foreground/50 font-medium">
            {section.heading}
          </span>
          <span className="flex-1 h-px bg-sidebar-border/60" />
        </div>
      )}
      <ul className={cn(collapsed ? 'flex flex-col items-center gap-1' : 'space-y-0.5')}>
        {section.items.map((item) => (
          <li key={item.to} className={collapsed ? '' : 'block'}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'group/nav nav-rail relative transition-all text-sidebar-foreground/80 hover:text-sidebar-accent-foreground',
                  collapsed
                    ? cn(
                        'flex items-center justify-center h-10 w-10 rounded-lg',
                        isActive
                          ? 'bg-accent/15 ring-1 ring-accent/40 text-accent-ink'
                          : 'hover:bg-sidebar-accent/70',
                      )
                    : cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-[14px]',
                        'hover:bg-sidebar-accent/70',
                        isActive && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
                      ),
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
                      'shrink-0 transition-colors',
                      collapsed ? 'h-[19px] w-[19px]' : 'h-[18px] w-[18px]',
                      isActive ? 'text-accent-ink' : 'text-sidebar-foreground/60 group-hover/nav:text-sidebar-accent-foreground',
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
  );
}
