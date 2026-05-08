import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogOut, User, ChevronDown, Sun, Moon, Bell, Eye, EyeOff } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeStore } from '@/stores/theme.store';
import { usePrivacyStore } from '@/stores/privacy.store';
import { authApi } from '@/api/auth.api';
import { alertsApi } from '@/api/alerts.api';
import { cn } from '@/lib/cn';

export function Header() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user, refreshToken, clearSession } = useAuthStore();
  const { dark, toggle } = useThemeStore();
  const { hideSensitive, toggleHideSensitive } = usePrivacyStore();

  const handleLogout = async () => {
    // eslint-disable-next-line portfolioos/no-silent-catch -- best-effort revoke
    try { await authApi.logout(refreshToken); } catch { /* ignore */ }
    clearSession();
    navigate('/login', { replace: true });
  };

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['alerts-unread'],
    queryFn: () => alertsApi.getUnreadCount(),
    refetchInterval: 5 * 60 * 1000, // poll every 5 min
  });

  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <header className="relative h-16 shrink-0 border-b border-border/70 bg-card/70 backdrop-blur-md flex items-center justify-between px-6 lg:px-10">
      <div className="flex items-baseline gap-4 min-w-0">
        <div className="leading-tight min-w-0">
          <p className="text-[10px] uppercase tracking-kerned text-muted-foreground/80">
            {today}
          </p>
          <p className="text-[14px] font-medium tracking-tight text-foreground truncate">
            Welcome back,{' '}
            <span className="text-accent-ink">{user?.name ?? 'Investor'}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Alerts bell */}
        <Link
          to="/alerts"
          title="Alerts & Reminders"
          className="relative h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors focus-ring"
        >
          <Bell className="h-4 w-4" strokeWidth={1.7} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center tabular-nums shadow-sm">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggle}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="relative h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors focus-ring overflow-hidden"
        >
          <Sun className={cn('absolute h-4 w-4 transition-all', dark ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0')} strokeWidth={1.7} />
          <Moon className={cn('absolute h-4 w-4 transition-all', dark ? '-rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100')} strokeWidth={1.7} />
        </button>

        {/* Privacy toggle */}
        <button
          type="button"
          onClick={toggleHideSensitive}
          title={hideSensitive ? 'Show values' : 'Hide values'}
          aria-label={hideSensitive ? 'Show values' : 'Hide values'}
          className={cn(
            'relative h-9 w-9 rounded-md flex items-center justify-center transition-colors focus-ring overflow-hidden',
            hideSensitive
              ? 'text-accent-ink bg-accent/10 hover:bg-accent/15'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/70',
          )}
        >
          {hideSensitive ? <EyeOff className="h-4 w-4" strokeWidth={1.7} /> : <Eye className="h-4 w-4" strokeWidth={1.7} />}
        </button>

        <span className="mx-1 h-6 w-px bg-border" />

        {/* User dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              'group flex items-center gap-2.5 rounded-md pl-1.5 pr-2 py-1 hover:bg-muted/60 transition-colors focus-ring',
            )}
          >
            <div className="relative h-8 w-8 rounded-full grid place-items-center bg-gradient-to-br from-primary to-primary/85 text-primary-foreground text-[11px] font-semibold tracking-wide shadow-sm">
              {initials}
              <span className="absolute -inset-px rounded-full ring-1 ring-inset ring-foreground/5" />
            </div>
            <div className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-[12.5px] font-medium text-foreground">{user?.name}</span>
              <span className="text-[10.5px] text-muted-foreground truncate max-w-[160px]">{user?.email}</span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-y-[1px]" strokeWidth={2} />
          </button>

          {open && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute right-0 mt-2 z-20 w-60 rounded-md border border-border/70 bg-popover text-popover-foreground shadow-elev-lg py-1 reveal">
                <div className="px-3 py-2 border-b border-border/60">
                  <div className="text-[10px] uppercase tracking-kerned text-muted-foreground">Signed in as</div>
                  <div className="text-[12px] font-medium truncate">{user?.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => { setOpen(false); navigate('/settings'); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/70"
                >
                  <User className="h-4 w-4" strokeWidth={1.7} /> Profile & Settings
                </button>
                <div className="border-t border-border/60 my-1" />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-negative hover:bg-muted/70"
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.7} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
