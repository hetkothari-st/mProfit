// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ExecutionGuide, FindALawyer } from './ExecutionGuide';

afterEach(cleanup);

describe('ExecutionGuide', () => {
  it('walks through printing, witnesses, signing, optional registration and storage', () => {
    render(<ExecutionGuide />);
    const text = document.body.textContent ?? '';
    expect(screen.getByText('How to sign your will in India')).toBeTruthy();
    expect(text).toMatch(/does not need stamp paper/i);
    expect(text).toMatch(/two adults/i);
    expect(text).toMatch(/not beneficiaries/i);
    expect(text).toMatch(/husband or wife/i);
    expect(text).toMatch(/Sub-Registrar/);
    expect(text).toMatch(/optional/i);
    expect(text).toMatch(/tell your executor/i);
  });
});

describe('FindALawyer', () => {
  it('links the verified free legal help and the Bar Council check', () => {
    render(<FindALawyer />);
    const tele = screen.getByRole('link', { name: /tele-law/i });
    expect(tele.getAttribute('href')).toBe('https://www.tele-law.in/');
    expect(tele.getAttribute('target')).toBe('_blank');
    expect(tele.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByRole('link', { name: /nalsa/i }).getAttribute('href')).toBe('https://nalsa.gov.in/');
    expect(screen.getByRole('link', { name: '15100' }).getAttribute('href')).toBe('tel:15100');
    const text = document.body.textContent ?? '';
    expect(text).toContain('Government of India, Department of Justice');
    expect(text).toContain('National Legal Services Authority');
    expect(text).toMatch(/free for eligible people/i);
    expect(text).toMatch(/citizens' mobile app/i);
    expect(text).toMatch(/apply online/i);
    expect(text).toMatch(/State Bar Council/);
  });
});
