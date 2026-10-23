// @vitest-environment jsdom
/**
 * Mutual-funds defects 2–4, the client half.
 *  2. The CASParser dialog collected Portfolio + Nickname and never sent them.
 *  3. It showed every user the operator's casparser.in credit balance.
 *  4. The CAMS/KFintech dialog pre-filled the signed-in person's PAN from an
 *     account route even while managing someone else's account.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = vi.hoisted(() => ({
  role: 'INVESTOR' as string,
  acting: null as null | { id: string; name: string; managerId: string },
}));

const casparser = vi.hoisted(() => ({
  kfintechMailback: vi.fn(),
  credits: vi.fn(),
  cdslRequestOtp: vi.fn(),
  cdslSubmitOtp: vi.fn(),
}));
const mailback = vi.hoisted(() => ({
  pan: vi.fn(),
  initiate: vi.fn(),
  submit: vi.fn(),
}));
const auth = vi.hoisted(() => ({ revealPan: vi.fn(), me: vi.fn(), updateProfile: vi.fn() }));

vi.mock('@/api/mf/mfCasparser.api', () => ({ mfCasparserApi: casparser }));
vi.mock('@/api/mf/mfCasMailback.api', () => ({ mfCasMailbackApi: mailback }));
vi.mock('@/api/auth.api', () => ({ authApi: auth }));
vi.mock('@/api/portfolios.api', () => ({
  portfoliosApi: { list: async () => [{ id: 'pf-2', name: 'Mum MFs' }] },
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { role: state.role } }),
}));
vi.mock('@/stores/actingAs.store', () => ({
  useActingAsStore: (sel: (s: unknown) => unknown) => sel({ profile: state.acting }),
}));

import { MFCasparserDialog } from './MFCasparserDialog';
import { MFCasMailbackDialog } from './MFCasMailbackDialog';

function renderUi(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.role = 'INVESTOR';
  state.acting = null;
});

describe('CASParser dialog', () => {
  it('sends the Portfolio and Nickname it collects', async () => {
    casparser.kfintechMailback.mockResolvedValue({ ok: true, message: 'ok', requestId: null });
    renderUi(<MFCasparserDialog open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText('PAN'), { target: { value: 'ABCDE1234F' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } });
    await screen.findByRole('option', { name: 'Mum MFs' });
    fireEvent.change(screen.getByLabelText('Portfolio'), { target: { value: 'pf-2' } });
    fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: '  Mum folios ' } });
    fireEvent.click(screen.getByRole('button', { name: /Request CAS/ }));
    await waitFor(() =>
      expect(casparser.kfintechMailback).toHaveBeenCalledWith(
        expect.objectContaining({ portfolioId: 'pf-2', nickname: 'Mum folios' }),
      ),
    );
  });

  it('does not fetch or show the operator credit balance to a user', async () => {
    casparser.credits.mockResolvedValue({ credits_remaining: 42 });
    renderUi(<MFCasparserDialog open onOpenChange={() => {}} />);
    await screen.findByRole('option', { name: 'Mum MFs' });
    expect(casparser.credits).not.toHaveBeenCalled();
    expect(screen.queryByText(/CASParser credits/)).toBeNull();
  });

  it('shows it to an admin', async () => {
    state.role = 'ADMIN';
    casparser.credits.mockResolvedValue({ credits_remaining: 42 });
    renderUi(<MFCasparserDialog open onOpenChange={() => {}} />);
    expect(await screen.findByText(/CASParser credits/)).toBeTruthy();
  });
});

describe('CAMS/KFintech mailback dialog', () => {
  it('shows the masked PAN of the account being managed, never the manager\'s', async () => {
    state.acting = { id: 'member-1', name: 'Dadaji', managerId: 'me' };
    mailback.pan.mockResolvedValue({ panMasked: 'XXXXX6789K' });
    auth.revealPan.mockResolvedValue('MANGR1234Z');
    auth.me.mockResolvedValue({ hasPan: true });
    renderUi(<MFCasMailbackDialog open onOpenChange={() => {}} />);

    const field = (await screen.findByTestId('mb-pan')) as HTMLInputElement;
    expect(field.value).toBe('XXXXX6789K');
    expect(screen.getByText(/From Dadaji's profile/)).toBeTruthy();
    // The account route that always answers as the signed-in person is not asked.
    expect(auth.revealPan).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('MANGR1234Z');
  });

  it('initiates without a PAN, so the server uses the profile\'s', async () => {
    mailback.pan.mockResolvedValue({ panMasked: 'XXXXX1234F' });
    mailback.initiate.mockResolvedValue({ jobId: 'j', emailMasked: 'a', cams: null, kfintech: null });
    renderUi(<MFCasMailbackDialog open onOpenChange={() => {}} />);
    await screen.findByTestId('mb-pan');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    await waitFor(() => expect(mailback.initiate).toHaveBeenCalled());
    expect(mailback.initiate.mock.calls[0]![0]).not.toHaveProperty('pan');
  });

  it('does not offer to save a PAN while acting — it would land on the manager\'s profile', async () => {
    state.acting = { id: 'member-1', name: 'Dadaji', managerId: 'me' };
    mailback.pan.mockResolvedValue({ panMasked: null });
    renderUi(<MFCasMailbackDialog open onOpenChange={() => {}} />);
    expect(await screen.findByTestId('mb-no-pan-acting')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Set PAN now/ })).toBeNull();
  });
});
