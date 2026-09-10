// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SuggestInput, type SuggestOption } from './SuggestInput';

afterEach(() => cleanup());

const BANKS: SuggestOption[] = [
  { value: 'HDFC Bank' },
  { value: 'Kotak Mahindra Bank', keywords: ['Kotak'] },
  { value: 'State Bank of India', keywords: ['SBI'] },
  { value: 'Bank of India' },
  { value: 'Indian Bank' },
];

function Harness({ onPick }: { onPick?: (o: SuggestOption) => void }) {
  const [value, setValue] = useState('');
  return (
    <SuggestInput
      aria-label="Bank"
      value={value}
      onValueChange={setValue}
      options={BANKS}
      onPick={onPick}
    />
  );
}

function input() {
  return screen.getByRole('combobox', { name: 'Bank' }) as HTMLInputElement;
}

function optionTexts() {
  return screen.queryAllByRole('option').map((o) => o.textContent);
}

describe('SuggestInput', () => {
  it('filters options as the user types', () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: 'kot' } });
    expect(optionTexts()).toEqual(['Kotak Mahindra Bank']);
  });

  it('matches on keywords such as abbreviations', () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: 'sbi' } });
    expect(optionTexts()).toEqual(['State Bank of India']);
  });

  it('ranks prefix matches first', () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: 'ind' } });
    // "Indian Bank" starts with it; the rest contain it ("Mah-ind-ra",
    // "…of Ind-ia") and keep their list order.
    expect(optionTexts()).toEqual([
      'Indian Bank',
      'Kotak Mahindra Bank',
      'State Bank of India',
      'Bank of India',
    ]);
  });

  it('picks an option on click', () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    fireEvent.change(input(), { target: { value: 'hd' } });
    fireEvent.click(screen.getByRole('option', { name: 'HDFC Bank' }));
    expect(input().value).toBe('HDFC Bank');
    expect(onPick).toHaveBeenCalledWith({ value: 'HDFC Bank' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('picks the highlighted option with the keyboard', () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    fireEvent.change(input(), { target: { value: 'bank' } });
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(input().value).toBe(onPick.mock.calls[0]![0].value);
  });

  it('closes on Escape', () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: 'bank' } });
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  describe('after a pick', () => {
    const ALL = BANKS.map((b) => b.value);

    function pickHdfc() {
      fireEvent.change(input(), { target: { value: 'hd' } });
      fireEvent.click(screen.getByRole('option', { name: 'HDFC Bank' }));
    }

    it('reopens with every option when the field is clicked again', () => {
      render(<Harness />);
      pickHdfc();
      fireEvent.click(input());
      expect(optionTexts()).toEqual(ALL);
      // The current choice is the highlighted one.
      expect(screen.getByRole('option', { name: 'HDFC Bank' }).getAttribute('aria-selected')).toBe('true');
    });

    it('shows every option when focused again', () => {
      render(<Harness />);
      pickHdfc();
      fireEvent.blur(input());
      fireEvent.focus(input());
      expect(optionTexts()).toEqual(ALL);
    });

    it('filters again once the user types', () => {
      render(<Harness />);
      pickHdfc();
      fireEvent.click(input());
      fireEvent.change(input(), { target: { value: 'kot' } });
      expect(optionTexts()).toEqual(['Kotak Mahindra Bank']);
    });
  });

  it('opens and closes the list from its chevron', () => {
    render(<Harness />);
    const toggle = screen.getByRole('button', { name: 'Show options' });
    fireEvent.click(toggle);
    expect(optionTexts()).toEqual(BANKS.map((b) => b.value));
    fireEvent.click(toggle);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('keeps free text that matches nothing', () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: 'My Co-op Bank Ltd' } });
    expect(input().value).toBe('My Co-op Bank Ltd');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
