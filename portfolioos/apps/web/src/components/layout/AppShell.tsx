import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNavDrawer } from './MobileNavDrawer';
import { MobileTabBar } from './MobileTabBar';
import { GmailAutoConnectBanner } from './GmailAutoConnectBanner';
import { ScanProvider } from '@/context/ScanContext';
import { usePrivacyStore } from '@/stores/privacy.store';
import { useFamilyScopeStore } from '@/stores/familyScope.store';
import { useTokenRefresh } from '@/hooks/useTokenRefresh';
import { AssistantButton } from '@/components/ai/AssistantButton';

export function AppShell() {
  const { hideSensitive } = usePrivacyStore();
  // The family scope switch changes what data the app should render,
  // but query keys don't carry the scope dimension — invalidating the
  // react-query cache alone isn't enough to force every page to
  // re-fetch under the new X-Viewing-As-Family header. Bumping this
  // as a `key` on the Outlet unmounts + remounts the current page,
  // guaranteeing every useQuery starts fresh with the new scope.
  const viewingAsFamilyId = useFamilyScopeStore((s) => s.viewingAsFamilyId);
  useTokenRefresh();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes (e.g. user taps a nav link).
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  return (
    <ScanProvider>
      <div className={`h-screen flex overflow-hidden bg-background ${hideSensitive ? 'privacy-mask' : ''}`}>
        <Sidebar />
        <MobileNavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header onOpenMenu={() => setDrawerOpen(true)} />
          <GmailAutoConnectBanner />
          <main className="flex-1 overflow-y-auto">
            <div
              key={viewingAsFamilyId ?? '__personal__'}
              className="mx-auto w-full max-w-[1480px] px-6 py-7 lg:px-10 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] md:pb-7"
            >
              <Outlet />
            </div>
          </main>
        </div>
        <MobileTabBar onOpenMenu={() => setDrawerOpen(true)} />
        <AssistantButton />
      </div>
    </ScanProvider>
  );
}
