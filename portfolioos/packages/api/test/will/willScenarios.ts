/**
 * Acceptance scenarios for the will document (docs/will/WILL-V2-REDESIGN.md).
 * Pure data: no database, no environment, so scripts/willSamplePdfs.ts can
 * render them too. Names, addresses and numbers are invented.
 */
import { emptyWillPayload, type WillAssetItem, type WillPayload, type WillPerson } from '@everypaisa/shared';

export const SCENARIO_DATE = '2026-10-21';

type PersonIn = Partial<WillPerson> & { id: string; name: string };
type ItemIn = Partial<WillAssetItem> & { sourceKey: string; label: string };

export const person = (p: PersonIn): WillPerson => ({
  partyType: 'INDIVIDUAL', relationship: 'SON', dob: '1990-01-01', contact: null,
  sourceFamilyMemberId: null, contingentId: null, ...p,
});

export const item = (p: ItemIn): WillAssetItem => ({
  side: 'ASSET', kind: 'BANK_ACCOUNT', ref: null, value: '100000.00', valueAsOf: SCENARIO_DATE,
  ownership: { type: 'SOLE', sharePct: '100' }, review: 'CONFIRMED', userEdited: false, note: null, ...p,
});

function base(): WillPayload {
  const m = emptyWillPayload();
  m.details = {
    legalName: 'Ramesh Kumar Verma', dob: '1962-05-15', jurisdiction: 'IN', personalLaw: 'HINDU',
    address: 'Flat 12, Gulmohar Residency, 45 Karve Road, Kothrud, Pune 411038, Maharashtra',
    maritalStatus: 'MARRIED', hasChildren: true, hasDependents: false,
    parentage: { relation: 'SON_OF', name: 'Late Shri Mohan Lal Verma' },
  };
  m.estate.asOf = SCENARIO_DATE;
  return m;
}

/** A: one beneficiary, a named executor, a few assets, one liability. */
export function scenarioBasic(): WillPayload {
  const m = base();
  m.people = [person({ id: 'p-spouse', name: 'Sunita Verma', relationship: 'SPOUSE', dob: '1966-08-01' })];
  m.roles.executorId = 'p-spouse';
  m.estate.items = [
    item({ sourceKey: 'bank:b1', label: 'HDFC Bank savings account', ref: 'XXXX1234', value: '250000.00' }),
    item({ sourceKey: 'holdings:pf1:EQUITY', kind: 'HOLDING', label: 'Equity shares - Zerodha demat', ref: 'XXXX5521', value: '1500000.00' }),
    item({ sourceKey: 'holdings:pf1:MF', kind: 'HOLDING', label: 'Mutual funds - CAMS folio', ref: 'XXXX0042', value: '820000.50' }),
    item({ sourceKey: 'loan:l1', side: 'LIABILITY', kind: 'LOAN', label: 'Home loan - State Bank of India', ref: 'XXXX7781', value: '400000.00' }),
  ];
  m.allocation.residuary = [{ personId: 'p-spouse', sharePct: '100' }];
  return m;
}

/** B: several beneficiaries, whole and part gifts of specific assets, a money gift, a split residue. */
export function scenarioBequests(): WillPayload {
  const m = scenarioBasic();
  m.people.push(
    person({ id: 'p-son', name: 'Arjun Verma', relationship: 'SON', dob: '1992-02-10' }),
    person({ id: 'p-dau', name: 'Kavya Verma', relationship: 'DAUGHTER', dob: '1995-07-21' }),
    person({ id: 'p-trust', name: 'Pune Animal Welfare Trust', partyType: 'ORGANISATION', relationship: 'CHARITY', dob: null }),
  );
  m.roles.altExecutorId = 'p-son';
  m.estate.items.push(
    item({ sourceKey: 'property:h1', kind: 'OWNED_PROPERTY', label: 'Flat 12, Gulmohar Residency, Kothrud, Pune', value: '14500000.00' }),
    item({ sourceKey: 'vehicle:v1', kind: 'VEHICLE', label: 'Honda City (2021)', ref: 'MH12AB1234', value: '650000.00' }),
  );
  m.allocation.specificGifts = [
    { itemId: 'property:h1', personId: 'p-spouse', sharePct: '100' },
    { itemId: 'holdings:pf1:EQUITY', personId: 'p-son', sharePct: '50' },
    { itemId: 'holdings:pf1:EQUITY', personId: 'p-dau', sharePct: '50' },
    { itemId: 'vehicle:v1', personId: 'p-son', sharePct: '100' },
  ];
  m.allocation.fixedGifts = [{ personId: 'p-trust', amount: '100000' }];
  m.allocation.residuary = [
    { personId: 'p-spouse', sharePct: '50' },
    { personId: 'p-son', sharePct: '25' },
    { personId: 'p-dau', sharePct: '25' },
  ];
  m.instructions.text = 'I wish my books to go to the Pune public library.\nI wish to be cremated according to Hindu rites.';
  return m;
}

/** C: one beneficiary has a back-up, another has none; a non-default survival period. */
export function scenarioContingency(): WillPayload {
  const m = scenarioBequests();
  m.people = m.people.map((p) => (p.id === 'p-son' ? { ...p, contingentId: 'p-dau' } : p));
  m.allocation.survivalDays = 60;
  return m;
}

/** D: minor children with a guardian and a back-up guardian. */
export function scenarioMinors(): WillPayload {
  const m = scenarioBasic();
  m.details.dob = '1984-03-09';
  m.people.push(
    person({ id: 'p-kid1', name: 'Meera Verma', relationship: 'DAUGHTER', dob: '2015-03-03', contingentId: 'p-kid2' }),
    person({ id: 'p-kid2', name: 'Rohan Verma', relationship: 'SON', dob: '2018-11-30', contingentId: 'p-kid1' }),
    person({ id: 'p-bro', name: 'Vikas Verma', relationship: 'BROTHER', dob: '1980-11-20' }),
  );
  m.roles.guardianId = 'p-spouse';
  m.roles.altGuardianId = 'p-bro';
  m.roles.altExecutorId = 'p-bro';
  m.allocation.residuary = [
    { personId: 'p-spouse', sharePct: '50' },
    { personId: 'p-kid1', sharePct: '25' },
    { personId: 'p-kid2', sharePct: '25' },
  ];
  return m;
}

/** E: a large inventory - long labels, every category, many pages of Schedule, a Devanagari name. */
export function scenarioLarge(): WillPayload {
  const m = scenarioBequests();
  m.details.legalName = 'Ramesh Kumar Verma (रमेश कुमार वर्मा)';
  const banks = ['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra Bank', 'Bank of Baroda'];
  for (let i = 0; i < 30; i++) {
    m.estate.items.push(item({
      sourceKey: `bank:x${i}`, label: `${banks[i % banks.length]} ${i % 3 === 0 ? 'fixed deposit' : 'savings account'}, ${['Kothrud', 'Deccan Gymkhana', 'Aundh', 'Baner'][i % 4]} branch`,
      ref: `XXXX${String(1000 + i * 37).slice(-4)}`, value: `${(i + 1) * 13579}.${String(i % 100).padStart(2, '0')}`,
      ownership: i % 7 === 0 ? { type: 'JOINT', sharePct: '50' } : { type: 'SOLE', sharePct: '100' },
    }));
  }
  for (let i = 0; i < 40; i++) {
    m.estate.items.push(item({
      sourceKey: `holdings:h${i}`, kind: 'HOLDING',
      label: `${['Equity', 'Mutual fund', 'Bonds', 'Gold ETF', 'Sovereign Gold Bond', 'Crypto (WazirX)'][i % 6]} - ${['Zerodha demat', 'Groww', 'CAMS consolidated folio held jointly with spouse for many years', 'KFintech folio', 'RBI Retail Direct'][i % 5]}`,
      ref: i % 2 ? `XXXX${String(2000 + i).slice(-4)}` : null, value: i === 5 ? '0.00' : `${(i + 3) * 98765}.00`,
    }));
  }
  for (let i = 0; i < 6; i++) {
    m.estate.items.push(item({
      sourceKey: `property:p${i}`, kind: i % 2 ? 'RENTAL_PROPERTY' : 'OWNED_PROPERTY',
      label: `Survey No. ${100 + i}/${i + 2}, Plot ${i + 7}, ${['Village Hinjewadi, Taluka Mulshi', 'Wakad', 'Lonavala', 'Satara (ancestral)'][i % 4]}, District Pune`,
      value: `${(i + 1) * 3500000}.00`,
      ownership: i === 3 ? { type: 'HUF', sharePct: '25' } : i === 1 ? { type: 'JOINT', sharePct: '50' } : { type: 'SOLE', sharePct: '100' },
    }));
  }
  for (let i = 0; i < 8; i++) {
    m.estate.items.push(item({
      sourceKey: `insurance:i${i}`, kind: 'INSURANCE', label: `${['LIC Jeevan Anand', 'HDFC Life Click 2 Protect', 'Star Health family floater'][i % 3]} policy`,
      ref: `XXXX${String(3000 + i).slice(-4)}`, value: `${(i + 1) * 2500000}.00`, ownership: { type: 'NOMINEE_ONLY', sharePct: '100' },
    }));
  }
  m.estate.items.push(
    item({ sourceKey: 'pf:1', kind: 'PROVIDENT_FUND', label: 'EPF account - Infosys Ltd', ref: 'XXXX8890', value: '2345678.00', ownership: { type: 'NOMINEE_ONLY', sharePct: '100' } }),
    item({ sourceKey: 'pf:2', kind: 'PROVIDENT_FUND', label: 'PPF account - State Bank of India', ref: 'XXXX4412', value: '1500000.00' }),
    item({ sourceKey: 'lg:1', kind: 'LOAN_GIVEN', label: 'Loan to Ravi Kulkarni (written agreement dated 10/01/2026)', value: '200000.00' }),
    item({ sourceKey: 'oa:1', kind: 'OTHER_ASSET', label: 'Gold jewellery (about 180 g) in HDFC Bank locker no. 214, Kothrud branch', value: '1250000.00' }),
    item({ sourceKey: 'oa:2', kind: 'OTHER_ASSET', label: 'Silver articles and utensils', value: '0.00' }),
  );
  for (let i = 0; i < 12; i++) {
    m.estate.items.push(item({
      sourceKey: `liab:${i}`, side: 'LIABILITY', kind: i % 3 === 0 ? 'CREDIT_CARD' : i % 3 === 1 ? 'LOAN' : 'OTHER_LIABILITY',
      label: `${['HDFC Regalia credit card', 'Car loan - Axis Bank', 'Hand loan from Suresh Patil'][i % 3]} ${i + 1}`,
      ref: i % 3 === 2 ? null : `XXXX${String(4000 + i).slice(-4)}`, value: `${(i + 1) * 23456}.75`,
    }));
  }
  return m;
}

/** F: entries the validation rules must block - the document is never generated from these. */
export function scenarioInvalid(): WillPayload {
  const m = scenarioBequests();
  m.details.address = '';
  m.roles.executorId = null;
  m.allocation.residuary = [{ personId: 'p-spouse', sharePct: '70' }, { personId: 'p-son', sharePct: '20' }];
  m.allocation.specificGifts.push({ itemId: 'property:h1', personId: 'p-dau', sharePct: '50' });
  return m;
}

/** G: joint, HUF and nominee-payable items alongside sole ones. */
export function scenarioJoint(): WillPayload {
  const m = scenarioBequests();
  m.estate.items = m.estate.items.map((i) =>
    i.sourceKey === 'property:h1' ? { ...i, ownership: { type: 'JOINT' as const, sharePct: '50' } } : i,
  );
  m.estate.items.push(
    item({ sourceKey: 'property:huf', kind: 'OWNED_PROPERTY', label: 'Ancestral house, Wai, District Satara', value: '6000000.00', ownership: { type: 'HUF', sharePct: '20' } }),
    item({ sourceKey: 'insurance:lic', kind: 'INSURANCE', label: 'LIC Jeevan Anand policy', ref: 'XXXX9876', value: '2500000.00', ownership: { type: 'NOMINEE_ONLY', sharePct: '100' } }),
    item({ sourceKey: 'pf:epf', kind: 'PROVIDENT_FUND', label: 'EPF account - Infosys Ltd', ref: 'XXXX8890', value: '2345678.00', ownership: { type: 'NOMINEE_ONLY', sharePct: '100' } }),
  );
  return m;
}

export const SCENARIOS: ReadonlyArray<{ id: string; title: string; build: () => WillPayload }> = [
  { id: 'A-basic', title: 'Basic individual will', build: scenarioBasic },
  { id: 'B-bequests', title: 'Specific and residuary bequests', build: scenarioBequests },
  { id: 'C-contingency', title: 'Contingency planning', build: scenarioContingency },
  { id: 'D-minors', title: 'Minor children and guardianship', build: scenarioMinors },
  { id: 'E-large', title: 'Large financial inventory', build: scenarioLarge },
  { id: 'G-joint', title: 'Joint assets and nominations', build: scenarioJoint },
];
