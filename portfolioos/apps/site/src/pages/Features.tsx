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

// The app screen shown beside each group. 'ca' gets a printed trial balance
// instead, since a CA's deliverable is the books themselves.
const VISUAL: Record<string, ScreenName | 'books'> = {
  imports: 'review', overview: 'dashboard', mf: 'mf', tax: 'tax', protect: 'insurance',
  things: 'vehicle', everyday: 'emi', family: 'family', ca: 'books',
};

function Books() {
  const rows: [string, string, string][] = [
    ['Equity shares', '18,42,600', ''], ['Mutual funds', '42,10,300', ''], ['Bank — savings', '3,84,210', ''],
    ['Home loan', '', '31,20,000'], ['Capital account', '', '33,17,110'],
  ];
  return (
    <div className="feat-books ruled">
      <h4>Trial balance</h4>
      <p className="fb-sub">As at 31 March 2027</p>
      <table>
        <thead><tr><th>Account</th><th>Dr.</th><th>Cr.</th></tr></thead>
        <tbody>{rows.map(([a, d, c]) => <tr key={a}><td>{a}</td><td>{d}</td><td>{c}</td></tr>)}</tbody>
        <tfoot><tr><td>Total</td><td>64,37,110</td><td>64,37,110</td></tr></tfoot>
      </table>
      <p className="hand">Tallied ✓</p>
    </div>
  );
}

function Group({ id, title, intro, items, flip }: { id: string; title: string; intro: string; items: [string, string][]; flip?: boolean }) {
  const v = VISUAL[id];
  return (
    <section className={`feat-block feat-split${flip ? ' flip' : ''}`} id={id} aria-labelledby={`${id}-title`}>
      <div className="feat-copy">
        <div className="feat-block-head"><h2 className="h2" id={`${id}-title`}>{title}</h2><p>{intro}</p></div>
        <ul className="feat-list">
          {items.map(([h, p]) => <li key={h}><h3>{h}</h3><p>{p}</p></li>)}
        </ul>
      </div>
      {v && (
        <div className="feat-visual" aria-hidden="true">
          {v === 'books' ? <Books /> : <div className="feat-device"><Screen name={v} /></div>}
        </div>
      )}
    </section>
  );
}

function AssetTiles() {
  return (
    <section className="feat-block" id="asset-classes" aria-labelledby="asset-classes-title">
      <div className="feat-block-head"><h2 className="h2" id="asset-classes-title">Nineteen asset classes</h2><p>Each one priced and taxed by its own rules.</p></div>
      <ul className="asset-tiles">
        {assetFolios.map((a, i) => (
          <li key={a.name} tabIndex={0}>
            <span className="at-no">f. {i + 1}</span>
            <h3>{a.name}</h3>
            <span className="at-pt">{a.points[0]}</span>
            <p>{a.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Reports filed into four folders, so 41 names read as a cabinet, not a list.
const FOLDERS: [string, string[]][] = [
  ['Holdings & performance', ['Holdings summary', 'Portfolio snapshot', 'Top holdings', 'Sector allocation', 'Demat holdings', 'Family-wise holdings', 'Performance (XIRR)', 'Holding-period return', 'Combined realised & unrealised', 'Mutual fund mark-to-market']],
  ['Tax', ['Capital gains (FIFO)', 'Brokerwise capital gains', 'Mutual fund capital gains', 'Grandfathered LTCG', 'ITR Schedule 112A', 'Short-term, long-term & speculation', 'Tax P&L', 'Tax summary', 'Advance tax summary', 'STT (section 10DB)', 'Dividend report', 'Income report']],
  ['Trades & brokers', ['Cash flow', 'Fund flow', 'Contract notes summary', 'Contract note charges', 'Broker bill register', 'Broker bill register, member-wise', 'Script ledger', 'Scriptwise quantity', 'Opening stock', 'Closing balance']],
  ['Books of account', ['Account ledger', 'Financial ledger', 'Day book', 'Chart of accounts', 'Trial balance', 'Profit & loss', 'Balance sheet', 'Bank reconciliation', 'Tally export']],
];

function ReportShelf() {
  return (
    <section className="feat-block" id="reports" aria-labelledby="reports-title">
      <div className="feat-block-head">
        <h2 className="h2" id="reports-title">Every report, listed</h2>
        <p>{reports.length} reports, each a download as PDF or Excel. Family-wise versions are available on the Family plan.</p>
      </div>
      <div className="folders">
        {FOLDERS.map(([name, list]) => (
          <div className="folder" key={name}>
            <h3 className="folder-tab">{name}</h3>
            <span className="folder-count" aria-hidden="true">{list.length}</span>
            <ul>{list.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        ))}
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
        <Group {...second} flip />
        <AssetTiles />
        {rest.slice(0, 2).map((g, i) => <Group key={g.id} {...g} flip={i % 2 === 1} />)}
        <ReportShelf />
        {rest.slice(2).map((g, i) => <Group key={g.id} {...g} flip={i % 2 === 1} />)}
      </div>

      <CtaBand title="Seen enough to try it?" text="Create a free account, or tell us what you'd need before you'd switch.">
        <a className="btn btn-paper" href={appLinks.register}>Create a free account</a>
        <Link className="btn btn-line-light" to="/contact">Contact us</Link>
      </CtaBand>
    </>
  );
}
