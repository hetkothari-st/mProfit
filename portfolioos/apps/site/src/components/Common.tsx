import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { appLinks } from '../lib/config';
import { planRows, plans, type Faq } from '../data/content';

/** Fades a headline in the first time it scrolls into view. One per section. */
export function Reveal({ as: Tag = 'h2', className = '', id, children }: { as?: 'h1' | 'h2'; className?: string; id?: string; children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setShown(true);
        io.disconnect();
      }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // Rendered visible on the server; hidden only once JS can show it again.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return (
    <Tag ref={ref} id={id} className={`${className} ${hydrated ? `reveal${shown ? ' in' : ''}` : ''}`}>
      {children}
    </Tag>
  );
}

export function SectionHead({ kicker, title, id, lede }: { kicker: string; title: ReactNode; id?: string; lede?: ReactNode }) {
  return (
    <div className="section-head">
      <p className="kicker">{kicker}</p>
      <Reveal className="h2" id={id}>{title}</Reveal>
      {lede && <p className="lede">{lede}</p>}
    </div>
  );
}

export function FaqList({ items }: { items: Faq[] }) {
  return (
    <div className="faq">
      {items.map((f) => (
        <details key={f.q}>
          <summary>{f.q}</summary>
          <p>{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export function PricingTable() {
  return (
    <>
      <div className="plans-scroll" role="region" aria-label="Plan comparison" tabIndex={0}>
        <table className="plans">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Feature</span></th>
              {plans.map((p) => (
                <th scope="col" key={p.name} className={p.featured ? 'featured' : undefined}>
                  <h3>{p.name}</h3>
                  <p>{p.blurb}</p>
                  <div className="price">{p.price}<small>{p.priceNote}</small></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {planRows.map(([label, ...cells]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {cells.map((c, i) => {
                  const cls = [c === true ? 'yes' : c === false ? 'no' : '', plans[i].featured ? 'featured' : ''].join(' ').trim();
                  return (
                    <td key={i} className={cls || undefined}>
                      {c === true ? 'Yes' : c === false ? <span aria-label="Not included">—</span> : c}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="plans-note">
        Start on Free today. Paid plan prices will be published before paid features are switched on. <a href={appLinks.register}>Create a free account</a>.
      </p>
    </>
  );
}

export function CtaBand({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <section className="section cta" aria-labelledby="cta-title">
      <div className="wrap">
        <div>
          <h2 className="h2" id="cta-title">{title}</h2>
          <p className="lede cta-lede">{text}</p>
        </div>
        <div className="hero-actions">
          {children ?? (
            <>
              <a className="btn btn-paper" href={appLinks.register}>Create a free account</a>
              <a className="btn btn-line-light" href={appLinks.login}>Sign in</a>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
