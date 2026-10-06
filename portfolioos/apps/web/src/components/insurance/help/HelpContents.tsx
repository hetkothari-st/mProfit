import type { HelpGroup, HelpTopic } from '@everypaisa/shared';

/** The topics, by group, as anchor links — the page's table of contents. */
export function HelpContents({
  groups,
  label = 'Help topics',
}: {
  groups: Array<{ group: HelpGroup; topics: HelpTopic[] }>;
  /** Landmark name. Two navs on one page need distinct names. */
  label?: string;
}) {
  return (
    <nav aria-label={label} className="space-y-5 text-sm">
      {groups.map(({ group, topics }) => (
        <div key={group.id}>
          <a href={`#group-${group.id.toLowerCase()}`} className="font-medium hover:underline">
            {group.title}
          </a>
          <ul className="mt-1.5 space-y-1 border-l pl-3">
            {topics.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="block text-muted-foreground hover:text-foreground">
                  {t.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
