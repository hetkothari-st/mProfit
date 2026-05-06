import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet, RefreshCw, Upload, Plus, PlugZap } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { SimpleAssetPage } from './SimpleAssetPage';
import { PPFFormDialog } from './PPFNpsFormDialog';
import { EPFFormDialog } from './EPFFormDialog';
import { PfRefreshDialog } from '@/pages/pf/PfRefreshDialog';
import { PfManualUploadDialog } from '@/pages/pf/PfManualUploadDialog';
import { pfApi } from '@/api/pf';
import type { PfAccount } from '@/api/pf';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiErrorMessage } from '@/api/client';

// ---------------------------------------------------------------------------
// Auto-fetch accounts section
// ---------------------------------------------------------------------------

function AutoFetchSection() {
  const queryClient = useQueryClient();
  const [refreshFor, setRefreshFor] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [showAddAccount, setShowAddAccount] = useState(false);

  const { data: accounts, isLoading, error } = useQuery({
    queryKey: ['pf-accounts'],
    queryFn: () => pfApi.list(),
    retry: 1,
  });

  function handleRefreshClose() {
    setRefreshFor(null);
    void queryClient.invalidateQueries({ queryKey: ['pf-accounts'] });
    void queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  function handleUploadClose() {
    setUploadFor(null);
    void queryClient.invalidateQueries({ queryKey: ['pf-accounts'] });
    void queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  if (error) {
    // Non-critical — don't block the rest of the page
    return null;
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Auto-fetch accounts (EPFO portal)
        </h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" asChild>
            <Link to="/provident-fund/extension" className="flex items-center gap-1">
              <PlugZap className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Browser extension</span>
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddAccount(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Link account
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !accounts || accounts.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No accounts linked yet. Click{' '}
            <button
              className="underline text-foreground"
              onClick={() => setShowAddAccount(true)}
            >
              Link account
            </button>{' '}
            to connect your EPFO UAN or PPF account.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {accounts.map((a: PfAccount) => (
            <Card key={a.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {a.holderName}{' '}
                    <span className="text-muted-foreground font-normal">
                      ···{a.identifierLast4}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.type} · {a.institution}
                    {a.currentBalance != null && (
                      <> · ₹{parseFloat(a.currentBalance).toLocaleString('en-IN')}</>
                    )}
                    {a.lastRefreshedAt && (
                      <>
                        {' '}
                        · refreshed{' '}
                        {new Date(a.lastRefreshedAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: '2-digit',
                        })}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setUploadFor(a.id)}
                    title="Upload passbook PDF"
                  >
                    <Upload className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRefreshFor(a.id)}
                    title="Fetch from EPFO portal"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span className="ml-1 hidden sm:inline">Refresh</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Link account dialog reuses EPFFormDialog in auto-fetch mode */}
      {showAddAccount && (
        <AddPfAccountDialog
          onClose={() => {
            setShowAddAccount(false);
            void queryClient.invalidateQueries({ queryKey: ['pf-accounts'] });
          }}
        />
      )}

      {refreshFor && (
        <PfRefreshDialog accountId={refreshFor} onClose={handleRefreshClose} />
      )}

      {uploadFor && (
        <PfManualUploadDialog accountId={uploadFor} onClose={handleUploadClose} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline "Link account" dialog (quick UAN / PPF account registration)
// ---------------------------------------------------------------------------

interface AddPfAccountDialogProps {
  onClose: () => void;
}

function AddPfAccountDialog({ onClose }: AddPfAccountDialogProps) {
  const [type, setType] = useState<'EPF' | 'PPF'>('EPF');
  const [identifier, setIdentifier] = useState('');
  const [holderName, setHolderName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!identifier || !holderName) return;
    if (type === 'EPF' && !/^\d{12}$/.test(identifier)) {
      toast.error('UAN must be exactly 12 digits');
      return;
    }
    setSaving(true);
    try {
      await pfApi.create({
        type,
        institution: type === 'EPF' ? 'EPFO' : 'SBI',
        identifier,
        holderName,
      });
      toast.success('Account linked');
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to link account'));
    } finally {
      setSaving(false);
    }
  }

  // Using a simple card overlay instead of Dialog to avoid shadcn dep in this helper
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-sm mx-4">
        <CardContent className="pt-5 space-y-4">
          <h3 className="font-semibold">Link PF Account</h3>

          <div className="space-y-1">
            <label className="text-sm font-medium">Type</label>
            <div className="flex gap-2">
              {(['EPF', 'PPF'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-3 py-1.5 rounded border text-sm font-medium transition-colors ${
                    type === t
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:bg-muted/40'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">
              {type === 'EPF' ? 'UAN (12 digits)' : 'PPF Account Number'}
            </label>
            <input
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={type === 'EPF' ? '100XXXXXXXXX' : 'Account number'}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Holder Name</label>
            <input
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              placeholder="Full name as per EPFO records"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} size="sm">
              Cancel
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={saving || !identifier || !holderName}
              size="sm"
            >
              {saving ? 'Linking…' : 'Link'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ProvidentFundPage() {
  return (
    <>
      <SimpleAssetPage
        title="Provident Fund"
        description="Track your PPF and EPF balances, contributions, and interest"
        icon={Wallet}
        assetClasses={['PPF', 'EPF']}
        defaultAssetClass="PPF"
        formOptions={[
          { label: 'PPF entry', assetClass: 'PPF', FormComponent: PPFFormDialog },
          { label: 'EPF entry', assetClass: 'EPF', FormComponent: EPFFormDialog },
        ]}
      />
      <div className="mx-auto max-w-5xl px-4 pb-8">
        <AutoFetchSection />
      </div>
    </>
  );
}
