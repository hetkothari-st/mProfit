// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { BankLogo } from './BankLogo';

afterEach(() => cleanup());

describe('BankLogo', () => {
  it("shows a known bank's committed logo", () => {
    render(<BankLogo bankName="HDFC Bank" />);
    const img = screen.getByRole('img', { name: 'HDFC Bank logo' });
    expect(img.getAttribute('src')).toMatch(/^\/banks\/hdfc-bank\.(png|svg)$/);
  });

  it('recognises a bank inside a longer label', () => {
    render(<BankLogo bankName="SBI FD 2025" />);
    expect(screen.getByRole('img', { name: 'State Bank of India logo' })).toBeTruthy();
  });

  it('falls back to initials for an unknown bank', () => {
    render(<BankLogo bankName="Nowhere Co-op Bank" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('NC')).toBeTruthy();
  });

  it('falls back to initials when the file fails to load', () => {
    render(<BankLogo bankName="HDFC Bank" />);
    fireEvent.error(screen.getByRole('img', { name: 'HDFC Bank logo' }));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('HD')).toBeTruthy();
  });
});
