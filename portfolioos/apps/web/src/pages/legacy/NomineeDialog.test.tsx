// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import type { DocumentDTO, LegacyNomineeDTO } from '@everypaisa/shared';
import { renderWithProviders } from '@/pages/split/testUtils';
import { documentsApi } from '@/api/documents.api';
import { NomineeDialog } from './NomineeDialog';

vi.mock('@/api/documents.api', () => ({ documentsApi: { list: vi.fn() } }));

afterEach(cleanup);

const doc = (id: string, fileName: string, will?: DocumentDTO['will']): DocumentDTO => ({
  id, fileName, ownerType: will ? 'WILL' : 'OTHER', ownerId: 'o', category: null, mimeType: 'application/pdf', sizeBytes: 10,
  externalEditKey: 'k', createdAt: '2026-10-12T00:00:00.000Z', updatedAt: '2026-10-12T00:00:00.000Z', ...(will ? { will } : {}),
});
const replaced = { current: false, label: 'Replaced by a later will' };

const nominee = {
  id: 'n1', name: 'Ravi', email: 'ravi@test.local', relationship: 'Brother', priority: 1, isVerifier: false,
  categories: ['DOCUMENTS'], documentIds: ['old-signed'], showAmounts: false,
} as unknown as LegacyNomineeDTO;

describe('NomineeDialog document picker', () => {
  it('hides a replaced will unless it is already shared, labels it when shown, and labels the live will', async () => {
    vi.mocked(documentsApi.list).mockResolvedValue([
      doc('deed', 'deed.pdf'),
      doc('live', 'will-v2.pdf', { current: true, label: 'Will, version 2 (unsigned print)' }),
      doc('live-signed', 'will-v2-signed.pdf', { current: true, label: 'Signed will, version 2' }),
      doc('old-pdf', 'will-v1.pdf', replaced),
      doc('old-signed', 'will-v1-signed.png', replaced),
    ]);
    renderWithProviders(<NomineeDialog open initial={nominee} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText('deed.pdf')).toBeTruthy();
    expect(screen.queryByText('will-v1.pdf')).toBeNull();
    const oldRow = screen.getByText('will-v1-signed.png').closest('label');
    expect(oldRow?.textContent).toContain('Replaced by a later will');
    expect(screen.getByText('will-v2.pdf').closest('label')?.textContent).toContain('Will, version 2 (unsigned print)');
    expect(screen.getByText('will-v2-signed.pdf').closest('label')?.textContent).toContain('Signed will, version 2');
    expect(screen.getByText('deed.pdf').closest('label')?.textContent).toBe('deed.pdf');
  });
});
