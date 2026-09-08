import { Card, CardContent } from '@/components/ui/card';
import type { CaAuditEntry } from '@/api/ca.api';

/**
 * What a CA did, rendered for either side of the relationship.
 *
 * Shared by the client's settings page and by the CA's view of a client, on
 * purpose: both read the same rows, so neither party can be shown a version of
 * events the other cannot see.
 */
export function CaActivityFeed({
  entries,
  title = 'What they did',
  emptyLabel = 'Nothing yet.',
}: {
  entries: CaAuditEntry[];
  title?: string;
  emptyLabel?: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-[10px] font-medium uppercase tracking-kerned text-foreground/70">
        {title}
      </h2>

      {entries.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">{emptyLabel}</p>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {entries.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-4 border-b border-border/50 px-4 py-3 last:border-0 sm:grid-cols-[112px_minmax(0,1fr)]"
              >
                <p className="numeric tabular-nums text-[11.5px] leading-tight text-muted-foreground">
                  {new Date(e.createdAt).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>

                <div className="min-w-0">
                  <p className="text-[13.5px] leading-snug text-foreground text-pretty">
                    {e.summary}
                  </p>
                  {/* The prior value is the part that answers "what did this
                      used to say" — the question an audit trail exists for.
                      Without it the feed only confirms that something changed. */}
                  {e.metadata?.before !== undefined && (
                    <p className="mt-1 break-words text-[11.5px] leading-relaxed text-muted-foreground">
                      Was: <span className="numeric">{summarise(e.metadata.before)}</span>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

/** Compact one-line rendering of a before/after blob. */
function summarise(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value !== 'object') return String(value);
  const parts = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
    .slice(0, 4)
    .map(([k, v]) => `${k} ${String(v)}`);
  return parts.length > 0 ? parts.join(' · ') : '—';
}
