import { SOURCES_CHECKED_ON, type ClaimGuide } from '@everypaisa/shared';
import { formatDay } from '@/lib/insurance';
import { SourceLink } from './SourceLink';

type Section = 'steps' | 'documents' | 'rights';

/**
 * A claims guide: what to do (in order), the documents to gather — ticked off
 * when `onToggleDoc` is given — and what the rules say the insurer owes you.
 */
export function ClaimGuideView({
  guide,
  checklist,
  onToggleDoc,
  busy = false,
  show = ['steps', 'documents', 'rights'],
}: {
  guide: ClaimGuide;
  checklist?: Record<string, true> | null;
  onToggleDoc?: (id: string, done: boolean) => void;
  busy?: boolean;
  show?: Section[];
}) {
  const ready = guide.documents.filter((d) => checklist?.[d.id]).length;

  return (
    <div className="space-y-5">
      {show.includes('steps') && (
        <section>
          <h4 className="text-sm font-medium">What to do</h4>
          <ol className="mt-2 space-y-2.5">
            {guide.steps.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] tabular-nums"
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {show.includes('documents') && (
        <section>
          <h4 className="text-sm font-medium">
            Documents
            {onToggleDoc && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {ready} of {guide.documents.length} ready
              </span>
            )}
          </h4>
          <ul className="mt-2 space-y-1.5">
            {guide.documents.map((d) => (
              <li key={d.id}>
                {onToggleDoc ? (
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={Boolean(checklist?.[d.id])}
                      disabled={busy}
                      onChange={(e) => onToggleDoc(d.id, e.target.checked)}
                    />
                    <span className={checklist?.[d.id] ? 'text-muted-foreground line-through decoration-muted-foreground/50' : undefined}>
                      {d.label}
                      {d.note && <span className="block text-xs text-muted-foreground no-underline">{d.note}</span>}
                    </span>
                  </label>
                ) : (
                  <div className="flex gap-2.5 text-sm">
                    <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                    <span>
                      {d.label}
                      {d.note && <span className="block text-xs text-muted-foreground">{d.note}</span>}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">The usual list — your insurer’s claim form has the final word.</p>
        </section>
      )}

      {show.includes('rights') && guide.rights.length > 0 && (
        <section>
          <h4 className="text-sm font-medium">What the rules say</h4>
          <ul className="mt-2 space-y-2">
            {guide.rights.map((r) => (
              <li key={r.text} className="text-sm">
                {r.text} <SourceLink source={r.source} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Checked against the official documents on {formatDay(SOURCES_CHECKED_ON)}.
          </p>
        </section>
      )}
    </div>
  );
}
