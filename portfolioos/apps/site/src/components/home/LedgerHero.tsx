import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { appLinks } from '../../lib/config';
import { gsap, prefersReducedMotion, useIsoLayoutEffect } from '../../lib/gsap';
import { Screen } from '../screens/Screens';

const CAPTIONS = ['Scroll to open the ledger', 'Your net worth, on the first page', 'Every alert, waiting for a nod', 'Tax, worked out lot by lot'];

/** The hero: a bahi-khata that opens and turns its pages as you scroll. */
export function LedgerHero() {
  const root = useRef<HTMLElement>(null);
  const [caption, setCaption] = useState(0);

  useIsoLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const stage = el.querySelector<HTMLElement>('.book-stage')!;
    const scaler = el.querySelector<HTMLElement>('.book-scaler')!;
    const book = el.querySelector<HTMLElement>('.book')!;
    const cover = el.querySelector<HTMLElement>('.cover')!;
    const band = el.querySelector<HTMLElement>('.band')!;
    const floor = el.querySelector<HTMLElement>('.book-floor')!;
    const leaves = [1, 2, 3].map((n) => el.querySelector<HTMLElement>(`[data-leaf="${n}"]`)!);
    const narrow = window.matchMedia('(max-width: 960px)').matches;
    const cssNum = (name: string, fallback: number) => parseFloat(getComputedStyle(stage).getPropertyValue(name)) || fallback;

    const copy = el.querySelector<HTMLElement>('.hero-copy')!;
    const visual = el.querySelector<HTMLElement>('.hero-visual')!;
    const grid = el.querySelector<HTMLElement>('.hero-grid')!;

    // Phones: shrink the open spread to fit the screen width.
    // Desktop: the scroll timeline scales the book up instead (see below).
    const fit = () => {
      if (!narrow) return;
      const pw = cssNum('--pw', 300);
      const s = Math.min(1, stage.clientWidth / (pw * 2 + 24));
      gsap.set(scaler, { scale: s });
      stage.style.height = s < 1 ? `${Math.round((cssNum('--ph', 410) + 110) * s)}px` : '';
    };
    fit();
    window.addEventListener('resize', fit);

    const ctx = gsap.context(() => {
      const openPose = () => ({ x: cssNum('--pw', 300) / 2, rotationX: 16, rotationY: 0, rotationZ: 0 });
      if (prefersReducedMotion()) {
        gsap.set(book, openPose());
        gsap.set(cover, { z: 0.5, rotationY: -180, transformOrigin: 'left center' });
        gsap.set(band, { autoAlpha: 0 });
        gsap.set(floor, { scaleX: 1.9 });
        leaves.forEach((l, i) => gsap.set(l, { z: 3 - i, transformOrigin: 'left center' }));
        setCaption(1);
        return;
      }
      gsap.set(book, { x: 0, rotationX: 22, rotationY: -30, rotationZ: 5 });
      gsap.set(cover, { z: 14, rotationY: 0, transformOrigin: 'left center' });
      // unturned leaves stack 3,2,1 on the right; turned ones 1,2,3 on the left
      leaves.forEach((l, i) => gsap.set(l, { z: 3 - i, rotationY: 0, transformOrigin: 'left center' }));

      const openScale = () => {
        const pw = cssNum('--pw', 360);
        const ph = cssNum('--ph', 490);
        return Math.min(1.4, (grid.clientWidth - 16) / (pw * 2 + 24), (window.innerHeight - 72 - 110) / (ph + 30));
      };
      const idle = gsap.to(book, { rotationY: -24, rotationX: 18, duration: 3.2, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      const tl = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        scrollTrigger: {
          trigger: narrow ? '.hero-visual' : el,
          start: narrow ? 'center 52%' : 'top top+=72',
          end: narrow ? '+=200%' : '+=260%',
          pin: narrow ? '.hero-visual' : '.hero-pin',
          scrub: 0.8,
          invalidateOnRefresh: true,
          onUpdate: (st) => {
            if (st.progress > 0.001) idle.pause();
            else idle.resume();
            const p = st.progress;
            setCaption(p < 0.2 ? 0 : p < 0.55 ? 1 : p < 0.85 ? 2 : 3);
          },
        },
      });
      tl.to(book, { ...openPose(), duration: 1 }, 0)
        .to(cover, { rotationY: -180, z: 0.5, duration: 1 }, 0.1)
        .to(band, { autoAlpha: 0, duration: 0.25 }, 0.05)
        .to(floor, { scaleX: narrow ? 1.9 : () => 1.9 * openScale(), scaleY: narrow ? 1 : openScale, y: narrow ? 0 : () => (openScale() - 1) * cssNum('--ph', 490) * 0.5, opacity: 0.9, duration: 1 }, 0);
      if (!narrow) {
        // As it opens, the headline steps aside and the ledger moves to the
        // centre and grows until the spread fills the hero.
        const toCentre = () => grid.clientWidth / 2 - (visual.offsetLeft - grid.offsetLeft + visual.offsetWidth / 2);
        tl.to(copy, { autoAlpha: 0, x: -80, duration: 0.6 }, 0)
          .to(el.querySelector('.hero-caption'), { autoAlpha: 0, duration: 0.3 }, 0)
          .to(visual, { x: toCentre, duration: 1 }, 0)
          .to(scaler, { scale: openScale, duration: 1 }, 0);
      }
      tl
        .to({}, { duration: 0.5 })
        .to(leaves[0], { rotationY: -179, z: 1, duration: 1 })
        .to({}, { duration: 0.5 })
        .to(leaves[1], { rotationY: -179, z: 2, duration: 1 })
        .to({}, { duration: 0.4 });
    }, el);

    return () => {
      window.removeEventListener('resize', fit);
      ctx.revert();
    };
  }, []);

  return (
    <section className="hero" ref={root} aria-labelledby="hero-title">
      <div className="hero-pin">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <h1 className="display" id="hero-title">Every paisa, in one honest ledger.</h1>
            <p className="lede">
              Your family has kept a <em>bahi-khata</em> for generations. EveryPaisa is that ledger, rebuilt: stocks, mutual funds, FDs, PF,
              gold, property, vehicles, insurance and loans, with your bank and broker alerts filed in for you.
            </p>
            <div className="hero-actions">
              <a className="btn btn-ink" href={appLinks.register}>Start free</a>
              <Link className="btn btn-line" to="/#how">See how it works</Link>
            </div>
            <p className="hero-note"><span aria-hidden="true" />Free for individuals. Your data is encrypted and never sold.</p>
          </div>

          <div className="hero-visual">
            <div className="book-stage" role="img" aria-label="A black EveryPaisa ledger opens to show the dashboard, review queue and tax report">
              <div className="book-floor" />
              <div className="book-scaler">
                <div className="book">
                  <div className="back-cover"><div className="face board" /></div>
                  <div className="spine board-spine" />
                  <div className="pages-block"><div className="edge-r" /><div className="edge-b" /></div>
                  <div className="ribbon" />

                  <div className="leaf" data-leaf="3">
                    <div className="face front"><Screen name="tax" /></div>
                    <div className="face back ruled" />
                  </div>
                  <div className="leaf" data-leaf="2">
                    <div className="face front"><Screen name="review" /></div>
                    <div className="face back ruled">
                      <h4>And at year end, the CA is happy.</h4>
                      <p>Capital gains by FIFO, grandfathering, Schedule 112A and thirty-odd reports, ready before the ITR deadline.</p>
                      <p className="hand">Cr. ₹2,86,910 ✓</p>
                      <span className="folio">f. 3</span>
                    </div>
                  </div>
                  <div className="leaf" data-leaf="1">
                    <div className="face front"><Screen name="dashboard" /></div>
                    <div className="face back ruled">
                      <h4>Then it files itself.</h4>
                      <p>Bank SMS, broker contract notes, SIP debits, FD interest. Each one is read, sorted and laid out for you to approve.</p>
                      <p className="hand">Dr. / Cr. — reconciled</p>
                      <span className="folio">f. 2</span>
                    </div>
                  </div>

                  <div className="cover">
                    <div className="face front board cover-front">
                      <div className="cf-top">
                        <img className="cf-mark" src="/assets/everypaisa-mark.png" alt="" />
                        <span>EveryPaisa</span>
                      </div>
                      <div className="cf-title">Family<br /><em>Ledger</em></div>
                      <div className="cf-figure">
                        <span className="cf-label">Total net worth</span>
                        <span className="cf-amount">₹1,84,62,310</span>
                        <svg className="cf-spark" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true">
                          <path d="M0 34 L20 33 L40 30 L60 31 L80 24 L100 26 L120 19 L140 17 L160 12 L180 10 L200 4" fill="none" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      </div>
                      <div className="cf-foot"><span>Assets · Liabilities · Net worth</span><span>FY 2026–27</span></div>
                      <div className="band" />
                    </div>
                    <div className="face back board">
                      <div className="endpaper">
                        <div className="bookplate">
                          <div className="bp-k">This ledger belongs to</div>
                          <p>One page for everything the family owns, owes and is <em>owed.</em></p>
                          <small>Net worth, today, in one number.</small>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="hero-caption" aria-live="polite">{CAPTIONS[caption]}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
