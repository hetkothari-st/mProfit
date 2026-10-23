// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PortfolioDataCard } from './PortfolioDataCard';

afterEach(cleanup);

// The action card drew a button for the model's `ctaLabel` with no click
// handler: `ctaAction` is free text from the model with no defined meaning in
// the app, so there was nothing safe to wire it to. A button that does nothing
// is worse than none.
describe('PortfolioDataCard action card', () => {
  it('shows the suggestion without a dead button', () => {
    render(
      <PortfolioDataCard
        card={{
          cardType: 'action',
          data: { title: 'Top up your emergency fund', description: 'Aim for six months.', ctaLabel: 'Do it', ctaAction: 'whatever' },
        }}
      />,
    );
    expect(screen.getByText('Top up your emergency fund')).toBeTruthy();
    expect(screen.getByText('Aim for six months.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
