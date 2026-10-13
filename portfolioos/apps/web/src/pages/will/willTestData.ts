import {
  emptyWillPayload, type AuthUser, type WillAssetItem, type WillDraftWire, type WillOverviewWire, type WillPayload, type WillPerson,
} from '@everypaisa/shared';
import { useAuthStore } from '@/stores/auth.store';
import { useActingAsStore } from '@/stores/actingAs.store';

export const TODAY = '2026-10-12';

export function person(p: Partial<WillPerson> & { id: string; name: string }): WillPerson {
  return { partyType: 'INDIVIDUAL', relationship: 'SON', dob: '1990-01-01', contact: null, sourceFamilyMemberId: null, contingentId: null, ...p };
}

export function item(p: Partial<WillAssetItem> & { sourceKey: string; label: string }): WillAssetItem {
  return {
    side: 'ASSET', kind: 'BANK_ACCOUNT', ref: null, value: '100000.00', valueAsOf: TODAY,
    ownership: { type: 'SOLE', sharePct: '100' }, review: 'CONFIRMED', userEdited: false, note: null, ...p,
  };
}

export function fullPayload(): WillPayload {
  return {
    ...emptyWillPayload(),
    details: {
      legalName: 'Ramesh Kumar Verma', dob: '1970-05-15', jurisdiction: 'IN', personalLaw: 'HINDU',
      address: '12 MG Road, Pune 411001', maritalStatus: 'MARRIED', hasChildren: true, hasDependents: false,
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
      residuary: [{ personId: 'p-spouse', sharePct: '60' }, { personId: 'p-son', sharePct: '40' }],
      specificGifts: [{ itemId: 'holdings:pf1:EQUITY', personId: 'p-son', sharePct: '100' }],
      fixedGifts: [{ personId: 'p-trust', amount: '50000' }],
    },
    instructions: { text: 'I wish my books to go to the Pune public library.' },
  };
}

export function signIn(plan: AuthUser['plan'] = 'PLUS'): void {
  useAuthStore.setState({
    user: { id: 'u1', email: 'a@b.com', name: 'Test User', role: 'INVESTOR', plan, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  });
}

export function resetStores(): void {
  useAuthStore.setState({ user: null });
  useActingAsStore.setState({ profile: null });
}

export function overview(p: Partial<WillOverviewWire> = {}): WillOverviewWire {
  return {
    status: 'NOT_CREATED',
    draft: null,
    versions: [],
    estate: { assets: '1750000.0000', liabilities: '400000.0000', net: '1350000.0000', nomineeOnly: '0.0000' },
    estateFailedSources: [],
    history: [],
    review: null,
    ...p,
  };
}

export function draftWire(p: Partial<WillDraftWire> = {}): WillDraftWire {
  return {
    id: 'w1', version: 1, revision: 0, currentStep: 2, payload: fullPayload(), findings: [],
    updatedAt: '2026-10-12T05:00:00.000Z', ...p,
  };
}
