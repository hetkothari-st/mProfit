import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { HELP_GROUPS, filterHelpTopics, helpTopic } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { HelpSearch } from '@/components/insurance/help/HelpSearch';
import { HelpContents } from '@/components/insurance/help/HelpContents';
import { HelpTopicCard } from '@/components/insurance/help/HelpTopicCard';

/**
 * /insurance/help — the Help and rights library: what the rules say you're
 * owed when you buy, own and claim on a policy, each rule linked to its
 * official source. `#topic-id` links land on a topic.
 */
export function HelpLibraryPage() {
  const [query, setQuery] = useState('');
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const { hash } = useLocation();

  const topics = useMemo(() => filterHelpTopics(query), [query]);
  const groups = useMemo(
    () =>
      HELP_GROUPS.map((group) => ({ group, topics: topics.filter((t) => t.group === group.id) })).filter(
        (g) => g.topics.length > 0,
      ),
    [topics],
  );

  // A #topic link (on arrival, or from a "Related" link) brings the topic into
  // view — clearing the search first if it's hiding the topic.
  useEffect(() => {
    const id = decodeURIComponent(hash.replace(/^#/, ''));
    if (!id || !helpTopic(id)) return;
    setQuery((q) => (filterHelpTopics(q).some((t) => t.id === id) ? q : ''));
    setScrollTo(id);
  }, [hash]);

  useEffect(() => {
    if (!scrollTo) return;
    document.getElementById(scrollTo)?.scrollIntoView?.({ block: 'start' });
    setScrollTo(null);
  }, [scrollTo, topics]);

  return (
    <div>
      <PageHeader
        eyebrow="Insurance"
        title="Help and rights"
        description="What the rules say you’re owed when you buy, own and claim on a policy — in plain words, with the official source beside every rule."
        actions={
          <Button asChild variant="outline">
            <Link to="/insurance">
              <ArrowLeft className="h-4 w-4" /> Policies
            </Link>
          </Button>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">
            <HelpContents groups={groups} />
          </div>
        </aside>

        <div className="min-w-0 space-y-8">
          <div className="space-y-2">
            <HelpSearch value={query} onChange={setQuery} />
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {query.trim() ? `${topics.length} ${topics.length === 1 ? 'topic matches' : 'topics match'}` : ''}
            </p>
          </div>

          {groups.length === 0 ? (
            <Card tone="muted">
              <CardContent className="p-5 text-sm sm:p-6">
                <p>No topics match “{query.trim()}”. Try a simpler word, like “claim” or “nominee”.</p>
                <p className="mt-1 text-muted-foreground">
                  If it isn’t covered here, your policy document or your insurer has the answer.
                </p>
              </CardContent>
            </Card>
          ) : (
            groups.map(({ group, topics: inGroup }) => (
              <section
                key={group.id}
                id={`group-${group.id.toLowerCase()}`}
                aria-labelledby={`group-${group.id.toLowerCase()}-title`}
                className="scroll-mt-24 space-y-4"
              >
                <div>
                  <h2 id={`group-${group.id.toLowerCase()}-title`} className="font-display text-2xl">
                    {group.title}
                  </h2>
                  <p className="text-sm text-muted-foreground">{group.blurb}</p>
                </div>
                {inGroup.map((t) => (
                  <HelpTopicCard key={t.id} topic={t} />
                ))}
              </section>
            ))
          )}

          <p className="text-xs text-muted-foreground">
            IRDAI’s rules, in plain words — not legal advice. Your policy document can be more generous, and has the
            final word on its own terms.
          </p>
        </div>
      </div>
    </div>
  );
}

export default HelpLibraryPage;
