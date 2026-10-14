import { useRef, type ReactNode } from 'react';
import { gsap, prefersReducedMotion, useIsoLayoutEffect } from '../../lib/gsap';
import { SectionHead } from '../Common';

// Each slip is drawn as the real thing it stands for: a phone notification,
// a PDF, a bank counterfoil, a torn contract note, a policy certificate,
// the RC smart card, a locker tag.
type Slip = { cls: string; src: [string, string]; body: ReactNode; icon?: string; stamp?: string };
const SLIPS: Slip[] = [
  { cls: 'notif bank', icon: 'HD', src: ['VM-HDFCBK', 'now'], body: 'Rs.12,500.00 debited from A/c XX9876 towards SIP. Avl bal Rs.84,210.' },
  { cls: 'doc', src: ['CAS · CAMS + KFin', '14 pp'], body: <><b>Consolidated Account Statement</b><br />Folios: 11 · Schemes: 23</> },
  { cls: 'counterfoil', stamp: 'Branch copy', src: ['FD advice', 'No. 004812'], body: <>Fixed Deposit <b>₹5,00,000</b> @ 7.10%<br />Matures 18 Mar 2027</> },
  { cls: 'torn', src: ['Contract note', 'NSE · CM'], body: <><b>BUY INFY × 25 @ ₹1,536.50</b><br />Brokerage ₹20 · STT ₹38</> },
  { cls: 'cert', src: ['Premium receipt', 'Annual'], body: <>Term plan · Sum assured <b>₹2 Cr</b><br />Premium ₹18,400 due 4 Nov</> },
  { cls: 'card', src: ['Credit card', 'Bill due 18 Oct'], body: <><b className="cc-num">•••• •••• •••• 2907</b><span className="cc-due">Outstanding ₹46,210</span></> },
  { cls: 'rcdoc', src: ['RC · Vahan', 'LMV'], body: <><b className="plate">MH 01 XX 4821</b><br />Petrol · PUC valid till 12 Oct</> },
  { cls: 'notif upi', icon: '✓', src: ['UPI credit', '1 Oct'], body: '₹32,000 received from R. SHARMA · "Oct rent"' },
  { cls: 'notif epf', icon: 'PF', src: ['EPFO', '2m ago'], body: 'Contribution of ₹21,600 credited to UAN ending 4417.' },
  { cls: 'tag', src: ['Locker 17', 'Gold'], body: <><b>Bangles 46 g</b><br />22K · bought 2011</> },
];

// [x fraction, y fraction, depth, rotation] for each slip
const SPOTS: [number, number, number, number][] = [
  [-0.38, -0.3, 60, -8], [0.3, -0.34, -40, 6], [-0.08, -0.06, 120, -3],
  [0.36, -0.03, 20, 9], [-0.4, 0.18, -80, 5], [0.06, 0.32, 40, -7],
  [0.4, 0.35, -120, 4], [-0.22, 0.38, 90, -10], [0.02, -0.38, -60, 3],
  [-0.37, -0.05, -30, 6],
];

/** The problem: scattered paperwork that gathers into one ledger as you scroll. */
export function Scatter() {
  const stageRef = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ctx = gsap.context(() => {
      const slips = gsap.utils.toArray<HTMLElement>('.slip');
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      slips.forEach((s, i) => {
        const [fx, fy, z, r] = SPOTS[i % SPOTS.length];
        gsap.set(s, { xPercent: -50, yPercent: -50, x: fx * w, y: fy * h, z, rotation: r, rotationX: 8 });
      });
      if (prefersReducedMotion()) return;
      slips.forEach((s, i) =>
        gsap.to(s, { y: `+=${8 + (i % 3) * 5}`, rotation: `+=${i % 2 ? 2 : -2}`, duration: 2.6 + (i % 4) * 0.4, yoyo: true, repeat: -1, ease: 'sine.inOut' }),
      );
      gsap.timeline({ scrollTrigger: { trigger: stage, start: 'center 52%', end: '+=120%', pin: true, scrub: 1 } })
        .to(slips, { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, scale: 0.55, opacity: 0, duration: 1, stagger: 0.05, ease: 'power3.in' }, 0)
        .fromTo('.scatter-ledger', { opacity: 0, scale: 0.7, rotationY: -30 }, { opacity: 1, scale: 1, rotationY: 0, duration: 0.6, ease: 'power2.out' }, 0.7);
    }, stage);
    return () => ctx.revert();
  }, []);

  return (
    <section className="section scatter" aria-labelledby="scatter-title">
      <div className="wrap">
        <SectionHead
          kicker="The problem"
          id="scatter-title"
          title="Your money lives in forty places. You remember maybe twelve."
          lede="A debit SMS here, a CAS PDF there, the LIC receipt in a drawer, the FD your father opened in 2014, the car's PUC that expired last week. Nobody has the full picture, least of all at tax time."
        />
        <div className="scatter-stage" ref={stageRef} aria-hidden="true">
          {SLIPS.map((s, i) => (
            <div className={`slip ${s.cls}`} key={i}>
              {s.icon && <i className="slip-ic">{s.icon}</i>}
              <div className="src"><span>{s.src[0]}</span><span>{s.src[1]}</span></div>
              <div className="slip-body">{s.body}</div>
              {s.stamp && <span className="slip-stamp">{s.stamp}</span>}
            </div>
          ))}
          <div className="scatter-ledger board ledger-mini">
            <div className="lc-title">Family<br /><em>Ledger</em></div>
            <div className="lc-cols">Everything, in one book</div>
          </div>
        </div>
        <div className="scatter-foot">
          <div><strong>19</strong>asset classes, from stocks and F&amp;O to vehicles and the gold in the locker.</div>
          <div><strong>30+</strong>tax and CA reports, including Schedule 112A and grandfathered LTCG.</div>
          <div><strong>1</strong>net worth number for you, or for the whole family.</div>
        </div>
      </div>
    </section>
  );
}
