// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LoanRateFields, rateFieldsFrom, rateFieldsPayload, type RateFieldsValue } from './LoanRateFields';

afterEach(cleanup);

function Harness({ initial, onChange }: { initial: RateFieldsValue; onChange: (v: RateFieldsValue) => void }) {
  const [value, setValue] = useState(initial);
  return <LoanRateFields idPrefix="t" value={value} onChange={(next) => { setValue(next); onChange(next); }} />;
}

describe('LoanRateFields', () => {
  it('shows the benchmark and the reset date only for floating loans', () => {
    const onChange = vi.fn();
    render(<Harness initial={rateFieldsFrom(null)} onChange={onChange} />);
    expect((screen.getByLabelText('Rate type') as HTMLSelectElement).value).toBe('UNKNOWN');
    expect(screen.queryByLabelText('Linked to')).toBeNull();
    fireEvent.change(screen.getByLabelText('Rate type'), { target: { value: 'FLOATING' } });
    fireEvent.change(screen.getByLabelText('Linked to'), { target: { value: 'MCLR' } });
    fireEvent.change(screen.getByLabelText('Next rate reset (optional)'), { target: { value: '2027-04-01' } });
    expect(onChange).toHaveBeenLastCalledWith({ rateType: 'FLOATING', rateBenchmark: 'MCLR', nextRateResetDate: '2027-04-01' });
  });

  it('switching to fixed hides and clears them', () => {
    const onChange = vi.fn();
    render(<Harness initial={{ rateType: 'FLOATING', rateBenchmark: 'REPO', nextRateResetDate: '2027-01-01' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Rate type'), { target: { value: 'FIXED' } });
    expect(onChange).toHaveBeenLastCalledWith({ rateType: 'FIXED', rateBenchmark: null, nextRateResetDate: '' });
    expect(screen.queryByLabelText('Linked to')).toBeNull();
  });

  it('"Not set" clears the benchmark', () => {
    const onChange = vi.fn();
    render(<Harness initial={{ rateType: 'FLOATING', rateBenchmark: 'REPO', nextRateResetDate: '' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Linked to'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ rateType: 'FLOATING', rateBenchmark: null, nextRateResetDate: '' });
  });
});

describe('rateFieldsFrom / rateFieldsPayload', () => {
  it('reads a loan, slicing the reset instant to a date', () => {
    expect(rateFieldsFrom({ rateType: 'FLOATING', rateBenchmark: 'REPO', nextRateResetDate: '2027-01-01T00:00:00.000Z' }))
      .toEqual({ rateType: 'FLOATING', rateBenchmark: 'REPO', nextRateResetDate: '2027-01-01' });
  });
  it('unknown or missing values fall back to UNKNOWN with nothing else', () => {
    expect(rateFieldsFrom({ rateType: 'SOMETHING', rateBenchmark: 'REPO', nextRateResetDate: null }))
      .toEqual({ rateType: 'UNKNOWN', rateBenchmark: null, nextRateResetDate: '' });
    expect(rateFieldsFrom(undefined)).toEqual({ rateType: 'UNKNOWN', rateBenchmark: null, nextRateResetDate: '' });
  });
  it('sends nulls for non-floating loans and for an empty date', () => {
    expect(rateFieldsPayload({ rateType: 'FIXED', rateBenchmark: 'REPO', nextRateResetDate: '2027-01-01' }))
      .toEqual({ rateType: 'FIXED', rateBenchmark: null, nextRateResetDate: null });
    expect(rateFieldsPayload({ rateType: 'FLOATING', rateBenchmark: 'MCLR', nextRateResetDate: '' }))
      .toEqual({ rateType: 'FLOATING', rateBenchmark: 'MCLR', nextRateResetDate: null });
  });
});
