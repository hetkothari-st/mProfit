import type { WillStatusWire } from '@everypaisa/shared';

export const WILL_STATUS_LABEL: Record<WillStatusWire, string> = {
  DRAFT: 'Draft',
  GENERATED: 'Generated',
  EXECUTED: 'Executed',
  SUPERSEDED: 'Superseded',
  DISCARDED: 'Discarded',
};
