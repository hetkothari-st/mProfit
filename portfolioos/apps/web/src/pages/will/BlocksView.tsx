import type { WillBlockV2 } from '@everypaisa/shared';

const BLANK = '____________________';

function Block({ b }: { b: WillBlockV2 }) {
  switch (b.t) {
    case 'title':
      return <h2 className="text-center font-serif text-lg font-semibold tracking-widest text-foreground">{b.text.toUpperCase()}</h2>;
    case 'heading':
      return <p className="text-center font-serif font-semibold text-foreground">{b.text}</p>;
    case 'para':
      return <p className="text-foreground">{b.text}</p>;
    case 'note':
      return <p className="text-xs italic text-muted-foreground">{b.text}</p>;
    case 'section':
      return (
        <section className="space-y-1">
          <h3 className="font-semibold tracking-wide text-foreground">{b.n}. {b.title.toUpperCase()}</h3>
          {b.paras.map((p, i) => (
            <p key={i} className="flex gap-2 text-foreground">
              <span className="w-8 shrink-0 tabular-nums text-muted-foreground">{p.n}</span>
              <span className="min-w-0 flex-1">{p.text}</span>
            </p>
          ))}
        </section>
      );
    case 'schedule':
      return (
        <div className="space-y-1">
          <p className="font-semibold tracking-wide text-foreground">{b.title.toUpperCase()}</p>
          {b.intro && <p className="text-xs italic text-muted-foreground">{b.intro}</p>}
          {/* Scrolls inside its own box on a narrow screen; the page itself never scrolls sideways. */}
          <div className="max-w-full overflow-x-auto rounded-md border border-border/60">
            <table className="w-full min-w-[36rem] text-xs">
              <thead>
                <tr className="border-b border-border/60 text-left text-muted-foreground">
                  {b.columns.map((c) => (
                    <th key={c.label} scope="col" className={c.align === 'right' ? 'px-2 py-1.5 text-right font-medium' : 'px-2 py-1.5 font-medium'}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              {b.groups.map((g) => (
                <tbody key={g.title}>
                  <tr><th scope="rowgroup" colSpan={b.columns.length} className="px-2 pt-2 text-left font-normal italic text-muted-foreground">{g.title}</th></tr>
                  {g.rows.map((r) => (
                    <tr key={r[0]} className="border-b border-border/40 align-top last:border-0">
                      {r.map((cell, i) => (
                        <td key={i} className={b.columns[i]?.align === 'right' ? 'break-words px-2 py-1.5 text-right tabular-nums text-foreground' : 'break-words px-2 py-1.5 text-foreground'}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </div>
      );
    case 'execution':
      return (
        <div className="space-y-2">
          <p className="text-foreground">{b.testimonium}</p>
          {b.fields.map((f) => <p key={f} className="text-muted-foreground">{f}: {BLANK}</p>)}
          <p className="text-muted-foreground">Signature of the Testator: {BLANK}</p>
          <p className="text-muted-foreground">({b.testator})</p>
          <p className="text-foreground">{b.attestation}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: b.witnessCount }, (_, i) => (
              <div key={i} className="space-y-0.5">
                <p className="font-medium text-foreground">Witness {i + 1}</p>
                {b.witnessFields.map((f) => <p key={f} className="text-muted-foreground">{f}: {BLANK}</p>)}
              </div>
            ))}
          </div>
        </div>
      );
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
              {b.fields.map((f) => <p key={f} className="text-muted-foreground">{f}: {BLANK}</p>)}
            </div>
          ))}
        </div>
      );
  }
}

/** The will's blocks as a readable page - the same blocks the PDF draws. */
export function BlocksView({ blocks, testId }: { blocks: WillBlockV2[]; testId?: string }) {
  return (
    <div className="space-y-3 break-words text-sm leading-relaxed" data-testid={testId}>
      {blocks.map((b, i) => <Block key={i} b={b} />)}
    </div>
  );
}
