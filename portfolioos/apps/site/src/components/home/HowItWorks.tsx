import { useRef, useState } from 'react';
import { gsap, ScrollTrigger, prefersReducedMotion, useIsoLayoutEffect } from '../../lib/gsap';
import { SectionHead } from '../Common';
import { Legend, Spark } from '../screens/Screens';

const STEPS: [string, string][] = [
  ['Pick the senders you trust', 'Connect Gmail with read-only access and choose your bank, broker and registrar. We only ever search mail from those addresses, never the rest of your inbox.'],
  ['Each alert becomes an entry', 'Amount, date, instrument and account are pulled out of every alert, SIP debit and contract note. Personal identifiers are stripped before anything is parsed.'],
  ['You approve, once', 'New entries wait in a review queue. After five clean entries from a sender, you can let that sender file straight into the ledger.'],
  ['The ledger adds up', 'Holdings, gains, XIRR and net worth recalculate from the transactions themselves, so the numbers are always traceable back to a source.'],
];
const LABELS = ['Reading the alert', 'Pulling out the details', 'Waiting for your approval', 'Updating the ledger'];
const SOURCES = ['CAS from CAMS & KFintech', 'MF Central', 'Account Aggregator', 'Broker contract notes', 'Tradebooks & P&L files', 'EPF passbook', 'Excel & CSV', 'Manual entry'];
const EVENTS: [string, string, string][] = [
  ['SIP INSTALLMENT · 0.97', 'Parag Parikh Flexi Cap', '₹12,500.00'],
  ['BUY · 0.99', 'INFY × 25', '₹38,412.50'],
  ['INTEREST CREDIT · 0.95', 'SBI fixed deposit', '₹4,183.00'],
];
const START = 18407215;
const END = 18462310;
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

/** A short looping demo: an alert is read, approved, and the net worth updates. */
function Film({ step, setStep }: { step: number; setStep: (n: number) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  useIsoLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const nw = q('#f-nw')[0] as HTMLElement;
    const bar = q('.film-progress i')[0] as HTMLElement;
    const marks = q('mark');
    const chips = q('.f-ev .st') as HTMLElement[];
    const approve = q('.f-approve')[0] as HTMLElement;
    const queue = q('.f-queue')[0] as HTMLElement;

    const ctx = gsap.context(() => {
      const reset = () => {
        gsap.set(['.f-mail', '.f-fields', '.f-queue'], { opacity: 0, y: 14 });
        gsap.set('.f-ev', { opacity: 0, x: 16 });
        gsap.set('.f-worth', { opacity: 0, scale: 0.98 });
        gsap.set('.f-cursor', { opacity: 0, left: '62%', top: '88%' });
        marks.forEach((m) => m.classList.remove('hl'));
        chips.forEach((c) => { c.textContent = 'Review'; c.classList.remove('on'); });
        nw.textContent = inr(START);
      };
      reset();
      const tl = gsap.timeline({ repeat: -1, paused: true, onRepeat: reset, onUpdate: () => { bar.style.transform = `scaleX(${tl.progress()})`; } });
      tl.call(() => setStep(0), undefined, 0)
        .to('.f-mail', { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, 0.2)
        .call(() => setStep(1), undefined, 1.6)
        .call(() => marks[0].classList.add('hl'), undefined, 1.8)
        .call(() => marks[1].classList.add('hl'), undefined, 2.2)
        .call(() => marks[2].classList.add('hl'), undefined, 2.6)
        .to('.f-fields', { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 2.4)
        .to('.f-queue', { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 2.9)
        .to('.f-ev', { opacity: 1, x: 0, duration: 0.45, stagger: 0.5, ease: 'power2.out' }, 3.2)
        .call(() => setStep(2), undefined, 4.8)
        .to('.f-cursor', { opacity: 1, duration: 0.2 }, 5.0)
        .to('.f-cursor', {
          left: () => `${approve.offsetLeft + queue.offsetLeft + approve.offsetWidth / 2}px`,
          top: () => `${approve.offsetTop + queue.offsetTop + approve.offsetHeight / 2}px`,
          duration: 1.1, ease: 'power2.inOut',
        }, 5.0)
        .to(approve, { scale: 0.92, duration: 0.1, yoyo: true, repeat: 1 }, 6.2)
        .call(() => chips.forEach((c, i) => window.setTimeout(() => { c.textContent = 'Committed'; c.classList.add('on'); }, i * 140)), undefined, 6.3)
        .call(() => setStep(3), undefined, 7.6)
        .to(['.f-mail', '.f-fields', '.f-queue', '.f-cursor'], { opacity: 0, y: -10, duration: 0.5 }, 7.6)
        .to('.f-worth', { opacity: 1, scale: 1, duration: 0.6, ease: 'power2.out' }, 8.0)
        .to({ v: START }, { v: END, duration: 1.6, ease: 'power3.out', onUpdate() { nw.textContent = inr((this.targets()[0] as { v: number }).v); } }, 8.3)
        .to({}, { duration: 2.6 }, 9.9);
      tlRef.current = tl;

      if (prefersReducedMotion()) {
        tl.progress(0.7).pause();
        pausedRef.current = true;
        setPaused(true);
        return;
      }
      ScrollTrigger.create({
        trigger: el, start: 'top 85%', end: 'bottom 10%',
        onToggle: (st) => {
          if (pausedRef.current) return;
          if (st.isActive) tl.play(); else tl.pause();
        },
      });
    }, el);
    return () => ctx.revert();
  }, [setStep]);

  const toggle = () => {
    const next = !paused;
    pausedRef.current = next;
    setPaused(next);
    if (next) tlRef.current?.pause(); else tlRef.current?.play();
  };

  return (
    <div className="film" ref={root} role="img" aria-label="Animated demo: an SMS alert becomes a ledger entry, gets approved, and the net worth updates">
      <div className="film-frame">
        <div className="scr">
          <div className="scr-top"><span className="scr-dot" /><b>Inbox imports</b><span className="scr-pill">3 senders monitored</span></div>
          <div className="f-left">
            <div className="f-mail scr-card">
              <div className="from"><span className="av">HB</span><div><b>HDFC Bank alerts</b><div className="scr-label">alerts@hdfcbank.net</div></div></div>
              <div className="scr-label s-mb">SIP debit · today 09:41</div>
              <div>Dear Customer, <mark>Rs.12,500.00</mark> has been debited from A/c XX9876 on <mark>13-10-2026</mark> towards SIP for <mark>Parag Parikh Flexi Cap Fund</mark>.</div>
            </div>
            <div className="scr-card f-fields">
              <div className="scr-row s-mb"><b>What we read</b><span className="scr-chip">Identifiers removed</span></div>
              {[['Type', 'SIP installment'], ['Amount', '₹12,500.00'], ['Date', '13 Oct 2026'], ['Scheme', 'Parag Parikh Flexi Cap'], ['Account', 'XX9876']].map(([k, v]) => (
                <div className="f-kv" key={k}><span className="mut">{k}</span><span>{v}</span></div>
              ))}
              <div className="f-kv"><span className="mut">Confidence</span><span className="lime">0.97</span></div>
            </div>
          </div>
          <div className="f-queue scr-card">
            <div className="scr-row s-mb"><b>Pending review</b><span className="scr-btn f-approve">Approve all</span></div>
            {EVENTS.map(([t, n, a]) => (
              <div className="f-ev" key={n}>
                <div><div className="t">{t}</div><div>{n}</div></div>
                <div className="amt">{a}</div>
                <span className="scr-chip st">Review</span>
              </div>
            ))}
          </div>
          <div className="f-worth">
            <div className="scr-card">
              <div className="scr-label">Total net worth</div>
              <div className="scr-big f-nw" id="f-nw">{inr(START)}</div>
              <div className="pos s-mt">+₹55,095 today</div>
              <Spark fill={false} className="spark f-spark" />
              <div className="scr-grid2 s-mt">
                <div><div className="scr-label">XIRR</div><b>14.2%</b></div>
                <div><div className="scr-label">Unrealised P&amp;L</div><b className="pos">+₹22,48,905</b></div>
              </div>
            </div>
            <div className="scr-card f-donut-card">
              <div className="donut" />
              <Legend />
            </div>
          </div>
          <svg className="f-cursor" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 1 L1 13 L4.5 9.8 L7 15 L9 14 L6.6 9 L11 9 Z" fill="#fff" stroke="#111" strokeWidth="1" /></svg>
        </div>
      </div>
      <div className="film-controls">
        <button type="button" aria-pressed={paused} onClick={toggle}>{paused ? 'Play' : 'Pause'}</button>
        <div className="film-progress"><i /></div>
        <span>{LABELS[step]}</span>
      </div>
    </div>
  );
}

export function HowItWorks() {
  const [step, setStep] = useState(0);
  return (
    <section className="section" id="how" aria-labelledby="how-title">
      <div className="wrap">
        <SectionHead kicker="How it works" id="how-title" title="Your inbox already has the data. We read it, you approve it." />
        <div className="flow">
          <div>
            <ol className="steps playing">
              {STEPS.map(([h, p], i) => (
                <li key={h} className={i === step ? 'active' : undefined}>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </li>
              ))}
            </ol>
            <div className="sources">
              <p>Prefer files or direct links? These work too:</p>
              <ul className="source-list">{SOURCES.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          </div>
          <Film step={step} setStep={setStep} />
        </div>
      </div>
    </section>
  );
}
