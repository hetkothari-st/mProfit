import type { WillFinding, WillPayload, WillSection, WillSectionData } from '@everypaisa/shared';

export interface WillStepProps {
  willId: string;
  payload: WillPayload;
  /** Live findings for the whole will (filter by `step`). */
  findings: WillFinding[];
  /** Indian calendar date, YYYY-MM-DD. */
  today: string;
  /** True when the content area is at least 640 px wide. */
  wide: boolean;
  update: <S extends WillSection>(section: S, data: WillSectionData[S]) => void;
  refreshEstate: () => Promise<void>;
  /** Save pending edits now; resolves false if they could not be saved. */
  flush: () => Promise<boolean>;
  getRevision: () => number;
  goTo: (n: number) => void;
}
