/**
 * Insurers registered with IRDAI, for recognising the insurer a free-text
 * label names ("HDFC Ergo Optima", "LIC Jeevan Anand") and showing its logo.
 *
 * Unlike banks, first words are never aliases: "HDFC" alone could be HDFC Life
 * or HDFC ERGO, "Bajaj" could be the life or the general company. Only full
 * names, former names and unambiguous abbreviations are listed.
 */
export type InsurerKind = 'life' | 'general' | 'health';

export interface IndianInsurer {
  name: string;
  kind: InsurerKind;
  /** Extra search terms: abbreviations and former names. */
  keywords?: string[];
}

export const INDIAN_INSURERS: IndianInsurer[] = [
  // Life
  { name: 'LIC', kind: 'life', keywords: ['Life Insurance Corporation', 'LIC of India'] },
  { name: 'HDFC Life', kind: 'life', keywords: ['HDFC Standard Life'] },
  { name: 'ICICI Prudential Life', kind: 'life', keywords: ['ICICI Prudential', 'ICICI Pru'] },
  { name: 'SBI Life', kind: 'life' },
  { name: 'Axis Max Life', kind: 'life', keywords: ['Max Life', 'Max Life Insurance'] },
  { name: 'Bajaj Allianz Life', kind: 'life', keywords: ['Bajaj Life'] },
  { name: 'Tata AIA Life', kind: 'life', keywords: ['Tata AIA'] },
  { name: 'Kotak Life', kind: 'life', keywords: ['Kotak Mahindra Life'] },
  { name: 'Aditya Birla Sun Life Insurance', kind: 'life', keywords: ['ABSLI', 'Birla Sun Life'] },
  { name: 'PNB MetLife', kind: 'life', keywords: ['MetLife'] },
  { name: 'Canara HSBC Life', kind: 'life', keywords: ['Canara HSBC'] },
  { name: 'Star Union Dai-ichi Life', kind: 'life', keywords: ['SUD Life'] },
  { name: 'IndiaFirst Life', kind: 'life', keywords: ['India First Life'] },
  { name: 'Aviva Life', kind: 'life', keywords: ['Aviva'] },
  { name: 'Edelweiss Life', kind: 'life', keywords: ['Edelweiss Tokio'] },
  { name: 'Ageas Federal Life', kind: 'life', keywords: ['Ageas Federal'] },
  { name: 'Pramerica Life', kind: 'life' },
  { name: 'Shriram Life', kind: 'life' },
  { name: 'Bandhan Life', kind: 'life', keywords: ['Aegon Life'] },
  // General
  { name: 'New India Assurance', kind: 'general', keywords: ['New India'] },
  { name: 'United India Insurance', kind: 'general', keywords: ['United India'] },
  { name: 'Oriental Insurance', kind: 'general' },
  { name: 'National Insurance', kind: 'general' },
  { name: 'ICICI Lombard', kind: 'general', keywords: ['Lombard'] },
  { name: 'HDFC ERGO', kind: 'general', keywords: ['HDFC Ergo General'] },
  { name: 'Bajaj Allianz General', kind: 'general', keywords: ['Bajaj Allianz', 'Bajaj General'] },
  { name: 'TATA AIG', kind: 'general', keywords: ['Tata AIG General'] },
  { name: 'Reliance General', kind: 'general' },
  { name: 'SBI General', kind: 'general' },
  { name: 'Cholamandalam MS', kind: 'general', keywords: ['Chola MS', 'Cholamandalam'] },
  { name: 'IFFCO Tokio', kind: 'general' },
  { name: 'Royal Sundaram', kind: 'general' },
  { name: 'Liberty General', kind: 'general' },
  { name: 'Universal Sompo', kind: 'general' },
  { name: 'Go Digit', kind: 'general', keywords: ['Digit Insurance', 'Digit General'] },
  { name: 'Acko', kind: 'general', keywords: ['Acko General'] },
  { name: 'Zuno General', kind: 'general', keywords: ['Zuno', 'Edelweiss General'] },
  { name: 'Future Generali', kind: 'general', keywords: ['Generali Central'] },
  { name: 'Magma General', kind: 'general', keywords: ['Magma HDI'] },
  { name: 'Navi General', kind: 'general', keywords: ['Navi Insurance'] },
  // Standalone health
  { name: 'Star Health', kind: 'health', keywords: ['Star Health and Allied'] },
  { name: 'Niva Bupa', kind: 'health', keywords: ['Max Bupa'] },
  { name: 'Care Health Insurance', kind: 'health', keywords: ['Care Health', 'Religare Health'] },
  { name: 'Aditya Birla Health', kind: 'health', keywords: ['Aditya Birla Health Insurance', 'Activ Health'] },
  { name: 'ManipalCigna', kind: 'health', keywords: ['Manipal Cigna', 'CignaTTK'] },
  { name: 'Galaxy Health', kind: 'health' },
  { name: 'Narayana Health Insurance', kind: 'health' },
];

/** "HDFC ERGO" → "hdfc-ergo". Keys the logo manifest. */
export function insurerSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
