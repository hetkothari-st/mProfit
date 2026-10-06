// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShareBankDetailsButton } from './ShareBankDetailsButton';

const shareDetails = vi.hoisted(() => vi.fn());
vi.mock('@/api/bankAccounts.api', () => ({ bankAccountsApi: { shareDetails } }));

const TEXT = 'HDFC Bank account details\nAccount holder: HET KOTHARI\nAccount number: 50100123456789';

const navShare = vi.fn();
const writeText = vi.fn();

/** Touch devices get the native share sheet; mouse devices copy. */
function setPointer(kind: 'coarse' | 'fine') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({ matches: q === '(pointer: coarse)' && kind === 'coarse' }),
  });
}

beforeEach(() => {
  shareDetails.mockResolvedValue({ text: TEXT });
  navShare.mockResolvedValue(undefined);
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'share', { configurable: true, value: navShare });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderButton(hasAccountNumber = true) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ShareBankDetailsButton
        account={{ id: 'ba1', bankName: 'HDFC Bank', hasAccountNumber }}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /share details/i }));
}

describe('ShareBankDetailsButton', () => {
  it('opens the native share sheet on touch devices', async () => {
    setPointer('coarse');
    renderButton();
    await waitFor(() =>
      expect(navShare).toHaveBeenCalledWith({ title: 'HDFC Bank account details', text: TEXT }),
    );
    expect(shareDetails).toHaveBeenCalledWith('ba1');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies to the clipboard on desktop even if Web Share exists', async () => {
    setPointer('fine');
    renderButton();
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TEXT));
    expect(navShare).not.toHaveBeenCalled();
  });

  it('does nothing more when the user dismisses the share sheet', async () => {
    setPointer('coarse');
    navShare.mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    renderButton();
    await waitFor(() => expect(navShare).toHaveBeenCalled());
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to copying when the share sheet is blocked', async () => {
    setPointer('coarse');
    navShare.mockRejectedValue(new DOMException('no activation', 'NotAllowedError'));
    renderButton();
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(TEXT));
  });

  it('does not call the API when only last4 is saved', () => {
    setPointer('fine');
    renderButton(false);
    expect(shareDetails).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });
});
