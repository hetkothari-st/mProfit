// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { serializeMoney, type SplitGroupDto } from '@everypaisa/shared';
import { renderWithProviders } from './testUtils';
import { PayNowDialog } from './PayNowDialog';

const api = vi.hoisted(() => ({ upiLink: vi.fn(), createSettlement: vi.fn() }));
vi.mock('@/api/split.api', async (orig) => ({ ...(await orig<typeof import('@/api/split.api')>()), splitApi: api }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QR') } }));
const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({ default: { success: toastSuccess, error: toastError } }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const group: SplitGroupDto = {
  id: 'g1', name: 'Goa', type: 'TRIP', baseCurrency: 'INR', simplifyDebts: true, archivedAt: null, myNet: serializeMoney('0'),
  members: [
    { id: 'a', displayName: 'Alice', userId: 'u1', contactId: null, isMe: true, leftAt: null },
    { id: 'b', displayName: 'Ravi', userId: 'u2', contactId: 'c2', isMe: false, leftAt: null },
  ],
};
const URI = 'upi://pay?pa=ravi%40okicici&pn=Ravi&am=100.00&cu=INR&tn=x';
const LINK = { uri: URI, payeeName: 'Ravi', payeeVpa: 'ravi@okicici', amount: '100.0000', note: 'x' };

describe('PayNowDialog', () => {
  it('shows payee, amount, app link and QR', async () => {
    api.upiLink.mockResolvedValue(LINK);
    renderWithProviders(<PayNowDialog open onOpenChange={() => {}} group={group} toMemberId="b" amount="100.0000" />);
    expect(await screen.findByText('ravi@okicici')).toBeTruthy();
    expect(api.upiLink).toHaveBeenCalledWith('g1', 'b', '100.00');
    expect(screen.getByText('₹100.00')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open UPI app' }).getAttribute('href')).toBe(URI);
    expect(((await screen.findByAltText('UPI QR code')) as HTMLImageElement).src).toContain('data:image/png');
    expect(screen.getByText('Scan with any UPI app')).toBeTruthy();
  });

  it('records the payment after the app is opened', async () => {
    api.upiLink.mockResolvedValue(LINK);
    api.createSettlement.mockResolvedValue({});
    const onOpenChange = vi.fn();
    renderWithProviders(<PayNowDialog open onOpenChange={onOpenChange} group={group} toMemberId="b" amount="100.0000" />);
    fireEvent.click(await screen.findByRole('link', { name: 'Open UPI app' }));
    expect(await screen.findByText('Did the payment go through?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, record it' }));
    await waitFor(() => expect(api.createSettlement).toHaveBeenCalledWith(expect.objectContaining({
      groupId: 'g1', fromMemberId: 'a', toMemberId: 'b', amount: '100', method: 'UPI',
    })));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toastSuccess).toHaveBeenCalledWith('Payment recorded');
  });

  it('explains a missing UPI ID', async () => {
    api.upiLink.mockRejectedValue({ isAxiosError: true, message: 'x', response: { status: 400, data: { error: "SPLIT_NO_UPI: Ravi hasn't added a UPI ID" } } });
    renderWithProviders(<PayNowDialog open onOpenChange={() => {}} group={group} toMemberId="b" amount="100" />);
    expect(await screen.findByText("Ravi hasn't added a UPI ID")).toBeTruthy();
    expect(screen.getByText('Ask them to add a UPI ID in Split settings')).toBeTruthy();
  });

  it('copies the pay link', async () => {
    api.upiLink.mockResolvedValue(LINK);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderWithProviders(<PayNowDialog open onOpenChange={() => {}} group={group} toMemberId="b" amount="100.0000" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy pay link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URI));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Pay link copied'));
  });

  it('says so when copying is not possible', async () => {
    api.upiLink.mockResolvedValue(LINK);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    renderWithProviders(<PayNowDialog open onOpenChange={() => {}} group={group} toMemberId="b" amount="100.0000" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy pay link' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't copy - long-press the QR or use Open UPI app"));
  });
});
