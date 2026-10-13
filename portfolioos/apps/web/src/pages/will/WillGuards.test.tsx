// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { renderWithProviders } from '@/pages/split/testUtils';
import { willApi } from '@/api/will.api';
import { WillGate } from './WillGuards';
import { resetStores, signIn } from './willTestData';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/will.api', () => ({
  willApi: { documents: vi.fn(), downloadPdf: vi.fn(), downloadOwnSignedCopy: vi.fn() },
}));

const api = vi.mocked(willApi);
const render = () => renderWithProviders(<WillGate><div>inside</div></WillGate>);

beforeEach(() => {
  vi.resetAllMocks();
  signIn('FREE');
});
afterEach(() => {
  cleanup();
  resetStores();
});

describe('WillGate locked card', () => {
  it('offers the live will and its signed copy for download on any plan', async () => {
    api.documents.mockResolvedValue({ willId: 'w1', version: 3, status: 'EXECUTED', versionId: 'v3', hasSignedCopy: true });
    api.downloadPdf.mockResolvedValue(undefined);
    api.downloadOwnSignedCopy.mockResolvedValue(undefined);
    render();
    expect(screen.getByText(/will maker is locked/i)).toBeTruthy();
    expect(screen.queryByText('inside')).toBeNull();
    expect(await screen.findByText('Your will documents')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    await waitFor(() => expect(api.downloadPdf).toHaveBeenCalledWith('v3', 3));
    fireEvent.click(screen.getByRole('button', { name: /download signed copy/i }));
    await waitFor(() => expect(api.downloadOwnSignedCopy).toHaveBeenCalledWith('w1', 3));
  });

  it('has no signed-copy button before the will is signed', async () => {
    api.documents.mockResolvedValue({ willId: 'w1', version: 1, status: 'GENERATED', versionId: 'v1', hasSignedCopy: false });
    render();
    expect(await screen.findByRole('button', { name: /download pdf/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /download signed copy/i })).toBeNull();
  });

  it('shows no documents section when there is no live will', async () => {
    api.documents.mockResolvedValue(null);
    render();
    await waitFor(() => expect(api.documents).toHaveBeenCalled());
    expect(screen.queryByText('Your will documents')).toBeNull();
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull();
  });

  it('does not ask for documents on a paid plan', () => {
    signIn('PLUS');
    render();
    expect(screen.getByText('inside')).toBeTruthy();
    expect(api.documents).not.toHaveBeenCalled();
  });
});
