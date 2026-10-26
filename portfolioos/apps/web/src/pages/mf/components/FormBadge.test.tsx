// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FormBadge } from './FormBadge';

afterEach(cleanup);

describe('FormBadge', () => {
  it.each([
    [5, 'Leading'],
    [4, 'Leading'],
    [3, 'Steady'],
    [2, 'Lagging'],
    [1, 'Weak'],
  ])('shows %i stars as %s', (rating, label) => {
    render(<FormBadge rating={rating} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('explains the band in its tooltip', () => {
    const { container } = render(<FormBadge rating={2} />);
    expect(container.querySelector('[data-form-band="LAGGING"]')?.getAttribute('title')).toContain(
      'Behind most funds',
    );
  });

  it('renders nothing for an unrated fund', () => {
    const { container } = render(<FormBadge rating={null} />);
    expect(container.innerHTML).toBe('');
  });
});
