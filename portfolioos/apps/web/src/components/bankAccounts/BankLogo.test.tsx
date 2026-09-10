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

  // The plate takes the mark's own shape: a wordmark squeezed into a square
  // renders a few pixels tall, which is the bug this guards against.
  it('gives a wide wordmark a wide plate', () => {
    render(<BankLogo bankName="HDFC Bank" size={30} />);
    const plate = screen.getByRole('img', { name: 'HDFC Bank logo' }).parentElement!;
    expect(Number.parseFloat(plate.style.width)).toBeGreaterThan(Number.parseFloat(plate.style.height) * 2);
  });

  it('keeps a square plate for a square mark', () => {
    render(<BankLogo bankName="AU Small Finance Bank" size={30} />);
    const plate = screen.getByRole('img', { name: 'AU Small Finance Bank logo' }).parentElement!;
    expect(plate.style.width).toBe(plate.style.height);
  });

  it('caps the plate at maxWidth', () => {
    render(<BankLogo bankName="HDFC Bank" size={30} maxWidth={60} />);
    const plate = screen.getByRole('img', { name: 'HDFC Bank logo' }).parentElement!;
    expect(plate.style.width).toBe('60px');
  });

  it('falls back to initials when the file fails to load', () => {
    render(<BankLogo bankName="HDFC Bank" />);
    fireEvent.error(screen.getByRole('img', { name: 'HDFC Bank logo' }));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('HD')).toBeTruthy();
  });
});
