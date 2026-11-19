// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { AdminSupportTicketDTO, AuthUser, SupportTicketDTO } from '@everypaisa/shared';
import { renderWithProviders } from '@/pages/split/testUtils';
import { useAuthStore } from '@/stores/auth.store';
import { supportAdminApi, supportApi } from '@/api/support.api';
import { SupportPage, validateSupportForm } from './SupportPage';
import { SupportAdminPage } from '@/pages/settings/SupportAdminPage';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/support.api', () => ({
  supportApi: { create: vi.fn(), mine: vi.fn() },
  supportAdminApi: { list: vi.fn(), update: vi.fn() },
}));

const user = (role: AuthUser['role']): AuthUser => ({
  id: 'u1', email: 'asha@example.com', name: 'Asha', role, plan: 'FREE', isActive: true, createdAt: new Date().toISOString(),
});

const ticket = (over: Partial<SupportTicketDTO> = {}): SupportTicketDTO => ({
  id: 't1', topic: 'BUG', subject: 'Chart is blank', message: 'The chart shows nothing.', status: 'OPEN',
  pagePath: '/dashboard', createdAt: '2026-11-19T05:00:00.000Z', updatedAt: '2026-11-19T05:00:00.000Z', resolvedAt: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supportApi.mine).mockResolvedValue([]);
  useAuthStore.setState({ user: user('INVESTOR') });
});
afterEach(cleanup);

describe('validateSupportForm', () => {
  it('asks for a subject and enough detail, and caps length', () => {
    expect(validateSupportForm({ subject: '', message: '' })).toEqual({
      subject: 'Add a short subject',
      message: 'Tell us a little more so we can help',
    });
    expect(validateSupportForm({ subject: 'Hello', message: 'This is a proper description.' })).toEqual({});
    expect(validateSupportForm({ subject: 'x'.repeat(121), message: 'ok enough text here' }).subject).toMatch(/under 120/);
  });
});

describe('SupportPage', () => {
  it('does not send an empty form and says what is missing', async () => {
    renderWithProviders(<SupportPage />);
    fireEvent.click(await screen.findByRole('button', { name: /send message/i }));
    expect(await screen.findByText('Add a short subject')).toBeTruthy();
    expect(supportApi.create).not.toHaveBeenCalled();
  });

  it('sends the trimmed request with the screen the user came from, then confirms where the reply goes', async () => {
    vi.mocked(supportApi.create).mockResolvedValue(ticket());
    renderWithProviders(<SupportPage />, { route: '/support' });

    fireEvent.change(await screen.findByLabelText('What is this about?'), { target: { value: 'BUG' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: '  Chart is blank  ' } });
    fireEvent.change(screen.getByLabelText('Details'), { target: { value: '  The net worth chart shows nothing.  ' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => expect(supportApi.create).toHaveBeenCalledTimes(1));
    expect(supportApi.create).toHaveBeenCalledWith({
      topic: 'BUG', subject: 'Chart is blank', message: 'The net worth chart shows nothing.', pagePath: undefined,
    });
    expect(await screen.findByText(/we will reply to/i)).toBeTruthy();
    expect(screen.getByText('asha@example.com')).toBeTruthy();
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('');
  });

  it('lists past requests with a plain status and keeps the message tucked away', async () => {
    vi.mocked(supportApi.mine).mockResolvedValue([ticket(), ticket({ id: 't2', subject: 'Plan question', status: 'RESOLVED', topic: 'BILLING' })]);
    renderWithProviders(<SupportPage />);
    expect(await screen.findByText('Chart is blank')).toBeTruthy();
    expect(screen.getByText('Received')).toBeTruthy();
    expect(screen.getByText('Resolved')).toBeTruthy();
    expect(screen.getByText(/Plans and billing · sent 19\/11\/2026/)).toBeTruthy();
  });

  it('shows an empty state when nothing was sent yet', async () => {
    renderWithProviders(<SupportPage />);
    expect(await screen.findByText('No requests yet')).toBeTruthy();
  });
});

describe('SupportAdminPage', () => {
  const adminTicket = (over: Partial<AdminSupportTicketDTO> = {}): AdminSupportTicketDTO => ({
    ...ticket(), user: { id: 'u2', name: 'Ravi', email: 'ravi@example.com' }, adminNote: null, emailDelivered: true, ...over,
  });

  it('is for the team only', () => {
    renderWithProviders(<SupportAdminPage />);
    expect(screen.getByText(/for the EveryPaisa team/i)).toBeTruthy();
    expect(supportAdminApi.list).not.toHaveBeenCalled();
  });

  it('lets an admin change the status and save a private note, and flags undelivered emails', async () => {
    useAuthStore.setState({ user: user('ADMIN') });
    vi.mocked(supportAdminApi.list).mockResolvedValue([adminTicket({ emailDelivered: false })]);
    vi.mocked(supportAdminApi.update).mockResolvedValue(adminTicket());
    renderWithProviders(<SupportAdminPage />);

    expect(await screen.findByText('Chart is blank')).toBeTruthy();
    expect(screen.getByText('ravi@example.com')).toBeTruthy();
    expect(screen.getByText(/email to the team did not send/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Status of Chart is blank'), { target: { value: 'RESOLVED' } });
    await waitFor(() => expect(supportAdminApi.update).toHaveBeenCalledWith('t1', { status: 'RESOLVED' }));

    fireEvent.change(screen.getByLabelText('Private note'), { target: { value: 'Told them to refresh' } });
    fireEvent.click(screen.getByRole('button', { name: /save note/i }));
    await waitFor(() => expect(supportAdminApi.update).toHaveBeenCalledWith('t1', { adminNote: 'Told them to refresh' }));
  });
});
