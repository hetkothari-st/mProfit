import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CtaBand } from '../components/Common';
import { Screen, type ScreenName } from '../components/screens/Screens';
import { assetFolios, featureGroups, reports } from '../data/content';
import { appLinks } from '../lib/config';
import { prefersReducedMotion } from '../lib/gsap';

const FAN: ScreenName[] = ['tax', 'mf', 'review', 'insurance', 'dashboard'];

/** Five app screens fanned out in 3D; the fan tilts toward the pointer. */
function ScreenFan() {
  const fanRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fan = fanRef.current;
    const inner = innerRef.current;
    if (!fan || !inner) return;
    const cards = Array.from(fan.querySelectorAll<HTMLElement>('.fan-card'));
    const spread = () => {
      const step = Math.min(115, fan.clientWidth / 5.4);
      cards.forEach((c, i) => {
        const k = i - 2;
        c.style.transform = `translateX(${k * step}px) translateZ(${-Math.abs(k) * 90}px) rotateY(${k * -14}deg) rotateZ(${k * 2.5}deg)`;
        c.style.zIndex = String(10 - Math.abs(k));
      });
    };
    window.addEventListener('resize', spread);
    if (prefersReducedMotion()) {
      spread();
      return () => window.removeEventListener('resize', spread);
    }
    const t = window.setTimeout(() => {
      cards.forEach((c) => { c.style.transition = 'transform 1.1s cubic-bezier(.2,.7,.2,1)'; });
      spread();
    }, 200);
    const move = (e: PointerEvent) => {
      const r = fan.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      inner.style.transform = `rotateY(${x * 16}deg) rotateX(${-y * 10}deg)`;
    };
    const leave = () => { inner.style.transform = ''; };
    fan.addEventListener('pointermove', move);
    fan.addEventListener('pointerleave', leave);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', spread);
      fan.removeEventListener('pointermove', move);
      fan.removeEventListener('pointerleave', leave);
    };
  }, []);

  return (
    <div className="fan" ref={fanRef} aria-hidden="true">
      <div className="fan-inner" ref={innerRef}>
        {FAN.map((s) => <div className="fan-card" key={s}><Screen name={s} /></div>)}
      </div>
    </div>
  );
}

const TOC: [string, string][] = [
  ['imports', 'Imports'], ['overview', 'Net worth & analytics'], ['asset-classes', 'Asset classes'], ['mf', 'Mutual funds'], ['tax', 'Tax'],
  ['reports', 'Reports'], ['protect', 'Insurance & succession'], ['things', 'Property & vehicles'], ['everyday', 'Everyday money'],
  ['family', 'Family'], ['ca', 'For CAs'],
];

function Group({ id, title, intro, items }: { id: string; title: string; intro: string; items: [string, string][] }) {
  return (
    <section className="feat-block" id={id} aria-labelledby={`${id}-title`}>
      <div className="feat-block-head"><h2 className="h2" id={`${id}-title`}>{title}</h2><p>{intro}</p></div>
      <div className="feat-grid">
        {items.map(([h, p]) => <div className="feat" key={h}><h3>{h}</h3><p>{p}</p></div>)}
      </div>
    </section>
  );
}

export default function Features() {
  const [first, second, ...rest] = featureGroups;
  return (
    <>
      <section className="page-hero">
        <div className="wrap fan-hero">
          <div>
            <h1 className="display">Everything in the ledger.</h1>
            <p className="lede">The full list of what EveryPaisa does today, from reading a bank alert to printing a balance sheet for your CA.</p>
            <nav className="toc" aria-label="On this page">
              {TOC.map(([id, l]) => <Link key={id} to={`/features#${id}`}>{l}</Link>)}
            </nav>
          </div>
          <ScreenFan />
        </div>
      </section>

      <div className="wrap">
        <Group {...first} />
        <Group {...second} />
        <Group
          id="asset-classes"
          title="Nineteen asset classes"
          intro="Each one priced and taxed by its own rules."
          items={assetFolios.map((a) => [a.name, a.summary])}
        />
        {rest.slice(0, 2).map((g) => <Group key={g.id} {...g} />)}
        <section className="feat-block" id="reports" aria-labelledby="reports-title">
          <div className="feat-block-head">
            <h2 className="h2" id="reports-title">Every report, listed</h2>
            <p>Download as PDF or Excel. Family-wise versions are available on the Family plan.</p>
          </div>
          <ol className="report-book">{reports.map((r) => <li key={r}>{r}</li>)}</ol>
        </section>
        {rest.slice(2).map((g) => <Group key={g.id} {...g} />)}
      </div>

      <CtaBand title="Seen enough to try it?" text="Create a free account, or tell us what you'd need before you'd switch.">
        <a className="btn btn-paper" href={appLinks.register}>Create a free account</a>
        <Link className="btn btn-line-light" to="/contact">Contact us</Link>
      </CtaBand>
    </>
  );
}
