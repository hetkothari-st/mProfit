import type { GmailDiscoveredDocDTO, GmailDocStatus } from '@everypaisa/shared';

export type InboxDecision = 'APPROVE' | 'REJECT';

/** What an approved or rejected document becomes, as the server will report it. */
const NEXT_STATUS: Record<InboxDecision, GmailDocStatus> = {
  APPROVE: 'IMPORTING',
  REJECT: 'REJECTED',
};

/**
 * The inbox list as it will look once the decision lands, so the screen
 * changes the moment the user decides instead of after a refetch. Only
 * documents still pending review change. A list filtered to one status
 * drops the documents that no longer have it.
 */
export function applyInboxDecision(
  docs: GmailDiscoveredDocDTO[],
  matches: (doc: GmailDiscoveredDocDTO) => boolean,
  decision: InboxDecision,
  statusFilter: GmailDocStatus | undefined,
): GmailDiscoveredDocDTO[] {
  const status = NEXT_STATUS[decision];
  return docs
    .map((d) => (d.status === 'PENDING_APPROVAL' && matches(d) ? { ...d, status } : d))
    .filter((d) => !statusFilter || d.status === statusFilter);
}

/** Other documents from the same sender still waiting for review. */
export function otherPendingFromSender(docs: GmailDiscoveredDocDTO[], doc: GmailDiscoveredDocDTO): number {
  return docs.filter((d) => d.id !== doc.id && d.fromAddress === doc.fromAddress && d.status === 'PENDING_APPROVAL').length;
}
