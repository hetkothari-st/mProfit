import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { useEntitlement } from '@/hooks/useEntitlement';
import { downloadTallyExport } from '@/api/tallyExport.api';

/**
 * "Export to Tally" — the user's books as one ZIP ready for TallyPrime.
 * Shown only on plans that include the accounting module; the server gates
 * the download the same way.
 */
export function TallyExportButton() {
  const accounting = useEntitlement('ACCOUNTING_MODULE');
  const [busy, setBusy] = useState(false);
  if (!accounting.allowed) return null;

  async function run() {
    setBusy(true);
    try {
      await downloadTallyExport();
      toast.success('Tally export downloaded. The README inside has the import steps.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The Tally export failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={() => void run()}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      {busy ? 'Preparing…' : 'Export to Tally'}
    </Button>
  );
}
