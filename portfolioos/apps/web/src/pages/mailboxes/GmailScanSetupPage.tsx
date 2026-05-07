import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Calendar } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { gmailScanApi } from '@/api/gmailScan.api';
import { apiErrorMessage } from '@/api/client';

function dateMinusYears(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export function GmailScanSetupPage() {
  const nav = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(dateMinusYears(5));
  const [to, setTo] = useState(today);

  const start = useMutation({
    mutationFn: () => gmailScanApi.createScan({ lookbackFrom: from, lookbackTo: to }),
    onSuccess: () => {
      toast.success('Scan started — review docs as they appear');
      nav('/reports?tab=inbox-imports', { replace: true });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to start scan')),
  });

  return (
    <div>
      <PageHeader
        title="Choose how far back to scan"
        description="We'll look for every PDF, XLSX, XLS or CSV attachment in your Gmail between these dates."
      />
      <Card className="max-w-xl">
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="from" className="text-xs">Scan from</Label>
              <Input
                id="from"
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="to" className="text-xs">Scan until</Label>
              <Input
                id="to"
                type="date"
                value={to}
                min={from}
                max={today}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            Default range: last 5 years.
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => nav('/dashboard')}>Skip for now</Button>
            <Button onClick={() => start.mutate()} disabled={start.isPending}>
              {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Start scan'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
