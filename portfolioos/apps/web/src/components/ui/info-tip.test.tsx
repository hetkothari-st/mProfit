// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { InfoTip } from './info-tip';
import { ANALYTICS_INFO } from '@/pages/analytics/infoCopy';

// jsdom has no ResizeObserver; Radix uses it to position the popover. Every
// browser the app supports has it, so a no-op stub is enough for these tests.
if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

afterEach(() => cleanup());

/**
 * Radix Popover opens on pointerdown in real browsers and on click in jsdom;
 * dispatch both the way a tap would so the test doesn't depend on which one
 * the current Radix version listens to.
 */
function tap(el: HTMLElement) {
  fireEvent.pointerDown(el, { button: 0, ctrlKey: false, pointerType: 'touch' });
  fireEvent.click(el);
}

describe('InfoTip', () => {
  it('renders an accessibly-labelled button and no explanation until opened', () => {
    render(<InfoTip title="Sharpe ratio">Return per unit of risk.</InfoTip>);
    expect(screen.getByRole('button', { name: 'About Sharpe ratio' })).toBeTruthy();
    expect(screen.queryByText('Return per unit of risk.')).toBeNull();
  });

  it('opens on tap — a hover tooltip would be unreachable on a phone', async () => {
    render(<InfoTip title="Sharpe ratio">Return per unit of risk.</InfoTip>);
    await act(async () => tap(screen.getByRole('button', { name: 'About Sharpe ratio' })));
    expect(screen.getByText('Return per unit of risk.')).toBeTruthy();
  });

  it('closes on Escape', async () => {
    render(<InfoTip title="Sharpe ratio">Return per unit of risk.</InfoTip>);
    await act(async () => tap(screen.getByRole('button', { name: 'About Sharpe ratio' })));
    expect(screen.getByText('Return per unit of risk.')).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    });
    expect(screen.queryByText('Return per unit of risk.')).toBeNull();
  });
});

describe('Analytics explanations', () => {
  const entries = Object.entries(ANALYTICS_INFO);

  it('every entry has a title and at least one line', () => {
    for (const [key, info] of entries) {
      expect(info.title.trim(), key).not.toBe('');
      expect(info.body.length, key).toBeGreaterThan(0);
    }
  });

  it('stays short — this is a quick explainer, not documentation', () => {
    for (const [key, info] of entries) {
      const chars = info.body.join(' ').length;
      expect(chars, `${key} is ${chars} chars`).toBeLessThanOrEqual(420);
    }
  });
});
