import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Percent } from 'lucide-react';
import type { LoanAlertPrefsWire } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { notificationsApi } from '@/api/notifications.api';
import { apiErrorMessage } from '@/api/client';

const KEY = ['notification-prefs'];

/** spec s6.3 opt-out: refinance and repo/MCLR change alerts for this profile's loans. Default on. */
export function LoanRateAlertsCard() {
  const qc = useQueryClient();
  const prefs = useQuery({ queryKey: KEY, queryFn: () => notificationsApi.getPrefs() });
  const save = useMutation({
    mutationFn: (loanRateAlerts: boolean) => notificationsApi.setPrefs({ loanRateAlerts }),
    onSuccess: (saved: LoanAlertPrefsWire) => {
      qc.setQueryData(KEY, saved);
      toast.success(saved.loanRateAlerts ? 'Loan rate alerts on' : 'Loan rate alerts off');
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't save - try again")),
  });

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Percent className="h-4 w-4 text-accent-ink/70" />
          <CardTitle>Loan rate alerts</CardTitle>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Checked every morning against live lender rates and RBI / MCLR changes.</p>
      </CardHeader>
      <CardContent>
        {prefs.isLoading ? (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : prefs.isError || !prefs.data ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>Couldn't load this setting.</span>
            <Button size="sm" variant="outline" onClick={() => void prefs.refetch()}>Try again</Button>
          </div>
        ) : (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={prefs.data.loanRateAlerts}
              disabled={save.isPending}
              onChange={(e) => save.mutate(e.target.checked)}
            />
            <span>Tell me when I could save by refinancing a loan, and when the repo rate or my lender's MCLR changes</span>
          </label>
        )}
      </CardContent>
    </Card>
  );
}
