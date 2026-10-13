import { Link } from 'react-router-dom';
import { Download, FileCheck2 } from 'lucide-react';
import { formatDateOnly, type WillHistoryEntryWire } from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WILL_STATUS_LABEL } from './willStatusLabels';

/** "Started 12/10/2026 - generated 12/10/2026 - signed 20/10/2026 - next review 20/10/2028". */
export function historyLine(h: WillHistoryEntryWire): string {
  const parts = [`Started ${formatDateOnly(h.createdOn)}`];
  if (h.generatedOn) parts.push(`generated ${formatDateOnly(h.generatedOn)}`);
  if (h.executedOn) parts.push(`signed ${formatDateOnly(h.executedOn)}`);
  if (h.supersededByVersion !== null) parts.push(`replaced by version ${h.supersededByVersion}`);
  if (h.nextReviewAt) parts.push(`next review ${formatDateOnly(h.nextReviewAt)}`);
  return parts.join(' - ');
}

export function WillHistoryCard({
  history,
  downloading,
  onDownload,
}: {
  history: WillHistoryEntryWire[];
  downloading: boolean;
  onDownload: (h: WillHistoryEntryWire) => void;
}) {
  if (history.length === 0) return null;
  return (
    <Card className="space-y-2 p-4 sm:p-5" data-testid="will-history">
      <h2 className="text-base font-semibold text-foreground">History</h2>
      <ul className="divide-y divide-border/60">
        {history.map((h) => (
          <li key={h.willId} className="min-w-0 space-y-1.5 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">Version {h.version}</span>
              <Badge variant={h.status === 'EXECUTED' ? 'default' : 'secondary'}>{WILL_STATUS_LABEL[h.status]}</Badge>
            </div>
            <p className="break-words text-xs text-muted-foreground">{historyLine(h)}</p>
            {(h.versionId || h.hasSignedCopy) && (
              <div className="flex flex-wrap gap-2">
                {h.versionId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Download version ${h.version} PDF`}
                    disabled={downloading}
                    onClick={() => onDownload(h)}
                  >
                    <Download className="mr-1 h-4 w-4" />PDF
                  </Button>
                )}
                {h.hasSignedCopy && (
                  <Button size="sm" variant="ghost" asChild>
                    <Link to={`/will/${encodeURIComponent(h.willId)}/execute`}>
                      <FileCheck2 className="mr-1 h-4 w-4" />Signed copy
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
