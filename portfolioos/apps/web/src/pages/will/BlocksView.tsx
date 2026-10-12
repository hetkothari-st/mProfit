import type { WillBlock } from '@everypaisa/shared';

function Block({ b }: { b: WillBlock }) {
  switch (b.t) {
    case 'title':
      return <h2 className="text-center text-lg font-semibold tracking-wide text-foreground">{b.text.toUpperCase()}</h2>;
    case 'heading':
      return <p className="text-center font-medium text-foreground">{b.text}</p>;
    case 'para':
      return <p className="text-foreground">{b.text}</p>;
    case 'note':
      return <p className="text-xs text-muted-foreground">{b.text}</p>;
    case 'clause':
      return (
        <section className="space-y-1">
          <h3 className="font-semibold text-foreground">{b.n}. {b.title}</h3>
          {b.paras.map((p, i) => <p key={i} className="pl-3 text-foreground">{p}</p>)}
        </section>
      );
    case 'table':
      return (
        <div className="space-y-1">
          {b.title && <p className="font-medium text-foreground">{b.title}</p>}
          <dl className="divide-y divide-border/60 rounded-md border border-border/60">
            {b.rows.map(([k, v], i) => (
              <div key={i} className="grid gap-1 px-3 py-2 sm:grid-cols-2">
                <dt className="min-w-0 break-words text-foreground">{k}</dt>
                <dd className="min-w-0 break-words text-muted-foreground sm:text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      );
    case 'signature':
      return <div className="whitespace-pre-line text-foreground">{b.lines.join('\n')}</div>;
    case 'witnesses':
      return (
        <div className="space-y-2">
          <p className="text-foreground">{b.intro}</p>
          {Array.from({ length: b.count }, (_, i) => (
            <div key={i} className="space-y-0.5">
              <p className="font-medium text-foreground">Witness {i + 1}</p>
              {b.fields.map((f) => <p key={f} className="text-muted-foreground">{f}: ____________________</p>)}
            </div>
          ))}
        </div>
      );
  }
}

/** The will's blocks as a readable page - the same blocks the PDF draws. */
export function BlocksView({ blocks, testId }: { blocks: WillBlock[]; testId?: string }) {
  return (
    <div className="space-y-3 break-words text-sm leading-relaxed" data-testid={testId}>
      {blocks.map((b, i) => <Block key={i} b={b} />)}
    </div>
  );
}
