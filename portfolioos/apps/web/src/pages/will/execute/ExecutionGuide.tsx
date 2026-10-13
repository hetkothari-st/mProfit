import { ExternalLink, Scale } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { NALSA_HELPLINE, WILL_BAR_COUNCIL_NOTE, WILL_LAWYER_LINKS, WILL_SIGNING_STEPS } from './executeCopy';

export function ExecutionGuide() {
  return (
    <Card className="space-y-3 p-4 sm:p-5">
      <h2 className="text-base font-semibold text-foreground">How to sign your will in India</h2>
      <ol className="space-y-3">
        {WILL_SIGNING_STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-foreground">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{s.title}</p>
              <p className="break-words text-sm text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function FindALawyer() {
  return (
    <Card tone="muted" className="space-y-3 p-4 text-sm">
      <h2 className="flex items-center gap-2 font-semibold text-foreground">
        <Scale className="h-4 w-4 text-primary" aria-hidden="true" />Find a lawyer
      </h2>
      <p className="text-muted-foreground">Have your will checked before you sign it. Free and low-cost help:</p>
      <ul className="space-y-3">
        {WILL_LAWYER_LINKS.map((l) => (
          <li key={l.url} className="min-w-0 space-y-0.5">
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
            >
              {l.name}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <p className="text-xs text-muted-foreground">{l.by}</p>
            <p className="break-words text-foreground">{l.body}</p>
          </li>
        ))}
      </ul>
      <p className="text-foreground">
        NALSA legal aid helpline:{' '}
        <a href={`tel:${NALSA_HELPLINE}`} className="font-medium text-primary">{NALSA_HELPLINE}</a>
      </p>
      <p className="break-words text-muted-foreground">{WILL_BAR_COUNCIL_NOTE}</p>
    </Card>
  );
}
