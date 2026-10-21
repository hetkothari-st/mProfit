import { Link } from 'react-router-dom';
import { AI_USE_DISCLOSURE } from '@everypaisa/shared';

/** The full AI-use notice (SEBI IA Regulations 15(14), 18(9)), public so it can be read before signing up. */
export function AiUsePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed text-foreground sm:px-6 [&_h1]:mb-4 [&_h1]:font-display [&_h1]:text-2xl [&_h1]:leading-tight [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:my-3">
      <Link to="/" className="-my-2 -ml-2 mb-4 inline-block px-2 py-2 text-xs text-muted-foreground no-underline hover:text-foreground">
        ← EveryPaisa
      </Link>
      <h1>{AI_USE_DISCLOSURE.title}</h1>
      <p>
        <strong>Version:</strong> {AI_USE_DISCLOSURE.version}
      </p>
      <p>{AI_USE_DISCLOSURE.summary}</p>
      {AI_USE_DISCLOSURE.points.map((p) => (
        <section key={p.heading}>
          <h2>{p.heading}</h2>
          <p>{p.body}</p>
        </section>
      ))}
    </div>
  );
}
