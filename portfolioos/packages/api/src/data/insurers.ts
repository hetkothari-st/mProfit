/**
 * Indian insurers and the email domains their policy documents, premium
 * receipts, renewal notices and claim letters come from.
 *
 * Drives the insurance Gmail search (services/insurance/insuranceGmailFetch):
 * an insurance scan asks Gmail only for PDFs from these domains, or with an
 * insurance subject line. A wrong or missing domain costs a missed email,
 * never wrong data — the subject-line clause catches insurers not listed
 * here, and every document is classified before anything is kept.
 *
 * Domains match subdomains too (Gmail `from:` matches on the address
 * suffix), so `licindia.in` also covers `ebiz.licindia.in`.
 */

export type InsurerKind = 'LIFE' | 'GENERAL' | 'HEALTH' | 'AGGREGATOR';

export interface Insurer {
  id: string;
  name: string;
  kind: InsurerKind;
  domains: string[];
}

export const INSURERS: Insurer[] = [
  // Life
  { id: 'lic', name: 'LIC of India', kind: 'LIFE', domains: ['licindia.in', 'licindia.com'] },
  { id: 'hdfc-life', name: 'HDFC Life', kind: 'LIFE', domains: ['hdfclife.com', 'hdfclife.in'] },
  { id: 'icici-pru', name: 'ICICI Prudential Life', kind: 'LIFE', domains: ['iciciprulife.com'] },
  { id: 'sbi-life', name: 'SBI Life', kind: 'LIFE', domains: ['sbilife.co.in'] },
  { id: 'axis-max-life', name: 'Axis Max Life', kind: 'LIFE', domains: ['maxlifeinsurance.com', 'axismaxlife.com'] },
  { id: 'tata-aia', name: 'Tata AIA Life', kind: 'LIFE', domains: ['tataaia.com', 'tataaialife.com'] },
  { id: 'bajaj-life', name: 'Bajaj Allianz Life', kind: 'LIFE', domains: ['bajajallianzlife.co.in', 'bajajlifeinsurance.com'] },
  { id: 'kotak-life', name: 'Kotak Life', kind: 'LIFE', domains: ['kotaklife.com'] },
  { id: 'aditya-birla-life', name: 'Aditya Birla Sun Life Insurance', kind: 'LIFE', domains: ['adityabirlacapital.com'] },
  { id: 'pnb-metlife', name: 'PNB MetLife', kind: 'LIFE', domains: ['pnbmetlife.com', 'pnbmetlife.co.in'] },
  { id: 'canara-hsbc-life', name: 'Canara HSBC Life', kind: 'LIFE', domains: ['canarahsbclife.com', 'canarahsbclife.in'] },
  { id: 'bharti-axa-life', name: 'Bharti AXA Life', kind: 'LIFE', domains: ['bharti-axalife.com'] },
  { id: 'edelweiss-life', name: 'Edelweiss Life', kind: 'LIFE', domains: ['edelweisslife.in', 'edelweisstokio.in'] },
  { id: 'pramerica-life', name: 'Pramerica Life', kind: 'LIFE', domains: ['pramericalife.in'] },
  { id: 'shriram-life', name: 'Shriram Life', kind: 'LIFE', domains: ['shriramlife.com'] },
  { id: 'ageas-federal-life', name: 'Ageas Federal Life', kind: 'LIFE', domains: ['ageasfederal.com'] },
  { id: 'indiafirst-life', name: 'IndiaFirst Life', kind: 'LIFE', domains: ['indiafirstlife.com'] },
  { id: 'star-union-dai-ichi', name: 'Star Union Dai-ichi Life', kind: 'LIFE', domains: ['sudlife.in'] },
  { id: 'future-generali-life', name: 'Future Generali Life', kind: 'LIFE', domains: ['futuregenerali.in'] },

  // Health
  { id: 'star-health', name: 'Star Health', kind: 'HEALTH', domains: ['starhealth.in'] },
  { id: 'niva-bupa', name: 'Niva Bupa', kind: 'HEALTH', domains: ['nivabupa.com', 'maxbupa.com'] },
  { id: 'care-health', name: 'Care Health', kind: 'HEALTH', domains: ['careinsurance.com', 'careshealthinsurance.com'] },
  { id: 'manipal-cigna', name: 'ManipalCigna', kind: 'HEALTH', domains: ['manipalcigna.com'] },
  { id: 'aditya-birla-health', name: 'Aditya Birla Health', kind: 'HEALTH', domains: ['adityabirlahealth.com'] },
  { id: 'galaxy-health', name: 'Galaxy Health', kind: 'HEALTH', domains: ['galaxyhealth.com'] },
  { id: 'narayana-health', name: 'Narayana Health Insurance', kind: 'HEALTH', domains: ['narayanahealth.insurance'] },

  // General (motor, home, travel, health)
  { id: 'icici-lombard', name: 'ICICI Lombard', kind: 'GENERAL', domains: ['icicilombard.com'] },
  { id: 'hdfc-ergo', name: 'HDFC ERGO', kind: 'GENERAL', domains: ['hdfcergo.com'] },
  { id: 'bajaj-general', name: 'Bajaj Allianz General', kind: 'GENERAL', domains: ['bajajallianz.co.in', 'bajajgeneralinsurance.com'] },
  { id: 'tata-aig', name: 'Tata AIG', kind: 'GENERAL', domains: ['tataaig.com'] },
  { id: 'sbi-general', name: 'SBI General', kind: 'GENERAL', domains: ['sbigeneral.in'] },
  { id: 'acko', name: 'Acko', kind: 'GENERAL', domains: ['acko.com'] },
  { id: 'digit', name: 'Go Digit', kind: 'GENERAL', domains: ['godigit.com'] },
  { id: 'reliance-general', name: 'Reliance General', kind: 'GENERAL', domains: ['reliancegeneral.co.in'] },
  { id: 'iffco-tokio', name: 'IFFCO Tokio', kind: 'GENERAL', domains: ['iffcotokio.co.in'] },
  { id: 'royal-sundaram', name: 'Royal Sundaram', kind: 'GENERAL', domains: ['royalsundaram.in'] },
  { id: 'chola-ms', name: 'Chola MS', kind: 'GENERAL', domains: ['cholainsurance.com'] },
  { id: 'future-generali-general', name: 'Future Generali General', kind: 'GENERAL', domains: ['fggeneral.in'] },
  { id: 'universal-sompo', name: 'Universal Sompo', kind: 'GENERAL', domains: ['universalsompo.com'] },
  { id: 'zuno', name: 'Zuno General', kind: 'GENERAL', domains: ['hizuno.com'] },
  { id: 'liberty-general', name: 'Liberty General', kind: 'GENERAL', domains: ['libertyinsurance.in'] },
  { id: 'shriram-general', name: 'Shriram General', kind: 'GENERAL', domains: ['shriramgi.com'] },
  { id: 'kotak-general', name: 'Kotak General', kind: 'GENERAL', domains: ['kotakgeneral.com'] },
  { id: 'magma-general', name: 'Magma General', kind: 'GENERAL', domains: ['magmainsurance.com'] },
  { id: 'new-india', name: 'New India Assurance', kind: 'GENERAL', domains: ['newindia.co.in'] },
  { id: 'national-insurance', name: 'National Insurance', kind: 'GENERAL', domains: ['nationalinsurance.nic.co.in'] },
  { id: 'united-india', name: 'United India Insurance', kind: 'GENERAL', domains: ['uiic.co.in'] },
  { id: 'oriental', name: 'Oriental Insurance', kind: 'GENERAL', domains: ['orientalinsurance.org.in'] },

  // Brokers and aggregators that mail policy PDFs on the insurer's behalf
  { id: 'policybazaar', name: 'Policybazaar', kind: 'AGGREGATOR', domains: ['policybazaar.com'] },
  { id: 'ditto', name: 'Ditto', kind: 'AGGREGATOR', domains: ['joinditto.in'] },
  { id: 'turtlemint', name: 'Turtlemint', kind: 'AGGREGATOR', domains: ['turtlemint.com'] },
  { id: 'renewbuy', name: 'RenewBuy', kind: 'AGGREGATOR', domains: ['renewbuy.com'] },
  { id: 'coverfox', name: 'Coverfox', kind: 'AGGREGATOR', domains: ['coverfox.com'] },
];

/** Subject phrases that mark an insurance document from any sender. */
export const INSURANCE_SUBJECT_PHRASES = [
  'policy document',
  'policy schedule',
  'policy bond',
  'policy copy',
  'premium receipt',
  'premium paid',
  'renewal notice',
  'renewal premium',
  'premium due',
  'claim settlement',
  'claim intimation',
  'claim approved',
];

/** The insurer an email address belongs to, if any. */
export function insurerForAddress(address: string): Insurer | null {
  const domain = address.toLowerCase().split('@').pop() ?? '';
  return (
    INSURERS.find((i) => i.domains.some((d) => domain === d || domain.endsWith(`.${d}`))) ?? null
  );
}
