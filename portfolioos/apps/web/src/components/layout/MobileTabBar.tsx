import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Briefcase, Receipt, BarChart3, Menu } from 'lucide-react';
import { cn } from '@/lib/cn';

const TABS = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, end: true },
  { label: 'Portfolios', to: '/portfolios', icon: Briefcase, end: false },
  { label: 'Transactions', to: '/transactions', icon: Receipt, end: false },
  { label: 'Analytics', to: '/analytics', icon: BarChart3, end: false },
];

export function MobileTabBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-md border-t border-border/70 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-0.5 h-14 text-[10px] font-medium transition-colors',
                  isActive ? 'text-accent' : 'text-muted-foreground',
                )
              }
            >
              <t.icon className="h-5 w-5" strokeWidth={1.7} />
              <span>{t.label}</span>
            </NavLink>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="More navigation"
            className="w-full flex flex-col items-center justify-center gap-0.5 h-14 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Menu className="h-5 w-5" strokeWidth={1.7} />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
