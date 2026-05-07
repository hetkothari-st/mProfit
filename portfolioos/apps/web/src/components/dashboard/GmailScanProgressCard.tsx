import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2, Inbox } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { gmailScanApi } from '@/api/gmailScan.api';
import type { GmailScanJobDTO } from '@portfolioos/shared';

const NON_TERMINAL = ['PENDING', 'LISTING', 'DOWNLOADING', 'CLASSIFYING'] as const;

function isRunning(s: GmailScanJobDTO): boolean {
  return (NON_TERMINAL as readonly string[]).includes(s.status);
}

export function GmailScanProgressCard() {
  const q = useQuery({
    queryKey: ['gmail-scan-jobs'],
    queryFn: () => gmailScanApi.listScans(),
    refetchInterval: (query) =>
      query.state.data?.some(isRunning) ? 3000 : false,
  });
  const running = (q.data ?? []).find(isRunning);
  if (!running) return null;
  const total = running.totalMessages ?? null;
  const pct = total
    ? Math.min(100, Math.round((running.processedMessages / total) * 100))
    : null;

  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-medium">Scanning your Gmail inbox…</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {total
              ? `${running.processedMessages.toLocaleString()} / ${total.toLocaleString()} messages`
              : `${running.processedMessages.toLocaleString()} messages so far`}
            {' • '}
            {running.attachmentsKept} financial document
            {running.attachmentsKept === 1 ? '' : 's'} found
          </div>
          {pct !== null && (
            <div className="h-1.5 bg-muted rounded mt-2 overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        <Link to="/reports?tab=inbox-imports">
          <Button variant="outline" size="sm">
            <Inbox className="h-3.5 w-3.5" /> Review docs
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
