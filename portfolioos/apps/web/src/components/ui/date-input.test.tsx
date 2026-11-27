// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { DateInput } from './date-input';

afterEach(() => cleanup());

const field = (name: RegExp | string = /date/i) => screen.getByRole('textbox', { name }) as HTMLInputElement;

function Controlled({ initial = '' }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <DateInput aria-label="Trade date" value={v} onChange={(e) => setV(e.target.value)} />
      <output data-testid="stored">{v}</output>
    </>
  );
}

describe('DateInput, controlled', () => {
  it('shows a stored YYYY-MM-DD as dd/mm/yyyy', () => {
    render(<Controlled initial="2026-06-05" />);
    expect(field().value).toBe('05/06/2026');
  });

  it('reports the date as YYYY-MM-DD once it is complete, and nothing before', () => {
    render(<Controlled initial="2026-06-05" />);
    fireEvent.change(field(), { target: { value: '' } });
    expect(screen.getByTestId('stored').textContent).toBe('');
    fireEvent.change(field(), { target: { value: '0' } });
    fireEvent.change(field(), { target: { value: '07' } });
    expect(field().value).toBe('07/');
    fireEvent.change(field(), { target: { value: '07/1' } });
    expect(screen.getByTestId('stored').textContent).toBe('');
    fireEvent.change(field(), { target: { value: '07/12/2026' } });
    expect(screen.getByTestId('stored').textContent).toBe('2026-12-07');
  });

  it('types as digits only: 15082026 becomes 15/08/2026', () => {
    render(<Controlled />);
    for (const t of ['1', '15', '150', '1508', '15082', '150820', '1508202', '15082026']) {
      fireEvent.change(field(), { target: { value: t } });
    }
    expect(field().value).toBe('15/08/2026');
    expect(screen.getByTestId('stored').textContent).toBe('2026-08-15');
  });

  it('does not store a date that does not exist, and marks it wrong after leaving the box', () => {
    render(<Controlled initial="2026-06-05" />);
    fireEvent.change(field(), { target: { value: '31/02/2026' } });
    expect(screen.getByTestId('stored').textContent).toBe('');
    fireEvent.blur(field());
    expect(field().getAttribute('aria-invalid')).toBe('true');
  });

  it('tidies 5/6/2026 into 05/06/2026 when the box is left', () => {
    render(<Controlled />);
    fireEvent.change(field(), { target: { value: '5/6/2026' } });
    fireEvent.blur(field());
    expect(field().value).toBe('05/06/2026');
  });

  it('follows the parent when the value is changed from outside', () => {
    const { rerender } = render(<DateInput aria-label="Trade date" value="2026-06-05" onChange={() => {}} />);
    expect(field().value).toBe('05/06/2026');
    rerender(<DateInput aria-label="Trade date" value="2027-01-31" onChange={() => {}} />);
    expect(field().value).toBe('31/01/2027');
  });

  it('is a plain text box, so a US-set browser cannot turn it into mm/dd/yyyy', () => {
    render(<Controlled />);
    expect(field().type).toBe('text');
    expect(field().placeholder).toBe('dd/mm/yyyy');
  });
});

describe('DateInput with react-hook-form register()', () => {
  function Form({ onSubmit }: { onSubmit: (v: { tradeDate: string }) => void }) {
    const { register, handleSubmit, setValue } = useForm<{ tradeDate: string }>({ defaultValues: { tradeDate: '2026-06-05' } });
    return (
      <form onSubmit={handleSubmit(onSubmit)}>
        <DateInput aria-label="Trade date" {...register('tradeDate', { required: true })} />
        <button type="button" onClick={() => setValue('tradeDate', '2027-02-03')}>
          set
        </button>
        <button type="submit">go</button>
      </form>
    );
  }

  it('starts from the form default, submits YYYY-MM-DD, and follows setValue', async () => {
    const onSubmit = vi.fn();
    render(<Form onSubmit={onSubmit} />);
    expect(field().value).toBe('05/06/2026');

    fireEvent.change(field(), { target: { value: '10/11/2026' } });
    fireEvent.click(screen.getByText('go'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]![0]).toEqual({ tradeDate: '2026-11-10' });

    await act(async () => {
      fireEvent.click(screen.getByText('set'));
    });
    expect(field().value).toBe('03/02/2027');
  });

  it('refuses to submit a half-typed date when the field is required', async () => {
    const onSubmit = vi.fn();
    render(<Form onSubmit={onSubmit} />);
    fireEvent.change(field(), { target: { value: '10/11' } });
    fireEvent.click(screen.getByText('go'));
    await new Promise((r) => setTimeout(r, 30));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('DateInput bounds', () => {
  it('carries min and max, and flags a date outside them once the box is left', () => {
    render(<DateInput aria-label="Date of birth" min="1900-01-01" max="2026-11-27" value="" onChange={() => {}} />);
    const box = field(/date of birth/i);
    expect(box.min).toBe('1900-01-01');
    expect(box.max).toBe('2026-11-27');
    fireEvent.change(box, { target: { value: '01/01/2030' } });
    fireEvent.blur(box);
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(box.title).toMatch(/between 01\/01\/1900 and 27\/11\/2026/);
  });
});
