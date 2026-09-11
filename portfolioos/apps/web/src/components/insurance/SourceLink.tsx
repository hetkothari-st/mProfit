import { ExternalLink } from 'lucide-react';
import type { OfficialSource } from '@portfolioos/shared';

function shortName(url: string): string {
  if (url.includes('cioins.co.in')) return 'Ombudsman council';
  if (url.includes('bimabharosa')) return 'Bima Bharosa';
  if (url.includes('irdai.gov.in')) return 'IRDAI';
  if (url.includes('indiacode.nic.in')) return 'India Code';
  if (url.includes('incometaxindia.gov.in') || url.includes('incometax.gov.in')) return 'Income Tax Department';
  if (url.includes('egazette.gov.in')) return 'Gazette of India';
  return 'Source';
}

/** "IRDAI, page 31 ↗" — where a rule we quote comes from. */
export function SourceLink({ source }: { source: OfficialSource }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={source.label}
      className="inline-flex items-center gap-0.5 whitespace-nowrap text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
    >
      {shortName(source.url)}
      {source.where ? `, ${source.where}` : ''}
      <ExternalLink aria-hidden className="h-3 w-3" />
    </a>
  );
}
