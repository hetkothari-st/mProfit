import type { CaAuditEntry } from '@/api/ca.api';
import { cn } from '@/lib/cn';

/**
 * What a professional did, rendered for either side of the relationship.
 *
 * Shared by the account holder's Account Access page and by the
 * professional's view of a client, on purpose: both read the same rows, so
 * neither party can be shown a version of events the other cannot see.
 *
 * A timeline grouped by day, because that is what an audit trail is — a
 * sequence — and the rail makes the order legible at a glance in a way a flat
 * table of dates did not.
 */
export function CaActivityFeed({
  entries,
  title = 'Activity',
  emptyLabel = 'Nothing has happened yet. Everything a professional does to your books will appear here.',
}: {
  entries: CaAuditEntry[];
  title?: string;
  emptyLabel?: string;
}) {
  const days = groupByDay(entries);

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-medium text-foreground">{title}</h2>
        {entries.length > 0 && (
          <p className="text-[12px] text-muted-foreground">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </p>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 px-4 py-6 text-center text-[12.5px] text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <ol className="space-y-6">
          {days.map(([day, rows]) => (
            <li key={day}>
              <p className="mb-2 text-[12px] font-medium text-muted-foreground">{day}</p>
              <ol className="relative ml-1.5 border-l border-border/70">
                {rows.map((e) => (
                  <li key={e.id} className="relative pb-4 pl-5 last:pb-0">
                    <span
                      aria-hidden
                      className={cn(
                        'absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background',
                        toneOf(e.action),
                      )}
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-[13.5px] leading-snug text-foreground text-pretty">
                        {e.summary}
                      </p>
                      <time
                        dateTime={e.createdAt}
                        className="numeric shrink-0 text-[11.5px] tabular-nums text-muted-foreground"
                      >
                        {new Date(e.createdAt).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    </div>
                    {/* The prior value answers "what did this used to say" —
                        the question an audit trail exists for. Without it the
                        feed only confirms that something changed. */}
                    {e.metadata?.before !== undefined && (
                      <p className="mt-1 break-words text-[11.5px] leading-relaxed text-muted-foreground">
                        Was <span className="numeric">{summarise(e.metadata.before)}</span>
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Access decisions stand out from bookkeeping; withdrawals read as endings. */
function toneOf(action: string): string {
  if (action === 'GRANT_REVOKED') return 'bg-negative';
  if (action === 'GRANT_ACCEPTED' || action === 'GRANT_REINSTATED') return 'bg-positive';
  if (
    action === 'GRANT_SCOPE_CHANGED' ||
    action === 'INVITATION_EMAILED' ||
    action.startsWith('CLIENT_')
  ) {
    return 'bg-warning';
  }
  return 'bg-muted-foreground/60';
}

function groupByDay(entries: CaAuditEntry[]): Array<[string, CaAuditEntry[]]> {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  const groups = new Map<string, CaAuditEntry[]>();
  for (const e of entries) {
    const d = new Date(e.createdAt);
    const key =
      d.toDateString() === today
        ? 'Today'
        : d.toDateString() === yesterday
          ? 'Yesterday'
          : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  return [...groups.entries()];
}

/** Compact one-line rendering of a before/after blob. */
function summarise(value: unknown): string {
  if (value === null || value === undefined) return 'nothing';
  if (typeof value !== 'object') return String(value);
  const parts = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
    .slice(0, 4)
    .map(([k, v]) => `${k} ${String(v)}`);
  return parts.length > 0 ? parts.join(', ') : 'nothing';
}
