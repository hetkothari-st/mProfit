import { emptyWillPayload, type WillAssetItem, type WillPayload, type WillPerson } from '../schema.js';

export const TODAY = '2026-10-12';

export function person(p: Partial<WillPerson> & { id: string; name: string }): WillPerson {
  return {
    partyType: 'INDIVIDUAL',
    relationship: 'SON',
    dob: '1990-01-01',
    contact: null,
    sourceFamilyMemberId: null,
    contingentId: null,
    ...p,
  };
}

export function item(p: Partial<WillAssetItem> & { sourceKey: string; label: string }): WillAssetItem {
  return {
    side: 'ASSET',
    kind: 'BANK_ACCOUNT',
    ref: null,
    value: '100000.00',
    valueAsOf: TODAY,
    ownership: { type: 'SOLE', sharePct: '100' },
    review: 'CONFIRMED',
    userEdited: false,
    note: null,
    ...p,
  };
}

/** A complete will that passes every BLOCKER and WARNING rule (only the INFO legal-review note fires). */
export function validWillPayload(): WillPayload {
  return {
    ...emptyWillPayload(),
    details: {
      legalName: 'Ramesh Kumar Verma',
      dob: '1970-05-15',
      jurisdiction: 'IN',
      personalLaw: 'HINDU',
      address: '12 MG Road, Pune 411001',
      maritalStatus: 'MARRIED',
      hasChildren: true,
      hasDependents: false,
      parentage: { relation: null, name: '' },
    },
    people: [
      person({ id: 'p-spouse', name: 'Sunita Verma', relationship: 'SPOUSE', dob: '1972-08-01' }),
      person({ id: 'p-son', name: 'Arjun Verma', relationship: 'SON', dob: '1998-02-10', contingentId: 'p-spouse' }),
      person({ id: 'p-trust', name: 'Pune Animal Trust', partyType: 'ORGANISATION', relationship: 'CHARITY', dob: null }),
    ],
    roles: { executorId: 'p-spouse', altExecutorId: 'p-son', guardianId: null, altGuardianId: null },
    estate: {
      asOf: TODAY,
      failedSources: [],
      items: [
        item({ sourceKey: 'bank:b1', label: 'HDFC Bank savings account', ref: 'XXXX1234', value: '250000.00' }),
        item({ sourceKey: 'holdings:pf1:EQUITY', kind: 'HOLDING', label: 'Equity - My Portfolio', value: '1500000.00' }),
        item({ sourceKey: 'loan:l1', side: 'LIABILITY', kind: 'LOAN', label: 'Home loan - SBI', value: '400000.00' }),
      ],
    },
    allocation: {
      residuary: [
        { personId: 'p-spouse', sharePct: '60' },
        { personId: 'p-son', sharePct: '40' },
      ],
      specificGifts: [{ itemId: 'holdings:pf1:EQUITY', personId: 'p-son', sharePct: '100' }],
      fixedGifts: [{ personId: 'p-trust', amount: '50000' }],
      survivalDays: 30,
    },
    instructions: { text: 'I wish my books to go to the Pune public library.' },
  };
}
