// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { renderWithProviders } from '@/pages/split/testUtils';
import { isWillNotExecutable, willApi } from '@/api/will.api';
import { WillExecutePage } from './WillExecutePage';
import { executionWire, resetStores, signIn } from '../willTestData';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/will.api', () => ({
  willApi: { execution: vi.fn(), recordExecution: vi.fn(), downloadPdf: vi.fn(), downloadSignedCopy: vi.fn() },
  isWillNotExecutable: vi.fn(() => false),
}));

const api = vi.mocked(willApi);
const render = () => renderWithProviders(<WillExecutePage />, { route: '/will/w1/execute', path: '/will/:id/execute' });

const executed = executionWire({
  status: 'EXECUTED', executedOn: '2026-10-12', witnesses: ['Asha Rao', 'Vikram Shah'], nextReviewAt: '2028-10-12',
  signedCopy: { fileName: 'will-v1-signed.pdf', mimeType: 'application/pdf', sizeBytes: 204800, uploadedAt: '2026-10-12T06:00:00.000Z' },
});

beforeEach(() => {
  vi.clearAllMocks();
  signIn('PLUS');
});
afterEach(() => {
  cleanup();
  resetStores();
});

describe('WillExecutePage', () => {
  it('shows the guide, the lawyer links and the PDF for a generated will', async () => {
    api.execution.mockResolvedValue(executionWire());
    api.downloadPdf.mockResolvedValue(undefined);
    render();
    expect(await screen.findByText('How to sign your will in India')).toBeTruthy();
    expect(screen.getByText('Generated')).toBeTruthy();
    expect(screen.getByRole('link', { name: /tele-law/i }).getAttribute('href')).toBe('https://www.tele-law.in/');
    expect(screen.getByRole('link', { name: /nalsa/i }).getAttribute('href')).toBe('https://nalsa.gov.in/');
    expect(api.execution).toHaveBeenCalledWith('w1');
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    await waitFor(() => expect(api.downloadPdf).toHaveBeenCalledWith('v1', 1));
  });

  it('stores the signed copy and then shows the record', async () => {
    api.execution.mockResolvedValue(executionWire());
    api.recordExecution.mockResolvedValue(executed);
    render();
    fireEvent.change(await screen.findByLabelText('Date you signed'), { target: { value: '2026-10-12' } });
    fireEvent.change(screen.getByLabelText('Witness 1 - full name'), { target: { value: 'Asha Rao' } });
    fireEvent.change(screen.getByLabelText('Witness 2 - full name'), { target: { value: 'Vikram Shah' } });
    const file = new File(['%PDF-1.7'], 'scan.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/^Signed copy/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Store signed copy' }));
    await waitFor(() =>
      expect(api.recordExecution).toHaveBeenCalledWith('w1', { executedOn: '2026-10-12', witnesses: ['Asha Rao', 'Vikram Shah'], file }),
    );
    expect(await screen.findByText(/signed on 12\/10\/2026/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Store signed copy' })).toBeNull();
  });

  it('shows a signed will with witnesses, review date and the stored copy', async () => {
    api.execution.mockResolvedValue(executed);
    api.downloadSignedCopy.mockResolvedValue(undefined);
    render();
    expect(await screen.findByText(/signed on 12\/10\/2026/i)).toBeTruthy();
    expect(document.body.textContent).toContain('Asha Rao and Vikram Shah');
    expect(document.body.textContent).toMatch(/next review 12\/10\/2028/i);
    expect(document.body.textContent).toContain('will-v1-signed.pdf');
    fireEvent.click(screen.getByRole('button', { name: /download signed copy/i }));
    await waitFor(() => expect(api.downloadSignedCopy).toHaveBeenCalledWith('w1', 'will-v1-signed.pdf'));
    fireEvent.click(screen.getByRole('button', { name: /replace the copy or fix details/i }));
    expect((screen.getByLabelText('Witness 2 - full name') as HTMLInputElement).value).toBe('Vikram Shah');
  });

  it('explains a witness who is also a beneficiary', async () => {
    api.execution.mockResolvedValue({ ...executed, warnings: ['WITNESS_IS_BENEFICIARY'] });
    render();
    expect(await screen.findByText(/same name as a beneficiary/i)).toBeTruthy();
  });

  it('a replaced will is read-only', async () => {
    api.execution.mockResolvedValue({ ...executed, status: 'SUPERSEDED', nextReviewAt: null });
    render();
    expect(await screen.findByText(/replaced by a newer version/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Store signed copy' })).toBeNull();
    expect(screen.queryByRole('button', { name: /replace the copy or fix details/i })).toBeNull();
    expect(screen.queryByText('How to sign your will in India')).toBeNull();
  });

  it('a draft or discarded will cannot be signed here', async () => {
    api.execution.mockRejectedValue(new Error('409'));
    vi.mocked(isWillNotExecutable).mockReturnValue(true);
    render();
    expect(await screen.findByText(/can't be signed and stored here/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /back to will maker/i }).getAttribute('href')).toBe('/will');
  });

  it('is locked on the Free plan and does not call the API', () => {
    signIn('FREE');
    render();
    expect(screen.getByText(/will maker is locked/i)).toBeTruthy();
    expect(api.execution).not.toHaveBeenCalled();
  });
});
