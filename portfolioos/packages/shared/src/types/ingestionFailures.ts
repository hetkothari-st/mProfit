/**
 * Dead-letter queue for ingestion — §3.5, §5.1 task 8.
 *
 * A row appears here when any ingestion path (file import, Gmail, future
 * adapters) failed to produce a CanonicalEvent. The import job itself may
 * still have committed other rows; this row preserves the raw payload so
 * the user can review, retry, or manually correct.
 */

export const INGESTION_RESOLVE_ACTIONS = [
  'manual_entry',
  'retry_succeeded',
  'ignored',
  'fixed_externally',
  'data_corrected',
] as const;

export type IngestionResolveAction = (typeof INGESTION_RESOLVE_ACTIONS)[number];

export interface IngestionFailureDTO {
  id: string;
  userId: string;
  sourceAdapter: string;
  adapterVersion: string;
  sourceRef: string;
  errorMessage: string;
  errorStack: string | null;
  rawPayload: unknown;
  resolvedAt: string | null;
  resolvedAction: IngestionResolveAction | null;
  createdAt: string;
}

export const INGESTION_RESOLVE_ACTION_LABELS: Record<IngestionResolveAction, string> = {
  manual_entry: 'Entered manually',
  retry_succeeded: 'Retried successfully',
  ignored: 'Ignored',
  fixed_externally: 'Fixed externally',
  data_corrected: 'Data corrected & re-uploaded',
};
