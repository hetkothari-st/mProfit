import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { PortfolioSelect } from '@/components/common/PortfolioSelect';
import { SPLIT_KEYS, splitApi } from '@/api/split.api';
import { CURRENCIES } from './NewGroupDialog';
import { LoadError } from './LoadError';
import { splitErrorMessage } from './errors';
import { UPI_VPA } from './upi';

export function SplitSettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: SPLIT_KEYS.settings, queryFn: splitApi.getSettings });
  const [upi, setUpi] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [onActivity, setOnActivity] = useState(false);
  const [weekly, setWeekly] = useState(false);

  // Seed once per load (and again after a save) so a background refetch never wipes unsaved edits.
  const seeded = useRef(false);
  useEffect(() => {
    const s = q.data;
    if (!s || seeded.current) return;
    seeded.current = true;
    setUpi(s.upiId ?? '');
    setCurrency(s.homeCurrency);
    setPortfolioId(s.defaultPortfolioId);
    setOnActivity(s.emailOnActivity);
    setWeekly(s.weeklyDigest);
  }, [q.data]);

  const trimmed = upi.trim();
  const upiInvalid = trimmed !== '' && !UPI_VPA.test(trimmed);

  const save = useMutation({
    mutationFn: () => splitApi.updateSettings({
      upiId: trimmed === '' ? null : trimmed, homeCurrency: currency, defaultPortfolioId: portfolioId,
      emailOnActivity: onActivity, weeklyDigest: weekly,
    }),
    onSuccess: () => { toast.success('Settings saved'); seeded.current = false; void qc.invalidateQueries({ queryKey: SPLIT_KEYS.settings }); },
    onError: (e) => toast.error(splitErrorMessage(e, "Couldn't save your settings")),
  });

  return (
    <div className="space-y-6 pb-24">
      <PageHeader eyebrow="Split Expenses" title="Split settings" />
      {q.isError ? (
        <LoadError text="Couldn't load your settings." onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
      ) : (
        <div className="space-y-4 max-w-xl">
          <Card><CardContent className="p-4 space-y-2">
            <h2 className="text-sm font-semibold">Payments</h2>
            <Label htmlFor="split-upi">UPI ID</Label>
            <Input id="split-upi" value={upi} placeholder="name@bank" onChange={(e) => setUpi(e.target.value)} />
            {upiInvalid
              ? <p role="alert" className="text-xs text-destructive">Enter a UPI ID like name@bank</p>
              : <p className="text-xs text-muted-foreground">Friends see this when they pay you</p>}
          </CardContent></Card>
          <Card><CardContent className="p-4 space-y-4">
            <h2 className="text-sm font-semibold">Defaults</h2>
            <div className="space-y-1.5">
              <Label htmlFor="split-currency">Home currency</Label>
              <Select id="split-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Default portfolio</Label>
              <PortfolioSelect value={portfolioId} onChange={setPortfolioId} emptyLabel="None" />
            </div>
          </CardContent></Card>
          <Card><CardContent className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">Emails</h2>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onActivity} onChange={(e) => setOnActivity(e.target.checked)} />
              Email me about activity in my groups (at most hourly)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} />
              Weekly balance summary (Mondays)
            </label>
          </CardContent></Card>
          <Button onClick={() => save.mutate()} disabled={upiInvalid || save.isPending}>Save</Button>
        </div>
      )}
    </div>
  );
}
