import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ESCALATION, formatINR } from '@portfolioos/shared';
import { insurerContactFor } from '@/lib/insurerContacts';
import { SourceLink } from './SourceLink';

type Step = 'GRIEVANCE' | 'OMBUDSMAN';

/**
 * Where to go when an insurer rejects, short-pays or sits on a claim: its own
 * grievance cell (or IRDAI's Bima Bharosa), then the Insurance Ombudsman.
 */
export function EscalationPanel({ current, insurer }: { current: Step | null; insurer?: string }) {
  const b = ESCALATION.bimaBharosa;
  const dir = insurer ? insurerContactFor(insurer) : null;
  const ownRoute = dir && (dir.grievanceUrl || dir.grievanceEmail);
  const steps: Array<{ key: Step; title: string; body: ReactNode }> = [
    {
      key: 'GRIEVANCE',
      title: 'Complain to the insurer',
      body: (
        <>
          Write to its grievance cell
          {ownRoute && (
            <>
              {' '}(
              {dir.grievanceUrl && (
                <a href={dir.grievanceUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                  {dir.name}’s grievance page
                </a>
              )}
              {dir.grievanceUrl && dir.grievanceEmail && ' or '}
              {dir.grievanceEmail && (
                <a href={`mailto:${dir.grievanceEmail}`} className="text-accent hover:underline">
                  {dir.grievanceEmail}
                </a>
              )}
              )
            </>
          )}{' '}
          and keep the reference number — it must reply within {ESCALATION.grievanceReplyDays} days. Or register it on
          IRDAI’s{' '}
          <a href={b.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            Bima Bharosa
          </a>{' '}
          portal, which passes it to the insurer and tracks it: call{' '}
          {b.phones.map((n, i) => (
            <span key={n}>
              {i > 0 && ' or '}
              <a href={`tel:${n.replace(/\s/g, '')}`} className="text-accent hover:underline">
                {n}
              </a>
            </span>
          ))}
          , or email{' '}
          <a href={`mailto:${b.email}`} className="text-accent hover:underline">
            {b.email}
          </a>
          .
        </>
      ),
    },
    {
      key: 'OMBUDSMAN',
      title: 'Then the Insurance Ombudsman',
      body: (
        <>
          If the insurer turns your complaint down, or doesn’t answer within a month. It’s free, must be within a year
          of the rejection, and covers claims up to{' '}
          {/* "₹50 lakh" on one line — never "₹50" / "L". */}
          {formatINR(ESCALATION.ombudsmanMaxClaim, { compact: true }).replace(/ L$/, ' lakh')}. File
          online at{' '}
          <a href={ESCALATION.ombudsman.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            cioins.co.in
          </a>
          .
        </>
      ),
    },
  ];

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <p className="text-sm font-medium">If the insurer says no, pays short, or goes quiet</p>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.key} className={`flex gap-3 ${current && current !== s.key ? 'opacity-70' : ''}`}>
            <span
              aria-hidden
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] tabular-nums ${
                current === s.key ? 'bg-amber-500 text-black' : 'bg-muted'
              }`}
            >
              {i + 1}
            </span>
            <div className="min-w-0 text-sm">
              <p className={current === s.key ? 'font-medium' : undefined}>{s.title}</p>
              <p className="text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <ul className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
        {ESCALATION.rules.map((r) => (
          <li key={r.text}>
            {r.text} <SourceLink source={r.source} />
          </li>
        ))}
      </ul>
      <Link to="/insurance/help#complaints" className="inline-block text-xs text-accent hover:underline">
        Your complaint rights, in full
      </Link>
    </div>
  );
}
