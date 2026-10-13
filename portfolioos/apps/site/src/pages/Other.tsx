import { Link } from 'react-router-dom';
import { CtaBand, FaqList, PricingTable } from '../components/Common';
import { PrivacySeal } from '../components/home/Sections';
import { pricingFaq, securityPoints } from '../data/content';
import { appLinks } from '../lib/config';

export function Pricing() {
  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <h1 className="display">Free for your own money.</h1>
          <p className="lede">Track everything you own on the Free plan. Upgrade when you want imports to run themselves, the full report catalogue, the whole family, or a practice full of clients.</p>
          <div className="hero-actions page-actions">
            <a className="btn btn-ink" href={appLinks.register}>Create a free account</a>
            <Link className="btn btn-line" to="/contact?topic=ca">Talk to us about a practice</Link>
          </div>
        </div>
      </section>
      <section className="section section-flush" aria-label="Plans">
        <div className="wrap"><PricingTable /></div>
      </section>
      <section className="section" aria-labelledby="pfaq-title">
        <div className="wrap">
          <div className="section-head"><h2 className="h2" id="pfaq-title">Questions about plans</h2></div>
          <FaqList items={pricingFaq} />
        </div>
      </section>
      <CtaBand title="Start on Free today." text="Every asset class, your net worth and the basic reports, with no card needed." />
    </>
  );
}

export function Security() {
  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <h1 className="display">Your money's paperwork, kept private.</h1>
          <p className="lede">EveryPaisa holds the most sensitive data you have. Here is what we do with it, and what we never do.</p>
        </div>
      </section>
      <PrivacySeal points={securityPoints} cta={false} />
      <section className="section" aria-labelledby="never-title">
        <div className="wrap">
          <div className="feat-block-head"><h2 className="h2" id="never-title">What we never do</h2><p>These are commitments, not settings.</p></div>
          <div className="feat-grid">
            <div className="feat"><h3>Sell or share your data</h3><p>Your financial data is not sold, rented or shared with advertisers, lenders or anyone else.</p></div>
            <div className="feat"><h3>Read your whole inbox</h3><p>Only mail from the senders you pick is ever searched. Everything else in your inbox is left alone.</p></div>
            <div className="feat"><h3>Touch your accounts</h3><p>There is no way for EveryPaisa to move money, place trades or change anything at your bank or broker.</p></div>
          </div>
        </div>
      </section>
      <section className="section section-flush" aria-labelledby="report-title">
        <div className="wrap">
          <div className="feat-block-head">
            <h2 className="h2" id="report-title">Found a security issue?</h2>
            <p>Write to us with "Security report" as the topic and include steps to reproduce. Please test only against your own account. Read the full <a href={appLinks.privacy}>privacy policy</a>.</p>
          </div>
          <Link className="btn btn-ink" to="/contact?topic=security">Report an issue</Link>
        </div>
      </section>
    </>
  );
}

export function NotFound() {
  return (
    <section className="page-hero not-found">
      <div className="wrap">
        <p className="kicker">Folio missing</p>
        <h1 className="display">This page isn't in the ledger.</h1>
        <p className="lede">The link may be old, or the address mistyped.</p>
        <div className="hero-actions page-actions">
          <Link className="btn btn-ink" to="/">Go to the home page</Link>
          <Link className="btn btn-line" to="/features">See all features</Link>
        </div>
      </div>
    </section>
  );
}
