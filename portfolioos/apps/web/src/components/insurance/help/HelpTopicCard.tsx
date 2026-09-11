import { Link as LinkIcon } from 'lucide-react';
import { helpTopic, type HelpTopic } from '@portfolioos/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDay } from '@/lib/insurance';
import { SourceLink } from '../SourceLink';

/**
 * One help topic in full: the plain-language explanation, what the rules say
 * (each with its official source), what you can do, and where it all comes
 * from. Its id is the topic id, so `#topic-id` links land on it.
 */
export function HelpTopicCard({ topic }: { topic: HelpTopic }) {
  const related = (topic.related ?? []).map(helpTopic).filter((t): t is HelpTopic => t !== null);

  return (
    <Card id={topic.id} className="scroll-mt-24 target:border-accent/60">
      <CardHeader className="p-5 sm:p-6">
        <CardTitle className="group text-xl leading-snug">
          <a href={`#${topic.id}`} className="hover:underline">
            {topic.title}
            <LinkIcon aria-hidden className="ml-1.5 inline h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
          </a>
        </CardTitle>
        <CardDescription>{topic.summary}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5 p-5 pt-0 sm:p-6 sm:pt-0">
        <div className="space-y-2 text-sm leading-relaxed">
          {topic.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>

        <section>
          <h4 className="text-sm font-medium">What the rules say</h4>
          <ul className="mt-2 space-y-2">
            {topic.rules.map((r) => (
              <li key={r.text} className="flex gap-2.5 text-sm">
                <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                <span>
                  {r.text} <SourceLink source={r.source} />
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h4 className="text-sm font-medium">What you can do</h4>
          <ol className="mt-2 space-y-2.5">
            {topic.whatYouCanDo.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] tabular-nums"
                >
                  {i + 1}
                </span>
                <p className="min-w-0 text-sm">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-2 border-t pt-4 text-xs text-muted-foreground">
          <h4 className="font-medium text-foreground">Sources</h4>
          <ul className="space-y-1">
            {topic.sources.map((s) => (
              <li key={`${s.url}|${s.where ?? ''}`}>
                {s.label} <SourceLink source={s} />
              </li>
            ))}
          </ul>
          {related.length > 0 && (
            <p>
              Related:{' '}
              {related.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ' · '}
                  <a href={`#${t.id}`} className="text-accent hover:underline">
                    {t.title}
                  </a>
                </span>
              ))}
            </p>
          )}
          <p>
            Checked against the official documents on {formatDay(topic.checkedOn)}. Your policy document can be more
            generous, and has the final word on its own terms.
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
