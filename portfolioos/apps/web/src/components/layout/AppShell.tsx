import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNavDrawer } from './MobileNavDrawer';
import { MobileTabBar } from './MobileTabBar';
import { GmailAutoConnectBanner } from './GmailAutoConnectBanner';
import { ActingAsBanner } from '@/components/family/ActingAsBanner';
import { useActingAsStore } from '@/stores/actingAs.store';
import { ScanProvider } from '@/context/ScanContext';
import { usePrivacyStore } from '@/stores/privacy.store';
import { useFamilyScopeStore } from '@/stores/familyScope.store';
import { useTokenRefresh } from '@/hooks/useTokenRefresh';
import { AssistantButton } from '@/components/ai/AssistantButton';

export function AppShell() {
  const { hideSensitive } = usePrivacyStore();
  // Remounts the page on a scope switch so LOCAL component state resets:
  // filter selections, page numbers, expanded rows. "Page 3 of the family's
  // transactions" is meaningless once you are back in the personal view.
  //
  // This does NOT make the data correct on its own, though it was once
  // believed to. A remounted useQuery still finds a cache entry that is fresh
  // under staleTime and serves it without refetching, so the previous scope's
  // rows survived the remount. Cache correctness comes from the scope-aware
  // queryKeyHashFn in main.tsx; this key only handles view state.
  const viewingAsFamilyId = useFamilyScopeStore((s) => s.viewingAsFamilyId);
  // Same reason, for switching into a managed family member's account.
  const actingId = useActingAsStore((s) => s.profile?.id ?? null);
  useTokenRefresh();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes (e.g. user taps a nav link).
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Pages scroll inside <main>, not the window, so neither the browser nor the
  // router resets it between pages. A page whose data was already cached
  // rendered at full height instantly and kept the previous page's scroll
  // offset — on a phone that usually meant landing at the bottom.
  const mainRef = useRef<HTMLElement>(null);
  const navigationType = useNavigationType();
  // Where each history entry was scrolled to, recorded as the user scrolls, so
  // Back can put them where they were.
  const scrollByKey = useRef(new Map<string, number>());
  const currentKey = useRef(location.key);
  const prevPathname = useRef(location.pathname);
  useLayoutEffect(() => {
    const main = mainRef.current;
    currentKey.current = location.key;
    const samePage = prevPathname.current === location.pathname;
    prevPathname.current = location.pathname;
    if (!main) return;
    if (location.hash) {
      // A link to a section (e.g. #claims): let the page render, then go there.
      const id = decodeURIComponent(location.hash.slice(1));
      requestAnimationFrame(() => {
        const target = document.getElementById(id);
        if (target) target.scrollIntoView();
        else if (!samePage) main.scrollTop = 0;
      });
      return;
    }
    if (navigationType === 'POP') {
      main.scrollTop = scrollByKey.current.get(location.key) ?? 0;
    } else if (!samePage) {
      // A new page starts at the top. Search-param changes on the same page
      // (tabs, filters) keep their place.
      main.scrollTop = 0;
    }
  }, [location.key, location.pathname, location.hash, navigationType]);

  return (
    <ScanProvider>
      <div className={`h-dvh flex overflow-hidden bg-background pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] ${hideSensitive ? 'privacy-mask' : ''}`}>
        <Sidebar />
        <MobileNavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header onOpenMenu={() => setDrawerOpen(true)} />
          <ActingAsBanner />
          <GmailAutoConnectBanner />
          <main
            ref={mainRef}
            onScroll={(e) => scrollByKey.current.set(currentKey.current, e.currentTarget.scrollTop)}
            className="flex-1 overflow-y-auto overflow-x-hidden"
          >
            <div
              key={`${viewingAsFamilyId ?? '__personal__'}:${actingId ?? '__self__'}`}
              className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 sm:py-7 lg:px-10 pb-[calc(3.5rem+env(safe-area-inset-bottom)+5rem)] md:pb-7"
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
