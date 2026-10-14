// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SorterFileDTO, SorterPersonDTO } from '@everypaisa/shared';
import { MoveDialog } from './MoveDialog';

const file: SorterFileDTO = {
  id: 'f1',
  fileName: 'scan.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 10,
  docType: null,
  docDate: null,
  sortStatus: 'NEEDS_REVIEW',
  sortReason: 'Could not find a name on this document.',
  personId: null,
  createdAt: '2026-10-14T00:00:00Z',
};
const people = (): SorterPersonDTO[] => [
  { id: 'p1', displayName: 'Rahul Sharma', autoCreated: true, linkedUserId: null },
  { id: 'p2', displayName: 'Priya Mehta', autoCreated: false, linkedUserId: null },
];
const base = { file, saving: false, onClose: () => undefined };

afterEach(cleanup);

describe('MoveDialog', () => {
  it('keeps the person the user picked when the list refreshes underneath it', () => {
    const { rerender } = render(<MoveDialog {...base} people={people()} onSave={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Person'), { target: { value: 'p2' } });
    fireEvent.change(screen.getByLabelText('Document type'), { target: { value: 'ITR' } });
    // The tree poll hands in the same people as a new array.
    rerender(<MoveDialog {...base} people={people()} onSave={() => undefined} />);
    expect((screen.getByLabelText('Person') as HTMLSelectElement).value).toBe('p2');
    expect((screen.getByLabelText('Document type') as HTMLSelectElement).value).toBe('ITR');
  });

  it('files into a new person when there is nobody to pick yet', () => {
    const onSave = vi.fn();
    render(<MoveDialog {...base} people={[]} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('New person'), { target: { value: 'Kavita Rao' } });
    fireEvent.change(screen.getByLabelText('Document type'), { target: { value: 'ID_PROOF' } });
    fireEvent.click(screen.getByRole('button', { name: /move and rename/i }));
    expect(onSave).toHaveBeenCalledWith({ newPersonName: 'Kavita Rao', docType: 'ID_PROOF' });
  });

  it('can choose "New person…" even when people exist', () => {
    const onSave = vi.fn();
    render(<MoveDialog {...base} people={people()} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Person'), { target: { value: '__new__' } });
    fireEvent.change(screen.getByLabelText('New person'), { target: { value: 'Asha Bhat' } });
    fireEvent.click(screen.getByRole('button', { name: /move and rename/i }));
    expect(onSave).toHaveBeenCalledWith({ newPersonName: 'Asha Bhat', docType: 'OTHER' });
  });

  it('will not save a new person with no name', () => {
    render(<MoveDialog {...base} people={[]} onSave={() => undefined} />);
    expect(screen.getByRole('button', { name: /move and rename/i })).toHaveProperty('disabled', true);
  });
});
