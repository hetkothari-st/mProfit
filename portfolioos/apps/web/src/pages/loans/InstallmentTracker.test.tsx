// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { InstallmentProgress, InstallmentTracker } from './InstallmentTracker';

afterEach(cleanup);

const blocks = () => Array.from(screen.getByRole('img').children) as HTMLElement[];

describe('InstallmentTracker', () => {
  it('draws one block per month for a short loan', () => {
    render(<InstallmentTracker done={3} total={10} accent="red" />);
    expect(blocks()).toHaveLength(10);
    expect(blocks().filter((b) => b.children.length > 0)).toHaveLength(3);
    expect(screen.getByRole('img', { name: '30% repaid' })).toBeTruthy();
    expect(screen.queryByText('Each block = 1 year')).toBeNull();
  });

  it('draws a 20-year home loan as 20 yearly blocks, filling part of the current year', () => {
    render(<InstallmentTracker done={28} total={240} accent="red" />);
    expect(blocks()).toHaveLength(20);
    const fills = blocks().map((b) => (b.firstElementChild as HTMLElement | null)?.style.width ?? '0');
    expect(fills.slice(0, 3)).toEqual(['100%', '100%', `${(4 / 12) * 100}%`]);
    expect(fills[3]).toBe('0');
    expect(blocks()[2]!.title).toBe('Year 3: 4 of 12 EMIs paid');
    expect(screen.getByText('Each block = 1 year')).toBeTruthy();
    expect(screen.getByRole('img', { name: '12% repaid' })).toBeTruthy();
  });

  it('gives a short final year a shorter block', () => {
    render(<InstallmentTracker done={0} total={40} accent="red" />);
    expect(blocks()).toHaveLength(4);
    expect(blocks()[3]!.style.flexGrow).toBe('4');
    expect(blocks()[0]!.style.flexGrow).toBe('12');
  });
});

describe('InstallmentProgress', () => {
  it('labels instalments done with a percentage bar', () => {
    render(<InstallmentProgress done={28} total={240} accent="red" />);
    expect(screen.getByText('28/240')).toBeTruthy();
    expect(screen.getByText('12%')).toBeTruthy();
    const bar = screen.getByRole('progressbar', { name: 'Instalments done' });
    expect(bar.getAttribute('aria-valuenow')).toBe('28');
    expect(bar.getAttribute('aria-valuetext')).toBe('28 of 240 instalments done');
  });

  it('never runs past the plan', () => {
    render(<InstallmentProgress done={15} total={12} accent="red" />);
    expect(screen.getByText('12/12')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
  });
});
