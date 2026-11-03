import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { GmailDiscoveredDocDTO } from '@everypaisa/shared';
import type { InboxDecision } from '@/pages/reports/inboxDecision';

interface Props {
  /** The document the user clicked Approve or Reject on; null when closed. */
  doc: GmailDiscoveredDocDTO | null;
  decision: InboxDecision;
  /** Other documents from the same sender waiting for review, in this list. */
  otherPending: number;
  onAllFromSender: () => void;
  onJustThisOne: () => void;
  onCancel: () => void;
}

/**
 * Asked after Approve or Reject on one inbox document: should the decision
 * cover everything from this sender, already fetched and still to come?
 */
export function SenderDecisionDialog({ doc, decision, otherPending, onAllFromSender, onJustThisOne, onCancel }: Props) {
  const approve = decision === 'APPROVE';
  const sender = doc?.fromAddress ?? '';
  const others =
    otherPending > 0
      ? `${otherPending} more document${otherPending === 1 ? '' : 's'} from this sender ${otherPending === 1 ? 'is' : 'are'} waiting for review. `
      : '';
  return (
    <Dialog open={!!doc} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{approve ? 'Approve everything from this sender?' : 'Reject everything from this sender?'}</DialogTitle>
          <DialogDescription className="break-all font-medium text-foreground">{sender}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {others}
          {approve
            ? 'Yes approves all of them for import now, and approves new documents from this sender as they arrive.'
            : 'Yes rejects all of them now, and rejects new documents from this sender as they arrive.'}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onJustThisOne}>
            No, just this one
          </Button>
          <Button variant={approve ? 'default' : 'destructive'} onClick={onAllFromSender}>
            {approve ? 'Yes, approve all' : 'Yes, reject all'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
