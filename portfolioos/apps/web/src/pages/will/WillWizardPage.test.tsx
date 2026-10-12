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
});
