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
    const leaves = [1, 2, 3].map((n) => el.querySelector<HTMLElement>(`[data-leaf="${n}"]`)!);
    const narrow = window.matchMedia('(max-width: 960px)').matches;
    const cssNum = (name: string, fallback: number) => parseFloat(getComputedStyle(stage).getPropertyValue(name)) || fallback;

    const fit = () => {
      const pw = cssNum('--pw', 300);
      const s = Math.min(1, stage.clientWidth / (pw * 2 + 24));
      scaler.style.transform = `scale(${s})`;
      stage.style.height = s < 1 ? `${Math.round((cssNum('--ph', 410) + 110) * s)}px` : '';
    };
    fit();
    window.addEventListener('resize', fit);

    const ctx = gsap.context(() => {
      const openPose = () => ({ x: cssNum('--pw', 300) / 2, rotationX: 16, rotationY: 0, rotationZ: 0 });
      if (prefersReducedMotion()) {
        gsap.set(book, openPose());
        gsap.set(cover, { z: 0.5, rotationY: -180, transformOrigin: 'left center' });
        leaves.forEach((l, i) => gsap.set(l, { z: 3 - i, transformOrigin: 'left center' }));
        setCaption(1);
        return;
      }
      gsap.set(book, { x: 0, rotationX: 22, rotationY: -30, rotationZ: 5 });
      gsap.set(cover, { z: 14, rotationY: 0, transformOrigin: 'left center' });
      // unturned leaves stack 3,2,1 on the right; turned ones 1,2,3 on the left
      leaves.forEach((l, i) => gsap.set(l, { z: 3 - i, rotationY: 0, transformOrigin: 'left center' }));

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
            <div className="book-stage" role="img" aria-label="A red ledger book opens to show the EveryPaisa dashboard, review queue and tax report">
              <div className="book-scaler">
                <div className="book">
                  <div className="book-shadow" />
                  <div className="back-cover"><div className="face cloth" /></div>
                  <div className="spine cloth" />
                  <div className="pages-block"><div className="edge-r" /><div className="edge-b" /></div>

                  <div className="leaf" data-leaf="3">
                    <div className="face front"><Screen name="tax" /></div>
                    <div className="face back ruled" />
                  </div>
                  <div className="leaf" data-leaf="2">
                    <div className="face front"><Screen name="review" /></div>
                    <div className="face back ruled">
                      <h4>And at year end, the CA is happy.</h4>
                      <p>Capital gains by FIFO, grandfathering, Schedule 112A and thirty-odd reports, ready before the ITR deadline.</p>
                      <p className="hand" lang="hi">शुभ लाभ</p>
                      <span className="folio">f. 3</span>
                    </div>
                  </div>
                  <div className="leaf" data-leaf="1">
                    <div className="face front"><Screen name="dashboard" /></div>
                    <div className="face back ruled">
                      <h4>Then it files itself.</h4>
                      <p>Bank SMS, broker contract notes, SIP debits, FD interest. Each one is read, sorted and laid out for you to approve.</p>
                      <p className="hand" lang="hi">जमा · नाम</p>
                      <span className="folio">f. 2</span>
                    </div>
                  </div>

                  <div className="cover">
                    <div className="face front cloth">
                      <div className="cover-strap" />
                      <div className="cover-art foil" lang="hi">
                        <div className="cover-swastik" aria-hidden="true">॥ श्री ॥</div>
                        <div className="cover-title">शुभ लाभ</div>
                        <div className="cover-sub" lang="en">EveryPaisa</div>
                        <div className="cover-year">संवत २०८२</div>
                      </div>
                    </div>
                    <div className="face back endpaper">
                      <div className="deva" lang="hi">॥ हिसाब ॥</div>
                      <p>One page for everything the family owns, owes and is owed.</p>
                      <small>Net worth, today, in one number.</small>
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
