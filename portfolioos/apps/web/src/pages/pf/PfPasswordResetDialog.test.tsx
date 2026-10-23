// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { PfPasswordResetDialog } from './PfPasswordResetDialog';

const api = vi.hoisted(() => ({
  startPasswordReset: vi.fn(),
  eventStream: vi.fn(() => ({ addEventListener: vi.fn(), close: vi.fn(), onerror: null })),
}));
vi.mock('@/api/pf', () => ({ pfApi: api }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PfPasswordResetDialog', () => {
  it('asks the server to run the reset headless (the extension never picks it up)', async () => {
    api.startPasswordReset.mockResolvedValue('sess-1');
    render(<PfPasswordResetDialog onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/12 digits/), { target: { value: '100123456789' } });
    fireEvent.change(screen.getByPlaceholderText('10 digits'), { target: { value: '9876543210' } });
    fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: 'Abc@1234' } });
    fireEvent.click(screen.getByText('Send code'));
    await waitFor(() => expect(api.startPasswordReset).toHaveBeenCalled());
    expect(api.startPasswordReset.mock.calls[0]![0]).toMatchObject({ source: 'SERVER_HEADLESS' });
  });
});
