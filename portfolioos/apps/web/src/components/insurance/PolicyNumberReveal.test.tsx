// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PolicyNumberReveal } from './PolicyNumberReveal';

const api = vi.hoisted(() => ({ revealPolicyNumber: vi.fn() }));
vi.mock('@/api/insurance.api', () => ({ insuranceApi: api }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const policy = { id: 'pol1', policyNumberLast4: '2345', hasPolicyNumber: true };

describe('PolicyNumberReveal', () => {
  it('shows only the last 4 until asked', () => {
    render(<PolicyNumberReveal policy={policy} />);
    expect(screen.getByText('2345', { exact: false })).toBeTruthy();
    expect(api.revealPolicyNumber).not.toHaveBeenCalled();
  });

  it('fetches the full number on the eye button, and hides it again', async () => {
    api.revealPolicyNumber.mockResolvedValue({ policyNumber: 'POL-123/2345' });
    render(<PolicyNumberReveal policy={policy} />);

    fireEvent.click(screen.getByRole('button', { name: /show policy number/i }));
    expect(await screen.findByText('POL-123/2345')).toBeTruthy();
    expect(api.revealPolicyNumber).toHaveBeenCalledWith('pol1');

    fireEvent.click(screen.getByRole('button', { name: /hide policy number/i }));
    expect(screen.queryByText('POL-123/2345')).toBeNull();
  });

  it("doesn't call the server when no number is saved", () => {
    render(<PolicyNumberReveal policy={{ id: 'pol2', policyNumberLast4: null, hasPolicyNumber: false }} />);
    fireEvent.click(screen.getByRole('button', { name: /show policy number/i }));
    expect(api.revealPolicyNumber).not.toHaveBeenCalled();
  });
});
