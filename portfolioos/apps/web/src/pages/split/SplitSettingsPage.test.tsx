// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './testUtils';
import { SplitSettingsPage } from './SplitSettingsPage';

const api = vi.hoisted(() => ({ getSettings: vi.fn(), updateSettings: vi.fn() }));
vi.mock('@/api/split.api', async (orig) => ({ ...(await orig<typeof import('@/api/split.api')>()), splitApi: api }));
vi.mock('@/components/common/PortfolioSelect', () => ({
  PortfolioSelect: ({ value, onChange }: { value: string | null | undefined; onChange: (v: string | null) => void }) => (
    <select aria-label="Default portfolio" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}>
      <option value="">None</option><option value="p1">One</option><option value="p2">Two</option>
    </select>
  ),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const SETTINGS = { upiId: 'old@okhdfc', homeCurrency: 'INR', defaultPortfolioId: 'p1', emailOnActivity: true, weeklyDigest: false };
const render = () => renderWithProviders(<SplitSettingsPage />, { route: '/split/settings', path: '/split/settings' });

describe('SplitSettingsPage', () => {
  it('loads settings into the form', async () => {
    api.getSettings.mockResolvedValue(SETTINGS);
    render();
    expect(((await screen.findByLabelText('UPI ID')) as HTMLInputElement).value).toBe('old@okhdfc');
    expect((screen.getByLabelText('Default portfolio') as HTMLSelectElement).value).toBe('p1');
    expect((screen.getByLabelText(/Weekly balance summary/) as HTMLInputElement).checked).toBe(false);
  });

  it('flags an invalid UPI ID and disables Save', async () => {
    api.getSettings.mockResolvedValue(SETTINGS);
    render();
    fireEvent.change(await screen.findByLabelText('UPI ID'), { target: { value: 'nope' } });
    expect(screen.getByText('Enter a UPI ID like name@bank')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('saves edited settings', async () => {
    api.getSettings.mockResolvedValue(SETTINGS);
    api.updateSettings.mockResolvedValue({});
    render();
    fireEvent.change(await screen.findByLabelText('UPI ID'), { target: { value: 'me@okaxis' } });
    fireEvent.click(screen.getByLabelText(/Weekly balance summary/));
    fireEvent.change(screen.getByLabelText('Default portfolio'), { target: { value: 'p2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({
      upiId: 'me@okaxis', homeCurrency: 'INR', defaultPortfolioId: 'p2', emailOnActivity: true, weeklyDigest: true,
    }));
  });

  it('shows a retry when settings fail to load', async () => {
    api.getSettings.mockRejectedValue(new Error('boom'));
    render();
    expect(await screen.findByText(/Couldn't load your settings\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});
