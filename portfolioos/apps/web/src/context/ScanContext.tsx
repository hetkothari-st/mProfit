import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { mailboxesApi } from '@/api/mailboxes.api';

interface ScanContextValue {
  scanning: boolean;
  triggerScan: () => void;
}

const ScanContext = createContext<ScanContextValue>({ scanning: false, triggerScan: () => {} });

export function ScanProvider({ children }: { children: ReactNode }) {
  const [scanning, setScanning] = useState(false);
  const queryClient = useQueryClient();

  const mailboxesQuery = useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => mailboxesApi.list(),
  });

  const triggerScan = useCallback(() => {
    const gmailAccounts = (mailboxesQuery.data ?? []).filter(
      (m) => m.provider === 'GMAIL_OAUTH' && m.isActive,
    );
    if (gmailAccounts.length === 0) {
      toast.error('No active Gmail account connected');
      return;
    }
    if (scanning) return;
    setScanning(true);
    toast.success('Scanning Gmail — imports will appear when found', { duration: 4000 });
    Promise.allSettled(
      gmailAccounts.map((m) =>
        mailboxesApi.poll(m.id).then((r) => {
          if (r.imported > 0) queryClient.invalidateQueries({ queryKey: ['imports'] });
        }),
      ),
    ).then(() => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      setScanning(false);
    });
  }, [mailboxesQuery.data, scanning, queryClient]);

  return (
    <ScanContext.Provider value={{ scanning, triggerScan }}>
      {children}
    </ScanContext.Provider>
  );
}

export function useScan() {
  return useContext(ScanContext);
}
