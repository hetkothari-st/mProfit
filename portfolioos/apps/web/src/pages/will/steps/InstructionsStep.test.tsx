// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { InstructionsStep } from './InstructionsStep';
import { fullPayload, TODAY } from '../willTestData';

afterEach(cleanup);

describe('InstructionsStep', () => {
  it('saves the text and counts towards 1000 characters', () => {
    const update = vi.fn();
    render(
      <InstructionsStep willId="w1" payload={fullPayload()} findings={[]} today={TODAY} wide update={update}
        refreshEstate={vi.fn()} flush={vi.fn(async () => true)} getRevision={() => 0} goTo={vi.fn()} />,
    );
    const box = screen.getByLabelText(/additional instructions/i) as HTMLTextAreaElement;
    expect(box.maxLength).toBe(1000);
    expect(screen.getByText(/49 \/ 1000/)).toBeTruthy();
    fireEvent.change(box, { target: { value: 'Donate my eyes.' } });
    expect(update).toHaveBeenCalledWith('instructions', { text: 'Donate my eyes.' });
  });
});
