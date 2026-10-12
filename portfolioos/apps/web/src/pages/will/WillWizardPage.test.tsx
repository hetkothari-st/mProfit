// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { renderWithProviders } from '@/pages/split/testUtils';
import { willApi } from '@/api/will.api';
import { WillWizardPage } from './WillWizardPage';
import { draftWire, resetStores, signIn } from './willTestData';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/will.api', () => ({
  willApi: { getDraft: vi.fn(), saveSection: vi.fn(), refreshEstate: vi.fn(), suggestions: vi.fn(async () => []) },
  isWillRevisionConflict: vi.fn(() => false),
}));

beforeEach(() => {
  vi.clearAllMocks();
  signIn('PLUS');
  vi.mocked(willApi.getDraft).mockResolvedValue(draftWire());
  vi.mocked(willApi.saveSection).mockResolvedValue({ revision: 1, updatedAt: '2026-10-12T05:00:00.000Z' });
});
afterEach(() => {
  cleanup();
  resetStores();
});

describe('WillWizardPage', () => {
  it('loads the draft into the step named in the URL, with a compact stepper on narrow screens', async () => {
    renderWithProviders(<WillWizardPage />, { route: '/will/w1/details', path: '/will/:id/:step' });
    expect(((await screen.findByLabelText(/full legal name/i)) as HTMLInputElement).value).toBe('Ramesh Kumar Verma');
    expect(screen.getByText('Step 2 of 8')).toBeTruthy();
    expect(willApi.getDraft).toHaveBeenCalledWith('w1');
  });

  it('saves before moving on and then navigates', async () => {
    renderWithProviders(<WillWizardPage />, { route: '/will/w1/details', path: '/will/:id/:step' });
    const name = (await screen.findByLabelText(/full legal name/i)) as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Ramesh K Verma' } });
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    await waitFor(() => expect(willApi.saveSection).toHaveBeenCalledWith('w1', 'details', expect.objectContaining({ revision: 0, currentStep: 3 })));
    // /will/w1/people matches the same route: the wizard now shows the People step.
    expect(await screen.findByRole('tab', { name: /beneficiaries/i })).toBeTruthy();
    expect(screen.getByText('Step 3 of 8')).toBeTruthy();
  });

  it('is locked on the Free plan', () => {
    signIn('FREE');
    renderWithProviders(<WillWizardPage />, { route: '/will/w1/details', path: '/will/:id/:step' });
    expect(screen.getByText(/will maker is locked/i)).toBeTruthy();
    expect(willApi.getDraft).not.toHaveBeenCalled();
  });

  it('shows a retry after a failed save; Next stays blocked, Back goes through on the second try', async () => {
    renderWithProviders(<WillWizardPage />, { route: '/will/w1/people', path: '/will/:id/:step' });
    await screen.findByRole('tab', { name: /beneficiaries/i });
    vi.mocked(willApi.saveSection).mockRejectedValue(new Error('Network Error'));
    fireEvent.click(screen.getByRole('button', { name: /^add a person/i }));
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Kavya Iyer' } });
    fireEvent.click(screen.getByRole('button', { name: /save person/i }));
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    expect(await screen.findByText('Could not save your changes. Check your connection and try again.')).toBeTruthy();
    const retry = screen.getByRole('button', { name: /^retry$/i });
    fireEvent.click(retry);
    await waitFor(() => expect(vi.mocked(willApi.saveSection).mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(screen.getByText('Step 3 of 8')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    await waitFor(() => expect(vi.mocked(willApi.saveSection).mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(screen.getByText('Step 3 of 8')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
    await waitFor(() => expect(screen.getByText('Step 2 of 8')).toBeTruthy());
  });

  it('a successful Retry resets the failed-leave count, so Back needs two fresh failures again', async () => {
    renderWithProviders(<WillWizardPage />, { route: '/will/w1/people', path: '/will/:id/:step' });
    await screen.findByRole('tab', { name: /beneficiaries/i });
    vi.mocked(willApi.saveSection).mockRejectedValue(new Error('Network Error'));
    fireEvent.click(screen.getByRole('button', { name: /^add a person/i }));
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Kavya Iyer' } });
    fireEvent.click(screen.getByRole('button', { name: /save person/i }));
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
    await screen.findByText('Could not save your changes. Check your connection and try again.');
    vi.mocked(willApi.saveSection).mockResolvedValue({ revision: 1, updatedAt: '2026-10-12T05:00:00.000Z' });
    fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeTruthy());
    vi.mocked(willApi.saveSection).mockRejectedValue(new Error('Network Error'));
    fireEvent.click(screen.getByRole('button', { name: /^add a person/i }));
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Second Person' } });
    fireEvent.click(screen.getByRole('button', { name: /save person/i }));
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
    await screen.findByText('Could not save your changes. Check your connection and try again.');
    expect(screen.getByText('Step 3 of 8')).toBeTruthy();
  });
});
