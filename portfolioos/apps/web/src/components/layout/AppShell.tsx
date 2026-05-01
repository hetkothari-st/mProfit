import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { GmailAutoConnectBanner } from './GmailAutoConnectBanner';
import { ScanProvider } from '@/context/ScanContext';

export function AppShell() {
  return (
    <ScanProvider>
      <div className="h-screen flex overflow-hidden bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header />
          <GmailAutoConnectBanner />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1480px] px-6 py-7 lg:px-10">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </ScanProvider>
  );
}
