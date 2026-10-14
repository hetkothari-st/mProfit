import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { appLinks } from '../lib/config';
import { metaFor } from '../lib/meta';
import { ScrollTrigger, useIsoLayoutEffect } from '../lib/gsap';

const NAV: { to: string; label: string }[] = [
  { to: '/#how', label: 'How it works' },
  { to: '/features', label: 'Features' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/security', label: 'Security' },
  { to: '/contact', label: 'Contact' },
];

function Brand() {
  return (
    <Link className="brand" to="/">
      <img src="/assets/everypaisa-mark.png" alt="" width={34} height={34} />
      EveryPaisa
    </Link>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname, hash } = useLocation();

  useEffect(() => setOpen(false), [pathname, hash]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  return (
    <header className={`site-header${scrolled ? ' scrolled' : ''}`}>
      <nav className={`wrap nav${open ? ' open' : ''}`} aria-label="Main">
        <Brand />
        <ul className="nav-links">
          {NAV.map((n) => (
            <li key={n.to}>
              {n.to.includes('#') ? <Link to={n.to}>{n.label}</Link> : <NavLink to={n.to}>{n.label}</NavLink>}
            </li>
          ))}
        </ul>
        <a className="nav-signin" href={appLinks.login}>Sign in</a>
        <a className="btn btn-ink" href={appLinks.register}>Start free</a>
        <button className="nav-toggle" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : 'Menu'}
        </button>
      </nav>
      <div className="mobile-menu" id="mobile-menu">
        {NAV.map((n) => <Link key={n.to} to={n.to}>{n.label}</Link>)}
        <a href={appLinks.login}>Sign in</a>
        <a className="btn btn-ink" href={appLinks.register}>Start free</a>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <Brand />
            <p className="foot-blurb">The family ledger for Indian households: every asset, every rupee, one honest number.</p>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><Link to="/#how">How it works</Link></li>
              <li><Link to="/#assets">Asset classes</Link></li>
              <li><Link to="/features">All features</Link></li>
              <li><Link to="/features#reports">Reports</Link></li>
              <li><Link to="/pricing">Pricing</Link></li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li><Link to="/security">Security</Link></li>
              <li><a href={appLinks.privacy}>Privacy policy</a></li>
              <li><Link to="/contact">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4>Your account</h4>
            <ul>
              <li><a href={appLinks.register}>Create an account</a></li>
              <li><a href={appLinks.login}>Sign in</a></li>
              <li><Link to="/contact?topic=ca">For CAs and advisers</Link></li>
            </ul>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© {new Date().getFullYear()} EveryPaisa. EveryPaisa is a tracking and reporting tool, not investment advice.</span>
          <span className="deva" lang="hi">शुभ लाभ</span>
        </div>
      </div>
    </footer>
  );
}

/** Scroll to top or to #hash on navigation, keep <title> and description in sync. */
function RouteEffects() {
  const { pathname, hash, key } = useLocation();
  useEffect(() => {
    const meta = metaFor(pathname);
    document.title = meta.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description);
  }, [pathname]);

  // Every page opens at its top: on links, on Back/Forward and on reload.
  // The browser's own restoration would drop you mid-page, and on the home
  // page that lands inside a pinned scroll scene. Only a link that names a
  // section (/#how, /features#reports) scrolls somewhere else.
  useIsoLayoutEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  }, []);

  useIsoLayoutEffect(() => {
    if (hash) return;
    window.scrollTo(0, 0);
    // pin spacers are added after mount; settle them, then pin to the top again
    const id = window.requestAnimationFrame(() => {
      ScrollTrigger.refresh();
      window.scrollTo(0, 0);
    });
    return () => window.cancelAnimationFrame(id);
  }, [pathname, hash, key]);

  useEffect(() => {
    if (!hash) return;
    // wait a frame so the page's sections (and any pin spacers) exist
    const id = window.setTimeout(() => {
      ScrollTrigger.refresh();
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
    }, 60);
    return () => window.clearTimeout(id);
  }, [pathname, hash, key]);
  return null;
}

export function Layout() {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <RouteEffects />
      <Header />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
