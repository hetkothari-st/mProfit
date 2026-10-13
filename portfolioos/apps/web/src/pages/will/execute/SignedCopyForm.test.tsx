// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SignedCopyForm, signedCopyProblems } from './SignedCopyForm';

afterEach(cleanup);

const ctx = { today: '2026-10-20', generatedOn: '2026-10-12', requireFile: true };
const pdf = () => new File(['%PDF-1.7'], 'scan.pdf', { type: 'application/pdf' });

describe('signedCopyProblems', () => {
  it('passes a complete record', () => {
    expect(signedCopyProblems({ executedOn: '2026-10-15', witnesses: ['Asha Rao', 'Vikram Shah'], file: pdf() }, ctx)).toEqual([]);
  });

  it('names every problem', () => {
    expect(signedCopyProblems({ executedOn: '', witnesses: ['A', ''], file: null }, ctx)).toEqual([
      'Enter the date you signed.',
      'Enter the full name of both witnesses.',
      'Attach the signed copy.',
    ]);
    expect(signedCopyProblems({ executedOn: '2026-10-21', witnesses: ['Asha Rao', 'asha  RAO'], file: pdf() }, ctx)).toEqual([
      'The signing date cannot be in the future.',
      'Your two witnesses must be two different people.',
    ]);
    expect(signedCopyProblems({ executedOn: '2026-10-11', witnesses: ['Asha Rao', 'Vikram Shah'], file: pdf() }, ctx)).toEqual([
      'The signing date cannot be before the will was generated (12/10/2026).',
    ]);
  });

  it('accepts PDF and photos only, up to 20 MB, and no file when one is stored', () => {
    const gif = new File(['GIF89a'], 'scan.gif', { type: 'image/gif' });
    const heic = new File(['x'], 'scan.heic', { type: '' });
    const ok = { executedOn: '2026-10-15', witnesses: ['Asha Rao', 'Vikram Shah'] as [string, string] };
    const noType = (name: string) => new File(['x'], name, { type: '' });
    expect(signedCopyProblems({ ...ok, file: noType('Scan.JPG') }, ctx)).toEqual([]);
    expect(signedCopyProblems({ ...ok, file: noType('scan.pdf') }, ctx)).toEqual([]);
    expect(signedCopyProblems({ ...ok, file: gif }, ctx)).toEqual(['Upload the signed will as a PDF or a photo (JPEG, PNG or WebP).']);
    expect(signedCopyProblems({ ...ok, file: heic }, ctx)).toEqual(['Upload the signed will as a PDF or a photo (JPEG, PNG or WebP).']);
    const big = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'scan.pdf', { type: 'application/pdf' });
    expect(signedCopyProblems({ ...ok, file: big }, ctx)).toEqual(['The file is larger than 20 MB.']);
    expect(signedCopyProblems({ ...ok, file: null }, { ...ctx, requireFile: false })).toEqual([]);
  });
});

describe('SignedCopyForm', () => {
  it('submits trimmed values and the chosen file', () => {
    const onSubmit = vi.fn();
    render(<SignedCopyForm ctx={ctx} pending={false} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Date you signed'), { target: { value: '2026-10-15' } });
    fireEvent.change(screen.getByLabelText('Witness 1 - full name'), { target: { value: ' Asha Rao ' } });
    fireEvent.change(screen.getByLabelText('Witness 2 - full name'), { target: { value: 'Vikram Shah' } });
    const file = pdf();
    fireEvent.change(screen.getByLabelText(/^Signed copy/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Store signed copy' }));
    expect(onSubmit).toHaveBeenCalledWith({ executedOn: '2026-10-15', witnesses: ['Asha Rao', 'Vikram Shah'], file });
  });

  it('shows the problems and does not submit', () => {
    const onSubmit = vi.fn();
    render(<SignedCopyForm ctx={ctx} pending={false} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Store signed copy' }));
    expect(screen.getByRole('alert').textContent).toContain('Enter the date you signed.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears a problem once its field is edited', () => {
    render(<SignedCopyForm ctx={ctx} pending={false} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Store signed copy' }));
    expect(screen.getByRole('alert').textContent).toContain('Enter the date you signed.');
    fireEvent.change(screen.getByLabelText('Date you signed'), { target: { value: '2026-10-15' } });
    const text = screen.getByRole('alert').textContent ?? '';
    expect(text).not.toContain('Enter the date you signed.');
    expect(text).toContain('Attach the signed copy.');
  });

  it('shows server issues in words', () => {
    render(
      <SignedCopyForm ctx={ctx} pending={false} onSubmit={vi.fn()} serverIssues={[{ path: 'witnesses.1', code: 'duplicate_witness' }]} />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Your two witnesses must be two different people.');
  });

  it('starts from the stored record when correcting it', () => {
    render(
      <SignedCopyForm
        ctx={{ ...ctx, requireFile: false }}
        initial={{ executedOn: '2026-10-15', witnesses: ['Asha Rao', 'Vikram Shah'] }}
        pending={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect((screen.getByLabelText('Witness 1 - full name') as HTMLInputElement).value).toBe('Asha Rao');
    expect(screen.getByText(/leave empty to keep the copy you stored/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });
});
