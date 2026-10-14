import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { assetFolios } from '../../data/content';
import { gsap, prefersReducedMotion, useIsoLayoutEffect } from '../../lib/gsap';
import { SectionHead } from '../Common';
import { Screen, type ScreenName } from '../screens/Screens';

/* ---------- Asset classes as a ledger index ---------- */
export function AssetIndex() {
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const a = assetFolios[sel];

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const n = (next + assetFolios.length) % assetFolios.length;
    setSel(n);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-i="${n}"]`)?.focus();
  };

  return (
    <section className="section section-flush" id="assets" aria-labelledby="assets-title">
      <div className="wrap">
        <SectionHead
          kicker="What it tracks"
          id="assets-title"
          title="Nineteen asset classes. One index."
          lede="Every folio in the ledger knows the rules of its asset: how it is priced, how it is taxed, and when it needs your attention."
        />
        <div className="index-wrap">
          <ul className="folio-list" role="tablist" aria-label="Asset classes" ref={listRef}>
            {assetFolios.map((f, i) => (
              <li key={f.name} role="presentation">
                <button
                  role="tab"
                  id={`folio-${i}`}
                  data-i={i}
                  aria-selected={i === sel}
                  aria-controls="folio-card"
                  tabIndex={i === sel ? 0 : -1}
                  onClick={() => setSel(i)}
                  onKeyDown={(e) => onKey(e, i)}
                >
                  <span>{f.name}</span>
                  <span className="dots" aria-hidden="true" />
                  <span className="pg">f. {i + 1}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="folio-card" id="folio-card" role="tabpanel" aria-labelledby={`folio-${sel}`}>
            <div className="folio-anim" key={sel}>
              <div className="no">Folio {sel + 1} of {assetFolios.length}</div>
              <h3>{a.name}</h3>
              <p>{a.summary}</p>
              <ul>{a.points.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- App tour with a sticky laptop ---------- */
const CHAPTERS: { key: ScreenName; tag: string; title: string; text: string; points: string[] }[] = [
  { key: 'dashboard', tag: 'What am I worth?', title: "The whole family's money, on one page.", text: 'Net worth across every asset, allocation, XIRR and profit, and the alerts that need you this week.', points: ['Net worth history and cash-flow forecast', 'Best and worst performers, risk and correlation', 'A what-if simulator for your allocation', 'A portfolio score with plain-language fixes'] },
  { key: 'mf', tag: 'Is this fund any good?', title: 'Mutual fund research you can actually read.', text: 'Each fund gets a score built from returns, risk, cost and consistency, with the reasoning shown, not hidden.', points: ['Rolling returns and drawdowns over 1, 3 and 5 years', 'Overlap between the funds you hold', 'Look-through to the stocks underneath', 'Expense ratio drag, riskometer and tax lots'] },
  { key: 'tax', tag: 'What do I owe?', title: 'Capital gains your CA can sign off on.', text: 'Gains are matched lot by lot using FIFO, with grandfathering for holdings bought before 31 January 2018.', points: ['STCG, LTCG and intraday, split by asset and broker', 'Schedule 112A, ready for the ITR', 'Advance tax and tax-loss harvesting suggestions', 'One-click export to Tally'] },
  { key: 'insurance', tag: 'Is my family covered?', title: 'Insurance, read against what you actually need.', text: 'See every policy, where the gaps are, and what is due. Print an emergency sheet the family can find when it matters.', points: ['Life, health, motor and home policies in one list', 'Coverage gaps, explained in plain words', 'Premium and renewal reminders', 'Succession: nominees get verified access if something happens to you'] },
  { key: 'vehicle', tag: 'When does the PUC expire?', title: 'Cars, flats and tenants, looked after.', text: 'Add a vehicle by its registration number and the RC details fill in. Add a tenancy and the rent receipts write themselves.', points: ['PUC, insurance, fitness and road-tax expiry alerts', "Pending challans and today's fuel prices", 'Rent due dates, overdue reminders and receipts', 'Property value, expenses and capital gains on sale'] },
  { key: 'emi', tag: 'Can I prepay the home loan?', title: 'Everyday money, without the spreadsheet.', text: 'Loans, credit cards, EMIs and the dinner bill you split with friends live in the same ledger as your investments.', points: ['EMI calculator with current home-loan rates and prepayment', 'Home-loan tax benefits under 24(b) and 80C', "Credit cards, dues and money you've lent", 'Split expenses with friends and settle up over UPI'] },
  { key: 'family', tag: 'And for the whole household?', title: 'One view for the family. One workspace for your CA.', text: "Add parents, a spouse or children, manage accounts for members who won't log in, and invite your CA with their own secure access.", points: ['Consolidated family net worth and reports', 'Shared goals: retirement, education, a home', 'CA workspace with full double-entry accounting', 'Trial balance, P&L and balance sheet per client'] },
];

export function Tour() {
  const [active, setActive] = useState<ScreenName>('dashboard');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const items = listRef.current?.querySelectorAll<HTMLElement>('.chap');
    if (!items || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.getAttribute('data-chap') as ScreenName)),
      { rootMargin: '-45% 0px -45% 0px' },
    );
    items.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, []);

  return (
    <section className="section chapters" id="tour" aria-labelledby="tour-title">
      <div className="wrap">
        <SectionHead kicker="Inside the app" id="tour-title" title="Not ten dashboards. One place that answers the question you actually have." />
        <div className="chap-grid">
          <div className="chap-list" ref={listRef}>
            {CHAPTERS.map((c) => (
              <article className={`chap${c.key === active ? '' : ' dim'}`} data-chap={c.key} key={c.key}>
                <p className="tag">{c.tag}</p>
                <h3>{c.title}</h3>
                <p>{c.text}</p>
                <ul>{c.points.map((p) => <li key={p}>{p}</li>)}</ul>
                <div className="inline-screen"><div className="laptop-screen"><Screen name={c.key} /></div></div>
              </article>
            ))}
          </div>
          <div className="chap-device" aria-hidden="true">
            <div className="laptop">
              <div className="laptop-lid">
                <div className="laptop-screen">
                  <div className="screen-stack">
                    {CHAPTERS.map((c) => (
                      <div className={`stack-item${c.key === active ? ' on' : ''}`} key={c.key}><Screen name={c.key} /></div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="laptop-base" />
            </div>
          </div>
        </div>
        <p className="tour-more"><Link className="btn btn-line" to="/features">See every feature</Link></p>
      </div>
    </section>
  );
}

/* ---------- Audiences ---------- */
export function Audiences() {
  const A: [string, string, string][] = [
    ['For you', 'You invest through two brokers and four AMCs, have a PF you never look at and an FD that renews itself. You want one number you can trust and a tax report that doesn\'t take a weekend.', 'Salaried professionals, first-time investors, active traders.'],
    ['For your family', "Your parents' FDs, your spouse's mutual funds, the flat in your father's name. See it together, plan goals together, and make sure everyone knows where things are.", 'Households, joint families, people managing money for parents.'],
    ['For your CA', 'Give your chartered accountant or adviser their own login to your books. They get the reports they file with: ledgers, trial balance, Schedule 112A, Tally export.', 'Chartered accountants, advisers, family offices.'],
  ];
  return (
    <section className="section" aria-labelledby="aud-title">
      <div className="wrap">
        <SectionHead kicker="Who it's for" id="aud-title" title="Built for the way Indian families hold money." />
        <div className="aud">
          {A.map(([h, p, w]) => (
            <div key={h}><h3>{h}</h3><p>{p}</p><p className="who">{w}</p></div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Privacy with a turning wax seal ---------- */
export function PrivacySeal({ points, cta = true }: { points: [string, string][]; cta?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.seal', { rotationY: -25, rotationX: 10 }, {
        rotationY: 335, rotationX: -6, ease: 'none',
        scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 1 },
      });
    }, el);
    return () => ctx.revert();
  }, []);
  return (
    <section className="section vault" id="privacy" ref={ref} aria-labelledby="privacy-title">
      <div className="wrap vault-grid">
        <div>
          <p className="kicker">Privacy</p>
          <h2 className="h2" id="privacy-title">Sealed like the family ledger in the almirah.</h2>
          <p className="lede">This is the most private data you have. We built EveryPaisa assuming that, from the database up.</p>
          <ul className="vault-list">
            {points.map(([h, p]) => <li key={h}><strong>{h}</strong><span>{p}</span></li>)}
          </ul>
          {cta && <p className="vault-more"><Link className="btn btn-paper" to="/security">How we protect your data</Link></p>}
        </div>
        <div className="seal-stage" aria-hidden="true">
          <div className="seal-glow" />
          <div className="seal">
            <div className="rim" />
            <div className="disc"><img src="/assets/everypaisa-mark.png" alt="" /></div>
            <div className="disc back"><div className="back-text">Encrypted.<br />Never sold.<br />Yours.</div></div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Platforms ---------- */
export function Platforms() {
  const ref = useRef<HTMLDivElement>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.phone', { y: 60 }, { y: -30, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 1 } });
    }, el);
    return () => ctx.revert();
  }, []);
  return (
    <section className="section section-flush" aria-labelledby="plat-title">
      <div className="wrap platforms">
        <div>
          <p className="kicker">Where it runs</p>
          <h2 className="h2" id="plat-title">On your laptop, your desk and your phone.</h2>
          <ul className="plat-list">
            <li><strong>Web</strong><span>Works in any modern browser. Nothing to install.</span></li>
            <li><strong>Windows</strong><span>A desktop app that updates itself.</span></li>
            <li><strong>Phone</strong><span>Fully usable on mobile today; add it to your home screen. Native apps are on the way.</span></li>
          </ul>
        </div>
        <div className="devices" ref={ref} aria-hidden="true">
          <div className="laptop">
            <div className="laptop-lid"><div className="laptop-screen"><Screen name="dashboard" /></div></div>
            <div className="laptop-base" />
          </div>
          <div className="phone"><Screen name="mobile" /></div>
        </div>
      </div>
    </section>
  );
}
