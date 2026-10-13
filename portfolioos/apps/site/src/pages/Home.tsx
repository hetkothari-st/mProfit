import { CtaBand, FaqList, PricingTable, SectionHead } from '../components/Common';
import { HowItWorks } from '../components/home/HowItWorks';
import { LedgerHero } from '../components/home/LedgerHero';
import { Scatter } from '../components/home/Scatter';
import { AssetIndex, Audiences, Platforms, PrivacySeal, Tour } from '../components/home/Sections';
import { generalFaq, securityPoints } from '../data/content';

const HOME_PRIVACY = securityPoints.filter(([h]) => !['Audit log', 'No way to move money'].includes(h));

export default function Home() {
  return (
    <>
      <LedgerHero />
      <Scatter />
      <HowItWorks />
      <AssetIndex />
      <Tour />
      <Audiences />
      <PrivacySeal points={HOME_PRIVACY} />
      <section className="section" id="pricing" aria-labelledby="pricing-title">
        <div className="wrap">
          <SectionHead kicker="Pricing" id="pricing-title" title="Free for your own money. Pay when you automate, or add the family." />
          <PricingTable />
        </div>
      </section>
      <Platforms />
      <section className="section section-flush" aria-labelledby="faq-title">
        <div className="wrap">
          <SectionHead kicker="Questions" id="faq-title" title="Things people ask before they trust us with their money." />
          <FaqList items={generalFaq} />
        </div>
      </section>
      <CtaBand title="Open your ledger." text="Create a free account and add your first holdings in a few minutes. No card needed." />
    </>
  );
}
