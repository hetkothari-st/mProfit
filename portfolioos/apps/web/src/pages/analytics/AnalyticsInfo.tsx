import { InfoTip } from '@/components/ui/info-tip';
import { ANALYTICS_INFO, type AnalyticsInfoKey } from './infoCopy';

/** The "i" button for one Analytics chart or metric, with its copy from infoCopy.ts. */
export function AnalyticsInfo({ k, className }: { k: AnalyticsInfoKey; className?: string }) {
  const { title, body } = ANALYTICS_INFO[k];
  return (
    <InfoTip title={title} className={className}>
      {body.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </InfoTip>
  );
}
